/**
 * M82, ISC-694 and ISC-695 on the record: why a concept or relation matters,
 * the argument so far, the grounds of a related pair, and the concepts that
 * stand alone.
 *
 * A "Why it matters" line comes in on a suggestion and is accepted with it,
 * marked Abductive's; or Abductive writes one for an accepted card that has
 * none, which waits as a suggestion until the researcher accepts it; or the
 * researcher writes their own, marked theirs, with the line it replaced kept.
 * The door is the one writer of the researcher's acts.
 */

import { describe, expect, test } from "bun:test";
import { assertValidEvent, validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { projectConcepts, loneConcepts, evidenceBehindRelation } from "../src/concepts/projection.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import {
  acceptConceptEvents,
  acceptRelationEvents,
  addConceptEvents,
  addRelationEvents,
  refineConceptEvents,
  refineRelationEvents,
  acceptWhyEvents,
} from "../src/concepts/door.ts";

const P = "p-m82-why";
let n = 0;
let t = 50_000;
const clock = { now: () => (t += 10), makeId: () => `dddddddd-8282-4282-8282-${String((n += 1)).padStart(12, "0")}` };
const env = (actor: LedgerEvent["actor"] = "persona:concept-suggester") => ({ id: clock.makeId(), ts: clock.now(), actor, projectId: P, model: "m", modelVersion: "v" });
const view = (events: readonly LedgerEvent[]) => projectConcepts(events, P, projectOntology(events, P));

function suggested(name: string, why?: string): LedgerEvent {
  return {
    ...env(),
    type: "concept-suggested",
    conceptId: clock.makeId(),
    name,
    definition: `${name} as defined.`,
    properties: [],
    relations: [],
    statementIds: [],
    statements: [],
    source: { kind: "summary", station: "puzzle" },
    ...(why === undefined ? {} : { whyItMatters: why }),
  } as LedgerEvent;
}
const idOf = (e: LedgerEvent) => (e as { conceptId: string }).conceptId;

