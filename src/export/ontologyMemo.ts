/**
 * The prose memo (ISC-68), the human rendering of the same source.
 *
 * v1's memo (`memoReport.ts`) reported challenges and adjudications, because
 * that was what v1 had. This one is about the ontology, and it is written to
 * be read by a co-author who was not in the session: what the puzzle is, what
 * it claims to do to the literature and whether it has earned that, what the
 * account cannot absorb, and where the thinking came from.
 *
 * It states the uncomfortable things rather than burying them. A memo that
 * reports 70% model-originated constructs as a neutral statistic is not doing
 * the researcher a favour: that number is the finding.
 *
 * Pure: no clock unless injected, no inference.
 */

import { conceptReportLines } from "./conceptsExport.ts";
import { decidedReading, puzzleExportLines } from "../views/puzzleReading.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { edgesFrom, livePages, pagesOfType } from "../ontology/schema.ts";
import { checkAllObligations } from "../ontology/relations.ts";
import { projectInterview } from "../interview/state.ts";
import { projectProposals } from "../proposals/projection.ts";
import type { LabelContext } from "../concepts/statementOrigin.ts";
import { projectTrajectory } from "../views/trajectoryModel.ts";
import { projectSpine } from "../views/spineModel.ts";
import { censusOf, censusWritten, LIVE_PAGES, originCensus } from "../ontology/attribution.ts";
import { opsCounted } from "../ui/ontologyOpVocabulary.ts";
import type { Project } from "../state/projects.ts";
import type { TwinComparison } from "../twin/compare.ts";
import { stampLine } from "./stamp.ts";
import { localStamp, zoneLine } from "./localTime.ts";
import {
  doubtsOn,
  originDoubtShareCaveat,
  originDoubtWritten,
  originDoubts,
} from "../ontology/originAudit.ts";

