/**
 * M77b, ISC-677 (the lead's ruling, 2026-10-03): every label on the map clears
 * every other.
 *
 * M77 placed the relation labels clear of the rest. The lead's ruling B asks for
 * the concept labels to clear each other too: the layout keeps them apart, the
 * drawing grows taller with the concepts it draws, and the drawing takes its
 * width from the panel so that the 11px labels render at 11px on screen rather
 * than scaled down with the drawing. The map draws the accepted concepts and the
 * window of suggestions the tab shows; the caption counts the queue behind it,
 * "and 14 concepts and 5 relations in the queue", leaving out a part that is zero.
 *
 * Every pair is read back from the drawing itself (concept label, dot, relation
 * label) with the same independent estimate M77's test uses: 0.6 of the font
 * size per character, the ascent at 0.8 of the size and the descent at 0.25. It
 * runs on the walk bundle as the tab draws it and on a project with twelve
 * accepted concepts and six relations, at 300 wide and at a narrow panel's 240,
 * and on the exported figure of both.
 */

import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { pendingWindow } from "../src/concepts/suggest.ts";
import { addConceptEvents, addRelationEvents } from "../src/concepts/door.ts";
import { mapHeight } from "../src/concepts/mapLayout.ts";
import { ConceptMap, mapCaption, mapQueue } from "../src/ui/concepts/ConceptMap.tsx";
import { conceptMapSvg } from "../src/export/conceptsExport.ts";
import { sentenceBreaks } from "../src/copy/rules.ts";

interface Box {
  readonly what: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/* M82: a label beside its dot is anchored at its start (right of the dot) or its end (left). */
const textBox = (what: string, cx: number, baselines: readonly number[], lines: readonly string[], size: number, anchor = "middle"): Box => {
  const w = Math.max(...lines.map((l) => l.length)) * size * 0.6;
  const top = Math.min(...baselines) - size * 0.8;
  const bottom = Math.max(...baselines) + size * 0.25;
  return { what, x: anchor === "start" ? cx : anchor === "end" ? cx - w : cx - w / 2, y: top, w, h: bottom - top };
};
const meet = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (b: Box, width: number, height: number) => b.x >= 0 && b.y >= 0 && b.x + b.w <= width && b.y + b.h <= height;

/** Every pair of boxes that meet, a concept's own label and dot excepted. */
function collisions(boxes: readonly (Box & { readonly owner: string })[]): readonly string[] {
  const out: string[] = [];
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) if (a.owner !== b.owner && meet(a, b)) out.push(`${a.what} meets ${b.what}`);
  });
  return out;
}

const parse = (markup: string) => {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
};
const num = (el: Element, attr: string) => Number(el.getAttribute(attr) ?? "0");

/** The tab's map at `width`, read back, with the drawing's own size. */
function tab(events: readonly LedgerEvent[], projectId: string, width: number) {
  const view = pendingWindow(projectConcepts(events, projectId, projectOntology(events, projectId))).view;
  const host = parse(renderToStaticMarkup(createElement(ConceptMap, { projectId, view, current: null, onOpen: () => {}, width })));
  const svg = host.querySelector("svg.concept-map-svg");
  const [, , vw, vh] = (svg?.getAttribute("viewBox") ?? "0 0 0 0").split(" ").map(Number);
  const boxes: (Box & { owner: string })[] = [];
  for (const g of host.querySelectorAll("g.concept-map-node")) {
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute("transform") ?? "");
    const [x, y] = [Number(m?.[1]), Number(m?.[2])];
    const text = g.querySelector("text.concept-map-label");
    if (text === null) continue;
    const spans = [...text.querySelectorAll("tspan")];
    let at = y + num(text, "y");
    const baselines = spans.map((s, i) => (at += i === 0 ? 0 : num(s, "dy")));
    const name = spans[0]?.textContent ?? "";
    boxes.push({ ...textBox(`concept "${name}"`, x + num(text, "x"), baselines, spans.map((s) => s.textContent ?? ""), 11, text.getAttribute("text-anchor") ?? "middle"), owner: name });
    boxes.push({ what: `dot "${name}"`, x: x - 11, y: y - 11, w: 22, h: 22, owner: name });
  }
  for (const t of host.querySelectorAll("text.concept-map-relation")) {
    boxes.push({ ...textBox(`relation "${t.textContent}"`, num(t, "x"), [num(t, "y")], [t.textContent ?? ""], 11), owner: `r:${t.textContent}:${num(t, "x")}` });
  }
  return { boxes, svg, width: vw ?? 0, height: vh ?? 0, nodes: host.querySelectorAll("g.concept-map-node").length, relations: host.querySelectorAll("text.concept-map-relation").length, caption: host.querySelector('[data-testid="concept-map-caption"]')?.textContent ?? "" };
}

