/**
 * Ledger event schema — the typed append-only ledger is the single source of
 * state (ISA Constraints; ISC-1, ISC-4, ISC-5).
 *
 * Every event is immutable once appended. All derived state is computed by
 * pure replay over the event array (see ledger.ts).
 */

import { isProvider, PROVIDERS, type Provider } from "../inference/types.ts";


/** Who produced an event. Personas are namespaced, e.g. `persona:eisenhardt`. */
export type Actor = "human" | "system" | `persona:${string}`;

/** Adjudication verdicts a human can render on a persona challenge (ISC-1). */
export type Verdict = "accept" | "revise" | "reject" | "defer" | "ignored";

/** Attention instrumentation layers (ISC-22..24). */
export type AttentionLayer = "retrieval" | "citation" | "human";

/**
 * Common envelope carried by every event (ISC-4).
 * `model`/`modelVersion` are REQUIRED whenever the actor is a persona
 * (inference-produced events, ISC-5) — enforced by {@link validateEvent}.
 */
export interface EventEnvelope {
  /** UUID v4 string. */
  readonly id: string;
  /** Unix epoch milliseconds. */
  readonly ts: number;
  readonly actor: Actor;
  readonly projectId: string;
  /** Producing model, required for persona actors. */
  readonly model?: string;
  /** Producing model version, required for persona actors. */
  readonly modelVersion?: string;
  /**
   * The local bridge's lane that ran the model, "claude" (Claude Code) or
   * "codex" (M56, ISC-575). Additive: absent on every record from before M56,
   * on console-key and mock turns, and read as Claude when absent.
   */
  readonly provider?: Provider;
  /**
   * The local server that ran the turn (M60, ISC-579): "Ollama", "LM Studio",
   * "llama.cpp" or "port N". Only beside provider "local"; additive, absent on
   * every older record.
   */
  readonly server?: string;
  /**
   * What the model wrote, for any field the voice gate rewrote on the way out.
   *
   * Never set by a writer and never persisted by one. `normaliseEventProse` in
   * `displayProse.ts` attaches it when it normalises a field on a row that was
   * stored before the gate existed, so a reader, an auditor or an export holds
   * both the sentence in the tool's voice and the sentence the model actually
   * produced. It is the named-field generalisation of `rawText`, which
   * `voiceGateProvenance` has spread onto gated rows since the gate shipped.
   *
   * Keyed by field name; the value is whatever that field held, so an array
   * field such as `question-selection.alternatives` round-trips unchanged.
   *
   * `parseBundle` strips it and puts the originals back, so importing a bundle
   * restores the exporting researcher's ledger byte for byte rather than
   * installing the reading of it.
   */
  readonly asWritten?: Readonly<Record<string, unknown>>;
  /**
   * The model's reply broke one of the owner's rules and Abductive asked it once
   * to rewrite the offending sentences (M69, ISC-644). Additive: absent on every
   * older record and on every reply that kept the rules.
   */
  readonly voiceRetry?: true;
  /**
   * The model named a concept with more than one thing in the name, and
   * Abductive asked it once to split that concept into separate ones and the
   * relations between them (M90, ISC-732). Additive: absent on every older
   * record and on every reply whose names kept the rule.
   */
  readonly splitRetry?: true;
}

/** A bounding decision: the researcher (or system) fixes a boundary of the design. */
export interface BoundEvent extends EventEnvelope {
  readonly type: "bound";
  /** What was bounded, e.g. "site", "sample", "research-question". */
  readonly subject: string;
  /** The boundary as stated. */
  readonly statement: string;
  /** Optional stated rationale. */
  readonly rationale?: string;
  /**
   * The `brief-draft` this answer began as, when it began as one (M37, ISC-487).
   *
   * The tool can put a draft of the researcher's own words into the step's box.
   * They then edit it, or do not, and press save. Without this field the record
   * cannot tell an answer typed from nothing from an answer that arrived
   * pre-filled, and the difference is exactly the kind of thing this tool
   * exists to keep visible: a sentence you accepted is not the same evidence as
   * a sentence you wrote.
   *
   * Absent means the box was typed into. Set only when the text saved came out
   * of a draft made in this session, and cleared the moment the researcher
   * empties the box and starts afresh.
   */
  readonly draftedFrom?: string;
  /**
   * Whether the researcher changed the draft before saving it (M93, ISC-767):
   * true when the saved text differs from the draft's, false when it is the
   * draft word for word. Computed by comparing the two texts, and set only
   * beside `draftedFrom`. Absent on every save before M93.
   */
  readonly edited?: boolean;
}

/** A persona (or human) challenge to some aspect of the design. */
export interface ChallengeEvent extends EventEnvelope {
  readonly type: "challenge";
  /** The challenge text. */
  readonly text: string;
  /** Matrix cell that produced this challenge, if matrix-driven ("bias:stage"). */
  readonly matrixCell?: string;
  /** Event id this challenge targets, if any. */
  readonly targetEventId?: string;
}

/** A bias flag raised by the matrix engine (ISC-11: reason is mandatory). */
export interface FlagEvent extends EventEnvelope {
  readonly type: "flag";
  /** Matrix cell id, "bias:context". */
  readonly matrixCell: string;
  /** "Fired because…" trigger reason. Must be non-empty. */
  readonly reason: string;
  /**
   * What the flag is about — an ontology page, edge, or chunk id (v2).
   * Stage-entry flags concern the project as a whole and omit it. Present, it
   * scopes dedupe so a rule can fire once per offending page rather than once
   * per cell for the whole project.
   */
  readonly targetId?: string;
}

/**
 * One pass of the bias scan over one station's saved answer (M47).
 *
 * The flags the matrix writes are the product of a run, and until M47 nothing in
 * the app started one: `runStagePersonas` had no caller, so the grid on Checks
 * was empty on every study ever walked. The run has a call site at the station
 * save now, and this is the row that says it happened.
 *
 * The digest is what stops a re-save of an unchanged answer paying for a second
 * run. It is the hash of the answer the scan read, so pressing save twice on the
 * same words is one run and editing a word is another. The fired cells are kept
 * beside it because the record should say what the run concluded, not only that
 * it ran, and a reader of the record should not have to re-derive it.
 */
export interface BiasScanEvent extends EventEnvelope {
  readonly type: "bias-scan";
  /** The station whose saved answer the scan read. */
  readonly station: string;
  /** The matrix stage the station is filed under, which is what was evaluated. */
  readonly stage: string;
  /** Hash of the answer read. Equal digests mean the same answer. */
  readonly digest: string;
  /** The cells that fired on this pass, in the order the engine returned them. */
  readonly firedCells: readonly string[];
  /**
   * Whose words the pass read (M75, ISC-667). Absent on every row before M75
   * and on a save's scan, which reads the researcher's answer for the five
   * researcher biases; "abductive" on a scan of Abductive's own words for the
   * four machine biases, where `station` is the step, "concepts" or "report".
   */
  readonly reads?: "abductive";
  /** Which of Abductive's words the pass read: replies, summaries, suggestions, rivals. */
  readonly read?: readonly string[];
}

/** Attention instrumentation: a chunk touched at one of the three layers. */
export interface AttentionEvent extends EventEnvelope {
  readonly type: "attention";
  readonly layer: AttentionLayer;
  readonly chunkId: string;
}

/** Free-form dialogue response (human or persona). */
export interface ResponseEvent extends EventEnvelope {
  readonly type: "response";
  readonly text: string;
  /** Event id being responded to, if any. */
  readonly inReplyTo?: string;
  /**
   * Where this turn was said, when it replies to nothing (M37, ISC-483).
   *
   * A reply to a question inherits its place from the question, which is how
   * every turn before M37 got one. A conversation has turns that reply to
   * nothing: the researcher types again after passing on a question, or writes
   * a message with no question outstanding, or the tool ends a turn without
   * asking anything. Those have nowhere to inherit from, so they carry the
   * place themselves and the transcript can still show them where they were
   * said.
   *
   * A station id, or "framing". Absent on every turn that has a question to
   * inherit from, and on everything written before M37.
   */
  readonly station?: string;
  /**
   * Phrases in this turn that supply an answer rather than ask for one
   * (M37, ISC-486).
   *
   * Written on the tool's own turns and never on the researcher's. It does not
   * block: a scan blunt enough to be useful is blunt enough to object to an
   * innocent sentence, and refusing to show the researcher a turn the model
   * already produced would hide the evidence rather than record it. The count
   * is surfaced beside the ask-and-propose split, so a session where the tool
   * kept helping is legible as that rather than as a good conversation.
   */
  readonly answerLeaks?: readonly string[];
  /**
   * The researcher pressed Stop while this tool turn streamed (M58, the lead's
   * ruling of 2026-09-27). The text is what they saw before they stopped it, so
   * the record keeps it. Additive and optional: older records have no field and
   * read as they always did, and the checks and the model read a cut-short turn
   * as they read any tool turn.
   */
  readonly cutShort?: true;
}

/**
 * An answer drafted for the researcher out of their own words (M37, ISC-487).
 *
 * The step's box stays theirs. This is what the tool offers to put in it: the
 * answer assembled from what they said in the conversation at that place, in
 * their words and their voice, with gaps left marked where the answer would
 * need something they never said. It lands unsaved and marked as a draft, and
 * nothing has entered the record as their answer until they press save.
 *
 * `fromTurnIds` is what makes the claim checkable. It names the turns the draft
 * was made of, so a reader can put the draft beside the sentences it came out
 * of and see whether the tool added anything.
 */
export interface BriefDraftEvent extends EventEnvelope {
  readonly type: "brief-draft";
  /** The place it was drafted for: a station id, or "framing". */
  readonly station: string;
  /** The draft itself. Never saved by this event, only offered. */
  readonly text: string;
  /** The researcher's own turns the draft was made from. */
  readonly fromTurnIds: readonly string[];
  /**
   * Which Starting point answer the draft is for, when the framing drafts its
   * three at once (ISC-592): "startingInterest", "seminalCorpus" or
   * "targetVenue". Absent on every draft before ISC-592, each of which was the
   * interest, and on every step's draft, where `station` says it all.
   */
  readonly field?: string;
}

/**
 * The puzzle, as the tool read it out of what the researcher had saved
 * (M40, ISC-508, ISC-509).
 *
 * Not a draft and not their answer. `brief-draft` above offers the researcher a
 * sentence to put in their own box and waits for them to save it; this writes
 * nothing they have to accept, because what it produces is the tool's reading
 * and is labelled as the tool's everywhere it appears. The stored
 * `brief.researchQuestion` mirrors the latest reading so every reader of that
 * field keeps its shape, and no `bound` row is written for the write: a `bound`
 * row is the researcher committing to something, and they committed to the
 * answers this was read from, not to this.
 *
 * `sources` and `digest` are what make the claim checkable and the staleness
 * cheap. A reader can put the reading beside the subjects and passages it names,
 * and a surface asking "has what it read moved" compares two strings rather than
 * re-deriving a reading it would have to pay a model call for.
 */
export interface PuzzleReadingEvent extends EventEnvelope {
  readonly type: "puzzle-reading";
  /** The puzzle as the tool read it. Empty when it found none. */
  readonly text: string;
  /** Why no puzzle was read, from the model, when `text` is empty. */
  readonly none?: string;
  /** What it read: the bound subjects and the passage ids. */
  readonly sources: readonly PuzzleSource[];
  /** The digest of what it read, so staleness is a comparison and not a re-derivation. */
  readonly digest: string;
  /**
   * The reading waits for the researcher's decision (M93, ISC-763). Set on every
   * reading written from M93: such a reading becomes the research question only
   * through a `reading-accepted` event. Absent on every older reading, which was
   * mirrored into `brief.researchQuestion` when it was written and keeps that
   * effect, so an older project does not change meaning on load.
   */
  readonly awaitsDecision?: true;
}

/**
 * One thing a reading was made of.
 *
 * Two kinds, because there are two kinds of thing a reading can be held against:
 * an answer the researcher saved at a place, named by the subject it is filed
 * under, and a passage of their own material, named by its id. Neither carries
 * the text, for the reason every other citation on this ledger does not: the
 * text is in the brief and in the chunk store, and a copy on the event would be
 * a second version of it that could drift.
 */
export type PuzzleSource =
  | { readonly kind: "answer"; readonly subject: string }
  | { readonly kind: "passage"; readonly chunkId: string };

/** Human adjudication of a challenge (ISC-1 sub-types). */
export interface AdjudicationEvent extends EventEnvelope {
  readonly type: "adjudication";
  readonly verdict: Verdict;
  /** The id of the challenge event being adjudicated. */
  readonly challengeId: string;
  /** Required free-text reason for reject-with-reason flows; optional otherwise. */
  readonly reason?: string;
}

/** A gated modal-twin reveal (ISC-31: every reveal is logged). */
export interface RevealEvent extends EventEnvelope {
  readonly type: "reveal";
  /** What was revealed, e.g. "modal-twin". */
  readonly subject: string;
  /** How the reveal was reached: gated stage access or warned on-demand. */
  readonly via: "stage-gate" | "on-demand";
}

// ---------------------------------------------------------------------------
// v2: ontology, proposals, and the inverted interview loop
// ---------------------------------------------------------------------------

/**
 * Where an ontology element came from. This is the substrate of the
 * colonization-vs-discovery measurement: both the researcher and the model may
 * originate elements, and the two must stay distinguishable forever.
 *
 * M29 adds the third party. A claim the researcher read in a paper and now
 * experiences as their own intuition was counted as `author-prior`, which
 * inflates the "yours" share with other people's thinking — the precise error
 * the scheme exists to prevent. `literature-derived` names it, and it buys a
 * reading the three-way split could not make: a healthy study starts heavy on
 * `literature-derived` and `author-prior` and the `data-driven` share rises as
 * fieldwork proceeds. A model still mostly literature-derived after the pilot
 * has not met its setting.
 *
 * It attaches to theory pages and to nothing else, and `validateEvent`
 * enforces that rather than leaving it to a convention. An observation, a
 * residue, a resolution, a rival or a scope condition that came out of a paper
 * is not a finding about this setting, so there is no honest sense in which
 * one of them is "from the papers".
 */
export type Origin = "author-prior" | "data-driven" | "model-proposed" | "literature-derived";

export const ORIGINS: readonly Origin[] = [
  "author-prior",
  "literature-derived",
  "data-driven",
  "model-proposed",
];

/** The seven ontology page types. */
export type PageType =
  | "puzzle"
  | "theory"
  | "observation"
  | "analytic-residue"
  | "candidate-resolution"
  | "rival"
  | "scope-condition";

export const PAGE_TYPES: readonly PageType[] = [
  "puzzle",
  "theory",
  "observation",
  "analytic-residue",
  "candidate-resolution",
  "rival",
  "scope-condition",
];

/**
 * Argumentative role of an edge. Not generic association.
 *
 * `stands-to` is reserved for the puzzle→theory framing edge and is the only
 * role that may carry a `puzzleRelation`. Keeping it separate stops the four
 * relation values from being confused with argumentative roles: the role says
 * "this edge is the framing claim", the relation says which claim it is.
 */
export type EdgeRole =
  | "predicts"
  | "contradicts"
  | "resolves"
  | "rivals"
  | "bounds"
  | "evidences"
  | "tensions-with"
  | "stands-to";

export const EDGE_ROLES: readonly EdgeRole[] = [
  "predicts",
  "contradicts",
  "resolves",
  "rivals",
  "bounds",
  "evidences",
  "tensions-with",
  "stands-to",
];

/**
 * The relation between the substantive puzzle and the theoretical landscape.
 * This edge carries the framing argument; choosing it is the most
 * consequential and most path-dependent move in a design.
 */
export type PuzzleRelation = "contradicts" | "instantiates" | "exposes" | "silent";

export const PUZZLE_RELATIONS: readonly PuzzleRelation[] = [
  "contradicts",
  "instantiates",
  "exposes",
  "silent",
];

/**
 * What can be done to the ontology. Retirement supersedes; it never deletes.
 *
 * `mark` is the seventh and it does not touch what a page says (M44, owner's
 * decision of 2026-09-13). The researcher states that an expectation already in
 * the model is one people in the setting hold, and names who holds it. That is a
 * fact about the page and not a revision of it, so it cannot be a `revise`:
 * `projection.ts` takes the origin off every revise event and appends a version,
 * which would move a model-drafted expectation into the researcher's own bucket
 * for saying who wrote the board paper, and the origin is the measurement this
 * ledger exists to make.
 */
export type OntologyOp =
  | "create"
  | "revise"
  | "relate"
  | "unrelate"
  | "retire"
  | "reinstate"
  | "mark";

const ONTOLOGY_OPS: readonly OntologyOp[] = [
  "create",
  "revise",
  "relate",
  "unrelate",
  "retire",
  "reinstate",
  "mark",
];

