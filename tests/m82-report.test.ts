/**
 * M82, ISC-695: the Report carries The argument so far and each card's Why it
 * matters line, with whose words each line is in.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { addConceptEvents, addRelationEvents } from "../src/concepts/door.ts";
import { WHY_SECTION_NOTE as SECTION_NOTE, conceptReportLines } from "../src/export/conceptsExport.ts";
import { sentenceBreaks } from "../src/copy/rules.ts";

const P = "p-m82-report";
let n = 0;
let t = 90_000;
const clock = { now: () => (t += 10), makeId: () => `cdcdcdcd-8282-4282-8282-${String((n += 1)).padStart(12, "0")}` };
const view = (events: readonly LedgerEvent[]) => projectConcepts(events, P, projectOntology(events, P));
const persona = (actor: string) => ({ id: clock.makeId(), ts: clock.now(), actor: actor as LedgerEvent["actor"], projectId: P, model: "m", modelVersion: "v" });

function project(): LedgerEvent[] {
  let events: LedgerEvent[] = [];
  for (const name of ["Booked slot", "Queue talk", "Tool crib"]) events = [...events, ...addConceptEvents(events, { projectId: P, name, definition: `${name}, defined.` }, clock)];
  const id = (name: string) => view(events).accepted.find((c) => c.name === name)!.id;
  events = [...events, ...addRelationEvents(events, { projectId: P, from: id("Booked slot"), to: id("Queue talk"), relation: "leads-to", claim: "Booked slots cut queue talk." }, clock)];
  const rid = view(events).acceptedRelations[0]!.id;
  return [
    ...events,
    { ...persona("persona:why-writer"), type: "why-suggested", target: { kind: "concept", id: id("Booked slot") }, text: "Booked slot is the change your puzzle turns on." } as LedgerEvent,
    { ...persona("persona:why-writer"), type: "why-suggested", target: { kind: "concept", id: id("Queue talk") }, text: "Queue talk is the encounter." } as LedgerEvent,
    { id: clock.makeId(), ts: clock.now(), actor: "human", projectId: P, type: "why-accepted", target: { kind: "concept", id: id("Queue talk") } } as LedgerEvent,
    { id: clock.makeId(), ts: clock.now(), actor: "human", projectId: P, type: "why-refined", target: { kind: "relation", id: rid }, text: "This chain is my argument." } as LedgerEvent,
    { ...persona("persona:argument-writer"), type: "argument-written", text: "You expect booked slots to cut queue talk at the tool crib.", basis: "b" } as LedgerEvent,
  ];
}

describe("M82: the Report carries why each card matters, and the argument so far (ISC-695)", () => {
  test("the argument so far under the ontology's heading, and each line under its card with whose words", () => {
    const lines = conceptReportLines(project(), P, projectOntology(project(), P));
    const report = lines.join("\n");
    const at = (s: string) => lines.indexOf(s);
    expect(at("### The argument so far")).toBeGreaterThan(-1);
    expect(at("### The argument so far")).toBeLessThan(at("### Booked slot"));
    expect(report).toContain("You expect booked slots to cut queue talk at the tool crib.\n\n_Written by Abductive from the concepts and relations that you accepted._");
    /* The lead's ruling of 2026-10-04: who wrote the lines is said once for the
       section; a line carries a marker only when it is the researcher's or still
       waits for their decision. */
    expect(report.match(/Abductive wrote each Why it matters line/g)?.length).toBe(1);
    expect(at(SECTION_NOTE)).toBeGreaterThan(-1);
    expect(at(SECTION_NOTE)).toBeLessThan(at("### Booked slot"));
    expect(report).toContain("**Why it matters:** Booked slot is the change your puzzle turns on. _(to decide)_");
    expect(report).toContain("**Why it matters:** Queue talk is the encounter.\n");
    expect(report).toContain("**Why it matters:** This chain is my argument. _(yours)_");
    expect(report).not.toContain("_Written by Abductive._");
    expect(report).not.toContain("**Why it matters:** still to come.");
    expect(report.match(/\*\*Why it matters:\*\*/g)?.length).toBe(3);
    for (const s of [SECTION_NOTE.replace(/^_|_$/g, ""), "Written by Abductive from the concepts and relations that you accepted."]) expect(sentenceBreaks(s)).toEqual([]);
  });

  test("a project whose cards carry no line leaves the note out", () => {
    const events = addConceptEvents([], { projectId: P, name: "Bare", definition: "B." }, clock);
    expect(conceptReportLines(events, P, projectOntology(events, P))).not.toContain(SECTION_NOTE);
  });

  test("before Abductive writes the argument, the Report leaves the section out", () => {
    const events = addConceptEvents([], { projectId: P, name: "Alone", definition: "A." }, clock);
    expect(conceptReportLines(events, P, projectOntology(events, P))).not.toContain("### The argument so far");
  });
});
