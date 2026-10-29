/**
 * The emerging project ontology, read off the record (M63, ISC-608).
 *
 * A pure projection, the way the claims graph is: the concepts are never held
 * anywhere but in the events that made them. It reads the claims graph as well,
 * because every claim the project already holds is a statement, shown under the
 * concept it has been placed under or under "Unplaced statements" until then.
 *
 * Nothing here writes. `door.ts` is the one writer of a concept event, and it
 * reads this projection to decide what an act writes.
 */

import type {
  ConceptEvidence,
  ConceptRelation,
  ConceptSource,
  ConceptSuggestedEvent,
  LedgerEvent,
  LookForKind,
  Origin,
  PageType,
  ReadinessReportEvent,
  RelationGround,
  RelationSuggestedEvent,
  StatementHome,
  StatementSuggestedEvent,
} from "../ledger/events.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { livePages } from "../ontology/schema.ts";
import { relationSentence } from "./vocabulary.ts";
import { hasGapMarker } from "../interview/conversation.ts";

export type ConceptMark = Exclude<Origin, "literature-derived">;

export interface ConceptProperty {
  readonly id: string;
  readonly name: string;
  readonly varies?: string;
  /** What the property first said, when the researcher has since changed it. */
  readonly original?: { readonly name: string; readonly varies?: string };
}

/* M82 (the lead's ruling A): "retired" is an accepted concept the researcher dropped, with a reason. */
export type ConceptStatus = "suggested" | "accepted" | "rejected" | "retired";

/**
 * A card's "Why it matters" line (M82, ISC-695): what the concept or relation
 * does for the argument and what the design loses without it. Abductive writes
 * it, on the suggestion or for an accepted card that has none; the researcher
 * accepts it or puts it in their own words, and a line in their words is marked
 * theirs.
 */
export interface WhyLine {
  readonly text: string;
  readonly by: "abductive" | "you";
  /**
   * "suggested" while a line Abductive wrote for an accepted card waits for the
   * researcher's decision; "rejected" once they rejected it (M93, ISC-765), when
   * the card shows no line from Abductive and Abductive does not write another.
   */
  readonly status: "suggested" | "accepted" | "rejected";
  /** The researcher's reason, for a rejected line. */
  readonly reason?: string;
  /** The line it replaced, once the researcher has written their own. */
  readonly original?: string;
}

export interface ConceptCard {
  readonly id: string;
  readonly name: string;
  readonly definition: string;
  readonly status: ConceptStatus;
  /** The mark, fixed on acceptance. Absent while the concept is a suggestion. */
  readonly origin?: ConceptMark;
  /** The name and definition it was accepted with, once the researcher has refined either. */
  readonly original: { readonly name: string; readonly definition: string } | null;
  readonly properties: readonly ConceptProperty[];
  /** Statements placed under it, in the order they were placed. */
  readonly statementIds: readonly string[];
  readonly source: ConceptSource | { readonly kind: "researcher" };
  /** The suggestion, while there is one. What accepting it would write. */
  readonly suggestion?: ConceptSuggestedEvent;
  readonly reason?: string;
  readonly suggestedAt: number;
  readonly decidedAt?: number;
  /** M82, ISC-695: the card's Why it matters line, once accepted or written for it; the suggestion carries its own. */
  readonly why: WhyLine | null;
  /**
   * The properties its suggestion carried that still wait for a decision (M93,
   * ISC-764), by name. Accepting the concept accepts its name and definition
   * only; each property is accepted or rejected on its own.
   */
  readonly suggestedProperties: readonly string[];
  /** M93, ISC-757: the chat turns its suggestion drew on, for a concept surfaced from the chat. */
  readonly drawnFrom?: readonly string[];
}

/**
 * Where a statement came from (M75, ISC-669). By the M63 decision a statement
 * is a summary statement from a step or a data read, and only those two wait
 * under Statements to place. A paper's claim lives on Sources, a rival lives in
 * the report, and a claim drafted from the conversation alone sits where it was
 * put. Every statement shows this as a label (`concepts/statementOrigin.ts`).
 */
export type StatementFrom =
  | { readonly kind: "summary"; readonly station: string }
  | { readonly kind: "data"; readonly chunkIds: readonly string[] }
  | { readonly kind: "papers" }
  | { readonly kind: "rival" }
  /* The researcher's replies in a step's conversation (the lead's ruling B,
   * 2026-10-03): step material, like a summary statement. `station` is the
   * step, or "framing", when the turn's place is on the record. */
  | { readonly kind: "conversation"; readonly station?: string };

/**
 * Whether a statement of this origin waits under Statements to place (M75,
 * the lead's ruling B): a step summary, a read of the data or the researcher's
 * replies at a step. A paper's claim and a rival leave the inbox.
 */
export function inInbox(from: StatementFrom): boolean {
  return from.kind !== "papers" && from.kind !== "rival";
}

/**
 * A claim page's origin, from its provenance. A rival is the rival writer's; a
 * literature-derived page is the papers'; a page that cites a passage of the
 * data is a data read (the example's legacy pages, which predate concepts); a
 * page drafted from a turn alone, or from neither, came out of the conversation.
 */
function pageFrom(
  page: { readonly type: PageType; readonly origin: Origin; readonly supportingChunks: readonly string[]; readonly supportingTurn?: string },
  turnPlace: ReadonlyMap<string, string>,
): StatementFrom {
  if (page.type === "rival") return { kind: "rival" };
  if (page.origin === "literature-derived") return { kind: "papers" };
  if (page.supportingChunks.length > 0) return { kind: "data", chunkIds: page.supportingChunks };
  const station = page.supportingTurn === undefined ? undefined : turnPlace.get(page.supportingTurn);
  return station === undefined ? { kind: "conversation" } : { kind: "conversation", station };
}

/** Where each turn was said: its own station, or the station of the question that it answers. */
function turnPlaces(events: readonly LedgerEvent[], projectId: string): ReadonlyMap<string, string> {
  const asked = new Map<string, string>();
  const out = new Map<string, string>();
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    if (e.type === "question-selection" && e.station !== undefined) asked.set(e.id, e.station);
    if (e.type === "response") {
      const at = e.station ?? (e.inReplyTo === undefined ? undefined : asked.get(e.inReplyTo));
      if (at !== undefined) out.set(e.id, at);
    }
  }
  return out;
}

/** A placed statement's origin, from the passage or the answer it was accepted with. */
function evidenceFrom(source: ConceptEvidence | undefined): StatementFrom {
  if (source?.kind === "answer") return { kind: "summary", station: source.subject };
  if (source?.kind === "passage") return { kind: "data", chunkIds: [source.chunkId] };
  return { kind: "conversation" };
}

