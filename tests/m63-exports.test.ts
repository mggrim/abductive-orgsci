/**
 * M63, ISC-613: the exports and History carry the ontology.
 *
 * The Report carries the concepts and the lines to look for in the field; the
 * figure draws the concept map; the bundle carries the new events and a
 * colleague's import reads the same ontology; History says every new event in a
 * sentence.
 *
 * M89 (2026-10-14): the readiness report left the Report with the checks, and
 * nothing writes a `readiness-report` or a `concept-flag` any more. Both event
 * types still validate, project and show in History, so the fixture below
 * writes one of each by hand, as a project saved before M89 holds them.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
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
} from "../src/concepts/door.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { conceptMapSvg } from "../src/export/conceptsExport.ts";
import { buildBundle, parseBundle, remapBundleIds, serializeBundle } from "../src/export/bundle.ts";
import { projectLedger, LEDGER_KINDS } from "../src/workbench/Instrumentation.tsx";
import { emptyBrief } from "../src/state/projects.ts";
import { validateEvent } from "../src/ledger/events.ts";

const P = "p-exports";
let n = 0;
const uid = () => `abababab-7777-4777-8777-${String((n += 1)).padStart(12, "0")}`;
let t = 50_000;
const clock = { now: () => (t += 10), makeId: uid };
const PROJECT = { id: P, title: "Pitchwright test", stage: "design-brief", createdAt: 1, brief: { ...emptyBrief(), targetVenue: "ASQ" } } as never;

function built(): LedgerEvent[] {
  const claim = { id: uid(), ts: (t += 10), actor: "human", projectId: P, type: "ontology-mutation", op: "create", targetId: "pg-1", pageType: "observation", title: "Same phrase across three ventures", body: "b", origin: "model-proposed" } as LedgerEvent;
  const suggestion = {
    id: uid(), ts: (t += 10), actor: "persona:concepts", model: "m", modelVersion: "v", projectId: P, type: "concept-suggested",
    conceptId: "c-uniform", name: "Uniform pages", definition: "Updates that read the same [...]", properties: ["How alike"], relations: [],
    statementIds: ["pg-1"], statements: [], source: { kind: "grouping" },
  } as LedgerEvent;
  const other = { ...suggestion, id: uid(), ts: (t += 10), conceptId: "c-other", name: "Room performance" } as LedgerEvent;
  let e: LedgerEvent[] = [claim, suggestion, other];
  e = [...e, ...acceptConceptEvents(e, { projectId: P, conceptId: "c-uniform" }, clock)];
  e = [...e, ...rejectConceptEvents(e, { projectId: P, conceptId: "c-other", reason: "Not mine." }, clock)];
  e = [...e, ...refineConceptEvents(e, { projectId: P, conceptId: "c-uniform", definition: "Updates that read the same after the board's rule." }, clock)];
  e = [...e, ...addConceptEvents(e, { projectId: P, name: "Time on task", definition: "How much a mentor reads." }, clock)];
  const dose = projectConcepts(e, P, projectOntology(e, P)).accepted.find((c) => c.name === "Time on task")!;
  e = [...e, ...setPropertyEvents(e, { projectId: P, conceptId: dose.id, name: "Weekly count", varies: "None to all." }, clock)];
  e = [...e, ...setRelationEvents(e, { projectId: P, from: "c-uniform", to: dose.id, relation: "leads-to" }, clock)];
  e = [...e, ...placeStatementEvents(e, { projectId: P, conceptId: dose.id, pageId: "pg-1" }, clock)];
  const view = projectConcepts(e, P, projectOntology(e, P));
  const line = view.lookFor.find((l) => l.settled === null)!;
  e = [...e, ...settleLineEvents(e, { projectId: P, itemId: line.itemId, note: "Asked in week five." }, clock)];
  const tmp = setRelationEvents(e, { projectId: P, from: dose.id, to: "c-uniform", relation: "contrasts-with" }, clock);
  e = [...e, ...tmp];
  const rel = tmp.find((x) => x.type === "concept-relation-set");
  if (rel?.type === "concept-relation-set") e = [...e, ...removeRelationEvents(e, { projectId: P, relationId: rel.relationId }, clock)];
  e = [
    ...e,
    {
      id: uid(), ts: (t += 10), actor: "system", projectId: P, type: "readiness-report",
      verdict: "Not yet: one part of the project is missing.",
      rows: [{ criterion: "concepts", status: "missing", sentence: "No concept is defined yet." }],
      fixFirst: [], reviewerQuestions: ["Where else?"], rivals: [], argument: ["You're claiming X."], biases: [],
      flags: [{ findingId: "f-9", rule: "orphan-construct", reason: "Nothing links this claim.", criterion: "concepts", station: "early-data", conceptId: "c-uniform" }],
      inputs: { eventCount: e.length, lastEventId: e[e.length - 1]?.id ?? "" },
    } as LedgerEvent,
    {
      id: uid(), ts: (t += 10), actor: "system", projectId: P, type: "concept-flag",
      conceptId: "c-uniform", findingId: "f-9", rule: "orphan-construct", reason: "Nothing links this claim.",
    } as LedgerEvent,
  ];
  return e;
}

describe("the Report (ISC-613)", () => {
  const events = built();
  const memo = buildOntologyMemo({ project: PROJECT, graph: projectOntology(events, P), events });
  test("carries the ontology with each concept's parts", () => {
    expect(memo).toContain("## Emerging project ontology");
    expect(memo).toContain("### Uniform pages");
    expect(memo).toContain("Updates that read the same after the board's rule.");
    /* M78a, ISC-679 (the lead's ruling (a)): the Report keeps each concept's
       name, definition and origin, and leaves the first accepted wording to History. */
    expect(memo).not.toContain("First accepted as Uniform pages");
    expect(memo).toContain("- Weekly count: None to all.");
    expect(memo).toContain("Uniform pages leads to Time on task");
    expect(memo).toContain("- Your replies: Same phrase across three ventures"); // M75: the statement carries its label (ruling B)
  });
  test("carries the field list, and a readiness report already on the record no longer reaches it", () => {
    expect(memo).toContain("## What to look for in the field");
    // M89: the Report writes no readiness report, even over a ledger that holds one.
    expect(memo).not.toContain("## Readiness report");
    expect(memo).not.toContain("### Biases flagged");
    expect(memo).not.toMatch(/[–—]/);
  });
});

