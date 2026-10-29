/**
 * M67, ISC-631 to ISC-635: relation cards, every statement with a home, and
 * the field line for a relation.
 *
 * The owner, 2026-10-01 and 2026-10-02: a relation is a card of its own beside
 * the concepts; concept cards and relation cards link to each other; and every
 * statement arrives with a proposed home. These tests hold the record to that:
 * the new events are additive and validate like every other, the door is the
 * one writer of each act, and the shipped example imports unchanged.
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { evidenceBehindRelation, lookForNeeded, projectConcepts } from "../src/concepts/projection.ts";
import {
  acceptConceptEvents,
  acceptRelationEvents,
  acceptStatementEvents,
  addConceptEvents,
  addRelationEvents,
  placeAtHomeEvents,
  refineRelationEvents,
  rejectRelationEvents,
  rejectStatementEvents,
  setRelationConditionsEvents,
  setRelationEvents,
} from "../src/concepts/door.ts";
import { MAX_SUGGESTED, suggestConcepts } from "../src/concepts/suggest.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief } from "../src/state/projects.ts";
import { parseBundle } from "../src/export/bundle.ts";
import { projectLedger, LEDGER_KINDS } from "../src/workbench/Instrumentation.tsx";

const P = "p-m67";
let n = 0;
const uid = () => `cccccccc-6767-4767-8767-${String((n += 1)).padStart(12, "0")}`;
let t = 70_000;
const clock = { now: () => (t += 10), makeId: uid };
const context = studyContext({ ...emptyBrief(), context: "A pre-seed programme where office-hours slots vary by who introduced the founder." });

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

function onto(events: readonly LedgerEvent[]) {
  return projectConcepts(events, P, projectOntology(events, P));
}

/** Two accepted concepts, "Office-hours slot" and "Command score". */
function twoConcepts(): { events: LedgerEvent[]; slot: string; score: string } {
  let events: LedgerEvent[] = [claim("pg-1", "Introduced founders get longer slots"), claim("pg-2", "Command scores rose after the long slots", ["ch-9"])];
  events = [...events, ...addConceptEvents(events, { projectId: P, name: "Office-hours slot", definition: "The time a mentor gives a founder." }, clock)];
  events = [...events, ...addConceptEvents(events, { projectId: P, name: "Command score", definition: "The programme's score for command of the venture." }, clock)];
  const v = onto(events);
  return { events, slot: v.accepted[0]!.id, score: v.accepted[1]!.id };
}

function relationSuggestion(from: string, to: string, over: Partial<Record<string, unknown>> = {}): LedgerEvent {
  return {
    ...env("persona:concept-suggester"),
    type: "relation-suggested",
    relationId: "r-slots",
    from,
    to,
    relation: "leads-to",
    claim: "Longer office-hours slots lead to higher command scores.",
    statementIds: [],
    statements: [],
    source: { kind: "grouping" },
    ...over,
  } as LedgerEvent;
}

