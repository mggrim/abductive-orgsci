/**
 * Adjudication helper tests (ISC-16).
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { autoIgnore, openChallenges } from "../src/personas/adjudication.ts";
import { unadjudicatedCount } from "../src/matrix/signals.ts";
import { adjudication, challenge, filler } from "./helpers.ts";

describe("openChallenges", () => {
  test("returns only unadjudicated challenges, oldest first", () => {
    const c1 = challenge("first");
    const c2 = challenge("second");
    const events: LedgerEvent[] = [c1, c2, adjudication(c1.id, "accept")];

    const open = openChallenges(events);
    expect(open.length).toBe(1);
    expect(open[0]?.challenge.id).toBe(c2.id);
    expect(open[0]?.eventsSince).toBe(1);
  });

  test("empty ledger yields no open challenges", () => {
    expect(openChallenges([])).toEqual([]);
  });
});

describe("autoIgnore (ISC-16)", () => {
  test("emits 'ignored' adjudications from actor 'system' for stale challenges", () => {
    const stale = challenge("stale one");
    const events: LedgerEvent[] = [stale, ...filler(10)];

    const ignored = autoIgnore(events, { afterEvents: 10 });
    expect(ignored.length).toBe(1);
    const event = ignored[0];
    if (event === undefined) throw new Error("no ignore event");
    expect(event.type).toBe("adjudication");
    expect(event.verdict).toBe("ignored");
    expect(event.actor).toBe("system");
    expect(event.challengeId).toBe(stale.id);
    expect(event.reason).toContain("unadjudicated");
    expect(validateEvent(event)).toEqual([]);
  });

  test("fresh challenges are not auto-ignored", () => {
    const fresh = challenge("fresh");
    const events: LedgerEvent[] = [...filler(5), fresh, ...filler(3)];
    expect(autoIgnore(events, { afterEvents: 10 })).toEqual([]);
  });

  test("already-adjudicated challenges are never auto-ignored", () => {
    const c = challenge("answered");
    const events: LedgerEvent[] = [c, adjudication(c.id, "revise"), ...filler(20)];
    expect(autoIgnore(events, { afterEvents: 10 })).toEqual([]);
  });

  test("staleness measure aligns with the matrix unadjudicated-challenges signal", () => {
    const c1 = challenge("stale");
    const c2 = challenge("fresh");
    const events: LedgerEvent[] = [c1, ...filler(10), c2];

    const ignored = autoIgnore(events, { afterEvents: 10 });
    // Same events, same threshold → same count as the signal predicate.
    expect(ignored.length).toBe(unadjudicatedCount(events, { staleAfterEvents: 10 }));
    expect(ignored[0]?.challengeId).toBe(c1.id);
  });

  test("appending the ignored verdicts closes the challenges", () => {
    const stale = challenge("stale");
    const events: LedgerEvent[] = [stale, ...filler(12)];
    const after = [...events, ...autoIgnore(events, { afterEvents: 10 })];
    expect(openChallenges(after)).toEqual([]);
  });
});
