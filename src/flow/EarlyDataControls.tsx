/**
 * Extraction — the early-data station's own control (D5).
 *
 * Split out of the retired `CorpusPanel`, which carried four unrelated jobs in
 * one box: the brief, the upload, the extraction trigger, and the chunk
 * browser. The brief became the stations; the chunk browser moved to
 * `CorpusMaterial`, because reading your data is something you do at every
 * station, not only at the last one.
 *
 * The upload went the same way in D5, and it went because it was the second
 * one. /material had a picker and so did this, both of them opening on kind
 * `transcript`, and two identical controls on two tabs with one default between
 * them is how a journal editorial came to be filed as fieldwork. Adding a file
 * belongs on the tab called Material, where the two sections say which of the
 * two things a file is. What is left here is the one thing that is not adding a
 * file: extraction spends a model call, and a model call belongs to the station
 * that explains what it is about to do.
 *
 * The rule that matters most survives both moves: extraction produces proposals
 * and nothing else. Nothing the model finds enters the ontology without the
 * researcher adjudicating it one item at a time.
 */

import { useCallback, useRef, useState } from "react";
import { DATA_DOCUMENT_KINDS, dataOnly, type Chunk, type DocumentKind, type StoredDocument } from "../state/chunks.ts";
import type { DataType, DeclaredDataType, Project, ProjectBrief } from "../state/projects.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import type { InferenceClient } from "../inference/types.ts";
import { runSuggestionCounts, suggestedLine } from "../concepts/run.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { activeInferenceClient } from "../ui/personaRun.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { getProject } from "../state/projects.ts";
import { InertNote, inertAttrs } from "../ui/components/index.ts";
import { DeclareEarlyData } from "./DeclareEarlyData.tsx";
import { hasData } from "./earlyData.ts";

/**
 * What staging is waiting on; null once it is live.
 *
 * It named the picker that used to sit above this button, and that picker is on
 * the Material tab now, so the sentence points there. A condition, not an
 * instruction, like every other sentence under an inert control here.
 *
 * The second condition is the kind of material (D22, M43b). The select above this
 * button opened on `interview` and the walk of 2026-09-13 found an ethnography
 * declared as interview data by a control nobody had touched. It opens empty now,
 * so the button waits for it, the way the Material tab's picker waits for its own
 * kind select. The sentence says what the kind is for, because a control held
 * back by a field that does not feed it would be a gate with no reason on screen.
 *
 * Two conditions, one sentence, and the data comes first: a study with no
 * material has nothing to read whatever kind it says it is.
 */
/**
 * One list of data kinds for the Early data menu and the file types on Sources
 * (M74b, ISC-665). The walk met two lists: ethnographic, interview and archival
 * at Early data, and transcript, fieldnote, archival and memo on Sources.
 */
export const DATA_KIND_CHOICES: readonly DocumentKind[] = DATA_DOCUMENT_KINDS;

/** The methods declaration a kind stands for, which the checks and the bias personas read. */
export function dataTypeOfKind(kind: DocumentKind): DataType {
  /* A chat note is an interview written up afterwards (the lead's ruling, M74b). */
  return kind === "transcript" || kind === "chatnote" ? "interview" : kind === "archival" ? "archival" : "ethnographic";
}

/** The kind shown in the Early data menu: the one chosen, or the one an older brief's data type stands for. */
export function chosenKind(brief: Pick<ProjectBrief, "dataType" | "dataKind">): DocumentKind | "" {
  if (brief.dataKind !== undefined && DATA_KIND_CHOICES.includes(brief.dataKind)) return brief.dataKind;
  return brief.dataType === "interview" ? "transcript" : brief.dataType === "ethnographic" ? "fieldnote" : brief.dataType === "archival" ? "archival" : "";
}

/**
 * Read the data and suggest concepts from it: the one pass behind Early data's
 * control and Sources' "Read the data" (M74b, ISC-665), so the two cannot come
 * to read differently.
 */
export async function readTheData(input: {
  readonly project: Project;
  readonly chunks: readonly Chunk[];
  readonly readEvents: (projectId: string) => Promise<readonly LedgerEvent[]>;
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<unknown>;
  readonly client: InferenceClient;
}): Promise<string> {
  const count = await runSuggestionCounts(
    {
      projectId: input.project.id,
      brief: input.project.brief,
      source: { kind: "data", chunkIds: [] },
      chunks: dataOnly(input.chunks),
      readEvents: input.readEvents,
      appendAll: input.appendAll,
    },
    input.client,
  );
  return suggestedLine(count);
}

function stageReason(chunks: number, dataType: DeclaredDataType): string | null {
  /* Kept as a guard rather than removed at M49 (ISC-529). The step swaps the
   * reading control for the declaration control when the study has no data, so
   * this branch is not the ordinary empty state any more. It is still reachable:
   * the swap reads the document list and this reads the passages, and a data
   * file that produced no passages is a study with data and nothing to read. */
  if (chunks === 0) {
    return "Add data on the Sources tab first.";
  }
  if (dataType === "") {
    return "Choose a data type first.";
  }
  return null;
}