describe("the new events are additive and validate like every other (ISC-631)", () => {
  test("a relation suggestion validates, and one with no claim, a sixth kind or a human actor does not", () => {
    expect(validateEvent(relationSuggestion("a", "b"))).toEqual([]);
    expect(validateEvent(relationSuggestion("a", "b", { claim: "" })).join(" ")).toContain("claim");
    expect(validateEvent(relationSuggestion("a", "b", { relation: "causes" })).join(" ")).toContain("must be one of");
    expect(validateEvent(relationSuggestion("a", "a")).join(" ")).toContain("two different concepts");
    const byHuman = { ...relationSuggestion("a", "b"), actor: "human" };
    expect(validateEvent(byHuman).join(" ")).toContain("takes Abductive as its actor");
  });

  test("the researcher's acts carry their words, and a rejection carries a reason", () => {
    expect(validateEvent({ ...env(), type: "relation-accepted", relationId: "r", origin: "model-proposed" })).toEqual([]);
    expect(validateEvent({ ...env(), type: "relation-rejected", relationId: "r", reason: "" }).join(" ")).toContain("reason");
    expect(validateEvent({ ...env(), type: "relation-refined", relationId: "r" }).join(" ")).toContain("must change");
    expect(validateEvent({ ...env(), type: "relation-claim-set", relationId: "r", claim: "A claim." })).toEqual([]);
    expect(validateEvent({ ...env(), type: "relation-conditions-set", relationId: "r" })).toEqual([]);
    expect(validateEvent({ ...env(), type: "relation-statement-attached", relationId: "r", pageId: "pg-1" })).toEqual([]);
    expect(validateEvent({ ...env(), type: "relation-statement-attached", relationId: "r" }).length).toBeGreaterThan(0);
    expect(validateEvent({ ...env(), type: "statement-rejected", statementId: "s", reason: "" }).join(" ")).toContain("reason");
  });

  test("a statement suggestion names its home, and a pass of proposals names what it read", () => {
    const s = { ...env("persona:concept-suggester"), type: "statement-suggested", statementId: "s1", text: "Slots ran long.", home: { kind: "relation", id: "r" }, source: { kind: "summary", station: "context" } };
    expect(validateEvent(s)).toEqual([]);
    expect(validateEvent({ ...s, home: { kind: "page", id: "r" } }).join(" ")).toContain("home");
    const h = { ...env("persona:concept-suggester"), type: "homes-proposed", read: ["pg-1"], proposals: [{ statementId: "pg-1", home: { kind: "concept", id: "c" } }] };
    expect(validateEvent(h)).toEqual([]);
    expect(validateEvent({ ...h, proposals: [{ statementId: "pg-1", home: {} }] }).join(" ")).toContain("home");
  });

  test("every new kind has a History row, a filter label and a three-letter mark", () => {
    for (const kind of ["relation-suggested", "relation-accepted", "relation-refined", "relation-rejected", "relation-claim-set", "relation-conditions-set", "relation-statement-attached", "homes-proposed", "statement-suggested", "statement-rejected"]) {
      expect(LEDGER_KINDS).toContain(kind as never);
    }
  });

  test("the shipped example imports unchanged, every event validates, and its statements wait for a home", async () => {
    const text = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url)).text();
    const bundle = parseBundle(text);
    for (const e of bundle.events) expect(validateEvent(e)).toEqual([]);
    const o = projectConcepts(bundle.events, bundle.project.id, projectOntology(bundle.events, bundle.project.id));
    // The example holds claims and no concept, so no concept relation yet: its Relations section starts empty.
    expect(o.acceptedRelations).toEqual([]);
    expect(o.unplaced.length).toBe(45);
    expect(o.homesRead.size).toBe(0);
  });
});