/**
 * A mutation of the proto-ontology. The ontology is a projection of these
 * events, never a separately held state (spec-v2 "Derivation, not storage").
 */
export interface OntologyMutationEvent extends EventEnvelope {
  readonly type: "ontology-mutation";
  readonly op: OntologyOp;
  /** Stable id of the page or edge affected. Never renumbered. */
  readonly targetId: string;
  /** Present for page ops. */
  readonly pageType?: PageType;
  /** Present for relate/unrelate. */
  readonly edge?: {
    readonly from: string;
    readonly to: string;
    readonly role: EdgeRole;
  };
  /** Present when the mutation asserts a puzzle→theory relation. */
  readonly puzzleRelation?: PuzzleRelation;
  readonly origin: Origin;
  /** Chunks cited in support. Empty is legal but lints as an orphan. */
  readonly supportingChunks?: readonly string[];
  /**
   * Set when this page came out of the interview rather than out of material:
   * the id of the `response` event holding the answer it was drafted from.
   * A page with a turn and no chunks is still ungrounded in the corpus and
   * still lints, because a researcher restating their own prior is exactly the
   * thing the confirmation flag is for. What the field changes is what the
   * flag is allowed to say: that the page rests on their own account and on no
   * material, rather than that it came from nowhere.
   */
  readonly supportingTurn?: string;
  /**
   * Which paper this expectation came out of (M30). See `ProposalEvent`.
   *
   * Carried onto the page by `adjudicate.ts` so the claim keeps the link after
   * the draft is gone, which is what lets a surface mark a claim standing on a
   * paper the fit gate later flagged.
   */
  readonly paperKey?: string;
  /**
   * Who in the setting holds this expectation, in the researcher's own words
   * (M44, owner's decision of 2026-09-13).
   *
   * Written on a `mark` and nowhere else. "the board, in the January paper" is
   * the shape: a person or a body, and where they said it. A field on the page
   * rather than a page kind of its own, which is the shape `paperKey` above
   * already gives to the other fact a surface needs about an expectation, and it
   * is validated the same way: non-empty, and only on a theory page.
   *
   * It is the researcher's act and never the tool's reading. `expectationsOnOffer`
   * in `ontology/relations.ts` offers a marked expectation to the chooser whatever
   * its origin, so the sentence a reader meets beside that option has to be one
   * somebody typed.
   */
  readonly heldBy?: string;
  /** Page title / short label, for create and revise. */
  readonly title?: string;
  /** Markdown body, for create and revise. */
  readonly body?: string;
  /**
   * Why the researcher made this change, in their own words.
   *
   * Written on a retirement, which is the one mutation that takes something out
   * of the model. A claim that leaves without a reason is a gap in the record
   * where the most interesting sentence in the study should be: the tool keeps
   * a retired claim struck through precisely so the reader can see what was
   * dropped and why, and half of that is the why.
   *
   * Optional on the type, and checked only for emptiness when it is there. The
   * requirement that a retirement carry one is enforced by the writer in
   * `proposals/adjudicate.ts` and by the control the researcher uses, not here:
   * events written before this field existed are still what the study said at
   * the time, and a validator that retroactively condemned them would be the
   * ledger rewriting its own history.
   */
  readonly reason?: string;
}

/** A model-originated candidate awaiting adjudication. Never enters the ontology directly. */
export interface ProposalEvent extends EventEnvelope {
  readonly type: "proposal";
  readonly proposalId: string;
  readonly pageType?: PageType;
  readonly edge?: {
    readonly from: string;
    readonly to: string;
    readonly role: EdgeRole;
  };
  readonly title: string;
  readonly body?: string;
  /**
   * Which framing claim a `stands-to` edge makes. Required on that role and
   * forbidden on every other, exactly as on the mutation it becomes.
   *
   * M29. Until now no production path wrote a `stands-to` relation at all,
   * because the proposal door could not carry the one field that role needs
   * and the door is the only way in. The field is here rather than a second
   * door being opened beside it.
   */
  readonly puzzleRelation?: PuzzleRelation;
  /**
   * The origin to stamp if the researcher accepts, for the two cases where
   * `model-proposed` would be a lie (M29, R3).
   *
   * Accepting a draft is normally ratification, so the page is the model's and
   * says so. Two acts are not ratification. Accepting a theory claim the reader
   * drew out of a named paper makes a page whose content is the paper's, and it
   * is stamped `literature-derived`. Choosing one of four relations shown
   * side by side with no recommendation is a judgment the researcher made, and
   * it is stamped `author-prior`. Everything else ignores this field, and
   * `adjudicate.ts` is the only place that reads it.
   *
   * A third case joined them at M43c (D30). A claim the data reader drew out of
   * the researcher's own transcripts and fieldnotes holds what those documents
   * say, so it is stamped `data-driven`, on the same argument that puts a paper's
   * expectation in the papers' bucket: the origin says where the content came
   * from, and `model-proposed` is for a claim the model invented. Without it the
   * census read "0 from the data" on a study of six documents holding claims that
   * cited those documents by passage, and the one bucket a qualitative study
   * exists to fill was the one bucket nothing could reach.
   */
  readonly originOnAccept?: Extract<Origin, "literature-derived" | "author-prior" | "data-driven">;
  /**
   * The framing this paper was read against (walk finding).
   *
   * Pressing "Draft what these papers expect" twice read the same three papers
   * twice and staged eight expectations, because the only guard was a list of
   * titles already in the model and the model does not write the same title
   * twice running. What makes a second reading worth paying for is not that the
   * researcher pressed again, it is that the study has moved: the reader is
   * given the puzzle and what the study is about, so the same paper against the
   * same framing yields the same expectations.
   *
   * So the framing is stamped on the draft, and a paper is read again only when
   * what is stamped no longer matches. Whitespace-normalised and lowercased by
   * `framingDigest`, which is the same string the fit gate compares.
   */
  readonly framingDigest?: string;
  /**
   * Which paper this expectation was drafted out of (M30).
   *
   * The document id for an uploaded paper, and the line the researcher typed
   * for one they never uploaded. That is the same key `theory.ts` puts on a
   * `paper-misfit` finding, so a claim can be matched against a flagged paper
   * without going through its passages.
   *
   * It exists for the typed-line case, which has no passages at all: a draft
   * from a typed line cites nothing by instruction, so `supportingChunks` is
   * empty and there was no way to tell which line it came from. Without this a
   * claim resting on a flagged typed line went unmarked.
   *
   * Only on a theory draft, because only the paper reader writes one.
   */
  readonly paperKey?: string;
  readonly sourceChunks: readonly string[];
  /**
   * Set when the proposal was drafted from something the researcher said
   * rather than from material: the id of the `response` event holding the
   * answer. Such a proposal cites no chunk and must not lint as ungrounded —
   * its ground is a turn in this same ledger, which is a stronger citation
   * than a chunk id, not a weaker one.
   */
  readonly sourceTurn?: string;
  /**
   * A link to draw from the new page the moment it exists (M29b).
   *
   * A proposal has carried a page or an edge and never both, because the
   * mutation it becomes is a `create` or a `relate`. That was fine until the
   * tool started drafting a rival: a rival's whole content is that it competes
   * with a particular explanation, the page id is minted at acceptance, and a
   * second proposal for the edge could not be written in advance because there
   * was nothing to point it at. So an accepted rival landed unlinked,
   * `resolution-without-rival` kept firing on the explanation it was written
   * against, and no surface let the researcher draw the link.
   *
   * This does not open a second door. `mutationForAccept` reads it and emits
   * both mutations from the one accept, so the proposal is still the only way
   * in and the two events still arrive together.
   *
   * Not for `stands-to`. That role must carry a `puzzleRelation` naming which
   * of the four claims is made, this field has nowhere to put one, and the
   * framing decision has its own door in the expectation chooser.
   */
  readonly linkOnAccept?: {
    readonly to: string;
    readonly role: EdgeRole;
  };
}

/**
 * Disposal of a proposal. Rejections are retained deliberately — what the
 * researcher declines to accept is signal, not waste.
 */
export interface ProposalAdjudicationEvent extends EventEnvelope {
  readonly type: "proposal-adjudication";
  readonly proposalId: string;
  readonly disposition: "accept" | "reject" | "merge" | "defer";
  /**
   * True when the researcher changed the drafted text before accepting it.
   *
   * It does not change the page's origin. What it measures is whether the
   * adjudication step is doing any work at all: a study whose pages were every
   * one accepted verbatim has a tray, not a gate, and that is worth being able
   * to see. Read it as a rate rather than as a verdict on any single page,
   * because a researcher who reads a draft, agrees with it, and accepts it has
   * done nothing wrong.
   */
  readonly edited?: boolean;
  /** Required on reject and merge. */
  readonly reason?: string;
  /** Present on merge: the existing page absorbed into. */
  readonly mergedInto?: string;
}

/**
 * The agent's choice of what to ask next. Question selection is a bounding
 * move, so an unreasoned selection is unauditable — `reason` is mandatory,
 * mirroring FlagEvent.
 */
export interface QuestionSelectionEvent extends EventEnvelope {
  readonly type: "question-selection";
  /** The move actually taken. Unique per turn. */
  readonly moveId: string;
  /**
   * The subject the move is about — stable across turns, unlike `moveId`.
   * Refusals are counted per topic, so without this the tool could not tell
   * three refusals about one thing from three refusals about three things
   * (ISC-50). It is also the axis divergence is measured on (ISC-44).
   */
  readonly topic: string;
  /**
   * The question as put. Without it the ledger records that a question was
   * chosen but not what it was, and the transcript has to reconstruct the
   * question from the model's delivery of it — which is unrecoverable if the
   * delivery fails, and unverifiable even when it succeeds. Holding both lets
   * a reader check what was supposed to be asked against what was said.
   */
  readonly question: string;
  /** The alternatives offered alongside it — the divergence is the record. */
  readonly alternatives: readonly string[];
  /** Interrogation asks and must not supply the answer; guidance proposes. */
  readonly mode: "interrogation" | "guidance";
  readonly matrixCell?: string;
  /** "Selected because…". Must be non-empty. */
  readonly reason: string;
  /**
   * Which station the researcher was standing on when they took this move.
   *
   * `topic` already says `station:site-selection` for a station probe, but
   * most turns taken at a station are not station probes — they come from a
   * lint finding, an unmet obligation, an untouched matrix cell — and none of
   * those topics name a station. Without this the design view cannot show the
   * conversation belonging to the station you are looking at, which is what
   * makes a station a place rather than a label on a question.
   *
   * Optional, because studies that predate M26 have turns with no station and
   * a ledger does not get to rewrite its own history. Those turns read as
   * belonging to the study rather than to any one station.
   */
  readonly station?: string;
  /**
   * The step's opening question, which the bubble at the head of the step
   * already shows (M74b, ISC-664). Additive: the thread draws the opener's
   * lead-in without a question line under it, so the question is on screen
   * once. Absent on every selection before M74b.
   */
  readonly opener?: true;
  /**
   * The challenge this question puts to the researcher, by the challenge
   * event's id (M78b, ISC-682). Additive: the chat writes it when its turn asks
   * one of Abductive's design challenges, and Biases watched reads it to say
   * where Abductive asked. The challenge event stays as written.
   */
  readonly fromChallenge?: string;
}

/** The researcher seizes the agenda. Where they steer is data. */
export interface RedirectionEvent extends EventEnvelope {
  readonly type: "redirection";
  /** The move that was on offer and set aside. */
  readonly fromMoveId?: string;
  /** What the researcher chose to work on instead. */
  readonly toTopic: string;
}

/**
 * A declined question. "I don't know" is first-class and unpenalised;
 * sustained avoidance is a pattern the tool should surface, not push through.
 */
export interface RefusalEvent extends EventEnvelope {
  readonly type: "refusal";
  readonly questionEventId: string;
  readonly kind: "dont-know" | "not-now" | "wont-answer";
  readonly note?: string;
  /**
   * Present when the tool set the question aside, absent when the researcher
   * pressed a decline (D9, M43).
   *
   * The walk of 2026-09-13 pressed "Give me some directions" with a question
   * open at the Site step. The transcript then read `declined · the Site step`
   * over the words "Not now.", and the model's next sentence was "Fair enough,
   * that's yours to decline". The researcher had declined nothing: they had
   * asked for help before answering. Setting the question aside is right, since
   * one question is open at a time across the whole study and a tool that
   * refuses to help with its own question is worse. What was wrong was whose
   * decision the record said it was, on the one surface whose claim is that it
   * never puts words in the researcher's mouth.
   *
   * Two values, because the tool sets a question aside on the way to two things
   * the researcher asked for: `directions` is the guidance turn behind "Give me
   * some directions", and `another-question` is a question picked out of the
   * alternatives while one was open (D11).
   *
   * Optional, and it has to be: records written before M43 carry nothing here.
   * `projectTranscript`'s reader infers those from the shape of the events that
   * follow, so the study walked on 2026-09-13 reads correctly.
   */
  readonly setAsideFor?: "directions" | "another-question";
}

/**
 * "I don't know", pressed on the chip (M74b, ISC-665). Additive: before M74b the
 * chip wrote a `refusal` of kind `dont-know`, which every reader still reads.
 * A first-class answer, penalised nowhere; it closes the open question it
 * replies to.
 */
export interface DontKnowEvent extends EventEnvelope {
  readonly type: "dont-know";
  readonly questionEventId: string;
}

/**
 * "Ask me differently", pressed on the chip (M74b, ISC-665). Additive: before
 * M74b the chip wrote a `not-now` refusal set aside for `directions`. The
 * researcher declined nothing, so it is no decline: it closes the question open
 * at its step, when one is, and the guidance turn follows.
 */
export interface AskDifferentlyEvent extends EventEnvelope {
  readonly type: "ask-differently";
  /** The question open at this step when the chip was pressed, if any. */
  readonly questionEventId?: string;
  /** The place the chip was pressed at: a station id, or "framing". */
  readonly station: string;
}

/** What the tool was doing when it set a question aside. */
export const SET_ASIDE_REASONS: readonly NonNullable<RefusalEvent["setAsideFor"]>[] = [
  "directions",
  "another-question",
];

/** Saturation on ontology mutation. Advisory only — never blocks. */
export interface SaturationCheckEvent extends EventEnvelope {
  readonly type: "saturation-check";
  /** Ontology mutations observed in the trailing window. */
  readonly mutationsInWindow: number;
  readonly windowTurns: number;
  readonly reached: boolean;
}

/**
 * Narrowing from several candidate puzzles to fewer. An event, not a
 * deletion: superseded puzzles remain and can be reinstated, and the collapse
 * itself is eligible for a premature-closure flag.
 */
export interface PuzzleCollapseEvent extends EventEnvelope {
  readonly type: "puzzle-collapse";
  readonly keptPuzzleIds: readonly string[];
  readonly supersededPuzzleIds: readonly string[];
  readonly reason: string;
}

/** The full discriminated union of ledger events (ISC-1). */
/**
 * A lint finding that a model produced, put on the record.
 *
 * Structural findings are pure graph queries, so they are recomputed on every
 * render and never stored — recomputing is cheaper than remembering and cannot
 * go stale. Inference-backed findings cannot work that way. They cost a model
 * call, they are non-deterministic, and a finding that vanished on reload
 * could never become an interview move, which is the whole reason for having
 * them.
 *
 * So they are events. That also fixes the older problem: `lintSemantic` was
 * written, tested, and called from nowhere in the app, because there was no
 * answer to where its output would live. There is one now.
 */
/**
 * What a paper leads a reader to expect in a setting like this one (M33).
 *
 * A property of the paper, true whether or not the researcher agrees with it,
 * and that is what separates it from a theory page. A theory page is their
 * ratified version: it carries `literature-derived`, it takes relations and
 * obligations, and the checks and the exports read it. One object for both
 * would put unratified model text inside the model and break the commitment
 * three surfaces state (ISC-409).
 *
 * Three parts and no more. The expectation is a claim about the world that a
 * setting could break; the scope is where its authors say it holds and where
 * they say it does not; the passage is where it came from, and there is one
 * only when the researcher uploaded the file. A typed line carries no citation
 * rather than an invented one.
 */
export interface PaperBaseline {
  /** Stable within the event that carries it. */
  readonly id: string;
  /** One sentence a setting could break. About the world, never about the paper. */
  readonly expectation: string;
  /** Where its authors say it holds, and where they say it does not. */
  readonly scope: string;
  /** The passage it came from. Absent for a line the researcher typed. */
  readonly chunkId?: string;
}

