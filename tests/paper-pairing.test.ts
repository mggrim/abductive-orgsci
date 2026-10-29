/**
 * Which uploaded file a typed line names (M35, D4).
 *
 * The walk, 2026-09-09. The line "Battilana and Dorado 2010, Building
 * sustainable hybrid organizations, AMJ" rendered as "doesn't fit, uploaded as
 * cohen-hilligoss-2010.pdf", with no expectation under it and no way to add
 * one, on a study whose record holds that line's own verdict: `battilana 2010`,
 * fits, one expectation. Nothing about those two papers is the same. What they
 * share is the year, and the year was a token like any other, so one match on
 * "2010" was a pairing.
 *
 * What that cost on screen. The line took the file's key, so it drew the file's
 * verdict and the file's empty expectations instead of its own.
 * `lineNamesDocument` read the line as answered by an upload, so `papersToRead`
 * dropped it and the paper stopped being counted, judged or read. The Design
 * page was one paper and one expectation short, and a researcher looking at the
 * row could see nothing wrong with their own typing.
 *
 * The rule these tests hold: a pairing rests on at least one word that says
 * which paper this is. A year is not one of those, and neither is a word every
 * title contains. The year stays as what it was already good for, which is
 * telling two papers by the same authors apart and refusing a pairing outright
 * when the two disagree.
 */

import { describe, expect, test } from "bun:test";
import type { StoredDocument } from "../src/state/chunks.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const { bestNamedDocument, lineNamesDocument, papersToRead } = await import(
  `${SRC}proposals/theory.ts`
);

const doc = (name: string): StoredDocument =>
  ({
    id: `d-${name}`,
    projectId: "p",
    name,
    kind: "literature",
    createdAt: 1,
    chunkCount: 1,
  }) as StoredDocument;

const chunk = (docName: string) =>
  ({
    id: `c-${docName}`,
    projectId: "p",
    documentId: `d-${docName}`,
    kind: "literature",
    text: "a passage",
    index: 0,
  }) as never;

const BATTILANA = "Battilana and Dorado 2010, Building sustainable hybrid organizations, AMJ";
const COHEN = "cohen-hilligoss-2010.pdf";

describe("a shared year is not a pairing", () => {
  test("the walk's line and the walk's file name nothing in common but 2010", () => {
    expect(bestNamedDocument(BATTILANA, [doc(COHEN)])).toBeUndefined();
    expect(lineNamesDocument(BATTILANA, COHEN)).toBe(false);
  });

  test("the line comes back to the reading list with a paper of its own", () => {
    /* The consequence the researcher sees. While the line was read as answered
     * by that upload it was not a paper: not counted on Design, not judged when
     * the papers arrived, and not read. */
    const papers = papersToRead({
      documents: [doc(COHEN)],
      chunks: [chunk(COHEN)],
      typedList: BATTILANA,
    });
    expect(papers.map((p: { readonly name: string }) => p.name)).toEqual([COHEN, BATTILANA]);
  });

  test("a file whose name is only a year pairs with nothing at all", () => {
    // There is no word in it that says which paper it is.
    expect(bestNamedDocument("Battilana and Dorado 2010", [doc("2010.pdf")])).toBeUndefined();
  });
});

describe("what a pairing does rest on", () => {
  test("a surname the line carries pairs, as it always has", () => {
    expect(bestNamedDocument("Bechky 2003 sharing meaning", [doc("bechky-2003.pdf")])?.name).toBe(
      "bechky-2003.pdf",
    );
    expect(lineNamesDocument("Bechky 2003 sharing meaning", "bechky-2003.pdf")).toBe(true);
  });

  test("a file with no year in its name still pairs on the name", () => {
    expect(bestNamedDocument("Thorp 2019 on the mathematics of the bet", [doc("thorp.pdf")])?.name)
      .toBe("thorp.pdf");
  });

  test("the same surname with a different year does not pair", () => {
    expect(bestNamedDocument("Bechky 2003 sharing meaning", [doc("bechky-2006.pdf")])).toBeUndefined();
    expect(lineNamesDocument("Bechky 2003 sharing meaning", "bechky-2006.pdf")).toBe(false);
    /* And the two halves agree about it, which they did not before: the loose
     * matcher had no year filter at all, so `papersToRead` dropped a line that
     * the row it drew then said no file answered to. */
    const papers = papersToRead({
      documents: [doc("bechky-2006.pdf")],
      chunks: [chunk("bechky-2006.pdf")],
      typedList: "Bechky 2003 sharing meaning",
    });
    expect(papers.map((p: { readonly name: string }) => p.name)).toEqual([
      "bechky-2006.pdf",
      "Bechky 2003 sharing meaning",
    ]);
  });

  test("the year still separates two papers by the same people", () => {
    // What the year is for, and all it is for. Both files carry both surnames.
    const files = [doc("cohen-hilligoss-2010.pdf"), doc("hilligoss-cohen-2013.pdf")];
    expect(bestNamedDocument("Hilligoss and Cohen 2013, between-unit handoffs", files)?.name).toBe(
      "hilligoss-cohen-2013.pdf",
    );
    expect(bestNamedDocument("Cohen and Hilligoss 2010, handoffs in hospitals", files)?.name).toBe(
      "cohen-hilligoss-2010.pdf",
    );
  });

  test("a word every title carries is not evidence either", () => {
    /* "the" and "and" survive the three-letter floor, so a file named after its
     * title matched any line with an "and" in it. Same defect as the year, one
     * vocabulary over. */
    expect(
      bestNamedDocument("Battilana and Dorado 2010, hybrid organizations", [
        doc("the-published-literature-on-handoffs.pdf"),
      ]),
    ).toBeUndefined();
    // And the words of that title still pair it with the line that names it.
    expect(
      bestNamedDocument("Cohen and Hilligoss 2010, the published literature on handoffs", [
        doc("the-published-literature-on-handoffs.pdf"),
      ])?.name,
    ).toBe("the-published-literature-on-handoffs.pdf");
  });
});