describe("relation cards (ISC-631)", () => {
  test("a relation set before M67 is a card with no claim, and a claim and conditions fill it", () => {
    const { events: base, slot, score } = twoConcepts();
    let events = [...base, ...setRelationEvents(base, { projectId: P, relationId: "r-old", from: slot, to: score, relation: "leads-to" }, clock)];
    expect(onto(events).acceptedRelations.map((r) => [r.id, r.claim])).toEqual([["r-old", ""]]);
    events = [...events, ...refineRelationEvents(events, { projectId: P, relationId: "r-old", claim: "Longer slots lead to higher scores." }, clock)];
    events = [...events, ...setRelationConditionsEvents(events, { projectId: P, relationId: "r-old", conditions: "When the founder was introduced." }, clock)];
    const card = onto(events).relations.get("r-old")!;
    expect(card.claim).toBe("Longer slots lead to higher scores.");
    expect(card.conditions).toBe("When the founder was introduced.");
    expect(card.original).toBeNull();
    expect(events.some((e) => e.type === "relation-claim-set")).toBe(true);
  });

  /* M93, ISC-764: accepting a relation never accepts an end; a suggested end blocks it and says why. */
  test("a suggested end blocks the accept; once the end is accepted, the relation sets under the same id and keeps the mark", () => {
    const { events: base, slot } = twoConcepts();
    const conceptSuggestion = {
      ...env("persona:concept-suggester"), type: "concept-suggested", conceptId: "c-intro", name: "Introduced founder", definition: "A founder [...]",
      properties: [], relations: [], statementIds: [], statements: [], source: { kind: "grouping" },
    } as LedgerEvent;
    let events = [...base, conceptSuggestion, relationSuggestion("c-intro", slot)];
    expect(onto(events).suggestedRelations.map((r) => r.id)).toEqual(["r-slots"]);
    expect(() => acceptRelationEvents(events, { projectId: P, relationId: "r-slots" }, clock)).toThrow('Accept the concept "Introduced founder" first.');
    events = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-intro" }, clock)];
    const written = acceptRelationEvents(events, { projectId: P, relationId: "r-slots" }, clock);
    for (const e of written) expect(validateEvent(e)).toEqual([]);
    expect(written.map((e) => e.type)).not.toContain("concept-accepted");
    events = [...events, ...written];
    const v = onto(events);
    expect(v.concepts.get("c-intro")!.status).toBe("accepted");
    const card = v.relations.get("r-slots")!;
    expect(card.status).toBe("accepted");
    expect(card.origin).toBe("model-proposed");
    expect(v.links.map((l) => l.id)).toContain("r-slots");
  });

  test("Refine on a suggestion accepts it with the edit and keeps what it first said; a new kind sets the relation again", () => {
    const { events: base, slot, score } = twoConcepts();
    let events = [...base, relationSuggestion(slot, score)];
    events = [...events, ...refineRelationEvents(events, { projectId: P, relationId: "r-slots", relation: "varies-with", claim: "Command scores vary with slot length." }, clock)];
    const v = onto(events);
    const card = v.relations.get("r-slots")!;
    expect(card.status).toBe("accepted");
    expect(card.relation).toBe("varies-with");
    expect(card.original).toEqual({ relation: "leads-to", claim: "Longer office-hours slots lead to higher command scores." });
    expect(v.links.find((l) => l.id === "r-slots")!.relation).toBe("varies-with");
  });

  test("Reject needs a reason, and a rejected relation stays out of the ontology", () => {
    const { events: base, slot, score } = twoConcepts();
    const events = [...base, relationSuggestion(slot, score)];
    expect(() => rejectRelationEvents(events, { projectId: P, relationId: "r-slots", reason: " " }, clock)).toThrow();
    const after = [...events, ...rejectRelationEvents(events, { projectId: P, relationId: "r-slots", reason: "Not how I see it." }, clock)];
    expect(onto(after).relations.get("r-slots")!.status).toBe("rejected");
    expect(onto(after).acceptedRelations).toEqual([]);
  });

  test("Abductive suggests at most three relations per event, from names in the ontology or the same reply", async () => {
    const { events, slot, score } = twoConcepts();
    void slot;
    void score;
    const rel = (kind: string, to: string, claimText: string) => `FROM: Office-hours slot\nKIND: ${kind}\nTO: ${to}\nCLAIM: ${claimText}`;
    const reply = [
      "NAME: Introduced founder\nDEFINITION: A founder whom someone brought in [...]",
      rel("leads-to", "Command score", "Longer slots lead to higher scores."),
      rel("varies-with", "Command score", "Scores vary with slot length."),
      rel("contrasts-with", "Introduced founder", "Slots contrast with introductions [...]"),
      rel("condition-for", "Command score", "A slot is a condition for a score."),
      rel("leads-to", "A name nobody wrote", "Dropped."),
    ].join("\n---\n");
    const client = new MockInferenceClient({ responses: [reply] });
    const out = await suggestConcepts(
      { projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "summary", station: "context" }, text: "Introduced founders get longer office-hours slots and their command scores rise.", clock },
      client,
    );
    const rels = out.filter((e) => e.type === "relation-suggested");
    expect(rels.length).toBe(MAX_SUGGESTED);
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    const intro = out.find((e) => e.type === "concept-suggested");
    if (intro?.type !== "concept-suggested") throw new Error("no concept");
    expect(rels.some((r) => r.type === "relation-suggested" && r.to === intro.conceptId)).toBe(true);
    expect(client.requests[0]!.system).toContain(`at most ${MAX_SUGGESTED} new relations`);
  });
});

