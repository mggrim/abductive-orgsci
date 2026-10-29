/**
 * Abductive's design challenges as the chat's next question (M78b, ISC-682;
 * the lead's addition, 2026-10-03).
 *
 * The persona engine writes a challenge at a step's save (`flow/biasScan.ts`
 * runs the researcher's matrix over the saved answer), and until M78b nothing
 * read it back into the conversation: on the serendipity walk thirteen
 * challenges were written and none was asked. Here a challenge finds its step,
 * the chat learns which challenge is waiting there, and the turn prompt ranks it:
 * behind an open follow-up on the researcher's last reply, ahead of the step's
 * own question. The model asks it in the chat's voice and marks the turn, and the
 * question-selection event carries the challenge's id as `fromChallenge`.
 *
 * Pure: every function reads the record it is given.
 */

import type { ChallengeEvent, LedgerEvent } from "../ledger/events.ts";
import { resolveStationId, type StationId } from "../flow/stations.ts";

/**
 * Each challenge's step, by challenge id. A challenge carries a matrix cell
 * ("bias:stage") and no step, and two steps can share a stage; the scan that
 * wrote it appends its `bias-scan` row, which names the step, after the
 * challenges of that pass. So a challenge belongs to the step of the first
 * researcher scan at its stage that follows it. A challenge with no such row
 * (a pass that failed before its row) belongs to no step and is not asked.
 */
export function challengeStations(events: readonly LedgerEvent[], projectId: string): ReadonlyMap<string, StationId> {
  const out = new Map<string, StationId>();
  const waiting: { readonly id: string; readonly stage: string }[] = [];
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    if (e.type === "challenge") {
      const stage = (e.matrixCell ?? "").split(":")[1];
      if (stage !== undefined && stage !== "") waiting.push({ id: e.id, stage });
      continue;
    }
    if (e.type !== "bias-scan" || e.reads === "abductive") continue;
    const station = resolveStationId(e.station);
    if (station === undefined) continue;
    for (let i = waiting.length - 1; i >= 0; i -= 1) {
      const w = waiting[i];
      if (w === undefined || w.stage !== e.stage) continue;
      out.set(w.id, station);
      waiting.splice(i, 1);
    }
  }
  return out;
}

/**
 * The first moment at which a challenge is a candidate for the chat's question:
 * the commit time of M78a's merge (main 55affc3, 2026-10-02T23:14:12+02:00).
 * Challenges before this were written from an empty brief (the M77/M78a load
 * race) and are not asked. They stay in History and in Biases watched.
 */
export const CHALLENGE_CANDIDATE_FROM = Date.parse("2026-10-02T23:14:12+02:00");

/** The challenges the chat has already asked, by id. */
function askedChallenges(events: readonly LedgerEvent[], projectId: string): ReadonlySet<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.projectId === projectId && e.type === "question-selection" && e.fromChallenge !== undefined) out.add(e.fromChallenge);
  }
  return out;
}

/**
 * The challenges of the step's latest researcher scan: a challenge about an
 * answer that the researcher has since saved again and Abductive has read again
 * is about an answer that no longer stands, and is not asked.
 */
function latestPass(events: readonly LedgerEvent[], projectId: string, here: StationId): ReadonlySet<string> {
  let pass: string[] = [];
  let pending: string[] = [];
  const at = challengeStations(events, projectId);
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    if (e.type === "challenge" && at.get(e.id) === here) pending.push(e.id);
    if (e.type === "bias-scan" && e.reads !== "abductive" && resolveStationId(e.station) === here) {
      pass = pending;
      pending = [];
    }
  }
  return new Set(pass);
}

/** The oldest challenge of the step's latest scan that the chat hasn't asked, if one waits. */
export function nextChallenge(events: readonly LedgerEvent[], projectId: string, station: string): ChallengeEvent | undefined {
  const asked = askedChallenges(events, projectId);
  const here = resolveStationId(station);
  if (here === undefined) return undefined;
  const current = latestPass(events, projectId, here);
  return events.find(
    (e): e is ChallengeEvent =>
      e.projectId === projectId &&
      e.type === "challenge" &&
      e.ts >= CHALLENGE_CANDIDATE_FROM &&
      current.has(e.id) &&
      !asked.has(e.id) &&
      e.text.trim() !== "",
  );
}

/**
 * Whether the researcher's last reply at this step is newer than Abductive's last
 * question there, so the turn owes it a follow-up first.
 */
export function followUpOpen(events: readonly LedgerEvent[], projectId: string, station: string): boolean {
  const placeOf = new Map<string, string>();
  let lastAsked = -1;
  let lastReply = -1;
  events.forEach((e, i) => {
    if (e.projectId !== projectId) return;
    if (e.type === "question-selection") {
      if (e.station !== undefined) placeOf.set(e.id, e.station);
      if (e.station === station) lastAsked = i;
      return;
    }
    if (e.type !== "response" || e.actor !== "human") return;
    const at = e.station ?? (e.inReplyTo === undefined ? undefined : placeOf.get(e.inReplyTo));
    if (at === station) lastReply = i;
  });
  return lastReply > lastAsked;
}

/** The marked line a turn writes when it asked the challenge. */
export const CHALLENGE_MARK = "CHALLENGE: yes";

/** The prompt's lines for a waiting challenge, ranked against the follow-up. */
export function challengeBlock(challenge: Pick<ChallengeEvent, "text">, followUp: boolean): readonly string[] {
  return [
    "",
    "## A question that Abductive raised about this step's design",
    challenge.text.trim(),
    followUp
      ? "- Their last reply comes first. If it leaves something open, follow it up and leave this question for a later turn. If it settles its point, ask about this question instead, ahead of the step's own question."
      : "- Ask about this question now, ahead of the step's own question.",
    "- Ask it in your own words, as one question about their setting, and keep your register. Do not say that someone else raised it.",
    `- When your question is about it, write a third marked line after BECAUSE, exactly: ${CHALLENGE_MARK}`,
  ];
}
