import { describe, expect, test } from "bun:test";
import { AI_ISM_PATTERNS, flagAiIsms, VOICE_CONTRACT } from "../src/personas/voice.ts";
import { assembleSystemPrompt } from "../src/personas/engine.ts";
import { MATRIX } from "../src/matrix/matrix.ts";

describe("voice contract", () => {
  test("included in every persona system prompt", () => {
    const cell = MATRIX[0]!;
    const prompt = assembleSystemPrompt({ creed: "test creed", cell, dataType: "interview" });
    expect(prompt).toContain("register contract");
    expect(prompt).toContain("options for moving forward");
  });

  test("flagAiIsms catches banned patterns and passes clean prose", () => {
    expect(flagAiIsms("It's important to note that we must delve deeper here.").length).toBeGreaterThan(1);
    expect(
      flagAiIsms(
        "My sense is the comparison cannot support the claim. You could narrow to one field, or add within-group contrast cases.",
      ),
    ).toEqual([]);
  });

  test("contract itself contains no em dashes", () => {
    expect(VOICE_CONTRACT.includes("—")).toBe(false);
  });

  test("pattern list is non-trivial", () => {
    expect(AI_ISM_PATTERNS.length).toBeGreaterThanOrEqual(10);
  });
});
