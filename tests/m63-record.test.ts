/**
 * M63, ISC-608: the record of the emerging project ontology.
 *
 * Twelve additive events, validated like every other, and a projection that
 * reads them: suggested concepts waiting for a decision, the ontology as
 * accepted concepts with their properties, relations and statements, the claims
 * not yet placed, and the lines to look for in the field. Every earlier event
 * keeps its meaning: the shipped example validates unchanged and its claims read
 * as unplaced statements until a concept holds them.
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts, lookForNeeded } from "../src/concepts/projection.ts";
import {
  acceptConceptEvents,
  addConceptEvents,
  placeStatementEvents,
  refineConceptEvents,
  rejectConceptEvents,
  removeRelationEvents,
  setPropertyEvents,
  setRelationEvents,
  settleLineEvents,
  acceptPropertyEvents,
  placeAtHomeEvents,
  acceptStatementEvents,
} from "../src/concepts/door.ts";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";
import { parseBundle } from "../src/export/bundle.ts";

const P = "p-m63";
let n = 0;
const uid = () => `bbbbbbbb-2222-4222-8222-${String((n += 1)).padStart(12, "0")}`;
let t = 5_000;
const clock = { now: () => (t += 10), makeId: uid };

function env(actor: LedgerEvent["actor"] = "human") {
  const base = { id: uid(), ts: (t += 10), actor, projectId: P };
  return actor.startsWith("persona:") ? { ...base, model: "claude", modelVersion: "test" } : base;
}

function claim(pageId: string, title: string, chunks: string[] = []): LedgerEvent {
  return {
    ...env("human"),
    type: "ontology-mutation",
    op: "create",
    targetId: pageId,
    pageType: "observation",
    title,
    body: `${title}.`,
    origin: "model-proposed",
    supportingChunks: chunks,
  } as LedgerEvent;
}

function suggestion(over: Partial<Record<string, unknown>> = {}): LedgerEvent {
  return {
    ...env("persona:concepts"),
    type: "concept-suggested",
    conceptId: "c-dose",
    name: "Reading dose",
    definition: "How many founder updates a mentor reads in a week, in your words [...]",
    properties: ["Weekly count"],
    relations: [],
    statementIds: ["pg-1"],
    statements: ["Mentors stop reading once the updates look alike."],
    source: { kind: "summary", station: "context" },
    ...over,
  } as LedgerEvent;
}

const base = (): LedgerEvent[] => [claim("pg-1", "Same phrase across three ventures"), claim("pg-2", "Ravi runs office hours with the laptop closed")];

function onto(events: readonly LedgerEvent[]) {
  return projectConcepts(events, P, projectOntology(events, P));
}

describe("the twelve events validate like every other (ISC-608)", () => {
  test("a well-formed suggestion validates, and one written by the researcher does not", () => {
    expect(validateEvent(suggestion())).toEqual([]);
    const byHuman = { ...suggestion(), actor: "human" };
    delete (byHuman as Record<string, unknown>).model;
    expect(validateEvent(byHuman).join(" ")).toContain("takes Abductive as its actor");
  });

  test("a relation outside the five is refused, and a concept cannot relate to itself", () => {
    const rel = { ...env(), type: "concept-relation-set", relationId: "r1", from: "a", to: "b", relation: "causes" };
    expect(validateEvent(rel).join(" ")).toContain("must be one of");
    const self = { ...rel, relation: "leads-to", to: "a" };
    expect(validateEvent(self).join(" ")).toContain("two different concepts");
    expect(validateEvent({ ...rel, relation: "is-part-of" }).length).toBeGreaterThan(0);
    expect(validateEvent({ ...rel, relation: "part-of" })).toEqual([]);
  });

  test("a rejection needs a reason, and an acceptance carries a mark", () => {
    expect(validateEvent({ ...env(), type: "concept-rejected", conceptId: "c", reason: "" }).join(" ")).toContain("reason");
    expect(validateEvent({ ...env(), type: "concept-accepted", conceptId: "c" }).join(" ")).toContain("origin");
    expect(validateEvent({ ...env(), type: "concept-accepted", conceptId: "c", origin: "model-proposed" })).toEqual([]);
  });

  test("a statement is an existing claim or a new statement, never both and never neither", () => {
    const a = { ...env(), type: "statement-attached", conceptId: "c" };
    expect(validateEvent(a).length).toBeGreaterThan(0);
    expect(validateEvent({ ...a, pageId: "pg-1" })).toEqual([]);
    expect(validateEvent({ ...a, statementId: "s1", text: "A new line." })).toEqual([]);
    expect(validateEvent({ ...a, pageId: "pg-1", statementId: "s1", text: "x y" }).length).toBeGreaterThan(0);
  });

  test("a line settled by a passage names the passage; a report names its verdict and inputs", () => {
    expect(validateEvent({ ...env("system"), type: "look-for-settled", itemId: "i", by: "passage" }).length).toBeGreaterThan(0);
    const report = {
      ...env("system"),
      type: "readiness-report",
      verdict: "Ready to collect data",
      rows: [{ criterion: "venue", status: "fits", sentence: "You named a journal." }],
      fixFirst: [],
      reviewerQuestions: [],
      rivals: [],
      argument: [],
      biases: [],
      flags: [],
      inputs: { eventCount: 3, lastEventId: "x" },
    };
    expect(validateEvent(report)).toEqual([]);
    expect(validateEvent({ ...report, verdict: "" }).length).toBeGreaterThan(0);
    expect(validateEvent({ ...report, rows: [{ criterion: "vibes", status: "fits", sentence: "x y" }] }).length).toBeGreaterThan(0);
  });
});

describe("the projection (ISC-608)", () => {
  test("a suggestion waits and holds nothing until the researcher decides", () => {
    const o = onto([...base(), suggestion()]);
    expect(o.suggested.map((c) => c.name)).toEqual(["Reading dose"]);
    expect(o.accepted).toEqual([]);
    // Both claims read as unplaced statements while nothing is accepted.
    expect(o.unplaced.map((s) => s.id).sort()).toEqual(["pg-1", "pg-2"]);
  });

  /* M93, ISC-764: accepting takes the name, definition and mark; each part the
     suggestion carried waits for its own decision. Before M93 this one accept
     wrote the property and both statements. */
  test("accepting keeps the mark, and the property and statements wait for their own decisions", () => {
    const events = [...base(), suggestion()];
    const written = acceptConceptEvents(events, { projectId: P, conceptId: "c-dose" }, clock);
    expect(written.filter((e) => e.actor === "human").map((e) => e.type)).toEqual(["concept-accepted"]);
    let accepted = [...events, ...written];
    for (const e of accepted) expect(validateEvent(e)).toEqual([]);
    let o = onto(accepted);
    let card = o.concepts.get("c-dose")!;
    expect(card.status).toBe("accepted");
    expect(card.origin).toBe("model-proposed");
    expect(card.properties).toEqual([]);
    expect(card.suggestedProperties).toEqual(["Weekly count"]);
    expect(card.statementIds).toEqual([]);
    expect(o.homes.get("pg-1")).toEqual({ kind: "concept", id: "c-dose" });
    const waiting = o.suggestedStatements.find((x) => x.home.id === "c-dose")!;
    expect(waiting.text).toBe("Mentors stop reading once the updates look alike.");
    // Each part, decided on its own.
    accepted = [...accepted, ...acceptPropertyEvents(accepted, { projectId: P, conceptId: "c-dose", name: "Weekly count" }, clock)];
    accepted = [...accepted, ...placeAtHomeEvents(accepted, { projectId: P, statementId: "pg-1", home: { kind: "concept", id: "c-dose" } }, clock)];
    accepted = [...accepted, ...acceptStatementEvents(accepted, { projectId: P, statementId: waiting.statementId }, clock)];
    for (const e of accepted) expect(validateEvent(e)).toEqual([]);
    o = onto(accepted);
    card = o.concepts.get("c-dose")!;
    expect(card.properties.map((p) => p.name)).toEqual(["Weekly count"]);
    expect(card.suggestedProperties).toEqual([]);
    expect(card.statementIds).toContain("pg-1");
    expect(card.statementIds.length).toBe(2); // the claim and the new statement
    expect(o.unplaced.map((s) => s.id)).toEqual(["pg-2"]);
  });

  test("a suggestion from the data is marked as from your data", () => {
    const events = [...base(), suggestion({ source: { kind: "data", chunkIds: ["ch-1"] } })];
    const done = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-dose" }, clock)];
    expect(onto(done).concepts.get("c-dose")!.origin).toBe("data-driven");
  });

  test("refining keeps the original beside the edit and never changes the mark", () => {
    const events = [...base(), suggestion()];
    const done = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-dose" }, clock)];
    const refined = [...done, ...refineConceptEvents(done, { projectId: P, conceptId: "c-dose", definition: "Updates a mentor opens and reads in full." }, clock)];
    const card = onto(refined).concepts.get("c-dose")!;
    expect(card.definition).toBe("Updates a mentor opens and reads in full.");
    expect(card.original?.definition).toContain("How many founder updates");
    expect(card.origin).toBe("model-proposed");
  });

  test("refining a suggestion accepts it with the edit", () => {
    const events = [...base(), suggestion()];
    const out = refineConceptEvents(events, { projectId: P, conceptId: "c-dose", name: "Reading load" }, clock);
    expect(out.map((e) => e.type)).toContain("concept-accepted");
    expect(onto([...events, ...out]).concepts.get("c-dose")!.name).toBe("Reading load");
  });

  test("rejecting needs a reason and keeps the concept out of the ontology", () => {
    const events = [...base(), suggestion()];
    expect(() => rejectConceptEvents(events, { projectId: P, conceptId: "c-dose", reason: " " }, clock)).toThrow();
    const out = rejectConceptEvents(events, { projectId: P, conceptId: "c-dose", reason: "Too close to the claim itself." }, clock);
    const o = onto([...events, ...out]);
    expect(o.rejected.map((c) => c.reason)).toEqual(["Too close to the claim itself."]);
    expect(o.accepted).toEqual([]);
    expect(o.suggested).toEqual([]);
  });

  test("relations are set between accepted concepts, carry their source, and can be removed", () => {
    let events: LedgerEvent[] = [...base(), suggestion()];
    events = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-dose" }, clock)];
    events = [...events, ...addConceptEvents(events, { projectId: P, name: "Judgement shift", definition: "Where a mentor's judgement of a founder moves." }, clock)];
    const shift = onto(events).accepted.find((c) => c.name === "Judgement shift")!;
    expect(shift.origin).toBe("author-prior");
    events = [...events, ...setRelationEvents(events, { projectId: P, from: "c-dose", to: shift.id, relation: "leads-to" }, clock)];
    const link = onto(events).links[0]!;
    expect(link.relation).toBe("leads-to");
    events = [...events, ...removeRelationEvents(events, { projectId: P, relationId: link.id }, clock)];
    expect(onto(events).links).toEqual([]);
  });

  test("a claim placed under another concept moves there", () => {
    let events: LedgerEvent[] = [...base(), suggestion()];
    events = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-dose" }, clock)];
    events = [...events, ...addConceptEvents(events, { projectId: P, name: "Office hours", definition: "The slot where mentors meet founders." }, clock)];
    const hours = onto(events).accepted.find((c) => c.name === "Office hours")!;
    events = [...events, ...placeStatementEvents(events, { projectId: P, conceptId: hours.id, pageId: "pg-1" }, clock)];
    const o = onto(events);
    expect(o.concepts.get(hours.id)!.statementIds).toContain("pg-1");
    expect(o.concepts.get("c-dose")!.statementIds).not.toContain("pg-1");
  });
});

