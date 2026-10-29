/**
 * A paper between arriving and being judged, and a paper whose name changed.
 *
 * Three findings from the walk, and they are one finding seen three times: the
 * tool knew something about a paper and the row did not say it.
 *
 * A file uploaded while another was being judged sat as a bare name for twenty
 * seconds and then for ten minutes, because the run in flight was working from
 * a list read before that file existed and nothing asked again when it
 * finished. A typed line the researcher rewrote lost the verdict it had, and
 * rendered no row at all, so "not judged" and "judged and quiet" looked the
 * same. And a file that yields no text was accepted in silence.
 */

import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { citationKey, judgeArrivingPapers } from "../src/proposals/paperFit.ts";
import { papersToRead } from "../src/proposals/theory.ts";
import { paperRefs } from "../src/proposals/theory.ts";
import { UNREADABLE_NOTE, paperRowState } from "../src/flow/SeminalCorpus.tsx";

import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief, type ProjectBrief } from "../src/state/projects.ts";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const P = "arrival";
let seq = 0;
const uid = () => `eeeeeeee-6666-4666-8666-${String((seq += 1)).padStart(12, "0")}`;

const doc = (id: string, name: string): StoredDocument => ({
  id,
  projectId: P,
  name,
  kind: "literature",
  createdAt: 1,
  chunkCount: 1,
});
const chunk = (id: string, documentId: string): Chunk => ({
  id,
  projectId: P,
  documentId,
  kind: "literature",
  text: "a passage",
  index: 0,
});

const BRIEF: ProjectBrief = {
  ...emptyBrief(),
  startingInterest: "How night nurses hand a patient over",
  researchQuestion: "I expected agreement about the patient and found agreement about the form",
};

describe("a typed paper keeps its verdict when the title is edited", () => {
  test("the key is the first author and the year", () => {
    /* The walk: judged at 16:05 under "Cohen and Hilligoss 2010, The published
     * literature on handof…", then rewritten with the full title and the
     * journal. Same paper, same key. */
    const short = "Cohen and Hilligoss 2010, The published literature on handof";
    const full =
      "Cohen and Hilligoss 2010, The published literature on handoffs between medical providers, Quality and Safety in Health Care";
    expect(citationKey(short)).toBe("cohen 2010");
    expect(citationKey(full)).toBe(citationKey(short));
  });

  test("two different papers by the same author in different years stay apart", () => {
    expect(citationKey("Hilligoss and Cohen 2013, The unappreciated challenges")).toBe(
      "hilligoss 2013",
    );
    expect(citationKey("Cohen and Hilligoss 2010")).not.toBe(
      citationKey("Hilligoss and Cohen 2013"),
    );
  });

  test("a line with no year is keyed on its own words, normalised", () => {
    // There is nothing better to key it on, and saying so is honest.
    expect(citationKey("  Zuckerman   on genres and puzzles ")).toBe(
      "zuckerman on genres and puzzles",
    );
  });

  test("the list the judge is given uses that key, so an edit does not orphan a verdict", () => {
    const before = paperRefs({ documents: [], chunks: [], typedList: "Bechky 2006" });
    const after = paperRefs({
      documents: [],
      chunks: [],
      typedList: "Bechky 2006, Gaffers, gofers and grips, Organization Science",
    });
    expect(before[0]?.key).toBe(after[0]?.key);
    // The name still reads as the researcher typed it.
    expect(after[0]?.name).toContain("Organization Science");
  });
});

describe("a paper that arrives while another is being judged", () => {
  const judge = async (
    papers: readonly { key: string; name: string }[],
    events: readonly LedgerEvent[],
    answer = "FIT: fits. It predicts what happens at shift boundaries.",
  ) =>
    judgeArrivingPapers({
      projectId: P,
      papers,
      context: studyContext(BRIEF),
      events,
      client: {
        complete: async () => ({ text: answer, model: "m", modelVersion: "v" }),
      } as never,
      makeId: uid,
      now: () => (seq += 1),
    });

  test("the second arrival is judged once the list includes it", async () => {
    /* The hook re-reads the corpus on every pass, so this is the state the
     * second pass sees: one paper judged, one not, and the diff finds it. */
    const first = await judge([{ key: "a", name: "cohen-hilligoss-2010.pdf" }], []);
    expect(first.filter((e) => e.type === "paper-fit").length).toBe(1);

    const second = await judge(
      [
        { key: "a", name: "cohen-hilligoss-2010.pdf" },
        { key: "b", name: "hilligoss-cohen-2013.pdf" },
      ],
      first,
    );
    expect(second.filter((e) => e.type === "paper-fit").map((e) => (e as { paperKey: string }).paperKey)).toEqual(["b"]);
  });

  test("the hook re-reads storage and asks again until nothing is due", async () => {
    /* The defect was structural, not arithmetic: the judge took the documents
     * and passages the calling component last rendered, so a file stored a
     * minute later was invisible to it forever. */
    const code = await Bun.file(
      new URL("../src/flow/usePaperFit.ts", import.meta.url).pathname,
    ).text();
    expect(code).toContain("listDocuments(projectId)");
    expect(code).toContain("listChunks(projectId)");
    expect(code).toContain("readEvents(projectId)");
    expect(code).toContain("for (let pass = 0; pass < MAX_JUDGE_PASSES");
    /* One judge at a time, per study, shared by every component that judges.
     * The walk caught the framing band and the papers section racing: two
     * verdicts for one paper three seconds apart, because each run read the
     * record before the other wrote to it. A per-component ref could not have
     * stopped that; the loop belongs to the ledger, not to a component. */
    expect(code).toContain("serialise(loopFor(projectId)");
    expect(code).toContain("const LOOPS = new Map<string, SaveLoop>();");
  });

  test("nothing left to judge stops the loop rather than spinning", async () => {
    const judged = await judge([{ key: "a", name: "one.pdf" }], []);
    const again = await judge([{ key: "a", name: "one.pdf" }], judged);
    expect(again).toEqual([]);
  });
});

