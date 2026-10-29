/**
 * The one writer of a concept event (M63, ISC-608).
 *
 * `proposals/adjudicate.ts` is the only writer of an ontology mutation, so the
 * rules about origins, paper keys and edge roles live in one place. This file is
 * the same rule for the emerging project ontology: every act a researcher takes
 * on a concept is built here, and each act brings the lines to look for in the
 * field up to date in the same append, so the list and the ontology never
 * disagree for the length of a render.
 *
 * The builders are pure (events in, events out) so a test can hold them to the
 * rules; `conceptAct` below reads the ledger, builds, validates and appends.
 */

import {
  assertValidEvent,
  type Actor,
  type ConceptEvidence,
  type ConceptRelation,
  type ConceptSource,
  type LedgerEvent,
  type StatementHome,
  type WhyTarget,
} from "../ledger/events.ts";
import { projectOntology } from "../ontology/projection.ts";
import { relationSentence } from "./vocabulary.ts";
import {
  lookForNeeded,
  markOf,
  projectConcepts,
  evidenceBehind,
  evidenceBehindRelation,
  type ProjectOntologyView,
} from "./projection.ts";

export interface DoorClock {
  readonly now?: () => number;
  readonly makeId?: () => string;
}

function tick(clock: DoorClock | undefined) {
  const now = clock?.now ?? (() => Date.now());
  const makeId = clock?.makeId ?? (() => crypto.randomUUID());
  return { now, makeId };
}

function view(events: readonly LedgerEvent[], projectId: string): ProjectOntologyView {
  return projectConcepts(events, projectId, projectOntology(events, projectId));
}

/**
 * The lines the ontology needs after `pending` is appended to `events`: a raise
 * for each needed line never raised, and a settle for each open line whose
 * condition no longer stands. A line cleared by a passage is settled by that
 * passage, as Abductive's act; any other clearing is the act that cleared it,
 * so it is settled by `actor`.
 */
export function lookForSync(
  events: readonly LedgerEvent[],
  pending: readonly LedgerEvent[],
  projectId: string,
  actor: Actor,
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const after = view([...events, ...pending], projectId);
  const needed = lookForNeeded(after);
  const neededIds = new Set(needed.map((l) => l.itemId));
  const raised = new Map(after.lookFor.map((l) => [l.itemId, l] as const));
  const out: LedgerEvent[] = [];
  for (const line of needed) {
    if (raised.has(line.itemId)) continue;
    out.push({
      id: makeId(),
      ts: now(),
      actor: "system",
      projectId,
      type: "look-for-raised",
      itemId: line.itemId,
      conceptId: line.conceptId,
      kind: line.kind,
      ...(line.targetId === undefined ? {} : { targetId: line.targetId }),
      text: line.text,
    });
  }
  for (const line of after.lookFor) {
    if (line.settled !== null || neededIds.has(line.itemId)) continue;
    const passage = clearingPassage(after, line);
    out.push(
      passage === null
        ? { id: makeId(), ts: now(), actor, projectId, type: "look-for-settled", itemId: line.itemId, by: "researcher" }
        : { id: makeId(), ts: now(), actor: "system", projectId, type: "look-for-settled", itemId: line.itemId, by: "passage", chunkId: passage },
    );
  }
  return out;
}

function clearingPassage(v: ProjectOntologyView, line: ProjectOntologyView["lookFor"][number]): string | null {
  if (line.kind === "relation") return line.targetId === undefined ? null : (evidenceBehindRelation(v, line.targetId).passages[0] ?? null);
  if (line.kind === "evidence") return evidenceBehind(v, line.conceptId).passages[0] ?? null;
  return null;
}

function finish(
  events: readonly LedgerEvent[],
  projectId: string,
  written: readonly LedgerEvent[],
  clock?: DoorClock,
): readonly LedgerEvent[] {
  return [...written, ...lookForSync(events, written, projectId, "human", clock)];
}

function card(events: readonly LedgerEvent[], projectId: string, conceptId: string) {
  const c = view(events, projectId).concepts.get(conceptId);
  if (c === undefined) throw new Error("Abductive couldn't find that concept.");
  return c;
}

/**
 * Accept a suggested concept (M93, ISC-764): its name and definition, and
 * nothing else. The owner's proposal states that over-reliance is measured from
 * what the researcher accepts, and that fails while one Accept writes several
 * decisions. So the suggestion's properties, its relations, its Why it matters
 * line and the statements suggested under it stay suggested, each with its own
 * decision; `unbundled` on the event is what tells the projection so. Before
 * M93 this wrote the properties, the statements and the relations beside it.
 */
