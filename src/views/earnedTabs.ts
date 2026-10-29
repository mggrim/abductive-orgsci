/**
 * Which tabs are open (M62, ISC-607), and before that which were on the strip
 * (M49, ISC-528).
 *
 * M89 (2026-10-14): Checks left main with the checks, on the owner's
 * instruction, so two tabs are gated now: Emerging project ontology and Export.
 * The accounts below name Checks as it was; the branch `with-checks` keeps it.
 *
 * M85, ISC-712 (a co-author, 2026-10-13; the lead's ruling, 2026-10-14):
 * Sources is open from the project's first moment. Its gate sent both Upload
 * papers links (Starting point, the front page) to a closed tab, and a link
 * that promises an upload and lands on a closed tab is a defect. A paper added
 * before a setting exists waits with PaperExpectations' note (NOT_JUDGED_NOTE).
 * Three tabs stay gated: Emerging project ontology, Checks and Export. The
 * account below is kept for the record.
 *
 * The owner, 2026-09-30, supersedes M49's hidden tabs for the strip: all six
 * show from the start. Starting point and Design are open; Sources, Your model,
 * Checks and Export are greyed (visible, labelled, not openable) until earned,
 * each with one line saying how to open it (`TAB_UNLOCK`). Sources is earned
 * at a saved answer, not a set-aside, at Context or the Puzzle, so Abductive can
 * judge each paper against the setting; the other three as M49 built them. A tab
 * that already holds work never closes (the M58 rule for steps, applied to tabs):
 * papers or data already in Sources keep it open, and every earned moment below
 * is an event the record never loses. M49's arrival lines and its redirect to
 * Design go. The M49 account follows, kept for the record.
 *
 * ── M49 ─────────────────────────────────────────────────────────────────
 *
 *
 * A co-author, on their first use of the tool on 2026-09-21: Design and Material
 * first, and Your model, Checks and Exports out of view until they hold
 * something. Five tabs on a study with nothing in it are five bare nouns, three
 * of which open a page whose whole content is an empty state explaining why it
 * is empty. A researcher who opens all three in the first minute learns that
 * most of this tool is blank.
 *
 * So three of the five are earned by an event in the record, and the record is
 * the only thing consulted. No flag, no counter, no "has visited" bit: the
 * question "does this study hold a draft" already has an answer and adding a
 * second one is how two surfaces come to disagree about the same study.
 *
 *   Your model   the first `proposal`. The tab is where a draft is accepted or
 *                turned down, so it arrives with the first draft there is.
 *   Checks       the first `bound` at a station. Checks reads the design
 *                against the material and the venue, and until one step is
 *                answered the design it would read is empty.
 *   Exports      the first `ontology-mutation` with op `create`. Every export
 *                is a reading of the model, and a model with no claim in it
 *                exports a file with nothing in it.
 *
 * The framing writes `bound` events too, under its own subjects, and they do
 * not earn Checks: the brief's rule is a saved answer AT A STEP, and
 * `resolveStationId` is what tells the two apart (it follows the two ids M27
 * retired, so a study designed before then earns the tab on the answers it
 * already has).
 *
 * ── M71, ISC-653: the events the tool writes since M63 ───────────────────
 *
 * Found in the M71 walk on a fresh project: a reply, a saved Context summary
 * and an accepted concept left Sources, Checks and Export greyed. Since M63 a
 * summary saved at a step lives in the project's brief (the steps gauge and the
 * loop gate read it there), a concept is accepted as `concept-accepted` and a
 * statement is placed as `statement-attached`; the walk's ledger held none of
 * the `bound` or `ontology-mutation` events these rules read. So:
 *
 *   Sources      also once the brief has a summary at Context or the Puzzle,
 *                which the shell passes in as `brief`.
 *   Checks       also once a concept is accepted or a statement placed.
 *   Export       also once the ontology has a concept or a placed statement.
 *
 * Every earlier opening still opens, so no project made before M63 loses a tab.
 * Checks and Export now open at the same acceptance on a new project; the
 * owner's ruling names each by what it reads.
 *
 * ── What this must never do ───────────────────────────────────────────────
 *
 * Gate the work. ISC-81 and ISC-82 say the spine orients and never gates (M58
 * superseded both for Sample and Early data alone, which wait for the loops in
 * `flow/loopGate.ts`; that is a step, not a tab, and this module gates no tab), and
 * hiding a tab is close enough to that line to be worth naming: what is hidden
 * is a VIEW of work already done, never a place to do work. Nothing a
 * researcher can do becomes unreachable, because there is nothing to do on any
 * of the three until the event that reveals it has happened. A route asking for
 * a hidden tab lands on Design with a sentence saying what brings the tab, so a
 * link a co-author sent still says something rather than rendering an empty
 * page.
 */

