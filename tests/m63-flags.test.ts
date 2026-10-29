/**
 * M63, ISC-612: the earned tabs.
 *
 * The earned-tab rules of ISC-607 apply: the ontology tab opens at the first
 * suggested concept, and the unlock line says so.
 *
 * M89 (2026-10-14): this file also held the flags where they arise (the step's
 * flags above the composer and the flag on a concept card, each with a link to
 * the readiness report). They left main with the checks, and so did Checks'
 * unlock line.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { TAB_UNLOCK, openTabs } from "../src/views/earnedTabs.ts";

describe("the earned tabs (ISC-612)", () => {
  test("the ontology tab opens at the first suggested concept, and the unlock line says so", () => {
    const P = "p-earned";
    const suggested = {
      id: "11111111-1111-4111-8111-111111111111", ts: 1, actor: "persona:concepts", model: "m", modelVersion: "v", projectId: P,
      type: "concept-suggested", conceptId: "c", name: "A", definition: "d x", properties: [], relations: [], statementIds: [], statements: [],
      source: { kind: "summary", station: "context" },
    } as LedgerEvent;
    expect(openTabs([], P).ontology).toBe(false);
    expect(openTabs([suggested], P).ontology).toBe(true);
    expect(TAB_UNLOCK.ontology).toBe("Emerging project ontology opens when Abductive suggests a first concept.");
  });
});
