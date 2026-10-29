/**
 * The interviewer can see the design it is interviewing about (ISC-281 … ISC-289).
 *
 * The first live turn Abductive ever produced opened "Since the ontology is empty
 * right now, I want to start from the ground rather than from any framework you
 * might import" — immediately after the researcher had filled in the context
 * station with a site, a phenomenon and a research question. The model was not
 * being obtuse. `assembleTurnPrompt` received a count of pages by type and the
 * previous message, and nothing else: not the brief, not the venue, not the
 * arc of the conversation.
 *
 * A co-author's asks on 4 August all land on the same hole from the other
 * side — the tool should know where you want to publish, it should not ask for
 * what you have already said — so this is the prerequisite for all of them.
 */

import { describe, expect, test } from "bun:test";
import { assembleTurnPrompt, proposedAnswerViolations } from "../src/interview/prompt.ts";
import {
  designDigest,
  digestIsEmpty,
  ontologyDigest,
  transcriptDigest,
} from "../src/interview/designDigest.ts";
import { emptyBrief } from "../src/state/projects.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import type { NextMove } from "../src/interview/types.ts";
import type { Chunk } from "../src/state/chunks.ts";

const P = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

const ASK: NextMove = {
  id: "m1",
  mode: "interrogation",
  question: "What is happening in your field site that you cannot currently account for?",
  topic: "puzzle:root",
  rationale: "No puzzle root exists yet.",
} as NextMove;

const FILLED = {
  ...emptyBrief(),
  researchQuestion: "How do patient stories change as they pass across the night-shift handoff?",
  context: "Night handoffs on an acute ward. The same patient gets described three different ways.",
  targetVenue: "US management journals, or ASQ",
  seminalCorpus: "Zuckerman on genres and puzzles; Langley on process.",
};

describe("the digest carries what the researcher has said", () => {
  test("station answers, the question, the venue and the corpus all appear (ISC-281)", () => {
    const d = designDigest(FILLED);
    expect(d.researchQuestion).toContain("night-shift handoff");
    expect(d.stations.map((s) => s.label)).toContain("Context");
    expect(d.targetVenue).toContain("ASQ");
    expect(d.corpus).toContain("Zuckerman");
  });

  test("empty stations are dropped rather than sent as blanks (ISC-282)", () => {
    const d = designDigest(FILLED);
    expect(d.stations.every((s) => s.text.trim() !== "")).toBe(true);
    expect(d.stations.length).toBeLessThan(8);
  });

  test("a brand-new study reads as empty (ISC-283)", () => {
    expect(digestIsEmpty(designDigest(emptyBrief()))).toBe(true);
  });

  test("Anti: a filled brief never reads as empty", () => {
    expect(digestIsEmpty(designDigest(FILLED))).toBe(false);
  });
});

describe("the ontology is described by name, not by census", () => {
  const mutation = (targetId: string, title: string, pageType: string): LedgerEvent =>
    ({
      id: crypto.randomUUID(),
      ts: Date.now(),
      actor: "human",
      projectId: P,
      type: "ontology-mutation",
      op: "create",
      targetId,
      pageType,
      origin: "author-prior",
      title,
      body: "b",
    }) as LedgerEvent;

  test("page titles reach the prompt (ISC-284)", () => {
    const graph = projectOntology(
      [mutation(crypto.randomUUID(), "Drift nobody notices happening", "observation")],
      P,
    );
    const text = ontologyDigest(graph);
    expect(text).toContain("Drift nobody notices happening");
    expect(text).toContain("observation");
  });

  test("an empty graph produces nothing rather than a zero count (ISC-285)", () => {
    expect(ontologyDigest(projectOntology([], P))).toBe("");
  });

  test("Anti: the digest is no longer a count of types", () => {
    const graph = projectOntology(
      [
        mutation(crypto.randomUUID(), "First thing", "observation"),
        mutation(crypto.randomUUID(), "Second thing", "observation"),
      ],
      P,
    );
    expect(ontologyDigest(graph)).not.toBe("2 observation");
    expect(ontologyDigest(graph)).toContain("Second thing");
  });
});

describe("the turn prompt is assembled from both", () => {
  test("the design reaches the prompt (ISC-286)", () => {
    const prompt = assembleTurnPrompt({
      move: ASK,
      chunks: [],
      ontologySummary: "",
      design: designDigest(FILLED),
    });
    expect(prompt).toContain("Night handoffs on an acute ward");
    expect(prompt).toContain("US management journals");
    expect(prompt).toContain("Zuckerman");
  });

  test("the question is still the last thing the model reads (ISC-287)", () => {
    const prompt = assembleTurnPrompt({
      move: ASK,
      chunks: [],
      ontologySummary: "",
      design: designDigest(FILLED),
      transcriptDigest: transcriptDigest([{ kind: "human", text: "Something I said earlier." }]),
    });
    expect(prompt.indexOf("## What they have told you")).toBeLessThan(
      prompt.indexOf("## Your question this turn"),
    );
    expect(prompt.trimEnd().endsWith(ASK.question)).toBe(true);
  });

  test("earlier turns are carried, oldest first, and bounded (ISC-288)", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ kind: "human", text: `turn ${i}` }));
    const digest = transcriptDigest(many);
    expect(digest.length).toBeLessThanOrEqual(6);
    expect(digest[digest.length - 1]).toContain("turn 19");
    expect(digest[0]).toContain("They said");
  });
});

describe("the leak detector reads what the tool wrote, not what the researcher did", () => {
  const chunk = (text: string): Chunk =>
    ({ id: "c1", projectId: P, kind: "fieldnote", index: 0, text }) as Chunk;

  test("a researcher's own word no longer breaks their interview (ISC-289)", () => {
    // Verbatim the failure: an uploaded field note containing "Presumably"
    // tripped "asserts the likely answer", and assembleTurnPrompt threw for
    // every interrogation turn in that study.
    expect(() =>
      assembleTurnPrompt({
        move: ASK,
        chunks: [chunk("Presumably the nurses agree before the handoff ends.")],
        ontologySummary: "",
      }),
    ).not.toThrow();
  });

  test("their brief cannot break it either (ISC-289)", () => {
    expect(() =>
      assembleTurnPrompt({
        move: ASK,
        chunks: [],
        ontologySummary: "",
        design: designDigest({ ...FILLED, context: "I suggest the drift is presumably social." }),
      }),
    ).not.toThrow();
  });

  test("Anti: a move that carries its own answer still throws (ISC-289)", () => {
    const leaky = { ...ASK, id: "m2", question: "Perhaps because they disagree, what did you see?" };
    expect(() =>
      assembleTurnPrompt({ move: leaky as NextMove, chunks: [], ontologySummary: "" }),
    ).toThrow(/supplies an answer/);
  });

  test("Anti: the detector itself is unchanged and still matches", () => {
    expect(proposedAnswerViolations("Presumably this is it.").length).toBe(1);
  });
});
