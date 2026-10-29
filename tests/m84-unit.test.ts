/**
 * M84, ISC-707: the unit of analysis, in Context.
 *
 * A co-author (2026-10-07): "Abductive wants my story to be at the individual
 * level and asks for data at the individual level, but my unit of analysis is
 * not the individual, it is different communities participating in a field."
 * And: "Because my data is archival … it wants to know about 'following a
 * specific scientist' but my data is not structured that way."
 *
 * The owner's ruling: part of the Context step. So Context carries a Unit of
 * analysis field, kept on the brief as an optional, additive `unit`; every
 * interview prompt reads the unit and the declared data kind. (The flag for
 * answers at a different unit went with the checks at M89.)
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MockInferenceClient } from "../src/inference/mock.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: new MockInferenceClient(), live: true }),
}));
afterAll(() => {
  void mock.module(`${SRC}ui/personaRun.ts`, () => realPersonaRun);
});
const realPaperFit = { ...(await import(`${SRC}flow/usePaperFit.ts`)) };
await mock.module(`${SRC}flow/usePaperFit.ts`, () => ({
  ...realPaperFit,
  usePaperFit: () => async () => 0,
  useJudgeOnMount: () => undefined,
  openedCounts: () => new Map(),
}));
afterAll(() => {
  void mock.module(`${SRC}flow/usePaperFit.ts`, () => realPaperFit);
});

const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { Workbench } = await import(`${SRC}workbench/Workbench.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const unitMod = { ...(await import(`${SRC}interview/unitOfAnalysis.ts`)), ...(await import(`${SRC}interview/levelPrompt.ts`)) };
const { conversationPrompt } = await import(`${SRC}interview/conversationPrompt.ts`);
const { assembleTurnPrompt } = await import(`${SRC}interview/prompt.ts`);
const { designDigest } = await import(`${SRC}interview/designDigest.ts`);
const { assembleSystemPrompt, assembleUserMessage, questionSetFor } = await import(`${SRC}personas/engine.ts`);
const { studyContext, renderStudyContext } = await import(`${SRC}interview/studyContext.ts`);
const { twinUserContext } = await import(`${SRC}twin/twin.ts`);
const { MATRIX } = await import(`${SRC}matrix/matrix.ts`);

/** The co-author's study, in the spirit of their nanotechnology project: communities in a field, archival. */
const CO_AUTHOR = {
  ...projects.emptyBrief("archival"),
  unit: "community" as const,
  context:
    "Nanotechnology in the 1990s, where several research communities (physicists, chemists, materials scientists) took part in forming one field. My documents are conference proceedings, funding calls and newsletters collected years ago.",
  processOfInterest: "How the communities came to share categories for what counted as nanotechnology, over about fifteen years.",
  outcomeOfInterest: "Whether a community's categories became the field's categories or stayed its own.",
  siteRationale: "The archive of the field's main conference series, where every community presented.",
  puzzleAnswer: "Why some communities shaped the field's categories while others, just as central, did not.",
  targetVenue: "Administrative Science Quarterly",
  seminalCorpus: "Grodal 2018; Navis and Glynn 2010",
};

/** An individual-level ask: following one person, or asking about one person. */
const INDIVIDUAL_ASK =
  /\bfollow(?:ing|s)?\s+(?:a|one|an|the|each|this|that|a specific|a single|specific)\s+(?:\w+\s+)?(?:person|scientist|individual|informant|founder|participant|member)\b|\bone person\b|\ba specific (?:person|scientist|individual)\b|\bfollow(?:ing)? (?:him|her)\b/i;

const UNIT_WORD = /communit(?:y|ies)/i;
const KIND_WORD = /archival/i;

function prompts(brief: typeof CO_AUTHOR): Record<string, string> {
  const design = designDigest(brief);
  const base = {
    placeLabel: "Context",
    purpose: "The world that your project is set in.",
    stationQuestion: "What is going on in this setting that made you want to study it?",
    mode: "interrogation" as const,
    opener: false,
    nothingWrittenYet: false,
    chunks: [],
    ontologySummary: "",
    design,
    here: [],
    earlier: [],
  };
  const cell = MATRIX[0]!;
  const project = { id: "p", title: "Co-author study", stage: "design-brief", createdAt: 1, brief } as never;
  return {
    "conversation at Context, no answer": conversationPrompt({ ...base, place: "context", stepAnswered: false }),
    "conversation at Process, answered": conversationPrompt({
      ...base,
      place: "process",
      placeLabel: "Process",
      stepAnswered: true,
    }),
    "offered move": assembleTurnPrompt({
      move: { id: "m", topic: "station:context", question: "What is going on here?", reason: "r", mode: "interrogation" } as never,
      chunks: [],
      ontologySummary: "",
      design,
    }),
    "bias persona": `${assembleSystemPrompt({ creed: "creed", cell, dataType: brief.dataType, unit: brief.unit })}\n${assembleUserMessage({ project, chunks: [], priorEvents: [] })}`,
    "study context (suggestions, paper fit)": renderStudyContext(studyContext(brief)),
    "ordinary version": twinUserContext(project, []),
  };
}

