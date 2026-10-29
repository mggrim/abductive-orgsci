/**
 * M53, ISC-545: ⌘K opens a search of the study.
 *
 * The owner: "Turn cmdK into a search." FND-02 stands: the palette goes places
 * and never acts. So every result is an href inside the study, choosing one
 * navigates (and the page it lands on selects the thing), and nothing here
 * accepts a page, spends a model call or changes the record.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSearchIndex, searchStudy, SEARCH_KIND_LABEL, type SearchInput } from "../src/search/studySearch.ts";
import { emptyBrief } from "../src/state/projects.ts";

const P = "study-1";

const INPUT: SearchInput = {
  projectId: P,
  brief: {
    ...emptyBrief(),
    startingInterest: "Night handovers on one acute ward.",
    targetVenue: "Administrative Science Quarterly",
    context: "Handover happens at the nurses' station at 7am.",
  },
  pages: [
    { id: "pg1", title: "Handover drifts when two occupations share no vocabulary", body: "Seen on the night shift." },
    { id: "pg2", title: "Consultants arrive late", body: "The round starts at nine." },
  ],
  documents: [{ id: "d1", projectId: P, name: "fieldnotes-week1.txt", kind: "fieldnote", createdAt: 1, chunkCount: 2 }],
  chunks: [
    { id: "c1", projectId: P, documentId: "d1", kind: "fieldnote", index: 0, text: "At 7am the charge nurse read the handover sheet aloud while the day team stood by the door." },
    { id: "c2", projectId: P, documentId: "d1", kind: "fieldnote", index: 1, text: "Nobody mentioned the café downstairs." },
  ],
  papers: [{ key: "bechky2003", name: "Bechky 2003, Sharing meaning across occupational communities" }],
};

describe("the index holds the study, each entry with where it lives (ISC-545)", () => {
  const index = buildSearchIndex(INPUT);
  const byId = (kind: string, id: string) => index.find((e) => e.kind === kind && e.id === id);

  test("claims land on Your model with the claim selected", () => {
    expect(byId("claim", "pg1")?.href).toBe(`#/study/${P}/ontology/claim-pg1`);
  });
  test("passages land on the passage on Material", () => {
    expect(byId("passage", "c1")?.href).toBe(`#/study/${P}/material/passage-c1`);
    expect(byId("passage", "c1")?.title).toBe("fieldnotes-week1.txt");
  });
  test("saved answers land on their step, and the motivation's on its field", () => {
    expect(byId("answer", "context")?.href).toBe(`#/study/${P}/design/context`);
    expect(byId("answer", "startingInterest")?.href).toBe(`#/study/${P}/motivation/field-framing-starting-interest`);
    // An empty answer is not an entry.
    expect(byId("answer", "site")).toBeUndefined();
  });
  test("papers land on the papers on Material", () => {
    expect(byId("paper", "bechky2003")?.href).toBe(`#/study/${P}/material/literature`);
  });
  test("every kind has a label for its group", () => {
    for (const e of index) expect(SEARCH_KIND_LABEL[e.kind].length).toBeGreaterThan(0);
  });
  test("Anti: every href is a route inside this study", () => {
    for (const e of index) expect(e.href.startsWith(`#/study/${P}/`)).toBe(true);
  });
});

describe("matching (ISC-545)", () => {
  const index = buildSearchIndex(INPUT);
  test("an empty query finds nothing, so the list is the places", () => {
    expect(searchStudy(index, "   ")).toEqual([]);
  });
  test("one word finds it in claims, passages and answers alike", () => {
    const kinds = new Set(searchStudy(index, "handover").map((r) => r.entry.kind));
    expect([...kinds].sort()).toEqual(["answer", "claim", "passage"]);
  });
  test("every word must match, in any order", () => {
    const hits = searchStudy(index, "sheet nurse");
    expect(hits.map((r) => r.entry.id)).toEqual(["c1"]);
  });
  test("case and accents do not matter", () => {
    expect(searchStudy(index, "CAFE").map((r) => r.entry.id)).toEqual(["c2"]);
  });
  test("a match in the title ranks above a match in the text", () => {
    const hits = searchStudy(index, "handover");
    expect(hits[0]?.entry.id).toBe("pg1");
  });
  test("the line shown is cut round the match and says where it was cut", () => {
    const hit = searchStudy(index, "door").find((r) => r.entry.id === "c1");
    expect(hit?.snippet).toContain("door");
    expect((hit?.snippet ?? "").length).toBeLessThanOrEqual(122);
  });
  test("Anti: a word nothing contains finds nothing", () => {
    expect(searchStudy(index, "zebra")).toEqual([]);
  });
});

describe("the search goes places and never acts (FND-02, ISC-545)", () => {
  const SRC = join(import.meta.dir, "../src");
  const read = (rel: string) => readFileSync(join(SRC, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, "");
  test("the library imports nothing that writes, calls a model or fetches", () => {
    const lib = read("search/studySearch.ts");
    for (const bad of ["appendAll", "append(", "Inference", "personaRun", "fetch(", "ledger/ledger", "saveProject", "updateBrief"]) {
      expect({ bad, found: lib.includes(bad) }).toEqual({ bad, found: false });
    }
  });
  test("the palette's only way out is a navigation", () => {
    const palette = read("ui/keyboard/CommandPalette.tsx");
    for (const bad of ["appendAll", "append(", "Inference", "personaRun", "fetch(", "saveProject", "updateBrief", "accept", "decline"]) {
      expect({ bad, found: palette.includes(bad) }).toEqual({ bad, found: false });
    }
    expect(palette).toContain("navigate(");
  });
});

describe("the brief's three probes, over the shipped example (ISC-545)", async () => {
  const { projectOntology } = await import("../src/ontology/projection.ts");
  const { livePages } = await import("../src/ontology/schema.ts");
  const { paperRows } = await import("../src/views/paperRows.ts");
  const bundle = JSON.parse(
    readFileSync(join(import.meta.dir, "./fixtures/coldharbour.bundle.json"), "utf8"),
  );
  const id = bundle.project.id as string;
  const events = bundle.events;
  const { puzzleState } = await import("../src/views/puzzleReading.ts");
  const brief = { ...emptyBrief(), ...bundle.project.brief };
  const shownPuzzle = puzzleState({ brief, chunks: bundle.chunks, documents: bundle.documents, events, projectId: id });
  const index = buildSearchIndex({
    projectId: id,
    brief,
    ...(shownPuzzle.kind === "read" || shownPuzzle.kind === "stated" ? { puzzle: shownPuzzle.text } : {}),
    pages: livePages(projectOntology(events, id)),
    chunks: bundle.chunks,
    documents: bundle.documents,
    papers: paperRows({ events, projectId: id, documents: bundle.documents, chunks: bundle.chunks }),
  });
  const kinds = (q: string) => searchStudy(index, q).map((r) => r.entry);

  test('"Uniform pages" finds the puzzle', () => {
    // The study's puzzle is a claim of type puzzle in Your model, and it is first.
    const puzzles = new Set(
      livePages(projectOntology(events, id)).filter((p) => p.type === "puzzle").map((p) => p.id),
    );
    const first = kinds("Uniform pages")[0];
    expect(first?.kind).toBe("claim");
    expect(puzzles.has(first?.id ?? "")).toBe(true);
    expect(first?.href).toBe(`#/study/${id}/ontology/claim-${first?.id}`);
  });
  test('"Olivia" finds the interview passages', () => {
    const passages = kinds("Olivia").filter((e) => e.kind === "passage");
    expect(passages.length).toBeGreaterThan(0);
    expect(passages.some((e) => e.title === "interview-olivia-ward-mentor.txt")).toBe(true);
  });
  test('"command" finds the memo and the claims', () => {
    const hits = kinds("command");
    expect(hits.some((e) => e.kind === "passage" && e.title === "memo-scoring-criteria-revision.txt")).toBe(true);
    expect(hits.some((e) => e.kind === "claim")).toBe(true);
  });
  test("at most eight results in a group", () => {
    for (const q of ["Olivia", "command", "the"]) {
      const counts = new Map<string, number>();
      for (const e of kinds(q)) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
      for (const n of counts.values()) expect(n).toBeLessThanOrEqual(8);
    }
  });
});
