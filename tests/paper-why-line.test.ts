/**
 * The paper's why-line, and the prompt's own words getting into it (D2, D3, M43).
 *
 * Five typed papers were judged on the walk of 2026-09-13 and the same slot
 * rendered three different ways. Hallen, Cohen and Clough got a clean sentence.
 * Huang's read "one sentence why: it speaks directly to…", the label in front of
 * the sentence. Csaszar's read "one sentence saying why" and nothing else, the
 * label with no sentence behind it at all, which is the prompt's description of
 * the sentence rendered on a card as though it were one.
 *
 * The instruction was "FIT: fits | unclear | misfit" and then "Then, on the same
 * line, one sentence saying why". A menu reads as a line to copy, and a
 * description of a sentence is a thing a model can write instead of the sentence.
 * Both ends are fixed: the prompt states the shape as a shape, and the parser
 * takes the label off the front and treats what is left of nothing as no
 * sentence, because every surface already draws nothing for an empty reason.
 */

import { describe, expect, test } from "bun:test";
import { parseFit, withoutInstructionResidue } from "../src/proposals/fitVerdict.ts";
import { FIT_SYSTEM } from "../src/proposals/paperFit.ts";

describe("the prompt states the line's shape rather than describing it (D2)", () => {
  test("the shape is a template with parts to replace", () => {
    expect(FIT_SYSTEM).toContain("FIT: <fits, unclear or misfit>. <your sentence>");
    expect(FIT_SYSTEM).toContain("Replace both angle-bracketed parts.");
    // The sentence is addressed to the researcher, which is how four of the five
    // already read and how the fifth should have.
    expect(FIT_SYSTEM).toContain('addressed to the researcher as "you"');
  });

  test("the menu of three words is gone, pipes and all", () => {
    // A pipe out of this prompt reached a researcher once already: a finding
    // rendered as "| This is a methods paper about how to use LLMs".
    expect(FIT_SYSTEM).not.toContain("FIT: fits | unclear | misfit");
  });

  test("the words a model could write instead of the sentence are named and banned", () => {
    expect(FIT_SYSTEM).toContain('Do not write the angle brackets, the word "sentence"');
    expect(FIT_SYSTEM).toContain('or a label such as "why:" or "because:" on that line');
  });

  test("the prediction is still asked for before the verdict, as M33 left it", () => {
    const prediction = FIT_SYSTEM.indexOf("what this paper predicts about a setting like");
    const verdict = FIT_SYSTEM.indexOf("FIT: <fits, unclear or misfit>");
    expect(prediction).toBeGreaterThan(-1);
    expect(prediction).toBeLessThan(verdict);
  });
});

describe("the parser renders no label as a sentence (D2, D3)", () => {
  test("Csaszar's line: the label alone becomes no sentence", () => {
    // Verbatim from the walk. The card drew "one sentence saying why" as the
    // tool's reason for a verdict about the researcher's own reading list.
    expect(parseFit("FIT: fits. one sentence saying why")).toEqual({
      fit: "fits",
      reason: "",
    });
    // And with no separator at all, which is the other way the model wrote it.
    expect(parseFit("FIT: fits one sentence saying why").reason).toBe("");
  });

  test("Huang's line: the label comes off and the sentence stays", () => {
    // Verbatim from the walk, cut at the length the card showed.
    const live =
      "FIT: fits. one sentence why: it speaks directly to how evaluators convert founder " +
      "communication style into judgments of venture potential";
    expect(parseFit(live)).toEqual({
      fit: "fits",
      reason:
        "It speaks directly to how evaluators convert founder communication style into " +
        "judgments of venture potential",
    });
  });

  test("a bare label of either kind comes off too", () => {
    expect(parseFit("FIT: misfit. why: this paper makes no prediction about a setting like yours").reason).toBe(
      "This paper makes no prediction about a setting like yours",
    );
    expect(parseFit("FIT: unclear because: you have not said enough about the setting").reason).toBe(
      "You have not said enough about the setting",
    );
  });

  test("an unreplaced placeholder is not a sentence either", () => {
    expect(parseFit("FIT: fits. <your sentence>").reason).toBe("");
  });

  test("the three clean lines are untouched, which is four of the five papers", () => {
    const hallen =
      "FIT: fits. This directly predicts what your data shows: introduced founders getting " +
      "more office-hours contact than open-call founders.";
    expect(parseFit(hallen).reason).toBe(
      "This directly predicts what your data shows: introduced founders getting more " +
        "office-hours contact than open-call founders.",
    );
    // The M29c separators still work, and the M33 ordering still parses.
    expect(parseFit("FIT: fits | This directly predicts what your data shows.").reason).toBe(
      "This directly predicts what your data shows.",
    );
  });

  test("Anti: a sentence that opens on Why or Because is a sentence", () => {
    // The strip needs a colon on a bare label, because both words open real
    // sentences and eating one would cut the model's own words.
    expect(parseFit("FIT: fits. Why the criterion scores contact is the whole question.").reason).toBe(
      "Why the criterion scores contact is the whole question.",
    );
    expect(
      parseFit("FIT: fits. Because the mechanism is the same one, it predicts your asymmetry.").reason,
    ).toBe("Because the mechanism is the same one, it predicts your asymmetry.");
  });

  test("Anti: a word beginning with the label's letters is not the label", () => {
    expect(withoutInstructionResidue("Whying is not a word, and sentencing is another one.")).toBe(
      "Whying is not a word, and sentencing is another one.",
    );
  });

  test("Anti: nothing is capitalised that the parser did not cut", () => {
    // The one character this parser changes is the first of a sentence it cut a
    // label off, and it changes nothing on a line it left alone.
    expect(withoutInstructionResidue("it speaks to handovers.")).toBe("it speaks to handovers.");
    expect(withoutInstructionResidue("why: it speaks to handovers.")).toBe(
      "It speaks to handovers.",
    );
  });

  test("Anti: an unparseable answer is still unclear with no sentence", () => {
    expect(parseFit("EXPECTS: X\nSCOPE: Y")).toEqual({ fit: "unclear", reason: "" });
  });
});