describe("M82: a Why it matters line on the record (ISC-695)", () => {
  /* M93, ISC-764: the line waits for its own decision after the concept is accepted. */
  test("a suggestion's line waits, marked Abductive's, until the researcher accepts it", () => {
    const s = suggested("Booked slot", "Booked slot is the change your puzzle turns on; without it the design has no before and after.");
    let events = [s, ...acceptConceptEvents([s], { projectId: P, conceptId: idOf(s) }, clock)];
    expect(view(events).concepts.get(idOf(s))!.why).toEqual({ text: "Booked slot is the change your puzzle turns on; without it the design has no before and after.", by: "abductive", status: "suggested" });
    events = [...events, ...acceptWhyEvents(events, { projectId: P, target: { kind: "concept", id: idOf(s) } }, clock)];
    expect(view(events).concepts.get(idOf(s))!.why).toEqual({ text: "Booked slot is the change your puzzle turns on; without it the design has no before and after.", by: "abductive", status: "accepted" });
  });

  test("a suggested card carries no line of its own; its suggestion does", () => {
    const s = suggested("Drive-by help", "Drive-by help is the outcome.");
    const card = view([s]).concepts.get(idOf(s))!;
    expect(card.why).toBeNull();
    expect(card.suggestion?.whyItMatters).toBe("Drive-by help is the outcome.");
  });

  test("Abductive's line for an accepted card waits as a suggestion until the researcher accepts it", () => {
    const own = addConceptEvents([], { projectId: P, name: "Tool crib", definition: "The shared workshop." }, clock);
    const id = view(own).accepted[0]!.id;
    const written: LedgerEvent = { ...env("persona:why-writer"), type: "why-suggested", target: { kind: "concept", id }, text: "Tool crib is the setting." };
    assertValidEvent(written);
    let events = [...own, written];
    expect(view(events).concepts.get(id)!.why).toEqual({ text: "Tool crib is the setting.", by: "abductive", status: "suggested" });
    const accept = acceptWhyEvents(events, { projectId: P, target: { kind: "concept", id } }, clock);
    expect(accept.map((e) => e.type)).toEqual(["why-accepted"]);
    events = [...events, ...accept];
    expect(view(events).concepts.get(id)!.why).toEqual({ text: "Tool crib is the setting.", by: "abductive", status: "accepted" });
    expect(acceptWhyEvents(events, { projectId: P, target: { kind: "concept", id } }, clock)).toEqual([]);
  });

  test("the researcher's own words replace the line, marked theirs, with the first line kept", () => {
    const s = suggested("Queue talk", "Queue talk is where chance meetings happen.");
    let events: LedgerEvent[] = [s, ...acceptConceptEvents([s], { projectId: P, conceptId: idOf(s) }, clock)];
    events = [...events, ...refineConceptEvents(events, { projectId: P, conceptId: idOf(s), why: "Queue talk is the encounter I expected to lose." }, clock)];
    expect(view(events).concepts.get(idOf(s))!.why).toEqual({
      text: "Queue talk is the encounter I expected to lose.",
      by: "you",
      status: "accepted",
      original: "Queue talk is where chance meetings happen.",
    });
    const unchanged = refineConceptEvents(events, { projectId: P, conceptId: idOf(s), why: "Queue talk is the encounter I expected to lose." }, clock);
    expect(unchanged.filter((e) => e.type === "why-refined")).toEqual([]);
  });

  test("Refine on a suggestion accepts it and writes the researcher's line in one act", () => {
    const s = suggested("Repair queue", "Repair queue matters.");
    const out = refineConceptEvents([s], { projectId: P, conceptId: idOf(s), why: "Repair queue is where I watch." }, clock);
    expect(out.map((e) => e.type).slice(0, 1)).toEqual(["concept-accepted"]);
    expect(out.some((e) => e.type === "why-refined")).toBe(true);
    expect(view([s, ...out]).concepts.get(idOf(s))!.why?.by).toBe("you");
  });

  test("a relation's line comes in on its suggestion and is refined on its card", () => {
    let events: LedgerEvent[] = [
      ...addConceptEvents([], { projectId: P, name: "Alpha", definition: "A." }, clock),
    ];
    events = [...events, ...addConceptEvents(events, { projectId: P, name: "Beta", definition: "B." }, clock)];
    const [a, b] = view(events).accepted;
    const rid = clock.makeId();
    const rs: LedgerEvent = {
      ...env(),
      type: "relation-suggested",
      relationId: rid,
      from: a!.id,
      to: b!.id,
      relation: "leads-to",
      claim: "Alpha leads to Beta.",
      statementIds: [],
      statements: [],
      source: { kind: "relate" },
      restsOn: [{ kind: "passage", chunkId: "chunk-1" }],
      whyItMatters: "Alpha to Beta is the chain your puzzle needs.",
    } as LedgerEvent;
    assertValidEvent(rs);
    events = [...events, rs, ...acceptRelationEvents([...events, rs], { projectId: P, relationId: rid }, clock)];
    expect(view(events).relations.get(rid)!.why).toEqual({ text: "Alpha to Beta is the chain your puzzle needs.", by: "abductive", status: "suggested" });
    expect(evidenceBehindRelation(view(events), rid).passages).toEqual(["chunk-1"]);
    events = [...events, ...refineRelationEvents(events, { projectId: P, relationId: rid, why: "My own reason." }, clock)];
    expect(view(events).relations.get(rid)!.why?.by).toBe("you");
  });

  test("the argument so far is the latest one Abductive wrote", () => {
    const one: LedgerEvent = { ...env("persona:argument-writer"), type: "argument-written", text: "First.", basis: "a" };
    const two: LedgerEvent = { ...env("persona:argument-writer"), type: "argument-written", text: "Second.", basis: "b" };
    assertValidEvent(one);
    expect(view([one, two]).argument).toMatchObject({ text: "Second.", basis: "b", ts: (two as { ts: number }).ts });
    expect(view([]).argument).toBeNull();
  });

  test("the validator refuses a researcher's line written as Abductive's, and an empty line", () => {
    const bad = { ...env("human"), type: "why-suggested", target: { kind: "concept", id: "c" }, text: "x" } as LedgerEvent;
    expect(validateEvent(bad).length).toBeGreaterThan(0);
    const empty = { ...env("human"), type: "why-refined", target: { kind: "relation", id: "r" }, text: "" } as LedgerEvent;
    expect(validateEvent(empty).length).toBeGreaterThan(0);
    const target = { ...env("human"), type: "why-accepted", target: { kind: "page", id: "r" } } as unknown as LedgerEvent;
    expect(validateEvent(target).length).toBeGreaterThan(0);
  });
});

describe("M82: the concepts that stand alone (ISC-694)", () => {
  test("accepted concepts with no accepted relation, from two concepts up", () => {
    let events: LedgerEvent[] = [...addConceptEvents([], { projectId: P, name: "Solo", definition: "S." }, clock)];
    expect(loneConcepts(view(events))).toEqual([]);
    for (const name of ["Left", "Right"]) events = [...events, ...addConceptEvents(events, { projectId: P, name, definition: `${name}.` }, clock)];
    expect(loneConcepts(view(events)).map((c) => c.name)).toEqual(["Solo", "Left", "Right"]);
    const id = (name: string) => view(events).accepted.find((c) => c.name === name)!.id;
    events = [...events, ...addRelationEvents(events, { projectId: P, from: id("Left"), to: id("Right"), relation: "contrasts-with", claim: "Left contrasts with Right." }, clock)];
    expect(loneConcepts(view(events)).map((c) => c.name)).toEqual(["Solo"]);
  });

  test("the serendipity walk: eight of twenty-two concepts stand alone", async () => {
    const walk = (await Bun.file(new URL("./fixtures/m76-walk.json", import.meta.url)).json()) as { project: { id: string }; events: LedgerEvent[] };
    const v = projectConcepts(walk.events, walk.project.id, projectOntology(walk.events, walk.project.id));
    expect(v.accepted.length).toBe(22);
    expect(loneConcepts(v).map((c) => c.name)).toEqual([
      "Tool crib",
      "Run",
      "Evidence outside the founder's story",
      "Serendipity elsewhere",
      "Before and after May",
      "Prepared mind",
      "Old hands and newcomers",
      "Booking system as a gain",
    ]);
  });
});
