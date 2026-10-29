/**
 * What a surface says about a place, in words, written once (M38).
 *
 * Three surfaces put a line about a conversation on screen now: the study
 * header names where the open question is, the rail says what each of the eight
 * conversations produced, and the study list marks a study with a question
 * waiting. The facts all come from `views/placeSummary.ts`, which is the point
 * of that module. The words come from here, for the same reason one level up: a
 * count phrased "3 turns" on the rail and "3 exchanges" in the header is one
 * fact the reader has to notice is the same fact.
 *
 * Two rules from the interface research govern every string below.
 *
 * Counts and states, never prose. What a conversation produced is a number and
 * a state. The moment a line says what the researcher meant, the tool is
 * summarising into the answer, and this is the surface where that would be
 * least visible and most damaging.
 *
 * A rail is not a checklist. `STATE_TITLE` in StationRail.tsx puts it best: a
 * rail that reads as a checklist is a rail that gets cleared rather than
 * answered. So a place where nothing has happened says nothing at all. "0
 * turns" is a report on nothing having happened, printed against the step the
 * researcher has not reached yet, seven times over.
 */

import { countOf } from "./format.ts";
import type { PlaceSummary } from "../views/placeSummary.ts";

/* M84, ISC-706: `openQuestionLine` and `questionOpening` went with the study
 * header's "Go to the open question at X" line. */

/**
 * What this conversation produced, as counts and states.
 *
 * Empty for a place nothing has happened at, which is what keeps the rail from
 * reading as seven boxes to tick. The parts are returned in the order the
 * researcher would act on them: how much was said, then what is waiting on
 * them.
 */
export function placeStateParts(summary: PlaceSummary): readonly string[] {
  const parts: string[] = [];
  /* The turn count went at M49 (ISC-530). A co-author, 2026-09-21: less is more
   * on counts and secondary numbers. "14 turns" under a cell says how much was
   * typed there, which is not a thing a researcher decides anything by, and it
   * put a number on all eight cells of the one surface that is meant to read as
   * a design rather than as a tally. What is left is what is waiting on them.
   * The count is still on the record panel, which is where a reader who wants to
   * audit a conversation goes. */
  if (summary.draftWaiting) parts.push("suggestion to review");
  if (summary.waiting > 0)
    parts.push(`${countOf(summary.waiting, "claim")} to review`);
  return parts;
}

/** The same, as the one string a cell renders. */
export function placeStateLine(summary: PlaceSummary): string {
  return placeStateParts(summary).join(", ");
}