export interface Statement {
  readonly id: string;
  readonly kind: "claim" | "new";
  readonly text: string;
  readonly body?: string;
  /** The accepted concept it sits under, or null when it is unplaced. */
  readonly conceptId: string | null;
  /** The accepted relation it sits under, or null (M67). A statement sits under one concept or one relation, or neither. */
  readonly relationId: string | null;
  readonly chunks: readonly string[];
  /** The step whose answer it came from, when one did. */
  readonly answer?: string;
  /** The turn it was drafted from, for a claim that came out of the conversation. */
  readonly turn?: string;
  readonly origin?: Origin;
  /** The claim's page type and who holds it in the setting, for the line's controls (M63). */
  readonly pageType?: PageType;
  readonly heldBy?: string;
  /** Where it came from, shown as its label everywhere it appears (M75, ISC-669). */
  readonly from: StatementFrom;
}

export interface ConceptLink {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly relation: ConceptRelation;
  readonly source?: ConceptEvidence;
}

/**
 * A relation as a card of its own (M67, ISC-631): the two concepts, the kind,
 * a one-sentence claim in the researcher's words, the conditions under which
 * they expect it to apply, and the statements placed under it. An accepted
 * card is a live link; a relation set before M67 is a card with no claim yet.
 */
export interface RelationCard {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly relation: ConceptRelation;
  /** The claim sentence, or "" when the researcher has not written one. */
  readonly claim: string;
  /** The conditions, or "" when there are none. */
  readonly conditions: string;
  readonly status: ConceptStatus;
  readonly origin?: ConceptMark;
  /** The kind and claim it was accepted with, once the researcher has refined either. */
  readonly original: { readonly relation: ConceptRelation; readonly claim: string } | null;
  /** The passage or answer the relation was set from, when there is one. */
  readonly source?: ConceptEvidence;
  readonly statementIds: readonly string[];
  /** What Abductive suggested it from, for a relation that began as a suggestion. */
  readonly madeFrom?: ConceptSource;
  /** The links between two claims that the relation rests on, when Abductive grounded it in them. */
  readonly grounds: readonly string[];
  /** Each of those links as a sentence: "Uniform pages stop mentors from reading them" contradicts "Differences in initial network position persist". */
  readonly groundsSaid: readonly string[];
  readonly suggestion?: RelationSuggestedEvent;
  readonly reason?: string;
  readonly suggestedAt: number;
  readonly decidedAt?: number;
  /** M82, ISC-695: the card's Why it matters line. */
  readonly why: WhyLine | null;
  /** M82, ISC-694: the statements and passages the relation rests on, from the Relate concepts pass. */
  readonly restsOn: readonly RelationGround[];
  /** M93, ISC-757: the chat turns its suggestion drew on, for a relation surfaced from the chat. */
  readonly drawnFrom?: readonly string[];
}

export interface LookForLine {
  readonly itemId: string;
  readonly conceptId: string;
  readonly kind: LookForKind;
  readonly targetId?: string;
  readonly text: string;
  readonly raisedAt: number;
  readonly settled: null | {
    readonly by: "researcher" | "passage";
    readonly note?: string;
    readonly chunkId?: string;
    readonly ts: number;
  };
}

export interface ConceptFlag {
  readonly findingId: string;
  readonly rule: string;
  readonly reason: string;
  readonly ts: number;
}

export interface ProjectOntologyView {
  readonly concepts: ReadonlyMap<string, ConceptCard>;
  readonly suggested: readonly ConceptCard[];
  readonly accepted: readonly ConceptCard[];
  readonly rejected: readonly ConceptCard[];
  readonly statements: ReadonlyMap<string, Statement>;
  /** Live claims not placed under an accepted concept. */
  readonly unplaced: readonly Statement[];
  /** The unplaced statements that came from a step summary or a data read: Statements to place (M75, ISC-669). */
  readonly toPlace: readonly Statement[];
  /** Relations between accepted concepts, in the order they were set. */
  readonly links: readonly ConceptLink[];
  /** Every line raised, open ones first in the order raised. */
  readonly lookFor: readonly LookForLine[];
  /** The flags placed at each concept by the latest report. */
  readonly flagsAt: ReadonlyMap<string, readonly ConceptFlag[]>;
  readonly reports: readonly ReadinessReportEvent[];
  /** Every relation card, suggested, accepted or rejected (M67). */
  readonly relations: ReadonlyMap<string, RelationCard>;
  readonly suggestedRelations: readonly RelationCard[];
  /** One card per live link, in the order the links were set. */
  readonly acceptedRelations: readonly RelationCard[];
  /** The home Abductive proposed for each statement still to place, while that home stands (ISC-634). */
  readonly homes: ReadonlyMap<string, StatementHome>;
  /** Every statement a pass of proposals has read, with or without a home for it. */
  readonly homesRead: ReadonlySet<string>;
  /** The home proposed for a claim still waiting in the tray, by the proposal's id (the lead's ruling, M67). */
  readonly proposalHomes: ReadonlyMap<string, StatementHome>;
  /** Statements Abductive suggested, each with its proposed home, still waiting for a decision (ISC-633). */
  readonly suggestedStatements: readonly StatementSuggestedEvent[];
  /** M82, ISC-695: the latest "The argument so far", or null before Abductive writes one. */
  readonly argument: ArgumentView | null;
  /**
   * The paragraph the researcher last accepted, as Abductive wrote it or in
   * their words (M93, ISC-762), or an unmarked paragraph from before M93. Null
   * when they have accepted none: the Report carries this one and no other.
   */
  readonly acceptedArgument: AcceptedArgument | null;
}

/**
 * "The argument so far" as Abductive last wrote it, with the researcher's
 * decision on it (M93, ISC-762). "legacy" is a paragraph written before M93,
 * which keeps the effect it had: shown and exported as Abductive's.
 */
export interface ArgumentView {
  readonly id: string;
  readonly text: string;
  readonly basis: string;
  readonly ts: number;
  readonly decision: "suggested" | "accepted" | "rejected" | "legacy";
}

export interface AcceptedArgument {
  readonly argumentId: string;
  readonly text: string;
  /** "you" when the researcher accepted it in their own words, "abductive" as written, "legacy" for a paragraph from before M93. */
  readonly by: "you" | "abductive" | "legacy";
  readonly ts: number;
}

interface MutableCard {
  id: string;
  name: string;
  definition: string;
  status: ConceptStatus;
  origin?: ConceptMark;
  original: { name: string; definition: string } | null;
  properties: Map<string, ConceptProperty>;
  source: ConceptCard["source"];
  suggestion?: ConceptSuggestedEvent;
  reason?: string;
  suggestedAt: number;
  decidedAt?: number;
  /** M93, ISC-764: accepted by its name and definition only, so its parts wait. */
  unbundled?: boolean;
}

/** The mark a suggestion would carry if accepted: data for a read of the data, the model otherwise. */
export function markOf(source: ConceptSource): ConceptMark {
  const fromData: ConceptMark = "data-driven";
  const fromModel: ConceptMark = "model-proposed";
  return source.kind === "data" && source.chunkIds.length > 0 ? fromData : fromModel;
}

