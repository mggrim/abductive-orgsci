/**
 * Adjudication helpers — pure functions over LedgerEvent[] (ISC-16, ISC-44).
 *
 * Adjudication is NON-BLOCKING: challenges render as cards and queue entries,
 * never modals. When a challenge sits unadjudicated while the loop moves on,
 * `autoIgnore` converts the silence into an explicit, auditable `ignored`
 * verdict (actor 'system') so waved-past dissent is visible in the ledger.
 * Staleness uses the same events-since measure as the matrix
 * `unadjudicated-challenges` signal (matrix/signals.ts).
 */

import type { AdjudicationEvent, ChallengeEvent, LedgerEvent } from "../ledger/events.ts";

export interface OpenChallenge {
  readonly challenge: ChallengeEvent;
  /** Ledger events appended after this challenge (staleness measure). */
  readonly eventsSince: number;
}

/** Challenges with no adjudication event referencing them, oldest first. */
export function openChallenges(events: readonly LedgerEvent[]): OpenChallenge[] {
  const adjudicated = new Set(
    events
      .filter((e): e is AdjudicationEvent => e.type === "adjudication")
      .map((e) => e.challengeId),
  );

  const open: OpenChallenge[] = [];
  events.forEach((event, i) => {
    if (event.type !== "challenge") return;
    if (adjudicated.has(event.id)) return;
    open.push({ challenge: event, eventsSince: events.length - 1 - i });
  });
  return open;
}

export interface AutoIgnoreOptions {
  /** A challenge is stale after this many subsequent ledger events (default 10). */
  readonly afterEvents?: number;
  readonly now?: () => number;
  readonly makeId?: () => string;
}

/**
 * Produce `adjudication` events with verdict 'ignored' (actor 'system') for
 * every open challenge that has sat through ≥ afterEvents subsequent events
 * (ISC-16). Pure: returns the events; the caller appends them to the ledger.
 */
export function autoIgnore(
  events: readonly LedgerEvent[],
  options: AutoIgnoreOptions = {},
): AdjudicationEvent[] {
  const afterEvents = options.afterEvents ?? 10;
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());

  return openChallenges(events)
    .filter((open) => open.eventsSince >= afterEvents)
    .map((open) => ({
      id: makeId(),
      ts: now(),
      actor: "system" as const,
      projectId: open.challenge.projectId,
      type: "adjudication" as const,
      verdict: "ignored" as const,
      challengeId: open.challenge.id,
      reason: `auto-logged: challenge sat unadjudicated for ${open.eventsSince} subsequent ledger events (threshold ${afterEvents})`,
    }));
}
