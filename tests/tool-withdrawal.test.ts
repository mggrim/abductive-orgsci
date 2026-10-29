/**
 * A withdrawal by the tool is not a dismissal by the researcher (D41, M43d).
 *
 * The walk of 2026-09-13 opened the Checks record and found three rows reading
 * "You dismissed this flag. Your reason: framing changed" on a study where
 * the researcher had dismissed no paper finding and had never typed those two
 * words. The tool wrote a `finding-disposition` as `system` when a
 * re-judgement cleared a paper or the paper left the reading list, and every
 * surface that rendered a sentence about who decided read `system` as the
 * researcher.
 *
 * The checks left main at M89, and with them the Checks record, the visit
 * strip's count and the findings export. History keeps every past event, so
 * what is held here is the part that stays: History's row for a disposition
 * the tool wrote says that the tool withdrew the flag, and the shipped example
 * still carries the three it wrote.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";

const PROJECT_ID = "proj-d41";
let clock = 2_500_000_000_000;
const tick = () => (clock += 1000);

function misfit(paperKey: string): LedgerEvent {
  return {
    id: crypto.randomUUID(),
    ts: tick(),
    actor: "system",
    projectId: PROJECT_ID,
    type: "lint-finding",
    rule: "paper-bearing-unstated",
    targetKind: "design",
    targetId: paperKey,
    reason: `"${paperKey}" makes no prediction about a setting like yours`,
  } as LedgerEvent;
}

function withdrawn(findingId: string): LedgerEvent {
  return {
    id: crypto.randomUUID(),
    ts: tick(),
    actor: "system",
    projectId: PROJECT_ID,
    type: "finding-disposition",
    findingId,
    disposition: "not-applicable",
    reason: "framing changed",
  } as LedgerEvent;
}

describe("the tool's own withdrawal, in History", () => {
  test("the record row says the tool withdrew it, not that the researcher did", () => {
    const finding = misfit("huang 2021");
    const rows = projectLedger([finding, withdrawn(finding.id)]);
    const row = rows.find((r) => r.kind === "finding-disposition");
    expect(row?.happened).toContain("Abductive withdrew a flag that it had raised");
    expect(row?.happened).not.toContain("Recorded that the finding doesn't apply");
  });
});

describe("the shipped example's three withdrawals", () => {
  const bundle = Bun.file(
    new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname,
  );
  test("are the only rows the record attributes to the tool", async () => {
    const parsed = await bundle.json();
    const events: readonly LedgerEvent[] = parsed.events;
    const projectId: string = parsed.project.id;
    const dispositions = events.filter(
      (e) => e.type === "finding-disposition" && e.projectId === projectId,
    );
    expect(dispositions).toHaveLength(36);
    const byTool = dispositions.filter((e) => e.actor === "system");
    expect(byTool).toHaveLength(3);
    // And History reads each as the tool's act, never the researcher's.
    const rows = projectLedger([...events]).filter((r) => byTool.some((e) => e.id === r.id));
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.happened).toContain("Abductive withdrew a flag that it had raised");
  });
});
