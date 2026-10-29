/**
 * Interview loop shapes (ISC-43..ISC-53).
 *
 * The loop is inverted relative to v1: the agent interviews the researcher
 * rather than delivering a broadside of challenge cards. v1's live run
 * produced fifteen essays at once and, with them, adjudications no human
 * actually made — which corrupts the very instrument the paper's evidence
 * depends on. One question at a time is not a UX preference; it is what makes
 * each adjudication attributable to a person who read the thing.
 *
 * Three commitments are encoded in these types rather than in prompt wording,
 * because prompt wording is not enforceable:
 *
 *   1. A move carries its own `rationale`. Choosing what to ask next bounds
 *      the study as surely as choosing a site does, so an unreasoned selection
 *      is unauditable and the ledger refuses it.
 *   2. A move carries a `topic` distinct from its `id`. Divergence is measured
 *      on the topic (ISC-44) and refusals are counted on it (ISC-50); an id
 *      that changes every turn can do neither.
 *   3. `mode` is part of the move, not a property of the session. The
 *      interrogation/guidance ratio is then a fact about the transcript rather
 *      than a claim about intent (ISC-53).
 */

import type { PageType } from "../ledger/events.ts";

/**
 * Interrogation asks and must not supply the answer. Guidance proposes and
 * lets the researcher dispose. Both are legitimate; a session that is all
 * guidance has stopped interviewing and started dictating.
 */
export type TurnMode = "interrogation" | "guidance";

/** Why a move exists. Used to keep generated sets structurally divergent. */
export type MoveSource =
  | "station"
  /**
   * The papers (M29, A4). A move about the reading list and the expectations
   * drawn from it, asked only once theory claims exist, because until then
   * there is nothing the researcher has ratified to put at risk.
   */
  | "literature"
  | "lint-finding"
  | "matrix-gap"
  | "unmet-obligation"
  | "uncovered-page"
  | "residue"
  | "researcher-agenda"
  /**
   * The conversation at a place (M37, ISC-483).
   *
   * The one source whose question the model writes rather than delivers, which
   * is what a follow-up is. It never reaches an offered set, so no `NextMove`
   * carries it and `selectMove` never sees it; it names the source on the
   * record, where `conversation:<place>@<n>` is the move id and this is the
   * word for what that prefix means.
   */
  | "conversation";

export interface NextMove {
  /** Unique per turn. Never reused. */
  readonly id: string;
  /**
   * The subject, stable across turns and sessions. Two moves about the same
   * page share a topic even when their wording differs entirely.
   */
  readonly topic: string;
  readonly mode: TurnMode;
  /** Exactly one question. Asserted, not hoped for (ISC-43). */
  readonly question: string;
  /** "Selected because…" — logged verbatim onto the question-selection event. */
  readonly rationale: string;
  readonly source: MoveSource;
  /**
   * Something the move quotes, shown above the question (M33).
   *
   * The baseline move puts an expectation to the researcher and asks what in
   * their setting fits it. The expectation is not theirs and the card has to
   * say so before they read the question, or the loop is asking them about a
   * claim it has quietly attributed to them. `source` here is the paper, in
   * their own words, never the tool.
   */
  readonly quoted?: { readonly text: string; readonly source: string };
  /** Ontology page or edge the move concerns, when it concerns one. */
  readonly targetId?: string;
  readonly matrixCell?: string;
  /** Page type a guidance move would have the researcher create, if any. */
  readonly proposesPageType?: PageType;
}

/** The single question currently on the table. There is at most one (ISC-43). */
export interface OutstandingQuestion {
  /** Ledger id of the question-selection event. */
  readonly eventId: string;
  readonly moveId: string;
  readonly topic: string;
  readonly question: string;
  readonly mode: TurnMode;
  readonly askedAt: number;
}

/**
 * Everything about the interview that is derivable from the ledger. Held
 * nowhere else — same rule as the ontology.
 */
export interface InterviewState {
  readonly outstanding: OutstandingQuestion | null;
  readonly turns: number;
  readonly interrogationTurns: number;
  readonly guidanceTurns: number;
  /**
   * Interrogation share of typed turns, 0–1. `null` before any turn, so a
   * fresh session does not read as 0% interrogation (ISC-53).
   */
  readonly interrogationRatio: number | null;
  /** Refusals per topic, all kinds. */
  readonly refusalsByTopic: ReadonlyMap<string, number>;
  /**
   * Topics the agent has stopped pressing. Reaching the refusal threshold
   * silences the topic for move generation and surfaces the pattern; it does
   * not close the topic, and the researcher may raise it themselves (ISC-50).
   */
  readonly silencedTopics: readonly string[];
  /** Topics the researcher seized the agenda toward, in order (ISC-47). */
  readonly redirections: readonly string[];
  /** Topics asked at least once — the session spine's node set. */
  readonly topicsAsked: readonly string[];
  /**
   * The topic of the most recent question, answered or not.
   *
   * Distinct from `outstanding?.topic`, which goes null the moment the
   * researcher answers. Move generation needs this one: filtering on
   * `outstanding` meant the loop re-offered the topic it had just finished
   * asking about, which a live walkthrough caught immediately and no unit
   * test would have, because none of them asked twice in a row.
   */
  readonly lastAskedTopic: string | null;
}

/** Options shared by the state projection and the signals that read it. */
export interface InterviewThresholds {
  /** Refusals on one topic before the agent stops pressing. Default 3. */
  readonly refusalsBeforeSilence?: number;
}