describe("What to look for in the field (ISC-608, ISC-609)", () => {
  test("an undefined property and an unobserved relation each raise one line, once", () => {
    let events: LedgerEvent[] = [...base(), suggestion()];
    events = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-dose" }, clock)];
    events = [...events, ...acceptPropertyEvents(events, { projectId: P, conceptId: "c-dose", name: "Weekly count" }, clock)];
    const raised = events.filter((e) => e.type === "look-for-raised");
    expect(raised.length).toBe(1);
    expect(onto(events).lookFor[0]!.text).toContain("Weekly count");
    // A second write does not raise the same line again.
    events = [...events, ...addConceptEvents(events, { projectId: P, name: "Judgement shift", definition: "Where judgement moves." }, clock)];
    expect(events.filter((e) => e.type === "look-for-raised" && e.conceptId === "c-dose").length).toBe(1);
    // The researcher's own concept has nothing behind it, so it raises its own line.
    const shift = onto(events).accepted.find((c) => c.name === "Judgement shift")!;
    expect(onto(events).lookFor.some((l) => l.conceptId === shift.id && l.kind === "evidence")).toBe(true);
    events = [...events, ...setRelationEvents(events, { projectId: P, from: "c-dose", to: shift.id, relation: "leads-to" }, clock)];
    expect(onto(events).lookFor.some((l) => l.kind === "relation" && l.settled === null)).toBe(true);
  });

  test("defining the property settles its line; a passage settles a relation's line", () => {
    let events: LedgerEvent[] = [...base(), suggestion()];
    events = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-dose" }, clock)];
    events = [...events, ...acceptPropertyEvents(events, { projectId: P, conceptId: "c-dose", name: "Weekly count" }, clock)];
    const prop = onto(events).concepts.get("c-dose")!.properties[0]!;
    events = [...events, ...setPropertyEvents(events, { projectId: P, conceptId: "c-dose", propertyId: prop.id, name: prop.name, varies: "From none to every update." }, clock)];
    const line = onto(events).lookFor.find((l) => l.kind === "property")!;
    expect(line.settled?.by).toBe("researcher");

    events = [...events, ...addConceptEvents(events, { projectId: P, name: "Judgement shift", definition: "Where judgement moves." }, clock)];
    const shift = onto(events).accepted.find((c) => c.name === "Judgement shift")!;
    events = [...events, ...setRelationEvents(events, { projectId: P, from: "c-dose", to: shift.id, relation: "leads-to" }, clock)];
    const link = onto(events).links[0]!;
    events = [...events, ...setRelationEvents(events, { projectId: P, relationId: link.id, from: "c-dose", to: shift.id, relation: "leads-to", source: { kind: "passage", chunkId: "ch-9" } }, clock)];
    const rel = onto(events).lookFor.find((l) => l.kind === "relation")!;
    expect(rel.settled?.by).toBe("passage");
    expect(rel.settled?.chunkId).toBe("ch-9");
  });

  test("the researcher can settle a line with a note", () => {
    let events: LedgerEvent[] = [...base(), suggestion()];
    events = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-dose" }, clock)];
    events = [...events, ...acceptPropertyEvents(events, { projectId: P, conceptId: "c-dose", name: "Weekly count" }, clock)];
    const line = onto(events).lookFor[0]!;
    events = [...events, ...settleLineEvents(events, { projectId: P, itemId: line.itemId, note: "Asked Daniel in week five." }, clock)];
    const settled = onto(events).lookFor.find((l) => l.itemId === line.itemId)!;
    expect(settled.settled?.note).toBe("Asked Daniel in week five.");
    // A settled line is not raised again while its condition stands.
    expect(lookForNeeded(onto(events)).some((l) => l.itemId === line.itemId)).toBe(true);
    const again = acceptConceptEvents(events, { projectId: P, conceptId: "c-dose" }, clock);
    expect(again.filter((e) => e.type === "look-for-raised")).toEqual([]);
  });
});

