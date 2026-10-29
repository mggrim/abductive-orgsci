/**
 * Two puzzles, and the band saying which one it reads (D31, M43c).
 *
 * What the walk of 2026-09-13 found. Both cards the material read filed as "the
 * thing your model has to explain" became `KIND: puzzle`: "Uniform pages stop
 * mentors from reading them" and "Introduced founders get longer office-hours
 * slots". The band said "Your puzzle is..." in the singular and worked on the
 * first; the second sat in the claims table carrying its own unanswered "Name the
 * expectation it breaks", and the move's own rationale went on saying "your puzzle
 * isn't attached to any of them" after the first one was.
 *
 * The worse half is that the one it ignored was the better candidate. The
 * expectation the researcher chose was Hallen's compounding-advantage claim, and
 * the second puzzle is the contact asymmetry itself, so the band steered them at
 * the weaker of the two pairings it held. (The band itself, which drew the
 * clause under the claim, left with the checks at M89; the sentence stays.)
 *
 * Whether a study may hold more than one puzzle is not settled by this milestone
 * and no behaviour here changes. What changes is that both surfaces name the
 * puzzle they mean whenever there is a second one to confuse it with. The options
 * for the rule itself are in the M43c report.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectAnchoring } from "../src/views/anchoring.ts";
import { projectTrajectory } from "../src/views/trajectoryModel.ts";
import { projectArgument, whichPuzzleClause } from "../src/views/argumentModel.ts";
import { generateMoves } from "../src/interview/moves.ts";
import { projectInterview } from "../src/interview/state.ts";
import type { ProposalTray } from "../src/proposals/types.ts";

const P = "55555555-4444-4444-8444-555555555555";
let seq = 0;

const FIRST = "Uniform pages stop mentors from reading them";
const SECOND = "Introduced founders get longer office-hours slots";

function create(id: string, type: PageType, title: string): LedgerEvent {
  seq += 1;
  return {
    id: `tp-${seq}`,
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    origin: "data-driven",
    title,
    body: "b",
    supportingChunks: ["c1"],
  } as LedgerEvent;
}

function retire(id: string): LedgerEvent {
  seq += 1;
  return {
    id: `tp-retire-${seq}`,
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "retire",
    targetId: id,
    origin: "author-prior",
    reason: "folded into the other one",
  } as LedgerEvent;
}

const EMPTY_TRAY: ProposalTray = {
  projectId: P,
  all: [],
  pending: [],
  rejected: [],
  accepted: [],
  merged: [],
  deferred: [],
};

function band(events: readonly LedgerEvent[]) {
  const graph = projectOntology(events, P);
  return projectArgument({
    graph,
    trajectory: projectTrajectory(events, P),
    tray: EMPTY_TRAY,
    anchoring: projectAnchoring(graph),
    moves: [],
  });
}

const ONE = [create("pz1", "puzzle", FIRST)];
const TWO = [...ONE, create("pz2", "puzzle", SECOND)];
const THREE = [...TWO, create("pz3", "puzzle", "Hannah Foster keeps two documents each week")];

describe("how many puzzles the band knows about (D31)", () => {
  test("the count is of live roots, so a retired puzzle stops counting", () => {
    expect(band(ONE).puzzleCount).toBe(1);
    expect(band(TWO).puzzleCount).toBe(2);
    expect(band([...TWO, retire("pz2")]).puzzleCount).toBe(1);
  });

  test("the band still reads the first, which is the behaviour this leaves alone", () => {
    expect(band(TWO).puzzle?.title).toBe(FIRST);
  });
});

describe("the sentence that says which one (D31)", () => {
  test("with one puzzle it says nothing at all", () => {
    expect(whichPuzzleClause(band(ONE))).toBe("");
    expect(whichPuzzleClause(band([]))).toBe("");
  });

  test("with two it names the one it reads and where the other is", () => {
    expect(whichPuzzleClause(band(TWO))).toBe(
      `Your ontology has 2 puzzles, and these lines are about "${FIRST}". The other puzzle sits among your statements with its own question.`,
    );
  });

  test("with three it says so in the plural", () => {
    expect(whichPuzzleClause(band(THREE))).toContain(
      "The other 2 puzzles sit among your statements with their own questions.",
    );
  });
});

/* The panel this was written against is gone (M46): "What the tool would ask
 * next" left Your model, because the same questions were offered on Design (behind
 * a menu that itself left at M59; the tool now raises them in the step's
 * conversation), which is the only place one can be answered. What it
 * was about survives it. The rationale is written by `generateMoves` and rendered
 * into the model's brief at the step, so a question reading "what in your setting fits
 * this expectation" with no expectation named still points at nothing. */
describe("a move names the puzzle it is asking about (D31)", () => {
  test("the expectation move quotes the puzzle rather than saying 'your puzzle'", () => {
    const events = [
      ...TWO,
      create("th1", "theory", "Initial position compounds absent a structural change"),
    ];
    const graph = projectOntology(events, P);
    const moves = generateMoves({
      graph,
      state: projectInterview(events, P),
      coveredCells: [],
      matrix: [],
      turnIndex: 0,
    });
    const move = moves.find((m) => m.topic === "literature:expectation-broken");
    expect(move).toBeDefined();
    expect(move?.rationale).toContain(`your puzzle "${FIRST}"`);
    // The sentence the walk read, which went on being true-looking after the
    // first puzzle was attached.
    expect(move?.rationale).not.toContain("your puzzle isn't attached to any of them");
  });
});
