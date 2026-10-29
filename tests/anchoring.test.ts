/**
 * Absence in the graph (ISC-342 … ISC-348).
 *
 * A co-author, 4 August: "it may be that if something is not a fit, the
 * connections are unclear." A page nothing relates to rendered exactly like a
 * related one that happened to sit at the edge of the layout, so the absence
 * was invisible. This is the same move the bias page already makes with
 * crossings nothing watches: render the gap rather than omit it.
 */

import { describe, expect, test } from "bun:test";
import { describeAnchoring, projectAnchoring, NO_ANCHORING } from "../src/views/anchoring.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const P = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

let seq = 0;
const page = (id: string, title: string): LedgerEvent =>
  ({
    id: `evt-page-${(seq += 1)}`,
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: "observation",
    origin: "author-prior",
    title,
    body: "b",
  }) as LedgerEvent;

const relate = (from: string, to: string): LedgerEvent =>
  ({
    id: `evt-edge-${(seq += 1)}`,
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "relate",
    targetId: `edge-${from}-${to}`,
    edge: { from, to, role: "evidences" },
    origin: "author-prior",
    title: "e",
  }) as LedgerEvent;

const graphOf = (events: LedgerEvent[]) => projectOntology(events, P);

describe("what nothing connects to", () => {
  test("an empty graph has nothing to say (ISC-342)", () => {
    expect(projectAnchoring(graphOf([]))).toEqual(NO_ANCHORING);
    expect(describeAnchoring(NO_ANCHORING)).toBeNull();
  });

  test("pages with no edge are named as unanchored (ISC-343)", () => {
    const view = projectAnchoring(graphOf([page("a", "A"), page("b", "B")]));
    expect(view.unanchored.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(view.edgeCount).toBe(0);
  });

  test("relating two pages anchors both (ISC-344)", () => {
    const view = projectAnchoring(graphOf([page("a", "A"), page("b", "B"), relate("a", "b")]));
    expect(view.unanchored).toEqual([]);
    expect(view.components).toHaveLength(1);
  });

  test("two clusters that never touch are counted as two (ISC-345)", () => {
    const view = projectAnchoring(
      graphOf([
        page("a", "A"),
        page("b", "B"),
        relate("a", "b"),
        page("c", "C"),
        page("d", "D"),
        relate("c", "d"),
      ]),
    );
    expect(view.components).toHaveLength(2);
    expect(view.stranded).toHaveLength(2);
    expect(describeAnchoring(view)).toContain("2 pieces");
  });

  test("an edge naming a page that is not live is not a connection (ISC-346)", () => {
    const view = projectAnchoring(graphOf([page("a", "A"), relate("a", "ghost")]));
    expect(view.unanchored.map((p) => p.id)).toEqual(["a"]);
  });

  test("Anti: a fully connected graph produces no sentence (ISC-347)", () => {
    // A tool that congratulates you on a tidy graph is one you stop reading.
    const view = projectAnchoring(graphOf([page("a", "A"), page("b", "B"), relate("a", "b")]));
    expect(describeAnchoring(view)).toBeNull();
  });

  test("Anti: one lone page is not nagged about (ISC-348)", () => {
    // Everything is unanchored at the start. That is the normal state of a
    // study that has just begun, not a defect.
    expect(describeAnchoring(projectAnchoring(graphOf([page("a", "A")])))).toBeNull();
  });

  test("it is a pure projection", () => {
    const events = [page("a", "A"), page("b", "B"), relate("a", "b")];
    expect(projectAnchoring(graphOf(events))).toEqual(projectAnchoring(graphOf(events)));
  });
});

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel, workbench/PagePanel.tsx, src/workbench/PagePanel.tsx left with it; superseded: "the page detail splits findings by target kind"
  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel, workbench/PagePanel.tsx, src/workbench/PagePanel.tsx left with it; superseded: "Anti: no raw rule slug is rendered there"
