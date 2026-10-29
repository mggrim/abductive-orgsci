/**
 * Your model, read as an argument (M30).
 *
 * The page used to render a picture of the model. The engine had already
 * computed the argument the model was making and none of it reached the
 * researcher: `checkAllObligations` surfaced as one grey row on Checks, and
 * `residueMonotonicallyShrinking`, which is the tool's thesis rendered as a
 * boolean, sat on the Design tab under a fold.
 *
 * Four things are pinned here.
 *
 *   The priority table, because the order of those seven rules is the whole
 *   product claim of the band and it is the part that gets quietly edited. Each
 *   row is tested at its own state and again one step either side of it, so a
 *   rule cannot be reordered without a failure naming the pair that swapped.
 *
 *   The two formatters, because they are the sentences a researcher reads and
 *   they are assembled from engine strings that were never written to be
 *   concatenated.
 *
 *   The discharge table, because a question per relation is the highest-value
 *   row in the design and an incomplete table would degrade silently to no
 *   question at all.
 *
 *   The page order, because the order is the design and nothing else enforces
 *   it.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent, PageType, PuzzleRelation } from "../src/ledger/events.ts";
import { PUZZLE_RELATIONS } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { checkObligation } from "../src/ontology/relations.ts";
import type { OntologyGraph } from "../src/ontology/schema.ts";
import { NO_ANCHORING, projectAnchoring } from "../src/views/anchoring.ts";
import { projectTrajectory } from "../src/views/trajectoryModel.ts";
import {
  DISCHARGE_QUESTION,
  DRAFTS_SECTION_ID,
  claimSentence,
  dischargeQuestion,
  obligationSentence,
  projectArgument,
  residueClause,
  type ArgumentMoveRule,
} from "../src/views/argumentModel.ts";
import type { Proposal, ProposalTray } from "../src/proposals/types.ts";

const P = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

let seq = 0;

const page = (id: string, type: PageType, title: string, chunks: string[] = []): LedgerEvent =>
  ({
    id: `m30-page-${(seq += 1)}`,
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    origin: "author-prior",
    title,
    body: "b",
    supportingChunks: chunks,
  }) as LedgerEvent;

const relate = (
  from: string,
  to: string,
  role: string,
  relation?: PuzzleRelation,
): LedgerEvent =>
  ({
    id: `m30-edge-${(seq += 1)}`,
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "relate",
    targetId: `edge-${from}-${to}-${role}`,
    edge: { from, to, role },
    origin: "author-prior",
    ...(relation === undefined ? {} : { puzzleRelation: relation }),
  }) as LedgerEvent;

const retire = (id: string): LedgerEvent =>
  ({
    id: `m30-retire-${(seq += 1)}`,
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "retire",
    targetId: id,
    origin: "author-prior",
  }) as LedgerEvent;

const graphOf = (events: readonly LedgerEvent[]): OntologyGraph => projectOntology(events, P);

/** A tray holding `n` pending drafts and nothing else. */
function trayOf(n: number): ProposalTray {
  const pending: Proposal[] = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    projectId: P,
    title: `draft ${i}`,
    body: "b",
    sourceChunks: [],
    status: "pending",
    proposedAt: 1,
  }));
  return { projectId: P, all: pending, pending, rejected: [], accepted: [], merged: [], deferred: [] };
}

const EMPTY_TRAY = trayOf(0);

/**
 * The band over a graph, with the two switches the priority table reads and the
 * graph does not: how many drafts are waiting, and whether what the account
 * cannot explain has only ever fallen.
 */
function band(
  events: readonly LedgerEvent[],
  /* M29b: a third switch. The absorption reading is a claim about a model
   * meeting its material, so it needs material read as well as claims made;
   * `dataPassagesTouched` is how the band knows any has been. */
  opts: { drafts?: number; shrinking?: boolean; touched?: number } = {},
) {
  const graph = graphOf(events);
  const trajectory = projectTrajectory(events, P);
  return projectArgument({
    graph,
    trajectory: { ...trajectory, residueMonotonicallyShrinking: opts.shrinking === true },
    tray: trayOf(opts.drafts ?? 0),
    anchoring: projectAnchoring(graph),
    moves: [],
    dataPassagesTouched: opts.touched ?? 0,
  });
}

