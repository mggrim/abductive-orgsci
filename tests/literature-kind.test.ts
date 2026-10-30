/**
 * The literature is not your data (D5).
 *
 * One defect, visible on a rendered page, with five consequences the researcher
 * never saw. Both upload controls opened on kind `transcript`, so a journal
 * editorial dropped on the Material tab came out filed as fieldwork: the page
 * showed `thorp.pdf TRANSCRIPT`. The tool whose central promise is attribution
 * had filed the literature as evidence, and everything downstream believed it.
 * `uncited-chunk` then nagged the researcher for failing to cite an editorial
 * as material. `orphan-construct` counted a citation to a paper as grounding.
 * The extractor mined the editorial for candidate pages. The modal twin was
 * told the study held passages of fieldwork it does not have.
 *
 * So `literature` is a fifth document kind, and what makes it a kind rather
 * than a label is the set of things it is excluded from. Each exclusion is a
 * separate assertion below, because each was a separate wrong answer, and each
 * is in a different module.
 *
 * The last three describes are about the surface that produces the kind: the
 * papers get their own section with its own picker that has nothing to choose,
 * the data picker lost the default that caused all of this and stays inert
 * until the researcher says what the file is, and the second picker on the
 * early-data station is gone, because two identical controls with one default
 * between them is what put the editorial in the wrong place to begin with.
 */

import { describe, expect, test } from "bun:test";
import {
  DATA_DOCUMENT_KINDS,
  DOCUMENT_KINDS,
  dataOnly,
  ingestText,
  isLiterature,
  literatureChunkIds,
  literatureOnly,
  type Chunk,
  type DocumentKind,
  type StoredDocument,
} from "../src/state/chunks.ts";
import { documentKindLabel } from "../src/ui/materialVocabulary.ts";
import { corpusView } from "../src/flow/corpusView.ts";
import { dataUploadReason } from "../src/flow/CorpusMaterial.tsx";
import { citedChunks, groundingChunks } from "../src/ontology/schema.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { extractProposals } from "../src/proposals/extract.ts";
// M29: the two halves of the interview leak, the prompt's label and the
// drafter's guard.
import { assembleTurnPrompt } from "../src/interview/prompt.ts";
import { citableChunks } from "../src/interview/glean.ts";
import type { NextMove } from "../src/interview/types.ts";
import { twinUserContext } from "../src/twin/twin.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { emptyBrief, type Project } from "../src/state/projects.ts";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

/** Source with its comments removed, for assertions about rendered strings. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Read once at module scope; a `describe` body cannot hold a top-level await. */
const MATERIAL = await Bun.file(`${SRC}flow/CorpusMaterial.tsx`).text();
const VIEWS = await Bun.file(`${SRC}ui/StudyViews.tsx`).text();
const LIT = await Bun.file(`${SRC}flow/SeminalCorpus.tsx`).text();
/* M96, ISC-792: the control left Early data and lives on Sources only. */
const EARLY = await Bun.file(`${SRC}flow/SuggestFromData.tsx`).text();
const PROJECT = "proj-literature";

// ---------------------------------------------------------------------------
// Fixtures. One study holding two data passages and two passages of a paper.
// ---------------------------------------------------------------------------

function chunk(id: string, kind: DocumentKind, documentId: string, index = 0): Chunk {
  return { id, projectId: PROJECT, documentId, kind, text: `passage ${id}`, index };
}

const DATA: readonly Chunk[] = [
  chunk("d1", "transcript", "doc-data", 0),
  chunk("d2", "transcript", "doc-data", 1),
];
const PAPERS: readonly Chunk[] = [
  chunk("p1", "literature", "doc-thorp", 0),
  chunk("p2", "literature", "doc-thorp", 1),
];
const CORPUS: readonly Chunk[] = [...DATA, ...PAPERS];

let clock = 3_000_000_000_000;
function env() {
  clock += 1000;
  return { id: crypto.randomUUID(), ts: clock, actor: "human" as const, projectId: PROJECT };
}

function page(
  targetId: string,
  pageType: PageType,
  title: string,
  supportingChunks: readonly string[],
): LedgerEvent {
  return {
    ...env(),
    type: "ontology-mutation",
    op: "create",
    targetId,
    pageType,
    title,
    body: "",
    origin: "author-prior",
    supportingChunks: [...supportingChunks],
  } as LedgerEvent;
}

// ---------------------------------------------------------------------------

