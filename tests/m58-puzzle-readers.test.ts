/**
 * The model and the exports know the puzzle step (M58, ISC-568).
 *
 * From M40 to M57 "the puzzle" everywhere meant the tool's reading, stored in
 * `researchQuestion`. M58 makes the puzzle a step the researcher answers. Every
 * reader now takes the answer when there is one and keeps the reading beside it
 * with whose words each is, and nothing that read the reading breaks when a
 * study has the reading and no answer.
 */
import { describe, expect, test } from "bun:test";
import { designDigest } from "../src/interview/designDigest.ts";
import { describeDesign } from "../src/interview/prompt.ts";
import { renderStudyContext, studyContext } from "../src/interview/studyContext.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { buildWikiFiles } from "../src/export/wikiDirectory.ts";
import { buildAgentGraph } from "../src/export/agentGraph.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { answerProvenance, noTurnsLine } from "../src/views/provenance.ts";
import { puzzleOfRecord } from "../src/views/puzzleReading.ts";
import { emptyBrief, type Project, type ProjectBrief } from "../src/state/projects.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const ID = "p-m58";
const ANSWER = "Why did a sheet meant to judge the venture end up scoring who knew the founder?";
const READING = "You expected the sheet to judge the venture; the scores followed introductions.";
const brief = (over: Partial<ProjectBrief>): ProjectBrief => ({ ...emptyBrief("interview"), ...over });
const project = (b: ProjectBrief): Project =>
  ({ id: ID, title: "Night wards", stage: "design-brief", createdAt: 1, brief: b }) as Project;
const graph = projectOntology([], ID);

describe("the puzzle of record", () => {
  test("the answer when there is one, the reading otherwise, nothing when neither", () => {
    expect(puzzleOfRecord(brief({ puzzleAnswer: ANSWER, researchQuestion: READING }))).toEqual({
      text: ANSWER,
      whose: "answer",
    });
    expect(puzzleOfRecord(brief({ researchQuestion: READING }))).toEqual({ text: READING, whose: "reading" });
    expect(puzzleOfRecord(brief({}))).toBeNull();
  });
});

describe("the model is told both, each named", () => {
  test("the interview prompt and the study context carry the answer and the reading", () => {
    const b = brief({ puzzleAnswer: ANSWER, researchQuestion: READING });
    const lines = describeDesign(designDigest(b)).join("\n");
    expect(lines).toContain(`The puzzle, in their own words at the Puzzle step: ${ANSWER}`);
    expect(lines).toContain(`The puzzle, as the tool suggested it from their answers today: ${READING}`);
    const context = renderStudyContext(studyContext(b));
    expect(context).toContain(`The puzzle, in their own words at the Puzzle step: ${ANSWER}`);
    expect(context).toContain(`The puzzle, as the tool suggests it from their answers: ${READING}`);
  });
});

describe("the exports print both, with whose words each is", () => {
  test("the memo and the wiki index lead with the answer and keep the reading", () => {
    const p = project(brief({ puzzleAnswer: ANSWER, researchQuestion: READING }));
    const memo = buildOntologyMemo({ project: p, graph, events: [] });
    expect(memo).toContain(`**Your puzzle.** ${ANSWER}`);
    expect(memo).toContain(`**Suggested puzzle.** ${READING}`);
    expect(memo.indexOf(ANSWER)).toBeLessThan(memo.indexOf(READING));
    const index = buildWikiFiles({ project: p, graph, events: [] }).find((f) => f.path === "index.md");
    expect(index?.content).toContain(`**Your puzzle.** ${ANSWER}`);
    expect(index?.content).toContain(`**Suggested puzzle.** ${READING}`);
  });

  test("a study with a reading and no answer exports as it did before M58", () => {
    const p = project(brief({ researchQuestion: READING }));
    const memo = buildOntologyMemo({ project: p, graph, events: [] });
    expect(memo).toContain(`**Suggested puzzle.** ${READING}`);
    expect(memo).not.toContain("in your words at The puzzle step");
    const agent = buildAgentGraph({ project: p, graph, events: [], chunks: [] });
    expect(agent.project.researchQuestion).toBe(READING);
    expect("puzzleAnswer" in agent.project).toBe(false);
  });

  test("the agent graph carries the answer beside the reading, additively", () => {
    const p = project(brief({ puzzleAnswer: ANSWER, researchQuestion: READING }));
    const agent = buildAgentGraph({ project: p, graph, events: [], chunks: [] });
    expect(agent.project.puzzleAnswer).toBe(ANSWER);
    expect(agent.project.researchQuestion).toBe(READING);
  });
});

describe("an answer drafted from the reading says so", () => {
  test("the provenance names the reading rather than a conversation", () => {
    const reading = {
      id: "r-1",
      ts: 5,
      actor: "persona:interviewer",
      projectId: ID,
      type: "puzzle-reading",
      text: READING,
      sources: [],
      digest: "d",
    } as unknown as LedgerEvent;
    const saved = {
      id: "b-1",
      ts: 9,
      actor: "human",
      projectId: ID,
      type: "bound",
      subject: "puzzle",
      statement: READING,
      draftedFrom: "r-1",
    } as LedgerEvent;
    const view = answerProvenance({ events: [reading, saved], projectId: ID, place: "puzzle" });
    expect(view?.route).toBe("reading");
    expect(view?.routeLine).toBe("You started this answer from the suggested puzzle, and you saved it.");
    expect(view === null ? null : noTurnsLine(view)).toBe(
      "Abductive suggested that puzzle from your saved answers, outside a conversation.",
    );
  });
});