describe("every statement arrives with a home (ISC-633)", () => {
  async function fromSummary(reply: string) {
    const { events, slot, score } = twoConcepts();
    events.push(...setRelationEvents(events, { projectId: P, relationId: "r-live", from: slot, to: score, relation: "leads-to" }, clock));
    const client = new MockInferenceClient({ responses: [reply] });
    const out = await suggestConcepts(
      { projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "summary", station: "site" }, text: "Ravi gives introduced founders forty minutes and the rest twenty, and their command scores follow.", clock },
      client,
    );
    return { events: [...events, ...out], out, slot, score, client };
  }

  test("a statement Abductive suggests names an existing concept, an existing relation, or a new one from the same reply", async () => {
    const { out, slot, client } = await fromSummary(
      [
        "HOME: Office-hours slot\nSTATEMENT: Ravi gives introduced founders forty minutes.",
        "HOME: R1\nSTATEMENT: Scores follow the longer slots.",
        "NAME: Introduced founder\nDEFINITION: A founder whom someone brought in [...]\nSTATEMENT: Some founders arrive through a board member.",
      ].join("\n---\n"),
    );
    const said = out.filter((e) => e.type === "statement-suggested");
    expect(said.length).toBe(3);
    const intro = out.find((e) => e.type === "concept-suggested");
    if (intro?.type !== "concept-suggested") throw new Error("no concept");
    expect(said.map((s) => (s.type === "statement-suggested" ? s.home : null))).toEqual([
      { kind: "concept", id: intro.conceptId },
      { kind: "concept", id: slot },
      { kind: "relation", id: "r-live" },
    ]);
    expect(JSON.stringify(client.requests[0]!.messages)).toContain("R1. Office-hours slot leads to Command score");
  });

  /* M93, ISC-764: a suggested home asks for its own decision first. */
  test("accepting places the statement at its home in one placement event, once its suggested home is accepted", async () => {
    const found = await fromSummary(
      "NAME: Introduced founder\nDEFINITION: A founder whom someone brought in [...]\nSTATEMENT: Some founders arrive through a board member.",
    );
    const out = found.out;
    const s = out.find((e) => e.type === "statement-suggested");
    if (s?.type !== "statement-suggested") throw new Error("none");
    expect(() => acceptStatementEvents(found.events, { projectId: P, statementId: s.statementId }, clock)).toThrow('Decide on the suggested concept "Introduced founder" first.');
    const events = [...found.events, ...acceptConceptEvents(found.events, { projectId: P, conceptId: s.home.id }, clock)];
    const written = acceptStatementEvents(events, { projectId: P, statementId: s.statementId }, clock);
    const placements = written.filter((e) => e.type === "statement-attached" || e.type === "relation-statement-attached");
    expect(placements.length).toBe(1);
    expect(placements[0]).toMatchObject({ statementId: s.statementId, text: s.text, source: { kind: "answer", subject: "site" } });
    const v = onto([...events, ...written]);
    expect(v.concepts.get(s.home.id)!.status).toBe("accepted");
    expect(v.statements.get(s.statementId)!.conceptId).toBe(s.home.id);
    expect(v.suggestedStatements).toEqual([]);
  });

  test("the researcher can change the home before accepting: another relation, or a new concept written on the card", async () => {
    const { events, out } = await fromSummary("HOME: Office-hours slot\nSTATEMENT: Ravi gives introduced founders forty minutes.\nSTATEMENT: Scores follow the longer slots.");
    const [a, b] = out.filter((e) => e.type === "statement-suggested");
    if (a?.type !== "statement-suggested" || b?.type !== "statement-suggested") throw new Error("none");
    let after = [...events, ...acceptStatementEvents(events, { projectId: P, statementId: a.statementId, home: { kind: "relation", id: "r-live" } }, clock)];
    expect(onto(after).statements.get(a.statementId)!.relationId).toBe("r-live");
    after = [...after, ...acceptStatementEvents(after, { projectId: P, statementId: b.statementId, home: { kind: "new-concept", name: "Score drift", definition: "How scores move." } }, clock)];
    const v = onto(after);
    const drift = v.accepted.find((c) => c.name === "Score drift")!;
    expect(v.statements.get(b.statementId)!.conceptId).toBe(drift.id);
  });

  test("a rejected statement needs a reason and leaves the suggestions", async () => {
    const { events, out } = await fromSummary("HOME: Office-hours slot\nSTATEMENT: Ravi gives introduced founders forty minutes.");
    const s = out.find((e) => e.type === "statement-suggested");
    if (s?.type !== "statement-suggested") throw new Error("none");
    expect(() => rejectStatementEvents(events, { projectId: P, statementId: s.statementId, reason: "" }, clock)).toThrow();
    const after = [...events, ...rejectStatementEvents(events, { projectId: P, statementId: s.statementId, reason: "Not what I said." }, clock)];
    expect(onto(after).suggestedStatements).toEqual([]);
    const rows = projectLedger(after);
    expect(rows.find((r) => r.kind === "statement-rejected")!.happened).toBe('You rejected the statement "Ravi gives introduced founders forty minutes.": Not what I said.');
  });
});

