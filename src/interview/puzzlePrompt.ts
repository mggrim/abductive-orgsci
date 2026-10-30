/**
 * The prompt that reads the puzzle out of what the researcher has saved
 * (M40, ISC-508).
 *
 * Model input, never rendered. It sits beside `conversationPrompt.ts` and keeps
 * that file's rule that the tool never writes the researcher's answer, by a
 * different route: this is not their answer and is never labelled as one. What it
 * produces is the tool's reading of material they already committed to, shown
 * read-only, named as the tool's on every surface it reaches, and disputed by
 * revising the answer it was read from rather than by editing it.
 *
 * ── Why there is no `studyContext()` block here ──────────────────────────────
 *
 * CLAUDE.md's rule is that every generator writing a draft, a question or a
 * verdict receives `studyContext()` rather than a bare page-type list, and that
 * rule is not bent here: this writes none of those three. It is also the one
 * generator that must not have the block, because the block carries `puzzle`,
 * which is `brief.researchQuestion`, which is where this reading is stored. A
 * reading handed the block would be shown its own previous output as evidence
 * about the study and would converge on it: the second reading would restate the
 * first, the third the second, and the record would show three independent
 * readings agreeing, which is the false confidence this tool exists to detect.
 *
 * So it reads the same underlying fields directly, through `views/puzzleReading.ts`,
 * minus that one. The blocks it is given are the starting interest, the six
 * steps' saved answers and the three most-opened data passages, each labelled
 * with the place's own words.
 *
 * ── What a puzzle is, for this prompt ───────────────────────────────────────
 *
 * An expectation, and something found that did not fit it. Both halves or
 * nothing: that is a co-author's point at M37, and it is the reason `NONE:` is
 * a first-class answer rather than a failure. A reading that fills the missing
 * half is the tool inventing the researcher's surprise, which is worse than no
 * reading at all, because a researcher reads a puzzle in their own study and
 * believes it.
 */

import { PUZZLE_READING_MARKER } from "../inference/promptMarkers.ts";
import { MODEL_VOICE_RULES } from "../inference/promptMarkers.ts";
import { OWNER_RULES } from "../personas/voice.ts";
import { isGapOnly } from "./conversation.ts";
/* The one sentence in this file's output that a researcher reads lives with the
 * projection that prints it (M42), so everything left here is model input and the
 * copy bar's scope list says so. */
import { GAP_ONLY_REASON, type PuzzleBlock } from "../views/puzzleReading.ts";

/** The marked line a reading returns when it found a puzzle. */
export const PUZZLE_LINE = "PUZZLE:";

/** The marked line it returns when it did not. */
export const NONE_LINE = "NONE:";

/**
 * The system prompt for one reading.
 *
 * The rules are the marked lines plus four constraints, and the last two are the
 * ones that decide whether a reading is evidence or flattery.
 *
 * Early data outranks the other answers as the "found" half, because that step
 * asks what the material already showed the researcher that they did not expect:
 * it is the one place in this tool where a surprise is recorded as a surprise.
 * And the starting interest is the weakest evidence of an expectation, because it
 * is what they came in curious about rather than something they predicted, and a
 * reading that treats curiosity as a hypothesis manufactures the conflict.
 */
