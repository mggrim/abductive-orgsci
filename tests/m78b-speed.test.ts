/**
 * M78b, ISC-682: the retry's ask carries only the lines it rewrites (the
 * serendipity walk, finding 15). The readiness check's parallel calls, their
 * rule order and their progress count left with the check in M89; this file
 * holds what stays, the shape of the voice retry's request.
 */
import { describe, expect, test } from "bun:test";
import { rewriteRequest } from "../src/inference/voiceRetry.ts";
import { offendingSentences } from "../src/copy/rules.ts";

describe("the retry's ask carries the lines it rewrites, not the whole reply (ISC-682)", () => {
  test("a long reply sends only the offending lines for context", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Founder ${i} queued at the crib before May and fixed a controller there.`).join("\n");
    const bad = "That tells me the crib still produces leads.";
    const reply = `${long}\n${bad}`;
    const ask = rewriteRequest(reply, offendingSentences(reply));
    expect(ask).toContain(bad);
    expect(ask.length).toBeLessThan(1500);
  });
});