/** The exported figure, read back: concept labels at 13px, relation labels at 12px, dots of radius 9. */
function figure(svg: string) {
  const host = parse(svg);
  const texts = [...host.querySelectorAll("text")];
  const boxes: (Box & { owner: string })[] = [];
  const byAnchor = new Map<string, { x: number; ys: number[]; lines: string[]; anchor: string }>();
  for (const t of texts.filter((t) => t.getAttribute("font-size") === "13")) {
    const key = t.getAttribute("x") ?? "";
    const entry = byAnchor.get(key) ?? { x: num(t, "x"), ys: [], lines: [], anchor: t.getAttribute("text-anchor") ?? "middle" };
    entry.ys.push(num(t, "y"));
    entry.lines.push(t.textContent ?? "");
    byAnchor.set(key, entry);
  }
  for (const e of byAnchor.values()) boxes.push({ ...textBox(`concept "${e.lines[0]}"`, e.x, e.ys, e.lines, 13, e.anchor), owner: `${e.x}` });
  for (const c of host.querySelectorAll("circle")) boxes.push({ what: "dot", x: num(c, "cx") - 9, y: num(c, "cy") - 9, w: 18, h: 18, owner: `${num(c, "cx").toFixed(1)}` });
  texts
    .filter((t) => t.getAttribute("font-size") === "12" && t.getAttribute("text-anchor") === "middle")
    .forEach((t, i) => boxes.push({ ...textBox(`relation "${t.textContent}"`, num(t, "x"), [num(t, "y")], [t.textContent ?? ""], 12), owner: `r${i}` }));
  return { boxes, concepts: byAnchor.size };
}

const WALK = (await Bun.file(new URL("./fixtures/m72-walk.json", import.meta.url)).json()) as { project: { id: string }; events: LedgerEvent[] };

/* Twelve accepted concepts and six relations, named the way a researcher names
 * them: short and long, some wrapping onto a second line. */
const P = "p-m77b-twelve";
let n = 0;
let t = 40_000;
const clock = { now: () => (t += 10), makeId: () => `bbbbbbbb-7777-4777-8777-${String((n += 1)).padStart(12, "0")}` };
const NAMES = [
  "Money argument",
  "Bike table",
  "Arguing about whether it's worth it",
  "Owner's time",
  "Saying no to a fix",
  "Volunteer expertise",
  "Unsafe to keep",
  "Things back home",
  "Church hall",
  "Kinds of things brought",
  "Who does the fixing",
  "Ending up in a bin",
];
function twelve(): LedgerEvent[] {
  let events: LedgerEvent[] = [];
  for (const name of NAMES) events = [...events, ...addConceptEvents(events, { projectId: P, name, definition: `${name}, as the researcher defines it.` }, clock)];
  const id = (name: string) => projectConcepts(events, P, projectOntology(events, P)).accepted.find((c) => c.name === name)!.id;
  const pairs: [string, string, "leads-to" | "contrasts-with" | "part-of" | "varies-with" | "condition-for"][] = [
    ["Bike table", "Money argument", "contrasts-with"],
    ["Owner's time", "Saying no to a fix", "leads-to"],
    ["Volunteer expertise", "Who does the fixing", "condition-for"],
    ["Unsafe to keep", "Ending up in a bin", "leads-to"],
    ["Kinds of things brought", "Arguing about whether it's worth it", "varies-with"],
    ["Church hall", "Things back home", "part-of"],
  ];
  for (const [from, to, relation] of pairs) {
    events = [...events, ...addRelationEvents(events, { projectId: P, from: id(from), to: id(to), relation, claim: `${from} ${relation} ${to}.` }, clock)];
  }
  return events;
}
const TWELVE = twelve();