const rule = (...args: Parameters<typeof band>): ArgumentMoveRule => band(...args).move.rule;

// ---------------------------------------------------------------------------
// The seven states, and the boundary either side of each

/** A puzzle with no expectation named. */
const PUZZLE_ONLY = [page("q1", "puzzle", "Nurses agree about the handoff and disagree about the patient")];

/** The same puzzle, standing to an expectation it contradicts and one observation. */
const CONTRADICTS_UNMET = [
  ...PUZZLE_ONLY,
  page("t1", "theory", "Handoff is information transfer"),
  relate("q1", "t1", "stands-to", "contradicts"),
  page("o1", "observation", "The nurse repeats the number back", ["c1"]),
  relate("o1", "q1", "evidences"),
];

/** The cheapest burden, discharged: a silence with something left unexplained. */
const SILENT_DISCHARGED = [
  ...PUZZLE_ONLY,
  page("t1", "theory", "Nothing in this literature speaks to night shifts"),
  relate("q1", "t1", "stands-to", "silent"),
  page("r1", "analytic-residue", "Why nobody names the decision point"),
  relate("r1", "q1", "contradicts"),
];

/* M29b. The same study, far enough along for "your account absorbed everything"
 * to be a claim about something: four live claims and a passage read. Below
 * that the band says "Nothing unexplained yet, which is normal this early",
 * because the alternative was a warning about a study that had not started. */
const ABSORBED = [
  ...SILENT_DISCHARGED,
  page("o9", "observation", "The night nurse writes the number down twice", ["c1"]),
  relate("o9", "q1", "evidences"),
];
const READ = { touched: 1 };

