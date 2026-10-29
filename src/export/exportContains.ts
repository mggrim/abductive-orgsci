/**
 * What each export row says it contains, computed from what the file will hold.
 *
 * This module exists because of one defect that has now shipped twice in the
 * same surface. Round one: the Memo card printed FINDINGS 4 and the memo the
 * button beside it wrote listed six, because the count and the payload were two
 * separate readings of the ledger and only the count got fixed. Round two: the
 * Session replay row printed "events 179" beside a file whose own first line
 * said "11 dialogue events", because the replay row was the one row the round
 * one fix did not visit and it was still reading `events.length` while the
 * writer filtered to challenges, responses and adjudications.
 *
 * Fixing the second number in place would have left the class alive: seven rows
 * each free to describe a file it does not build. So the counts are no longer
 * written beside the rows at all. `exportPlan` builds the payloads once and
 * reads the counts off them, and the component both prints those counts and
 * downloads those payloads. A row cannot disagree with its file because there
 * is only one object.
 *
 * Three of the seven are strings built at press time (the memo, the diagram and
 * the replay) because they need a timestamp, a stamp and the doubt map, and a
 * string has no countable fields anyway. Those three get their counts from the
 * same functions their writers call, named here once: `livePages`, `liveEdges`,
 * `connectingEdges` for the figure, which draws only the relations joining two
 * pages that are on the canvas and `replayDialogue` (`exportFindings` went with
 * the checks at M89).
 * `tests/export-contains.test.ts` holds
 * every chip against the file it labels, one assertion per row, so a writer
 * that starts filtering differently fails there rather than on screen.
 */

import { placedStatementCount, projectConcepts } from "../concepts/projection.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import {
  connectingEdges,
  liveEdges,
  livePages,
  type OntologyGraph,
} from "../ontology/schema.ts";
import { literatureOnly } from "../state/chunks.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import type { Project } from "../state/projects.ts";
import { buildAgentGraph, type AgentGraphExport } from "./agentGraph.ts";
import { buildBundle, type ProjectBundle } from "./bundle.ts";
import { buildLedgerExport, type LedgerExport } from "./ledgerJson.ts";
import { buildWikiFiles, type WikiFile } from "./wikiDirectory.ts";
import { replayDialogue } from "./sessionReplay.ts";

/** One count printed on a row, and the same count that is in the file. */
export interface ExportCount {
  readonly label: string;
  readonly count: number;
  /**
   * What the count is made of, when the number alone disagrees with another
   * screen (M29b).
   *
   * Material shows "documents 2" because it moved the papers out of the data
   * section; the bundle carries all three, so this tab showed "documents 3"
   * under a lede promising each row says what the screen says. Both numbers are
   * right and the difference is the paper, so the row names the split rather
   * than either surface changing what it counts.
   */
  readonly note?: string;
}

export type ExportRowId =
  | "memo"
  | "diagram"
  | "wiki"
  | "agent-graph"
  | "ledger"
  | "replay"
  | "bundle";

export interface ExportPlan {
  readonly wikiFiles: readonly WikiFile[];
  readonly agentGraph: AgentGraphExport;
  readonly ledger: LedgerExport;
  readonly bundle: ProjectBundle;
  /** The events the replay file actually writes out, not the ledger. */
  readonly dialogue: readonly LedgerEvent[];
  readonly pages: number;
  readonly edges: number;
  /** What each row prints, keyed by row. Empty counts are omitted, zero is kept. */
  readonly contains: Readonly<Record<ExportRowId, readonly ExportCount[]>>;
}