export interface OntologyMemoParams {
  readonly project: Project;
  readonly graph: OntologyGraph;
  readonly events: readonly LedgerEvent[];
  /** Included when the twin has been revealed; omitted otherwise (reveal is gated). */
  readonly comparison?: TwinComparison;
  readonly now?: () => number;
  /** The corpus, so each statement carries its origin label (M75, ISC-669). */
  readonly labels?: LabelContext;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function buildOntologyMemo(params: OntologyMemoParams): string {
  const { project, graph, events } = params;
  const now = params.now ?? (() => Date.now());
  const at = now();

  const interview = projectInterview(events, project.id);
  const trajectory = projectTrajectory(events, project.id);
  const spine = projectSpine(events, project.id);
  const tray = projectProposals(events, project.id);
  /* M89 (2026-10-14): the checks' flags (outstanding, dismissed or withdrawn,
   * and held open) left the Report with the checks, on the owner's
   * instruction. History keeps the events. */
  const pages = livePages(graph);
  const title = (id: string) => graph.pages.get(id)?.title ?? id;

  const out: string[] = [
    `# ${project.title}`,
    "",
    /* M74a, ISC-663: the researcher's local time, and the zone named once here. */
    `_Abductive wrote this report from your project's History on ${localStamp(at)}. ${zoneLine(at)} Abductive reads everything below from the recorded session and adds only what that session recorded._`,
    "",
    // The identifier travels inside the file. It used to live only in a
    // separate receipt the researcher had to remember to download and keep
    // beside this one, so a memo in a co-author's inbox could not say which
    // version of the design it was a memo of.
    `_${stampLine(events)}_`,
    "",
    ...puzzleExportLines(project.brief, decidedReading(events, project.id)),
    /* M63, ISC-613: the emerging project ontology, the lines to look for in
       the field and the readiness report lead the Report. The sections after
       them are the claims' own, kept where they still hold. */
    ...conceptReportLines(events, project.id, graph, params.labels),
  ];

  // ── The puzzle ────────────────────────────────────────────────────────────
  /* M74a, ISC-661 (the walk, finding 9): the puzzle is stated once, at the top
     (`puzzleExportLines`), or one line there says it is missing. This section
     printed "You have not established a puzzle root yet" under a stated puzzle,
     so it now appears only for the puzzle pages a project holds. */
  if (graph.puzzleRoots.length > 0) {
    out.push("## The puzzle");
    out.push("");
    for (const id of graph.puzzleRoots) {
      const puzzle = graph.pages.get(id);
      if (puzzle === undefined) continue;
      out.push(`### ${puzzle.title}`, "");
      if (puzzle.body.trim() !== "") out.push(puzzle.body.trim(), "");
      const standsTo = edgesFrom(graph, id, "stands-to");
      const claims = graph.relations.filter((r) => r.puzzleId === id);
      if (standsTo.length === 0 && claims.length === 0) {
        out.push(
          "_You have not yet linked this puzzle to a theoretical expectation. A phenomenon that leaves every account standing is an observation rather than a puzzle._",
          "",
        );
      }
    }
  }
  if (graph.puzzleRoots.length > 1) {
    out.push(
      `_${graph.puzzleRoots.length} puzzles are live at once. That is legitimate at this stage; carrying more than three into data collection rarely is._`,
      "",
    );
  }

  // ── The framing claim and what it owes ────────────────────────────────────
  /* Passages, not documents (M29, E3), because this builder is not handed the
   * corpus and the fix needs it: `contradicts` counts source documents, and
   * without the map every passage counts as its own source. So the memo can
   * read a claim as discharged that the app, the checks and the argument band
   * all read as owing. Closing it means threading `chunks` through this
   * builder's params and every call site, which is a change to make on purpose
   * rather than in passing. `buildAgentGraph` already takes the corpus and
   * passes it. */
  const obligations = checkAllObligations(graph);
  out.push("## What your starting point claims, and what it owes");
  out.push("");
  if (obligations.length === 0) {
    out.push(
      "You have not asserted a puzzle→theory relation yet, so the design does not currently claim to do anything to the literature.",
      "",
    );
  } else {
    for (const o of obligations) {
      out.push(
        `**${title(o.puzzleId)}** _${o.relation}_ **${title(o.theoryId)}**.`,
        "",
        `That claim owes: ${o.requirement}`,
        "",
        o.discharged
          ? `Discharged. ${o.detail}`
          : `**Not discharged.** ${o.detail} Either supply that evidence, or make the weaker claim the current evidence supports.`,
        "",
      );
    }
  }

  // ── What the account cannot absorb ────────────────────────────────────────
  const residue = pagesOfType(graph, "analytic-residue");
  out.push("## What the account cannot absorb");
  out.push("");
  if (residue.length === 0) {
    out.push(
      "You haven't recorded a passage as resisting the current account. On a project of any maturity that silence is worth questioning, because an account has more often absorbed its residue than met none.",
      "",
    );
  } else {
    for (const page of residue) {
      out.push(`- **${page.title}**: ${page.body.trim() === "" ? "_no body_" : page.body.trim()}`);
    }
    out.push("");
  }
  if (trajectory.residueMonotonicallyShrinking) {
    out.push(
      "_Residue has only fallen since its peak. Every piece of data that arrived was absorbed by the existing account, without resistance. Worth asking what stopped resisting, and when._",
      "",
    );
  }

  // ── Rivals ────────────────────────────────────────────────────────────────
  const rivals = pagesOfType(graph, "rival");
  out.push("## Rivals");
  out.push("");
  if (rivals.length === 0) {
    out.push(
      "You haven't recorded a rival account. A resolution without a competitor is still untested.",
      "",
    );
  } else {
    for (const page of rivals) out.push(`- ${page.title}`);
    out.push("");
  }

  // ── Where the thinking came from ──────────────────────────────────────────
  out.push("## Where the thinking came from");
  out.push("");
  /* The caveat goes before the figure and not after it.
   *
   * This is the section a reader checks the product's central claim against, so
   * a share computed over a column with known errors in it must not be read
   * first and qualified second. See `src/ontology/originAudit.ts` for what the
   * errors are and why they are reported rather than silently corrected. */
  /* Scoped to the live pages this memo describes, and that is a count fix
   * rather than tidying. `originDoubts` reads the ledger, so it can name a page
   * that has since been superseded and is on nobody's screen; the count printed
   * here has to be a count of the rows the reader can go and look at, which is
   * the same population /ontology puts the caveat over. See `doubtsOn`. */
  const doubtMap = originDoubts(events, project.id);
  const doubted = doubtsOn(doubtMap, pages);
  if (doubted.length > 0) {
    out.push(`_${originDoubtShareCaveat(doubted.length)}_`, "");
    for (const page of pages) {
      const doubt = doubtMap.get(page.id);
      // Third person and through the vocabulary, not the raw stamp. This line
      // printed "recorded as author-prior" into a document written for a
      // co-author or a methods section, which is the round-nine defect in the
      // one sentence written to correct a different defect in the same column.
      if (doubt !== undefined) out.push(`- **${page.title}**: ${originDoubtWritten(doubt)}.`);
    }
    out.push("");
  }
  /* Two sentences, because there are two populations and this paragraph used
   * to run them together.
   *
   * It read "44 live pages across 98 recorded revisions: 33 the researcher's
   * prior, 33 forced by the data, 32 proposed by a model", and every part of
   * that after the first four words was wrong for the reader it was written
   * for. The colon offers 33, 33 and 32 as a breakdown of 44, and they are a
   * breakdown of 98. The 98 counted 44 creates and 54 relations, so more than
   * half of it was not pages at all, and it called them revisions on a study
   * where `revise` had fired zero times. A co-author reading this memo beside
   * the /ontology index would have found the index carrying 15 solid discs
   * where the memo said 33.
   *
   * The attribution sentence is the census, and the census carries its own
   * denominator. The ledger sentence is the work behind it, named by op. The
   * words in both come from the vocabularies, not from here. */
  const attribution = originCensus(pages, LIVE_PAGES);
  out.push(`${censusWritten(attribution)}.`, "");
  const composition = opsCounted(trajectory.byOp);
  if (trajectory.mutations.population > 0) {
    out.push(
      `Behind ${pages.length === 1 ? "it" : "them"}, ${censusOf(trajectory.mutations)}${
        composition === "" ? "" : `: ${composition}`
      }.`,
      "",
    );
  }
  const modelShare = attribution.modelShare;
  if (modelShare !== null && modelShare >= 0.5) {
    out.push(
      `**${pct(modelShare)} of this ontology originated with the model.** That is not automatically wrong, but it is the number that a reader will ask about, and the answer cannot be that the suggestions happened to be correct. Which of these claims would you have arrived at independently?`,
      "",
    );
  }

  // ── How the session went ──────────────────────────────────────────────────
  out.push("## How the session went");
  out.push("");
  out.push(
    `${interview.turns} question${interview.turns === 1 ? "" : "s"} asked` +
      (interview.interrogationRatio === null
        ? ""
        : `, ${pct(interview.interrogationRatio)} of them questions rather than advice`) +
      `. ${spine.branchCount} redirection${spine.branchCount === 1 ? "" : "s"} by the researcher. ` +
      `${spine.barrenTurns} turn${spine.barrenTurns === 1 ? "" : "s"} left the ontology unchanged.`,
    "",
  );
  if (interview.silencedTopics.length > 0) {
    out.push(
      `Abductive stopped raising ${interview.silencedTopics.length} topic${interview.silencedTopics.length === 1 ? "" : "s"} after repeated passes: ${interview.silencedTopics.join(", ")}. ` +
        "Declining is legitimate and unpenalised. Abductive records a decline because a topic that a researcher will not go near is usually worth returning to when they choose.",
      "",
    );
  }
  if (tray.rejected.length > 0) {
    out.push(
      `${tray.rejected.length} model suggestion${tray.rejected.length === 1 ? " was" : "s were"} rejected:`,
      "",
    );
    for (const p of tray.rejected) out.push(`- _${p.title}_: ${p.reason ?? "(no reason recorded)"}`);
    out.push("");
  }

  // ── Against the modal baseline ────────────────────────────────────────────
  if (params.comparison !== undefined) {
    out.push("## Against the ordinary version", "", params.comparison.summary, "");
  }

  out.push(
    "---",
    "",
    /* M74a, ISC-663 (the walk, finding 17): one affirmative sentence. M89: its
       second clause, "Abductive keeps every contradiction in view so you can
       settle it", described the checks and went with them. */
    "_This report describes a design that is still changing._",
  );
  return out.join("\n");
}