export function acceptConceptEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly conceptId: string; readonly bulk?: boolean },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const { projectId, conceptId } = input;
  const v = view(events, projectId);
  const c = v.concepts.get(conceptId);
  if (c === undefined) throw new Error("Abductive couldn't find that concept.");
  if (c.status !== "suggested" || c.suggestion === undefined) return finish(events, projectId, [], clock);
  const out: LedgerEvent[] = [
    {
      id: makeId(),
      ts: now(),
      actor: "human",
      projectId,
      type: "concept-accepted",
      conceptId,
      origin: markOf(c.suggestion.source),
      unbundled: true,
      ...(input.bulk === true ? { bulk: true as const } : {}),
    },
  ];
  return finish(events, projectId, out, clock);
}

/** Accept one property that a concept's suggestion carried (M93, ISC-764), as a property of the accepted concept. */
export function acceptPropertyEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly conceptId: string; readonly name: string; readonly bulk?: boolean },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const c = card(events, input.projectId, input.conceptId);
  if (c.status !== "accepted") throw new Error("Accept the concept first, and then its properties.");
  if (!c.suggestedProperties.includes(input.name)) return [];
  return finish(
    events,
    input.projectId,
    [
      {
        id: makeId(),
        ts: now(),
        actor: "human",
        projectId: input.projectId,
        type: "concept-property-set",
        conceptId: input.conceptId,
        propertyId: makeId(),
        name: input.name,
        suggested: input.name,
        ...(input.bulk === true ? { bulk: true as const } : {}),
      },
    ],
    clock,
  );
}

/** Reject one property that a concept's suggestion carried (M93, ISC-764), with an optional reason. */
export function rejectPropertyEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly conceptId: string; readonly name: string; readonly reason?: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const c = card(events, input.projectId, input.conceptId);
  if (!c.suggestedProperties.includes(input.name)) throw new Error("You can reject only a suggested property.");
  const reason = input.reason?.trim() ?? "";
  return [
    {
      id: makeId(),
      ts: now(),
      actor: "human",
      projectId: input.projectId,
      type: "property-rejected",
      conceptId: input.conceptId,
      name: input.name,
      ...(reason === "" ? {} : { reason }),
    },
  ];
}

/**
 * "Accept all" on a card (M93, ISC-764): one accept event per item, each marked
 * `bulk`, so History and the over-reliance count still read one decision per
 * thing kept. The concept, then each suggested property, its Why it matters
 * line, each relation it carried whose other end is in the ontology, and each
 * statement suggested under it. Anything blocked (a relation to a concept still
 * suggested) stays suggested.
 */
export function acceptAllOnCardEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly conceptId: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { projectId, conceptId } = input;
  /* The claims a pre-M67 suggestion named as its statements, read before the accept drops the suggestion. */
  const named = card(events, projectId, conceptId).suggestion?.statementIds ?? [];
  return chain(events, [
    (sofar) => acceptConceptEvents(sofar, { projectId, conceptId, bulk: true }, clock),
    (sofar) => {
      const c = card(sofar, projectId, conceptId);
      return chain(
        sofar,
        c.suggestedProperties.map((name) => (more: readonly LedgerEvent[]) => acceptPropertyEvents(more, { projectId, conceptId, name, bulk: true }, clock)),
      );
    },
    (sofar) => acceptWhyEvents(sofar, { projectId, target: { kind: "concept", id: conceptId }, bulk: true }, clock),
    (sofar) => {
      const v = view(sofar, projectId);
      const ready = v.suggestedRelations.filter(
        (r) => (r.from === conceptId || r.to === conceptId) && [r.from, r.to].every((id) => v.concepts.get(id)?.status === "accepted"),
      );
      return chain(sofar, ready.map((r) => (more: readonly LedgerEvent[]) => acceptRelationEvents(more, { projectId, relationId: r.id, bulk: true }, clock)));
    },
    (sofar) => {
      const v = view(sofar, projectId);
      const homed = v.suggestedStatements.filter((x) => x.home.kind === "concept" && x.home.id === conceptId);
      return chain(
        sofar,
        homed.map((x) => (more: readonly LedgerEvent[]) => acceptStatementEvents(more, { projectId, statementId: x.statementId, bulk: true }, clock)),
      );
    },
    (sofar) => {
      const v = view(sofar, projectId);
      const waiting = named.filter((id) => v.homes.get(id)?.id === conceptId);
      return chain(
        sofar,
        waiting.map((pageId) => (more: readonly LedgerEvent[]) => placeStatementEvents(more, { projectId, conceptId, pageId, bulk: true }, clock)),
      );
    },
  ]);
}

