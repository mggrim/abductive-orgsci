/**
 * The inert control (FND-03, FND-06).
 *
 * A seventh primitive, added after the sixth round, because disabled was the
 * one control state the foundations layer never designed and it is the state
 * that contradicts the product. base.css carried `button:disabled { opacity:
 * 0.5 }` and nothing else; measured live at 1440 that was seven controls on six
 * of the ten routes, labels at 3.00:1 and 3.34:1, and not one of them carrying
 * a title, an aria-disabled, an aria-describedby, or a sentence anywhere on the
 * page saying what would wake it.
 *
 * The appearance was the smaller half. The house rule is that nothing gates and
 * that the tool never says it does, and a greyed unexplained primary is the
 * canonical picture of a gate. The app was drawing one on the first action of
 * the first two screens a researcher ever meets, and the worst instance sat on
 * the Context station: "No changes", a dead slab directly above the sentence
 * "Setting a station aside is recorded, not counted against you", which does
 * not mention it.
 *
 * So an inert control here is never bare. It is a pair: the control, and a
 * sentence naming the condition that makes it live, rendered on the page and
 * wired to the control with aria-describedby. Three properties the pair has to
 * keep, and each is a thing the seven were doing wrong:
 *
 *   The sentence is visible. A `title` is not an explanation. It does not
 *   print, it does not exist on a touch screen, and it is one hover away from
 *   never being read. `title` is set as well, because it costs nothing and a
 *   mouse user reaching for the dead control is the person asking the question.
 *
 *   The sentence states a condition, never an instruction. "Connect goes live
 *   once a key is in the field above" is an observation about the form. "You
 *   must enter a key" is the tool telling the researcher what to do, which is
 *   the register the rest of the app spent five rounds getting out of.
 *
 *   The sentence names the control. The researcher reading it is looking at a
 *   screen with several controls on it and has to know which one it is about.
 *
 * What this deliberately does not cover is the other kind of inert. A control
 * held while a write is in flight, `disabled={busy}`, is momentary, it needs no
 * paragraph, and a paragraph that flickered for 200ms would be worse than none.
 * Those keep the plain attribute and get the designed appearance from base.css.
 * tests/inert-state.test.ts holds the line between the two: an inert-at-rest
 * control without a reason fails.
 */

/** The id the note renders under and the control points at. */
export function inertNoteId(control: string): string {
  return `${control}-inert`;
}

export interface InertAttrs {
  readonly "aria-disabled"?: true;
  readonly title?: string;
  readonly "aria-describedby"?: string;
}

/**
 * Props for the control. `reason` is null when the control is live, which is
 * the whole switch: one expression decides both the attribute and the sentence,
 * so the two cannot disagree the way a hand-written pair would.
 *
 * aria-disabled and not `disabled`, and the difference is the whole point of
 * writing the sentence. The `disabled` attribute takes the control out of the
 * tab order, so a keyboard user never lands on it and never hears the
 * aria-describedby that was supposedly the fix; they arrive at a screen with a
 * control missing from it and no account of why. aria-disabled keeps the stop,
 * so tabbing to Connect reads "Connect, dimmed, Connect goes live once a key is
 * in the field above". A control the researcher can reach and read is also the
 * only version of this state that sits honestly beside a rule saying nothing
 * gates.
 *
 * The cost is that the click still fires, so every handler behind one of these
 * carries its own guard. All five did already, because the condition the button
 * was reading was the same condition the handler checks first.
 */
export function inertAttrs(
  control: string,
  reason: string | null,
  /* M69, ISC-640: the study tabs show their sentence in the one line under the
     strip, and a native tooltip drew over that line, so they take no `title`. */
  options: { readonly tooltip?: boolean } = {},
): InertAttrs {
  if (reason === null) return {};
  return {
    "aria-disabled": true,
    ...(options.tooltip === false ? {} : { title: reason }),
    "aria-describedby": inertNoteId(control),
  };
}

/**
 * The sentence. Renders nothing when the control is live, so a surface can hold
 * one of these next to every control that has an inert state without paying a
 * gap for the ones that are currently fine.
 */
export function InertNote(props: {
  control: string;
  reason: string | null;
  /** M84: read by a screen reader and not shown, where the page's Help says the rule. */
  visuallyHidden?: boolean;
}) {
  const { control, reason } = props;
  if (reason === null) return null;
  return (
    <p
      className={props.visuallyHidden === true ? "inert-note visually-hidden" : "inert-note"}
      id={inertNoteId(control)}
      data-testid={inertNoteId(control)}
    >
      {reason}
    </p>
  );
}
