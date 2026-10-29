/** Shared test factories for synthetic ledger streams. */

import type {
  Actor,
  AdjudicationEvent,
  AttentionEvent,
  AttentionLayer,
  BoundEvent,
  ChallengeEvent,
  LedgerEvent,
  ResponseEvent,
  Verdict,
} from "../src/ledger/events.ts";

let clock = 1_700_000_000_000;

export function envelope(actor: Actor = "human") {
  clock += 1000;
  const base = {
    id: crypto.randomUUID(),
    ts: clock,
    actor,
    projectId: "proj-test",
  };
  return actor.startsWith("persona:")
    ? { ...base, model: "claude", modelVersion: "test-1.0" }
    : base;
}

export function bound(subject = "site", statement = "Single hospital ward"): BoundEvent {
  return { ...envelope("human"), type: "bound", subject, statement };
}

export function challenge(text = "Is this site executable?"): ChallengeEvent {
  return { ...envelope("persona:eisenhardt-positivist"), type: "challenge", text };
}

export function adjudication(challengeId: string, verdict: Verdict = "accept"): AdjudicationEvent {
  return { ...envelope("human"), type: "adjudication", verdict, challengeId };
}

export function attention(chunkId: string, layer: AttentionLayer = "retrieval"): AttentionEvent {
  return { ...envelope("system"), type: "attention", layer, chunkId };
}

export function response(text = "Noted."): ResponseEvent {
  return { ...envelope("human"), type: "response", text };
}

/** n challenge→accept pairs in sequence (drives acceptance-streak). */
export function acceptRun(n: number): LedgerEvent[] {
  const events: LedgerEvent[] = [];
  for (let i = 0; i < n; i++) {
    const c = challenge(`challenge ${i}`);
    events.push(c, adjudication(c.id, "accept"));
  }
  return events;
}

/** n filler response events. */
export function filler(n: number): LedgerEvent[] {
  return Array.from({ length: n }, (_, i) => response(`filler ${i}`));
}