/** A concept the researcher writes themselves: marked as theirs from the start. */
export function addConceptEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly name: string; readonly definition: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const name = input.name.trim();
  const definition = input.definition.trim();
  if (name === "") throw new Error("Name the concept first.");
  const written: LedgerEvent[] = [
    {
      id: makeId(),
      ts: now(),
      actor: "human",
      projectId: input.projectId,
      type: "concept-accepted",
      conceptId: makeId(),
      origin: "author-prior",
      name,
      ...(definition === "" ? {} : { definition }),
    },
  ];
  return finish(events, input.projectId, written, clock);
}

/**
 * Refine a concept's name or definition. On a suggestion, refining accepts it
 * with the edit, which is what "Refine" opening the card for editing means: the
 * researcher saves the concept in their own words.
 */
export function refineConceptEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly conceptId: string; readonly name?: string; readonly definition?: string; readonly why?: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const c = card(events, input.projectId, input.conceptId);
  if (c.status === "rejected") throw new Error("You rejected that concept. Abductive keeps it in History as it was.");
  if (c.status === "retired") throw new Error("You retired that concept. Abductive keeps it in History as it was.");
  const name = input.name?.trim();
  const definition = input.definition?.trim();
  const changedName = name !== undefined && name !== "" && name !== c.name ? name : undefined;
  const changedDef = definition !== undefined && definition !== "" && definition !== c.definition ? definition : undefined;
  const lead = c.status === "suggested" ? [...acceptConceptEvents(events, input, clock)] : [];
  const refined: LedgerEvent[] =
    changedName === undefined && changedDef === undefined
      ? []
      : [
          {
            id: makeId(),
            ts: now(),
            actor: "human",
            projectId: input.projectId,
            type: "concept-refined",
            conceptId: input.conceptId,
            ...(changedName === undefined ? {} : { name: changedName }),
            ...(changedDef === undefined ? {} : { definition: changedDef }),
          },
        ];
  /* M82, ISC-695: the Why it matters line is edited in the same form as the definition. */
  const why = whyRefined([...events, ...lead], input.projectId, { kind: "concept", id: input.conceptId }, input.why, clock);
  const written = [...refined, ...why];
  if (lead.length === 0) return finish(events, input.projectId, written, clock);
  return [...lead, ...written, ...lookForSync([...events, ...lead], written, input.projectId, "human", clock)];
}

/**
 * The researcher's own words for a card's Why it matters line (M82, ISC-695),
 * or nothing when the words are empty or match the line as it stands.
 */
function whyRefined(
  events: readonly LedgerEvent[],
  projectId: string,
  target: WhyTarget,
  text: string | undefined,
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const said = text?.trim() ?? "";
  if (said === "") return [];
  const v = view(events, projectId);
  const now = target.kind === "concept" ? v.concepts.get(target.id)?.why : v.relations.get(target.id)?.why;
  if (now?.text === said) return [];
  const { now: at, makeId } = tick(clock);
  return [{ id: makeId(), ts: at(), actor: "human", projectId, type: "why-refined", target, text: said }];
}

/** Accept the Why it matters line that Abductive wrote for an accepted card, as it stands (M82, ISC-695). */
export function acceptWhyEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly target: WhyTarget; readonly bulk?: boolean },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const v = view(events, input.projectId);
  const line = input.target.kind === "concept" ? v.concepts.get(input.target.id)?.why : v.relations.get(input.target.id)?.why;
  if (line == null || line.status !== "suggested") return [];
  const { now, makeId } = tick(clock);
  return [
    {
      id: makeId(),
      ts: now(),
      actor: "human",
      projectId: input.projectId,
      type: "why-accepted",
      target: input.target,
      ...(input.bulk === true ? { bulk: true as const } : {}),
    },
  ];
}

/**
 * Reject the line Abductive wrote for a card (M93, ISC-765), with an optional
 * reason. The card keeps no line from Abductive, and Abductive doesn't write
 * one again; Refine still takes the researcher's own.
 */
export function rejectWhyEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly target: WhyTarget; readonly reason?: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const v = view(events, input.projectId);
  const line = input.target.kind === "concept" ? v.concepts.get(input.target.id)?.why : v.relations.get(input.target.id)?.why;
  if (line == null || line.status !== "suggested") throw new Error("You can reject only a suggested Why it matters line.");
  const { now, makeId } = tick(clock);
  const reason = input.reason?.trim() ?? "";
  return [
    {
      id: makeId(),
      ts: now(),
      actor: "human",
      projectId: input.projectId,
      type: "why-rejected",
      target: input.target,
      ...(reason === "" ? {} : { reason }),
    },
  ];
}

/**
 * Retire an accepted concept, with the researcher's reason (M82, the lead's
 * ruling A). Each relation that joins it goes first, with its own removal and
 * the same reason; then the retirement. Its statements go back to Statements
 * to place by the projection, and the field lines it raised are settled.
 */
