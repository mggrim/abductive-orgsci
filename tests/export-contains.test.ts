/**
 * Every chip on /exports is a count of the file its button writes (MAT round
 * three, the named gap).
 *
 * Round one: the Memo card printed FINDINGS 4 and the memo listed six, two of
 * them set aside on the record. That was fixed in three writers. Round two
 * found the same defect alive one row down, on the row the fix had not visited:
 * "Session replay: events 179" beside a file whose own first line reads "11
 * dialogue events", sitting between Full record and Project bundle, whose
 * identical "events" chip was the ledger length and was true.
 *
 * Fixing the eleven in place would have left six other rows free to describe
 * files they do not build, which is how the defect survived a round in the
 * first place. `exportPlan` builds the payloads and reads the counts off them,
 * and this file holds every count against the artefact it labels rather than
 * against the function that produced both. A row that starts counting something
 * the file does not contain fails here.
 *
 * The measurements are deliberately made the way a reader would make them:
 * parse the JSON, count the sections, read the sentence. Where an artefact has
 * no countable token (the figure has no per-page marker in its markup) the
 * assertion is that every page the chip promises is drawn, by title.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent, Origin, PageType } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { liveEdges, livePages } from "../src/ontology/schema.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { buildDiagramSvg } from "../src/export/diagram.ts";
import { buildSessionReplay, replayDialogue } from "../src/export/sessionReplay.ts";
import { serializeAgentGraph } from "../src/export/agentGraph.ts";
import { serializeBundle } from "../src/export/bundle.ts";
import { serializeLedgerExport } from "../src/export/ledgerJson.ts";
import { exportPlan, type ExportCount, type ExportRowId } from "../src/export/exportContains.ts";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";
import { emptyBrief, type Project } from "../src/state/projects.ts";

const P = "proj-contains";
let clock = 2_400_000_000_000;

function env() {
  clock += 1000;
  return { id: crypto.randomUUID(), ts: clock, actor: "human" as const, projectId: P };
}

function page(
  targetId: string,
  pageType: PageType,
  title: string,
  opts: { origin?: Origin; chunks?: string[] } = {},
): LedgerEvent {
  return {
    ...env(),
    type: "ontology-mutation",
    op: "create",
    targetId,
    pageType,
    title,
    body: "A body.",
    origin: opts.origin ?? "author-prior",
    supportingChunks: opts.chunks ?? [],
  } as LedgerEvent;
}

const PROJECT: Project = {
  id: P,
  title: "On the night ward",
  stage: "design-brief",
  brief: {
    ...emptyBrief(),
    researchQuestion: "Why do night nurses hand over differently?",
    dataType: "interview",
  },
  createdAt: 1,
};

const CHALLENGE_ID = crypto.randomUUID();

/*
 * A study with more ledger than dialogue, which is the whole point of the
 * fixture. Three pages, one relation, four passages over two documents, five
 * dialogue events, two attention events and an export already on the record. No
 * two of those are the same number, so a row that prints the ledger length, or
 * the passage count, or anything else in place of its own is a failure here
 * rather than a coincidence that passes.
 */
const BASE: LedgerEvent[] = [
  page("p1", "puzzle", "Handover drifts after midnight", { chunks: ["c1"] }),
  page("t1", "theory", "Shift-work accounts"),
  page("o1", "observation", "The unrecorded handover"),
  {
    ...env(),
    type: "ontology-mutation",
    op: "relate",
    targetId: "p1->t1:contradicts",
    edge: { from: "p1", to: "t1", role: "contradicts" },
    puzzleRelation: "contradicts",
    origin: "author-prior",
    supportingChunks: [],
  } as unknown as LedgerEvent,
  { ...env(), type: "attention", layer: "human", chunkId: "c1" } as LedgerEvent,
  { ...env(), type: "attention", layer: "human", chunkId: "c2" } as LedgerEvent,
  { ...env(), id: CHALLENGE_ID, type: "challenge", text: "Is that a puzzle?" } as LedgerEvent,
  { ...env(), type: "response", text: "It is, and here is why." } as LedgerEvent,
  {
    ...env(),
    type: "adjudication",
    verdict: "accept",
    challengeId: CHALLENGE_ID,
  } as LedgerEvent,
  { ...env(), type: "challenge", text: "Is the theory the right one?" } as LedgerEvent,
  { ...env(), type: "response", text: "For now." } as LedgerEvent,
  {
    ...env(),
    type: "export",
    artefact: "on-the-night-ward-memo.md",
    bytes: 4490,
    stamp: "abcd1234",
    designEvents: 8,
  } as unknown as LedgerEvent,
];

const CHUNKS: readonly Chunk[] = [
  { id: "c1", projectId: P, documentId: "d1", text: "one", index: 0 },
  { id: "c2", projectId: P, documentId: "d1", text: "two", index: 1 },
  { id: "c3", projectId: P, documentId: "d2", text: "three", index: 0 },
  { id: "c4", projectId: P, documentId: "d2", text: "four", index: 1 },
] as unknown as readonly Chunk[];

