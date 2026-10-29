/**
 * M75, ISC-668 (the owner, 2026-10-03): "Why is the concept map not drawing all
 * of the concepts and relationships?" The map drew accepted concepts and
 * accepted relations only, which happened to match the field list. From M75 it
 * draws every concept and relation: accepted ones solid, suggested ones dotted
 * with a "suggested" ring, a suggested concept that is the proposed home of a
 * statement to place faint, a dotted node opening its suggestion card, and a
 * caption counting both.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts, type ProjectOntologyView } from "../src/concepts/projection.ts";
import { addConceptEvents, addRelationEvents } from "../src/concepts/door.ts";
import { ConceptMap, mapCaption } from "../src/ui/concepts/ConceptMap.tsx";
import { sentenceBreaks } from "../src/copy/rules.ts";
import { useDom } from "./dom.ts";

const P = "p-m75map";
let n = 0;
const uid = () => `eeeeeeee-7575-4775-8775-${String((n += 1)).padStart(12, "0")}`;
let t = 80_000;
const clock = { now: () => (t += 10), makeId: uid };
const env = () => ({ id: uid(), ts: (t += 10), actor: "persona:concepts" as const, model: "claude", modelVersion: "test", projectId: P });

function suggestedConcept(conceptId: string, name: string): LedgerEvent {
  return {
    ...env(),
    type: "concept-suggested",
    conceptId,
    name,
    definition: `${name} [...]`,
    properties: [],
    relations: [],
    statementIds: [],
    statements: [],
    source: { kind: "summary", station: "context" },
  } as LedgerEvent;
}

function built(): { events: LedgerEvent[]; view: ProjectOntologyView } {
  let events: LedgerEvent[] = [];
  for (const name of ["Office-hours slot", "Command score", "Introduction route"]) {
    events = [...events, ...addConceptEvents(events, { projectId: P, name, definition: `${name}.` }, clock)];
  }
  const accepted = projectConcepts(events, P, projectOntology(events, P)).accepted;
  const [slot, score] = accepted;
  events = [...events, ...addRelationEvents(events, { projectId: P, from: slot!.id, to: score!.id, relation: "leads-to", claim: "Longer slots lead to higher scores." }, clock)];
  events = [...events, suggestedConcept("c-wait", "Waiting time"), suggestedConcept("c-home", "Warm intro")];
  events = [
    ...events,
    {
      ...env(),
      type: "relation-suggested",
      relationId: "r-wait",
      from: "c-wait",
      to: score!.id,
      relation: "leads-to",
      claim: "Waiting lowers the score.",
      statementIds: [],
      statements: [],
      grounds: [],
      source: { kind: "summary", station: "context" },
    } as LedgerEvent,
    {
      ...env(),
      type: "statement-suggested",
      statementId: "st-1",
      text: "The warm intro got the long slot.",
      home: { kind: "concept", id: "c-home" },
      source: { kind: "summary", station: "context" },
    } as LedgerEvent,
  ];
  return { events, view: projectConcepts(events, P, projectOntology(events, P)) };
}

const markup = (view: ProjectOntologyView) =>
  renderToStaticMarkup(createElement(ConceptMap, { projectId: P, view, current: null, onOpen: () => {} }));

describe("M75: the concept map draws every concept and relation (ISC-668)", () => {
  test("accepted concepts are solid, suggested ones dotted with a suggested ring, and a proposed home is faint", () => {
    const { view } = built();
    const html = markup(view);
    for (const c of view.accepted) {
      expect(html).toMatch(new RegExp(`data-testid="concept-map-node-${c.id}"[^>]*data-status="accepted"`));
    }
    expect(html).toMatch(/data-testid="concept-map-node-c-wait"[^>]*data-status="suggested"/);
    expect(html).toMatch(/data-testid="concept-map-node-c-home"[^>]*data-status="suggested"[^>]*data-home="true"/);
    expect(html).not.toMatch(/data-testid="concept-map-node-c-wait"[^>]*data-home="true"/);
    expect((html.match(/class="concept-map-ring"/g) ?? []).length).toBe(2);
    expect(html).toContain(">suggested<");
  });

  test("the accepted relation is a solid edge and the suggested one is dotted", () => {
    const { view } = built();
    const html = markup(view);
    const accepted = view.acceptedRelations[0]!;
    expect(html).toMatch(new RegExp(`data-testid="concept-map-edge-${accepted.id}"[^>]*data-status="accepted"`));
    expect(html).toMatch(/data-testid="concept-map-edge-r-wait"[^>]*data-status="suggested"/);
  });

  test("the caption counts both, and keeps the copy rules", () => {
    const { view } = built();
    expect(markup(view)).toContain("3 concepts and 1 relation accepted, 2 concepts and 1 relation suggested");
    expect(mapCaption(3, 1, 2, 0)).toBe("3 concepts and 1 relation accepted, 2 concepts suggested");
    expect(mapCaption(1, 0, 0, 0)).toBe("1 concept accepted");
    expect(mapCaption(0, 0, 2, 1)).toBe("2 concepts and 1 relation suggested");
    expect(sentenceBreaks(`${mapCaption(3, 1, 2, 0)}.`)).toEqual([]);
  });

  test("a dotted node opens its suggestion card, and a solid one its concept card", async () => {
    useDom();
    const { view } = built();
    const opened: string[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(ConceptMap, { projectId: P, view, current: null, onOpen: (kind, id, suggested) => opened.push(`${kind}:${id}:${suggested}`) }));
    });
    const click = (id: string) => host.querySelector(`[data-testid="${id}"]`)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await act(async () => click("concept-map-node-c-wait"));
    await act(async () => click(`concept-map-node-${view.accepted[0]!.id}`));
    await act(async () => click("concept-map-edge-r-wait"));
    expect(opened).toEqual(["concept:c-wait:true", `concept:${view.accepted[0]!.id}:false`, "relation:r-wait:true"]);
    await act(async () => root.unmount());
    host.remove();
  });
});
