/**
 * M77, ISC-677: relation labels on the map avoid concept labels and each other.
 *
 * The M75 builder's Safari walk (2026-10-03) found "contrasts with", drawn at
 * its line's midpoint, over the concept label "Money argument" by 62 by 4 px.
 * A relation label now moves along its line, or out to a clear spot with a
 * short leader, so that its box meets no concept label, no concept's dot and
 * no other relation label.
 *
 * The boxes are read back from the drawing itself, the tab's map and the
 * exported figure, with an estimate of the text's width that is independent of
 * the layout code: 0.6 of the font size per character, the ascent at 0.8 of
 * the size and the descent at 0.25.
 *
 * The tab draws the accepted concepts and a window of three suggestions, six
 * concepts on the walk. With every suggestion drawn at once, the walk's twenty
 * concepts in a 300 by 240 drawing left no clear spot for a relation label, so
 * the drawing grows 24 units taller per concept past ten (240 at least),
 * keeping the text's size on screen.
 *
 * Concept labels against each other are out of this test's reach: the concept
 * positions come from the force layout, and M77's fix is to the relation labels
 * (reading A, put to the lead with the measurements on 2026-10-03).
 */

import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { ConceptMap } from "../src/ui/concepts/ConceptMap.tsx";
import { conceptMapSvg } from "../src/export/conceptsExport.ts";
import { MAP_HEIGHT, mapHeight } from "../src/concepts/mapLayout.ts";
import { pendingWindow } from "../src/concepts/suggest.ts";

interface Box {
  readonly what: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const textBox = (what: string, cx: number, baselines: readonly number[], lines: readonly string[], size: number): Box => {
  const w = Math.max(...lines.map((l) => l.length)) * size * 0.6;
  const top = Math.min(...baselines) - size * 0.8;
  const bottom = Math.max(...baselines) + size * 0.25;
  return { what, x: cx - w / 2, y: top, w, h: bottom - top };
};

const meet = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Every relation label that meets a concept label, a dot or another relation label. */
function collisions(relations: readonly Box[], others: readonly Box[]): readonly string[] {
  const out: string[] = [];
  relations.forEach((r, i) => {
    for (const o of others) if (meet(r, o)) out.push(`${r.what} meets ${o.what}`);
    for (const q of relations.slice(i + 1)) if (meet(r, q)) out.push(`${r.what} meets ${q.what}`);
  });
  return out;
}

const parse = (markup: string) => {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
};
const num = (el: Element, attr: string) => Number(el.getAttribute(attr) ?? "0");

/**
 * The tab's map, read back: concept labels at 11px under each dot, relation
 * labels at 11px. `windowed` hands the map what the Concepts tab hands it, the
 * accepted concepts and the pending window of suggestions (`pendingWindow`);
 * without it the map draws every suggestion at once, the densest map the
 * projection can make.
 */
function tabBoxes(events: readonly LedgerEvent[], projectId: string, windowed = true) {
  const all = projectConcepts(events, projectId, projectOntology(events, projectId));
  const view = windowed ? pendingWindow(all).view : all;
  const host = parse(renderToStaticMarkup(createElement(ConceptMap, { projectId, view, current: null, onOpen: () => {} })));
  const concepts: Box[] = [];
  const dots: Box[] = [];
  for (const g of host.querySelectorAll("g.concept-map-node")) {
    const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute("transform") ?? "");
    const [x, y] = [Number(m?.[1]), Number(m?.[2])];
    const text = g.querySelector("text.concept-map-label");
    if (text === null) continue;
    const first = y + num(text, "y");
    const spans = [...text.querySelectorAll("tspan")];
    let at = first;
    const baselines = spans.map((s, i) => (at += i === 0 ? 0 : num(s, "dy")));
    const name = spans[0]?.textContent ?? "";
    concepts.push(textBox(`concept "${name}"`, x, baselines, spans.map((s) => s.textContent ?? ""), 11));
    const r = 11;
    dots.push({ what: `dot "${name}"`, x: x - r, y: y - r, w: 2 * r, h: 2 * r });
  }
  const relations = [...host.querySelectorAll("text.concept-map-relation")].map((t) =>
    textBox(`relation "${t.textContent}"`, num(t, "x"), [num(t, "y")], [t.textContent ?? ""], 11),
  );
  return { concepts, dots, relations, nodes: host.querySelectorAll("g.concept-map-node").length };
}