const DOCUMENTS: readonly StoredDocument[] = [
  { id: "d1", projectId: P, name: "one.txt", text: "one two", addedAt: 1 },
  { id: "d2", projectId: P, name: "two.txt", text: "three", addedAt: 2 },
] as unknown as readonly StoredDocument[];

const GRAPH = projectOntology(BASE, P);
const EVENTS: readonly LedgerEvent[] = BASE;

const PLAN = exportPlan({
  project: PROJECT,
  graph: GRAPH,
  events: EVENTS,
  chunks: CHUNKS,
  documents: DOCUMENTS,
});

// M28: copy. The chips say "claims" and "links", the words every other
// surface uses for the same two objects. The counts they check are unchanged.
/** The number a row prints under that label. Absent is a failure, not a zero. */
function chip(row: ExportRowId, label: string): number {
  const found = PLAN.contains[row].find((c: ExportCount) => c.label === label);
  if (found === undefined) throw new Error(`${row} prints no "${label}" chip`);
  return found.count;
}

/** What a row prints, in order, for the assertions about what it must not say. */
function labels(row: ExportRowId): readonly string[] {
  return PLAN.contains[row].map((c: ExportCount) => c.label);
}

/**
 * Source with the prose taken out.
 *
 * Every file in this repo explains itself at length, and both files checked
 * below name the very strings the check bans, in comments, on purpose. Stripping
 * block comments and line comments is what makes the assertion about the code.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
}

describe("the fixture can tell the numbers apart", () => {
  /*
   * Anti-vacuity. Every assertion below compares a chip to a file, and all of
   * them would pass on a study where the ledger length, the dialogue length and
   * the page count happened to coincide. The defect that shipped was exactly a
   * row printing one of those in place of another, so the fixture has to make
   * them different before the comparisons mean anything.
   */
  test("no two of the counts in play are the same number", () => {
    const distinct = new Set([
      EVENTS.length,
      PLAN.dialogue.length,
      PLAN.pages,
      PLAN.edges,
      CHUNKS.length,
      DOCUMENTS.length,
      PLAN.wikiFiles.length,
    ]);
    expect(distinct.size).toBe(7);
    // And the one that shipped wrong: the replay chip must not be the ledger.
    expect(PLAN.dialogue.length).toBeLessThan(EVENTS.length);
  });
});

describe("the session replay row counts the file it writes", () => {
  const text = buildSessionReplay({ project: PROJECT, events: EVENTS });

  test("the chip is the dialogue, not the ledger", () => {
    expect(chip("replay", "dialogue events")).toBe(PLAN.dialogue.length);
    expect(labels("replay")).not.toContain("events");
    // The measured defect: "events 179" over a file holding eleven.
    expect(chip("replay", "dialogue events")).not.toBe(EVENTS.length);
  });

  test("the file's own first line says the same number", () => {
    const said = /(\d+) dialogue events/.exec(text)?.[1];
    expect(said).toBeDefined();
    expect(Number(said)).toBe(chip("replay", "dialogue events"));
  });

  test("and the file has that many sections in it", () => {
    const sections = text.split("\n").filter((l) => l.startsWith("## "));
    expect(sections).toHaveLength(chip("replay", "dialogue events"));
  });

  test("the label says dialogue, because the neighbouring rows say events truthfully", () => {
    // Both neighbours print the ledger length and are right to. The replay row
    // sat between them printing the same word and the same number for a file
    // sixteen times smaller, which is why the word changed as well as the count.
    expect(chip("ledger", "events")).toBe(EVENTS.length);
    expect(chip("bundle", "events")).toBe(EVENTS.length);
    expect(labels("replay")).toEqual(["dialogue events"]);
  });
});

describe("the machine-readable rows count their own payload", () => {
  test("the ledger row is the envelope's own eventCount", () => {
    const file = JSON.parse(serializeLedgerExport(PLAN.ledger)) as {
      eventCount: number;
      events: unknown[];
    };
    expect(chip("ledger", "events")).toBe(file.eventCount);
    expect(chip("ledger", "events")).toBe(file.events.length);
  });

  test("the bundle row is what the bundle carries", () => {
    const file = JSON.parse(serializeBundle(PLAN.bundle)) as {
      documents: unknown[];
      chunks: unknown[];
      events: unknown[];
    };
    expect(chip("bundle", "documents")).toBe(file.documents.length);
    expect(chip("bundle", "passages")).toBe(file.chunks.length);
    expect(chip("bundle", "events")).toBe(file.events.length);
  });

  test("the agent graph row is what a model would count in the file", () => {
    const file = JSON.parse(serializeAgentGraph(PLAN.agentGraph)) as {
      pages: unknown[];
      edges: unknown[];
      corpus: unknown[];
    };
    expect(chip("agent-graph", "claims")).toBe(file.pages.length);
    expect(chip("agent-graph", "links")).toBe(file.edges.length);
    expect(chip("agent-graph", "passages")).toBe(file.corpus.length);
  });
});