export function retireConceptEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly conceptId: string; readonly reason: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const reason = input.reason.trim();
  if (reason === "") throw new Error("Give your reason for retiring the concept. Abductive keeps your reason in History.");
  const v = view(events, input.projectId);
  const c = v.concepts.get(input.conceptId);
  if (c === undefined || c.status !== "accepted") throw new Error("You can retire only a concept in your ontology.");
  const env = () => ({ id: makeId(), ts: now(), actor: "human" as const, projectId: input.projectId });
  const written: LedgerEvent[] = [
    ...v.links
      .filter((l) => l.from === input.conceptId || l.to === input.conceptId)
      .map((l) => ({ ...env(), type: "concept-relation-removed" as const, relationId: l.id, reason })),
    { ...env(), type: "concept-retired", conceptId: input.conceptId, reason },
  ];
  return finish(events, input.projectId, written, clock);
}

/** Reject a suggested concept, with the researcher's reason. */
export function rejectConceptEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly conceptId: string; readonly reason: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const reason = input.reason.trim();
  if (reason === "") throw new Error("Give your reason for rejecting the concept. Abductive keeps your reason in History.");
  const c = card(events, input.projectId, input.conceptId);
  if (c.status !== "suggested") throw new Error("You can reject only a suggested concept.");
  return [
    { id: makeId(), ts: now(), actor: "human", projectId: input.projectId, type: "concept-rejected", conceptId: input.conceptId, reason },
  ];
}

/** Set, edit or remove a property. A new property gets a fresh id. */
export function setPropertyEvents(
  events: readonly LedgerEvent[],
  input: {
    readonly projectId: string;
    readonly conceptId: string;
    readonly propertyId?: string;
    readonly name: string;
    readonly varies?: string;
    readonly removed?: boolean;
  },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const name = input.name.trim();
  if (name === "") throw new Error("Name the property first.");
  const varies = input.varies?.trim();
  card(events, input.projectId, input.conceptId);
  return finish(
    events,
    input.projectId,
    [
      {
        id: makeId(),
        ts: now(),
        actor: "human",
        projectId: input.projectId,
        type: "concept-property-set",
        conceptId: input.conceptId,
        propertyId: input.propertyId ?? makeId(),
        name,
        ...(varies === undefined || varies === "" ? {} : { varies }),
        ...(input.removed === true ? { removed: true as const } : {}),
      },
    ],
    clock,
  );
}

/** Set one of the five relations, or set an existing one again with its source. */
export function setRelationEvents(
  events: readonly LedgerEvent[],
  input: {
    readonly projectId: string;
    readonly relationId?: string;
    readonly from: string;
    readonly to: string;
    readonly relation: ConceptRelation;
    readonly source?: ConceptEvidence;
  },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const v = view(events, input.projectId);
  for (const id of [input.from, input.to]) {
    if (v.concepts.get(id)?.status !== "accepted") throw new Error("Both ends of a relation are concepts in your ontology.");
  }
  return finish(
    events,
    input.projectId,
    [
      {
        id: makeId(),
        ts: now(),
        actor: "human",
        projectId: input.projectId,
        type: "concept-relation-set",
        relationId: input.relationId ?? makeId(),
        from: input.from,
        to: input.to,
        relation: input.relation,
        ...(input.source === undefined ? {} : { source: input.source }),
      },
    ],
    clock,
  );
}

export function removeRelationEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly relationId: string; readonly reason?: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const reason = input.reason?.trim();
  return finish(
    events,
    input.projectId,
    [
      {
        id: makeId(),
        ts: now(),
        actor: "human",
        projectId: input.projectId,
        type: "concept-relation-removed",
        relationId: input.relationId,
        ...(reason === undefined || reason === "" ? {} : { reason }),
      },
    ],
    clock,
  );
}

/** Place an existing claim under a concept ("Place under…"), which moves it if it sits elsewhere. */
export function placeStatementEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly conceptId: string; readonly pageId: string; readonly bulk?: boolean },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  if (card(events, input.projectId, input.conceptId).status !== "accepted") {
    throw new Error("Place a statement under a concept in your ontology.");
  }
  return finish(
    events,
    input.projectId,
    [
      {
        id: makeId(),
        ts: now(),
        actor: "human",
        projectId: input.projectId,
        type: "statement-attached",
        conceptId: input.conceptId,
        pageId: input.pageId,
        ...(input.bulk === true ? { bulk: true as const } : {}),
      },
    ],
    clock,
  );
}