describe("a file with No text", () => {
  test("it is not a paper for the reader or the judge", () => {
    const documents = [doc("d-ok", "cohen-hilligoss-2010.pdf"), doc("d-scan", "hilligoss-cohen-2013.pdf")];
    const chunks = [chunk("c1", "d-ok")];
    expect(papersToRead({ documents, chunks }).map((p) => p.documentId)).toEqual(["d-ok"]);
    expect(paperRefs({ documents, chunks }).map((p) => p.key)).toEqual(["d-ok"]);
  });

  test("Anti: a typed line has no passages either and is still a paper", () => {
    // A line the researcher wrote is a paper they are naming. A file with no
    // text is a failure to read a file.
    const papers = papersToRead({ documents: [], chunks: [], typedList: "Bechky 2006" });
    expect(papers.map((p) => p.name)).toEqual(["Bechky 2006"]);
  });

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("the row says so, in words a reader can act on", () => {
    expect(paperRowState({ passages: 0, uploading: false, judging: false })).toBe("unreadable");
    expect(UNREADABLE_NOTE).toBe(
      "Abductive couldn't find readable text in the file, which may be a scan.",
    );
  });
});

describe("what a row says before it has a verdict", () => {
  test("the four states, in the order they happen", () => {
    expect(paperRowState({ passages: 0, uploading: true, judging: false })).toBe("reading");
    expect(paperRowState({ passages: 0, uploading: false, judging: false })).toBe("unreadable");
    expect(paperRowState({ passages: 30, uploading: false, judging: true })).toBe("judging");
    expect(paperRowState({ passages: 30, uploading: false, judging: false })).toBe("unjudged");
  });

  /* M51, ISC-533. A verdict still outranks the state, and it no longer reaches
     the researcher: all three words read as the one fact the chip is for, which
     is that something has read the paper. */
  test("a verdict reads as a paper the tool has read, and never as a verdict", async () => {
    const { PaperFitChip } = await import("../src/flow/PaperFitChip.tsx");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const chipFor = (verdict: "fits" | "unclear" | "misfit") =>
      renderToStaticMarkup(createElement(PaperFitChip, { verdict, state: "judging" })).replace(
        /<[^>]+>/g,
        "",
      );
    for (const verdict of ["fits", "unclear", "misfit"] as const) {
      expect(chipFor(verdict)).toBe("Read");
    }
    // The three words the row used to wear, gone from the one place it drew them.
    const src = await Bun.file(
      new URL("../src/flow/PaperFitChip.tsx", import.meta.url).pathname,
    ).text();
    for (const word of ["fits your setting", "doesn't fit", "unclear"]) {
      expect(src.split("*/").at(-1) ?? "").not.toContain(word);
    }
  });

  test("nothing at all is no longer a state a row can be in", async () => {
    // The silence the walk found: a bare name, for twenty seconds and then for
    // ten minutes, saying nothing about whether the tool had looked.
    const { PaperFitChip } = await import("../src/flow/PaperFitChip.tsx");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const said = renderToStaticMarkup(
      createElement(PaperFitChip, { verdict: undefined, state: "unjudged" }),
    ).replace(/<[^>]+>/g, "");
    expect(said).toBe("Unread");
  });
});

/* M87, ISC-722: the tests of the retired `paper-never-engaged` (its misfit
 * and pending-draft suppressions, its sentence and its inputs on the Checks
 * page) went with the rule (the owner, 2026-10-14). */

describe("one row per typed line, named by that line", () => {
  test("the split takes either line ending and drops the blanks", async () => {
    /* The walk saw "Grodal and Schildt 2026, Abductive qualitative research
     * with LLMsd Safety in Health Care)": the start of one line with the tail of
     * another spliced onto it. */
    const code = await Bun.file(
      new URL("../src/flow/SeminalCorpus.tsx", import.meta.url).pathname,
    ).text();
    expect(code).toContain(".split(/\\r?\\n/)");
    expect(code).toContain(".map((line) => line.trim())");
    expect(code).toContain('.filter((line) => line !== "")');
    // Keyed by position: two lines can hold the same string while one is being
    // edited into the other, and a repeated key is how a row gets reused.
    expect(code).toContain("data-testid={`typed-line-${l.index}`}");
    expect(code).toContain("key={l.index}");
  });

  test("the row reads its verdict under the key the verdict was written with", async () => {
    const code = await Bun.file(
      new URL("../src/flow/SeminalCorpus.tsx", import.meta.url).pathname,
    ).text();
    expect(code).toContain("const key = named?.id ?? citationKey(line);");
    expect(code).toContain("verdict: verdicts.get(key)?.verdict");
    // M89: the open-flag lookup (`misfit: misfits.get(key)`) left with the
    // flag. The bearing the researcher wrote is read under the same key.
    expect(code).toContain("bearing: bearings.get(key)");
  });
});
