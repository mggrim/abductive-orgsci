/**
 * The typed reading list, rendered (walk item 4 addendum).
 *
 * The live check found four lines in the box and two rows on the page, and read
 * one of the two as the start of one line with the tail of another spliced onto
 * it. Driven here through the real section, with exactly that four-line value:
 * long lines carrying commas, colons and parentheses, one with no journal, and
 * two of the four uploaded as files.
 *
 * What produced two rows was not a parser. It was a filter: a line naming an
 * uploaded file was dropped, on the rule that a paper is named once. Every line
 * renders now, and the one with a file behind it says which file.
 *
 * The splice does not reproduce. The rendered name of each row is its own line,
 * asserted below character for character.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;

const { SeminalCorpus } = await import(`${SRC}flow/SeminalCorpus.tsx`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const projects = await import(`${SRC}state/projects.ts`);

const P = "typed-rows";
const LINES = [
  "Bechky 2003, Sharing meaning across occupational communities: the transformation of understanding on a production floor (Organization Science)",
  "Cohen and Hilligoss 2010, The published literature on handoffs in hospitals: deficiencies identified in an extensive review (Quality and Safety in Health Care)",
  "Grodal and Schildt 2026, Abductive qualitative research with LLMs",
  "Hilligoss and Cohen 2013, The unappreciated challenges of between-unit handoffs: negotiating and coordinating across boundaries (Annals of Emergency Medicine)",
];

const doc = (id: string, name: string) => ({
  id,
  projectId: P,
  name,
  kind: "literature",
  createdAt: 1,
  chunkCount: 2,
});
const chunk = (id: string, documentId: string, index: number) => ({
  id,
  projectId: P,
  documentId,
  kind: "literature",
  text: "a passage",
  index,
});

async function render(node: unknown) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node as never);
  });
  for (let i = 0; i < 20; i += 1) {
    await act(async () => {
      await wait(5);
    });
    if (host.querySelector('[data-testid="typed-misfits"]') !== null) break;
  }
  return { host, root };
}

describe("the typed list, rendered", () => {
  test("every line renders, and each row's name is its own line", async () => {
    await projects.saveProject({
      id: P,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: {
        ...projects.emptyBrief(),
        researchQuestion: "expected a point, found a drift",
        seminalCorpus: LINES.join("\n"),
      },
    } as never);

    const { host, root } = await render(
      React.createElement(
        StrictMode as never,
        null,
        React.createElement(
          LedgerProvider as never,
          { store: new InMemoryLedgerStore() } as never,
          React.createElement(SeminalCorpus as never, {
            projectId: P,
            documents: [doc("d1", "cohen-hilligoss-2010.pdf"), doc("d2", "hilligoss-cohen-2013.pdf")],
            chunks: [chunk("c1", "d1", 0), chunk("c2", "d2", 0)],
            onAdded: () => {},
          } as never),
        ),
      ),
    );

    const names = [...host.querySelectorAll('[data-testid^="typed-line-"]')].map(
      (row) => row.querySelector(".corpus-doc-name")?.textContent ?? "",
    );
    /* Four lines, four rows, on the owner's call after checking it live. Each
     * row's name is its own line, whole, with nothing of its neighbour in it. */
    expect(names).toEqual(LINES);
    for (const name of names) expect(LINES).toContain(name);

    // The two with files behind them say so, and the two without do not.
    const uploaded = [...host.querySelectorAll('[data-testid^="typed-upload-"]')].map(
      (chip) => chip.textContent ?? "",
    );
    expect(uploaded).toEqual([
      "uploaded as cohen-hilligoss-2010.pdf",
      "uploaded as hilligoss-cohen-2013.pdf",
    ]);

    // And the files keep their own rows above, with their passage counts.
    const docNames = [...host.querySelectorAll('[data-testid^="literature-doc-"]')].map(
      (row) => row.querySelector(".corpus-doc-name")?.textContent ?? "",
    );
    expect(docNames).toEqual(["cohen-hilligoss-2010.pdf", "hilligoss-cohen-2013.pdf"]);
    root.unmount();
  });

  test("a blank line between two papers makes no row", async () => {
    const id = `${P}-blanks`;
    await projects.saveProject({
      id,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: {
        ...projects.emptyBrief(),
        researchQuestion: "expected a point, found a drift",
        seminalCorpus: `${LINES[0]}\r\n\r\n   \r\n${LINES[2]}\n`,
      },
    } as never);
    const { host, root } = await render(
      React.createElement(
        LedgerProvider as never,
        { store: new InMemoryLedgerStore() } as never,
        React.createElement(SeminalCorpus as never, {
          projectId: id,
          documents: [],
          chunks: [],
          onAdded: () => {},
        } as never),
      ),
    );
    const names = [...host.querySelectorAll('[data-testid^="typed-line-"]')].map(
      (row) => row.querySelector(".corpus-doc-name")?.textContent ?? "",
    );
    expect(names).toEqual([LINES[0] as string, LINES[2] as string]);
    root.unmount();
  });
});