/** The researcher settles a line in "What to look for in the field", with an optional note. */
export function settleLineEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly itemId: string; readonly note?: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const note = input.note?.trim();
  /* A line shows as soon as its condition does, and is recorded at the next
     act; settling one never raised raises it first, so the record has both. */
  const raised = lookForSync(events, [], input.projectId, "human", clock).filter(
    (e) => e.type === "look-for-raised",
  );
  return [
    ...raised,
    {
      id: makeId(),
      ts: now(),
      actor: "human",
      projectId: input.projectId,
      type: "look-for-settled",
      itemId: input.itemId,
      by: "researcher",
      ...(note === undefined || note === "" ? {} : { note }),
    },
  ];
}

export interface ConceptLedger {
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<unknown>;
  readonly readEvents: (projectId: string) => Promise<readonly LedgerEvent[]>;
}

/**
 * Read, build, validate and append, in that order, so a refused event never
 * reaches the record and the caller gets the reason in a sentence.
 */
export async function conceptAct(
  projectId: string,
  ledger: ConceptLedger,
  build: (events: readonly LedgerEvent[]) => readonly LedgerEvent[],
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> {
  try {
    const events = await ledger.readEvents(projectId);
    const written = build(events);
    for (const e of written) assertValidEvent(e);
    if (written.length > 0) await ledger.appendAll(written);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * The researcher answers "What in your material shows that?" at a line in What
 * to look for in the field, or at a flag on a concept's card (the lead's ruling,
 * M63). The answer, in their words, with the passage they point at, becomes a
 * statement under that concept, and the line it answered is settled by that
 * passage. This is the observation the old per-claim wiring attached to a claim
 * that owed evidence, rewired to the unit the ontology counts in.
 */
export function answerLineEvents(
  events: readonly LedgerEvent[],
  input: {
    readonly projectId: string;
    readonly conceptId: string;
    readonly text: string;
    readonly chunkId: string;
    readonly itemId?: string;
  },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const text = input.text.trim();
  if (text === "") throw new Error("Say, in your words, what the passage shows.");
  if (input.chunkId.trim() === "") throw new Error("Choose the passage that shows it.");
  if (card(events, input.projectId, input.conceptId).status !== "accepted") {
    throw new Error("Answer at a concept in your ontology.");
  }
  const raised = input.itemId === undefined ? [] : lookForSync(events, [], input.projectId, "human", clock).filter((e) => e.type === "look-for-raised");
  const written: LedgerEvent[] = [
    ...raised,
    {
      id: makeId(),
      ts: now(),
      actor: "human",
      projectId: input.projectId,
      type: "statement-attached",
      conceptId: input.conceptId,
      statementId: makeId(),
      text,
      source: { kind: "passage", chunkId: input.chunkId },
    },
    ...(input.itemId === undefined
      ? []
      : [
          {
            id: makeId(),
            ts: now(),
            actor: "human" as const,
            projectId: input.projectId,
            type: "look-for-settled" as const,
            itemId: input.itemId,
            by: "passage" as const,
            chunkId: input.chunkId,
          },
        ]),
  ];
  return [...written, ...lookForSync(events, written, input.projectId, "human", clock)];
}

// ── M67: relation cards and homes (ISC-631, ISC-633, ISC-634) ───────────────

function relationCard(events: readonly LedgerEvent[], projectId: string, relationId: string) {
  const r = view(events, projectId).relations.get(relationId);
  if (r === undefined) throw new Error("Abductive couldn't find that relation.");
  return r;
}

/** Run builders one after another, each over the record as the ones before it left it. */
function chain(
  events: readonly LedgerEvent[],
  steps: readonly ((sofar: readonly LedgerEvent[]) => readonly LedgerEvent[])[],
): readonly LedgerEvent[] {
  let written: LedgerEvent[] = [];
  for (const step of steps) written = [...written, ...step([...events, ...written])];
  return written;
}

function evidenceOf(source: ConceptSource): ConceptEvidence | undefined {
  if (source.kind === "summary") return { kind: "answer", subject: source.station };
  if (source.kind === "data" && source.chunkIds[0] !== undefined) return { kind: "passage", chunkId: source.chunkIds[0] };
  return undefined;
}

/**
 * Why a relation can't be accepted yet (M93, ISC-764), or null when it can: a
 * relation joins two concepts in the ontology, and accepting it never accepts
 * a concept at either end, so a suggested end blocks the accept and says why.
 */
export function relationBlocked(v: ProjectOntologyView, relationId: string): string | null {
  const r = v.relations.get(relationId);
  if (r === undefined) return "Abductive couldn't find that relation.";
  for (const id of [r.from, r.to]) {
    const c = v.concepts.get(id);
    if (c === undefined) return "Abductive couldn't find a concept at one end of that relation.";
    if (c.status === "rejected" || c.status === "retired") return `You ${c.status} the concept "${c.name}", so this relation is missing one of its two ends.`;
    if (c.status === "suggested") return `Accept the concept "${c.name}" first. A relation sits between two concepts in your ontology.`;
  }
  return null;
}

/**
 * Accept a suggested relation (ISC-631; M93, ISC-764): the acceptance with its
 * mark, the relation itself under the same id, and the statements the
 * suggestion carried. Both ends are concepts already in the ontology; a
 * suggested end blocks the accept, by `relationBlocked`.
 */
export function acceptRelationEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly relationId: string; readonly bulk?: boolean },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { projectId, relationId } = input;
  const r = relationCard(events, projectId, relationId);
  if (r.status !== "suggested" || r.suggestion === undefined) return finish(events, projectId, [], clock);
  const s = r.suggestion;
  const blocked = relationBlocked(view(events, projectId), relationId);
  if (blocked !== null) throw new Error(blocked);
  const bulk = input.bulk === true ? { bulk: true as const } : {};
  return chain(events, [
    (sofar) => {
      const { now, makeId } = tick(clock);
      const env = () => ({ id: makeId(), ts: now(), actor: "human" as const, projectId });
      const source = evidenceOf(s.source);
      const live = view(sofar, projectId).statements;
      const out: LedgerEvent[] = [
        { ...env(), type: "relation-accepted", relationId, origin: markOf(s.source), unbundled: true, ...bulk },
        {
          ...env(),
          type: "concept-relation-set",
          relationId,
          from: s.from,
          to: s.to,
          relation: s.relation,
          ...(source === undefined ? {} : { source }),
        },
      ];
      for (const pageId of s.statementIds) {
        if (live.has(pageId)) out.push({ ...env(), type: "relation-statement-attached", relationId, pageId });
      }
      for (const text of s.statements) {
        out.push({
          ...env(),
          type: "relation-statement-attached",
          relationId,
          statementId: makeId(),
          text,
          ...(source === undefined ? {} : { source }),
        });
      }
      return finish(sofar, projectId, out, clock);
    },
  ]);
}