export function exportPlan(input: {
  readonly project: Project;
  readonly graph: OntologyGraph;
  readonly events: readonly LedgerEvent[];
  readonly chunks: readonly Chunk[];
  readonly documents: readonly StoredDocument[];
  /**
   * Only reaches `exportedAt` on the ledger envelope, which the caller restamps
   * at press time. Taken here so the plan is a pure function of its inputs.
   */
  readonly now?: () => number;
}): ExportPlan {
  const { project, graph, events, chunks, documents } = input;
  const now = input.now ?? (() => Date.now());

  const wikiFiles = buildWikiFiles({ project, graph, events });
  const agentGraph = buildAgentGraph({ project, graph, events, chunks });
  const ledger = buildLedgerExport(project.id, events, now);
  const bundle = buildBundle({
    project,
    documents,
    chunks,
    anomalies: [],
    twin: null,
    events,
  });
  const dialogue = replayDialogue(events);
  const pages = livePages(graph).length;
  const edges = liveEdges(graph).length;
  /* And the ones the figure can draw, which is not the same number.
   *
   * Retiring a page does not retire the edges naming it, so `liveEdges` counts
   * a relation with one end off the canvas and `buildDiagramSvg` does not draw
   * it. On three pages and two relations with one page retired the diagram row
   * would have printed "2 relations" beside a file carrying one line, which is
   * this module's own founding defect in an eighth row: a chip describing a
   * file it does not build. The figure reads `connectingEdges` through the
   * layout, so the chip reads it here. */
  const drawnEdges = connectingEdges(graph).length;
  const concepts = projectConcepts(events, project.id, graph);

  /* M89 (2026-10-14): the Report's and the agent graph's "flags" and
   * "dismissed" counts went with the checks. */
  return {
    wikiFiles,
    agentGraph,
    ledger,
    bundle,
    dialogue,
    pages,
    edges,
    contains: {
      memo: [
        /* M63, ISC-613: the Report leads with the ontology. */
        { label: "concepts", count: concepts.accepted.length },
        { label: "lines to look for", count: concepts.lookFor.filter((l) => l.settled === null).length },
        /* M78a, ISC-679: since M75 a placed statement is a claim; the walk read
           CLAIMS 0 beside 38 placed statements. */
        { label: "claims", count: pages + placedStatementCount(concepts) },
        { label: "links", count: edges },
      ],
      /* M63, ISC-613: the figure draws the concept map, or the claims when no
         concept is accepted yet, and counts what it draws. */
      diagram:
        concepts.accepted.length > 0
          ? [
              { label: "concepts", count: concepts.accepted.length },
              { label: "relations", count: concepts.links.length },
            ]
          : [
              { label: "claims", count: pages },
              { label: "links", count: drawnEdges },
            ],
      wiki: [{ label: "files", count: wikiFiles.length }],
      "agent-graph": [
        { label: "claims", count: agentGraph.pages.length },
        { label: "links", count: agentGraph.edges.length },
        { label: "passages", count: agentGraph.corpus.length, ...corpusNote(chunks) },
      ],
      ledger: [{ label: "events", count: ledger.eventCount }],
      /* Not `events.length`. The replay writes the dialogue: challenges,
       * responses and adjudications, which on the fixture study is eleven of a
       * hundred and seventy-nine. The row printed the ledger length beside a
       * file whose first line counted the eleven, and it sat between two rows
       * whose "events" chip was the ledger length and was true. Both the number
       * and the word are the file's now. */
      replay: [{ label: "dialogue events", count: dialogue.length }],
      bundle: [
        { label: "documents", count: bundle.documents.length, ...documentNote(bundle.documents) },
        { label: "passages", count: bundle.chunks.length, ...corpusNote(bundle.chunks) },
        { label: "events", count: bundle.events.length },
      ],
    },
  };
}

/** "2 data, 1 paper", or nothing when the study holds only one kind. */
function documentNote(documents: readonly StoredDocument[]): { note?: string } {
  const papers = literatureOnly(documents).length;
  const data = documents.length - papers;
  return papers === 0 || data === 0 ? {} : { note: `${data} data, ${papers} paper${papers === 1 ? "" : "s"}` };
}

/** The same split over passages, which is where the counts diverge furthest. */
function corpusNote(chunks: readonly Chunk[]): { note?: string } {
  const papers = literatureOnly(chunks).length;
  const data = chunks.length - papers;
  return papers === 0 || data === 0 ? {} : { note: `${data} data, ${papers} paper` };
}
