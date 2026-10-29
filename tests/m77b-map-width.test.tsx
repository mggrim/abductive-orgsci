/**
 * M77b (the lead's ruling B): the drawing takes its width from the panel.
 *
 * Found in Safari on the builder's walk import: the map's first paint has no
 * concept while History loads, so a measurement attached to the drawing's frame
 * never attached, and the drawing stayed at its 300-unit fallback whatever the
 * panel's width. The section is measured now, which renders from the first
 * paint. Driven here through a real mount: the map paints empty, the concepts
 * arrive, and the panel reports 260 pixels.
 */

import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { pendingWindow } from "../src/concepts/suggest.ts";
import { ConceptMap } from "../src/ui/concepts/ConceptMap.tsx";

/* The panel's width and an observer that reports it, which happy-dom lacks. */
const realObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
const realWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 260 });
(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
  constructor(private readonly cb: () => void) {}
  observe() {
    this.cb();
  }
  disconnect() {}
};
afterAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = realObserver;
  if (realWidth !== undefined) Object.defineProperty(HTMLElement.prototype, "clientWidth", realWidth);
});

const WALK = (await Bun.file(new URL("./fixtures/m72-walk.json", import.meta.url)).json()) as { project: { id: string }; events: LedgerEvent[] };

describe("M77b: the map measures its panel from the first paint", () => {
  test("a map that paints empty and then receives its concepts draws at the panel's 260", async () => {
    const P = WALK.project.id;
    const empty = projectConcepts([], P, projectOntology([], P));
    const full = pendingWindow(projectConcepts(WALK.events, P, projectOntology(WALK.events, P))).view;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const draw = (view: typeof full) =>
      React.createElement(ConceptMap, { projectId: P, view, current: null, onOpen: () => {} });
    await act(async () => {
      root.render(draw(empty));
      await wait(5);
    });
    expect(host.querySelector("svg.concept-map-svg")).toBeNull();
    await act(async () => {
      root.render(draw(full));
      await wait(5);
    });
    const svg = host.querySelector("svg.concept-map-svg");
    expect(svg?.getAttribute("viewBox")?.startsWith("0 0 260 ")).toBe(true);
    expect(svg?.getAttribute("width")).toBe("260");
    root.unmount();
  });
});