describe("History and the shipped example (ISC-608)", () => {
  test("every new event reads as a sentence in History that names who acted", () => {
    let events: LedgerEvent[] = [...base(), suggestion(), suggestion({ conceptId: "c-other", name: "Room performance" })];
    events = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-dose" }, clock)];
    events = [...events, ...acceptPropertyEvents(events, { projectId: P, conceptId: "c-dose", name: "Weekly count" }, clock)];
    events = [...events, ...placeAtHomeEvents(events, { projectId: P, statementId: "pg-1", home: { kind: "concept", id: "c-dose" } }, clock)];
    events = [...events, ...rejectConceptEvents(events, { projectId: P, conceptId: "c-other", reason: "Not a concept of mine." }, clock)];
    events = [...events, ...refineConceptEvents(events, { projectId: P, conceptId: "c-dose", name: "Reading load" }, clock)];
    const rows = projectLedger(events);
    const byKind = new Map(rows.map((r) => [r.kind, r.happened]));
    expect(byKind.get("concept-suggested")).toStartWith("Abductive suggested the concept");
    expect(byKind.get("concept-accepted")).toStartWith("You accepted the concept");
    expect(byKind.get("concept-rejected")).toBe('You rejected the concept "Room performance": Not a concept of mine.');
    expect(byKind.get("concept-refined")).toContain('the name now reads "Reading load"');
    expect(byKind.get("statement-attached")).toStartWith("You placed");
    expect(byKind.get("look-for-raised")).toStartWith("Abductive added a line to look for in the field");
  });

  test("the shipped example imports unchanged, every event validates, and its claims are unplaced statements", async () => {
    const text = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url)).text();
    const bundle = parseBundle(text);
    for (const e of bundle.events) expect(validateEvent(e)).toEqual([]);
    const projectId = bundle.project.id;
    const graph = projectOntology(bundle.events, projectId);
    const o = projectConcepts(bundle.events, projectId, graph);
    expect(o.accepted).toEqual([]);
    expect(o.unplaced.length).toBeGreaterThan(30);
  });
});

