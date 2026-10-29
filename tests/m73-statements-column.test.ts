/**
 * The Projects table counts what the model holds and what waits on the
 * researcher (M73, ISC-659, the lead's rulings of 2026-10-02).
 *
 * The column counted live ontology pages, so a project with an accepted concept
 * read 0. Since the rulings it is Statements: every statement in the model,
 * placed or awaiting a home, so the shipped example still reads 45. Concepts and
 * relations are named in the project's own cell, and Suggestions counts every
 * suggestion awaiting a decision: concepts, relations and statements, plus the
 * legacy tray.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { emptyBrief, type Project } from "../src/state/projects.ts";
import { studyState, StudyRow, ontologyLine, type StudyState } from "../src/ui/ProjectList.tsx";
import { resumeLine } from "../src/ui/Introduction.tsx";
import { PAGE_HELP } from "../src/ui/pageHelp.ts";
import { addConceptEvents, addRelationEvents, placeStatementEvents } from "../src/concepts/door.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectProposals } from "../src/proposals/projection.ts";

const P = "m73-column";
let n = 0;
let t = 1_790_000_000_000;
const clock = { now: () => (t += 10), makeId: () => `73737373-7373-4737-8737-${String((n += 1)).padStart(12, "0")}` };
const project: Project = { id: P, title: "Repair cafes", stage: "design-brief", createdAt: 1, brief: emptyBrief() } as Project;
const env = (actor: string = "human") => ({
  id: clock.makeId(),
  ts: clock.now(),
  actor,
  projectId: P,
  ...(actor.startsWith("persona:") ? { model: "m", modelVersion: "v" } : {}),
});

/** A statement on the record: a claim page, as the example's 45 are. */
function claim(pageId: string, title: string): LedgerEvent {
  return {
    ...env(),
    type: "ontology-mutation",
    op: "create",
    targetId: pageId,
    pageType: "observation",
    title,
    body: `${title}.`,
    origin: "model-proposed",
    supportingChunks: [`ch-${pageId}`], // M75: a data read, which the Statements column counts
  } as LedgerEvent;
}
const state = (events: readonly LedgerEvent[]) => studyState({ project, events, corpusChunkIds: [] });

/** Two accepted concepts, one relation between them, two claims placed under the first and one waiting for a home. */
function built(): LedgerEvent[] {
  let events: LedgerEvent[] = [claim("pg-1", "Volunteers turn away kettles"), claim("pg-2", "Toasters get fixed first"), claim("pg-3", "Owners stay to watch")];
  events = [...events, ...addConceptEvents(events, { projectId: P, name: "Worth fixing", definition: "What volunteers agree to repair." }, clock)];
  events = [...events, ...addConceptEvents(events, { projectId: P, name: "Return visit", definition: "A visitor coming back." }, clock)];
  const [fix, back] = projectConcepts(events, P, projectOntology(events, P)).accepted;
  events = [...events, ...addRelationEvents(events, { projectId: P, from: fix!.id, to: back!.id, relation: "leads-to", claim: "A fixed item brings its owner back." }, clock)];
  events = [...events, ...placeStatementEvents(events, { projectId: P, conceptId: fix!.id, pageId: "pg-1" }, clock)];
  events = [...events, ...placeStatementEvents(events, { projectId: P, conceptId: fix!.id, pageId: "pg-2" }, clock)];
  return events;
}

const row = (s: StudyState) =>
  renderToStaticMarkup(
    React.createElement("table", null, React.createElement("tbody", null, React.createElement(StudyRow, { row: s, armed: false, onArm() {}, onCancel() {}, onRemove() {} }))),
  );

describe("Statements (ISC-659)", () => {
  test("every statement in the model counts, placed or awaiting a home", () => {
    const s = state(built());
    expect(s.statements).toBe(3);
    expect(s.concepts).toBe(2);
    expect(s.relations).toBe(1);
  });

  test("a fresh project with one accepted concept and its placed statements reads their number", () => {
    let events: LedgerEvent[] = [claim("pg-1", "Volunteers turn away kettles"), claim("pg-2", "Toasters get fixed first")];
    events = [...events, ...addConceptEvents(events, { projectId: P, name: "Worth fixing", definition: "What volunteers agree to repair." }, clock)];
    const [fix] = projectConcepts(events, P, projectOntology(events, P)).accepted;
    for (const pageId of ["pg-1", "pg-2"]) events = [...events, ...placeStatementEvents(events, { projectId: P, conceptId: fix!.id, pageId }, clock)];
    const s = state(events);
    expect(s.statements).toBe(2);
    expect(s.concepts).toBe(1);
    expect(row(s)).toMatch(/data-testid="study-statements"[^>]*>2</);
  });

  /* M75, ISC-669 (the lead's ruling B): the column counts summary, reply and data
     statements, and the example's 45 legacy claims hold 17 data reads and 19
     reply claims beside 5 paper claims and 4 rivals. */
  test("the shipped example reads its 36 statements from data and replies", async () => {
    const bundle = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url)).json();
    const example = studyState({ project: bundle.project, events: bundle.events, corpusChunkIds: [] });
    expect(example.statements).toBe(36);
    expect(example.concepts).toBe(0);
    expect(example.relations).toBe(0);
    expect(row(example)).not.toContain('data-testid="study-ontology"');
  });
});