describe("the figure (ISC-613)", () => {
  test("draws the concept map with names and the relation, and nothing without a concept", () => {
    const events = built();
    const svg = conceptMapSvg(events, P, projectOntology(events, P), { title: "Pitchwright test", stamp: "abc123" })!;
    expect(svg).toContain("<svg");
    expect(svg).toContain("Uniform pages");
    expect(svg).toContain("Time on task");
    expect(svg).toContain("leads to");
    expect(conceptMapSvg([], P, projectOntology([], P), { title: "x", stamp: "y" })).toBeNull();
  });
});

describe("the bundle (ISC-613)", () => {
  test("carries the new events and a remapped import reads the same ontology", () => {
    const events = built();
    const bundle = buildBundle({ project: PROJECT, documents: [], chunks: [], anomalies: [], twin: null, events });
    const back = remapBundleIds(parseBundle(serializeBundle(bundle)));
    const pid = back.project.id;
    const a = projectConcepts(events, P, projectOntology(events, P));
    const b = projectConcepts(back.events, pid, projectOntology(back.events, pid));
    expect(b.accepted.map((c) => c.name)).toEqual(a.accepted.map((c) => c.name));
    expect(b.links.length).toBe(a.links.length);
    expect(b.reports.length).toBe(1);
    expect([...b.flagsAt.values()].flat().length).toBe(1);
  });
});

describe("History (ISC-613)", () => {
  test("a hand-built readiness report and concept flag are valid events", () => {
    const hand = built().filter((x) => x.type === "readiness-report" || x.type === "concept-flag");
    expect(hand).toHaveLength(2);
    for (const e of hand) expect({ type: e.type, errors: validateEvent(e) }).toEqual({ type: e.type, errors: [] });
  });

  test("every new event is a row with a sentence, and each kind has a filter label", () => {
    const events = built();
    const rows = projectLedger(events);
    const kinds = new Set(rows.map((r) => r.kind));
    const m63 = [
      "concept-suggested", "concept-accepted", "concept-refined", "concept-rejected", "concept-property-set", "concept-relation-set",
      "concept-relation-removed", "statement-attached", "look-for-raised", "look-for-settled", "readiness-report", "concept-flag",
    ] as const;
    for (const k of m63) {
      expect({ k, present: kinds.has(k) }).toEqual({ k, present: true });
      expect(LEDGER_KINDS).toContain(k);
    }
    for (const r of rows.filter((x) => (m63 as readonly string[]).includes(x.kind))) {
      expect(r.happened.length).toBeGreaterThan(10);
      expect(r.happened).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}/);
    }
  });
});
