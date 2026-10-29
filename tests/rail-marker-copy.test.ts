/**
 * The rail's "?" says what is waiting (D53, M43d).
 *
 * The walk of 2026-09-13 read three cells wearing "?" and took the tool to be
 * asking three questions at once, against its own standing copy in
 * `Dialogue.tsx`: "The tool asks nothing new while a question is open, so
 * questions never stack up."
 *
 * Measured in real Chrome on the shipped example, the invariant holds. One
 * question was open, and the header pointed at it by name. The other two cells
 * carried open findings, because `cellState` has unioned the two facts since M38
 * (ISC-493) and the union is deliberate: both mean something at this step is
 * waiting on you. What was wrong was the sentence under the glyph, which claimed
 * only the first of the two on every cell that wore it.
 *
 * M89 took the findings away with the checks, so the "?" now means the open
 * question and nothing else, and its legend and title say "Open question". The
 * state id is still "flagged".
 */

import { describe, expect, test } from "bun:test";
import { cellState, cellTitle } from "../src/flow/StationRail.tsx";
import type { PlaceSummary } from "../src/views/placeSummary.ts";

function summary(openQuestion: boolean): PlaceSummary {
  return {
    place: "sample",
    label: "Sample",
    title: null,
    turns: 0,
    answer: "saved",
    draftWaiting: false,
    openQuestion,
    waiting: 0,
    lastTs: null,
  };
}

describe("what a flagged cell says it has", () => {
  test("a cell with the open question says so", () => {
    const state = cellState("stated", summary(true));
    expect(state).toBe("flagged");
    expect(cellTitle(state, summary(true))).toBe("Open question");
  });

  /* M69, ISC-641: "deferred" (Set aside) left the rail with the control. */
  test("the other two states are unchanged, and neither mentions a question", () => {
    for (const state of ["empty", "stated"] as const) {
      expect(cellTitle(state, summary(false))).not.toContain("question");
      expect(cellTitle(state, undefined)).toBe(cellTitle(state, summary(true)));
    }
  });
});
