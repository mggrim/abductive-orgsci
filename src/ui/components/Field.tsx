/**
 * A label, its control, a hint that knows its place, and an error.
 *
 * The station card had the pattern already and had it slightly wrong: the hint
 * sentence was rendering larger than the label it qualified, because the label
 * carried a size and the hint inherited the body. The order here is fixed for
 * the same reason it is fixed on the station card. Label, hint, control, error:
 * the hint is read before the control it explains rather than found underneath
 * it after the researcher has already typed, and the error is read after,
 * because it is about what was typed.
 *
 * The control itself is passed in and takes its chrome from the one
 * `input, textarea, select` rule in base.css, which is what stopped five
 * surfaces rendering browser defaults (FND-03). That means this component
 * cannot put aria on it, so fieldAria below hands the caller exactly the
 * attributes to spread. The wiring is the part surfaces got wrong: a hint that
 * is not referenced by aria-describedby is a sentence a screen reader never
 * reaches, and every hint in the app was in that state.
 */

import type { ReactNode } from "react";

export interface FieldAria {
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
}

/** The ids Field renders. Exported so a caller can point at them by hand. */
export function fieldHintId(htmlFor: string): string {
  return `${htmlFor}-hint`;
}

export function fieldErrorId(htmlFor: string): string {
  return `${htmlFor}-error`;
}

/**
 * Spread onto the control. Hint first, then error, which is the order they are
 * read in and the order they appear on screen.
 */
export function fieldAria(
  htmlFor: string,
  has: { hint?: boolean; error?: boolean },
): FieldAria {
  const ids: string[] = [];
  if (has.hint === true) ids.push(fieldHintId(htmlFor));
  if (has.error === true) ids.push(fieldErrorId(htmlFor));
  return {
    ...(ids.length === 0 ? {} : { "aria-describedby": ids.join(" ") }),
    ...(has.error === true ? { "aria-invalid": true as const } : {}),
  };
}

export function Field(props: {
  label: string;
  /** The id the caller put on its own control, so the label points at it. */
  htmlFor: string;
  hint?: string;
  /** What is wrong with what was typed. Never a reason the tool refused. */
  error?: string;
  /**
   * The label is the control's visible face (M32c, fix 4).
   *
   * One caller, the file picker on Material. A `<input type="file">` renders
   * two strings the browser owns, "Choose Files" and "No file chosen", and no
   * CSS can change either, so the one control on that screen where a researcher
   * brings in their own transcripts spoke in the browser's voice next to
   * tokenised selects. The way out is to hide the native control and give the
   * job to something the app draws, and the label is already that something:
   * this component has always rendered `<label htmlFor>`, so clicking "Add your
   * data" has always opened the picker. What was missing was for it to look
   * like the control it already was.
   *
   * A face rather than a new button, because a button would be a second visible
   * thing saying what the label says, and no new string enters the product this
   * way.
   *
   * Off by default and read nowhere else, so every other field in the app
   * renders the same three elements with the same class strings it always did.
   */
  labelIsControl?: boolean;
  /**
   * The face reads as not-live. It mirrors the control's own inert state rather
   * than deciding it: the picker is `aria-disabled` and not `disabled`, because
   * `disabled` would take it out of the tab order and the handler owns the stop
   * (see CorpusMaterial's `onUpload`). Without this the face would go on
   * looking pressable while the control behind it refused.
   */
  labelInert?: boolean;
  children: ReactNode;
}) {
  const { label, htmlFor, hint, error, labelIsControl, labelInert, children } = props;
  return (
    <div className="field-row" data-invalid={error !== undefined}>
      <label
        className={labelIsControl === true ? "field-label field-face" : "field-label"}
        htmlFor={htmlFor}
        {...(labelIsControl === true && labelInert === true ? { "data-inert": "true" } : {})}
      >
        {label}
      </label>
      {hint !== undefined && (
        <p className="field-hint" id={fieldHintId(htmlFor)}>
          {hint}
        </p>
      )}
      {children}
      {/* role=alert rather than a live region on the whole row: the error is the
       * only thing here that appears in response to something the researcher
       * did, and announcing the label and hint again with it is noise. */}
      {error !== undefined && (
        <p className="field-error" id={fieldErrorId(htmlFor)} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
