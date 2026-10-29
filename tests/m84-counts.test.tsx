/**
 * M84, ISC-705: the counts go.
 *
 * A co-author (2026-10-07): "Abductive keeps track of questions being asked
 * and answered. This is typical Claude… I think that it is just a distraction…
 * for qual people it will be about the flow."
 *
 * Design, its chat, Starting point and the Projects row carry no count of
 * questions asked or answered. Sample and Early data still open once the six
 * loop steps have a saved answer, said once in Design's Help. History keeps its
 * event counts and Checks keeps "N of 9 checks done".
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

const SRC = new URL("../src/", import.meta.url).pathname;
const code = (f: string) => readFileSync(`${SRC}${f}`, "utf8");

const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const { Workbench } = await import(`${SRC}workbench/Workbench.tsx`);
const { MotivationPage } = await import(`${SRC}flow/FramingBand.tsx`);
const { studyState, StudyRow, stepsLine } = await import(`${SRC}ui/ProjectList.tsx`);
const { PAGE_HELP } = await import(`${SRC}ui/pageHelp.ts`);
const { digestRows } = await import(`${SRC}flow/SinceLastHere.tsx`);
const { stepKicker } = await import(`${SRC}flow/StationLoop.tsx`);
const { STATIONS } = await import(`${SRC}flow/stations.ts`);

/** A count of questions or steps, the way the retired strings wrote one. */
const COUNT = /\b(?:\d+|one|two|three|four|five|six|seven|eight) of (?:\d+|three|six|eight)\b|\b\d+ answered\b|\bquestions answered\b|\bnew questions\b/i;

const SIX = {
  context: "Communities of researchers forming the nanotechnology field.",
  processOfInterest: "How their categories came to be shared.",
  outcomeOfInterest: "Whose categories became the field's.",
  siteRationale: "The field's main conference archive.",
  puzzleAnswer: "Why some communities shaped the categories and others didn't.",
  bind: "Claiming the new field against keeping their own discipline.",
};

describe("ISC-705: the Projects row says the project's state in words", () => {
  const project = (brief: object) =>
    ({ id: "m84-row", title: "M84 row", stage: "design-brief", createdAt: 1, brief: { ...projects.emptyBrief(), ...brief } }) as never;
  const row = (brief: object, chunks: readonly string[] = []) =>
    renderToStaticMarkup(
      createElement(
        "table",
        null,
        createElement(
          "tbody",
          null,
          createElement(StudyRow, { row: studyState({ project: project(brief), events: [], corpusChunkIds: chunks }), armed: false, onArm() {}, onCancel() {}, onRemove() {} }),
        ),
      ),
    );

  test("a fresh project names the step that comes next, with no fraction", () => {
    const html = row({});
    expect(html).toContain("Next step: Context");
    expect(html).not.toMatch(COUNT);
  });

  test("a project with the six answered names the next step outside the loops", () => {
    expect(row(SIX)).toContain("Next step: Sample");
  });

  test("a project with every step answered says so", () => {
    const html = row({ ...SIX, sampleRationale: "Every community at the conference.", earlySurprise: "Two communities never cited each other." });
    expect(html).toContain("Every step has an answer");
    expect(html).not.toMatch(COUNT);
    expect(stepsLine(studyState({ project: project({}), events: [], corpusChunkIds: [] }))).toBe("Next step: Context");
  });

  test("the row carries no count of the questions that Abductive asked, and the key and Help say so", () => {
    const list = code("ui/ProjectList.tsx");
    expect(list).not.toContain("{row.answered} of {STATIONS.length}");
    expect(list).not.toContain("{row.turns}");
    expect(list).not.toMatch(/<th[^>]*>\s*Messages/);
    expect(list).not.toContain("<dt>Messages</dt>");
    expect(PAGE_HELP.studies.parts.flatMap((p: { says: readonly string[] }) => p.says).join(" ")).not.toMatch(/messages/i);
  });
});

describe("ISC-705: Design and Starting point carry no count of questions", () => {
  async function settle(times = 20) {
    for (let i = 0; i < times; i += 1) await act(async () => void (await wait(5)));
  }

  test("Design's rendered text, at a loop step and at a closed step, has no count", async () => {
    await projects.saveProject({ id: "m84-design", title: "M84 counts", stage: "design-brief", createdAt: 1, brief: { ...projects.emptyBrief(), context: SIX.context } } as never);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const store = new InMemoryLedgerStore();
    for (const station of ["context", "process", "sample"]) {
      await act(async () =>
        root.render(createElement(LedgerProvider, { store }, createElement(Workbench, { projectId: "m84-design", station }))),
      );
      await settle();
      expect({ station, count: COUNT.exec(host.textContent ?? "")?.[0] ?? null }).toEqual({ station, count: null });
    }
    root.unmount();
  });

  test("the step kicker names the step's loop, not its place in a count", () => {
    for (const s of STATIONS) {
      expect({ id: s.id, kicker: stepKicker(s.id) }).toEqual({ id: s.id, kicker: expect.not.stringMatching(/\bof \d+\b/) });
      expect(stepKicker(s.id)).toContain(s.label);
    }
    expect(stepKicker("context")).toBe("Outer loop · Context");
    expect(stepKicker("puzzle")).toBe("Inner loop · Puzzle");
    expect(stepKicker("sample")).toBe("Outside the loops · Sample");
  });

  test("Since your last visit counts what changed, not the questions asked and answered", () => {
    const keys = digestRows(
      {
        questionsAsked: { count: 3 },
        questionsAnswered: { count: 2 },
        answersSaved: { count: 1 },
        draftsAccepted: { count: 0 },
        draftsDeclined: { count: 0 },
        findingsRaised: { count: 0 },
        findingsSettled: { count: 0 },
        paperVerdicts: { count: 0 },
        lastQuestionPlace: null,
        lastAnswerPlace: null,
      } as never,
      "p",
    ).map((r: { key: string }) => r.key);
    expect(keys).toEqual(["answers"]);
  });

  test("Starting point's chip says the state, with no count", () => {
    const page = (brief: object) =>
      renderToStaticMarkup(
        createElement(LedgerProvider, {
          store: new InMemoryLedgerStore(),
          children: createElement(MotivationPage, {
            project: { id: "m84-sp", title: "SP", stage: "design-brief", createdAt: 1, brief: { ...projects.emptyBrief(), ...brief } },
            onChanged: () => {},
          }),
        }),
      );
    const empty = page({});
    expect(empty).not.toMatch(COUNT);
    expect(empty).toContain("Not started");
    const some = page({ startingInterest: "How communities form a field." });
    expect(some).not.toMatch(COUNT);
  });

  test("the gate is said once, in Design's Help", () => {
    const says = PAGE_HELP.design.parts.flatMap((p: { says: readonly string[] }) => p.says).concat(PAGE_HELP.design.purpose);
    const gate = says.filter((s: string) => /Sample and Early data open/.test(s));
    expect(gate).toHaveLength(1);
  });
});
