/**
 * Proposal adjudication — the only door from the tray into the ontology
 * (ISC-55, ISC-56, ISC-57, ISC-58).
 *
 * Accepting emits two events, always paired: the adjudication and the mutation
 * that realises it. The mutation's origin is `model-proposed` unless the draft
 * said which of three other origins its content belongs to, and whichever it is,
 * it stays that way forever: a construct the researcher accepted from a model is
 * not the same evidence as one they wrote themselves, and collapsing the two
 * would erase the measurement the study exists to make. `originFor` below is the
 * whole of that decision. Rewriting the draft does not move it; see the note on
 * `origin` for why that was tried and rejected. What the researcher did to the
 * text is recorded beside it, on the adjudication, where it adds to the history
 * instead of overwriting it, and `views/provenance.ts` reads it back.
 *
 * Rejecting emits one event and keeps the proposal. Deferring emits one event
 * and keeps it pending in spirit, though the tray shows it as deferred so it
 * stops crowding the live queue. A deferred draft can be decided afterwards, so
 * this door takes a second disposition on that one status; see the comment on
 * the check itself, and the same rule in `projection.ts` (D36, M43c).
 *
 * Idempotency is the v1 lesson applied again: an in-flight map keyed on the
 * proposal, plus a read-through to the persisted ledger before deciding
 * whether the proposal is still pending. Without the read-through, two
 * dispositions of one proposal both see `pending` and both write.
 */

import type {
  EdgeRole,
  LedgerEvent,
  OntologyMutationEvent,
  Origin,
  ProposalAdjudicationEvent,
} from "../ledger/events.ts";
import { projectOntology } from "../ontology/projection.ts";
import { projectProposals } from "./projection.ts";
import type { Proposal } from "./types.ts";

export type Disposition = "accept" | "reject" | "merge" | "defer";

export interface AdjudicateInput {
  readonly projectId: string;
  readonly proposalId: string;
  readonly disposition: Disposition;
  /** Required on reject and merge. */
  readonly reason?: string;
  /** Required on merge: the existing page absorbed into. */
  readonly mergedInto?: string;
  /**
   * The researcher's own wording, when they rewrote the draft before accepting
   * it. The page is created with their text, and the fact that they rewrote it
   * is recorded on the adjudication as `edited`. It does not change the
   * page's origin.
   */
  readonly edit?: { readonly title: string; readonly body?: string };
}

export interface AdjudicateLedger {
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<void>;
  readonly readEvents: (projectId?: string) => Promise<readonly LedgerEvent[]>;
  readonly now?: () => number;
  readonly newId?: () => string;
}

export type AdjudicateOutcome =
  | { readonly kind: "recorded"; readonly events: readonly LedgerEvent[]; readonly proposal: Proposal }
  | { readonly kind: "already-adjudicated"; readonly proposal: Proposal }
  | { readonly kind: "unknown-proposal" }
  | { readonly kind: "rejected"; readonly errors: readonly string[] };

const inFlight = new Map<string, Promise<AdjudicateOutcome>>();

