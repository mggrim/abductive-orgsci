/**
 * M74b, ISC-665: the suggestion cap, repeats, and provenance (the walk's
 * finding 13).
 *
 * By the end of the walk the tab carried 21 concepts, 6 relations and 38
 * statements for a project with two visits and one chat, while the Help
 * promised "at most three at a time". Statements restated the student's summary
 * sentence by sentence, two appeared twice, and the provenance slipped.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import {
  PENDING_CAP,
  pendingWindow,
  queueLine,
  suggestConcepts,
} from "../src/concepts/suggest.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { acceptConceptEvents } from "../src/concepts/door.ts";
import { sourcePhrase } from "../src/concepts/vocabulary.ts";
import { suggestedLine } from "../src/concepts/run.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief } from "../src/state/projects.ts";
import type { Chunk } from "../src/state/chunks.ts";

const P = "p-m74b-cap";
let n = 0;
const uid = () => `eeeeeeee-4444-4444-8444-${String((n += 1)).padStart(12, "0")}`;
let t = 1_000;
const clock = { now: () => (t += 10), makeId: uid };
const context = studyContext({ ...emptyBrief(), context: "A repair café in a church hall." });

function concept(name: string): LedgerEvent {
  return {
    id: uid(),
    ts: (t += 10),
    actor: "persona:concept-suggester",
    model: "m",
    modelVersion: "v",
    projectId: P,
    type: "concept-suggested",
    conceptId: uid(),
    name,
    definition: `${name}, as they put it.`,
    properties: [],
    relations: [],
    statementIds: [],
    statements: [],
    source: { kind: "summary", station: "context" },
  } as LedgerEvent;
}

function statement(text: string, homeId: string): LedgerEvent {
  return {
    id: uid(),
    ts: (t += 10),
    actor: "persona:concept-suggester",
    model: "m",
    modelVersion: "v",
    projectId: P,
    type: "statement-suggested",
    statementId: uid(),
    text,
    home: { kind: "concept", id: homeId },
    source: { kind: "summary", station: "context" },
  } as LedgerEvent;
}

const idOf = (e: LedgerEvent) => (e.type === "concept-suggested" ? e.conceptId : "");

describe("at most three concepts, three relations and six statements pending at once", () => {
  const concepts = ["Money argument", "Bike table", "Arguing about it", "Ending up in a bin", "Saturday shift"].map(concept);
  const statements = Array.from({ length: 9 }, (_, i) => statement(`Statement number ${i + 1} about the café.`, idOf(concepts[i % 3]!)));
  const events = [...concepts, ...statements];

  test("the tab shows the first three concepts and six statements, and the rest wait in the queue", () => {
    const view = projectConcepts(events, P, projectOntology(events, P));
    const shown = pendingWindow(view);
    expect(PENDING_CAP).toEqual({ concepts: 3, relations: 3, statements: 6 });
    expect(shown.view.suggested.map((c) => c.name)).toEqual(["Money argument", "Bike table", "Arguing about it"]);
    expect(shown.view.suggestedStatements).toHaveLength(6);
    expect(shown.queued).toBe(2 + 3);
    expect(queueLine(shown.queued)).toBe("Abductive has five more suggestions in the queue and shows the next when you decide one.");
    expect(queueLine(9)).toBe("Abductive has nine more suggestions in the queue and shows the next when you decide one.");
    expect(queueLine(0)).toBeNull();
  });

  test("deciding one shows the next", () => {
    const decided = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: idOf(concepts[0]!) }, clock)];
    const shown = pendingWindow(projectConcepts(decided, P, projectOntology(decided, P)));
    expect(shown.view.suggested.map((c) => c.name)).toEqual(["Bike table", "Arguing about it", "Ending up in a bin"]);
  });

  test("a pass that fills the cap says so", () => {
    const line = suggestedLine({ concepts: 3, relations: 0, statements: 4, homes: 0, queued: 9 });
    expect(line).toContain("Abductive has nine more suggestions in the queue and shows the next when you decide one.");
  });
});

describe("no statement twice, and none a summary sentence verbatim", () => {
  const SUMMARY =
    "It's the repair café near me, in a church hall. I've only been twice as a visitor. At the bike table they just fix the bikes.";

  test("the same text under any home is not suggested again, and a summary sentence is not suggested at all", async () => {
    const money = concept("Money argument");
    const earlier = [money, statement("Volunteers argue about whether a kettle is worth fixing.", idOf(money))];
    const reply = [
      "NAME: Bike table",
      "DEFINITION: The table where the volunteers just fix the bikes.",
      "STATEMENT: Volunteers argue about whether a kettle is worth fixing.",
      "STATEMENT: At the bike table they just fix the bikes.",
      "STATEMENT: The bike man doesn't ask whether a bike is worth fixing.",
      "STATEMENT: The bike man doesn't ask whether a bike is worth fixing.",
    ].join("\n");
    const out = await suggestConcepts(
      {
        projectId: P,
        events: earlier,
        graph: projectOntology(earlier, P),
        context,
        source: { kind: "summary", station: "site" },
        text: SUMMARY,
        clock,
      },
      new MockInferenceClient({ responses: [reply] }),
    );
    const said = out.flatMap((e) => (e.type === "statement-suggested" ? [e.text] : []));
    expect(said).toEqual(["The bike man doesn't ask whether a bike is worth fixing."]);
  });
});

describe("provenance marks", () => {
  const step = (s: string) => (s === "site" ? "Site" : s);

  test("from a Design summary, from the data, from the papers", () => {
    expect(`from ${sourcePhrase({ kind: "summary", station: "site" }, step)}`).toBe("from your summary at Site");
    expect(`from ${sourcePhrase({ kind: "data", chunkIds: ["c1", "c2"] }, step)}`).toBe("from the data");
    expect(`from ${sourcePhrase({ kind: "grouping", from: "papers" }, step)}`).toBe("from the papers");
    expect(`from ${sourcePhrase({ kind: "grouping" }, step)}`).toBe("from the statements already in your project");
  });

  test("a statement read from the data cites a passage of the data, or it is not suggested", async () => {
    const chunk = { id: "chunk-pat", documentId: "d1", projectId: P, index: 0, kind: "fieldnote", text: "Pat said we don't really decide, we just argue about it." } as unknown as Chunk;
    const reply = [
      "NAME: Arguing about it",
      "DEFINITION: The volunteers argue about whether a thing is worth fixing.",
      "STATEMENT: Pat said they don't really decide, they just argue about it. [[chunk:chunk-pat]]",
      "STATEMENT: The woman who brought the toaster just waited for them to decide.",
    ].join("\n");
    const out = await suggestConcepts(
      { projectId: P, events: [], graph: projectOntology([], P), context, source: { kind: "data", chunkIds: [] }, text: "", chunks: [chunk], clock },
      new MockInferenceClient({ responses: [reply] }),
    );
    const said = out.flatMap((e) => (e.type === "statement-suggested" ? [e.text] : []));
    expect(said).toEqual(["Pat said they don't really decide, they just argue about it."]);
  });

  test("a concept the homes pass suggests for claims waiting from the papers is marked from the papers", async () => {
    const waiting: LedgerEvent = {
      id: uid(),
      ts: (t += 10),
      actor: "persona:extractor",
      projectId: P,
      type: "proposal",
      proposalId: "prop-1",
      pageType: "observation",
      title: "Moral economies set what counts as worth repairing.",
      body: "b",
      model: "m",
      modelVersion: "v",
      sourceChunks: [],
    } as LedgerEvent;
    const reply = ["NAME: Moral economy", "DEFINITION: What counts as worth repairing [...]", "STATEMENTS: 1"].join("\n");
    const out = await suggestConcepts(
      { projectId: P, events: [waiting], graph: projectOntology([waiting], P), context, source: { kind: "grouping" }, text: "", clock },
      new MockInferenceClient({ responses: [reply] }),
    );
    const made = out.find((e) => e.type === "concept-suggested");
    expect(made?.type === "concept-suggested" && made.source).toEqual({ kind: "grouping", from: "papers" });
  });
});