describe("statements to place (ISC-634)", () => {
  const claims = (): LedgerEvent[] => [
    claim("pg-0", "Introduced founders get longer slots", ["ch-int"]),
    claim("pg-1", "Command scores rose after the long slots", ["ch-com"]),
    claim("pg-2", "Uniform pages stop mentors reading", ["ch-uni"]),
    claim("pg-3", "Olivia scores command from the room", ["ch-oli"]),
  ];

  test("a pass reads every statement still to place and proposes a home for each it can, new concepts and relations included", async () => {
    const events = claims();
    const client = new MockInferenceClient({
      responses: [
        [
          "NAME: Office-hours slot\nDEFINITION: The time a mentor gives [...]\nSTATEMENTS: 1",
          "NAME: Command score\nDEFINITION: The programme's score [...]\nSTATEMENTS: 4",
          "FROM: Office-hours slot\nKIND: leads-to\nTO: Command score\nCLAIM: Longer office-hours slots lead to higher command scores.\nSTATEMENTS: 2",
        ].join("\n---\n"),
        // M67, the lead's ruling: statement 3 has no home, so the pass asks once more; this reply homes none.
        "",
      ],
    });
    const out = await suggestConcepts({ projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "grouping" }, text: "", clock }, client);
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    const all = [...events, ...out];
    const v = onto(all);
    expect([...v.homesRead].sort()).toEqual(["pg-0", "pg-1", "pg-2", "pg-3"]);
    expect(v.homes.size).toBe(3);
    const rel = v.suggestedRelations[0]!;
    expect(v.homes.get("pg-1")).toEqual({ kind: "relation", id: rel.id });
    expect(v.homes.has("pg-2")).toBe(false);

    // M93, ISC-764: the suggested relation and its two ends are decided first, each on its own.
    expect(() => placeAtHomeEvents(all, { projectId: P, statementId: "pg-1", home: v.homes.get("pg-1")! }, clock)).toThrow("first.");
    let decided = all;
    for (const id of [rel.from, rel.to]) decided = [...decided, ...acceptConceptEvents(decided, { projectId: P, conceptId: id }, clock)];
    decided = [...decided, ...acceptRelationEvents(decided, { projectId: P, relationId: rel.id }, clock)];
    const placed = placeAtHomeEvents(decided, { projectId: P, statementId: "pg-1", home: v.homes.get("pg-1")! }, clock);
    const written = [...decided.slice(all.length), ...placed];
    for (const e of written) expect(validateEvent(e)).toEqual([]);
    const after = onto([...all, ...written]);
    expect(after.relations.get(rel.id)!.status).toBe("accepted");
    expect(after.statements.get("pg-1")!.relationId).toBe(rel.id);
    expect(after.relations.get(rel.id)!.statementIds).toEqual(["pg-1"]);
    expect(after.homes.has("pg-1")).toBe(false);
    // A second pass reads only what no pass has read.
    const again = new MockInferenceClient({ responses: ["HOME: Office-hours slot\nSTATEMENTS: 1"] });
    const next = await suggestConcepts({ projectId: P, events: [...all, ...written], graph: projectOntology([...all, ...written], P), context, source: { kind: "grouping" }, text: "", clock }, again);
    expect(next).toEqual([]);
    expect(again.requests.length).toBe(0);
  });

  test("redirecting a statement places it elsewhere, and the inbox is empty once every statement is placed", () => {
    const { events: base, slot, score } = twoConcepts();
    let events = [...base, ...addRelationEvents(base, { projectId: P, from: slot, to: score, relation: "leads-to", claim: "Longer slots lead to higher scores." }, clock)];
    const rid = onto(events).acceptedRelations[0]!.id;
    events = [...events, ...placeAtHomeEvents(events, { projectId: P, statementId: "pg-1", home: { kind: "concept", id: slot } }, clock)];
    events = [...events, ...placeAtHomeEvents(events, { projectId: P, statementId: "pg-2", home: { kind: "relation", id: rid } }, clock)];
    const v = onto(events);
    expect(v.unplaced).toEqual([]);
    expect(v.statements.get("pg-2")!.relationId).toBe(rid);
    expect(v.statements.get("pg-2")!.conceptId).toBeNull();
  });

  test("a proposal whose home the researcher rejected no longer stands", () => {
    const events: LedgerEvent[] = [
      ...claims(),
      { ...env("persona:concept-suggester"), type: "concept-suggested", conceptId: "c-x", name: "X", definition: "d [...]", properties: [], relations: [], statementIds: [], statements: [], source: { kind: "grouping" } } as LedgerEvent,
      { ...env("persona:concept-suggester"), type: "homes-proposed", read: ["pg-0"], proposals: [{ statementId: "pg-0", home: { kind: "concept", id: "c-x" } }] } as LedgerEvent,
    ];
    expect(onto(events).homes.has("pg-0")).toBe(true);
    const after = [...events, { ...env(), type: "concept-rejected", conceptId: "c-x", reason: "Not mine." } as LedgerEvent];
    expect(onto(after).homes.has("pg-0")).toBe(false);
  });
});

describe("the field list (ISC-635)", () => {
  test("a relation with no evidence is a line in the words of its claim, settled by a passage behind a statement placed under it", () => {
    const { events: base, slot, score } = twoConcepts();
    let events = [...base, ...addRelationEvents(base, { projectId: P, from: slot, to: score, relation: "leads-to", claim: "Longer office-hours slots lead to higher command scores." }, clock)];
    const rid = onto(events).acceptedRelations[0]!.id;
    const line = lookForNeeded(onto(events)).find((l) => l.kind === "relation")!;
    expect(line.text).toBe("Watch whether longer office-hours slots lead to higher command scores, and under which conditions.");
    expect(line.targetId).toBe(rid);
    events = [...events, ...placeAtHomeEvents(events, { projectId: P, statementId: "pg-2", home: { kind: "relation", id: rid } }, clock)];
    const v = onto(events);
    expect(evidenceBehindRelation(v, rid).passages).toEqual(["ch-9"]);
    expect(lookForNeeded(v).some((l) => l.kind === "relation")).toBe(false);
    expect(v.lookFor.find((l) => l.itemId === line.itemId)?.settled).toMatchObject({ by: "passage", chunkId: "ch-9" });
  });
});

