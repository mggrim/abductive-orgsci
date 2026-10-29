/**
 * Paper expectations, and what the tool does with it (M33).
 *
 * The owner's ask: "the paper assessment shouldn't just examine fit, it should
 * establish the baseline expectations from the literature and incorporate those
 * into the questioning that the tool performs."
 *
 * Six properties, each of which is a way the feature could look like it works
 * and be useless:
 *
 *   - The expectations are written on the call that already judges the paper.
 *     A second call would be a second derivation of one sentence, which is what
 *     produced the walk finding where a second press staged eight differently
 *     worded drafts of the same three expectations.
 *   - They are a field on the verdict, not an event of their own. A baseline is
 *     only true of the study its verdict judged.
 *   - They survive the researcher rewriting the line that named the paper.
 *   - The interviewer asks about them from the moment a paper is judged, rather
 *     than from the first accepted theory page.
 *   - A decline is two new events and never a rewrite.
 *   - The check counts one row per paper, not one per expectation.
 */

import { describe, expect, test } from "bun:test";
import { wait } from "./dom.ts";
import type { LedgerEvent, PaperBaseline, ProposalEvent } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief, type ProjectBrief } from "../src/state/projects.ts";
import {
  FIT_SYSTEM,
  citationKey,
  judgeArrivingPapers,
  judgePaperFit,
  paperFitEvents,
  papersNeedingJudgement,
  paperVerdicts,
  resetJudgementsInFlight,
  type PaperRef,
} from "../src/proposals/paperFit.ts";
import {
  BASELINES_ALLOWED,
  BASELINE_DECLINES,
  BASELINE_QUESTION,
  MAX_PER_PAPER,
  baselineDeclineEvents,
  baselineId,
  baselineRationale,
  baselineScopeLine,
  baselineTopic,
  baselinesSettled,
  expectationCounts,
  openBaselines,
  paperBaselines,
  parseBaselines,
  theoryBaselines,
  waitingBaselines,
} from "../src/proposals/baselines.ts";
import { extractTheoryClaims, parseFit } from "../src/proposals/theory.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import {
  countQuestions,
  divergenceErrors,
  generateMoves,
  quotedFrom,
} from "../src/interview/moves.ts";
import { proposedAnswerViolations } from "../src/interview/prompt.ts";
import { citableChunks } from "../src/interview/glean.ts";
import { topicLabel } from "../src/interview/topicLabel.ts";
import { paperFitLine } from "../src/views/paperFitLine.ts";
import { livePages, type OntologyGraph } from "../src/ontology/schema.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";
import { MATRIX } from "../src/matrix/matrix.ts";
import type { PageType } from "../src/ledger/events.ts";
import { projectInterview } from "../src/interview/state.ts";
import { projectProposals } from "../src/proposals/projection.ts";
import {
  draftSource,
  turnsAnsweringBaselines,
} from "../src/workbench/ProposalsTrayView.tsx";
import { adjudicateProposal, resetAdjudicationInFlight } from "../src/proposals/adjudicate.ts";

const P = "proj-m33";

let seq = 0;
const uid = () => `cccccccc-3333-4333-8333-${String((seq += 1)).padStart(12, "0")}`;
const now = () => 1_700_000_000_000 + (seq += 1);

const HANDOFFS: ProjectBrief = {
  ...emptyBrief(),
  startingInterest: "How night shifts hand patients over.",
  researchQuestion: "Why is the handover accepted without being understood?",
  context: "Two wards of a teaching hospital, across the night shift boundary.",
  seminalCorpus: "Bechky 2006, ASQ",
};

const PASSAGE: Chunk = {
  id: "c1",
  projectId: P,
  documentId: "d1",
  kind: "literature",
  text: "a passage",
  index: 0,
};

const DATA_PASSAGE: Chunk = {
  id: "cd",
  projectId: P,
  documentId: "data-1",
  kind: "transcript",
  text: "a night ward passage",
  index: 0,
};

const PAPER_DOC: StoredDocument = {
  id: "d1",
  projectId: P,
  name: "bechky-2006.pdf",
  kind: "literature",
  createdAt: 1,
  chunkCount: 1,
};

/** A graph, built the way every other suite builds one: by replaying events. */
const graphOf = (events: readonly LedgerEvent[] = []): OntologyGraph =>
  projectOntology(events, P);

const EMPTY: OntologyGraph = graphOf();

const created = (
  id: string,
  type: PageType,
  title: string,
  chunks: readonly string[] = [],
): LedgerEvent =>
  ({
    id: uid(),
    ts: now(),
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    title,
    body: "As the researcher restated it.",
    origin: "literature-derived",
    supportingChunks: chunks,
  }) as LedgerEvent;

/* M69, ISC-644: the canned reply keeps the owner's rules ("the sender times the
 * exchange" for the agentless "the exchange is timed"), so the voice retry does
 * not fire and the one-call tests below still count one call. */
const ANSWER = [
  "FIT: fits. It expects handovers to fail where the receiver cannot question the sender.",
  "",
  "EXPECTS: Handoffs fail when the receiving clinician cannot question the sender.",
  "SCOPE: where the sender times the exchange and status differences are large",
  "CITE: [[chunk:c1]]",
  "---",
  "EXPECTS: Shared understanding is built by asking, not by handing over a form.",
  "SCOPE: on wards where the form is the only record",
  "CITE: [[chunk:c1]]",
].join("\n");

const PAPER: PaperRef = { key: "d1", name: "bechky-2006.pdf", chunks: [PASSAGE] };

async function judge(answer = ANSWER, paper: PaperRef = PAPER, brief = HANDOFFS) {
  return judgePaperFit({
    paper,
    context: studyContext(brief),
    client: new MockInferenceClient({ responses: [answer] }),
  });
}

const fit = (
  paperKey: string,
  paperName: string,
  baselines: readonly PaperBaseline[],
  verdict: "fits" | "unclear" | "misfit" = "fits",
): LedgerEvent =>
  ({
    id: uid(),
    ts: now(),
    actor: "system",
    projectId: P,
    model: "m",
    modelVersion: "v",
    type: "paper-fit",
    paperKey,
    paperName,
    verdict,
    reason: "It expects something about a setting like yours.",
    framingDigest: "digest-1",
    baselines,
  }) as LedgerEvent;

const B = (id: string, expectation: string, chunkId?: string): PaperBaseline => ({
  id,
  expectation,
  scope: "on shift work and not in surgery",
  ...(chunkId === undefined ? {} : { chunkId }),
});

// ---------------------------------------------------------------------------
// 1. The event shape
// ---------------------------------------------------------------------------

