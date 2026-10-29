/**
 * v1 ledger signals — pure predicates over the event array (ISC-9).
 *
 * No signal holds state; each one is a function of the full `LedgerEvent[]`
 * plus explicit, configurable thresholds. The matrix engine uses the
 * `SIGNALS` table to evaluate signal-triggered cells and to compute the
 * "fired because…" reason string recorded with each flag (ISC-11).
 */

import type { LedgerEvent } from "../ledger/events.ts";
import type { SignalId } from "./schema.ts";

export interface SignalResult {
  readonly fired: boolean;
  /** Human-readable explanation, valid whether or not the signal fired. */
  readonly reason: string;
  /**
   * Fingerprint of the condition that fired, when the signal can name one.
   *
   * A signal describes an ongoing state, so left alone it re-fires on every
   * evaluation — which is how v1's live run produced a wall of duplicate
   * flags. When a signal supplies a `stateKey`, the engine dedupes on it, so
   * the cell speaks once per distinct condition and again only when the
   * condition genuinely changes. Signals that omit it keep v1's behaviour.
   */
  readonly stateKey?: string;
}

export interface AcceptanceStreakOptions {
  /** Number of consecutive `accept` verdicts that constitutes a streak. */
  readonly streak?: number;
}

/**
 * Acceptance streak: the human has accepted the last N persona challenges in
 * a row without a single revise/reject/defer — the loop may be rubber-stamping.
 * Default N = 5 consecutive accepts.
 */
export function acceptanceStreak(
  events: readonly LedgerEvent[],
  options: AcceptanceStreakOptions = {},
): SignalResult {
  const streak = options.streak ?? 5;
  const verdicts = events
    .filter((e) => e.type === "adjudication")
    .map((e) => e.verdict);

  let run = 0;
  for (let i = verdicts.length - 1; i >= 0 && verdicts[i] === "accept"; i--) {
    run += 1;
  }

  const fired = run >= streak;
  return {
    fired,
    reason: fired
      ? `fired because the last ${run} adjudications were all 'accept' (threshold ${streak}). You have not revised, rejected or deferred any challenge`
      : `not fired: current accept run is ${run} of ${streak} required`,
  };
}

export interface UnadjudicatedOptions {
  /**
   * A challenge counts as stale once this many subsequent events have been
   * appended without any adjudication referencing it.
   */
  readonly staleAfterEvents?: number;
  /** Minimum number of stale challenges required for the signal to fire. */
  readonly minCount?: number;
}

/**
 * Count challenges that remain unadjudicated after `staleAfterEvents`
 * subsequent ledger events (default 10). Exported both as a raw count and as
 * a firing predicate (fires when count ≥ minCount, default 1).
 */
export function unadjudicatedCount(
  events: readonly LedgerEvent[],
  options: UnadjudicatedOptions = {},
): number {
  const staleAfter = options.staleAfterEvents ?? 10;
  const adjudicated = new Set(
    events.filter((e) => e.type === "adjudication").map((e) => e.challengeId),
  );

  let count = 0;
  events.forEach((event, i) => {
    if (event.type !== "challenge") return;
    if (adjudicated.has(event.id)) return;
    const eventsSince = events.length - 1 - i;
    if (eventsSince >= staleAfter) count += 1;
  });
  return count;
}

export function unadjudicatedChallenges(
  events: readonly LedgerEvent[],
  options: UnadjudicatedOptions = {},
): SignalResult {
  const staleAfter = options.staleAfterEvents ?? 10;
  const minCount = options.minCount ?? 1;
  const count = unadjudicatedCount(events, options);
  const fired = count >= minCount;
  return {
    fired,
    reason: fired
      ? `fired because ${count} challenge${count === 1 ? " has" : "s have"} sat unadjudicated for ${staleAfter}+ subsequent events. You are waving dissent past instead of answering it`
      : `not fired: ${count} stale unadjudicated challenges (threshold ${minCount})`,
  };
}

export interface CoverageStagnationOptions {
  /** Trailing window of events to inspect for new retrieval chunk ids. */
  readonly windowEvents?: number;
}

