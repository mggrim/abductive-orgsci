/**
 * Where a saved answer came from (M39, ISC-505).
 *
 * A researcher reading their own answer three weeks later has one question the
 * tool could not answer: did I write this, or did the tool draft it and I let it
 * stand? The record holds the answer already. `bound` carries `draftedFrom` when
 * the text came out of a draft, the `brief-draft` it names carries the turn ids
 * it was made from, and every turn carries the place it happened at. What was
 * missing was a reading of those three, and somewhere to put it.
 *
 * This is the reading. It is a fold over events and nothing else: no model call,
 * nothing stored, nothing appended by asking. Opening the popover this feeds
 * costs a replay of the ledger the surface has already loaded.
 *
 * ## One projection per fact (ISC-501)
 *
 * The drafted-against-typed distinction has two readers. This file, per answer,
 * and `views/exportHeader.ts`, as a count across the study. Two readings of one
 * fact is FIN-02 with a different noun, so the predicate lives here and the
 * header imports it. If a third reader arrives, it imports it too.
 *
 * ## Why the wording is here and not in the component
 *
 * `originVocabulary.ts` has three registers and its header is explicit that
 * anything needing a fourth needs one of the three. Drafted-or-typed is not an
 * origin: it is about how the text reached the box, not about who the claim
 * belongs to. So it gets its own small module, which is this one, and the
 * sentences a researcher reads about it are written here rather than in the
 * popover. One place says it, and the surface that draws it cannot reword it.
 * `tests/copy-bar.test.ts` has this file in `IN_SCOPE` for that reason.
 *
 * ## The place of a turn
 *
 * Read from `placeOfTurnId` in `views/placeSummary.ts`, the one derivation
 * (ISC-501). The panes builder wrote a local stand-in while the map's export had
 * not landed in its worktree; the swap was made at the merge of the two M39
 * branches and a test in tests/provenance.test.ts keeps the copy from coming
 * back.
 *
 * ## The second half: an accepted claim
 *
 * ISC-505 names two subjects, a saved answer and an accepted claim, and the
 * question a reader asks of each is the same question. What the record can
 * answer about them is not. An answer is filed at a place and its text either
 * came out of a draft or was typed; a claim sits in the model at no place at
 * all, and what it has instead is an origin, a proposal, and the moment the
 * researcher let it in. So `claimProvenance` below returns its own shape rather
 * than bending `ProvenanceView` to fit. The three fields that would have had to
 * bend are the reason:
 *
 *   - `place` is required and non-null on the answer's shape, because an answer
 *     always has one. A claim has none. Widening the field to null would put a
 *     "there is no place" branch into every reader of the answer's view to buy
 *     nothing.
 *   - `route` is typed or drafted, which is how text reached a box. A claim has
 *     no box. The question it answers instead is whose claim it is, and that is
 *     the origin, which has its own vocabulary and its own four values.
 *   - Who accepted it, when, and how many passages it cites have nowhere to go
 *     on the answer's shape, and are the whole of what a reader wants to know
 *     about a claim they did not write.
 *
 * What the two shapes do share is shared rather than copied: `ProvenanceTurn`,
 * the place lookup, and the sentence the map already says when a claim has no
 * conversation behind it.
 */

import type { LedgerEvent, Origin } from "../ledger/events.ts";
import type { Proposal, ProposalTray } from "../proposals/types.ts";
import { projectProposals } from "../proposals/projection.ts";
import { originLabel } from "../ui/originVocabulary.ts";
import { placeLabel, placeOfTurnId, placeSubjects, type PlaceId } from "./placeSummary.ts";

/**
 * Whether this saved answer's text came out of a conversation.
 *
 * The one predicate, so a count and a per-answer reading cannot disagree. A
 * `bound` with no `draftedFrom` is an answer typed into the box; that is the
 * field's own contract and it is why absence rather than a flag encodes it.
 */
