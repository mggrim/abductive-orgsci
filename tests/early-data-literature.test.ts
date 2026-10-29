/**
 * A paper on the reading list is not an answer at Early data (D12, M43).
 *
 * The walk of 2026-09-13 uploaded one PDF to the literature list, never opened
 * the Early data step, and found the rail marking it with a filled dot and the
 * tooltip "Answered". Navigating there showed an empty box
 * and a status chip reading "Empty". On a tool whose pitch is an
 * honest record of who put what where, a step that marks itself answered is the
 * worst kind of defect: it tells a researcher coming back next week that they
 * settled something they never opened.
 *
 * The cause was one number. Early data is the one step whose answer can be the
 * material itself (D5), and the four surfaces that read the corpus to decide
 * that were all handed the whole study's chunk count. A paper is stored as
 * chunks like anything else, so 92 passages of an AMR piece read as 92 passages
 * of fieldwork.
 *
 * `dataOnly` already drew this line for the grounding counts, the staging tray
 * and the modal twin. `dataChunkCount` puts it in front of the four surfaces
 * that decide what the researcher has said, and the scan at the foot of this
 * file holds every one of them to using it, because the type is `number` at each
 * of them and a type cannot.
 */

import { describe, expect, test } from "bun:test";
import { dataChunkCount, ingestText, type Chunk } from "../src/state/chunks.ts";
import { stationStated, stationStates } from "../src/flow/stationBrief.ts";
import { stationById } from "../src/flow/stations.ts";
import { placeSummaries } from "../src/views/placeSummary.ts";
import { emptyBrief, normalizeBrief } from "../src/state/projects.ts";
import { stationProbes, THIN } from "../src/interview/stationProbes.ts";

const PROJECT = "8d0f2a11-3c4e-4a71-9b02-5f6d7e8a9b01";

/** A paper, ingested the way the literature upload ingests one. */
const PAPER = ingestText({
  projectId: PROJECT,
  name: "mcmullen-shepherd-2006.pdf",
  kind: "literature",
  text: [
    "Entrepreneurial action is treated here as a decision under uncertainty, and the",
    "paper argues about knowledge and motivation rather than about any one setting.",
    "",
    "Nothing in it predicts how the evaluators of a cohort allocate their attention,",
    "which is what makes it theory a researcher reads rather than data they collected.",
  ].join("\n"),
});

/** A fieldnote, ingested the way the data upload ingests one. */
const FIELDNOTE = ingestText({
  projectId: PROJECT,
  name: "week-4-office-hours.md",
  kind: "fieldnote",
  text: [
    "Leah Morgan opened with the rehearsed deck and Ravi Patel let it run for four",
    "minutes before he asked what the restaurant said when she turned up in person.",
    "",
    "She froze, then talked about the kitchen porter for six minutes, and he wrote",
    "one word on the printed list beside her name.",
  ].join("\n"),
});

const step = stationById("early-data");

describe("the corpus that stands in for an Early data answer is data (D12)", () => {
  test("a paper's passages are counted as none, a fieldnote's as its own", () => {
    expect(PAPER.chunks.length).toBeGreaterThan(0);
    expect(dataChunkCount(PAPER.chunks)).toBe(0);
    expect(dataChunkCount(FIELDNOTE.chunks)).toBe(FIELDNOTE.chunks.length);
    // Both loaded: the data half is counted and the papers are not.
    expect(dataChunkCount([...PAPER.chunks, ...FIELDNOTE.chunks])).toBe(FIELDNOTE.chunks.length);
  });

  test("one literature PDF and nothing else leaves the step empty", () => {
    const size = dataChunkCount(PAPER.chunks);
    expect(stationStated(emptyBrief(), step, size)).toBe(false);
    expect(stationStates(emptyBrief(), size).get("early-data")).toBe("empty");
    const rows = placeSummaries({
      events: [],
      projectId: PROJECT,
      brief: emptyBrief(),
      dataCorpusSize: size,
    });
    expect(rows.find((r) => r.place === "early-data")?.answer).toBe("empty");
  });

  test("one uploaded fieldnote reads as stated, which is the D5 reading kept", () => {
    const size = dataChunkCount(FIELDNOTE.chunks);
    expect(stationStated(emptyBrief(), step, size)).toBe(true);
    expect(stationStates(emptyBrief(), size).get("early-data")).toBe("stated");
    const rows = placeSummaries({
      events: [],
      projectId: PROJECT,
      brief: emptyBrief(),
      dataCorpusSize: size,
    });
    expect(rows.find((r) => r.place === "early-data")?.answer).toBe("saved");
  });

  test("a typed answer still stands on its own, with only papers loaded", () => {
    const written = normalizeBrief({
      earlySurprise:
        "Nobody in the slot logs treats the written update as evidence after week three, which is not what I expected to find.",
    });
    expect(stationStated(written, step, dataChunkCount(PAPER.chunks))).toBe(true);
  });

  test("the step's own question does not read a paper as material either", () => {
    /* The probe reads the corpus when the box is empty, and "thin" is material
     * loaded and barely opened. With only papers loaded there is no material at
     * all, so the step must ask its empty question rather than its thin one. */
    const withPapers = stationProbes("early-data", emptyBrief(), dataChunkCount(PAPER.chunks), 0, 0);
    const withData = stationProbes("early-data", emptyBrief(), dataChunkCount(FIELDNOTE.chunks), 0, 0);
    expect(withPapers[0]?.question).not.toBe(withData[0]?.question);
    // And the thin reading is the one the data gets, which is what THIN is for.
    expect(THIN).toBeGreaterThan(0);
  });
});

/**
 * The four surfaces, held to the count by their source.
 *
 * Every one of them takes a `number`, so nothing in the type system stops the
 * next builder writing `chunks.length` again. What can be checked is that the
 * expression at each call site is the named one.
 */
describe("every surface that reads the corpus for this step reads the data count", () => {
  const SRC = new URL("../src/", import.meta.url).pathname;

  const CALLERS: readonly { readonly file: string; readonly call: RegExp }[] = [
    // The rail's dot, which is what the walk saw lying.
    { file: "workbench/Workbench.tsx", call: /stationStates\(/ },
    // The Exports header, which folds the eight place summaries.
    { file: "ui/StudyViews.tsx", call: /exportHeader\(/ },
    // The step's own next question.
    { file: "workbench/useWorkbench.ts", call: /chunkCount:/ },
    // The studies list, which has counted data only since D5.
    { file: "ui/ProjectList.tsx", call: /stationStates\(/ },
  ];

  for (const caller of CALLERS) {
    test(`${caller.file} hands it a data-only count`, async () => {
      const text = await Bun.file(SRC + caller.file).text();
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, " ");
      expect(caller.call.test(code)).toBe(true);
      // The whole study's chunk count reaches none of them any more.
      expect(/chunks\.length/.test(code)).toBe(false);
      expect(/dataChunkCount\(|dataOnly\(/.test(code)).toBe(true);
    });
  }

  test("Anti: the scan would catch the defect it is for", () => {
    const before = 'const states = stationStates(brief, wb.chunks.length);';
    expect(/chunks\.length/.test(before)).toBe(true);
    const after = 'const states = stationStates(brief, dataChunkCount(wb.chunks));';
    expect(/chunks\.length/.test(after)).toBe(false);
  });
});

/** A chunk is the thing being counted, so the type is pinned rather than assumed. */
test("a chunk carries the kind the count reads", () => {
  const chunk: Chunk | undefined = PAPER.chunks[0];
  expect(chunk?.kind).toBe("literature");
  expect(FIELDNOTE.chunks[0]?.kind).toBe("fieldnote");
});
