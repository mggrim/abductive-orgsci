/**
 * M78a, ISC-678: a puzzle reading quotes the researcher's expectation or says
 * that their answers don't yet state one (the serendipity walk of 2026-10-03,
 * finding 5).
 *
 * At 21:36 and at 21:56 Abductive wrote "You expected that …" about Dave's
 * introductions driving the useful leads. The student's saved puzzle states a
 * different expectation: the prepared mind, so that founders who come for their
 * own repairs find more leads. "You expected that …" must be a verbatim or
 * near-verbatim span of the researcher's own words, checked at run time the way
 * M74b checks a quotation; otherwise the reading says so and keeps the contrast.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import type { ProjectBrief } from "../src/state/projects.ts";
import {
  EXPECTATION_RULE,
  EXPECTATION_UNSTATED,
  groundedExpectation,
  puzzleSources,
} from "../src/views/puzzleReading.ts";

const WALK = (await Bun.file(new URL("./fixtures/m76-walk.json", import.meta.url)).json()) as {
  project: { id: string; brief: ProjectBrief };
  documents: never[];
  chunks: never[];
  events: LedgerEvent[];
};

const said = puzzleSources({
  brief: WALK.project.brief,
  chunks: WALK.chunks,
  documents: WALK.documents,
  events: WALK.events,
  projectId: WALK.project.id,
}).blocks.map((b) => b.text);

const readings = WALK.events
  .filter((e): e is Extract<LedgerEvent, { type: "puzzle-reading" }> => e.type === "puzzle-reading")
  .map((e) => e.text)
  .filter((t) => t !== "");

describe("the walk's two readings", () => {
  test("both readings that the walk recorded invent the expectation", () => {
    expect(readings.length).toBe(2);
    for (const reading of readings) expect(reading.startsWith("You expected that")).toBe(true);
  });

  test("the 21:36 reading becomes the contrast, with the expectation said to be unstated", () => {
    const out = groundedExpectation(readings[0] ?? "", said);
    expect(out.startsWith(`${EXPECTATION_UNSTATED} `)).toBe(true);
    expect(out).not.toContain("You expected");
    expect(out).toContain("The useful leads went to helpers");
  });

  test("the 21:56 reading becomes the contrast, with the expectation said to be unstated", () => {
    const out = groundedExpectation(readings[1] ?? "", said);
    expect(out.startsWith(`${EXPECTATION_UNSTATED} `)).toBe(true);
    expect(out).not.toContain("Dave's walking founders over to each other");
    expect(out).toContain('"didn\'t expect the useful leads to go to the helpers"');
  });

  test("the sentence is the brief's", () => {
    expect(EXPECTATION_UNSTATED).toBe("Your answers don't yet state the expectation; Abductive suggests this contrast:");
  });
});

describe("a reading that quotes the researcher stands", () => {
  test("an expectation that the researcher saved, near-verbatim, is kept as it is", () => {
    /* The reading is drawn from the steps and the passages, not from the saved
     * puzzle (M74a, PUZZLE_STATIONS), so the check reads what the model was shown. */
    const own = ["I expected that a prepared mind finds the leads that it's looking for, as the literature says."];
    const reading =
      "You expected that a prepared mind finds the leads that it's looking for, yet the useful leads go to the founders who come to fix other people's problems.";
    expect(groundedExpectation(reading, own)).toBe(reading);
  });

  test("the walk's saved steps state no expectation, so a reading built from them can't claim one", () => {
    const reading = "You expected that a prepared mind finds the leads that it's looking for, yet the helpers find them.";
    expect(groundedExpectation(reading, said).startsWith(EXPECTATION_UNSTATED)).toBe(true);
  });

  test("the researcher's first person reads as the second person", () => {
    const reading = "You expected that your own attention changed after May, yet the counts fell.";
    const own = ["I wonder whether my own attention changed after May, when I started interviewing."];
    expect(groundedExpectation(reading, own)).toBe(reading);
  });

  test("a reading with no expectation clause passes untouched", () => {
    const reading = "Your answers set the helpers against the founders who come for their own repairs.";
    expect(groundedExpectation(reading, said)).toBe(reading);
  });
});

describe("the reading is checked where it is written", () => {
  test("the prompt carries the rule and the hook applies the check before it stores the reading", async () => {
    expect(EXPECTATION_RULE).toContain("You expected");
    expect(EXPECTATION_RULE).toContain(EXPECTATION_UNSTATED);
    const hook = await Bun.file(new URL("../src/flow/usePuzzleReading.ts", import.meta.url)).text();
    expect(hook).toContain("EXPECTATION_RULE");
    expect(hook).toContain("groundedExpectation(");
  });
});