export function EarlyDataControls(props: {
  project: Project;
  graph: OntologyGraph;
  /**
   * What the researcher has said their material is, or "" (D22).
   *
   * Passed rather than read off `project.brief`, for the reason the paper row's
   * `judgeable` is passed: the select that sets it is the sibling of this button
   * and holds the unsaved value, so a second reading here would let the button go
   * live against a kind the select is no longer showing.
   */
  dataType: DeclaredDataType;
  /**
   * The station passes its document list, and M49 gave it a reader: which of
   * the two controls this step draws turns on whether the study holds data, and
   * data is a property of the documents rather than of the passages (D5, D12).
   */
  documents: readonly StoredDocument[];
  chunks: readonly Chunk[];
  onChanged: () => void;
}) {
  const { project, graph, documents, chunks, dataType, onChanged } = props;
  const { appendAll, readEvents } = useLedger();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const inFlight = useRef(false);

  /*
   * Your data, not the papers (D5).
   *
   * Extraction proposes pages the researcher's claims will cite, so a candidate
   * lifted out of a journal editorial is somebody else's argument wearing the
   * clothes of evidence. `extractProposals` filters as well, because that is
   * the boundary the anti-criterion is stated at; the filter here is so the
   * count in the label is the count the button will actually read.
   */
  const data = dataOnly(chunks);

  const stage = useCallback(async () => {
    if (inFlight.current || data.length === 0 || dataType === "") return;
    inFlight.current = true;
    setBusy("Reading your data…");
    setError(null);
    try {
      /* M63, ISC-610: a read of the data suggests concepts, with the passages
         behind them, where it used to suggest claims. */
      const { client } = activeInferenceClient();
      setDone(await readTheData({ project, chunks: data, readEvents, appendAll, client }));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  }, [data, dataType, project, readEvents, appendAll, onChanged]);

  /* M49, ISC-529. The step carries the declaration while the study has no data,
   * and the reading control once it has. Two controls for two states, rather
   * than one control held back with a sentence under it: a researcher with no
   * data is not waiting on a condition, they have not got to that part of the
   * study yet. */
  if (!hasData(documents)) {
    return (
      <div className="early-data" data-testid="early-data-controls">
        <DeclareEarlyData
          projectId={project.id}
          land="material"
          onDeclared={onChanged}
        />
      </div>
    );
  }

  return (
    <div className="early-data" data-testid="early-data-controls">
      {/* The eighth inert control, on a station the 1440 sweep did not reach.
          It read "Read the corpus and stage candidates (0 chunks)" as a dead
          primary on every fresh study, with the count in the label as the only
          hint at why, and the count is not the reason, the empty corpus is.

          The label is a verb phrase naming what happens when you press it, and
          it no longer moves: the count that used to sit inside it is the line
          under the button, so the button says one thing on every study. */}
      <button
        type="button"
        className="primary"
        onClick={() => void stage()}
        data-testid="stage-proposals"
        {...(busy !== null
          ? { disabled: true }
          : inertAttrs("stage-proposals", stageReason(data.length, dataType)))}
      >
        {busy ?? "Suggest concepts"}
      </button>
      {busy === null && (
        <InertNote control="stage-proposals" reason={stageReason(data.length, dataType)} />
      )}
      {/* The passage count went at M49 (ISC-530). The sentence says what the
          reading takes in, which is the fact a researcher presses the button on;
          how many passages that came to is on the record panel and in the
          exports. */}
      <p className="small muted" data-testid="stage-scope">
        Abductive reads your data and leaves the papers alone.
      </p>
      {error !== null && (
        <p className="error small" role="alert" data-testid="corpus-error">
          {error}
        </p>
      )}
      {done !== null && (
        <p className="small muted" role="status" data-testid="stage-done">
          {done}
        </p>
      )}
      <p className="small muted">
        Each concept arrives as a suggestion on the Emerging project ontology tab, and a suggestion
        joins your ontology only when you accept it.
      </p>
    </div>
  );
}

/**
 * "Read the data" in the Data section on Sources (M74b, ISC-665). The walk's
 * student pressed "I have early data", landed on Sources, and found nothing
 * there that read the data. Inert until there is data to read, with the
 * sentence saying so.
 */
export function ReadDataControl(props: {
  readonly projectId: string;
  readonly chunks: readonly Chunk[];
  readonly onChanged: () => void;
}) {
  const { projectId, chunks, onChanged } = props;
  const { appendAll, readEvents } = useLedger();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const data = dataOnly(chunks);
  const reason = data.length === 0 ? "Add data above first." : null;
  const read = useCallback(async () => {
    if (inFlight.current || data.length === 0) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const project = await getProject(projectId);
      if (project === undefined) return;
      const { client } = activeInferenceClient();
      setDone(await readTheData({ project, chunks: data, readEvents, appendAll, client }));
      onChanged();
    } catch (err) {
      setError(`Abductive couldn't read the data: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [data, projectId, readEvents, appendAll, onChanged]);
  return (
    <div className="read-data" data-testid="read-data-control">
      <button
        type="button"
        className="btn-quiet"
        onClick={() => void read()}
        data-testid="read-data"
        {...(busy ? { disabled: true } : inertAttrs("read-data", reason))}
      >
        {busy ? "Reading your data…" : "Read the data"}
      </button>
      {!busy && <InertNote control="read-data" reason={reason} />}
      {error !== null && (
        <p className="error small" role="alert" data-testid="read-data-error">
          {error}
        </p>
      )}
      {done !== null && (
        <p className="small muted" role="status" data-testid="read-data-done">
          {done}
        </p>
      )}
    </div>
  );
}
