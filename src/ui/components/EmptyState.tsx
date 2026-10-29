/**
 * The empty state (FND-09).
 *
 * Abductive is empty at t=0 by definition: eight stations unanswered, no ontology,
 * no findings, no material. Every one of those blanks is the product's first
 * impression, and before this component three instrumentation panels answered
 * empty with one bare sentence in no container, ExportBar had no empty state at
 * all, and Dialogue rendered "What should I ask next?" over a list that could be
 * empty while OutstandingBar simultaneously printed "There is no move I can
 * justify from the current ontology" on the same screen.
 *
 * Three slots, and the middle one is the reason the component exists: NN/g's
 * rule is that an empty state says what the status is, teaches one thing in
 * context, and offers one direct path. `teach` is a required prop rather than an
 * optional one, so a surface that ships a bare "Nothing staged." does not
 * compile. That is the whole enforcement mechanism and it is deliberate: the
 * survey found bare sentences on four surfaces, and every one of them was a
 * developer having nothing to hand rather than a decision.
 *
 * The status is a statement of fact, never an instruction, and the action is
 * optional because some surfaces are empty for a reason the researcher cannot
 * act on yet.
 *
 * The loading state is here rather than in each surface because an empty region
 * and a region that has not answered yet look identical, and the difference
 * matters most where the wait is longest: a coherence pass costs a model call.
 */

import type { ReactNode } from "react";
import type { PageType } from "../../ledger/events.ts";
import { PageTypeKeySwatch } from "./PageMark.tsx";

/**
 * The graphic's size in pixels (M32 R10). A number rather than only a CSS
 * declaration so a test can hold the sheet to the figure the ruling names. The
 * swatch itself is a `<span>` sized by `.empty-state-mark > .graphkey-swatch`,
 * because the key swatch is a box rather than an SVG and takes no size prop.
 */
export const EMPTY_STATE_MARK_SIZE = 48;

export interface EmptyStateModel {
  /** What the researcher reads as the headline. Swapped while busy. */
  readonly status: string;
  /** The one thing worth knowing here. Never dropped, including while busy. */
  readonly teach: string;
  readonly busy: boolean;
}

/**
 * Busy replaces the status and keeps the teaching line, because the teaching
 * line is about what this region is for and that does not change while a call
 * is in flight. The default busy status names the wait rather than a spinner's
 * worth of nothing.
 */
export function emptyStateModel(props: {
  status: string;
  teach: string;
  busy?: boolean;
  busyStatus?: string;
}): EmptyStateModel {
  const busy = props.busy === true;
  return {
    status: busy ? (props.busyStatus ?? "Working on it.") : props.status,
    teach: props.teach,
    busy,
  };
}

export function EmptyState(props: {
  /** What is true right now. One clause, no imperative. */
  status: string;
  /** The one thing worth knowing here that the researcher may not know. */
  teach: string;
  /** One control. Not a row of them. */
  action?: ReactNode;
  /** A call is in flight against this region. */
  busy?: boolean;
  /** What the wait is for, if "Working on it." is too vague to be useful. */
  busyStatus?: string;
  /**
   * The graphic (M32 R10): "40% opacity page-type mark at 48px".
   *
   * A page-TYPE mark, and the distinction is the whole reason this prop takes a
   * `PageType` rather than a `PageIdentity`. A page mark asserts an identity —
   * this claim, of this kind, written by this hand — and an empty panel holds
   * no page to assert one about; a disc here carrying a fill share would be
   * claiming an origin for an object that does not exist, which is the shape of
   * the round-eight defect pointed at nothing. `PageTypeKeySwatch` is the one
   * mark in the app that carries a hue with no origin beside it, and PageMark's
   * header says why that is the right one: it names what the hue means rather
   * than drawing a page.
   *
   * So the type a caller passes says which family of thing this panel holds
   * when it is full. It is `aria-hidden`, nothing reads it back, and the words
   * below it carry everything the researcher needs.
   */
  mark?: PageType;
  testId?: string;
}) {
  const { action, mark, testId } = props;
  const model = emptyStateModel(props);
  return (
    <div
      className="empty-state"
      data-busy={model.busy}
      aria-busy={model.busy}
      data-testid={testId ?? "empty-state"}
    >
      {/* Above the status rather than beside it, because the state is centred
       * in its panel and a graphic in the reading direction of a centred block
       * is a graphic the eye meets first. Hidden while busy: the sweep below
       * the status is what that region is saying, and two graphics stacked is
       * the region talking over itself. */}
      {mark !== undefined && !model.busy && (
        <span className="empty-state-mark" aria-hidden="true">
          <PageTypeKeySwatch type={mark} />
        </span>
      )}
      {/* role=status so the swap from waiting to empty is announced. It is the
       * only thing that changes in this region, and a researcher who cannot see
       * it otherwise gets no signal that the call came back. */}
      <p className="empty-state-status" role="status">
        {model.status}
      </p>
      {model.busy && <span className="empty-state-progress" aria-hidden="true" />}
      <p className="empty-state-teach">{model.teach}</p>
      {/* The action is hidden while busy rather than disabled: a control that
       * grays out and comes back reads as a failure, and there is nothing here
       * to act on until the call answers. */}
      {action !== undefined && !model.busy && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