/**
 * Coverage stagnation: within the last `windowEvents` events (default 20),
 * no `attention:retrieval` event introduced a chunk id that had not already
 * been retrieved before the window — the loop is re-reading the same
 * material rather than expanding coverage. Requires at least a full window
 * of events before it can fire.
 */
export function coverageStagnation(
  events: readonly LedgerEvent[],
  options: CoverageStagnationOptions = {},
): SignalResult {
  const window = options.windowEvents ?? 20;
  if (events.length < window) {
    return {
      fired: false,
      reason: `not fired: only ${events.length} events, need a full window of ${window}`,
    };
  }

  const boundary = events.length - window;
  const seenBefore = new Set<string>();
  for (let i = 0; i < boundary; i++) {
    const e = events[i];
    if (e !== undefined && e.type === "attention" && e.layer === "retrieval") {
      seenBefore.add(e.chunkId);
    }
  }

  const newChunks: string[] = [];
  for (let i = boundary; i < events.length; i++) {
    const e = events[i];
    if (e !== undefined && e.type === "attention" && e.layer === "retrieval") {
      if (!seenBefore.has(e.chunkId) && !newChunks.includes(e.chunkId)) {
        newChunks.push(e.chunkId);
      }
    }
  }

  const fired = newChunks.length === 0;
  return {
    fired,
    reason: fired
      ? `fired because the last ${window} events brought only chunks that the loop had covered before. Attention is circling ${seenBefore.size} already-covered chunk${seenBefore.size === 1 ? "" : "s"}`
      : `not fired: ${newChunks.length} new chunk${newChunks.length === 1 ? "" : "s"} retrieved within the last ${window} events`,
  };
}

// ---------------------------------------------------------------------------
// v2 interview signals (ISC-49, ISC-50)
// ---------------------------------------------------------------------------

/**
 * Markers of an answer that is doing its own hedging. Their presence breaks a
 * confidence streak; their absence is what the streak counts.
 *
 * Note what is NOT here: "I don't know" arrives as a `refusal` event, not a
 * response, and refusals are handled separately and carry no penalty (ISC-48).
 */
const HEDGE_MARKERS: readonly RegExp[] = [
  /\bnot sure\b/i,
  /\bunsure\b/i,
  /\bmaybe\b/i,
  /\bperhaps\b/i,
  /\bpossibly\b/i,
  /\bi think\b/i,
  /\bi suspect\b/i,
  /\bunclear\b/i,
  /\bhard to say\b/i,
  /\bi'?d guess\b/i,
  /\bcould be\b/i,
  /\bdon'?t know\b/i,
  /\bit depends\b/i,
  /\bprovisional/i,
  /* M78a, ISC-679: the walk's student hedged with "may" and "can't yet tell",
     and the streak counted both answers as unhedged. Lower-case "may" only, so
     the month of May is not a hedge. */
  /(?<![\w-])may\s+(?:be|have|not|well|also|just|only|\w+(?:s|ed|ing)?)\b/,
  /\bmight\b/i,
  /\bcan(?:'|\u2019)?t yet\b|\bcannot yet\b/i,
  /\bcan(?:'|\u2019)?t tell\b|\bcannot tell\b/i,
  /\bi wonder\b/i,
];

export function isHedged(text: string): boolean {
  return HEDGE_MARKERS.some((re) => re.test(text));
}

export interface ConfidentAnswerStreakOptions {
  /** Consecutive unhedged answers that constitute a streak. Default 4. */
  readonly streak?: number;
}

/**
 * Confident-answer streak: the researcher has answered the last N interview
 * questions without a single hedge, qualification, or "I don't know".
 *
 * Read as suspicion, not engagement. Design interviews are supposed to reach
 * things the researcher has not settled; a run of fluent answers usually means
 * the questions have stopped reaching them, or that fluency is standing in for
 * a mechanism the researcher has not actually got. That is `intuition-as-theory`
 * showing up in the transcript rather than in the graph.
 */
export function confidentAnswerStreak(
  events: readonly LedgerEvent[],
  options: ConfidentAnswerStreakOptions = {},
): SignalResult {
  const streak = options.streak ?? 4;
  const questionIds = new Set(
    events.filter((e) => e.type === "question-selection").map((e) => e.id),
  );

  // Walk backwards over answers and refusals together: a refusal in the run
  // breaks it, because declining to answer is the opposite of the pattern.
  let run = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e === undefined) continue;
    if (e.type === "refusal" || e.type === "dont-know") break;
    if (e.type !== "response") continue;
    if (e.actor !== "human") continue;
    if (e.inReplyTo === undefined || !questionIds.has(e.inReplyTo)) continue;
    if (isHedged(e.text)) break;
    run += 1;
  }

  const fired = run >= streak;
  return {
    fired,
    reason: fired
      ? `fired because the last ${run} interview answers came without a hedge, qualification, or 'I don't know' (threshold ${streak}). Fluency this uniform usually means the questions have stopped reaching anything unsettled`
      : `not fired: current unhedged answer run is ${run} of ${streak} required`,
    ...(fired ? { stateKey: `confident-run:${run}` } : {}),
  };
}