describe("concepts and relations in the project's cell", () => {
  test("named when either is above zero, in the reader's words", () => {
    expect(ontologyLine(2, 1)).toBe("2 concepts, 1 relation");
    expect(ontologyLine(1, 0)).toBe("1 concept");
    expect(ontologyLine(3, 2)).toBe("3 concepts, 2 relations");
    expect(ontologyLine(0, 0)).toBeNull();
    expect(row(state(built()))).toMatch(/data-testid="study-ontology"[^>]*>2 concepts, 1 relation</);
    expect(row(state([]))).not.toContain('data-testid="study-ontology"');
  });
});

describe("Suggestions counts every suggestion awaiting a decision (ISC-659, ruled into M73)", () => {
  test("concepts, relations and statements suggested and not decided, plus the legacy tray", () => {
    let events = built();
    const [fix, back] = projectConcepts(events, P, projectOntology(events, P)).accepted;
    events = [
      ...events,
      { ...env("persona:concepts"), type: "concept-suggested", conceptId: "c-s1", name: "Owner's attachment", definition: "How much the owner cares.", properties: [], relations: [], statementIds: [], statements: [], source: { kind: "summary", station: "process" } } as unknown as LedgerEvent,
      { ...env("persona:concepts"), type: "concept-suggested", conceptId: "c-s2", name: "Cost of parts", definition: "What the parts cost.", properties: [], relations: [], statementIds: [], statements: [], source: { kind: "summary", station: "process" } } as unknown as LedgerEvent,
      { ...env("persona:concept-suggester"), type: "relation-suggested", relationId: "r-s1", from: back!.id, to: fix!.id, relation: "leads-to", claim: "Coming back makes an item worth fixing.", statementIds: [], statements: [], source: { kind: "grouping" } } as unknown as LedgerEvent,
      { ...env("persona:concepts"), type: "statement-suggested", statementId: "st-s1", text: "Volunteers ask what the item means to the owner.", home: { kind: "concept", id: fix!.id }, source: { kind: "summary", station: "process" } } as unknown as LedgerEvent,
    ];
    const view = projectConcepts(events, P, projectOntology(events, P));
    expect(view.suggested.length).toBe(2);
    expect(view.suggestedRelations.length).toBe(1);
    expect(view.suggestedStatements.length).toBe(1);
    const tray = projectProposals(events, P).pending.length;
    expect(state(events).staged).toBe(4 + tray);
    // A decided suggestion leaves the count.
    const rejected = [...events, { ...env(), type: "concept-rejected", conceptId: "c-s1", reason: "Too broad." } as unknown as LedgerEvent];
    expect(state(rejected).staged).toBe(3 + tray);
  });

  test("the example counts its legacy tray as before", async () => {
    const bundle = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url)).json();
    const example = studyState({ project: bundle.project, events: bundle.events, corpusChunkIds: [] });
    const view = projectConcepts(bundle.events, bundle.project.id, projectOntology(bundle.events, bundle.project.id));
    expect(example.staged).toBe(
      projectProposals(bundle.events, bundle.project.id).pending.length + view.suggested.length + view.suggestedRelations.length + view.suggestedStatements.length,
    );
  });
});

describe("the words (L2, L12)", () => {
  test("the heading, the key, the page Help and the front page say Statements", async () => {
    const src = await Bun.file(new URL("../src/ui/ProjectList.tsx", import.meta.url)).text();
    expect(src).not.toMatch(/>\s*(Claims|Concepts)\s*</);
    expect(src).toMatch(/>\s*Statements\s*</);
    expect(src).toContain("<dt>Statements</dt>");
    expect(src).toContain(
      "<dd>Statements from a step summary, your replies at a step or a read of your data, placed under a concept or a relation or still waiting for a home. The project's own cell counts its concepts and relations.</dd>",
    );
    expect(src).toContain(
      "<dd>Suggestions that Abductive made and that wait for your decision: concepts, relations and statements. A suggestion joins your ontology only when you accept it.</dd>",
    );
    expect(JSON.stringify(PAGE_HELP.studies)).toContain("with its steps, statements, concepts and suggestions"); // M84, ISC-705
    expect(resumeLine(state(built()))).toContain("3 statements");
  });
});

describe("the table still fits (M71's measure)", () => {
  /* "Statements" is 14px wider than "Claims" in the uppercase heading, measured
   * in Safari at a 1398px window: the table needed 756px in its 742px pane, so
   * Last changed sat behind the table's own scrollbar again, the defect M71
   * fixed. Its heading wraps now, as its dates already do. */
  test("the Last changed heading may wrap", async () => {
    const src = await Bun.file(new URL("../src/ui/ProjectList.tsx", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/ui/styles/shell.css", import.meta.url)).text();
    expect(src).toContain('<th scope="col" className="study-when-head">');
    expect(css).toMatch(/\.studies-table thead th\.study-when-head \{[^}]*white-space: normal;/);
  });
});
