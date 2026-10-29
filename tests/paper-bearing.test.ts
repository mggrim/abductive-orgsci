/**
 * The judge asks instead of dismissing (M51, ISC-533).
 *
 * A co-author, on their own reading list on 2026-09-21: the tool is "being too
 * self-confident", and "instead of making judgments, ask: why do you think this
 * is relevant?". The owner's decision of 2026-09-26: no verdict reaches the
 * researcher, a paper the judge cannot place carries the question "What in this
 * paper bears on your setting?", the answer is recorded beside the paper as
 * their own act, and the tool reads the paper again with that answer in the
 * prompt.
 *
 * Four things are asserted here, in the order a researcher meets them: the
 * projection that decides what a row draws, the event an answer writes, the
 * prompt the second reading is made with, and the shipped example read under
 * the question. The example is the fixture for the last of them, because it
 * holds the paper the walk of 2026-09-13 found: one stored misfit on
 * `mcmullen-shepherd-2006.pdf`, with no answer beside it. (The notice that once
 * replaced `paper-misfit` left with the checks at M89.)
 */

import { describe, expect, test } from "bun:test";
import {
  BEARING_BLOCK_HEAD,
  FIT_SYSTEM,
  fitSystem,
  judgePaperFit,
  paperFitEvents,
  papersNeedingJudgement,
  paperVerdicts,
  type PaperRef,
  type PaperVerdict,
} from "../src/proposals/paperFit.ts";
import {
  BEARING_QUESTION,
  bearingEvents,
  bearingReasons,
  paperBearings,
  paperStanding,
  showsJudgeSentence,
} from "../src/views/paperBearings.ts";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { emptyBrief, type ProjectBrief } from "../src/state/projects.ts";

const P = "p-bearing";

let n = 0;
const uid = () => `aaaaaaaa-1111-4111-8111-${String((n += 1)).padStart(12, "0")}`;
const now = () => 1000 + n;

const BRIEF: ProjectBrief = {
  ...emptyBrief(),
  startingInterest: "how mentors judge founders in a pre-seed programme",
  researchQuestion: "expected a deck to carry the judgement, found office hours carrying it",
  siteRationale: "a pre-seed accelerator cohort in its second year",
  seminalCorpus: "McMullen and Shepherd 2006, Entrepreneurial action and the role of uncertainty",
};

const PAPER: PaperRef = {
  key: "d-mcmullen",
  name: "mcmullen-shepherd-2006.pdf",
  chunks: [{ id: "c1", documentId: "d-mcmullen", index: 0, kind: "paper", text: "Judgement under uncertainty precedes action." }] as never,
};

const verdict = (over: Partial<PaperVerdict> = {}): PaperVerdict => ({
  paperKey: PAPER.key,
  paperName: PAPER.name,
  verdict: "misfit",
  reason: "It makes no prediction about a setting like yours.",
  framingDigest: "d",
  baselines: [],
  ...over,
});

// ---------------------------------------------------------------------------