import type { LedgerEvent } from "../ledger/events.ts";
import type { StudyTab } from "../ui/routes.ts";

/** Open from the start (M62, ISC-607; M85, ISC-712 for Sources): a project opens on work, not on a reading of work. */
export const ALWAYS_SHOWN: readonly StudyTab[] = ["motivation", "design", "material"];

/** The tabs M49 made a project earn, in the order they can arrive (Checks went at M89). */
export const EARNED_TABS = ["ontology", "exports"] as const;

export type EarnedTab = (typeof EARNED_TABS)[number];

export function isEarnedTab(tab: StudyTab): tab is EarnedTab {
  return (EARNED_TABS as readonly StudyTab[]).includes(tab);
}

/** The tabs greyed until earned (M62, ISC-607; Sources left the list at M85, ISC-712, and Checks at M89), in the strip's order. */
export const GATED_TABS = ["ontology", "exports"] as const;

export type GatedTab = (typeof GATED_TABS)[number];

export function isGatedTab(tab: StudyTab): tab is GatedTab {
  return (GATED_TABS as readonly StudyTab[]).includes(tab);
}

/**
 * How to open each greyed tab, in the owner's words (ISC-607): under the strip on
 * hover and focus, and on the tab's page if a link reaches it.
 */
export const TAB_UNLOCK: Readonly<Record<GatedTab, string>> = {
  ontology: "Emerging project ontology opens when Abductive suggests a first concept.",
  // M71, ISC-653: the acceptances that open Export since M63.
  exports: "Export opens once your ontology has a concept or a placed statement.",
};

/** A concept accepted or a statement placed: the ontology has something in it (M71, ISC-653). */
const ONTOLOGY_HAS_WORK = new Set(["concept-accepted", "statement-attached"]);

export function earnedBy(
  events: readonly LedgerEvent[],
  projectId: string,
): Readonly<Record<EarnedTab, boolean>> {
  let ontology = false;
  let exports = false;
  for (const event of events) {
    if (event.projectId !== projectId) continue;
    /* M63, ISC-612: the ontology tab opens at the first suggested concept. A
     * project that already holds claims keeps it open, since a place holding work
     * never closes (ISC-607): its claims are statements waiting for a concept. */
    if (event.type === "concept-suggested" || event.type === "concept-accepted" || event.type === "proposal") ontology = true;
    if (ONTOLOGY_HAS_WORK.has(event.type)) exports = true;
    else if (event.type === "ontology-mutation" && event.op === "create") exports = true;
    if (ontology && exports) break;
  }
  return { ontology, exports };
}

/** Which greyed tabs are open for this project (ISC-607), read from the record alone. */
export function openTabs(events: readonly LedgerEvent[], projectId: string): Readonly<Record<GatedTab, boolean>> {
  return earnedBy(events, projectId);
}

/** The tabs greyed on the strip for this project, as a set. */
export function closedTabs(events: readonly LedgerEvent[], projectId: string): ReadonlySet<StudyTab> {
  const open = openTabs(events, projectId);
  return new Set(GATED_TABS.filter((tab) => !open[tab]));
}
