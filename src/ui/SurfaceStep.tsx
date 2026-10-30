/**
 * Surface concepts and relationships, under the chat at every step (M93,
 * ISC-755 to ISC-760).
 *
 * The owner, 2026-10-16: "at each station, it feels like there needs to be a
 * step at the end after the chat has progressed, where the user can click a
 * button that says surface concepts and relationships, which then the model
 * surfaces from the chat, and then the user can accept or reject those emerging
 * insights." The label is his, verbatim, and listed in `OWNER_LABELS`.
 *
 * The button opens once the chat holds a reply of the researcher's that no
 * earlier surfacing at this step has read. A press reads both sides of the chat
 * since the last surfacing, with the step's saved summary, and the cards it
 * brings wait under the chat, with the ontology tab's own doors.
 */

import { useCallback, useMemo, useState } from "react";
import { useLedger } from "../state/ledgerContext.tsx";
import type { ProjectBrief } from "../state/projects.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { chatTurnsAt, surfaceReady, surfacingsAt, unsurfacedTurns } from "../concepts/chat.ts";
import { runSurfacing, type SurfacingCounts } from "../concepts/run.ts";
import { numberWord } from "../concepts/vocabulary.ts";
import { activeInferenceClient } from "./personaRun.ts";
import { InertNote, inertAttrs } from "./components/index.ts";
import { StationSuggestions } from "./ConceptsView.tsx";

/** The owner's label for the control, verbatim (2026-10-16). */
export const SURFACE_LABEL = "Surface concepts and relationships";

/** The one sentence under the control while it is open. */
export const SURFACE_LEDE = "Abductive considers both sides of this chat since your last surfacing, with the summary that you saved here.";

/** Why the control is inert: the chat holds no reply of the researcher's yet. */
export const SURFACE_NEEDS_REPLY = "Reply in the chat first, and Abductive can surface concepts and relationships from it.";

/** Why the control is inert: every reply here has been read by a surfacing. */
export const SURFACE_ALL_READ = "Abductive has surfaced from every reply in this chat. Reply again to surface more.";

/** Why the control is inert: a model isn't connected. */
export const SURFACE_OFFLINE = "Connect a model under Model access, and Abductive surfaces concepts and relationships from this chat.";

export const SURFACE_RUNNING = "Abductive is considering both sides of this chat for concepts and relationships.";

/** What a surfacing that brought back zero suggestions says (ISC-760). */
export const SURFACE_EMPTY = "Abductive considered this chat and left your suggestions as they were.";

const counted = (n: number, one: string, many: string) => `${numberWord(n)} ${n === 1 ? one : many}`;

/** The line after a press: what it surfaced, or that it left the suggestions as they were. */
export function surfacedLine(c: SurfacingCounts): string {
  const parts = [
    ...(c.concepts > 0 ? [counted(c.concepts, "concept", "concepts")] : []),
    ...(c.relations > 0 ? [counted(c.relations, "relation", "relations")] : []),
    ...(c.statements > 0 ? [counted(c.statements, "statement", "statements")] : []),
  ];
  const left =
    c.dropped === 0
      ? ""
      : ` Abductive left out ${counted(c.dropped, "suggestion", "suggestions")} because ${c.dropped === 1 ? "it named turns that aren't" : "each named turns that aren't"} in this chat, and History keeps ${c.dropped === 1 ? "the suggestion" : "them"}.`;
  if (parts.length === 0) return `${SURFACE_EMPTY}${left}`;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Abductive surfaced ${list} from this chat. Accept, refine or reject each one below.${left}`;
}

export function SurfaceStep(props: {
  readonly projectId: string;
  /** A station id, or "framing" for Starting point. */
  readonly place: string;
  readonly brief: ProjectBrief;
  readonly graph: OntologyGraph;
  readonly chunks: readonly Chunk[];
  readonly documents: readonly StoredDocument[];
  readonly onChanged: () => void;
}) {
  const { projectId, place, brief, onChanged } = props;
  const { events, readEvents, appendAll } = useLedger();
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ready = useMemo(() => surfaceReady(events, projectId, place), [events, projectId, place]);
  const spoken = useMemo(() => chatTurnsAt(events, projectId, place).some((t) => t.who === "researcher"), [events, projectId, place]);
  const last = useMemo(() => surfacingsAt(events, projectId, place).at(-1) ?? null, [events, projectId, place]);
  const fresh = useMemo(() => unsurfacedTurns(events, projectId, place).length, [events, projectId, place]);
  const live = activeInferenceClient().live;
  const reason = running ? null : !spoken ? SURFACE_NEEDS_REPLY : !ready ? SURFACE_ALL_READ : !live ? SURFACE_OFFLINE : null;
  const control = `surface-${place}`;
  const busy = running;

  const surface = useCallback(() => {
    const { client, live: connected } = activeInferenceClient();
    if (!connected || running) return;
    setRunning(true);
    setNote(null);
    void runSurfacing({ projectId, brief, place, readEvents, appendAll }, client)
      .then((counts) => {
        setNote(surfacedLine(counts));
        onChanged();
      })
      .catch((err: unknown) => setNote(`Abductive couldn't surface concepts from this chat: ${err instanceof Error ? err.message : String(err)}. Try again.`))
      .finally(() => setRunning(false));
  }, [appendAll, brief, onChanged, place, projectId, readEvents, running]);

  /* ISC-760: a surfacing that brought back zero suggestions says so on the page,
     after a reload too, until the chat moves on. */
  const settledEmpty = note === null && !running && last !== null && last.suggestions === 0 && fresh === 0;

  return (
    <section className="surface-step" data-testid="surface-step" data-place={place}>
      <div className="surface-control">
        <button
          type="button"
          className={ready && live ? "primary" : "btn-quiet"}
          disabled={busy}
          {...inertAttrs(control, reason)}
          onClick={() => {
            if (reason === null) surface();
          }}
          data-testid="surface-concepts"
        >
          {SURFACE_LABEL}
        </button>
        <InertNote control={control} reason={reason} />
        {reason === null && !running && (
          <p className="small muted" data-testid="surface-lede">
            {SURFACE_LEDE}
          </p>
        )}
      </div>
      {running && (
        <p className="small muted" role="status" data-testid="surface-running">
          {SURFACE_RUNNING}
        </p>
      )}
      {note !== null && !running && (
        <p className="small muted" role="status" data-testid="surface-note">
          {note}
        </p>
      )}
      {settledEmpty && (
        <p className="small muted" role="status" data-testid="surface-empty">
          {SURFACE_EMPTY}
        </p>
      )}
      <StationSuggestions
        projectId={projectId}
        place={place}
        events={events}
        graph={props.graph}
        chunks={props.chunks}
        documents={props.documents}
      />
    </section>
  );
}
