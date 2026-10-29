/**
 * M61 follow-up, ISC-595 (owner, 2026-09-30): "What Abductive will not do"
 * becomes "How Abductive keeps research governance", and every card is stated
 * in the affirmative. The same cards on the front page and the
 * walkthrough's third screen, from one constant. M89: the third card,
 * "Abductive keeps contradictions visible", went with the checks, so two remain.
 */
import { describe, expect, test } from "bun:test";
import { COMMITMENTS, COMMITMENTS_HEADING } from "../src/ui/Introduction.tsx";
import { RETIRED_ALLOW } from "./copyBarScan.ts";

describe("ISC-595: research governance, in the affirmative", () => {
  test("the heading and the two cards, in the owner's words", () => {
    // The lead's ruling: the owner's two strings yield to his own L13 and L12.
    expect(COMMITMENTS_HEADING).toBe("Research governance in Abductive");
    expect(COMMITMENTS.map((c) => c.title)).toEqual([
      "Abductive logs authorship for each recorded claim",
      // M69, ISC-642: "Not now" and "Set step aside" went, so the card names the two replies left.
      "Abductive keeps your choices in History",
    ]);
    expect(COMMITMENTS.map((c) => c.body)).toEqual([
      "Every claim carries a mark saying whether you, your data or the model wrote it, and the mark is permanent.",
      "Say you don't know or change the subject, and Abductive keeps both in History as your choices.",
    ]);
  });

  test("no not and no never in the heading or a card's title", () => {
    for (const line of [COMMITMENTS_HEADING, ...COMMITMENTS.map((c) => c.title)]) {
      expect({ line, negated: /\b(not|never|no)\b|n't\b/i.test(line) }).toEqual({ line, negated: false });
    }
  });

  test("the retired 'the record' needs no admission: the card says History", () => {
    expect(RETIRED_ALLOW.some((a) => a.run.includes("on the record"))).toBe(false);
  });
});