export const EMPTY_ONTOLOGY: ProjectOntologyView = {
  concepts: new Map(),
  suggested: [],
  accepted: [],
  rejected: [],
  statements: new Map(),
  unplaced: [],
  toPlace: [],
  links: [],
  lookFor: [],
  flagsAt: new Map(),
  reports: [],
  relations: new Map(),
  suggestedRelations: [],
  acceptedRelations: [],
  homes: new Map(),
  homesRead: new Set(),
  proposalHomes: new Map(),
  suggestedStatements: [],
  argument: null,
  acceptedArgument: null,
};

/**
 * The id a relation that a concept's suggestion carried takes once the concept
 * is accepted (M93, ISC-764): stable, so the relation is offered once and its
 * decision lands on the same card.
 */
export function partRelationId(conceptId: string, index: number): string {
  return `${conceptId}:relation:${index}`;
}

/** The id a statement that a pre-M67 suggestion carried inside it takes once the concept is accepted (M93). */
export function partStatementId(conceptId: string, index: number): string {
  return `${conceptId}:statement:${index}`;
}

export function projectConcepts(
  events: readonly LedgerEvent[],
  projectId: string,
  graph: OntologyGraph,
): ProjectOntologyView {
  const cards = new Map<string, MutableCard>();
  // statement id -> its place, latest wins: a concept or (M67) a relation
  const placement = new Map<string, { readonly kind: "concept" | "relation"; readonly id: string }>();
  const placedOrder: string[] = [];
  const fresh = new Map<string, Statement>();
  const links = new Map<string, ConceptLink>();
  const lines = new Map<string, LookForLine>();
  const reports: ReadinessReportEvent[] = [];
  const conceptFlags: { event: Extract<LedgerEvent, { type: "concept-flag" }> }[] = [];
  const rels = new Map<string, MutableRelation>();
  const relationOrigin = new Map<string, ConceptMark>();
  const homeOf = new Map<string, StatementHome>();
  const homesRead = new Set<string>();
  const statementSuggestions = new Map<string, StatementSuggestedEvent>();
  const statementRejected = new Set<string>();
  /* M82, ISC-695: each card's line, keyed "concept:<id>" or "relation:<id>". */
  const whyOf = new Map<string, WhyLine>();
  const whyKey = (kind: "concept" | "relation", id: string) => `${kind}:${id}`;
  /* M93, ISC-764: a suggestion accepted from M93 leaves its line suggested, for its own decision. */
  const seedWhy = (kind: "concept" | "relation", id: string, text: string | undefined, status: "suggested" | "accepted" = "accepted") => {
    if (text === undefined || text.trim() === "" || whyOf.has(whyKey(kind, id))) return;
    whyOf.set(whyKey(kind, id), { text: text.trim(), by: "abductive", status });
  };
  let argument: ArgumentView | null = null;
  let acceptedArgument: AcceptedArgument | null = null;
  const argumentDeclined = new Set<string>();
  /* M93, ISC-764: the suggested properties decided, keyed "<conceptId>|<name>". */
  const propertyDecided = new Set<string>();
  const propertyKey = (conceptId: string, name: string) => `${conceptId}|${name.trim().toLowerCase()}`;
  /* A relation a card's suggestion carried, offered on its own once the concept is accepted. */
  const partRelations = (card: MutableCard, e: Extract<LedgerEvent, { type: "concept-accepted" }>) => {
    const sug = card.suggestion;
    if (sug === undefined) return;
    sug.relations.forEach((r, i) => {
      const relationId = partRelationId(card.id, i);
      if (rels.has(relationId) || r.to === card.id) return;
      const synthetic: RelationSuggestedEvent = {
        id: sug.id,
        ts: e.ts,
        actor: sug.actor,
        projectId: sug.projectId,
        ...(sug.model === undefined ? {} : { model: sug.model }),
        ...(sug.modelVersion === undefined ? {} : { modelVersion: sug.modelVersion }),
        type: "relation-suggested",
        relationId,
        from: card.id,
        to: r.to,
        relation: r.relation,
        claim: "",
        statementIds: [],
        statements: [],
        source: sug.source,
        ...(sug.drawnFrom === undefined ? {} : { drawnFrom: sug.drawnFrom }),
      };
      rels.set(relationId, {
        claim: "",
        conditions: "",
        status: "suggested",
        original: null,
        suggestion: synthetic,
        suggestedAt: e.ts,
        from: card.id,
        to: r.to,
        relation: r.relation,
      });
    });
    /* A suggestion from before M67 carried its statements inside it: each one waits too. */
    sug.statements.forEach((text, i) => {
      const statementId = partStatementId(card.id, i);
      if (statementSuggestions.has(statementId)) return;
      statementSuggestions.set(statementId, {
        id: sug.id,
        ts: e.ts,
        actor: sug.actor,
        projectId: sug.projectId,
        ...(sug.model === undefined ? {} : { model: sug.model }),
        ...(sug.modelVersion === undefined ? {} : { modelVersion: sug.modelVersion }),
        type: "statement-suggested",
        statementId,
        text,
        home: { kind: "concept", id: card.id },
        source: sug.source,
      });
    });
    for (const pageId of sug.statementIds) if (!homeOf.has(pageId)) homeOf.set(pageId, { kind: "concept", id: card.id });
  };

  for (const e of events) {
    if (e.projectId !== projectId) continue;
    switch (e.type) {
      case "concept-suggested":
        if (cards.has(e.conceptId)) break;
        cards.set(e.conceptId, {
          id: e.conceptId,
          name: e.name,
          definition: e.definition,
          status: "suggested",
          original: null,
          properties: new Map(),
          source: e.source,
          suggestion: e,
          suggestedAt: e.ts,
        });
        break;
      case "concept-accepted": {
        const card = cards.get(e.conceptId);
        if (card === undefined) {
          cards.set(e.conceptId, {
            id: e.conceptId,
            name: e.name ?? e.conceptId,
            definition: e.definition ?? "",
            status: "accepted",
            origin: e.origin,
            original: null,
            properties: new Map(),
            source: { kind: "researcher" },
            suggestedAt: e.ts,
            decidedAt: e.ts,
          });
        } else if (card.status === "suggested") {
          card.status = "accepted";
          card.origin = e.origin;
          card.decidedAt = e.ts;
          if (e.unbundled === true) {
            card.unbundled = true;
            seedWhy("concept", e.conceptId, card.suggestion?.whyItMatters, "suggested");
            partRelations(card, e);
          } else {
            seedWhy("concept", e.conceptId, card.suggestion?.whyItMatters);
          }
        }
        break;
      }
      case "property-rejected":
        propertyDecided.add(propertyKey(e.conceptId, e.name));
        break;
      case "concept-refined": {
        const card = cards.get(e.conceptId);
        if (card === undefined) break;
        if (card.original === null) card.original = { name: card.name, definition: card.definition };
        if (e.name !== undefined) card.name = e.name;
        if (e.definition !== undefined) card.definition = e.definition;
        break;
      }
      case "concept-retired": {
        const card = cards.get(e.conceptId);
        if (card === undefined || card.status !== "accepted") break;
        card.status = "retired";
        card.reason = e.reason;
        card.decidedAt = e.ts;
        break;
      }
      case "concept-rejected": {
        const card = cards.get(e.conceptId);
        if (card === undefined || card.status !== "suggested") break;
        card.status = "rejected";
        card.reason = e.reason;
        card.decidedAt = e.ts;
        break;
      }
      case "concept-property-set": {
        const card = cards.get(e.conceptId);
        if (card === undefined) break;
        if (e.suggested !== undefined) propertyDecided.add(propertyKey(e.conceptId, e.suggested));
        if (e.removed === true) {
          card.properties.delete(e.propertyId);
          break;
        }
        const was = card.properties.get(e.propertyId);
        const next: ConceptProperty = {
          id: e.propertyId,
          name: e.name,
          ...(e.varies === undefined ? {} : { varies: e.varies }),
          ...(was === undefined
            ? {}
            : {
                original:
                  was.original ??
                  { name: was.name, ...(was.varies === undefined ? {} : { varies: was.varies }) },
              }),
        };
        // An unchanged property keeps no original: nothing was edited.
        card.properties.set(
          e.propertyId,
          was !== undefined && was.name === next.name && was.varies === next.varies ? was : next,
        );
        break;
      }
      case "concept-relation-set":
        links.set(e.relationId, {
          id: e.relationId,
          from: e.from,
          to: e.to,
          relation: e.relation,
          ...(e.source === undefined ? {} : { source: e.source }),
        });
        break;
      case "concept-relation-removed":
        links.delete(e.relationId);
        break;
      case "statement-attached": {
        const id = e.pageId ?? e.statementId;
        if (id === undefined) break;
        placement.set(id, { kind: "concept", id: e.conceptId });
        placedOrder.push(id);
        if (e.pageId === undefined && e.text !== undefined) {
          fresh.set(id, {
            id,
            kind: "new",
            text: e.text,
            conceptId: e.conceptId,
            relationId: null,
            chunks: e.source?.kind === "passage" ? [e.source.chunkId] : [],
            ...(e.source?.kind === "answer" ? { answer: e.source.subject } : {}),
            from: evidenceFrom(e.source),
          });
        }
        break;
      }
      case "look-for-raised":
        if (lines.has(e.itemId)) break;
        lines.set(e.itemId, {
          itemId: e.itemId,
          conceptId: e.conceptId,
          kind: e.kind,
          ...(e.targetId === undefined ? {} : { targetId: e.targetId }),
          text: e.text,
          raisedAt: e.ts,
          settled: null,
        });
        break;
      case "look-for-settled": {
        const line = lines.get(e.itemId);
        if (line === undefined || line.settled !== null) break;
        lines.set(e.itemId, {
          ...line,
          settled: {
            by: e.by,
            ...(e.note === undefined ? {} : { note: e.note }),
            ...(e.chunkId === undefined ? {} : { chunkId: e.chunkId }),
            ts: e.ts,
          },
        });
        break;
      }
      case "relation-suggested":
        if (rels.has(e.relationId)) break;
        rels.set(e.relationId, {
          claim: e.claim,
          conditions: e.conditions ?? "",
          status: "suggested",
          original: null,
          suggestion: e,
          suggestedAt: e.ts,
          from: e.from,
          to: e.to,
          relation: e.relation,
        });
        break;
      case "relation-accepted": {
        relationOrigin.set(e.relationId, e.origin);
        const r = rels.get(e.relationId);
        if (r !== undefined && r.status === "suggested") {
          r.status = "accepted";
          r.decidedAt = e.ts;
          /* M93, ISC-764: a relation accepted from M93 leaves its line suggested,
             as a concept's is; a relation's acceptance never carried more. */
          seedWhy("relation", e.relationId, r.suggestion?.whyItMatters, e.unbundled === true ? "suggested" : "accepted");
        }
        break;
      }
      case "relation-rejected": {
        const r = rels.get(e.relationId);
        if (r === undefined || r.status !== "suggested") break;
        r.status = "rejected";
        r.reason = e.reason;
        r.decidedAt = e.ts;
        break;
      }
      case "relation-refined": {
        const r = relCard(rels, e.relationId, e.ts);
        if (r.original === null) r.original = { relation: r.relation, claim: r.claim };
        if (e.relation !== undefined) r.relation = e.relation;
        if (e.claim !== undefined) r.claim = e.claim;
        break;
      }
      case "relation-claim-set":
        relCard(rels, e.relationId, e.ts).claim = e.claim;
        break;
      case "relation-conditions-set":
        relCard(rels, e.relationId, e.ts).conditions = e.conditions ?? "";
        break;
      case "relation-statement-attached": {
        const id = e.pageId ?? e.statementId;
        if (id === undefined) break;
        placement.set(id, { kind: "relation", id: e.relationId });
        placedOrder.push(id);
        if (e.pageId === undefined && e.text !== undefined) {
          fresh.set(id, {
            id,
            kind: "new",
            text: e.text,
            conceptId: null,
            relationId: e.relationId,
            chunks: e.source?.kind === "passage" ? [e.source.chunkId] : [],
            ...(e.source?.kind === "answer" ? { answer: e.source.subject } : {}),
            from: evidenceFrom(e.source),
          });
        }
        break;
      }
      case "statement-suggested":
        if (!statementSuggestions.has(e.statementId)) statementSuggestions.set(e.statementId, e);
        break;
      case "statement-rejected":
        statementRejected.add(e.statementId);
        break;
      case "homes-proposed":
        for (const id of e.read) homesRead.add(id);
        for (const p of e.proposals) homeOf.set(p.statementId, p.home);
        break;
      case "readiness-report":
        reports.push(e);
        break;
      case "why-suggested": {
        const had = whyOf.get(whyKey(e.target.kind, e.target.id));
        if (had === undefined || had.status === "suggested") {
          whyOf.set(whyKey(e.target.kind, e.target.id), { text: e.text, by: "abductive", status: "suggested" });
        }
        break;
      }
      case "why-accepted": {
        const had = whyOf.get(whyKey(e.target.kind, e.target.id));
        if (had !== undefined && had.status === "suggested") whyOf.set(whyKey(e.target.kind, e.target.id), { ...had, status: "accepted" });
        break;
      }
      /* M93, ISC-765. */
      case "why-rejected": {
        const had = whyOf.get(whyKey(e.target.kind, e.target.id));
        if (had !== undefined && had.status === "suggested" && had.by === "abductive") {
          whyOf.set(whyKey(e.target.kind, e.target.id), { ...had, status: "rejected", ...(e.reason === undefined ? {} : { reason: e.reason }) });
        }
        break;
      }
      case "why-refined": {
        const had = whyOf.get(whyKey(e.target.kind, e.target.id));
        const original = had?.original ?? had?.text;
        whyOf.set(whyKey(e.target.kind, e.target.id), {
          text: e.text,
          by: "you",
          status: "accepted",
          ...(original === undefined ? {} : { original }),
        });
        break;
      }
      case "argument-written":
        argument = { id: e.id, text: e.text, basis: e.basis, ts: e.ts, decision: e.awaitsDecision === true ? "suggested" : "legacy" };
        if (e.awaitsDecision !== true) acceptedArgument = { argumentId: e.id, text: e.text, by: "legacy", ts: e.ts };
        break;
      /* M93, ISC-762. */
      case "argument-accepted":
        acceptedArgument = { argumentId: e.argumentId, text: e.text, by: e.edited ? "you" : "abductive", ts: e.ts };
        argument = decided(argument, e.argumentId, "accepted");
        break;
      case "draft-declined":
        if (e.kind !== "argument") break;
        argumentDeclined.add(e.draftId);
        argument = decided(argument, e.draftId, "rejected");
        if (acceptedArgument?.argumentId === e.draftId && acceptedArgument.by === "legacy") acceptedArgument = null;
        break;
      case "concept-flag":
        conceptFlags.push({ event: e });
        break;
      default:
        break;
    }
  }

  const accepted = new Set([...cards.values()].filter((c) => c.status === "accepted").map((c) => c.id));
  const liveLinks = [...links.values()].filter((l) => accepted.has(l.from) && accepted.has(l.to));
  const liveRelations = new Set(liveLinks.map((l) => l.id));

  // Statements: every live claim, plus the new statements, each under the
  // accepted concept or the live relation it was last placed under.
  const place = (id: string) => {
    const at = placement.get(id);
    return {
      conceptId: at?.kind === "concept" && accepted.has(at.id) ? at.id : null,
      relationId: at?.kind === "relation" && liveRelations.has(at.id) ? at.id : null,
    };
  };
  const statements = new Map<string, Statement>();
  const places = turnPlaces(events, projectId);
  for (const page of livePages(graph)) {
    statements.set(page.id, {
      id: page.id,
      kind: "claim",
      text: page.title,
      body: page.body,
      ...place(page.id),
      chunks: page.supportingChunks,
      ...(page.supportingTurn === undefined ? {} : { turn: page.supportingTurn }),
      origin: page.origin,
      pageType: page.type,
      ...(page.heldBy === undefined ? {} : { heldBy: page.heldBy }),
      from: pageFrom(page, places),
    });
  }
  for (const [id, s] of fresh) {
    statements.set(id, { ...s, ...place(id) });
  }

  const orderIndex = new Map<string, number>();
  placedOrder.forEach((id, i) => orderIndex.set(id, i));
  const heldBy = (pick: (s: Statement) => string | null, id: string) =>
    [...statements.values()]
      .filter((s) => pick(s) === id)
      .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0))
      .map((s) => s.id);
  const finished = new Map<string, ConceptCard>();
  for (const c of cards.values()) {
    finished.set(c.id, {
      id: c.id,
      name: c.name,
      definition: c.definition,
      status: c.status,
      ...(c.origin === undefined ? {} : { origin: c.origin }),
      original: c.original,
      properties: [...c.properties.values()],
      statementIds: heldBy((s) => s.conceptId, c.id),
      source: c.source,
      ...(c.status === "suggested" && c.suggestion !== undefined ? { suggestion: c.suggestion } : {}),
      ...(c.reason === undefined ? {} : { reason: c.reason }),
      suggestedAt: c.suggestedAt,
      ...(c.decidedAt === undefined ? {} : { decidedAt: c.decidedAt }),
      why: c.status === "accepted" || c.status === "retired" ? (whyOf.get(whyKey("concept", c.id)) ?? null) : null,
      suggestedProperties:
        c.status === "accepted" && c.unbundled === true && c.suggestion !== undefined
          ? c.suggestion.properties.filter(
              (p) =>
                !propertyDecided.has(propertyKey(c.id, p)) &&
                ![...c.properties.values()].some((had) => had.name.trim().toLowerCase() === p.trim().toLowerCase()),
            )
          : [],
      ...(c.suggestion?.drawnFrom === undefined ? {} : { drawnFrom: c.suggestion.drawnFrom }),
    });
  }

  const list = [...finished.values()];

  /* M67, ISC-631. One card per live link, whether the researcher set it, a
     concept's acceptance set it, or it was accepted as a suggestion; and one
     per suggestion still waiting or rejected. */
  const relationCards = new Map<string, RelationCard>();
  const cardOf = (r: MutableRelation | undefined, base: { id: string; from: string; to: string; relation: ConceptRelation }, status: ConceptStatus, at: number) => {
    const origin = relationOrigin.get(base.id);
    const link = links.get(base.id);
    return {
      id: base.id,
      from: base.from,
      to: base.to,
      relation: base.relation,
      claim: r?.claim ?? "",
      conditions: r?.conditions ?? "",
      status,
      ...(origin === undefined ? {} : { origin }),
      original: r?.original ?? null,
      ...(link?.source === undefined ? {} : { source: link.source }),
      statementIds: heldBy((s) => s.relationId, base.id),
      ...(r?.suggestion === undefined ? {} : { madeFrom: r.suggestion.source }),
      grounds: r?.suggestion?.grounds ?? [],
      groundsSaid: (r?.suggestion?.grounds ?? []).flatMap((key) => {
        const edge = graph.edges.get(key);
        if (edge === undefined) return [];
        const title = (id: string) => (graph.pages.get(id)?.title ?? "a claim").replace(/[.\s]+$/, "");
        const verb = graph.relations.find((x) => x.edgeId === key)?.relation ?? edge.role.replace(/-/g, " ");
        return [`"${title(edge.from)}" ${verb} "${title(edge.to)}"`];
      }),
      ...(status === "suggested" && r?.suggestion !== undefined ? { suggestion: r.suggestion } : {}),
      ...(r?.reason === undefined ? {} : { reason: r.reason }),
      suggestedAt: r?.suggestedAt ?? at,
      ...(r?.decidedAt === undefined ? {} : { decidedAt: r.decidedAt }),
      why: status === "accepted" ? (whyOf.get(whyKey("relation", base.id)) ?? null) : null,
      restsOn: r?.suggestion?.restsOn ?? [],
      ...(r?.suggestion?.drawnFrom === undefined ? {} : { drawnFrom: r.suggestion.drawnFrom }),
    } satisfies RelationCard;
  };
  for (const l of liveLinks) relationCards.set(l.id, cardOf(rels.get(l.id), l, "accepted", 0));
  for (const [id, r] of rels) {
    if (relationCards.has(id) || r.suggestion === undefined) continue;
    if (r.status === "accepted") continue; // accepted, then removed: History keeps it
    relationCards.set(id, cardOf(r, { id, from: r.from, to: r.to, relation: r.relation }, r.status, r.suggestedAt));
  }
  const relationList = [...relationCards.values()];

  const latest = reports[reports.length - 1];
  const flagsAt = new Map<string, ConceptFlag[]>();
  for (const { event } of conceptFlags) {
    if (latest === undefined || event.ts < latest.ts) continue;
    const list = flagsAt.get(event.conceptId) ?? [];
    list.push({ findingId: event.findingId, rule: event.rule, reason: event.reason, ts: event.ts });
    flagsAt.set(event.conceptId, list);
  }

  /* A residue statement under a relation is filed under the relation's first concept (M67). */
  const residueHome = (s: Statement | undefined) =>
    s === undefined ? "" : (s.conceptId ?? (s.relationId === null ? "" : (links.get(s.relationId)?.from ?? "")));
  const allLines = [...lines.values()].map((l) =>
    l.kind === "residue" && l.targetId !== undefined
      ? { ...l, conceptId: residueHome(statements.get(l.targetId)) }
      : l,
  );
  /* M82 (the lead's ruling A): a statement placed under a concept that the
     researcher then retired goes back to place, a new statement as well as a claim. */
  const retiredHome = (id: string) => {
    const at = placement.get(id);
    return at?.kind === "concept" && cards.get(at.id)?.status === "retired";
  };
  const unplaced = [...statements.values()].filter(
    (s) => (s.kind === "claim" || retiredHome(s.id)) && s.conceptId === null && s.relationId === null,
  );

  /* ISC-634. A proposal stands while its statement is still to place and its
     home is a concept or a relation that is accepted or still suggested. */
  const stands = (home: StatementHome) =>
    home.kind === "concept"
      ? finished.get(home.id)?.status === "accepted" || finished.get(home.id)?.status === "suggested"
      : relationCards.get(home.id) !== undefined && relationCards.get(home.id)?.status !== "rejected";
  const homes = new Map<string, StatementHome>();
  for (const s of unplaced) {
    const home = homeOf.get(s.id);
    if (home !== undefined && stands(home)) homes.set(s.id, home);
  }
  const proposalHomes = new Map<string, StatementHome>();
  for (const [id, home] of homeOf) if (!statements.has(id) && stands(home)) proposalHomes.set(id, home);

  const view: ProjectOntologyView = {
    concepts: finished,
    suggested: list.filter((c) => c.status === "suggested"),
    accepted: list.filter((c) => c.status === "accepted").sort((a, b) => (a.decidedAt ?? 0) - (b.decidedAt ?? 0)),
    rejected: list.filter((c) => c.status === "rejected"),
    statements,
    unplaced,
    toPlace: unplaced.filter((s) => inInbox(s.from)),
    links: liveLinks,
    lookFor: [...allLines.filter((l) => l.settled === null), ...allLines.filter((l) => l.settled !== null)],
    flagsAt,
    reports,
    relations: relationCards,
    suggestedRelations: relationList.filter((r) => r.status === "suggested"),
    acceptedRelations: relationList.filter((r) => r.status === "accepted"),
    homes,
    homesRead,
    proposalHomes,
    suggestedStatements: [...statementSuggestions.values()].filter((s) => !statementRejected.has(s.statementId) && !placement.has(s.statementId)),
    argument,
    acceptedArgument,
  };
  /* M74a, ISC-663: each line in the current names (see `lineNow`). */
  return { ...view, lookFor: view.lookFor.map((l) => ({ ...l, text: lineNow(view, l) })) };
}

