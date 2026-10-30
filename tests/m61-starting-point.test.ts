/**
 * M61 follow-up, ISC-587: the puzzle is off Starting point.
 *
 * Owner, 2026-09-30: the puzzle "should be removed from the starting point.
 * it's already part of the design." Starting point shows nothing of the puzzle:
 * no block, no reading, no control, no sentence in its lede. The Puzzle step
 * keeps Abductive's reading as its first suggestion and the re-read control,
 * and the study header and the project list draw the puzzle from the step,
 * never from the Starting point's own answers.
 */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MotivationPage } from "../src/flow/FramingBand.tsx";
import { PuzzleOffer } from "../src/flow/PuzzleOffer.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { emptyBrief, type Project, type ProjectBrief } from "../src/state/projects.ts";
import { puzzleOfRecord } from "../src/views/puzzleReading.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const source = async (rel: string) =>
  (await Bun.file(SRC + rel).text()).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Rendered text, with tags and attributes gone and entities put back. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function inLedger(node: React.ReactElement): string {
  return renderToStaticMarkup(
    createElement(LedgerProvider, { store: new InMemoryLedgerStore(), children: node }),
  );
}

const PROJECT_ID = "61616161-6161-6161-6161-616161616161";
const READING = "READING-SENTINEL: you expected the rota to decide, and the handover did.";
const ANSWER = "ANSWER-SENTINEL: why does the handover decide what the rota was meant to?";

function project(brief: Partial<ProjectBrief>): Project {
  return {
    id: PROJECT_ID,
    title: "Night wards",
    stage: "design-brief",
    brief: { ...emptyBrief(), ...brief },
    createdAt: 1,
  };
}

describe("ISC-587: the puzzle is off Starting point", () => {
  for (const [name, brief] of [
    ["a fresh project", {}],
    ["a project with a reading", { startingInterest: "night shifts", researchQuestion: READING }],
    [
      "a project with a step answer",
      { startingInterest: "night shifts", researchQuestion: READING, puzzleAnswer: ANSWER },
    ],
  ] as const) {
    test(`${name}: no block, no reading, no control, no puzzle sentence`, () => {
      const html = inLedger(createElement(MotivationPage, { project: project(brief), onChanged: () => {} }));
      const text = visibleText(html);
      expect(html).not.toContain('data-testid="framing-puzzle');
      expect(text).not.toContain("Suggested puzzle");
      expect(text).not.toContain("READING-SENTINEL");
      expect(text).not.toContain("ANSWER-SENTINEL");
      expect(text).not.toMatch(/Read (the )?puzzle/i);
      expect(text).not.toContain("Write your puzzle");
      // Nothing on the page's face names the puzzle at all.
      expect(text).not.toMatch(/\bpuzzle/i);
    });
  }

  test("the page's lede says nothing of the puzzle (ISC-592 made it the owner's sentence)", async () => {
    const html = inLedger(createElement(MotivationPage, { project: project({}), onChanged: () => {} }));
    // M62, ISC-600: the lede left the page for its Help panel. M92, ISC-748: one
    // sentence came back under the heading, by the lead's ruling, and it says
    // nothing of the puzzle either.
    const lede = html.slice(html.indexOf('data-testid="answers-lede"'), html.indexOf("</p>", html.indexOf('data-testid="answers-lede"')));
    expect(lede).not.toMatch(/puzzle/i);
    const { PAGE_HELP } = await import("../src/ui/pageHelp.ts");
    const words = [...PAGE_HELP.motivation.purpose, ...PAGE_HELP.motivation.parts.flatMap((p) => p.says)].join(" ");
    expect(words).not.toMatch(/puzzle/i);
  });

  test("the Puzzle step still offers Abductive's reading, and the re-read control stays there", async () => {
    const html = inLedger(
      createElement(PuzzleOffer, {
        projectId: PROJECT_ID,
        brief: project({ researchQuestion: READING }).brief,
        events: [],
        chunks: [],
        documents: [],
        onChanged: () => {},
      }),
    );
    expect(html).toContain('data-testid="puzzle-offer"');
    expect(visibleText(html)).toContain("READING-SENTINEL");
    const offer = await source("flow/PuzzleOffer.tsx");
    expect(offer).toContain("usePuzzleReading(projectId)");
    expect(offer).toContain('data-testid="puzzle-offer-read"');
  });

  test("the header and the project list draw the puzzle from the step, never from Starting point", async () => {
    // The step's answer first, then Abductive's reading offered at the step.
    expect(puzzleOfRecord({ puzzleAnswer: ANSWER, researchQuestion: READING })?.text).toBe(ANSWER);
    expect(puzzleOfRecord({ researchQuestion: READING })?.text).toBe(READING);
    // The Starting point's own answers are not a puzzle.
    const onlyStartingPoint = { ...emptyBrief(), startingInterest: "night shifts", targetVenue: "ASQ" };
    expect(puzzleOfRecord(onlyStartingPoint)).toBeNull();
    for (const file of ["ui/AppShell.tsx", "ui/ProjectList.tsx"]) {
      expect({ file, drawsFromStep: (await source(file)).includes("puzzleOfRecord(") }).toEqual({
        file,
        drawsFromStep: true,
      });
    }
  });
});

describe("ISC-587: search sends the suggested puzzle to the step that shows it", () => {
  test("the entry is under Design and opens the Puzzle step, not Starting point", async () => {
    const { buildSearchIndex } = await import("../src/search/studySearch.ts");
    const index = buildSearchIndex({
      projectId: PROJECT_ID,
      brief: project({ researchQuestion: READING }).brief,
      pages: [],
      chunks: [],
      documents: [],
      papers: [],
    });
    const entry = index.find((e: { id: string }) => e.id === "puzzle-reading");
    expect(entry?.title).toBe("Design: suggested puzzle");
    expect(entry?.href).toBe(`#/study/${PROJECT_ID}/design/puzzle`);
    expect(index.some((e: { title: string }) => e.title.startsWith("Starting point") && /puzzle/i.test(e.title))).toBe(false);
  });
});

describe("ISC-587 rulings (lead, 2026-09-30)", () => {
  test("the Puzzle step's lead names Abductive, and the paper note points at Design", async () => {
    const { PUZZLE_OFFER_LEAD } = await import("../src/flow/PuzzleOffer.tsx");
    const { NOT_JUDGED_NOTE } = await import("../src/flow/PaperExpectations.tsx");
    expect(PUZZLE_OFFER_LEAD).toBe("Abductive suggested this puzzle from your saved answers.");
    expect(NOT_JUDGED_NOTE).toBe("Answer the Context or Puzzle step on Design so Abductive can judge this paper.");
  });
});