export async function adjudicateProposal(
  input: AdjudicateInput,
  ledger: AdjudicateLedger,
): Promise<AdjudicateOutcome> {
  const key = `${input.projectId}:${input.proposalId}`;
  const existing = inFlight.get(key);
  if (existing !== undefined) return existing;
  const run = adjudicateOnce(input, ledger).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

async function adjudicateOnce(
  input: AdjudicateInput,
  ledger: AdjudicateLedger,
): Promise<AdjudicateOutcome> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());

  const errors: string[] = [];
  if ((input.disposition === "reject" || input.disposition === "merge") && !input.reason?.trim()) {
    errors.push(`disposition '${input.disposition}' requires a reason`);
  }
  if (input.disposition === "merge" && !input.mergedInto?.trim()) {
    errors.push("disposition 'merge' requires the page it merges into");
  }
  if (errors.length > 0) return { kind: "rejected", errors };

  const events = await ledger.readEvents(input.projectId);
  const tray = projectProposals(events, input.projectId);
  const proposal = tray.all.find((p) => p.id === input.proposalId);
  if (proposal === undefined) return { kind: "unknown-proposal" };
  /* A draft set aside is still undecided, so it can still be decided (D36,
   * M43c). Every other status is final here for the reason the projection states
   * beside the same rule: a second accept or reject would overturn the first
   * without leaving it visible. Deciding a deferred draft again is allowed and a
   * second defer is a no-op the researcher cannot see, so it is refused with the
   * others below. */
  if (proposal.status === "deferred" && input.disposition === "defer") {
    return { kind: "already-adjudicated", proposal };
  }
  if (proposal.status !== "pending" && proposal.status !== "deferred") {
    return { kind: "already-adjudicated", proposal };
  }

  const edited = wasEdited(proposal, input.edit);

  const adjudication: ProposalAdjudicationEvent = {
    id: newId(),
    ts: now(),
    actor: "human",
    projectId: input.projectId,
    type: "proposal-adjudication",
    proposalId: input.proposalId,
    disposition: input.disposition,
    ...(edited ? { edited: true } : {}),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.mergedInto === undefined ? {} : { mergedInto: input.mergedInto }),
  };

  const produced: LedgerEvent[] = [adjudication];

  if (input.disposition === "accept") {
    produced.push(...mutationsForAccept(proposal, input.projectId, newId, now, input.edit));
  }

  await ledger.appendAll(produced);
  const after = projectProposals([...events, ...produced], input.projectId);
  const updated = after.all.find((p) => p.id === input.proposalId);
  return {
    kind: "recorded",
    events: produced,
    proposal: updated ?? proposal,
  };
}

/**
 * Whether the researcher's submitted text differs from what was drafted.
 * Whitespace-insensitive, because reflowing a paragraph is not authorship.
 */
function wasEdited(proposal: Proposal, edit: AdjudicateInput["edit"]): boolean {
  if (edit === undefined) return false;
  const norm = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  return norm(edit.title) !== norm(proposal.title) || norm(edit.body) !== norm(proposal.body);
}

/**
 * What origin an accept stamps (M29, R3).
 *
 * The default is the rule this door was built on and it does not move:
 * accepting a draft is ratification, the page is the model's, and it says so
 * forever. Editing the text does not change it, for the reasons written at the
 * call site.
 *
 * Two acts are not ratification and the proposal has to say which it is before
 * the researcher sees it, so the label is decided by whoever drafted it rather
 * than by anything this function can infer after the fact.
 *
 * 1. A theory claim the reader drew out of a named paper. What the page holds
 *    is the paper's expectation, so it is `literature-derived`. Counting it as
 *    the model's would hide the literature inside the model's share; counting
 *    it as the researcher's would hide it inside theirs, which is the error the
 *    fourth origin exists to end.
 * 2. A `stands-to` relation the researcher picked from four options shown side
 *    by side with none recommended. Choosing among four framings with their
 *    burdens on the table is a judgment, so it is `author-prior`. When the tool
 *    named the relation it thought applied, the draft carries no
 *    `originOnAccept` and the accept is a ratification like any other.
 *
 * 3. A claim the data reader drew out of the researcher's own transcripts and
 *    fieldnotes, which is `data-driven` (D30, M43c). Same argument as the first
 *    case, one bucket over: what the page holds is what those documents say, so
 *    counting it as the model's hides the researcher's material inside the
 *    model's share. Before this the census read "0 from the data" on a study of
 *    six documents and twelve passages, with eleven claims citing those passages
 *    by id, and `data-driven` had no writer anywhere in `src`.
 *
 *    Gated on a cited passage, because the whole content of the claim is the
 *    stamp's warrant. An extractor draft that cites nothing stays the model's and
 *    is flagged by `structural.ts` as the ungrounded construct it is.
 *
 * Anything else with the field set is ignored here and refused by
 * `validateEvent` before it reaches the tray.
 */
function originFor(proposal: Proposal): Origin {
  if (proposal.originOnAccept === "literature-derived" && proposal.pageType === "theory") {
    return "literature-derived";
  }
  if (proposal.originOnAccept === "author-prior" && proposal.edge?.role === "stands-to") {
    return "author-prior";
  }
  if (
    proposal.originOnAccept === "data-driven" &&
    proposal.pageType !== "theory" &&
    proposal.sourceChunks.length > 0
  ) {
    return "data-driven";
  }
  return "model-proposed";
}

