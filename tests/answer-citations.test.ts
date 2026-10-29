/**
 * The passage an answer draws on, cited on the page drafted from it (M35, D8).
 *
 * The walk, after the D7 fix. Two observations drafted from the answer to the
 * evidence question attached to the puzzle, and the band moved on to the next
 * clause of the same debt: "You have 2 observations, but they all come from 0
 * documents, so the deviation rests on one source." Both observations quote the
 * study's own material, one Priya's account of the finance model and one the
 * board paper's "a fully costed unit at £7.40", but a page drafted from an
 * answer carried no citation at all, so the half of the burden that asks for
 * more than one source document could never be met through the interview, which
 * is the only route the tool offers.
 *
 * The drafter now gets the study's data passages and is asked to cite the one an
 * observation rests on, in the citation form every other generator uses and
 * through the same parse. What that buys is the last clause of the sentence the
 * researcher was reading.
 *
 * Three guarantees hold the edges. Papers are not data, and `citableChunks` is
 * on the path that writes rather than in a comment. An id the model invents is
 * not a citation, because nothing outside what was handed over survives. And an
 * answer that points at nothing still drafts, uncited, because most answers do.
 */

import { describe, expect, test } from "bun:test";
import type { Chunk } from "../src/state/chunks.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import {
  MAX_PASSAGES_IN_PROMPT,
  passagesForAnswer,
} from "../src/interview/glean.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { checkObligation, chunkDocuments } from "../src/ontology/relations.ts";
import type { InferenceClient } from "../src/inference/types.ts";

const P = "proj-d8";

let seq = 0;
const uid = () => `bbbbbbbb-8888-4888-8888-${String((seq += 1)).padStart(12, "0")}`;
const now = () => 1_700_000_000_000 + (seq += 1);

const chunk = (id: string, documentId: string, text: string, kind = "interview"): Chunk =>
  ({ id, projectId: P, documentId, kind, text, index: 0 }) as Chunk;

/** The walk's two documents, and a paper that must never reach the drafter. */
const PRIYA = chunk("c-priya", "d-priya", "Priya said the finance model was never costed.");
const BOARD = chunk("c-board", "d-board", "The board paper promised a fully costed unit at £7.40.");
const PAPER = chunk("c-paper", "d-paper", "Smith and Besharov on logic multiplicity.", "literature");

const NAMES = new Map([
  ["d-priya", "priya-21-may.txt"],
  ["d-board", "board-paper-28-april.pdf"],
  ["d-paper", "smith-besharov-2019.pdf"],
]);

const ANSWER = [
  "The board paper says one thing and the finance model says another.",
  "Priya walked me through it on 21 May and could not reconcile the two.",
].join(" ");

/** A client that answers with whatever text it is given, and records the prompt. */
function saying(text: string): { client: InferenceClient; prompt: () => string } {
  let prompt = "";
  const client = {
    complete: async (req: { messages: readonly { content: string }[] }) => {
      prompt = req.messages.map((m) => m.content).join("\n");
      return { text, model: "m", modelVersion: "v" };
    },
  } as unknown as InferenceClient;
  return { client, prompt: () => prompt };
}

const block = (title: string, body: string) =>
  ["TYPE: observation", `TITLE: ${title}`, `BODY: ${body}`].join("\n");

describe("which passages the drafter is given", () => {
  test("all of them, on a study small enough to hand over whole", () => {
    const picked = passagesForAnswer(
      { chunks: [PRIYA, BOARD], documentNames: NAMES },
      "an answer naming nothing at all",
    );
    expect(picked.map((c) => c.id)).toEqual(["c-priya", "c-board"]);
  });

  test("never a paper, whatever the answer says", () => {
    /* The same rule the paper judge follows. A paper is not evidence about the
     * setting, and an observation resting on one is somebody's argument wearing
     * the clothes of fieldwork. */
    const picked = passagesForAnswer(
      { chunks: [PRIYA, PAPER], documentNames: NAMES },
      "Smith and Besharov say logics compete.",
    );
    expect(picked.map((c) => c.id)).toEqual(["c-priya"]);
  });

  test("past the cap, only the documents the answer names", () => {
    /* A corpus of any size in every prompt is a cost on every answer, so past
     * the cap the answer's own words choose. The match is the one this codebase
     * already uses to decide whether a piece of text names a file. */
    const many: Chunk[] = [];
    for (let i = 0; i <= MAX_PASSAGES_IN_PROMPT; i += 1) {
      many.push(chunk(`c-other-${i}`, `d-other-${i}`, "an unrelated passage"));
    }
    const names = new Map(NAMES);
    for (let i = 0; i <= MAX_PASSAGES_IN_PROMPT; i += 1) names.set(`d-other-${i}`, `notes-${i}.txt`);
    const picked = passagesForAnswer(
      { chunks: [...many, PRIYA, BOARD], documentNames: names },
      ANSWER,
    );
    expect(picked.map((c) => c.id)).toEqual(["c-priya", "c-board"]);
  });

  test("past the cap, an answer naming nothing hands over nothing", () => {
    const many: Chunk[] = [];
    const names = new Map<string, string>();
    for (let i = 0; i <= MAX_PASSAGES_IN_PROMPT; i += 1) {
      many.push(chunk(`c-other-${i}`, `d-other-${i}`, "an unrelated passage"));
      names.set(`d-other-${i}`, `notes-${i}.txt`);
    }
    expect(passagesForAnswer({ chunks: many, documentNames: names }, ANSWER)).toEqual([]);
  });

  test("no material at all is the state every earlier answer was drafted in", () => {
    expect(passagesForAnswer(undefined, ANSWER)).toEqual([]);
  });
});

