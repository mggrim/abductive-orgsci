/**
 * The argument your model is currently making (M30).
 *
 * The engine already computes the argument. `checkAllObligations` returns, for
 * every puzzle, the theory it stands to, the relation claimed, the burden that
 * relation carries, whether it is discharged, and a sentence naming exactly
 * what is missing. Until M30 that reached the researcher as one grey row on the
 * Checks tab labelled `unmet-relation-obligation`, and `residueMonotonicallyShrinking`,
 * which is the tool's whole thesis rendered as a boolean, sat on the Design tab
 * under a fold.
 *
 * So this file is a reallocation rather than a build. It reads what is already
 * there and returns the band's state: the puzzle, the expectation it breaks,
 * what that claim owes, what is unexplained, and the one thing to do next.
 *
 * Three rules the shape here encodes.
 *
 *   1. Every slot degrades to a named gap rather than disappearing. A band that
 *      renders three sentences on a full model and nothing on an empty one
 *      teaches nothing about the shape of an argument. `null` in a slot is a
 *      state the band has words for.
 *   2. One move, chosen by the first condition that holds. A band offering
 *      three next steps has not decided either. The order is the argument, so
 *      it is a table a test can read rather than a chain of ternaries in JSX.
 *   3. No model call. Every value here is a function of the graph, the record
 *      and the drafts already on screen.
 */

import type { PuzzleRelation } from "../ledger/events.ts";
import type { OntologyGraph, OntologyPage } from "../ontology/schema.ts";
import { livePages, pagesOfType } from "../ontology/schema.ts";
import {
  checkAllObligations,
  type ChunkDocuments,
  type ObligationResult,
  expectationsOnOffer,
} from "../ontology/relations.ts";
import type { NextMove } from "../interview/types.ts";
import type { ProposalTray } from "../proposals/types.ts";
import { ORDINARY_VERSION_SECTION_ID } from "../ui/routes.ts";
import type { AnchoringView } from "./anchoring.ts";
import type { TrajectorySummary } from "./trajectoryModel.ts";

/**
 * Which rule fired. Named so a test asserts the priority rather than the prose,
 * the same contract `nextStep` in `NextBar.tsx` holds for the Design tab.
 */
export type ArgumentMoveRule =
  | "no-claims"
  | "drafts"
  | "no-puzzle"
  | "no-expectation"
  | "obligation"
  | "residue"
  | "carrying";

/** Where the band's one control goes. */
export type ArgumentAction =
  /**
   * A tab of this study, and optionally one section of it.
   *
   * The section arrived with R10. "Compare against the ordinary version" landed
   * a reader at the top of Checks, which is a long page, and left them to find
   * the block the button had just named. The shell scrolls to a section when the
   * route asks for one, so the only thing missing was for this action to be able
   * to say which.
   */
  | {
      readonly kind: "tab";
      readonly tab: "design" | "material" | "coherence";
      readonly section?: string;
    }
  /** A section of this page. The app routes on the hash, so this scrolls. */
  | { readonly kind: "section"; readonly section: string }
  /** The chooser that names which expectation the puzzle breaks. */
  | { readonly kind: "name-expectation" };

export interface ArgumentMove {
  readonly rule: ArgumentMoveRule;
  /** The button. A verb and its object, never a bare verb. */
  readonly label: string;
  readonly action: ArgumentAction;
  /**
   * Whether this control carries the page's primary weight.
   *
   * The same field `NextStep` carries on the Design tab, and it is here for the
   * same reason. When drafts are waiting, the move is to decide them and the
   * decision buttons are in the drafts section: two filled controls pointing at
   * one act is the failure round 3 removed from Design. So in that one state
   * the band points and the queue is the thing to press.
   *
   * Nothing is gated and nothing is hidden by this. It is weight only.
   */
  readonly primary: boolean;
}

