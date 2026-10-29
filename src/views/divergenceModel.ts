/**
 * Divergence projection (ISC-28) — pure function over the event array.
 *
 * Three derived disagreement families:
 *   - persona-vs-persona: two or more DISTINCT personas challenging the same
 *     matrix cell (conflicting readings of the same design tension);
 *   - persona-vs-researcher: challenges the researcher REJECTED (an explicit,
 *     reasoned disagreement between human and persona);
 *   - surviving dissent: challenges that were rejected, auto-logged 'ignored',
 *     or never adjudicated — dissent that was not resolved away. Surviving
 *     dissent is the candidate-anomaly signal: objections nobody answered are
 *     exactly where a real anomaly may be hiding.
 */

import type {
  AdjudicationEvent,
  ChallengeEvent,
  LedgerEvent,
  Verdict,
} from "../ledger/events.ts";

export interface PersonaDivergence {
  readonly matrixCell: string;
  /** Distinct persona actors that challenged this cell. */
  readonly personas: readonly string[];
  readonly challenges: readonly ChallengeEvent[];
}

export interface ResearcherDisagreement {
  readonly challenge: ChallengeEvent;
  readonly verdict: Verdict;
  /** The researcher's recorded rejection reason, when given. */
  readonly reason?: string;
}

export type DissentStatus = "rejected" | "ignored" | "open";

export interface SurvivingDissentItem {
  readonly challenge: ChallengeEvent;
  readonly status: DissentStatus;
}

export interface DivergenceReport {
  readonly personaVsPersona: readonly PersonaDivergence[];
  readonly personaVsResearcher: readonly ResearcherDisagreement[];
  readonly survivingDissent: readonly SurvivingDissentItem[];
}

/** Latest adjudication per challenge id (later events override earlier ones). */
function latestAdjudications(
  events: readonly LedgerEvent[],
): Map<string, AdjudicationEvent> {
  const map = new Map<string, AdjudicationEvent>();
  for (const event of events) {
    if (event.type === "adjudication") map.set(event.challengeId, event);
  }
  return map;
}

export function computeDivergence(events: readonly LedgerEvent[]): DivergenceReport {
  const challenges = events.filter(
    (e): e is ChallengeEvent => e.type === "challenge",
  );
  const adjudicationByChallenge = latestAdjudications(events);

  // --- persona-vs-persona: group by matrix cell, keep multi-persona groups.
  const byCell = new Map<string, ChallengeEvent[]>();
  for (const challenge of challenges) {
    if (challenge.matrixCell === undefined) continue;
    if (!challenge.actor.startsWith("persona:")) continue;
    const list = byCell.get(challenge.matrixCell) ?? [];
    list.push(challenge);
    byCell.set(challenge.matrixCell, list);
  }
  const personaVsPersona: PersonaDivergence[] = [];
  for (const [matrixCell, cellChallenges] of byCell) {
    const personas = [...new Set(cellChallenges.map((c) => c.actor))];
    if (personas.length >= 2) {
      personaVsPersona.push({ matrixCell, personas, challenges: cellChallenges });
    }
  }
  personaVsPersona.sort((a, b) => a.matrixCell.localeCompare(b.matrixCell));

  // --- persona-vs-researcher: rejected challenges (explicit disagreement).
  const personaVsResearcher: ResearcherDisagreement[] = [];
  for (const challenge of challenges) {
    const adjudication = adjudicationByChallenge.get(challenge.id);
    if (adjudication?.verdict === "reject") {
      personaVsResearcher.push({
        challenge,
        verdict: adjudication.verdict,
        ...(adjudication.reason !== undefined ? { reason: adjudication.reason } : {}),
      });
    }
  }

  // --- surviving dissent: rejected, ignored, or never adjudicated.
  const survivingDissent: SurvivingDissentItem[] = [];
  for (const challenge of challenges) {
    const adjudication = adjudicationByChallenge.get(challenge.id);
    if (adjudication === undefined) {
      survivingDissent.push({ challenge, status: "open" });
    } else if (adjudication.verdict === "reject") {
      survivingDissent.push({ challenge, status: "rejected" });
    } else if (adjudication.verdict === "ignored") {
      survivingDissent.push({ challenge, status: "ignored" });
    }
  }

  return { personaVsPersona, personaVsResearcher, survivingDissent };
}
