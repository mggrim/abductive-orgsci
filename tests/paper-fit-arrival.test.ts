/**
 * Judging a paper when it arrives (M29c).
 *
 * The owner's ask: "if a user does select a paper that doesn't map with the
 * current conversation, either the data or the theory that is being discussed,
 * then the tool should flag the misalignment."
 *
 * Two things were wrong with the gate this replaces, and each is a describe
 * block below. It ran only when the researcher pressed "Draft what these papers
 * expect", so a paper could sit in the reading list unjudged indefinitely. And
 * it judged against the framing alone, so a paper inside a stated puzzle passed
 * even when it said nothing about the setting the data shows.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief, type ProjectBrief } from "../src/state/projects.ts";
import {
  framingDigest,
  judgeArrivingPapers,
  judgePaperFit,
  paperFitEvents,
  paperVerdicts,
  papersNeedingJudgement,
  type PaperRef,
} from "../src/proposals/paperFit.ts";
import { paperFitSummary } from "../src/views/paperFitLine.ts";
import { BASELINES_ALLOWED } from "../src/proposals/baselines.ts";

const P = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee";
let seq = 0;
const uid = () => `eeeeeeee-5555-4555-8555-${String((seq += 1)).padStart(12, "0")}`;
const now = () => 1_700_000_000_000 + seq;

const BRIEF: ProjectBrief = {
  ...emptyBrief(),
  startingInterest: "How night nurses hand a patient over",
  researchQuestion: "I expected agreement about the patient and found agreement about the form",
};

/** A client that answers with whatever it is told to, and counts its calls. */
function fakeClient(answers: readonly string[]) {
  let i = 0;
  const seen: string[] = [];
  return {
    calls: () => i,
    prompts: seen,
    client: {
      complete: async (req: { system: string; messages: { content: string }[] }) => {
        seen.push(`${req.system}\n${req.messages[0]?.content ?? ""}`);
        const text = answers[Math.min(i, answers.length - 1)] ?? "FIT: unclear";
        i += 1;
        return { text, model: "m", modelVersion: "v" };
      },
    } as never,
  };
}

const paper = (key: string, name = key): PaperRef => ({ key, name });

// ---------------------------------------------------------------------------
// 1. Judged on arrival, and judged once
// ---------------------------------------------------------------------------

