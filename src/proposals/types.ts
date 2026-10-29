/**
 * Proposal staging (ISC-54..ISC-57).
 *
 * The model reads uploads and proposes candidate ontology elements. Nothing it
 * proposes reaches the ontology without a human disposition, and the module
 * boundary is what enforces that rather than a convention: extraction returns
 * `ProposalEvent[]`, a type that cannot express an ontology mutation, so there
 * is no path from reading a document to changing what the study believes.
 *
 * Rejections are retained and are first-class. What a researcher declines to
 * accept is the clearest available evidence of where their own account has
 * boundaries — a tray that discards them throws away the measurement.
 */

import type { EdgeRole, Origin, PageType, PuzzleRelation } from "../ledger/events.ts";

export type ProposalStatus = "pending" | "accepted" | "rejected" | "merged" | "deferred";

export interface Proposal {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly body: string;
  readonly pageType?: PageType;
  readonly edge?: {
    readonly from: string;
    readonly to: string;
    readonly role: EdgeRole;
  };
  /** Which framing claim a `stands-to` edge makes. Required on that role (M29). */
  readonly puzzleRelation?: PuzzleRelation;
  /**
   * The origin to stamp if this is accepted, for the two acts that are not
   * ratification (M29, R3). Read by `adjudicate.ts` and by nothing else.
   */
  readonly originOnAccept?: Extract<Origin, "literature-derived" | "author-prior" | "data-driven">;
  /** Which paper this expectation came out of (M30). See the event. */
  readonly paperKey?: string;
  /** The framing the paper was read against, when it came from a paper. */
  readonly framingDigest?: string;
  readonly sourceChunks: readonly string[];
  /**
   * A link to draw from the new page the moment it exists (M29b).
   *
   * Read by `adjudicate.ts` and by nothing else. See the note on the event.
   */
  readonly linkOnAccept?: {
    readonly to: string;
    readonly role: EdgeRole;
  };
  /** Set when the draft came from an interview answer rather than material. */
  readonly sourceTurn?: string;
  readonly status: ProposalStatus;
  /** Present on reject and merge; required by the ledger for both. */
  readonly reason?: string;
  /** Present on merge: the existing page this was absorbed into. */
  readonly mergedInto?: string;
  /** Ontology page id created on accept. */
  readonly acceptedAs?: string;
  readonly proposedAt: number;
  readonly adjudicatedAt?: number;
}

export interface ProposalTray {
  readonly projectId: string;
  readonly all: readonly Proposal[];
  readonly pending: readonly Proposal[];
  /** Retained deliberately — see the module note (ISC-55). */
  readonly rejected: readonly Proposal[];
  readonly accepted: readonly Proposal[];
  readonly merged: readonly Proposal[];
  readonly deferred: readonly Proposal[];
}

/** An existing page a pending proposal may be a restatement of (ISC-56). */
export interface NearDuplicate {
  readonly proposalId: string;
  readonly existingPageId: string;
  readonly existingTitle: string;
  readonly similarity: number;
  /** What the researcher is being asked to decide, in their terms. */
  readonly prompt: string;
}