describe("one paper, one reason", () => {
  test("a line with a file behind it leaves the sentence to the file's row", async () => {
    /* Reported live: the Hilligoss and Cohen 2013 row printed its reason twice.
     * Not two verdicts, which last-wins already settles: two rows. The line and
     * the file key on the same document, so both printed the same sentence and
     * the paper read as judged twice. The line keeps the chips and the file's
     * row keeps the sentence. */
    const id = `${P}-dupe`;
    const line =
      "Hilligoss and Cohen 2013, The unappreciated challenges of between-unit handoffs (Annals of Emergency Medicine)";
    await projects.saveProject({
      id,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: {
        ...projects.emptyBrief(),
        researchQuestion: "expected a point, found a drift",
        seminalCorpus: line,
      },
    } as never);
    const store = new InMemoryLedgerStore();
    let n = 0;
    const verdict = (ts: number, reason: string) =>
      ({
        id: `bbbbbbbb-9999-4999-8999-${String((n += 1)).padStart(12, "0")}`,
        ts,
        actor: "system",
        projectId: id,
        type: "paper-fit",
        paperKey: "d2",
        paperName: "hilligoss-cohen-2013.pdf",
        verdict: "fits",
        reason,
        framingDigest: "d",
        // M33 fix: fully judged, so the row shows its verdict rather than the
        // sentence about a paper nobody has asked what it expects.
        baselines: [],
      }) as never;
    // Two verdicts for one paper, as the study had before the one-loop fix.
    await store.append(verdict(100, "an earlier sentence about this paper"));
    await store.append(verdict(200, "the sentence this paper now carries"));

    const { host, root } = await render(
      React.createElement(
        LedgerProvider as never,
        { store } as never,
        React.createElement(SeminalCorpus as never, {
          projectId: id,
          documents: [doc("d2", "hilligoss-cohen-2013.pdf")],
          chunks: [chunk("c1", "d2", 0)],
          onAdded: () => {},
        } as never),
      ),
    );

    const said = (host.textContent ?? "").replace(/\s+/g, " ");
    const times = (needle: string) => said.split(needle).length - 1;
    // The latest verdict, once. The earlier one is on the record and not on the
    // screen: last wins per paper, which `paperVerdicts` already did.
    expect(times("the sentence this paper now carries")).toBe(1);
    expect(times("an earlier sentence about this paper")).toBe(0);
    // And the line still says the tool matched it and what it found.
    expect(said).toContain("uploaded as hilligoss-cohen-2013.pdf");
    // M51, ISC-533: the chip says the paper has been read, and never how it fared.
    expect(said).toContain("Read");
    expect(said).not.toContain("fits your setting");
    root.unmount();
  });

  test("a line with no file behind it keeps its own sentence", async () => {
    const id = `${P}-typed-only`;
    await projects.saveProject({
      id,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: {
        ...projects.emptyBrief(),
        researchQuestion: "expected a point, found a drift",
        seminalCorpus: "Grodal and Schildt 2026, Abductive qualitative research with LLMs",
      },
    } as never);
    const store = new InMemoryLedgerStore();
    await store.append({
      id: "bbbbbbbb-9999-4999-8999-000000000099",
      ts: 100,
      actor: "system",
      projectId: id,
      type: "paper-fit",
      paperKey: "grodal 2026",
      paperName: "Grodal and Schildt 2026",
      verdict: "misfit",
      reason: "it makes no prediction about a setting like yours",
      framingDigest: "d",
      // M33 fix: a misfit is allowed no expectations, and an empty list is the
      // answer rather than the absence of one.
      baselines: [],
    } as never);
    const { host, root } = await render(
      React.createElement(
        LedgerProvider as never,
        { store } as never,
        React.createElement(SeminalCorpus as never, {
          projectId: id,
          documents: [],
          chunks: [],
          onAdded: () => {},
        } as never),
      ),
    );
    const said = (host.textContent ?? "").replace(/\s+/g, " ");
    /* M51, ISC-533. The line used to print the judge's own sentence about a
       paper it could not place, which is the dismissal a co-author read. The row
       carries the question now, and the sentence reaches nobody. */
    expect(said).not.toContain("it makes no prediction about a setting like yours");
    expect(said).toContain("How does this paper relate to your setting?");
    root.unmount();
  });
});
