/**
 * Proposal tray projection (ISC-54, ISC-55).
 *
 * Pure replay, same contract as the ontology projection: no module state, no
 * clocks, no randomness, deep-equal on repeat.
 */

import type { LedgerEvent } from "../ledger/events.ts";
import type { Proposal, ProposalStatus, ProposalTray } from "./types.ts";

const DISPOSITION_STATUS: Readonly<Record<string, ProposalStatus>> = {
  accept: "accepted",
  reject: "rejected",
  merge: "merged",
  defer: "deferred",
};

export function projectProposals(
  events: readonly LedgerEvent[],
  projectId?: string,
): ProposalTray {
  const scoped = projectId === undefined ? events : events.filter((e) => e.projectId === projectId);
  const byId = new Map<string, Proposal>();
  /*
   * The accept whose mutation has not arrived yet (D28, M43c).
   *
   * `acceptedAs` is the link from a draft to the claim it became, and every
   * reader of that link was wrong about an edited draft. It was matched on the
   * title, and `adjudicate.ts` creates the page with the researcher's wording
   * when they rewrote it, so the create's title is not the proposal's and the
   * match failed silently. The three surfaces that read the link then had no
   * claim: `claimProvenance` returned null on any claim whose draft the
   * researcher had edited, `turnsBehindClaims` lost its turn, and the map's offer
   * fell back to "no conversation is behind this claim" on exactly the claims
   * the researcher had worked hardest on.
   *
   * The pairing is already in the write order rather than in the titles. An
   * accept appends its adjudication and then the mutations that realise it, in
   * one call, so the create that follows an accept is that accept's create. The
   * marker is cleared by the first mutation either way, so an accept that emits a
   * `relate` instead of a `create`, which is what the expectation chooser's
   * proposal does, cannot leave it armed for an unrelated page.
   *
   * The title match below survives as the fallback, for a record written before
   * this pairing and for a create that reaches the ledger without its
   * adjudication in front of it.
   */
  let awaitingMutation: string | null = null;

  for (const event of scoped) {
    if (event.type === "proposal") {
      // A re-proposal of an already-adjudicated id would silently resurrect a
      // rejection, so the first proposal wins and later ones are ignored.
      if (byId.has(event.proposalId)) continue;
      byId.set(event.proposalId, {
        id: event.proposalId,
        projectId: event.projectId,
        title: event.title,
        body: event.body ?? "",
        ...(event.pageType === undefined ? {} : { pageType: event.pageType }),
        ...(event.edge === undefined ? {} : { edge: event.edge }),
        // M29. Both carried through unchanged: the tray shows the draft and the
        // door reads it, and neither is anything the projection decides.
        ...(event.puzzleRelation === undefined ? {} : { puzzleRelation: event.puzzleRelation }),
        ...(event.originOnAccept === undefined ? {} : { originOnAccept: event.originOnAccept }),
        ...(event.paperKey === undefined ? {} : { paperKey: event.paperKey }),
        ...(event.framingDigest === undefined ? {} : { framingDigest: event.framingDigest }),
        ...(event.linkOnAccept === undefined ? {} : { linkOnAccept: event.linkOnAccept }),
        sourceChunks: event.sourceChunks,
        ...(event.sourceTurn === undefined ? {} : { sourceTurn: event.sourceTurn }),
        status: "pending",
        proposedAt: event.ts,
      });
      continue;
    }

    if (event.type === "proposal-adjudication") {
      const current = byId.get(event.proposalId);
      if (current === undefined) continue;
      /*
       * Accept, reject and merge are once and for all. A second one would let a
       * rejection be quietly overturned without leaving the first decision
       * visible.
       *
       * Setting a draft aside is the exception, and it always was: this file's
       * sibling door says a defer "keeps it pending in spirit, though the tray
       * shows it as deferred so it stops crowding the live queue". A draft the
       * researcher has not decided must stay decidable, so `deferred` is the one
       * status a later adjudication may move (D36, M43c). Nothing is rewritten
       * to do it. The defer stays on the record and the decision that follows is
       * a second event after it, which is what "append-only" means here.
       *
       * The walk of 2026-09-13 set two drafts aside and both left the product:
       * they were in no list, absent from the whole page text, and did not come
       * back after a reload, while twenty-six turned-down drafts stayed on the
       * record with the researcher's reasons. Deferring lost more than
       * declining, which is the wrong way round for a tool whose claim is that
       * it keeps what you refused.
       */
      if (current.status !== "pending" && current.status !== "deferred") continue;
      const status = DISPOSITION_STATUS[event.disposition];
      if (status === undefined) continue;
      awaitingMutation = event.disposition === "accept" ? event.proposalId : null;
      byId.set(event.proposalId, {
        ...current,
        status,
        ...(event.reason === undefined ? {} : { reason: event.reason }),
        ...(event.mergedInto === undefined ? {} : { mergedInto: event.mergedInto }),
        adjudicatedAt: event.ts,
      });
      continue;
    }

    // An accept is paired with the mutation that realises it; recording the
    // resulting page id here is what lets the tray link a decision to its
    // consequence in the graph.
    if (event.type === "ontology-mutation") {
      const paired = awaitingMutation;
      awaitingMutation = null;
      if (event.op !== "create") continue;
      const accepted = paired === null ? undefined : byId.get(paired);
      if (
        paired !== null &&
        accepted !== undefined &&
        accepted.status === "accepted" &&
        accepted.acceptedAs === undefined
      ) {
        byId.set(paired, { ...accepted, acceptedAs: event.targetId });
        continue;
      }
      for (const [id, proposal] of byId) {
        if (proposal.status !== "accepted") continue;
        if (proposal.acceptedAs !== undefined) continue;
        if (proposal.title !== event.title) continue;
        byId.set(id, { ...proposal, acceptedAs: event.targetId });
        break;
      }
    }
  }

  const all = [...byId.values()];
  const of = (status: ProposalStatus) => all.filter((p) => p.status === status);
  return {
    projectId: projectId ?? "",
    all,
    pending: of("pending"),
    rejected: of("rejected"),
    accepted: of("accepted"),
    merged: of("merged"),
    deferred: of("deferred"),
  };
}
