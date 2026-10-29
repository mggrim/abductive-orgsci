/**
 * M74b, ISC-664: a Literatures answer is literatures, never a paper (the walk's
 * finding 5).
 *
 * The student answered the Literatures question with "I think there's stuff on
 * volunteering? and craft? My supervisor sent me a paper on each. She also sent
 * one on moral economy, but I'm honestly not sure I understood that one." and
 * Abductive filed the whole answer as one paper, marked it read, wrote "Abductive
 * has no expectations to list from this paper." and raised a bearing flag that
 * stayed open through Checks and the report.
 *
 * The lead's ruling (option B): a typed line is a paper only when it reads as a
 * citation, an author and a year, as `citationKey` detects. A prose answer is
 * literatures. The shipped example keeps its five citation lines.
 *
 * M89 (2026-10-14): the bearing flag the answer once raised left with the
 * checks, and so did the test of which papers it applied to.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { papersToRead, paperRefs, readsAsCitation } from "../src/proposals/theory.ts";
import { paperRows } from "../src/views/paperRows.ts";
import type { StoredDocument, Chunk } from "../src/state/chunks.ts";

const ANSWER =
  "I think there's stuff on volunteering? and craft? My supervisor sent me a paper on each. She also sent one on moral economy, but I'm honestly not sure I understood that one.";
const P = "proj-lit";

const doc: StoredDocument = {
  id: "8d0c5a8e-1111-4222-8333-944444444444",
  projectId: P,
  name: "eliasoph-volunteering.pdf",
  kind: "literature",
  addedAt: 1,
} as unknown as StoredDocument;
const chunk: Chunk = {
  id: "c1",
  documentId: doc.id,
  projectId: P,
  index: 0,
  kind: "literature",
  text: "Volunteers avoid talk of politics.",
} as unknown as Chunk;

describe("the Literatures answer is not a paper", () => {
  test("a citation line reads as a paper, and a prose answer does not", () => {
    expect(readsAsCitation("Hallen 2008, The causes and consequences of the initial network positions of new organizations, ASQ")).toBe(true);
    expect(readsAsCitation("Zuckerman 2017 on genres and puzzles")).toBe(true);
    expect(readsAsCitation("Bechky 2006")).toBe(true);
    expect(readsAsCitation(ANSWER)).toBe(false);
    expect(readsAsCitation("volunteering and craft")).toBe(false);
    expect(readsAsCitation("2019")).toBe(false);
    const both = papersToRead({ documents: [], chunks: [], typedList: `${ANSWER}\nHallen 2008, The causes and consequences, ASQ` });
    expect(both.map((p) => p.name)).toEqual(["Hallen 2008, The causes and consequences, ASQ"]);
  });

  test("no paper row is made from the typed answer, and an uploaded paper still is", () => {
    expect(papersToRead({ documents: [], chunks: [], typedList: ANSWER })).toEqual([]);
    expect(paperRefs({ documents: [], chunks: [], typedList: ANSWER })).toEqual([]);
    expect(paperRows({ events: [], projectId: P, documents: [], chunks: [], typedList: ANSWER })).toEqual([]);
    const withUpload = paperRefs({ documents: [doc], chunks: [chunk], typedList: ANSWER });
    expect(withUpload.map((p) => p.key)).toEqual([doc.id]);
  });
});

describe("Sources says where its papers go", () => {
  const source = readFileSync(new URL("../src/flow/SeminalCorpus.tsx", import.meta.url), "utf8");

  test("the line under Papers names the literatures from Starting point", () => {
    expect(source).toContain("Papers that you add on Sources join the literatures that you identified at Starting point.");
  });

  test("the Paper list stays (ISC-296 to 299), and only its citation lines get rows", () => {
    expect(source).toContain('data-testid="seminal-corpus-input"');
    expect(source).toContain(".filter((line) => readsAsCitation(line))");
  });

  test("the Literatures field says that a citation line becomes a paper on Sources", () => {
    const band = readFileSync(new URL("../src/flow/FramingBand.tsx", import.meta.url), "utf8");
    expect(band).toContain("A line with an author and a year, such as Hallen 2008, becomes a paper on Sources.");
  });
});