/**
 * Refine a relation's kind or claim. On a suggestion, refining accepts it with
 * the edit, as Refine does on a concept. A new kind sets the relation again
 * under the same id, so the map and the concept cards read the kind as it is.
 */
export function refineRelationEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly relationId: string; readonly relation?: ConceptRelation; readonly claim?: string; readonly why?: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { projectId, relationId } = input;
  const r = relationCard(events, projectId, relationId);
  if (r.status === "rejected") throw new Error("You rejected that relation. Abductive keeps it in History as it was.");
  return chain(events, [
    (sofar) => (r.status === "suggested" ? acceptRelationEvents(sofar, { projectId, relationId }, clock) : []),
    (sofar) => {
      const { now, makeId } = tick(clock);
      const card = relationCard(sofar, projectId, relationId);
      const claim = input.claim?.trim();
      const changedClaim = claim !== undefined && claim !== "" && claim !== card.claim ? claim : undefined;
      const changedKind = input.relation !== undefined && input.relation !== card.relation ? input.relation : undefined;
      const env = () => ({ id: makeId(), ts: now(), actor: "human" as const, projectId });
      const out: LedgerEvent[] = [];
      if (changedClaim !== undefined && card.claim === "" && changedKind === undefined) {
        out.push({ ...env(), type: "relation-claim-set", relationId, claim: changedClaim });
      } else if (changedClaim !== undefined || changedKind !== undefined) {
        out.push({
          ...env(),
          type: "relation-refined",
          relationId,
          ...(changedKind === undefined ? {} : { relation: changedKind }),
          ...(changedClaim === undefined ? {} : { claim: changedClaim }),
        });
      }
      out.push(...whyRefined(sofar, projectId, { kind: "relation", id: relationId }, input.why, clock));
      if (changedKind !== undefined) {
        out.push({
          ...env(),
          type: "concept-relation-set",
          relationId,
          from: card.from,
          to: card.to,
          relation: changedKind,
          ...(card.source === undefined ? {} : { source: card.source }),
        });
      }
      return out.length === 0 ? [] : finish(sofar, projectId, out, clock);
    },
  ]);
}

/** Reject a suggested relation, with the researcher's reason. */
export function rejectRelationEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly relationId: string; readonly reason: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const reason = input.reason.trim();
  if (reason === "") throw new Error("Give your reason for rejecting the relation. Abductive keeps your reason in History.");
  if (relationCard(events, input.projectId, input.relationId).status !== "suggested") {
    throw new Error("You can reject only a suggested relation.");
  }
  return [
    { id: makeId(), ts: now(), actor: "human", projectId: input.projectId, type: "relation-rejected", relationId: input.relationId, reason },
  ];
}

