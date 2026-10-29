/**
 * M82 on the concepts tab (ISC-694, ISC-695).
 *
 *   - The tab's top carries "The argument so far", Abductive's two to four
 *     sentences from the accepted cards, marked AI-suggested, with what is still
 *     to come before the first accepted concept.
 *   - Each concept and relation card carries "Why it matters": a suggestion's
 *     proposed line in its preview and its overlay before Accept; on an accepted
 *     card, a line Abductive wrote waits as Suggested with Accept, and a line in
 *     the researcher's words is marked theirs; the Refine forms edit it.
 *   - Relations carries Suggest relations; a relation that Relate concepts
 *     proposed shows the statements it rests on.
 *   - Each field line says which property, relation or concept it settles.
 *   - The tab runs Relate concepts after an accept that leaves the newest of
 *     three or more concepts standing alone, writes the lines that cards lack,
 *     and rewrites the argument when the accepted cards move.
 */

import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts, type ProjectOntologyView } from "../src/concepts/projection.ts";
import { acceptConceptEvents, addConceptEvents, addRelationEvents, answerLineEvents, setPropertyEvents } from "../src/concepts/door.ts";
import { argumentBasis } from "../src/concepts/why.ts";
import { ConceptsPage, argumentStale, needsWhy, relateFocus, type ConceptActs } from "../src/ui/ConceptsView.tsx";
import { sentenceBreaks } from "../src/copy/rules.ts";

const P = "p-m82-tab";
let n = 0;
let t = 80_000;
const clock = { now: () => (t += 10), makeId: () => `abababab-8282-4282-8282-${String((n += 1)).padStart(12, "0")}` };
const view = (events: readonly LedgerEvent[]) => projectConcepts(events, P, projectOntology(events, P));
const persona = (actor = "persona:concept-suggester") => ({ id: clock.makeId(), ts: clock.now(), actor: actor as LedgerEvent["actor"], projectId: P, model: "m", modelVersion: "v" });

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function page(v: ProjectOntologyView, extra: Partial<Parameters<typeof ConceptsPage>[0]> = {}) {
  return renderToStaticMarkup(createElement(ConceptsPage, { projectId: P, view: v, chunks: [], documents: [], current: null, onCurrent: () => {}, acts: null, ...extra }));
}
const parse = (markup: string) => {
  const host = document.createElement("div");
  host.innerHTML = markup;
  return host;
};

function concepts(names: readonly string[]): LedgerEvent[] {
  let events: LedgerEvent[] = [];
  for (const name of names) events = [...events, ...addConceptEvents(events, { projectId: P, name, definition: `${name}, defined.` }, clock)];
  return events;
}
const idOf = (events: readonly LedgerEvent[], name: string) => view(events).concepts.get([...view(events).concepts.values()].find((c) => c.name === name)!.id)!.id;

