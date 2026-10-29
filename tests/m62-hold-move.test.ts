/**
 * M62, L15 and L16 (the owner, 2026-09-30).
 *
 * L15: no rendered sentence uses "hold" or "holds" as a verb for a rule, a test,
 * a claim or a record ("History holds", "the rule holds"); say what the thing
 * does: keeps, records, requires, stands, applies. A person holding a view (an
 * expectation "held in the setting", "the account you hold") is a different
 * verb and is listed with its reason, as is a prompt sent to the model.
 *
 * L16: no rendered string uses "move" or "moves" as a noun for an act or a
 * choice ("the three moves", "each of these moves"); name the act: the reply,
 * the choice, the request. The verb ("the file moves up", "move on") passes, and
 * identifiers such as moves.ts are not copy.
 */
import { describe, expect, test } from "bun:test";
import { HOLD_ALLOW, HOLD_VERB, MOVE_NOUN, holdOffenders, moveNounOffenders } from "./copyBarScan.ts";

describe("L15: hold is not a verb for a rule, a test, a claim or a record", () => {
  test("no rendered sentence in scope breaks it, outside the listed ones", () => {
    expect(holdOffenders()).toEqual([]);
  });

  test("Anti: the shapes the owner named are caught", () => {
    for (const s of ["History holds every event.", "The rule holds.", "Where the expectation holds:", "the claim stops holding"]) {
      expect({ s, hit: HOLD_VERB.test(s) }).toEqual({ s, hit: true });
    }
    expect(HOLD_VERB.test("History keeps every event.")).toBe(false);
    expect(HOLD_VERB.test("Hold-out cases")).toBe(false);
  });

  test("the allowlist is short and every entry carries its reason", () => {
    expect(HOLD_ALLOW.length).toBeLessThanOrEqual(10);
    for (const a of HOLD_ALLOW) expect(a.why.length).toBeGreaterThan(10);
  });
});

describe("L16: move is not a noun for an act or a choice", () => {
  test("no rendered string in scope breaks it, outside the listed ones", () => {
    expect(moveNounOffenders()).toEqual([]);
  });

  test("Anti: the noun is caught and the verb passes", () => {
    for (const s of ["Abductive records each of these moves.", "the three moves", "a normal move", "I don't know and Not now are moves too."]) {
      expect({ s, hit: MOVE_NOUN.test(s) }).toEqual({ s, hit: true });
    }
    for (const s of [
      "Mark a file as a paper and the file moves up to the papers above.",
      "You can move on without clearing anything.",
      "Focus moves to the button.",
      "Review a suggestion and your model moves.",
    ]) {
      expect({ s, hit: MOVE_NOUN.test(s) }).toEqual({ s, hit: false });
    }
  });
});

describe("the copy standard carries both", () => {
  test("L15 and L16 are in Part 5", async () => {
    const standard = await Bun.file(new URL("../docs/copy-standard.md", import.meta.url).pathname).text();
    expect(standard).toContain("**L15.");
    expect(standard).toContain("**L16.");
  });
});