/** The exported figure, read back: concept labels at 13px, relation labels at 12px, dots of radius 9. */
function figureBoxes(svg: string) {
  const host = parse(svg);
  const texts = [...host.querySelectorAll("text")];
  const concepts: Box[] = [];
  const byAnchor = new Map<string, { x: number; ys: number[]; lines: string[] }>();
  for (const t of texts.filter((t) => t.getAttribute("font-size") === "13")) {
    const key = t.getAttribute("x") ?? "";
    const entry = byAnchor.get(key) ?? { x: num(t, "x"), ys: [], lines: [] };
    entry.ys.push(num(t, "y"));
    entry.lines.push(t.textContent ?? "");
    byAnchor.set(key, entry);
  }
  for (const e of byAnchor.values()) concepts.push(textBox(`concept "${e.lines[0]}"`, e.x, e.ys, e.lines, 13));
  const dots = [...host.querySelectorAll("circle")].map((c) => ({ what: "dot", x: num(c, "cx") - 9, y: num(c, "cy") - 9, w: 18, h: 18 }));
  const relations = texts
    .filter((t) => t.getAttribute("font-size") === "12" && t.getAttribute("text-anchor") === "middle")
    .map((t) => textBox(`relation "${t.textContent}"`, num(t, "x"), [num(t, "y")], [t.textContent ?? ""], 12));
  return { concepts, dots, relations };
}

const WALK = (await Bun.file(new URL("./fixtures/m72-walk.json", import.meta.url)).json()) as {
  project: { id: string };
  events: LedgerEvent[];
};
const EXAMPLE = (await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url)).json()) as {
  project: { id: string; title: string };
  events: LedgerEvent[];
};

describe("M77: relation labels clear of every other label (ISC-677)", () => {
  test("the walk bundle's map as the tab draws it: six concepts and one relation, and no relation label meets another label or a dot", () => {
    /* The M75 walk's map: three accepted, three suggested, "contrasts with" over "Money argument". */
    const { concepts, dots, relations, nodes } = tabBoxes(WALK.events, WALK.project.id);
    expect(nodes).toBe(6);
    expect(relations.length).toBe(1);
    expect(collisions(relations, [...concepts, ...dots])).toEqual([]);
  });

  test("the walk bundle with every suggestion drawn at once: twenty concepts and six relations, and still no relation label meets another label or a dot", () => {
    const { concepts, dots, relations, nodes } = tabBoxes(WALK.events, WALK.project.id, false);
    expect(nodes).toBe(20);
    expect(relations.length).toBe(6);
    expect(collisions(relations, [...concepts, ...dots])).toEqual([]);
  });

  test("the walk bundle's exported figure: no relation label meets another label or a dot", () => {
    const P = WALK.project.id;
    const svg = conceptMapSvg(WALK.events, P, projectOntology(WALK.events, P), { title: "Walk", stamp: "s" });
    if (svg === null) throw new Error("the walk has accepted concepts, so the figure draws");
    const { concepts, dots, relations } = figureBoxes(svg);
    expect(concepts.length).toBe(3);
    expect(relations.length).toBe(1);
    expect(collisions(relations, [...concepts, ...dots])).toEqual([]);
  });

  test("the tab's drawing starts 24 units per concept, 240 at least, and the walk's map with every suggestion starts at 480", () => {
    expect(MAP_HEIGHT).toBe(240);
    expect(mapHeight(0)).toBe(240);
    expect(mapHeight(6)).toBe(240);
    expect(mapHeight(20)).toBe(480);
    const view = projectConcepts(WALK.events, WALK.project.id, projectOntology(WALK.events, WALK.project.id));
    expect(view.accepted.length + view.suggested.length).toBe(20);
    const markup = renderToStaticMarkup(createElement(ConceptMap, { projectId: WALK.project.id, view, current: null, onOpen: () => {} }));
    /* M77b (the lead's ruling B): mapHeight is where the drawing starts, and it
       grows 24 units at a time while any label still meets another. */
    const vb = /viewBox="0 0 300 (\d+)"/.exec(markup);
    expect(Number(vb?.[1])).toBeGreaterThanOrEqual(480);
    expect((Number(vb?.[1]) - 480) % 24).toBe(0);
  });

  test("the shipped example: its map holds no concept yet, so the map and the figure draw no label to collide", () => {
    const P = EXAMPLE.project.id;
    const { concepts, relations, nodes } = tabBoxes(EXAMPLE.events, P);
    expect(nodes).toBe(0);
    expect(collisions(relations, concepts)).toEqual([]);
    expect(conceptMapSvg(EXAMPLE.events, P, projectOntology(EXAMPLE.events, P), { title: EXAMPLE.project.title, stamp: "s" })).toBeNull();
  });
});
