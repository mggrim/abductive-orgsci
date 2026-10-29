/**
 * Where this came from, on hover and on focus (M39, ISC-505).
 *
 * One small control on the row the answer is on, and a box that opens beside it.
 * ISC-505 is explicit about what this is not: not a new screen, and not a new
 * line of text under every item. A researcher who never wonders where an answer
 * came from should not pay a line of their screen for the question, and one who
 * does wonder should not have to leave the page to ask it.
 *
 * What it says is `views/provenance.ts`'s output and nothing else. This file
 * draws; the projection reads and the projection owns the words for the one
 * distinction that has words. Opening the box appends nothing to the record: the
 * `attention` event type is keyed on a chunk and written only by
 * `CorpusMaterial.tsx`, so there is no path by which reading provenance becomes
 * attention data.
 *
 * The behaviour is `components/Popover.tsx`'s, which is `CellPopover`'s, so the
 * three failure modes the bias grid already paid for are not paid for again.
 *
 * ## Two subjects, one control
 *
 * ISC-505 names a saved answer and an accepted claim. They are one question on
 * screen and two readings underneath, so `view` is a union and the two bodies
 * are two functions below. The trigger, the box, the hover, the focus, the pin
 * and the link into the record are the same for both; a second component would
 * have copied all six to vary the four lines inside.
 */

import { useRef, useState } from "react";
import { Popover, usePopover } from "./Popover.tsx";
import { formatMoment } from "../format.ts";
import { openRecord } from "../routes.ts";
import { pluralise } from "../format.ts";
import {
  ACCEPTED_BY,
  EDITED_LINE,
  MARKED_BY,
  noTurnsLine,
  type ClaimProvenanceView,
  type ProvenanceView,
} from "../../views/provenance.ts";

const WIDTH = 320;

/** What the trigger says to a screen reader, and to a pointer that rests on it. */
export const PROVENANCE_LABEL = "Where this came from";

export function ProvenancePopover(props: {
  /** The reading, or null when the record holds nothing to show yet. */
  readonly view: ProvenanceView | ClaimProvenanceView | null;
  /** What the box is called, so a screen reader hears which answer it is about. */
  readonly about: string;
  readonly testId?: string;
}) {
  const { view, about, testId } = props;
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const held = useRef<HTMLButtonElement | null>(null);
  const pop = usePopover();

  /* Nothing saved and no draft behind it, so nothing to ask about. A trigger
   * that opens a box saying "nothing yet" is a control answering a question
   * nobody asked, and it would sit on every empty step in the study and on every
   * claim the researcher wrote themselves. */
  if (view === null) return null;

  return (
    <>
      <button
        type="button"
        className="prov-trigger"
        ref={(el) => {
          held.current = el;
          setTrigger(el);
        }}
        title={PROVENANCE_LABEL}
        data-testid={testId === undefined ? "provenance-trigger" : testId}
        {...pop.triggerProps}
      >
        <span className="visually-hidden">{`${PROVENANCE_LABEL}: ${about}`}</span>
        <span aria-hidden="true">?</span>
      </button>

      <Popover
        anchor={trigger}
        open={pop.open}
        pinned={pop.pinned}
        label={`${PROVENANCE_LABEL}: ${about}`}
        width={WIDTH}
        className="prov-box"
        testId={testId === undefined ? "provenance-box" : `${testId}-box`}
        onClose={pop.close}
        onMouseEnter={pop.boxProps.onMouseEnter}
        onMouseLeave={pop.boxProps.onMouseLeave}
      >
        {view.kind === "answer" ? <AnswerBody view={view} /> : <ClaimBody view={view} />}

        {/* One link into the record, and the same one for both subjects. The
            record is a panel over whatever tab you are standing on (M38,
            ISC-494), so this opens it rather than navigating: a route would have
            to remember which tab it covered in order to give it back. Opening it
            at this event needs a payload on that event, which is left for the
            owner and named in the report. */}
        <button
          type="button"
          className="linkish prov-record"
          data-testid="provenance-record"
          onClick={() => {
            pop.close();
            openRecord();
          }}
        >
          Open in History
        </button>
      </Popover>
    </>
  );
}

/**
 * A saved answer: how the text reached the box, and what it was made from.
 *
 * The route first, because it is the question. The rest is what backs it up.
 */
