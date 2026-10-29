/**
 * The papers, read for what they expect (M29, spec A1).
 *
 * The mirror of the D5 tests in `literature-kind.test.ts`. Those hold that the
 * extractor never mines a paper for evidence; these hold that the one pass
 * which is allowed to read a paper produces exactly one kind of thing, an
 * expectation stated so the researcher's setting could break it, and that it
 * cannot produce anything else.
 *
 * Three properties are worth stating on their own, because each one is a way
 * the pass could look like it works and be useless:
 *
 *   - One derivation per paper. A claim that belongs to no particular paper
 *     cannot answer "which papers are you actually arguing with", which is the
 *     question the whole feature exists to make answerable.
 *   - Only this paper's passages. A citation reaching into another document is
 *     a claim resting on something nobody handed the model.
 *   - Zero is a legitimate answer. A paper that predicts nothing about this
 *     setting is a finding, and a pass that always produces something would
 *     turn that finding into three sentences of filler.
 *
 * M33: every property above survives and the mechanism under them moved. The
 * one derivation happens on the call that judges a paper on arrival, and this
 * pass stages what that call wrote down. So the tests that asserted a model
 * call per paper now assert one staged draft per baseline, and the tests about
 * citations, ceilings and zero read the same as they did.
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { livePages } from "../src/ontology/schema.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectProposals } from "../src/proposals/projection.ts";
import { adjudicateProposal, resetAdjudicationInFlight } from "../src/proposals/adjudicate.ts";
import {
  MAX_PER_PAPER,
  NO_SOURCE_FILE,
  extractTheoryClaims,
  lineNamesDocument,
  papersToRead,
} from "../src/proposals/theory.ts";
import { BASELINES_ALLOWED, parseBaselines } from "../src/proposals/baselines.ts";
import { readPapersReason } from "../src/flow/SeminalCorpus.tsx";
import { expectationsDrafted, framingExpectationsHref } from "../src/flow/FramingBand.tsx";
import type { Chunk, DocumentKind, StoredDocument } from "../src/state/chunks.ts";

const PROJECT = "proj-theory";

function chunk(id: string, documentId: string, index: number, kind: DocumentKind = "literature"): Chunk {
  return { id, projectId: PROJECT, documentId, kind, text: `passage ${id}`, index };
}

function doc(id: string, name: string, kind: DocumentKind = "literature"): StoredDocument {
  return { id, projectId: PROJECT, name, kind, createdAt: 1, chunkCount: 2 };
}

const THORP = doc("doc-thorp", "thorp.pdf");
const BECHKY = doc("doc-bechky", "bechky-2003.pdf");
const TRANSCRIPT = doc("doc-data", "night-shift.txt", "transcript");

const CHUNKS: readonly Chunk[] = [
  chunk("t1", "doc-thorp", 0),
  chunk("t2", "doc-thorp", 1),
  chunk("b1", "doc-bechky", 0),
  chunk("d1", "doc-data", 0, "transcript"),
];

function makeLedger(initial: readonly LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      for (const e of events) expect(validateEvent(e)).toEqual([]);
      store.push(...events);
    },
    readEvents: async () => [...store],
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  };
}

describe("which papers get read", () => {
  test("every uploaded paper, and every typed line no upload answers to", () => {
    const papers = papersToRead({
      documents: [THORP, BECHKY, TRANSCRIPT],
      chunks: CHUNKS,
      typedList: "Thorp 2019 on the mathematics of the bet\nZuckerman 2017 on genres and puzzles",
    });
    expect(papers.map((p) => p.name)).toEqual([
      "thorp.pdf",
      "bechky-2003.pdf",
      "Zuckerman 2017 on genres and puzzles",
    ]);
    // The uploaded paper carries its own passages, in order. The typed line has
    // none, which is the honest state and not a gap to be filled in.
    expect(papers[0]?.chunks.map((c) => c.id)).toEqual(["t1", "t2"]);
    expect(papers[2]?.chunks).toEqual([]);
  });

  test("the data is not a paper, however many passages it has", () => {
    const papers = papersToRead({ documents: [TRANSCRIPT], chunks: CHUNKS });
    expect(papers).toEqual([]);
  });

  test("a typed line names its file loosely, and the cost of being wrong is one call", () => {
    expect(lineNamesDocument("Thorp 2019 on the bet", "thorp.pdf")).toBe(true);
    expect(lineNamesDocument("Bechky 2003", "bechky-2003.pdf")).toBe(true);
    expect(lineNamesDocument("Zuckerman 2017", "thorp.pdf")).toBe(false);
  });
});

/** A verdict on the record, as `paperVerdicts` returns it. */
const judged = (
  paperKey: string,
  paperName: string,
  baselines: readonly { id: string; expectation: string; scope: string; chunkId?: string }[],
) =>
  [
    paperKey,
    {
      paperKey,
      paperName,
      verdict: "fits" as const,
      reason: "It expects something about a setting like yours.",
      framingDigest: "d",
      model: "m",
      modelVersion: "v",
      baselines,
    },
  ] as const;