export function cameFromConversation(event: { readonly draftedFrom?: string }): boolean {
  return event.draftedFrom !== undefined;
}

/** A turn the answer was made out of, and where it was said. */
export interface ProvenanceTurn {
  readonly turnId: string;
  /** The place it was said at, or null for a turn recorded before places existed. */
  readonly place: PlaceId | null;
  /** That place in the researcher's own vocabulary, or null with the place. */
  readonly placeLabel: string | null;
  /** Whether the researcher said it, or the tool did. */
  readonly who: "you" | "the tool";
}

/** How the text in a saved answer reached the box. */
export type ProvenanceRoute = "typed" | "drafted" | "reading";

export interface ProvenanceView {
  /** Which of the two subjects this reading is about. See the module note. */
  readonly kind: "answer";
  /** The place this answer is filed at. */
  readonly place: PlaceId;
  /** Typed into the box, or drafted from a conversation and then saved. */
  readonly route: ProvenanceRoute;
  /** One sentence saying which, in the researcher's second person. */
  readonly routeLine: string;
  /** The turns the draft was made from, in the order they were said. */
  readonly turns: readonly ProvenanceTurn[];
  /** When the answer was last saved, as epoch milliseconds. */
  readonly savedAt: number;
  /** The event a link into the record should land on: the save itself. */
  readonly recordEventId: string;
  /**
   * Why there are no turns to show, when there are none.
   *
   * Three different silences, and a reader is owed the difference. An answer
   * they typed has no turns because there was no draft. An answer drafted before
   * `fromTurnIds` was recorded has a draft with nothing named in it. And a draft
   * whose event is no longer in the ledger is a record that has lost a row.
   */
  readonly noTurnsBecause: "typed" | "draft-named-none" | "draft-missing" | "reading" | null;
}

export interface ProvenanceInput {
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
  /** The place whose saved answer is being asked about. */
  readonly place: PlaceId;
  /**
   * Which of the place's subjects to read, for the framing.
   *
   * The framing saves two fields under two subjects and each one has its own
   * provenance, so a popover on the research question must not report the
   * starting interest's save. A place with one subject ignores this.
   */
  readonly subject?: string;
}


/**
 * What the popover says about one saved answer, or null if nothing is saved.
 *
 * Null rather than an empty reading, because a place with no save has no
 * provenance to show and a trigger over nothing is a control that answers
 * "nothing yet" to a question nobody asked.
 */
export function answerProvenance(input: ProvenanceInput): ProvenanceView | null {
  const { projectId, place } = input;
  const events = input.events.filter((e) => e.projectId === projectId);
  const subjects = input.subject === undefined ? placeSubjects(place) : [input.subject];

  /* The last save at this subject, because a subject can be saved many times and
   * what a reader is asking about is the answer in front of them. The same rule
   * `exportHeader` states for its count, for the same reason. */
  let latest: { readonly id: string; readonly ts: number; readonly draftedFrom?: string } | null =
    null;
  for (const e of events) {
    if (e.type !== "bound" || !subjects.includes(e.subject)) continue;
    if (latest !== null && e.ts < latest.ts) continue;
    latest = { id: e.id, ts: e.ts, ...(e.draftedFrom === undefined ? {} : { draftedFrom: e.draftedFrom }) };
  }
  if (latest === null) return null;

  const route: ProvenanceRoute = cameFromConversation(latest) ? "drafted" : "typed";

  if (route === "typed") {
    return {
      kind: "answer",
      place,
      route,
      routeLine: ROUTE_LINE.typed,
      turns: [],
      savedAt: latest.ts,
      recordEventId: latest.id,
      noTurnsBecause: "typed",
    };
  }

  /* M58, ISC-568: at The puzzle step the draft can be the tool's puzzle reading
   * rather than a draft from the conversation, and the popover says so. */
  if (events.some((e) => e.id === latest.draftedFrom && e.type === "puzzle-reading")) {
    return {
      kind: "answer",
      place,
      route: "reading",
      routeLine: ROUTE_LINE.reading,
      turns: [],
      savedAt: latest.ts,
      recordEventId: latest.id,
      noTurnsBecause: "reading",
    };
  }

  const draft = events.find((e) => e.id === latest.draftedFrom && e.type === "brief-draft");
  if (draft === undefined || draft.type !== "brief-draft") {
    return {
      kind: "answer",
      place,
      route,
      routeLine: ROUTE_LINE.drafted,
      turns: [],
      savedAt: latest.ts,
      recordEventId: latest.id,
      noTurnsBecause: "draft-missing",
    };
  }

  const turns = draft.fromTurnIds.map((turnId) => readTurn(events, projectId, turnId));

  return {
    kind: "answer",
    place,
    route,
    routeLine: ROUTE_LINE.drafted,
    turns,
    savedAt: latest.ts,
    recordEventId: latest.id,
    noTurnsBecause: turns.length === 0 ? "draft-named-none" : null,
  };
}

