/**
 * M63, ISC-610: where concept suggestions come from.
 *
 * After a saved summary at a step, after a read of the data, and on the offer to
 * group the claims a project already holds, Abductive suggests concepts: at most
 * three per event, each from the researcher's words with the gap marker where
 * their words never said the thing, and every one a suggestion that waits for a
 * decision.
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { MAX_SUGGESTED, groupingOffered, parseConceptBlocks, suggestConcepts } from "../src/concepts/suggest.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { acceptConceptEvents } from "../src/concepts/door.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief } from "../src/state/projects.ts";
import type { Chunk } from "../src/state/chunks.ts";

const P = "p-suggest";
let n = 0;
const uid = () => `dddddddd-4444-4444-8444-${String((n += 1)).padStart(12, "0")}`;
let t = 9_000;
const clock = { now: () => (t += 10), makeId: uid };
const context = studyContext({ ...emptyBrief(), context: "A pre-seed programme where mentors stopped reading founders' updates." });

const block = (name: string, extra = "") =>
  `NAME: ${name}\nDEFINITION: ${name}, as you put it at Context [...]\nPROPERTIES: Weekly count; Who reads\n${extra}`;

const SUMMARY =
  "Mentors stopped reading the weekly updates once they all looked the same, and judgement moved into the office-hours slot, where founders who were introduced got longer.";

describe("from a saved summary", () => {
  test("at most three suggestions, each validated, from the step and in the researcher's words", async () => {
    const client = new MockInferenceClient({
      responses: [[block("Reading dose", "STATEMENT: Mentors stop reading once updates look alike."), block("Office-hours slot"), block("Introduction"), block("A fourth"), block("A fifth")].join("\n---\n")],
    });
    const out = await suggestConcepts(
      { projectId: P, events: [], graph: projectOntology([], P), context, source: { kind: "summary", station: "context" }, text: SUMMARY, clock },
      client,
    );
    // M67, ISC-633: the cap is on concepts; the statement arrives as a suggestion of its own with a home.
    expect(out.filter((e) => e.type === "concept-suggested").length).toBe(MAX_SUGGESTED);
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    const first = out[0]!;
    if (first.type !== "concept-suggested") throw new Error("wrong type");
    expect(first.actor).toBe("persona:concept-suggester");
    expect(first.source).toEqual({ kind: "summary", station: "context" });
    expect(first.definition).toContain("[...]");
    expect(first.properties).toEqual(["Weekly count", "Who reads"]);
    const said = out.find((e) => e.type === "statement-suggested");
    if (said?.type !== "statement-suggested") throw new Error("no statement");
    expect(said.text).toBe("Mentors stop reading once updates look alike.");
    expect(said.home).toEqual({ kind: "concept", id: first.conceptId });
    const prompt = client.requests[0]!;
    expect(prompt.system).toContain("[...]");
    expect(prompt.system).toContain("At most 3");
    expect(JSON.stringify(prompt.messages)).toContain(SUMMARY);
    expect(JSON.stringify(prompt.messages)).toContain("pre-seed programme");
  });

  test("a relation names an existing concept or it is dropped", async () => {
    const events: LedgerEvent[] = [
      { id: uid(), ts: 1, actor: "persona:concepts", model: "m", modelVersion: "v", projectId: P, type: "concept-suggested", conceptId: "c-judge", name: "Office-hours judgement", definition: "d x", properties: [], relations: [], statementIds: [], statements: [], source: { kind: "grouping" } } as LedgerEvent,
    ];
    const accepted = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-judge" }, clock)];
    const client = new MockInferenceClient({
      responses: [block("Reading dose", "RELATION: leads-to | Office-hours judgement\nRELATION: leads-to | Nothing by that name\nRELATION: causes | Office-hours judgement")],
    });
    const out = await suggestConcepts(
      { projectId: P, events: accepted, graph: projectOntology(accepted, P), context, source: { kind: "summary", station: "site" }, text: SUMMARY, clock },
      client,
    );
    const s = out[0];
    if (s?.type !== "concept-suggested") throw new Error("none");
    expect(s.relations).toEqual([{ relation: "leads-to", to: "c-judge" }]);
  });

  test("a summary too short to hold a concept costs no call and suggests nothing", async () => {
    const client = new MockInferenceClient({ responses: [block("X")] });
    const out = await suggestConcepts(
      { projectId: P, events: [], graph: projectOntology([], P), context, source: { kind: "summary", station: "context" }, text: "Not sure yet.", clock },
      client,
    );
    expect(out).toEqual([]);
    expect(client.requests.length).toBe(0);
  });

  test("a name already in the ontology or waiting as a suggestion is not suggested again", async () => {
    const events: LedgerEvent[] = [
      { id: uid(), ts: 1, actor: "persona:concepts", model: "m", modelVersion: "v", projectId: P, type: "concept-suggested", conceptId: "c-r", name: "Reading dose", definition: "d x", properties: [], relations: [], statementIds: [], statements: [], source: { kind: "grouping" } } as LedgerEvent,
    ];
    const client = new MockInferenceClient({ responses: [[block("reading dose"), block("Room performance")].join("\n---\n")] });
    const out = await suggestConcepts(
      { projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "summary", station: "context" }, text: SUMMARY, clock },
      client,
    );
    expect(out.map((e) => (e.type === "concept-suggested" ? e.name : ""))).toEqual(["Room performance"]);
  });
});

describe("from a read of the data", () => {
  const chunks: Chunk[] = [
    { id: "ch-data", projectId: P, documentId: "d1", kind: "transcript", text: "I stopped reading them by week three.", index: 0 },
    { id: "ch-paper", projectId: P, documentId: "d2", kind: "literature", text: "Evaluators rely on style cues.", index: 0 },
  ];
  test("the passages cited are the source, papers are never cited as data, and the mark is your data", async () => {
    const client = new MockInferenceClient({
      responses: [block("Reading dose", "STATEMENT: A mentor stopped reading by week three. [[chunk:ch-data]] [[chunk:ch-paper]]")],
    });
    const out = await suggestConcepts(
      { projectId: P, events: [], graph: projectOntology([], P), context, source: { kind: "data", chunkIds: [] }, text: "", chunks, clock },
      client,
    );
    const s = out[0];
    if (s?.type !== "concept-suggested") throw new Error("none");
    expect(s.source).toEqual({ kind: "data", chunkIds: ["ch-data"] });
    // M67, ISC-633: the statement is its own suggestion, homed at the concept, citing the passage.
    const said = out.find((e) => e.type === "statement-suggested");
    if (said?.type !== "statement-suggested") throw new Error("no statement");
    expect(said.text).toBe("A mentor stopped reading by week three.");
    expect(said.chunkId).toBe("ch-data");
    expect(said.home).toEqual({ kind: "concept", id: s.conceptId });
    expect(JSON.stringify(client.requests[0]!.messages)).not.toContain("Evaluators rely on style cues");
    const done = [...out, ...acceptConceptEvents(out, { projectId: P, conceptId: s.conceptId }, clock)];
    expect(projectConcepts(done, P, projectOntology(done, P)).concepts.get(s.conceptId)!.origin).toBe("data-driven");
  });
});

describe("grouping the claims a project already holds", () => {
  const claims: LedgerEvent[] = ["Same phrase across three ventures", "Mentors stop reading updates", "Room opened, score didn't follow"].map(
    (title, i) =>
      ({ id: uid(), ts: 100 + i, actor: "human", projectId: P, type: "ontology-mutation", op: "create", targetId: `pg-${i}`, pageType: "observation", title, body: "b", origin: "model-proposed", supportingChunks: [`ch-${i}`] }) as LedgerEvent,
  ); // M75: each cites a passage, so each is a data read and a statement to place.

  test("the offer shows while claims exist and no concept or suggestion does", () => {
    expect(groupingOffered(projectConcepts(claims, P, projectOntology(claims, P)))).toBe(true);
    expect(groupingOffered(projectConcepts([], P, projectOntology([], P)))).toBe(false);
  });

  test("statements are named by their number and mapped to the claims, nothing placed until accepted", async () => {
    const client = new MockInferenceClient({ responses: [block("Reading dose", "STATEMENTS: 1, 2, 9")] });
    const out = await suggestConcepts(
      { projectId: P, events: claims, graph: projectOntology(claims, P), context, source: { kind: "grouping" }, text: "", clock },
      client,
    );
    const s = out[0];
    if (s?.type !== "concept-suggested") throw new Error("none");
    // M67, ISC-634: the numbers become proposed homes for each statement, not statements the concept carries.
    expect(s.statementIds).toEqual([]);
    const homes = out.find((e) => e.type === "homes-proposed");
    if (homes?.type !== "homes-proposed") throw new Error("no homes");
    expect(homes.read).toEqual(["pg-0", "pg-1", "pg-2"]);
    expect(homes.proposals).toEqual([
      { statementId: "pg-0", home: { kind: "concept", id: s.conceptId } },
      { statementId: "pg-1", home: { kind: "concept", id: s.conceptId } },
    ]);
    const view = projectConcepts([...claims, ...out], P, projectOntology([...claims, ...out], P));
    expect(view.unplaced.length).toBe(3);
    expect(groupingOffered(view)).toBe(false);
  });
});

describe("the parser", () => {
  test("reads blocks separated by a rule and ignores a block with no name", () => {
    const parsed = parseConceptBlocks(`${block("A")}\n---\nDEFINITION: no name\n---\n${block("B")}`);
    expect(parsed.map((p) => p.name)).toEqual(["A", "B"]);
  });
});

describe("the three occasions are wired (ISC-610)", () => {
  test("a pass reads the record, appends validated suggestions and says how many", async () => {
    const { runSuggestion, suggestedLine } = await import("../src/concepts/run.ts");
    const store: LedgerEvent[] = [];
    const count = await runSuggestion(
      {
        projectId: P,
        brief: { ...emptyBrief(), context: "A programme." },
        source: { kind: "summary", station: "context" },
        text: SUMMARY,
        readEvents: async () => store,
        appendAll: async (events) => void store.push(...events),
      },
      new MockInferenceClient({ responses: [block("Reading dose")] }),
    );
    expect(count).toBe(1);
    expect(store.map((e) => e.type)).toEqual(["concept-suggested"]);
    expect(suggestedLine(1)).toContain("Emerging project ontology tab");
  });

  test("the step's save asks for concepts from the summary, the data read asks from the data, and a turn drafts nothing", async () => {
    const read = (path: string) => Bun.file(new URL(`../src/${path}`, import.meta.url).pathname).text();
    const station = await read("flow/StationWorkspace.tsx");
    // M85, ISC-716: the suggestion runs from `suggestFrom`, for the step `at` that saved.
    expect(station).toContain('source: { kind: "summary", station: at }');
    expect(station).toContain("suggestFrom(stationId, written.after, answer)");
    const early = await read("flow/SuggestFromData.tsx");
    expect(early).toContain('source: { kind: "data", chunkIds: [] }');
    expect(early).toContain('"Suggest concepts"');
    const dialogue = await read("workbench/Dialogue.tsx");
    expect(dialogue).not.toContain("gleanFromTurn");
  });
});