/**
 * What an accept writes: one mutation, or two when the draft carries a link.
 *
 * An array rather than a single event because of the rival (M29b). A rival's
 * whole content is that it competes with a particular explanation, and a
 * proposal can carry a page or an edge and never both, so the link could not be
 * staged: the page id does not exist until the accept mints it. Returning both
 * from here keeps the guarantee that matters, which is that this function is
 * the only writer of an ontology mutation. The alternative was a second door.
 *
 * Order is create then relate, and it has to be: the edge names the page, and
 * a relate arriving first would reference a page the projection has not seen.
 */
function mutationsForAccept(
  proposal: Proposal,
  projectId: string,
  newId: () => string,
  now: () => number,
  edit: AdjudicateInput["edit"],
): readonly OntologyMutationEvent[] {
  const base = {
    id: newId(),
    ts: now(),
    actor: "human" as const,
    projectId,
    type: "ontology-mutation" as const,
    // Immutable, and it does not move when the researcher rewrites the text.
    //
    // It briefly did, on the reasoning that editing is authoring. An advisor
    // pass killed that before it shipped and was right to. `author-prior`
    // asserts the researcher held the concept *before* the model offered it,
    // and editing a draft is evidence of the opposite: the frame came from the
    // model and they adjusted wording inside it. A share of "researcher-
    // originated" categories computed that way would launder an anchoring
    // artifact into a publishable number. The flip also taxed agreement —
    // read a draft, genuinely agree, accept it, and your agreement is recorded
    // as abdication, so the only way to be credited is to diverge from text
    // you endorse. A provenance scheme must never make endorsement costly.
    //
    // What the researcher did to the text is kept separately, on the
    // adjudication, as additive history rather than as a relabelling that
    // destroys the fact that the page began as a draft. A real author-prior
    // signal needs a different path: the researcher writes first and the
    // draft is revealed afterwards. That is worth building and is not this.
    origin: originFor(proposal),
    supportingChunks: proposal.sourceChunks,
    ...(proposal.sourceTurn === undefined ? {} : { supportingTurn: proposal.sourceTurn }),
    /* Which paper the expectation came out of, carried onto the page (M30).
     *
     * It travels only with a theory page, which is what the validator enforces
     * on both events. `mutationsForAccept` can emit a second mutation for a
     * rival's link, and that one is an edge with no page type, so the key would
     * be refused there and is not offered. */
    ...(proposal.paperKey === undefined || proposal.pageType !== "theory"
      ? {}
      : { paperKey: proposal.paperKey }),
  };

  const title = edit?.title.trim() !== undefined && edit.title.trim() !== "" ? edit.title.trim() : proposal.title;

  if (proposal.edge !== undefined) {
    return [{
      ...base,
      op: "relate",
      targetId: newId(),
      edge: proposal.edge,
      // M29. Forwarded, not derived. The framing claim is the most consequential
      // move in a design and the ledger requires it on this role, so a door that
      // dropped it could only ever write an invalid event or an edge that says
      // less than the researcher decided.
      ...(proposal.puzzleRelation === undefined ? {} : { puzzleRelation: proposal.puzzleRelation }),
      title,
    }];
  }

  const pageId = newId();
  const create: OntologyMutationEvent = {
    ...base,
    op: "create",
    targetId: pageId,
    ...(proposal.pageType === undefined ? {} : { pageType: proposal.pageType }),
    title,
    body: (edit === undefined ? proposal.body : edit.body) ?? "",
  };
  if (proposal.linkOnAccept === undefined) return [create];

  return [
    create,
    {
      ...base,
      // A second event needs its own id, and `base` was built with one.
      id: newId(),
      op: "relate",
      targetId: newId(),
      edge: {
        from: pageId,
        to: proposal.linkOnAccept.to,
        role: proposal.linkOnAccept.role,
      },
      /* The link carries the page's own title rather than a description of the
       * edge, which is what every other `relate` this door writes carries. */
      title,
    },
  ];
}

/** Test seam: clear the in-flight map between cases. */
export function resetAdjudicationInFlight(): void {
  inFlight.clear();
}

/*
 * ── The researcher's own acts on a model that already exists ────────────────
 *
 * Everything above is adjudication: a draft arrives, the researcher decides,
 * and the decision is recorded beside the mutation it caused. The three
 * functions below are not that. Nobody proposed them. The researcher looked at
 * a claim they had already accepted and decided it was wrong, or looked at a
 * link and decided it did not hold, or looked at an unexplained thing and said
 * which puzzle it belongs to.
 *
 * The live walk found there was no way to do any of the three. A claim could be
 * accepted and never withdrawn, a framing link could be made and never undone,
 * and a residue could sit in the model unattached to anything while the check
 * that counts attached residues reported the study had nothing unexplained.
 *
 * They live in this file rather than in a second module because the invariant
 * worth keeping is that one file constructs ontology mutations. A second writer
 * elsewhere is how the origin rule and the paper-key rule end up enforced in
 * one place and not the other.
 */