/** Write, change or clear the conditions on a relation in the ontology. */
export function setRelationConditionsEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly relationId: string; readonly conditions: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const r = relationCard(events, input.projectId, input.relationId);
  if (r.status !== "accepted") throw new Error("Write conditions on a relation in your ontology.");
  const conditions = input.conditions.trim();
  if (conditions === r.conditions) return [];
  return finish(
    events,
    input.projectId,
    [
      {
        id: makeId(),
        ts: now(),
        actor: "human",
        projectId: input.projectId,
        type: "relation-conditions-set",
        relationId: input.relationId,
        ...(conditions === "" ? {} : { conditions }),
      },
    ],
    clock,
  );
}

/**
 * A relation that the researcher writes themselves (ISC-631): the two
 * concepts, the kind, the claim and any conditions, as one act.
 */
export function addRelationEvents(
  events: readonly LedgerEvent[],
  input: {
    readonly projectId: string;
    readonly from: string;
    readonly to: string;
    readonly relation: ConceptRelation;
    readonly claim: string;
    readonly conditions?: string;
    readonly source?: ConceptEvidence;
  },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const claim = input.claim.trim();
  if (claim === "") throw new Error("Write the relation's claim first, in one sentence.");
  const relationId = (clock?.makeId ?? (() => crypto.randomUUID()))();
  const conditions = input.conditions?.trim() ?? "";
  return chain(events, [
    (sofar) =>
      setRelationEvents(
        sofar,
        {
          projectId: input.projectId,
          relationId,
          from: input.from,
          to: input.to,
          relation: input.relation,
          ...(input.source === undefined ? {} : { source: input.source }),
        },
        clock,
      ),
    (sofar) => {
      const { now, makeId } = tick(clock);
      const env = () => ({ id: makeId(), ts: now(), actor: "human" as const, projectId: input.projectId });
      return [
        { ...env(), type: "relation-claim-set", relationId, claim },
        ...(conditions === "" ? [] : [{ ...env(), type: "relation-conditions-set" as const, relationId, conditions }]),
      ];
    },
  ]);
}

/**
 * Place a statement at a home (ISC-633, ISC-634): under a concept or a
 * relation, accepted or suggested. A suggested home is accepted in the same
 * append, so the statement and its home join the ontology together. Placing a
 * statement that sits elsewhere moves it.
 */
export function placeAtHomeEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly statementId: string; readonly home: StatementHome | NewHome },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { projectId, statementId } = input;
  const v = view(events, projectId);
  if (v.statements.get(statementId)?.kind !== "claim") throw new Error("Abductive couldn't find that statement.");
  /* A home written on the card: the concept or relation first, then the
     statement placed under it, in one append. */
  const written = input.home;
  if (written.kind === "new-concept" || written.kind === "new-relation") {
    let made: StatementHome | null = null;
    return chain(events, [
      (sofar) => {
        const out =
          written.kind === "new-concept"
            ? addConceptEvents(sofar, { projectId, name: written.name, definition: written.definition }, clock)
            : addRelationEvents(sofar, { projectId, ...written }, clock);
        for (const e of out) {
          if (e.type === "concept-accepted") made = { kind: "concept", id: e.conceptId };
          if (e.type === "concept-relation-set") made = { kind: "relation", id: e.relationId };
        }
        return out;
      },
      (sofar) => {
        if (made === null) throw new Error("Abductive couldn't make that home.");
        return placeAtHomeEvents(sofar, { projectId, statementId, home: made }, clock);
      },
    ]);
  }
  const home = written;
  const waiting = homeWaiting(v, home);
  if (waiting !== null) throw new Error(waiting);
  if (home.kind === "concept") {
    const c = v.concepts.get(home.id);
    if (c === undefined || c.status === "rejected") throw new Error("Place the statement under a concept in your ontology.");
    return chain(events, [
      (sofar) =>
        view(sofar, projectId).statements.get(statementId)?.conceptId === c.id
          ? []
          : placeStatementEvents(sofar, { projectId, conceptId: c.id, pageId: statementId }, clock),
    ]);
  }
  const r = v.relations.get(home.id);
  if (r === undefined || r.status === "rejected") throw new Error("Place the statement under a relation in your ontology.");
  return chain(events, [
    (sofar) => {
      if (view(sofar, projectId).statements.get(statementId)?.relationId === r.id) return [];
      const { now, makeId } = tick(clock);
      return finish(
        sofar,
        projectId,
        [{ id: makeId(), ts: now(), actor: "human", projectId, type: "relation-statement-attached", relationId: r.id, pageId: statementId }],
        clock,
      );
    },
  ]);
}

/**
 * Why a statement can't be placed at a home yet (M93, ISC-764), or null when
 * it can: placing a statement under a suggested concept or relation asks for
 * that home's decision first, so the statement and its home are two decisions.
 */
