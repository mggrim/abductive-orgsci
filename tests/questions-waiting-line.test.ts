/**
 * What Your model says about the questions (M48b).
 *
 * Seen on the hosted example: "3 questions are waiting on the Design tab."
 *
 * The tool holds one open question at a time (M37), so three is a count of
 * something else, and it was: `wb.moves.length`, the moves `generateMoves` had
 * ready, which is what the tool could ask next rather than what is waiting on an
 * answer. M46 retired the "What the tool would ask next" panel, moved its link to
 * the open question's step via `openQuestionAt`, and left the count behind. The
 * line then said three and pointed at one, in the same sentence.
 *
 * These read the shipped example at `tests/fixtures/coldharbour.bundle.json`
 * rather than a fixture, because the defect is a disagreement between a count and
 * a projection over a real ledger, and a hand-built study with one question in it
 * cannot tell the two numbers apart.
 */

import { describe, expect, test } from "bun:test";
import {
  NO_QUESTION_WAITING,
  openQuestionAt,
  questionsWaitingLine,
} from "../src/views/placeSummary.ts";
import { projectInterview } from "../src/interview/state.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const BUNDLE = await Bun.file(
  new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname,
).json();

const EVENTS: readonly LedgerEvent[] = BUNDLE.events;
const PROJECT: string = BUNDLE.project.id;

const source = async (rel: string): Promise<string> =>
  await Bun.file(new URL(`../src/${rel}`, import.meta.url).pathname).text();

describe("the line counts the open question, not the moves the tool has ready", () => {
  test("the shipped example holds exactly one open question, at Early data", () => {
    /* The number the line has to say. `projectInterview` is the projection the
     * study header reads for its own "Go to the open question at Early data",
     * and `outstanding` is one question or none by construction. */
    const outstanding = projectInterview([...EVENTS], PROJECT).outstanding;
    expect(outstanding === null).toBe(false);
    const open = openQuestionAt(EVENTS, PROJECT);
    expect(open?.place).toBe("early-data");
  });

  test("so the line names that step, whatever the tool has queued behind it", () => {
    const open = openQuestionAt(EVENTS, PROJECT);
    // Three was the live count on the hosted example. The sentence is the same
    // at three as at nought, because the moves are not what is waiting.
    for (const ready of [0, 1, 3, 9]) {
      expect({ ready, line: questionsWaitingLine(open, ready) }).toEqual({
        ready,
        line: "One question is open for you at Early data on the Design tab.",
      });
    }
  });

  test("Anti: no state of the line says a number other than one", () => {
    const open = openQuestionAt(EVENTS, PROJECT);
    for (const ready of [0, 1, 2, 3, 12]) {
      for (const state of [open, null]) {
        const line = questionsWaitingLine(state, ready);
        expect({ ready, line, digits: /\d/.test(line) }).toEqual({ ready, line, digits: false });
        expect({ ready, line, plural: /questions/.test(line) }).toEqual({
          ready,
          line,
          plural: false,
        });
      }
    }
  });
});

describe("the three states each say which one they are", () => {
  test("a question open at a place names the place", () => {
    expect(questionsWaitingLine({ place: "site" }, 4)).toBe(
      "One question is open for you at Site on the Design tab.",
    );
    expect(questionsWaitingLine({ place: "framing" }, 1)).toBe(
      "One question is open for you at Starting point on the Design tab.",
    );
  });

  test("a question open at no place the record holds still says one is waiting", () => {
    // `openQuestionAt` returns a null place when the selection event carries a
    // station the record cannot resolve, and the link falls back to the top of
    // Design. The sentence drops the step rather than inventing one.
    expect(questionsWaitingLine({ place: null }, 2)).toBe(
      "One question is open for you on the Design tab.",
    );
  });

  test("nothing open, but the tool has one ready, is not a question waiting", () => {
    // The researcher owes nothing here. The old sentence called this state
    // "3 questions are waiting", which is the defect in one line.
    expect(questionsWaitingLine(null, 3)).toBe("Abductive has a question ready on the Design tab.");
    expect(questionsWaitingLine(null, 1)).toBe("Abductive has a question ready on the Design tab.");
  });

  test("nothing open and nothing ready is the sentence the line already had", () => {
    expect(questionsWaitingLine(null, 0)).toBe(NO_QUESTION_WAITING);
    expect(NO_QUESTION_WAITING).toBe("Abductive's next question is still to come.");
  });

  test("Anti: findings are never counted by this sentence", async () => {
    /* The study header counts findings in their own words on the Checks tab, and
     * the rail's cell state is the one place that unions a question with a
     * finding (M43d, D41). A sentence about questions that could say "finding"
     * is how the two counts start drifting into each other. */
    for (const ready of [0, 3]) {
      for (const state of [{ place: "site" as const }, { place: null }, null]) {
        expect(/finding/i.test(questionsWaitingLine(state, ready))).toBe(false);
      }
    }
  });
});

  // M63, the lead's rulings of 2026-09-30: the old model tab's OntologyView, ui/OntologyView.tsx left with it; superseded: "the view no longer builds a count of its own"
  // M63, the lead's rulings of 2026-09-30: the old model tab's OntologyView, ui/OntologyView.tsx left with it; superseded: "the sentence and the link read the same projection"
  // M63, the lead's rulings of 2026-09-30: the old model tab's OntologyView, ui/OntologyView.tsx left with it; superseded: "the empty state is the constant, so the branch cannot drift from the words"