describe("a baseline is a field on the verdict that judged the paper", () => {
  test("the event validates, and every part of a baseline is required", () => {
    const good = fit("d1", "bechky-2006.pdf", [B("d1#0", "Handoffs fail without a question back", "c1")]);
    expect(validateEvent(good)).toEqual([]);

    const noId = { ...good, baselines: [{ expectation: "x", scope: "y" }] };
    expect(validateEvent(noId)).toContain("paper-fit.baselines[0].id must be non-empty");
    const noScope = { ...good, baselines: [{ id: "a", expectation: "x", scope: "  " }] };
    expect(validateEvent(noScope)).toContain("paper-fit.baselines[0].scope must be non-empty");
    const noExpectation = { ...good, baselines: [{ id: "a", expectation: "", scope: "y" }] };
    expect(validateEvent(noExpectation)).toContain(
      "paper-fit.baselines[0].expectation must be non-empty",
    );
    /* A blank citation is not the same as none: a page carrying an empty
     * passage id cites something nothing can resolve. */
    const blankCite = { ...good, baselines: [{ id: "a", expectation: "x", scope: "y", chunkId: "" }] };
    expect(validateEvent(blankCite)).toContain(
      "paper-fit.baselines[0].chunkId must be non-empty when present",
    );
    expect(validateEvent({ ...good, baselines: "three" })).toContain(
      "paper-fit.baselines must be an array when present",
    );
  });

  test("an event written before the field existed is valid, and reads as unasked", () => {
    /* The record appends and is never rewritten. A verdict reached before M33
     * has no baselines and no later pass may give it any.
     *
     * M33 fix: it reads as absent rather than as an empty list, and the walk is
     * why. Collapsing the two put "This paper expects nothing about a setting
     * like yours" under Bechky 2003, which fits and had simply never been asked
     * what it expects. Absent means unasked; empty means asked and the answer
     * was none. */
    const old = { ...(fit("d1", "bechky-2006.pdf", []) as object) } as Record<string, unknown>;
    delete old.baselines;
    expect(validateEvent(old)).toEqual([]);
    const read = paperVerdicts([old as unknown as LedgerEvent], P).get("d1");
    expect(read?.verdict).toBe("fits");
    expect(read?.baselines).toBeUndefined();
    // And a judged paper that expects nothing keeps its empty list.
    expect(paperVerdicts([fit("d2", "grodal.pdf", [])], P).get("d2")?.baselines).toEqual([]);
  });

  test("a verdict that predates the field is due for judging, however current its framing", () => {
    /* The other half of the same fix. The row can only stop saying "expects
     * nothing" if something asks, and nothing was: the diff looked at the
     * framing digest alone, and that verdict's digest was current. */
    const digest = "digest-1";
    const unasked = { ...(fit("d1", "bechky-2006.pdf", []) as object) } as Record<string, unknown>;
    delete unasked.baselines;
    const verdicts = paperVerdicts([unasked as unknown as LedgerEvent, fit("d2", "grodal.pdf", [])], P);
    const due = papersNeedingJudgement({
      papers: [
        { key: "d1", name: "bechky-2006.pdf" },
        { key: "d2", name: "grodal.pdf" },
      ],
      verdicts,
      digest,
    });
    // The one nobody asked, and not the one that was asked and said nothing.
    expect(due.map((p) => p.key)).toEqual(["d1"]);
  });

  test("the verdict and its expectations are one event, so they cannot disagree", () => {
    const written = paperFitEvents({
      projectId: P,
      paper: PAPER,
      verdict: {
        fit: "fits",
        reason: "It speaks to handovers.",
        baselines: [B("d1#0", "Handoffs fail without a question back", "c1")],
        model: "m",
        modelVersion: "v",
      },
      framingDigest: "digest-1",
      makeId: uid,
      now,
    });
    // No second event about this paper: not a `paper-baseline`, not a draft.
    expect(written.filter((e) => e.type === "paper-fit")).toHaveLength(1);
    expect(written.some((e) => e.type === "proposal")).toBe(false);
    for (const e of written) expect(validateEvent(e)).toEqual([]);
  });

  test("the passages the judge was shown, and the one it cited, are on the record", () => {
    /* Attention moved with the reading. The judge is the only thing left in the
     * papers path that puts a passage in front of a model, so both layers are
     * written here or the coverage map goes blank for the literature. */
    const written = paperFitEvents({
      projectId: P,
      paper: PAPER,
      verdict: {
        fit: "fits",
        reason: "",
        baselines: [B("d1#0", "Handoffs fail without a question back", "c1")],
        model: "m",
        modelVersion: "v",
      },
      framingDigest: "digest-1",
      makeId: uid,
      now,
    });
    const attention = written.filter((e) => e.type === "attention") as {
      layer: string;
      chunkId: string;
    }[];
    expect(attention.map((a) => `${a.layer}:${a.chunkId}`)).toEqual([
      "retrieval:c1",
      "citation:c1",
    ]);
  });

  test("the model that wrote the expectations is named on the event", () => {
    // The tool's central promise is attribution, and anything staged out of a
    // baseline is stamped `persona:reader`, which the ledger will not accept
    // without a model. The chain has to start here.
    const written = paperFitEvents({
      projectId: P,
      paper: { key: "d1", name: "x.pdf" },
      verdict: { fit: "fits", reason: "", baselines: [], model: "sonnet", modelVersion: "5" },
      framingDigest: "d",
      makeId: uid,
      now,
    });
    const marker = written.find((e) => e.type === "paper-fit") as { model?: string };
    expect(marker.model).toBe("sonnet");
    expect(paperVerdicts(written, P).get("d1")?.model).toBe("sonnet");
  });
});

// ---------------------------------------------------------------------------
// 2. The judge writes them
// ---------------------------------------------------------------------------

