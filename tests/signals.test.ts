import { describe, expect, test } from "bun:test";

import type { LedgerEvent } from "../src/ledger/events.ts";
import {
  acceptanceStreak,
  coverageStagnation,
  unadjudicatedChallenges,
  unadjudicatedCount,
} from "../src/matrix/signals.ts";
import { acceptRun, adjudication, attention, challenge, filler } from "./helpers.ts";

describe("acceptance-streak (ISC-9)", () => {
  test("fires on 5 consecutive accepts", () => {
    const events = acceptRun(5);
    const result = acceptanceStreak(events);
    expect(result.fired).toBe(true);
    expect(result.reason).toContain("fired because");
    expect(result.reason).toContain("accept");
  });

  test("does not fire on a clean stream with mixed verdicts", () => {
    const events: LedgerEvent[] = [...acceptRun(3)];
    const c = challenge("pushback");
    events.push(c, adjudication(c.id, "revise"), ...acceptRun(2));
    expect(acceptanceStreak(events).fired).toBe(false);
  });

  test("does not fire on an empty or short stream", () => {
    expect(acceptanceStreak([]).fired).toBe(false);
    expect(acceptanceStreak(acceptRun(4)).fired).toBe(false);
  });

  test("threshold is configurable", () => {
    expect(acceptanceStreak(acceptRun(3), { streak: 3 }).fired).toBe(true);
    expect(acceptanceStreak(acceptRun(5), { streak: 6 }).fired).toBe(false);
  });
});

describe("unadjudicated-challenges (ISC-9, ISC-16 groundwork)", () => {
  test("fires when a challenge sits unadjudicated through 10 subsequent events", () => {
    const c = challenge("ignored dissent");
    const events: LedgerEvent[] = [c, ...filler(10)];
    expect(unadjudicatedCount(events)).toBe(1);
    const result = unadjudicatedChallenges(events);
    expect(result.fired).toBe(true);
    expect(result.reason).toContain("fired because");
  });

  test("does not fire on a clean stream where challenges get adjudicated", () => {
    const c = challenge("answered dissent");
    const events: LedgerEvent[] = [c, adjudication(c.id, "reject"), ...filler(12)];
    expect(unadjudicatedCount(events)).toBe(0);
    expect(unadjudicatedChallenges(events).fired).toBe(false);
  });

  test("does not fire while the challenge is still fresh", () => {
    const c = challenge("recent dissent");
    const events: LedgerEvent[] = [c, ...filler(5)];
    expect(unadjudicatedChallenges(events).fired).toBe(false);
  });

  test("staleness and count thresholds are configurable", () => {
    const c = challenge();
    const events: LedgerEvent[] = [c, ...filler(5)];
    expect(unadjudicatedChallenges(events, { staleAfterEvents: 3 }).fired).toBe(true);
    expect(unadjudicatedChallenges(events, { staleAfterEvents: 3, minCount: 2 }).fired).toBe(false);
  });
});

describe("coverage-stagnation (ISC-9)", () => {
  test("fires when no new retrieval chunks appear in the last 20 events", () => {
    // Establish coverage, then 20 events that only revisit chunk-a.
    const events: LedgerEvent[] = [
      attention("chunk-a"),
      attention("chunk-b"),
      ...Array.from({ length: 10 }, () => attention("chunk-a")),
      ...filler(10),
    ];
    const result = coverageStagnation(events);
    expect(result.fired).toBe(true);
    expect(result.reason).toContain("fired because");
    expect(result.reason).toContain("brought only chunks that the loop had covered before");
  });

  test("does not fire on a clean stream with fresh retrieval inside the window", () => {
    const events: LedgerEvent[] = [
      attention("chunk-a"),
      ...filler(15),
      attention("chunk-new"),
      ...filler(5),
    ];
    expect(coverageStagnation(events).fired).toBe(false);
  });

  test("does not fire before a full window of events exists", () => {
    expect(coverageStagnation(filler(5)).fired).toBe(false);
    expect(coverageStagnation([]).fired).toBe(false);
  });

  test("window is configurable", () => {
    const events: LedgerEvent[] = [attention("chunk-a"), ...filler(9)];
    expect(coverageStagnation(events, { windowEvents: 8 }).fired).toBe(true);
    expect(coverageStagnation(events, { windowEvents: 11 }).fired).toBe(false);
  });

  test("citation/human attention does not count as retrieval coverage", () => {
    const events: LedgerEvent[] = [
      attention("chunk-a"),
      ...filler(12),
      attention("chunk-c", "citation"),
      attention("chunk-h", "human"),
      ...filler(6),
    ];
    expect(coverageStagnation(events).fired).toBe(true);
  });
});
