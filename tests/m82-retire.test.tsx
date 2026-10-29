/**
 * M82, the lead's ruling (A) of 2026-10-04: Retire concept.
 *
 * "A researcher must be able to drop a concept that turned out empty." The
 * lone-concept line reads "Tool crib stands alone; relate it or retire it.",
 * and until now an accepted concept had no act that dropped it. Retiring one is
 * an additive `concept-retired` with a reason, written by the door: the concept
 * leaves the accepted cards, the map, the Report and the field list; its
 * statements go back to Statements to place; each of its relations is removed
 * with its own event; History keeps everything.
 */

import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { loneConcepts, projectConcepts } from "../src/concepts/projection.ts";
import { addConceptEvents, addRelationEvents, answerLineEvents, refineConceptEvents, retireConceptEvents } from "../src/concepts/door.ts";
import { conceptReportLines } from "../src/export/conceptsExport.ts";
import { ConceptMap } from "../src/ui/concepts/ConceptMap.tsx";
import { ConceptsPage, type ConceptActs } from "../src/ui/ConceptsView.tsx";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";
import { PAGE_HELP } from "../src/ui/pageHelp.ts";

const P = "p-m82-retire";
let n = 0;
let t = 95_000;
const clock = { now: () => (t += 10), makeId: () => `efefefef-8282-4282-8282-${String((n += 1)).padStart(12, "0")}` };
const view = (events: readonly LedgerEvent[]) => projectConcepts(events, P, projectOntology(events, P));
const idOf = (events: readonly LedgerEvent[], name: string) => [...view(events).concepts.values()].find((c) => c.name === name)!.id;

/** Three concepts: Tool crib alone with a statement, Booked slot and Queue talk related, a statement under the relation's concept. */
function project(): LedgerEvent[] {
  let events: LedgerEvent[] = [];
  for (const name of ["Tool crib", "Booked slot", "Queue talk"]) events = [...events, ...addConceptEvents(events, { projectId: P, name, definition: `${name}, defined.` }, clock)];
  events = [...events, ...addRelationEvents(events, { projectId: P, from: idOf(events, "Booked slot"), to: idOf(events, "Queue talk"), relation: "leads-to", claim: "Booked slots cut queue talk." }, clock)];
  events = [...events, ...answerLineEvents(events, { projectId: P, conceptId: idOf(events, "Tool crib"), text: "The crib has one bandsaw.", chunkId: "chunk-crib" }, clock)];
  events = [...events, ...answerLineEvents(events, { projectId: P, conceptId: idOf(events, "Booked slot"), text: "Since May nobody waits.", chunkId: "chunk-slot" }, clock)];
  return events;
}

describe("M82: Retire concept through the door (the lead's ruling A)", () => {
  test("a reason is required, and only an accepted concept can be retired", () => {
    const events = project();
    expect(() => retireConceptEvents(events, { projectId: P, conceptId: idOf(events, "Tool crib"), reason: "  " }, clock)).toThrow();
    const out = retireConceptEvents(events, { projectId: P, conceptId: idOf(events, "Tool crib"), reason: "Tool crib turned out to be the setting." }, clock);
    const after = [...events, ...out];
    expect(() => retireConceptEvents(after, { projectId: P, conceptId: idOf(after, "Tool crib"), reason: "again" }, clock)).toThrow();
    expect(() => refineConceptEvents(after, { projectId: P, conceptId: idOf(after, "Tool crib"), name: "Crib" }, clock)).toThrow();
  });

  test("each relation goes with its own removal, then the retirement, every event valid", () => {
    const events = project();
    const slot = idOf(events, "Booked slot");
    const rel = view(events).acceptedRelations[0]!.id;
    const out = retireConceptEvents(events, { projectId: P, conceptId: slot, reason: "Booked slot folds into Queue talk." }, clock);
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    const removed = out.filter((e) => e.type === "concept-relation-removed");
    expect(removed.map((e) => (e as { relationId: string }).relationId)).toEqual([rel]);
    const retired = out.find((e) => e.type === "concept-retired") as { conceptId: string; reason: string; actor: string } | undefined;
    expect(retired).toMatchObject({ conceptId: slot, reason: "Booked slot folds into Queue talk.", actor: "human" });
    expect(out.findIndex((e) => e.type === "concept-relation-removed")).toBeLessThan(out.findIndex((e) => e.type === "concept-retired"));
  });

  test("the validator refuses a retirement without a reason or written by Abductive", () => {
    const base = { id: clock.makeId(), ts: clock.now(), projectId: P, type: "concept-retired", conceptId: "c" };
    expect(validateEvent({ ...base, actor: "human", reason: "" } as unknown as LedgerEvent).length).toBeGreaterThan(0);
    expect(validateEvent({ ...base, actor: "persona:x", model: "m", modelVersion: "v", reason: "r" } as unknown as LedgerEvent).length).toBeGreaterThan(0);
  });
});

