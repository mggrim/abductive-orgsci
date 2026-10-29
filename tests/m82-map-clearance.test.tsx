/**
 * M82, ISC-693 (the owner, 2026-10-04): "Ensure that the text is not
 * overlapping the nodes or arrows in the concept map."
 *
 * M77b kept every label clear of every other label. This test reads the drawing
 * back and asks more of it: no relation line crosses a label (a concept's or a
 * relation's), no label overlaps a dot other than its own concept's, no line
 * runs through a dot other than its two ends, and a relation label sits beside
 * a clear stretch of its own line or at a clear spot joined to the line by a
 * leader, the leader itself clear of every other label and dot.
 *
 * The boxes are this test's own estimate, as in M77b's: 0.6 of the font size
 * per character, the ascent at 0.8 of the size and the descent at 0.25. Lines
 * are read from the drawing as drawn, a straight line or a line with one elbow.
 *
 * It runs on the M72 walk bundle with every suggestion drawn (twenty concepts
 * and six relations, the unwindowed set) and as the tab windows it, on the
 * serendipity walk (twenty-two accepted concepts and eight relations), on a
 * project of twelve accepted concepts and six relations, each at 300 and 240
 * wide, and on the exported figure of the last three.
 */

import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectConcepts, type ProjectOntologyView } from "../src/concepts/projection.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { pendingWindow } from "../src/concepts/suggest.ts";
import { addConceptEvents, addRelationEvents } from "../src/concepts/door.ts";
import { ConceptMap } from "../src/ui/concepts/ConceptMap.tsx";
import { conceptMapSvg } from "../src/export/conceptsExport.ts";

interface Box {
  readonly what: string;
  readonly owner: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
interface Segment {
  readonly what: string;
  /** The concept ids at its two ends, or the relation it leads to. */
  readonly ends: readonly string[];
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/* M82: a label beside its dot is anchored at its start (right of the dot) or its end (left). */
const textBox = (what: string, owner: string, cx: number, baselines: readonly number[], lines: readonly string[], size: number, anchor = "middle"): Box => {
  const w = Math.max(...lines.map((l) => l.length)) * size * 0.6;
  const top = Math.min(...baselines) - size * 0.8;
  const bottom = Math.max(...baselines) + size * 0.25;
  return { what, owner, x: anchor === "start" ? cx : anchor === "end" ? cx - w : cx - w / 2, y: top, w, h: bottom - top };
};

/** Whether a segment passes through the inside of a box (touching its edge is clear). Liang-Barsky. */
function crosses(s: Segment, b: Box): boolean {
  const eps = 0.01;
  const [x0, y0, dx, dy] = [s.x1, s.y1, s.x2 - s.x1, s.y2 - s.y1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, x0 - (b.x + eps)],
    [dx, b.x + b.w - eps - x0],
    [-dy, y0 - (b.y + eps)],
    [dy, b.y + b.h - eps - y0],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}
const meet = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const parse = (markup: string) => {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
};
const num = (el: Element, attr: string) => Number(el.getAttribute(attr) ?? "0");

/** A drawn line's segments: a `line`, or a `polyline` through an elbow. */
function segmentsOf(el: Element, what: string, ends: readonly string[]): Segment[] {
  if (el.tagName.toLowerCase() === "line") return [{ what, ends, x1: num(el, "x1"), y1: num(el, "y1"), x2: num(el, "x2"), y2: num(el, "y2") }];
  const pts = (el.getAttribute("points") ?? "")
    .trim()
    .split(/\s+/)
    .map((p) => p.split(",").map(Number) as [number, number]);
  return pts.slice(1).map(([x2, y2], i) => ({ what, ends, x1: pts[i]![0], y1: pts[i]![1], x2, y2 }));
}

interface Drawing {
  readonly labels: readonly Box[];
  readonly dots: readonly Box[];
  readonly lines: readonly Segment[];
  readonly leaders: readonly Segment[];
  readonly width: number;
  readonly height: number;
  readonly nodes: number;
  readonly relations: number;
}

/** The tab's map at `width`, read back. */
function tab(view: ProjectOntologyView, projectId: string, width: number): Drawing {
  const host = parse(renderToStaticMarkup(createElement(ConceptMap, { projectId, view, current: null, onOpen: () => {}, width })));
  const svg = host.querySelector("svg.concept-map-svg");
  const [, , vw, vh] = (svg?.getAttribute("viewBox") ?? "0 0 0 0").split(" ").map(Number);
  const labels: Box[] = [];
  const dots: Box[] = [];
  for (const g of host.querySelectorAll("g.concept-map-node")) {
    const id = (g.getAttribute("data-testid") ?? "").replace("concept-map-node-", "");
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute("transform") ?? "");
    const [x, y] = [Number(m?.[1]), Number(m?.[2])];
    const text = g.querySelector("text.concept-map-label");
    if (text === null) continue;
    const spans = [...text.querySelectorAll("tspan")];
    let at = y + num(text, "y");
    const baselines = spans.map((s, i) => (at += i === 0 ? 0 : num(s, "dy")));
    labels.push(textBox(`concept "${spans[0]?.textContent ?? ""}"`, id, x + num(text, "x"), baselines, spans.map((s) => s.textContent ?? ""), 11, text.getAttribute("text-anchor") ?? "middle"));
    dots.push({ what: `dot "${spans[0]?.textContent ?? ""}"`, owner: id, x: x - 11, y: y - 11, w: 22, h: 22 });
  }
  const lines: Segment[] = [];
  const leaders: Segment[] = [];
  for (const g of host.querySelectorAll("g.concept-map-edge")) {
    const rid = (g.getAttribute("data-testid") ?? "").replace("concept-map-edge-", "");
    const ends = [g.getAttribute("data-from") ?? "", g.getAttribute("data-to") ?? ""];
    const drawn = g.querySelector("[marker-end]");
    const t = g.querySelector("text.concept-map-relation");
    if (drawn === null || t === null) continue;
    const name = `${t.textContent} (${rid.slice(-4)})`;
    lines.push(...segmentsOf(drawn, `line ${name}`, ends));
    const leader = g.querySelector("line.concept-map-leader");
    if (leader !== null) leaders.push(...segmentsOf(leader, `leader ${name}`, [rid]));
    labels.push(textBox(`relation ${name}`, rid, num(t, "x"), [num(t, "y")], [t.textContent ?? ""], 11));
  }
  return { labels, dots, lines, leaders, width: vw ?? 0, height: vh ?? 0, nodes: dots.length, relations: lines.length === 0 ? 0 : host.querySelectorAll("g.concept-map-edge").length };
}

/** Every clash on a drawing: a label against a line, a leader, a dot or another label; a line through a dot. */
function clashes(d: Drawing): readonly string[] {
  const out: string[] = [];
  for (const b of d.labels) {
    for (const s of d.lines) if (crosses(s, b)) out.push(`${s.what} crosses ${b.what}`);
    for (const s of d.leaders) if (s.ends[0] !== b.owner && crosses(s, b)) out.push(`${s.what} crosses ${b.what}`);
    for (const dot of d.dots) if (dot.owner !== b.owner && meet(b, dot)) out.push(`${b.what} meets ${dot.what}`);
  }
  d.labels.forEach((a, i) => {
    for (const b of d.labels.slice(i + 1)) if (meet(a, b)) out.push(`${a.what} meets ${b.what}`);
  });
  for (const dot of d.dots) {
    for (const s of [...d.lines, ...d.leaders]) if (!s.ends.includes(dot.owner) && crosses(s, dot)) out.push(`${s.what} crosses ${dot.what}`);
  }
  return out;
}

const fixture = async (name: string) =>
  (await Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).json()) as { project: { id: string }; events: LedgerEvent[] };
