/**
 * The material and export views (ISC-190, ISC-191).
 *
 * Both were panels in the workbench's right column. They moved out when the
 * navigation gained a study tier, because both are views of the whole study
 * rather than context for answering a station question.
 *
 * The M8 invariant survives the move and is worth restating, because it is the
 * property v2 was forked to create: the researcher's own ontology must stay on
 * screen while they answer questions about it. That is a claim about the
 * Design view, where the ontology, the dialogue and the eight stations still
 * sit together. Reading a transcript or downloading a bundle is not answering
 * a station question, so neither needs the graph beside it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStudyFreshness } from "../state/useStudyFreshness.ts";
import { getProject, listChunks, listDocuments, type Project } from "../state/projects.ts";
import {
  dataChunkCount,
  dataOnly,
  literatureOnly,
  type Chunk,
  type StoredDocument,
} from "../state/chunks.ts";
import { useWorkbench } from "../workbench/useWorkbench.ts";
import { CorpusMaterial } from "../flow/CorpusMaterial.tsx";
import { DeclareEarlyData } from "../flow/DeclareEarlyData.tsx";
import { dataSectionOpen } from "../flow/earlyData.ts";
import { SeminalCorpus } from "../flow/SeminalCorpus.tsx";
import { ExportBar } from "../workbench/ExportBar.tsx";
import { citedChunks, livePages } from "../ontology/schema.ts";
import { exportHeader } from "../views/exportHeader.ts";
import { HowArrived } from "./model/HowArrived.tsx";
import { emptyBrief } from "../state/projects.ts";
import { voicedGraph } from "../views/voicedGraph.ts";
import { MAIN_LANDMARK_ID } from "./landmarks.ts";

/**
 * Chunks are read here rather than taken off `useWorkbench`, and `reread` is
 * the reason. The workbench refetches chunks when the ledger length changes,
 * which is correct for every path that creates chunks by appending an event and
 * wrong for the one this tab just gained: uploading a file writes documents and
 * chunks to storage and appends nothing, so the corpus a researcher had just
 * added stayed invisible until they navigated away and back.
 */
function useStudy(projectId: string) {
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [documents, setDocuments] = useState<readonly StoredDocument[]>([]);
  const [chunks, setChunks] = useState<readonly Chunk[]>([]);
  const [nonce, setNonce] = useState(0);
  const reread = useCallback(() => setNonce((n) => n + 1), []);
  /* And when another tab writes to this study (walk finding). The papers list
   * is edited on this tab and on Design, so two tabs open on one study is not
   * an exotic case: it is the ordinary way somebody compares their material
   * against their framing. */
  useStudyFreshness(projectId, reread);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getProject(projectId),
      listDocuments(projectId),
      listChunks(projectId),
    ]).then(([p, docs, cs]) => {
      if (cancelled) return;
      setProject(p);
      setDocuments(docs);
      setChunks(cs);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, nonce]);
  return { project, documents, chunks, reread };
}

export function StudyMaterial(props: { projectId: string }) {
  const { projectId } = props;
  const { project, documents, chunks, reread } = useStudy(projectId);
  /* M49, ISC-529. Material is the papers until the researcher says they have
     data, or until the study holds some. */
  const showData = dataSectionOpen(project, documents);
  // The graph, for one fact: which passages the ontology already cites. It is
  // the fact this tab was missing and the one the surface's own lede is about,
  // since an uncited passage and an unopened passage are the two halves of what
  // the study has not used.
  const wb = useWorkbench(projectId);
  const cited = citedChunks(wb.graph);
  /*
   * The split this page is now organised around (D5).
   *
   * The papers a researcher is arguing with are not their data, and the product
   * could not tell the difference: both uploads defaulted to `transcript`, so a
   * journal editorial came out filed as fieldwork and every count on this page,
   * every grounding check and the extraction pass all treated it as evidence.
   * One partition, made once, handed to the two sections below.
   */
  /* M29: what the model already holds, by title. The papers section reads it so
   * that reading the papers a second time does not draft the same expectation
   * again. Titles, not the graph: nothing on this tab draws the model. */
  const modelTitles = useMemo(() => livePages(wb.graph).map((p) => p.title), [wb.graph]);
  const literatureDocs = useMemo(() => literatureOnly(documents), [documents]);
  const dataDocs = useMemo(() => dataOnly(documents), [documents]);
  const literatureChunks = useMemo(() => literatureOnly(chunks), [chunks]);
  const dataChunks = useMemo(() => dataOnly(chunks), [chunks]);
  return (
    <main className="studyview" id={MAIN_LANDMARK_ID} tabIndex={-1} data-testid="study-material">
      {/* M32, R3 and R6. The h1 is in the sticky study header now and the two
          ledes are in the popover below, word for word. This page opened with
          "Material" at 22px over a 450px prose column with 650px of blank paper
          beside it, which is the single most document-like thing the critique
          measured.

          R5. The two sections were stacked because the literature column was a
          textarea with no use for the width beside a table of documents that
          wanted all of it. Stacking them fixed that by leaving the whole right
          half of the screen empty instead. They are two panes now: the papers
          you are arguing with, and the data you collected. The order is
          unchanged and it is the order the work happens in. */}
      <div
        className="panel-frame"
        data-panels={showData ? "list-main" : "main"}
        data-testid="material-panels"
      >
        <section className="panel-list">
          {/* M62, ISC-600: The route lede moved into the page's Help control (ui/pageHelp.ts). */}
          <div className="panel-body">
            <SeminalCorpus
              projectId={projectId}
              documents={literatureDocs}
              chunks={literatureChunks}
              onAdded={reread}
              existingTitles={modelTitles}
            />
          </div>
        </section>
        {showData && (
          <section className="panel-main">
            <div className="panel-body">
              <CorpusMaterial
                projectId={projectId}
                documents={dataDocs}
                chunks={dataChunks}
                cited={cited}
                onAdded={reread}
              />
            </div>
          </section>
        )}
      </div>
      {/* M49, ISC-529. Under the papers rather than inside their pane, and the
          whole of what a study with no data says about data: no rows, no counts,
          no empty-state card. Outside the pane because the pane scrolls on its
          own, and a control at the foot of a scroller is a control a researcher
          has to go looking for. */}
      {!showData && (
        <DeclareEarlyData projectId={projectId} land="here" onDeclared={reread} />
      )}
    </main>
  );
}

