/**
 * M78a, ISC-678: design challenges read the project as it stands and cite only
 * what the project holds (the serendipity walk of 2026-10-03, finding 4).
 *
 * Two minutes after the student saved the puzzle, a challenge said "The puzzle
 * line that the tool reads is empty"; after twelve passages had been added,
 * another said "the chunk set in front of me is empty". The run read the brief
 * and the passages that the step's page held when it mounted. The first
 * challenge also cited Allen (1977) and Fayard and Weeks (2007) "From memory
 * (please verify each)", papers that the project never named.
 */

import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { emptyBrief, type Project } from "../src/state/projects.ts";
import { getCell } from "../src/matrix/matrix.ts";
import {
  assembleSystemPrompt,
  assembleUserMessage,
  outsideCitations,
  runIntervention,
} from "../src/personas/engine.ts";

const CELL = getCell("confirmation:design-brief")!;
const CREEDS = { "tavory-timmermans-abduction": "Abduction starts from surprise.", eisenhardt: "x", langley: "x", zuckerman: "x" };

const P = "p-m78a-challenges";

const FRESH: Project = {
  id: P,
  title: "tool crib",
  stage: "design-brief",
  createdAt: 1,
  brief: {
    ...emptyBrief(),
    puzzleAnswer: "I expected the prepared mind to find the leads, and the helpers find them instead.",
    researchQuestion: "Helpers find the leads that the prepared mind should have found.",
    seminalCorpus: "Merton and Barber 2004\nDew 2009",
  },
} as Project;

function capture(text: string) {
  const seen: { system: string; user: string }[] = [];
  return {
    seen,
    client: {
      complete: async (req: { system: string; messages: { content: string }[] }) => {
        seen.push({ system: req.system, user: req.messages.map((m) => m.content).join("\n") });
        return { text, model: "m", modelVersion: "v" };
      },
    },
  };
}

describe("a challenge cites only the project's papers and the researcher's words", () => {
  test("the prompt forbids a citation from outside the project and lists the papers", () => {
    const system = assembleSystemPrompt({ creed: "c", cell: CELL, dataType: "" });
    expect(system).toContain("Cite only the papers that the researcher identified and the researcher's own words.");
    const user = assembleUserMessage({ project: FRESH, chunks: [], priorEvents: [] });
    expect(user).toContain("Papers the researcher identified:");
    expect(user).toContain("Merton and Barber 2004");
  });

  test("an author and year outside the project is found, and one inside it is not", () => {
    const allowed = "Merton and Barber 2004\nDew 2009\nSince May I count fewer encounters.";
    expect(outsideCitations("Allen (1977) found that proximity drives communication.", allowed)).toEqual(["Allen (1977)"]);
    expect(outsideCitations("As Fayard and Weeks (2007) argue, informal spaces matter.", allowed)).toEqual([
      "Fayard and Weeks (2007)",
    ]);
    expect(outsideCitations("(Allen, 1977) is the classic study.", allowed)).toEqual(["(Allen, 1977)"]);
    expect(outsideCitations("Merton and Barber (2004) treat serendipity as a pattern.", allowed)).toEqual([]);
    expect(outsideCitations("Dew (2009) calls it a prepared mind.", allowed)).toEqual([]);
    expect(outsideCitations("Since May 2026 the crib has been calmer.", allowed)).toEqual([]);
  });

  test("a planted citation from memory is not written; the grounded challenge is", async () => {
    const reply = [
      "From memory (please verify each): Allen (1977) and Fayard and Weeks (2007) show that proximity drives chance encounters, so your crib is a textbook case.",
      "---",
      "Merton and Barber (2004) would ask what your prepared mind was prepared for. Which founders came with a question?",
    ].join("\n");
    const { client } = capture(reply);
    const result = await runIntervention(CELL, { project: FRESH, chunks: [], priorEvents: [], creeds: CREEDS }, client as never);
    expect(result.challenges.map((c) => c.text)).toEqual([
      "Merton and Barber (2004) would ask what your prepared mind was prepared for. Which founders came with a question?",
    ]);
  });

  test("a challenge that says it cites from memory is dropped even with no year", async () => {
    const { client } = capture("From memory, the literature on proximity says the crib should work.");
    const result = await runIntervention(CELL, { project: FRESH, chunks: [], priorEvents: [], creeds: CREEDS }, client as never);
    expect(result.challenges).toEqual([]);
  });
});