describe("the band picks one move, by the first rule that holds", () => {
  test("nothing in the model at all, and nothing waiting", () => {
    expect(rule([])).toBe("no-claims");
  });

  test("Anti: a draft waiting outranks an empty model", () => {
    // The boundary between rows one and two. An empty model with a draft in it
    // is one click from not being empty, so sending the researcher to Design to
    // answer another question would be the tool ignoring the answer it has.
    expect(rule([], { drafts: 1 })).toBe("drafts");
  });

  test("drafts waiting outrank everything below them", () => {
    // Read on a model that would otherwise fire the heaviest row on the table.
    expect(rule(CONTRADICTS_UNMET, { drafts: 2 })).toBe("drafts");
    expect(band(CONTRADICTS_UNMET, { drafts: 2 }).move.label).toBe("Review suggestions");
    expect(band(CONTRADICTS_UNMET, { drafts: 1 }).move.label).toBe("Review suggestion");
  });

  test("Anti: with nothing waiting the same model falls through to its obligation", () => {
    expect(rule(CONTRADICTS_UNMET)).toBe("obligation");
  });

  test("claims but no puzzle", () => {
    expect(rule([page("o1", "observation", "The nurse repeats the number back")])).toBe("no-puzzle");
  });

  test("Anti: a puzzle takes it off that row", () => {
    expect(rule(PUZZLE_ONLY)).not.toBe("no-puzzle");
  });

  test("a puzzle standing to nothing", () => {
    const model = band(PUZZLE_ONLY);
    expect(model.move.rule).toBe("no-expectation");
    expect(model.move.action).toEqual({ kind: "name-expectation" });
    expect(model.theory).toBeNull();
    expect(model.relation).toBeNull();
  });

  test("Anti: naming the expectation takes it off that row", () => {
    expect(rule(CONTRADICTS_UNMET)).not.toBe("no-expectation");
  });

  test("an obligation the claim has not met", () => {
    const model = band(CONTRADICTS_UNMET);
    expect(model.move.rule).toBe("obligation");
    expect(model.relation).toBe("contradicts");
    expect(model.obligation?.discharged).toBe(false);
    expect(model.unmet).toHaveLength(1);
  });

  test("Anti: discharging it takes it off that row", () => {
    const model = band(SILENT_DISCHARGED);
    expect(model.obligation?.discharged).toBe(true);
    expect(model.move.rule).not.toBe("obligation");
    expect(model.unmet).toEqual([]);
  });

  test("an account that has only ever absorbed", () => {
    expect(rule(ABSORBED, { shrinking: true, ...READ })).toBe("residue");
  });

  test("M29b: the same study before it has met any material carries on", () => {
    // "Your account absorbed everything your material offered" over a study
    // that has opened nothing is a warning about nothing. The move falls
    // through to the state that has nothing wrong in it.
    expect(rule(ABSORBED, { shrinking: true })).toBe("carrying");
  });

  test("Anti: an unmet obligation still outranks the shrink warning", () => {
    // The boundary between rows five and six, and it is the one worth pinning:
    // the shrink warning is the more alarming sentence and the obligation is
    // the more actionable one.
    expect(rule(CONTRADICTS_UNMET, { shrinking: true })).toBe("obligation");
  });

  test("a claim carrying its burden, with material that has pushed back", () => {
    const model = band(SILENT_DISCHARGED);
    expect(model.move.rule).toBe("carrying");
    // M30 (R10): the section, so the control lands on the ordinary version
    // rather than at the top of a long Checks page.
    expect(model.move.action).toEqual({
      kind: "tab",
      tab: "coherence",
      section: "ordinary-version",
    });
  });

  test("Anti: every rule in the table is reachable, so no row is dead", () => {
    // Without this the seven cases above could all be passing while two of them
    // name the same rule.
    const reached = new Set<ArgumentMoveRule>([
      rule([]),
      rule([], { drafts: 1 }),
      rule([page("o1", "observation", "A thing seen")]),
      rule(PUZZLE_ONLY),
      rule(CONTRADICTS_UNMET),
      rule(ABSORBED, { shrinking: true, ...READ }),
      rule(SILENT_DISCHARGED),
    ]);
    expect([...reached].sort()).toEqual([
      "carrying",
      "drafts",
      "no-claims",
      "no-expectation",
      "no-puzzle",
      "obligation",
      "residue",
    ]);
  });

  test("the band gives up the weight in the one state where the queue owns it", () => {
    /* The design's rule is one primary per state, and the drafts row is the
     * only one where the act happens somewhere else on this page. Two filled
     * controls for one act is the failure round 3 removed from Design, and the
     * decision buttons in the drafts section are the ones to press. */
    expect(band([], { drafts: 1 }).move.primary).toBe(false);
    for (const model of [
      band([]),
      band([page("o1", "observation", "A thing seen")]),
      band(PUZZLE_ONLY),
      band(CONTRADICTS_UNMET),
      band(SILENT_DISCHARGED, { shrinking: true }),
      band(SILENT_DISCHARGED),
    ]) {
      expect({ rule: model.move.rule, primary: model.move.primary }).toEqual({
        rule: model.move.rule,
        primary: true,
      });
    }
  });

  test("the drafts move points at the section on this page, not at a route", () => {
    // The app routes on the hash, so `#drafts` would parse as an unknown path
    // and land the reader on Design. `NextBar.tsx` hit the same wall.
    expect(band([], { drafts: 1 }).move.action).toEqual({
      kind: "section",
      section: DRAFTS_SECTION_ID,
    });
  });
});

// ---------------------------------------------------------------------------

