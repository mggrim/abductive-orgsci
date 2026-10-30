/**
 * The tool's puzzle reading, offered at the puzzle step (M58, ISC-567).
 *
 * From M40 to M57 the puzzle was never a field: the tool read it from the saved
 * answers and showed the reading on Starting point. M58 makes the puzzle a step
 * of the inner loop, and the reading becomes the first draft offered into that
 * step's conversation: a tool turn that proposes the reading and asks whether it
 * is the puzzle. The researcher answers in their own words, or takes the reading
 * into the answer box with the control beside Save (StationWorkspace), which
 * records the reading as the draft the answer came from.
 *
 * Nothing here writes to the record. The reading is its own `puzzle-reading`
 * event, written by `usePuzzleReading` when the researcher presses the control
 * this turn carries, which is where "Read the puzzle again from my saved
 * answers" lives since M58. The turn is drawn from that event and is not a
 * `question-selection`: the step's question is already the thread's first turn,
 * and a second question on the record would open a question nobody asked for.
 */

import { Cited } from "../ui/CitedText.tsx";
import { useMemo, useState } from "react";
import type { LedgerEvent, PuzzleReadingEvent } from "../ledger/events.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { acceptReading, rejectReading } from "./usePuzzleReading.ts";
import { readingDecision, rejectedBefore, type ReadingDecision } from "../concepts/decisions.ts";
import { InertNote, StatusChip, inertAttrs } from "../ui/components/index.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import type { ProjectBrief } from "../state/projects.ts";
import { latestReading, puzzleAgreement, puzzleState } from "../views/puzzleReading.ts";
import { usePuzzleReading } from "./usePuzzleReading.ts";
import { puzzleReadControl, puzzleSourceLine, READING_NOW } from "./FramingBand.tsx";
import { stationSubject } from "./stationBrief.ts";
import { formatMoment } from "../ui/format.ts";

/** The question the offered reading asks, under the reading itself. */
/* M92, ISC-751: in the owner's terms for the puzzle. */
export const PUZZLE_OFFER_QUESTION = "Is this the surprise that current accounts can't explain?";

/** The sentence over the reading, naming whose words follow. */
export const PUZZLE_OFFER_LEAD = "Abductive suggested this puzzle from your saved answers.";

/* M93, ISC-763: the reading is a suggestion with its own decision. */
export const READING_PENDING_LINE = "Accept the suggested puzzle to make the puzzle your research question. Abductive then considers your research question for its questions and suggestions.";
export const READING_ACCEPTED_LINE = "You accepted this suggested puzzle as your research question.";
export const READING_EDITED_LINE = "You accepted this suggested puzzle in your own words as your research question.";
export const READING_REJECTED_LINE = "You rejected this suggested puzzle, so your research question stays as it was.";

/** The line under a reading for the researcher's decision on it (M93, ISC-763). */
export function readingDecisionLine(decision: ReadingDecision): string | null {
  switch (decision.kind) {
    case "pending":
      return READING_PENDING_LINE;
    case "accepted":
      return decision.edited ? READING_EDITED_LINE : READING_ACCEPTED_LINE;
    case "rejected":
      return READING_REJECTED_LINE;
    case "legacy":
      return null;
  }
}

/**
 * Accept, Edit and Reject on Abductive's reading (M93, ISC-763). Only an
 * accepted or edited reading becomes the research question; Reject takes an
 * optional reason and leaves the research question as it was.
 */
