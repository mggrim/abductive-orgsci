/**
 * M75, ISC-666 (the owner, 2026-10-03): "Don't use 'no' as an amount." L21 in
 * `docs/copy-standard.md`. "No" is not a quantifier in rendered copy or in the
 * prompts ("No projects yet", "no passage behind it yet", "No open flags"). A
 * sentence says what is there or what is still to come. L14's determiner
 * carve-out is closed.
 */

import { describe, expect, test } from "bun:test";
import { NO_AMOUNT, RULE_TEXT, noAmounts, sentenceBreaks } from "../src/copy/rules.ts";
import { OWNER_RULES } from "../src/personas/voice.ts";
import { NO_ALLOW, noAmountOffenders, proseRuns, sentencesOf } from "./copyBarScan.ts";

const standard = await Bun.file(new URL("../docs/copy-standard.md", import.meta.url).pathname).text();

describe("M75: 'no' is not an amount (L21)", () => {
  test("no rendered sentence or prompt uses 'no' as an amount", () => {
    expect(noAmountOffenders()).toEqual([]);
  });

  test("Anti: the quantifier is caught before a noun phrase, in any case", () => {
    for (const s of [
      "No projects yet.",
      "No open flags",
      "The claim has no passage behind it yet.",
      "No concepts on the map yet. Accept a concept to place it here.",
      "Write no blocks at all.",
      "NO preamble.",
    ])
      expect({ s, hit: noAmounts(s).length > 0 }).toEqual({ s, hit: true });
  });

  test("Anti: a question, 'no longer', 'no one' (L19's), the flat denial (L14's) and an identifier pass", () => {
    for (const s of [
      "Is there no passage behind it?",
      "Abductive no longer reads that file.",
      "Do not use nothing, nobody, no one or nowhere.",
      "No.",
      "No, the file stays.",
      "a yes or no answer",
      "the no-op path",
      "Nobody knows.",
    ])
      expect({ s, hit: noAmounts(s).length > 0 }).toEqual({ s, hit: false });
  });

  test("Anti: a planted sentence in a scanned file is caught", () => {
    const planted = 'export const EMPTY = "No sources yet. Add papers to start.";';
    const hits = proseRuns(planted).flatMap((r) => sentencesOf(r)).filter((s) => NO_AMOUNT.test(s));
    expect(hits).toEqual(["No sources yet."]);
  });

  test("every allow-list entry carries its reason, and the list is empty", () => {
    for (const a of NO_ALLOW) expect(a.why.length).toBeGreaterThan(20);
    expect(NO_ALLOW.length).toBe(0);
  });

  test("the runtime reads it in the model's replies, and the model is told", () => {
    expect(sentenceBreaks("Your model has no concepts yet.").map((b) => b.rule)).toContain("L21");
    expect(RULE_TEXT.L21).toContain('"no"');
    expect(OWNER_RULES).toContain('Do not use "no" as an amount');
    expect(OWNER_RULES.split(/\s+/).length).toBeLessThan(200);
  });

  test("the rule is L21 in the standard, L14's carve-out is closed, and L7's example says what is still to come", () => {
    expect(standard).toContain("**L21.");
    expect(standard).not.toContain('"No" as a determiner opens a noun phrase and passes');
    expect(standard).not.toContain('"No sources yet. Add papers to start."');
    expect(standard).toContain('"Add papers to start; they appear here."');
    expect(standard).toContain("NO_ALLOW");
  });
});