export type MutationOutcome =
  | { readonly kind: "recorded"; readonly events: readonly LedgerEvent[] }
  | { readonly kind: "no-change"; readonly why: string }
  | { readonly kind: "rejected"; readonly errors: readonly string[] };

/**
 * The origin stamped on an act the researcher took on their own model.
 *
 * `author-prior` because the census over mutations answers "who moved this
 * model", and nobody suggested this move. It is not the same claim the origin
 * makes on a page, which is about where the content came from; a retirement has
 * no content.
 */
const RESEARCHER_ACT: Origin = "author-prior";

/**
 * Retire a claim, with the reason on the record (walk item 1).
 *
 * The claim stays. `retire` marks and never removes, so the page keeps its id,
 * its history, its citations and everything that pointed at it, and every
 * surface that lists live pages stops listing it. That is the whole design: a
 * study that quietly loses the claims it abandoned cannot show anyone what it
 * considered and dropped, which is most of what a reader of the record wants.
 *
 * The reason is required here rather than in `validateEvent`, so that events
 * written before the field existed stay valid.
 */
export async function retirePage(
  input: { readonly projectId: string; readonly pageId: string; readonly reason: string },
  ledger: AdjudicateLedger,
): Promise<MutationOutcome> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());
  if (input.reason.trim() === "") {
    return { kind: "rejected", errors: ["retiring a claim requires a reason"] };
  }

  const events = await ledger.readEvents(input.projectId);
  const graph = projectOntology(events, input.projectId);
  const page = graph.pages.get(input.pageId);
  if (page === undefined) return { kind: "no-change", why: "the claim is missing" };
  if (page.retired) return { kind: "no-change", why: "already retired" };

  const mutation: OntologyMutationEvent = {
    id: newId(),
    ts: now(),
    actor: "human",
    projectId: input.projectId,
    type: "ontology-mutation",
    op: "retire",
    targetId: input.pageId,
    origin: RESEARCHER_ACT,
    reason: input.reason.trim(),
  };
  await ledger.appendAll([mutation]);
  return { kind: "recorded", events: [mutation] };
}

/**
 * Withdraw a link between two claims (walk item 1).
 *
 * Written for the framing link, which is the one a researcher most needs to be
 * able to take back: choosing what their puzzle stands to is the most
 * consequential move in a design, and until now it was the one move that could
 * be made once and never again. It takes any role, because a link that cannot
 * be undone is the same defect wherever it sits.
 *
 * `unrelate` marks the edge retired rather than deleting it, for the same
 * reason a retired page stays: what the study once claimed is part of the
 * record of how it got here.
 */
export async function withdrawRelation(
  input: {
    readonly projectId: string;
    readonly from: string;
    readonly to: string;
    readonly role: EdgeRole;
  },
  ledger: AdjudicateLedger,
): Promise<MutationOutcome> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());

  const events = await ledger.readEvents(input.projectId);
  const graph = projectOntology(events, input.projectId);
  const edge = [...graph.edges.values()].find(
    (e) => e.from === input.from && e.to === input.to && e.role === input.role,
  );
  if (edge === undefined) return { kind: "no-change", why: "the link is missing" };
  if (edge.retired) return { kind: "no-change", why: "already withdrawn" };

  const mutation: OntologyMutationEvent = {
    id: newId(),
    ts: now(),
    actor: "human",
    projectId: input.projectId,
    type: "ontology-mutation",
    op: "unrelate",
    targetId: edge.id,
    edge: { from: input.from, to: input.to, role: input.role },
    origin: RESEARCHER_ACT,
  };
  await ledger.appendAll([mutation]);
  return { kind: "recorded", events: [mutation] };
}