describe("a paper is judged when it arrives, not when it is read", () => {
  test("an arriving paper is judged and the verdict is on the record", async () => {
    const fake = fakeClient(["FIT: misfit. This is a methods paper about language models."]);
    const written = await judgeArrivingPapers({
      projectId: P,
      papers: [paper("thorp", "thorp.pdf")],
      context: studyContext(BRIEF),
      events: [],
      client: fake.client,
      makeId: uid,
      now,
    });
    // The marker for every verdict, and nothing else raised for a misfit.
    expect(written.map((e) => e.type)).toEqual(["paper-fit"]);
    for (const event of written) expect(validateEvent(event as never)).toEqual([]);
    const verdicts = paperVerdicts(written, P);
    expect(verdicts.get("thorp")?.verdict).toBe("misfit");
    expect(verdicts.get("thorp")?.reason).toContain("methods paper");
  });

  test("a paper that fits records the verdict and raises nothing", async () => {
    const fake = fakeClient(["FIT: fits. It predicts what happens at shift boundaries."]);
    const written = await judgeArrivingPapers({
      projectId: P,
      papers: [paper("langley", "Langley 1999")],
      context: studyContext(BRIEF),
      events: [],
      client: fake.client,
      makeId: uid,
      now,
    });
    /* Two of the three verdicts are not problems and must not reach the open
     * findings list. They are still recorded, because "judged and fine" and
     * "never judged" look identical without a marker, and the old build could
     * not tell them apart. */
    expect(written.map((e) => e.type)).toEqual(["paper-fit"]);
    expect(paperVerdicts(written, P).get("langley")?.verdict).toBe("fits");
  });

  test("nothing to judge against means no verdict and no finding", async () => {
    const fake = fakeClient(["FIT: misfit. Nothing to go on."]);
    const written = await judgeArrivingPapers({
      projectId: P,
      papers: [paper("thorp")],
      context: studyContext(emptyBrief()),
      events: [],
      client: fake.client,
      makeId: uid,
      now,
    });
    // Against a blank brief every paper is a misfit and none of them is.
    expect(written).toEqual([]);
    expect(fake.calls()).toBe(0);
  });

  test("judgePaperFit returns nothing rather than guessing", async () => {
    const fake = fakeClient(["FIT: misfit."]);
    const verdict = await judgePaperFit({
      paper: paper("thorp"),
      context: studyContext(emptyBrief()),
      client: fake.client,
    });
    expect(verdict).toBeUndefined();
    expect(fake.calls()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 1b. The diff: unchanged lines are not re-judged
// ---------------------------------------------------------------------------

describe("an unchanged paper is not judged again", () => {
  const digest = framingDigest(studyContext(BRIEF));

  test("a line already judged against this framing is skipped", () => {
    const verdicts = new Map([
      [
        "a",
        {
          paperKey: "a",
          paperName: "a",
          verdict: "fits" as const,
          reason: "",
          framingDigest: digest,
          baselines: [],
        },
      ],
    ]);
    const due = papersNeedingJudgement({
      papers: [paper("a"), paper("b")],
      verdicts,
      digest,
    });
    // One new line in a list of two costs one call, not two.
    expect(due.map((p) => p.key)).toEqual(["b"]);
  });

  test("adding a sixth line to five costs one call", async () => {
    const fake = fakeClient(["FIT: fits. Yes."]);
    const already = [1, 2, 3, 4, 5].map((n) => ({
      id: uid(),
      ts: now(),
      actor: "system" as const,
      projectId: P,
      type: "paper-fit" as const,
      paperKey: `p${n}`,
      paperName: `p${n}`,
      verdict: "fits" as const,
      reason: "",
      framingDigest: digest,
      /* M33 fix: judged, and asked what it expects. A verdict with no
       * `baselines` field is one written before the tool asked that question,
       * and it is due for judging however current its framing digest is, which
       * is what this test would otherwise be asserting the opposite of. */
      baselines: [],
    })) as LedgerEvent[];
    await judgeArrivingPapers({
      projectId: P,
      papers: [1, 2, 3, 4, 5, 6].map((n) => paper(`p${n}`)),
      context: studyContext(BRIEF),
      events: already,
      client: fake.client,
      makeId: uid,
      now,
    });
    expect(fake.calls()).toBe(1);
  });

  test("Anti: a reformatted framing is not a changed one", () => {
    const spaced = studyContext({
      ...BRIEF,
      startingInterest: "  How night nurses   hand a patient over  ",
    });
    // Whitespace and case are not the study changing, and re-judging on them
    // would spend a call per paper every time somebody tidied a sentence.
    expect(framingDigest(spaced)).toBe(digest);
  });
});

// ---------------------------------------------------------------------------
// 2. Judged against the data and the model, not the framing alone
// ---------------------------------------------------------------------------

describe("the judgement sees the data and the model", () => {
  const context = studyContext(BRIEF, undefined, {
    chunks: [
      { id: "c1", documentId: "d1", index: 0, text: "the night nurse reads the form aloud" },
      { id: "c2", documentId: "d1", index: 1, text: "nobody mentions the patient by name" },
      { id: "c3", documentId: "d2", index: 0, text: "a third passage nobody has opened" },
      { id: "c4", documentId: "d2", index: 1, text: "a fourth, past the sample" },
    ],
    documentNames: new Map([
      ["d1", "ward-handover.txt"],
      ["d2", "notes.md"],
    ]),
    openedCounts: new Map([
      ["c2", 5],
      ["c1", 2],
    ]),
  });

  test("the digest carries three passages, most-opened first, named by file", () => {
    expect(context.data).toHaveLength(3);
    expect(context.data.map((d) => d.index)).toEqual([1, 0, 0]);
    expect(context.data[0]?.document).toBe("ward-handover.txt");
  });

  test("the prompt shows the data and the claims, and says it is a sample", async () => {
    const fake = fakeClient(["FIT: fits."]);
    await judgePaperFit({ paper: paper("thorp"), context, client: fake.client });
    const prompt = fake.prompts[0] ?? "";
    expect(prompt).toContain("ward-handover.txt, passage 1");
    expect(prompt).toContain("nobody mentions the patient by name");
    // A model handed three passages with no note would reason about the corpus
    // it can see rather than about the corpus there is.
    expect(prompt).toContain("This is a sample, not the whole corpus");
    // And the instruction that makes the data half count.
    expect(prompt).toContain("still say nothing about the setting their data shows");
  });

  test("Anti: a study with no corpus loaded carries no data and still judges", async () => {
    const fake = fakeClient(["FIT: fits."]);
    const bare = studyContext(BRIEF);
    expect(bare.data).toEqual([]);
    const verdict = await judgePaperFit({ paper: paper("thorp"), context: bare, client: fake.client });
    expect(verdict?.fit).toBe("fits");
  });
});

// ---------------------------------------------------------------------------
// 3. What a verdict shows
// ---------------------------------------------------------------------------

describe("what a verdict shows", () => {
  /* M51, ISC-533. The line counted the verdicts and printed them: "2 papers fit,
     1 doesn't", on the tab a researcher opens first. It counts the same three and
     says the one thing they support without pronouncing on the reading list. */
  test("the summary counts every paper the tool has read, and no verdict", () => {
    expect(paperFitSummary({ fits: 2, unclear: 0, misfit: 1 })).toBe("3 papers considered");
    expect(paperFitSummary({ fits: 1, unclear: 1, misfit: 0 })).toBe("2 papers considered");
    expect(paperFitSummary({ fits: 0, unclear: 0, misfit: 2 })).toBe("2 papers considered");
    expect(paperFitSummary({ fits: 1, unclear: 0, misfit: 0 })).toBe("1 paper considered");
    expect(paperFitSummary({ fits: 0, unclear: 0, misfit: 0 })).toBe("");
  });

  test("a misfit paper is still stageable, and nobody writes it expectations unasked", async () => {
    /* M33: the intent split in two when the second derivation went, and both
     * halves are held here.
     *
     * Still not a gate. The staging refuses nothing on the strength of a
     * verdict: a researcher who presses the button on a paper the tool flagged
     * gets what that paper expects, because they know their field and the model
     * does not.
     *
     * What is new is that arrival writes a misfit no expectations at all. The
     * allowance used to be one draft, on the reasoning that pressing the button
     * is an override of the verdict. Arrival is not an override, so the tool no
     * longer puts its doubt about a paper and its expectations of that paper on
     * one row. */
    const theory = await Bun.file("src/proposals/theory.ts").text();
    expect(theory).not.toContain("DRAFTS_ALLOWED");
    expect(BASELINES_ALLOWED).toEqual({ fits: 3, unclear: 1, misfit: 0 });
  });
});

// ---------------------------------------------------------------------------
// 4. The framing moves under a paper
// ---------------------------------------------------------------------------

describe("a changed framing re-judges every paper", () => {
  const judged = (key: string, verdict: "fits" | "misfit", digest: string): LedgerEvent =>
    ({
      id: uid(),
      ts: now(),
      actor: "system",
      projectId: P,
      type: "paper-fit",
      paperKey: key,
      paperName: key,
      verdict,
      reason: "",
      framingDigest: digest,
      // M33 fix: a fully judged paper, so only the framing move makes it due.
      baselines: [],
    }) as LedgerEvent;

  test("a paper judged against an older framing is judged again", async () => {
    const fake = fakeClient(["FIT: misfit. It no longer speaks to this puzzle."]);
    const stale = judged("thorp", "fits", "an older framing");
    const written = await judgeArrivingPapers({
      projectId: P,
      papers: [paper("thorp")],
      context: studyContext(BRIEF),
      events: [stale],
      client: fake.client,
      makeId: uid,
      now,
    });
    expect(fake.calls()).toBe(1);
    expect(written.map((e) => e.type)).toEqual(["paper-fit"]);
    expect(paperVerdicts(written, P).get("thorp")?.verdict).toBe("misfit");
  });
});

// ---------------------------------------------------------------------------
// The reader, which no longer judges what has already been judged
// ---------------------------------------------------------------------------

describe("the reader reuses the verdict rather than asking again", () => {
  test("the reader parses no FIT line of its own, and asks no model anything", async () => {
    /* M33: the seam closed. It used to parse the verdict off the front of the
     * drafting answer when none was on the record, which meant a paper judged
     * there left no `paper-fit` event and so could carry no baselines. The
     * arrival gate is the only judge, and this pass makes no call at all: it
     * reads what the judge wrote down and stages it. */
    const src = await Bun.file("src/proposals/theory.ts").text();
    expect(src).not.toContain("THEORY_SYSTEM");
    expect(src).not.toContain("client.complete");
    expect(src).not.toContain("InferenceClient");
    // The verdict is looked up by the key it was written under, which is the
    // key the draft is stamped with. It used to look it up by the raw typed
    // line, which is not a key `paperVerdicts` ever returns.
    expect(src).toContain("const key = paper.documentId ?? citationKey(paper.name);");
    expect(src).toContain("const recorded = input.verdicts?.get(key);");
  });

  test("one parser, shared, so the two gates cannot judge by different standards", async () => {
    // M33: one gate now, and the vocabulary still has one home. `theory.ts`
    // re-exports it because that is where every caller and every test asks for
    // it, and a second definition would be a second standard.
    const theory = await Bun.file("src/proposals/theory.ts").text();
    const gate = await Bun.file("src/proposals/paperFit.ts").text();
    expect(theory).toContain('from "./fitVerdict.ts"');
    expect(gate).toContain('from "./fitVerdict.ts"');
  });

  test("every surface that can add a paper judges it through the one hook", async () => {
    // Three surfaces can put a paper in front of the tool and a fourth makes a
    // study judgeable. Four call sites deciding independently what counts as a
    // new paper is four chances to disagree in front of the researcher.
    for (const file of ["flow/SeminalCorpus.tsx", "flow/FramingBand.tsx"]) {
      const src = await Bun.file(`src/${file}`).text();
      expect({ file, uses: src.includes("usePaperFit") }).toEqual({ file, uses: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 6. A line the researcher has edited away (team-lead walk, item a)
// ---------------------------------------------------------------------------

describe("a verdict about a line that is gone stops counting", () => {
  /* The walk: three typed lines, one of them edited from "Bechky, ASQ" to
   * "Bechky, Organization Science". A typed line is keyed by its own text, so
   * the edit does not correct the old verdict, it adds a second one, and the
   * band read "4 papers fit, 1 does not" over a list of three.
   *
   * The events stay. They are what the study thought at the time and the ledger
   * does not rewrite. What changed is that a surface counting papers says which
   * papers it means. */
  const verdict = (key: string, fit: "fits" | "misfit"): LedgerEvent => ({
    id: uid(),
    ts: now(),
    actor: "system",
    projectId: P,
    type: "paper-fit",
    paperKey: key,
    paperName: key,
    verdict: fit,
    reason: "because",
    framingDigest: framingDigest(studyContext(BRIEF)),
    // M33 fix: fully judged, so nothing here is due and the counts are the
    // only thing under test.
    baselines: [],
  });

  const EVENTS: readonly LedgerEvent[] = [
    verdict("Bechky, ASQ", "misfit"),
    verdict("Bechky, Organization Science", "fits"),
    verdict("Barley 1986", "fits"),
    verdict("Orlikowski 2002", "fits"),
  ];

  test("unfiltered, the record still holds every verdict ever reached", () => {
    expect([...paperVerdicts(EVENTS, P).keys()]).toEqual([
      "Bechky, ASQ",
      "Bechky, Organization Science",
      "Barley 1986",
      "Orlikowski 2002",
    ]);
  });

  test("filtered to the lines the study names, the edited line's verdict is gone", () => {
    const live = new Set(["Bechky, Organization Science", "Barley 1986", "Orlikowski 2002"]);
    const kept = paperVerdicts(EVENTS, P, live);
    expect([...kept.keys()]).toEqual([
      "Bechky, Organization Science",
      "Barley 1986",
      "Orlikowski 2002",
    ]);
    // Three lines, three verdicts, and none of them the misfit the walk saw.
    const counts = {
      fits: [...kept.values()].filter((v) => v.verdict === "fits").length,
      unclear: 0,
      misfit: [...kept.values()].filter((v) => v.verdict === "misfit").length,
    };
    expect(paperFitSummary(counts)).toBe("3 papers considered");
  });

  test("an empty live set is not the same as no live set", () => {
    // A study whose typed list has been cleared reports nothing judged, rather
    // than reporting the whole history.
    expect(paperVerdicts(EVENTS, P, new Set()).size).toBe(0);
  });

  test("a line still on the list is not judged again", async () => {
    const fake = fakeClient(["FIT: fits."]);
    const written = await judgeArrivingPapers({
      projectId: P,
      papers: [paper("Bechky, ASQ"), paper("Barley 1986")],
      context: studyContext(BRIEF),
      events: EVENTS,
      client: fake.client,
      makeId: uid,
      now,
    });
    // Nothing is due (both were judged against this framing), so nothing is
    // written until the paper or the framing moves.
    expect(written).toEqual([]);
    expect(fake.calls()).toBe(0);
  });
});