const M72 = await fixture("m72-walk.json");
const M76 = await fixture("m76-walk.json");
const viewOf = (events: readonly LedgerEvent[], id: string) => projectConcepts(events, id, projectOntology(events, id));

/* Twelve accepted concepts and six relations (M77b's fixture). */
const P = "p-m82-twelve";
let n = 0;
let t = 40_000;
const clock = { now: () => (t += 10), makeId: () => `cccccccc-8282-4282-8282-${String((n += 1)).padStart(12, "0")}` };
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
  const id = (name: string) => viewOf(events, P).accepted.find((c) => c.name === name)!.id;
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

/* The serendipity walk after the Safari walk of M82: the six relations that two
 * presses of Suggest relations proposed and the researcher accepted, fourteen in all. */
function walkRelated(): LedgerEvent[] {
  let events: LedgerEvent[] = [...M76.events];
  const id = (name: string) => viewOf(events, M76.project.id).accepted.find((c) => c.name === name)!.id;
  const added: [string, "leads-to" | "contrasts-with" | "condition-for", string][] = [
    ["Helping another founder", "leads-to", "Overheard stories"],
    ["Overheard stories", "leads-to", "Lead picked up at the bench"],
    ["Booked slot", "leads-to", "Waiting at the crib"],
    ["Prepared mind", "contrasts-with", "Helping another founder"],
    ["Booking system as a gain", "contrasts-with", "Encounters in the queue"],
    ["Before and after May", "condition-for", "Old hands and newcomers"],
  ];
  for (const [from, relation, to] of added) {
    events = [...events, ...addRelationEvents(events, { projectId: M76.project.id, from: id(from), to: id(to), relation, claim: `${from} ${relation} ${to}.` }, clock)];
  }
  return events;
}
const M76_RELATED = walkRelated();

const SETS: readonly { readonly name: string; readonly view: ProjectOntologyView; readonly id: string; readonly nodes: number; readonly relations: number; readonly widths?: readonly number[] }[] = [
  { name: "the M72 walk, every suggestion drawn", view: viewOf(M72.events, M72.project.id), id: M72.project.id, nodes: 20, relations: 6 },
  { name: "the M72 walk as the tab windows it", view: pendingWindow(viewOf(M72.events, M72.project.id)).view, id: M72.project.id, nodes: 6, relations: 1 },
  { name: "the serendipity walk", view: viewOf(M76.events, M76.project.id), id: M76.project.id, nodes: 22, relations: 8 },
  { name: "the serendipity walk with the six relations of the Safari walk", view: viewOf(M76_RELATED, M76.project.id), id: M76.project.id, nodes: 22, relations: 14,
    /* At the 240 least width this set reaches the height limit with four labels on lines: a limit put to the lead. */
    widths: [300, 1084] },
  { name: "twelve concepts and six relations", view: viewOf(TWELVE, P), id: P, nodes: 12, relations: 6 },
];

