/**
 * M74a, ISC-661: the puzzle panel reads a saved puzzle (the walk, finding 9).
 *
 * The student saved a Puzzle summary with an expectation and a contrast, and
 * the panel still read "No puzzle yet. You haven't saved an answer with your
 * expectation in it", with no control to read it again, after a reload too.
 * The stale read: the panel drew only the reading, and the reading's sources
 * leave the Puzzle step out on purpose (the lead's ruling B: a reading that ate
 * the saved puzzle would agree with the researcher by construction), so the
 * panel showed the reading's old "none" over the researcher's own answer. It
 * now shows the saved puzzle and compares the reading of the observations. And the Report printed the puzzle under
 * "Your puzzle", an empty "Suggested puzzle.", and later "You have not
 * established a puzzle root yet."
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { emptyBrief, type Project, type ProjectBrief } from "../src/state/projects.ts";
import {
  PUZZLE_READING_MATCHES,
  PUZZLE_READING_NONE,
  puzzleAgreement,
  puzzleExportLines,
  puzzleSources,
  samePuzzle,
} from "../src/views/puzzleReading.ts";
import { savedPuzzlePanel } from "../src/flow/PuzzleOffer.tsx";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { projectOntology } from "../src/ontology/projection.ts";

const WALK = (await Bun.file(new URL("./fixtures/m72-walk.json", import.meta.url)).json()) as {
  project: Project;
  events: LedgerEvent[];
};
const WP = WALK.project.id;
const SAVED = WALK.project.brief.puzzleAnswer ?? "";

describe("the panel after a saved puzzle (finding 9)", () => {
  test("the walk's panel reads the saved puzzle, says when Abductive last read it, and offers Suggest puzzle again", () => {
    expect(SAVED).toContain("I expected the volunteers to just fix whatever they could.");
    const panel = savedPuzzlePanel({ brief: WALK.project.brief, events: WALK.events, projectId: WP, reading: false, error: null });
    expect(panel).not.toBeNull();
    expect(panel!.text).toBe(SAVED);
    expect(panel!.line).toMatch(/^Abductive last considered your answers .+, before you saved this puzzle\.$/);
    expect(panel!.control).toBe("Suggest puzzle again");
    expect(panel!.agreement).toBe(PUZZLE_READING_NONE);
    expect(`${panel!.text} ${panel!.line}`).not.toContain("No puzzle yet");
  });

  test("a reading after the save is the one the line dates", () => {
    const saved = WALK.events.filter((e) => e.type === "bound" && e.subject === "puzzle").at(-1)!;
    const reading = {
      id: "r-after",
      ts: saved.ts + 1000,
      actor: "persona:interviewer",
      projectId: WP,
      type: "puzzle-reading",
      text: "You expected the volunteers to just fix whatever they could; instead they argue about whether a toaster or a kettle is worth fixing, but not about bikes.",
      sources: [{ kind: "answer", subject: "early-data" }],
      digest: "d",
      model: "m",
      modelVersion: "m",
    } as unknown as LedgerEvent;
    const panel = savedPuzzlePanel({ brief: WALK.project.brief, events: [...WALK.events, reading], projectId: WP, reading: false, error: null });
    expect(panel!.line).toMatch(/^Abductive last considered your answers .+\.$/);
    expect(panel!.line).not.toContain("before you saved");
    expect(panel!.agreement).toBe(PUZZLE_READING_MATCHES);
    expect(panel!.control).toBe("Suggest puzzle again");
  });

  test("a reading of a different puzzle is quoted, so the researcher can judge it", () => {
    const other = "You expected volunteers to refuse unsafe items; they refuse cheap ones.";
    expect(puzzleAgreement(SAVED, { text: other })).toBe(`Abductive suggests a different puzzle from your answers: ${other}`);
    expect(puzzleAgreement(SAVED, { text: "" })).toBe(PUZZLE_READING_NONE);
    expect(puzzleAgreement(SAVED, null)).toBeNull();
    expect(samePuzzle(SAVED, "why do the volunteers argue about toasters but not about bikes")).toBe(true);
  });

  test("while a reading is in the air the control waits, and a failure keeps it", () => {
    const busy = savedPuzzlePanel({ brief: WALK.project.brief, events: WALK.events, projectId: WP, reading: true, error: null });
    expect(busy!.control).toBeNull();
    const failed = savedPuzzlePanel({ brief: WALK.project.brief, events: WALK.events, projectId: WP, reading: false, error: "Load failed" });
    expect(failed!.line).toBe("Abductive couldn't suggest a puzzle: Load failed");
    expect(failed!.control).toBe("Suggest puzzle again");
  });

  test("no saved puzzle, no panel of this kind", () => {
    expect(savedPuzzlePanel({ brief: emptyBrief(), events: [], projectId: WP, reading: false, error: null })).toBeNull();
  });

  test("the reading stays drawn from the observations: the saved puzzle is not one of its sources", () => {
    const base = { chunks: [], documents: [], events: [], projectId: WP };
    const before = puzzleSources({ ...base, brief: { ...WALK.project.brief, puzzleAnswer: "" } });
    const after = puzzleSources({ ...base, brief: WALK.project.brief });
    expect(after.sources).not.toContainEqual({ kind: "answer", subject: "puzzle" });
    expect(after.digest).toBe(before.digest);
  });
});

describe("the Report states the puzzle once (finding 9)", () => {
  const graph = projectOntology(WALK.events, WP);
  const memo = buildOntologyMemo({ project: WALK.project, graph, events: WALK.events, now: () => 1_790_000_000_000 });

  test("the walk's Report prints the saved puzzle once and no empty suggestion", () => {
    expect(memo.split(SAVED).length - 1).toBe(1);
    expect(memo).not.toMatch(/\*\*Suggested puzzle\.\*\*\s*\n/);
    expect(memo).not.toContain("You have not established a puzzle root yet");
    expect(memo).toContain(PUZZLE_READING_NONE);
  });

  test("a different reading, printed as the suggested puzzle, is stated once and pointed at", () => {
    const other = "You expected volunteers to fix everything; they refuse cheap items often.";
    const lines = puzzleExportLines({ puzzleAnswer: SAVED, researchQuestion: other }, { text: other });
    expect(lines.filter((l) => l !== "")).toEqual([
      `**Your puzzle.** ${SAVED}`,
      `**Suggested puzzle.** ${other}`,
      "Abductive suggests a different puzzle from your answers: the suggested puzzle above.",
    ]);
  });

  test("a project with no puzzle says so in one line", () => {
    const brief: ProjectBrief = { ...emptyBrief(), startingInterest: "Repair." };
    const lines = puzzleExportLines(brief);
    expect(lines.filter((l) => l !== "")).toEqual(["**Your puzzle.** You haven't stated a puzzle yet. At the Puzzle step, state your expectation and the contrast that you found."]);
    const p = { ...WALK.project, brief };
    const none = buildOntologyMemo({ project: p, graph: projectOntology([], WP), events: [] });
    expect(none).not.toContain("You have not established a puzzle root yet");
  });
});
