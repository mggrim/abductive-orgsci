/**
 * M29 and M30, builder L2: the checks, the interviewer, the twin, the chooser
 * and the two eval cases.
 *
 * The shape of every group below is the same and it is deliberate: a rule fires
 * where it should, stays silent where it should, and has an anti-case that
 * fails if the check were rewritten to be vacuous. A lint layer that fires on
 * everything catches every planted defect and is worthless, so silence is
 * asserted at least as often as firing.
 */

import { describe, expect, test } from "bun:test";
import type {
  EdgeRole,
  LedgerEvent,
  Origin,
  PageType,
  PuzzleRelation,
} from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { generateMoves } from "../src/interview/moves.ts";
import { chunkDocuments } from "../src/ontology/relations.ts";
import { assembleTurnPrompt, proposedAnswerViolations } from "../src/interview/prompt.ts";
import { PASSAGES_READ, stationProbes, THIN } from "../src/interview/stationProbes.ts";
import { adjudicateProposal, resetAdjudicationInFlight } from "../src/proposals/adjudicate.ts";
import { draftRival } from "../src/proposals/rival.ts";
import { parseProposalBlocks } from "../src/proposals/extract.ts";
import { extractTheoryClaims, parseFit } from "../src/proposals/theory.ts";
import {
  judgePaperFit,
  paperFitEvents,
  type PaperRef,
} from "../src/proposals/paperFit.ts";
import {
  canJudgeFit,
  renderStudyContext,
  studyContext,
} from "../src/interview/studyContext.ts";
import { passageIn } from "../src/ui/materialVocabulary.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import {
  CHOOSER_QUESTION,
  DECLINES,
  RELATION_ORDER,
  chooserOpens,
  declineEvents,
  puzzleToClaim,
  relationDraft,
  relationProposal,
} from "../src/workbench/ExpectationChooser.tsx";
import { OBLIGATIONS, RELATION_BURDEN } from "../src/ontology/relations.ts";
import { generateTwin, twinUserContext } from "../src/twin/twin.ts";
import {
  fillableClause,
  obligationSentence,
  projectArgument,
} from "../src/views/argumentModel.ts";
import { emptyBrief, type Project, type ProjectBrief } from "../src/state/projects.ts";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";

const PROJECT = "proj-m29";
const SRC = new URL("../src/", import.meta.url).pathname;

// ---------------------------------------------------------------------------
// Graph fixtures. Built out of the events the app writes, so what the rules see
// here is what they see in a real study.
// ---------------------------------------------------------------------------

let clock = 3_000_000_000_000;

function page(
  id: string,
  type: PageType,
  title: string,
  origin: Origin,
  chunks: readonly string[] = [],
): LedgerEvent {
  clock += 1000;
  return {
    id: `ev-${id}-${clock}`,
    ts: clock,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    title,
    body: `${title}.`,
    origin,
    supportingChunks: chunks,
  } as LedgerEvent;
}

function edge(
  from: string,
  to: string,
  role: EdgeRole,
  relation?: PuzzleRelation,
): LedgerEvent {
  clock += 1000;
  return {
    id: `ev-edge-${from}-${to}-${clock}`,
    ts: clock,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "relate",
    targetId: `${from}->${to}`,
    edge: { from, to, role },
    ...(relation === undefined ? {} : { puzzleRelation: relation }),
    origin: "author-prior",
    supportingChunks: [],
  } as LedgerEvent;
}

/** A puzzle standing to one expectation, with the expectation's own provenance. */
function standsTo(theoryOrigin: Origin, theoryChunks: readonly string[] = []): LedgerEvent[] {
  return [
    page("pz", "puzzle", "Night wards refuse the handover", "data-driven", ["c-data-1"]),
    page("th", "theory", "Handoffs fail without questioning", theoryOrigin, theoryChunks),
    edge("pz", "th", "stands-to", "contradicts"),
  ];
}

function graphOf(events: readonly LedgerEvent[]) {
  return projectOntology(events, PROJECT);
}

// ---------------------------------------------------------------------------

function doc(id: string, name: string, kind: StoredDocument["kind"]): StoredDocument {
  return { id, projectId: PROJECT, name, kind, createdAt: 1, chunkCount: 1 };
}

function chunk(id: string, documentId: string, kind: Chunk["kind"]): Chunk {
  return { id, projectId: PROJECT, documentId, kind, text: `passage ${id}`, index: 0 };
}

/* M87, ISC-722: `paper-never-engaged` and its two halves are retired (the
 * owner, 2026-10-14), and the tests of them went with the rule. The retirement
 * is pinned in tests/m87-retired-paper-flag.test.tsx. */

// ---------------------------------------------------------------------------

describe("the chooser: two questions, and the origin the second one earns", () => {
  const withTheory = standsTo("literature-derived");
  const unclaimed = [
    page("pz", "puzzle", "Night wards refuse the handover", "data-driven", ["c-data-1"]),
    page("th", "theory", "Handoffs fail without questioning", "literature-derived", ["c-lit-1"]),
  ];

  test("it opens on a live puzzle with no claim and at least one expectation", () => {
    expect(chooserOpens(graphOf(unclaimed))).toBe(true);
    expect(puzzleToClaim(graphOf(unclaimed))?.id).toBe("pz");
  });

  test("it stays shut once the claim is made, and before any expectation exists", () => {
    expect(chooserOpens(graphOf(withTheory))).toBe(false);
    expect(
      chooserOpens(graphOf([page("pz", "puzzle", "A puzzle", "data-driven", ["c1"])])),
    ).toBe(false);
  });

  test("the four are offered lightest burden first, with what each owes", () => {
    // The opposite of `checkAllObligations`, which sorts heaviest first because
    // it is showing the claim most likely to be over-reaching. This is a list
    // to choose from, and putting `exposes` at the top would make the biggest
    // claim the first one read.
    expect(RELATION_ORDER).toEqual(["silent", "instantiates", "contradicts", "exposes"]);
    for (const relation of RELATION_ORDER) {
      expect(OBLIGATIONS[relation].requirement.length).toBeGreaterThan(20);
    }
    expect(RELATION_BURDEN[RELATION_ORDER[0] ?? "silent"]).toBeLessThan(
      RELATION_BURDEN[RELATION_ORDER[3] ?? "exposes"],
    );
  });

  test("the draft names the claim and carries what it owes", () => {
    const graph = graphOf(unclaimed);
    const puzzle = graph.pages.get("pz");
    const theory = graph.pages.get("th");
    const draft = relationDraft(puzzle!, theory!, "contradicts");
    expect(draft.title).toContain("Night wards refuse the handover");
    expect(draft.body).toContain(OBLIGATIONS.contradicts.requirement);
  });

  test("the pick writes a valid stands-to proposal and accepts it as yours", async () => {
    resetAdjudicationInFlight();
    const graph = graphOf(unclaimed);
    const proposal = relationProposal({
      projectId: PROJECT,
      puzzle: graph.pages.get("pz")!,
      theory: graph.pages.get("th")!,
      relation: "contradicts",
      researcherChose: true,
    });
    expect(validateEvent(proposal)).toEqual([]);
    expect(proposal.originOnAccept).toBe("author-prior");

    const stored: LedgerEvent[] = [...unclaimed, proposal as LedgerEvent];
    const outcome = await adjudicateProposal(
      { projectId: PROJECT, proposalId: proposal.proposalId, disposition: "accept" },
      {
        appendAll: async (events) => {
          stored.push(...events);
        },
        readEvents: async () => stored,
      },
    );
    expect(outcome.kind).toBe("recorded");
    const mutation = stored.find(
      (e) => e.type === "ontology-mutation" && e.op === "relate" && e.edge?.role === "stands-to",
    );
    expect(mutation?.type === "ontology-mutation" ? mutation.origin : null).toBe("author-prior");
    expect(mutation?.type === "ontology-mutation" ? mutation.puzzleRelation : null).toBe(
      "contradicts",
    );
    // And the edge really lands in the model, with the relation claim on it.
    const after = graphOf(stored);
    expect(after.relations.map((r) => r.relation)).toEqual(["contradicts"]);
  });

  test("the tool-recommended path stays model-proposed", async () => {
    // R3, E2. When the tool names the relation it thinks applies, the accept is
    // a ratification like any other and must not be credited to the researcher.
    resetAdjudicationInFlight();
    const graph = graphOf(unclaimed);
    const proposal = relationProposal({
      projectId: PROJECT,
      puzzle: graph.pages.get("pz")!,
      theory: graph.pages.get("th")!,
      relation: "contradicts",
      researcherChose: false,
    });
    expect(validateEvent(proposal)).toEqual([]);
    expect(proposal.originOnAccept).toBeUndefined();

    const stored: LedgerEvent[] = [...unclaimed, proposal as LedgerEvent];
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: proposal.proposalId, disposition: "accept" },
      {
        appendAll: async (events) => {
          stored.push(...events);
        },
        readEvents: async () => stored,
      },
    );
    const mutation = stored.find(
      (e) => e.type === "ontology-mutation" && e.op === "relate" && e.edge?.role === "stands-to",
    );
    expect(mutation?.type === "ontology-mutation" ? mutation.origin : null).toBe("model-proposed");
  });

  test("both declines are recorded, with the question and the reason", () => {
    for (const option of DECLINES) {
      const [question, refusal] = declineEvents({
        projectId: PROJECT,
        decline: option.id,
        offered: ["Handoffs fail without questioning"],
      });
      expect(validateEvent(question)).toEqual([]);
      expect(validateEvent(refusal)).toEqual([]);
      // The question as put, so a reader a year later knows what was declined.
      expect(question.question).toBe(CHOOSER_QUESTION);
      expect(question.alternatives).toContain("Handoffs fail without questioning");
      expect(question.alternatives).toContain(option.label);
      // The refusal points at that question and carries the reason.
      expect(refusal.questionEventId).toBe(question.id);
      expect(refusal.note).toBe(option.note);
    }
  });

  test("the two declines stay distinguishable on the record", () => {
    // Three of either silences the topic. Silencing on a decision is right;
    // silencing on a postponement is the tool giving up early, so the kinds
    // must not collapse into one.
    const kinds = DECLINES.map(
      (d) => declineEvents({ projectId: PROJECT, decline: d.id, offered: [] })[1].kind,
    );
    expect(new Set(kinds).size).toBe(2);
  });

  test("Anti: it writes no ontology mutation of its own", async () => {
    // The proposal door is the only way into the model. A second door opened
    // here for one edge would be the beginning of the end of that guarantee.
    const src = await Bun.file(`${SRC}workbench/ExpectationChooser.tsx`).text();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain('type: "ontology-mutation"');
    expect(code).toContain("adjudicateProposal");
  });
});

