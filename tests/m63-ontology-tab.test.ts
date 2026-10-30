/**
 * M63, ISC-609: the Emerging project ontology tab.
 *
 * The owner's page, read on the shipped example with one suggestion waiting and
 * two concepts accepted: the gloss once, "Suggested concepts" at the top with
 * Accept, Refine and Reject on each card, the ontology as concept cards (name,
 * definition, properties, relations named, statements, evidence), "Unplaced
 * statements" with "Place under…", "What to look for in the field", and a small
 * read-only map with the current card marked. Then the live half: a press on
 * Accept writes through the door and the card joins the ontology.
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
import { acceptAllOnCardEvents, acceptConceptEvents, addConceptEvents, setRelationEvents } from "../src/concepts/door.ts";
import { ONTOLOGY_GLOSS, ONTOLOGY_TAB_LABEL } from "../src/concepts/vocabulary.ts";
import { ConceptsPage, ConceptsView, type ReadTarget } from "../src/ui/ConceptsView.tsx";
import { STUDY_TAB_LABEL } from "../src/ui/routes.ts";

const BUNDLE = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname).json();
const EVENTS: readonly LedgerEvent[] = BUNDLE.events;
const DOCUMENTS: readonly StoredDocument[] = BUNDLE.documents;
const CHUNKS: readonly Chunk[] = BUNDLE.chunks;
const P: string = BUNDLE.project.id;
const CLAIMS = livePages(projectOntology([...EVENTS], P));
const cited = CLAIMS.find((p) => p.supportingChunks.length > 0)!;
// M75: Statements to place holds data reads, so the other claim is one that cites a passage too.
const other = CLAIMS.find((p) => p !== cited && p.supportingChunks.length > 0 && p.type !== "rival")!;

let n = 0;
const uid = () => `cccccccc-3333-4333-8333-${String((n += 1)).padStart(12, "0")}`;
let t = 1_900_000_000_000;
const clock = { now: () => (t += 10), makeId: uid };

function suggestion(conceptId: string, name: string, statementIds: string[]): LedgerEvent {
  return {
    id: uid(),
    ts: (t += 10),
    actor: "persona:concepts",
    model: "claude",
    modelVersion: "test",
    projectId: P,
    type: "concept-suggested",
    conceptId,
    name,
    definition: `${name}, in the words you used at Context [...]`,
    properties: ["How often it happens"],
    relations: [],
    statementIds,
    statements: [],
    source: { kind: "summary", station: "context" },
  } as LedgerEvent;
}

function build(): LedgerEvent[] {
  let events: LedgerEvent[] = [...EVENTS, suggestion("c-read", "Time on task", [cited.id]), suggestion("c-wait", "Waiting concept", [])];
  /* M93, ISC-764: Accept all writes the concept, its property and its statement, one event each. */
  events = [...events, ...acceptAllOnCardEvents(events, { projectId: P, conceptId: "c-read" }, clock)];
  events = [...events, ...addConceptEvents(events, { projectId: P, name: "Judgement shift", definition: "Where a mentor's judgement of a founder moves." }, clock)];
  const shift = projectConcepts(events, P, projectOntology(events, P)).accepted.find((c) => c.name === "Judgement shift")!;
  events = [...events, ...setRelationEvents(events, { projectId: P, from: "c-read", to: shift.id, relation: "leads-to" }, clock)];
  return events;
}

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/**
 * M70 and the owner's addendum: a card on the page is a preview, and its whole
 * body (properties, relations, statements, evidence) is in the overlay that
 * Open full view opens. A test that reads a card's body names the card to open.
 */
function page(events: LedgerEvent[], current: string | null = "c-read", reading: ReadTarget | null = null) {
  const graph = projectOntology(events, P);
  return renderToStaticMarkup(
    createElement(ConceptsPage, {
      projectId: P,
      view: projectConcepts(events, P, graph),
      chunks: CHUNKS,
      documents: DOCUMENTS,
      current,
      onCurrent: () => {},
      acts: null,
      reading,
    }),
  );
}

describe("the tab and its gloss (ISC-609)", () => {
  test("the tab is named in the owner's three words", () => {
    expect(STUDY_TAB_LABEL.ontology).toBe(ONTOLOGY_TAB_LABEL);
    expect(ONTOLOGY_TAB_LABEL).toBe("Emerging project ontology");
  });

  test("the gloss appears once and gives the ontology no agency", () => {
    const markup = page(build());
    expect(text(markup).split(ONTOLOGY_GLOSS).length - 1).toBe(1);
    expect(ONTOLOGY_GLOSS).not.toMatch(/rests? on|your project (?:holds|says|needs)/i);
    expect(ONTOLOGY_GLOSS).toContain("the concepts that you define for this project".replace(/^t/, "T"));
  });
});

