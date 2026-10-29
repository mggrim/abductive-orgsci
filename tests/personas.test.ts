/**
 * Persona engine tests (ISC-14, ISC-19, ISC-22, ISC-23).
 */

import { describe, expect, test } from "bun:test";
import { validateEvent } from "../src/ledger/events.ts";
import { getCell } from "../src/matrix/matrix.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import {
  assembleSystemPrompt,
  assembleUserMessage,
  extractCitations,
  questionSetFor,
  runIntervention,
  splitChallenges,
} from "../src/personas/engine.ts";
import { TEST_CREEDS, testChunk, testProject } from "./persona-helpers.ts";

const CELL = getCell("confirmation:design-brief");
if (CELL === undefined) throw new Error("fixture cell missing from registry");

describe("questionSetFor (ISC-19)", () => {
  test("switches question sets by declared data type", () => {
    const ethno = questionSetFor("ethnographic");
    const interview = questionSetFor("interview");
    const archival = questionSetFor("archival");

    // Three distinct sets.
    expect(ethno).not.toBe(interview);
    expect(interview).not.toBe(archival);
    expect(ethno).not.toBe(archival);

    // Ethnographic: reflective/prompting, acknowledges partial observability.
    expect(ethno).toContain("reflective");
    expect(ethno.toLowerCase()).toContain("partial");
    expect(ethno.toLowerCase()).toContain("positioned");

    // Archival: direct data interrogation.
    expect(archival.toLowerCase()).toContain("interrogat");
    expect(archival.toLowerCase()).toContain("document");

    // Interview sits between: probes accounts.
    expect(interview.toLowerCase()).toContain("account");
  });
});

describe("prompt assembly (ISC-14)", () => {
  test("system prompt includes creed text, cell prompt, and question set", () => {
    const creed = TEST_CREEDS["eisenhardt-positivist"];
    if (creed === undefined) throw new Error("test creed missing");
    const prompt = assembleSystemPrompt({ creed, cell: CELL, dataType: "archival" });

    expect(prompt).toContain("Theoretical sampling, not random sampling"); // creed content
    expect(prompt).toContain(CELL.prompt); // cell intervention prompt
    expect(prompt).toContain(questionSetFor("archival")); // data-type question set
    expect(prompt).toContain("[[chunk:ID]]"); // citation instruction
  });

  test("mock client captures a request whose system prompt contains the creed", async () => {
    const client = new MockInferenceClient();
    await runIntervention(
      CELL,
      { project: testProject(), chunks: [], priorEvents: [], creeds: TEST_CREEDS },
      client,
    );

    expect(client.requests.length).toBe(CELL.personas.length);
    const req = client.requests[0];
    if (req === undefined) throw new Error("no captured request");
    const slug = CELL.personas[0];
    if (slug === undefined) throw new Error("cell has no personas");
    expect(req.system).toContain(TEST_CREEDS[slug] ?? "MISSING");
  });

  test("user message carries chunk ids and the brief", () => {
    const message = assembleUserMessage({
      project: testProject(),
      chunks: [testChunk("chunk-a"), testChunk("chunk-b", 1)],
      priorEvents: [],
    });
    expect(message).toContain("[chunk:chunk-a]");
    expect(message).toContain("[chunk:chunk-b]");
    expect(message).toContain("How do handoff routines absorb interruption?");
  });
});

describe("response parsing", () => {
  test("extractCitations finds distinct [[chunk:ID]] citations", () => {
    const text =
      "See [[chunk:abc-1]] and again [[chunk:abc-1]], but also [[chunk:def-2]].";
    expect(extractCitations(text)).toEqual(["abc-1", "def-2"]);
  });

  test("splitChallenges splits on --- separators and drops empties", () => {
    expect(splitChallenges("First.\n---\nSecond.\n\n---\n")).toEqual([
      "First.",
      "Second.",
    ]);
  });
});

describe("runIntervention events", () => {
  test("citation parsing emits attention:citation events (ISC-23)", async () => {
    const client = new MockInferenceClient({
      responses: ["The claim rests on [[chunk:chunk-a]] alone.\n---\nAnd [[chunk:chunk-b]] contradicts it."],
    });
    const result = await runIntervention(
      { ...CELL, personas: ["tavory-timmermans-abduction"] },
      {
        project: testProject(),
        chunks: [testChunk("chunk-a"), testChunk("chunk-b", 1)],
        priorEvents: [],
        creeds: TEST_CREEDS,
      },
      client,
    );

    const cited = result.citationAttention.map((e) => e.chunkId);
    expect(cited).toEqual(["chunk-a", "chunk-b"]);
    for (const event of result.citationAttention) {
      expect(event.type).toBe("attention");
      expect(event.layer).toBe("citation");
      expect(validateEvent(event)).toEqual([]);
    }
    // The [---]-separated response became two challenges.
    expect(result.challenges.length).toBe(2);
  });

  test("every chunk in context emits an attention:retrieval event (ISC-22)", async () => {
    const chunks = [testChunk("c1"), testChunk("c2", 1), testChunk("c3", 2)];
    const result = await runIntervention(
      CELL,
      { project: testProject(), chunks, priorEvents: [], creeds: TEST_CREEDS },
      new MockInferenceClient(),
    );
    expect(result.retrievalAttention.map((e) => e.chunkId)).toEqual(["c1", "c2", "c3"]);
    for (const event of result.retrievalAttention) {
      expect(event.layer).toBe("retrieval");
      expect(validateEvent(event)).toEqual([]);
    }
  });

  test("challenge events carry persona actor, model and modelVersion (ISC-5, ISC-14)", async () => {
    const client = new MockInferenceClient({
      model: "mock",
      modelVersion: "mock-9.9",
      responses: ["A pointed challenge to the framing."],
    });
    const result = await runIntervention(
      { ...CELL, personas: ["langley-process"] },
      { project: testProject(), chunks: [], priorEvents: [], creeds: TEST_CREEDS },
      client,
    );

    expect(result.challenges.length).toBe(1);
    const challenge = result.challenges[0];
    if (challenge === undefined) throw new Error("no challenge produced");
    expect(challenge.actor).toBe("persona:langley-process");
    expect(challenge.model).toBe("mock");
    expect(challenge.modelVersion).toBe("mock-9.9");
    expect(challenge.text.length).toBeGreaterThan(0);
    expect(challenge.matrixCell).toBe(CELL.id);
    expect(validateEvent(challenge)).toEqual([]);
  });

  test("one inference call per persona on multi-persona cells", async () => {
    const multi = getCell("limited-attention:design-brief");
    if (multi === undefined) throw new Error("fixture cell missing");
    const client = new MockInferenceClient();
    const result = await runIntervention(
      multi,
      { project: testProject(), chunks: [], priorEvents: [], creeds: TEST_CREEDS },
      client,
    );
    expect(client.requests.length).toBe(multi.personas.length);
    expect(result.challenges.length).toBeGreaterThanOrEqual(multi.personas.length);
  });

  test("throws a clear error when a creed is missing", async () => {
    await expect(
      runIntervention(
        CELL,
        { project: testProject(), chunks: [], priorEvents: [], creeds: {} },
        new MockInferenceClient(),
      ),
    ).rejects.toThrow(/No creed loaded/);
  });
});