describe("the readable rows count their own payload", () => {
  const memo = buildOntologyMemo({
    project: PROJECT,
    graph: GRAPH,
    events: EVENTS,
    now: () => 1_700_000_000_000,
  });

  test("the memo row's claims is the number the memo prints", () => {
    // R4, copy C6: the census unit is "claims", the word the tab that owns the
    // object teaches. The property is unchanged: the chip and the file agree.
    const said = /(\d+) claims/.exec(memo)?.[1];
    expect(said).toBeDefined();
    expect(Number(said)).toBe(chip("memo", "claims"));
  });

  test("the wiki row is the number of files the picker would write", () => {
    expect(chip("wiki", "files")).toBe(PLAN.wikiFiles.length);
    // One per live page plus the three fixed ones, which is what makes the
    // count a fact about the folder rather than a restatement of the array.
    const pageFiles = PLAN.wikiFiles.filter((f) => f.path.startsWith("pages/"));
    expect(pageFiles).toHaveLength(chip("memo", "claims"));
    expect(PLAN.wikiFiles.map((f) => f.path)).toContain("index.md");
  });

  test("the diagram row's relations is the number of edges drawn", () => {
    const svg = buildDiagramSvg(GRAPH, { title: PROJECT.title });
    // Edges carry data-role; the key at the foot carries data-legend as well,
    // so the drawn edges are the ones that open with data-role.
    const drawn = svg.match(/<line data-role=/g) ?? [];
    expect(drawn).toHaveLength(chip("diagram", "links"));
    expect(drawn.length).toBeGreaterThan(0);
  });

  test("and it stays the drawn number when a relation loses one of its ends", () => {
    /* The case the fixture cannot see, and the one the figure and the chip came
     * apart on. Retiring a page does not retire the edges naming it, on purpose:
     * reinstating the page brings the relation back. So `liveEdges` still counts
     * the relation and the figure cannot draw it, because the page is not on the
     * canvas to draw it to. The chip read the first number and the file drew the
     * second, which is this module's founding defect in an eighth row. */
    const retired = projectOntology(
      [
        ...BASE,
        {
          ...env(),
          type: "ontology-mutation",
          op: "retire",
          targetId: "t1",
          origin: "author-prior",
        } as unknown as LedgerEvent,
      ],
      P,
    );
    const plan = exportPlan({
      project: PROJECT,
      graph: retired,
      events: EVENTS,
      chunks: CHUNKS,
      documents: DOCUMENTS,
    });
    const said = plan.contains.diagram.find((c: ExportCount) => c.label === "links");
    const svg = buildDiagramSvg(retired, { title: PROJECT.title });
    expect(svg.match(/<line data-role=/g) ?? []).toHaveLength(said?.count ?? -1);
    // And it is a real drop rather than the fixture having had nothing to lose.
    expect(said?.count).toBe(0);
    expect(liveEdges(retired)).toHaveLength(1);
  });

  test("the diagram row's pages is a page drawn per page promised", () => {
    // The figure has no per-page token in its markup, so this is the count a
    // reader makes: every live page the chip promises is in the picture, by
    // name. A dropped page fails here even though nothing is countable.
    const svg = buildDiagramSvg(GRAPH, { title: PROJECT.title });
    const titles = livePages(GRAPH).map((p) => p.title);
    expect(titles).toHaveLength(chip("diagram", "claims"));
    // Captions wrap, so the first word of each is what survives the wrapper.
    for (const title of titles) expect(svg).toContain(title.split(" ")[0] ?? title);
  });
});

describe("no row can grow a count of its own again", () => {
  test("ExportBar writes no count literal", async () => {
    /* The defect class, not the instance. Both rounds of this bug were a
     * `{ label: ..., count: ... }` written beside a row rather than read off
     * the payload, so the row was free to be wrong about the file. Every count
     * comes from `exportPlan` now, and this fails the moment one is typed back
     * in beside a button. */
    const code = codeOnly(await Bun.file("src/workbench/ExportBar.tsx").text());
    expect(code).not.toMatch(/count:\s/);
    expect(code).toContain("contains.replay");
    expect(code).toContain("exportPlan(");
  });

  test("the plan covers every row the bar draws, and nothing else", async () => {
    const source = await Bun.file("src/workbench/ExportBar.tsx").text();
    const ids = [...source.matchAll(/testId: "export-([a-z-]+)"/g)].map((m) => m[1] ?? "");
    expect(ids.sort()).toEqual(Object.keys(PLAN.contains).sort());
  });

  test("the replay writer and the replay chip share one filter", async () => {
    const writer = await Bun.file("src/export/sessionReplay.ts").text();
    const plan = await Bun.file("src/export/exportContains.ts").text();
    // Two callers, one definition. Restating the type list in either place is
    // how the row came to count something the file does not hold, so the plan
    // may name the event types in prose and must not filter on them in code.
    expect(writer.match(/DIALOGUE_TYPES = /g) ?? []).toHaveLength(1);
    const planCode = codeOnly(plan);
    expect(planCode).not.toContain("challenge");
    expect(planCode).toContain("replayDialogue(events)");
    expect(replayDialogue(EVENTS).length).toBe(PLAN.dialogue.length);
  });
});
