/**
 * M82, ISC-694 (d): the map's caption counts the concepts that stand alone.
 *
 * The readiness row that named each lone concept (ISC-694 c) went with the
 * checks at M89. Below two accepted concepts there is nothing to relate a
 * concept to, so the caption says nothing.
 */

import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { addConceptEvents, addRelationEvents } from "../src/concepts/door.ts";
import { ConceptMap, loneCaption } from "../src/ui/concepts/ConceptMap.tsx";
import { sentenceBreaks } from "../src/copy/rules.ts";

const P = "p-m82-lone";
let n = 0;
let t = 70_000;
const clock = { now: () => (t += 10), makeId: () => `ffffffff-8282-4282-8282-${String((n += 1)).padStart(12, "0")}` };
const view = (events: readonly LedgerEvent[], id = P) => projectConcepts(events, id, projectOntology(events, id));

function concepts(names: readonly string[]): LedgerEvent[] {
  let events: LedgerEvent[] = [];
  for (const name of names) events = [...events, ...addConceptEvents(events, { projectId: P, name, definition: `${name}, defined.` }, clock)];
  return events;
}
function relate(events: LedgerEvent[], from: string, to: string): LedgerEvent[] {
  const id = (name: string) => view(events).accepted.find((c) => c.name === name)!.id;
  return [...events, ...addRelationEvents(events, { projectId: P, from: id(from), to: id(to), relation: "leads-to", claim: `${from} leads to ${to}.` }, clock)];
}

describe("M82: the lone-concept caption keeps the copy rules", () => {
  test("the lines keep the copy rules", () => {
    for (const s of [loneCaption(1) ?? "", loneCaption(8) ?? ""]) expect(sentenceBreaks(s)).toEqual([]);
  });
});

describe("M82: the map's caption counts the concepts standing alone (ISC-694d)", () => {
  test("a second sentence after the counts, left out at zero", () => {
    expect(loneCaption(0)).toBeNull();
    expect(loneCaption(1)).toBe("1 accepted concept stands alone.");
    expect(loneCaption(8)).toBe("8 accepted concepts stand alone.");
    let events = concepts(["Booked slot", "Queue talk", "Tool crib"]);
    events = relate(events, "Booked slot", "Queue talk");
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(createElement(ConceptMap, { projectId: P, view: view(events), current: null, onOpen: () => {} }));
    expect(host.querySelector('[data-testid="concept-map-caption"]')?.textContent).toBe("3 concepts and 1 relation accepted. 1 accepted concept stands alone.");
  });
});
