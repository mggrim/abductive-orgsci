/**
 * The model is the interviewer, not the researcher (ISC-237 … ISC-241).
 *
 * Found on the first live run through the local Claude CLI, and by nothing in
 * the suite: the mock client returns fixed text, so every test passed while
 * the real model answered its own question in the researcher's voice and
 * invented a patient, a clinic and years of unease that no user had described.
 *
 * The cause was the conversational frame rather than the instructions. The
 * user turn was the bare question, so from the model's side a user had asked
 * it something, and that beat a system prompt telling it to ask.
 */

import { describe, expect, test } from "bun:test";
import { assembleTurnPrompt, TURN_INSTRUCTION } from "../src/interview/prompt.ts";
import type { NextMove } from "../src/interview/types.ts";

const MOVE: NextMove = {
  id: "m1",
  topic: "station:context",
  mode: "interrogation",
  question: "What made this worth your time, before you had a question for it?",
  rationale: "The account of why a study exists is rarely written down.",
  source: "station",
};

describe("the user turn does not invite an answer", () => {
  test("it is an instruction, not the bare question (ISC-237)", () => {
    const t = TURN_INSTRUCTION(MOVE.question);
    expect(t).not.toBe(MOVE.question);
    expect(t).toContain(MOVE.question);
    expect(t.toLowerCase()).toContain("put this question to the researcher");
  });

  test("it says outright not to answer (ISC-238)", () => {
    expect(TURN_INSTRUCTION(MOVE.question).toLowerCase()).toContain("do not answer it yourself");
  });

  test("Anti: the dialogue never sends the bare question as the user turn (ISC-239)", async () => {
    const src = await Bun.file(new URL("../src/workbench/Dialogue.tsx", import.meta.url)).text();
    expect(src).not.toContain(`content: move.question`);
    /* M89: the call `TURN_INSTRUCTION(move.question)` left Dialogue with the
     * path that put an offered or invited question; the absence of the bare
     * question as a user turn is the part of this claim that still holds. */
  });
});

describe("the system prompt forbids taking the researcher's role", () => {
  const prompt = assembleTurnPrompt({ move: MOVE, chunks: [], ontologySummary: "" });

  test("it says never to speak as the researcher (ISC-240)", () => {
    expect(prompt.toLowerCase()).toContain("not speaking as them");
    expect(prompt.toLowerCase()).toContain("do not write in the researcher's voice");
  });

  test("it names inventing their material as the failure (ISC-241)", () => {
    const p = prompt.toLowerCase();
    expect(p).toContain("or invent their site");
    // The exact tell from the live run, so the rule keeps pointing at a real
    // observed failure rather than a hypothetical one.
    expect(p).toContain("i keep coming back to");
  });
});