describe("M82: The argument so far at the tab's top (ISC-695)", () => {
  test("Abductive's paragraph sits above Concepts, marked AI-suggested", () => {
    const events: LedgerEvent[] = [...concepts(["Booked slot"]), { ...persona("persona:argument-writer"), type: "argument-written", text: "You expect booked slots to cut queue talk.", basis: "x" } as LedgerEvent];
    const host = parse(page(view(events)));
    const section = host.querySelector('[data-testid="argument-so-far"]')!;
    expect(section.querySelector("h2")?.textContent).toBe("The argument so far");
    expect(section.querySelector('[data-testid="argument-text"]')?.textContent).toBe("You expect booked slots to cut queue talk.");
    expect(section.textContent).toContain("AI-suggested");
    const all = [...host.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"));
    expect(all.indexOf("argument-so-far")).toBeLessThan(all.indexOf("concepts"));
  });

  test("before the first accepted concept, the section says what is still to come; while Abductive writes, it says so", () => {
    expect(parse(page(view([]))).querySelector('[data-testid="argument-so-far"]')?.textContent).toContain(
      "Accept a concept, and Abductive writes your argument so far from your accepted cards.",
    );
    const writing = parse(page(view(concepts(["Alpha"])), { argument: { state: "writing" } }));
    expect(writing.querySelector('[data-testid="argument-status"]')?.textContent).toBe("Abductive is writing the argument so far from your accepted cards.");
  });
});

describe("M82: Why it matters on each card (ISC-695)", () => {
  test("a suggestion shows its proposed line in the preview and the overlay, before Accept", () => {
    const s: LedgerEvent = {
      ...persona(),
      type: "concept-suggested",
      conceptId: clock.makeId(),
      name: "Waiting",
      definition: "Time at the crib before a machine is free.",
      properties: [],
      relations: [],
      statementIds: [],
      statements: [],
      source: { kind: "summary", station: "puzzle" },
      whyItMatters: "Waiting is the time your puzzle says the booking system removed.",
    } as LedgerEvent;
    const id = (s as { conceptId: string }).conceptId;
    const preview = parse(page(view([s])));
    expect(preview.querySelector(`[data-testid="why-concept-${id}"]`)?.textContent).toContain("Waiting is the time your puzzle says the booking system removed.");
    const overlay = parse(page(view([s]), { reading: { kind: "concept", id } }));
    expect(overlay.querySelector('[data-testid="card-overlay"]')?.querySelector(`[data-testid="why-concept-${id}"]`)?.textContent).toContain("Waiting is the time");
  });

  test("on an accepted card, Abductive's line waits as Suggested with Accept; the researcher's own line is marked theirs", () => {
    let events = concepts(["Tool crib", "Queue talk"]);
    const crib = idOf(events, "Tool crib");
    const talk = idOf(events, "Queue talk");
    events = [
      ...events,
      { ...persona("persona:why-writer"), type: "why-suggested", target: { kind: "concept", id: crib }, text: "Tool crib is the setting your puzzle sits in." } as LedgerEvent,
      { id: clock.makeId(), ts: clock.now(), actor: "human", projectId: P, type: "why-refined", target: { kind: "concept", id: talk }, text: "Queue talk is the encounter I expect to lose." } as LedgerEvent,
    ];
    const host = parse(page(view(events)));
    const cribLine = host.querySelector(`[data-testid="why-concept-${crib}"]`)!;
    expect(cribLine.textContent).toContain("Suggested");
    expect(cribLine.querySelector(`[data-testid="why-accept-concept-${crib}"]`)?.textContent).toBe("Accept");
    const talkLine = host.querySelector(`[data-testid="why-concept-${talk}"]`)!;
    expect(talkLine.textContent).toContain("Yours");
    expect(talkLine.querySelector(`[data-testid="why-accept-concept-${talk}"]`)).toBeNull();
  });

  test("a card without a line says the line is still to come", () => {
    const events = concepts(["Tool crib"]);
    const host = parse(page(view(events)));
    expect(host.querySelector(`[data-testid="why-concept-${idOf(events, "Tool crib")}"]`)?.textContent).toBe("Why it matters The Why it matters line is still to come.");
  });

  test("Accept on the line and Save concept with a new line reach the acts", async () => {
    let events = concepts(["Tool crib"]);
    const crib = idOf(events, "Tool crib");
    events = [...events, { ...persona("persona:why-writer"), type: "why-suggested", target: { kind: "concept", id: crib }, text: "Tool crib is the setting." } as LedgerEvent];
    const calls: string[] = [];
    const acts = {
      ...Object.fromEntries(["accept", "reject", "addConcept", "setProperty", "setRelation", "removeRelation", "place", "settle", "retire", "markHeld", "answer", "acceptRelation", "rejectRelation", "setConditions", "addRelation", "acceptStatement", "rejectStatement", "placeAt", "open"].map((k) => [k, () => {}])),
      refine: (id: string, edit: { why?: string }) => calls.push(`refine ${id} ${edit.why}`),
      refineRelation: () => {},
      acceptWhy: (target: { kind: string; id: string }) => calls.push(`why ${target.kind} ${target.id}`),
      busy: false,
      error: null,
    } as unknown as ConceptActs;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(ConceptsPage, { projectId: P, view: view(events), chunks: [], documents: [], current: null, onCurrent: () => {}, acts })));
    await act(async () => (host.querySelector(`[data-testid="why-accept-concept-${crib}"]`) as HTMLButtonElement).click());
    await act(async () => (host.querySelector(`[data-testid="concept-refine-${crib}"]`) as HTMLButtonElement).click());
    const field = host.querySelector(`[data-testid="concept-refine-why-${crib}"]`) as HTMLTextAreaElement;
    expect(field.value).toBe("Tool crib is the setting.");
    /* Typing, as tests/m60-local-card.test.tsx does it: the field's own onChange. */
    const key = Object.keys(field).find((k) => k.startsWith("__reactProps$"))!;
    const fieldProps = (field as unknown as Record<string, { onChange: (e: unknown) => void }>)[key]!;
    await act(async () => fieldProps.onChange({ target: { value: "Tool crib is where I watch." } }));
    await act(async () => (host.querySelector(`[data-testid="concept-refine-save-${crib}"]`) as HTMLButtonElement).click());
    expect(calls).toEqual([`why concept ${crib}`, `refine ${crib} Tool crib is where I watch.`]);
    act(() => root.unmount());
    host.remove();
  });
});