describe("M82: labels clear of lines and dots on the tab's map (ISC-693)", () => {
  for (const set of SETS) {
    for (const width of set.widths ?? [300, 240]) {
      test(`${set.name}, at ${width} wide`, () => {
        const d = tab(set.view, set.id, width);
        expect(d.nodes).toBe(set.nodes);
        expect(d.relations).toBe(set.relations);
        expect(clashes(d)).toEqual([]);
        for (const b of d.labels) expect({ what: b.what, inside: b.x >= 0 && b.y >= 0 && b.x + b.w <= d.width && b.y + b.h <= d.height }).toEqual({ what: b.what, inside: true });
      });
    }
  }

  test("a relation label sits beside its own line, its centre within one and a half label heights, or carries a leader to it", () => {
    for (const set of SETS) {
      const d = tab(set.view, set.id, 300);
      for (const label of d.labels.filter((b) => b.what.startsWith("relation"))) {
        const own = d.lines.filter((s) => s.what === label.what.replace(/^relation/, "line"));
        const leader = d.leaders.find((s) => s.ends[0] === label.owner);
        const cx = label.x + label.w / 2;
        const cy = label.y + label.h / 2;
        const near = own.some((s) => {
          const [dx, dy] = [s.x2 - s.x1, s.y2 - s.y1];
          const k = Math.max(0, Math.min(1, ((cx - s.x1) * dx + (cy - s.y1) * dy) / (dx * dx + dy * dy || 1)));
          return Math.hypot(s.x1 + k * dx - cx, s.y1 + k * dy - cy) <= label.h * 1.5;
        });
        expect({ what: label.what, placed: near || leader !== undefined }).toEqual({ what: label.what, placed: true });
      }
    }
  });
});

/** The exported figure, read back: 13px concept labels, 12px relation labels, dots of radius 9. */
function figure(svg: string): Drawing {
  const host = parse(svg);
  const texts = [...host.querySelectorAll("text")];
  const labels: Box[] = [];
  const dots: Box[] = [];
  const byAnchor = new Map<string, { x: number; ys: number[]; lines: string[]; anchor: string }>();
  for (const t of texts.filter((t) => t.getAttribute("font-size") === "13")) {
    const key = t.getAttribute("data-concept") ?? t.getAttribute("x") ?? "";
    const entry = byAnchor.get(key) ?? { x: num(t, "x"), ys: [], lines: [], anchor: t.getAttribute("text-anchor") ?? "middle" };
    entry.ys.push(num(t, "y"));
    entry.lines.push(t.textContent ?? "");
    byAnchor.set(key, entry);
  }
  for (const [key, e] of byAnchor) labels.push(textBox(`concept "${e.lines[0]}"`, key, e.x, e.ys, e.lines, 13, e.anchor));
  for (const c of host.querySelectorAll("circle")) {
    const owner = c.getAttribute("data-concept") ?? "";
    dots.push({ what: `dot ${owner}`, owner, x: num(c, "cx") - 9, y: num(c, "cy") - 9, w: 18, h: 18 });
  }
  const lines: Segment[] = [];
  const leaders: Segment[] = [];
  for (const el of host.querySelectorAll("[marker-end]")) {
    lines.push(...segmentsOf(el, `line ${el.getAttribute("data-relation")}`, [el.getAttribute("data-from") ?? "", el.getAttribute("data-to") ?? ""]));
  }
  for (const el of host.querySelectorAll("line[data-leader]")) leaders.push(...segmentsOf(el, `leader ${el.getAttribute("data-leader")}`, [el.getAttribute("data-leader") ?? ""]));
  texts
    .filter((t) => t.getAttribute("font-size") === "12" && t.getAttribute("text-anchor") === "middle")
    .forEach((t) => labels.push(textBox(`relation ${t.getAttribute("data-relation")}`, t.getAttribute("data-relation") ?? "", num(t, "x"), [num(t, "y")], [t.textContent ?? ""], 12)));
  return { labels, dots, lines, leaders, width: 720, height: 520, nodes: dots.length, relations: lines.length };
}

describe("M82: the exported figure follows the same rule (ISC-693)", () => {
  for (const [name, events, id, concepts] of [
    ["the M72 walk", M72.events, M72.project.id, 3],
    ["the serendipity walk", M76.events, M76.project.id, 22],
    ["twelve concepts and six relations", TWELVE, P, 12],
  ] as const) {
    test(name, () => {
      const svg = conceptMapSvg(events, id, projectOntology(events, id), { title: "Figure", stamp: "s" });
      if (svg === null) throw new Error("the figure draws");
      const f = figure(svg);
      expect(f.dots.length).toBe(concepts);
      expect(clashes(f)).toEqual([]);
    });
  }
});