describe("ISC-707: the brief carries the unit, optional and additive", () => {
  test("a brief from before M84 loads without the field", () => {
    const old = projects.normalizeBrief({ context: "A ward." });
    expect(old.unit).toBeUndefined();
    expect("unit" in projects.emptyBrief()).toBe(false);
  });

  test("the five units and the field's label; the help line went on 2026-10-15", () => {
    // M92, ISC-749: Other, with a typed unit, after A field.
    expect(unitMod.UNITS).toEqual(["person", "team", "organisation", "community", "field", "other"]);
    expect(unitMod.UNIT_LABEL).toBe("Unit of analysis");
    expect("UNIT_HELP" in unitMod).toBe(false);
  });

  test("a save of the unit writes one bound row under its own subject", async () => {
    const { briefChangeEvents } = await import(`${SRC}flow/stationBrief.ts`);
    const before = projects.emptyBrief();
    const rows = briefChangeEvents("p", before, { ...before, unit: "community" });
    expect(rows.filter((e: LedgerEvent) => e.type === "bound" && e.subject === unitMod.UNIT_SUBJECT)).toHaveLength(1);
    expect(briefChangeEvents("p", before, before)).toHaveLength(0);
  });
});

describe("ISC-707: the Context step renders the unit", () => {
  const find = <T extends Element>(host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`) as T | null;
  async function settle(times = 20) {
    for (let i = 0; i < times; i += 1) await act(async () => void (await wait(5)));
  }

  test("Context offers the five units, saves the choice with its row, and keeps it on return; Process doesn't show it", async () => {
    await projects.saveProject({ id: "m84-unit", title: "M84 unit test", stage: "design-brief", createdAt: 1, brief: projects.emptyBrief() } as never);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const store = new InMemoryLedgerStore();
    const tree = (station: string) =>
      React.createElement(StrictMode, null, React.createElement(LedgerProvider, { store }, React.createElement(Workbench, { projectId: "m84-unit", station })));
    await act(async () => root.render(tree("context")));
    await settle();
    const select = find<HTMLSelectElement>(host, "station-unit");
    expect(select).not.toBeNull();
    expect([...select!.options].map((o) => o.value)).toEqual(["", "person", "team", "organisation", "community", "field", "other"]);
    expect(host.textContent).toContain("Unit of analysis");
    select!.value = "community";
    await act(async () => void select!.dispatchEvent(new Event("change", { bubbles: true })));
    await settle();

    await act(async () => root.render(tree("process")));
    await settle();
    expect(find(host, "station-unit")).toBeNull();
    await act(async () => root.render(tree("context")));
    await settle();
    expect(find<HTMLSelectElement>(host, "station-unit")!.value).toBe("community");
    expect((await projects.getProject("m84-unit"))?.brief.unit).toBe("community");
    const rows = (await store.readAll("m84-unit")).filter((e: LedgerEvent) => e.type === "bound" && e.subject === unitMod.UNIT_SUBJECT);
    expect(rows).toHaveLength(1);
    root.unmount();
  });
});

describe("ISC-707: every prompt reads the unit and the data kind", () => {
  test("each builder names the unit and the data kind when both are set", () => {
    for (const [name, text] of Object.entries(prompts(CO_AUTHOR))) {
      expect({ name, unit: UNIT_WORD.test(text), kind: KIND_WORD.test(text) }).toEqual({ name, unit: true, kind: true });
    }
  });

  test("archival data at the community level: no prompt asks about following one person", () => {
    for (const [name, text] of Object.entries(prompts(CO_AUTHOR))) {
      expect({ name, ask: INDIVIDUAL_ASK.exec(text)?.[0] ?? null }).toEqual({ name, ask: null });
    }
    expect(INDIVIDUAL_ASK.test("Tell me about following a specific scientist.")).toBe(true);
  });

  test("archival data asks about documents and periods", () => {
    const lines = unitMod.levelLines({ unit: "community", dataType: "archival" }).join("\n");
    expect(lines).toMatch(/documents/);
    expect(lines).toMatch(/periods?/);
    expect(questionSetFor("archival", "community")).toMatch(/communit/);
  });

  test("with the unit empty, Context's prompt asks for the unit before anything else", () => {
    const text = prompts({ ...CO_AUTHOR, unit: undefined as never })["conversation at Context, no answer"]!;
    expect(text).toMatch(/haven't identified a unit of analysis/);
    expect(text).toMatch(/Before you ask anything else at Context/);
    const process = prompts({ ...CO_AUTHOR, unit: undefined as never })["conversation at Process, answered"]!;
    expect(process).not.toMatch(/Before you ask anything else at Context/);
  });
});
