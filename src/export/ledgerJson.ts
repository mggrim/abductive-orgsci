/**
 * Ledger JSON export (ISC-32): the complete machine-readable event log for a
 * project, in an envelope that says what it is.
 *
 * Pure builders only. The download wrapper that used to sit at the foot of this
 * file is gone, and so is the reason it was harmless: nothing called it, and
 * `ExportBar` had its own `JSON.stringify(events)` instead, so the shipped
 * `ledger.json` was a bare array and this module was decoration. A second path
 * to disk that skips the export receipt is worse than none, because the one
 * thing every download in this app does is append the fact that it happened.
 */

import type { LedgerEvent } from "../ledger/events.ts";
import { serializeRecord } from "./recordJson.ts";

export interface LedgerExport {
  readonly format: "bounds-ledger";
  readonly version: 1;
  readonly exportedAt: number;
  readonly projectId: string;
  readonly eventCount: number;
  readonly events: readonly LedgerEvent[];
}

/** Build the export envelope from the full event array (filters by project). */
export function buildLedgerExport(
  projectId: string,
  events: readonly LedgerEvent[],
  now: () => number = () => Date.now(),
): LedgerExport {
  const projectEvents = events.filter((e) => e.projectId === projectId);
  return {
    format: "bounds-ledger",
    version: 1,
    exportedAt: now(),
    projectId,
    eventCount: projectEvents.length,
    events: projectEvents,
  };
}

/**
 * Through `serializeRecord`, never `JSON.stringify`.
 *
 * This file holds the record, so its model-authored fields arrive normalised
 * with the model's own sentence beside them on `asWritten`, and that bag is
 * where every banned dash in the shipped `ledger.json` was found. See
 * `recordJson.ts` for why the answer is the format's own escape rather than
 * either dropping the provenance or exempting the file from the rule.
 */
export function serializeLedgerExport(exported: LedgerExport): string {
  return serializeRecord(exported);
}
