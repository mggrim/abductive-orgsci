/**
 * Next-move generation and the divergence guarantee (ISC-44).
 *
 * The requirement is that the 2–3 moves offered each turn "differ in target,
 * not just wording". That is a real constraint and easy to fake: three
 * rephrasings of the same question look like a choice and are not one. So
 * divergence is checked structurally — distinct topics, distinct targets, and
 * a wording-similarity ceiling — and the generator draws each candidate from a
 * different source so the check usually passes for the right reason.
 *
 * Everything here is pure. The caller supplies `turnIndex` for id generation
 * rather than the module reaching for a clock or a UUID, so a given context
 * always produces the same moves and the test suite can assert on them.
 */

import type { PageType } from "../ledger/events.ts";
import type { MatrixCell } from "../matrix/schema.ts";
import type { StationId } from "../flow/stations.ts";
import { countOf } from "../ui/format.ts";
import type { ProjectBrief } from "../state/projects.ts";
import { stationProbes } from "./stationProbes.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { livePages, pagesOfType } from "../ontology/schema.ts";
import { checkAllObligations, type ChunkDocuments } from "../ontology/relations.ts";
import { RELATION_BURDEN } from "../ontology/relations.ts";
import type { InterviewState } from "./types.ts";
import type { MoveSource, NextMove, TurnMode } from "./types.ts";
import { topicLabel } from "./topicLabel.ts";
import {
  BASELINE_QUESTION,
  baselineRationale,
  baselineTopic,
} from "../proposals/baselines.ts";
import { obligationTopic } from "../proposals/obligations.ts";

/** Wording similarity above which two questions count as the same question. */
export const WORDING_CEILING = 0.7;

export const MIN_MOVES = 2;
export const MAX_MOVES = 3;

export interface MoveContext {
  readonly graph: OntologyGraph;
  readonly state: InterviewState;
  /** Matrix cells that have already fired at least once. */
  readonly coveredCells: readonly string[];
  readonly matrix: readonly MatrixCell[];
  /** Turn number, used only to make move ids unique. */
  readonly turnIndex: number;
  /**
   * The station the researcher is standing on, when they are in the design
   * view. The loop and the eight stations were built two milestones apart and
   * never introduced, so the dialogue asked about the graph while the station
   * beside it asked a fixed question out of a constant file.
   */
  readonly station?: StationId;
  readonly brief?: ProjectBrief;
  readonly chunkCount?: number;
  /**
   * How many passages the researcher has opened, from the human attention
   * layer (M29, R9).
   *
   * Separate from `chunkCount`, which counts what is in storage. The Early data
   * step could only ever be empty or answered, because the probe read the
   * corpus size and a study with material always looked answered at length.
   * "Thin" is material loaded and barely read, and only the attention events
   * can tell the difference between a corpus you uploaded and a corpus you have
   * been through.
   */
  readonly passagesOpened?: number;
  /**
   * The papers named, and which passages belong to each (M29, A4).
   *
   * An uploaded file carries its passages; a line the researcher typed with no
   * upload behind it carries none. `papersToRead` in `proposals/theory.ts` is
   * the one definition of that list and this is the same list, so the interview
   * cannot count the reading list differently from the reader that drafts out
   * of it.
   */
  readonly papers?: readonly PaperRef[];
  /**
   * Which document each passage came from (M29, E3).
   *
   * The obligation move quotes `contradicts` back at the researcher with what it
   * owes and what it currently has. Without this the sentence said "2
   * observations across 2 source documents" over two quotes from one interview,
   * so the loop asked its hardest question about a burden it had already
   * declared met.
   */
  readonly chunkDocuments?: ChunkDocuments;
  /**
   * What the papers expect and nobody has answered yet (M33).
   *
   * In list order, papers in the order they were judged. The literature source
   * used to be gated on the first accepted theory page, so it was silent
   * through the whole early period of a study: a paper could sit in the list
   * for a week and the interviewer would never mention it. A baseline exists
   * from the moment a paper is judged, which is the moment it can be put to the
   * researcher.
   *
   * Built by `openBaselines(paperBaselines(...), baselinesSettled(...))`, off
   * the same record the paper's row on Material reads, so the loop cannot count
   * a paper's expectations differently from the page that shows them.
   */
  readonly baselines?: readonly OpenBaseline[];
}

/**
 * One unanswered expectation, and the paper that holds it.
 *
 * No scope. The move card quotes the expectation and asks what in the setting
 * fits it; where its authors say it holds is on the paper's row on Material,
 * where the researcher is looking at the paper. Carrying it here and not
 * drawing it would be a field that promises the card shows something it does
 * not.
 */
