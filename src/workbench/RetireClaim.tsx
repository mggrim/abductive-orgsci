/**
 * Taking a claim back out of the model, and saying why (walk item 1).
 *
 * A claim could be accepted and never withdrawn. The only way to stop a claim
 * the researcher had decided was wrong from being counted in the census, drawn
 * in the figure and read by the checks was to abandon the study.
 *
 * The reason is required, and it is the point rather than a formality. A study
 * that quietly loses the claims it abandoned cannot show anyone what it
 * considered and dropped, and "we thought this and stopped thinking it, here is
 * what changed" is most of what a reader of the record wants. The claim itself
 * stays, struck through, for the same reason.
 *
 * Two steps, like every other destructive control here: the control that asks
 * is not the control that acts.
 */

import { useState } from "react";
import { InertNote, inertAttrs } from "../ui/components/index.ts";

/** The verb and its object, on the control and again on its confirmation (L4). */
function label(noun: "claim" | "statement" | "concept" | undefined): string {
  return noun === "statement" ? "Retire statement" : noun === "concept" ? "Retire concept" : "Retire claim";
}

export function RetireClaim(props: {
  readonly title: string;
  readonly onRetire: (reason: string) => void;
  readonly testId?: string;
  /** What the thing is called where the control sits: "statement" on the ontology tab (M63). */
  readonly noun?: "claim" | "statement" | "concept";
}) {
  const [armed, setArmed] = useState(false);
  const [reason, setReason] = useState("");
  const id = props.testId ?? "retire";
  /* Inert rather than hand-disabled, so the control says what would wake it.
   * A greyed "Retire it" beside an empty box is a control the researcher has to
   * guess at, and the guess is usually that the tool is refusing them. */
  const blocked = reason.trim() === "" ? "Give a reason first." : null;

  if (!armed) {
    return (
      <button
        type="button"
        className="btn-bare retire-ask"
        data-testid={`${id}-ask`}
        aria-expanded={false}
        onClick={() => setArmed(true)}
      >
        {label(props.noun)}
      </button>
    );
  }

  return (
    <div className="retire-confirm" data-testid={`${id}-confirm`}>
      <label className="field-label small" htmlFor={`${id}-reason`}>
        Why are you dropping {props.title}?
      </label>
      <p className="small muted field-hint">
        {props.noun === "concept"
          ? "The concept leaves your ontology and stays in History with this sentence beside it. You also remove the concept's relations, and its statements go back to Statements to place."
          : `${props.noun === "statement" ? "The statement" : "The claim"} stays in History, struck through, with this sentence beside it.`}
      </p>
      <textarea
        id={`${id}-reason`}
        rows={2}
        value={reason}
        data-testid={`${id}-reason`}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="btnrow">
        <button
          type="button"
          className="btn-danger"
          data-testid={`${id}-go`}
          {...inertAttrs(id, blocked)}
          onClick={() => {
            if (blocked !== null) return;
            props.onRetire(reason.trim());
            setArmed(false);
            setReason("");
          }}
        >
          {label(props.noun)}
        </button>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => {
            setArmed(false);
            setReason("");
          }}
        >
          Cancel
        </button>
      </div>
      <InertNote control={id} reason={blocked} />
    </div>
  );
}