export function ReadingDecisionCard(props: {
  readonly projectId: string;
  readonly reading: PuzzleReadingEvent;
  readonly decision: ReadingDecision;
  readonly onChanged: () => void;
}) {
  const { projectId, reading, decision, onChanged } = props;
  const { appendAll } = useLedger();
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");
  const [text, setText] = useState(reading.text);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const line = readingDecisionLine(decision);
  const act = (write: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    void write()
      .then(() => {
        setMode("view");
        onChanged();
      })
      .catch((err: unknown) => setError(`Abductive couldn't record your decision: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setBusy(false));
  };
  const unwritten = text.trim() === "" ? "Write the puzzle first." : null;
  return (
    <div className="reading-decision" data-testid="reading-decision" data-decision={decision.kind}>
      {decision.kind === "pending" && <StatusChip label="Suggested" tone="notice" testId="reading-suggested-chip" />}
      {line !== null && (
        <p className="small muted" data-testid="reading-decision-line" role="status">
          {line}
        </p>
      )}
      {decision.kind === "pending" && mode === "edit" && (
        <div className="concept-form" data-testid="reading-edit-form">
          <label className="concept-field">
            <span>Research question</span>
            <textarea value={text} rows={3} onChange={(e) => setText(e.target.value)} data-testid="reading-edit-text" />
          </label>
          <div className="concept-actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              {...inertAttrs("reading-edit-save", unwritten)}
              onClick={() => {
                if (unwritten === null) act(() => acceptReading({ projectId, reading, text, appendAll }));
              }}
              data-testid="reading-edit-save"
            >
              Save puzzle
            </button>
            <InertNote control="reading-edit-save" reason={unwritten} />
            <button type="button" className="btn-bare" onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {decision.kind === "pending" && mode === "reject" && (
        <div className="concept-form" data-testid="reading-reject-form">
          <label className="concept-field">
            <span>Reason (optional)</span>
            <textarea value={reason} rows={2} onChange={(e) => setReason(e.target.value)} data-testid="reading-reject-reason" />
          </label>
          <div className="concept-actions">
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => rejectReading({ projectId, reading, appendAll, ...(reason.trim() === "" ? {} : { reason }) }))}
              data-testid="reading-reject-confirm"
            >
              Reject puzzle
            </button>
            <button type="button" className="btn-bare" onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {decision.kind === "pending" && mode === "view" && (
        <div className="concept-actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => act(() => acceptReading({ projectId, reading, appendAll }))}
            data-testid="reading-accept"
          >
            Accept
          </button>
          <button type="button" onClick={() => setMode("edit")} data-testid="reading-edit">
            Edit
          </button>
          <button type="button" className="btn-bare" onClick={() => setMode("reject")} data-testid="reading-reject">
            Reject…
          </button>
        </div>
      )}
      {error !== null && (
        <p className="error small" role="alert" data-testid="reading-decision-error">
          {error}
        </p>
      )}
    </div>
  );
}

/** The control after a saved puzzle, one label in every state but the wait. */
export const READ_PUZZLE_AGAIN = "Suggest puzzle again";

export interface SavedPuzzlePanel {
  /** The researcher's saved puzzle, as they saved it. */
  readonly text: string;
  /** When Abductive last read your answers, or what went wrong. */
  readonly line: string;
  /** Whether that reading agrees with the saved puzzle, or null before any reading. */
  readonly agreement: string | null;
  /** The control's label, or null while a reading is in the air. */
  readonly control: string | null;
}

/**
 * The panel once the researcher has saved a Puzzle summary (M74a, ISC-661).
 *
 * The walk of 2026-10-02 (finding 9): the student saved a puzzle with an
 * expectation and a contrast, and the panel still read Abductive's earlier
 * "No puzzle yet. You haven't saved an answer with your expectation in it",
 * with the control to read again gone, after a reload too. The panel read only
 * the reading. With a saved puzzle it shows the saved puzzle, dates Abductive's
 * last reading against the save, always offers a fresh reading, and says whether
 * that reading of the observations agrees (the lead's ruling B: the reading
 * leaves the saved puzzle out, so it can't agree by construction).
 */
export function savedPuzzlePanel(input: {
  readonly brief: ProjectBrief;
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
  readonly reading: boolean;
  readonly error: string | null;
}): SavedPuzzlePanel | null {
  const text = (input.brief.puzzleAnswer ?? "").trim();
  if (text === "") return null;
  const subject = stationSubject("puzzle");
  let savedAt: number | null = null;
  for (const e of input.events) {
    if (e.type === "bound" && e.projectId === input.projectId && e.subject === subject) savedAt = e.ts;
  }
  const last = latestReading(input.events, input.projectId);
  const line =
    input.error !== null
      ? `Abductive couldn't suggest a puzzle: ${input.error}`
      : input.reading
        ? READING_NOW
        : last === null
          ? "Abductive hasn't suggested a puzzle from your answers yet."
          : savedAt !== null && last.ts < savedAt
            ? `Abductive last considered your answers ${formatMoment(last.ts)}, before you saved this puzzle.`
            : `Abductive last considered your answers ${formatMoment(last.ts)}.`;
  const agreement = input.reading || input.error !== null ? null : puzzleAgreement(text, last);
  return { text, line, agreement, control: input.reading ? null : READ_PUZZLE_AGAIN };
}

export function PuzzleOffer(props: {
  readonly projectId: string;
  readonly brief: ProjectBrief;
  readonly events: readonly LedgerEvent[];
  readonly chunks: readonly Chunk[];
  readonly documents: readonly StoredDocument[];
  readonly onChanged: () => void;
}) {
  const { projectId, brief, events, chunks, documents, onChanged } = props;
  const { readNow, reading, error } = usePuzzleReading(projectId);
  const state = useMemo(
    () => puzzleState({ brief, chunks, documents, events, projectId }),
    [brief, chunks, documents, events, projectId],
  );
  const control = puzzleReadControl(state, { reading, error });
  const hasText = state.kind === "read" || state.kind === "stated";
  const saved = savedPuzzlePanel({ brief, events, projectId, reading, error });
  const readAgain = () =>
    void readNow().then(() => {
      onChanged();
    });
  /* M93, ISC-763: the latest reading's decision, on both panels. */
  const last = latestReading(events, projectId);
  const lastDecision: ReadingDecision | null =
    last === null || last.text.trim() === ""
      ? null
      : (() => {
          const d = readingDecision(events, projectId, last);
          return d.kind === "pending" && rejectedBefore(events, projectId, last) ? ({ kind: "rejected" } as const) : d;
        })();
  const decisionCard =
    last !== null && lastDecision !== null && !reading ? (
      <ReadingDecisionCard key={last.id} projectId={projectId} reading={last} decision={lastDecision} onChanged={onChanged} />
    ) : null;

  if (saved !== null) {
    return (
      <div className="puzzle-offer" data-testid="puzzle-offer" data-state="saved">
        <p>Your puzzle, as you saved it:</p>
        <blockquote className="puzzle-offer-text" data-testid="puzzle-offer-text">
          <Cited text={saved.text} />
        </blockquote>
        <p className="small muted" data-testid="puzzle-offer-source" role="status">
          {saved.line}
        </p>
        {saved.agreement !== null && lastDecision?.kind !== "rejected" && <p data-testid="puzzle-offer-agreement">{saved.agreement}</p>}
        {decisionCard}
        {saved.control !== null && (
          <button type="button" className="chat-chip" data-testid="puzzle-offer-read" onClick={readAgain}>
            {saved.control}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="puzzle-offer" data-testid="puzzle-offer" data-state={state.kind}>
      {hasText ? (
        <>
          {state.kind === "read" && <p>{PUZZLE_OFFER_LEAD}</p>}
          <blockquote className="puzzle-offer-text" data-testid="puzzle-offer-text">
            <Cited text={state.text} />
          </blockquote>
          <p className="turn-asked">{PUZZLE_OFFER_QUESTION}</p>
          {state.kind === "read" && decisionCard}
        </>
      ) : null}
      <p className="small muted" data-testid="puzzle-offer-source" role="status">
        {puzzleSourceLine(state, { reading, error })}
      </p>
      {control !== null && (
        <button
          type="button"
          className="chat-chip"
          data-testid="puzzle-offer-read"
          onClick={readAgain}
        >
          {control}
        </button>
      )}
    </div>
  );
}