describe("literature is a document kind (D5)", () => {
  /* M74b, ISC-665 (the lead's ruling): a sixth kind, chatnote. */
  test("the six kinds are declared and the papers are one of them", () => {
    expect([...DOCUMENT_KINDS]).toEqual([
      "transcript",
      "fieldnote",
      "chatnote",
      "archival",
      "memo",
      "literature",
    ]);
    expect(isLiterature("literature")).toBe(true);
    expect(isLiterature("transcript")).toBe(false);
  });

  test("the data kinds are the five, and literature is not offered as one", () => {
    // The upload on "Your data" reads this list. If literature were in it the
    // researcher could file a paper as data from the control that exists to
    // stop exactly that.
    expect([...DATA_DOCUMENT_KINDS]).toEqual(["transcript", "fieldnote", "chatnote", "archival", "memo"]);
    expect(DATA_DOCUMENT_KINDS).not.toContain("literature");
    // And together they are DOCUMENT_KINDS, so a sixth kind cannot be added to
    // one list and forgotten in the other.
    expect([...DATA_DOCUMENT_KINDS, "literature"]).toEqual([...DOCUMENT_KINDS]);
  });

  test("a row calls it a paper, not a literature", () => {
    // `literature` is the shelf; what sits on a row is one item from it. The
    // other four kinds are already the English word and pass through.
    expect(documentKindLabel("literature")).toBe("paper");
    // M74b: chatnote reads as two words.
    for (const kind of DATA_DOCUMENT_KINDS) expect(documentKindLabel(kind)).toBe(kind === "chatnote" ? "chat note" : kind);
  });

  test("a file ingested as literature carries the kind onto every passage", () => {
    const result = ingestText({
      projectId: PROJECT,
      name: "thorp.pdf",
      kind: "literature",
      text: "First paragraph of the editorial.\n\nSecond paragraph.",
      makeId: (() => {
        let n = 0;
        return () => `id-${n++}`;
      })(),
    });
    expect(result.document.kind).toBe("literature");
    expect(result.chunks.every((c) => c.kind === "literature")).toBe(true);
    // The partition helpers see it, which is what every exclusion below reads.
    expect(dataOnly(result.chunks)).toEqual([]);
    expect(literatureOnly(result.chunks)).toHaveLength(result.chunks.length);
  });

  test("the partition is total and the two halves do not overlap", () => {
    expect(dataOnly(CORPUS).map((c) => c.id)).toEqual(["d1", "d2"]);
    expect(literatureOnly(CORPUS).map((c) => c.id)).toEqual(["p1", "p2"]);
    expect(literatureChunkIds(CORPUS)).toEqual(["p1", "p2"]);
    expect(dataOnly(CORPUS).length + literatureOnly(CORPUS).length).toBe(CORPUS.length);
  });

  test("a paper is still findable in the material, by either word", () => {
    // Excluded from the counts is not excluded from the study. The chip prints
    // "paper", so the box that says it searches the material has to match it,
    // and the stored word stays matchable too.
    const docs: readonly StoredDocument[] = [
      { id: "doc-thorp", projectId: PROJECT, name: "thorp.pdf", kind: "literature", createdAt: 1, chunkCount: 2 },
    ];
    const q = {
      documents: docs,
      chunks: PAPERS,
      opened: new Set<string>(),
      cited: new Set<string>(),
      show: "all" as const,
      sort: "added" as const,
      countWords: (t: string) => t.split(/\s+/).length,
    };
    expect(corpusView({ ...q, query: "paper" }).rows).toHaveLength(1);
    expect(corpusView({ ...q, query: "literature" }).rows).toHaveLength(1);
    expect(corpusView({ ...q, query: "transcript" }).rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("a paper is excluded from the cited and uncited counts (D5)", () => {
  const events = [page("pg1", "observation", "Handover is unrecorded", ["d1"])];
  const graph = projectOntology(events, PROJECT);

  test("Anti: the surface was counting the papers before the split", () => {
    // What the page did. Both counts ran over every chunk in storage, so a
    // study holding two transcripts and one uploaded editorial reported four
    // uncited passages when it had two.
    const uncitedOverEverything = CORPUS.filter((c) => !citedChunks(graph).has(c.id));
    expect(uncitedOverEverything).toHaveLength(3);
  });

  test("the counts on Your data run over the data only", () => {
    // The page hands `CorpusMaterial` the data documents and their passages, so
    // the intersection with the graph's citations is over the data alone.
    const cited = citedChunks(graph);
    const data = dataOnly(CORPUS);
    expect(data.filter((c) => cited.has(c.id)).map((c) => c.id)).toEqual(["d1"]);
    expect(data.filter((c) => !cited.has(c.id)).map((c) => c.id)).toEqual(["d2"]);
    expect(data).toHaveLength(2);
  });

  test("grounding is what the data supports, never what a paper says", () => {
    const literature = new Set(literatureChunkIds(CORPUS));
    expect(groundingChunks(["d1", "p1"], literature)).toEqual(["d1"]);
    expect(groundingChunks(["p1", "p2"], literature)).toEqual([]);
    // No literature, no filtering, and the array comes back untouched.
    expect(groundingChunks(["d1", "p1"], new Set())).toEqual(["d1", "p1"]);
  });
});

// ---------------------------------------------------------------------------

describe("a paper is never mined for candidate pages (D5)", () => {
  test("extraction reads the data and leaves the papers", async () => {
    const client = new MockInferenceClient({
      responses: ["TYPE: observation\nTITLE: A thing\nBODY: Seen here. [[chunk:d1]]"],
    });
    await extractProposals({ projectId: PROJECT, chunks: CORPUS }, client);
    const sent = client.requests[0]?.messages.map((m) => m.content).join("\n") ?? "";
    expect(sent).toContain("[[chunk:d1]]");
    expect(sent).toContain("[[chunk:d2]]");
    expect(sent).not.toContain("[[chunk:p1]]");
    expect(sent).not.toContain("[[chunk:p2]]");
  });

  test("no retrieval attention is recorded for a passage never put in front of the model", () => {
    // An attention event is a claim about what the tool did. Recording
    // retrieval on a paper the extractor did not read would be the record
    // getting itself wrong, which is the one thing this app cannot do.
    const client = new MockInferenceClient({ responses: ["TYPE: observation\nTITLE: A\nBODY: b."] });
    return extractProposals({ projectId: PROJECT, chunks: CORPUS }, client).then((result) => {
      expect(result.attention.map((a) => a.chunkId).sort()).toEqual(["d1", "d2"]);
    });
  });

  test("a corpus of papers alone spends no model call at all", async () => {
    const client = new MockInferenceClient();
    const result = await extractProposals({ projectId: PROJECT, chunks: PAPERS }, client);
    expect(client.requests).toHaveLength(0);
    expect(result.proposals).toEqual([]);
    expect(result.attention).toEqual([]);
  });

  test("the filter is at the boundary, not at the caller", async () => {
    // Deliberate: a second caller that forgot the filter would be a silent hole
    // rather than a visible one, and the anti-criterion this module is written
    // around is stated here.
    const source = await Bun.file(`${SRC}proposals/extract.ts`).text();
    expect(source).toContain("dataOnly(input.chunks)");
  });
});

// ---------------------------------------------------------------------------

/*
 * M29 (E4/R6). The hole D5 left open, one path over.
 *
 * `extract.ts` is protected by `dataOnly` and the interview path is not, by
 * design: the interviewer is meant to see which conversation the researcher
 * thinks they are joining. What it could not see was which passages are papers.
 * They arrived in one undifferentiated pile under "Material in context" and the
 * next line told the model to cite any of them, so a paragraph of somebody's
 * argument could be cited into a turn and land in a drafted observation.
 */
describe("the interview knows which passages are papers (M29)", () => {
  const move: NextMove = {
    id: "m1",
    topic: "context",
    mode: "interrogation",
    question: "What did you expect to see on the night shift?",
    rationale: "the context is thin",
    source: "station",
  };

  const prompt = (chunks: readonly Chunk[]) =>
    assembleTurnPrompt({ move, chunks, ontologySummary: "" });

  test("a paper is marked in the material block and a transcript is not", () => {
    const sent = prompt(CORPUS);
    expect(sent).toContain("[[chunk:p1]] (paper)");
    expect(sent).toContain("[[chunk:p2]] (paper)");
    expect(sent).toContain("[[chunk:d1]] passage d1");
    expect(sent).not.toContain("[[chunk:d1]] (paper)");
  });

  test("the mark is the word the researcher reads on the row", () => {
    // One vocabulary, both directions. A word handed to the model comes back as
    // model prose the researcher reads, so it had better be their word.
    expect(documentKindLabel("literature")).toBe("paper");
    expect(prompt(PAPERS)).toContain(`(${documentKindLabel("literature")})`);
  });

  test("and the model is told what a marked passage is evidence of", () => {
    const sent = prompt(CORPUS);
    expect(sent).toContain("evidence of what someone expects");
    expect(sent).toContain("Do not treat it as evidence of what happens in their setting");
  });

  test("Anti: the papers still reach the prompt, because that is the point", () => {
    // The fix is a label, not a filter. Filtering here would take away the one
    // thing the interviewer needs the papers for.
    expect(prompt(CORPUS)).toContain("passage p1");
  });

  test("nothing but a theory page may rest on a paper", () => {
    // The guard on the drafting path, stated over the function that holds it.
    const papers = new Set(["p1", "p2"]);
    expect(citableChunks("theory", ["p1", "d1"], papers)).toEqual(["p1", "d1"]);
    expect(citableChunks("observation", ["p1", "d1"], papers)).toEqual(["d1"]);
    expect(citableChunks("analytic-residue", ["p1", "p2"], papers)).toEqual([]);
    // No papers, nothing filtered, on any page type.
    expect(citableChunks("observation", ["p1", "d1"], new Set())).toEqual(["p1", "d1"]);
  });

});

// ---------------------------------------------------------------------------

describe("a paper is not a passage of the researcher's corpus, to the twin (D5)", () => {
  const project: Project = {
    id: PROJECT,
    title: "A study",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...emptyBrief(), researchQuestion: "Why does the handover go unrecorded?" },
  };

  /* M29, A6 (R7). The corpus line is gone rather than corrected.
   *
   * It used to say "Corpus at generation time: N data chunk(s)", and the D5 fix
   * made that count the data rather than the papers. The count itself was the
   * remaining defect: the twin is what a competent person would design BEFORE
   * looking at this material, so telling it how much material there is makes the
   * baseline less conventional than it should be and shrinks the divergence the
   * comparison exists to measure. What the context carries instead is the
   * expectations the researcher accepted out of the papers. */
  const CLAIMS = [
    {
      title: "Handoffs fail when the receiving clinician cannot question the sender",
      body: "Holds where the handover is written rather than spoken.",
    },
  ];

  test("the corpus never reaches the twin, in any count or any form", () => {
    for (const seesPapers of [true, false]) {
      const context = twinUserContext(project, CLAIMS, seesPapers);
      expect(context).not.toContain("data chunk");
      expect(context).not.toContain("Corpus at generation time");
      // And no passage text, which never reached it and must keep not reaching
      // it: every chunk in this file's fixtures has a body of `passage <id>`.
      for (const chunk of CORPUS) expect(context).not.toContain(chunk.text);
    }
  });

  test("the framing facets see the papers and the others do not", () => {
    expect(twinUserContext(project, CLAIMS, true)).toContain(CLAIMS[0]?.title ?? "");
    expect(twinUserContext(project, CLAIMS, false)).not.toContain(CLAIMS[0]?.title ?? "");
  });

  test("Anti: the line said four before the split, and says nothing now", () => {
    // The sentence called them data chunks, so uploading five papers told the
    // twin the study held five passages of fieldwork it does not have.
    expect(CORPUS).toHaveLength(4);
    expect(twinUserContext(project, CLAIMS)).not.toContain("4 data chunk(s)");
  });
});

// ---------------------------------------------------------------------------

describe("the data upload is inert until the researcher says what the file is (D5)", () => {

  test("the select opens on a placeholder and no kind is chosen for anyone", () => {
    // The whole defect, in one line of markup. It was
    // `useState<DocumentKind>("transcript")`.
    expect(MATERIAL).toContain('useState<DocumentKind | "">("")');
    expect(MATERIAL).toContain('<option value="">Choose type</option>');
    expect(MATERIAL).not.toContain('useState<DocumentKind>("transcript")');
  });

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("the picker states the condition that makes it live, and it is a condition", () => {
    // R3, copy C6: "picker" is this file's word for a file input and nobody
    // else's. The grammar is unchanged, and the rule below still holds it to an
    // observation rather than an instruction.
    expect(dataUploadReason("")).toBe("Choose a file type first.");
    expect(dataUploadReason("transcript")).toBeNull();
    const reason = dataUploadReason("") ?? "";
    // The house rule for this sentence: an observation about the form, never an
    // instruction, and no banned dash.
    expect(reason).not.toMatch(/\b(you must|please |is required|you need to|you have to)\b/i);
    expect(reason).not.toMatch(/[—–]/);
  });

  test("the picker goes through the inert primitive and renders the matching note", () => {
    expect(MATERIAL).toContain('inertAttrs("material-upload", uploadReason)');
    expect(MATERIAL).toContain('<InertNote control="material-upload"');
  });

  test("and the handler stops as well, because aria-disabled still fires a click", () => {
    // aria-disabled keeps the tab stop on purpose, so every control behind one
    // carries its own guard. Without this the inert state would be decoration.
    expect(MATERIAL).toContain('if (kind === "") {');
  });

  test("the upload on Your data offers the data kinds only", () => {
    expect(MATERIAL).toContain("DATA_DOCUMENT_KINDS.map");
    // And the retag control on a row offers all five, which is how a file that
    // turns out to be a paper gets out of the data.
    expect(MATERIAL).toContain("DOCUMENT_KINDS.map");
  });
});

// ---------------------------------------------------------------------------

describe("the Material page stacks the papers above the data (D5)", () => {

  test("the literature section carries the id the Framing link scrolls to", () => {
    expect(LIT).toContain('export const LITERATURE_SECTION_ID = "literature"');
    expect(LIT).toContain("id={LITERATURE_SECTION_ID}");
  });

  test("the two sections have the headings the page promises", () => {
    // R3 item 6: the "not your evidence" distinction moved into the heading,
    // where the confusion happens, which deleted a whole sentence below it.
    // M42: the parenthetical reframe left the heading; the lede says where a
    // researcher's own evidence goes, in a sentence rather than in brackets.
    // M49 (ISC-529): where it goes changed, so the sentence did. "Your data" is
    // not a heading below this one until the researcher says they have data, and
    // a lede pointing at a section that is not on the page is the fallback
    // defect this file was written for.
    expect(LIT).toContain("<h2>Papers</h2>");
    expect(LIT).toContain("Your evidence is your own data, which you add once you");
    expect(MATERIAL).toContain("<h2>Data</h2>");
    expect(MATERIAL).not.toContain("<h2>The material</h2>");
  });

  test("each section says what it is for, in the words the page uses", async () => {
    // M28: copy. Both ledes now open on what the reader does, and both still
    // draw the same line between the two kinds of file.
    // R3 item 6.
    expect(LIT).toContain("Identify the papers that you expect to draw on.");
    expect(LIT).toContain("Abductive considers each paper for its");
    // M62, ISC-600: the data lede is in Sources' Help panel; the papers lede
    // stays, since it glosses "expectations" (held for the lead).
    const help = (await Bun.file(new URL("../src/ui/pageHelp.ts", import.meta.url).pathname).text()).replace(/\s+/g, " ");
    expect(help).toContain(
      "Add your transcripts, fieldnotes, memos and archives. Your claims cite this data.",
    );
  });

  test("the papers are rendered before the data, in two panes", () => {
    /* M32, R5, and this one reverses half of D5 on purpose rather than by
     * accident, so the reason is written down.
     *
     * D5 stacked these two because they had been a `1fr / 26rem` grid: a
     * literature column sized by a textarea that had no use for the width, next
     * to a table of documents that wanted all of it, with the pair implying
     * they were two views of one thing. Stacking fixed the squeeze and paid for
     * it in the other direction. Measured at 1449 for M32, Material rendered a
     * single ~450px prose column with roughly 650px of blank paper beside it,
     * and the critique names that one token family, prose sizing layout, as the
     * single largest cause of the whole product reading as a website.
     *
     * The panel grammar is the answer to both. The papers are a `.panel-list`
     * at 320 to 360px and the data is a `.panel-main` at `minmax(0, 1fr)`, so
     * the papers column is a declared pane width rather than whatever a
     * textarea happened to want, and neither surface is sized by its prose. The
     * half of D5 that was never about the squeeze is untouched and is what this
     * test still holds: the papers come first, because you know which
     * conversation you are joining before you know what your data says.
     *
     * Below 1100px the grammar is inert and they stack, which is D5's own
     * layout on the widths D5 was written for.
     *
     * M49 (ISC-529): the frame is two panes only once the study has data. Until
     * then Material is the papers alone and the second pane does not render, so
     * the variant is chosen rather than written, and the two-pane value is the
     * one asserted here. */
    expect(VIEWS).toContain('data-panels={showData ? "list-main" : "main"}');
    expect(VIEWS).not.toContain('className="material-grid"');
    const lit = VIEWS.indexOf("<SeminalCorpus");
    const data = VIEWS.indexOf("<CorpusMaterial");
    expect(lit).toBeGreaterThan(0);
    expect(data).toBeGreaterThan(lit);
  });

  test("each section is handed its own half of the corpus", () => {
    expect(VIEWS).toContain("literatureOnly(documents)");
    expect(VIEWS).toContain("dataOnly(documents)");
    expect(VIEWS).toContain("documents={literatureDocs}");
    expect(VIEWS).toContain("documents={dataDocs}");
  });

  test("the papers upload has no kind to choose and writes literature", () => {
    // The picker that caused all of this had a select. This one cannot be got
    // wrong because there is nothing on it to get wrong.
    expect(LIT).toContain('kind: "literature"');
    expect(LIT).toContain('data-testid="literature-upload"');
    expect(LIT).not.toContain("DOCUMENT_KINDS");
  });

  test("the typed list still writes brief.seminalCorpus, unchanged", () => {
    // The Framing band on the Design page edits the same field through the same
    // state functions. Two surfaces, one string.
    expect(LIT).toContain("seminalCorpus: draft");
    /* Walk fix: through `updateBrief`, which merges this one field onto what is
     * on disk inside a transaction. It wrote the whole brief from a copy loaded
     * when this section mounted, so saving the papers list rolled back every
     * other field somebody had written since. The field and the surface are
     * unchanged; what changed is that it no longer carries nine other fields
     * with it. */
    expect(LIT).toContain("updateBrief(projectId, { seminalCorpus: draft })");
    expect(LIT).not.toContain("saveProject(");
    expect(LIT).toContain('data-testid="seminal-corpus-input"');
  });

  test("nothing in the papers section reaches the network (ISC-302)", () => {
    // The standing promise carried across the rewrite: searching OpenAlex from
    // this panel would quietly make it false.
    const code = LIT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/fetch\(|openalex|semanticscholar|XMLHttpRequest/i);
  });
});

// ---------------------------------------------------------------------------

describe("the Suggest concepts control on Sources is not an upload (D5)", () => {

  test("the duplicate picker is gone", () => {
    // Two identical pickers on two tabs, both opening on `transcript`, is how
    // the editorial reached the wrong place. Adding a file happens where the
    // page says which of the two things a file is.
    expect(EARLY).not.toContain('type="file"');
    expect(EARLY).not.toContain("ingestFile");
    expect(EARLY).not.toContain("saveDocument");
    /* M74b, ISC-665: the step's kind menu now offers the file types Sources
     * offers (one list), so the list's name appears here; the picker that adds a
     * file still does not, which is what this test is about. */
    expect(EARLY).not.toContain('data-testid="material-kind"');
  });

  test("the action names what happens when you press it, on every study", () => {
    // The count used to sit inside the label, so the button said something
    // different on every study and the one word that mattered was buried.
    // M28: copy. Same shape, saying claim rather than page and naming whose
    // material is read, which is the distinction this whole section exists for.
    /* M28 r8: copy. It was the only control in the product written in the
     * reader's own voice; every other button addresses them, and the Material
     * tab calls the same files "your data" twice on one screen. */
    // M63, ISC-610: the data read suggests concepts now, named for its result (L3).
    expect(EARLY).toContain('"Considering your data…" : "Suggest concepts"');
    // Comments stripped: the module note quotes the old label to record what it
    // was, which is the file explaining itself and not the tool speaking.
    expect(code(EARLY)).not.toContain("Read the corpus and stage candidates");
  });

  test("the line under it says whose material Abductive considers", () => {
    // M28 r8: copy. Subjectless, which is the defect just fixed on the Checks
    // subtitle.
    //
    // M49 (ISC-530): "and how much" went with the passage count, and the
    // sentence lost the "X, not Y" reframe the copy standard's part 3 bans while
    // it was being rewritten. What it still has to say is which half of the
    // material the reading takes in, because that is the D5 boundary the whole
    // control turns on.
    expect(EARLY).toContain("Abductive considers your data files and excludes the papers.");
    expect(EARLY).not.toContain("{data.length} passage");
  });

  test("the pass considers the data only", () => {
    expect(EARLY).toContain("dataOnly(chunks)");
    expect(EARLY).toContain("chunks: data,");
  });

  test("the inert sentence no longer points at a picker that is not there", () => {
    // It read "Add a file above and the corpus fills" beside a station with no
    // file input on it.
    expect(EARLY).not.toContain("Add a file above");
    // M28: copy.
    expect(EARLY).toContain("Add data above first.");
  });
});