describe("the page on the shipped example (ISC-609)", () => {
  const markup = page(build());
  const read = text(markup);

  // M70, ISC-648: one section per kind, so the suggestions sit first inside Concepts rather than in a section above it.
  test("suggested concepts sit at the top of Concepts, each with Accept, Refine and Reject", () => {
    const grid = markup.indexOf('data-testid="concept-grid"');
    const at = markup.indexOf('data-testid="suggestion-c-wait"');
    expect(grid).toBeGreaterThan(-1);
    expect(at).toBeGreaterThan(grid);
    expect(at).toBeLessThan(markup.indexOf('data-testid="concept-card-c-read"'));
    expect(markup).not.toContain('data-testid="suggested-concepts"');
    expect(markup).toContain('data-testid="suggestion-c-wait"');
    for (const act of ["accept", "refine", "reject"]) expect(markup).toContain(`data-testid="concept-${act}-c-wait"`);
    // The accepted one is no longer a suggestion.
    expect(markup).not.toContain('data-testid="suggestion-c-read"');
  });

  // M70 and the owner's addendum: the card's body is in the overlay that Open full view opens, so the test opens it.
  test("each concept card shows name, definition, properties, relations, statements and evidence", () => {
    const opened = page(build(), "c-read", { kind: "concept", id: "c-read" });
    const card = opened.slice(opened.indexOf("<dialog"));
    const body = text(card.slice(0, card.indexOf('data-testid="concept-card-', 20)));
    expect(body).toContain("Time on task");
    expect(body).toContain("in the words you used at Context");
    expect(body).toContain("How often it happens");
    expect(body).toContain("leads to");
    expect(body).toContain("Judgement shift");
    expect(body).toContain(cited.title);
    expect(card).toContain('data-testid="concept-evidence-c-read"');
  });

  // M67, ISC-634: "Statements to place" replaces "Unplaced statements", and a home select replaces "Place under…".
  test("Statements to place lists the claims no concept or relation holds, each with a home to choose", () => {
    expect(markup).toContain('data-testid="statements-to-place"');
    expect(markup).not.toContain('data-testid="unplaced-statements"');
    expect(read).toContain("Statements to place");
    expect(markup).toContain(`data-testid="place-${other.id}-home-select"`);
    expect(markup).not.toContain(`data-testid="place-${cited.id}-home-select"`);
    expect(read).toContain("Place statement");
  });

  test("What to look for in the field lists a line per open condition", () => {
    expect(markup).toContain('data-testid="look-for"');
    expect(read).toContain("What to look for in the field");
    /* M74a, ISC-663: a property's line asks its own question rather than one
       template for every property (the walk, finding 14). */
    expect(read).toContain("In each case of Time on task, how often does it happen?");
    // M67, ISC-635: a relation with no evidence reads in the words of the field list's new line.
    expect(read).toContain("Watch whether Time on task leads to Judgement shift, and under which conditions.");
  });

  test("the map draws concepts as nodes and the relation as a labelled edge, with the current card marked", () => {
    expect(markup).toContain('data-testid="concept-map"');
    expect(markup).toContain('data-testid="concept-map-node-c-read"');
    expect(markup).toMatch(/data-testid="concept-map-node-c-read"[^>]*data-current="true"/);
    expect(markup).toMatch(/data-testid="concept-map-edge-[^"]+"/);
    const map = markup.slice(markup.indexOf('data-testid="concept-map"'));
    expect(text(map)).toContain("leads to");
  });

  test("the page holds only the ontology and its evidence", () => {
    expect(read).not.toContain("Your model");
    expect(markup).not.toContain('data-testid="argument-band"');
    expect(markup).not.toContain('data-testid="rivals-panel"');
  });
});

