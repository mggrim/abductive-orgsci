/**
 * The chat at one step, as Surface concepts and relationships reads it (M93,
 * ISC-755 to ISC-758).
 *
 * The owner, 2026-10-16: "at each station, it feels like there needs to be a
 * step at the end after the chat has progressed, where the user can click a
 * button that says surface concepts and relationships, which then the model
 * surfaces from the chat, and then the user can accept or reject those emerging
 * insights." Asked whether the pass reads only the researcher's turns or both
 * sides, he said "both". So every suggestion from the chat names the turns it
 * draws on, and whose words those are is read here, off the actors on the
 * record. The model never says whose words a suggestion came from: a concept
 * drawn from Abductive's own turns is the model's prior coming back, and a
 * model asked to report that would be the one party with a reason to get it
 * wrong.
 *
 * Pure: events in, turns and origins out.
 */

import type { ConceptSource, LedgerEvent } from "../ledger/events.ts";
import { FRAMING_SUBJECT } from "../flow/stationBrief.ts";
import type { ChatOrigin } from "./vocabulary.ts";

/** One turn of a step's chat, or a saved summary read beside it. */
export interface ChatTurn {
  /** The event id: a `response`, an undelivered `question-selection`, or a summary's `bound`. */
  readonly id: string;
  readonly who: "researcher" | "abductive";
  readonly text: string;
  readonly kind: "turn" | "summary";
}

/** The place Starting point's chat is held under. */
export const FRAMING_CHAT = "framing";

/**
 * Both sides of the chat at a place, in the order said (ISC-756).
 *
 * A turn knows its place the way the transcript reads it: a delivery takes the
 * question's place, a turn that replies to nothing carries its own, and a reply
 * takes its question's. Abductive's delivery of a question is one turn, its
 * lead-in and the question together, because that is what the researcher read;
 * a question the model never delivered is a turn of its own.
 */
export function chatTurnsAt(events: readonly LedgerEvent[], projectId: string, place: string): readonly ChatTurn[] {
  const delivered = new Map<string, string>();
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    if (e.type === "response" && e.actor !== "human" && e.inReplyTo !== undefined && !delivered.has(e.inReplyTo)) {
      delivered.set(e.inReplyTo, e.id);
    }
  }
  const questionOf = new Map<string, { readonly station?: string; readonly question: string }>();
  const deliveryOf = new Map<string, string>();
  for (const [questionId, responseId] of delivered) deliveryOf.set(responseId, questionId);
  const out: ChatTurn[] = [];
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    if (e.type === "question-selection") {
      questionOf.set(e.id, { ...(e.station === undefined ? {} : { station: e.station }), question: e.question });
      if (delivered.has(e.id)) continue;
      if (e.station === place && e.question.trim() !== "") out.push({ id: e.id, who: "abductive", text: e.question.trim(), kind: "turn" });
      continue;
    }
    if (e.type !== "response") continue;
    const deliveredQuestion = deliveryOf.get(e.id);
    const asked = deliveredQuestion === undefined ? undefined : questionOf.get(deliveredQuestion);
    const at =
      asked?.station ??
      e.station ??
      (e.inReplyTo === undefined ? undefined : questionOf.get(e.inReplyTo)?.station);
    if (at !== place) continue;
    const said = [e.text.trim(), asked === undefined || e.text.includes(asked.question) ? "" : asked.question.trim()]
      .filter((t) => t !== "")
      .join(" ");
    if (said === "") continue;
    out.push({ id: e.id, who: e.actor === "human" ? "researcher" : "abductive", text: said, kind: "turn" });
  }
  return out;
}

/** The subjects a place's summaries are saved under: the step's own, or Starting point's three. */
export function summarySubjects(place: string): readonly string[] {
  return place === FRAMING_CHAT ? Object.values(FRAMING_SUBJECT) : [place];
}

/**
 * The saved summary at a place, as the pass reads it beside the chat: the
 * latest `bound` under each of the place's subjects. A summary is the
 * researcher's own save, so it counts as their words.
 */
