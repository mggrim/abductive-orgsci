/**
 * What the researcher says a paper bears on, and what a row does about it
 * (M51, ISC-533).
 *
 * The judge used to answer three ways and show all three: "fits your setting",
 * "unclear", "doesn't fit", with "This paper expects nothing about a setting
 * like yours" under the last of them. A co-author read that on Ozcan and
 * Santos on 2026-09-21 and said the tool was "being too self-confident", and
 * that instead of making judgments it should ask why the researcher thinks the
 * paper is relevant. The owner's decision of 2026-09-26: no verdict reaches the
 * screen, a paper the judge cannot place carries a question, and the answer is
 * recorded beside the paper.
 *
 * What is in this module:
 *
 *   - the question, in one place, because the row asks it, the finding names it
 *     and the conversation move puts it again;
 *   - the standing of one paper, which is what every surface renders from, so a
 *     row on Material and a row on the companion panel cannot disagree about
 *     whether a paper is still being asked about;
 *   - the event a saved answer writes.
 *
 * The verdict is still on the record and the judge still reaches one. What
 * changed is who it is for: it decides whether the tool has anything to draft
 * from the paper, and it is never a sentence about the researcher's reading.
 */

import type { LedgerEvent, PaperBearingEvent } from "../ledger/events.ts";
import type { PaperVerdict } from "../proposals/paperFit.ts";

/** The question a paper the tool cannot place carries. */
export const BEARING_QUESTION = "How does this paper relate to your setting?";

/** The label on the control that records the answer. */
export const BEARING_SAVE_LABEL = "Save";

/** What the box says before anything is typed into it. */
export const BEARING_PLACEHOLDER =
  "What this paper predicts or assumes that your setting speaks to";

/** What the row says above the researcher's own recorded sentence. */
export const BEARING_SAID_HEAD = "This paper's relation to your setting, in your words";

/** One paper's recorded answer. */
export interface PaperBearing {
  readonly paperKey: string;
  readonly paperName: string;
  readonly reason: string;
  readonly at: number;
}

/**
 * The latest answer per paper, from the record.
 *
 * Last wins, the rule `paperVerdicts` follows: a researcher who says more about
 * a paper has not corrected the earlier sentence, they have written a later one,
 * and both stay readable in the record.
 */
export function paperBearings(
  events: readonly LedgerEvent[],
  projectId: string,
): ReadonlyMap<string, PaperBearing> {
  const out = new Map<string, PaperBearing>();
  for (const event of events) {
    if (event.type !== "paper-bearing" || event.projectId !== projectId) continue;
    out.set(event.paperKey, {
      paperKey: event.paperKey,
      paperName: event.paperName,
      reason: event.reason,
      at: event.ts,
    });
  }
  return out;
}

/** Just the sentences, keyed by paper, for a prompt or a diff. */
export function bearingReasons(
  events: readonly LedgerEvent[],
  projectId: string,
): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const [key, bearing] of paperBearings(events, projectId)) out.set(key, bearing.reason);
  return out;
}

/**
 * Where one paper stands, and the four answers are the four things a row draws.
 *
 *   - `unjudged`: nothing has read it. The row says so and says what would.
 *   - `asking`: the tool read it, found nothing it could draft, and the
 *     researcher has not said what the paper bears on. The row carries the
 *     question.
 *   - `said`: they answered. The row carries their sentence, and the tool reads
 *     the paper again with the sentence in the prompt.
 *   - `placed`: the tool has something to draft, or the researcher has already
 *     been answered by the expectations on the row.
 *
 * `asking` is deliberately narrower than "the verdict was not `fits`". A paper
 * judged `unclear` is allowed one expectation, and a paper that produced one has
 * been placed by the tool rather than left unplaced: asking about it would be
 * the tool asking a question its own row has answered.
 */
export type PaperStanding = "unjudged" | "asking" | "said" | "placed";

export function paperStanding(input: {
  readonly verdict?: PaperVerdict;
  readonly bearing?: PaperBearing;
}): PaperStanding {
  const { verdict, bearing } = input;
  /* No verdict, or a verdict written before the expectations field existed.
   * Either way nobody has asked this paper what it expects, and a question
   * about a paper nothing has read would be the tool asking the researcher to
   * do its reading. */
  if (verdict === undefined || verdict.baselines === undefined) {
    return bearing === undefined ? "unjudged" : "said";
  }
  if (bearing !== undefined) return "said";
  if (verdict.baselines.length > 0) return "placed";
  return verdict.verdict === "fits" ? "placed" : "asking";
}

/**
 * Whether the judge's own sentence about a paper reaches the researcher (M51).
 *
 * On `fits` only, and the two sides of that are both recorded decisions.
 *
 * M33's walk fix keeps it on a verdict written before the expectations field
 * existed, on the reasoning that such a verdict is current about the one
 * question it answered, and the sentence is a reading of what the paper says
 * about the setting rather than a judgement of the researcher's reading list.
 * That reasoning holds under ISC-533 and the sentence stays.
 *
 * On `unclear` and `misfit` the same slot held "it makes no prediction about a
 * setting like yours", which is the verdict ISC-533 takes off the screen. Those
 * rows carry the question instead, or the researcher's own answer to it.
 */
export function showsJudgeSentence(verdict?: PaperVerdict): boolean {
  return verdict?.verdict === "fits";
}

/**
 * What a saved answer writes: the researcher's sentence.
 *
 * M89 (2026-10-14): a second event, Abductive's withdrawal of the paper notice
 * that the answer settled, went with the checks and the notice.
 */
export function bearingEvents(
  input: {
    readonly projectId: string;
    readonly paperKey: string;
    readonly paperName: string;
    readonly reason: string;
    /** M93, ISC-768: the `paper-fit` event whose reason the box began as, and whether the researcher changed it. */
    readonly startedFrom?: string;
    readonly edited?: boolean;
  },
  options: { readonly now?: () => number; readonly makeId?: () => string } = {},
): readonly LedgerEvent[] {
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  const said: PaperBearingEvent = {
    id: makeId(),
    ts: now(),
    actor: "human",
    projectId: input.projectId,
    type: "paper-bearing",
    paperKey: input.paperKey,
    paperName: input.paperName,
    reason: input.reason.trim(),
    ...(input.startedFrom === undefined ? {} : { startedFrom: input.startedFrom, edited: input.edited ?? true }),
  };
  return [said];
}