/**
 * A paper judged against the study, on arrival (M29c).
 *
 * A verdict is not a finding. Two of the three are "this is fine", and filing
 * those as `lint-finding` would put a row in the open list for every paper that
 * belongs, which is the opposite of what the list is for. It is not attention
 * either: nothing was read on the researcher's behalf, and the attention layers
 * are what the coverage map counts.
 *
 * So the judgement is its own event, and the `paper-misfit` finding is a second
 * event emitted beside it when the verdict is `misfit`. That split is what lets
 * a row say "fits your setting" without inventing a verdict from the absence of
 * a finding, and what lets the reader tell "judged and fine" from "never
 * judged", which are the two states the old build could not distinguish.
 */
export interface PaperFitEvent extends EventEnvelope {
  readonly type: "paper-fit";
  /** The document id for an upload, the typed line for one never uploaded. */
  readonly paperKey: string;
  /** What the researcher calls it, for a surface with no row to look up. */
  readonly paperName: string;
  readonly verdict: "fits" | "unclear" | "misfit";
  /** The model's own sentence. Empty is legal: `unclear` often has no reason. */
  readonly reason: string;
  /**
   * A digest of the framing this verdict was reached against (M29c).
   *
   * A verdict is only true of the study it judged. When the puzzle or the
   * exploring text changes the paper has to be judged again, and comparing this
   * against the current digest is how a caller knows which papers are stale
   * without re-reading every one on every save.
   */
  readonly framingDigest: string;
  /**
   * What this paper expects, written on the call that judged it (M33).
   *
   * A field rather than an event of its own. A baseline is only true of the
   * study the verdict judged, and `framingDigest` plus `paperVerdicts` already
   * give staleness and last-wins-per-paper; a second event would duplicate
   * both. Not a draft either: the tray holds what the researcher asked for, and
   * these arrive unasked.
   *
   * Optional, and the absence is meaningful rather than sloppy. The record
   * appends and is never rewritten, so a `paper-fit` event written before M33
   * has no baselines and no later pass may give it any. Every reader treats
   * absent as none, and a paper whose verdict predates this field is re-judged
   * the next time its framing moves.
   */
  readonly baselines?: readonly PaperBaseline[];
  /**
   * What the researcher said this paper bears on, when the judgement read it
   * (M51, ISC-533).
   *
   * The judge no longer tells a researcher a paper does not belong. A paper it
   * cannot place is put back to them as a question, their answer is recorded as
   * a `paper-bearing` event, and the paper is read again with that answer in
   * the prompt. This field is what the judgement was told, so a later pass can
   * tell a verdict reached without the researcher's sentence from one reached
   * with it, and judge again exactly once per sentence they write.
   *
   * A digest rather than a link, for the reason `framingDigest` is one: the
   * comparison has to be answerable from the event alone, without ordering two
   * timestamps written a millisecond apart.
   */
  readonly bearing?: string;
}

/**
 * What the researcher says a paper bears on in their setting (M51, ISC-533).
 *
 * A co-author, on the judge of 2026-09-21: "you're being too self-confident",
 * and "instead of making judgments, ask: why do you think this is relevant?".
 * So the verdict stops reaching the screen and a paper the judge cannot place
 * carries a question instead. This event is the answer.
 *
 * `actor: "human"` always, and that is the point of a separate event rather
 * than a field on `paper-fit`. The verdict is the tool's reading of a paper and
 * this is the researcher's, and a record that could not tell them apart would
 * be the tool writing a sentence in their name, which this codebase has paid
 * for twice already (D9, D41).
 */
export interface PaperBearingEvent extends EventEnvelope {
  readonly type: "paper-bearing";
  /** The document id for an upload, the typed line for one never uploaded. */
  readonly paperKey: string;
  /** What the researcher calls it, for a surface with no row to look up. */
  readonly paperName: string;
  /** Their own sentence. Never empty: an empty box saves nothing. */
  readonly reason: string;
  /**
   * The `paper-fit` event whose reason the box was filled with, when the
   * researcher started from the judge's sentence (M93, ISC-768). Absent when
   * they typed into an empty box, and on every event before M93.
   */
  readonly startedFrom?: string;
  /** Whether they changed that sentence before saving it, beside `startedFrom` (M93). */
  readonly edited?: boolean;
}

/**
 * A document taken out of the study (M29c, item 5).
 *
 * Storage forgets the file and its passages; the record does not. A claim that
 * cited one of those passages keeps its citation exactly as it was written,
 * because the citation is a fact about what the researcher did and deleting the
 * file does not undo it. This event is what lets a surface say what the missing
 * passage was, and it is what a reader asking "where did that quote go" finds.
 *
 * The counts travel with it for the same reason: after the delete there is
 * nothing left to count, so a receipt written later could not say how much left
 * the study unless the event said so at the time.
 */
export interface DocumentRemovedEvent extends EventEnvelope {
  readonly type: "document-removed";
  readonly documentId: string;
  /** What the researcher called it. The only name left once storage forgets. */
  readonly documentName: string;
  /** transcript, fieldnote, archival, memo or literature, as it was filed. */
  readonly documentKind: string;
  /** How many passages went with it. */
  readonly passageCount: number;
  /**
   * Which passages, by id.
   *
   * Not bookkeeping. A claim that cited one of these still cites it, and once
   * the chunk is deleted there is nothing left anywhere that says which file
   * that id belonged to. Without these a surface naming the citation could only
   * print an eight-character uuid at somebody who has no way to look it up,
   * which is the defect `passageIn` was written to end.
   *
   * `passageCount` is the same fact as a number and is validated against this,
   * so a caller cannot write a count that disagrees with the list.
   */
  readonly passageIds: readonly string[];
  /** Why, if they said. Optional: removing a mis-upload needs no explanation. */
  readonly reason?: string;
}

export interface LintFindingEvent extends EventEnvelope {
  readonly type: "lint-finding";
  /** Rule id from the checks' rule union (`lint/types.ts`, on the branch `with-checks` since M89). */
  readonly rule: string;
  /** "page" | "edge" | "chunk" | "graph" | "design". */
  readonly targetKind: string;
  /** Empty for findings about the design or the graph as a whole. */
  readonly targetId: string;
  /** Why it fired, in the researcher's terms. Never empty, same rule as flags. */
  readonly reason: string;
  /** Matrix cell, when the rule is matrix-anchored. */
  readonly matrixCell?: string;
  /**
   * Which pass produced this. Shared by every finding from one run.
   *
   * Without it there is no way to tell a concern that still stands from one
   * the researcher has since fixed: the ledger appends, so an old finding sits
   * there complaining about a problem that no longer exists. Grouping by run
   * lets a later pass say which earlier findings it did not raise again.
   */
  readonly runId?: string;
  /**
   * The framing the checks ran against (walk item 7).
   *
   * Five of the nine checks read the framing, so a run is an answer about the
   * design as it stood. A researcher who then changes their puzzle or their
   * reading list is looking at findings about a study that no longer exists,
   * and nothing on the page said so: the count read as current.
   *
   * Written on every finding of a run rather than on a marker, because there is
   * no run event to hang it on and a finding already carries its run id. Same
   * digest the fit gate compares, so "the framing moved" means one thing.
   */
  readonly framingDigest?: string;
}

/**
 * The researcher's disposal of a finding.
 *
 * Findings are observations and are never resolved by the tool, but a
 * researcher must be able to say "I have taken this one" or "this does not
 * apply", or by the second session the panel is wallpaper and they stop
 * reading all of it, including the ones that matter. Dismissing does not
 * delete: the finding and the dismissal both stay on the record.
 */
export interface FindingDispositionEvent extends EventEnvelope {
  readonly type: "finding-disposition";
  /** Id of the `lint-finding` event being disposed of. */
  readonly findingId: string;
  readonly disposition: "acknowledged" | "not-applicable";
  /** Required on not-applicable: why it does not apply here. */
  readonly reason?: string;
  /**
   * The subject of the finding, as it stood when this was decided (D47, M43d).
   *
   * A check run appends rather than replaces, so a design that has not changed
   * raises the same concern again under a new event id, and the dismissal
   * written against the old id did not reach the new one. The walk of
   * 2026-09-13 dismissed five findings with written reasons, re-ran the checks,
   * and watched the panel go from 36 entries to 31: the five deleted were
   * exactly the five the second pass raised again, reworded by the model.
   *
   * The decision is about the subject rather than about the sentence, so what is
   * stamped here is a digest of the subject: the claim's own text for a claim,
   * the framing for a finding about the design. A later pass that raises the
   * same concern about the same subject meets the dismissal; one that raises it
   * after the subject moved does not.
   *
   * Optional, and absent means the dismissal stands. Every disposition written
   * before this field existed has no digest, and reading that as "the subject
   * has moved" would delete exactly the reasons this field exists to keep.
   */
  readonly subjectDigest?: string;
}

/**
 * Something was taken out of the study.
 *
 * The receipt on /exports was session state. Reloading the tab cleared it, so
 * the one fact a researcher needs months later, that a particular file left this
 * study at a particular state of the design, was the only thing that happened in
 * Abductive that Abductive did not record. NVivo leaves a receipt; we left one until
 * the page was refreshed.
 *
 * Recording an export is not the same as recording a design decision, and the
 * distinction is load-bearing rather than pedantic: `ledgerStamp` skips these
 * events, so taking a file out does not move the stamp. If it did, every export
 * would invalidate the stamp printed inside the export before it, and the
 * receipt's one checkable claim, recompute this digest over the ledger and you
 * will get the same eight characters, would hold for nobody.
 */
export interface ExportEvent extends EventEnvelope {
  readonly type: "export";
  /** The name the file arrived under, or the directory name for the wiki. */
  readonly artefact: string;
  /** What it weighed on disk. */
  readonly bytes: number;
  /** The design stamp at the moment it was taken. */
  readonly stamp: string;
  /** How many design events that stamp was computed over. */
  readonly designEvents: number;
}

// ---------------------------------------------------------------------------
// M63: the emerging project ontology and the readiness report (ISC-608)
// ---------------------------------------------------------------------------

/**
 * The five relations two concepts may stand in (the owner, 2026-09-30).
 *
 * Each runs from one concept to another and reads in that direction: "Reading
 * dose leads to Judgement shift". "varies with" and "contrasts with" read both
 * ways in English, and the direction is kept anyway, because the researcher
 * wrote it one way round and the record keeps what they wrote.
 */
export const CONCEPT_RELATIONS = [
  "part-of",
  "leads-to",
  "varies-with",
  "contrasts-with",
  "condition-for",
] as const;

export type ConceptRelation = (typeof CONCEPT_RELATIONS)[number];

/**
 * What a concept suggestion was made from (ISC-610).
 *
 * `summary` is a step's saved answer, named by the step; `data` is a read of the
 * researcher's own material, named by the passages it drew on; `grouping` is the
 * offer to group the statements a project already holds, made on first open of
 * a project with claims and no concepts. `researcher` is a concept the
 * researcher wrote themselves, which is never a suggestion and is recorded on
 * `concept-accepted` rather than here.
 */
export type ConceptSource =
  | { readonly kind: "summary"; readonly station: string }
  | { readonly kind: "data"; readonly chunkIds: readonly string[] }
  /* M74b, ISC-665: `from: "papers"` when the pass grouped claims still waiting
   * from the papers, so the mark reads "from the papers". Additive. */
  | { readonly kind: "grouping"; readonly from?: "papers" }
  /* M82, ISC-694: the Relate concepts pass, which reads every accepted concept
   * with its definition and statements and proposes relations among them. */
  | { readonly kind: "relate" }
  /* M93, ISC-756: the Surface concepts and relationships pass, which reads both
   * sides of a step's chat since the last surfacing there, and the step's saved
   * summary. `turnIds` names every turn the pass read (a saved summary is named
   * by its `bound` event's id); `surfacingId` names the `surfacing` event. */
  | { readonly kind: "chat"; readonly station: string; readonly turnIds: readonly string[]; readonly surfacingId?: string };

/**
 * The passage or answer a relation, a statement or a settled line came from.
 *
 * A passage is named by its id and an answer by the step it was saved at, for
 * the reason `PuzzleSource` gives: the text lives in the chunk store and the
 * brief, and a copy here would be a second version of it that could drift.
 */
export type ConceptEvidence =
  | { readonly kind: "passage"; readonly chunkId: string }
  | { readonly kind: "answer"; readonly subject: string };

/** One relation a suggestion proposes, to a concept already in the ontology or in the same batch. */
export interface SuggestedRelation {
  readonly relation: ConceptRelation;
  /** The concept at the other end: an accepted concept, or one suggested in the same batch. */
  readonly to: string;
}

/**
 * Abductive suggests a concept (ISC-608, ISC-610).
 *
 * Never part of the ontology by itself. It lands in "Suggested concepts" and
 * waits there for the researcher's decision, the rule the claims tray has kept
 * since M4: nothing enters the model without a decision. Written by the model,
 * so the envelope carries the model and its version.
 *
 * The draft rule stands: the name and the definition come from the researcher's
 * words, and where their words never said the thing the definition carries the
 * gap marker `[...]` rather than an invented clause.
 */
export interface ConceptSuggestedEvent extends EventEnvelope {
  readonly type: "concept-suggested";
  /** Stable id of the concept this suggestion would become. Minted here, kept on accept. */
  readonly conceptId: string;
  readonly name: string;
  readonly definition: string;
  /** The aspects that vary, as names. How each varies is the researcher's to say. */
  readonly properties: readonly string[];
  readonly relations: readonly SuggestedRelation[];
  /** Existing claims (page ids) this concept would hold as statements. */
  readonly statementIds: readonly string[];
  /** New statements, in the researcher's words, this concept would hold. */
  readonly statements: readonly string[];
  readonly source: ConceptSource;
  /**
   * M82, ISC-695, additive: one or two sentences on what the concept does for
   * the argument and what the design loses without it. Accepting the concept
   * accepts the line as Abductive's; the researcher refines it later.
   */
  readonly whyItMatters?: string;
  /**
   * The turns this suggestion draws on, for a surfacing from the chat (M93,
   * ISC-757). Whose words they are is read off those turns' actors by
   * `concepts/chat.ts`, never taken from the model. Absent on every other source.
   */
  readonly drawnFrom?: readonly string[];
}

/**
 * The researcher accepts a suggested concept, or writes one of their own
 * (ISC-608).
 *
 * `origin` is the concept's mark, set here and never changed afterwards: a
 * refined concept keeps the mark it was accepted with, for the reason M29 gave
 * claims (an edit is not evidence the researcher held the concept first). A
 * concept the researcher writes themselves carries `name` and `definition` and
 * `author-prior`; an accepted suggestion carries neither, because its words are
 * on the suggestion.
 */
export interface ConceptAcceptedEvent extends EventEnvelope {
  readonly type: "concept-accepted";
  readonly conceptId: string;
  readonly origin: Exclude<Origin, "literature-derived">;
  readonly name?: string;
  readonly definition?: string;
  /**
   * The acceptance took the concept's name and definition and nothing else
   * (M93, ISC-764): the suggestion's properties, relations and Why it matters
   * line stay suggested, each with its own decision. Set on every acceptance of
   * a suggestion from M93; absent on every older one, which wrote those parts
   * beside it and keeps them.
   */
  readonly unbundled?: true;
  /** Written by "Accept all" on a card, one event per item (M93, ISC-764). */
  readonly bulk?: true;
}

/**
 * The researcher's edit to a concept's name or definition (ISC-608).
 *
 * Additive: the projection keeps the original beside the edit, so the card can
 * show both and History can say what changed.
 */
export interface ConceptRefinedEvent extends EventEnvelope {
  readonly type: "concept-refined";
  readonly conceptId: string;
  readonly name?: string;
  readonly definition?: string;
}

/**
 * The researcher retires an accepted concept, with a reason (M82, the lead's
 * ruling A of 2026-10-04: "A researcher must be able to drop a concept that
 * turned out empty."). Additive: the concept leaves the accepted cards, the
 * map, the Report and the field list; the door removes its relations with
 * their own events first, and its statements go back to Statements to place.
 * History keeps the concept, its reason and everything it held.
 */
export interface ConceptRetiredEvent extends EventEnvelope {
  readonly type: "concept-retired";
  readonly conceptId: string;
  readonly reason: string;
}

/** The researcher rejects a suggested concept, with a reason (ISC-608). */
export interface ConceptRejectedEvent extends EventEnvelope {
  readonly type: "concept-rejected";
  readonly conceptId: string;
  /** Required. What the researcher rejects is signal, and the reason is what makes it readable. */
  readonly reason: string;
}

/**
 * A property of a concept, set, edited or removed (ISC-608).
 *
 * A property is an aspect of the concept that varies. `varies` is how it varies,
 * in the researcher's words; a property with no `varies` is undefined, and an
 * undefined property raises a line in "What to look for in the field".
 */