export interface RefusalStreakOptions {
  /** Refusals on one topic before the pattern is surfaced. Default 3. */
  readonly streak?: number;
}

/**
 * Refusal streak: one topic has been declined `streak` times.
 *
 * This is not a reprimand. Refusal is a legitimate and unpenalised response,
 * and the tool's obligation on reaching this threshold is to stop pressing —
 * the orchestrator drops the topic from move generation. The signal exists so
 * that the avoidance itself is visible in the record, because a topic the
 * researcher will not go near is usually the interesting one.
 */
export function refusalStreak(
  events: readonly LedgerEvent[],
  options: RefusalStreakOptions = {},
): SignalResult {
  const streak = options.streak ?? 3;
  const topics = new Map<string, string>();
  for (const e of events) {
    if (e.type === "question-selection") topics.set(e.id, e.topic);
  }

  const counts = new Map<string, number>();
  for (const e of events) {
    /* M74b: "I don't know" has its own event now, and counts as it did. */
    if (e.type !== "refusal" && e.type !== "dont-know") continue;
    const topic = topics.get(e.questionEventId);
    if (topic === undefined) continue;
    counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }

  let worstTopic: string | null = null;
  let worstCount = 0;
  for (const [topic, count] of counts) {
    if (count > worstCount) {
      worstTopic = topic;
      worstCount = count;
    }
  }

  const fired = worstCount >= streak;
  return {
    fired,
    reason: fired
      ? `fired because you have declined topic '${worstTopic}' ${worstCount} times (threshold ${streak}). Abductive has stopped raising it, and History now records the avoidance`
      : `not fired: heaviest refusal count is ${worstCount} on ${worstTopic ?? "no topic"} (threshold ${streak})`,
    ...(fired ? { stateKey: `refusal:${worstTopic}:${worstCount}` } : {}),
  };
}

/** Per-signal threshold overrides, all optional. */
export interface SignalConfig {
  readonly acceptanceStreak?: AcceptanceStreakOptions;
  readonly unadjudicated?: UnadjudicatedOptions;
  readonly coverage?: CoverageStagnationOptions;
  readonly confidentAnswerStreak?: ConfidentAnswerStreakOptions;
  readonly refusalStreak?: RefusalStreakOptions;
}

export type SignalEvaluator = (
  events: readonly LedgerEvent[],
  config?: SignalConfig,
) => SignalResult;

/** Registry mapping SignalId → evaluator, used by the matrix engine. */
export const SIGNALS: Readonly<Record<SignalId, SignalEvaluator>> = {
  "acceptance-streak": (events, config) => acceptanceStreak(events, config?.acceptanceStreak),
  "unadjudicated-challenges": (events, config) =>
    unadjudicatedChallenges(events, config?.unadjudicated),
  "coverage-stagnation": (events, config) => coverageStagnation(events, config?.coverage),
  "confident-answer-streak": (events, config) =>
    confidentAnswerStreak(events, config?.confidentAnswerStreak),
  "refusal-streak": (events, config) => refusalStreak(events, config?.refusalStreak),
};
