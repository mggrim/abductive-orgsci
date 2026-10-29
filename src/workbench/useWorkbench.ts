/**
 * Workbench state hook.
 *
 * Every value here is a projection of the ledger, memoised on the event array
 * and nothing else. The hook holds no domain state — the one piece of local
 * state is which page is selected, which is a view concern and correctly
 * ephemeral.
 *
 * This is where the single-source-of-state rule either holds or quietly
 * breaks, because a workbench is exactly the kind of surface where caching
 * "just the current ontology" in a ref looks harmless and makes the export
 * disagree with the screen.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LedgerEvent } from "../ledger/events.ts";
import { projectOntology } from "../ontology/projection.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { livePages } from "../ontology/schema.ts";
import { dataChunkCount, dataOnly } from "../state/chunks.ts";
import { designDigest } from "../interview/designDigest.ts";
import type { DesignDigest } from "../interview/prompt.ts";
import { MATRIX } from "../matrix/matrix.ts";
import { projectInterview } from "../interview/state.ts";
import { generateMoves } from "../interview/moves.ts";
import type { StationId } from "../flow/stations.ts";
import { getProject, type ProjectBrief } from "../state/projects.ts";
import { checkSaturation, type SaturationReading } from "../interview/saturation.ts";
import type { InterviewState, NextMove } from "../interview/types.ts";
import { projectProposals } from "../proposals/projection.ts";
import { findNearDuplicates } from "../proposals/duplicates.ts";
import type { NearDuplicate, ProposalTray } from "../proposals/types.ts";
import { projectSpine, type SessionSpine } from "../views/spineModel.ts";
import { projectTerritory, type TerritorySummary } from "../views/territoryModel.ts";
import { projectTrajectory, type TrajectorySummary } from "../views/trajectoryModel.ts";
import { LIVE_PAGES, originCensus, type OriginCensus } from "../ontology/attribution.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { listChunks, listDocuments } from "../state/projects.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import { paperRefs } from "../proposals/theory.ts";
import {
  baselinesSettled,
  openBaselines,
  paperBaselines,
} from "../proposals/baselines.ts";
import { chunkDocuments, type ChunkDocuments } from "../ontology/relations.ts";

export interface WorkbenchState {
  readonly events: readonly LedgerEvent[];
  readonly graph: OntologyGraph;
  /** The design as the interviewer sees it. */
  readonly design: DesignDigest;
  readonly brief: ProjectBrief | undefined;
  readonly interview: InterviewState;
  readonly moves: readonly NextMove[];
  readonly saturation: SaturationReading;
  readonly tray: ProposalTray;
  readonly duplicates: readonly NearDuplicate[];
  readonly spine: SessionSpine;
  readonly territory: TerritorySummary;
  readonly trajectory: TrajectorySummary;
  /**
   * Who wrote the ontology as it stands, over the live pages.
   *
   * One computation, handed to every surface that says who wrote what, for the
   * same reason `doubts` is computed once in OntologyView and handed to the
   * drawing, the key and the index. The Design tab used to print the
   * trajectory's event counts under the page marks and /ontology counted rows,
   * so the tool's central claim was 33% on one tab and 32% on the other with no
   * denominator written on either. See `src/ontology/attribution.ts`.
   */
  readonly attribution: OriginCensus;
  readonly chunks: readonly Chunk[];
  /** What has been uploaded, so a surface can tell a paper from a transcript. */
  readonly documents: readonly StoredDocument[];
  /**
   * Which document each passage came from (M29, E3).
   *
   * Built once here and handed to every reader of the relation obligations, so
   * the interview and the exports cannot disagree about whether
   * a `contradicts` claim rests on one source or two. A surface that built its
   * own would be a second definition of what a source document is.
   */
  readonly chunkDocuments: ChunkDocuments;
  /**
   * Distinct data passages this study has retrieved, cited or opened (M29b).
   *
   * The papers are excluded on purpose. "Your account absorbed everything your
   * material offered" is a claim about the researcher's own material, and a
   * study holding five papers and no fieldwork has offered its account nothing
   * to resist. Any layer counts: a passage the tool put in front of a model is
   * one the account has met.
   */
  readonly dataPassagesTouched: number;
  readonly selectedPageId: string | null;
  readonly selectPage: (id: string | null) => void;
}