describe("the Report, the figure and the bundle carry relation cards (ISC-635)", () => {
  async function exportsOf() {
    const { buildOntologyMemo } = await import("../src/export/ontologyMemo.ts");
    const { conceptMapSvg } = await import("../src/export/conceptsExport.ts");
    const { buildBundle, parseBundle, remapBundleIds, serializeBundle } = await import("../src/export/bundle.ts");
    const { events: base, slot, score } = twoConcepts();
    let events = [...base, ...addRelationEvents(base, { projectId: P, from: slot, to: score, relation: "leads-to", claim: "Longer office-hours slots lead to higher command scores.", conditions: "When the founder was introduced." }, clock)];
    const rid = onto(events).acceptedRelations[0]!.id;
    events = [...events, ...placeAtHomeEvents(events, { projectId: P, statementId: "pg-2", home: { kind: "relation", id: rid } }, clock)];
    const project = { id: P, title: "Relations test", stage: "design-brief", createdAt: 1, brief: emptyBrief() } as never;
    return { events, rid, buildOntologyMemo, conceptMapSvg, buildBundle, parseBundle, remapBundleIds, serializeBundle, project };
  }

  test("the Report carries each relation card: the kind, the claim, the conditions, the statements and the evidence", async () => {
    const { events, buildOntologyMemo, project } = await exportsOf();
    const memo = buildOntologyMemo({ project, graph: projectOntology(events, P), events });
    expect(memo).toContain("### Relations");
    expect(memo).toContain("#### R1. Office-hours slot leads to Command score");
    expect(memo).toContain("Longer office-hours slots lead to higher command scores.");
    expect(memo).toContain("**Conditions:** When the founder was introduced.");
    expect(memo).toContain("- From your data: Command scores rose after the long slots"); // M75: each statement carries its label
    /* M78a, ISC-679: the evidence is one line under each relation, written once. */
    expect(memo).toContain("**Evidence:** passage");
  });

  test("the figure labels each edge with its number and keys the claims under the map", async () => {
    const { events, conceptMapSvg } = await exportsOf();
    const svg = conceptMapSvg(events, P, projectOntology(events, P), { title: "Relations test", stamp: "s" })!;
    expect(svg).toContain(">R1 leads to<");
    expect(svg).toContain("R1. Office-hours slot leads to Command score: Longer office-hours slots lead to higher command scores.");
  });

  test("a colleague's import of the bundle reads the same relation cards", async () => {
    const { events, buildBundle, parseBundle, remapBundleIds, serializeBundle, project } = await exportsOf();
    const back = remapBundleIds(parseBundle(serializeBundle(buildBundle({ project, documents: [], chunks: [], anomalies: [], twin: null, events }))));
    const there = projectConcepts(back.events, back.project.id, projectOntology(back.events, back.project.id));
    const here = onto(events);
    expect(there.acceptedRelations.map((r) => [r.claim, r.conditions, r.statementIds.length])).toEqual(
      here.acceptedRelations.map((r) => [r.claim, r.conditions, r.statementIds.length]),
    );
  });
});

describe("one statement, one home, in one reply (found on the Safari walk)", () => {
  test("a statement the model writes under two homes is suggested once, at the first home", async () => {
    const { events } = twoConcepts();
    const client = new MockInferenceClient({
      responses: [
        [
          "NAME: Volunteer recruit\nDEFINITION: A volunteer [...]\nSTATEMENT: Turnover is highest on quiet afternoon shifts.",
          "FROM: Office-hours slot\nKIND: varies-with\nTO: Command score\nCLAIM: Scores vary with slots.\nSTATEMENT: Turnover is highest on quiet afternoon shifts.",
        ].join("\n---\n"),
      ],
    });
    const out = await suggestConcepts(
      { projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "summary", station: "context" }, text: "Turnover is highest among website volunteers placed on quiet afternoon shifts, the leads say.", clock },
      client,
    );
    const said = out.filter((e) => e.type === "statement-suggested");
    expect(said.length).toBe(1);
    const concept = out.find((e) => e.type === "concept-suggested");
    if (said[0]?.type !== "statement-suggested" || concept?.type !== "concept-suggested") throw new Error("missing");
    expect(said[0].home).toEqual({ kind: "concept", id: concept.conceptId });
  });
});