export interface ConceptPropertySetEvent extends EventEnvelope {
  readonly type: "concept-property-set";
  readonly conceptId: string;
  readonly propertyId: string;
  readonly name: string;
  readonly varies?: string;
  readonly removed?: true;
  /** The suggested property this accepts, by its name on the suggestion (M93, ISC-764). */
  readonly suggested?: string;
  readonly bulk?: true;
}

/**
 * One of the five relations between two concepts, set by the researcher
 * (ISC-608).
 *
 * `source` is the passage or answer the relation came from. A relation with no
 * passage behind it is unobserved, which raises a line in "What to look for in
 * the field"; setting the same relation again with a passage settles the line.
 */
export interface ConceptRelationSetEvent extends EventEnvelope {
  readonly type: "concept-relation-set";
  readonly relationId: string;
  readonly from: string;
  readonly to: string;
  readonly relation: ConceptRelation;
  readonly source?: ConceptEvidence;
}

/** The researcher removes a relation (ISC-608). Additive: the relation stays in History. */
export interface ConceptRelationRemovedEvent extends EventEnvelope {
  readonly type: "concept-relation-removed";
  readonly relationId: string;
  readonly reason?: string;
}

/**
 * A statement placed under a concept (ISC-608).
 *
 * Two shapes. An existing claim is named by its page id, and placing it again
 * under another concept moves it: the latest placement wins. A new statement
 * carries its own id and text, in the researcher's words, and the passage or
 * answer it came from when there is one.
 */
export interface StatementAttachedEvent extends EventEnvelope {
  readonly type: "statement-attached";
  readonly conceptId: string;
  readonly pageId?: string;
  readonly statementId?: string;
  readonly text?: string;
  readonly source?: ConceptEvidence;
  readonly bulk?: true;
}

/** What a line in "What to look for in the field" is about. */
/**
 * `residue` joined at the lead's ruling (M63): each part of the account the
 * researcher cannot yet explain (an analytic-residue claim) is a line, raised
 * against the concept its statement sits under, or against none ("") while it is
 * unplaced; `targetId` names the claim.
 */
export type LookForKind = "property" | "relation" | "evidence" | "residue";

export const LOOK_FOR_KINDS: readonly LookForKind[] = ["property", "relation", "evidence", "residue"];

/**
 * A line in "What to look for in the field" (ISC-608, ISC-609).
 *
 * Raised by Abductive when a concept has an undefined property, an unobserved
 * relation, or no passage or answer behind it; `targetId` names the property or
 * the relation. The text is one line saying what to observe or ask next.
 */
export interface LookForRaisedEvent extends EventEnvelope {
  readonly type: "look-for-raised";
  readonly itemId: string;
  readonly conceptId: string;
  readonly kind: LookForKind;
  readonly targetId?: string;
  readonly text: string;
}

/**
 * A line settled (ISC-608): by the researcher, with an optional note of what
 * they saw or heard, or by a later passage, named by its id.
 */
export interface LookForSettledEvent extends EventEnvelope {
  readonly type: "look-for-settled";
  readonly itemId: string;
  readonly by: "researcher" | "passage";
  readonly note?: string;
  readonly chunkId?: string;
}

/** The six things a project needs before data collection (the owner, 2026-09-30). */
export const READINESS_CRITERIA = [
  "puzzle",
  "setting",
  "sample",
  "literatures",
  "venue",
  "concepts",
] as const;

export type ReadinessCriterion = (typeof READINESS_CRITERIA)[number];

export type ReadinessStatus = "fits" | "missing" | "fix-first";

export const READINESS_STATUSES: readonly ReadinessStatus[] = ["fits", "missing", "fix-first"];

export interface ReadinessRow {
  readonly criterion: ReadinessCriterion;
  readonly status: ReadinessStatus;
  readonly sentence: string;
}

export interface ReadinessBias {
  readonly bias: string;
  /** Where Abductive looked, in words. */
  readonly looked: string;
  /** What Abductive saw, in words; empty when nothing fired. */
  readonly saw: string;
}

/**
 * Where a reviewer's question comes from (M80, ISC-685): a row of the report,
 * or a concept or relation card on the ontology tab. The card's name is kept so
 * the question still reads after the card is renamed or removed.
 */
export type ReadinessRef =
  | { readonly kind: "row"; readonly criterion: ReadinessCriterion }
  | { readonly kind: "concept"; readonly id: string; readonly name: string }
  | { readonly kind: "relation"; readonly id: string; readonly name: string };

/** One question a reviewer at the named venue would put to the design (M80, ISC-685). */
export interface ReadinessAsk {
  readonly question: string;
  readonly ref: ReadinessRef;
}

/**
 * One rival account of an accepted relation's pattern (M80, ISC-686), and the
 * observation that tells the two apart: "If X, the rival holds; if Y, yours does."
 */
export interface ReadinessRival {
  readonly relationId: string;
  /** The relation as a sentence, "Booked slot leads to Drive-by help". */
  readonly relation: string;
  readonly rival: string;
  readonly tell: string;
}

/**
 * One bias with a flag (M80, ISC-688): the sentence that Abductive read, why it
 * reads as that bias, and what to do about it.
 */
export interface ReadinessFlaggedBias {
  readonly biasId: string;
  /** The bias's name, "Modal framing". */
  readonly bias: string;
  /** Whose words: Abductive's own, or a pattern across your answers. */
  readonly whose: "abductive" | "yours";
  /** Where Abductive read the words, as a place label: "Site", "Starting point". */
  readonly place?: string;
  /** The sentence that Abductive read, or the pattern in plain words. */
  readonly read: string;
  /** True when `read` quotes words; false when it describes a pattern. */
  readonly quoted: boolean;
  readonly why: string;
  readonly todo: string;
  /** How many other flags Abductive raised for this bias; History keeps them. */
  readonly more: number;
  /** The by-the-book line that the design matched, for Modal framing with a stored twin. */
  readonly byTheBook?: string;
}

/** What a rebuilt section says when it holds nothing (M80): what is missing, or that the run failed. */
export interface ReadinessSectionNotes {
  readonly reviewer?: string;
  readonly rivals?: string;
  readonly argument?: string;
  readonly biases?: string;
}

export interface ReadinessFlag {
  readonly findingId: string;
  readonly rule: string;
  readonly reason: string;
  readonly criterion: ReadinessCriterion;
  readonly station?: string;
  readonly conceptId?: string;
}

/**
 * The readiness report, written whole on a press of "Check readiness"
 * (ISC-608, ISC-611).
 *
 * The report is the event, so History, the export and the tab all read one
 * thing and a later press never rewrites an earlier report. `inputs` names what
 * the run read: how many events, the last of them, and the pass of checks it
 * ran, so a surface can say whether the project has changed since.
 */
export interface ReadinessReportEvent extends EventEnvelope {
  readonly type: "readiness-report";
  readonly verdict: string;
  readonly rows: readonly ReadinessRow[];
  readonly fixFirst: readonly string[];
  readonly reviewerQuestions: readonly string[];
  readonly rivals: readonly string[];
  readonly argument: readonly string[];
  readonly biases: readonly ReadinessBias[];
  readonly flags: readonly ReadinessFlag[];
  /*
   * M80, ISC-685 to ISC-688, additive: the rebuilt sections. A report written
   * before M80 carries none of them; `flagged` (an array, empty or not) is the
   * mark of a report written since. The string arrays above stay filled with
   * the same content as plain lines, for History and older readers.
   */
  readonly asks?: readonly ReadinessAsk[];
  readonly rivalAccounts?: readonly ReadinessRival[];
  readonly readBack?: string;
  readonly flagged?: readonly ReadinessFlaggedBias[];
  readonly sectionNotes?: ReadinessSectionNotes;
  readonly inputs: {
    readonly eventCount: number;
    readonly lastEventId: string;
    readonly checksRunId?: string;
  };
}

/**
 * A flag placed at a concept (ISC-608, ISC-612): a flag from a check whose
 * subject is a statement under that concept, so the card can show it where it
 * arises. Written by Abductive beside the report that found it.
 */