export function savedSummariesAt(events: readonly LedgerEvent[], projectId: string, place: string): readonly ChatTurn[] {
  const subjects = new Set(summarySubjects(place));
  const latest = new Map<string, ChatTurn>();
  for (const e of events) {
    if (e.projectId !== projectId || e.type !== "bound" || !subjects.has(e.subject)) continue;
    const text = e.statement.trim();
    if (text === "" || text === "[...]") latest.delete(e.subject);
    else latest.set(e.subject, { id: e.id, who: "researcher", text, kind: "summary" });
  }
  return [...latest.values()];
}

/** Every turn id an earlier surfacing at this place read. */
function surfacedAt(events: readonly LedgerEvent[], projectId: string, place: string): ReadonlySet<string> {
  const read = new Set<string>();
  for (const e of events) {
    if (e.projectId === projectId && e.type === "surfacing" && e.station === place) for (const id of e.turnIds) read.add(id);
  }
  return read;
}

/** The turns at a place that no earlier surfacing there has read (ISC-756), both sides. */
export function unsurfacedTurns(events: readonly LedgerEvent[], projectId: string, place: string): readonly ChatTurn[] {
  const read = surfacedAt(events, projectId, place);
  return chatTurnsAt(events, projectId, place).filter((t) => !read.has(t.id));
}

/**
 * Whether Surface concepts and relationships is open at a place (ISC-755): the
 * chat holds a turn of the researcher's that no earlier surfacing there has read.
 */
export function surfaceReady(events: readonly LedgerEvent[], projectId: string, place: string): boolean {
  return unsurfacedTurns(events, projectId, place).some((t) => t.who === "researcher");
}

/**
 * Who said each turn a suggestion can cite, by event id: the researcher for
 * their own replies and their saved answers, Abductive for its turns and its
 * questions. Read off the actor on the record and nothing else.
 */
export function speakers(events: readonly LedgerEvent[]): ReadonlyMap<string, ChatTurn["who"]> {
  const out = new Map<string, ChatTurn["who"]>();
  for (const e of events) {
    if (e.type === "response") out.set(e.id, e.actor === "human" ? "researcher" : "abductive");
    else if (e.type === "question-selection") out.set(e.id, "abductive");
    else if (e.type === "bound") out.set(e.id, e.actor === "human" ? "researcher" : "abductive");
  }
  return out;
}

/**
 * Whose words a set of turns is (ISC-757): the researcher's, Abductive's or
 * both. Null when a turn is not on the record, or when there are none, which is
 * the case that drops a suggestion.
 */
export function originOf(drawnFrom: readonly string[], who: ReadonlyMap<string, ChatTurn["who"]>): ChatOrigin | null {
  if (drawnFrom.length === 0) return null;
  let researcher = false;
  let abductive = false;
  for (const id of drawnFrom) {
    const said = who.get(id);
    if (said === undefined) return null;
    if (said === "researcher") researcher = true;
    else abductive = true;
  }
  return researcher && abductive ? "both" : researcher ? "researcher" : "abductive";
}

/**
 * Whose words a suggestion is, for a suggestion from the chat, worked out from
 * the turns it names; null for any other source.
 */
export function suggestionOrigin(
  suggestion: { readonly source: ConceptSource; readonly drawnFrom?: readonly string[] },
  who: ReadonlyMap<string, ChatTurn["who"]>,
): ChatOrigin | null {
  if (suggestion.source.kind !== "chat") return null;
  return originOf(suggestion.drawnFrom ?? [], who);
}

/** The surfacings at a place, oldest first, with how many suggestions each one brought (ISC-760). */
export function surfacingsAt(
  events: readonly LedgerEvent[],
  projectId: string,
  place: string,
): readonly { readonly id: string; readonly ts: number; readonly suggestions: number }[] {
  const counts = new Map<string, number>();
  const order: { id: string; ts: number }[] = [];
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    if (e.type === "surfacing" && e.station === place) {
      order.push({ id: e.id, ts: e.ts });
      counts.set(e.id, 0);
    }
    if (e.type === "concept-suggested" || e.type === "relation-suggested" || e.type === "statement-suggested") {
      const id = e.source.kind === "chat" ? e.source.surfacingId : undefined;
      if (id !== undefined && counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return order.map((s) => ({ ...s, suggestions: counts.get(s.id) ?? 0 }));
}