// ---------------------------------------------------------------------------

describe("the rival draft: one call, one proposal, through the tray", () => {
  const model = [
    page("pz", "puzzle", "Night wards refuse the handover", "data-driven", ["c-data-1"]),
    page("res", "candidate-resolution", "Shift boundaries carry the credit", "model-proposed", ["c-data-1"]),
    edge("res", "pz", "resolves"),
  ];

  test("it stages a rival and nothing else", async () => {
    const client = new MockInferenceClient({
      responses: [
        [
          "TYPE: rival",
          "TITLE: The rota, not the boundary, decides what is said",
          "BODY: Handovers are shaped by who is rostered together rather than by occupational lines. You would see this if pairs who work the same rota hand over differently from pairs who do not.",
        ].join("\n"),
      ],
    });
    const result = await draftRival(
      { projectId: PROJECT, graph: graphOf(model), resolutionId: "res" },
      client,
    );
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.pageType).toBe("rival");
    // No origin promise: a rival the tool wrote is the tool's, forever.
    expect(result.proposals[0]?.originOnAccept).toBeUndefined();
    expect(validateEvent(result.proposals[0] as LedgerEvent)).toEqual([]);
  });

  test("a block of any other type is dropped rather than retyped", async () => {
    const client = new MockInferenceClient({
      responses: ["TYPE: observation\nTITLE: Something seen\nBODY: Not what was asked for."],
    });
    const result = await draftRival(
      { projectId: PROJECT, graph: graphOf(model), resolutionId: "res" },
      client,
    );
    expect(result.proposals).toEqual([]);
  });

  test("an explanation that is gone yields nothing and costs no call", async () => {
    const client = new MockInferenceClient({ responses: ["TYPE: rival\nTITLE: X\nBODY: Y"] });
    const result = await draftRival(
      { projectId: PROJECT, graph: graphOf(model), resolutionId: "not-here" },
      client,
    );
    expect(result.proposals).toEqual([]);
    expect(client.requests).toEqual([]);
  });

  test("Anti: it writes no ontology mutation", async () => {
    const src = await Bun.file(`${SRC}proposals/rival.ts`).text();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("ontology-mutation");
  });
});

// ---------------------------------------------------------------------------

describe("the interviewer asks about the papers, and never for a summary", () => {
  const brief: ProjectBrief = { ...emptyBrief(), researchQuestion: "Why is the handover refused?" };
  const papers = [
    { name: "trust.pdf", chunkIds: ["c-lit-1"] },
    { name: "boundaries.pdf", chunkIds: ["c-lit-2"] },
    { name: "A paper I typed and never uploaded", chunkIds: [] },
  ];

  const base = {
    state: {
      outstanding: null,
      turns: 0,
      interrogationTurns: 0,
      guidanceTurns: 0,
      interrogationRatio: null,
      refusalsByTopic: new Map<string, number>(),
      silencedTopics: [],
      redirections: [],
      topicsAsked: [],
      lastAskedTopic: null,
    },
    coveredCells: [],
    matrix: [],
    turnIndex: 0,
    brief,
  };

  const withPapers = [
    page("pz", "puzzle", "Night wards refuse the handover", "data-driven", ["c-data-1"]),
    page("th", "theory", "Handoffs fail without questioning", "literature-derived", ["c-lit-1"]),
  ];

  test("it asks which expectation the setting will break, once claims exist", () => {
    const moves = generateMoves({ ...base, graph: graphOf(withPapers), papers });
    const literature = moves.filter((m) => m.source === "literature");
    expect(literature.length).toBeGreaterThan(0);
    expect(literature.map((m) => m.question)).toContain(
      "Which of the expectations that you took from these papers is your setting most likely to break?",
    );
  });

  test("it asks nothing about the papers before a claim has come out of one", () => {
    const bare = [page("pz", "puzzle", "Night wards refuse the handover", "data-driven", ["c1"])];
    const moves = generateMoves({ ...base, graph: graphOf(bare), papers });
    expect(moves.filter((m) => m.source === "literature")).toEqual([]);
  });

  /* M87, ISC-722: the question about the papers that nothing came out of
   * ("What are the other 2 doing in the list?", whose rationale named "the
   * papers that you aren't arguing with") went with `paper-never-engaged` at the
   * owner's word of 2026-10-14, and so did the three tests that counted for it
   * (some engaged, a typed paper counted through its expectation, an
   * expectation not taken leaving a paper idle). */
  test("it doesn't ask what the papers that no claim came from are doing (M87)", () => {
    const typed = [
      { name: "trust.pdf", chunkIds: ["c-lit-1"] },
      { name: "boundaries.pdf", chunkIds: ["c-lit-2"] },
      { name: "A paper I typed and never uploaded", chunkIds: [] },
    ];
    const moves = generateMoves({ ...base, graph: graphOf(withPapers), papers: typed });
    expect(moves.map((m) => m.topic)).not.toContain("literature:unengaged-papers");
    const said = moves.map((m) => `${m.question} ${m.rationale}`).join(" ");
    expect(said).not.toContain("doing in the list");
    expect(said).not.toContain("arguing with");
    // The other literature questions still come.
    expect(moves.map((m) => m.question)).toContain(
      "Which of the expectations that you took from these papers is your setting most likely to break?",
    );
  });

  test("Anti: with every paper engaged it does not ask what the others are doing", () => {
    const engaged = [
      { name: "trust.pdf", chunkIds: ["c-lit-1"] },
    ];
    const moves = generateMoves({ ...base, graph: graphOf(withPapers), papers: engaged });
    expect(moves.map((m) => m.question).join(" ")).not.toContain("doing in the list");
  });

  test("it quotes an accepted claim back with the paper it came from", () => {
    const claimed = [
      ...withPapers,
      edge("pz", "th", "stands-to", "contradicts"),
    ];
    const moves = generateMoves({ ...base, graph: graphOf(claimed), papers });
    const asked = moves.map((m) => m.question).join(" ");
    expect(asked).toContain("'Handoffs fail without questioning' is what you took from trust.pdf");
  });

  test("every literature question is one question and supplies no answer", () => {
    const claimed = [...withPapers, edge("pz", "th", "stands-to", "contradicts")];
    for (const graph of [graphOf(withPapers), graphOf(claimed)]) {
      for (const move of generateMoves({ ...base, graph, papers })) {
        if (move.source !== "literature") continue;
        expect(proposedAnswerViolations(move.question)).toEqual([]);
        // The real gate: `assembleTurnPrompt` throws on either failure.
        const prompt = assembleTurnPrompt({
          move,
          chunks: [],
          ontologySummary: "A puzzle and an expectation.",
        });
        expect(prompt).toContain(move.question);
      }
    }
  });

  test("the three things the interviewer may never do are in the prompt it is given", async () => {
    const prompt = assembleTurnPrompt({
      move: {
        id: "m1",
        topic: "t",
        mode: "interrogation",
        question: "What did you see?",
        rationale: "r",
        source: "station",
      },
      chunks: [],
      ontologySummary: "",
    });
    for (const line of [
      "Do not treat a passage from a paper as evidence for something happening in their setting",
      "Do not ask them to summarise a paper",
      "Do not put forward an expectation from a paper that they have not identified or uploaded",
    ]) {
      expect(prompt).toContain(line);
    }
    // And they are standing rules rather than a branch on whether a paper is in
    // context this turn, because two of the three are about what the model must
    // not reach for when the papers are absent from the turn.
    const src = await Bun.file(`${SRC}interview/prompt.ts`).text();
    expect(src).toContain("LITERATURE_RULES");
  });
});

