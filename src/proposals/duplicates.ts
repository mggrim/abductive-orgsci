/**
 * Near-duplicate detection for pending proposals (ISC-56).
 *
 * The tool must not merge on the researcher's behalf. Two constructs with
 * similar titles are sometimes one construct stated twice and sometimes a
 * distinction the researcher has been circling for weeks; deciding that is the
 * analytic work, and quietly collapsing them would destroy exactly the
 * evidence the study is trying to gather.
 *
 * So this module surfaces the existing page and asks. It never merges.
 */

import type { OntologyGraph } from "../ontology/schema.ts";
import { livePages } from "../ontology/schema.ts";
import type { NearDuplicate, Proposal } from "./types.ts";

/** Titles at or above this similarity are surfaced for a merge-or-separate call. */
export const DUPLICATE_THRESHOLD = 0.6;

/**
 * Words that carry no subject, dropped before two titles are compared.
 *
 * The filter was length alone, so "the", "and", "who", "not" and "has" all
 * counted as shared content. Two titles about different things scored for their
 * grammar, and two about the same thing were dragged down by one of them using
 * an article the other did not. A small fixed list, English only, because these
 * are titles a researcher typed and not a corpus.
 */
export const STOPWORDS: ReadonlySet<string> = new Set([
  "the",
  "and",
  "for",
  "are",
  "was",
  "were",
  "with",
  "that",
  "this",
  "from",
  "into",
  "over",
  "under",
  "between",
  "across",
  "about",
  "than",
  "then",
  "they",
  "them",
  "their",
  "its",
  "has",
  "have",
  "had",
  "not",
  "but",
  "all",
  "any",
  "can",
  "does",
  "did",
  "you",
  "your",
  "who",
  "how",
  "what",
  "when",
  "where",
  "which",
  "why",
]);

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

export function titleSimilarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let overlap = 0;
  for (const t of x) if (y.has(t)) overlap += 1;
  return (2 * overlap) / (x.size + y.size);
}

/**
 * Find the closest live page to a proposal, if any clears the threshold.
 * Restricted to pages of the same type: a puzzle and a rival can share a
 * title and still be entirely different claims.
 */
export function findNearDuplicate(
  proposal: Proposal,
  graph: OntologyGraph,
  threshold = DUPLICATE_THRESHOLD,
): NearDuplicate | null {
  if (proposal.pageType === undefined) return null;

  let best: { id: string; title: string; score: number } | null = null;
  for (const page of livePages(graph)) {
    if (page.type !== proposal.pageType) continue;
    const score = titleSimilarity(proposal.title, page.title);
    if (score >= threshold && (best === null || score > best.score)) {
      best = { id: page.id, title: page.title, score };
    }
  }
  if (best === null) return null;

  return {
    proposalId: proposal.id,
    existingPageId: best.id,
    existingTitle: best.title,
    similarity: best.score,
    prompt: `'${proposal.title}' is ${(best.score * 100).toFixed(0)}% the same wording as your claim '${best.title}'. Are these one idea stated twice, or a distinction worth keeping apart? If they're separate, say what distinguishes them. That difference is worth keeping in History either way.`,
  };
}

/** Every pending proposal that has a near-duplicate in the graph. */
export function findNearDuplicates(
  proposals: readonly Proposal[],
  graph: OntologyGraph,
  threshold = DUPLICATE_THRESHOLD,
): readonly NearDuplicate[] {
  return proposals
    .filter((p) => p.status === "pending")
    .map((p) => findNearDuplicate(p, graph, threshold))
    .filter((d): d is NearDuplicate => d !== null);
}
