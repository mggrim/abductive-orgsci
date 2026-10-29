/**
 * M67, ISC-631 to ISC-634 on the page: relation cards under "Relations", links
 * between concept cards and relation cards both ways, the map's edges opening
 * the relation card, a suggested statement arriving with its home, and
 * "Statements to place" present while a statement has no home and absent once
 * every statement is placed.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { emptyBrief, saveChunks, saveDocument, saveProject } from "../src/state/projects.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages } from "../src/ontology/schema.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { addConceptEvents, addRelationEvents, placeAtHomeEvents } from "../src/concepts/door.ts";
import { ConceptsPage, ConceptsView, PROPOSALS_SHOWN, readPath, type ReadTarget } from "../src/ui/ConceptsView.tsx";
import { ConceptMap } from "../src/ui/concepts/ConceptMap.tsx";
import { cardPath, cardRequested } from "../src/ui/routes.ts";

const BUNDLE = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname).json();
const EVENTS: readonly LedgerEvent[] = BUNDLE.events;
const DOCUMENTS: readonly StoredDocument[] = BUNDLE.documents;
const CHUNKS: readonly Chunk[] = BUNDLE.chunks;
const P: string = BUNDLE.project.id;
const CLAIMS = livePages(projectOntology([...EVENTS], P));

let n = 0;
const uid = () => `eeeeeeee-6767-4767-8767-${String((n += 1)).padStart(12, "0")}`;
let t = 1_950_000_000_000;
const clock = { now: () => (t += 10), makeId: uid };

const view = (events: readonly LedgerEvent[]) => projectConcepts(events, P, projectOntology(events, P));

/** The example with two concepts and one relation between them, a claim placed under it. */
function built() {
  let events: LedgerEvent[] = [...EVENTS];
  events = [...events, ...addConceptEvents(events, { projectId: P, name: "Office-hours slot", definition: "The time a mentor gives a founder." }, clock)];
  events = [...events, ...addConceptEvents(events, { projectId: P, name: "Command score", definition: "The programme's score for command." }, clock)];
  const [slot, score] = view(events).accepted;
  events = [
    ...events,
    ...addRelationEvents(events, { projectId: P, from: slot!.id, to: score!.id, relation: "leads-to", claim: "Longer office-hours slots lead to higher command scores." }, clock),
  ];
  const rel = view(events).acceptedRelations[0]!;
  events = [...events, ...placeAtHomeEvents(events, { projectId: P, statementId: CLAIMS[0]!.id, home: { kind: "relation", id: rel.id } }, clock)];
  return { events, slot: slot!, score: score!, rel };
}

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/**
 * M70 and the owner's addendum: a card on the page is a preview, and its whole
 * body is in the overlay that Read more opens. A test that reads a card's body
 * names the card to open.
 */
function page(events: readonly LedgerEvent[], reading: ReadTarget | null = null) {
  return renderToStaticMarkup(
    createElement(ConceptsPage, { projectId: P, view: view(events), chunks: CHUNKS, documents: DOCUMENTS, current: null, onCurrent: () => {}, acts: null, reading }),
  );
}

describe("relation cards under Relations (ISC-631)", () => {
  const { events, rel } = built();
  // M70 and the owner's addendum: the relation's body is in the overlay that Read more opens, so the test opens it.
  const markup = page(events, { kind: "relation", id: rel.id });

  test("Relations sits beside Concepts, and the relation is a card with its kind, claim, conditions, statements and evidence", () => {
    expect(markup.indexOf('data-testid="concept-grid"')).toBeLessThan(markup.indexOf('data-testid="relations"'));
    expect(markup).toContain(`data-testid="relation-card-${rel.id}"`);
    const card = markup.slice(markup.indexOf("<dialog"), markup.indexOf("</dialog>"));
    const body = text(card);
    expect(body).toContain("Office-hours slot leads to Command score");
    expect(body).toContain("Longer office-hours slots lead to higher command scores.");
    expect(body).toContain("Conditions");
    expect(body).toContain(CLAIMS[0]!.title);
    expect(card).toContain(`data-testid="relation-evidence-${rel.id}"`);
    expect(card).toContain(`data-testid="relation-remove-${rel.id}"`);
  });

  test("on the example as shipped, Relations is empty and says how a relation joins two concepts", () => {
    const fresh = text(page(EVENTS));
    expect(fresh).toContain("Relations");
    expect(fresh).toContain("A relation joins two concepts, so accept or add a second concept first.");
  });
});