describe("the surface that records an answer hands the material over", () => {
  test("the station column supplies them", async () => {
    const src = await Bun.file(
      new URL("../src/workbench/Workbench.tsx", import.meta.url).pathname,
    ).text();
    expect(src).toContain("documents={documents}");
  });
});

describe("the sentence the researcher was reading", () => {
  const PUZZLE = "page-puzzle";
  const THEORY = "page-theory";

  const page = (input: {
    id: string;
    type: string;
    title: string;
    chunks?: readonly string[];
    origin?: string;
    turn?: string;
  }): LedgerEvent =>
    ({
      id: uid(),
      ts: now(),
      actor: "human",
      projectId: P,
      type: "ontology-mutation",
      op: "create",
      targetId: input.id,
      pageType: input.type,
      title: input.title,
      body: "",
      origin: input.origin ?? "model-proposed",
      supportingChunks: input.chunks ?? [],
      ...(input.turn === undefined ? {} : { supportingTurn: input.turn }),
    }) as unknown as LedgerEvent;

  const evidences = (from: string) =>
    ({
      id: uid(),
      ts: now(),
      actor: "human",
      projectId: P,
      type: "ontology-mutation",
      op: "relate",
      targetId: `${from}->${PUZZLE}:evidences`,
      edge: { from, to: PUZZLE, role: "evidences" },
      origin: "author-prior",
      supportingChunks: [],
    }) as unknown as LedgerEvent;

  const claim = {
    id: uid(),
    ts: now(),
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "relate",
    targetId: `${PUZZLE}->${THEORY}:stands-to`,
    edge: { from: PUZZLE, to: THEORY, role: "stands-to" },
    puzzleRelation: "contradicts",
    origin: "author-prior",
    supportingChunks: [],
  } as unknown as LedgerEvent;

  const base = (cited: readonly string[]): readonly LedgerEvent[] => [
    page({ id: PUZZLE, type: "puzzle", title: "The costed unit nobody could reconcile" }),
    page({ id: THEORY, type: "theory", title: "Logics compete until one wins" }),
    claim,
    page({ id: "o1", type: "observation", title: "Priya on the finance model", turn: "turn-1" }),
    evidences("o1"),
    page({
      id: "o2",
      type: "observation",
      title: "The board paper's costed unit",
      chunks: cited,
      turn: "turn-1",
    }),
    evidences("o2"),
  ];

  const docs = chunkDocuments([PRIYA, BOARD]);

  /**
   * No state of this sentence says "0 documents" (M42).
   *
   * The owner read "You have 2 observations, but they all come from 0 documents,
   * so the deviation rests on one source" on the argument band. Every number in it
   * was right. What was wrong was the clause after the count: two observations
   * that cite no passage do not rest on one source, they rest on nothing, and a
   * reader told the pattern rests on one source goes looking for the source. The
   * three states of the burden now have three sentences, and this holds them to
   * never printing a count of none as though it were a count of one.
   */
  test("no state of the detail counts none as one", () => {
    const none = checkObligation(projectOntology(base([]), P), PUZZLE, THEORY, "contradicts", docs);
    expect(none.discharged).toBe(false);
    expect(none.detail).not.toContain("0 document");
    expect(none.detail).toContain("none of those observations cites a passage");
    // And it does not promise a source that is not there.
    expect(none.detail).not.toContain("rests on one source");

    const one = checkObligation(
      projectOntology(base([BOARD.id]), P),
      PUZZLE,
      THEORY,
      "contradicts",
      docs,
    );
    expect(one.discharged).toBe(false);
    expect(one.detail).toContain("from 1 document");
    expect(one.detail).toContain("rests on one source");

    /* Two documents discharge it, which is the third state and the one the
     * requirement promises. Asserted here as well as in the test below, because
     * the property under test is that the three states are distinguishable at
     * all. */
    const two = checkObligation(
      projectOntology(
        base([BOARD.id]).map((e) =>
          (e as { targetId?: string }).targetId === "o1"
            ? ({ ...(e as object), supportingChunks: [PRIYA.id] } as unknown as LedgerEvent)
            : e,
        ),
        P,
      ),
      PUZZLE,
      THEORY,
      "contradicts",
      docs,
    );
    expect(two.detail).toContain("across 2 documents");
  });

  test("the count of documents behind the evidence moves from none to one", () => {
    const before = projectOntology(base([]), P);
    expect(checkObligation(before, PUZZLE, THEORY, "contradicts", docs).detail).toBe(
      /* M42. This expectation was the defect: "come from 0 documents, so the
       * deviation rests on one source" counted correctly and then said something
       * false about the count, because two observations citing no passage rest on
       * nothing. The states are two sentences now, and the way out of each is
       * different: with none you need a passage, with one you need a second
       * document. What this test protects is unchanged, the count moving from none
       * to one. */
      "You have 2 observations, and none of those observations cites a passage of your data, so the pattern lacks an anchor in your data",
    );

    const after = projectOntology(base([BOARD.id]), P);
    expect(checkObligation(after, PUZZLE, THEORY, "contradicts", docs).detail).toBe(
      "You have 2 observations from 1 document, so the pattern rests on one source",
    );
  });

  test("two observations from two documents discharge it", () => {
    const events = base([BOARD.id]).map((e) =>
      (e as { targetId?: string }).targetId === "o1"
        ? ({ ...(e as object), supportingChunks: [PRIYA.id] } as unknown as LedgerEvent)
        : e,
    );
    const graph = projectOntology(events, P);
    expect(checkObligation(graph, PUZZLE, THEORY, "contradicts", docs)).toMatchObject({
      discharged: true,
      detail: "You have 2 observations across 2 documents",
    });
  });
});