const baseline = (id: string, expectation: string, chunkId?: string) => ({
  id,
  expectation,
  scope: "on shift work and not in surgery",
  ...(chunkId === undefined ? {} : { chunkId }),
});

describe("what one paper produces", () => {
  test("one derivation per paper, and the paper's own passages are what it saw", () => {
    /* M33: the passages reach the judge, on arrival, and this pass reads what
     * the judge wrote. The property held here is the one that mattered: what a
     * paper produces belongs to that paper and cites only its own passages. */
    const result = extractTheoryClaims({
      projectId: PROJECT,
      documents: [THORP, BECHKY, TRANSCRIPT],
      chunks: CHUNKS,
      verdicts: new Map([
        judged("doc-thorp", "thorp.pdf", [
          baseline("doc-thorp#0", "Handoffs fail without a question back", "t1"),
        ]),
        judged("doc-bechky", "bechky-2003.pdf", [
          baseline("doc-bechky#0", "Boundaries harden under time pressure", "b1"),
        ]),
      ]),
    });
    expect(result.papersRead).toBe(2);
    expect(result.proposals.map((p) => p.paperKey)).toEqual(["doc-thorp", "doc-bechky"]);
    expect(result.proposals[0]?.sourceChunks).toEqual(["t1"]);
    expect(result.proposals[1]?.sourceChunks).toEqual(["b1"]);
  });

  test("every draft is an expectation, from the papers, written by the reader", () => {
    const result = extractTheoryClaims({
      projectId: PROJECT,
      documents: [THORP],
      chunks: CHUNKS,
      verdicts: new Map([
        judged("doc-thorp", "thorp.pdf", [
          baseline("doc-thorp#0", "Handoffs fail without a question back", "t1"),
        ]),
      ]),
    });
    expect(result.proposals).toHaveLength(1);
    const p = result.proposals[0];
    expect(p?.pageType).toBe("theory");
    expect(p?.originOnAccept).toBe("literature-derived");
    expect(p?.actor).toBe("persona:reader");
    expect(p?.sourceChunks).toEqual(["t1"]);
    // The provenance chain. The model that wrote the sentence is on the
    // `paper-fit` event and travels with it, because a page a model composed
    // has to be able to say which model composed it.
    expect(p?.model).toBe("m");
    for (const e of result.events) expect(validateEvent(e)).toEqual([]);
  });

  test("a citation reaching outside this paper never got onto the record", () => {
    /* M33: the check moved one derivation earlier, to where the citation is
     * read off the model's answer, and the intent is identical. A claim citing
     * another paper, or the researcher's transcript, rests on something nobody
     * put in front of the model. */
    expect(
      parseBaselines(
        [
          "EXPECTS: Handoffs fail without a question back.",
          "SCOPE: on shift work",
          "CITE: [[chunk:b1]]",
        ].join("\n"),
        { paperKey: "doc-thorp", allowed: 3, ownChunks: new Set(["t1", "t2"]) },
      )[0]?.chunkId,
    ).toBeUndefined();
  });

  test("nothing but an expectation with a scope survives the parse", () => {
    // A block with no scope is an expectation with no boundary, which is the
    // half the questioning turns on. Dropped rather than repaired.
    const parsed = parseBaselines(
      [
        "EXPECTS: Refusals go unlogged on the night list.",
        "CITE: [[chunk:t1]]",
        "---",
        "EXPECTS: Handoffs fail without a question back.",
        "SCOPE: on shift work",
        "CITE: [[chunk:t2]]",
      ].join("\n"),
      { paperKey: "doc-thorp", allowed: 3, ownChunks: new Set(["t1", "t2"]) },
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.expectation).toBe("Handoffs fail without a question back.");
  });

  test("three is the ceiling, per paper, and it is one constant", () => {
    expect(MAX_PER_PAPER).toBe(3);
    // The judge writes at most three down, so the staging cannot find a fourth.
    expect(BASELINES_ALLOWED.fits).toBe(MAX_PER_PAPER);
    const four = [1, 2, 3, 4]
      .map((n) => [`EXPECTS: Expectation number ${n}.`, "SCOPE: always", "CITE: [[chunk:t1]]"].join("\n"))
      .join("\n---\n");
    expect(
      parseBaselines(four, { paperKey: "doc-thorp", allowed: MAX_PER_PAPER, ownChunks: new Set(["t1"]) }),
    ).toHaveLength(3);
  });

  test("zero is a legitimate answer and costs the researcher nothing to read", () => {
    const result = extractTheoryClaims({
      projectId: PROJECT,
      documents: [THORP],
      chunks: CHUNKS,
      verdicts: new Map([judged("doc-thorp", "thorp.pdf", [])]),
    });
    expect(result.proposals).toEqual([]);
    /* M33: the reading is still on the record and it is on the `paper-fit`
     * event, where the passages were actually placed in front of a model.
     * Writing retrieval attention here as well would count one reading twice. */
    expect(result.attention).toEqual([]);
  });

  test("an expectation already in the model is not written again", () => {
    const result = extractTheoryClaims({
      projectId: PROJECT,
      documents: [THORP],
      chunks: CHUNKS,
      existingTitles: ["Handoffs fail without a question back"],
      verdicts: new Map([
        judged("doc-thorp", "thorp.pdf", [
          baseline("doc-thorp#0", "Handoffs fail without a question back", "t1"),
        ]),
      ]),
    });
    expect(result.proposals).toEqual([]);
  });

  test("a baseline the researcher turned down is not staged", () => {
    // M33. A decline is an answer, and staging it anyway would put a claim in
    // the tray the researcher has already said the paper does not hold.
    const result = extractTheoryClaims({
      projectId: PROJECT,
      documents: [THORP],
      chunks: CHUNKS,
      declined: new Set(["doc-thorp#0"]),
      verdicts: new Map([
        judged("doc-thorp", "thorp.pdf", [
          baseline("doc-thorp#0", "Handoffs fail without a question back", "t1"),
          baseline("doc-thorp#1", "Boundaries harden under time pressure", "t2"),
        ]),
      ]),
    });
    expect(result.proposals.map((p) => p.title)).toEqual([
      "Boundaries harden under time pressure",
    ]);
  });

  test("a paper with no verdict on the record stages nothing", () => {
    // It arrived before the study was judgeable. The next framing save picks it
    // up; until then there is nothing written down to stage.
    const result = extractTheoryClaims({
      projectId: PROJECT,
      documents: [THORP],
      chunks: CHUNKS,
    });
    expect(result.proposals).toEqual([]);
    expect(result.papersRead).toBe(0);
  });
});