describe("every slot degrades to a named gap", () => {
  test("an empty model says so rather than rendering nothing", () => {
    /* M28 r6: copy. The band's residue clause is empty below the absorption
     * threshold, because the panel forty lines down already prints "Nothing
     * unexplained yet. This early that is normal" and the two said the same
     * fact twice in near-identical words. The claim sentence still names the
     * gap, which is what this test is for. */
    const model = band([]);
    expect(claimSentence(model)).toBe("Your first claim is still to come.");
    expect(residueClause(model)).toBe("");
  });

  test("claims with no puzzle name the gap as the gap", () => {
    const model = band([page("o1", "observation", "A thing seen")]);
    expect(claimSentence(model)).toContain("your puzzle is still to come");
  });

  test("a puzzle with no expectation names that gap", () => {
    expect(claimSentence(band(PUZZLE_ONLY))).toContain("haven't said which expectation it breaks");
  });

  test("a full claim reads as one sentence about this study", () => {
    const said = claimSentence(band(CONTRADICTS_UNMET));
    expect(said).toContain("Nurses agree about the handoff and disagree about the patient");
    expect(said).toContain("contradicts");
    expect(said).toContain("Handoff is information transfer");
  });

  test("Anti: no relation is interpolated into the sentence as its raw slug", () => {
    // `silent` is the one that cannot be a verb: "your puzzle silent the
    // account" is not a sentence, and the graph holds the word either way.
    const said = claimSentence(band(SILENT_DISCHARGED));
    expect(said).not.toContain(" silent ");
    expect(said).toContain("falls in a gap left by");
  });

  test("the closing clause says whether the list has ever grown", () => {
    const absorbed = band(ABSORBED, { shrinking: true, ...READ });
    expect(residueClause(absorbed)).toContain("only shrunk since you started");
    const ordinary = band(SILENT_DISCHARGED);
    expect(residueClause(ordinary)).toContain("1 finding sits outside what your ontology can explain");
    expect(residueClause(ordinary)).not.toContain("only shrunk");
  });

  test("M29b: it says nothing about absorption before there is any to read", () => {
    // Both sides of the threshold, on the study the methods critic caught: two
    // claims, no material opened, and the band telling the researcher their
    // account had absorbed everything directly above a panel saying that having
    // nothing unexplained is normal this early.
    const early = band(PUZZLE_ONLY);
    expect(early.absorptionMeasurable).toBe(false);
    // M28 r6: copy. Silent below the threshold rather than duplicating the
    // panel below. Above it the sentence is a reading rather than a scold,
    // which is the half of the threshold this test exists to protect.
    expect(residueClause(early)).toBe("");
    // Claims but no material read, which is the two-claim study exactly.
    const unread = band(ABSORBED.filter((e) => e.type !== "attention"));
    expect(unread.absorptionMeasurable).toBe(false);
    // And past it, where the sentence is a reading rather than a scold.
    const met = band(ABSORBED, READ);
    expect(met.absorptionMeasurable).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("an obligation, as prose", () => {
  const graph = graphOf(CONTRADICTS_UNMET);
  const unmet = checkObligation(graph, "q1", "t1", "contradicts");

  test("it leads with what is owed and closes with what you have", () => {
    /* M28 r6: copy. It read "That claim owes you this. Show the deviation is
     * systematic rather than anecdotal: at least two independent observations…",
     * which is three sentences to say one thing, because a fixed lead stood in
     * front of a requirement that was itself a whole sentence. `relations.ts`
     * declares the two halves separately now, so the frame reads straight. */
    const said = obligationSentence(unmet);
    expect(said.startsWith(`That claim owes you ${unmet.owed}: `)).toBe(true);
    expect(said).toContain(unmet.evidence);
    // M28 r6: copy. No label. It read "So far: You have none so far, and a
    // single instance reads as a weird case", a label in front of a detail that
    // already carried one. Every detail is a complete sentence now, and it says
    // whether the claim is met without a word standing in front of it.
    expect(said).not.toContain("So far:");
    expect(said).toContain(unmet.detail);
    // One sentence for the obligation, not two welded together.
    expect(said).not.toContain("owes you this.");
  });

  test("a discharged claim reads as met rather than as owed and unpaid", () => {
    const met = checkObligation(graphOf(SILENT_DISCHARGED), "q1", "t1", "silent");
    expect(met.discharged).toBe(true);
    // M28 r6: copy. The discharged reading is in the detail sentence itself.
    expect(obligationSentence(met)).toContain(met.detail);
    expect(obligationSentence(met)).not.toContain("You have it:");
    expect(obligationSentence(met)).not.toContain("So far:");
  });

  test("Anti: the frame works for all four relations and leaves no engine string out", () => {
    // The formatter concatenates two strings the engine wrote separately, and
    // the failure mode is grammatical rather than logical: an earlier cut read
    // "That claim owes you only 1 observation(s) evidence this puzzle".
    for (const relation of PUZZLE_RELATIONS) {
      const result = checkObligation(graph, "q1", "t1", relation);
      const said = obligationSentence(result);
      // M28 r6: copy. The band writes its own frame from the two halves, so
      // what has to survive is the evidence clause, not the whole sentence
      // `requirement` builds for the surfaces that want one.
      expect({ relation, has: said.includes(result.evidence) }).toEqual({ relation, has: true });
      expect({ relation, has: said.includes(result.detail) }).toEqual({ relation, has: true });
      // Two full stops before the engine's own prose starts, so no clause is
      // welded onto the front of a sentence that did not expect one.
      // M28 r6: copy. The frame still has to work for all four relations, and
      // still has to leave the engine's own prose intact after it.
      expect({ relation, lead: said.startsWith(`That claim owes you ${result.owed}: `) }).toEqual({
        relation,
        lead: true,
      });
    }
  });
});

// ---------------------------------------------------------------------------

describe("the question that discharges each burden", () => {
  test("there is exactly one per relation, and it is a question", () => {
    expect(Object.keys(DISCHARGE_QUESTION).sort()).toEqual([...PUZZLE_RELATIONS].sort());
    for (const relation of PUZZLE_RELATIONS) {
      const asked = dischargeQuestion(relation);
      expect({ relation, ends: asked.trim().endsWith("?") }).toEqual({ relation, ends: true });
      // One question, not two stacked behind one mark. `exposes` carries a
      // three-part burden and still gets one, because a next move that asks
      // three things has stopped being a next move.
      expect({ relation, marks: asked.split("?").length - 1 }).toEqual({ relation, marks: 1 });
    }
  });

  test("Anti: no two relations are handed the same question", () => {
    const asked = PUZZLE_RELATIONS.map(dischargeQuestion);
    expect(new Set(asked).size).toBe(PUZZLE_RELATIONS.length);
  });

  test("Anti: none of them supplies the answer it is asking for", () => {
    // The same bar the interviewer's own moves are held to. A question that
    // tells the researcher what to find has stopped being a question.
    for (const relation of PUZZLE_RELATIONS) {
      const asked = dischargeQuestion(relation);
      expect({ relation, tells: /^(Find|Add|Write|Go and)\b/.test(asked) }).toEqual({
        relation,
        tells: false,
      });
    }
  });
});

// ---------------------------------------------------------------------------

describe("the band reads the graph and nothing else", () => {
  test("it counts what the account cannot explain over the live claims", () => {
    expect(band(SILENT_DISCHARGED).residueCount).toBe(1);
    expect(band([...SILENT_DISCHARGED, retire("r1")]).residueCount).toBe(0);
  });

  test("it carries the unlinked count the table's column is drawn from", () => {
    // One computation behind the band's reading and the index's column, so the
    // two cannot disagree about which claim nothing joins.
    const events = [...PUZZLE_ONLY, page("o1", "observation", "A thing seen")];
    expect(band(events).unanchoredCount).toBe(projectAnchoring(graphOf(events)).unanchored.length);
    expect(band(events).unanchoredCount).toBe(2);
  });

  test("Anti: an empty study produces a band rather than an exception", () => {
    const model = projectArgument({
      graph: graphOf([]),
      trajectory: projectTrajectory([], P),
      tray: EMPTY_TRAY,
      anchoring: NO_ANCHORING,
      moves: [],
    });
    expect(model.claimCount).toBe(0);
    expect(model.move.rule).toBe("no-claims");
    expect(model.nextQuestion).toBeNull();
  });
});

// ---------------------------------------------------------------------------


// M63, the lead's rulings of 2026-09-30: the old model tab's ONTOLOGY_SRC left with it; superseded: describe("the page reads in the order the design puts it in", () => {

// ---------------------------------------------------------------------------

describe("what left the Design tab, and what left the table", () => {
  test("the trajectory panel is no longer mounted on Design", async () => {
    // It rendered the two most useful readings the tool computes, under a fold,
    // on a page about answering questions. What your account cannot explain and
    // whether that list has ever grown now stand on the page that bears the
    // model's name.
    const src = await Bun.file(new URL("../src/workbench/Instrumentation.tsx", import.meta.url)).text();
    const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toContain("<TrajectoryView");
    // The other readings stay: this was a removal of one panel, not of the fold.
    for (const kept of ["<LedgerView", "<TerritoryView", "<SpineView", "<CoverageMap"]) {
      expect({ kept, present: code.includes(kept) }).toEqual({ kept, present: true });
    }
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's ModelMovement, ResiduePanel left with it; superseded: "the shrink warning moved rather than being rewritten"

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel left with it; superseded: "the table"

  // M63, the lead's rulings of 2026-09-30: the old model tab's OntologyView left with it; superseded: "the ordinary version keeps its home on Checks and gains an anchor"
});

// ---------------------------------------------------------------------------
