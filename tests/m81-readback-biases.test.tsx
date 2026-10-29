/**
 * M81, ISC-691 (the owner, 2026-10-03): "The biases are never defined clearly."
 *
 * Each bias has a one-sentence definition in the glossary, and the glossary
 * lines that broke the copy rules (L13 to L21) are rewritten.
 *
 * M89 (2026-10-14): the places that showed these definitions (the readiness
 * report's flagged entries and Bias readings fold, the Report's sections and
 * the Checks Help) left main with the checks, and so did the read-back's width
 * (ISC-690). The glossary stays, with the matrix config.
 */

import { describe, expect, test } from "bun:test";
import { BIAS_GLOSSARY } from "../src/matrix/glossary.ts";
import { BIAS_IDS } from "../src/matrix/schema.ts";

describe("each bias has a one-sentence definition (ISC-691)", () => {
  test("nine one-sentence definitions, each opening with the bias's name", () => {
    expect(BIAS_IDS.length).toBe(9);
    for (const id of BIAS_IDS) {
      const entry = BIAS_GLOSSARY[id];
      expect(entry.short.startsWith(`${entry.name} is `)).toBe(true);
      expect(entry.short.endsWith(".")).toBe(true);
      /* One sentence: the only full stop is the last character. */
      expect(entry.short.slice(0, -1)).not.toMatch(/[.!?]/);
      expect(entry.short.split(/\s+/).length).toBeLessThanOrEqual(24);
    }
  });

  test("Sycophancy reads the brief's sentence", () => {
    expect(BIAS_GLOSSARY.sycophancy.short).toBe("Sycophancy is the assistant agreeing with your claim because the claim was yours.");
  });

  test("the glossary lines that broke the copy rules are rewritten", () => {
    const all = BIAS_IDS.flatMap((id) => [BIAS_GLOSSARY[id].definition, BIAS_GLOSSARY[id].tell, BIAS_GLOSSARY[id].short]).join("\n");
    /* L13: a wh-word standing in for a thing ("protect who you are"). */
    expect(all).not.toContain("who you are");
    /* L18: reduced relatives, a noun then a subject then a verb with no "that". */
    expect(all).not.toContain("excerpts you keep");
    expect(all).not.toContain("pairing a thousand papers have");
    /* L18: the agentless passive ("Models are trained"). */
    expect(all).not.toMatch(/\bare trained\b/);
    /* L17: a thing acting as an agent would (material agreeing, a resolution beating, quotes carrying, an intuition naming). */
    expect(all).not.toContain("material that keeps agreeing");
    expect(all).not.toContain("that the resolution beat");
    expect(all).not.toContain("quotes carry");
    expect(all).not.toContain("intuition that names");
    /* L19 to L21 on every line. */
    expect(all).not.toMatch(/\b(?:nothing|nobody|no one|nowhere|never)\b/i);
    expect(all).not.toMatch(/\bno\s+(?!longer\b)[a-z]/i);
  });
});
