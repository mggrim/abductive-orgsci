/**
 * The Material and Exports surfaces (MAT round two).
 *
 * Three properties, each of them a defect the previous round shipped.
 *
 * The receipt has to be checkable by someone who does not have Abductive. That is
 * the whole point of it: NVivo leaves a receipt and we left none, so a
 * researcher who submitted a design in March had no way to show later which
 * version of it they submitted. The stamp is the claim, so the stamp is what
 * gets held here: deterministic for one history, different for any other.
 *
 * The attention layer has to actually capture. `attachChunkObservers` matches
 * `details.chunk[data-chunk-id]` and listens for `toggle`; CorpusMaterial had
 * been rendering `<li class="chunk" data-chunk-id>` since the panel split, so
 * the one surface built to feed the human layer fed it nothing while the page
 * above it claimed in words that opening a passage was recorded. The selector
 * is read out of capture.ts rather than restated, so moving one and not the
 * other fails here rather than in silence.
 *
 * And the tab called Material has to let you add material. It did not.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import {
  buildExportReceipt,
  byteLength,
  formatBytes,
  ledgerStamp,
  type ExportTake,
} from "../src/workbench/ExportBar.tsx";
import {
  documentRowLabel,
  openedChunkIds,
  passageRowLabel,
  wordCount,
} from "../src/flow/CorpusMaterial.tsx";
import {
  CORPUS_SHOWS,
  CORPUS_SORTS,
  corpusView,
  corpusViewNote,
} from "../src/flow/corpusView.ts";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const MATERIAL = await Bun.file(`${SRC}flow/CorpusMaterial.tsx`).text();
/* M46. The passage itself is drawn by `flow/Passage.tsx` now, so Your model's
 * pane and this tab cannot come apart about what a passage looks like. The two
 * probes below read the markup where the markup is; what they assert about it is
 * unchanged, and both are still the same defects they were written for. */
const PASSAGE = await Bun.file(`${SRC}flow/Passage.tsx`).text();
const CAPTURE = await Bun.file(`${SRC}attention/capture.ts`).text();

function ev(id: string, over: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    id,
    ts: 1,
    actor: "human",
    projectId: "p1",
    type: "attention",
    layer: "human",
    chunkId: `chunk-${id}`,
    ...over,
  } as LedgerEvent;
}