/**
 * One turn, read as the popover needs it: who said it and where.
 *
 * Shared by the answer half above and the claim half below, because both ask
 * the same question of the same event and a second spelling of it is FIN-02
 * with a different noun. The place comes from `placeOfTurnId` and nowhere else
 * (ISC-501): the map's export, swapped in at the merge for the local stand-in
 * the panes builder wrote while it had not landed.
 */
function readTurn(
  events: readonly LedgerEvent[],
  projectId: string,
  turnId: string,
): ProvenanceTurn {
  const turn = events.find((e) => e.id === turnId);
  const at = placeOfTurnId(events, projectId, turnId);
  return {
    turnId,
    place: at,
    placeLabel: at === null ? null : placeLabel(at),
    who: turn !== undefined && turn.actor === "human" ? "you" : "the tool",
  };
}

/**
 * The two sentences, and the fact that there are two.
 *
 * Second person, present tense, and the researcher's act first in both: what
 * they did, then what the tool did. The drafted line says "you saved it" last
 * because the save is the thing that made it theirs, which is the distinction
 * ISC-487 exists to keep and this popover must not blur.
 */
export const ROUTE_LINE: Readonly<Record<ProvenanceRoute, string>> = {
  typed: "You typed this answer into the box.",
  drafted: "Abductive summarised this answer from your chat, and you saved it.",
  reading: "You started this answer from the suggested puzzle, and you saved it.",
};

/** Why the turns are missing, said plainly, or null when they are not. */
export function noTurnsLine(view: ProvenanceView): string | null {
  switch (view.noTurnsBecause) {
    case "typed":
      return "You wrote this answer outside a conversation.";
    case "draft-named-none":
      return "Abductive wrote this summary without noting the messages behind it, so the list of messages is empty.";
    case "draft-missing":
      return "The summary that this answer came from is no longer in History.";
    case "reading":
      return "Abductive suggested that puzzle from your saved answers, outside a conversation.";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// An accepted claim (M39, ISC-505)
// ---------------------------------------------------------------------------

/**
 * What the map says when nothing was said before a claim.
 *
 * The sentence was declared inline in `OntologyGraph.tsx`, which meant the
 * popover could either import a component to print a sentence or write a second
 * one. Two spellings of "there is no conversation here" on two surfaces of the
 * same claim is the defect `originVocabulary.ts` exists to end, one layer out.
 * So it is a constant, the map reads it, and the popover reads it.
 *
 * The map says the origin after it, in the same words this module says it in;
 * the popover says the origin first and this second, so neither repeats itself.
 */
export const NO_CONVERSATION_CLAUSE = "This claim came from outside a conversation";

/**
 * The same fact as a sentence.
 *
 * Two forms of one string (M42), because the graph's origin line continues it
 * with a clause naming the mark and used to say "It is ..." to do so. The clause
 * is the one written down; the sentence is derived, so the two cannot drift.
 */
export const NO_CONVERSATION_LINE = `${NO_CONVERSATION_CLAUSE}.`;

/**
 * Whose claim it is, in the one vocabulary that owns those four words.
 *
 * Not a fifth register on `originVocabulary.ts`, which its own header forbids.
 * It is `originLabel` inside a sentence, and the sentence lives here because
 * this module owns the wording and the popover only draws it.
 */
export function claimOriginLine(origin: Origin): string {
  return `This claim is ${originLabel(origin)}.`;
}

/** Who let the claim into the model, in the same two words the turns use. */
export const ACCEPTED_BY: Readonly<Record<"you" | "the tool", string>> = {
  you: "You accepted this claim",
  "the tool": "Abductive accepted this claim",
};

/**
 * The turn behind each accepted claim, by the page id the accept minted.
 *
 * One derivation (ISC-501), read by this module and by `claimConversations` in
 * `ui/OntologyView.tsx`, which draws the map's offer from it. Both were walking
 * the tray for the same pair and the map's copy came first; it imports this one
 * now rather than keeping a second.
 */
export function turnsBehindClaims(tray: ProposalTray): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const proposal of tray.all) {
    if (proposal.acceptedAs === undefined || proposal.sourceTurn === undefined) continue;
    out.set(proposal.acceptedAs, proposal.sourceTurn);
  }
  return out;
}

