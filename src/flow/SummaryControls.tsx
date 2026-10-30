/**
 * A summary read as text, with the two controls that change it (M92, ISC-752).
 *
 * Matthew, 2026-10-15: "Change the summaries to uneditable, unless somebody
 * clicks a button 'Edit summary'. There should be another button called
 * 'Auto-generate summary from chat'. And remove the summarize button at the end
 * of the page." The two labels are his, verbatim (an exception to L1 recorded in
 * docs/copy-standard.md for the second).
 *
 * Starting point's three summaries and a Design step's summary use the same
 * pieces, so the two pages read alike. Each page keeps its own save: the text
 * that Edit summary or Auto-generate puts in the box waits for Save answer, which
 * is the save that each page already had (on Design it also marks the step
 * answered and starts the concept pass).
 */

import { Cited } from "../ui/CitedText.tsx";
import type { ReactNode } from "react";

export const EDIT_SUMMARY_LABEL = "Edit summary";
export const GENERATE_SUMMARY_LABEL = "Auto-generate summary from chat";
/** The progress state of the second control, one gerund and an ellipsis. */
export const GENERATING_LABEL = "Summarising…";
/** What an empty summary shows in place of its text (L21: what is still to come). */
export const SUMMARY_STILL_TO_COME = "A summary is still to come.";
export const CANCEL_EDIT_LABEL = "Cancel";

/** The summary as text: read-only, line breaks kept. */
export function SummaryText(props: {
  readonly text: string;
  readonly testId: string;
  readonly id?: string;
  /** Abductive wrote the text and the researcher hasn't saved it yet. */
  readonly drafted?: boolean;
}) {
  const empty = props.text.trim() === "";
  return (
    <p
      className={empty ? "summary-text small muted" : "summary-text"}
      data-testid={props.testId}
      data-empty={empty ? "true" : undefined}
      data-drafted={props.drafted === true ? "true" : undefined}
      {...(props.id === undefined ? {} : { id: props.id })}
    >
      {empty ? SUMMARY_STILL_TO_COME : <Cited text={props.text} />}
    </p>
  );
}

/** The two controls under a read-only summary. */
export function SummaryButtons(props: {
  readonly testIdPrefix: string;
  readonly generating: boolean;
  readonly onEdit: () => void;
  readonly onGenerate: () => void;
  /** The page's own save, when the box holds text that is still unsaved. */
  readonly save?: ReactNode;
}) {
  return (
    <div className="summary-buttons" data-mode="read" data-testid={`${props.testIdPrefix}-buttons`}>
      {props.save}
      <button type="button" className="btn-quiet" data-testid={`${props.testIdPrefix}-edit`} onClick={props.onEdit}>
        {EDIT_SUMMARY_LABEL}
      </button>
      <button
        type="button"
        className="btn-quiet"
        data-testid={`${props.testIdPrefix}-generate`}
        aria-busy={props.generating ? "true" : undefined}
        onClick={() => {
          if (!props.generating) props.onGenerate();
        }}
      >
        {props.generating ? GENERATING_LABEL : GENERATE_SUMMARY_LABEL}
      </button>
    </div>
  );
}

/**
 * The row under unsaved text: the page's save, then Cancel. Under a draft that
 * isn't open (an auto-generated summary), Edit summary sits between them, so the
 * researcher can open the draft and replace its [...] markers before saving.
 */
export function EditButtons(props: {
  readonly testIdPrefix: string;
  readonly save: ReactNode;
  readonly onCancel: () => void;
  readonly onEdit?: () => void;
}) {
  return (
    <div className="summary-buttons" data-testid={`${props.testIdPrefix}-editing`}>
      {props.save}
      {props.onEdit !== undefined && (
        <button type="button" className="btn-quiet" data-testid={`${props.testIdPrefix}-edit`} onClick={props.onEdit}>
          {EDIT_SUMMARY_LABEL}
        </button>
      )}
      <button type="button" className="btn-quiet" data-testid={`${props.testIdPrefix}-cancel`} onClick={props.onCancel}>
        {CANCEL_EDIT_LABEL}
      </button>
    </div>
  );
}