describe("links between cards (ISC-632)", () => {
  const { events, slot, score, rel } = built();
  // M70: a concept's relation lines are in its overlay, so the page is read with that overlay open.
  const markup = page(events, { kind: "concept", id: slot.id });

  test("a concept card's relation line links to the relation card, and the relation card's names link back", () => {
    expect(markup).toContain(`href="${cardPath(P, "relation", rel.id)}"`);
    const at = markup.indexOf(`data-testid="concept-relation-link-${rel.id}"`);
    const line = text(markup.slice(markup.indexOf(">", at) + 1).slice(0, 300));
    expect(line).toStartWith("leads to Command score");
    expect(markup).toContain(`href="${cardPath(P, "concept", slot.id)}"`);
    expect(markup).toContain(`href="${cardPath(P, "concept", score.id)}"`);
    // Each link lands on an element the page carries.
    expect(markup).toContain(`id="relation-${rel.id}"`);
    expect(markup).toContain(`id="concept-${slot.id}"`);
  });

  test("the hash carries the card, and reads back as the card", () => {
    expect(cardPath(P, "relation", rel.id)).toBe(`#/study/${P}/ontology/relation-${rel.id}`);
    expect(cardRequested(cardPath(P, "relation", rel.id))).toEqual({ kind: "relation", id: rel.id });
    expect(cardRequested(cardPath(P, "concept", slot.id))).toEqual({ kind: "concept", id: slot.id });
    expect(cardRequested(`#/study/${P}/ontology/claim-x`)).toBeNull();
  });

  test("a press on a map edge opens the relation card", async () => {
    const v = view(events);
    const opened: string[] = [];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      // M75: the map takes the whole view and one open handler.
      root.render(createElement(ConceptMap, { projectId: P, view: v, current: null, onOpen: (kind, id) => kind === "relation" && opened.push(id) }));
    });
    const edge = host.querySelector(`[data-testid="concept-map-edge-${rel.id}"]`) as SVGGElement | null;
    expect(edge).not.toBeNull();
    await act(async () => {
      edge?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(opened).toEqual([rel.id]);
    await act(async () => root.unmount());
  });

  test("a link opens the card both ways: the hash names the card and the card takes the ring", async () => {
    await saveProject({ id: P, title: "the example project", stage: "design-brief", createdAt: 1, brief: emptyBrief() } as never);
    for (const doc of DOCUMENTS) await saveDocument(doc);
    await saveChunks(CHUNKS);
    const store = new InMemoryLedgerStore();
    for (const event of events) await store.append(event);
    // M70: the concept's relation lines are in its overlay, which the hash opens, as a reload would.
    window.location.hash = readPath(P, { kind: "concept", id: slot.id });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(LedgerProvider, { store, children: React.createElement(ConceptsView, { projectId: P }) }));
    });
    const find = async (selector: string) => {
      for (let i = 0; i < 60 && host.querySelector(selector) === null; i += 1) {
        await act(async () => {
          await wait(5);
        });
      }
      return host.querySelector(selector) as HTMLElement | null;
    };
    const toRelation = await find(`[data-testid="concept-relation-link-${rel.id}"]`);
    expect(toRelation).not.toBeNull();
    await act(async () => {
      toRelation?.click();
      await wait(20);
    });
    expect(window.location.hash).toBe(cardPath(P, "relation", rel.id));
    // The link leaves the overlay for the card beneath, which takes the ring (the lead's ruling, M70).
    expect(host.querySelector('[data-testid="card-overlay"]')).toBeNull();
    expect((await find(`[data-testid="relation-card-${rel.id}"][data-focus="true"]`)) !== null).toBe(true);
    const back = await find(`[data-testid="relation-to-link-${rel.id}"]`);
    await act(async () => {
      back?.click();
      await wait(20);
    });
    expect(window.location.hash).toBe(cardPath(P, "concept", score.id));
    expect((await find(`[data-testid="concept-card-${score.id}"][data-focus="true"]`)) !== null).toBe(true);
    // M70: a link rings the card and opens no overlay.
    expect(host.querySelector('[data-testid="card-overlay"]')).toBeNull();
    await act(async () => root.unmount());
  });
});