describe("a paper with no file behind it", () => {
  /* M78a, ISC-678: a typed line is Named, and what the model wrote from its
     citation stages nothing; the expectation would be the model's memory of the
     paper. It used to stage with no citation and the NO_SOURCE_FILE line. */
  test("a typed line with no file stages nothing", () => {
    const result = extractTheoryClaims({
      projectId: PROJECT,
      documents: [],
      chunks: [],
      typedList: "Zuckerman 2017 on genres and puzzles",
      verdicts: new Map([
        judged("zuckerman 2017", "Zuckerman 2017 on genres and puzzles", [
          baseline("zuckerman 2017#0", "Proximity is what builds trust"),
        ]),
      ]),
    });
    expect(result.proposals).toEqual([]);
    expect(result.attention).toEqual([]);
    void NO_SOURCE_FILE;
  });

  test("no papers at all, nothing staged at all", () => {
    const result = extractTheoryClaims({
      projectId: PROJECT,
      documents: [TRANSCRIPT],
      chunks: CHUNKS,
      typedList: "  \n\n",
    });
    expect(result.events).toEqual([]);
    expect(result.papersRead).toBe(0);
  });
});

describe("staging a paper's expectations changes nothing until the researcher says so", () => {
  const THORP_VERDICT = new Map([
    judged("doc-thorp", "thorp.pdf", [
      baseline("doc-thorp#0", "Handoffs fail without a question back", "t1"),
    ]),
  ]);

  test("the pass writes proposals and the model stays empty", () => {
    const result = extractTheoryClaims({
      projectId: PROJECT,
      documents: [THORP],
      chunks: CHUNKS,
      verdicts: THORP_VERDICT,
    });
    expect(livePages(projectOntology(result.events, PROJECT))).toHaveLength(0);
    expect(projectProposals(result.events, PROJECT).pending).toHaveLength(1);
    expect(result.events.some((e) => e.type === "ontology-mutation")).toBe(false);
  });

  test("and accepting one puts a claim from the papers into the model", async () => {
    resetAdjudicationInFlight();
    const staged = extractTheoryClaims({
      projectId: PROJECT,
      documents: [THORP],
      chunks: CHUNKS,
      verdicts: THORP_VERDICT,
    });
    const ledger = makeLedger(staged.events);
    const proposalId = projectProposals(staged.events, PROJECT).pending[0]?.id ?? "";
    await adjudicateProposal({ projectId: PROJECT, proposalId, disposition: "accept" }, ledger);
    const created = livePages(projectOntology(ledger.store, PROJECT))[0];
    expect(created?.type).toBe("theory");
    expect(created?.origin).toBe("literature-derived");
  });
});

