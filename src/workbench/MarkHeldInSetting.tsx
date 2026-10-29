/**
 * Saying that an expectation is held by people in your setting, and who holds it
 * (M44, owner's decision of 2026-09-13).
 *
 * The expectation chooser offers what the papers expect and what the researcher
 * brought, and it excludes an expectation the model drafted out of the
 * researcher's own material, so that a study cannot break its own reading of its
 * own transcript and call that a contribution. That decision stands. What it also
 * kept out is a board paper's stated aim: the most documented expectation anyone in
 * the Coldharbour programme held, in the model as an expectation, and the one the
 * study's puzzle plainly breaks. Two checks on the walk of 2026-09-13 told the
 * researcher their puzzle was paired with the wrong expectation while the right one
 * sat unreachable.
 *
 * So the mark is how a real expectation in the setting reaches the list, and the
 * holder is required. "Held in the setting" with nobody named would be the tool
 * asserting something about a field site on the researcher's behalf, and "the
 * board, in the January paper" is a sentence a reader of the record can check.
 *
 * Two steps, like every other control on this card that writes to the record: the
 * control that asks is not the control that acts.
 */

import { useState } from "react";
import { InertNote, inertAttrs } from "../ui/components/index.ts";

export function MarkHeldInSetting(props: {
  /** The expectation's title, so the question names what it is about. */
  readonly title: string;
  /** Who holds it already, when the researcher has marked it before. */
  readonly heldBy?: string;
  readonly onMark: (heldBy: string) => void;
  readonly testId?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [holder, setHolder] = useState(props.heldBy ?? "");
  const id = props.testId ?? "held-in-setting";
  /* Inert rather than hand-disabled, so the control says what would wake it. The
   * rule and the reason are `RetireClaim.tsx`'s, and `inert-state.test.ts` holds
   * both. */
  const blocked = holder.trim() === "" ? "Name its holder first." : null;

  if (!armed) {
    return (
      <button
        type="button"
        className="btn-bare held-ask"
        data-testid={`${id}-ask`}
        aria-expanded={false}
        onClick={() => setArmed(true)}
      >
        {props.heldBy === undefined
          ? "Name holder"
          : "Change holder"}
      </button>
    );
  }

  return (
    <div className="held-confirm" data-testid={`${id}-confirm`}>
      <label className="field-label small" htmlFor={`${id}-holder`}>
        Who holds this expectation in your setting?
      </label>
      <p className="small muted field-hint">
        Name the holder and the place where they said it, like the board, in the January paper.
      </p>
      <input
        id={`${id}-holder`}
        type="text"
        value={holder}
        data-testid={`${id}-holder`}
        onChange={(e) => setHolder(e.target.value)}
      />
      <p className="small muted field-hint">
        {`Your puzzle can then break "${props.title}", beside the expectations from your papers.`}
      </p>
      <div className="btnrow">
        <button
          type="button"
          className="primary"
          data-testid={`${id}-go`}
          {...inertAttrs(id, blocked)}
          onClick={() => {
            if (blocked !== null) return;
            props.onMark(holder.trim());
            setArmed(false);
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="btn-quiet"
          onClick={() => {
            setArmed(false);
            setHolder(props.heldBy ?? "");
          }}
        >
          Cancel
        </button>
      </div>
      <InertNote control={id} reason={blocked} />
    </div>
  );
}