describe("homes on the page (ISC-633, ISC-634)", () => {
  test("a suggested statement shows its proposed home and a select of concepts, relations, New concept and New relation", () => {
    const { events, rel } = built();
    const said = {
      id: uid(), ts: (t += 10), actor: "persona:concept-suggester", model: "m", modelVersion: "v", projectId: P,
      type: "statement-suggested", statementId: "s-new", text: "Ravi gives introduced founders forty minutes.",
      home: { kind: "relation", id: rel.id }, source: { kind: "summary", station: "site" },
    } as LedgerEvent;
    const markup = page([...events, said]);
    const card = markup.slice(markup.indexOf('data-testid="statement-suggestion-s-new"'));
    const body = text(card.slice(0, card.indexOf("</article>")));
    expect(body).toContain("Abductive proposes a home under the relation Office-hours slot leads to Command score.");
    expect(card).toContain('data-testid="statement-suggestion-s-new-home-select"');
    for (const option of ["New concept", "New relation", "Office-hours slot", "Command score"]) expect(body).toContain(option);
    for (const act of ["accept", "refine", "reject"]) expect(card).toContain(`data-testid="statement-suggestion-s-new-${act}"`);
  });

  test("Statements to place shows three proposals at a time with the rest in the queue, and is absent once every statement is placed", () => {
    const { events, slot } = built();
    const unplaced = view(events).toPlace; // M75: Statements to place holds the summary and data statements
    const homes = {
      id: uid(), ts: (t += 10), actor: "persona:concept-suggester", model: "m", modelVersion: "v", projectId: P,
      type: "homes-proposed", read: unplaced.map((s) => s.id), proposals: unplaced.slice(0, 5).map((s) => ({ statementId: s.id, home: { kind: "concept", id: slot.id } })),
    } as LedgerEvent;
    const markup = page([...events, homes]);
    expect(markup.match(/data-testid="to-place-proposed-/g)?.length).toBe(PROPOSALS_SHOWN);
    expect(text(markup)).toContain("Abductive has two more suggested homes in the queue");
    expect(text(markup)).toContain("Abductive proposes a home under the concept Office-hours slot.");

    let all: LedgerEvent[] = [...events];
    for (const s of view(all).unplaced) all = [...all, ...placeAtHomeEvents(all, { projectId: P, statementId: s.id, home: { kind: "concept", id: slot.id } }, clock)];
    expect(view(all).unplaced).toEqual([]);
    expect(page(all)).not.toContain('data-testid="statements-to-place"');
  });
});

describe("a claim waiting in the tray carries its proposed home (the lead's ruling, M67)", () => {
  test("the tray card shows the proposed home and the select, and Accept places the new statement there", async () => {
    let events: LedgerEvent[] = [...EVENTS];
    events = [...events, ...addConceptEvents(events, { projectId: P, name: "Introduction route", definition: "How a founder came in." }, clock)];
    const route = view(events).accepted[0]!;
    const proposal = { id: uid(), ts: (t += 10), actor: "persona:rival", model: "m", modelVersion: "v", projectId: P, type: "proposal", proposalId: "prop-tray", pageType: "rival", title: "Slot length tracks who introduced the founder", body: "b", sourceChunks: [] } as LedgerEvent;
    const homes = { id: uid(), ts: (t += 10), actor: "persona:concept-suggester", model: "m", modelVersion: "v", projectId: P, type: "homes-proposed", read: [...view(events).unplaced.map((s) => s.id), "prop-tray"], proposals: [{ statementId: "prop-tray", home: { kind: "concept", id: route.id } }] } as LedgerEvent;
    events = [...events, proposal, homes];
    await saveProject({ id: P, title: "the example project", stage: "design-brief", createdAt: 1, brief: emptyBrief() } as never);
    const store = new InMemoryLedgerStore();
    for (const event of events) await store.append(event);
    window.location.hash = `#/study/${P}/ontology`;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(LedgerProvider, { store, children: React.createElement(ConceptsView, { projectId: P }) }));
    });
    for (let i = 0; i < 60 && host.querySelector('[data-testid="tray-home-proposed-prop-tray"]') === null; i += 1) {
      await act(async () => {
        await wait(5);
      });
    }
    expect(host.querySelector('[data-testid="tray-home-proposed-prop-tray"]')?.textContent).toBe("Abductive proposes a home under the concept Introduction route.");
    const select = host.querySelector('[data-testid="tray-prop-tray-home-select"]') as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toContain("Place later");
    const accept = [...host.querySelectorAll('li[data-proposal-id="prop-tray"] button')].find((b) => b.textContent === "Accept") as HTMLButtonElement;
    await act(async () => {
      accept.click();
      await wait(60);
    });
    for (let i = 0; i < 60 && !(await store.readAll()).some((e) => e.type === "statement-attached"); i += 1) {
      await act(async () => {
        await wait(5);
      });
    }
    const written = await store.readAll();
    const created = written.find((e) => e.type === "ontology-mutation" && e.op === "create" && e.title === "Slot length tracks who introduced the founder");
    expect(created).toBeDefined();
    const placed = written.find((e) => e.type === "statement-attached");
    expect(placed).toMatchObject({ conceptId: route.id, pageId: created?.type === "ontology-mutation" ? created.targetId : "" });
    await act(async () => root.unmount());
  });
});