describe("the lead's rulings: tray claims get a home, and links ground a relation (M67)", () => {
  const relate = (from: string, to: string, role: string, extra: Record<string, unknown> = {}): LedgerEvent =>
    ({ ...env("human"), type: "ontology-mutation", op: "relate", targetId: uid(), edge: { from, to, role }, origin: "author-prior", title: `${from} ${role} ${to}`, ...extra }) as LedgerEvent;
  const page = (id: string, pageType: string, title: string): LedgerEvent =>
    /* M75: each cites a passage, so each is a data read and a statement to place. */
    ({ ...env("human"), type: "ontology-mutation", op: "create", targetId: id, pageType, title, body: "b", origin: "model-proposed", supportingChunks: [`ch-${id}`] }) as LedgerEvent;
  const waiting = (proposalId: string, title: string): LedgerEvent =>
    ({ ...env("persona:rival"), type: "proposal", proposalId, pageType: "rival", title, body: "b", sourceChunks: [] }) as LedgerEvent;

  test("a pass lists the waiting tray claims and the links between listed statements, and a relation that names a link rests on it", async () => {
    const events: LedgerEvent[] = [
      page("pz", "puzzle", "Introduced founders get longer office-hours slots"),
      page("th", "theory", "Structured contact builds command regardless of introduction"),
      relate("pz", "th", "stands-to", { puzzleRelation: "contradicts" }),
      waiting("prop-1", "Slot length tracks who introduced the founder"),
    ];
    const client = new MockInferenceClient({
      responses: [
        [
          "NAME: Introduction route\nDEFINITION: How a founder came in [...]\nSTATEMENTS: 1, 3",
          "NAME: Command\nDEFINITION: Command of the venture [...]\nSTATEMENTS: 2",
          "FROM: Introduction route\nKIND: contrasts-with\nTO: Command\nCLAIM: The introduction route contrasts with command [...]\nLINK: L1",
        ].join("\n---\n"),
      ],
    });
    const out = await suggestConcepts({ projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "grouping" }, text: "", clock }, client);
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    const prompt = JSON.stringify(client.requests[0]!.messages);
    expect(prompt).toContain("3. Slot length tracks who introduced the founder (a suggestion still waiting for their decision)");
    expect(prompt).toContain("L1. Statement 1 contradicts statement 2");
    expect(client.requests[0]!.system).toContain("LINK:");
    const rel = out.find((e) => e.type === "relation-suggested");
    if (rel?.type !== "relation-suggested") throw new Error("no relation");
    expect(rel.grounds).toEqual(["pz|stands-to|th"]);
    const v = onto([...events, ...out]);
    expect(v.relations.get(rel.relationId)!.groundsSaid).toEqual([
      '"Introduced founders get longer office-hours slots" contradicts "Structured contact builds command regardless of introduction"',
    ]);
    const intro = out.find((e) => e.type === "concept-suggested");
    if (intro?.type !== "concept-suggested") throw new Error("no concept");
    expect(v.proposalHomes.get("prop-1")).toEqual({ kind: "concept", id: intro.conceptId });
    expect(v.homesRead.has("prop-1")).toBe(true);
  });

  test("a statement for a concept already in the ontology arrives with that home rather than being lost", async () => {
    const { events, slot } = twoConcepts();
    const client = new MockInferenceClient({ responses: ["HOME: Office-hours slot\nSTATEMENT: Ravi gives introduced founders forty minutes."] });
    const out = await suggestConcepts(
      { projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "summary", station: "site" }, text: "Ravi gives introduced founders forty minutes and everyone else twenty.", clock },
      client,
    );
    expect(out.filter((e) => e.type === "concept-suggested")).toEqual([]);
    const said = out.find((e) => e.type === "statement-suggested");
    if (said?.type !== "statement-suggested") throw new Error("lost");
    expect(said.home).toEqual({ kind: "concept", id: slot });
  });
});

describe("a grounding link reads as one sentence", () => {
  test("a claim title that ends in a full stop is quoted without it, so the sentence ends once", () => {
    const events: LedgerEvent[] = [
      { ...env("human"), type: "ontology-mutation", op: "create", targetId: "a", pageType: "puzzle", title: "Slots ran long.", body: "b", origin: "author-prior" } as LedgerEvent,
      { ...env("human"), type: "ontology-mutation", op: "create", targetId: "b", pageType: "theory", title: "Contact builds command.", body: "b", origin: "author-prior" } as LedgerEvent,
      { ...env("human"), type: "ontology-mutation", op: "relate", targetId: "e", edge: { from: "a", to: "b", role: "stands-to" }, puzzleRelation: "contradicts", origin: "author-prior", title: "t" } as LedgerEvent,
      relationSuggestion("c1", "c2", { grounds: ["a|stands-to|b"] }),
    ];
    expect(onto(events).relations.get("r-slots")!.groundsSaid).toEqual(['"Slots ran long" contradicts "Contact builds command"']);
  });
});

