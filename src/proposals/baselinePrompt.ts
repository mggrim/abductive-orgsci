/**
 * What the paper judge is told to write after its verdict line (M33, M42).
 *
 * Model input, never rendered. It sits beside `baselines.ts` the way
 * `interview/conversationPrompt.ts` sits beside `interview/conversation.ts`, and
 * for the same reason: that file holds the strings a researcher reads, which the
 * copy bar scans, and these are instructions to a model, whose wording is a
 * methodological choice rather than a copy decision. Both halves lived in one
 * file until M42, when the copy bar's specificity check started reading the
 * instruction "That is a useful answer" as prose addressed to a reader.
 *
 * The block is appended to the fit prompt rather than asked in a call of its
 * own, which is the property that makes this cost nothing: the judge already has
 * the paper and the study in front of it, and the only thing it was missing was
 * the passages.
 */

export const BASELINE_INSTRUCTIONS: readonly string[] = [
  "",
  "# Then, what this paper expects",
  "After the FIT line, write one to three blocks. Each block is three lines, in this order:",
  "EXPECTS: <one sentence a setting could break. Write about the world. Do not write about the paper.>",
  "SCOPE:   <where its authors say it holds, and where they say it does not. One clause.>",
  "CITE:    <the passage it came from, as [[chunk:ID]], using the exact ids given below.>",
  "Blocks are separated by a line containing only '---'.",
  "Write the expectation about the world, not about the paper. \"Handoffs fail when the receiving clinician cannot question the sender\" is an expectation. \"Bechky on occupational boundaries\" is a citation, and a list of citations holds nothing that could turn out to be wrong.",
  "If the paper expects nothing about a setting like theirs, leave out the blocks. That is a useful answer and it is often the right one.",
];

/** What to say instead of a citation when there is no file behind the paper. */
export function citeRule(hasPassages: boolean, noSourceFile: string): string {
  return hasPassages
    ? "Cite only the ids listed below. Abductive drops an expectation that cites a passage outside that list."
    : `This paper has only the line the researcher typed, without a file. Do not invent a citation. Write CITE: ${noSourceFile}.`;
}
