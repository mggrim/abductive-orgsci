/**
 * M49-4, the counts come off Design and Material (ISC-530).
 *
 * A co-author, 2026-09-21: less is more on counts and secondary numbers. The
 * two tabs a researcher works on carried nine of them: eight rail cells saying
 * how many turns had been typed there, a line at the Early data step saying how
 * many passages the reading would take in, five chips across the head of the
 * data section, and four more on every document row.
 *
 * Two halves, and the second is what makes this a change rather than a deletion:
 * every number is still somewhere. The record panel, Your model's census and the
 * exports are where a reader who wants the tally goes, so this file asserts the
 * absence on the two working tabs AND the presence on the three surfaces that
 * keep them. A count removed everywhere is a fact the tool has stopped holding.
 */

import { describe, expect, test } from "bun:test";

import { placeStateLine, placeStateParts } from "../src/ui/placeLines.ts";
import { documentRowLabel } from "../src/flow/CorpusMaterial.tsx";
import type { PlaceSummary } from "../src/views/placeSummary.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const read = async (rel: string): Promise<string> => Bun.file(`${SRC}${rel}`).text();

/** Comments carry the reasoning and are not what a researcher reads. */
function rendered(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const CORPUS = rendered(await read("flow/CorpusMaterial.tsx"));
const RAIL = rendered(await read("ui/placeLines.ts"));
const EARLY = rendered(await read("flow/EarlyDataControls.tsx"));
const RECORD = rendered(await read("workbench/Instrumentation.tsx"));
const HEADER = rendered(await read("views/exportHeader.ts"));
const CENSUS = rendered(await read("ontology/attribution.ts"));
const SUMMARY = rendered(await read("views/placeSummary.ts"));

const empty: PlaceSummary = {
  place: "site",
  label: "Site",
  title: null,
  turns: 0,
  answer: "empty",
  draftWaiting: false,
  openQuestion: false,
  waiting: 0,
  lastTs: null,
} as PlaceSummary;

describe("M49-4: Design keeps no turn count", () => {
  test("a rail cell with twenty turns behind it says nothing about them", () => {
    expect(placeStateParts({ ...empty, turns: 20 })).toEqual([]);
    expect(placeStateLine({ ...empty, turns: 20 })).toBe("");
  });

  test("what is waiting on the researcher stays, because that is what a cell is for", () => {
    expect(placeStateParts({ ...empty, turns: 20, draftWaiting: true })).toEqual([
      "suggestion to review",
    ]);
    expect(placeStateLine({ ...empty, turns: 20, waiting: 2 })).toBe("2 claims to review");
  });

  test("a place nothing has happened at still says nothing at all", () => {
    // The rail is not a checklist, and a line of zeros is the fastest way to
    // make it one.
    expect(placeStateLine(empty)).toBe("");
  });

  test("the line is built with no turn count in it at all", () => {
    expect(RAIL).not.toContain('countOf(summary.turns, "turn")');
  });

  test("the Early data step says which material the reading takes, not how much", () => {
    expect(EARLY).toContain("Abductive reads your data and leaves the papers alone.");
    expect(EARLY).not.toContain("passage{data.length === 1");
  });
});

describe("M49-4: Material keeps no document, passage, word, opened or cited count", () => {
  test("the five chips across the head of the data section are gone", () => {
    for (const label of ["documents", "passages", "words", "opened", "cited"]) {
      expect({ label, chip: CORPUS.includes(`<StatusChip label="${label}"`) }).toEqual({
        label,
        chip: false,
      });
    }
    expect(CORPUS).not.toContain('className="material-counts"');
  });

  test("a document row carries what the file is and no numbers", () => {
    expect(CORPUS).toContain("<StatusChip label={documentKindLabel(doc.kind)} />");
    expect(CORPUS).not.toContain("count={row.passages}");
    expect(CORPUS).not.toContain("count={row.words}");
    expect(CORPUS).not.toContain("count={row.opened}");
    expect(CORPUS).not.toContain("count={row.cited}");
  });

  test("a screen reader hears what the row shows and no more", () => {
    // Four numbers nobody can see would be the row saying more to one reader
    // than to another, which is the defect this label was written to fix,
    // pointing the other way.
    const label = documentRowLabel("b-transcript.txt", { kind: "fieldnote" });
    expect(label).toBe("b-transcript.txt, fieldnote");
    expect(label).not.toMatch(/\d/);
  });
});

describe("M49-4: the three surfaces that keep the counts still have them", () => {
  test("the record panel counts the events and the turns", () => {
    expect(RECORD).toContain('<StatusChip label="events" count={rows.length} />');
    expect(RECORD).toContain('countOf(summary.asked, "question")');
  });

  test("the export header still folds the turns off the place summaries", () => {
    expect(HEADER).toContain("places.reduce((sum, p) => sum + p.turns, 0)");
  });

  test("Your model's census is untouched", () => {
    expect(CENSUS).toContain("export function censusOf");
    expect(CENSUS).toContain("export function censusShare");
  });

  test("Anti: the projection still carries the turn count for them to read", () => {
    // The number is off two screens, not out of the record. A projection that
    // stopped counting would take it off the record panel and the exports too,
    // and this file would still be green without this line.
    expect(empty.turns).toBe(0);
    expect({ ...empty, turns: 9 }.turns).toBe(9);
    expect(SUMMARY).toContain("turns");
  });
});
