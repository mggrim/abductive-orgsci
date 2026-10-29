/**
 * What a fit verdict is, and how it is read off an answer (M29c).
 *
 * Split out of `theory.ts` when the judgement moved to arrival. Two modules ask
 * a model this question now, the reader and the arrival gate, and a verdict
 * parsed two ways is two gates: the reader would accept a wording the gate
 * rejected, and a paper would be a misfit on Material and a fit on Your model.
 * One parser, one vocabulary, one definition of what the three words mean.
 */

/** Whether this paper predicts anything about a setting like the researcher's. */
export type PaperFit = "fits" | "unclear" | "misfit";

export const PAPER_FITS: readonly PaperFit[] = ["fits", "unclear", "misfit"];

/**
 * The verdict line and the sentence behind it.
 *
 * The verdict is a fixed token so a branch can read it; the sentence is the
 * model's own words and goes on the record as the finding's reason, because a
 * flag saying "this paper does not fit" and nothing else is a flag a researcher
 * can neither act on nor argue with.
 */
export interface FitVerdict {
  readonly fit: PaperFit;
  readonly reason: string;
}

/**
 * Read the first line of the answer. Anything unparseable reads as unclear.
 *
 * The separator after the verdict is whatever the model reached for, and it
 * reaches for a pipe often enough that a live run put one on screen: the
 * finding rendered as "| This is a methods paper about how to use LLMs", on
 * Design and on Checks, a table character leaking out of a prompt into a
 * sentence addressed to a person. A period, a colon, a dash and a pipe are all
 * the same punctuation mark here, so the reason starts at the first word.
 */
export function parseFit(text: string): FitVerdict {
  const match = /^\s*FIT:\s*(fits|unclear|misfit)\b[ \t]*[|.:,;\u2013\u2014-]?[ \t]*(.*)$/im.exec(text);
  const fit = match?.[1]?.toLowerCase() as PaperFit | undefined;
  if (fit === undefined) {
    /* No verdict is not a misfit. A model that ignored the instruction has told
     * us nothing about the paper, and turning a parse failure into a finding
     * against the researcher's reading list is the tool blaming them for its
     * own broken call. `unclear` drafts at most one and raises nothing, which
     * is the right cost for not knowing. */
    return { fit: "unclear", reason: "" };
  }
  /* Belt and braces: a model that writes two separators, or opens the sentence
   * with a bullet, must not put either in front of the researcher. */
  const reason = (match?.[2] ?? "").replace(/^[\s|.:,;\u2013\u2014-]+/, "").trim();
  return { fit, reason: withoutInstructionResidue(reason) };
}

/**
 * The prompt's own words about the sentence, taken off the front of it (D2, D3).
 *
 * The instruction said "Then, on the same line, one sentence saying why", and the
 * walk of 2026-09-13 found the model writing the description instead of the
 * sentence: one paper's why-line rendered as the literal "one sentence saying
 * why" and another as "one sentence why: it speaks directly to…". Four of five
 * papers got a clean sentence, so the shape is right most of the time and wrong
 * often enough to reach a researcher.
 *
 * `paperFit.ts` states the shape unambiguously now, which is the fix at the
 * cause. This is the fix at the reader: a parser that renders a label as a
 * sentence puts words on screen that no reader can act on, and the label is
 * always at the front, which makes it strippable without touching the model's own
 * words. What survives the strip is the model's sentence; what is left when
 * nothing survives is no sentence at all, and every surface already draws
 * nothing for an empty reason.
 */
const RESIDUE: readonly RegExp[] = [
  /* An unreplaced placeholder, which is the one thing the new wording can
   * produce that the old one could not. */
  /^<[^>]{0,60}>/,
  /^(?:your\s+)?(?:one\s+)?sentence(?:\s+saying)?(?:\s+why)?\b/i,
  /^saying\s+why\b/i,
  /* A bare label, and only with its colon: a real sentence can open on "Why"
   * or "Because" and a colon is what makes it a label rather than a clause. */
  /^why(?=\s*:)/i,
  /^because(?=\s*:)/i,
];

export function withoutInstructionResidue(reason: string): string {
  let out = reason;
  /* A loop, because the walk produced two of these stacked: "one sentence why:"
   * is the noun phrase and then the label. Bounded by the strip always shortening
   * the string. */
  for (let pass = 0; pass < RESIDUE.length; pass += 1) {
    const before = out;
    for (const pattern of RESIDUE) out = out.replace(pattern, "");
    out = out.replace(/^[\s|.:,;\u2013\u2014-]+/, "").trim();
    if (out === before) break;
  }
  if (out === "") return "";
  /* Cutting a label off the front leaves the model's sentence starting
   * mid-stream, and the walk's own example rendered as "it speaks directly to…"
   * on a card whose four neighbours opened on a capital. The first letter is
   * this parser repairing its own cut, and it is the only character it changes. */
  if (out === reason) return out;
  return out.charAt(0).toUpperCase() + out.slice(1);
}