/** The draft a claim was accepted from, or null when the claim had none. */
function acceptedProposalFor(tray: ProposalTray, pageId: string): Proposal | null {
  return tray.accepted.find((p) => p.acceptedAs === pageId) ?? null;
}

// ---------------------------------------------------------------------------
// What the researcher did to a draft before they let it in (D28, M43c)
// ---------------------------------------------------------------------------

/**
 * The claims whose draft the researcher rewrote before accepting it.
 *
 * The defect this answers. On the walk of 2026-09-13 the researcher retitled
 * three drafts and corrected the body of a fourth. Each card said "Your edit is
 * on the record." and relabelled its own button "Put my version in". The claims
 * table then read "from the language model" for all four and the census under it
 * read "0 yours", so the record the card had promised was nowhere on the page.
 *
 * The origin does not move, and that is the position `adjudicate.ts` has held
 * since the first build: `author-prior` asserts the researcher held the concept
 * before the model offered it, and editing a draft is evidence of the opposite.
 * What was missing is the other half of the same decision, which that file also
 * states, that "what the researcher did to the text is kept separately, on the
 * adjudication, as additive history". It was kept there and read by nothing.
 *
 * So this is the reading. `edited` is set by the door when the submitted text
 * differs from the draft, whitespace aside, and the accept that carries it names
 * the proposal whose `acceptedAs` names the claim. A fold over events, no model
 * call, nothing stored.
 */
export function editedClaims(
  events: readonly LedgerEvent[],
  projectId: string,
): ReadonlySet<string> {
  const scoped = events.filter((e) => e.projectId === projectId);
  const tray = projectProposals(scoped, projectId);
  const edited = new Set<string>();
  for (const e of scoped) {
    if (e.type !== "proposal-adjudication" || e.disposition !== "accept") continue;
    if (e.edited !== true) continue;
    const page = tray.accepted.find((p) => p.id === e.proposalId)?.acceptedAs;
    if (page !== undefined) edited.add(page);
  }
  return edited;
}

/**
 * The mark beside the origin, on the row and in the census.
 *
 * Beside the origin rather than instead of it, because both facts are true and
 * the reader needs both: the model wrote the claim, and the researcher did not
 * accept it as written. Lower case, because it rides inside a line that has
 * already started.
 */
export const EDITED_MARK = "edited by you";

/**
 * The census clause: "3 of those claims edited by you".
 *
 * Written here rather than in the panel that draws it, for the reason
 * `takeToConversation.ts` and `puzzleReading.ts` are: one sentence, one place,
 * and the surface that draws it cannot reword it. It reads as a continuation of
 * the count it follows, which is why it opens on a number.
 */
