/**
 * Proto-ontology shapes (ISC-13, ISC-18, ISC-22, ISC-23).
 *
 * The proto-ontology is the study's own evolving model of the phenomenon it
 * investigates: the researcher's initial theoretical ideas, progressively
 * reshaped by early data. Its trajectory is what the tool measures — whether
 * data gets force-fitted into priors (colonization) or perturbs them
 * (discovery).
 *
 * Two properties are load-bearing and shape everything here:
 *
 *   1. Pages are pages, not nodes. A graph node forces a construct down to a
 *      label; a page can carry the definitional struggle, the case that does
 *      not fit, and the reason the researcher is unsure it is one thing
 *      rather than two. Typed frontmatter wraps machine-readable provenance
 *      around deliberately ragged prose.
 *
 *   2. Nothing is ever deleted. Pages retire and supersede; puzzles collapse
 *      but remain reinstatable. The record has to capture what was abandoned,
 *      because abandonment is often the interesting move.
 */

import type {
  EdgeRole,
  Origin,
  PageType,
  PuzzleRelation,
} from "../ledger/events.ts";

export type { EdgeRole, Origin, PageType, PuzzleRelation };

/**
 * Lifecycle of a claim. `contested` is a resting state, not a problem to be
 * cleared — an abductive ontology is supposed to hold rival accounts open.
 */
export type PageStatus = "conjecture" | "supported" | "contested" | "retired";

export const PAGE_STATUSES: readonly PageStatus[] = [
  "conjecture",
  "supported",
  "contested",
  "retired",
];

/** One revision of a page. Revisions accumulate; they never overwrite. */
export interface PageVersion {
  readonly version: number;
  readonly title: string;
  readonly body: string;
  readonly origin: Origin;
  readonly supportingChunks: readonly string[];
  /** The interview turn this revision was drafted from, when it had one. */
  readonly supportingTurn?: string;
  /** Ledger event id that produced this revision — the provenance back-link. */
  readonly eventId: string;
  readonly ts: number;
}

