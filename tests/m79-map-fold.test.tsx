/**
 * M79, ISC-683 and ISC-684 (the owner, 2026-10-03): "the concept map should be
 * at the bottom of the emerging project ontology in its own expandable frame".
 *
 * The map leaves the side panel for the foot of the concepts tab, below
 * Statements to place, inside a fold whose summary reads "Concept map" with the
 * count beside it. The fold is closed on a project with no accepted concept and
 * open once one is accepted, unless the researcher chose otherwise, which this
 * browser remembers per project. Expand opens the map in a dialog at the
 * viewport's size, and the caption with the queue count sits under the map in
 * both places.
 *
 * M81, ISC-692 replaced the fold with a frame below both columns whose height a
 * handle sets (tests/m81-map-frame.test.tsx). The tests here that still apply
 * read the frame: the side panel keeps only the field list, the count, the
 * caption under the drawing, Expand and its dialog, and the 390 column. The
 * fold's own tests (its place in the main pane, its summary, closed until the
 * first accepted concept, the remembered open or closed choice, the stored
 * value read as no choice, the summary's room for Expand, and the Help's "at
 * the foot of the page") went with the fold; m81-map-frame.test.tsx carries
 * their successors.
 */

import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts, type ProjectOntologyView } from "../src/concepts/projection.ts";
import { addConceptEvents, addRelationEvents } from "../src/concepts/door.ts";
import { ConceptsPage } from "../src/ui/ConceptsView.tsx";
import { mapFrameNote, readMapFrame } from "../src/ui/concepts/ConceptMapFrame.tsx";

const P = "p-m79fold";
const Q = "p-m79other";
let n = 0;
const uid = () => `79797979-7979-4779-8779-${String((n += 1)).padStart(12, "0")}`;
let t = 90_000;
const clock = { now: () => (t += 10), makeId: uid };
const env = (projectId: string) => ({ id: uid(), ts: (t += 10), actor: "persona:concepts" as const, model: "claude", modelVersion: "test", projectId });