describe("what the account can't explain yet is something to look for (the lead's ruling, M63)", () => {
  const residue = (id: string, title: string): LedgerEvent =>
    ({ ...env("human"), type: "ontology-mutation", op: "create", targetId: id, pageType: "analytic-residue", title, body: "b", origin: "model-proposed" }) as LedgerEvent;

  test("each residue claim is a line in the lead's words, under no concept until placed", () => {
    const events: LedgerEvent[] = [residue("pg-r", "Stopping rate noticed, not measured")];
    const needed = lookForNeeded(onto(events));
    const line = needed.find((l) => l.kind === "residue")!;
    expect(line.text).toBe("Find the explanation for Stopping rate noticed, not measured; an account of it in your ontology is still to come.");
    expect(line.conceptId).toBe("");
    expect(validateEvent({ ...env("system"), type: "look-for-raised", itemId: line.itemId, conceptId: "", kind: "residue", targetId: "pg-r", text: line.text })).toEqual([]);
  });

  test("placing the claim moves the line to its concept, settling raises it first, and retiring the claim settles it", () => {
    let events: LedgerEvent[] = [residue("pg-r", "Stopping rate noticed, not measured")];
    events = [...events, ...addConceptEvents(events, { projectId: P, name: "Reading dose", definition: "d x" }, clock)];
    const c = onto(events).accepted[0]!;
    events = [...events, ...placeStatementEvents(events, { projectId: P, conceptId: c.id, pageId: "pg-r" }, clock)];
    const raised = onto(events).lookFor.find((l) => l.kind === "residue")!;
    expect(raised.conceptId).toBe(c.id);
    const settledFresh = settleLineEvents([residue("pg-x", "Another gap")], { projectId: P, itemId: "look:residue::pg-x", note: "Asked." }, clock);
    expect(settledFresh.map((e) => e.type)).toEqual(["look-for-raised", "look-for-settled"]);
    const retire = { ...env("human"), type: "ontology-mutation", op: "retire", targetId: "pg-r", pageType: "analytic-residue", origin: "model-proposed", reason: "Explained." } as LedgerEvent;
    const synced = [...events, retire];
    const after = [...synced, ...placeStatementEvents(synced, { projectId: P, conceptId: c.id, pageId: "pg-1" }, clock)];
    expect(onto(after).lookFor.find((l) => l.kind === "residue")?.settled?.by).toBe("researcher");
  });
});

