/**
 * The researcher's decisions on Abductive's drafts (M93, ISC-762, ISC-763,
 * ISC-767).
 *
 * The Organization Science proposal states that History shows which partner
 * proposed, changed or dropped each expectation and puzzle, and that
 * over-reliance is measured from what the researcher accepts. Both fail while
 * model text enters the project with no decision. So a puzzle reading and "The
 * argument so far" are suggestions until the researcher accepts them, as
 * written or in their own words, and a rejected or cancelled draft leaves a
 * `draft-declined` event behind.
 *
 * Every builder here is pure: events in, events out.
 */

import type {
  ArgumentAcceptedEvent,
  DraftDeclinedEvent,
  LedgerEvent,
  PuzzleReadingEvent,
  ReadingAcceptedEvent,
} from "../ledger/events.ts";
import type { ProjectOntologyView } from "./projection.ts";

interface Clock {
  readonly now?: () => number;
  readonly makeId?: () => string;
}

function envelope(projectId: string, clock?: Clock) {
  return {
    id: (clock?.makeId ?? (() => crypto.randomUUID()))(),
    ts: (clock?.now ?? (() => Date.now()))(),
    actor: "human" as const,
    projectId,
  };
}

/**
 * Whether the researcher changed a draft before keeping it (ISC-767): the two
 * texts compared with their spacing evened out, so a reflowed line is the
 * draft and a changed word is an edit.
 */
export function editedFrom(draft: string, kept: string): boolean {
  const flat = (t: string) => t.replace(/\s+/g, " ").trim();
  return flat(draft) !== flat(kept);
}

/** A draft the researcher cancelled, replaced or rejected (ISC-767). */
export function declineDraftEvent(
  input: { readonly projectId: string; readonly draftId: string; readonly kind: DraftDeclinedEvent["kind"]; readonly reason?: string },
  clock?: Clock,
): DraftDeclinedEvent {
  const reason = input.reason?.trim() ?? "";
  return {
    ...envelope(input.projectId, clock),
    type: "draft-declined",
    draftId: input.draftId,
    kind: input.kind,
    ...(reason === "" ? {} : { reason }),
  };
}

// ── The puzzle reading (ISC-763) ────────────────────────────────────────────

/**
 * Where the researcher stands on one puzzle reading. "legacy" is a reading from
 * before M93, mirrored into the research question when it was written, which
 * keeps that effect.
 */
export type ReadingDecision =
  | { readonly kind: "legacy" }
  | { readonly kind: "pending" }
  | { readonly kind: "accepted"; readonly text: string; readonly edited: boolean }
  | { readonly kind: "rejected"; readonly reason?: string };

export function readingDecision(events: readonly LedgerEvent[], projectId: string, reading: PuzzleReadingEvent): ReadingDecision {
  let out: ReadingDecision = reading.awaitsDecision === true ? { kind: "pending" } : { kind: "legacy" };
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    if (e.type === "reading-accepted" && e.readingId === reading.id) out = { kind: "accepted", text: e.text, edited: e.edited };
    if (e.type === "draft-declined" && e.kind === "puzzle-reading" && e.draftId === reading.id) {
      out = { kind: "rejected", ...(e.reason === undefined ? {} : { reason: e.reason }) };
    }
  }
  return out;
}

/**
 * Whether a reading repeats one the researcher rejected, word for word: a
 * rejected reading is not offered again unchanged, so a later reading with the
 * same text reads as rejected too.
 */
export function rejectedBefore(events: readonly LedgerEvent[], projectId: string, reading: PuzzleReadingEvent): boolean {
  const rejected = new Set<string>();
  for (const e of events) {
    if (e.projectId === projectId && e.type === "draft-declined" && e.kind === "puzzle-reading") rejected.add(e.draftId);
  }
  const flat = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  for (const e of events) {
    if (e.projectId !== projectId || e.type !== "puzzle-reading" || e.id === reading.id || !rejected.has(e.id)) continue;
    if (flat(e.text) !== "" && flat(e.text) === flat(reading.text)) return true;
  }
  return false;
}

/** The researcher accepts a reading, as written or in their words, as the research question. */
export function acceptReadingEvent(
  input: { readonly projectId: string; readonly reading: PuzzleReadingEvent; readonly text?: string },
  clock?: Clock,
): ReadingAcceptedEvent {
  const text = (input.text ?? input.reading.text).trim();
  if (text === "") throw new Error("Write the puzzle first.");
  return {
    ...envelope(input.projectId, clock),
    type: "reading-accepted",
    readingId: input.reading.id,
    text,
    edited: editedFrom(input.reading.text, text),
  };
}

// ── The argument so far (ISC-762) ───────────────────────────────────────────

/** The researcher accepts "The argument so far", as written or in their words. */
export function acceptArgumentEvent(
  input: { readonly projectId: string; readonly view: ProjectOntologyView; readonly text?: string },
  clock?: Clock,
): ArgumentAcceptedEvent {
  const argument = input.view.argument;
  if (argument === null) throw new Error("Abductive hasn't written the argument so far yet.");
  const text = (input.text ?? argument.text).trim();
  if (text === "") throw new Error("Write the argument first.");
  return {
    ...envelope(input.projectId, clock),
    type: "argument-accepted",
    argumentId: argument.id,
    text,
    edited: editedFrom(argument.text, text),
  };
}

/** The researcher rejects "The argument so far", with an optional reason. */
export function rejectArgumentEvent(
  input: { readonly projectId: string; readonly view: ProjectOntologyView; readonly reason?: string },
  clock?: Clock,
): DraftDeclinedEvent {
  const argument = input.view.argument;
  if (argument === null) throw new Error("Abductive hasn't written the argument so far yet.");
  return declineDraftEvent({ projectId: input.projectId, draftId: argument.id, kind: "argument", ...(input.reason === undefined ? {} : { reason: input.reason }) }, clock);
}