export function puzzlePrompt(blocks: readonly PuzzleBlock[]): string {
  const lines: string[] = [
    "# Role",
    "You are drawing the researcher's puzzle out of what they have already saved in this study. You are not asking them anything, not writing their answer, and not improving on it. What you produce is your suggested puzzle, and Abductive shows it to them as yours.",
    "",
    "A puzzle is two things: something that they expected, and something that they found which did not fit it. A puzzle needs both halves.",
    "",
    PUZZLE_READING_MARKER,
    `- Return exactly one of these two marked lines, and only that line:`,
    `${PUZZLE_LINE} what they expected and what they found instead, in their terms. Two sentences at most. Quote their words where you can.`,
    `${NONE_LINE} one sentence saying which half is missing: that they haven't saved an answer saying what they expected, or that they haven't saved an answer that cuts against an expectation that they have stated.`,
    /* Addressed to the researcher, because that is who reads it. The first live
     * reading came back as "nothing saved says what they expected", third person
     * on a line shown under "The puzzle, as the tool reads it" to the person it
     * was about, and started in lower case after the band's "No puzzle yet.". */
    "- Abductive shows both lines to the researcher, so write them to the researcher: \"you\" and \"your\". Do not write \"they\" or \"the researcher\". Start each line with a capital letter.",
    "- Use only the items listed below. Add only facts that they gave, do not add meaning to their words, and do not praise them.",
    "- Do not fill either half. If one half is missing, the answer is the NONE line, not a puzzle with a sentence that you supplied.",
    "- Early data outranks the other answers as the half that they found: that step is where they record what their material showed them that they did not expect.",
    "- The starting interest is the weakest evidence of an expectation. It is what they came in curious about, not something that they predicted, and curiosity on its own is not an expectation.",
    /* D52 (M43d). The fifth reading of the walk study opened: "You expected
     * Pitchwright to level the field so Selection Day would judge the venture and
     * not the founder's writing, \"so that Selection Day would judge the venture
     * and not the founder's writing.\"" A paraphrase of the board's aim followed
     * immediately by the quoted original of the same clause, joined by a comma.
     * Quoting their words is the right instinct and the line above asks for it;
     * what it did not say is that a quote replaces the paraphrase rather than
     * following it. */
    "- Quote a phrase or paraphrase it. Do not do both. If you quote their words, do not also say the same thing in your own words in that sentence.",
    "",
    MODEL_VOICE_RULES,
    "",
    // M69, ISC-644: the owner's rules, which the puzzle a researcher reads must keep.
    OWNER_RULES,
    "",
    "## What they have saved",
  ];

  /* Labelled by the place's own words rather than by a slug, and the labels come
   * from the projection rather than from here: a model writes back the vocabulary
   * it is given, which is how "analytic-residue" reached the Checks tab as model
   * prose no source file contained. */
  for (const block of blocks) {
    lines.push("", `### ${block.label}`, block.text);
  }
  if (blocks.length === 0) {
    lines.push("", "They haven't saved an answer yet.");
  }

  lines.push(
    "",
    "This is theirs, not yours. Do not repeat it back approvingly, and do not treat a gap in it as a failing.",
  );

  return lines.join("\n");
}

/** The user turn, so the reply is the marked line and not a conversation. */
export const PUZZLE_READING_INSTRUCTION =
  "Suggest the puzzle now. Return only the marked line.";

/** What came back: a puzzle, or the reason there is none. */
export type PuzzleReadingResult = { readonly puzzle: string } | { readonly none: string };

/**
 * Read the marked line back off the reply.
 *
 * `PUZZLE:` wins over `NONE:` when both appear, because a model that returned
 * both has answered the question and then hedged, and the answer is the part that
 * says something. A `PUZZLE:` holding nothing but the gap marker is a `none`, for
 * the reason `parseFramingDraft` made the same call at M37: the first live walk
 * of that control put the literal string "[...]" into the researcher's own field,
 * because a part that is only gaps is not empty by string comparison and has
 * said nothing by every other measure.
 *
 * Anything unmarked is a `none` as well, with the same fixed sentence. A model
 * that ignored the contract has not given the tool a reading it can attribute,
 * and inventing one out of its prose would be the tool filling the half this
 * whole prompt refuses to fill.
 */
export function parsePuzzleReading(text: string): PuzzleReadingResult {
  const puzzle = marked(text, PUZZLE_LINE);
  if (puzzle !== null && !isGapOnly(puzzle)) return { puzzle };
  const none = marked(text, NONE_LINE);
  if (none !== null && none !== "") return { none };
  return { none: GAP_ONLY_REASON };
}

/**
 * The text after one marked line, to the end of the reply.
 *
 * To the end rather than to the next blank line, because the marked line is the
 * whole answer and a reading may run to two sentences that the model wrapped.
 * The other marker ends it, so a reply carrying both is still split correctly.
 */
function marked(text: string, marker: string): string | null {
  const lines = text.split("\n");
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    const start = new RegExp(`^\\s*${marker}\\s*(.*)$`).exec(line);
    if (start !== null) {
      inside = true;
      const first = (start[1] ?? "").trim();
      if (first !== "") out.push(first);
      continue;
    }
    if (!inside) continue;
    if (/^\s*(?:PUZZLE|NONE):/.test(line)) break;
    out.push(line.trim());
  }
  return inside ? out.join(" ").replace(/\s+/g, " ").trim() : null;
}