describe("the ledger stamp is a receipt anyone can recompute", () => {
  test("the same history stamps the same, every time", () => {
    const history = [ev("a"), ev("b"), ev("c")];
    expect(ledgerStamp(history)).toBe(ledgerStamp([...history]));
  });

  test("appending one event moves it", () => {
    const before = [ev("a"), ev("b")];
    expect(ledgerStamp([...before, ev("c")])).not.toBe(ledgerStamp(before));
  });

  test("a reordered history is a different history", () => {
    // The ledger is append-only, so two ledgers holding the same events in a
    // different order are not the same design and must not stamp alike.
    expect(ledgerStamp([ev("a"), ev("b")])).not.toBe(ledgerStamp([ev("b"), ev("a")]));
  });

  test("two ids do not hash as their concatenation", () => {
    // The collision the construction invites, and the reason there is a
    // separator byte between ids. Without it these two are the same stamp and
    // a receipt could match a ledger it did not come from.
    expect(ledgerStamp([ev("ab"), ev("c")])).not.toBe(ledgerStamp([ev("a"), ev("bc")]));
  });

  test("it is eight hex characters, including for an empty ledger", () => {
    expect(ledgerStamp([])).toMatch(/^[0-9a-f]{8}$/);
    expect(ledgerStamp([ev("a")])).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("the receipt file says what left and when", () => {
  const taken: readonly ExportTake[] = [
    { at: 1_700_000_000_000, name: "study-memo.md", bytes: 4608, stamp: "abcd1234", events: 44 },
    { at: 1_700_000_060_000, name: "study-ledger.json", bytes: 25_301, stamp: "abcd1234", events: 44 },
  ];

  test("every file taken appears, with its size and its stamp", () => {
    const md = buildExportReceipt({
      title: "Handoffs on the night ward",
      stamp: "abcd1234",
      events: 44,
      taken,
      at: 1_700_000_120_000,
    });
    for (const take of taken) {
      expect(md).toContain(take.name);
      expect(md).toContain(String(take.bytes));
    }
    expect(md).toContain("abcd1234");
    expect(md).toContain("Handoffs on the night ward");
  });

  test("it explains how to check the stamp, since that is the only claim it makes", () => {
    const md = buildExportReceipt({ title: "S", stamp: "0", events: 0, taken: [], at: 0 });
    expect(md).toContain("recompute");
    expect(md).toContain("FNV-1a");
  });

  test("an empty receipt is still a table and still a valid file", () => {
    const md = buildExportReceipt({ title: "S", stamp: "0", events: 0, taken: [], at: 0 });
    expect(md).toContain("| --- |");
    expect(md).toContain("your first export is still to come");
  });

  test("no em dash or en dash reaches the file", () => {
    const md = buildExportReceipt({
      title: "Handoffs",
      stamp: "abcd1234",
      events: 44,
      taken,
      at: 0,
    });
    expect(md).not.toMatch(/[—–]/);
  });
});

describe("a size is stated in bytes the file actually weighs", () => {
  test("multi-byte characters count as what they cost on disk", () => {
    // `.length` is code units. A receipt claiming 3 bytes for a 6-byte file is
    // a receipt that cannot be checked against the file it describes.
    expect(byteLength("é…x")).toBe(6);
    expect("é…x".length).toBe(3);
  });

  test("the unit changes at the thresholds and never lies about the magnitude", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 kB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });
});

describe("opened passages are read off the ledger, not off the page", () => {
  test("only attention events count, and only for this study", () => {
    const events = [
      ev("a"),
      ev("b", { projectId: "other" }),
      ev("c", { type: "response" } as Partial<LedgerEvent>),
    ];
    const opened = openedChunkIds(events, "p1");
    expect([...opened]).toEqual(["chunk-a"]);
  });

  test("a passage opened twice is one passage", () => {
    const twice = [ev("a"), ev("b", { chunkId: "chunk-a" })];
    expect(openedChunkIds(twice, "p1").size).toBe(1);
  });

  test("nothing opened is an empty set, not an absent one", () => {
    expect(openedChunkIds([], "p1").size).toBe(0);
  });
});

describe("word count is rough and says so", () => {
  test("whitespace runs, and an empty passage is zero rather than one", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   \n  ")).toBe(0);
    expect(wordCount("one two  three\nfour")).toBe(4);
  });
});

describe("the human attention layer has something to observe (MAT-01)", () => {
  test("the selector capture.ts matches is the selector the surface renders", () => {
    const selector = /closest\("([^"]+)"\)/.exec(CAPTURE)?.[1] ?? "";
    expect(selector).toBe("details.chunk[data-chunk-id]");
    // A <details> carrying both, which is what fires `toggle` and what the
    // selector reaches. The li form matched neither and shipped for a wave.
    expect(PASSAGE).toMatch(/<details[\s\S]{0,300}className="chunk"/);
    expect(PASSAGE).toMatch(/data-chunk-id=\{chunk\.id\}/);
  });

  test("Anti: the check would have failed on the markup that shipped", () => {
    const shipped = '<li key={chunk.id} data-chunk-id={chunk.id} className="chunk">';
    expect(/<details[\s\S]{0,300}className="chunk"/.test(shipped)).toBe(false);
  });

  test("no passage is rendered as a list item any more", () => {
    expect(MATERIAL).not.toContain('<li key={chunk.id}');
  });
});

describe("the tab called Material lets you add material (MAT-02)", () => {
  test("the surface owns an upload control, not a pointer to another tab", () => {
    expect(MATERIAL).toContain('type="file"');
    expect(MATERIAL).toContain("ingestFile");
    expect(MATERIAL).toContain('data-testid="material-upload"');
  });

  test("adding a file never spends a model call", () => {
    // The split that keeps this honest: ingest writes to storage, extraction
    // spends inference and stays at the station that explains it. A model call
    // reaching this file is the regression.
    expect(MATERIAL).not.toContain("extractProposals");
    expect(MATERIAL).not.toContain("activeInferenceClient");
  });

  test("the page rereads the corpus after an upload rather than waiting for a ledger event", () => {
    // Uploading appends nothing, so the workbench's events-length refetch never
    // fires and the corpus a researcher just added stayed invisible.
    const views = Bun.file(`${SRC}ui/StudyViews.tsx`);
    return views.text().then((text) => {
      expect(text).toContain("onAdded={reread}");
      expect(text).toContain("listChunks(projectId)");
    });
  });
});

/**
 * Finding something in the corpus (MAT-03, round three).
 *
 * The critic's third failure: /material offered no search, no sort, no filter
 * and no grouping over a list that is two documents on the fixture and forty in
 * a study. ATLAS.ti 25's Document Manager ships list and treemap views,
 * hierarchical folders, grouping by five keys and a filter panel; NVivo 15 has
 * a Find Bar under the ribbon. The property held here is the one that made the
 * first two rounds of this pair fail, applied to a third surface: the counts
 * printed beside a control are produced by the same call that produces what the
 * control shows, so they cannot disagree.
 */
describe("the corpus can be searched, filtered and ordered (MAT-03)", () => {
  const docs: readonly StoredDocument[] = [
    { id: "d1", projectId: "p1", name: "ward-night.txt", kind: "transcript", createdAt: 2, chunkCount: 3 },
    { id: "d2", projectId: "p1", name: "notes-a.md", kind: "fieldnote", createdAt: 1, chunkCount: 1 },
  ];
  const chunk = (id: string, documentId: string, index: number, text: string): Chunk => ({
    id,
    projectId: "p1",
    documentId,
    kind: documentId === "d1" ? "transcript" : "fieldnote",
    text,
    index,
  });
  const corpus: readonly Chunk[] = [
    chunk("c1", "d1", 0, "The handover begins at ten."),
    chunk("c2", "d1", 1, "Nobody writes the family down."),
    chunk("c3", "d1", 2, "A second handover, quicker."),
    chunk("c4", "d2", 0, "Standing at the desk, watching."),
  ];
  const base = {
    documents: docs,
    chunks: corpus,
    opened: new Set(["c1"]),
    cited: new Set(["c3"]),
    query: "",
    show: "all" as const,
    sort: "added" as const,
    countWords: wordCount,
  };

  test("the whole corpus is the default, and the note says so without saying anything is withheld", () => {
    const view = corpusView(base);
    expect(view.rows).toHaveLength(2);
    expect(view.narrowed).toBe(false);
    expect(corpusViewNote(view)).toBe("Showing 2 of 2 documents and 4 of 4 passages.");
  });

  test("a word in a passage finds the document and opens it", () => {
    const view = corpusView({ ...base, query: "handover" });
    expect(view.rows.map((r) => r.doc.id)).toEqual(["d1"]);
    expect(view.rows[0]?.chunks.map((c) => c.id)).toEqual(["c1", "c3"]);
    // The fold opens on its own, because a hit behind a closed disclosure is
    // not a hit the researcher can see. This is the flag the surface reads.
    expect(view.rows[0]?.hitInText).toBe(true);
    expect(view.passagesShown).toBe(2);
  });

  test("a file name and a kind are searchable, because both are printed on the row", () => {
    expect(corpusView({ ...base, query: "notes-a" }).rows.map((r) => r.doc.id)).toEqual(["d2"]);
    expect(corpusView({ ...base, query: "fieldnote" }).rows.map((r) => r.doc.id)).toEqual(["d2"]);
    // A document matched by name keeps all of its passages rather than none.
    expect(corpusView({ ...base, query: "notes-a" }).rows[0]?.chunks).toHaveLength(1);
  });

  test("the attention facets are the ones no incumbent has", () => {
    const unopened = corpusView({ ...base, show: "unopened" });
    expect(unopened.passagesShown).toBe(3);
    /* `d2` was added first (createdAt 1) and the default order is "as added",
     * which since D18 is by that stamp rather than by the document id. */
    expect(unopened.rows.map((r) => r.doc.id)).toEqual(["d2", "d1"]);
    const opened = corpusView({ ...base, show: "opened" });
    expect(opened.rows.map((r) => r.doc.id)).toEqual(["d1"]);
    expect(opened.rows[0]?.chunks.map((c) => c.id)).toEqual(["c1"]);
    const cited = corpusView({ ...base, show: "cited" });
    expect(cited.rows[0]?.chunks.map((c) => c.id)).toEqual(["c3"]);
    expect(corpusView({ ...base, show: "uncited" }).passagesShown).toBe(3);
  });

  test("a filter and a search compose, because that is the question the two ask together", () => {
    // Where in the material I have not read is that word.
    const view = corpusView({ ...base, query: "handover", show: "unopened" });
    expect(view.rows[0]?.chunks.map((c) => c.id)).toEqual(["c3"]);
    expect(view.passagesShown).toBe(1);
  });

  test("a row states facts about its document and never about the filtered subset", () => {
    // The count defect this pair was sent back for twice, in the shape it would
    // take here: PASSAGES 1 on a row because a search matched one of three.
    const view = corpusView({ ...base, query: "handover" });
    const row = view.rows[0];
    expect(row?.passages).toBe(3);
    expect(row?.opened).toBe(1);
    expect(row?.cited).toBe(1);
    expect(row?.words).toBe(14);
    // What the view is not showing is stated separately, and it adds up.
    expect(row?.withheld).toBe(1);
    expect((row?.chunks.length ?? 0) + (row?.withheld ?? 0)).toBe(row?.passages ?? 0);
  });

  test("the note and the list are one object, so they cannot disagree", () => {
    for (const query of ["", "handover", "notes", "zzz"]) {
      for (const show of ["all", "opened", "unopened", "cited", "uncited"] as const) {
        const view = corpusView({ ...base, query, show });
        const note = corpusViewNote(view);
        expect(note).toContain(`${view.rows.length} of ${view.documentsTotal} document`);
        const shown = view.rows.reduce((n, r) => n + r.chunks.length, 0);
        expect(note).toContain(`${shown} of ${view.passagesTotal} passage`);
        expect(view.passagesShown).toBe(shown);
      }
    }
  });

  test("every order is total, and `added` is by when each document was added", () => {
    /* D18 (M43b). `added` returned 0, which left the rows in the order storage
     * hands them back, which is IndexedDB key order, which is the document id. So
     * "as added" sorted by internal id: the walk of 2026-09-13 added six files in
     * one order and read them back in another that was neither that order nor its
     * reverse. `d2` was added first here (createdAt 1) and comes first. */
    expect(corpusView({ ...base, sort: "added" }).rows.map((r) => r.doc.id)).toEqual(["d2", "d1"]);
    expect(corpusView({ ...base, sort: "name" }).rows.map((r) => r.doc.id)).toEqual(["d2", "d1"]);
    expect(corpusView({ ...base, sort: "kind" }).rows.map((r) => r.doc.id)).toEqual(["d1", "d2"]);
    expect(corpusView({ ...base, sort: "passages" }).rows.map((r) => r.doc.id)).toEqual(["d1", "d2"]);
    expect(corpusView({ ...base, sort: "words" }).rows.map((r) => r.doc.id)).toEqual(["d1", "d2"]);
    expect(corpusView({ ...base, sort: "opened" }).rows.map((r) => r.doc.id)).toEqual(["d1", "d2"]);
    // Sorting is a reordering and never a filter: every order shows the corpus.
    for (const sort of CORPUS_SORTS) {
      expect(corpusView({ ...base, sort: sort.id }).rows).toHaveLength(2);
    }
  });

  test("three documents added out of id order read back in the order they arrived (D18)", () => {
    /* The shape the walk found: ids ascending, added times not. Sorting by id
     * gives d1, d2, d3; the researcher added d3, d1, d2. */
    const out: readonly StoredDocument[] = [
      { id: "d1", projectId: "p1", name: "second.txt", kind: "transcript", createdAt: 200, chunkCount: 1 },
      { id: "d2", projectId: "p1", name: "third.txt", kind: "transcript", createdAt: 300, chunkCount: 1 },
      { id: "d3", projectId: "p1", name: "first.txt", kind: "transcript", createdAt: 100, chunkCount: 1 },
    ];
    const chunks: readonly Chunk[] = out.map((d, i) => ({
      id: `x${i}`,
      projectId: "p1",
      documentId: d.id,
      kind: "transcript" as const,
      text: "a passage",
      index: 0,
    }));
    const view = corpusView({ ...base, documents: out, chunks, sort: "added" });
    expect(view.rows.map((r) => r.doc.id)).toEqual(["d3", "d1", "d2"]);
    // And it is not the reverse either, which is the other thing the walk ruled out.
    expect(view.rows.map((r) => r.doc.id)).not.toEqual(["d2", "d1", "d3"]);
  });

  test("two documents stamped in the same millisecond have a stable order", () => {
    /* A batch picked at once can share a timestamp. The tie breaks on the name
     * rather than on nothing, because falling through to storage order is the
     * defect this fixed. */
    const same: readonly StoredDocument[] = [
      { id: "d1", projectId: "p1", name: "zebra.txt", kind: "transcript", createdAt: 7, chunkCount: 1 },
      { id: "d2", projectId: "p1", name: "aardvark.txt", kind: "transcript", createdAt: 7, chunkCount: 1 },
    ];
    const chunks: readonly Chunk[] = same.map((d, i) => ({
      id: `y${i}`,
      projectId: "p1",
      documentId: d.id,
      kind: "transcript" as const,
      text: "a passage",
      index: 0,
    }));
    const ids = () => corpusView({ ...base, documents: same, chunks, sort: "added" }).rows.map((r) => r.doc.id);
    expect(ids()).toEqual(["d2", "d1"]);
    expect(ids()).toEqual(ids());
  });

  test("nothing about a filter reads as the tool withholding material", () => {
    const gating = /until you|before you can|you must|required|not allowed|blocked|locked|hidden|excluded|removed/i;
    const strings = [
      corpusViewNote(corpusView(base)),
      corpusViewNote(corpusView({ ...base, query: "handover" })),
      ...CORPUS_SHOWS.map((s) => s.label),
      ...CORPUS_SORTS.map((s) => s.label),
    ];
    for (const s of strings) {
      expect(s).not.toMatch(gating);
      expect(s).not.toMatch(/[—–]/);
    }
    // And the narrowed sentence says where the rest of the corpus went.
    expect(corpusViewNote(corpusView({ ...base, query: "handover" }))).toContain(
      "Everything is still in the project",
    );
  });

  test("the surface renders the controls and reads its list off the view", () => {
    expect(MATERIAL).toContain('data-testid="corpus-find-input"');
    expect(MATERIAL).toContain('data-testid="corpus-show"');
    expect(MATERIAL).toContain('data-testid="corpus-sort"');
    expect(MATERIAL).toContain("view.rows.map");
    // The old accordion is gone: one open document at a time is a reasonable
    // default on a list of two and the wrong one on a list of forty.
    expect(MATERIAL).not.toContain("openDoc === doc.id");
  });
});

describe("a fold says what it is, to a pointer and to a screen reader (MAT-04)", () => {
  test("a document row is read as facts and not as one run-on token", () => {
    // What the browser computed from the row before this existed:
    // "b-transcript.txtfieldnotepassages1words7opened1cited0". Five chips, no
    // separator between a label and its number or between one chip and the
    // next, on the surface whose whole content is those chips.
    //
    // M49 (ISC-530): four of those five chips came off the row, so they came off
    // the spoken name with them. The property this test holds is unchanged and
    // is the reason the function exists: what the row shows is what the row
    // says, with a separator between the facts, opening on the file name.
    const label = documentRowLabel("b-transcript.txt", { kind: "fieldnote" });
    expect(label).toBe("b-transcript.txt, fieldnote");
    // The spoken name opens with the visible one, so the two do not part company.
    expect(label.startsWith("b-transcript.txt")).toBe(true);
    expect(documentRowLabel("a.txt", { kind: "transcript" })).toBe("a.txt, transcript");
  });

  test("a passage is read as its number, its state and its line", () => {
    expect(passageRowLabel(0, "Night handover on the ward.", { opened: true, cited: false })).toBe(
      "Passage 0, opened. Night handover on the ward.",
    );
    expect(passageRowLabel(3, "A line.", { opened: true, cited: true })).toBe(
      "Passage 3, opened and cited. A line.",
    );
    // Nothing read yet is not a state with a word for it, so the label has none.
    expect(passageRowLabel(1, "A line.", { opened: false, cited: false })).toBe(
      "Passage 1. A line.",
    );
  });

  test("both folds carry the label, and neither carries a dash", () => {
    expect(MATERIAL).toContain("aria-label={documentRowLabel(");
    expect(PASSAGE).toContain("aria-label={passageRowLabel(");
    for (const label of [
      documentRowLabel("a.txt", { kind: "memo" }),
      passageRowLabel(0, "A line.", { opened: true, cited: true }),
    ]) {
      expect(label).not.toMatch(/[\u2014\u2013]/);
    }
  });
});
