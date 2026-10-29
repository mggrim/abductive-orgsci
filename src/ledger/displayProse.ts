/**
 * The voice gate on rows the gate did not write (FND-01, second half).
 *
 * The gate in `src/inference/voiceGate.ts` normalises model prose at the one
 * boundary where model text enters, which covers everything written after it
 * shipped and nothing written before. A survey of the running fixture study
 * found the difference on screen: two proposal bodies in the ontology tray, a
 * finding on /design/tension, a finding on /coherence carrying an unspaced
 * "fieldwork" joined to "dozens of interviews", and three interview questions
 * whose banned dashes had already been taken out of `src/interview/moves.ts`
 * but were still sitting in the ledger from the turn on which they were asked.
 * The rule is a grep of the rendered DOM with zero permitted occurrences, and
 * the DOM does not care when a row was written.
 *
 * So this is the read half of the same rule, and it is applied at the one place
 * every projection reads through: `LedgerProvider` maps whatever
 * `LedgerStore.readAll` returns before anything derives state from it. Doing it
 * per projection would have meant remembering it in the proposal tray, the
 * finding list, the transcript, the coherence panel and whatever the six
 * surface builders add next.
 *
 * Two constraints shape what is in the table below.
 *
 * The stored ledger is not touched. This maps a value on its way to a renderer;
 * nothing is appended, nothing is rewritten in IndexedDB, and `rawText`
 * provenance on gated rows still holds what the model actually said. Replay
 * over the stored events is unchanged, which is what keeps the ledger the
 * single source of truth rather than one of two.
 *
 * Only model-authored fields are listed. The researcher's own words are never
 * rewritten, not even to satisfy the tool's own house style: a response, a
 * refusal note, a flag reason and a finding dismissal all pass through
 * untouched. A tool that silently corrected the punctuation of the person it is
 * interviewing would be a worse defect than the one this fixes.
 *
 * ── Where normalisation belongs, decided once ────────────────────────────────
 *
 * Three boundaries were candidates and the answer is two of them, for reasons
 * that are properties of this ledger rather than taste.
 *
 * Ingest. `voiceGate.ts` normalises every `CompleteResult` at the one door model
 * text comes through. That covers everything written after the gate shipped and
 * nothing written before it, and the fixture study's pages were drafted before.
 *
 * Rewriting history. Rejected outright. The ledger is append-only and its whole
 * claim is that it holds what happened; a migration that edited stored bodies
 * would answer the house-style question by destroying the audit question.
 *
 * Read and export. This file, applied in `LedgerProvider` so every projection
 * and every export writer inherits it without remembering to. That is the only
 * boundary that reaches historical rows without touching them.
 *
 * The cost of the third choice is the one that took five rounds to see, so it is
 * paid explicitly rather than absorbed. `ExportBar` serialises the events it is
 * handed, and those events have come through here, so `ledger.json` and
 * `bundle.json` were already a partly-normalised reading while /exports called
 * them "the record itself". Measured on the fixture study: the stored ledger
 * held ten rows carrying a banned dash and the exported `ledger.json` held two,
 * because five event types were in the table below and `ontology-mutation` was
 * not. Neither the record nor the reading, and claiming to be the record.
 *
 * So the fix is both halves at once. `ontology-mutation` joins the table, which
 * is what finally gets the character out of `ledger.json`, `bundle.json` and the
 * wiki's `log.md`; and every field this normaliser rewrites is kept verbatim on
 * `asWritten`, so the exported row still states what the model produced. The
 * record survives the reading being enforced on top of it.
 *
 * `asWritten` carries the banned character, and that is the one deliberate
 * exemption to the house rule in this codebase. The rule governs the tool's own
 * prose wherever it is rendered or exported; a provenance field whose entire
 * purpose is to quote what somebody else wrote is evidence, not prose. The
 * precedent is already set and already shipping: `voiceGateProvenance` spreads
 * `rawText` onto gated events and it has reached `ledger.json` unremarked since
 * the gate landed. Naming the exemption is what keeps it from being a hole:
 * `tests/export-voice.test.ts` greps the exports for zero occurrences outside
 * provenance fields, which is a bar a carve-out invented later cannot slip past.
 */

import type { LedgerEvent } from "./events.ts";
import { containsBannedDash, normaliseModelProse } from "../inference/voiceGate.ts";

/**
 * Which fields on which event types were written by a model or by a rule, and
 * are therefore the tool's own voice rather than the researcher's.
 *
 * Keyed by event type so an event type added later is absent by default, which
 * is the safe direction: a missed field shows a dash, a wrong entry rewrites a
 * human being.
 */