/** The paragraph with the researcher's decision on it, when the decision is about this paragraph (M93). */
function decided(argument: ArgumentView | null, id: string, decision: ArgumentView["decision"]): ArgumentView | null {
  return argument !== null && argument.id === id ? { ...argument, decision } : argument;
}

interface MutableRelation {
  claim: string;
  conditions: string;
  status: ConceptStatus;
  original: { relation: ConceptRelation; claim: string } | null;
  suggestion?: RelationSuggestedEvent;
  reason?: string;
  suggestedAt: number;
  decidedAt?: number;
  from: string;
  to: string;
  relation: ConceptRelation;
}

/** The card a claim, conditions or refinement lands on: the suggestion's, or one opened for a relation set without one. */
function relCard(rels: Map<string, MutableRelation>, relationId: string, ts: number): MutableRelation {
  const had = rels.get(relationId);
  if (had !== undefined) return had;
  const opened: MutableRelation = {
    claim: "",
    conditions: "",
    status: "accepted",
    original: null,
    suggestedAt: ts,
    from: "",
    to: "",
    relation: "leads-to",
  };
  rels.set(relationId, opened);
  return opened;
}

/** The passages and answers behind one accepted concept. */
export function evidenceBehind(
  view: ProjectOntologyView,
  conceptId: string,
): { readonly passages: readonly string[]; readonly answers: readonly string[] } {
  const card = view.concepts.get(conceptId);
  const passages = new Set<string>();
  const answers = new Set<string>();
  if (card === undefined) return { passages: [], answers: [] };
  if (card.source.kind === "data") for (const c of card.source.chunkIds) passages.add(c);
  if (card.source.kind === "summary") answers.add(card.source.station);
  for (const id of card.statementIds) {
    const s = view.statements.get(id);
    if (s === undefined) continue;
    for (const c of s.chunks) passages.add(c);
    if (s.answer !== undefined) answers.add(s.answer);
    if (s.turn !== undefined) answers.add(`turn:${s.turn}`);
  }
  for (const l of view.links) {
    if (l.from !== conceptId && l.to !== conceptId) continue;
    if (l.source?.kind === "passage") passages.add(l.source.chunkId);
    if (l.source?.kind === "answer") answers.add(l.source.subject);
  }
  return { passages: [...passages], answers: [...answers] };
}

