/**
 * Sample and Early data wait outside the loops (M58, ISC-567; M69, ISC-641).
 *
 * Matthew, 2026-09-27: "sample and early data are two external pieces that are
 * greyed out until the other bits are filled in." The lead's ruling of the same
 * day: this supersedes ISC-81 and ISC-82 for exactly these two cells. Every
 * other step stays open from the first second of a study, in any order.
 *
 * "Filled in" means each of the six steps in the two loops has a saved answer.
 * Until M69 a step set aside counted too, and the step carried a "Set step
 * aside" control for that reason. Matthew, 2026-10-02: "Can't we just get rid
 * of the 'set aside' command and option? The user can just set things aside.
 * They don't actually have to tell you that they're setting it aside. They can
 * just move on." So the control went, and the gate reads saved answers only
 * (ISC-641, superseding ISC-626's wording). Set-asides already on the record
 * stay there and History still shows them. Nothing here reads the material,
 * and M51's rule stands: material can be added on Material at any time. Only
 * the two steps' own pages wait.
 *
 * A closed step that already holds work never closes (the lead's ruling of
 * 2026-09-27, option B): a saved answer there, a set-aside written before M69,
 * or any conversation turn there keeps it open. That is the earned-tabs rule
 * that nothing hides work already done, and it keeps the shipped example and
 * every study made before M58 whole. A fresh study gets the full gate.
 *
 * This is the one place the rule is stated. The rail, the Workbench and the
 * tests read it, so no surface can gate a third step or open these two early.
 */

import type { ProjectBrief } from "../state/projects.ts";
import { STATIONS, stationById, type StationId } from "./stations.ts";
import { stationStated, type StationDeclination } from "./stationBrief.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import { placeHasConversation } from "../interview/orchestrator.ts";

/** What a study already holds at a step, for the rule that work never closes. */
export interface StudyWork {
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
  /** Passages of the researcher's own data, which answer Early data (D12). */
  readonly dataCorpusSize: number;
}

/** Whether a step already holds a saved answer, an earlier set-aside or a conversation turn. */
export function holdsWork(
  id: StationId,
  brief: ProjectBrief,
  declined: ReadonlyMap<StationId, StationDeclination>,
  work: StudyWork,
): boolean {
  return (
    stationStated(brief, stationById(id), work.dataCorpusSize) ||
    declined.has(id) ||
    placeHasConversation(work.events, work.projectId, id)
  );
}

/** The two steps outside the loops, which wait for them. */
export const GATED_STATIONS: readonly StationId[] = STATIONS.filter((s) => s.ring === "external").map(
  (s) => s.id,
);

/** The six steps in the two loops, which the gate waits on. */
export const LOOP_STATIONS: readonly StationId[] = STATIONS.filter((s) => s.ring !== "external").map(
  (s) => s.id,
);

/** The loop steps still without a saved answer, in the rail's order. */
export function unansweredLoopSteps(brief: ProjectBrief): readonly StationId[] {
  return LOOP_STATIONS.filter((id) => !stationStated(brief, stationById(id), 0));
}

/** Whether each of the six loop steps has a saved answer. */
export function loopsSettled(brief: ProjectBrief): boolean {
  return unansweredLoopSteps(brief).length === 0;
}

/**
 * The steps that are closed right now: the two outside, until the loops settle,
 * less any of the two that already holds work. Without `work` only the brief
 * and the earlier set-asides are read.
 */
export function gatedStations(
  brief: ProjectBrief,
  declined: ReadonlyMap<StationId, StationDeclination>,
  work: StudyWork = { events: [], projectId: "", dataCorpusSize: 0 },
): ReadonlySet<StationId> {
  if (loopsSettled(brief)) return new Set();
  return new Set(GATED_STATIONS.filter((id) => !holdsWork(id, brief, declined, work)));
}

/**
 * What a closed step says, on hover and in the rail: the rule, and then the loop
 * steps still without an answer ("Context and Bind still need an answer.").
 */
export function gateSentence(id: StationId, unanswered: readonly StationId[] = []): string {
  const rule = `${stationById(id).label} opens once you have answered all six steps in the loops.`;
  if (unanswered.length === 0) return rule;
  const names = unanswered.map((step) => stationById(step).label);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${rule} ${list} ${names.length === 1 ? "still needs" : "still need"} an answer.`;
}

/** The first loop step still without an answer, which is where a closed step sends you. */
export function firstUnsettledLoopStep(brief: ProjectBrief): StationId | undefined {
  return unansweredLoopSteps(brief)[0];
}
