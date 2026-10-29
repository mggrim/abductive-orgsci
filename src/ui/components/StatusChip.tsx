/**
 * A state, in a word, and a count when there is one.
 *
 * Five tones and every one of them carries text. Nothing in this app encodes a
 * state in hue alone: the bias grid gets printed and checked on paper, and the
 * same red-brown was meaning five different things across five surfaces before
 * the semantic triads were separated (FND-04).
 *
 * The tone is advisory and the label is the fact. If the label were removed the
 * chip would still have to be readable, which is the test to apply before
 * adding a sixth tone.
 *
 * The count is part of the chip because it was not: three surfaces rendered a
 * number in a badge beside a word in a pill, at two sizes, and the pair broke
 * onto two lines at 1024. A count of zero still renders, because a surface that
 * hides the chip when the count is zero is a surface where the researcher
 * cannot tell "none" from "not checked".
 */

export type ChipTone = "neutral" | "accent" | "ok" | "notice" | "warn";

export interface ChipModel {
  readonly label: string;
  readonly tone: ChipTone;
  readonly count: string | undefined;
  /** What a screen reader says, since the two spans read as one thing. */
  readonly text: string;
}

export function chipModel(props: {
  label: string;
  tone?: ChipTone;
  count?: number;
}): ChipModel {
  const count = props.count === undefined ? undefined : String(props.count);
  return {
    label: props.label,
    tone: props.tone ?? "neutral",
    count,
    text: count === undefined ? props.label : `${props.label} ${count}`,
  };
}

export function StatusChip(props: {
  label: string;
  tone?: ChipTone;
  /** Rendered inside the chip, not beside it. Zero is a real value. */
  count?: number;
  title?: string;
  /** For the chips a test has to find. Added when the framing band's save
   * became a chip and nothing else (R3 item 1). */
  testId?: string;
}) {
  const model = chipModel(props);
  const { title, testId } = props;
  return (
    <span
      className="status-chip"
      data-tone={model.tone}
      {...(title === undefined ? {} : { title })}
      {...(testId === undefined ? {} : { "data-testid": testId })}
    >
      {model.label}
      {model.count !== undefined && <span className="status-chip-count">{model.count}</span>}
    </span>
  );
}
