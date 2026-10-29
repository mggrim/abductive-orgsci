/**
 * What moved while you were away (M38, ISC-498).
 *
 * The interface research found that a suspended thread out of sight takes
 * measurably longer to return to (Iqbal and Horvitz, CHI 2007), and this tool
 * suspends seven of its eight conversations by construction. The rail says
 * where the work is; this says what happened to it since you last had the
 * study open in this browser.
 *
 * Three rules hold it to being a digest rather than a summary:
 *
 *  - **Counts and ids, never prose.** Nothing here reads the text of an event.
 *    A panel drawn from this can say that two answers were saved and where to
 *    look; it cannot say what they meant, which would be the tool telling the
 *    researcher what they wrote.
 *  - **The visit is the viewer's, so it is not on the record.** The moment
 *    lives in this browser's `localStorage` and nowhere else. A study is the
 *    study's, not the reader's, and appending a visit event would make every
 *    co-author's browsing part of the study's own history.
 *  - **A missing moment is a first visit, not a zero.** Reading a browser
 *    store can fail in more ways than it can succeed: private windows, cleared
 *    site data, a browser told to block it. Every one of those reads as never
 *    having been here, which is honest, rather than as nothing having moved,
 *    which is a claim the tool has not earned.
 */

import type { LedgerEvent } from "../ledger/events.ts";
import { FRAMING_PLACE_ID, isPlaceId, placeSubjects, type PlaceId } from "./placeSummary.ts";

/** The kind of thing this browser can say about the study it is opening. */
export const FIRST_VISIT = "first-visit";
export const SINCE = "since";

/** A count with the events behind it, so a caller can say how it was reached. */
export interface MovedRow {
  readonly count: number;
  readonly ids: readonly string[];
}

export interface SinceLastVisitView {
  readonly kind: typeof FIRST_VISIT | typeof SINCE;
  /** Answers put on the record, at a step or at the framing. */
  readonly answersSaved: MovedRow;
  /** Drafts that joined your model, whether taken whole or merged into a claim. */
  readonly draftsAccepted: MovedRow;
  /** Drafts turned down. A deferred draft is neither, and is in neither row. */
  readonly draftsDeclined: MovedRow;
  /* M89 (2026-10-14): `findingsRaised` and `findingsSettled`, the flags raised
   * and settled since the last visit, went with the checks. History keeps the
   * events. */
  /**
   * Papers that were judged, counted once each (D16, M43b).
   *
   * A `paper-fit` event per re-judgement, and the judge re-runs whenever the
   * framing digest moves, so the walk's strip read "Papers judged 30" over a
   * study holding six papers. What a returning reader wants to know is how many
   * of their papers carry a verdict they have not seen, so the count is papers
   * and the ids are the last verdict written for each of them.
   */
  readonly paperVerdicts: MovedRow;
  readonly questionsAsked: MovedRow;
  readonly questionsAnswered: MovedRow;
  /** Everything above, added up. Zero means the study stood still. */
  readonly total: number;
  /** Where the last question in this window was asked, for the row's link. */
  readonly lastQuestionPlace: PlaceId | null;
  /** Where the last answer in this window was saved, for the row's link. */
  readonly lastAnswerPlace: PlaceId | null;
}

export interface SinceLastVisitInput {
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
  /** When this browser last had the study open, or null for a first visit. */
  readonly since: number | null;
}

const EMPTY: MovedRow = { count: 0, ids: [] };

function row(ids: readonly string[]): MovedRow {
  return { count: ids.length, ids };
}

/** The place a `bound` subject belongs to. The framing owns one of them (M40). */
function placeOfSubject(subject: string): PlaceId | null {
  if (placeSubjects(FRAMING_PLACE_ID).includes(subject)) return FRAMING_PLACE_ID;
  return isPlaceId(subject) ? subject : null;
}

export function sinceLastVisit(input: SinceLastVisitInput): SinceLastVisitView {
  const { projectId, since } = input;
  if (since === null) {
    return {
      kind: FIRST_VISIT,
      answersSaved: EMPTY,
      draftsAccepted: EMPTY,
      draftsDeclined: EMPTY,
      paperVerdicts: EMPTY,
      questionsAsked: EMPTY,
      questionsAnswered: EMPTY,
      total: 0,
      lastQuestionPlace: null,
      lastAnswerPlace: null,
    };
  }

  const events = input.events.filter((e) => e.projectId === projectId && e.ts > since);

  const answers: string[] = [];
  const accepted: string[] = [];
  const declined: string[] = [];
  /* Keyed by paper, last verdict wins, insertion order kept: a Map is what makes
   * "one entry per paper" and "the event that says so" the same structure (D16). */
  const verdicts = new Map<string, string>();
  const asked: string[] = [];
  const answeredIds: string[] = [];
  let lastQuestionPlace: PlaceId | null = null;
  let lastAnswerPlace: PlaceId | null = null;

  for (const e of events) {
    switch (e.type) {
      case "bound":
        answers.push(e.id);
        lastAnswerPlace = placeOfSubject(e.subject) ?? lastAnswerPlace;
        break;
      case "proposal-adjudication":
        // Accept and merge both put something in your model; reject takes it
        // out of the tray. Defer is a decision to decide later, so it is in
        // neither row rather than quietly counted as one of them.
        if (e.disposition === "accept" || e.disposition === "merge") accepted.push(e.id);
        else if (e.disposition === "reject") declined.push(e.id);
        break;
      case "paper-fit":
        verdicts.set(e.paperKey, e.id);
        break;
      case "question-selection":
        asked.push(e.id);
        if (e.station !== undefined && isPlaceId(e.station)) lastQuestionPlace = e.station;
        break;
      case "response":
        // A reply of the researcher's to a question the tool put. The tool's
        // own turns are not answers and are counted nowhere here: what the
        // digest is for is what the researcher will find changed, and a model
        // turn they have not read yet is reported as the question that
        // prompted it.
        if (e.actor === "human" && e.inReplyTo !== undefined) answeredIds.push(e.id);
        break;
      default:
        break;
    }
  }

  const judged = [...verdicts.values()];
  const rows = [answers, accepted, declined, judged, asked, answeredIds];
  return {
    kind: SINCE,
    answersSaved: row(answers),
    draftsAccepted: row(accepted),
    draftsDeclined: row(declined),
    paperVerdicts: row(judged),
    questionsAsked: row(asked),
    questionsAnswered: row(answeredIds),
    total: rows.reduce((sum, r) => sum + r.length, 0),
    lastQuestionPlace,
    lastAnswerPlace,
  };
}

/* ── The moment, which belongs to the browser and not to the study ───────── */

export function lastSeenKey(projectId: string): string {
  return `abductive:lastSeen:${projectId}`;
}

/**
 * When this browser last had the study open, or null.
 *
 * Every failure is null. A store that throws, a key that was never written and
 * a value that is not a number all mean the same thing to the reader, which is
 * that this browser cannot tell them what they missed.
 */
export function readLastSeen(projectId: string): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(lastSeenKey(projectId));
    if (raw === null || raw === undefined) return null;
    const at = Number(raw);
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

/** Nothing goes to the record. The moment is this browser's alone. */
export function writeLastSeen(projectId: string, at: number): void {
  try {
    globalThis.localStorage?.setItem(lastSeenKey(projectId), String(at));
  } catch {
    /* A browser that will not store this is a browser that gets a first visit
     * every time, which is the honest degradation. Nothing else depends on it. */
  }
}
