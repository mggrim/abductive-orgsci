/**
 * The question a paper the tool cannot place carries, and the answer to it
 * (M51, ISC-533).
 *
 * What stood here before was a verdict and a sentence under it: "doesn't fit",
 * then "This paper expects nothing about a setting like yours". A co-author,
 * reading their own reading list on 2026-09-21: the tool is "too self-confident",
 * and "instead of making judgments, ask: why do you think this is relevant?".
 *
 * So the row asks. The box is the researcher's, the sentence they write is
 * recorded beside the paper as their own act, and the tool reads the paper again
 * with what they said in the prompt. Nothing is gated and nothing is deleted: a
 * paper with no answer stays in the list, stays in the exports and stays
 * readable, and the only thing the tool withholds is expectations it would have
 * had to invent.
 *
 * One box per paper and no confirmation step, unlike the decline controls on the
 * same row. Those take a decision off the researcher and this takes a sentence,
 * and a sentence they can write again.
 */

import { useCallback, useState } from "react";
import { useLedger } from "../state/ledgerContext.tsx";
import {
  BEARING_PLACEHOLDER,
  BEARING_QUESTION,
  BEARING_SAVE_LABEL,
  bearingEvents,
  type PaperBearing as RecordedBearing,
} from "../views/paperBearings.ts";
import { Field, fieldAria, InertNote, inertAttrs } from "../ui/components/index.ts";
import { editedFrom } from "../concepts/decisions.ts";

/** What the row says under the question, so the box is not the only cue. */
export const BEARING_HINT =
  "Abductive saves your answer beside the paper and reads the paper again with your answer.";

/** What the row says under a line that Abductive prefilled with its placing (M78b, ISC-681). */
export const PLACED_HINT = "Abductive placed this paper under your literatures; edit if that is wrong.";

/** What the row says under the researcher's own saved line (M78b). */
export const SAID_HINT = "You wrote this line. Edit the line and press Save, and Abductive reads the paper again with your words.";

/**
 * Why Save is not live yet, when it is not (M78b, ISC-681). The line opens on
 * Abductive's placing or on the researcher's saved sentence, so Save goes live
 * on an edit: a press on the line as it opened would put Abductive's words on
 * the record as the researcher's, or say the same sentence twice.
 */
export function relateSaveReason(draft: string, opened: string): string | null {
  if (draft.trim() === "") return `${BEARING_SAVE_LABEL} goes live once you have written a line.`;
  return draft.trim() === opened.trim() ? `${BEARING_SAVE_LABEL} goes live once you have edited the line.` : null;
}

/** M51's reason, kept for the callers that read it. */
export function bearingSaveReason(draft: string): string | null {
  return relateSaveReason(draft, "");
}

/**
 * The question under every paper on Sources (M78b, ISC-681). Until M78b only a
 * paper that Abductive couldn't place carried it, so on the serendipity walk,
 * where Abductive placed all six papers, the student saw it under none. The line
 * opens on the researcher's own sentence when they have written one, on
 * Abductive's placing when it has one, and empty otherwise.
 */
export function PaperBearing(props: {
  projectId: string;
  paperKey: string;
  paperName: string;
  /** The sentence already on the record, when the researcher has written one. */
  bearing?: RecordedBearing;
  /** Abductive's own sentence placing the paper, when it has one (M78b). */
  placing?: string | undefined;
  /** M93, ISC-768: the `paper-fit` event that sentence is the reason of. */
  placingFrom?: string | undefined;
  /** Called once the answer is on the record, so the page can reread. */
  onSaved: () => void;
  /** Suffix for this row's test ids, so two rows do not collide. */
  testId: string;
}) {
  const { projectId, paperKey, paperName, bearing, onSaved, testId } = props;
  const placing = (props.placing ?? "").trim();
  const opened = bearing?.reason ?? placing;
  const { appendAll } = useLedger();
  const [draft, setDraft] = useState(opened);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The line follows a sentence that arrives later (a save, a reading), unless
     the researcher is in the middle of an edit. */
  const [base, setBase] = useState(opened);
  if (base !== opened) {
    setBase(opened);
    if (draft === base) setDraft(opened);
  }
  const reason = relateSaveReason(draft, opened);

  const save = useCallback(async () => {
    const said = draft.trim();
    if (relateSaveReason(draft, opened) !== null || busy) return;
    setBusy(true);
    setError(null);
    try {
      await appendAll([
        ...bearingEvents({
          projectId,
          paperKey,
          paperName,
          reason: said,
          /* M93, ISC-768: a line that opened on Abductive's placing names it, and says whether it changed. */
          ...(bearing === undefined && placing !== "" && props.placingFrom !== undefined
            ? { startedFrom: props.placingFrom, edited: editedFrom(placing, said) }
            : {}),
        }),
      ]);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [appendAll, busy, draft, opened, onSaved, paperKey, paperName, projectId, bearing, placing, props.placingFrom]);

  const hint = bearing !== undefined ? SAID_HINT : placing !== "" ? PLACED_HINT : BEARING_HINT;
  return (
    <div className="paper-bearing" data-testid={bearing !== undefined ? `bearing-said-${testId}` : `bearing-ask-${testId}`}>
      <Field label={BEARING_QUESTION} htmlFor={`bearing-${testId}`} hint={hint}>
        <textarea
          id={`bearing-${testId}`}
          rows={3}
          value={draft}
          placeholder={BEARING_PLACEHOLDER}
          data-testid={`bearing-input-${testId}`}
          data-placed={bearing === undefined && placing !== "" ? "true" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          {...fieldAria(`bearing-${testId}`, { hint: true })}
        />
      </Field>
      <div className="btnrow">
        <button
          type="button"
          className="btn"
          data-testid={`bearing-save-${testId}`}
          {...(busy ? { disabled: true } : inertAttrs(`bearing-save-${testId}`, reason))}
          onClick={() => void save()}
        >
          {BEARING_SAVE_LABEL}
        </button>
      </div>
      <InertNote control={`bearing-save-${testId}`} reason={reason} />
      {error !== null && (
        <p className="error small" role="alert" data-testid={`bearing-error-${testId}`}>
          {error}
        </p>
      )}
    </div>
  );
}