/**
 * Say that an expectation is held by people in the setting, and who holds it
 * (M44, owner's decision of 2026-09-13).
 *
 * What this opens. `expectationsOnOffer` offers the chooser theory pages whose
 * origin is `literature-derived` or `author-prior` and excludes `model-proposed`,
 * so a study cannot break the model's own reading of the researcher's transcript
 * and call that a contribution. That decision stands for the model's readings. It
 * also kept out the most documented expectation in the Coldharbour study: the
 * board's written aim for the writing tool, which the model transcribed out of the
 * researcher's answer and which the study's own puzzle plainly breaks. The mark
 * is how that page gets on the list, and the reason it can is that somebody in
 * the setting held the expectation before the study looked, whoever typed it in.
 *
 * The holder is required and it is the point rather than a formality. "Held in
 * the setting" with nobody named is the tool asserting a fact about a field site
 * on the researcher's behalf; "the board, in the January paper" is a claim a
 * reader of the record can go and check.
 *
 * A researcher's act, like the three above it: nobody proposed it, there is
 * nothing to adjudicate, and it comes through this file because this file is the
 * only writer of an ontology mutation.
 */
export async function markHeldInSetting(
  input: {
    readonly projectId: string;
    readonly pageId: string;
    /** Who holds it, in the researcher's words: "the board, in the January paper". */
    readonly heldBy: string;
  },
  ledger: AdjudicateLedger,
): Promise<MutationOutcome> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());
  const heldBy = input.heldBy.trim();
  if (heldBy === "") {
    return { kind: "rejected", errors: ["marking an expectation requires who holds it"] };
  }

  const events = await ledger.readEvents(input.projectId);
  const graph = projectOntology(events, input.projectId);
  const page = graph.pages.get(input.pageId);
  if (page === undefined || page.retired) {
    return { kind: "no-change", why: "the claim is missing" };
  }
  /* Only an expectation, which is what the ledger's validator says too. An
   * observation or a rival is a finding about this setting rather than something
   * anybody expected of it, so there is no honest sense in which one of them is
   * held in the setting. Refused here as well so the researcher meets a sentence
   * rather than a validation error. */
  if (page.type !== "theory") {
    return {
      kind: "rejected",
      errors: ["only an expectation is something that people in the setting hold"],
    };
  }
  if (page.heldBy === heldBy) return { kind: "no-change", why: "already marked" };

  const mutation: OntologyMutationEvent = {
    id: newId(),
    ts: now(),
    actor: "human",
    projectId: input.projectId,
    type: "ontology-mutation",
    op: "mark",
    targetId: input.pageId,
    pageType: "theory",
    origin: RESEARCHER_ACT,
    heldBy,
  };
  await ledger.appendAll([mutation]);
  return { kind: "recorded", events: [mutation] };
}

/**
 * Attach one claim to another (walk item 4).
 *
 * The smallest piece of the attachment problem: the researcher says which
 * unexplained thing the silence in the literature leaves unexplained, and the
 * edge that says so gets written. Refuses `stands-to`, which is the framing
 * link and carries a claim about which of four relations is being made; that
 * one belongs to the chooser and comes through the proposal path so the choice
 * is recorded as a choice.
 */
export async function relatePages(
  input: {
    readonly projectId: string;
    readonly from: string;
    readonly to: string;
    readonly role: EdgeRole;
  },
  ledger: AdjudicateLedger,
): Promise<MutationOutcome> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());
  if (input.role === "stands-to") {
    return {
      kind: "rejected",
      errors: [
        "the motivating link goes through the expectation chooser, where you pick which of the four claims you are making",
      ],
    };
  }

  const events = await ledger.readEvents(input.projectId);
  const graph = projectOntology(events, input.projectId);
  for (const id of [input.from, input.to]) {
    const page = graph.pages.get(id);
    if (page === undefined || page.retired) {
      return { kind: "no-change", why: "one end of the link is not a live claim" };
    }
  }
  const already = [...graph.edges.values()].find(
    (e) => e.from === input.from && e.to === input.to && e.role === input.role && !e.retired,
  );
  if (already !== undefined) return { kind: "no-change", why: "already linked" };

  const mutation: OntologyMutationEvent = {
    id: newId(),
    ts: now(),
    actor: "human",
    projectId: input.projectId,
    type: "ontology-mutation",
    op: "relate",
    targetId: newId(),
    edge: { from: input.from, to: input.to, role: input.role },
    origin: RESEARCHER_ACT,
  };
  await ledger.appendAll([mutation]);
  return { kind: "recorded", events: [mutation] };
}