export function editedShare(count: number): string {
  return `${count} of those claims ${EDITED_MARK}`;
}

/** What the popover says about a claim the researcher rewrote. */
export const EDITED_LINE = "You rewrote the suggestion before you accepted it.";

// ---------------------------------------------------------------------------
// The mark that says an expectation is held in the setting (M44)
// ---------------------------------------------------------------------------

/** Who put the mark on an expectation, and when. */
export interface HeldMark {
  /** Who holds the expectation, in the words the researcher typed. */
  readonly holder: string;
  readonly by: "you" | "the tool";
  readonly at: number;
}

/**
 * The last mark on this expectation, or null when nobody has marked it.
 *
 * Last wins, for the reason `projection.ts` gives at the same op: a researcher
 * correcting the holder is correcting a sentence they typed, and the card shows
 * the holder the model currently carries. The earlier marks stay in the record.
 */
export function heldMarkOf(
  events: readonly LedgerEvent[],
  projectId: string,
  pageId: string,
): HeldMark | null {
  let mark: HeldMark | null = null;
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    if (e.type !== "ontology-mutation" || e.op !== "mark" || e.targetId !== pageId) continue;
    if (e.heldBy === undefined) continue;
    mark = { holder: e.heldBy, by: e.actor === "human" ? "you" : "the tool", at: e.ts };
  }
  return mark;
}

/**
 * Who marked it, as the opening of a sentence the popover finishes with the
 * moment.
 *
 * The holder is not repeated here: the card this box opens from prints it in full,
 * one line under the claim's own metadata, and a popover restating a sentence four
 * pixels away is the duplication the passage list two functions up already
 * refuses. What this adds is whose act it was and when.
 */
export const MARKED_BY: Readonly<Record<"you" | "the tool", string>> = {
  you: "You marked this expectation as held in the setting",
  /* The tool never writes a mark today, and `markHeldInSetting` records the
   * researcher's act. The branch is here because the actor is read off the event
   * rather than assumed, which is the rule `ACCEPTED_BY` above follows for the
   * same reason: a record that says "you" about an act somebody else took is the
   * one thing this module cannot do. */
  "the tool": "Abductive marked this expectation as held in the setting",
};

export interface ClaimProvenanceView {
  /** Which of the two subjects this reading is about. See the module note. */
  readonly kind: "claim";
  readonly pageId: string;
  /** Yours, from the papers, from the data, or from the model. */
  readonly origin: Origin;
  /** That value as one sentence, in the words every other surface uses. */
  readonly originLine: string;
  /**
   * The conversation turn the draft was made from, or null when there is none.
   *
   * A turn the transcript has no place for keeps its `place: null`, the same as
   * on the answer's side, because what a reader would otherwise be offered is a
   * link to nowhere.
   */
  readonly turn: ProvenanceTurn | null;
  /** The map's own sentence, when there is no turn to name. Null when there is. */
  readonly noTurnLine: string | null;
  /** Whether the researcher let this claim in, or a record says something else. */
  readonly acceptedBy: "you" | "the tool";
  /**
   * Whether they rewrote the draft first (D28, M43c).
   *
   * On the shape rather than derived by the popover, because the accept that
   * carries the fact is already read here for the actor and the moment, and a
   * second reading of one event is FIN-02 with a different noun.
   */
  readonly edited: boolean;
  /** When they did, as epoch milliseconds. */
  readonly acceptedAt: number;
  /**
   * How many passages the draft cited, counted and not listed.
   *
   * The draft's own citations rather than the claim's as it now stands: this
   * box answers how the claim arrived, and the card it opens from already
   * prints the live list. They are the same list until someone revises the
   * claim, because the door copies the field across unchanged.
   */
  readonly citedPassages: number;
  /**
   * The mark saying this expectation is held in the setting, when there is one
   * (M44).
   *
   * On the shape rather than derived by the popover, the rule `edited` above
   * states: this module reads the record and the popover draws what it returns.
   * Null on every claim that is not a marked expectation, which is most of them.
   */
  readonly heldInSetting: HeldMark | null;
  /** The event a link into the record should land on: the draft itself. */
  readonly recordEventId: string;
}

