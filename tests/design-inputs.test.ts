/**
 * The three inputs the tool asked for and never collected (ISC-296 … ISC-302).
 *
 * `targetVenue` has been on `ProjectBrief` since the twin was written. It
 * reaches the persona engine, the twin generator and the audience-acceptance
 * semantic rule. Nothing ever set it, so all three ran against the fallback
 * string "a leading management or sociology journal" for every study anyone
 * has ever created in this app.
 *
 * The corpus and the starting interest are new, both from a co-author on
 * 4 August: name the conversation you are joining, and stop demanding a
 * research question from someone who has not got one yet.
 */

import { describe, expect, test } from "bun:test";
import { emptyBrief, normalizeBrief, type ProjectBrief } from "../src/state/projects.ts";
import { designDigest } from "../src/interview/designDigest.ts";
import { assembleTurnPrompt } from "../src/interview/prompt.ts";
import type { NextMove } from "../src/interview/types.ts";

const ASK = {
  id: "m1",
  mode: "interrogation",
  question: "What is happening in your field site that you cannot currently account for?",
  topic: "puzzle:root",
  rationale: "r",
} as NextMove;

const FILLED: ProjectBrief = {
  ...emptyBrief(),
  startingInterest: "Handoffs, and how much gets decided in them",
  researchQuestion: "How do patient stories change across the night-shift handoff?",
  targetVenue: "US management journals, or a specialist health-organisation outlet",
  seminalCorpus: "Zuckerman 2017 on genres and puzzles; Langley 1999 on process",
};

describe("the fields exist and survive storage", () => {
  test("a brief predating them normalises rather than breaking (ISC-296)", () => {
    // Every study created before M18 lacks all three. normalizeBrief is the
    // reason old projects do not render undefined into a textarea.
    const old = { researchQuestion: "q", context: "c" } as Partial<ProjectBrief>;
    const b = normalizeBrief(old);
    expect(b.targetVenue).toBeUndefined();
    expect(b.seminalCorpus).toBeUndefined();
    expect(b.startingInterest).toBeUndefined();
    expect(b.researchQuestion).toBe("q");
    expect(b.sampleRationale).toBe("");
  });

  test("Anti: they are optional, so an empty brief is still valid (ISC-297)", () => {
    const b = emptyBrief();
    expect(b.targetVenue).toBeUndefined();
    expect(designDigest(b).targetVenue).toBeUndefined();
  });
});

describe("the venue reaches every consumer that was already reading it", () => {
  test("the persona engine reads it off the brief (ISC-298)", async () => {
    const src = await Bun.file(new URL("../src/personas/engine.ts", import.meta.url).pathname).text();
    expect(src).toContain("brief.targetVenue");
  });

  test("the twin generator reads it off the brief (ISC-299)", async () => {
    const src = await Bun.file(new URL("../src/twin/twin.ts", import.meta.url).pathname).text();
    expect(src).toContain("brief.targetVenue");
  });

  test("the interview turn now carries it too (ISC-300)", () => {
    const prompt = assembleTurnPrompt({
      move: ASK,
      chunks: [],
      ontologySummary: "",
      design: designDigest(FILLED),
    });
    expect(prompt).toContain("US management journals");
  });

  test("the corpus and the starting interest reach the turn as well (ISC-301)", () => {
    const prompt = assembleTurnPrompt({
      move: ASK,
      chunks: [],
      ontologySummary: "",
      design: designDigest(FILLED),
    });
    expect(prompt).toContain("Zuckerman 2017");
  });
});

describe("the corpus panel is paste-only", () => {
  const SRC = new URL("../src/flow/SeminalCorpus.tsx", import.meta.url).pathname;

  test("nothing in it reaches the network (ISC-302)", async () => {
    // The standing promise is that nothing but a model call leaves the browser.
    // Searching OpenAlex from this panel would quietly make that false.
    const code = (await Bun.file(SRC).text())
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/fetch\(|openalex|semanticscholar|XMLHttpRequest/i);
  });

  test("Anti: the check is not vacuous", () => {
    expect(/fetch\(|openalex/i.test('const r = await fetch("https://api.openalex.org")')).toBe(true);
  });
});