describe("where one paper stands, which is what every row draws", () => {
  test("nothing has read it", () => {
    expect(paperStanding({})).toBe("unjudged");
    // A verdict from before the expectations field is the same state: nobody has
    // asked this paper what it expects, so nobody can ask the researcher either.
    const before = { ...verdict() } as Record<string, unknown>;
    delete before.baselines;
    expect(paperStanding({ verdict: before as unknown as PaperVerdict })).toBe("unjudged");
  });

  test("read, nothing to draft, nobody has spoken for it: the row asks", () => {
    expect(paperStanding({ verdict: verdict({ verdict: "misfit" }) })).toBe("asking");
    expect(paperStanding({ verdict: verdict({ verdict: "unclear" }) })).toBe("asking");
  });

  test("a paper the tool placed is not asked about", () => {
    // Read as speaking to the setting, with nothing written down from it. The
    // row says so in its own sentence and carries no question.
    expect(paperStanding({ verdict: verdict({ verdict: "fits" }) })).toBe("placed");
    // And an `unclear` paper the judge did find an expectation in: asking about
    // it would be the tool asking a question its own row has answered.
    expect(
      paperStanding({
        verdict: verdict({
          verdict: "unclear",
          baselines: [{ id: "b1", expectation: "Uncertainty delays action.", scope: "founders" }],
        }),
      }),
    ).toBe("placed");
  });

  test("once they have answered, the row shows their sentence", () => {
    const bearing = { paperKey: PAPER.key, paperName: PAPER.name, reason: "It theorises judgement under uncertainty.", at: 1 };
    expect(paperStanding({ verdict: verdict(), bearing })).toBe("said");
    // Including on a paper nothing has read yet, which is a researcher who
    // answered a question raised against an earlier verdict.
    expect(paperStanding({ bearing })).toBe("said");
  });

  test("the judge's own sentence reaches the researcher on a fit and nowhere else", () => {
    expect(showsJudgeSentence(verdict({ verdict: "fits" }))).toBe(true);
    expect(showsJudgeSentence(verdict({ verdict: "unclear" }))).toBe(false);
    expect(showsJudgeSentence(verdict({ verdict: "misfit" }))).toBe(false);
    expect(showsJudgeSentence(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("what a saved answer writes", () => {
  const SAID = "It theorises judgement under uncertainty, which is what the mentors do in the room.";

  test("the researcher's sentence is theirs on the record, and valid", () => {
    const events = bearingEvents(
      { projectId: P, paperKey: PAPER.key, paperName: PAPER.name, reason: `  ${SAID}  ` },
      { makeId: uid, now },
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "paper-bearing",
      actor: "human",
      paperKey: PAPER.key,
      paperName: PAPER.name,
      reason: SAID,
    });
    for (const event of events) expect(validateEvent(event)).toEqual([]);
  });

  test("an empty sentence is not an answer, and the ledger says so", () => {
    const empty = {
      id: uid(),
      ts: now(),
      actor: "human",
      projectId: P,
      type: "paper-bearing",
      paperKey: PAPER.key,
      paperName: PAPER.name,
      reason: "   ",
    } as unknown as LedgerEvent;
    expect(validateEvent(empty)).toEqual(["paper-bearing.reason must be non-empty"]);
  });

  test("the projection reads the latest sentence per paper", () => {
    const first = bearingEvents(
      { projectId: P, paperKey: PAPER.key, paperName: PAPER.name, reason: "An early line." },
      { makeId: uid, now: () => 10 },
    );
    const second = bearingEvents(
      { projectId: P, paperKey: PAPER.key, paperName: PAPER.name, reason: SAID },
      { makeId: uid, now: () => 20 },
    );
    const events = [...first, ...second];
    expect(paperBearings(events, P).get(PAPER.key)?.reason).toBe(SAID);
    expect(bearingReasons(events, P).get(PAPER.key)).toBe(SAID);
    // Another study's answer about the same paper is another study's.
    expect(paperBearings(events, "p-other").size).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe("the reading the answer buys", () => {
  const ANSWER = [
    "This paper predicts nothing about a pre-seed cohort.",
    "FIT: misfit. It makes no prediction about a setting like yours.",
    "EXPECTS: Founders act once the uncertainty is bearable rather than resolved.",
    "SCOPE: entrepreneurs facing uncertainty",
    "CITE: [[chunk:c1]]",
  ].join("\n");

  const judged = async (bearing?: string) => {
    const client = new MockInferenceClient({ responses: [ANSWER] });
    const result = await judgePaperFit({
      paper: PAPER,
      context: studyContext(BRIEF),
      client,
      ...(bearing === undefined ? {} : { bearing }),
    });
    return { result, client };
  };

  test("with no answer from them, the paper drafts nothing", async () => {
    const { result, client } = await judged();
    expect(result?.fit).toBe("misfit");
    expect(result?.baselines).toEqual([]);
    expect(client.requests[0]?.system).toContain("On 'misfit', stop after that line");
    expect(client.requests[0]?.messages[0]?.content).not.toContain(BEARING_BLOCK_HEAD);
  });

  test("with their answer, the sentence is in the prompt in their words", async () => {
    const said = "It theorises judgement under uncertainty, which is what the mentors do.";
    const { client } = await judged(said);
    const sent = client.requests[0];
    expect(sent?.messages[0]?.content).toContain(BEARING_BLOCK_HEAD);
    expect(sent?.messages[0]?.content).toContain(said);
    /* The instruction that stops an unplaced paper producing expectations is
     * dropped, because what stopped it was that nobody had argued for the paper. */
    expect(sent?.system).not.toContain("stop after that line");
    expect(sent?.system).toContain("Take what they say as given");
  });

  test("and the paper keeps what it expects, whatever word came back", async () => {
    const said = "It theorises judgement under uncertainty.";
    const { result } = await judged(said);
    expect(result?.fit).toBe("misfit");
    expect(result?.baselines).toHaveLength(1);
    expect(result?.baselines[0]?.expectation).toBe(
      "Founders act once the uncertainty is bearable rather than resolved.",
    );
    // What the judgement was told, carried onto the record.
    expect(result?.bearing).toBe(said);
  });

  test("the instruction has one shape per case and the export is the no-answer one", () => {
    expect(FIT_SYSTEM).toBe(fitSystem({ bearing: false }));
    expect(fitSystem({ bearing: true })).not.toBe(FIT_SYSTEM);
  });

  test("one more reading per sentence they write, and not one per render", () => {
    const events = paperFitEvents({
      projectId: P,
      paper: PAPER,
      verdict: { fit: "misfit", reason: "No.", baselines: [], model: "m", modelVersion: "v" },
      framingDigest: "d",
      makeId: uid,
      now,
    });
    const verdicts = paperVerdicts(events, P);
    const due = (bearings: ReadonlyMap<string, string>) =>
      papersNeedingJudgement({ papers: [PAPER], verdicts, digest: "d", bearings }).length;
    // Nothing said, nothing moved: no call.
    expect(due(new Map())).toBe(0);
    // A sentence the standing verdict was not told about: one call.
    expect(due(new Map([[PAPER.key, "It theorises judgement."]]))).toBe(1);
    // And once the verdict carries that sentence, the diff settles again.
    const after = paperFitEvents({
      projectId: P,
      paper: PAPER,
      verdict: {
        fit: "misfit",
        reason: "No.",
        baselines: [],
        model: "m",
        modelVersion: "v",
        bearing: "It theorises judgement.",
      },
      framingDigest: "d",
      makeId: uid,
      now,
    });
    expect(
      papersNeedingJudgement({
        papers: [PAPER],
        verdicts: paperVerdicts([...events, ...after], P),
        digest: "d",
        bearings: new Map([[PAPER.key, "It theorises judgement."]]),
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

/**
 * Records written before M51, which is every study anybody has walked.
 *
 * The shipped example is the fixture. It holds four stored `paper-misfit`
 * findings, one of them against `mcmullen-shepherd-2006.pdf`, each carrying the
 * judge's own sentence: "makes no prediction about a setting like yours". The
 * events are untouched on the record and the reading is what changed, which is
 * how D9's set-aside and D41's withdrawals were both fixed.
 */
const BUNDLE = await Bun.file(
  new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname,
).json();

describe("the shipped example, read under the question", () => {
  const EVENTS: readonly LedgerEvent[] = BUNDLE.events;
  const ID: string = BUNDLE.project.id;

  test("the example still holds the stored rule, so this is not vacuous", () => {
    const stored = EVENTS.filter(
      (e) => e.type === "lint-finding" && (e as { rule: string }).rule === "paper-misfit",
    );
    expect(stored.length).toBeGreaterThan(0);
  });

  test("and the paper carries the question, because nobody has answered it", () => {
    const verdicts = paperVerdicts(EVENTS, ID);
    const bearings = paperBearings(EVENTS, ID);
    const upload = [...verdicts.values()].find((v) => v.paperName === "mcmullen-shepherd-2006.pdf");
    expect(upload?.verdict).toBe("misfit");
    expect(
      paperStanding({
        ...(upload === undefined ? {} : { verdict: upload }),
        ...(upload === undefined || bearings.get(upload.paperKey) === undefined
          ? {}
          : { bearing: bearings.get(upload.paperKey)! }),
      }),
    ).toBe("asking");
    // Which is the question, in the one place every surface reads it from.
    expect(BEARING_QUESTION).toBe("How does this paper relate to your setting?");
  });
});