// ---------------------------------------------------------------------------

/*
 * The two surfaces (M29, R12).
 *
 * The action sits with the papers it reads, on the Material tab, because that
 * is where the researcher is when they have just added one. The Framing band on
 * the Design page says how many expectations came back and links to where they
 * are waiting, because that is where the researcher is when they are thinking
 * about the papers rather than handling them.
 *
 * Several assertions here are source facts rather than render facts, which is
 * the pattern `design-page-m27.test.ts` established for this band: the count is
 * read off the live record through a React effect, and a static render has no
 * effects, so what a render can show is the resting state and not the wired
 * one.
 */
/** Read at module scope; a `describe` body cannot hold a top-level await. */
const LIT_SRC = await Bun.file(new URL("../src/flow/SeminalCorpus.tsx", import.meta.url)).text();
const BAND_SRC = await Bun.file(new URL("../src/flow/FramingBand.tsx", import.meta.url)).text();

/** Comments are addressed to whoever maintains this, and are not the surface. */
const bare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the papers section reads them, and the framing says what came back", () => {

  test("the control names what happens when you press it", () => {
    /* D20 (M43b). It said "Draft what these papers expect", and the walk of
     * 2026-09-13 pressed it for the one paper showing no expectations, on the
     * reading that it would read that paper. It stages every expectation of every
     * paper, so the label says so. */
    expect(bare(LIT_SRC)).toContain("Suggest expectations");
    expect(bare(LIT_SRC)).not.toContain("Draft what these papers expect");
  });

  test("the helper says what the press does, and no longer says what it costs", async () => {
    /* M33: the intent is unchanged and one of its three clauses went with the
     * model call. The helper still has to say what the control does and how
     * much of it there is; it no longer says "One call per paper", because
     * there is no call. Changed on the team lead's authorisation. */
    const src = bare(LIT_SRC);
    // M61: one sentence under the control (decision 6), and it still says what
    // the press does and how much of it there is.
    expect(src).toContain("One press adds one to three expectations per paper to your suggestions");
    expect(src).not.toContain("One call per paper.");
    /* D20 (M43b). "to accept or turn down" read as the controls on each row
     * staying where they are. They go, because an expectation already in the
     * drafts is not one to accept at the row, and the walk read their going as
     * the press having accepted for the researcher. */
    expect(src).toContain("and the buttons on each paper's row go away.");
    // And where the drafts go, which is the one thing a reader has to know
    // before pressing a control that puts something in their tray.
    // M42: the sentence names the draft rather than saying "accept it", which
    // could be read as accepting the model. Matched up to the wrap, like the
    // sentence above it, so a later reflow cannot silently stop this test.
    // M62, ISC-600: the sentence under the helper moved into Sources' Help.
    expect(src).not.toContain("Nothing joins your model until you accept the");
    const help = await Bun.file(new URL("../src/ui/pageHelp.ts", import.meta.url).pathname).text();
    // M63, ISC-614: the object is the ontology.
    expect(help).toContain("A suggestion joins your ontology only when you accept it.");
  });

  test("it states the condition that makes it live, and it is a condition", () => {
    expect(readPapersReason(0)).toBe(
      // M28 r6: copy. Nothing on screen is called "Reading". The note names its
      // own control, the way every other inert note in the product does, and the
      // control was relabelled at D20 (M43b).
      "Identify or upload a paper first.",
    );
    expect(readPapersReason(2)).toBeNull();
    const reason = readPapersReason(0) ?? "";
    expect(reason).not.toMatch(/\b(you must|please |is required|you need to|you have to)\b/i);
    expect(reason).not.toMatch(/[—–]/);
  });

  test("it goes through the inert primitive and renders the matching note", () => {
    const src = bare(LIT_SRC);
    /* Walk fix: the reason takes the unread count as well, because there is a
     * second thing that makes this control inert. Every paper read against the
     * framing you have now means a second press buys nothing, and the sentence
     * says which of the two states it is in. */
    /* M78a, ISC-678: and the count of papers named without a file, so the
       reason asks for an upload when only citations are on the list. */
    expect(src).toContain(
      'inertAttrs("read-papers", readPapersReason(papers.length, unread.length, namedOnly))',
    );
    expect(src).toContain('<InertNote control="read-papers"');
  });

  test("it stages what the papers expect, and appends what comes back", () => {
    /* M33: the control no longer spends a call. The owner's ruling took the
     * reader's second derivation out: the papers are judged on arrival and what
     * they expect is written down then, so pressing this stages that rather
     * than asking a model the same question again. What still has to hold is
     * that everything it produces goes through `appendAll` and through the
     * proposal door, and that a second press while the first is in flight is
     * refused. */
    const src = bare(LIT_SRC);
    expect(src).not.toContain("activeInferenceClient()");
    expect(src).toContain("extractTheoryClaims(");
    expect(src).toContain("await appendAll(result.events)");
    // Guarded against a second press while the first is in flight, like every
    // other control in this codebase that spends a call.
    /* Walk fix: `unread`, not `papers`. Pressing twice read the same three
     * papers twice and staged eight expectations. The guard is the same guard;
     * what it counts is the papers this press would actually spend a call on. */
    expect(src).toContain("if (readingRef.current || unread.length === 0) return;");
  });

  test("the count under the button is the count the button spends", () => {
    // Both sides read `papersToRead`, so the number the researcher is shown and
    // the number of calls made cannot drift apart.
    expect(bare(LIT_SRC)).toContain("papersToRead({");
    const papers = papersToRead({
      documents: [THORP, BECHKY],
      chunks: CHUNKS,
      typedList: "Zuckerman 2017 on genres and puzzles",
    });
    expect(papers).toHaveLength(3);
    expect(readPapersReason(papers.length)).toBeNull();
  });

  test("the framing line counts drafts and links to where they wait", () => {
    expect(expectationsDrafted(1)).toBe("1 expectation suggested from your papers");
    expect(expectationsDrafted(3)).toBe("3 expectations suggested from your papers");
    expect(framingExpectationsHref(PROJECT)).toBe(`#/study/${PROJECT}/ontology`);
  });

  test("and it appears only once there is something to see", () => {
    const src = bare(BAND_SRC);
    expect(src).toContain("drafted > 0 &&");
    expect(src).toContain("expectationsDrafted(drafted)");
    // Counted off the record, because the band and the papers section never
    // share a render.
    expect(src).toContain('e.originOnAccept === "literature-derived"');
  });

  test("the band counts drafts and not accepted claims", () => {
    // A count of accepted claims would only move after the researcher had
    // already been to the tab this line points at, which is the one moment the
    // line is no use to them.
    expect(bare(BAND_SRC)).toContain('e.type === "proposal"');
    expect(bare(BAND_SRC)).not.toContain('e.type === "ontology-mutation"');
  });
});