export interface ConceptFlagEvent extends EventEnvelope {
  readonly type: "concept-flag";
  readonly conceptId: string;
  readonly findingId: string;
  readonly rule: string;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// M67: relation cards, and every statement with a home (ISC-631 to ISC-634)
// ---------------------------------------------------------------------------

/**
 * Abductive suggests a relation as a card of its own (ISC-631).
 *
 * The owner, 2026-10-01: "In addition to concepts, there should be
 * relationships as separate cards." A relation suggestion stands where a
 * concept suggestion stands: it waits for Accept, Refine or Reject on its own
 * card. `from` and `to` name a concept in the ontology or one suggested in the
 * same batch, and accepting the relation accepts a suggested end with it.
 *
 * `claim` is one sentence in the researcher's words, with `[...]` where their
 * words never said the thing. `relationId` is minted here and kept on accept,
 * as a concept's id is.
 */
export interface RelationSuggestedEvent extends EventEnvelope {
  readonly type: "relation-suggested";
  readonly relationId: string;
  readonly from: string;
  readonly to: string;
  readonly relation: ConceptRelation;
  readonly claim: string;
  readonly conditions?: string;
  /**
   * The links that the researcher drew between two claims (the claim graph's
   * edge keys, from|role|to) that this relation rests on (the lead's ruling, M67):
   * a contradicts link between two statements is a candidate "contrasts with"
   * between the concepts that hold them, so the proposal is grounded in the
   * record rather than invented.
   */
  readonly grounds?: readonly string[];
  /** Existing claims (page ids) this relation would hold as statements. */
  readonly statementIds: readonly string[];
  /** New statements, in the researcher's words, this relation would hold. */
  readonly statements: readonly string[];
  readonly source: ConceptSource;
  /**
   * M82, ISC-694, additive: the statements or passages the relation rests on,
   * for a relation the Relate concepts pass proposed among accepted concepts.
   * A statement stays where it sits; the relation names it as its ground.
   */
  readonly restsOn?: readonly RelationGround[];
  /** M82, ISC-695, additive: why the relation matters, as on `concept-suggested`. */
  readonly whyItMatters?: string;
  /** M93, ISC-757: the turns it draws on, as on `concept-suggested`. */
  readonly drawnFrom?: readonly string[];
}

/** A statement or a passage that a suggested relation rests on (M82, ISC-694). */
export type RelationGround =
  | { readonly kind: "statement"; readonly statementId: string }
  | { readonly kind: "passage"; readonly chunkId: string };

/**
 * The researcher accepts a suggested relation (ISC-631). The mark is fixed
 * here, as a concept's is. The door writes a `concept-relation-set` beside it
 * with the same id, so every reader of the relations since M63 reads the
 * accepted card as a relation without a second path.
 */
export interface RelationAcceptedEvent extends EventEnvelope {
  readonly type: "relation-accepted";
  readonly relationId: string;
  readonly origin: Exclude<Origin, "literature-derived">;
  /** M93, ISC-764: accepted alone, so its Why it matters line stays suggested. Absent before M93. */
  readonly unbundled?: true;
  readonly bulk?: true;
}

/**
 * The researcher's edit to a relation's kind or claim (ISC-631). Additive: the
 * projection keeps what the relation first said beside the edit.
 */
export interface RelationRefinedEvent extends EventEnvelope {
  readonly type: "relation-refined";
  readonly relationId: string;
  readonly relation?: ConceptRelation;
  readonly claim?: string;
}

/** The researcher rejects a suggested relation, with a reason (ISC-631). */
export interface RelationRejectedEvent extends EventEnvelope {
  readonly type: "relation-rejected";
  readonly relationId: string;
  readonly reason: string;
}

/**
 * The claim sentence of a relation that has none yet (ISC-631): a relation set
 * before M67, or set from a concept card, carries no sentence until the
 * researcher writes one. A later change to the sentence is `relation-refined`.
 */
export interface RelationClaimSetEvent extends EventEnvelope {
  readonly type: "relation-claim-set";
  readonly relationId: string;
  readonly claim: string;
}

/**
 * The conditions under which the researcher expects a relation to hold, in
 * their words (ISC-631). Optional on a relation; an event without
 * `conditions` clears them.
 */
export interface RelationConditionsSetEvent extends EventEnvelope {
  readonly type: "relation-conditions-set";
  readonly relationId: string;
  readonly conditions?: string;
}

/**
 * A statement placed under a relation (ISC-631, ISC-633). The two shapes of
 * `statement-attached`, under a relation instead of a concept. One placement
 * per statement stands: the latest of this event and `statement-attached`.
 */
export interface RelationStatementAttachedEvent extends EventEnvelope {
  readonly type: "relation-statement-attached";
  readonly relationId: string;
  readonly pageId?: string;
  readonly statementId?: string;
  readonly text?: string;
  readonly source?: ConceptEvidence;
  readonly bulk?: true;
}

/** Where Abductive proposes a statement should sit: a concept or a relation, accepted or suggested in the same batch. */
export interface StatementHome {
  readonly kind: "concept" | "relation";
  readonly id: string;
}

/**
 * Abductive proposes a home for each statement that has none (ISC-634).
 *
 * A pending claim from the papers or the rival writer is read too (the lead's
 * ruling, M67): its `statementId` is the proposal's id until the researcher
 * accepts it, and the home is offered on its card in the tray.
 *
 * One event per pass. `read` names every statement the pass read, so a
 * statement that Abductive found no home for is not read again on the next
 * open; `proposals` gives a home to each one that it did. A home may be a
 * concept or relation suggested in the same append.
 */
export interface HomesProposedEvent extends EventEnvelope {
  readonly type: "homes-proposed";
  readonly read: readonly string[];
  readonly proposals: readonly { readonly statementId: string; readonly home: StatementHome }[];
}

/**
 * Abductive suggests a statement, with a proposed home (ISC-633).
 *
 * From M67 every suggested statement arrives with a home: an existing concept
 * or relation, or a concept or relation suggested in the same batch. Accepting
 * it writes one placement event at the home (with the home's acceptance first
 * when the home is itself a suggestion); the researcher can choose another home
 * on the card before accepting. `text` is in the researcher's words.
 */
export interface StatementSuggestedEvent extends EventEnvelope {
  readonly type: "statement-suggested";
  readonly statementId: string;
  readonly text: string;
  readonly home: StatementHome;
  readonly source: ConceptSource;
  /** The passage the statement came from, for a read of the data. */
  readonly chunkId?: string;
  /** M93, ISC-757: the turns it draws on, as on `concept-suggested`. */
  readonly drawnFrom?: readonly string[];
}

/** The researcher rejects a suggested statement, with a reason (ISC-633). */
export interface StatementRejectedEvent extends EventEnvelope {
  readonly type: "statement-rejected";
  readonly statementId: string;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// M82: why a concept or relation matters, and the argument so far (ISC-695)
// ---------------------------------------------------------------------------

/** The card a "Why it matters" line belongs to. */
export interface WhyTarget {
  readonly kind: "concept" | "relation";
  readonly id: string;
}

/**
 * Abductive writes a "Why it matters" line for an accepted card that has none
 * (ISC-695): a card accepted before M82, one the researcher wrote, or one whose
 * suggestion carried no line. The line waits on the card, marked Suggested,
 * until the researcher accepts or refines it. Written by the model, so the
 * envelope carries the model and its version.
 */
export interface WhySuggestedEvent extends EventEnvelope {
  readonly type: "why-suggested";
  readonly target: WhyTarget;
  readonly text: string;
}

/** The researcher accepts the line Abductive wrote, as it stands (ISC-695). */
export interface WhyAcceptedEvent extends EventEnvelope {
  readonly type: "why-accepted";
  readonly target: WhyTarget;
  readonly bulk?: true;
}

/**
 * The researcher rejects the line Abductive wrote (M93, ISC-765), with an
 * optional reason. The card shows no line from Abductive after it, and
 * Abductive does not write one again; the researcher can still write their own.
 */
export interface WhyRejectedEvent extends EventEnvelope {
  readonly type: "why-rejected";
  readonly target: WhyTarget;
  readonly reason?: string;
}

/**
 * The researcher's own words for a card's "Why it matters" line (ISC-695).
 * Additive: the projection keeps the line it replaced, and the card marks the
 * line as the researcher's.
 */
export interface WhyRefinedEvent extends EventEnvelope {
  readonly type: "why-refined";
  readonly target: WhyTarget;
  readonly text: string;
}

/**
 * "The argument so far" at the top of the ontology tab (ISC-695): two to four
 * sentences that Abductive writes from the accepted cards, rewritten after each
 * accept or refine. `basis` is the signature of the cards it was written from,
 * so the tab can tell whether the paragraph still matches the ontology.
 */
export interface ArgumentWrittenEvent extends EventEnvelope {
  readonly type: "argument-written";
  readonly text: string;
  readonly basis: string;
  /**
   * The paragraph waits for the researcher's decision (M93, ISC-762). Set on
   * every paragraph written from M93; the Report carries one only through an
   * `argument-accepted` event. Absent on every older paragraph, which keeps
   * its present effect.
   */
  readonly awaitsDecision?: true;
}

/**
 * The researcher accepts "The argument so far", as Abductive wrote it or in
 * their own words (M93, ISC-762). `text` is what they accepted; `edited` says
 * whether it differs from the paragraph, by comparing the two texts.
 */
export interface ArgumentAcceptedEvent extends EventEnvelope {
  readonly type: "argument-accepted";
  readonly argumentId: string;
  readonly text: string;
  readonly edited: boolean;
}

// ---------------------------------------------------------------------------
// M93: every model output the researcher keeps is a decision on the record
// ---------------------------------------------------------------------------

/**
 * The researcher pressed "Surface concepts and relationships" at a step (M93,
 * ISC-755, ISC-756, ISC-760). One event per press, written by the researcher,
 * before the model-attributed suggestions it produced. `turnIds` names every
 * turn of the step's chat the pass read, both sides, since the last surfacing
 * there; `summaryIds` names the saved summaries it read, by their `bound`
 * events. The suggestions name this event in their source.
 */
export interface SurfacingEvent extends EventEnvelope {
  readonly type: "surfacing";
  /** A station id, or "framing" for Starting point. */
  readonly station: string;
  readonly turnIds: readonly string[];
  readonly summaryIds: readonly string[];
}

/**
 * The researcher accepts Abductive's puzzle reading as the research question,
 * as written or in their own words (M93, ISC-763). Only this event makes a
 * reading written from M93 the research question that the prompts read.
 */
export interface ReadingAcceptedEvent extends EventEnvelope {
  readonly type: "reading-accepted";
  readonly readingId: string;
  readonly text: string;
  readonly edited: boolean;
}

/**
 * The researcher declines a draft (M93, ISC-767): cancels or replaces a summary
 * that Abductive wrote from the chat, or rejects a puzzle reading or "The
 * argument so far". `draftId` is the `brief-draft`, `puzzle-reading` or
 * `argument-written` event.
 */
export interface DraftDeclinedEvent extends EventEnvelope {
  readonly type: "draft-declined";
  readonly draftId: string;
  readonly kind: "brief" | "puzzle-reading" | "argument";
  readonly reason?: string;
}

/** The researcher rejects a property that a concept's suggestion carried (M93, ISC-764). */
export interface PropertyRejectedEvent extends EventEnvelope {
  readonly type: "property-rejected";
  readonly conceptId: string;
  /** The property's name on the suggestion. */
  readonly name: string;
  readonly reason?: string;
}

// ---------------------------------------------------------------------------
// M90: a concept is one noun or gerund (ISC-732, ISC-733)
// ---------------------------------------------------------------------------

/**
 * Abductive left out a concept that the model named with more than one thing in
 * the name ("Introduced founders' longer slots"), after it asked the model once
 * to split the concept and the second answer named more than one thing again,
 * or left the concept out. The suggestion never reached the tray; this event is
 * how the researcher sees that it was there. Written from the model's reply, so
 * the envelope carries the model and its version.
 */
export interface SuggestionDroppedEvent extends EventEnvelope {
  readonly type: "suggestion-dropped";
  /** The name as the model last wrote it. */
  readonly name: string;
  /** Why the guard read the name as more than one thing (`bundleReason`). */
  readonly reason: string;
  readonly source: ConceptSource;
}

export type LedgerEvent =
  | BoundEvent
  | BriefDraftEvent
  | PuzzleReadingEvent
  | ChallengeEvent
  | FlagEvent
  | AttentionEvent
  | ResponseEvent
  | AdjudicationEvent
  | RevealEvent
  | OntologyMutationEvent
  | ProposalEvent
  | ProposalAdjudicationEvent
  | QuestionSelectionEvent
  | RedirectionEvent
  | RefusalEvent
  | DontKnowEvent
  | AskDifferentlyEvent
  | SaturationCheckEvent
  | PuzzleCollapseEvent
  | LintFindingEvent
  | FindingDispositionEvent
  | PaperFitEvent
  | PaperBearingEvent
  | DocumentRemovedEvent
  | BiasScanEvent
  | ExportEvent
  | ConceptSuggestedEvent
  | ConceptAcceptedEvent
  | ConceptRefinedEvent
  | ConceptRejectedEvent
  | ConceptPropertySetEvent
  | ConceptRelationSetEvent
  | ConceptRelationRemovedEvent
  | StatementAttachedEvent
  | LookForRaisedEvent
  | LookForSettledEvent
  | ReadinessReportEvent
  | ConceptFlagEvent
  | RelationSuggestedEvent
  | RelationAcceptedEvent
  | RelationRefinedEvent
  | RelationRejectedEvent
  | RelationClaimSetEvent
  | RelationConditionsSetEvent
  | RelationStatementAttachedEvent
  | HomesProposedEvent
  | StatementSuggestedEvent
  | StatementRejectedEvent
  | ConceptRetiredEvent
  | WhySuggestedEvent
  | WhyAcceptedEvent
  | WhyRefinedEvent
  | ArgumentWrittenEvent
  | SuggestionDroppedEvent
  | WhyRejectedEvent
  | ArgumentAcceptedEvent
  | SurfacingEvent
  | ReadingAcceptedEvent
  | DraftDeclinedEvent
  | PropertyRejectedEvent;

export type LedgerEventType = LedgerEvent["type"];

const EVENT_TYPES: readonly LedgerEventType[] = [
  "bound",
  "brief-draft",
  "puzzle-reading",
  "challenge",
  "flag",
  "attention",
  "response",
  "adjudication",
  "reveal",
  "ontology-mutation",
  "proposal",
  "proposal-adjudication",
  "question-selection",
  "redirection",
  "refusal",
  "dont-know",
  "ask-differently",
  "saturation-check",
  "puzzle-collapse",
  "lint-finding",
  "finding-disposition",
  "paper-fit",
  "paper-bearing",
  "document-removed",
  "bias-scan",
  "export",
  "concept-suggested",
  "concept-accepted",
  "concept-refined",
  "concept-rejected",
  "concept-property-set",
  "concept-relation-set",
  "concept-relation-removed",
  "statement-attached",
  "look-for-raised",
  "look-for-settled",
  "readiness-report",
  "concept-flag",
  "relation-suggested",
  "relation-accepted",
  "relation-refined",
  "relation-rejected",
  "relation-claim-set",
  "relation-conditions-set",
  "relation-statement-attached",
  "homes-proposed",
  "statement-suggested",
  "statement-rejected",
  "concept-retired",
  "why-suggested",
  "why-accepted",
  "why-refined",
  "argument-written",
  "suggestion-dropped",
  "why-rejected",
  "argument-accepted",
  "surfacing",
  "reading-accepted",
  "draft-declined",
  "property-rejected",
];

const VERDICTS: readonly Verdict[] = ["accept", "revise", "reject", "defer", "ignored"];
const PAPER_FIT_VERDICTS: readonly PaperFitEvent["verdict"][] = ["fits", "unclear", "misfit"];
const ATTENTION_LAYERS: readonly AttentionLayer[] = ["retrieval", "citation", "human"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPersonaActor(actor: string): actor is `persona:${string}` {
  return actor.startsWith("persona:") && actor.length > "persona:".length;
}

function isValidActor(actor: string): actor is Actor {
  return actor === "human" || actor === "system" || isPersonaActor(actor);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * The baselines on a `paper-fit` event, checked field by field (M33).
 *
 * Absent is legal and is the state of every event written before the field
 * existed. Present and not an array is a writer bug and says so. Each entry
 * needs all three of its parts: an id nothing can be keyed on, an expectation
 * with no sentence in it, or a scope with no clause is a row the researcher
 * would be asked to answer against and could not read.
 */
function baselineErrors(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return ["paper-fit.baselines must be an array when present"];
  const errors: string[] = [];
  value.forEach((entry, i) => {
    const b = entry as Record<string, unknown> | null;
    if (b === null || typeof b !== "object") {
      errors.push(`paper-fit.baselines[${i}] must be an object`);
      return;
    }
    if (!isNonEmptyString(b.id)) errors.push(`paper-fit.baselines[${i}].id must be non-empty`);
    if (!isNonEmptyString(b.expectation)) {
      errors.push(`paper-fit.baselines[${i}].expectation must be non-empty`);
    }
    if (!isNonEmptyString(b.scope)) {
      errors.push(`paper-fit.baselines[${i}].scope must be non-empty`);
    }
    /* A citation is optional and a blank one is not the same as none: a page
     * carrying an empty passage id cites something that cannot be resolved. */
    if (b.chunkId !== undefined && !isNonEmptyString(b.chunkId)) {
      errors.push(`paper-fit.baselines[${i}].chunkId must be non-empty when present`);
    }
  });
  return errors;
}

/**
 * The sources on a `puzzle-reading`, entry by entry (M40).
 *
 * Each one is refused rather than repaired, for the reason a malformed baseline
 * is: a source naming neither a subject nor a passage is a citation that cannot
 * be resolved, and a reading whose provenance cannot be followed is exactly the
 * thing this event exists to prevent.
 */
function puzzleSourceErrors(value: readonly unknown[]): string[] {
  const errors: string[] = [];
  value.forEach((entry, i) => {
    const s = entry as Record<string, unknown> | null;
    if (s === null || typeof s !== "object") {
      errors.push(`puzzle-reading.sources[${i}] must be an object`);
      return;
    }
    if (s.kind === "answer") {
      if (!isNonEmptyString(s.subject)) {
        errors.push(`puzzle-reading.sources[${i}].subject must name what it read`);
      }
      return;
    }
    if (s.kind === "passage") {
      if (!isNonEmptyString(s.chunkId)) {
        errors.push(`puzzle-reading.sources[${i}].chunkId must name a passage`);
      }
      return;
    }
    errors.push(`puzzle-reading.sources[${i}].kind must be "answer" or "passage"`);
  });
  return errors;
}

/**
 * Validate a candidate ledger event. Returns a list of human-readable errors;
 * an empty array means the event is valid.
 *
 * Enforces (among envelope/payload checks) that persona-actor events carry
 * `model` and `modelVersion` (ISC-5).
 */
export function validateEvent(candidate: unknown): string[] {
  const errors: string[] = [];
  if (typeof candidate !== "object" || candidate === null) {
    return ["event must be an object"];
  }
  const e = candidate as Record<string, unknown>;

  // Envelope
  if (!isNonEmptyString(e.id) || !UUID_RE.test(e.id)) {
    errors.push("id must be a UUID string");
  }
  if (typeof e.ts !== "number" || !Number.isFinite(e.ts) || e.ts <= 0) {
    errors.push("ts must be a positive finite number (epoch ms)");
  }
  if (!isNonEmptyString(e.actor) || !isValidActor(e.actor)) {
    errors.push("actor must be 'human', 'system', or 'persona:<name>'");
  }
  if (!isNonEmptyString(e.projectId)) {
    errors.push("projectId must be a non-empty string");
  }

  // Inference provenance (ISC-5)
  if (isNonEmptyString(e.actor) && isPersonaActor(e.actor)) {
    if (!isNonEmptyString(e.model)) {
      errors.push("persona-actor events require a non-empty 'model'");
    }
    if (!isNonEmptyString(e.modelVersion)) {
      errors.push("persona-actor events require a non-empty 'modelVersion'");
    }
  }

  if (e.provider !== undefined && !isProvider(e.provider)) {
    errors.push(`provider must be one of ${PROVIDERS.join(", ")}, or a service's host, when present`);
  }
  if (e.server !== undefined) {
    if (e.provider !== "local") errors.push('server is recorded only beside provider "local"');
    if (typeof e.server !== "string" || e.server === "" || e.server.length > 40) {
      errors.push("server must be a non-empty name of at most 40 characters");
    }
  }
  if (e.voiceRetry !== undefined && e.voiceRetry !== true) {
    errors.push("voiceRetry is true when present");
  }
  if (e.splitRetry !== undefined && e.splitRetry !== true) {
    errors.push("splitRetry is true when present");
  }

  // Variant payloads
  const type = e.type;
  if (!isNonEmptyString(type) || !EVENT_TYPES.includes(type as LedgerEventType)) {
    errors.push(`type must be one of: ${EVENT_TYPES.join(", ")}`);
    return errors;
  }

  switch (type as LedgerEventType) {
    case "bound":
      if (!isNonEmptyString(e.subject)) errors.push("bound.subject must be non-empty");
      if (!isNonEmptyString(e.statement)) errors.push("bound.statement must be non-empty");
      // Absent is the ordinary case and means the box was typed into. Present
      // and empty would be a writer claiming a provenance it cannot name.
      if (e.draftedFrom !== undefined && !isNonEmptyString(e.draftedFrom)) {
        errors.push("bound.draftedFrom must name a draft when present");
      }
      /* M93, ISC-767: whether the draft was changed is said only of a draft. */
      if (e.edited !== undefined) {
        if (typeof e.edited !== "boolean") errors.push("bound.edited must be true or false when present");
        if (e.draftedFrom === undefined) errors.push("bound.edited belongs only beside draftedFrom");
      }
      break;
    case "brief-draft":
      if (!isNonEmptyString(e.station)) {
        errors.push("brief-draft.station must name a step or the framing");
      }
      if (!isNonEmptyString(e.text)) errors.push("brief-draft.text must be non-empty");
      if (e.field !== undefined && !isNonEmptyString(e.field)) {
        errors.push("brief-draft.field must name a Starting point answer when present");
      }
      // The turns it was made from are what make "only your words" checkable,
      // so an unsourced draft is refused rather than stored.
      if (!Array.isArray(e.fromTurnIds)) {
        errors.push("brief-draft.fromTurnIds must be an array");
      } else if (e.fromTurnIds.length === 0) {
        errors.push("brief-draft.fromTurnIds must name at least one turn of yours");
      }
      break;
    case "puzzle-reading":
      /* An empty `text` is legal and is the case this event was built to record:
       * the tool read what was saved and found no expectation, or nothing that
       * cut against one. What is refused is a reading that says neither — no
       * puzzle and no reason is a row a reader cannot act on or argue with. */
      if (typeof e.text !== "string") {
        errors.push("puzzle-reading.text must be a string");
      } else if (e.text.trim() === "" && !isNonEmptyString(e.none)) {
        errors.push("puzzle-reading.none must say why when no puzzle was read");
      }
      if (e.none !== undefined && !isNonEmptyString(e.none)) {
        errors.push("puzzle-reading.none must be non-empty when present");
      }
      /* The sources are what make "the tool's reading of what you saved" a claim
       * anyone can check, the same way `brief-draft.fromTurnIds` is. A reading
       * of nothing is not a reading. */
      if (!Array.isArray(e.sources)) {
        errors.push("puzzle-reading.sources must be an array");
      } else if (e.sources.length === 0) {
        errors.push("puzzle-reading.sources must name what it read");
      } else {
        errors.push(...puzzleSourceErrors(e.sources));
      }
      if (typeof e.digest !== "string") {
        errors.push("puzzle-reading.digest must be a string");
      }
      if (e.awaitsDecision !== undefined && e.awaitsDecision !== true) {
        errors.push("puzzle-reading.awaitsDecision is true when present");
      }
      break;
    case "challenge":
      if (!isNonEmptyString(e.text)) errors.push("challenge.text must be non-empty");
      break;
    case "flag":
      if (!isNonEmptyString(e.matrixCell)) errors.push("flag.matrixCell must be non-empty");
      if (!isNonEmptyString(e.reason)) errors.push("flag.reason must be non-empty (ISC-11)");
      break;
    case "bias-scan":
      if (!isNonEmptyString(e.station)) errors.push("bias-scan.station must be non-empty");
      if (!isNonEmptyString(e.stage)) errors.push("bias-scan.stage must be non-empty");
      /* The digest is what a later save compares against, so an empty one would
       * make every re-save a fresh run and the dedupe silently inert. */
      if (!isNonEmptyString(e.digest)) errors.push("bias-scan.digest must be non-empty");
      if (!Array.isArray(e.firedCells)) {
        errors.push("bias-scan.firedCells must be an array");
      } else if (!(e.firedCells as unknown[]).every((c) => isNonEmptyString(c))) {
        errors.push("bias-scan.firedCells must name cells");
      }
      if (e.reads !== undefined && e.reads !== "abductive") errors.push('bias-scan.reads must be "abductive" when present');
      if (e.read !== undefined && (!Array.isArray(e.read) || !(e.read as unknown[]).every((k) => isNonEmptyString(k)))) {
        errors.push("bias-scan.read must name the kinds of words read");
      }
      break;
    case "attention":
      if (!ATTENTION_LAYERS.includes(e.layer as AttentionLayer)) {
        errors.push(`attention.layer must be one of: ${ATTENTION_LAYERS.join(", ")}`);
      }
      if (!isNonEmptyString(e.chunkId)) errors.push("attention.chunkId must be non-empty");
      break;
    case "response":
      if (!isNonEmptyString(e.text)) errors.push("response.text must be non-empty");
      if (e.station !== undefined && !isNonEmptyString(e.station)) {
        errors.push("response.station must name a place when present");
      }
      // Only the tool's own turns are scanned on the way out, so a leak list on
      // a human turn would be the tool marking the researcher's own words.
      if (e.cutShort !== undefined) {
        if (e.cutShort !== true) errors.push("response.cutShort must be true when present");
        else if (e.actor === "human") errors.push("response.cutShort belongs on the tool's turns, not yours");
      }
      if (e.answerLeaks !== undefined) {
        if (!Array.isArray(e.answerLeaks)) {
          errors.push("response.answerLeaks must be an array");
        } else if (e.actor === "human") {
          errors.push("response.answerLeaks belongs on the tool's turns, not yours");
        }
      }
      break;
    case "adjudication":
      if (!VERDICTS.includes(e.verdict as Verdict)) {
        errors.push(`adjudication.verdict must be one of: ${VERDICTS.join(", ")}`);
      }
      if (!isNonEmptyString(e.challengeId)) {
        errors.push("adjudication.challengeId must be non-empty");
      }
      break;
    case "reveal":
      if (!isNonEmptyString(e.subject)) errors.push("reveal.subject must be non-empty");
      if (e.via !== "stage-gate" && e.via !== "on-demand") {
        errors.push("reveal.via must be 'stage-gate' or 'on-demand'");
      }
      break;
    case "ontology-mutation":
      errors.push(...validateOntologyMutation(e));
      break;
    case "lint-finding":
      if (!isNonEmptyString(e.rule)) errors.push("lint-finding.rule must be non-empty");
      if (!isNonEmptyString(e.reason)) errors.push("lint-finding.reason must be non-empty");
      if (!isNonEmptyString(e.targetKind)) errors.push("lint-finding.targetKind must be non-empty");
      if (typeof e.targetId !== "string") errors.push("lint-finding.targetId must be a string");
      break;
    case "finding-disposition": {
      if (!isNonEmptyString(e.findingId)) {
        errors.push("finding-disposition.findingId must be non-empty");
      }
      const d = e.disposition;
      if (d !== "acknowledged" && d !== "not-applicable") {
        errors.push("finding-disposition.disposition must be acknowledged or not-applicable");
      }
      if (d === "not-applicable" && !isNonEmptyString(e.reason)) {
        errors.push("finding-disposition 'not-applicable' requires a reason");
      }
      break;
    }
    case "proposal":
      if (!isNonEmptyString(e.proposalId)) errors.push("proposal.proposalId must be non-empty");
      if (!isNonEmptyString(e.title)) errors.push("proposal.title must be non-empty");
      if (e.pageType !== undefined && !PAGE_TYPES.includes(e.pageType as PageType)) {
        errors.push(`proposal.pageType must be one of: ${PAGE_TYPES.join(", ")}`);
      }
      if (e.pageType === undefined && e.edge === undefined) {
        errors.push("proposal must carry either a pageType or an edge");
      }
      if (!Array.isArray(e.sourceChunks)) {
        errors.push("proposal.sourceChunks must be an array");
      }
      errors.push(...validateProposalFraming(e));
      break;
    case "proposal-adjudication": {
      if (!isNonEmptyString(e.proposalId)) {
        errors.push("proposal-adjudication.proposalId must be non-empty");
      }
      const dispositions = ["accept", "reject", "merge", "defer"];
      if (!dispositions.includes(e.disposition as string)) {
        errors.push(`proposal-adjudication.disposition must be one of: ${dispositions.join(", ")}`);
      }
      // Rejections are retained as signal, so the reason is what makes them useful.
      if (
        (e.disposition === "reject" || e.disposition === "merge") &&
        !isNonEmptyString(e.reason)
      ) {
        errors.push("proposal-adjudication.reason is required on reject and merge");
      }
      if (e.disposition === "merge" && !isNonEmptyString(e.mergedInto)) {
        errors.push("proposal-adjudication.mergedInto is required on merge");
      }
      break;
    }
    case "question-selection":
      if (!isNonEmptyString(e.moveId)) errors.push("question-selection.moveId must be non-empty");
      if (!isNonEmptyString(e.topic)) errors.push("question-selection.topic must be non-empty");
      if (!isNonEmptyString(e.question)) {
        errors.push("question-selection.question must be non-empty (the record is the question asked)");
      }
      if (!Array.isArray(e.alternatives)) {
        errors.push("question-selection.alternatives must be an array");
      }
      if (e.mode !== "interrogation" && e.mode !== "guidance") {
        errors.push("question-selection.mode must be 'interrogation' or 'guidance'");
      }
      // Choosing what to ask is a bounding move; an unreasoned choice is unauditable.
      if (!isNonEmptyString(e.reason)) {
        errors.push("question-selection.reason must be non-empty (selection is a bounding move)");
      }
      break;
    case "redirection":
      if (!isNonEmptyString(e.toTopic)) errors.push("redirection.toTopic must be non-empty");
      break;
    case "dont-know":
      if (!isNonEmptyString(e.questionEventId)) errors.push("dont-know.questionEventId must be non-empty");
      break;
    case "ask-differently":
      if (!isNonEmptyString(e.station)) errors.push("ask-differently.station must be non-empty");
      if (e.questionEventId !== undefined && !isNonEmptyString(e.questionEventId)) {
        errors.push("ask-differently.questionEventId must be non-empty when present");
      }
      break;
    case "refusal": {
      if (!isNonEmptyString(e.questionEventId)) {
        errors.push("refusal.questionEventId must be non-empty");
      }
      const kinds = ["dont-know", "not-now", "wont-answer"];
      if (!kinds.includes(e.kind as string)) {
        errors.push(`refusal.kind must be one of: ${kinds.join(", ")}`);
      }
      /* Who set the question aside (D9). Refused rather than ignored when it is
       * a word nobody renders: a surface reading an unknown value would fall
       * through to the researcher's own decline, which is the attribution this
       * field exists to keep off the record. */
      if (
        e.setAsideFor !== undefined &&
        !(SET_ASIDE_REASONS as readonly string[]).includes(e.setAsideFor as string)
      ) {
        errors.push(
          `refusal.setAsideFor must be one of: ${SET_ASIDE_REASONS.join(", ")} when present`,
        );
      }
      /* The tool sets a question aside as "not now" and never as a thing the
       * researcher knows or will not say, so a `dont-know` carrying a reason
       * would be two accounts of one turn. */
      if (e.setAsideFor !== undefined && e.kind !== "not-now") {
        errors.push("refusal.setAsideFor is only written on a 'not-now' refusal");
      }
      break;
    }
    case "saturation-check":
      if (typeof e.mutationsInWindow !== "number" || e.mutationsInWindow < 0) {
        errors.push("saturation-check.mutationsInWindow must be a non-negative number");
      }
      if (typeof e.windowTurns !== "number" || e.windowTurns <= 0) {
        errors.push("saturation-check.windowTurns must be a positive number");
      }
      if (typeof e.reached !== "boolean") {
        errors.push("saturation-check.reached must be a boolean");
      }
      break;
    case "puzzle-collapse":
      if (!Array.isArray(e.keptPuzzleIds) || e.keptPuzzleIds.length === 0) {
        errors.push("puzzle-collapse.keptPuzzleIds must be a non-empty array");
      }
      if (!Array.isArray(e.supersededPuzzleIds) || e.supersededPuzzleIds.length === 0) {
        errors.push("puzzle-collapse.supersededPuzzleIds must be a non-empty array");
      }
      if (!isNonEmptyString(e.reason)) {
        errors.push("puzzle-collapse.reason must be non-empty");
      }
      break;
    case "document-removed": {
      if (!isNonEmptyString(e.documentId)) {
        errors.push("document-removed.documentId must be non-empty");
      }
      if (!isNonEmptyString(e.documentName)) {
        errors.push("document-removed.documentName must be non-empty");
      }
      if (!isNonEmptyString(e.documentKind)) {
        errors.push("document-removed.documentKind must be non-empty");
      }
      if (typeof e.passageCount !== "number" || e.passageCount < 0) {
        errors.push("document-removed.passageCount must be a number of zero or more");
      }
      if (!Array.isArray(e.passageIds)) {
        errors.push("document-removed.passageIds must be an array");
      } else if (e.passageIds.length !== e.passageCount) {
        errors.push("document-removed.passageCount must match the number of passageIds");
      }
      if (e.reason !== undefined && !isNonEmptyString(e.reason)) {
        errors.push("document-removed.reason must be non-empty when present");
      }
      break;
    }
    case "paper-fit": {
      if (!isNonEmptyString(e.paperKey)) errors.push("paper-fit.paperKey must be non-empty");
      if (!isNonEmptyString(e.paperName)) errors.push("paper-fit.paperName must be non-empty");
      if (!PAPER_FIT_VERDICTS.includes(e.verdict as PaperFitEvent["verdict"])) {
        errors.push(`paper-fit.verdict must be one of: ${PAPER_FIT_VERDICTS.join(", ")}`);
      }
      // The reason may be empty: `unclear` often arrives without one, and an
      // invented sentence would be worse than none.
      if (typeof e.reason !== "string") errors.push("paper-fit.reason must be a string");
      if (typeof e.framingDigest !== "string") {
        errors.push("paper-fit.framingDigest must be a string");
      }
      errors.push(...baselineErrors(e.baselines));
      if (e.bearing !== undefined && !isNonEmptyString(e.bearing)) {
        errors.push("paper-fit.bearing must be non-empty when present");
      }
      break;
    }
    case "paper-bearing": {
      if (!isNonEmptyString(e.paperKey)) errors.push("paper-bearing.paperKey must be non-empty");
      if (!isNonEmptyString(e.paperName)) errors.push("paper-bearing.paperName must be non-empty");
      /* Non-empty, unlike `paper-fit.reason`. A verdict with no sentence behind
       * it is a model saying little; a bearing with no sentence is a researcher
       * who wrote nothing, and nothing is what the question already means. */
      if (!isNonEmptyString(e.reason)) errors.push("paper-bearing.reason must be non-empty");
      /* M93, ISC-768: the judge's sentence the box began as, and whether it changed. */
      if (e.startedFrom !== undefined && !isNonEmptyString(e.startedFrom)) {
        errors.push("paper-bearing.startedFrom must name the paper-fit event when present");
      }
      if (e.edited !== undefined) {
        if (typeof e.edited !== "boolean") errors.push("paper-bearing.edited must be true or false when present");
        if (e.startedFrom === undefined) errors.push("paper-bearing.edited belongs only beside startedFrom");
      }
      break;
    }
    case "concept-suggested":
    case "concept-accepted":
    case "concept-refined":
    case "concept-rejected":
    case "concept-property-set":
    case "concept-relation-set":
    case "concept-relation-removed":
    case "statement-attached":
    case "look-for-raised":
    case "look-for-settled":
    case "readiness-report":
    case "concept-flag":
    case "relation-suggested":
    case "relation-accepted":
    case "relation-refined":
    case "relation-rejected":
    case "relation-claim-set":
    case "relation-conditions-set":
    case "relation-statement-attached":
    case "homes-proposed":
    case "statement-suggested":
    case "statement-rejected":
    case "concept-retired":
    case "why-suggested":
    case "why-accepted":
    case "why-refined":
    case "argument-written":
    case "suggestion-dropped":
    case "why-rejected":
    case "argument-accepted":
    case "property-rejected":
      errors.push(...validateConceptEvent(e));
      break;
    /* M93, ISC-756, ISC-760: the press of Surface concepts and relationships. */
    case "surfacing":
      if (!isNonEmptyString(e.station)) errors.push("surfacing.station must name a step or the framing");
      errors.push(...stringArrayErrors(e.turnIds, "surfacing.turnIds"));
      errors.push(...stringArrayErrors(e.summaryIds, "surfacing.summaryIds"));
      if (Array.isArray(e.turnIds) && e.turnIds.length === 0) errors.push("surfacing.turnIds must name at least one turn");
      if (e.actor !== "human") errors.push("surfacing is the researcher's press");
      break;
    /* M93, ISC-763. */
    case "reading-accepted":
      if (!isNonEmptyString(e.readingId)) errors.push("reading-accepted.readingId must name the reading");
      if (!isNonEmptyString(e.text)) errors.push("reading-accepted.text must be non-empty");
      if (typeof e.edited !== "boolean") errors.push("reading-accepted.edited must be true or false");
      if (e.actor !== "human") errors.push("reading-accepted is the researcher's decision");
      break;
    /* M93, ISC-767. */
    case "draft-declined":
      if (!isNonEmptyString(e.draftId)) errors.push("draft-declined.draftId must name the draft");
      if (e.kind !== "brief" && e.kind !== "puzzle-reading" && e.kind !== "argument") {
        errors.push('draft-declined.kind must be "brief", "puzzle-reading" or "argument"');
      }
      if (e.reason !== undefined && !isNonEmptyString(e.reason)) errors.push("draft-declined.reason must be non-empty when present");
      if (e.actor !== "human") errors.push("draft-declined is the researcher's decision");
      break;
    case "export":
      if (!isNonEmptyString(e.artefact)) {
        errors.push("export.artefact must be non-empty (the receipt names the file)");
      }
      if (typeof e.bytes !== "number" || !Number.isFinite(e.bytes) || e.bytes < 0) {
        errors.push("export.bytes must be a non-negative finite number");
      }
      // The stamp is the whole point of the row. A receipt that cannot say
      // which state of the design the file came from is a timestamp.
      if (!isNonEmptyString(e.stamp)) {
        errors.push("export.stamp must be non-empty (a receipt without a stamp is a timestamp)");
      }
      if (typeof e.designEvents !== "number" || e.designEvents < 0) {
        errors.push("export.designEvents must be a non-negative number");
      }
      break;
  }

  return errors;
}

/**
 * The two M29 fields on a proposal, checked where the mutation's twins are.
 *
 * Split out so the proposal case stays readable and so the rules sit beside
 * each other: the same two conditions are asserted on the mutation below, and
 * an accept turns one into the other. A proposal that could not become a valid
 * mutation is a proposal the tray would offer and the door would refuse.
 */
function validateProposalFraming(e: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const edgeRole = (e.edge as Record<string, unknown> | undefined)?.role;

  /* Only the paper reader writes this, and it only writes theory drafts (M30).
   *
   * Refused elsewhere rather than ignored, on the same argument
   * `originOnAccept` is refused elsewhere: a field that says which paper a
   * claim came out of, sitting on a claim that came out of an interview
   * answer, would put a false provenance on the record that no surface could
   * tell from a true one. */
  if (e.framingDigest !== undefined && typeof e.framingDigest !== "string") {
    errors.push("proposal.framingDigest must be a string when present");
  }

  if (e.paperKey !== undefined) {
    if (!isNonEmptyString(e.paperKey)) {
      errors.push("proposal.paperKey must be non-empty when present");
    }
    if (e.pageType !== "theory") {
      errors.push("proposal.paperKey is only for theory pages");
    }
  }

  if (e.puzzleRelation !== undefined) {
    if (!PUZZLE_RELATIONS.includes(e.puzzleRelation as PuzzleRelation)) {
      errors.push(`proposal.puzzleRelation must be one of: ${PUZZLE_RELATIONS.join(", ")}`);
    }
    if (edgeRole !== "stands-to") {
      errors.push("proposal.puzzleRelation requires edge.role 'stands-to'");
    }
  } else if (edgeRole === "stands-to") {
    errors.push("edge.role 'stands-to' requires a puzzleRelation naming which claim is made");
  }

  if (e.originOnAccept !== undefined) {
    const stampable = ["literature-derived", "author-prior", "data-driven"];
    if (!stampable.includes(e.originOnAccept as string)) {
      errors.push(`proposal.originOnAccept must be one of: ${stampable.join(", ")}`);
    }
    /* D30 (M43c). A claim from the data has to cite the data, or the stamp is an
     * assertion about material nobody read. And it is never an expectation: an
     * expectation a study breaks is a claim somebody held before the study
     * looked, so a theory page read out of the researcher's own transcript would
     * let the study break its own reading of its own material.
     * `extract.ts`'s `dataPageType` already refuses to draft one; this is the
     * second gate, on the same reasoning `expectationsOnOffer` gives for being
     * the third. */
    if (e.originOnAccept === "data-driven") {
      if (!Array.isArray(e.sourceChunks) || e.sourceChunks.length === 0) {
        errors.push("proposal.originOnAccept 'data-driven' requires a cited passage");
      }
      if (e.pageType === "theory") {
        errors.push("proposal.originOnAccept 'data-driven' does not apply to a theory page");
      }
    }
    // The same boundary the mutation keeps, kept one step earlier: a draft that
    // would stamp a paper's expectation onto an observation never reaches the
    // tray, so the researcher is never offered a button that cannot be pressed.
    if (e.originOnAccept === "literature-derived" && e.pageType !== "theory") {
      errors.push("proposal.originOnAccept 'literature-derived' is only for theory pages");
    }
    if (e.originOnAccept === "author-prior" && edgeRole !== "stands-to") {
      errors.push("proposal.originOnAccept 'author-prior' is only for a stands-to relation");
    }
  }

  const link = e.linkOnAccept as Record<string, unknown> | undefined;
  if (link !== undefined) {
    if (!isNonEmptyString(link.to)) {
      errors.push("proposal.linkOnAccept.to must name the page the link runs to");
    }
    if (!EDGE_ROLES.includes(link.role as EdgeRole)) {
      errors.push(`proposal.linkOnAccept.role must be one of: ${EDGE_ROLES.join(", ")}`);
    }
    // The link runs FROM the page this proposal creates, so there has to be one.
    if (e.edge !== undefined) {
      errors.push("proposal.linkOnAccept is for a proposal that creates a page, not one that draws a link");
    }
    // `stands-to` owes a puzzleRelation and this field has nowhere to carry one.
    if (link.role === "stands-to") {
      errors.push("proposal.linkOnAccept.role 'stands-to' is not allowed: that link owes a puzzleRelation");
    }
  }

  return errors;
}

function stringArrayErrors(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) return [`${name} must be an array`];
  return value.every((v) => isNonEmptyString(v)) ? [] : [`${name} must hold non-empty strings`];
}

function evidenceErrors(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  const v = value as Record<string, unknown> | null;
  if (v === null || typeof v !== "object") return [`${name} must be an object when present`];
  if (v.kind === "passage") return isNonEmptyString(v.chunkId) ? [] : [`${name}.chunkId must name a passage`];
  if (v.kind === "answer") return isNonEmptyString(v.subject) ? [] : [`${name}.subject must name a step`];
  return [`${name}.kind must be "passage" or "answer"`];
}

/**
 * The M63 events (ISC-608). Split out for readability, as the ontology
 * mutation's rules are. Every rule here is one a writer could break and a
 * reader would then have to guess around: a rejection with no reason, a
 * relation outside the five, a suggestion with no name, a report with no
 * verdict.
 */
function validateConceptEvent(e: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const type = e.type as string;
  const needConcept = () => {
    if (!isNonEmptyString(e.conceptId)) errors.push(`${type}.conceptId must be non-empty`);
  };
  const needRelation = () => {
    if (!isNonEmptyString(e.relationId)) errors.push(`${type}.relationId must be non-empty`);
  };
  switch (type) {
    case "concept-suggested": {
      needConcept();
      if (!isNonEmptyString(e.name)) errors.push("concept-suggested.name must be non-empty");
      if (!isNonEmptyString(e.definition)) errors.push("concept-suggested.definition must be non-empty");
      errors.push(...stringArrayErrors(e.properties, "concept-suggested.properties"));
      errors.push(...stringArrayErrors(e.statementIds, "concept-suggested.statementIds"));
      errors.push(...stringArrayErrors(e.statements, "concept-suggested.statements"));
      if (!Array.isArray(e.relations)) {
        errors.push("concept-suggested.relations must be an array");
      } else {
        (e.relations as unknown[]).forEach((r, i) => {
          const rel = r as Record<string, unknown> | null;
          if (rel === null || typeof rel !== "object" || !isNonEmptyString(rel.to)) {
            errors.push(`concept-suggested.relations[${i}].to must name a concept`);
          } else if (!CONCEPT_RELATIONS.includes(rel.relation as ConceptRelation)) {
            errors.push(`concept-suggested.relations[${i}].relation must be one of: ${CONCEPT_RELATIONS.join(", ")}`);
          }
        });
      }
      const src = e.source as Record<string, unknown> | null | undefined;
      if (src === null || typeof src !== "object") {
        errors.push("concept-suggested.source must name what the suggestion was made from");
      } else if (src.kind === "summary") {
        if (!isNonEmptyString(src.station)) errors.push("concept-suggested.source.station must name a step");
      } else if (src.kind === "data") {
        errors.push(...stringArrayErrors(src.chunkIds, "concept-suggested.source.chunkIds"));
      } else if (src.kind === "chat") {
        errors.push(...chatSourceErrors(src, "concept-suggested.source"));
      } else if (src.kind !== "grouping") {
        errors.push('concept-suggested.source.kind must be "summary", "data", "grouping" or "chat"');
      }
      errors.push(...drawnFromErrors(e, "concept-suggested"));
      if (e.whyItMatters !== undefined && !isNonEmptyString(e.whyItMatters)) {
        errors.push("concept-suggested.whyItMatters must be non-empty when present");
      }
      // A suggestion is Abductive's act. A researcher who writes a concept
      // accepts it in the same breath, on `concept-accepted`.
      if (e.actor === "human") errors.push("concept-suggested is Abductive's suggestion and takes Abductive as its actor");
      break;
    }
    case "concept-accepted": {
      needConcept();
      const origins = ["author-prior", "data-driven", "model-proposed"];
      if (!origins.includes(e.origin as string)) {
        errors.push(`concept-accepted.origin must be one of: ${origins.join(", ")}`);
      }
      if (e.name !== undefined && !isNonEmptyString(e.name)) errors.push("concept-accepted.name must be non-empty when present");
      if (e.definition !== undefined && !isNonEmptyString(e.definition)) {
        errors.push("concept-accepted.definition must be non-empty when present");
      }
      if (e.origin === "author-prior" && !isNonEmptyString(e.name)) {
        errors.push("concept-accepted with author-prior is the researcher's own concept and names it");
      }
      if (e.actor !== "human") errors.push("concept-accepted is the researcher's decision");
      if (e.unbundled !== undefined && e.unbundled !== true) errors.push("concept-accepted.unbundled is true when present");
      errors.push(...bulkErrors(e, type));
      break;
    }
    case "concept-refined":
      needConcept();
      if (e.name === undefined && e.definition === undefined) {
        errors.push("concept-refined must change the name or the definition");
      }
      if (e.name !== undefined && !isNonEmptyString(e.name)) errors.push("concept-refined.name must be non-empty when present");
      if (e.definition !== undefined && !isNonEmptyString(e.definition)) {
        errors.push("concept-refined.definition must be non-empty when present");
      }
      if (e.actor !== "human") errors.push("concept-refined is the researcher's edit");
      break;
    case "concept-rejected":
      needConcept();
      if (!isNonEmptyString(e.reason)) errors.push("concept-rejected.reason is required");
      if (e.actor !== "human") errors.push("concept-rejected is the researcher's decision");
      break;
    case "concept-property-set":
      needConcept();
      if (!isNonEmptyString(e.propertyId)) errors.push("concept-property-set.propertyId must be non-empty");
      if (!isNonEmptyString(e.name)) errors.push("concept-property-set.name must be non-empty");
      if (e.varies !== undefined && !isNonEmptyString(e.varies)) {
        errors.push("concept-property-set.varies must be non-empty when present");
      }
      if (e.removed !== undefined && e.removed !== true) errors.push("concept-property-set.removed must be true when present");
      if (e.suggested !== undefined && !isNonEmptyString(e.suggested)) {
        errors.push("concept-property-set.suggested must name the suggested property when present");
      }
      errors.push(...bulkErrors(e, type));
      break;
    case "concept-relation-set":
      if (!isNonEmptyString(e.relationId)) errors.push("concept-relation-set.relationId must be non-empty");
      if (!isNonEmptyString(e.from)) errors.push("concept-relation-set.from must name a concept");
      if (!isNonEmptyString(e.to)) errors.push("concept-relation-set.to must name a concept");
      if (isNonEmptyString(e.from) && e.from === e.to) errors.push("concept-relation-set joins two different concepts");
      if (!CONCEPT_RELATIONS.includes(e.relation as ConceptRelation)) {
        errors.push(`concept-relation-set.relation must be one of: ${CONCEPT_RELATIONS.join(", ")}`);
      }
      errors.push(...evidenceErrors(e.source, "concept-relation-set.source"));
      break;
    case "concept-relation-removed":
      if (!isNonEmptyString(e.relationId)) errors.push("concept-relation-removed.relationId must be non-empty");
      if (e.reason !== undefined && !isNonEmptyString(e.reason)) {
        errors.push("concept-relation-removed.reason must be non-empty when present");
      }
      break;
    case "statement-attached": {
      needConcept();
      const claim = e.pageId !== undefined;
      const fresh = e.statementId !== undefined || e.text !== undefined;
      if (claim === fresh) errors.push("statement-attached names an existing claim or carries a new statement, one of the two");
      if (claim && !isNonEmptyString(e.pageId)) errors.push("statement-attached.pageId must be non-empty");
      if (fresh) {
        if (!isNonEmptyString(e.statementId)) errors.push("statement-attached.statementId must be non-empty");
        if (!isNonEmptyString(e.text)) errors.push("statement-attached.text must be non-empty");
      }
      errors.push(...evidenceErrors(e.source, "statement-attached.source"));
      errors.push(...bulkErrors(e, type));
      break;
    }
    case "look-for-raised":
      if (e.kind === "residue") {
        if (typeof e.conceptId !== "string") errors.push("look-for-raised.conceptId must be a string");
        if (!isNonEmptyString(e.targetId)) errors.push("look-for-raised of a residue names the claim");
      } else {
        needConcept();
      }
      if (!isNonEmptyString(e.itemId)) errors.push("look-for-raised.itemId must be non-empty");
      if (!LOOK_FOR_KINDS.includes(e.kind as LookForKind)) {
        errors.push(`look-for-raised.kind must be one of: ${LOOK_FOR_KINDS.join(", ")}`);
      }
      if (!isNonEmptyString(e.text)) errors.push("look-for-raised.text must be non-empty");
      if (e.targetId !== undefined && !isNonEmptyString(e.targetId)) {
        errors.push("look-for-raised.targetId must be non-empty when present");
      }
      break;
    case "look-for-settled":
      if (!isNonEmptyString(e.itemId)) errors.push("look-for-settled.itemId must be non-empty");
      if (e.by !== "researcher" && e.by !== "passage") errors.push('look-for-settled.by must be "researcher" or "passage"');
      if (e.by === "passage" && !isNonEmptyString(e.chunkId)) errors.push("look-for-settled by a passage names the passage");
      if (e.note !== undefined && !isNonEmptyString(e.note)) errors.push("look-for-settled.note must be non-empty when present");
      break;
    case "readiness-report": {
      if (!isNonEmptyString(e.verdict)) errors.push("readiness-report.verdict must be non-empty");
      if (!Array.isArray(e.rows)) {
        errors.push("readiness-report.rows must be an array");
      } else {
        (e.rows as unknown[]).forEach((r, i) => {
          const row = r as Record<string, unknown> | null;
          if (row === null || typeof row !== "object") {
            errors.push(`readiness-report.rows[${i}] must be an object`);
            return;
          }
          if (!READINESS_CRITERIA.includes(row.criterion as ReadinessCriterion)) {
            errors.push(`readiness-report.rows[${i}].criterion must be one of: ${READINESS_CRITERIA.join(", ")}`);
          }
          if (!READINESS_STATUSES.includes(row.status as ReadinessStatus)) {
            errors.push(`readiness-report.rows[${i}].status must be one of: ${READINESS_STATUSES.join(", ")}`);
          }
          if (!isNonEmptyString(row.sentence)) errors.push(`readiness-report.rows[${i}].sentence must be non-empty`);
        });
      }
      for (const field of ["fixFirst", "reviewerQuestions", "rivals", "argument"] as const) {
        errors.push(...stringArrayErrors(e[field], `readiness-report.${field}`));
      }
      if (!Array.isArray(e.biases)) errors.push("readiness-report.biases must be an array");
      if (!Array.isArray(e.flags)) errors.push("readiness-report.flags must be an array");
      /* M80: the rebuilt sections, each checked only when present. */
      if (e.asks !== undefined) {
        if (!Array.isArray(e.asks)) errors.push("readiness-report.asks must be an array");
        else
          (e.asks as unknown[]).forEach((a, i) => {
            const ask = a as Record<string, unknown> | null;
            const ref = (ask?.ref ?? null) as Record<string, unknown> | null;
            if (ask === null || !isNonEmptyString(ask.question)) errors.push(`readiness-report.asks[${i}].question must be non-empty`);
            if (ref === null || !["row", "concept", "relation"].includes(ref.kind as string)) errors.push(`readiness-report.asks[${i}].ref must name a row or a card`);
          });
      }
      if (e.rivalAccounts !== undefined) {
        if (!Array.isArray(e.rivalAccounts)) errors.push("readiness-report.rivalAccounts must be an array");
        else
          (e.rivalAccounts as unknown[]).forEach((r, i) => {
            const rival = r as Record<string, unknown> | null;
            for (const field of ["relationId", "relation", "rival", "tell"] as const)
              if (rival === null || !isNonEmptyString(rival[field])) errors.push(`readiness-report.rivalAccounts[${i}].${field} must be non-empty`);
          });
      }
      if (e.readBack !== undefined && !isNonEmptyString(e.readBack)) errors.push("readiness-report.readBack must be non-empty when present");
      if (e.flagged !== undefined) {
        if (!Array.isArray(e.flagged)) errors.push("readiness-report.flagged must be an array");
        else
          (e.flagged as unknown[]).forEach((f, i) => {
            const flag = f as Record<string, unknown> | null;
            for (const field of ["biasId", "bias", "read"] as const)
              if (flag === null || !isNonEmptyString(flag[field])) errors.push(`readiness-report.flagged[${i}].${field} must be non-empty`);
          });
      }
      const inputs = e.inputs as Record<string, unknown> | null | undefined;
      if (inputs === null || typeof inputs !== "object") {
        errors.push("readiness-report.inputs must name what the run read");
      } else {
        if (typeof inputs.eventCount !== "number" || inputs.eventCount < 0) {
          errors.push("readiness-report.inputs.eventCount must be a number of zero or more");
        }
        if (typeof inputs.lastEventId !== "string") errors.push("readiness-report.inputs.lastEventId must be a string");
      }
      break;
    }
    case "concept-flag":
      needConcept();
      if (!isNonEmptyString(e.findingId)) errors.push("concept-flag.findingId must be non-empty");
      if (!isNonEmptyString(e.rule)) errors.push("concept-flag.rule must be non-empty");
      if (!isNonEmptyString(e.reason)) errors.push("concept-flag.reason must be non-empty");
      break;
    case "relation-suggested": {
      needRelation();
      if (!isNonEmptyString(e.from)) errors.push("relation-suggested.from must name a concept");
      if (!isNonEmptyString(e.to)) errors.push("relation-suggested.to must name a concept");
      if (isNonEmptyString(e.from) && e.from === e.to) errors.push("relation-suggested joins two different concepts");
      if (!CONCEPT_RELATIONS.includes(e.relation as ConceptRelation)) {
        errors.push(`relation-suggested.relation must be one of: ${CONCEPT_RELATIONS.join(", ")}`);
      }
      if (!isNonEmptyString(e.claim)) errors.push("relation-suggested.claim must be non-empty");
      if (e.conditions !== undefined && !isNonEmptyString(e.conditions)) {
        errors.push("relation-suggested.conditions must be non-empty when present");
      }
      if (e.grounds !== undefined) errors.push(...stringArrayErrors(e.grounds, "relation-suggested.grounds"));
      errors.push(...stringArrayErrors(e.statementIds, "relation-suggested.statementIds"));
      errors.push(...stringArrayErrors(e.statements, "relation-suggested.statements"));
      errors.push(...sourceErrors(e.source, "relation-suggested.source"));
      if (e.whyItMatters !== undefined && !isNonEmptyString(e.whyItMatters)) {
        errors.push("relation-suggested.whyItMatters must be non-empty when present");
      }
      errors.push(...drawnFromErrors(e, "relation-suggested"));
      if (e.restsOn !== undefined) {
        if (!Array.isArray(e.restsOn)) errors.push("relation-suggested.restsOn must be an array");
        else
          (e.restsOn as unknown[]).forEach((g, i) => {
            const ground = g as Record<string, unknown> | null;
            const ok =
              ground !== null &&
              typeof ground === "object" &&
              ((ground.kind === "statement" && isNonEmptyString(ground.statementId)) || (ground.kind === "passage" && isNonEmptyString(ground.chunkId)));
            if (!ok) errors.push(`relation-suggested.restsOn[${i}] must name a statement or a passage`);
          });
      }
      if (e.actor === "human") errors.push("relation-suggested is Abductive's suggestion and takes Abductive as its actor");
      break;
    }
    case "relation-accepted": {
      needRelation();
      const origins = ["author-prior", "data-driven", "model-proposed"];
      if (!origins.includes(e.origin as string)) errors.push(`relation-accepted.origin must be one of: ${origins.join(", ")}`);
      if (e.actor !== "human") errors.push("relation-accepted is the researcher's decision");
      if (e.unbundled !== undefined && e.unbundled !== true) errors.push("relation-accepted.unbundled is true when present");
      errors.push(...bulkErrors(e, type));
      break;
    }
    case "relation-refined":
      needRelation();
      if (e.relation === undefined && e.claim === undefined) errors.push("relation-refined must change the kind or the claim");
      if (e.relation !== undefined && !CONCEPT_RELATIONS.includes(e.relation as ConceptRelation)) {
        errors.push(`relation-refined.relation must be one of: ${CONCEPT_RELATIONS.join(", ")}`);
      }
      if (e.claim !== undefined && !isNonEmptyString(e.claim)) errors.push("relation-refined.claim must be non-empty when present");
      if (e.actor !== "human") errors.push("relation-refined is the researcher's edit");
      break;
    case "relation-rejected":
      needRelation();
      if (!isNonEmptyString(e.reason)) errors.push("relation-rejected.reason is required");
      if (e.actor !== "human") errors.push("relation-rejected is the researcher's decision");
      break;
    case "relation-claim-set":
      needRelation();
      if (!isNonEmptyString(e.claim)) errors.push("relation-claim-set.claim must be non-empty");
      if (e.actor !== "human") errors.push("relation-claim-set is the researcher's sentence");
      break;
    case "relation-conditions-set":
      needRelation();
      if (e.conditions !== undefined && !isNonEmptyString(e.conditions)) {
        errors.push("relation-conditions-set.conditions must be non-empty when present");
      }
      if (e.actor !== "human") errors.push("relation-conditions-set is the researcher's words");
      break;
    case "relation-statement-attached": {
      needRelation();
      const claim = e.pageId !== undefined;
      const fresh = e.statementId !== undefined || e.text !== undefined;
      if (claim === fresh) errors.push("relation-statement-attached names an existing claim or carries a new statement, one of the two");
      if (claim && !isNonEmptyString(e.pageId)) errors.push("relation-statement-attached.pageId must be non-empty");
      if (fresh) {
        if (!isNonEmptyString(e.statementId)) errors.push("relation-statement-attached.statementId must be non-empty");
        if (!isNonEmptyString(e.text)) errors.push("relation-statement-attached.text must be non-empty");
      }
      errors.push(...evidenceErrors(e.source, "relation-statement-attached.source"));
      errors.push(...bulkErrors(e, type));
      break;
    }
    case "homes-proposed": {
      errors.push(...stringArrayErrors(e.read, "homes-proposed.read"));
      if (!Array.isArray(e.proposals)) {
        errors.push("homes-proposed.proposals must be an array");
      } else {
        (e.proposals as unknown[]).forEach((p, i) => {
          const prop = p as Record<string, unknown> | null;
          const home = prop?.home as Record<string, unknown> | null | undefined;
          if (prop === null || typeof prop !== "object" || !isNonEmptyString(prop.statementId)) {
            errors.push(`homes-proposed.proposals[${i}].statementId must name a statement`);
          } else if (home === null || typeof home !== "object" || (home.kind !== "concept" && home.kind !== "relation") || !isNonEmptyString(home.id)) {
            errors.push(`homes-proposed.proposals[${i}].home must name a concept or a relation`);
          }
        });
      }
      if (e.actor === "human") errors.push("homes-proposed is Abductive's proposal and takes Abductive as its actor");
      break;
    }
    case "statement-suggested": {
      if (!isNonEmptyString(e.statementId)) errors.push("statement-suggested.statementId must be non-empty");
      if (!isNonEmptyString(e.text)) errors.push("statement-suggested.text must be non-empty");
      const home = e.home as Record<string, unknown> | null | undefined;
      if (home === null || typeof home !== "object" || (home.kind !== "concept" && home.kind !== "relation") || !isNonEmptyString(home.id)) {
        errors.push("statement-suggested.home must name a concept or a relation");
      }
      errors.push(...sourceErrors(e.source, "statement-suggested.source"));
      if (e.chunkId !== undefined && !isNonEmptyString(e.chunkId)) errors.push("statement-suggested.chunkId must be non-empty when present");
      errors.push(...drawnFromErrors(e, "statement-suggested"));
      if (e.actor === "human") errors.push("statement-suggested is Abductive's suggestion and takes Abductive as its actor");
      break;
    }
    case "statement-rejected":
      if (!isNonEmptyString(e.statementId)) errors.push("statement-rejected.statementId must be non-empty");
      if (!isNonEmptyString(e.reason)) errors.push("statement-rejected.reason is required");
      if (e.actor !== "human") errors.push("statement-rejected is the researcher's decision");
      break;
    case "concept-retired":
      needConcept();
      if (!isNonEmptyString(e.reason)) errors.push("concept-retired.reason is required");
      if (e.actor !== "human") errors.push("concept-retired is the researcher's decision");
      break;
    case "why-suggested":
    case "why-accepted":
    case "why-refined": {
      const target = e.target as Record<string, unknown> | null | undefined;
      if (target === null || typeof target !== "object" || (target.kind !== "concept" && target.kind !== "relation") || !isNonEmptyString(target.id)) {
        errors.push(`${type}.target must name a concept or a relation`);
      }
      if (type !== "why-accepted" && !isNonEmptyString(e.text)) errors.push(`${type}.text must be non-empty`);
      if (type === "why-suggested" && e.actor === "human") errors.push("why-suggested is Abductive's line and takes Abductive as its actor");
      if (type !== "why-suggested" && e.actor !== "human") errors.push(`${type} is the researcher's act`);
      errors.push(...bulkErrors(e, type));
      break;
    }
    /* M93, ISC-765. */
    case "why-rejected": {
      const target = e.target as Record<string, unknown> | null | undefined;
      if (target === null || typeof target !== "object" || (target.kind !== "concept" && target.kind !== "relation") || !isNonEmptyString(target.id)) {
        errors.push("why-rejected.target must name a concept or a relation");
      }
      if (e.reason !== undefined && !isNonEmptyString(e.reason)) errors.push("why-rejected.reason must be non-empty when present");
      if (e.actor !== "human") errors.push("why-rejected is the researcher's decision");
      break;
    }
    /* M93, ISC-762. */
    case "argument-accepted":
      if (!isNonEmptyString(e.argumentId)) errors.push("argument-accepted.argumentId must name the paragraph");
      if (!isNonEmptyString(e.text)) errors.push("argument-accepted.text must be non-empty");
      if (typeof e.edited !== "boolean") errors.push("argument-accepted.edited must be true or false");
      if (e.actor !== "human") errors.push("argument-accepted is the researcher's decision");
      break;
    /* M93, ISC-764. */
    case "property-rejected":
      needConcept();
      if (!isNonEmptyString(e.name)) errors.push("property-rejected.name must name the suggested property");
      if (e.reason !== undefined && !isNonEmptyString(e.reason)) errors.push("property-rejected.reason must be non-empty when present");
      if (e.actor !== "human") errors.push("property-rejected is the researcher's decision");
      break;
    case "argument-written":
      if (!isNonEmptyString(e.text)) errors.push("argument-written.text must be non-empty");
      if (typeof e.basis !== "string") errors.push("argument-written.basis must name the cards it was written from");
      if (e.actor === "human") errors.push("argument-written is Abductive's paragraph and takes Abductive as its actor");
      if (e.awaitsDecision !== undefined && e.awaitsDecision !== true) errors.push("argument-written.awaitsDecision is true when present");
      break;
    case "suggestion-dropped":
      if (!isNonEmptyString(e.name)) errors.push("suggestion-dropped.name must be non-empty");
      if (!isNonEmptyString(e.reason)) errors.push("suggestion-dropped.reason must say why the name is more than one thing");
      errors.push(...sourceErrors(e.source, "suggestion-dropped.source"));
      if (e.actor === "human") errors.push("suggestion-dropped is Abductive's act and takes Abductive as its actor");
      break;
  }
  return errors;
}

function sourceErrors(value: unknown, name: string): string[] {
  const src = value as Record<string, unknown> | null | undefined;
  if (src === null || typeof src !== "object") return [`${name} must name the source of the suggestion`];
  if (src.kind === "summary") return isNonEmptyString(src.station) ? [] : [`${name}.station must name a step`];
  if (src.kind === "data") return stringArrayErrors(src.chunkIds, `${name}.chunkIds`);
  if (src.kind === "grouping" || src.kind === "relate") return [];
  if (src.kind === "chat") return chatSourceErrors(src, name);
  return [`${name}.kind must be "summary", "data", "grouping", "relate" or "chat"`];
}

/**
 * A chat source (M93, ISC-756): the step it was surfaced at and the turns the
 * pass read, at least one. A surfacing with no turns read nothing.
 */
export function chatSourceErrors(src: Record<string, unknown>, name: string): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(src.station)) errors.push(`${name}.station must name a step or the framing`);
  if (!Array.isArray(src.turnIds)) errors.push(`${name}.turnIds must be an array`);
  else {
    if (src.turnIds.length === 0) errors.push(`${name}.turnIds must name at least one turn`);
    if (!src.turnIds.every((t) => isNonEmptyString(t))) errors.push(`${name}.turnIds must hold non-empty ids`);
  }
  if (src.surfacingId !== undefined && !isNonEmptyString(src.surfacingId)) {
    errors.push(`${name}.surfacingId must name the surfacing when present`);
  }
  return errors;
}

/**
 * The turns a suggestion draws on (M93, ISC-757): present exactly when the
 * source is the chat, never empty, and each one among the turns the pass read.
 */
function drawnFromErrors(e: Record<string, unknown>, type: string): string[] {
  const src = e.source as Record<string, unknown> | null | undefined;
  const chat = src !== null && typeof src === "object" && src.kind === "chat";
  if (e.drawnFrom === undefined) return chat ? [`${type}.drawnFrom must name the turns a chat suggestion draws on`] : [];
  if (!chat) return [`${type}.drawnFrom belongs only on a suggestion from the chat`];
  const errors = stringArrayErrors(e.drawnFrom, `${type}.drawnFrom`);
  if (errors.length > 0) return errors;
  const drawn = e.drawnFrom as readonly string[];
  if (drawn.length === 0) return [`${type}.drawnFrom must name at least one turn`];
  const read = new Set(Array.isArray(src?.turnIds) ? (src.turnIds as readonly string[]) : []);
  if (!drawn.every((t) => read.has(t))) return [`${type}.drawnFrom names a turn the surfacing did not read`];
  return [];
}

function bulkErrors(e: Record<string, unknown>, type: string): string[] {
  return e.bulk !== undefined && e.bulk !== true ? [`${type}.bulk is true when present`] : [];
}

/** Ontology mutations carry op-dependent payloads; split out for readability. */
function validateOntologyMutation(e: Record<string, unknown>): string[] {
  const errors: string[] = [];

  if (!ONTOLOGY_OPS.includes(e.op as OntologyOp)) {
    errors.push(`ontology-mutation.op must be one of: ${ONTOLOGY_OPS.join(", ")}`);
    return errors;
  }
  if (!isNonEmptyString(e.targetId)) {
    errors.push("ontology-mutation.targetId must be non-empty");
  }
  // Attribution is the substrate of the colonization measurement — never optional.
  if (!ORIGINS.includes(e.origin as Origin)) {
    errors.push(`ontology-mutation.origin must be one of: ${ORIGINS.join(", ")}`);
  }
  if (e.supportingChunks !== undefined && !Array.isArray(e.supportingChunks)) {
    errors.push("ontology-mutation.supportingChunks must be an array when present");
  }

  const op = e.op as OntologyOp;

  if (op === "create") {
    if (!PAGE_TYPES.includes(e.pageType as PageType)) {
      errors.push(`ontology-mutation.pageType must be one of: ${PAGE_TYPES.join(", ")} on create`);
    }
    if (!isNonEmptyString(e.title)) {
      errors.push("ontology-mutation.title is required on create");
    }
  }

  /* The same rule the proposal is held to (M30). A claim carrying the name of
   * a paper it did not come out of is a false provenance, and the boundary has
   * to be enforced where the page is written as well as where it is drafted:
   * `adjudicate.ts` is not the only writer of an `ontology-mutation`. */
  if (e.paperKey !== undefined) {
    if (!isNonEmptyString(e.paperKey)) {
      errors.push("ontology-mutation.paperKey must be non-empty when present");
    }
    if (e.pageType !== "theory") {
      errors.push("ontology-mutation.paperKey is only for theory pages");
    }
  }

  /* Who holds the expectation, and the two halves of that being a real fact
   * (M44). A `mark` with nobody named says nothing, and a holder on any other op
   * is a field riding an event that does not carry it: the projection reads
   * `heldBy` on `mark` alone, so the validator refuses it elsewhere rather than
   * letting a writer believe it landed. The page type is required for the reason
   * `paperKey` requires it above, and it is the same type: an expectation is the
   * only kind of claim somebody in the setting can hold before the study looks. */
  if (op === "mark" && !isNonEmptyString(e.heldBy)) {
    errors.push("ontology-mutation.heldBy must name who holds the expectation on mark");
  }
  if (e.heldBy !== undefined) {
    if (!isNonEmptyString(e.heldBy)) {
      errors.push("ontology-mutation.heldBy must be non-empty when present");
    }
    if (op !== "mark") {
      errors.push("ontology-mutation.heldBy is only for a mark");
    }
    if (e.pageType !== "theory") {
      errors.push("ontology-mutation.heldBy is only for theory pages");
    }
  }

  if (e.reason !== undefined && !isNonEmptyString(e.reason)) {
    errors.push("ontology-mutation.reason must be non-empty when present");
  }

  if (op === "relate" || op === "unrelate") {
    const edge = e.edge as Record<string, unknown> | undefined;
    if (edge === undefined) {
      errors.push(`ontology-mutation.edge is required on ${op}`);
    } else {
      if (!isNonEmptyString(edge.from)) errors.push("ontology-mutation.edge.from must be non-empty");
      if (!isNonEmptyString(edge.to)) errors.push("ontology-mutation.edge.to must be non-empty");
      if (!EDGE_ROLES.includes(edge.role as EdgeRole)) {
        errors.push(`ontology-mutation.edge.role must be one of: ${EDGE_ROLES.join(", ")}`);
      }
    }
  }

  const edgeRole = (e.edge as Record<string, unknown> | undefined)?.role;

  if (e.puzzleRelation !== undefined) {
    if (!PUZZLE_RELATIONS.includes(e.puzzleRelation as PuzzleRelation)) {
      errors.push(`ontology-mutation.puzzleRelation must be one of: ${PUZZLE_RELATIONS.join(", ")}`);
    }
    if (op !== "relate" && op !== "revise") {
      errors.push("ontology-mutation.puzzleRelation only applies to relate or revise");
    }
    // The framing claim rides on its own role so it cannot be mistaken for an
    // ordinary argumentative edge.
    if (op === "relate" && edgeRole !== "stands-to") {
      errors.push("ontology-mutation.puzzleRelation requires edge.role 'stands-to'");
    }
  } else if (op === "relate" && edgeRole === "stands-to") {
    errors.push("edge.role 'stands-to' requires a puzzleRelation naming which claim is made");
  }

  /*
   * "From the papers" is a claim about a theory page and about nothing else
   * (M29, R1).
   *
   * A paper holds an expectation. What an expectation can be is a theory page,
   * and the whole use of the fourth origin is that a puzzle can break one. An
   * observation stamped from the papers would be somebody else's argument
   * wearing the clothes of evidence, which is the D5 defect one field over, and
   * a relation stamped from the papers would say a paper chose the researcher's
   * framing for them.
   *
   * Checked on the pageType the event carries. A `revise` that does not restate
   * the type cannot be checked here and does not need to be: the page it
   * revises was created by an event that was.
   */
  if (e.origin === "literature-derived") {
    if (op === "relate" || op === "unrelate") {
      errors.push("ontology-mutation.origin 'literature-derived' is only for theory pages");
    } else if (e.pageType !== undefined && e.pageType !== "theory") {
      errors.push("ontology-mutation.origin 'literature-derived' is only for theory pages");
    } else if (op === "create" && e.pageType !== "theory") {
      errors.push("ontology-mutation.origin 'literature-derived' is only for theory pages");
    }
  }

  return errors;
}

/** Throwing variant of {@link validateEvent}; narrows to LedgerEvent on success. */
export function assertValidEvent(candidate: unknown): asserts candidate is LedgerEvent {
  const errors = validateEvent(candidate);
  if (errors.length > 0) {
    throw new Error(`Invalid ledger event: ${errors.join("; ")}`);
  }
}