export interface ArgumentBandModel {
  /** The first live puzzle root, or null when there is none. */
  readonly puzzle: OntologyPage | null;
  /** The expectation that puzzle stands to, or null when none is named. */
  readonly theory: OntologyPage | null;
  /** Which of the four claims is being made, or null when none is. */
  readonly relation: PuzzleRelation | null;
  /** What that claim owes and whether it has it. Null when no claim is made. */
  readonly obligation: ObligationResult | null;
  readonly claimCount: number;
  /** Statements placed under an accepted concept or relation (M78a, ISC-679); absent before M75. */
  readonly placedStatements?: number;
  /**
   * How many live puzzles the model holds (D31, M43c).
   *
   * The band reads the first and says "Your puzzle" in the singular. On the walk
   * of 2026-09-13 two claims came out of the material read as `KIND: puzzle`,
   * both filed as "the thing your model has to explain", and the band worked on
   * one of them while the other sat in the claims table carrying its own
   * unanswered "Name the expectation it breaks". Which is worse than ambiguous:
   * the one it ignored was the better candidate for the expectation the
   * researcher then chose, so the band steered them at the weaker pairing of the
   * two it held.
   *
   * Whether a study may hold more than one puzzle is not settled here, and this
   * milestone changes no behaviour about it. What the count buys is that the band
   * names the puzzle it is reading whenever there is more than one to confuse it
   * with, which is copy rather than a rule.
   */
  readonly puzzleCount: number;
  readonly pendingDrafts: number;
  readonly residueCount: number;
  /** True when what the account cannot explain has only ever fallen. */
  readonly residueOnlyShrinking: boolean;
  /** Claims nothing links to, from `projectAnchoring`. */
  readonly unanchoredCount: number;
  /**
   * How many recorded framing claims have discharged what they owe (walk nit).
   *
   * The reviewer line needs it to tell two states apart that both leave `unmet`
   * empty: every obligation met, and no obligation to meet.
   */
  readonly met: number;
  /** Unmet obligations, heaviest first. Feeds the reviewer line. */
  readonly unmet: readonly ObligationResult[];
  /** The question the tool would put next, when it has one. */
  readonly nextQuestion: string | null;
  /**
   * Whether the expectation chooser has something to ask about (M29b).
   *
   * Separate from `move.rule === "no-expectation"`, and it has to be. The move
   * is one control chosen by the first rule that holds, and `drafts` outranks
   * `no-expectation` because a draft waiting on a decision is the more urgent
   * act. Drafts are pending most of the time in a live study, so the one route
   * to the most consequential decision in a design was reachable only in the
   * window between clearing the tray and the next reading.
   *
   * So the band offers it as a second control whenever there is a puzzle with
   * nothing it stands to and an expectation it could stand to. Weight is still
   * the move's; this only decides whether the door exists.
   */
  readonly canNameExpectation: boolean;
  /**
   * Drafts in the tray that would fill the empty expectation slot (M29b).
   *
   * The band named a gap and offered no route to it: it said the puzzle breaks
   * no recorded expectation while five paper-drafted expectations sat in the
   * queue below, any of which could fill the slot. The count is of pending
   * drafts that would become a theory page, which is exactly what the chooser
   * needs one of.
   */
  readonly draftsThatWouldFill: number;
  /**
   * Whether "your account absorbed everything" is a claim worth making yet
   * (M29b).
   *
   * The bold clause read "Your account explains everything you have put in it
   * so far, which is worth a second look" on a two-claim study that had opened
   * no material, directly above a panel saying "Nothing unexplained yet. This
   * early that is normal." Both true, opposite lessons, one screen. Absorption
   * is a claim about a model meeting its material, so it needs a model and it
   * needs material: at least one data passage read, and four live claims.
   */
  readonly absorptionMeasurable: boolean;
  readonly move: ArgumentMove;
}

export interface ArgumentInput {
  readonly graph: OntologyGraph;
  readonly trajectory: TrajectorySummary;
  readonly tray: ProposalTray;
  readonly anchoring: AnchoringView;
  readonly moves: readonly NextMove[];
  /**
   * Which document each passage came from (M29, E3).
   *
   * The band's second sentence is what the claim owes and what it currently
   * has, read straight off the obligation. Without this the most prominent
   * sentence on the page told a researcher their `contradicts` claim was
   * discharged by two quotes from one interview, which is the reading its own
   * requirement line says is not enough.
   */
  readonly chunkDocuments?: ChunkDocuments;
  /**
   * Distinct data passages the study has retrieved, cited or opened.
   *
   * The papers do not count. "Your account absorbed everything your material
   * offered" is a claim about the researcher's own material, and a study that
   * has uploaded five papers and no fieldwork has not offered its account
   * anything to resist.
   */
  readonly dataPassagesTouched?: number;
  /** Statements placed under an accepted concept or relation (M78a, ISC-679). */
  readonly placedStatements?: number;
}

/** Live claims below which absorption is not yet a claim about anything. */
export const ABSORPTION_CLAIMS = 4;

/**
 * The one question that would discharge each relation's burden.
 *
 * Each undischarged obligation already states its gap in prose. Turning that
 * gap into something the researcher can go and do is a table over four
 * relations, not a model call, and the table is small enough to read whole.
 *
 * One question each, interrogative, in the register of the station prompts.
 * `exposes` carries a three-part burden and still gets one question, because a
 * band that asks three things has stopped being a next move.
 */
