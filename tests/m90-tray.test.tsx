/**
 * M90, ISC-733: the tray names a concept Abductive left out.
 *
 * A concept whose name joined more than one concept, which the model didn't
 * split when Abductive asked, never reaches the tray as a card. The tray says it
 * was there, under the queue line, until the researcher's next decision on the
 * tab; History keeps the drop.
 */

import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { addConceptEvents } from "../src/concepts/door.ts";
import { ConceptsPage } from "../src/ui/ConceptsView.tsx";

const P = "p-m90-tray";
let n = 0;
let t = 90_000;
const clock = { now: () => (t += 10), makeId: () => `90909090-7777-4777-8777-${String((n += 1)).padStart(12, "0")}` };

const drop = (name: string): LedgerEvent =>
  ({
    id: clock.makeId(), ts: clock.now(), actor: "persona:concept-suggester", model: "m", modelVersion: "v", projectId: P,
    type: "suggestion-dropped", name, reason: "more than three words", source: { kind: "summary", station: "context" },
  }) as LedgerEvent;

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const page = (events: readonly LedgerEvent[]) =>
  renderToStaticMarkup(
    createElement(ConceptsPage, { projectId: P, view: projectConcepts(events, P, projectOntology(events, P)), chunks: [], documents: [], events, current: null, onCurrent: () => {}, acts: null }),
  );

describe("M90: the tray's line for a dropped suggestion (ISC-733)", () => {
  test("the line shows after a drop, and goes with your next decision on the tab", () => {
    const dropped = [drop("Introduced founders' longer slots")];
    const shown = page(dropped);
    expect(shown).toContain('data-testid="suggestion-dropped"');
    expect(text(shown)).toContain("Abductive left out a suggestion, \"Introduced founders' longer slots\", because its name joined more than one concept");
    const decided = [...dropped, ...addConceptEvents(dropped, { projectId: P, name: "introductions", definition: "When the staff name a founder to a mentor." }, clock)];
    expect(page(decided)).not.toContain('data-testid="suggestion-dropped"');
  });

  test("a tab with every suggestion shown carries no line", () => {
    expect(page([])).not.toContain('data-testid="suggestion-dropped"');
  });
});
