/**
 * M75, ISC-669 (the owner, 2026-10-03): "Why do all statements need to be
 * placed? Isn't it just the summaries that should be placed? And shouldn't they
 * be labeled?"
 *
 * By the M63 decision a statement is a summary statement from a step or a data
 * read, and by the lead's ruling B (2026-10-03) a claim drafted from the
 * researcher's replies at a step is step material too. Statements to place holds
 * those three; a paper's claim and a rival leave the inbox (they live on Sources
 * and in the report), and every statement carries a visible label of where it
 * came from.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts, inInbox } from "../src/concepts/projection.ts";
import { statementLabel } from "../src/concepts/statementOrigin.ts";
import { parseBundle } from "../src/export/bundle.ts";
import { StatementsToPlace } from "../src/ui/ConceptsView.tsx";
import { studyState } from "../src/ui/ProjectList.tsx";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";

const P = "p-m75s";
let n = 0;
const uid = () => `dddddddd-7575-4775-8775-${String((n += 1)).padStart(12, "0")}`;
let t = 75_000;
const env = (actor: LedgerEvent["actor"] = "human") => {
  const base = { id: uid(), ts: (t += 10), actor, projectId: P };
  return actor.startsWith("persona:") ? { ...base, model: "claude", modelVersion: "test" } : base;
};

function page(pageId: string, title: string, over: Record<string, unknown> = {}): LedgerEvent {
  return {
    ...env("human"),
    type: "ontology-mutation",
    op: "create",
    targetId: pageId,
    pageType: "observation",
    title,
    body: `${title}.`,
    origin: "model-proposed",
    supportingChunks: [],
    ...over,
  } as LedgerEvent;
}

const docs: StoredDocument[] = [
  { id: "d-f1", projectId: P, name: "week1.txt", kind: "fieldnote", createdAt: 1, chunkCount: 1 },
  { id: "d-f2", projectId: P, name: "week2.txt", kind: "fieldnote", createdAt: 2, chunkCount: 1 },
  { id: "d-c1", projectId: P, name: "coffee.txt", kind: "chatnote", createdAt: 3, chunkCount: 1 },
  { id: "d-p1", projectId: P, name: "thorp.pdf", kind: "literature", createdAt: 4, chunkCount: 1 },
] as StoredDocument[];
const chunks: Chunk[] = [
  { id: "c-f1", projectId: P, documentId: "d-f1", kind: "fieldnote", text: "a", index: 0 },
  { id: "c-f2", projectId: P, documentId: "d-f2", kind: "fieldnote", text: "b", index: 0 },
  { id: "c-c1", projectId: P, documentId: "d-c1", kind: "chatnote", text: "c", index: 0 },
] as Chunk[];

function ledger(): LedgerEvent[] {
  return [
    page("pg-data", "Mentors read only the first page", { supportingChunks: ["c-f2"] }),
    page("pg-paper", "Ties shape attention", { origin: "literature-derived", pageType: "theory" }),
    page("pg-rival", "Founders self-select", { pageType: "rival" }),
    {
      ...env("persona:interviewer"),
      type: "question-selection",
      id: "q-ctx",
      moveId: "m-1",
      topic: "station:context",
      question: "What did you see?",
      alternatives: [],
      mode: "interrogation",
      reason: "the step's question",
      station: "context",
    } as LedgerEvent,
    { ...env("human"), id: "turn-1", type: "response", text: "The warm intro got the long slot.", inReplyTo: "q-ctx" } as LedgerEvent,
    page("pg-turn", "The slot goes to the warm intro", { supportingTurn: "turn-1" }),
    page("pg-loose", "A turn with an unknown place", { supportingTurn: "turn-gone" }),
    {
      ...env("persona:suggester"),
      type: "statement-suggested",
      statementId: "st-ctx",
      text: "Office hours are scarce.",
      home: { kind: "concept", id: "cn-scarcity" },
      source: { kind: "summary", station: "context" },
    } as LedgerEvent,
    {
      ...env("persona:suggester"),
      type: "statement-suggested",
      statementId: "st-chat",
      text: "A founder waited three weeks.",
      home: { kind: "concept", id: "cn-waiting" },
      source: { kind: "data", chunkIds: ["c-c1"] },
      chunkId: "c-c1",
    } as LedgerEvent,
  ];
}

describe("M75: Statements to place holds summary and data statements only (ISC-669)", () => {
  test("the inbox keeps the data claim, the reply claims and the two suggestions, and lets the paper claim and the rival go", () => {
    const events = ledger();
    const v = projectConcepts(events, P, projectOntology(events, P));
    expect(v.statements.get("pg-data")?.from).toEqual({ kind: "data", chunkIds: ["c-f2"] });
    expect(v.statements.get("pg-paper")?.from).toEqual({ kind: "papers" });
    expect(v.statements.get("pg-rival")?.from).toEqual({ kind: "rival" });
    expect(v.statements.get("pg-turn")?.from).toEqual({ kind: "conversation", station: "context" });
    expect(v.statements.get("pg-loose")?.from).toEqual({ kind: "conversation" });
    expect(v.toPlace.map((s) => s.id)).toEqual(["pg-data", "pg-turn", "pg-loose"]);
    expect(v.suggestedStatements.map((s) => s.statementId)).toEqual(["st-ctx", "st-chat"]);
    expect(inInbox({ kind: "summary", station: "context" })).toBe(true);
    expect(inInbox({ kind: "papers" })).toBe(false);
    expect(inInbox({ kind: "rival" })).toBe(false);
  });

  test("every origin reads as a label", () => {
    const ctx = { chunks, documents: docs };
    expect(statementLabel({ kind: "summary", station: "context" }, ctx)).toBe("Context summary");
    expect(statementLabel({ kind: "summary", station: "early-data" }, ctx)).toBe("Early data summary");
    expect(statementLabel({ kind: "data", chunkIds: ["c-f2"] }, ctx)).toBe("Fieldnote 2");
    expect(statementLabel({ kind: "data", chunkIds: ["c-f1"] }, ctx)).toBe("Fieldnote 1");
    expect(statementLabel({ kind: "data", chunkIds: ["c-c1"] }, ctx)).toBe("Chat note");
    expect(statementLabel({ kind: "papers" }, ctx)).toBe("From the papers");
    expect(statementLabel({ kind: "rival" }, ctx)).toBe("Rival from Abductive");
    expect(statementLabel({ kind: "conversation", station: "context" }, ctx)).toBe("Your replies at Context");
    expect(statementLabel({ kind: "conversation", station: "framing" }, ctx)).toBe("Your replies at Starting point");
    expect(statementLabel({ kind: "conversation" }, ctx)).toBe("Your replies");
    expect(inInbox({ kind: "conversation" })).toBe(true);
  });

  test("the inbox renders each statement with its label, and the paper claim is absent", () => {
    const events = ledger();
    const v = projectConcepts(events, P, projectOntology(events, P));
    const names = {
      dataPassages: ["c-f1", "c-f2", "c-c1"],
      concept: () => "a concept",
      relation: () => "a relation",
      passage: () => "a passage",
      passageText: () => null,
      said: () => null,
      label: (from: Parameters<typeof statementLabel>[0]) => statementLabel(from, { chunks, documents: docs }),
    };
    const html = renderToStaticMarkup(
      createElement(StatementsToPlace, {
        view: v,
        names: names as never,
        acts: {} as never,
        proposing: false,
        note: null,
        onPropose: () => {},
        unread: 0,
        onRead: () => {},
      }),
    );
    expect(html).toContain("Context summary");
    expect(html).toContain("Chat note");
    expect(html).toContain("Fieldnote 2");
    expect(html).toContain("Your replies at Context");
    expect(html).not.toContain("Ties shape attention");
    expect(html).not.toContain("Founders self-select");
  });

  /* The lead's ruling B asked for the split to be recorded; measured, it is 17
     data, 19 replies (each with its step on the record), 5 papers and 4 rivals. */
  test("the shipped example splits into data statements, replies, paper claims and rivals", async () => {
    const text = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url)).text();
    const b = parseBundle(text);
    const v = projectConcepts(b.events, b.project.id, projectOntology(b.events, b.project.id));
    const count = (k: string) => [...v.statements.values()].filter((s) => s.from.kind === k).length;
    expect(v.statements.size).toBe(45);
    expect(count("papers")).toBe(5);
    expect(count("rival")).toBe(4);
    expect(count("data")).toBe(EXAMPLE_DATA);
    expect(count("conversation")).toBe(EXAMPLE_REPLIES);
    expect(v.toPlace.length).toBe(EXAMPLE_DATA + EXAMPLE_REPLIES);
    expect(v.toPlace.every((s) => s.from.kind === "data" || s.from.kind === "conversation")).toBe(true);
    expect([...v.statements.values()].filter((s) => s.from.kind === "conversation").every((s) => s.from.kind === "conversation" && s.from.station !== undefined)).toBe(true);
  });

  test("the Projects page counts summary, reply and data statements, and its key says so", async () => {
    const text = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url)).text();
    const b = parseBundle(text);
    const row = studyState({ project: b.project, events: b.events, corpusChunkIds: b.chunks.map((c) => c.id) });
    expect(row.statements).toBe(EXAMPLE_DATA + EXAMPLE_REPLIES);
    const list = await Bun.file(new URL("../src/ui/ProjectList.tsx", import.meta.url)).text();
    expect(list).toContain("Statements from a step summary, your replies at a step or a read of your data");
  });
});

/** The example's claims that cite a passage of its data, rivals left out. */
const EXAMPLE_DATA = 17;
/** The example's claims drafted from the researcher's replies, with no passage cited. */
const EXAMPLE_REPLIES = 19;