const MODEL_AUTHORED: Partial<Record<LedgerEvent["type"], readonly string[]>> = {
  challenge: ["text"],
  adjudication: ["reason"],
  proposal: ["title", "body"],
  "question-selection": ["question", "reason", "alternatives"],
  "lint-finding": ["reason"],
  /* M40. The reading and the sentence saying why there was none are both the
   * tool's own prose, and both render: the reading in the framing and in four
   * exports, the reason under it. Listed for the reason every other entry here
   * is, and `none` alongside `text` because the two are one field in two states
   * and a rule that caught only one would show a dash on the other. */
  "puzzle-reading": ["text", "none"],
  /*
   * The entry whose absence was the whole defect.
   *
   * An earlier pass left it out on the argument that a page the researcher has
   * accepted and had the chance to edit is their own writing. `OntologyView.tsx`
   * measured that argument and it is false here: `op: "create"` for a page is
   * written in exactly three places, all of which draft the body from a model,
   * there is no writer for `op: "revise"` at all, and the second dashed page on
   * the fixture is stamped `author-prior` with a body byte-identical to a
   * drafter proposal in the same ledger. Origin does not record who typed the
   * sentence, so a rule keyed on it rewrites the wrong half of the population.
   * `voicedGraph` reached the four reading exports by voicing the projection;
   * this reaches the two record exports and `log.md`, which read the events.
   *
   * If a path is ever added that creates a page from prose the researcher typed
   * from nothing, this entry is the line to revisit, and `asWritten` is what
   * makes revisiting it cheap: nothing has been lost in the meantime.
   */
  "ontology-mutation": ["title", "body"],
  // M63. A suggested concept is the model's words until the researcher refines them.
  "concept-suggested": ["name", "definition", "properties", "statements"],
};

/** The fields listed above, for a test to read without duplicating the table. */
export function modelAuthoredFields(type: LedgerEvent["type"]): readonly string[] {
  return MODEL_AUTHORED[type] ?? [];
}

function cleanValue(value: unknown): unknown {
  if (typeof value === "string") {
    return containsBannedDash(value) ? normaliseModelProse(value) : value;
  }
  if (Array.isArray(value)) {
    const mapped = value.map(cleanValue);
    return mapped.some((v, i) => v !== value[i]) ? mapped : value;
  }
  return value;
}

/**
 * One event, with its model-authored prose normalised.
 *
 * Returns the same object when nothing changed. Identity matters here: the
 * provider feeds this straight into React state, and a fresh object on every
 * read would invalidate every `useMemo` keyed on the event array on every
 * append.
 */
export function normaliseEventProse(event: LedgerEvent): LedgerEvent {
  const fields = MODEL_AUTHORED[event.type];
  if (fields === undefined) return event;
  const record = event as unknown as Record<string, unknown>;
  let changed = false;
  const patch: Record<string, unknown> = {};
  // What each rewritten field held before the rewrite. Merged onto any bag the
  // row already carries rather than replacing it, so a row that arrived from an
  // export keeps the original it arrived with.
  const asWritten: Record<string, unknown> = { ...(event.asWritten ?? {}) };
  for (const field of fields) {
    if (!(field in record)) continue;
    const next = cleanValue(record[field]);
    if (next !== record[field]) {
      patch[field] = next;
      // First write wins: an already-recorded original is closer to the model
      // than anything an intermediate pass produced.
      asWritten[field] ??= record[field];
      changed = true;
    }
  }
  return changed
    ? ({ ...record, ...patch, asWritten } as unknown as LedgerEvent)
    : event;
}

/** The whole array, same identity when every row was already clean. */
export function normaliseLedgerProse(
  events: readonly LedgerEvent[],
): readonly LedgerEvent[] {
  let changed = false;
  const out = events.map((e) => {
    const next = normaliseEventProse(e);
    if (next !== e) changed = true;
    return next;
  });
  return changed ? out : events;
}

/**
 * The inverse: an exported row put back the way it was stored.
 *
 * A bundle is re-importable, which makes it the one export whose content stops
 * being a reading and becomes somebody's ledger. Importing the normalised body
 * would install the tool's sentence as the thing that happened and leave the
 * model's sentence in a provenance field nothing replays, so a co-author's
 * ledger would differ from the ledger it was exported from. Restoring here is
 * what keeps `importBundle`'s deep-equal round-trip claim true of the record
 * and not merely of the file.
 *
 * Re-exporting the imported project still produces the same file, because the
 * read boundary re-derives the reading deterministically from the restored row.
 */
export function restoreAsWritten(event: LedgerEvent): LedgerEvent {
  const original = event.asWritten;
  if (original === undefined) return event;
  const { asWritten: _dropped, ...rest } = event as unknown as Record<string, unknown> & {
    asWritten?: unknown;
  };
  return { ...rest, ...original } as unknown as LedgerEvent;
}

/** The whole array, same identity when no row carried a provenance bag. */
export function restoreLedgerAsWritten(
  events: readonly LedgerEvent[],
): readonly LedgerEvent[] {
  let changed = false;
  const out = events.map((e) => {
    const next = restoreAsWritten(e);
    if (next !== e) changed = true;
    return next;
  });
  return changed ? out : events;
}