export function useWorkbench(projectId: string, station?: StationId): WorkbenchState {
  const { events: allEvents } = useLedger();
  const [chunks, setChunks] = useState<readonly Chunk[]>([]);
  /* The documents beside the passages (M29). A passage knows its document id
   * and nothing else, so the one fact no consumer of `chunks` can derive is
   * what the researcher calls the file it came from, which is what the papers
   * questions name. */
  const [documents, setDocuments] = useState<readonly StoredDocument[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listChunks(projectId), listDocuments(projectId)]).then(([c, d]) => {
      if (cancelled) return;
      setChunks(c);
      setDocuments(d);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, allEvents.length]);

  const events = useMemo(
    () => allEvents.filter((e) => e.projectId === projectId),
    [allEvents, projectId],
  );

  const graph = useMemo(() => projectOntology(events, projectId), [events, projectId]);

  /* Data passages the study has actually met (M29b). Distinct ids across every
   * attention layer, filtered to the data: retrieval, citation and the human
   * layer all mean the passage reached something. The papers are excluded,
   * because "your account absorbed everything your material offered" is a claim
   * about the researcher's own material. */
  const dataPassagesTouched = useMemo(() => {
    const data = new Set(dataOnly(chunks).map((c) => c.id));
    return new Set(
      events.flatMap((e) => (e.type === "attention" && data.has(e.chunkId) ? [e.chunkId] : [])),
    ).size;
  }, [events, chunks]);

  /* The passage-to-document map, built once for every reader of it. */
  const documentOfChunk = useMemo(() => chunkDocuments(chunks), [chunks]);

  /* M89 (2026-10-14): the structural lint ran here on every change, and the
   * tool withdrew its own flags when the design moved under them. Both left
   * main with the checks, on the owner's instruction; the branch `with-checks`
   * keeps them. */

  const interview = useMemo(() => projectInterview(events, projectId), [events, projectId]);

  const coveredCells = useMemo(
    () => [...new Set(events.flatMap((e) => (e.type === "flag" ? [e.matrixCell] : [])))],
    [events],
  );

  // The brief is read here rather than passed in, because the moves have to
  // see what is written at the station in order to ask about it rather than
  // about it in general.
  const [brief, setBrief] = useState<ProjectBrief | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void getProject(projectId).then((p) => {
      if (!cancelled) setBrief(p?.brief);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, allEvents.length]);

  /* Passages the researcher has opened, from the human attention layer (M29).
   * Distinct ids rather than events: opening one passage four times is one
   * passage read, and the Early data probe is asking how much of the corpus has
   * been through their hands. */
  const passagesOpened = useMemo(
    () =>
      new Set(
        events.flatMap((e) => (e.type === "attention" && e.layer === "human" ? [e.chunkId] : [])),
      ).size,
    [events],
  );

  /* The reading list, read the way the paper reader reads it (M29). One
   * definition of what counts as a paper, in `proposals/theory.ts`, so the
   * interview cannot count five where the Material tab counts six.
   *
   * `paperRefs` rather than `papersToRead`: one reader of the list for the
   * whole tool. M87 (ISC-722) retired the question about unengaged papers,
   * which was the one reader of each paper's expectations here. */
  const papers = useMemo(() => {
    const refs = paperRefs({
      documents,
      chunks,
      ...(brief?.seminalCorpus === undefined ? {} : { typedList: brief.seminalCorpus }),
    });
    return refs.map((paper) => ({
      name: paper.name,
      chunkIds: (paper.chunks ?? []).map((c) => c.id),
    }));
  }, [documents, chunks, brief]);

  /* What the papers expect and nobody has answered (M33).
   *
   * Off the same record the paper's row on Material reads, filtered to the
   * papers the study still names, so an edited line cannot leave its
   * expectations behind the way it used to leave its verdict. */
  const baselines = useMemo(() => {
    const live = new Set(
      paperRefs({
        documents,
        chunks,
        ...(brief?.seminalCorpus === undefined ? {} : { typedList: brief.seminalCorpus }),
      }).map((p) => p.key),
    );
    return openBaselines(
      paperBaselines(events, projectId, live),
      baselinesSettled(events, projectId),
    ).map((entry) => ({
      id: entry.baseline.id,
      paperName: entry.paper.paperName,
      expectation: entry.baseline.expectation,
    }));
  }, [events, projectId, documents, chunks, brief]);

  const moves = useMemo(
    () =>
      generateMoves({
        graph,
        state: interview,
        coveredCells,
        matrix: MATRIX,
        turnIndex: interview.turns,
        ...(station === undefined ? {} : { station }),
        ...(brief === undefined ? {} : { brief }),
        /* Data only (D12). The Early data probe reads the corpus when the box is
           empty, so a paper on the reading list used to make the step look worked. */
        chunkCount: dataChunkCount(chunks),
        passagesOpened,
        papers,
        baselines,
        chunkDocuments: documentOfChunk,
      }),
    [
      graph,
      interview,
      coveredCells,
      station,
      brief,
      /* The array, not its length: the count the moves read is the data-only one
         and a study can gain a paper without gaining a passage of data (D12). */
      chunks,
      passagesOpened,
      papers,
      baselines,
      documentOfChunk,
    ],
  );

  const saturation = useMemo(() => checkSaturation(events, projectId), [events, projectId]);
  const tray = useMemo(() => projectProposals(events, projectId), [events, projectId]);
  const duplicates = useMemo(() => findNearDuplicates(tray.pending, graph), [tray, graph]);
  const spine = useMemo(() => projectSpine(events, projectId), [events, projectId]);
  const territory = useMemo(
    () => projectTerritory(events, MATRIX, projectId),
    [events, projectId],
  );
  const trajectory = useMemo(() => projectTrajectory(events, projectId), [events, projectId]);
  const attribution = useMemo(() => originCensus(livePages(graph), LIVE_PAGES), [graph]);

  // A selected page that has since been retired would otherwise leave the
  // detail pane showing something the graph no longer draws.
  useEffect(() => {
    if (selectedPageId === null) return;
    if (!livePages(graph).some((p) => p.id === selectedPageId)) setSelectedPageId(null);
  }, [graph, selectedPageId]);

  const selectPage = useCallback((id: string | null) => setSelectedPageId(id), []);

  const design = useMemo(
    () => (brief === undefined ? { stations: [] } : designDigest(brief)),
    [brief],
  );

  return {
    events,
    graph,
    design,
    brief,
    interview,
    moves,
    saturation,
    tray,
    duplicates,
    spine,
    territory,
    trajectory,
    attribution,
    chunks,
    documents,
    chunkDocuments: documentOfChunk,
    dataPassagesTouched,
    selectedPageId,
    selectPage,
  };
}