export interface OpenBaseline {
  /** The baseline id, which is the move's target and the topic's tail. */
  readonly id: string;
  /** What the researcher calls the paper. Never the tool, never them. */
  readonly paperName: string;
  readonly expectation: string;
}

/** One paper, as the interview needs it: what it is called and what is in it. */
export interface PaperRef {
  readonly name: string;
  readonly chunkIds: readonly string[];
}

// ---------------------------------------------------------------------------
// Divergence
// ---------------------------------------------------------------------------

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

/** Dice coefficient over word tokens. */
export function wordingSimilarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (x.size === 0 || y.size === 0) return 0;
  let overlap = 0;
  for (const t of x) if (y.has(t)) overlap += 1;
  return (2 * overlap) / (x.size + y.size);
}

/** What a move is actually about: its ontology target if it has one, else its topic. */
function effectiveTarget(move: NextMove): string {
  return move.targetId ?? move.topic;
}

/**
 * Structural check that a set of moves is a real choice. Returns human-readable
 * errors; empty means the set is divergent.
 */
export function divergenceErrors(moves: readonly NextMove[]): string[] {
  const errors: string[] = [];
  if (moves.length < MIN_MOVES) errors.push(`only ${countOf(moves.length, "move")}; at least ${MIN_MOVES} required`);
  if (moves.length > MAX_MOVES) errors.push(`${moves.length} moves offered; at most ${MAX_MOVES} allowed`);

  const topics = new Set<string>();
  const targets = new Set<string>();
  for (const move of moves) {
    if (topics.has(move.topic)) errors.push(`two moves share topic '${move.topic}'`);
    topics.add(move.topic);
    const target = effectiveTarget(move);
    if (targets.has(target)) errors.push(`two moves share target '${target}'`);
    targets.add(target);
    if (countQuestions(move.question) !== 1) {
      errors.push(`move '${move.id}' does not ask exactly one question`);
    }
  }

  for (let i = 0; i < moves.length; i++) {
    for (let j = i + 1; j < moves.length; j++) {
      const a = moves[i];
      const b = moves[j];
      if (a === undefined || b === undefined) continue;
      const sim = wordingSimilarity(a.question, b.question);
      if (sim >= WORDING_CEILING) {
        errors.push(
          `moves '${a.id}' and '${b.id}' are ${(sim * 100).toFixed(0)}% the same question. A rephrasing is not an alternative`,
        );
      }
    }
  }
  return errors;
}

/**
 * How a quoted expectation is attributed on a move card (M33).
 *
 * The same words the paper's row on Material uses, so a researcher meeting the
 * expectation in the interview and on the paper reads one vocabulary. Naming
 * the paper rather than saying "this paper" because the card is not beside the
 * paper: the loop is on the Design tab and the reading list is two tabs away.
 */
export function quotedFrom(paperName: string): string {
  return `What ${paperName} expects`;
}