describe("the judge writes what the paper expects, on the call it already makes", () => {
  test("one call, and both the verdict and the expectations come off it", async () => {
    const client = new MockInferenceClient({ responses: [ANSWER] });
    const verdict = await judgePaperFit({ paper: PAPER, context: studyContext(HANDOFFS), client });
    expect(client.requests).toHaveLength(1);
    expect(verdict?.fit).toBe("fits");
    expect(verdict?.baselines).toHaveLength(2);
    expect(verdict?.baselines[0]?.expectation).toBe(
      "Handoffs fail when the receiving clinician cannot question the sender.",
    );
    expect(verdict?.baselines[0]?.scope).toBe(
      "where the sender times the exchange and status differences are large",
    );
    expect(verdict?.baselines[0]?.chunkId).toBe("c1");
  });

  test("the passages reach the prompt, which is what makes a citation possible", async () => {
    const client = new MockInferenceClient({ responses: [ANSWER] });
    await judgePaperFit({ paper: PAPER, context: studyContext(HANDOFFS), client });
    const sent = client.requests[0]?.messages[0]?.content ?? "";
    expect(sent).toContain("[[chunk:c1]] (#0)");
    expect(sent).toContain("a passage");
    // The study is still first: the first question asked is whether the paper
    // belongs to it, and a reader handed the paper first reads the paper first.
    expect(sent.indexOf("night shift")).toBeLessThan(sent.indexOf("# The paper you are judging"));
  });

  test("a typed line is told there is no file, and never invents a citation", async () => {
    const client = new MockInferenceClient({
      responses: [
        [
          "FIT: fits. Yes.",
          "EXPECTS: Proximity is what builds trust.",
          "SCOPE: in co-located teams",
          "CITE: from your typed list, without a source file",
        ].join("\n"),
      ],
    });
    const verdict = await judgePaperFit({
      paper: { key: "bechky 2006", name: "Bechky 2006, ASQ" },
      context: studyContext(HANDOFFS),
      client,
    });
    const sent = client.requests[0]?.messages[0]?.content ?? "";
    expect(sent).toContain("from your typed list, without a source file");
    expect(sent).not.toContain("# Passages");
    expect(verdict?.baselines[0]?.chunkId).toBeUndefined();
  });

  test("the allowance follows the verdict, and a misfit is written none", async () => {
    expect(BASELINES_ALLOWED).toEqual({ fits: MAX_PER_PAPER, unclear: 1, misfit: 0 });
    /* Zero rather than one, which is where this differs from the reader's old
     * draft allowance. Pressing the button on a flagged paper is the researcher
     * overriding the verdict; arrival is not, so the tool does not put its
     * doubt about a paper and its expectations of that paper on one row. */
    const misfit = await judge(
      ANSWER.replace("FIT: fits.", "FIT: misfit."),
    );
    expect(misfit?.baselines).toEqual([]);
    const unclear = await judge(ANSWER.replace("FIT: fits.", "FIT: unclear."));
    expect(unclear?.baselines).toHaveLength(1);
  });

  test("a citation to another paper is dropped and the expectation stands", () => {
    const parsed = parseBaselines(
      ["EXPECTS: Handoffs fail.", "SCOPE: on nights", "CITE: [[chunk:other]]"].join("\n"),
      { paperKey: "d1", allowed: 3, ownChunks: new Set(["c1"]) },
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.chunkId).toBeUndefined();
  });

  test("an id follows the sentence, so an answer keeps pointing at what it answered", () => {
    /* Derived from the words rather than the position, which is what makes a
     * re-judgement safe. A framing change re-judges every paper, and under a
     * positional id the new first expectation would inherit the decline given
     * against a different sentence: the row would show a turned-down notice
     * under a claim the researcher had never seen. */
    const first = parseBaselines(ANSWER, { paperKey: "d1", allowed: 3, ownChunks: new Set(["c1"]) });
    const second = parseBaselines(ANSWER, { paperKey: "d1", allowed: 3, ownChunks: new Set(["c1"]) });
    expect(first.map((b) => b.id)).toEqual(second.map((b) => b.id));
    // Same words, same id, whatever order they arrive in and whatever scope or
    // passage came with them: a re-judgement that reaches the same expectation
    // keeps the answer that was given to it.
    expect(baselineId("d1", "Handoffs fail.")).toBe(baselineId("d1", "  handoffs   FAIL. "));
    expect(baselineId("d1", "Handoffs fail.")).not.toBe(baselineId("d1", "Handoffs hold."));
    // And the paper is part of it, so two papers expecting the same thing are
    // two expectations the researcher answers separately.
    expect(baselineId("d1", "Handoffs fail.")).not.toBe(baselineId("d2", "Handoffs fail."));
  });

  test("a re-judgement that changes an expectation does not inherit its answer", () => {
    const before = parseBaselines(
      ["EXPECTS: Handoffs fail without a question back.", "SCOPE: on nights"].join("\n"),
      { paperKey: "d1", allowed: 3 },
    );
    const after = parseBaselines(
      ["EXPECTS: Handoffs succeed when the form is complete.", "SCOPE: on nights"].join("\n"),
      { paperKey: "d1", allowed: 3 },
    );
    expect(after[0]?.id).not.toBe(before[0]?.id);
  });

  test("one paper saying the same thing twice is one expectation", () => {
    const twice = [
      "EXPECTS: Handoffs fail.",
      "SCOPE: on nights",
      "---",
      "EXPECTS: Handoffs fail.",
      "SCOPE: on days",
    ].join("\n");
    expect(parseBaselines(twice, { paperKey: "d1", allowed: 3 })).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 3. Surviving an edit to the typed line
// ---------------------------------------------------------------------------

describe("expectations survive the researcher rewriting the line that named the paper", () => {
  test("the citation key is what they are held under, so a rewrite keeps them", () => {
    /* "Bechky 2006, ASQ" becoming "Bechky, B. 2006, Organization Science" is
     * the same paper, and it keys the same. ISC-445 already holds this for the
     * verdict; the expectations ride on the same event. */
    const key = citationKey("Bechky 2006, ASQ");
    expect(key).toBe("bechky 2006");
    expect(citationKey("Bechky, B. 2006, Organization Science")).toBe(key);

    const events = [fit(key, "Bechky 2006, ASQ", [B(`${key}#0`, "Boundaries harden")])];
    // The study now names the rewritten line. The key is unchanged, so the
    // expectations are still there and still countable.
    const live = new Set([citationKey("Bechky, B. 2006, Organization Science")]);
    expect(paperBaselines(events, P, live).get(key)?.baselines).toHaveLength(1);
  });

  test("a line with no year orphans its expectations, which is existing behaviour", () => {
    /* A line with no year is keyed on its whole text, because the tool cannot
     * identify it any better than by its words. The events stay on the record;
     * what is withdrawn is their eligibility to be counted, exactly as the
     * verdict's is. An answer already given against one stays on the record
     * pointing at a dead key, which is correct for a record that appends. */
    const key = citationKey("Something I read once");
    const events = [fit(key, "Something I read once", [B(`${key}#0`, "It matters")])];
    const live = new Set([citationKey("Something else I read once")]);
    expect(paperBaselines(events, P, live).size).toBe(0);
    // Still on the record, unedited.
    expect(paperBaselines(events, P).get(key)?.baselines).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 4. The questioning
// ---------------------------------------------------------------------------

describe("the interviewer asks about an expectation from the moment a paper is judged", () => {
  const ctx = (baselines: readonly { id: string; paperName: string; expectation: string; scope: string }[]) => ({
    graph: graphOf([created("pz", "puzzle", "Handovers are accepted without being understood")]),
    state: projectInterview([], P),
    coveredCells: [],
    matrix: MATRIX,
    turnIndex: 0,
    baselines,
  });

  const OPEN = [
    {
      id: "d1#0",
      paperName: "Bechky 2006",
      expectation: "Handoffs fail when the receiving clinician cannot question the sender.",
      scope: "where the sender times the exchange",
    },
    {
      id: "d1#1",
      paperName: "Bechky 2006",
      expectation: "Shared understanding is built by asking.",
      scope: "on wards where the form is the only record",
    },
  ];

  test("it speaks with no theory page in the model, which is the gate that lifted", () => {
    /* The literature source was gated on the first accepted theory page, so it
     * was silent through the whole early period of a study. A baseline exists
     * from the moment a paper is judged, which is the moment it can be put. */
    const moves = generateMoves(ctx(OPEN));
    const move = moves.find((m) => m.topic === baselineTopic("d1#0"));
    expect(move).toBeDefined();
    expect(move?.question).toBe(BASELINE_QUESTION);
    expect(move?.rationale).toBe(baselineRationale("Bechky 2006"));
    expect(move?.targetId).toBe("d1#0");
    expect(move?.source).toBe("literature");
  });

  test("one candidate per turn, the first in list order", () => {
    // Three expectations from one paper offered side by side is not a choice,
    // and `divergenceErrors` would reject them anyway for sharing a target.
    const moves = generateMoves(ctx(OPEN));
    const baselineMoves = moves.filter((m) => m.topic.startsWith("literature:baseline:"));
    expect(baselineMoves).toHaveLength(1);
    expect(baselineMoves[0]?.targetId).toBe("d1#0");
  });

  test("it asks exactly one question and supplies no part of the answer", () => {
    const moves = generateMoves(ctx(OPEN));
    const move = moves.find((m) => m.topic === baselineTopic("d1#0"));
    expect(countQuestions(move?.question ?? "")).toBe(1);
    expect(divergenceErrors(moves)).toEqual([]);
    /* The expectation sits in the quote and the rationale, never in the prompt,
     * so `assembleTurnPrompt`'s scan is untouched. Both are checked anyway,
     * because the rationale is what the researcher reads under the question. */
    expect(proposedAnswerViolations(move?.question ?? "")).toEqual([]);
    expect(proposedAnswerViolations(move?.rationale ?? "")).toEqual([]);
  });

  test("the expectation is quoted above the question, attributed to the paper", () => {
    const move = generateMoves(ctx(OPEN)).find((m) => m.topic === baselineTopic("d1#0"));
    expect(move?.quoted).toEqual({
      text: "Handoffs fail when the receiving clinician cannot question the sender.",
      source: "Bechky 2006",
    });
    // Named as the paper's, never as the researcher's.
    expect(quotedFrom("Bechky 2006")).toBe("What Bechky 2006 expects");
  });

  test("an answered or declined expectation is not asked about again", () => {
    const events: LedgerEvent[] = [
      fit("d1", "Bechky 2006", [B("d1#0", "First"), B("d1#1", "Second")]),
      ...baselineDeclineEvents(
        { projectId: P, baselineId: "d1#0", paperName: "Bechky 2006", decline: "not-what-it-says" },
        { makeId: uid, now },
      ),
    ];
    const settled = baselinesSettled(events, P);
    const open = openBaselines(paperBaselines(events, P), settled);
    expect(open.map((o) => o.baseline.id)).toEqual(["d1#1"]);
  });

  test("a station probe still outranks it, so the loop stays in the room", () => {
    // Station probes keep absolute priority: a baseline question never
    // displaces the step the researcher is standing on.
    const moves = generateMoves({
      ...ctx(OPEN),
      station: "context",
      brief: HANDOFFS,
      chunkCount: 0,
    });
    expect(moves[0]?.source).toBe("station");
    expect(moves.some((m) => m.topic.startsWith("literature:baseline:"))).toBe(true);
  });

  test("the topic renders as words, never as a paper key and a number", () => {
    expect(topicLabel(baselineTopic("d1#0"))).toBe("what one of your papers expects");
  });
});

// ---------------------------------------------------------------------------
// 5. The glean path
// ---------------------------------------------------------------------------

describe("an answer to an expectation goes through the door like any other", () => {
  test("the record says which expectation an answer answered", async () => {
    /* The link from the observation back to the baseline is M31's (ISC-443).
     * What ships here is the record of it: the move carries the baseline id and
     * the question-selection event carries the topic, so a reader can say which
     * expectation the answer was given against. */
    const question: LedgerEvent = {
      id: "q-1",
      ts: now(),
      actor: "human",
      projectId: P,
      type: "question-selection",
      moveId: `${baselineTopic("d1#0")}@1`,
      topic: baselineTopic("d1#0"),
      question: BASELINE_QUESTION,
      alternatives: [],
      mode: "interrogation",
      reason: baselineRationale("Bechky 2006"),
    } as LedgerEvent;
    const answer: LedgerEvent = {
      id: uid(),
      ts: now(),
      actor: "human",
      projectId: P,
      type: "response",
      text: "They ask about the form.",
      inReplyTo: "q-1",
    } as LedgerEvent;
    const settled = baselinesSettled([question, answer], P);
    expect([...settled.answered]).toEqual(["d1#0"]);
    expect(settled.declined.size).toBe(0);
  });

  test("the interviewer's own delivery of the question does not count as an answer", () => {
    // It carries the same `inReplyTo` so the transcript threads. Counting it
    // would mark every expectation answered the instant it was asked.
    const question: LedgerEvent = {
      id: "q-1",
      ts: now(),
      actor: "human",
      projectId: P,
      type: "question-selection",
      moveId: "m",
      topic: baselineTopic("d1#0"),
      question: BASELINE_QUESTION,
      alternatives: [],
      mode: "interrogation",
      reason: "r",
    } as LedgerEvent;
    const delivery: LedgerEvent = {
      id: uid(),
      ts: now(),
      actor: "persona:interviewer",
      projectId: P,
      model: "m",
      modelVersion: "v",
      type: "response",
      text: BASELINE_QUESTION,
      inReplyTo: "q-1",
    } as LedgerEvent;
    expect(baselinesSettled([question, delivery], P).answered.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Turning one down
// ---------------------------------------------------------------------------

describe("a decline is two new events and never a rewrite", () => {
  test("the three reasons, their kinds and the notes they write", () => {
    expect(BASELINE_DECLINES.map((d) => [d.label, d.kind, d.note])).toEqual([
      [
        "The paper doesn't say this",
        "wont-answer",
        "You said the paper doesn't state this expectation.",
      ],
      [
        "This expectation doesn't apply to my setting",
        "wont-answer",
        "You said this expectation doesn't apply to your setting.",
      ],
      ["Not yet", "not-now", "You haven't decided yet."],
    ]);
  });

  test("it appends a question and a refusal together, and touches nothing else", () => {
    const before = fit("d1", "Bechky 2006", [B("d1#0", "Handoffs fail")]);
    const written = baselineDeclineEvents(
      { projectId: P, baselineId: "d1#0", paperName: "Bechky 2006", decline: "not-what-it-says" },
      { makeId: uid, now },
    );
    expect(written.map((e) => e.type)).toEqual(["question-selection", "refusal"]);
    expect(written[0]?.topic).toBe(baselineTopic("d1#0"));
    expect(written[1]?.questionEventId).toBe(written[0]?.id);
    expect(written[1]?.kind).toBe("wont-answer");
    for (const e of written) expect(validateEvent(e)).toEqual([]);
    /* Nothing is deleted and the event that holds the expectation is not
     * rewritten: a decline is what the researcher said about the paper, not a
     * correction of what the paper expects. */
    const after = [before, ...written].filter((e) => e.type === "paper-fit");
    expect(after).toHaveLength(1);
    expect(after[0] as LedgerEvent).toBe(before);
    expect(paperBaselines([before, ...written], P).get("d1")?.baselines).toHaveLength(1);
  });

  test("the deferral and the decision stay distinguishable on the record", () => {
    // Three of either silences the topic, and silencing on a postponement is
    // the tool giving up early where silencing on a decision is right.
    const deferred = baselineDeclineEvents(
      { projectId: P, baselineId: "d1#0", paperName: "x", decline: "not-yet" },
      { makeId: uid, now },
    );
    expect(deferred[1]?.kind).toBe("not-now");
    expect(deferred[1]?.note).toBe("You haven't decided yet.");
  });

  test("a declined expectation is not staged as a draft", () => {
    const events = [fit("d1", "Bechky 2006", [B("d1#0", "First", "c1"), B("d1#1", "Second", "c1")])];
    const staged = extractTheoryClaims({
      projectId: P,
      documents: [PAPER_DOC],
      chunks: [PASSAGE],
      verdicts: paperVerdicts(events, P),
      declined: new Set(["d1#0"]),
      makeId: uid,
      now,
    });
    expect(staged.proposals.map((p) => p.title)).toEqual(["Second"]);
  });
});

// ---------------------------------------------------------------------------
// 7. The button
// ---------------------------------------------------------------------------

describe("the control stages what the papers expect and spends no call", () => {
  test("it stages one draft per undeclined expectation, through the door", async () => {
    resetAdjudicationInFlight();
    const events = [fit("d1", "bechky-2006.pdf", [B("d1#0", "Handoffs fail without a question back", "c1")])];
    const staged = extractTheoryClaims({
      projectId: P,
      documents: [PAPER_DOC],
      chunks: [PASSAGE],
      verdicts: paperVerdicts(events, P),
      makeId: uid,
      now,
    });
    // A draft, not a mutation. The proposal door is the only writer.
    expect(staged.events.every((e) => e.type === "proposal")).toBe(true);
    const draft = staged.proposals[0];
    expect(draft?.pageType).toBe("theory");
    expect(draft?.originOnAccept).toBe("literature-derived");
    expect(draft?.paperKey).toBe("d1");
    expect(draft?.title).toBe("Handoffs fail without a question back");
    expect(draft?.body).toContain(baselineScopeLine("on shift work and not in surgery"));
    expect(draft?.sourceChunks).toEqual(["c1"]);
    for (const e of staged.events) expect(validateEvent(e)).toEqual([]);

    const store: LedgerEvent[] = [...events, ...staged.events];
    const proposalId = projectProposals(store, P).pending[0]?.id ?? "";
    const outcome = await adjudicateProposal(
      { projectId: P, proposalId, disposition: "accept" },
      {
        appendAll: async (batch: readonly LedgerEvent[]) => {
          store.push(...batch);
        },
        readEvents: async () => [...store],
      },
    );
    expect(outcome.kind).toBe("recorded");
  });

  test("pressing twice cannot produce a differently-worded copy", () => {
    /* The walk finding, gone by construction. There is one derivation, made
     * when the paper was judged, so a second press either stages the same title
     * again, which the tray guard refuses, or stages nothing. */
    const events = [fit("d1", "bechky-2006.pdf", [B("d1#0", "Handoffs fail", "c1")])];
    const input = {
      projectId: P,
      documents: [PAPER_DOC],
      chunks: [PASSAGE],
      verdicts: paperVerdicts(events, P),
      makeId: uid,
      now,
    };
    const first = extractTheoryClaims(input);
    const second = extractTheoryClaims({
      ...input,
      existingTitles: first.proposals.map((p) => p.title),
    });
    expect(first.proposals).toHaveLength(1);
    expect(second.proposals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8. defender-bar
// ---------------------------------------------------------------------------

describe("a theory page's paper is the one it cites", () => {
  const MODEL: readonly LedgerEvent[] = [
    created("pz", "puzzle", "Handovers are accepted without being understood", ["cd"]),
    created("th", "theory", "Handoffs need a question back", ["c1"]),
    {
      id: uid(),
      ts: now(),
      actor: "human",
      projectId: P,
      type: "ontology-mutation",
      op: "relate",
      targetId: "pz~th",
      edge: { from: "pz", to: "th", role: "stands-to" },
      puzzleRelation: "contradicts",
      origin: "author-prior",
    } as LedgerEvent,
  ];

  const graph = (): OntologyGraph => graphOf(MODEL);

  test("the link from a page to its paper is the citation, and nothing is invented", () => {
    const events = [fit("d1", "bechky-2006.pdf", [B("d1#0", "Handoffs fail", "c1")])];
    const found = theoryBaselines({
      events,
      projectId: P,
      pages: livePages(graph()),
      chunks: [PASSAGE, DATA_PASSAGE],
    });
    expect([...found.keys()]).toEqual(["th"]);
    // The puzzle cites the researcher's own data, and no paper is attached to
    // it. A theory page the researcher wrote themselves gets nothing.
    expect(found.get("pz")).toBeUndefined();
  });
});

/* M87, ISC-722: the `paper-never-engaged` branch that read these counts went
 * with the rule (the owner, 2026-10-14). */

// ---------------------------------------------------------------------------
// 10. The Design band
// ---------------------------------------------------------------------------

describe("the fit row absorbs the count rather than adding a third row", () => {
  test("it is the fit summary with one sentence after it", () => {
    /* M51, ISC-533: the count says how many papers have been read, where it used
       to say how many fit and how many did not. */
    expect(paperFitLine({ fits: 3, unclear: 0, misfit: 1 }, 7)).toBe(
      "4 papers read. You haven't answered 7 things the papers expect.",
    );
  });

  test("nothing waiting leaves the line exactly as it was", () => {
    expect(paperFitLine({ fits: 3, unclear: 0, misfit: 1 }, 0)).toBe("4 papers read");
  });

  test("one thing waiting reads as one thing", () => {
    expect(paperFitLine({ fits: 1, unclear: 0, misfit: 0 }, 1)).toBe(
      "1 paper read. You haven't answered 1 thing the papers expect.",
    );
  });

  test("the counts and the waiting come from the same live set of papers", () => {
    const events = [fit("d1", "Bechky 2006", [B("d1#0", "First"), B("d1#1", "Second")])];
    const settled = baselinesSettled(events, P);
    // The paper the study still names.
    expect(openBaselines(paperBaselines(events, P, new Set(["d1"])), settled)).toHaveLength(2);
    // A line the researcher edited away takes its expectations with it, the
    // same way it takes its verdict.
    expect(openBaselines(paperBaselines(events, P, new Set(["d2"])), settled)).toHaveLength(0);
  });

  test("the per-paper counts are the counts the band reads", () => {
    const events = [fit("d1", "Bechky 2006", [B("d1#0", "First"), B("d1#1", "Second")])];
    const settled = baselinesSettled(events, P);
    const paper = paperBaselines(events, P).get("d1");
    expect(expectationCounts(events, P).get("d1")).toEqual({
      paperName: "Bechky 2006",
      total: 2,
      waiting: 2,
    });
    expect(waitingBaselines(paper as never, settled)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 11. The walk finding: a verdict that predates the expectations field
// ---------------------------------------------------------------------------

describe("a paper judged before the tool asked what it expects", () => {
  /** The shape the walk found: a current verdict with no baselines field. */
  const unasked = (key: string, name: string): LedgerEvent => {
    const e = { ...(fit(key, name, []) as object) } as Record<string, unknown>;
    delete e.baselines;
    return e as unknown as LedgerEvent;
  };

  test("its row says nobody has asked, not that the paper expects nothing", () => {
    /* Bechky 2003 read "fits your setting", with the reason under it, and then
     * "This paper expects nothing about a setting like yours". The first is
     * true and the second was the tool reporting an absence it had not looked
     * for. The row now says what would fill it in, which is the sentence a
     * paper nobody has judged already had. */
    const verdict = paperVerdicts([unasked("d1", "bechky-2003.pdf")], P).get("d1");
    expect(verdict?.verdict).toBe("fits");
    expect(verdict?.baselines).toBeUndefined();
  });

  test("a misfit still reads as expecting nothing, because it was asked", () => {
    // Zero is a misfit's allowance and a real answer about a paper. Grodal read
    // correctly on the walk and must keep reading correctly.
    const misfit = paperVerdicts([fit("d2", "grodal-2026.pdf", [], "misfit")], P).get("d2");
    expect(misfit?.verdict).toBe("misfit");
    expect(misfit?.baselines).toEqual([]);
  });

  test("nothing stages from it, and nothing is left unanswered", () => {
    // It holds no expectations, so there is nothing to put in the tray and
    // nothing the researcher has failed to answer.
    const events = [unasked("d1", "bechky-2003.pdf")];
    const staged = extractTheoryClaims({
      projectId: P,
      documents: [{ ...PAPER_DOC, name: "bechky-2003.pdf" }],
      chunks: [PASSAGE],
      verdicts: paperVerdicts(events, P),
      makeId: uid,
      now,
    });
    expect(staged.proposals).toEqual([]);
    expect(expectationCounts(events, P).get("d1")?.waiting ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 12. Judging when a surface opens
// ---------------------------------------------------------------------------

describe("the surfaces that show verdicts ask for what is due when they open", () => {
  const src = (path: string) => Bun.file(new URL(`../src/${path}`, import.meta.url).pathname).text();

  test("both of them ask, through the one hook", async () => {
    /* Judging used to run on three arrivals and one framing save, all of them
     * something the researcher does. That is right for a paper arriving and
     * wrong for the tool changing under them, which is what the baselines field
     * and the framing digest both did in one week: a paper was left stale with
     * nothing on any screen to say so and no way to fix it but to retype the
     * framing and save. */
    for (const file of ["flow/SeminalCorpus.tsx", "flow/FramingBand.tsx"]) {
      expect({ file, asks: (await src(file)).includes("useJudgeOnMount(") }).toEqual({
        file,
        asks: true,
      });
    }
  });

  test("one judge at a time, across both surfaces", async () => {
    // The loop is keyed by study and lives at module scope, which is what stops
    // Material and Design both opening from putting two judgements of one paper
    // on the record. The walk caught that race at 17:01:54 and 17:01:57.
    const hook = await src("flow/usePaperFit.ts");
    expect(hook).toContain("const LOOPS = new Map<string, SaveLoop>()");
    expect(hook).toContain("await serialise(loopFor(projectId)");
  });

  test("it costs no model call when every paper is current", () => {
    // The whole reason this can run on every open. `papersNeedingJudgement` is
    // a pure diff over the record, so a study with nothing due spends nothing.
    const current = paperVerdicts([fit("d1", "bechky-2006.pdf", [B("d1#0", "Handoffs fail")])], P);
    expect(
      papersNeedingJudgement({
        papers: [{ key: "d1", name: "bechky-2006.pdf" }],
        verdicts: current,
        digest: "digest-1",
      }),
    ).toEqual([]);
  });

  test("nothing is judged, and nothing claims to be judging, with no model connected", async () => {
    /* With nothing connected `activeInferenceClient` hands back a mock, and the
     * loop was recording what it said as a judgement about the researcher's
     * reading list. It mattered less while judging ran only on a save they
     * made; it runs when the page opens now. */
    const hook = await src("flow/usePaperFit.ts");
    expect(hook).toContain("const { client, live } = activeInferenceClient();");
    expect(hook).toContain("if (!live) return false;");
    // And the chip does not say the tool is working when it is not.
    expect(await src("flow/SeminalCorpus.tsx")).toContain("if (!judgingAvailable()) return;");
  });
});

// ---------------------------------------------------------------------------
// 13. Each paper's answer reaches the record as it is judged
// ---------------------------------------------------------------------------

describe("a judging pass writes as it goes, not after the last paper", () => {
  const brief: ProjectBrief = {
    ...emptyBrief(),
    startingInterest: "How night shifts hand patients over",
    researchQuestion: "I expected a shared picture and found a shared form",
    context: "Two wards of a teaching hospital",
  };

  const answer = [
    "FIT: fits. It speaks to handovers.",
    "EXPECTS: Handoffs fail when the receiver cannot question the sender.",
    "SCOPE: where the sender times the exchange",
  ].join("\n");

  /** Three papers, and a client that records when each call is made. */
  function pass(onJudged?: (events: readonly LedgerEvent[]) => Promise<void>) {
    let calls = 0;
    return judgeArrivingPapers({
      projectId: P,
      papers: [
        { key: "d1", name: "one.pdf" },
        { key: "d2", name: "two.pdf" },
        { key: "d3", name: "three.pdf" },
      ],
      context: studyContext(brief),
      events: [],
      client: {
        complete: async () => {
          calls += 1;
          return { text: answer, model: "m", modelVersion: "v" };
        },
      } as never,
      makeId: uid,
      now,
      ...(onJudged === undefined ? {} : { onJudged }),
    }).then((written) => ({ written, calls }));
  }

  test("a paper's verdict is handed over before the next paper is asked", async () => {
    /* The live defect. Everything used to be returned in one array at the end,
     * so three papers meant three model calls and nothing on the record until
     * the third came back. The walk read the page forty seconds after opening
     * it, saw no new event, and concluded the judge had not run at all. */
    const seenAfter: number[] = [];
    let calls = 0;
    await judgeArrivingPapers({
      projectId: P,
      papers: [
        { key: "d1", name: "one.pdf" },
        { key: "d2", name: "two.pdf" },
        { key: "d3", name: "three.pdf" },
      ],
      context: studyContext(brief),
      events: [],
      client: {
        complete: async () => {
          calls += 1;
          return { text: answer, model: "m", modelVersion: "v" };
        },
      } as never,
      makeId: uid,
      now,
      onJudged: async () => {
        // How many calls had been made when this paper's answer was handed
        // over. One, then two, then three: written as it goes.
        seenAfter.push(calls);
      },
    });
    expect(seenAfter).toEqual([1, 2, 3]);
  });

  test("what is handed over is that paper's own events, and they are valid", async () => {
    const batches: (readonly LedgerEvent[])[] = [];
    await pass(async (events) => {
      batches.push(events);
    });
    expect(batches).toHaveLength(3);
    for (const batch of batches) {
      const markers = batch.filter((e) => e.type === "paper-fit");
      expect(markers).toHaveLength(1);
      for (const event of batch) expect(validateEvent(event)).toEqual([]);
    }
    expect(
      batches.flatMap((b) => b.filter((e) => e.type === "paper-fit")).map((e) => (e as { paperKey: string }).paperKey),
    ).toEqual(["d1", "d2", "d3"]);
  });

  test("the whole pass still comes back, for a caller with nothing to write to", async () => {
    // The return value is unchanged, so a caller that does not pass the
    // callback behaves exactly as it did.
    const { written } = await pass();
    expect(written.filter((e) => e.type === "paper-fit")).toHaveLength(3);
  });

  test("the hook writes through the callback and never the return value", async () => {
    /* Both would put every event on the record twice, which is the one way
     * this change could be worse than what it replaced. */
    const src = await Bun.file(
      new URL("../src/flow/usePaperFit.ts", import.meta.url).pathname,
    ).text();
    expect(src).toContain("onJudged: async (written) => {");
    expect(src).toContain("await appendAll(written);");
    expect(src).not.toContain("await appendAll(batch)");
  });
});

// ---------------------------------------------------------------------------
// 14. One judgement per paper, whoever asked
// ---------------------------------------------------------------------------

describe("two runs cannot judge the same paper twice", () => {
  const brief: ProjectBrief = {
    ...emptyBrief(),
    startingInterest: "How night shifts hand patients over",
    researchQuestion: "I expected a shared picture and found a shared form",
    context: "Two wards of a teaching hospital",
  };

  /**
   * A model that takes a moment, and answers differently each time.
   *
   * Both halves matter. The latency is what lets two runs overlap: with an
   * instant answer the first has written before the second reads what is due,
   * and the defect hides, which is why the page-level harness could not see it.
   * The differing answers are what the walk actually got, a misfit and a fit on
   * one paper two seconds apart.
   */
  function unsteadyModel(delayMs: number) {
    const asked: string[] = [];
    let n = 0;
    return {
      asked,
      client: {
        complete: async (request: { messages: { content: string }[] }) => {
          const name = /# The paper you are judging\n(.+)/.exec(
            request.messages.map((m) => m.content).join("\n"),
          )?.[1];
          asked.push(name ?? "?");
          await wait(delayMs);
          n += 1;
          return {
            text:
              n % 2 === 1
                ? "FIT: misfit. It is a review of the literature itself."
                : [
                    "FIT: fits. It speaks to handovers.",
                    "EXPECTS: Handoffs fail when the receiver cannot question the sender.",
                    "SCOPE: where the sender times the exchange",
                  ].join("\n"),
            model: "m",
            modelVersion: "v",
          };
        },
      } as never,
    };
  }

  const papers = [
    { key: "d-cohen", name: "cohen-hilligoss-2010.pdf" },
    { key: "d-hilligoss", name: "hilligoss-cohen-2013.pdf" },
  ];

  const run = (model: ReturnType<typeof unsteadyModel>) =>
    judgeArrivingPapers({
      projectId: P,
      papers,
      context: studyContext(brief),
      events: [],
      client: model.client,
      makeId: uid,
      now,
    });

  test("each paper is asked about once, even by two runs started together", async () => {
    /* The live defect, reproduced at the level it lives at. Two runs both work
     * out what is due before either writes, which is what a second entry point
     * produces however it came about: a component that remounted, a second
     * module instance under a hot reload, or a caller holding a different
     * project id. The one-loop-per-study guard cannot see any of them. */
    resetJudgementsInFlight();
    const model = unsteadyModel(20);
    const [a, b] = await Promise.all([run(model), run(model)]);
    expect(model.asked.sort()).toEqual([
      "cohen-hilligoss-2010.pdf",
      "hilligoss-cohen-2013.pdf",
    ]);
    // One verdict per paper across both runs, and no paper judged by both.
    const markers = [...a, ...b].filter((e) => e.type === "paper-fit");
    expect(markers).toHaveLength(2);
    expect(markers.map((e) => (e as { paperKey: string }).paperKey).sort()).toEqual([
      "d-cohen",
      "d-hilligoss",
    ]);
  });

  test("the paper is released as soon as its answer is in hand", async () => {
    // A later pass must be able to judge it again when the framing moves, so
    // nothing may be held for the life of the session.
    resetJudgementsInFlight();
    const first = unsteadyModel(0);
    await run(first);
    const second = unsteadyModel(0);
    await run(second);
    expect(second.asked).toHaveLength(2);
  });

  test("a call that throws does not hold its paper for the session", async () => {
    resetJudgementsInFlight();
    const failing = {
      complete: async () => {
        throw new Error("the bridge went away");
      },
    } as never;
    await expect(
      judgeArrivingPapers({
        projectId: P,
        papers,
        context: studyContext(brief),
        events: [],
        client: failing,
        makeId: uid,
        now,
      }),
    ).rejects.toThrow("the bridge went away");
    const after = unsteadyModel(0);
    await run(after);
    expect(after.asked).toHaveLength(2);
  });

  test("two studies naming one file do not block each other", async () => {
    resetJudgementsInFlight();
    const model = unsteadyModel(20);
    const other = { ...papers[0], key: "d-cohen" } as { key: string; name: string };
    const [a, b] = await Promise.all([
      run(model),
      judgeArrivingPapers({
        projectId: "another-study",
        papers: [other],
        context: studyContext(brief),
        events: [],
        client: model.client,
        makeId: uid,
        now,
      }),
    ]);
    expect(a.filter((e) => e.type === "paper-fit")).toHaveLength(2);
    expect(b.filter((e) => e.type === "paper-fit")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 15. The judge reasons before it commits
// ---------------------------------------------------------------------------

describe("the fit prompt asks what the paper predicts before it asks for a verdict", () => {
  test("the prediction comes first, and the verdict line after it", () => {
    /* The walk caught one paper judged a misfit and a fit two seconds apart on
     * identical input. A model asked for a verdict token first commits to a
     * word before writing anything that supports one; asking for the reasoning
     * first is the standard shape for that instability. */
    const reason = FIT_SYSTEM.indexOf("what this paper predicts about a setting like");
    const verdict = FIT_SYSTEM.indexOf("FIT: <fits, unclear or misfit>. <your sentence>");
    expect(reason).toBeGreaterThan(-1);
    expect(verdict).toBeGreaterThan(-1);
    expect(reason).toBeLessThan(verdict);
  });

  test("the parser is untouched, and reads the line wherever it falls", () => {
    /* The one risk in reordering a prompt is the parse. `parseFit` matches the
     * FIT line under the `m` flag, so prose above it changes nothing. */
    const answered = [
      "This paper predicts that a receiver who cannot question the sender misreads the handover.",
      "FIT: fits. It speaks to handovers.",
      "EXPECTS: Handoffs fail when the receiver cannot question the sender.",
      "SCOPE: where the sender times the exchange",
    ].join("\n");
    expect(parseFit(answered)).toEqual({
      fit: "fits",
      reason: "It speaks to handovers.",
    });
    expect(
      parseBaselines(answered, { paperKey: "d1", allowed: 3 }).map((b) => b.expectation),
    ).toEqual(["Handoffs fail when the receiver cannot question the sender."]);
  });

  test("a paper it predicts nothing about still parses as a misfit", () => {
    const answered = [
      "This paper predicts nothing about a setting like theirs; it reviews the handoff literature itself.",
      "FIT: misfit. It is a review of the literature rather than a claim about a ward.",
    ].join("\n");
    expect(parseFit(answered).fit).toBe("misfit");
  });
});

// ---------------------------------------------------------------------------
// 16. The answer, attached to the expectation it answered
// ---------------------------------------------------------------------------

describe("a draft from a baseline answer says which expectation it answered", () => {
  const BASE = B("d1#a1b2", "Handoffs fail when the receiver cannot question the sender.", "c1");
  const events = [fit("d1", "cohen-hilligoss-2010.pdf", [BASE])];
  const baselines = paperBaselines(events, P);

  /** The theory page a researcher gets by taking the expectation into the model. */
  const asPage = (id: string) => ({ id, type: "theory", title: BASE.expectation });

  const draft = (pageType: string, title: string): ProposalEvent =>
    ({
      id: uid(),
      ts: now(),
      actor: "persona:drafter",
      projectId: P,
      model: "m",
      modelVersion: "v",
      type: "proposal",
      proposalId: uid(),
      pageType,
      title,
      body: "As they described it.",
      sourceChunks: [],
      sourceTurn: "turn-1",
    }) as ProposalEvent;

  // M63, the lead's rulings of 2026-09-30: attachToBaseline retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "a scope condition bounds the expectation it was given against"

  // M63, the lead's rulings of 2026-09-30: attachToBaseline retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "accepting it draws the link, through the one door"

  // M63, the lead's rulings of 2026-09-30: attachToBaseline retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "an observation is left for the researcher to place"

  // M63, the lead's rulings of 2026-09-30: attachToBaseline retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "nothing is attached to an expectation the researcher has not taken"

  // M63, the lead's rulings of 2026-09-30: attachToBaseline retired with the per-claim wiring; answerLineEvents in concepts/door.ts carries the behaviour (m63-record); superseded: "a turn that answered nothing about a paper is untouched"

  test("the tray row says which paper the answer was about", () => {
    /* The other half of the walk's complaint: the draft sat in the tray looking
     * like any other, with no sign of the paper it was about. The record knew
     * all along, in the topic of the question the answer replies to. */
    const question: LedgerEvent = {
      id: "q-1",
      ts: now(),
      actor: "human",
      projectId: P,
      type: "question-selection",
      moveId: "m",
      topic: baselineTopic(BASE.id),
      question: BASELINE_QUESTION,
      alternatives: [],
      mode: "interrogation",
      reason: "r",
    } as LedgerEvent;
    const answered: LedgerEvent = {
      id: "turn-1",
      ts: now(),
      actor: "human",
      projectId: P,
      type: "response",
      text: "They ask about the form.",
      inReplyTo: "q-1",
    } as LedgerEvent;
    const about = turnsAnsweringBaselines([...events, question, answered], P, baselines);
    expect(about.get("turn-1")).toBe("cohen-hilligoss-2010.pdf");
    expect(
      draftSource(
        { sourceTurn: "turn-1", sourceChunks: [] },
        [],
        [],
        about,
      ),
    ).toBe("suggested from your answer on the expectations of cohen-hilligoss-2010.pdf");
    // A draft from any other turn keeps the line it had.
    expect(draftSource({ sourceTurn: "turn-9", sourceChunks: [] }, [], [], about)).toBe(
      "suggested from your answer",
    );
  });
});