/**
 * The passages and answers behind one relation (M67, ISC-631, ISC-635): the
 * passage or answer it was set from, what its suggestion was made from, and
 * what the statements placed under it cite.
 */
export function evidenceBehindRelation(
  view: ProjectOntologyView,
  relationId: string,
): { readonly passages: readonly string[]; readonly answers: readonly string[] } {
  const card = view.relations.get(relationId);
  const passages = new Set<string>();
  const answers = new Set<string>();
  if (card === undefined) return { passages: [], answers: [] };
  if (card.source?.kind === "passage") passages.add(card.source.chunkId);
  if (card.source?.kind === "answer") answers.add(card.source.subject);
  if (card.madeFrom?.kind === "summary") answers.add(card.madeFrom.station);
  if (card.madeFrom?.kind === "data") for (const c of card.madeFrom.chunkIds) passages.add(c);
  /* M82, ISC-694: what a relation from the Relate concepts pass rests on. */
  const grounds = card.restsOn.flatMap((g) => (g.kind === "statement" ? [g.statementId] : []));
  for (const g of card.restsOn) if (g.kind === "passage") passages.add(g.chunkId);
  for (const id of [...card.statementIds, ...grounds]) {
    const s = view.statements.get(id);
    if (s === undefined) continue;
    for (const c of s.chunks) passages.add(c);
    if (s.answer !== undefined) answers.add(s.answer);
    if (s.turn !== undefined) answers.add(`turn:${s.turn}`);
  }
  return { passages: [...passages], answers: [...answers] };
}