describe("M77b: every label on the map clears every other (ISC-677, ruling B)", () => {
  for (const width of [300, 240]) {
    test(`the walk bundle as the tab draws it, at ${width} wide: six concepts, one relation, and no two labels or dots meet`, () => {
      const map = tab(WALK.events, WALK.project.id, width);
      expect(map.nodes).toBe(6);
      expect(map.relations).toBe(1);
      expect(map.width).toBe(width);
      expect(map.height).toBe(mapHeight(6));
      expect(collisions(map.boxes)).toEqual([]);
      for (const b of map.boxes) expect({ what: b.what, inside: inside(b, map.width, map.height) }).toEqual({ what: b.what, inside: true });
    });

    test(`twelve accepted concepts and six relations, at ${width} wide: no two labels or dots meet`, () => {
      const map = tab(TWELVE, P, width);
      expect(map.nodes).toBe(12);
      expect(map.relations).toBe(6);
      /* From mapHeight's 288 for twelve, grown 24 at a time while any label meets another. */
      expect(map.height).toBeGreaterThanOrEqual(288);
      expect(map.height).toBeLessThanOrEqual(576);
      expect((map.height - 288) % 24).toBe(0);
      expect(collisions(map.boxes)).toEqual([]);
      for (const b of map.boxes) expect({ what: b.what, inside: inside(b, map.width, map.height) }).toEqual({ what: b.what, inside: true });
    });
  }

  test("the exported figure of both: no two labels or dots meet", () => {
    for (const [events, id, concepts] of [[WALK.events, WALK.project.id, 3], [TWELVE, P, 12]] as const) {
      const svg = conceptMapSvg(events, id, projectOntology(events, id), { title: "Figure", stamp: "s" });
      if (svg === null) throw new Error("the figure draws");
      const f = figure(svg);
      expect(f.concepts).toBe(concepts);
      expect(collisions(f.boxes)).toEqual([]);
    }
  });

  test("the drawing takes its width from the panel, one unit to a pixel, so the 11px labels render at 11px", () => {
    const map = tab(WALK.events, WALK.project.id, 268);
    expect(map.svg?.getAttribute("viewBox")).toBe(`0 0 268 ${map.height}`);
    expect(map.svg?.getAttribute("width")).toBe("268");
    expect(map.svg?.getAttribute("height")).toBe(String(map.height));
  });
});

describe("M77b: the caption counts the queue behind the map (ruling B)", () => {
  test("both parts named, a zero part left out", () => {
    expect(mapCaption(3, 1, 3, 0, { concepts: 14, relations: 5 })).toBe(
      "3 concepts and 1 relation accepted, 3 concepts suggested, and 14 concepts and 5 relations in the queue",
    );
    expect(mapCaption(3, 1, 3, 0, { concepts: 1, relations: 0 })).toBe("3 concepts and 1 relation accepted, 3 concepts suggested, and 1 concept in the queue");
    expect(mapCaption(3, 1, 3, 0, { concepts: 0, relations: 2 })).toBe("3 concepts and 1 relation accepted, 3 concepts suggested, and 2 relations in the queue");
    expect(mapCaption(3, 1, 3, 0, { concepts: 0, relations: 0 })).toBe("3 concepts and 1 relation accepted, 3 concepts suggested");
    expect(sentenceBreaks(`${mapCaption(3, 1, 3, 0, { concepts: 14, relations: 5 })}.`)).toEqual([]);
  });

  test("the walk's queue is fourteen concepts and five relations, and the map's caption says so", () => {
    const all = projectConcepts(WALK.events, WALK.project.id, projectOntology(WALK.events, WALK.project.id));
    expect(mapQueue(all, pendingWindow(all).view)).toEqual({ concepts: 14, relations: 5 });
    const host = parse(
      renderToStaticMarkup(
        createElement(ConceptMap, { projectId: WALK.project.id, view: pendingWindow(all).view, queued: mapQueue(all, pendingWindow(all).view), current: null, onOpen: () => {} }),
      ),
    );
    expect(host.querySelector('[data-testid="concept-map-caption"]')?.textContent).toBe(
      /* M82, ISC-694: the caption counts the accepted concept that stands alone. */
      "3 concepts and 1 relation accepted, 3 concepts suggested, and 14 concepts and 5 relations in the queue. 1 accepted concept stands alone.",
    );
  });
});
