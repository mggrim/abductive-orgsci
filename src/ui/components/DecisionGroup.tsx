/**
 * Accept, decline with reason, defer (FND-06).
 *
 * The vocabulary lives in decisions.ts; this renders it. Three rules the
 * surfaces inherit by using the component rather than by remembering:
 *
 * The reason field enters the tab order only when the decline path is live. A
 * field that is always mounted but only sometimes meaningful is a tab stop the
 * researcher hits on every pass and has to reason about. It is not mounted, so
 * it is out of the accessibility tree and out of sequential focus navigation at
 * once, and decisionTabOrder below states that as a pure function a test can
 * read without a DOM.
 *
 * Declining is never penalised and never a second-class control. Accept is
 * primary because there has to be an expected path; decline and defer are drawn
 * at equal weight to each other and comparable to accept, which is the opposite
 * of what shipped, where all three were the same 35px outline pill and nothing
 * read as the expected path at all.
 *
 * Nothing here writes to the ledger. The surface owns the append, because the
 * event shape differs per object family and because a primitive that wrote
 * events would make a keystroke able to accept a page, which the keyboard model
 * forbids outright.
 */

import { useId, useState } from "react";
import {
  DECISION_VERBS,
  REASON_CLOSED,
  canRecordDecline,
  decisionButtonClass,
  decisionRoles,
  editReason,
  openReason,
  reasonGiven,
  type DecisionRole,
  type ReasonDraft,
} from "./decisions.ts";

/**
 * The focusable controls this group puts in the document, in order.
 *
 * Logical names rather than DOM ids, because the ids are per-instance and the
 * property under test is the sequence. The reason field, and the two controls
 * that only make sense beside it, appear in this list exactly when the decline
 * path is live.
 */
export function decisionTabOrder(
  roles: readonly DecisionRole[],
  draft: ReasonDraft,
): readonly string[] {
  const row = roles.map((role) => `decide:${role}`);
  return draft.open
    ? [...row, "decline:reason", "decline:record", "decline:back"]
    : row;
}

export function DecisionGroup(props: {
  /** Called with the role and, for decline, whatever reason was given. */
  onDecide: (role: DecisionRole, reason: string) => void;
  /** Per-surface wording. The role is fixed; the label may fit the object. */
  labels?: Partial<Record<DecisionRole, string>>;
  /** Roles this object does not offer. Decline cannot be dropped. */
  omit?: readonly DecisionRole[];
  /** Shown under the row. A statement about the record, not an instruction. */
  note?: string;
  /** An append is in flight. The row is inert and says so. */
  pending?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const { onDecide, labels, omit, note, pending, disabled, testId } = props;
  const [draft, setDraft] = useState<ReasonDraft>(REASON_CLOSED);
  const uid = useId();
  const roles = decisionRoles(omit ?? []);
  const busy = pending === true;
  const inert = busy || disabled === true;
  const panelId = `${uid}-decline`;
  const fieldId = `${uid}-reason`;

  function press(role: DecisionRole) {
    if (role !== "decline") {
      onDecide(role, "");
      return;
    }
    // The decline button opens and closes the panel and records nothing on its
    // own. Recording is the button inside the panel, so the reason is part of
    // the act rather than a follow-up the researcher can be walked past, and so
    // no single press of anything in this row is a disposal.
    setDraft(draft.open ? REASON_CLOSED : openReason());
  }

  function record() {
    onDecide("decline", reasonGiven(draft));
    setDraft(REASON_CLOSED);
  }

  return (
    <div
      className="decision-group"
      data-pending={busy}
      data-declining={draft.open}
      data-testid={testId ?? "decision-group"}
    >
      <div className="decision-actions">
        {roles.map((role) => (
          <button
            key={role}
            type="button"
            className={decisionButtonClass(role)}
            title={DECISION_VERBS[role].meaning}
            disabled={inert}
            data-role={role}
            {...(role === "decline"
              ? { "aria-expanded": draft.open, "aria-controls": panelId }
              : {})}
            onClick={() => press(role)}
          >
            {labels?.[role] ?? DECISION_VERBS[role].label}
          </button>
        ))}
      </div>

      {/* Mounted only while live, so it is never a dead tab stop. */}
      {draft.open && (
        <div className="decision-reason" id={panelId}>
          {/* Named for the role, not for one surface's wording of it. This read
              "Why you are turning it down", which is the /ontology tray's verb,
              rendered on the one surface that does not use it: the station's
              decline button says "Doesn't apply to this study", and the two controls
              inside this same panel say "Record the decline" and "Kept on the
              record". So the panel's own three strings named the act three
              ways, one of them borrowed from a screen the reader was not on. */}
          <label className="decision-reason-label" htmlFor={fieldId}>
            Why you're declining
          </label>
          {/* Says that the reason is optional at the point of asking. The
           * alternative is a researcher who declines less because declining
           * costs a sentence, which is the behaviour this tool least wants. */}
          <p className="decision-reason-hint" id={`${fieldId}-hint`}>
            Your reason stays in History. You can leave the reason blank.
          </p>
          <input
            id={fieldId}
            className="decision-reason-field"
            aria-describedby={`${fieldId}-hint`}
            autoFocus
            value={draft.reason}
            onChange={(e) => setDraft(editReason(draft, e.target.value))}
          />
          <div className="decision-reason-actions">
            <button
              type="button"
              className="btn-quiet"
              disabled={inert || !canRecordDecline(draft)}
              data-role="record-decline"
              onClick={record}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn-bare"
              data-role="cancel-decline"
              onClick={() => setDraft(REASON_CLOSED)}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {busy && (
        <p className="decision-pending" role="status">
          Saving…
        </p>
      )}
      {note !== undefined && <p className="decision-note">{note}</p>}
    </div>
  );
}