describe("M82: Suggest relations, and what a related pair rests on (ISC-694)", () => {
  test("Relations carries Suggest relations, inert with one accepted concept", () => {
    const one = parse(page(view(concepts(["Solo"])), { onRelate: () => {} }));
    const button = one.querySelector('[data-testid="relations-suggest"]')!;
    expect(button.textContent).toBe("Suggest relations");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const two = parse(page(view(concepts(["Left", "Right"])), { onRelate: () => {}, relateNote: "Abductive read your accepted concepts and suggested one relation." }));
    expect(two.querySelector('[data-testid="relations-suggest"]')?.getAttribute("aria-disabled")).not.toBe("true");
    expect(two.querySelector('[data-testid="relations-suggest-note"]')?.textContent).toBe("Abductive read your accepted concepts and suggested one relation.");
  });

  test("a relation that Relate concepts proposed shows the statement it rests on", () => {
    let events = concepts(["Booked slot", "Queue talk"]);
    const slot = idOf(events, "Booked slot");
    events = [...events, ...answerLineEvents(events, { projectId: P, conceptId: slot, text: "Since May nobody waits.", chunkId: "chunk-1" }, clock)];
    const statement = [...view(events).statements.values()].find((s) => s.text === "Since May nobody waits.")!.id;
    const rid = clock.makeId();
    events = [
      ...events,
      {
        ...persona(),
        type: "relation-suggested",
        relationId: rid,
        from: slot,
        to: idOf(events, "Queue talk"),
        relation: "leads-to",
        claim: "Booked slots lead to less queue talk.",
        statementIds: [],
        statements: [],
        source: { kind: "relate" },
        restsOn: [{ kind: "statement", statementId: statement }],
        whyItMatters: "This relation is the mechanism your puzzle names.",
      } as LedgerEvent,
    ];
    const host = parse(page(view(events)));
    const card = host.querySelector(`[data-testid="relation-suggestion-${rid}"]`)!;
    expect(card.querySelector(`[data-testid="relation-rests-${rid}"]`)?.textContent).toContain("Since May nobody waits.");
    expect(card.textContent).toContain("AI-suggested from your accepted concepts");
    expect(card.querySelector(`[data-testid="why-relation-${rid}"]`)?.textContent).toContain("This relation is the mechanism your puzzle names.");
  });
});

describe("M82: each field line says what it settles (ISC-695)", () => {
  test("a property line names the property, a relation line names the relation, an evidence line names the concept", () => {
    let events = concepts(["Booked slot", "Queue talk"]);
    const slot = idOf(events, "Booked slot");
    events = [...events, ...setPropertyEvents(events, { projectId: P, conceptId: slot, name: "how far ahead founders book" }, clock)];
    events = [...events, ...addRelationEvents(events, { projectId: P, from: slot, to: idOf(events, "Queue talk"), relation: "leads-to", claim: "Booked slots cut queue talk." }, clock)];
    const host = parse(page(view(events)));
    const settles = [...host.querySelectorAll('[data-testid^="look-for-settles-"]')].map((e) => e.textContent ?? "");
    expect(settles).toContain('When you settle this line, you define the property "how far ahead founders book" of Booked slot.');
    expect(settles).toContain("When you settle this line, you have evidence for the relation Booked slot leads to Queue talk.");
    expect(settles).toContain("When you settle this line, you have evidence for Queue talk.");
    for (const s of settles) expect(sentenceBreaks(s)).toEqual([]);
  });
});

describe("M82: when the tab runs the passes on its own (ISC-694, ISC-695)", () => {
  test("Relate concepts runs after an accept that leaves the newest of three or more concepts alone", () => {
    let events = concepts(["Booked slot", "Queue talk"]);
    events = [...events, ...addRelationEvents(events, { projectId: P, from: idOf(events, "Booked slot"), to: idOf(events, "Queue talk"), relation: "leads-to", claim: "x." }, clock)];
    const before = view(events);
    const newestBefore = before.accepted[before.accepted.length - 1]!.id;
    const s: LedgerEvent = { ...persona(), type: "concept-suggested", conceptId: clock.makeId(), name: "Tool crib", definition: "d.", properties: [], relations: [], statementIds: [], statements: [], source: { kind: "summary", station: "site" } } as LedgerEvent;
    const crib = (s as { conceptId: string }).conceptId;
    events = [...events, s, ...acceptConceptEvents([...events, s], { projectId: P, conceptId: crib }, clock)];
    expect(relateFocus(newestBefore, view(events))).toBe(crib);
    expect(relateFocus(crib, view(events))).toBeNull();
    expect(relateFocus(null, view(events))).toBeNull();
    expect(relateFocus(newestBefore, view(concepts(["One", "Two"])))).toBeNull();
  });

  test("Why lines are wanted while an accepted card lacks one, and the argument is stale until its basis matches", () => {
    const events = concepts(["Alpha"]);
    expect(needsWhy(view(events))).toBe(true);
    expect(needsWhy(view([]))).toBe(false);
    expect(argumentStale(view([]))).toBe(false);
    expect(argumentStale(view(events))).toBe(true);
    const written = [...events, { ...persona("persona:argument-writer"), type: "argument-written", text: "x.", basis: argumentBasis(view(events)) } as LedgerEvent];
    expect(argumentStale(view(written))).toBe(false);
  });
});