export interface OntologyPage {
  readonly id: string;
  readonly projectId: string;
  readonly type: PageType;
  readonly title: string;
  readonly body: string;
  /** Origin of the *current* version. Earlier origins live in `history`. */
  readonly origin: Origin;
  readonly status: PageStatus;
  readonly supportingChunks: readonly string[];
  /** The interview turn this page was drafted from, when it had one. */
  readonly supportingTurn?: string;
  /**
   * Which paper this expectation came out of (M30).
   *
   * The document id for an uploaded paper, the typed line for one that was
   * never uploaded, and the same key a `paper-misfit` finding carries. It is
   * how a claim drafted from a typed line can be matched against a flagged
   * paper: such a claim cites no passage at all, so there is nothing else to
   * match on. Only ever set on a theory page.
   */
  readonly paperKey?: string;
  /**
   * Who in the setting holds this expectation, when the researcher has said
   * (M44).
   *
   * Set by a `mark` mutation and by nothing else, so its presence is the whole of
   * "this expectation is held in the setting" and the string is the holder. Only
   * ever on a theory page, which the ledger's validator enforces.
   *
   * It carries no weight in any obligation. What a framing claim owes is read off
   * the graph's shape in `relations.ts`, and who held the expectation first does
   * not change how much evidence a pattern needs.
   */
  readonly heldBy?: string;
  readonly version: number;
  /** Full revision history, oldest first. Always contains the current version. */
  readonly history: readonly PageVersion[];
  /** Set when a puzzle was superseded by a collapse. Reinstatable. */
  readonly supersededBy: string | null;
  readonly retired: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface OntologyEdge {
  readonly id: string;
  readonly projectId: string;
  readonly from: string;
  readonly to: string;
  readonly role: EdgeRole;
  readonly origin: Origin;
  readonly supportingChunks: readonly string[];
  readonly retired: boolean;
  readonly createdAt: number;
}

/**
 * A claim about how the substantive puzzle stands to the theoretical
 * landscape. This is the framing decision, made explicit and contestable
 * rather than left as an implicit arrow.
 */
export interface PuzzleRelationClaim {
  readonly edgeId: string;
  readonly puzzleId: string;
  readonly theoryId: string;
  readonly relation: PuzzleRelation;
  readonly ts: number;
}

/** Record of a narrowing. Kept because the narrowing may have been premature. */
export interface CollapseRecord {
  readonly eventId: string;
  readonly keptPuzzleIds: readonly string[];
  readonly supersededPuzzleIds: readonly string[];
  readonly reason: string;
  readonly ts: number;
}

/**
 * The whole ontology, derived. There is no other copy of this state anywhere
 * (ISC-24) — every field here is a function of the event array.
 */
export interface OntologyGraph {
  readonly projectId: string;
  readonly pages: ReadonlyMap<string, OntologyPage>;
  readonly edges: ReadonlyMap<string, OntologyEdge>;
  readonly relations: readonly PuzzleRelationClaim[];
  readonly collapses: readonly CollapseRecord[];
  /** Live puzzle roots: puzzle pages that are neither retired nor superseded. */
  readonly puzzleRoots: readonly string[];
  /** Puzzles superseded by a collapse — present, not deleted. */
  readonly supersededPuzzles: readonly string[];
}

// ---------------------------------------------------------------------------
// Type predicates and small readers. Kept here so callers never reach into
// the maps directly and accidentally treat a retired page as live.
// ---------------------------------------------------------------------------

export function livePages(graph: OntologyGraph): readonly OntologyPage[] {
  return [...graph.pages.values()].filter((p) => !p.retired && p.supersededBy === null);
}

export function pagesOfType(graph: OntologyGraph, type: PageType): readonly OntologyPage[] {
  return livePages(graph).filter((p) => p.type === type);
}

export function liveEdges(graph: OntologyGraph): readonly OntologyEdge[] {
  return [...graph.edges.values()].filter((e) => !e.retired);
}

/**
 * The live edges that actually join two live pages.
 *
 * Retiring a page does not retire the edges naming it, and it should not: the
 * page can be reinstated and the relation comes back with it. So `liveEdges`
 * answers a question about the record and this answers a question about the
 * model as it currently stands, which are not the same question and were being
 * asked with one function.
 *
 * `anchoring.ts` already drew this distinction inline, in one line with the
 * comment "An edge naming a retired or absent page is not a connection", and it
 * was the only reader that did. `graphLayout` asked whether both ends were in
 * `graph.pages`, which a retired page still is, so it fed d3 a link to a node
 * it had not been given: retiring any related page threw
 * `node not found: <id>` out of `forceLink`, took the Ontology tab to a blank
 * screen with no error boundary under it, and took `buildDiagramSvg` with it,
 * so the figure could not be exported either. Measured on three pages and two
 * relations with one page retired: `layoutGraph` threw, `buildDiagramSvg` threw.
 *
 * The counting readers had the quieter half of the same defect. /ontology's own
 * lede counts pages with `livePages` and counted relations with `liveEdges`, so
 * it said "6 relations" over a drawing carrying five lines, and the size
 * channel switches on with the first relation, so a study whose only relation
 * named a retired page drew two radii and a key sentence reading "the rest of
 * this ontology hangs off" over a canvas where nothing joined anything.
 *
 * One function, here, because the answer belongs to the schema and not to
 * whichever surface happened to need it first.
 */
export function connectingEdges(graph: OntologyGraph): readonly OntologyEdge[] {
  const live = new Set(livePages(graph).map((p) => p.id));
  return liveEdges(graph).filter((e) => live.has(e.from) && live.has(e.to));
}

/** Edges pointing at `pageId` with an optional role filter. */
export function edgesInto(
  graph: OntologyGraph,
  pageId: string,
  role?: EdgeRole,
): readonly OntologyEdge[] {
  return liveEdges(graph).filter((e) => e.to === pageId && (role === undefined || e.role === role));
}

/** Edges leaving `pageId` with an optional role filter. */
export function edgesFrom(
  graph: OntologyGraph,
  pageId: string,
  role?: EdgeRole,
): readonly OntologyEdge[] {
  return liveEdges(graph).filter(
    (e) => e.from === pageId && (role === undefined || e.role === role),
  );
}

/** Every chunk id cited by any live page or edge. Feeds the uncited-chunk lint. */
export function citedChunks(graph: OntologyGraph): ReadonlySet<string> {
  const cited = new Set<string>();
  for (const page of livePages(graph)) for (const c of page.supportingChunks) cited.add(c);
  for (const edge of liveEdges(graph)) for (const c of edge.supportingChunks) cited.add(c);
  return cited;
}

/**
 * The supporting chunks that count as grounding (D5).
 *
 * The literature is not your data, so a page whose only citation is a paper is
 * not grounded in material, it is grounded in an argument. That is a legitimate
 * thing for a page to be and it is exactly what `orphan-construct` exists to
 * name, so the count the rule reads has to exclude the papers or the rule goes
 * quiet on the case it was written for.
 *
 * One function rather than a filter written out at each of the three rule sites,
 * because the last time a count and the thing it counted were derived
 * separately in this codebase they disagreed on screen.
 */
export function groundingChunks(
  supporting: readonly string[],
  literature: ReadonlySet<string>,
): readonly string[] {
  return literature.size === 0 ? supporting : supporting.filter((id) => !literature.has(id));
}