export function homeWaiting(v: ProjectOntologyView, home: StatementHome): string | null {
  if (home.kind === "concept") {
    const c = v.concepts.get(home.id);
    return c?.status === "suggested" ? `Decide on the suggested concept "${c.name}" first. A statement sits under a concept in your ontology.` : null;
  }
  const r = v.relations.get(home.id);
  if (r?.status !== "suggested") return null;
  const name = (id: string) => v.concepts.get(id)?.name ?? "a concept";
  return `Decide on the suggested relation "${relationSentence(name(r.from), r.relation, name(r.to))}" first. A statement sits under a relation in your ontology.`;
}

/** A home the researcher writes on a statement's card instead of choosing one (ISC-633). */
export type NewHome =
  | { readonly kind: "new-concept"; readonly name: string; readonly definition: string }
  | {
      readonly kind: "new-relation";
      readonly from: string;
      readonly to: string;
      readonly relation: ConceptRelation;
      readonly claim: string;
    };

/**
 * Accept a suggested statement at its home (ISC-633): the proposed one, another
 * the researcher chose on the card, or a concept or relation they write there.
 * One placement event carries the statement into its home, after the home's own
 * acceptance when the home is still a suggestion. An edit to the text is the
 * researcher's wording, and the suggestion keeps Abductive's.
 */
export function acceptStatementEvents(
  events: readonly LedgerEvent[],
  input: {
    readonly projectId: string;
    readonly statementId: string;
    readonly home?: StatementHome | NewHome;
    readonly text?: string;
    readonly bulk?: boolean;
  },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { projectId, statementId } = input;
  const s = view(events, projectId).suggestedStatements.find((x) => x.statementId === statementId);
  if (s === undefined) throw new Error("Abductive couldn't find that suggested statement.");
  const text = (input.text ?? s.text).trim();
  if (text === "") throw new Error("Write the statement first.");
  const chosen = input.home ?? s.home;
  let home: StatementHome | null = chosen.kind === "concept" || chosen.kind === "relation" ? chosen : null;
  const evidence: ConceptEvidence | undefined =
    s.chunkId !== undefined ? { kind: "passage", chunkId: s.chunkId } : evidenceOf(s.source);
  return chain(events, [
    (sofar) => {
      if (chosen.kind === "new-concept") {
        const made = addConceptEvents(sofar, { projectId, name: chosen.name, definition: chosen.definition }, clock);
        const accepted = made.find((e) => e.type === "concept-accepted");
        if (accepted?.type === "concept-accepted") home = { kind: "concept", id: accepted.conceptId };
        return made;
      }
      if (chosen.kind === "new-relation") {
        const made = addRelationEvents(sofar, { projectId, ...chosen }, clock);
        const set = made.find((e) => e.type === "concept-relation-set");
        if (set?.type === "concept-relation-set") home = { kind: "relation", id: set.relationId };
        return made;
      }
      const v = view(sofar, projectId);
      const waiting = homeWaiting(v, chosen);
      if (waiting !== null) throw new Error(waiting);
      if (chosen.kind === "concept") {
        const c = v.concepts.get(chosen.id);
        if (c === undefined || c.status === "rejected") throw new Error("Choose a concept in your ontology as the statement's home.");
        return [];
      }
      const r = v.relations.get(chosen.id);
      if (r === undefined || r.status === "rejected") throw new Error("Choose a relation in your ontology as the statement's home.");
      return [];
    },
    (sofar) => {
      if (home === null) throw new Error("Abductive couldn't make that home.");
      const { now, makeId } = tick(clock);
      const base = {
        id: makeId(),
        ts: now(),
        actor: "human" as const,
        projectId,
        statementId,
        text,
        ...(evidence === undefined ? {} : { source: evidence }),
        ...(input.bulk === true ? { bulk: true as const } : {}),
      };
      const placed: LedgerEvent =
        home.kind === "concept"
          ? { ...base, type: "statement-attached", conceptId: home.id }
          : { ...base, type: "relation-statement-attached", relationId: home.id };
      return finish(sofar, projectId, [placed], clock);
    },
  ]);
}

/** Reject a suggested statement, with the researcher's reason. */
export function rejectStatementEvents(
  events: readonly LedgerEvent[],
  input: { readonly projectId: string; readonly statementId: string; readonly reason: string },
  clock?: DoorClock,
): readonly LedgerEvent[] {
  const { now, makeId } = tick(clock);
  const reason = input.reason.trim();
  if (reason === "") throw new Error("Give your reason for rejecting the statement. Abductive keeps your reason in History.");
  if (!view(events, input.projectId).suggestedStatements.some((x) => x.statementId === input.statementId)) {
    throw new Error("You can reject only a suggested statement.");
  }
  return [
    { id: makeId(), ts: now(), actor: "human", projectId: input.projectId, type: "statement-rejected", statementId: input.statementId, reason },
  ];
}
