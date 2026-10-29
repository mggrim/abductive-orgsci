/**
 * M78b, ISC-682: the retry's rewrite is checked for new breaks and keeps
 * attributed words (the serendipity walk, "Abductive's prose against the
 * owner's rules"). At 20:52 the retry fixed "why a bounded place where
 * encounters happen" (L13) with "a bounded place that encounters happen in or
 * fail to happen in", and at 21:29 it fixed "being called" (L18) by writing "the
 * booking system that people call "calmer"", which moved Dave's word for the
 * crib onto the booking system and onto people at large.
 */
import { describe, expect, test } from "bun:test";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { acceptedRewrite, reviseInVoice } from "../src/inference/voiceRetry.ts";

const first = (text: string) => ({ text, model: "m", modelVersion: "m" });
const scripted = (...lines: readonly string[]) => new MockInferenceClient({ responses: lines.map((l) => `1. ${l}`) });

describe("a rewrite that adds a break is rejected (ISC-682)", () => {
  const draft = "I can see why a bounded place where encounters happen appeals to you.";
  const walkRetry = "I can see the reason that a bounded place that encounters happen in or fail to happen in appeals to you.";
  const good = "I can see the appeal of a bounded place in which encounters happen.";

  test("the walk's 20:52 rewrite introduces L18 and is not accepted", () => {
    expect(acceptedRewrite(draft, walkRetry)).toBe(false);
    expect(acceptedRewrite(draft, good)).toBe(true);
  });

  test("the reply keeps the draft over the bad rewrite, and takes the good one on the next ask", async () => {
    const client = scripted(walkRetry, good);
    const out = await reviseInVoice(client, first(`Eight months gives you a lot to look at. ${draft}`));
    expect(out.text).toBe(`Eight months gives you a lot to look at. ${good}`);
    expect(client.requests.length).toBe(2);
  });
});

describe("the retry keeps attributed words (ISC-682)", () => {
  const said = ["Dave said it's calmer, and everyone wanted calmer, but I count fewer encounters since May."];
  const draft = 'Dave calls the crib "calmer", and I\'d like to know what changed for the helpers.';
  const walkRetry = 'The booking system that people call "calmer" changed something for the helpers, and I\'d like to hear about it.';
  const good = 'Dave calls the crib "calmer", and I\'d like to hear about the change for the helpers.';

  test("a rewrite that drops the named speaker or the quotation is not accepted", () => {
    expect(acceptedRewrite(draft, walkRetry)).toBe(false);
    expect(acceptedRewrite(draft, 'Dave calls the crib calm, and I\'d like to hear about the change for the helpers.')).toBe(false);
    expect(acceptedRewrite(draft, good)).toBe(true);
  });

  test("the reply never carries the misattribution", async () => {
    const client = scripted(walkRetry, good);
    const out = await reviseInVoice(client, first(draft), undefined, { quotable: said });
    expect(out.text).toBe(good);
    expect(out.text).not.toContain("booking system");
  });
});
