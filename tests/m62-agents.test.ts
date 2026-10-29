/**
 * M62, ISC-606, L17 (the owner, 2026-09-30): no rendered sentence gives acting
 * power to a non-entity. Acts belong to agents (you, Abductive, the model, the
 * reader, the author, a colleague); things are in states and don't act.
 */
import { describe, expect, test } from "bun:test";
import { AGENT_ALLOW, nonEntityActs, nonEntityOffenders } from "./copyBarScan.ts";

describe("L17: things are in states and don't act", () => {
  test("no rendered statement in scope breaks it, outside the listed prompts", () => {
    expect(nonEntityOffenders()).toEqual([]);
  });

  test("Anti: the owner's examples are caught", () => {
    for (const s of [
      "A question is waiting at Context.",
      "The summary says you study night wards.",
      "This line names the part you still have to show.",
      "The checks read these three answers.",
      "Every check reads your model.",
      "History records every event.",
      "Your model records whether the bind stands.",
      "The flag raises a concern about your sample.",
      "Decide later and the suggestion waits.",
      "Go to the question waiting at Early data",
      "3 suggestions waiting on Your model.",
    ]) {
      expect({ s, hit: nonEntityActs(s) }).toEqual({ s, hit: true });
    }
  });

  test("Anti: agents, states and questions pass", () => {
    for (const s of [
      "A question is open for you at Context.",
      "You wrote in the summary that you study night wards.",
      "Abductive reads your model for every check.",
      "The model reads your answers.",
      "The field is empty.",
      "The flag is open.",
      "Waiting for Claude Code to be installed and signed in…",
      "Abductive stopped waiting after 10 minutes.",
      "What does the summary say about your site?",
      "History keeps every event in the order it happened.",
    ]) {
      expect({ s, hit: nonEntityActs(s) }).toEqual({ s, hit: false });
    }
  });

  test("the allowlist is prompts only, each with its reason", () => {
    for (const a of AGENT_ALLOW) expect(a.why).toMatch(/prompt/);
  });

  test("the rule is L17 in the copy standard", async () => {
    const standard = await Bun.file(new URL("../docs/copy-standard.md", import.meta.url).pathname).text();
    expect(standard.includes("**L17.")).toBe(true);
  });
});