export interface ClaimProvenanceInput {
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
  /** The claim being asked about, by its page id. */
  readonly pageId: string;
}

/**
 * What the popover says about one accepted claim, or null when no draft is
 * behind it.
 *
 * Null rather than a reading, for the reason `answerProvenance` returns null on
 * an unsaved place: a claim the researcher wrote straight into the model has no
 * proposal, no accept and no turn, and a box saying so three times is a control
 * answering a question nobody asked. The card above it already prints the
 * origin, which is the whole of what the record holds about such a claim.
 *
 * A fold over events. No model call, nothing appended, nothing stored. The
 * proposal is found through `projectProposals`, the one reading of which draft
 * became which claim, rather than through a second walk of the ledger.
 */
export function claimProvenance(input: ClaimProvenanceInput): ClaimProvenanceView | null {
  const { projectId, pageId } = input;
  const events = input.events.filter((e) => e.projectId === projectId);

  const tray = projectProposals(events, projectId);
  const proposal = acceptedProposalFor(tray, pageId);
  if (proposal === null) return null;

  /* The two events behind the tray's reading, for the three facts it does not
   * carry: the envelope id a link into the record needs, and the actor and the
   * moment of the accept. Actor and moment are taken from the one event, so a
   * reader is never told that one person accepted it at a time another did. */
  const drafted = events.find((e) => e.type === "proposal" && e.proposalId === proposal.id);
  const accepted = events.find(
    (e) =>
      e.type === "proposal-adjudication" &&
      e.proposalId === proposal.id &&
      e.disposition === "accept",
  );
  if (drafted === undefined || accepted === undefined) return null;

  /* The origin the accept stamped. Null only when the create that the accept
   * emitted is not in the ledger, which is a record that has lost a row; the
   * box says nothing rather than assuming the usual value, because the usual
   * value is the one this tool most needs to be right about. */
  const origin = originOfClaim(events, pageId);
  if (origin === null) return null;
  const turn =
    proposal.sourceTurn === undefined ? null : readTurn(events, projectId, proposal.sourceTurn);

  return {
    kind: "claim",
    pageId,
    origin,
    originLine: claimOriginLine(origin),
    /* A turn whose place the transcript cannot name reads as no conversation,
     * which is the rule the map states and applies for the same reason: the
     * offer would be a link to nowhere. The turn is still returned, so a reader
     * of this shape can tell the two silences apart. */
    turn,
    noTurnLine: turn === null || turn.place === null ? NO_CONVERSATION_LINE : null,
    acceptedBy: accepted.actor === "human" ? "you" : "the tool",
    edited: accepted.type === "proposal-adjudication" && accepted.edited === true,
    acceptedAt: accepted.ts,
    citedPassages: proposal.sourceChunks.length,
    /* M44. Read here rather than by the popover, and read off the mark's own
     * event: the graph carries the holder and carries neither the actor nor the
     * moment, which are the two facts this box is asked for. */
    heldInSetting: heldMarkOf(events, projectId, pageId),
    recordEventId: drafted.id,
  };
}

/**
 * The origin the accept stamped on this claim.
 *
 * Read off the create rather than off the graph, because this projection takes
 * events and a page id and the graph is the caller's. The two cannot disagree:
 * `projection.ts` reads the same field off the same event, and a revise that
 * moved the origin would move both together. Latest wins for that reason.
 */
function originOfClaim(events: readonly LedgerEvent[], pageId: string): Origin | null {
  let origin: Origin | null = null;
  for (const e of events) {
    if (e.type !== "ontology-mutation" || e.targetId !== pageId) continue;
    if (e.op !== "create" && e.op !== "revise") continue;
    origin = e.origin;
  }
  return origin;
}