function suggestedConcept(projectId: string, conceptId: string, name: string): LedgerEvent {
  return {
    ...env(projectId),
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

/** Two suggested concepts and nothing accepted. */
function suggestedOnly(projectId = P): ProjectOntologyView {
  const events = [suggestedConcept(projectId, "c-one", "Waiting time"), suggestedConcept(projectId, "c-two", "Warm intro")];
  return projectConcepts(events, projectId, projectOntology(events, projectId));
}

/** Two accepted concepts joined by one accepted relation, and one suggested concept. */
function withAccepted(projectId = P): ProjectOntologyView {
  let events: LedgerEvent[] = [];
  for (const name of ["Office-hours slot", "Command score"]) {
    events = [...events, ...addConceptEvents(events, { projectId, name, definition: `${name}.` }, clock)];
  }
  const [slot, score] = projectConcepts(events, projectId, projectOntology(events, projectId)).accepted;
  events = [...events, ...addRelationEvents(events, { projectId, from: slot!.id, to: score!.id, relation: "leads-to", claim: "Longer slots lead to higher scores." }, clock)];
  events = [...events, suggestedConcept(projectId, "c-wait", "Waiting time")];
  return projectConcepts(events, projectId, projectOntology(events, projectId));
}

let host: HTMLElement;
let root: Root;

/* Other files put their own storage on the global and not all of them put it
   back, so this file holds one of its own for its tests. */
const realStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}
const storage = () => (globalThis as unknown as { localStorage: Storage }).localStorage;
afterAll(() => {
  if (realStorage !== undefined) Object.defineProperty(globalThis, "localStorage", realStorage);
});

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage(), configurable: true, writable: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function draw(view: ProjectOntologyView, projectId = P) {
  await act(async () => {
    root.render(
      createElement(ConceptsPage, {
        projectId,
        view,
        chunks: [],
        documents: [],
        current: null,
        onCurrent: () => {},
        acts: null,
      }),
    );
    await wait(5);
  });
}

const q = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const frame = () => q("concept-map-frame") as HTMLElement | null;
const collapsed = () => frame()!.getAttribute("data-collapsed") === "true";
const press = async (id: string) =>
  act(async () => {
    (q(id) as HTMLElement).click();
    await wait(5);
  });

describe("M79: the map leaves the side panel (ISC-683, kept under M81)", () => {
  test("the side panel keeps only the field list", async () => {
    await draw(withAccepted());
    const side = host.querySelector(".panel-side")!;
    expect(side.querySelector('[data-testid="concept-map"]')).toBeNull();
    expect(side.querySelector('[data-testid="concept-map-frame"]')).toBeNull();
    expect(side.querySelector('[data-testid="look-for"]')).not.toBeNull();
  });

  test("the count reads one of each in the singular, and zero in the plural", () => {
    expect(mapFrameNote(withAccepted())).toBe("3 concepts, 1 relation");
    expect(mapFrameNote(suggestedOnly())).toBe("2 concepts, 0 relations");
    expect(mapFrameNote(projectConcepts([], P, projectOntology([], P)))).toBe("0 concepts, 0 relations");
  });

  test("the caption sits under the drawing", async () => {
    await draw(withAccepted());
    const map = frame()!.querySelector('[data-testid="concept-map"]')!;
    const svg = map.querySelector("svg.concept-map-svg")!;
    const caption = map.querySelector('[data-testid="concept-map-caption"]')!;
    expect(svg.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caption.textContent).toBe("2 concepts and 1 relation accepted, 1 concept suggested.");
  });
});

describe("M79: Expand opens the map at the viewport's size (ISC-684)", () => {
  test("Expand sits in the frame's header row and opens the map in a dialog, closed with Close", async () => {
    await draw(withAccepted());
    const expand = q("concept-map-expand") as HTMLButtonElement;
    expect(expand.textContent).toBe("Expand");
    expect(expand.closest('[data-testid="concept-map-frame-head"]')).not.toBeNull();
    /* No closed dialog waits on the page. */
    expect(q("concept-map-sheet")).toBeNull();
    await press("concept-map-expand");
    const dialog = q("concept-map-sheet") as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.classList.contains("concept-map-sheet")).toBe(true);
    expect(dialog.querySelector("h2")?.textContent).toBe("Concept map");
    const map = dialog.querySelector('[data-testid="concept-map"]')!;
    const svg = map.querySelector("svg.concept-map-svg")!;
    const caption = map.querySelector('[data-testid="concept-map-caption"]')!;
    expect(svg.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(map.querySelectorAll("g.concept-map-node").length).toBe(3);
    await press("concept-map-sheet-close");
    expect(q("concept-map-sheet")).toBeNull();
  });

  test("Expand works with the frame collapsed, and leaves the frame as it was", async () => {
    await draw(suggestedOnly());
    expect(collapsed()).toBe(true);
    await press("concept-map-expand");
    expect((q("concept-map-sheet") as HTMLDialogElement).open).toBe(true);
    await press("concept-map-sheet-close");
    expect(q("concept-map-sheet")).toBeNull();
    expect(collapsed()).toBe(true);
    expect(readMapFrame(P)).toBeNull();
  });

  test("a project with nothing to draw has no Expand", async () => {
    await draw(projectConcepts([], P, projectOntology([], P)));
    expect(frame()).not.toBeNull();
    expect(q("concept-map-expand")).toBeNull();
  });

  test("the two drawings name their arrowheads apart", async () => {
    await draw(withAccepted());
    await press("concept-map-expand");
    const markers = [...host.querySelectorAll("marker")].map((m) => m.id);
    expect(markers.length).toBe(2);
    expect(new Set(markers).size).toBe(2);
    for (const svg of host.querySelectorAll("svg.concept-map-svg")) {
      const id = svg.querySelector("marker")!.id;
      /* M82: a relation line is a polyline (straight, or bent once around a label). */
      const marked = [...svg.querySelectorAll("[marker-end]")];
      expect(marked.length).toBeGreaterThan(0);
      for (const line of marked) expect(line.getAttribute("marker-end")).toBe(`url(#${id})`);
    }
  });

  test("the sheet takes the viewport's size", async () => {
    const css = await Bun.file(new URL("../src/ui/styles/concepts.css", import.meta.url)).text();
    const rule = /\.sheet\.concept-map-sheet\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("width: 100vw");
    expect(rule).toContain("height: 100dvh");
    expect(rule).toContain("max-width: none");
    expect(rule).toContain("max-height: none");
  });
});

describe("M79: the cards and the frame fit a 390 column (ISC-684, the lead's ruling)", () => {
  test("a card's least width yields to a column narrower than 20rem", async () => {
    /* At 390 the pane body is one grid track sized by its widest child, and a
       20rem least width on the cards made that track 320 in a 300 column: the
       cards clipped on the right, and so did Expand on the fold. */
    const css = await Bun.file(new URL("../src/ui/styles/concepts.css", import.meta.url)).text();
    const rule = /\.concept-grid\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("grid-template-columns: repeat(auto-fill, minmax(min(20rem, 100%), 1fr));");
  });

  test("the frame's drawing does not hold the frame open past its column", async () => {
    /* Measured in Safari at 390 under M79: the map first draws at its 300
       fallback, and a least width let that width hold its box open in a 268
       column. The frame carries the fold's fix. */
    const css = await Bun.file(new URL("../src/ui/styles/concepts.css", import.meta.url)).text();
    const rule = /\.concept-map-dock\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("min-width: 0;");
  });

  test("the header row wraps, so the count goes to a second line before Expand runs under it", async () => {
    /* M79 found "22 concepts, 8 relations" running under Expand in a 268
       column; Expand is in the row's flow now, at its right. */
    const css = await Bun.file(new URL("../src/ui/styles/concepts.css", import.meta.url)).text();
    expect(/\.concept-map-dock-head\s*\{([^}]*)\}/.exec(css)?.[1] ?? "").toContain("flex-wrap: wrap;");
    expect(/\.concept-map-expand\s*\{([^}]*)\}/.exec(css)?.[1] ?? "").toContain("margin-left: auto;");
  });
});