describe("a press on Accept goes through the door (ISC-609)", () => {
  test("the suggestion becomes a card in the ontology", async () => {
    await saveProject({ id: P, title: "the example project", stage: "design-brief", createdAt: 1, brief: emptyBrief() } as never);
    for (const doc of DOCUMENTS) await saveDocument(doc);
    await saveChunks(CHUNKS);
    const store = new InMemoryLedgerStore();
    for (const event of [...EVENTS, suggestion("c-live", "Office hours slot", [other.id])]) await store.append(event);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(LedgerProvider, { store, children: React.createElement(ConceptsView, { projectId: P }) }));
    });
    for (let i = 0; i < 40 && host.querySelector('[data-testid="concept-accept-c-live"]') === null; i += 1) {
      await act(async () => {
        await wait(5);
      });
    }
    const button = host.querySelector('[data-testid="concept-accept-c-live"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
      await wait(20);
    });
    for (let i = 0; i < 40 && host.querySelector('[data-testid="concept-card-c-live"]') === null; i += 1) {
      await act(async () => {
        await wait(5);
      });
    }
    expect(host.querySelector('[data-testid="concept-card-c-live"]')).not.toBeNull();
    const written = await store.readAll();
    expect(written.some((e) => e.type === "concept-accepted" && e.conceptId === "c-live")).toBe(true);
    /* M93, ISC-764: Accept takes the concept alone; the claim it named waits under Statements to place with its proposed home. */
    expect(written.slice(EVENTS.length + 1).filter((e) => e.actor === "human").map((e) => e.type)).toEqual(["concept-accepted"]);
    expect(written.some((e) => e.type === "statement-attached" && e.pageId === other.id)).toBe(false);
    await act(async () => root.unmount());
  });
});

/* M67, ISC-634: the grouping offer gives way to "Statements to place", where
   Abductive proposes a home for each statement on first open. Without a model
   connected the section says how to connect one and writes nothing. */
describe("statements to place on first open (ISC-610, ISC-634)", () => {
  test("a project with claims and no concepts lists its statements to place, and nothing is written without a model", async () => {
    await saveProject({ id: P, title: "the example project", stage: "design-brief", createdAt: 1, brief: emptyBrief() } as never);
    const store = new InMemoryLedgerStore();
    for (const event of EVENTS) await store.append(event);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(LedgerProvider, { store, children: React.createElement(ConceptsView, { projectId: P }) }));
    });
    for (let i = 0; i < 40 && host.querySelector('[data-testid="to-place-note"]') === null; i += 1) {
      await act(async () => {
        await wait(5);
      });
    }
    const section = host.querySelector('[data-testid="statements-to-place"]');
    expect(section?.textContent ?? "").toContain("Statements to place");
    expect(host.querySelector('[data-testid="to-place-note"]')?.textContent).toContain("Connect a model under Model access");
    const written = await store.readAll();
    expect(written.filter((e) => e.type.startsWith("concept-") || e.type === "homes-proposed").length).toBe(0);
    await act(async () => root.unmount());
  });
});

describe("statement lines carry their own acts, and every statement is listed flat (the lead's rulings, M63)", () => {
  // M70: a placed statement's line is in its concept's overlay, so the page is read with that overlay open.
  const markup = page(build(), "c-read", { kind: "concept", id: "c-read" });
  const theory = CLAIMS.find((p) => p.type === "theory")!;

  test("a claim's line offers Retire statement, and an expectation offers Mark held in setting", () => {
    expect(markup).toContain(`data-testid="retire-${cited.id}-ask"`);
    expect(markup).toContain("Retire statement");
    expect(markup).toContain(`data-testid="held-${theory.id}-ask"`);
    expect(markup).not.toContain(`data-testid="held-${cited.id}-ask"`);
  });

  test("All statements lists every statement with its concept or unplaced and its mark", () => {
    expect(markup).toContain('data-testid="all-statements"');
    const fold = text(markup.slice(markup.indexOf('data-testid="all-statements"')));
    expect(fold).toContain("All statements");
    expect(markup).toContain(`data-testid="all-statement-${other.id}"`);
    const line = text(markup.slice(markup.indexOf(`data-testid="all-statement-${cited.id}"`)).slice(0, 600));
    expect(line).toContain("Time on task");
    const loose = text(markup.slice(markup.indexOf(`data-testid="all-statement-${other.id}"`)).slice(0, 600));
    expect(loose).toContain("unplaced");
  });

  test("the old model tab's surfaces are not on this page", () => {
    for (const id of ["model-views", "ontology-drawing", "residue-panel", "model-movement-fold", "ontology-transcript", "claim-material", "reviewer-line"]) {
      expect(markup).not.toContain(`data-testid="${id}"`);
    }
  });
});

describe("an answer at a line (the lead's ruling, M63)", () => {
  test("an evidence or relation line offers Answer…, and a property line does not", () => {
    const markup = page(build());
    expect(markup).toMatch(/data-testid="look-for-answer-look:(evidence|relation):[^"]+-ask"/);
    expect(markup).not.toMatch(/data-testid="look-for-answer-look:property:[^"]+-ask"/);
  });
});