export function StudyExports(props: { projectId: string }) {
  const { projectId } = props;
  const wb = useWorkbench(projectId);
  const { project, documents } = useStudy(projectId);
  /* The graph the four reading exports get is the graph the Ontology tab shows.
   *
   * The defect this fixes, and it survived four rounds of being named. The
   * Ontology view composed `voicedGraph` so its drawing, index and detail card
   * all read one model draft in the tool's voice, and this line handed
   * `wb.graph` to `ExportBar` raw. `ExportBar` destructures that one object into
   * `buildOntologyMemo`, `buildDiagramSvg`, `buildAgentGraph` and
   * `buildWikiFiles`, so all four inherited whichever graph arrived here.
   * Measured on /exports with `Blob` hooked, on the fixture study: `memo.md` was
   * 4,159 characters carrying one U+2014, in the sentence the detail card one
   * tab away renders with a comma, and `ontology.json` carried two. Screen and
   * file disagreed about the same sentence, under a lede that said they could
   * not. `voiceGate.ts` calls this case the worst of the four it was written
   * for, "because a draft body is accepted into the researcher's own model and
   * then exported under their name", and that is what `memo.md` was doing.
   *
   * Memoised on `wb.graph` because `ExportBar` builds the wiki file set in a
   * `useMemo` keyed on the graph object, and a fresh graph per render would
   * rebuild five files on every keystroke on this page. */
  const graph = useMemo(() => voicedGraph(wb.graph), [wb.graph]);
  /* How this was arrived at (M38, ISC-500).
   *
   * Read here rather than inside `ExportBar`, because it is a header over the
   * whole tab and not a property of the file list. Every number in it comes from
   * a projection some other surface already prints: the turns from
   * `placeSummary` and the census from the same `attribution` Your model reads
   * (the open flags went with the checks at M89). */
  const arrived = useMemo(
    () =>
      exportHeader({
        events: wb.events,
        projectId,
        brief: wb.brief ?? emptyBrief(),
        claims: wb.attribution,
        /* Data only (D12). The header reads Early data through `placeSummaries`,
           and the passages of a paper are not an answer at that step. */
        dataCorpusSize: dataChunkCount(wb.chunks),
      }),
    [wb.events, projectId, wb.brief, wb.attribution, wb.chunks],
  );
  return (
    <main className="studyview" id={MAIN_LANDMARK_ID} tabIndex={-1} data-testid="study-exports">
      {/* M32, R3 and R6. The h1 is in the sticky study header and the lede is
          in the popover ExportBar renders beside the file list's sub-header,
          word for word. Exports was already 80% of the panel grammar, so it is
          the reference implementation for it rather than the surface that had
          to change most. */}
      {/* The lede has been wrong twice and the second version is the
          interesting one.

          It first ended "so they cannot disagree with what is on screen", which
          was false for `ledger.json` and `bundle.json`. It was replaced with a
          claim that those two "keep the model's original punctuation", and that
          was false too, in a way nobody checked: both serialise the events this
          component is handed, those events have come through
          `normaliseLedgerProse`, and that normaliser had five event types in its
          table. Measured on the fixture study, the stored ledger held ten rows
          carrying a banned dash and the exported `ledger.json` held two. Neither
          the record nor the reading, under a sentence promising the record.

          Both files are now consistent readings that carry the record with them:
          every rewritten field keeps what the model wrote on `asWritten`, and
          `parseBundle` puts those originals back on import, so a co-author's
          ledger matches the one it came from. The sentence below says that, and
          it is checkable by opening either file.

          The third sentence is this round's, and it is here because keeping the
          original was measured and found to cost the house rule. The rule is
          that nothing the tool exports carries an em dash or an en dash;
          `ledger.json` and `bundle.json` carried twelve each, all of them inside
          the kept original. So the two record files write those characters as
          JSON escapes, which is the format's own way of holding a character
          without spelling it. Nothing is edited and nothing is lost; the value a
          parser reads back is identical. See src/export/recordJson.ts. */}
      {/* M28: copy. This lede was 54 words in its second sentence, four
          clauses, three unglossed terms of art, and nothing the reader does. It
          was a changelog entry printed as page copy on a screen somebody opened
          to download a file. The build rationale about JSON escaping lives in
          src/export/recordJson.ts, where it is addressed to the person who
          needs it. The copy critic's paste-ready sample, 4j. */}
      {/* Above the files, because it is what a reader wants before they take
          one: how much record is behind them. ISC-500. */}
      <HowArrived projectId={projectId} view={arrived} />

      {project !== undefined && (
        <ExportBar
          project={project}
          graph={graph}
          events={wb.events}
          chunks={wb.chunks}
          documents={documents}
        />
      )}
    </main>
  );
}