function AnswerBody(props: { readonly view: ProvenanceView }) {
  const { view } = props;
  const turnsLine = noTurnsLine(view);
  return (
    <>
      <p className="prov-route" data-testid="provenance-route">
        {view.routeLine}
      </p>

      {turnsLine !== null && (
        <p className="prov-none small muted" data-testid="provenance-none">
          {turnsLine}
        </p>
      )}

      {view.turns.length > 0 && (
        <>
          <p className="prov-heading small muted">
            {view.turns.length === 1
              ? "Source message"
              : "Source messages"}
          </p>
          <ul className="prov-turns" data-testid="provenance-turns">
            {view.turns.map((turn) => (
              <li className="prov-turn" key={turn.turnId}>
                <span className="prov-who">{turn.who === "you" ? "Your words" : "Abductive's words"}</span>
                {/* A turn from a study that predates places has none, and
                    saying so beats naming a place the record does not hold. */}
                <span className="prov-where small muted">
                  {turn.placeLabel === null ? "outside the steps that History shows" : `at ${turn.placeLabel}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="prov-when small muted" data-testid="provenance-when">
        {`Saved ${formatMoment(view.savedAt)}.`}
      </p>
    </>
  );
}

/**
 * An accepted claim: whose it is, what was said before it, and who let it in.
 *
 * Whose it is leads, because that is what a reader of their own model three
 * weeks on is actually asking, and because the four answers to it are the
 * measurement this whole tool exists to make. The turn is second: a claim with a
 * conversation behind it can be read back, and one without is a claim that
 * arrived with nothing said first, which the map says in the same words.
 *
 * Every sentence here is `views/provenance.ts`'s. This function picks which of
 * them to say and writes none of them, which is the rule the answer body above
 * follows for the one distinction it draws.
 */
function ClaimBody(props: { readonly view: ClaimProvenanceView }) {
  const { view } = props;
  const { turn } = view;
  return (
    <>
      <p className="prov-route" data-testid="provenance-origin">
        {view.originLine}
      </p>

      {view.noTurnLine !== null && (
        <p className="prov-none small muted" data-testid="provenance-none">
          {view.noTurnLine}
        </p>
      )}

      {turn !== null && turn.place !== null && (
        <>
          <p className="prov-heading small muted">The message behind this claim</p>
          <ul className="prov-turns" data-testid="provenance-turns">
            <li className="prov-turn">
              <span className="prov-who">{turn.who === "you" ? "Your words" : "Abductive's words"}</span>
              <span className="prov-where small muted">{`at ${turn.placeLabel ?? ""}`}</span>
            </li>
          </ul>
        </>
      )}

      {/* Who let it into the model, and when. The accept is the act that made
          the claim the study's, so it is the moment worth naming — the same
          reasoning the answer body applies to the save rather than the draft. */}
      <p className="prov-when small muted" data-testid="provenance-accepted">
        {`${ACCEPTED_BY[view.acceptedBy]} ${formatMoment(view.acceptedAt)}.`}
      </p>

      {/* What they did to the words first (D28, M43c). Under the accept rather
          than beside the origin, because the origin says whose claim it is and
          this says what happened to the text on its way in. The card's own WHO
          cell and the census under the table carry the same fact in three
          words, so a reader meets it whether or not they open this box. */}
      {view.edited && (
        <p className="prov-when small muted" data-testid="provenance-edited">
          {EDITED_LINE}
        </p>
      )}

      {/* Counted, not listed. The card this opens from prints the passage ids
          themselves, and a box repeating them would be a second copy of a list
          one press away. A claim citing nothing says nothing here: the lint
          layer is what raises that, on the card, where it can be acted on. */}
      {view.citedPassages > 0 && (
        <p className="prov-when small muted" data-testid="provenance-passages">
          {`This claim cites ${view.citedPassages} ${pluralise(view.citedPassages, "passage")}.`}
        </p>
      )}

      {/* Who said this expectation is held in the setting, and when (M44). The
          holder is on the card this box opens from, one line under the claim's own
          metadata, so what belongs here is whose act the mark was. */}
      {view.heldInSetting !== null && (
        <p className="prov-when small muted" data-testid="provenance-held">
          {`${MARKED_BY[view.heldInSetting.by]} ${formatMoment(view.heldInSetting.at)}.`}
        </p>
      )}
    </>
  );
}