describe("an answer at a line or a flag attaches the observation under the concept (the lead's ruling, M63)", () => {
  test("the answer is a statement with its passage, the line is settled by that passage, and nothing is double-settled", async () => {
    const { answerLineEvents } = await import("../src/concepts/door.ts");
    let events: LedgerEvent[] = [...addConceptEvents([], { projectId: P, name: "Judgement shift", definition: "Where judgement moves." }, clock)];
    const c = onto(events).accepted[0]!;
    const line = lookForNeeded(onto(events)).find((l) => l.kind === "evidence")!;
    const out = answerLineEvents(events, { projectId: P, conceptId: c.id, itemId: line.itemId, text: "Olivia scores command from the room.", chunkId: "ch-7" }, clock);
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    events = [...events, ...out];
    const v = onto(events);
    const st = [...v.statements.values()].find((s) => s.text === "Olivia scores command from the room.")!;
    expect(st.conceptId).toBe(c.id);
    expect(st.chunks).toEqual(["ch-7"]);
    const settled = v.lookFor.find((l) => l.itemId === line.itemId)!;
    expect(settled.settled).toMatchObject({ by: "passage", chunkId: "ch-7" });
    expect(out.filter((e) => e.type === "look-for-settled").length).toBe(1);
  });

  test("an answer needs the researcher's words and a passage", async () => {
    const { answerLineEvents } = await import("../src/concepts/door.ts");
    const events = [...addConceptEvents([], { projectId: P, name: "X", definition: "d x" }, clock)];
    const c = onto(events).accepted[0]!;
    expect(() => answerLineEvents(events, { projectId: P, conceptId: c.id, text: " ", chunkId: "ch-1" }, clock)).toThrow();
    expect(() => answerLineEvents(events, { projectId: P, conceptId: c.id, text: "Said so.", chunkId: "" }, clock)).toThrow();
  });
});
