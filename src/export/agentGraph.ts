/**
 * Agent-facing typed graph export (ISC-68).
 *
 * The handoff artifact: everything a later analyst — human or agent — needs to
 * pick the study up cold, in one typed JSON document.
 *
 * What separates this from a graph dump is the three things it carries that a
 * tidy export would drop:
 *
 *   - **Provenance on every element.** Which pages the researcher brought,
 *     which the data forced, and which a model proposed and they accepted.
 *     An agent that cannot tell those apart will treat the model's own
 *     suggestions as independent evidence for them.
 *   - **Residue.** What the account cannot absorb. This is the most useful
 *     thing in the file and the first thing a summariser would delete.
 *   - **Rejected paths.** Proposals the researcher declined, with their
 *     reasons, and puzzles superseded by a collapse. A downstream agent that
 *     re-proposes what has already been considered and refused wastes the
 *     researcher's time and, worse, applies pressure to reverse a judgement
 *     they already made.
 *
 * Pure over its inputs.
 */

import type { LedgerEvent, OntologyOp, Origin, PageType } from "../ledger/events.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { liveEdges, livePages } from "../ontology/schema.ts";
import { checkAllObligations, chunkDocuments } from "../ontology/relations.ts";
import { projectProposals } from "../proposals/projection.ts";
import { originWritten } from "../ui/originVocabulary.ts";
import { designEvents, ledgerStamp } from "./stamp.ts";
import { doubtsOn, originDoubtShareCaveat, originDoubts } from "../ontology/originAudit.ts";
import { projectInterview } from "../interview/state.ts";
import { projectTrajectory } from "../views/trajectoryModel.ts";
import { LIVE_PAGES, originCensus } from "../ontology/attribution.ts";
import type { Chunk } from "../state/chunks.ts";
import type { Project } from "../state/projects.ts";

export const AGENT_GRAPH_FORMAT = "bounds-ontology";
/**
 * 2, because `attribution` changed population.
 *
 * In v1 the field counted ledger events, including relations, and said nothing
 * about what it was over: 33/33/32 and a `modelShare` of 0.3265 sat beside a
 * `pages` array of 44 whose own origin fields gave 15/15/14 and 0.318. An agent
 * quoting `attribution.modelShare` as the model's share of the ontology was
 * quoting a number about a different population, and nothing in the file told
 * it so. v2 counts the pages in this file, states its denominator, and puts the
 * event stream in `mutations` where it is named for what it is.
 */
export const AGENT_GRAPH_VERSION = 2;

export interface AgentGraphPage {
  readonly id: string;
  readonly type: PageType;
  readonly title: string;
  readonly body: string;
  readonly origin: Origin;
  readonly status: string;
  readonly version: number;
  readonly supportingChunks: readonly string[];
  readonly superseded: boolean;
}

export interface AgentGraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly role: string;
  readonly origin: Origin;
  readonly supportingChunks: readonly string[];
}

