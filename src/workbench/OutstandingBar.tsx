/**
 * Always-visible statement of where things stand (ISC-61).
 *
 * Three things, never behind a click: what is outstanding, what the tool is
 * waiting on, and what would come next. v1 made the researcher navigate to
 * find out whether it wanted something from them, which is how fifteen
 * challenge cards accumulated unread.
 *
 * Pure presentation over a pure model, so the wording is unit-testable.
 */

import type { SaturationReading } from "../interview/saturation.ts";
import type { InterviewState, NextMove } from "../interview/types.ts";
import type { ProposalTray } from "../proposals/types.ts";
import { NextBar, type NextStep } from "./NextBar.tsx";

export interface StandingReport {
  /**
   * Topics the interviewer has stopped raising, because the researcher set
   * each aside three times.
   *
   * The only count this bar still computes for itself. It is a fact about the
   * conversation on this page, it names no other tab, and nothing else in the
   * product says it.
   */
  readonly silenced: readonly string[];
}

/**
 * What this bar has left to say once the NextBar owns the next move (R3 item 2).
 *
 * It used to compute four things: what the tool was waiting on, everything
 * outstanding, what would happen next, and the held-open contradictions. Read
 * on the shipped screen that was five lines, and the flow critic counted the
 * damage exactly: line three ("One question waiting, about context") repeated
 * line one, two lines named a destination on another tab with nothing to click,
 * and the "Next:" line answered the same question the bar at the foot of the
 * page answers with a control. One screen, two answers to "what now".
 *
 * So the next move moves out of this file entirely. `Workbench` computes
 * `nextStep` once and hands the same sentence to both bars, which is what makes
 * it impossible for the head and the foot of one page to disagree about what to
 * do. What is left here is the thing the NextBar cannot say: which topics have
 * gone quiet.
 *
 * M89 (2026-10-14): the contradictions kept open on purpose, and the count of
 * open flags linking to Checks, were read off the checks' findings here until
 * the checks left main, on the owner's instruction.
 */
export function standingReport(input: {
  interview: InterviewState;
  saturation: SaturationReading;
}): StandingReport {
  const { interview, saturation } = input;

  const silenced: string[] = [];
  if (interview.silencedTopics.length > 0) {
    silenced.push(
      `Abductive has stopped raising: ${interview.silencedTopics.join(", ")}. You set each aside three times.`,
    );
  }
  if (saturation.reached) silenced.push(saturation.advice);

  return { silenced };
}

export function OutstandingBar(props: {
  /** Which study, for the next move's link. */
  projectId: string;
  interview: InterviewState;
  saturation: SaturationReading;
  /**
   * The move the NextBar names, verbatim (R3 item 2).
   *
   * Passed in rather than derived, because the whole point of the fix is that
   * one page cannot hold two answers to "what now". `Workbench` computes it
   * once from `nextStep` and gives the same string to both bars.
   */
  /** The next move, or nothing when the study header already carries it (ISC-492). */
  step?: NextStep;
}) {
  const { projectId, step } = props;
  const report = standingReport(props);
  const lines = [...report.silenced];

  return (
    <aside className="standing" data-testid="standing-bar">
      {/* One line, and it is the same sentence the bar at the foot of the page
          reads (R3 item 2). "Waiting on you" rather than "Waiting on: You",
          because the colon-plus-pronoun was a label answering a question
          nobody had asked in those words. */}
      {/* M38, ISC-492: when the next move is the open question, the study
          header forty pixels above already names it with a link, and the bar
          at the foot names it again as the next move. Three statements of one
          fact on one screen is the defect the copy critics failed the page for
          at M27, so this line stands down for that one rule and the header
          carries it. Every other rule still reads here. */}
      {/* The move and its control, one row (2026-09-12). The bar that carried
          the control sat at the foot of the page until the owner gave the foot
          to the framing fold; the sentence was already here, so the control
          joined it rather than the sentence going without one. */}
      {step !== undefined && (
        <div className="standing-main">
          <NextBar projectId={projectId} step={step} />
        </div>
      )}
      {lines.length > 0 && (
        <ul className="standing-list small" data-testid="outstanding-list">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