/** A relation's claim sentence, written and free of the gap marker. */
export function claimWritten(card: RelationCard): boolean {
  return card.claim.trim() !== "" && !hasGapMarker(card.claim);
}

const bareWord = (w: string) => w.replace(/['’]s$/, "").replace(/[^A-Za-z-]/g, "");

/**
 * The words whose capital is part of the word (the lead's ruling, M67): every
 * capitalised word in the project's own concept names, and every capitalised
 * word that a statement uses away from the start of a sentence, which is how a
 * person's name or a place shows itself ("Mentors say Ravi runs the room").
 */
export function keptCapitals(view: ProjectOntologyView): ReadonlySet<string> {
  const out = new Set<string>();
  for (const c of view.concepts.values()) for (const w of c.name.split(/[\s/]+/)) if (/^[A-Z]/.test(w)) out.add(bareWord(w));
  for (const s of view.statements.values()) {
    for (const sentence of s.text.split(/(?<=[.!?:;])\s+/)) {
      for (const w of sentence.trim().split(/\s+/).slice(1)) if (/^[A-Z][a-z]/.test(w)) out.add(bareWord(w));
    }
  }
  return out;
}

/**
 * The relation as the middle of "Watch whether …": the researcher's claim when
 * they have written one, or the relation between the two names. The claim's
 * opening capital is lowered for an ordinary word and kept for an acronym (a
 * word whose second letter is a capital too) or a word in `kept`, so "Ravi
 * gives…" reads "Watch whether Ravi gives…".
 */
export function watchClause(card: RelationCard, name: (id: string) => string, kept: ReadonlySet<string> = new Set()): string {
  if (claimWritten(card)) {
    const said = card.claim.trim().replace(/[.\s]+$/, "");
    const word = said.split(/\s+/)[0] ?? "";
    const acronym = /^[A-Z][A-Z]/.test(word);
    if (acronym || kept.has(bareWord(word)) || !/^[A-Z]/.test(said)) return said;
    return `${said.charAt(0).toLowerCase()}${said.slice(1)}`;
  }
  return relationSentence(name(card.from), card.relation, name(card.to));
}

/* ── The lines to look for, one builder per source (M74a, ISC-663) ──────────
 *
 * The walk of 2026-10-02 (finding 14) read eight lines in one template ("Watch
 * for variation in who argues across your cases of Arguing about it."), and the
 * lines kept the concept's name from the day they were raised, so after the
 * student refined the concept they still named "Arguing about it". A line's
 * words now come from the property, relation, concept or statement it is about,
 * and the projection rebuilds them from the current names whenever it reads
 * them; the stored text is History's record of the line as raised.
 */

const WH_WORD = /^(what|which|who|whose|how|when|where|why)\s+(.+)$/i;
const AUX_WORD = /^(.+?)\s+(is|are|was|were|can|could|will|would|should|has|have|had|does|do|did)\b\s*(.*)$/i;
const SUBJECT_HEAD = /^(?:it|they|he|she|we|you|people|someone|everyone|the|a|an|this|that|these|those|their|your|his|her|its|each)$/i;
const DETERMINER = /^(?:the|a|an|this|that|these|those|their|your|his|her|its|each)$/i;
const HOW_WHAT = /^(?:often|much|many|long|far|well|soon|quickly|frequently)$/i;
/* M78a, ISC-680: the subjects a wh-phrase's noun can run up to ("which days they
   happen on"), and the words that open a phrase with no verb ("how long after
   the bench"). */
const PRONOUN_SUBJECT = /^(?:it|they|he|she|we|you|people|someone|everyone)$/i;
const NO_VERB_OPENER = /^(?:after|before|between|during|until|since|in|on|at|from|to|with|without|across|over|under)$/i;
/* The irregular pasts a property is likely to carry: "where the encounter took place" asks "where did the encounter take place?". */
const IRREGULAR_PAST: Readonly<Record<string, string>> = {
  took: "take", came: "come", went: "go", made: "make", gave: "give", got: "get", saw: "see", said: "say",
  found: "find", left: "leave", began: "begin", brought: "bring", thought: "think", told: "tell", felt: "feel",
  kept: "keep", ran: "run", sat: "sit", stood: "stand", met: "meet", heard: "hear", knew: "know", wrote: "write",
  chose: "choose", spoke: "speak", fell: "fall", grew: "grow", became: "become", put: "put", set: "set", led: "lead",
  sent: "send", spent: "spend", built: "build", lost: "lose", paid: "pay", sold: "sell", taught: "teach", won: "win",
};

/** "what the argument is about" as "what is the argument about?", or null when the phrase is not a wh-clause it can turn. */
export function asQuestion(phrase: string): string | null {
  const p = phrase.trim().replace(/[.?!]+$/, "");
  const m = WH_WORD.exec(p);
  if (m === null) return null;
  let wh = (m[1] ?? "").toLowerCase();
  let words = (m[2] ?? "").trim().split(/\s+/);
  /* "how often it happens": the adverb belongs to the wh-word. */
  if (wh === "how" && HOW_WHAT.test(words[0] ?? "")) {
    wh = `how ${(words[0] ?? "").toLowerCase()}`;
    words = words.slice(1);
  }
  /* M78a: a noun inside the wh-phrase, before a pronoun subject: "which days they
     happen on" is "which days" asking about "they happen on". */
  if (/^(?:which|what|whose)$/.test(wh) && !SUBJECT_HEAD.test(words[0] ?? "")) {
    const at = words.findIndex((w, i) => i > 0 && i <= 3 && PRONOUN_SUBJECT.test(w));
    if (at > 0) {
      wh = `${wh} ${words.slice(0, at).join(" ")}`;
      words = words.slice(at);
    }
  }
  const rest = words.join(" ");
  if (rest === "") return null;
  /* M78a: a phrase with no verb stays a short question ("how long after the bench?"). */
  if (NO_VERB_OPENER.test(words[0] ?? "")) return `${wh} ${rest}?`;
  /* how, when, where and why ask about a subject that follows them, so a bare
     noun there ("how volunteers decide") is the subject, as a pronoun is. */
  const subjectFollows = /^(?:how|when|where|why)(?: (?:often|long|far|well|soon|quickly|frequently))?$/.test(wh);
  const aux = AUX_WORD.exec(rest);
  if (aux !== null && SUBJECT_HEAD.test(words[0] ?? "")) {
    const tail = (aux[3] ?? "").trim();
    return `${wh} ${(aux[2] ?? "").toLowerCase()} ${aux[1]}${tail === "" ? "" : ` ${tail}`}?`;
  }
  if (SUBJECT_HEAD.test(words[0] ?? "") || subjectFollows) {
    const subjectLength = DETERMINER.test(words[0] ?? "") ? 2 : 1;
    const verb = words[subjectLength];
    if (verb === undefined) return null;
    const after = words.slice(subjectLength + 1).join(" ");
    const subject = words.slice(0, subjectLength).join(" ");
    const irregular = IRREGULAR_PAST[verb.toLowerCase()];
    if (irregular !== undefined) {
      return `${wh} did ${subject} ${irregular}${after === "" ? "" : ` ${after}`}?`;
    }
    const base = /ies$/.test(verb)
      ? `${verb.slice(0, -3)}y`
      : /(?:sses|shes|ches|xes|zes|oes)$/.test(verb)
        ? verb.slice(0, -2)
        : /[^s]s$/.test(verb)
          ? verb.slice(0, -1)
          : null;
    if (base === null && /ed$/.test(verb)) return null;
    const did = base === null ? "do" : "does";
    return `${wh} ${did} ${subject} ${base ?? verb}${after === "" ? "" : ` ${after}`}?`;
  }
  return `${wh} ${rest}?`;
}

/** A property that varies: a question to ask in each case, or a comparison across them. */
export function propertyLine(property: string, concept: string): string {
  /* M78a, ISC-680: the walk read "compare [...]." twice. */
  if (hasGapMarker(property)) return gapLine(concept);
  const question = asQuestion(property);
  return question === null
    ? `Across your cases of ${concept}, compare ${property.trim().replace(/[.\s]+$/, "")}.`
    : `In each case of ${concept}, ${question}`;
}

/** A concept with nothing behind it yet. */
export function evidenceLine(concept: string): string {
  return `Find a passage, or ask a question in the field, that shows ${concept} in your setting.`;
}

/** A claim that the ontology can't yet explain. */
export function residueLine(statement: string): string {
  return `Find the explanation for ${statement.replace(/[.\s]+$/, "")}; an account of it in your ontology is still to come.`;
}

/** A relation with no evidence behind it, in the words of its claim. */
export function relationLine(card: RelationCard, name: (id: string) => string, kept: ReadonlySet<string>): string {
  return `Watch whether ${watchClause(card, name, kept)}, and under which conditions.`;
}

/** A raised line's words from the current names, or its stored words when its subject has gone. */
function lineNow(view: ProjectOntologyView, line: LookForLine): string {
  const name = (id: string) => view.concepts.get(id)?.name ?? "this concept";
  switch (line.kind) {
    case "property": {
      const card = view.concepts.get(line.conceptId);
      const p = card?.properties.find((x) => x.id === line.targetId);
      return card === undefined || p === undefined ? line.text : propertyLine(p.name, card.name);
    }
    case "evidence": {
      const card = view.concepts.get(line.conceptId);
      return card === undefined ? line.text : evidenceLine(card.name);
    }
    case "relation": {
      const card = line.targetId === undefined ? undefined : view.relations.get(line.targetId);
      return card === undefined ? line.text : relationLine(card, name, keptCapitals(view));
    }
    case "residue": {
      const s = line.targetId === undefined ? undefined : view.statements.get(line.targetId);
      if (s !== undefined && hasGapMarker(s.text)) return gapLine(view.concepts.get(line.conceptId)?.name ?? "this statement");
      return s === undefined ? line.text : residueLine(s.text);
    }
  }
}

/** A line the ontology needs now, whether or not it has been raised. */
export interface NeededLine {
  readonly itemId: string;
  readonly conceptId: string;
  readonly kind: LookForKind;
  readonly targetId?: string;
  readonly text: string;
}

/** The id a line is raised under: stable, so one condition is raised once. */
export function lineId(kind: LookForKind, conceptId: string, targetId?: string): string {
  return `look:${kind}:${conceptId}${targetId === undefined ? "" : `:${targetId}`}`;
}

/**
 * The lines "What to look for in the field" needs for the ontology as it stands
 * (ISC-609): for each accepted concept, one per undefined property, one per
 * relation with no passage behind it, and one when nothing is behind the
 * concept at all. Each line is an instruction to the researcher, so it names
 * the thing to observe or ask and gives no act to a concept (L17).
 */
export function lookForNeeded(view: ProjectOntologyView): readonly NeededLine[] {
  const out: NeededLine[] = [];
  const name = (id: string) => view.concepts.get(id)?.name ?? "this concept";
  for (const card of view.accepted) {
    for (const p of card.properties) {
      if (p.varies !== undefined) continue;
      out.push({
        itemId: lineId("property", card.id, p.id),
        conceptId: card.id,
        kind: "property",
        targetId: p.id,
        text: propertyLine(p.name, card.name),
      });
    }
    const { passages, answers } = evidenceBehind(view, card.id);
    if (passages.length === 0 && answers.length === 0) {
      out.push({
        itemId: lineId("evidence", card.id),
        conceptId: card.id,
        kind: "evidence",
        text: evidenceLine(card.name),
      });
    }
  }
  /* The lead's ruling (M63): what the account cannot yet explain is something
     to look for, so each live analytic-residue claim is a line, under the concept
     its statement sits under or under none while unplaced. */
  for (const s of view.statements.values()) {
    if (s.kind !== "claim" || s.pageType !== "analytic-residue") continue;
    out.push({
      itemId: lineId("residue", "", s.id),
      conceptId: s.conceptId ?? (s.relationId === null ? "" : (view.relations.get(s.relationId)?.from ?? "")),
      kind: "residue",
      targetId: s.id,
      text: hasGapMarker(s.text)
        ? gapLine(view.concepts.get(s.conceptId ?? "")?.name ?? "this statement")
        : residueLine(s.text),
    });
  }
  /* M67, ISC-635: one line per relation with no evidence behind it, in the
     words of its claim. */
  const kept = keptCapitals(view);
  for (const card of view.acceptedRelations) {
    const { passages, answers } = evidenceBehindRelation(view, card.id);
    if (passages.length > 0 || answers.length > 0) continue;
    out.push({
      itemId: lineId("relation", card.from, card.id),
      conceptId: card.from,
      kind: "relation",
      targetId: card.id,
      text: relationLine(card, name, kept),
    });
  }
  return out;
}

/** A line whose source carries the gap marker [...] (M78a, ISC-680): the gap comes first. */
export function gapLine(concept: string): string {
  return `Fill the gap in ${concept} first.`;
}
/**
 * How many statements sit under an accepted concept or relation (M78a, ISC-679).
 * Since M75 a placed statement is what a claim was, so Checks' read-back and
 * Export's claims count read this: the walk read "Your first claim is still to
 * come." and CLAIMS 0 beside 38 placed statements.
 */
export function placedStatementCount(view: ProjectOntologyView): number {
  let n = 0;
  for (const s of view.statements.values()) if (s.conceptId !== null || s.relationId !== null) n += 1;
  return n;
}

/**
 * The accepted concepts with no accepted relation (M82, ISC-694), in the order
 * accepted. The owner, 2026-10-04: "It seems like there are only dyads that are
 * independent of one another." A concept that stands alone does no work in the
 * argument yet, so the readiness row names it and the map's caption counts it.
 * One accepted concept has nothing to relate to, so the list is empty below two.
 */
export function loneConcepts(view: ProjectOntologyView): readonly ConceptCard[] {
  if (view.accepted.length < 2) return [];
  const related = new Set(view.links.flatMap((l) => [l.from, l.to]));
  return view.accepted.filter((c) => !related.has(c.id));
}