describe("a pass of proposals homes every statement it reads (the lead's ruling, M67)", () => {
  const four = (): LedgerEvent[] => [
    claim("pg-0", "Introduced founders get longer slots", ["ch-int"]),
    claim("pg-1", "Command scores rose after the long slots", ["ch-com"]),
    claim("pg-2", "Uniform pages stop mentors reading", ["ch-uni"]),
    claim("pg-3", "Olivia scores command from the room", ["ch-oli"]),
  ];
  const run = (events: LedgerEvent[], client: MockInferenceClient) =>
    suggestConcepts({ projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "grouping" }, text: "", clock }, client);

  test("the prompt asks for a home for every numbered statement, with a new concept or relation where none fits", async () => {
    const client = new MockInferenceClient({ responses: ["NAME: Slots\nDEFINITION: d [...]\nSTATEMENTS: 1, 2, 3, 4"] });
    await run(four(), client);
    expect(client.requests[0]!.system).toContain("Give every numbered statement exactly one home, all of them.");
    expect(client.requests.length).toBe(1);
  });

  test("a reply that leaves statements without a home is refused, and the model is asked once more for those only", async () => {
    const client = new MockInferenceClient({
      responses: [
        [
          "NAME: Office-hours slot\nDEFINITION: The time a mentor gives [...]\nSTATEMENTS: 1",
          "NAME: Command score\nDEFINITION: The programme's score [...]\nSTATEMENTS: 4",
          "FROM: Office-hours slot\nKIND: leads-to\nTO: Command score\nCLAIM: Longer slots lead to higher scores.",
        ].join("\n---\n"),
        ["HOME: B1\nSTATEMENTS: 2", "NAME: Uniform pages\nDEFINITION: Updates that read alike [...]\nSTATEMENTS: 3"].join("\n---\n"),
      ],
    });
    const out = await run(four(), client);
    expect(client.requests.length).toBe(2);
    const retry = client.requests[1]!;
    expect(retry.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(retry.messages[2]!.content).toContain("without a home: 2, 3.");
    expect(retry.messages[2]!.content).toContain("B1. Office-hours slot leads to Command score");
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    const v = onto([...four(), ...out]);
    expect([...v.homes.keys()].sort()).toEqual(["pg-0", "pg-1", "pg-2", "pg-3"]);
    const rel = v.suggestedRelations[0]!;
    expect(v.homes.get("pg-1")).toEqual({ kind: "relation", id: rel.id });
    expect(v.suggested.map((c) => c.name)).toContain("Uniform pages");
  });

  test("the model is asked again once only: what a second reply still leaves out is read, with no home, for Suggest homes", async () => {
    const client = new MockInferenceClient({ responses: ["NAME: Slots\nDEFINITION: d [...]\nSTATEMENTS: 1", "NAME: Slots again\nDEFINITION: d [...]"] });
    const out = await run(four(), client);
    expect(client.requests.length).toBe(2);
    const v = onto([...four(), ...out]);
    expect(v.homes.size).toBe(1);
    expect(v.homesRead.size).toBe(4);
  });
});

describe("the watch line keeps a name's capital (the lead's ruling, M67)", () => {
  const line = (claimText: string, extra: LedgerEvent[] = []) => {
    const { events: base, slot, score } = twoConcepts();
    const events = [...base, ...extra, ...addRelationEvents(base, { projectId: P, from: slot, to: score, relation: "leads-to", claim: claimText }, clock)];
    return lookForNeeded(onto(events)).find((l) => l.kind === "relation")!.text;
  };

  test("a name seen in a statement keeps its capital: Ravi stays Ravi", () => {
    expect(line("Ravi gives introduced founders forty minutes.", [claim("pg-r", "Mentors say Ravi runs the room")])).toBe(
      "Watch whether Ravi gives introduced founders forty minutes, and under which conditions.",
    );
  });

  test("an acronym keeps its capitals, and a word from a concept's name keeps its capital", () => {
    expect(line("AI mentors give longer slots.")).toBe("Watch whether AI mentors give longer slots, and under which conditions.");
    expect(line("Command score rises with slot length.")).toBe("Watch whether Command score rises with slot length, and under which conditions.");
  });

  test("an ordinary opening word is lowered", () => {
    expect(line("Longer slots lead to higher scores.")).toBe("Watch whether longer slots lead to higher scores, and under which conditions.");
  });
});
