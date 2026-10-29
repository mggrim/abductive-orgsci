/**
 * M34, round three: the seven steps in the Design tab's own arrangement.
 *
 * The owner, verbatim: "The seven steps on the front page should be organized
 * in the same way as the framework layout in the design tab."
 *
 * The defect the change closes is not that the front page looked different. It
 * is that the two surfaces made different claims about the same seven things.
 * The Design rail draws four as a loop, because answering one changes what the
 * other three should say, and three in a row under it, because those build on
 * the four. The front page drew seven cards in an auto-fit grid, in source
 * order, which says the seven are a sequence. One of the two was wrong and it
 * was not the rail.
 *
 * Four properties, and the first is the one that keeps the other three true
 * next year:
 *
 *   one source     the loop, the row, their order and the two sentences beside
 *                  them are declared once. Two copies of a geometry is two
 *                  geometries, and the way this fails is quietly: someone moves
 *                  a station between rings on one screen only.
 *   same seven     both surfaces render the same cells in the same order, read
 *                  from STATIONS rather than from either file.
 *   no study here  the front page's rail has no status mark and no legend,
 *                  because there is no study on it to have a state. A legend
 *                  defining marks that are not drawn is worse than none.
 *   the panel      pressing a cell changes the panel, and the seven card
 *                  bodies' words are in it verbatim.
 */

import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { STATIONS } from "../src/flow/stations.ts";
import { stepKicker } from "../src/flow/StationLoop.tsx";
import { StepRail } from "../src/ui/Introduction.tsx";

const read = async (rel: string) =>
  await Bun.file(new URL(`../src/${rel}`, import.meta.url).pathname).text();

const LOOP = await read("flow/StationLoop.tsx");
const RAIL = await read("flow/StationRail.tsx");
const INTRO = await read("ui/Introduction.tsx");
const COMPONENTS = await read("ui/styles/components.css");
const DESIGN = await read("ui/styles/design.css");
const INTRO_CSS = await read("ui/styles/intro.css");

describe("M34: the arrangement is declared once", () => {
  /* M58, ISC-567 replaced the loop of four and the row of three with two rings
   * and two pieces outside them. What M34 asserted still holds, restated for
   * the new shape: one module declares the geometry, both surfaces draw it. */
  test("the three lists, their order and the lede live in one module (M58)", () => {
    expect(LOOP).toContain('<ol className="rail-loop"');
    expect(LOOP).toContain('<ol className="rail-inner"');
    expect(LOOP).toContain('className="rail-outer"');
    expect(LOOP).toContain('className={`rail-cell rail-cell-${station.id}`}');
    for (const ring of ["outer", "inner", "external"]) expect(LOOP).toContain(`stationsIn("${ring}")`);
    for (const [name, source] of [
      ["StationRail", RAIL],
      ["Introduction", INTRO],
    ] as const) {
      for (const shape of ["rail-loop", "rail-outer", "rail-inner", "rail-cell", "ring ==="]) {
        expect({ name, shape, redeclared: source.includes(shape) }).toEqual({ name, shape, redeclared: false });
      }
      expect({ name, uses: source.includes("<StationLoop") }).toEqual({ name, uses: true });
    }
  });

  test("the lede beside the rings is in the shared module, and the old sentences are gone (M58)", () => {
    // M83, ISC-698: the fuller lede names the framework; tests/m83-framework holds its words.
    // M86, ISC-718: the owner's lede of 2026-10-14.
    expect(LOOP).toContain("Answering one step changes what the AI will ask at other steps.");
    expect(LOOP).toContain("Once you've answered all six, you can move to describing your sampling approach");
    expect(RAIL).not.toContain("Answering one step changes");
    expect(LOOP).not.toContain("Four questions form the outer loop");
    for (const stale of [
      "The four questions form a loop rather than a sequence.",
      "Answer these three in any order",
      "They sit as a loop, not a sequence.",
      "These three build on the first four.",
    ]) {
      for (const [name, source] of [
        ["StationLoop", LOOP],
        ["StationRail", RAIL],
        ["Introduction", INTRO],
      ] as const) {
        expect({ name, stale, present: source.includes(stale) }).toEqual({ name, stale, present: false });
      }
    }
  });

  test("the layout rules are in the shared sheet, and the state rules are not", () => {
    for (const rule of [".rail-rings {", ".rail-loop {", ".rail-inner {", ".rail-outer {", ".rail-cell {", ".rail-item {"]) {
      expect({ rule, shared: COMPONENTS.includes(rule) }).toEqual({ rule, shared: true });
      expect({ rule, left: DESIGN.includes(rule) }).toEqual({ rule, left: false });
    }
    expect(DESIGN).toContain(".rail-dot {");
    expect(DESIGN).toContain(".rail-legend {");
    expect(COMPONENTS).not.toContain(".rail-legend {");
  });

  test("the step's place in the loops is one sentence, built once (M58; M84, ISC-705)", () => {
    // M84, ISC-705: the kicker names the step's loop; "Step n of 8" counted a ring as a queue.
    expect(stepKicker("context")).toBe("Outer loop · Context");
    expect(stepKicker("puzzle")).toBe("Inner loop · Puzzle");
    expect(stepKicker("early-data")).toBe("Outside the loops · Early data");
    expect(STATIONS.length).toBe(8);
    expect(INTRO).toContain("stepKicker(shown)");
    expect(LOOP).toContain("export function stepKicker");
  });
});

async function render(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(StrictMode, null, React.createElement(StepRail)));
  });
  return host;
}