describe("M82: a retired concept leaves the ontology and History keeps it", () => {
  const events = project();
  const slot = idOf(events, "Booked slot");
  const after = [...events, ...retireConceptEvents(events, { projectId: P, conceptId: slot, reason: "Booked slot folds into Queue talk." }, clock)];
  const v = view(after);

  test("it leaves the accepted cards and its relations, and its statements go back to Statements to place", () => {
    expect(v.accepted.map((c) => c.name)).toEqual(["Tool crib", "Queue talk"]);
    expect(v.concepts.get(slot)?.status).toBe("retired");
    expect(v.concepts.get(slot)?.reason).toBe("Booked slot folds into Queue talk.");
    expect(v.acceptedRelations).toEqual([]);
    expect(v.toPlace.map((s) => s.text)).toContain("Since May nobody waits.");
  });

  test("it leaves the map, the Report and the field list", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(createElement(ConceptMap, { projectId: P, view: v, current: null, onOpen: () => {} }));
    expect(host.querySelector(`[data-testid="concept-map-node-${slot}"]`)).toBeNull();
    const report = conceptReportLines(after, P, projectOntology(after, P)).join("\n");
    expect(report).not.toContain("### Booked slot");
    const open = v.lookFor.filter((l) => l.settled === null).map((l) => l.conceptId);
    expect(open).not.toContain(slot);
  });

  test("History names the retirement with its reason", () => {
    const rows = projectLedger(after);
    expect(rows.some((r) => r.happened === "You retired the concept Booked slot: Booked slot folds into Queue talk.")).toBe(true);
  });

  test("a retired concept stands alone no longer: the lone line names only what is left", () => {
    const crib = idOf(after, "Tool crib");
    expect(loneConcepts(v).map((c) => c.name)).toEqual(["Tool crib", "Queue talk"]);
    const gone = [...after, ...retireConceptEvents(after, { projectId: P, conceptId: crib, reason: "Tool crib is the setting, not a concept." }, clock)];
    /* M89: the readiness report's concepts row left with the Checks tab, so the
     * map's caption is the one place that still names the lone concepts. One
     * concept left cannot stand alone beside nothing, so the list empties. */
    expect(loneConcepts(view(gone))).toEqual([]);
  });
});

describe("M82: Retire concept on the card", () => {
  test("beside Refine, with a confirmation that repeats the verb and asks for a reason", async () => {
    const events = project();
    const crib = idOf(events, "Tool crib");
    const calls: string[] = [];
    const acts = {
      ...Object.fromEntries(
        ["accept", "refine", "reject", "addConcept", "setProperty", "setRelation", "removeRelation", "place", "settle", "retire", "markHeld", "answer", "acceptRelation", "refineRelation", "rejectRelation", "setConditions", "acceptWhy", "addRelation", "acceptStatement", "rejectStatement", "placeAt", "open"].map((k) => [k, () => {}]),
      ),
      retireConcept: (id: string, reason: string) => calls.push(`${id} ${reason}`),
      busy: false,
      error: null,
    } as unknown as ConceptActs;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(ConceptsPage, { projectId: P, view: view(events), chunks: [], documents: [], current: null, onCurrent: () => {}, acts })));
    const ask = host.querySelector(`[data-testid="concept-retire-${crib}-ask"]`) as HTMLButtonElement;
    expect(ask.textContent).toBe("Retire concept");
    expect(ask.parentElement?.querySelector(`[data-testid="concept-refine-${crib}"]`)).not.toBeNull();
    await act(async () => ask.click());
    const go = host.querySelector(`[data-testid="concept-retire-${crib}-go"]`) as HTMLButtonElement;
    expect(go.textContent).toBe("Retire concept");
    const field = host.querySelector(`[data-testid="concept-retire-${crib}-reason"]`) as HTMLTextAreaElement;
    const key = Object.keys(field).find((k) => k.startsWith("__reactProps$"))!;
    const props = (field as unknown as Record<string, { onChange: (e: unknown) => void }>)[key]!;
    await act(async () => props.onChange({ target: { value: "Tool crib is the setting." } }));
    await act(async () => (host.querySelector(`[data-testid="concept-retire-${crib}-go"]`) as HTMLButtonElement).click());
    expect(calls).toEqual([`${crib} Tool crib is the setting.`]);
    act(() => root.unmount());
    host.remove();
  });

  test("the Help says what retiring a concept does", () => {
    const concepts = PAGE_HELP.ontology.parts.find((p) => p.name === "Concepts")!.says.join(" ");
    expect(concepts).toContain("Retire concept");
    expect(concepts).toContain("Statements to place");
  });
});
