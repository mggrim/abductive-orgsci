/**
 * Graph comparison between the researcher's ontology and the modal twin's
 * (ISC-67).
 *
 * This replaces the embedding-distance metric the v1 spec proposed. Distance
 * is the wrong instrument twice over. It compresses the whole comparison to a
 * scalar, so "0.34" says a study is somewhat unconventional without saying in
 * what respect; and no reviewer can check it, because the number is a property
 * of an embedding model nobody in the review chain has run.
 *
 * A graph diff is inspectable. "Both graphs hold a career-stage theory; only
 * yours holds an analytic residue; only the twin's proposes a
 * structural-difference resolution" is a claim a reader can agree or disagree
 * with, and it points at the pages the disagreement is about.
 *
 * Direction matters and is reported separately:
 *
 *   - **twin-only** pages are the conventional moves the researcher did not
 *     make. Sometimes an oversight worth surfacing, sometimes precisely the
 *     contribution.
 *   - **researcher-only** pages are where the design leaves the modal path.
 *     This is the interesting column, and it is worth nothing on its own —
 *     departing from convention is easy, and the obligations layer is what
 *     decides whether a departure is earned.
 *
 * Pure over its inputs. No inference, no clock.
 */

import type { PageType } from "../ledger/events.ts";
import type { OntologyGraph, OntologyPage } from "../ontology/schema.ts";
import { liveEdges, livePages } from "../ontology/schema.ts";
import { titleSimilarity } from "../proposals/duplicates.ts";
import { pageTypeGloss, pageTypeLabel } from "../ui/pageTypeVocabulary.ts";

/** Titles at or above this similarity, and of the same type, count as the same construct. */
export const SHARED_THRESHOLD = 0.5;

export interface SharedConstruct {
  readonly researcherPageId: string;
  readonly twinPageId: string;
  readonly type: PageType;
  readonly researcherTitle: string;
  readonly twinTitle: string;
  readonly similarity: number;
}

export interface UniqueConstruct {
  readonly pageId: string;
  readonly type: PageType;
  readonly title: string;
}

/** An argumentative move present in one graph and absent from the other. */
export interface EdgeDifference {
  readonly role: string;
  readonly fromTitle: string;
  readonly toTitle: string;
}

export interface TwinComparison {
  readonly shared: readonly SharedConstruct[];
  /** Where the design departs from the modal path. */
  readonly researcherOnly: readonly UniqueConstruct[];
  /** Conventional moves the design did not make. */
  readonly twinOnly: readonly UniqueConstruct[];
  readonly researcherOnlyEdges: readonly EdgeDifference[];
  readonly twinOnlyEdges: readonly EdgeDifference[];
  /**
   * Share of the researcher's live pages with no counterpart in the twin,
   * 0–1. Reported as a summary, never as a score: a high number is not a
   * virtue, it is a question about whether the departures are earned.
   */
  readonly departureShare: number;
  /** Page types the twin has and the researcher does not, and the reverse. */
  readonly typeGaps: {
    readonly missingFromResearcher: readonly PageType[];
    readonly missingFromTwin: readonly PageType[];
  };
  /** One-paragraph reading, for the memo export. Never a verdict. */
  readonly summary: string;
}

function bestMatch(
  page: OntologyPage,
  candidates: readonly OntologyPage[],
  taken: ReadonlySet<string>,
): { page: OntologyPage; similarity: number } | null {
  let best: { page: OntologyPage; similarity: number } | null = null;
  for (const candidate of candidates) {
    if (taken.has(candidate.id)) continue;
    if (candidate.type !== page.type) continue;
    const similarity = titleSimilarity(page.title, candidate.title);
    if (similarity >= SHARED_THRESHOLD && (best === null || similarity > best.similarity)) {
      best = { page: candidate, similarity };
    }
  }
  return best;
}

function edgeSet(graph: OntologyGraph): Map<string, EdgeDifference> {
  const title = (id: string) => graph.pages.get(id)?.title ?? id;
  const out = new Map<string, EdgeDifference>();
  for (const edge of liveEdges(graph)) {
    const difference: EdgeDifference = {
      role: edge.role,
      fromTitle: title(edge.from),
      toTitle: title(edge.to),
    };
    out.set(`${edge.role}|${difference.fromTitle.toLowerCase()}|${difference.toTitle.toLowerCase()}`, difference);
  }
  return out;
}