export const DISCHARGE_QUESTION: Readonly<Record<PuzzleRelation, string>> = {
  contradicts:
    "Where else have you seen this happen, in a source other than the one that you have already cited?",
  instantiates:
    "How do the people in your setting get through this, and which passage shows them doing it?",
  exposes:
    "Which two accounts pull against each other here, and what did the conflict cost the people who stand between them?",
  silent:
    "What does your data leave you unable to explain, given that the literature is silent here?",
};

/** The question that would discharge this relation's burden. */
export function dischargeQuestion(relation: PuzzleRelation): string {
  return DISCHARGE_QUESTION[relation];
}

/**
 * An obligation as prose the researcher can act on.
 *
 * M28 r6: it read "That claim owes you this. Show the deviation is systematic
 * rather than anecdotal: at least two independent observations…", which is
 * three sentences to say one thing, because the fixed lead was standing in
 * front of a `requirement` that was itself a whole sentence.
 *
 * The earlier note here said an interpolation that tried to read as one
 * sentence broke grammatically on three of the four relations, and it did,
 * because it was interpolating a sentence. `relations.ts` declares the two
 * halves separately now, `owed` as a noun phrase and `evidence` as what would
 * discharge it, so the frame can read straight on all four.
 */
/** A sentence with exactly one full stop at the end of it. */
export function endStop(sentence: string): string {
  const trimmed = sentence.trim();
  if (trimmed === "") return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function obligationSentence(result: ObligationResult): string {
  /* M28 r6: no label. It read "So far: You have none so far, and a single
   * instance reads as a weird case", because the frame put a label in front of
   * a detail that already carried one. Every detail is a complete sentence in
   * `relations.ts` now, discharged or not, so the sentence says which without a
   * word standing in front of it. */
  /* Walk nit: the frame added a stop the detail already had, so the silence
   * obligation ended "Link one..". Every other detail is a clause the frame
   * finishes; this one ends on an instruction and finishes itself. The frame
   * closes the sentence only when the detail has not. */
  return `That claim owes you ${result.owed}: ${result.evidence}. ${endStop(result.detail)}`;
}

/**
 * The claim, as one sentence, with each slot degrading to a named gap.
 *
 * Read on a model with a puzzle and no expectation this says what is missing
 * rather than falling silent, which is the property the band is for: its shape
 * teaches the shape of an argument.
 */
export function claimSentence(model: ArgumentBandModel): string {
  if (model.claimCount === 0) {
    /* M78a, ISC-679: since M75 a placed statement is a claim in the model. */
    const placed = model.placedStatements ?? 0;
    if (placed === 1) return "You have placed one statement.";
    if (placed > 1) return `You have placed ${placed} statements.`;
    return "Your first claim is still to come.";
  }
  if (model.puzzle === null) {
    return `You have ${model.claimCount} claim${model.claimCount === 1 ? "" : "s"} and your puzzle is still to come, so your ontology is silent on the thing that your account must explain.`;
  }
  if (model.theory === null || model.relation === null) {
    return `Your puzzle is ${model.puzzle.title}, but you haven't said which expectation it breaks.`;
  }
  /* Both titles quoted (M30, r7). It read "You are claiming that
   * Communication-problem framing may be watching the wrong object contradicts
   * Reviewers miss AI-generated text at high rates", and a reader had to guess
   * where the first title ended and the verb began. */
  return `You're claiming that "${model.puzzle.title}" ${RELATION_READS[model.relation]} "${model.theory.title}".`;
}

/**
 * Which puzzle these lines are about, when more than one could be meant (D31).
 *
 * Empty on a model with one puzzle or none, because a study with one puzzle has
 * nothing to disambiguate and a sentence explaining that it has one puzzle is the
 * tool talking about itself.
 *
 * Two sentences rather than a clause on the claim above, because the claim is the
 * claim and a reader has to know what it is before they are told which of two it
 * is. The second names where the others are, since the row for a puzzle that
 * breaks nothing carries its own door to the chooser and that is the thing to go
 * and press.
 */
export function whichPuzzleClause(model: ArgumentBandModel): string {
  if (model.puzzleCount < 2 || model.puzzle === null) return "";
  const others = model.puzzleCount - 1;
  const rest =
    others === 1
      ? "The other puzzle sits among your statements with its own question."
      : `The other ${others} puzzles sit among your statements with their own questions.`;
  return `Your ontology has ${model.puzzleCount} puzzles, and these lines are about "${model.puzzle.title}". ${rest}`;
}

/**
 * How each relation reads inside the claim sentence.
 *
 * The four values are already ordinary English verbs, and three of them read
 * straight. `silent` is the exception: "your puzzle silent the account" is not
 * a sentence, so it gets the phrase the obligation's own text uses.
 */
const RELATION_READS: Readonly<Record<PuzzleRelation, string>> = {
  contradicts: "contradicts",
  instantiates: "instantiates a split already in",
  exposes: "exposes a conflict inside",
  silent: "falls in a gap left by",
};

/** What is unexplained, as the band's closing clause. */
export function residueClause(model: ArgumentBandModel): string {
  if (model.residueCount === 0) {
    /* The absorption reading needs a model that has met some material. Below
     * that it is the same sentence the panel below already prints, rather than
     * a warning about a study that has not started. */
    return model.absorptionMeasurable
      ? "Your ontology explains each of its parts so far. At this stage, the pattern usually means you need to look harder."
      : "";
  }
  /* M42. "Your account cannot explain 5 things." named neither the things nor the
   * account: a reader ten minutes in has met "your model" and has never met an
   * account. The wording is the team lead's, from the stranger's reading on
   * screen. Note for whoever reads this next: "finding" is also what the Checks
   * tab calls a check result, and these are analytic-residue claims in the model,
   * so one word now covers two objects. Raised in the M42 report. */
  const findings = `${model.residueCount} finding${model.residueCount === 1 ? "" : "s"}`;
  const sit = model.residueCount === 1 ? "sits" : "sit";
  return model.residueOnlyShrinking && model.absorptionMeasurable
    ? `${findings} ${sit} outside what your ontology can explain, and that list has only shrunk since you started.`
    : `${findings} ${sit} outside what your ontology can explain, and the list below names ${model.residueCount === 1 ? "it" : "them"}.`;
}

/**
 * The clause that turns the named gap into a place to go (M29b).
 *
 * Empty when there is nothing waiting that would fill it, because a route to an
 * empty queue is worse than no route.
 */
export function fillableClause(model: ArgumentBandModel): string {
  const n = model.draftsThatWouldFill;
  if (n === 0) return "";
  return `You could fill that gap with ${n} of the suggestions below.`;
}

/**
 * What now, in priority order.
 *
 * The order is an argument about what blocks what, and it is the part that will
 * get edited without anyone noticing, so it is a function rather than a chain
 * of conditions inside a component. Nothing here gates: every state has a move
 * and no move is hidden by another.
 *
 *   No claims first, because an empty model has no argument to read.
 *   Drafts next, because the researcher's own answer has come back and it is
 *     the one thing on this page waiting on a decision.
 *   No puzzle, because a model with no puzzle is a set of notes.
 *   No expectation, because a puzzle standing to nothing cannot owe anything,
 *     and until it does the rest of this band has nothing to measure.
 *   An unmet obligation, which is the highest-value row and the reason the
 *     band exists: `exposes` is the most flattering claim and the heaviest,
 *     and a researcher who sees what it owes can downgrade on purpose.
 *   Residue only shrinking, because an account that has absorbed everything
 *     has stopped being tested by the material.
 *   Carrying its burden last, which is the only state with nothing wrong in it.
 */
export function nextArgumentMove(model: Omit<ArgumentBandModel, "move">): ArgumentMove {
  if (model.claimCount === 0 && model.pendingDrafts === 0) {
    return {
      rule: "no-claims",
      label: "Answer question",
      action: { kind: "tab", tab: "design" },
      primary: true,
    };
  }
  if (model.pendingDrafts > 0) {
    return {
      rule: "drafts",
      label: model.pendingDrafts === 1 ? "Review suggestion" : "Review suggestions",
      action: { kind: "section", section: DRAFTS_SECTION_ID },
      // The one state where the band points rather than presses. See `primary`.
      primary: false,
    };
  }
  if (model.puzzle === null) {
    return {
      rule: "no-puzzle",
      // The Design tab, not a step on it: the puzzle is asked for in the
      // framing band at the top of that page, above the steps.
      label: "Name puzzle",
      action: { kind: "tab", tab: "design" },
      primary: true,
    };
  }
  if (model.relation === null || model.theory === null) {
    return {
      rule: "no-expectation",
      label: "Name expectation",
      action: { kind: "name-expectation" },
      primary: true,
    };
  }
  if (model.obligation !== null && !model.obligation.discharged) {
    return {
      rule: "obligation",
      label: "Answer question",
      action: { kind: "tab", tab: "design" },
      primary: true,
    };
  }
  if (model.residueOnlyShrinking && model.absorptionMeasurable) {
    return {
      rule: "residue",
      label: "Open Sources",
      action: { kind: "tab", tab: "material" },
      primary: true,
    };
  }
  return {
    rule: "carrying",
    label: "Compare versions",
    // R10. The ordinary version stays on Checks, and this lands on it rather
    // than at the top of the page it is on.
    action: { kind: "tab", tab: "coherence", section: ORDINARY_VERSION_SECTION_ID },
    primary: true,
  };
}

/**
 * The id of the drafts section on this page.
 *
 * A section rather than a fragment, and a scroll rather than an href, because
 * this app routes on `window.location.hash`: `#drafts` parses as an unknown
 * path and would land the reader on the Design tab. Same reasoning as
 * `NextStepAction`'s `focus` kind in `NextBar.tsx`.
 */
export const DRAFTS_SECTION_ID = "drafts";

/**
 * The band, assembled from the graph with no model call.
 *
 * The first live puzzle root is the subject, because a study with two live
 * puzzles has not collapsed yet and the band reads the one the graph puts
 * first rather than inventing a rule about which matters more. The rest of the
 * puzzles keep their obligations, which reach the reviewer line below.
 */
export function projectArgument(input: ArgumentInput): ArgumentBandModel {
  const { graph, trajectory, tray, anchoring, moves } = input;
  const pages = livePages(graph);
  const obligations = checkAllObligations(graph, input.chunkDocuments);

  const puzzleId = graph.puzzleRoots[0];
  const puzzle = puzzleId === undefined ? null : (graph.pages.get(puzzleId) ?? null);
  const claim =
    puzzle === null ? undefined : graph.relations.find((r) => r.puzzleId === puzzle.id);
  const theory =
    claim === undefined ? null : (graph.pages.get(claim.theoryId) ?? null);
  const obligation =
    claim === undefined
      ? null
      : (obligations.find(
          (o) => o.puzzleId === claim.puzzleId && o.theoryId === claim.theoryId,
        ) ?? null);

  const slots = {
    puzzle,
    theory,
    relation: claim === undefined ? null : claim.relation,
    obligation,
    claimCount: pages.length,
    ...(input.placedStatements === undefined ? {} : { placedStatements: input.placedStatements }),
    /* Live roots, which is what `puzzleRoots` already holds: the projection drops
     * a retired one, so a study that retired its first puzzle does not go on being
     * told it has two. */
    puzzleCount: graph.puzzleRoots.length,
    pendingDrafts: tray.pending.length,
    residueCount: pagesOfType(graph, "analytic-residue").length,
    residueOnlyShrinking: trajectory.residueMonotonicallyShrinking,
    unanchoredCount: anchoring.unanchored.length,
    met: obligations.filter((o) => o.discharged).length,
    unmet: obligations.filter((o) => !o.discharged),
    nextQuestion: moves[0]?.question ?? null,
    /* A live puzzle standing to nothing, and at least one expectation it could
     * stand to. Read off the same graph rather than off `move`, so a state that
     * takes the primary for another reason does not close the door. */
    /* Pending drafts that would become an expectation. The chooser needs one
     * accepted theory page, and these are the ones a click away from being it.
     *
     * Walk item 2: paper drafts only. It counted every pending theory draft,
     * including the ones the data reader wrote out of the researcher's own
     * transcript, so the band offered "8 of the drafts below would fill this"
     * over a chooser that would list two of them. A draft fills the slot only
     * if accepting it produces a page the chooser will offer, and that is the
     * one stamped from the papers. */
    draftsThatWouldFill: tray.pending.filter(
      (p) => p.pageType === "theory" && p.originOnAccept === "literature-derived",
    ).length,
    absorptionMeasurable:
      (input.dataPassagesTouched ?? 0) > 0 && pages.length >= ABSORPTION_CLAIMS,
    canNameExpectation:
      /* The same population the chooser offers, so the band cannot open a door
       * onto an empty list (walk item 2). */
      expectationsOnOffer(graph).length > 0 &&
      graph.puzzleRoots.some(
        (id) =>
          graph.pages.get(id)?.retired === false &&
          !graph.relations.some((r) => r.puzzleId === id),
      ),
  } satisfies Omit<ArgumentBandModel, "move">;

  return { ...slots, move: nextArgumentMove(slots) };
}
