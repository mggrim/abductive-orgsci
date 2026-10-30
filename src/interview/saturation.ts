/**
 * Saturation on ontology mutation (ISC-51, ISC-52).
 *
 * The stopping rule is not "the researcher is tired" or "the matrix is
 * covered" — it is that new questions have stopped changing what the study
 * believes the world contains. That is measurable directly: count ontology
 * mutations in a trailing window of turns.
 *
 * It is advisory and never blocks. This module returns a reading; it exposes
 * no gate, no boolean the caller must pass, and no thrown error. Continuing
 * past saturation is a legitimate research decision — the tool's job is to
 * make sure it was a decision, which is why continuing past it is logged.
 */

import type { LedgerEvent, SaturationCheckEvent } from "../ledger/events.ts";
import { mutationsInWindow } from "../ontology/projection.ts";
import { projectProposals } from "../proposals/projection.ts";
import { countOf } from "../ui/format.ts";

/** Turns of history the window covers. */
export const DEFAULT_WINDOW_TURNS = 8;
/** Mutations at or below which the window counts as saturated. */
export const DEFAULT_MUTATION_FLOOR = 1;

export interface SaturationReading {
  readonly mutationsInWindow: number;
  readonly windowTurns: number;
  readonly reached: boolean;
  /** Advisory prose for the workbench. Never phrased as an instruction to stop. */
  readonly advice: string;
  /** False until the window has actually elapsed — a short session is not saturated. */
  readonly windowComplete: boolean;
  /**
   * Drafted claims waiting for a decision, from the tray Your model adjudicates.
   *
   * The reason the reading carries it (D15, M43b): a mutation is a draft the
   * researcher accepted, so a study whose drafts are all undecided reads as
   * saturated whatever the questions produced. The walk of 2026-09-13 was told
   * "Questions have stopped moving it" with sixty-eight drafts waiting, after
   * answering four steps. The measure is right and the sentence over it was not,
   * so the reading says how many drafts are waiting and the advice names them.
   */
  readonly draftsWaiting: number;
}

export interface SaturationOptions {
  readonly windowTurns?: number;
  readonly mutationFloor?: number;
}

/**
 * A "turn" is a question-selection event. Counting turns rather than raw
 * events keeps the window meaningful when a single turn produces a burst of
 * attention and flag events.
 */
function turnBoundaryIndex(
  events: readonly LedgerEvent[],
  windowTurns: number,
): number {
  const turnIndices: number[] = [];
  events.forEach((e, i) => {
    if (e.type === "question-selection") turnIndices.push(i);
  });
  if (turnIndices.length < windowTurns) return -1;
  return turnIndices[turnIndices.length - windowTurns] ?? -1;
}

export function checkSaturation(
  events: readonly LedgerEvent[],
  projectId?: string,
  options: SaturationOptions = {},
): SaturationReading {
  const windowTurns = options.windowTurns ?? DEFAULT_WINDOW_TURNS;
  const floor = options.mutationFloor ?? DEFAULT_MUTATION_FLOOR;
  const scoped = projectId === undefined ? events : events.filter((e) => e.projectId === projectId);

  /* The drafts nobody has decided on, from the tray Your model adjudicates (D15).
   * The same projection the Design companion counts, so the two surfaces cannot
   * report different numbers of waiting drafts on one screen. */
  const draftsWaiting = projectProposals(scoped).pending.length;

  const boundary = turnBoundaryIndex(scoped, windowTurns);
  if (boundary < 0) {
    const turns = scoped.filter((e) => e.type === "question-selection").length;
    return {
      mutationsInWindow: mutationsInWindow(scoped, scoped.length),
      windowTurns,
      reached: false,
      windowComplete: false,
      draftsWaiting,
      advice: `${turns} of ${windowTurns} turns into the window. Too early to judge saturation.`,
    };
  }

  /* M74b, ISC-664. The walk of 2026-10-02 read "Questions have stopped moving
   * your model" after the first saved step of a new project, when the student's
   * model held no concept at all: a judgment on answers that had nothing yet to
   * move. The reading waits until the model holds a concept, and it counts the
   * changes a researcher makes to their concepts and relations on the tab as
   * well as the older page mutations. */
  const holdsConcept = scoped.some((e) => e.type === "concept-accepted" || e.type === "ontology-mutation");
  const mutations = scoped.slice(boundary).filter((e) => CHANGES.has(e.type)).length;
  const reached = holdsConcept && mutations <= floor;
  const answers = `Your last ${numberWord(windowTurns)} answers`;
  const changed =
    mutations === 0 ? `${answers} left your concepts unchanged` : `${answers} changed your concepts ${timesWord(mutations)}`;
  const choices = "You can carry on, narrow the question, or add data.";
  return {
    mutationsInWindow: mutations,
    windowTurns,
    reached,
    windowComplete: true,
    draftsWaiting,
    advice: reached
      ? draftsWaiting > 0
        ? /* Saturated, with suggestions waiting (D15). A change to the concepts
           * is a decision, so a project whose suggestions are all undecided reads
           * as saturated however much the answers produced; the sentence names
           * the decisions rather than the answers. */
          `${changed}, and ${countOf(draftsWaiting, "suggestion")} ${
            draftsWaiting === 1 ? "is" : "are"
          } open for your decision. Accept or reject a suggestion to change your concepts.`
        : `${changed}. ${choices}`
      : `${changed}.`,
  };
}

/** The events that change a researcher's concepts or relations. */
const CHANGES: ReadonlySet<LedgerEvent["type"]> = new Set<LedgerEvent["type"]>([
  "ontology-mutation",
  "concept-accepted",
  "concept-refined",
  "concept-property-set",
  "concept-relation-set",
  "concept-relation-removed",
  "relation-accepted",
  "relation-refined",
  "concept-retired",
  "relation-claim-set",
  "relation-conditions-set",
]);

function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"][n] ?? String(n);
}

function timesWord(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${numberWord(n)} times`;
}

/** Build the ledger event for a reading. The caller decides whether to append. */
export function saturationEvent(
  reading: SaturationReading,
  envelope: { readonly id: string; readonly ts: number; readonly projectId: string },
): SaturationCheckEvent {
  return {
    id: envelope.id,
    ts: envelope.ts,
    actor: "system",
    projectId: envelope.projectId,
    type: "saturation-check",
    mutationsInWindow: reading.mutationsInWindow,
    windowTurns: reading.windowTurns,
    reached: reading.reached,
  };
}