export function compareToTwin(
  researcher: OntologyGraph,
  twin: OntologyGraph,
): TwinComparison {
  const researcherPages = livePages(researcher);
  const twinPages = livePages(twin);

  const shared: SharedConstruct[] = [];
  const matchedTwin = new Set<string>();
  const matchedResearcher = new Set<string>();

  // Greedy, highest-similarity-first, so a page is not matched to a mediocre
  // counterpart while its real one is claimed by something else.
  const candidatePairs = researcherPages
    .flatMap((page) => {
      const match = bestMatch(page, twinPages, new Set());
      return match === null ? [] : [{ page, match }];
    })
    .sort((a, b) => b.match.similarity - a.match.similarity);

  for (const { page } of candidatePairs) {
    if (matchedResearcher.has(page.id)) continue;
    const match = bestMatch(page, twinPages, matchedTwin);
    if (match === null) continue;
    matchedResearcher.add(page.id);
    matchedTwin.add(match.page.id);
    shared.push({
      researcherPageId: page.id,
      twinPageId: match.page.id,
      type: page.type,
      researcherTitle: page.title,
      twinTitle: match.page.title,
      similarity: match.similarity,
    });
  }

  const toUnique = (page: OntologyPage): UniqueConstruct => ({
    pageId: page.id,
    type: page.type,
    title: page.title,
  });
  const researcherOnly = researcherPages.filter((p) => !matchedResearcher.has(p.id)).map(toUnique);
  const twinOnly = twinPages.filter((p) => !matchedTwin.has(p.id)).map(toUnique);

  const researcherEdges = edgeSet(researcher);
  const twinEdges = edgeSet(twin);
  const researcherOnlyEdges = [...researcherEdges.entries()]
    .filter(([key]) => !twinEdges.has(key))
    .map(([, v]) => v);
  const twinOnlyEdges = [...twinEdges.entries()]
    .filter(([key]) => !researcherEdges.has(key))
    .map(([, v]) => v);

  const researcherTypes = new Set(researcherPages.map((p) => p.type));
  const twinTypes = new Set(twinPages.map((p) => p.type));
  const typeGaps = {
    missingFromResearcher: [...twinTypes].filter((t) => !researcherTypes.has(t)),
    missingFromTwin: [...researcherTypes].filter((t) => !twinTypes.has(t)),
  };

  const departureShare =
    researcherPages.length === 0 ? 0 : researcherOnly.length / researcherPages.length;

  return {
    shared,
    researcherOnly,
    twinOnly,
    researcherOnlyEdges,
    twinOnlyEdges,
    departureShare,
    typeGaps,
    summary: summarise({
      researcherCount: researcherPages.length,
      twinCount: twinPages.length,
      shared,
      researcherOnly,
      twinOnly,
      typeGaps,
    }),
  };
}

/**
 * How two claims count as the same one, said to the reader (walk item 2).
 *
 * The walk read "0 claims appear in both" over an ordinary version holding
 * "Patient identity differently constructed across shifts" and a model holding
 * "Agreement on the handover, disagreement on the patient", and had no way to
 * tell whether the tool was matching on the exact words or had looked and
 * disagreed. A count of zero with no rule beside it reads as a broken feature.
 */
export const MATCH_RULE =
  "Two claims count as the same one when they are the same kind and their titles share most of their words.";

function listOf(titles: readonly string[]): string {
  return titles.map((t) => `"${t}"`).join(", ");
}

function summarise(input: {
  researcherCount: number;
  twinCount: number;
  shared: readonly SharedConstruct[];
  researcherOnly: readonly UniqueConstruct[];
  twinOnly: readonly UniqueConstruct[];
  typeGaps: TwinComparison["typeGaps"];
}): string {
  if (input.researcherCount === 0) {
    return "Accept a claim into your ontology, and you can compare your claims with the ordinary version.";
  }
  if (input.twinCount === 0) {
    return "The ordinary version came back without claims, so this comparison is empty. Write the ordinary version again before you draw anything from this comparison.";
  }

  const parts: string[] = [];
  parts.push(
    input.shared.length === 0
      ? "Each claim in your ontology differs from every claim in the ordinary version."
      : `${input.shared.length} claim${input.shared.length === 1 ? " says" : "s say"} the same thing in both.`,
  );
  if (input.researcherOnly.length > 0) {
    const shown = input.researcherOnly.slice(0, 3).map((c) => c.title);
    parts.push(
      `You have ${input.researcherOnly.length} claims without a match in the ordinary version: ${listOf(shown)}${
        input.researcherOnly.length > 3 ? ", among others" : ""
      }.`,
    );
  } else {
    parts.push(
      "Every claim in your ontology has a match in the ordinary version. Based on what you have written so far, your design is the ordinary one.",
    );
  }
  if (input.twinOnly.length > 0) {
    const shown = input.twinOnly.slice(0, 3).map((c) => c.title);
    parts.push(
      `The ordinary version makes ${input.twinOnly.length} claim${input.twinOnly.length === 1 ? "" : "s"} that yours doesn't, including ${listOf(shown)}.`,
    );
  }
  if (input.typeGaps.missingFromResearcher.length > 0) {
    // The slugs were joined straight into this sentence, so a comparison
    // written for the researcher to read ended "page types yours does not:
    // analytic-residue, scope-condition" while the index beside it spelled
    // both with a space. The gaps stay typed as PageType, because the caller
    // filters on them; only the rendering goes through the module.
    /* The gloss beside the label, because the label alone is the slug's own
     * word: the walk read "kinds of claim yours does not: rival", where "rival"
     * is a term of art the page uses once and never defines here. */
    parts.push(
      `The ordinary version uses kinds of claim that your ontology doesn't: ${input.typeGaps.missingFromResearcher
        .map((type) => `${pageTypeLabel(type)}, ${pageTypeGloss(type)}`)
        .join("; ")}.`,
    );
  }
  /* Last, because it is the rule and not a finding, and a reader wants the
   * numbers before they want the definition behind them. */
  parts.push(MATCH_RULE);
  return parts.join(" ");
}