// ---------------------------------------------------------------------------

describe("Early data reads thin when the material is loaded and unopened", () => {
  const brief: ProjectBrief = emptyBrief();

  const question = (chunks: number, opened: number) =>
    stationProbes("early-data", brief, chunks, 0, opened).map((p) => p.question);

  test("no material at all is empty, not thin", () => {
    expect(question(0, 0)).toContain(
      "What is the first piece of material you will read, and what do you expect it to say?",
    );
  });

  test("material loaded and barely opened is thin", () => {
    // The state the step could never express: the probe derived its reading
    // from the corpus size, so uploading anything jumped straight to a question
    // for someone who had been through the material.
    expect(question(40, PASSAGES_READ - 1)).toContain(
      "Which part of this material haven't you opened yet, and what will you look for when you open it?",
    );
  });

  test("material that has been through their hands presses on the reading", () => {
    expect(question(40, PASSAGES_READ)).toContain(
      "Which passage fits your ontology worst, and what will you look for next because of that passage?",
    );
  });

  test("Anti: without the attention count it would read as answered at length", () => {
    // The old derivation, restated: any corpus at all produced the `stated`
    // probes. The default is zero rather than "assume read", so a caller that
    // does not have the ledger gets the honest reading.
    expect(question(40, 0)).not.toContain(
      "Which passage fits your ontology worst, and what will you look for next because of that passage?",
    );
    expect(THIN).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe("the ordinary version is what these papers would lead you to design", () => {
  const project: Project = {
    id: PROJECT,
    title: "A study",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...emptyBrief(), researchQuestion: "Why is the handover refused?" },
  };
  const claims = [
    { title: "Handoffs fail without questioning", body: "Holds where the exchange is timed." },
  ];

  test("four facets, and the fourth is the contribution", async () => {
    const client = new MockInferenceClient({
      responses: ["one", "two", "three", "four"],
    });
    const twin = await generateTwin(project, claims, client, { now: () => 1, makeId: () => "t1" });
    expect(client.requests).toHaveLength(4);
    expect(twin.expectedContribution).toBe("four");
    expect(client.requests[3]?.messages[0]?.content).toContain(
      "State the contribution the modal study of this literature would claim",
    );
  });

  test("the framing facets see the papers and the other two do not", () => {
    const seen = [twinUserContext(project, claims, true), twinUserContext(project, claims, false)];
    expect(seen[0]).toContain("Handoffs fail without questioning");
    expect(seen[1]).not.toContain("Handoffs fail without questioning");
  });

  test("nothing in the context counts or quotes the researcher's material", () => {
    const context = twinUserContext(project, claims);
    expect(context).not.toContain("data chunk");
    expect(context).not.toContain("Corpus at generation time");
  });

  test("the system prompt names the papers as what makes the baseline ordinary", async () => {
    const src = await Bun.file(`${SRC}twin/twin.ts`).text();
    expect(src).toContain("the study these papers would lead a competent person to design");
    expect(src).not.toContain("what the median competent study in this literature would look like");
  });
});

// ---------------------------------------------------------------------------

describe("how your ontology moved, on the page that bears the model's name", () => {
  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel, ModelMovement, OntologyView, ui/OntologyView.tsx left with it; superseded: "it is folded under the census line rather than standing open"

  // M63, the lead's rulings of 2026-09-30: the old model tab's ModelMovement, ui/model/ModelMovement.tsx left with it; superseded: "its census is labelled as changes recorded, not as claims"

  test("Anti: the trajectory panel is gone from the Design tab entirely", async () => {
    const design = await Bun.file(`${SRC}workbench/Instrumentation.tsx`).text();
    expect(design).not.toContain("TrajectoryView");
  });
});

// ---------------------------------------------------------------------------

/**
 * `contradicts` counts source documents, on every surface that has the corpus
 * (M29, E3).
 *
 * The requirement printed one line above the result promises "at least two
 * independent observations, drawn from more than one source document", and the
 * check built its set out of chunk ids. So two quotes from one interview
 * discharged a burden whose entire point is breadth: Zuckerman's worry about a
 * found puzzle is that a pattern from one case gets dismissed as a weird case,
 * and two passages of one transcript is one case.
 *
 * The fix landed in `relations.ts` as an optional map and reached one caller.
 * These are the other three. Each is asserted the same way, because the defect
 * is the same defect at each: one document does not discharge, two do.
 */
describe("two passages of one interview are one source, wherever the claim is read", () => {
  /** A puzzle contradicting a theory, evidenced by two observations. */
  function evidenced(chunkA: string, chunkB: string): LedgerEvent[] {
    return [
      page("pz", "puzzle", "Night wards refuse the handover", "data-driven", ["c-data-1"]),
      page("th", "theory", "Handoffs fail without questioning", "literature-derived", ["c-lit-1"]),
      page("o1", "observation", "The first refusal", "data-driven", [chunkA]),
      page("o2", "observation", "The second refusal", "data-driven", [chunkB]),
      edge("o1", "pz", "evidences"),
      edge("o2", "pz", "evidences"),
      edge("pz", "th", "stands-to", "contradicts"),
    ];
  }

  /** Two quotes from one transcript, and one quote from each of two. */
  const ONE_SOURCE = chunkDocuments([
    { id: "c-a", documentId: "d-1" },
    { id: "c-b", documentId: "d-1" },
  ]);
  const TWO_SOURCES = chunkDocuments([
    { id: "c-a", documentId: "d-1" },
    { id: "c-b", documentId: "d-2" },
  ]);

  const moveBase = {
    state: {
      outstanding: null,
      turns: 0,
      interrogationTurns: 0,
      guidanceTurns: 0,
      interrogationRatio: null,
      refusalsByTopic: new Map<string, number>(),
      silencedTopics: [],
      redirections: [],
      topicsAsked: [],
      lastAskedTopic: null,
    },
    coveredCells: [],
    matrix: [],
    turnIndex: 0,
  };

  const bandBase = {
    trajectory: {
      mutations: { byOrigin: {}, population: 0, modelShare: 0 },
      points: [],
      byOp: {},
      finalResidue: 0,
      residueMonotonicallyShrinking: false,
    },
    tray: { projectId: PROJECT, all: [], pending: [], rejected: [], accepted: [], merged: [], deferred: [] },
    anchoring: { unanchored: [], components: [], stranded: [], pageCount: 0, edgeCount: 0 },
    moves: [],
  } as unknown as Parameters<typeof projectArgument>[0];

  test("the interview asks about the obligation when the corpus is passed", () => {
    const events = evidenced("c-a", "c-b");
    const asks = (documents: ReturnType<typeof chunkDocuments>) =>
      generateMoves({ ...moveBase, graph: graphOf(events), chunkDocuments: documents }).some(
        (m) => m.source === "unmet-obligation",
      );
    expect(asks(ONE_SOURCE)).toBe(true);
    expect(asks(TWO_SOURCES)).toBe(false);
  });

  test("the argument band reads documents when the corpus is passed", () => {
    const events = evidenced("c-a", "c-b");
    const graph = graphOf(events);
    const discharged = (documents: ReturnType<typeof chunkDocuments>) =>
      projectArgument({ ...bandBase, graph, chunkDocuments: documents }).obligation?.discharged;
    expect(discharged(ONE_SOURCE)).toBe(false);
    expect(discharged(TWO_SOURCES)).toBe(true);
    // And the sentence the researcher reads changes with it, which is the point.
    const owed = projectArgument({ ...bandBase, graph, chunkDocuments: ONE_SOURCE });
    expect(obligationSentence(owed.obligation!)).toContain("rests on one source");
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's OntologyView, ui/OntologyView.tsx left with it; superseded: "the one map is built once and handed down"
});

// ---------------------------------------------------------------------------

/**
 * The fit gate (M29b).
 *
 * The occasion was a real failure: the reader drafted expectations out of a
 * methods paper about language models for a study of night-ward handoffs, and
 * nothing flagged it. It could not have done otherwise, because nothing in its
 * prompt said what the study was about.
 */
describe("a paper that predicts nothing about this setting is a finding", () => {
  const HANDOFFS: ProjectBrief = {
    ...emptyBrief(),
    startingInterest: "How night shifts hand patients over.",
    researchQuestion: "Why is the handover accepted without being understood?",
    context: "Two wards of a teaching hospital, across the night shift boundary.",
    seminalCorpus: "A methods paper about language models",
  };

  const PAPERS = [doc("d-llm", "llm-methods.pdf", "literature")];
  const PASSAGES = [chunk("c-llm-1", "d-llm", "literature")];

  const readerInput = (brief: ProjectBrief) => ({
    projectId: PROJECT,
    documents: PAPERS,
    chunks: PASSAGES,
    study: studyContext(brief),
    now: () => 5,
    // Real uuids, because the finding this produces is a ledger event and
    // `validateEvent` holds every event to the same id rule.
    makeId: () => crypto.randomUUID(),
  });

  const FITTING = [
    "FIT: fits. It expects handovers to fail where the receiver cannot question the sender.",
    "",
    "EXPECTS: Handoffs fail when the receiver cannot question the sender.",
    "SCOPE: where the exchange is timed and status differences are large",
    "CITE: [[chunk:c-llm-1]]",
  ].join("\n");

  /**
   * M33: every test below moved from the reader to the arrival judge, and none
   * of their intents changed.
   *
   * The reader used to parse a `FIT:` line of its own, which meant a paper
   * judged there left no `paper-fit` event and so could never carry baselines.
   * The judge on arrival is the only judge now, so the assertions about what a
   * misfit does, what the study in the prompt buys, and what `unclear` allows
   * are made where those decisions are taken. What each one asserts is what it
   * asserted before.
   */
  const judged = async (brief: ProjectBrief, answer: string, paper?: PaperRef) =>
    judgePaperFit({
      paper: paper ?? { key: "d-llm", name: "llm-methods.pdf", chunks: [...PASSAGES] },
      context: studyContext(brief),
      client: new MockInferenceClient({ responses: [answer] }),
    });

  const written = (paper: PaperRef, verdict: NonNullable<Awaited<ReturnType<typeof judged>>>) =>
    paperFitEvents({
      projectId: PROJECT,
      paper,
      verdict,
      framingDigest: "d",
      makeId: () => crypto.randomUUID(),
      now: () => 5,
      runId: "run-1",
    });

  test("a paper the judge can't place drafts nothing, records the verdict and raises no flag (M89)", async () => {
    const paper: PaperRef = { key: "d-llm", name: "llm-methods.pdf", chunks: [...PASSAGES] };
    const verdict = await judged(
      HANDOFFS,
      "FIT: misfit. This paper is about evaluating language models and predicts nothing about clinical handovers.",
      paper,
    );
    // Nothing to expect, because nobody asked. Pressing the reader button is an
    // override of the verdict; arrival is not.
    expect(verdict?.baselines).toEqual([]);
    const events = written(paper, verdict as NonNullable<typeof verdict>);
    /* The verdict is still recorded, because the paper's own row reads it. What
     * the judge no longer writes is the `paper-bearing-unstated` flag, which
     * left with the Checks tab. */
    const marker = events.find((e) => e.type === "paper-fit") as
      | { paperKey?: string; verdict?: string }
      | undefined;
    expect(marker?.paperKey).toBe("d-llm");
    expect(marker?.verdict).toBe("misfit");
    expect(events.some((e) => e.type === "lint-finding")).toBe(false);
    for (const e of events) expect(validateEvent(e)).toEqual([]);
  });

  test("the study is in the prompt, which is the whole reason it can judge", async () => {
    const client = new MockInferenceClient({ responses: ["FIT: misfit. No."] });
    await judgePaperFit({
      paper: { key: "d-llm", name: "llm-methods.pdf", chunks: [...PASSAGES] },
      context: studyContext(HANDOFFS),
      client,
    });
    const sent = client.requests[0];
    expect(sent?.messages[0]?.content).toContain("night shift");
    expect(sent?.messages[0]?.content).toContain(
      "Why is the handover accepted without being understood?",
    );
    /* M43, D2. The verdict line's shape is stated as a shape now rather than as
       a menu of the three words: a menu reads as a line to copy, pipes and all. */
    expect(sent?.system).toContain("FIT: <fits, unclear or misfit>. <your sentence>");
    /* M33. The passages, which are what the judge was missing: it had the name
     * alone, so an expectation it wrote would have been its memory of a
     * citation rather than a reading of the file. */
    expect(sent?.messages[0]?.content).toContain("[[chunk:c-llm-1]]");
  });

  test("a paper that fits writes what it expects and raises nothing", async () => {
    const paper: PaperRef = { key: "d-llm", name: "llm-methods.pdf", chunks: [...PASSAGES] };
    const verdict = await judged(HANDOFFS, FITTING, paper);
    expect(verdict?.baselines).toHaveLength(1);
    expect(verdict?.baselines[0]?.expectation).toBe(
      "Handoffs fail when the receiver cannot question the sender.",
    );
    expect(verdict?.baselines[0]?.scope).toBe(
      "where the exchange is timed and status differences are large",
    );
    expect(verdict?.baselines[0]?.chunkId).toBe("c-llm-1");
    const events = written(paper, verdict as NonNullable<typeof verdict>);
    expect(events.some((e) => e.type === "lint-finding")).toBe(false);
    for (const e of events) expect(validateEvent(e)).toEqual([]);
  });

  test("an expectation with no scope is dropped rather than repaired", async () => {
    // The scope is the half the questioning turns on: an expectation with no
    // boundary cannot be broken by a setting, only agreed with.
    const verdict = await judged(
      HANDOFFS,
      ["FIT: fits. Yes.", "", "EXPECTS: Handoffs fail without a question back.", "CITE: [[chunk:c-llm-1]]"].join("\n"),
    );
    expect(verdict?.fit).toBe("fits");
    expect(verdict?.baselines).toEqual([]);
  });

  test("unclear writes at most one and raises nothing", async () => {
    const two = [
      "FIT: unclear. I cannot tell from the passages given.",
      "",
      "EXPECTS: First expectation.",
      "SCOPE: everywhere",
      "CITE: [[chunk:c-llm-1]]",
      "---",
      "EXPECTS: Second expectation.",
      "SCOPE: everywhere",
      "CITE: [[chunk:c-llm-1]]",
    ].join("\n");
    // The cost of a wrong misfit is a researcher told their seminal paper is
    // irrelevant, so the uncertain case degrades toward the tray.
    const verdict = await judged(HANDOFFS, two);
    expect(verdict?.baselines).toHaveLength(1);
    const events = written(
      { key: "d-llm", name: "llm-methods.pdf" },
      verdict as NonNullable<typeof verdict>,
    );
    expect(events.some((e) => e.type === "lint-finding")).toBe(false);
  });

  test("an answer with no verdict at all reads as unclear, never as a misfit", () => {
    // A model that ignored the instruction has told us nothing about the paper.
    expect(parseFit("EXPECTS: X\nSCOPE: Y").fit).toBe("unclear");
    expect(parseFit("FIT: misfit. Because.").fit).toBe("misfit");
    expect(parseFit("FIT: fits").reason).toBe("");
  });

  test("with no study written down the gate is off and nothing is judged", async () => {
    // Against a blank brief every paper is a misfit and none of them is.
    const verdict = await judged(emptyBrief(), FITTING);
    expect(verdict).toBeUndefined();
  });

  test("a typed line with no upload is named by itself", async () => {
    const paper: PaperRef = { key: "something i read once", name: "Something I read once" };
    const verdict = await judged(HANDOFFS, "FIT: misfit. Nothing to do with it.", paper);
    const events = written(paper, verdict as NonNullable<typeof verdict>);
    const marker = events.find((e) => e.type === "paper-fit");
    expect((marker as { paperKey?: string } | undefined)?.paperKey).toBe("something i read once");
    expect(events.some((e) => e.type === "lint-finding")).toBe(false);
  });

  test("the verdict reaches the surfaces that name the paper", async () => {
    const src = await Bun.file(`${SRC}flow/SeminalCorpus.tsx`).text();
    /* M51, ISC-533. The row's own sentence about a paper nobody has placed is
       the question, drawn by `PaperBearing` and keyed by the paper. */
    expect(src).toContain("<PaperBearing");
    const band = await Bun.file(`${SRC}flow/FramingBand.tsx`).text();
    expect(band).toContain("framing-misfit-link");
    /* M29c: the band reads the verdicts rather than the findings, because two
     * of the three verdicts raise no finding and a line counting only failures
     * cannot say "2 papers fit". It is still one selector shared with Material,
     * so the two cannot disagree about how the papers stand. */
    expect(band).toContain("paperVerdicts");
    const material = await Bun.file(`${SRC}flow/SeminalCorpus.tsx`).text();
    expect(material).toContain("paperVerdicts");
  });
});

// ---------------------------------------------------------------------------

describe("the study block one helper builds, and one caller reads", () => {
  const brief: ProjectBrief = {
    ...emptyBrief(),
    startingInterest: "How night shifts hand patients over.",
    researchQuestion: "Why is the handover accepted without being understood?",
    context: "Two wards of a teaching hospital.",
    targetVenue: "US management journals",
    seminalCorpus: "Bechky on boundaries",
  };

  test("it carries the brief, and the model when there is one", () => {
    const graph = graphOf([
      page("pz", "puzzle", "Night wards refuse the handover", "data-driven", ["c1"]),
      page("th", "theory", "Questioning builds understanding", "literature-derived", ["c-lit-1"]),
    ]);
    const context = studyContext(brief, graph);
    expect(context.exploring).toContain("night shifts");
    // The M27 relabel: the field is stored as a research question and read as
    // the puzzle, the same way `coherence.ts` reads it.
    expect(context.puzzle).toBe("Why is the handover accepted without being understood?");
    expect(context.setting).toBe("Two wards of a teaching hospital.");
    expect(context.venue).toBe("US management journals");
    expect(context.puzzleRoots).toEqual(["Night wards refuse the handover"]);
    expect(context.liveClaims.map((c) => c.title).sort()).toEqual([
      "Night wards refuse the handover",
      "Questioning builds understanding",
    ]);
  });

  test("unsaid and empty stay distinguishable", () => {
    const bare = studyContext(emptyBrief());
    expect(bare.puzzle).toBeUndefined();
    expect(bare.setting).toBeUndefined();
    expect(bare.puzzleRoots).toEqual([]);
    expect(canJudgeFit(bare)).toBe(false);
    expect(canJudgeFit(studyContext(brief))).toBe(true);
  });

  test("the rendering names an absent field rather than dropping the line", () => {
    const rendered = renderStudyContext(studyContext(emptyBrief()));
    expect(rendered).toContain("The setting: not yet described.");
    /* "as they state it" until M40, "as the tool reads it from their answers" now
     * (ISC-509). The field is the same field; who wrote it is not, and a model told
     * the sentence is the researcher's own commitment weighs it as evidence about
     * their thinking when it is evidence about the tool's. */
    expect(rendered).toContain(
      "The puzzle, as the tool reads it from their answers: not yet read.",
    );
    expect(rendered).not.toContain("as they state it");
  });

  test("it says the page type in the researcher's words, never the slug", () => {
    const graph = graphOf([
      page("r", "analytic-residue", "The two who never converged", "data-driven", ["c1"]),
    ]);
    expect(renderStudyContext(studyContext(brief, graph))).not.toContain("analytic-residue");
  });

  test("Anti: the extractor and the gleaner are deliberately not wired to it", async () => {
    // Framing in front of an extractor is a standing invitation to read the
    // material as confirming the frame, which is the bias this tool measures.
    // The owner is deciding; until then one caller.
    for (const file of ["proposals/extract.ts", "interview/glean.ts"]) {
      expect(await Bun.file(`${SRC}${file}`).text()).not.toContain("studyContext");
    }
    /* M33: the one caller is the arrival judge now. `theory.ts` stopped making
     * a model call at all when the reader's second derivation went, so the
     * study block moved with the call rather than being dropped. The rule this
     * test holds is unchanged: exactly one generator sees the framing, and it
     * is not one that reads the researcher's own material. */
    expect(await Bun.file(`${SRC}proposals/paperFit.ts`).text()).toContain("renderStudyContext");
  });
});

// ---------------------------------------------------------------------------

describe("an accepted rival competes with something (M29b)", () => {
  const model = [
    page("pz", "puzzle", "Night wards refuse the handover", "data-driven", ["c-data-1"]),
    page("res", "candidate-resolution", "Shift boundaries carry the credit", "model-proposed", ["c-data-1"]),
    edge("res", "pz", "resolves"),
  ];

  const RIVAL = [
    "TYPE: rival",
    "TITLE: The rota decides what is said",
    "BODY: Handovers are shaped by who is rostered together. You would see this in rota pairs.",
  ].join("\n");

  test("the draft carries the link it will need", async () => {
    const result = await draftRival(
      { projectId: PROJECT, graph: graphOf(model), resolutionId: "res" },
      new MockInferenceClient({ responses: [RIVAL] }),
    );
    expect(result.proposals[0]?.linkOnAccept).toEqual({ to: "res", role: "rivals" });
    expect(validateEvent(result.proposals[0] as LedgerEvent)).toEqual([]);
  });

  test("accepting it writes the page and the link", async () => {
    resetAdjudicationInFlight();
    const drafted = await draftRival(
      { projectId: PROJECT, graph: graphOf(model), resolutionId: "res" },
      new MockInferenceClient({ responses: [RIVAL] }),
    );
    const proposal = drafted.proposals[0];
    const stored: LedgerEvent[] = [...model, proposal as LedgerEvent];
    const outcome = await adjudicateProposal(
      { projectId: PROJECT, proposalId: proposal!.proposalId, disposition: "accept" },
      {
        appendAll: async (events) => {
          stored.push(...events);
        },
        readEvents: async () => stored,
      },
    );
    expect(outcome.kind).toBe("recorded");
    // Two mutations from one accept: the create, then the relate from the id
    // the create minted.
    const mutations = stored.filter((e) => e.type === "ontology-mutation" && e.ts >= 0);
    const created = mutations.find((e) => e.type === "ontology-mutation" && e.op === "create" && e.pageType === "rival");
    const linked = mutations.find((e) => e.type === "ontology-mutation" && e.edge?.role === "rivals");
    expect(created).toBeDefined();
    expect(linked?.type === "ontology-mutation" ? linked.edge?.from : null).toBe(
      created?.type === "ontology-mutation" ? created.targetId : "",
    );
    expect(linked?.type === "ontology-mutation" ? linked.edge?.to : null).toBe("res");
  });

  test("Anti: the link is still written by the one door and nowhere else", async () => {
    const src = await Bun.file(`${SRC}proposals/rival.ts`).text();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("ontology-mutation");
    const door = await Bun.file(`${SRC}proposals/adjudicate.ts`).text();
    expect(door).toContain("mutationsForAccept");
  });

  test("a stands-to link is refused, because that role owes a puzzle relation", () => {
    const bad = {
      id: "11111111-1111-4111-8111-111111111111",
      ts: 1,
      actor: "persona:rival",
      projectId: PROJECT,
      model: "m",
      modelVersion: "v",
      type: "proposal",
      proposalId: "22222222-2222-4222-8222-222222222222",
      pageType: "theory",
      title: "X",
      body: "Y",
      sourceChunks: [],
      linkOnAccept: { to: "pz", role: "stands-to" },
    } as unknown as LedgerEvent;
    expect(validateEvent(bad).join(" ")).toContain("owes a puzzleRelation");
  });

  test("a link on a proposal that draws a link rather than a page is refused", () => {
    const bad = {
      id: "11111111-1111-4111-8111-111111111112",
      ts: 1,
      actor: "human",
      projectId: PROJECT,
      type: "proposal",
      proposalId: "22222222-2222-4222-8222-222222222223",
      edge: { from: "a", to: "b", role: "evidences" },
      title: "X",
      body: "Y",
      sourceChunks: [],
      linkOnAccept: { to: "pz", role: "rivals" },
    } as unknown as LedgerEvent;
    expect(validateEvent(bad).join(" ")).toContain("creates a page");
  });
});

// ---------------------------------------------------------------------------

describe("a passage is named by its file and place (M29b)", () => {
  test("the passage helper reads as somewhere a person can go", () => {
    expect(passageIn("ward-handover.txt", 3)).toBe("passage 3 of ward-handover.txt");
  });
});

// ---------------------------------------------------------------------------

/**
 * A body is as long as the model wrote it (M29b).
 *
 * `parseProposalBlocks` ended a BODY at the first line break. The terminator was
 * `$` under the `m` flag, which offers a position before every newline, and the
 * quantifier before it is lazy, so the `TYPE|TITLE` half of the alternation
 * almost never fired. A body written across three lines arrived as its first
 * line, with no error.
 *
 * Not cosmetic. The theory reader's body is three parts in order and the third
 * is the passage cited as `[[chunk:ID]]`, so a model that formatted them as
 * three lines lost the scope line and the citation, `extractCitations` found
 * nothing, and a claim drawn from an uploaded paper was flagged as citing no
 * material. The tool reporting its own parse loss as a defect in the
 * researcher's work.
 */
describe("a multi-line body survives the parser", () => {
  test("every line of a three-line body is kept", () => {
    const parsed = parseProposalBlocks(
      [
        "TYPE: theory",
        "TITLE: Handoffs fail when the receiver cannot question the sender",
        "BODY: Understanding is built by asking.",
        "It holds where the exchange is timed and the parties differ in seniority.",
        "[[chunk:c-llm-1]]",
      ].join("\n"),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.body).toBe(
      "Understanding is built by asking.\nIt holds where the exchange is timed and the parties differ in seniority.\n[[chunk:c-llm-1]]",
    );
  });

  test("a two-block answer still splits at the fence", () => {
    const parsed = parseProposalBlocks(
      [
        "TYPE: theory",
        "TITLE: First",
        "BODY: One.",
        "Still one.",
        "---",
        "TYPE: rival",
        "TITLE: Second",
        "BODY: Two.",
        "Still two.",
      ].join("\n"),
    );
    expect(parsed.map((p) => p.title)).toEqual(["First", "Second"]);
    expect(parsed[0]?.body).toBe("One.\nStill one.");
    expect(parsed[1]?.body).toBe("Two.\nStill two.");
  });

  test("a body followed by a second TYPE in the same block stops there", () => {
    // The half of the alternation that could almost never fire before, and the
    // reason the terminator is two branches rather than one: a model that
    // forgets the fence must not have its second block swallowed by the first.
    const parsed = parseProposalBlocks(
      [
        "TYPE: theory",
        "TITLE: First",
        "BODY: One.",
        "Still one.",
        "TYPE: rival",
        "TITLE: Second",
        "BODY: Two.",
      ].join("\n"),
    );
    expect(parsed[0]?.body).toBe("One.\nStill one.");
    expect(parsed[0]?.body).not.toContain("TYPE:");
  });

  test("Anti: a single-line body is unchanged, and so is a trailing newline", () => {
    expect(parseProposalBlocks("TYPE: theory\nTITLE: T\nBODY: Only.")[0]?.body).toBe("Only.");
    expect(parseProposalBlocks("TYPE: theory\nTITLE: T\nBODY: One.\nTwo.\n")[0]?.body).toBe(
      "One.\nTwo.",
    );
  });

  test("a staged expectation keeps its scope and its citation, so the claim is grounded", async () => {
    /* M33: the same defect end to end, one derivation earlier.
     *
     * The reader used to write a three-part body and the SETTING line had to be
     * cut back out of it. There is no second derivation now: the judge wrote
     * the expectation, the scope and the passage down when it judged the paper,
     * and staging puts the first in the title and the other two in the body.
     * The intent this test held is unchanged, which is that the citation
     * reaches the page so the page is not flagged as citing nothing. */
    const result = extractTheoryClaims({
      projectId: PROJECT,
      documents: [doc("d-llm", "handoffs.pdf", "literature")],
      chunks: [chunk("c-llm-1", "d-llm", "literature")],
      verdicts: new Map([
        [
          "d-llm",
          {
            paperKey: "d-llm",
            paperName: "handoffs.pdf",
            verdict: "fits" as const,
            reason: "It expects handovers to fail without questioning.",
            framingDigest: "d",
            model: "m",
            modelVersion: "v",
            baselines: [
              {
                id: "d-llm#0",
                expectation: "Handoffs fail when the receiver cannot question the sender.",
                scope: "where the exchange is timed",
                chunkId: "c-llm-1",
              },
            ],
          },
        ],
      ]),
    });
    const proposal = result.proposals[0];
    expect(proposal?.title).toBe("Handoffs fail when the receiver cannot question the sender.");
    expect(proposal?.body).toContain("Where the expectation applies: where the exchange is timed");
    expect(proposal?.body).toContain("[[chunk:c-llm-1]]");
    // The whole point: the citation reaches the page, so it is not flagged as
    // citing nothing in the researcher's material.
    expect(proposal?.sourceChunks).toEqual(["c-llm-1"]);
    // And no gate line, in a body the tool assembled rather than parsed.
    expect(proposal?.body).not.toContain("SETTING:");
    for (const e of result.events) expect(validateEvent(e)).toEqual([]);
  });

  test("the near-duplicate check reads titles, so a longer body cannot move it", async () => {
    // Cheap and definitive: the detector never looks at a body, so the change
    // cannot reach it. Asserted at the source rather than by fixture, because a
    // fixture would pass whether or not that stayed true.
    const src = await Bun.file(`${SRC}proposals/duplicates.ts`).text();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).toContain("titleSimilarity(proposal.title, page.title)");
    expect(code).not.toContain(".body");
  });

  test("the tray renders the whole body, and never a slice of it", async () => {
    const src = await Bun.file(`${SRC}workbench/ProposalsTrayView.tsx`).text();
    // Bound to the edit state whole. A textarea scrolls; it does not truncate.
    expect(src).toContain("value={edit.body}");
    expect(src).not.toContain("body.slice(");
  });
});

// ---------------------------------------------------------------------------

/**
 * The chooser has a door in every state (M29b).
 *
 * Found in Chrome on the sample study. With one draft pending the band's
 * primary read "Review suggestions", and "Name expectation" appeared nowhere,
 * on a page whose own first sentence said the puzzle breaks nothing yet. The
 * move is one control chosen by the first rule that holds, `drafts` outranks
 * `no-expectation`, and drafts are pending most of the time in a live study.
 * So the most consequential decision in a design had no door for most of a
 * session.
 */
describe("naming the expectation is reachable whatever holds the primary", () => {
  const unclaimed = [
    page("pz", "puzzle", "Night wards refuse the handover", "data-driven", ["c-data-1"]),
    page("th", "theory", "Handoffs fail without questioning", "literature-derived", ["c-lit-1"]),
  ];

  const band = (events: readonly LedgerEvent[], pending: number) =>
    projectArgument({
      graph: graphOf(events),
      trajectory: {
        mutations: { byOrigin: {}, population: 0, modelShare: 0 },
        points: [],
        byOp: {},
        finalResidue: 0,
        residueMonotonicallyShrinking: false,
      },
      tray: {
        projectId: PROJECT,
        all: [],
        pending: Array.from({ length: pending }, (_, i) => ({ id: `p${i}` })),
        rejected: [],
        accepted: [],
        merged: [],
        deferred: [],
      },
      anchoring: { unanchored: [], components: [], stranded: [], pageCount: 0, edgeCount: 0 },
      moves: [],
    } as unknown as Parameters<typeof projectArgument>[0]);

  test("the door is open while a draft holds the primary", () => {
    const model = band(unclaimed, 1);
    // The state that hid it: the primary is the queue, not the framing.
    expect(model.move.rule).toBe("drafts");
    expect(model.canNameExpectation).toBe(true);
  });

  test("the door is open when the primary is the framing itself", () => {
    const model = band(unclaimed, 0);
    expect(model.move.rule).toBe("no-expectation");
    expect(model.canNameExpectation).toBe(true);
  });

  test("it shuts once the puzzle stands to something", () => {
    const claimed = [...unclaimed, edge("pz", "th", "stands-to", "contradicts")];
    expect(band(claimed, 1).canNameExpectation).toBe(false);
  });

  test("it shuts when there is no expectation to offer", () => {
    // Asking before one exists would be asking the researcher to invent one in
    // a radio list, which is the tool doing their framing for them.
    const bare = [page("pz", "puzzle", "A puzzle", "data-driven", ["c1"])];
    expect(band(bare, 1).canNameExpectation).toBe(false);
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel, OntologyView, ui/OntologyView.tsx, workbench/PagePanel.tsx left with it; superseded: "the puzzle"
});

// ---------------------------------------------------------------------------

describe("a typed paper that doesn't fit gets a line of its own (M29b)", () => {
  test("Material lists every judged typed line under the list they were typed into", async () => {
    /* M29c: the list widened from the misfits to every line with a verdict.
     * Listing only the failures meant a researcher who typed four lines and saw
     * one notice could not tell whether the other three had been judged and
     * passed or had never been read at all. The misfit still carries the
     * reader's own sentence beside the line it is about. */
    const src = await Bun.file(`${SRC}flow/SeminalCorpus.tsx`).text();
    expect(src).toContain("typed-misfits");
    /* Walk item 4 addendum: the row is keyed and named by its position, not by
     * its own text. A row rendered as one line's start with another line's tail
     * spliced onto it, and two lines can hold the same string while one is
     * being edited into the other, which is how React comes to reuse a row. */
    expect(src).toContain("data-testid={`typed-line-${l.index}`}");
    /* M51, ISC-533. The line carried whichever sentence the tool had about it,
       the finding's or the judge's, and on a paper it could not place both were
       the dismissal. A placed paper keeps the judge's sentence; an unplaced one
       carries the question. */
    /* M78a, ISC-678: a typed line with no file is Named, not judged, so it
       carries the Named note in place of a judge's sentence. */
    expect(src).toContain("{NAMED_NOTE}");
    /* Walk item 4: the list widened again, from every line with a verdict to
     * every line. A line the tool had not judged rendered nothing at all, so a
     * researcher who rewrote two of their three titles saw one row and no sign
     * that the other two were unjudged rather than fine. The chip now carries
     * the state a line is in when it has no verdict. */
    /* M78a, ISC-678: a line with no file behind it reads Named. */
    expect(src).toContain('state={l.uploaded === undefined ? "named" : judging ? "judging" : "unjudged"}');
    expect(src).toContain("{typedLines.length > 0 && (");
  });

  test("a line with a file behind it says which file, rather than vanishing", async () => {
    /* This reverses M29c's "a paper is named once", on the owner's call after
     * checking both versions live. Hiding the line made the reader look lost:
     * four lines in the box, two rows on the page, and nothing saying the tool
     * had matched the missing two to files. The line stays, carries the file's
     * name and takes the file's verdict.
     *
     * `papersToRead` still excludes the duplicate, and that is the exclusion
     * that costs something: it is what stops a second call on one paper.
     *
     * The file it names is the best match rather than the first. Two files by
     * the same authors in different years both answer to either line on a
     * single-token test, so "Hilligoss and Cohen 2013" matched the 2010 file. */
    const src = await Bun.file(`${SRC}flow/SeminalCorpus.tsx`).text();
    expect(src).toContain("const named = bestNamedDocument(line, documents);");
    expect(src).toContain("const key = named?.id ?? citationKey(line);");
    expect(src).toContain("label={`uploaded as ${l.uploaded}`}");
    expect(src).not.toContain("bestNamedDocument(line, documents) === undefined");
  });

});

// ---------------------------------------------------------------------------

/**
 * The flow critic's final residue (batch 3).
 *
 * Seven of eight passed; what is here is the eleven-item tail, most of it two
 * places on one screen saying different things about the same fact.
 */
describe("Your ontology stops contradicting itself", () => {
  // M63, the lead's rulings of 2026-09-30: the old model tab's OntologyView, ReviewerLine, ui/OntologyView.tsx, ui/model/ReviewerLine.tsx left with it; superseded: "the reviewer line says why no claim owes anything, when none does"

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("the band offers a route to the drafts that would fill the gap it names", () => {
    const unclaimed = [
      page("pz", "puzzle", "Night wards refuse the handover", "data-driven", ["c-data-1"]),
      page("th", "theory", "An expectation already in", "literature-derived", ["c-lit-1"]),
    ];
    const withDrafts = (pending: readonly { pageType?: string; originOnAccept?: string }[]) =>
      projectArgument({
        graph: graphOf(unclaimed),
        trajectory: {
          mutations: { byOrigin: {}, population: 0, modelShare: 0 },
          points: [],
          byOp: {},
          finalResidue: 0,
          residueMonotonicallyShrinking: false,
        },
        tray: {
          projectId: PROJECT,
          all: [],
          pending,
          rejected: [],
          accepted: [],
          merged: [],
          deferred: [],
        },
        anchoring: { unanchored: [], components: [], stranded: [], pageCount: 0, edgeCount: 0 },
        moves: [],
      } as unknown as Parameters<typeof projectArgument>[0]);

    /* Walk item 2: a paper draft, which is what a draft that fills this slot
     * now is. The count was every pending theory draft, including the ones the
     * data reader wrote out of the researcher's own transcript, and the band
     * offered "8 of the drafts below would fill this" over a chooser that would
     * list two. The criterion is unchanged: the drafts that are a click away
     * from being the expectation. What changed is which drafts those are. */
    const fromPapers = { pageType: "theory", originOnAccept: "literature-derived" };
    const five = withDrafts(Array.from({ length: 5 }, () => fromPapers));
    expect(five.draftsThatWouldFill).toBe(5);
    expect(fillableClause(five)).toBe("You could fill that gap with 5 of the suggestions below.");
    // Only the drafts that would become an expectation, because those are the
    // ones the chooser needs one of.
    const mixed = withDrafts([fromPapers, { pageType: "observation" }]);
    expect(mixed.draftsThatWouldFill).toBe(1);
    // And a theory draft that came out of the researcher's own material is not
    // one of them: the chooser will not offer the page it becomes.
    expect(withDrafts([{ pageType: "theory" }]).draftsThatWouldFill).toBe(0);
    // A route to an empty queue is worse than no route.
    expect(fillableClause(withDrafts([]))).toBe("");
  });

  test("the lede names both ways a claim gets drafted", async () => {
    // M62, ISC-600: the lede moved into Your model's Help panel.
    const src = await Bun.file(`${SRC}ui/pageHelp.ts`).text();
    // ProseCodex batch 2: the string moved; the criterion did not.
    // M63, ISC-614: the help names both occasions a concept is suggested.
    expect(src).toContain("Abductive suggests concepts after you save a summary at a step or read your data, and you accept, refine or reject each one.");
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel, workbench/PagePanel.tsx left with it; superseded: "the claims table renders the mark, never its own column name"

  // M63, the lead's rulings of 2026-09-30: the old model tab's ResiduePanel, ui/model/ResiduePanel.tsx left with it; superseded: "no trend caption stands over a series that has never left zero"
});

describe("the counts and the chips agree with the screens beside them", () => {
  test("the queue counts the drafts without claiming where they came from", async () => {
    const src = await Bun.file(`${SRC}workbench/NextBar.tsx`).text();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).toContain("to review.");
    // Provenance is the promise the product is built on, and most of that queue
    // is drafted from the papers. The comment recording that keeps the phrase;
    // the rendered sentence must not.
    expect(code).not.toContain("suggested from your answers");
    const routes = await Bun.file(`${SRC}ui/routes.ts`).text();
    expect(routes).not.toContain("suggested from your answers");
  });

  test("the papers field reports whether the screen matches the record", async () => {
    const src = await Bun.file(`${SRC}flow/SeminalCorpus.tsx`).text();
    // Three states, the way the step column already does it. It read "Nothing
    // to save yet" beside a field holding a saved paper.
    expect(src).toContain('draft.trim() === "" ? "Empty" : "Saved"');
  });

  test("an export count says what it is made of when two screens count differently", () => {
    const { exportPlan } = require("../src/export/exportContains.ts") as {
      exportPlan: typeof import("../src/export/exportContains.ts").exportPlan;
    };
    const documents = [
      doc("d-int", "interview-1.txt", "transcript"),
      doc("d-note", "field-notes.md", "fieldnote"),
      doc("d-lit", "bechky.pdf", "literature"),
    ];
    const chunks = [
      chunk("c-1", "d-int", "transcript"),
      chunk("c-2", "d-note", "fieldnote"),
      chunk("c-3", "d-lit", "literature"),
    ];
    const plan = exportPlan({
      project: { id: PROJECT, title: "A study", stage: "design-brief", createdAt: 1, brief: emptyBrief() },
      graph: graphOf([]),
      events: [],
      chunks,
      documents,
    } as unknown as Parameters<typeof exportPlan>[0]);
    const bundle = plan.contains.bundle;
    expect(bundle.find((c) => c.label === "documents")?.note).toBe("2 data, 1 paper");
    expect(bundle.find((c) => c.label === "passages")?.note).toBe("2 data, 1 paper");
  });

  test("Anti: a study of one kind gets no split it does not need", () => {
    const { exportPlan } = require("../src/export/exportContains.ts") as {
      exportPlan: typeof import("../src/export/exportContains.ts").exportPlan;
    };
    const plan = exportPlan({
      project: { id: PROJECT, title: "A study", stage: "design-brief", createdAt: 1, brief: emptyBrief() },
      graph: graphOf([]),
      events: [],
      chunks: [chunk("c-1", "d-int", "transcript")],
      documents: [doc("d-int", "interview-1.txt", "transcript")],
    } as unknown as Parameters<typeof exportPlan>[0]);
    expect(plan.contains.bundle.find((c) => c.label === "documents")?.note).toBeUndefined();
  });
});

describe("a why is asked once, and the fit verdict reaches the reader as a sentence", () => {
  test("the station's fold says its piece once", async () => {
    const src = await Bun.file(`${SRC}flow/StationWorkspace.tsx`).text();
    // Four sentences restated the station's own `feeds` line directly above
    // them, inside the same fold, and repeated "stays in your words" from two
    // lines higher on the card.
    expect(src).not.toContain("The conversation beside it is the other half.");
    expect(src).not.toContain("station-feeds-note");
    // M62, ISC-600: the step's line left its fold for Design's Help panel,
    // which names the step you are on.
    const help = await Bun.file(`${SRC}ui/HelpControl.tsx`).text();
    expect(help).toContain("stationById(station).feeds]");
    const css = await Bun.file(`${SRC}ui/styles/design.css`).text();
    expect(css).not.toContain(".station-feeds-note {");
  });

  test("Anti: the tray's why was already folded, and stays folded", async () => {
    // M62, ISC-600: the fold's two paragraphs moved into Your model's Help
    // panel; the one instruction stays before the first control, since it
    // glosses "claim" where a reader meets it (held for the lead).
    const src = await Bun.file(`${SRC}workbench/ProposalsTrayView.tsx`).text();
    const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(code).not.toContain('<Disclosure summary="Learn more"');
    expect(code).toContain("Read each suggestion, edit anything that you wouldn't defend, then decide.");
    const help = await Bun.file(`${SRC}ui/pageHelp.ts`).text();
    expect(help).toContain("Edit the suggestions first.");
  });

  test("a verdict written as a table row still reaches the reader as prose", () => {
    // It rendered as "| This is a methods paper about how to use LLMs" on two
    // tabs: a table character out of a prompt, in a sentence addressed to a
    // person. Every separator a model reaches for is the same mark here.
    for (const separator of ["|", "-", ".", ":", "—"]) {
      expect(parseFit(`FIT: misfit ${separator} This is a methods paper.`)).toEqual({
        fit: "misfit",
        reason: "This is a methods paper.",
      });
    }
    expect(parseFit("FIT: unclear || - Cannot tell.").reason).toBe("Cannot tell.");
    // And a verdict with no sentence after it still parses as a verdict.
    expect(parseFit("FIT: fits")).toEqual({ fit: "fits", reason: "" });
  });
});
