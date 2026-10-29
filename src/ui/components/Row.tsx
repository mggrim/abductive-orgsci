/**
 * The row (M32 R8).
 *
 * The owner's complaint was that the pages read as a website rather than an
 * application, and the audit put a number on the half of it this file answers:
 * findings on Checks and papers on Material were drawn as `.card` stacks, each
 * one a bordered box with its own radius and its own padding, so eight findings
 * were eight boxes and the border count did more work than the content. An
 * application draws a list of rows. Paradoxically the fix is to make a row
 * *more* row-like and less card-like: one hairline between neighbours, a
 * surface under the pointer, a surface under the one you are on, and the
 * controls kept out of the way until you reach for them.
 *
 * ── Two classes, and the split is load-bearing ──────────────────────────────
 *
 * `.row` is the row's *state*: the hairline below it, the hover surface, the
 * selected surface, and the reveal of its actions. Nothing in it sets `display`
 * or a height, because three of the five surfaces that need those states are
 * elements whose box is not ours to set: `<tr>` in the claims table, `<summary>`
 * on a data document, and the two finding articles that hold four stacked
 * paragraphs rather than one line. A `display: flex` on a `<tr>` does not make
 * a table row into a flex row; it destroys the table.
 *
 * `.row-line` is the row's *box*: the 44px minimum, the mark/body/actions
 * layout, the padding. `Row` below draws both. An element that brings its own
 * box takes `.row` alone and keeps the layout it already had.
 *
 * ── The reveal is never hover-only ──────────────────────────────────────────
 *
 * Actions sit at `opacity: 0` and come back on `:hover`, on `:focus-within`,
 * while the row is selected, while the action itself says it is held open, and
 * unconditionally wherever the pointer cannot hover. Opacity rather than
 * `visibility: hidden` or `display: none` for one reason: a hidden element
 * cannot be focused, so a row whose actions were hidden could never satisfy the
 * focus-within half of the rule. The control stays in the tab order and in the
 * accessibility tree the whole time; only its paint waits.
 *
 * `actionsHeld` is the other half of that. A dismissal opens a reason field
 * below the row and the pointer leaves the row to reach it, so without the hold
 * the control that opened the field disappears while the field is still open.
 *
 * ── The mark ────────────────────────────────────────────────────────────────
 *
 * At the left, and only where the row is about a claim. It is the same call
 * every other surface draws a page with, so the boundary in PageMark.tsx still
 * holds: this file names no hue and no fill share, it hands over a
 * `PageIdentity` and gets rendered output. A row about a paper, a data document
 * or a rule that fired on many passages is not about a claim and draws none,
 * for the same reason a finding whose location is not a page draws none.
 *
 * Presentational, like every primitive here: it appends nothing, spends no
 * model call and navigates nowhere. The surface owns all three.
 */

import type { ReactNode } from "react";
import { PageMark, type PageIdentity } from "./PageMark.tsx";

/** The elements a row may be drawn as. A `<tr>` and a `<summary>` are not here
 * on purpose: both bring their own box and take `rowClass` instead. */
export type RowTag = "div" | "article" | "li";

/**
 * The pointer target, in pixels, and the reason it is a number rather than only
 * a CSS declaration: a test can read it, and 44 is the figure the target-size
 * guidance names rather than one this app invented.
 */
export const ROW_MIN_HEIGHT = 44;

/**
 * The mark's size. 8px, per R8. Smaller than the 14px the claims table and the
 * graph key draw, because this one sits in the row's gutter and identifies the
 * row rather than being the thing the reader is pointing at.
 */
export const ROW_MARK_SIZE = 8;

/**
 * The row's state class, plus whatever the surface calls its own row.
 *
 * Exported for the three elements `Row` cannot draw: a table row, a disclosure
 * summary, and any future surface whose element is decided by semantics rather
 * than by us. Those take the states and keep their own box.
 */
export function rowClass(...extra: readonly (string | false | undefined)[]): string {
  const parts = ["row"];
  for (const cls of extra) {
    if (typeof cls === "string" && cls.trim() !== "") parts.push(cls.trim());
  }
  return parts.join(" ");
}

/**
 * The reveal cluster.
 *
 * `held` is for a flow the row has opened somewhere else on the screen: while
 * it is true the cluster paints whatever the pointer is doing, because the
 * gesture is still in progress and the control that started it disappearing
 * under the researcher's hand is how a two-press flow reads as a broken one.
 */
export function RowActions(props: {
  children: ReactNode;
  /** A flow this row started is still open. */
  held?: boolean;
  testId?: string;
}) {
  return (
    <div
      className="row-actions"
      data-held={props.held === true}
      {...(props.testId === undefined ? {} : { "data-testid": props.testId })}
    >
      {props.children}
    </div>
  );
}

export function Row(props: {
  as?: RowTag;
  /** The claim this row is about, if it is about one. Drawn at the left. */
  page?: PageIdentity;
  /** The row the researcher is on. Takes --surface-selected. */
  selected?: boolean;
  /** Revealed on hover and on keyboard focus. Never hover alone. */
  actions?: ReactNode;
  /** A flow this row opened is still live, so the actions stay painted. */
  actionsHeld?: boolean;
  /** What the surface calls this row, kept so its own rules still reach it. */
  className?: string;
  testId?: string;
  ariaLabelledBy?: string;
  /** Row state a surface or a test reads back: `data-severity`, `data-rule`. */
  data?: Readonly<Record<string, string>>;
  children: ReactNode;
}) {
  const Tag = props.as ?? "div";
  return (
    <Tag
      className={rowClass("row-line", props.className)}
      data-selected={props.selected === true}
      {...(props.testId === undefined ? {} : { "data-testid": props.testId })}
      {...(props.ariaLabelledBy === undefined ? {} : { "aria-labelledby": props.ariaLabelledBy })}
      {...(props.data ?? {})}
    >
      {props.page !== undefined && (
        <span className="row-mark">
          {/* aria-hidden inside PageMark, by the decision PagePanel made: a
              title on the mark made every row announce its own encoding before
              it announced what it was. The row's text carries the words. */}
          <PageMark page={props.page} size={ROW_MARK_SIZE} />
        </span>
      )}
      <div className="row-body">{props.children}</div>
      {props.actions !== undefined && (
        <RowActions held={props.actionsHeld === true}>{props.actions}</RowActions>
      )}
    </Tag>
  );
}
