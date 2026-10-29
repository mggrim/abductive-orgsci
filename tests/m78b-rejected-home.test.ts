/**
 * M78b, ISC-681: rejecting a statement's proposed home never drops the
 * statement (the serendipity walk, finding 6). Five of the walk's 44 suggested
 * statements left the queue without a decision, each when the student rejected
 * the concept or relation that Abductive had proposed as its home. The record
 * keeps the rejection, and the statement returns to Statements to place with
 * the home select cleared and "Choose a home" shown.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { pendingWindow } from "../src/concepts/suggest.ts";
import { acceptStatementEvents } from "../src/concepts/door.ts";
import { StatementsToPlace } from "../src/ui/ConceptsView.tsx";

const walk = (await Bun.file(new URL("./fixtures/m76-walk.json", import.meta.url)).json()) as {
  project: { id: string };
  events: LedgerEvent[];
};
const P = walk.project.id;
const view = () => projectConcepts(walk.events, P, projectOntology(walk.events, P));
const names = {
  dataPassages: [],
  concept: (id: string) => view().concepts.get(id)?.name ?? "a concept",
  relation: () => "a relation",
  passage: () => "a passage",
  passageText: () => null,
  said: () => null,
  label: () => "Context summary",
};

describe("a rejected home returns its statement (ISC-681)", () => {
  test("on the walk's record, 44 suggested and 44 accounted for", () => {
    const suggested = walk.events.filter((e) => e.type === "statement-suggested").map((e) => (e as { statementId: string }).statementId);
    expect(suggested.length).toBe(44);
    const placed = new Set(
      walk.events.flatMap((e) => (e.type === "statement-attached" || e.type === "relation-statement-attached" ? [e.statementId] : [])),
    );
    const rejected = new Set(walk.events.flatMap((e) => (e.type === "statement-rejected" ? [e.statementId] : [])));
    const shown = new Set(pendingWindow(view()).view.suggestedStatements.map((s) => s.statementId));
    expect({ placed: placed.size, rejected: rejected.size, toPlace: shown.size }).toEqual({ placed: 38, rejected: 1, toPlace: 5 });
    const accounted = suggested.filter((id) => placed.has(id) || rejected.has(id) || shown.has(id));
    expect(accounted.length).toBe(44);
    // The rejection stays on the record: each shown statement's proposed home is rejected.
    for (const s of pendingWindow(view()).view.suggestedStatements) {
      const status = s.home.kind === "concept" ? view().concepts.get(s.home.id)?.status : view().relations.get(s.home.id)?.status;
      expect(status).toBe("rejected");
    }
  });

  test("the card shows the home select cleared, \"Choose a home\", and the rejection", () => {
    const html = renderToStaticMarkup(
      createElement(StatementsToPlace, {
        view: pendingWindow(view()).view,
        names: names as never,
        acts: { busy: false } as never,
        proposing: false,
        note: null,
        onPropose: () => {},
        unread: 0,
        onRead: () => {},
      }),
    );
    expect(html).toContain("I kept notes differently in the two periods");
    expect(html).toContain("You rejected its proposed home, the concept Counts of acted-on leads.");
    expect(html).not.toContain("Abductive proposes a home under the concept Counts of acted-on leads");
    // The select opens on the cleared choice.
    expect(html).toMatch(/<option value="choose:" disabled="" selected="">Choose a home<\/option>/);
    expect(html).toContain("Choose a home, or write a new concept.");
  });

  test("choosing another home places the statement through the door", () => {
    const s = pendingWindow(view()).view.suggestedStatements.find((x) => x.text.startsWith("I kept notes differently"))!;
    const home = view().accepted.find((c) => c.name === "Online booking system")!;
    const out = acceptStatementEvents(walk.events, { projectId: P, statementId: s.statementId, home: { kind: "concept", id: home.id } });
    expect(out.map((e) => e.type)).toContain("statement-attached");
    const after = [...walk.events, ...out];
    const v = projectConcepts(after, P, projectOntology(after, P));
    expect(v.suggestedStatements.some((x) => x.statementId === s.statementId)).toBe(false);
  });
});