export interface AgentGraphExport {
  readonly format: typeof AGENT_GRAPH_FORMAT;
  readonly version: typeof AGENT_GRAPH_VERSION;
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly researchQuestion: string;
    /** The researcher's own answer at The puzzle step (M58), when there is one.
     * `researchQuestion` keeps the tool's reading under its old name. */
    readonly puzzleAnswer?: string;
    readonly dataType: string;
  };
  /**
   * Which state of the design this file is a reading of.
   *
   * The digest and the count are the same two numbers the export receipt
   * carries. They are in here rather than only beside the file because an agent
   * handed this JSON has no receipt and no folder, and "is this the current
   * graph" is the first thing it cannot otherwise answer. `designEvents` counts
   * the events the stamp was taken over, which excludes the exports themselves,
   * so taking this file out twice produces the same stamp both times.
   */
  readonly takenAt: {
    readonly stamp: string;
    readonly designEvents: number;
  };
  readonly puzzleRoots: readonly string[];
  readonly pages: readonly AgentGraphPage[];
  readonly edges: readonly AgentGraphEdge[];
  /** Puzzle→theory claims and whether each has discharged what it owes. */
  readonly relations: readonly {
    readonly puzzleId: string;
    readonly theoryId: string;
    readonly relation: string;
    readonly discharged: boolean;
    readonly requirement: string;
    readonly detail: string;
  }[];
  /** What the account cannot absorb. Do not drop this when summarising. */
  readonly residue: readonly AgentGraphPage[];
  readonly rejectedPaths: {
    readonly proposals: readonly {
      readonly title: string;
      readonly pageType?: PageType;
      readonly reason: string;
    }[];
    readonly supersededPuzzles: readonly { readonly id: string; readonly title: string }[];
    readonly collapses: readonly { readonly reason: string; readonly superseded: readonly string[] }[];
    /** Topics the researcher declined to discuss, and how often. */
    readonly declinedTopics: readonly { readonly topic: string; readonly refusals: number }[];
  };
  /* M89 (2026-10-14): `openQuestions` and `setAside`, the checks' flags still
   * standing and the ones the researcher had answered, left this file with the
   * checks, on the owner's instruction. History keeps the events. */
  /**
   * Who wrote the ontology, over the pages in this file and no other
   * population.
   *
   * Every number in here is a number about `pages` above: `population` equals
   * `pages.length`, `byOrigin` is a partition of it, and `modelShare` is
   * `byOrigin["model-proposed"]` over it. That is stated because it was not
   * true and could not be checked. v1 computed all three over ontology-mutation
   * events, so a 44-page graph carried 33/33/32 against its own pages' 15/15/14
   * and printed no denominator anywhere in the file.
   */
  readonly attribution: {
    /** The unit counted, plural, in the words the tool uses on screen. */
    readonly of: string;
    /** The denominator. Equal to `pages.length`, by construction. */
    readonly population: number;
    readonly byOrigin: Readonly<Record<Origin, number>>;
    readonly modelShare: number | null;
    /**
     * Pages whose recorded origin the ledger contradicts.
     *
     * `modelShare` is computed over the origin column of these same live pages,
     * and this says how far that column can be trusted. The two are scoped to
     * one population, which is the point: in v1 the caveat was scoped to live
     * pages and the number to ledger events, so the sentence claiming the
     * caveat qualified the number described behaviour this file did not have.
     * An agent handed this JSON cannot see the caveat a human reads on screen,
     * and attribution is the one field in here most likely to be quoted as a
     * finding, so the uncertainty travels with the number. Empty on any study
     * built after the relabelling bug was removed. See
     * `src/ontology/originAudit.ts`.
     */
    readonly unverified: readonly {
      readonly pageId: string;
      readonly claimed: string;
      readonly evidence: string;
    }[];
  };
  /**
   * The work behind the graph: every recorded change, by kind and by origin.
   *
   * A different population from `attribution` and kept apart from it under its
   * own name. `relate` is a mutation and not a page, `revise` is a mutation and
   * not a page either, and this is where a reader asking how the ontology was
   * arrived at should look. `byOp` is here so nobody has to call 54 relations
   * and 44 creations "98 revisions", which is what the tool used to do.
   */
  readonly mutations: {
    readonly of: string;
    readonly population: number;
    readonly byOp: Readonly<Record<OntologyOp, number>>;
    readonly byOrigin: Readonly<Record<Origin, number>>;
    readonly modelShare: number | null;
  };
  readonly corpus: readonly { readonly chunkId: string; readonly cited: boolean }[];
  readonly caveats: readonly string[];
}

/**
 * Read-me-first warnings, emitted in the file rather than left to a covering
 * note nobody reads. They are the assumptions most likely to be violated by
 * whoever opens this next.
 */
const CAVEATS: readonly string[] = [
  /* M74a, ISC-663: affirmative, without the "X, not Y" reframe. */
  "This proto-ontology comes from a design that is still changing, and every claim here is still unvalidated against a full corpus.",
  // The gloss here read "were suggested by a language model and accepted by the
  // researcher", which is a fifth phrasing of a value with one canonical name.
  // This file was never in any census: it draws nothing, holds no table and
  // hard-codes no number, it just wrote the sentence out. Attribution is what
  // the caveats exist to protect, so the sentence comes from the one module
  // that owns it. The backticked slug stays: it is the field name in this same
  // JSON, addressed to whoever greps the file rather than to a reader.
  `Pages with \`origin: model-proposed\` were ${originWritten("model-proposed")}. They are not independent evidence for the researcher's position.`,
  "Contradictions in this graph are deliberate. Do not resolve them; an abductive ontology should hold rival accounts open, and a tidied version of this file is a worse artifact.",
  "`rejectedPaths` records what the researcher has already considered and declined. Re-proposing it is not a fresh idea.",
  "`residue` is what the current account cannot absorb. It is the most informative section here and the first thing that a summariser will drop.",
  // The caveat this file most needed and did not have. Its absence is what let
  // v1 print two attributions and leave a reader to assume they were one.
  "`attribution` counts the pages in this file. `mutations` counts the ledger events behind them, relations included, so it is the larger number and it is not a count of pages. Two populations, two denominators, both stated: do not quote one under the other's name and do not add them.",
];

