/**
 * A finding is filed at the step its rule speaks to (D54, M43d).
 *
 * On the walk of 2026-09-13 all nine findings from the second check run were
 * stamped `Early data` in the record, while the cards routed six to Context, two
 * to Sample and one to The bind, and the Checks facets read `Context 6 · Sample 2
 * · The bind 1`. The record was reporting the step the run was pressed from:
 * `indexLedger` places an event with no step of its own at whichever question was
 * open, and the researcher's open question was at Early data.
 *
 * A finding has a step of its own and it is not that one. `RULE_STATION` maps
 * each rule to the answer that would have to move if the researcher agreed, which
 * is what the cards and the facets read. A rule with no step belongs to the study
 * as a whole, and the column already has a word for that.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";
import { stationForRule } from "../src/views/flagHistory.ts";

const PROJECT_ID = "proj-d54";
let clock = 2_800_000_000_000;
const tick = () => (clock += 1000);

function question(station: string): LedgerEvent {
  return {
    id: crypto.randomUUID(),
    ts: tick(),
    actor: "system",
    projectId: PROJECT_ID,
    type: "question-selection",
    moveId: "move-1",
    mode: "interrogation",
    reason: "the step has nothing saved yet",
    question: "What made you stop counting?",
    topic: `station:${station}`,
    station,
    alternatives: [],
  } as LedgerEvent;
}

function raise(rule: string, targetId = ""): LedgerEvent {
  return {
    id: crypto.randomUUID(),
    ts: tick(),
    actor: "system",
    projectId: PROJECT_ID,
    type: "lint-finding",
    rule,
    targetKind: "design",
    targetId,
    reason: `${rule} fired`,
    runId: "run-1",
  } as LedgerEvent;
}

describe("the step a finding is filed at", () => {
  test("is the rule's own step, not the step the run was pressed from", () => {
    /* The walk's exact shape: a question open at Early data, then a run raising
     * findings whose rules live at Context, Sample and The bind. */
    const events: LedgerEvent[] = [
      question("early-data"),
      /* M87, ISC-722: `context-literature-misfit` stands in for the retired
       * `paper-never-engaged`, which the walk raised here; both live at Context. */
      raise("context-literature-misfit"),
      raise("expectation-untested", "huang 2021"),
      raise("venue-scale-mismatch"),
      raise("defender-bar", "claim-1"),
    ];
    const rows = projectLedger(events).filter((r) => r.kind === "lint-finding");
    expect(rows.map((r) => r.station)).toEqual([
      stationForRule("context-literature-misfit"),
      stationForRule("expectation-untested"),
      stationForRule("venue-scale-mismatch"),
      stationForRule("defender-bar"),
    ]);
    expect(rows.map((r) => r.station)).toEqual(["context", "context", "sample", "bind"]);
  });

  test("a rule with no step of its own belongs to the study, never to the open question", () => {
    const events: LedgerEvent[] = [question("early-data"), raise("pass-clear")];
    const row = projectLedger(events).find((r) => r.kind === "lint-finding");
    expect(row?.station).toBeUndefined();
  });

  test("a decision about a finding is filed where the finding is", () => {
    const finding = raise("venue-scale-mismatch");
    const events: LedgerEvent[] = [
      question("early-data"),
      finding,
      {
        id: crypto.randomUUID(),
        ts: tick(),
        actor: "human",
        projectId: PROJECT_ID,
        type: "finding-disposition",
        findingId: finding.id,
        disposition: "not-applicable",
        reason: "The checks are written down rather than run.",
      } as LedgerEvent,
    ];
    const row = projectLedger(events).find((r) => r.kind === "finding-disposition");
    expect(row?.station).toBe("sample");
  });

  test("a decision about a recomputed finding reads the rule out of its derived id", () => {
    const events: LedgerEvent[] = [
      question("early-data"),
      {
        id: crypto.randomUUID(),
        ts: tick(),
        actor: "human",
        projectId: PROJECT_ID,
        type: "finding-disposition",
        findingId: "structural:resolution-without-rival:claim-9",
        disposition: "not-applicable",
        reason: "This is the falsification test, not an explanation of my puzzle.",
      } as LedgerEvent,
    ];
    const row = projectLedger(events).find((r) => r.kind === "finding-disposition");
    expect(row?.station).toBe(stationForRule("resolution-without-rival"));
    // M58: the rule about the puzzle's explanation lives at the puzzle step.
    expect(row?.station).toBe("puzzle");
  });
});

const BUNDLE = await Bun.file(
  new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname,
).json();

describe("the shipped example, where every finding read Early data", () => {
  test("no finding is filed at Early data unless its rule lives there", () => {
    const events: readonly LedgerEvent[] = BUNDLE.events;
    const rows = projectLedger([...events]).filter((r) => r.kind === "lint-finding");
    expect(rows.length).toBe(21);
    const byRule = new Map(
      events.flatMap((e) => (e.type === "lint-finding" ? [[e.id, e.rule] as const] : [])),
    );
    for (const row of rows) {
      const rule = byRule.get(row.id);
      expect(row.station).toBe(stationForRule(rule as never));
    }
    // And the step the walk's open question sat at is now claimed by nothing.
    expect(rows.filter((r) => r.station === "early-data")).toHaveLength(0);
  });
});