describe("M34: the front page draws the same eight, in the same shape (M58)", () => {
  /* M58, ISC-567: the front page draws the same two rings as Design. */
  test("four in the outer loop, two in the inner, two outside, in the stations' own order (M58)", async () => {
    const host = await render();
    const cells = (id: string) => [...host.querySelectorAll<HTMLElement>(`[data-testid="${id}"] > li.rail-cell`)];
    const loop = cells("intro-steps-loop");
    const inner = cells("intro-steps-inner");
    const outer = cells("intro-steps-outer");
    const idOf = (li: HTMLElement) => li.querySelector("button")?.getAttribute("data-station");
    expect(loop.map(idOf)).toEqual(STATIONS.filter((s) => s.ring === "outer").map((s) => s.id));
    expect(inner.map(idOf)).toEqual(STATIONS.filter((s) => s.ring === "inner").map((s) => s.id));
    expect(outer.map(idOf)).toEqual(STATIONS.filter((s) => s.ring === "external").map((s) => s.id));
    expect(loop.length + inner.length + outer.length).toBe(STATIONS.length);
    // The inner ring sits inside the outer one, in the DOM as on the page.
    expect(host.querySelector('[data-testid="intro-steps-loop"] [data-testid="intro-steps-inner"]')).not.toBeNull();
    for (const li of [...loop, ...inner, ...outer]) {
      const id = idOf(li);
      expect({ id, classed: li.className }).toEqual({ id, classed: `rail-cell rail-cell-${id}` });
    }
  });

  test("each cell is a button carrying the step's name and its glyph", async () => {
    const host = await render();
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("button.rail-item")];
    expect(buttons).toHaveLength(STATIONS.length);
    for (const button of buttons) {
      // Keyboard reach, as on Design: a button, not a div with a handler.
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("type")).toBe("button");
      // The label is the station's own, matched through the cell's own id
      // rather than through its position, so a reordering fails the order test
      // above rather than this one.
      const id = button.getAttribute("data-station");
      const station = STATIONS.find((s) => s.id === id);
      expect({ id, label: button.querySelector(".rail-label")?.textContent }).toEqual({
        id,
        label: station?.label ?? "",
      });
      // The M34 glyph in place of the status dot.
      expect(button.querySelector("svg.front-icon")).not.toBeNull();
    }
  });

  test("no status mark and no legend, because there is no study here", async () => {
    const host = await render();
    // A mark nobody has defined is decoration, and a legend defining marks that
    // are not drawn is worse than either.
    expect(host.querySelectorAll(".rail-dot")).toHaveLength(0);
    expect(host.querySelectorAll(".rail-legend")).toHaveLength(0);
    expect(host.querySelectorAll("[data-state]")).toHaveLength(0);
    // Nor the Design rail's own landmark, which would put a second navigation
    // region on a page that is not navigating anywhere.
    expect(host.querySelector("nav")).toBeNull();
  });
});

describe("M34: pressing a step shows its words", () => {
  test("Context is shown from the start, so the panel is never an empty box", async () => {
    const host = await render();
    const panel = host.querySelector<HTMLElement>('[data-testid="intro-step-panel"]') as HTMLElement;
    expect(panel.getAttribute("aria-live")).toBe("polite");
    const context = STATIONS[0];
    expect(panel.textContent).toContain(stepKicker("context"));
    expect(panel.textContent).toContain(context?.blurb ?? "");
    expect(panel.textContent).toContain(context?.prompt ?? "");
    // And the cell says it is the one being shown.
    const current = host.querySelector<HTMLElement>('.rail-item[data-current="true"]');
    expect(current?.getAttribute("data-station")).toBe("context");
    expect(current?.getAttribute("aria-current")).toBe("step");
  });

  test("pressing a cell changes the panel, for every one of the seven", async () => {
    const host = await render();
    const panel = host.querySelector<HTMLElement>('[data-testid="intro-step-panel"]') as HTMLElement;
    for (const station of STATIONS) {
      const button = host.querySelector<HTMLButtonElement>(
        `.rail-item[data-station="${station.id}"]`,
      ) as HTMLButtonElement;
      await act(async () => {
        button.click();
      });
      // The card bodies' own words, verbatim, which is where the seven cards
      // went rather than being rewritten for the panel.
      expect({ id: station.id, kicker: panel.textContent?.includes(stepKicker(station.id)) }).toEqual(
        { id: station.id, kicker: true },
      );
      expect({ id: station.id, blurb: panel.textContent?.includes(station.blurb) }).toEqual({
        id: station.id,
        blurb: true,
      });
      expect({ id: station.id, prompt: panel.textContent?.includes(station.prompt) }).toEqual({
        id: station.id,
        prompt: true,
      });
      // Exactly one cell is current at a time.
      expect(host.querySelectorAll('.rail-item[data-current="true"]')).toHaveLength(1);
      expect(
        host.querySelector('.rail-item[data-current="true"]')?.getAttribute("data-station"),
      ).toBe(station.id);
    }
  });

  test("the cards the panel replaced are gone, rules and all", () => {
    // The seven card bodies moved into the panel. Leaving the grid behind would
    // have meant two arrangements again, one of them invisible.
    expect(INTRO).not.toContain('className="station-cards"');
    expect(INTRO).not.toContain('className="station-card"');
    expect(INTRO_CSS).not.toContain(".station-cards {");
    expect(INTRO_CSS).not.toContain(".station-card-n {");
    // M58: the heading is the owner's, and the lede still says which tab.
    expect(INTRO).toContain("<h2>{STEPS_HEADING}</h2>");
    // M83, ISC-698: the heading is the framework's name.
    expect(INTRO).toContain("export const STEPS_HEADING = `The ${FRAMEWORK_NAME}`;");
    expect(INTRO).toContain("steps on the Design tab.");
  });
});