export function buildAgentGraph(input: {
  readonly project: Project;
  readonly graph: OntologyGraph;
  readonly events: readonly LedgerEvent[];
  readonly chunks: readonly Chunk[];
}): AgentGraphExport {
  const { project, graph, events, chunks } = input;
  const doubted = originDoubts(events, project.id);

  const toPage = (id: string): AgentGraphPage | null => {
    const page = graph.pages.get(id);
    if (page === undefined) return null;
    return {
      id: page.id,
      type: page.type,
      title: page.title,
      body: page.body,
      origin: page.origin,
      status: page.status,
      version: page.version,
      supportingChunks: page.supportingChunks,
      superseded: page.supersededBy !== null,
    };
  };

  const pages = livePages(graph)
    .map((p) => toPage(p.id))
    .filter((p): p is AgentGraphPage => p !== null);
  // The doubts that fall on the pages actually in this file. See `doubtsOn`.
  const onLivePages = doubtsOn(doubted, pages);

  const edges: AgentGraphEdge[] = liveEdges(graph).map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    role: e.role,
    origin: e.origin,
    supportingChunks: e.supportingChunks,
  }));

  // M29 (E3). The corpus, so the `contradicts` burden counts source documents
  // rather than chunk ids. This file has the chunks to hand and the file that
  // goes to an agent is the last place a burden should read as discharged when
  // it is not.
  const relations = checkAllObligations(graph, chunkDocuments(chunks)).map((o) => ({
    puzzleId: o.puzzleId,
    theoryId: o.theoryId,
    relation: o.relation,
    discharged: o.discharged,
    requirement: o.requirement,
    detail: o.detail,
  }));

  const attribution = originCensus(pages, LIVE_PAGES);
  const tray = projectProposals(events, project.id);
  const interview = projectInterview(events, project.id);
  const trajectory = projectTrajectory(events, project.id);

  const cited = new Set<string>();
  for (const page of pages) for (const c of page.supportingChunks) cited.add(c);
  for (const edge of edges) for (const c of edge.supportingChunks) cited.add(c);

  return {
    format: AGENT_GRAPH_FORMAT,
    version: AGENT_GRAPH_VERSION,
    project: {
      id: project.id,
      title: project.title,
      researchQuestion: project.brief.researchQuestion,
      ...((project.brief.puzzleAnswer ?? "").trim() === "" ? {} : { puzzleAnswer: project.brief.puzzleAnswer }),
      dataType: project.brief.dataType,
    },
    takenAt: { stamp: ledgerStamp(events), designEvents: designEvents(events).length },
    puzzleRoots: graph.puzzleRoots,
    pages,
    edges,
    relations,
    residue: pages.filter((p) => p.type === "analytic-residue"),
    rejectedPaths: {
      proposals: tray.rejected.map((p) => ({
        title: p.title,
        ...(p.pageType === undefined ? {} : { pageType: p.pageType }),
        reason: p.reason ?? "(without a reason)",
      })),
      supersededPuzzles: graph.supersededPuzzles.map((id) => ({
        id,
        title: graph.pages.get(id)?.title ?? id,
      })),
      collapses: graph.collapses.map((c) => ({
        reason: c.reason,
        superseded: c.supersededPuzzleIds,
      })),
      declinedTopics: [...interview.refusalsByTopic.entries()].map(([topic, refusals]) => ({
        topic,
        refusals,
      })),
    },
    attribution: {
      of: attribution.unit.many,
      population: attribution.population,
      byOrigin: attribution.byOrigin,
      modelShare: attribution.modelShare,
      // The live pages this file describes, not every doubt in the ledger, so
      // the count in the caveat is a count of rows an agent can find here, and
      // so the caveat and the number it qualifies are over one population.
      unverified: onLivePages,
    },
    mutations: {
      of: trajectory.mutations.unit.many,
      population: trajectory.mutations.population,
      byOp: trajectory.byOp,
      byOrigin: trajectory.mutations.byOrigin,
      modelShare: trajectory.mutations.modelShare,
    },
    corpus: chunks.map((c) => ({ chunkId: c.id, cited: cited.has(c.id) })),
    // The doubt caveat is prepended rather than appended: the caveats are
    // read-me-first warnings and this one qualifies the field an agent is most
    // likely to quote.
    caveats:
      onLivePages.length === 0 ? CAVEATS : [originDoubtShareCaveat(onLivePages.length), ...CAVEATS],
  };
}

export function serializeAgentGraph(graph: AgentGraphExport): string {
  return JSON.stringify(graph, null, 2);
}