/** Number of question-terminated sentences in a string. */
export function countQuestions(text: string): number {
  return (text.match(/\?/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface Candidate {
  readonly topic: string;
  readonly mode: TurnMode;
  readonly question: string;
  readonly rationale: string;
  readonly source: MoveSource;
  readonly quoted?: { readonly text: string; readonly source: string };
  readonly targetId?: string;
  readonly matrixCell?: string;
  readonly proposesPageType?: PageType;
}

/**
 * Cold start. With no puzzle root there is nothing to lint and nothing to
 * ground, so the opening set asks for the three things a puzzle needs: the
 * phenomenon, the expectation it violates, and the observation behind it.
 * They are genuinely different questions, not one question in three costumes.
 */
function coldStart(): Candidate[] {
  return [
    {
      topic: "puzzle:root",
      mode: "interrogation",
      question:
        "What is happening in your field site that you cannot currently account for?",
      rationale:
        "You haven't said yet what you can't explain. Everything else in your ontology hangs off that answer, so it comes first.",
      source: "matrix-gap",
    },
    {
      topic: "theory:expectation",
      mode: "interrogation",
      question:
        "Who currently holds an expectation about this setting, and what do they expect to happen?",
      rationale:
        "A finding is only a puzzle if it unsettles somebody's expectation, so name whose expectation it unsettles.",
      source: "matrix-gap",
      matrixCell: "modal-framing:ontology",
    },
    {
      topic: "observation:seed",
      mode: "interrogation",
      /* M92, ISC-746: forward. Where the researcher will look for the
       * observation, since an instance from the material is Early data's. */
      question:
        "Where in your setting do you plan to look for the observation that this puzzle rests on?",
      rationale:
        "A puzzle without an observation behind it drifts into a gap that you found in the literature, so name the place where you'll look.",
      source: "residue",
    },
  ];
}

function fromObligations(
  graph: OntologyGraph,
  documents: ChunkDocuments | undefined,
): Candidate[] {
  const unmet = checkAllObligations(graph, documents).filter((o) => !o.discharged);
  // Hardest claim first: `exposes` outranks `contradicts` outranks
  // `instantiates` outranks `silent`, because over-claiming is the failure
  // mode and the hardest claim is the most attractive one to make.
  const worst = [...unmet].sort(
    (a, b) => RELATION_BURDEN[b.relation] - RELATION_BURDEN[a.relation],
  )[0];
  if (worst === undefined) return [];
  /* The two pages, written into the topic by the one builder that spells it
   * (M35, D7). The answer to this question comes back under this string, and
   * what reads it back is what attaches the drafted observation to the puzzle
   * whose debt the question was raised for. A second spelling here is a draft
   * that arrives unlinked. */
  const target = `${worst.puzzleId}~${worst.theoryId}`;
  return [
    {
      topic: obligationTopic(worst.puzzleId, worst.theoryId),
      mode: "interrogation",
      /* M28 r6: copy. It read "Your ontology claims the puzzle 'contradicts'
       * this theory, which owes Show the deviation is systematic…: … What in
       * the corpus supplies it?", which carried three retired words and welded
       * a whole sentence into the middle of a question.
       *
       * The relation stays quoted rather than conjugated, because `silent` is
       * not a verb and "your puzzle silent this expectation" is not a sentence.
       * `owed` is the noun phrase half of the obligation, which is what makes
       * the clause fit inside a question at all. */
      question: `You have claimed a '${worst.relation}' link between your puzzle and this expectation, which owes ${worst.owed}. What in your material shows that?`,
      rationale: `You have claimed a '${worst.relation}' link, and support for that link is still to come. ${worst.detail}. This link is the heaviest of the claims that still owe you something.`,
      source: "unmet-obligation",
      targetId: target,
      matrixCell: "artificial-certainty:ontology",
    },
  ];
}

/* M89 (2026-10-14): the questions that put a check's flag to the researcher
 * (`fromFindings`, `questionForFinding`, `findingMoveTopic`) left main with the
 * checks, on the owner's instruction; the branch `with-checks` keeps them. A
 * topic recorded as `lint:<rule>` on an older project still labels in History
 * through `topicLabel`. */

/**
 * The papers, once there are claims out of them (M29, A4).
 *
 * Three questions and none of them asks for a summary. That is the boundary of
 * this source and it is worth stating where the questions are written: this is
 * not a literature-review assistant, and an interviewer that asks a researcher
 * to tell it what a paper says has started doing the reading rather than the
 * interviewing. What it asks about instead is the relationship between the
 * reading list and the model, which is a thing only the researcher knows.
 *
 * The gate is theory pages. Before one exists there is nothing the researcher
 * has ratified out of a paper, and asking which expectation their setting will
 * break would be asking them to invent one on the spot.
 */
function fromLiterature(ctx: MoveContext): Candidate[] {
  const { graph, papers = [] } = ctx;
  const theories = pagesOfType(graph, "theory");
  const candidates: Candidate[] = [];

  /* 1. The puzzle has no relation. The expectations are named and none of them
   *    has been said to be the one the setting broke, which is the single most
   *    consequential gap a design at this stage can carry. */
  const unclaimed = graph.puzzleRoots.filter(
    (id) => !graph.relations.some((r) => r.puzzleId === id),
  );
  const firstUnclaimed = unclaimed[0];
  /* Still gated on there being an expectation in the model, which is what the
   * top of this function used to gate the whole source on (M33). Asking which
   * of the expectations they took from the papers their setting will break,
   * when they have taken none, is asking them to invent one on the spot. */
  if (theories.length > 0 && firstUnclaimed !== undefined) {
    candidates.push({
      topic: "literature:expectation-broken",
      mode: "interrogation",
      question:
        "Which of the expectations that you took from these papers is your setting most likely to break?",
      /* D31 (M43c). It said "your puzzle" on a model holding two of them, so it
       * went on reading as unanswered after the researcher had attached the first,
       * and a reader could not tell which one it meant. `firstUnclaimed` is the
       * puzzle this question is about and the record has always known it, so the
       * sentence names it. */
      rationale: `Your ontology has expectations from the papers. You haven't attached any of those expectations to your puzzle "${
        graph.pages.get(firstUnclaimed)?.title ?? "the claim that your ontology has to explain"
      }". Which expectation your setting breaks decides what the project owes.`,
      source: "literature",
      targetId: firstUnclaimed,
      matrixCell: "modal-framing:ontology",
    });
  }

  /* 1b. One expectation a paper holds that the researcher has not answered
   *     (M33). Second, because attaching the puzzle is still the most
   *     consequential act; above the two below it, because a baseline nobody
   *     has answered against is a paper that has not entered the study at all.
   *
   *     Ungated on the model. This is the source's whole point: it speaks from
   *     the moment a paper is judged rather than from the first accepted theory
   *     page, which is the gap the owner named.
   *
   *     One candidate per turn, first in list order, the `break` pattern
   *     question 3 already uses. Three expectations from one paper offered side
   *     by side is not a choice, and `divergenceErrors` would reject them
   *     anyway for sharing a target. */
  const openBaseline = (ctx.baselines ?? [])[0];
  if (openBaseline !== undefined) {
    candidates.push({
      topic: baselineTopic(openBaseline.id),
      mode: "interrogation",
      question: BASELINE_QUESTION,
      rationale: baselineRationale(openBaseline.paperName),
      source: "literature",
      /* Above the question, attributed to the paper. The researcher has not
       * said this and must not read it as though they had. */
      quoted: { text: openBaseline.expectation, source: openBaseline.paperName },
      targetId: openBaseline.id,
      matrixCell: "modal-framing:ontology",
    });
  }

  /* 2. M87, ISC-722: the question about the papers that nothing came out of
   *    ("What are the other 2 doing in the list?") is retired with
   *    `paper-never-engaged`, at the owner's word of 2026-10-14. */

  /* 3. One claim, quoted back with the paper it came from. The same standing
   *    the design digest already has in `prompt.ts`: the researcher's own
   *    accepted words, put to them as a question rather than as a verdict. */
  for (const theory of theories) {
    const paper = papers.find((candidate) =>
      theory.supportingChunks.some((id) => candidate.chunkIds.includes(id)),
    );
    if (paper === undefined) continue;
    candidates.push({
      topic: `literature:${theory.id}`,
      mode: "interrogation",
      /* M92, ISC-746: forward. */
      question: `'${theory.title}' is what you took from ${paper.name}. What do you expect to find in your setting that this expectation wouldn't predict?`,
      rationale:
        "An expectation is only useful if your data could break it. Name the observation that would break this expectation.",
      source: "literature",
      targetId: theory.id,
    });
    break;
  }

  return candidates;
}

/**
 * A guidance move: the agent proposes a concrete next construction and the
 * researcher disposes. Drawn from live residue, because residue that never
 * becomes anything is the most common way a promising tension is lost.
 */
function fromResidue(graph: OntologyGraph, asked: readonly string[]): Candidate[] {
  const residue = pagesOfType(graph, "analytic-residue").filter(
    (p) => !asked.includes(`residue:${p.id}`),
  );
  const page = residue[0];
  if (page === undefined) return [];
  return [
    {
      topic: `residue:${page.id}`,
      mode: "guidance",
      /* M28 r6: copy. The tool spoke in the first person here and nowhere
       * else, and "residue" is the word the product replaced with "what your
       * account cannot explain". Same choice, put to the researcher. */
      question: `Should '${page.title}' become a rival explanation of your puzzle, rather than stay something that your ontology can't explain?`,
      rationale:
        "You can absorb a loose end like this one into your ontology without noticing. Decide either way and History keeps your decision.",
      source: "residue",
      targetId: page.id,
      proposesPageType: "rival",
    },
  ];
}

function fromMatrixGaps(
  matrix: readonly MatrixCell[],
  coveredCells: readonly string[],
): Candidate[] {
  const uncovered = matrix.filter((c) => !coveredCells.includes(c.id));
  const cell = uncovered[0];
  if (cell === undefined) return [];
  return [
    {
      topic: `cell:${cell.id}`,
      mode: "interrogation",
      question: `On '${cell.flag.toLowerCase()}': where in this design is that risk live right now?`,
      // `Matrix cell 'confirmation:design-brief' has never fired` — a cell id
      // and a piece of the engine's vocabulary, in front of someone with no
      // way to look either up. topicLabel already renders this pair in
      // English and was being used everywhere except here.
      rationale: `You haven't been near ${topicLabel(`cell:${cell.id}`)} yet. Where you haven't looked is where your account and the setting most often come apart.`,
      source: "matrix-gap",
      matrixCell: cell.id,
    },
  ];
}

/**
 * Last resort, so the loop can always offer a real choice. These are weak
 * moves by design and are only reached when the ontology has nothing more
 * specific to say — but they are still questions the researcher can answer.
 */
function fallbacks(graph: OntologyGraph): Candidate[] {
  const pages = livePages(graph).length;
  return [
    {
      topic: "scope:boundary",
      mode: "interrogation",
      question: "Where would you expect this account to stop applying?",
      rationale: `Your ontology has ${countOf(pages, "claim")}, all in good order. Saying where a claim stops applying is the cheapest way to make it defensible.`,
      source: "uncovered-page",
    },
    {
      topic: "corpus:unread",
      mode: "interrogation",
      /* M92, ISC-746: forward. */
      question: "Which part of your material will you go back to before you settle this account?",
      rationale: "You stop going back to most of your data without deciding to, so choose the part now.",
      source: "uncovered-page",
      matrixCell: "limited-attention:ontology",
    },
    {
      topic: "falsification:test",
      mode: "interrogation",
      question: "What would you have to observe to abandon this account entirely?",
      rationale: "Say what would change your mind, and you have a claim rather than a position.",
      source: "uncovered-page",
    },
  ];
}

/**
 * Generate 2–3 divergent next moves.
 *
 * Candidates are drawn source-by-source in priority order, then filtered:
 * silenced topics are dropped (ISC-50), the immediately preceding topic is
 * deprioritised so the loop does not circle, and each addition must keep the
 * set divergent. The result is guaranteed to satisfy `divergenceErrors`.
 */
/**
 * Questions about the station the researcher is actually looking at.
 *
 * These come first in the pool. Standing at Tension and being asked about an
 * unmet obligation three nodes away is the loop talking past you, and the
 * ordering is what makes the dialogue feel like it is in the room.
 */
function fromStation(ctx: MoveContext): Candidate[] {
  const { station, brief, chunkCount, passagesOpened, turnIndex } = ctx;
  if (station === undefined || brief === undefined) return [];
  return stationProbes(station, brief, chunkCount ?? 0, turnIndex, passagesOpened ?? 0).map((p) => ({
    topic: `station:${p.station}`,
    mode: "interrogation" as const,
    question: p.question,
    rationale: p.rationale,
    source: "station" as const,
  }));
}

export function generateMoves(ctx: MoveContext): readonly NextMove[] {
  const { graph, state, coveredCells, matrix, turnIndex } = ctx;

  const pool: Candidate[] =
    graph.puzzleRoots.length === 0
      ? [...fromStation(ctx), ...coldStart(), ...fallbacks(graph)]
      : [
          ...fromStation(ctx),
          ...fromObligations(graph, ctx.chunkDocuments),
          /* Below the obligations. An unmet obligation is a claim already made
           * and failing; a question about the papers is the claim not yet made. */
          ...fromLiterature(ctx),
          ...fromResidue(graph, state.topicsAsked),
          ...fromMatrixGaps(matrix, coveredCells),
          ...fallbacks(graph),
        ];

  // The topic just asked about, not merely the one still open — see
  // InterviewState.lastAskedTopic. Circling straight back onto a topic the
  // researcher has this second finished answering reads as not listening.
  const lastTopic = state.lastAskedTopic;
  const eligible = pool.filter(
    (c) => !state.silencedTopics.includes(c.topic) && c.topic !== lastTopic,
  );

  const chosen: NextMove[] = [];
  for (const candidate of eligible) {
    if (chosen.length >= MAX_MOVES) break;
    const move: NextMove = {
      id: `${candidate.topic}@${turnIndex}`,
      topic: candidate.topic,
      mode: candidate.mode,
      question: candidate.question,
      rationale: candidate.rationale,
      source: candidate.source,
      ...(candidate.quoted === undefined ? {} : { quoted: candidate.quoted }),
      ...(candidate.targetId === undefined ? {} : { targetId: candidate.targetId }),
      ...(candidate.matrixCell === undefined ? {} : { matrixCell: candidate.matrixCell }),
      ...(candidate.proposesPageType === undefined
        ? {}
        : { proposesPageType: candidate.proposesPageType }),
    };
    // Adding a move that collapses divergence is worse than offering fewer.
    if (divergenceErrors([...chosen, move]).some((e) => !e.startsWith("only "))) continue;
    chosen.push(move);
  }
  return chosen;
}
