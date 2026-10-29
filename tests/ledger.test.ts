import { describe, expect, test } from "bun:test";

import { validateEvent, assertValidEvent, type LedgerEvent } from "../src/ledger/events.ts";
import * as ledgerModule from "../src/ledger/ledger.ts";
import { appendEvent, replay, InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { adjudication, attention, bound, challenge, envelope, filler } from "./helpers.ts";

describe("ledger events — schema validation (ISC-4)", () => {
  test("a well-formed human event validates", () => {
    expect(validateEvent(bound())).toEqual([]);
  });

  test("envelope fields are required and typed", () => {
    const bad = { ...bound(), id: "not-a-uuid", ts: -5, actor: "robot", projectId: "" };
    const errors = validateEvent(bad);
    expect(errors.join(" ")).toContain("UUID");
    expect(errors.join(" ")).toContain("ts");
    expect(errors.join(" ")).toContain("actor");
    expect(errors.join(" ")).toContain("projectId");
  });

  test("unknown event type is rejected", () => {
    const bad = { ...envelope("human"), type: "mutate" };
    expect(validateEvent(bad).length).toBeGreaterThan(0);
  });

  test("flag events require non-empty matrixCell and reason (ISC-11)", () => {
    const bad = { ...envelope("system"), type: "flag", matrixCell: "", reason: "  " };
    const errors = validateEvent(bad);
    expect(errors.join(" ")).toContain("matrixCell");
    expect(errors.join(" ")).toContain("reason");
  });

  test("adjudication verdicts are the five ISA sub-types (ISC-1)", () => {
    for (const verdict of ["accept", "revise", "reject", "defer", "ignored"] as const) {
      expect(validateEvent(adjudication(crypto.randomUUID(), verdict))).toEqual([]);
    }
    const bad = { ...adjudication(crypto.randomUUID()), verdict: "maybe" };
    expect(validateEvent(bad).join(" ")).toContain("verdict");
  });
});

describe("persona provenance (ISC-5)", () => {
  test("persona-actor events require model and modelVersion", () => {
    const e = challenge();
    const stripped = { ...e } as Record<string, unknown>;
    delete stripped.model;
    delete stripped.modelVersion;
    const errors = validateEvent(stripped);
    expect(errors.join(" ")).toContain("model");
    expect(errors.join(" ")).toContain("modelVersion");
    expect(() => assertValidEvent(stripped)).toThrow(/model/);
  });

  test("persona-actor events with model and modelVersion validate", () => {
    expect(validateEvent(challenge())).toEqual([]);
  });

  test("human and system events do not require model fields", () => {
    expect(validateEvent(bound())).toEqual([]);
    expect(validateEvent(attention("chunk-1"))).toEqual([]);
  });
});

describe("append-only ledger (ISC-2)", () => {
  test("appendEvent returns a new array and never mutates the input", () => {
    const first = bound();
    const events0: readonly LedgerEvent[] = Object.freeze([]);
    const events1 = appendEvent(events0, first);
    expect(events0.length).toBe(0);
    expect(events1.length).toBe(1);
    expect(Object.isFrozen(events1)).toBe(true);
    expect(Object.isFrozen(events1[0])).toBe(true);
  });

  test("duplicate event ids are rejected", () => {
    const e = bound();
    const events = appendEvent([], e);
    expect(() => appendEvent(events, e)).toThrow(/append-only/);
  });

  test("invalid events are rejected at append", () => {
    const bad = { ...bound(), id: "nope" } as LedgerEvent;
    expect(() => appendEvent([], bad)).toThrow(/Invalid ledger event/);
  });

  test("ledger module exports no update/delete/mutation API", () => {
    const exportNames = Object.keys(ledgerModule);
    for (const name of exportNames) {
      expect(name).not.toMatch(/update|delete|remove|mutate|set|clear|edit/i);
    }
    // Positive check: the intended surface is present.
    expect(exportNames).toContain("appendEvent");
    expect(exportNames).toContain("replay");
  });
});

describe("replay (ISC-3)", () => {
  function syntheticStream(): readonly LedgerEvent[] {
    let events: readonly LedgerEvent[] = [];
    const b = bound();
    const c1 = challenge("challenge one");
    const c2 = challenge("challenge two");
    for (const e of [
      b,
      c1,
      adjudication(c1.id, "revise"),
      c2,
      attention("chunk-a"),
      attention("chunk-b", "citation"),
      attention("chunk-a"),
      ...filler(3),
    ]) {
      events = appendEvent(events, e);
    }
    return events;
  }

  test("replaying the same events twice yields deep-equal state", () => {
    const events = syntheticStream();
    const state1 = replay(events);
    const state2 = replay(events);
    expect(state1).toEqual(state2);
    // And a structurally identical but separately-built stream projects identically
    expect(replay([...events])).toEqual(state1);
  });

  test("replay derives counts, challenge status, and attention coverage", () => {
    const state = replay(syntheticStream());
    expect(state.eventCount).toBe(10);
    expect(state.countsByType.challenge).toBe(2);
    expect(state.challenges.length).toBe(2);
    expect(state.challenges[0]?.status).toBe("adjudicated");
    expect(state.challenges[0]?.verdict).toBe("revise");
    expect(state.challenges[1]?.status).toBe("open");
    expect(state.openChallengeIds.length).toBe(1);
    expect(state.attentionByLayer.retrieval).toEqual(["chunk-a"]);
    expect(state.attentionByLayer.citation).toEqual(["chunk-b"]);
  });

  test("replay of an empty ledger is a well-formed zero state", () => {
    const state = replay([]);
    expect(state.eventCount).toBe(0);
    expect(state.lastEventTs).toBeNull();
    expect(state.challenges).toEqual([]);
  });
});

describe("InMemoryLedgerStore", () => {
  test("append + readAll round-trip in order, filtered by project", async () => {
    const store = new InMemoryLedgerStore();
    const a = bound("site", "ward A");
    const b = { ...bound("sample", "12 nurses"), projectId: "proj-other" };
    await store.append(a);
    await store.append(b);
    const all = await store.readAll();
    expect(all.map((e) => e.id)).toEqual([a.id, b.id]);
    const filtered = await store.readAll("proj-other");
    expect(filtered.map((e) => e.id)).toEqual([b.id]);
  });

  test("store rejects duplicate ids", async () => {
    const store = new InMemoryLedgerStore();
    const e = bound();
    await store.append(e);
    await expect(store.append(e)).rejects.toThrow(/append-only/);
  });
});
