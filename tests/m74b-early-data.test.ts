/**
 * M74b, ISC-665: Early data (the walk's finding 12).
 *
 * "I have early data" landed the student on Sources, where nothing read the
 * data; the route back lived only in the page's Help. Early data forgot the
 * data-type choice when the student left the step, and its menu's kinds
 * (ethnographic, interview, archival) differed from the file types on Sources
 * (transcript, fieldnote, archival, memo).
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import { readFileSync } from "node:fs";
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
const { StudyMaterial } = await import(`${SRC}ui/StudyViews.tsx`);
const { DATA_KIND_CHOICES, dataTypeOfKind, chosenKind } = await import(`${SRC}flow/EarlyDataControls.tsx`);
const { DATA_DOCUMENT_KINDS } = await import(`${SRC}state/chunks.ts`);
const projects = await import(`${SRC}state/projects.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);

const SIX = {
  context: "A repair café in a church hall.",
  processOfInterest: "One repair, about an hour.",
  outcomeOfInterest: "Whether a thing gets fixed.",
  siteRationale: "The café near me.",
  puzzleAnswer: "Why they argue about toasters and not bikes.",
  bind: "Fixing everything against wasting the owner's time.",
};

async function study(id: string) {
  await projects.saveProject({
    id,
    title: "M74b test early data",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...projects.emptyBrief(), ...SIX },
  } as never);
}

function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined ? undefined : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
const find = <T extends Element>(host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`) as T | null;
async function settle(times = 20) {
  for (let i = 0; i < times; i += 1) await act(async () => void (await wait(5)));
}

describe("one list of data kinds", () => {
  test("the Early data menu offers the file types Sources offers, in the same order", () => {
    expect(DATA_KIND_CHOICES).toEqual(DATA_DOCUMENT_KINDS);
    const step = readFileSync(new URL("../src/flow/StationWorkspace.tsx", import.meta.url), "utf8");
    expect(step).toContain("DATA_KIND_CHOICES.map(");
    expect(step).not.toContain("DATA_TYPES.map(");
  });

  test("a chat note is a kind of its own, an informal conversation written up afterwards (the lead's ruling)", async () => {
    const { documentKindLabel } = await import(`${SRC}ui/materialVocabulary.ts`);
    expect(DATA_DOCUMENT_KINDS).toContain("chatnote");
    expect(documentKindLabel("chatnote")).toBe("chat note");
    expect(dataTypeOfKind("chatnote")).toBe("interview");
  });

  test("each kind keeps the data type that the checks read", () => {
    expect(dataTypeOfKind("transcript")).toBe("interview");
    expect(dataTypeOfKind("fieldnote")).toBe("ethnographic");
    expect(dataTypeOfKind("archival")).toBe("archival");
    expect(dataTypeOfKind("memo")).toBe("ethnographic");
    // A brief from before M74b shows the kind its data type stands for.
    expect(chosenKind({ ...projects.emptyBrief(), dataType: "interview" })).toBe("transcript");
    expect(chosenKind({ ...projects.emptyBrief(), dataType: "ethnographic", dataKind: "memo" })).toBe("memo");
    expect(chosenKind(projects.emptyBrief())).toBe("");
  });
});

describe("Abductive keeps the choice when the student leaves the step", () => {
  test("choosing a kind saves it, with its row in History, and it is there on return", async () => {
    await study("m74b-kind");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const store = new InMemoryLedgerStore();
    const tree = (station: string) =>
      React.createElement(StrictMode, null, React.createElement(LedgerProvider, { store }, React.createElement(Workbench, { projectId: "m74b-kind", station })));
    await act(async () => root.render(tree("early-data")));
    await settle();
    const select = find<HTMLSelectElement>(host, "station-datatype")!;
    expect([...select.options].map((o) => o.value)).toEqual(["", ...DATA_DOCUMENT_KINDS]);
    select.value = "fieldnote";
    // A real change event: React reads a select's change at the root.
    await act(async () => void select.dispatchEvent(new Event("change", { bubbles: true })));
    await settle();

    await act(async () => root.render(tree("context")));
    await settle();
    await act(async () => root.render(tree("early-data")));
    await settle();
    expect(find<HTMLSelectElement>(host, "station-datatype")!.value).toBe("fieldnote");
    const stored = await projects.getProject("m74b-kind");
    expect(stored?.brief.dataType).toBe("ethnographic");
    const rows = (await store.readAll("m74b-kind")).filter((e: LedgerEvent) => e.type === "bound" && e.subject === "data-type");
    expect(rows).toHaveLength(1);
    root.unmount();
  });
});

describe("Sources reads the data", () => {
  test("the Data section carries Read the data, and a press reads the data", async () => {
    const id = "m74b-sources";
    await study(id);
    await projects.declareEarlyData(id);
    await projects.saveDocument({ id: "doc-notes", projectId: id, name: "fieldnotes.txt", kind: "fieldnote", createdAt: 1, chunkCount: 1 } as never);
    await projects.saveChunks([{ id: "chunk-1", documentId: "doc-notes", projectId: id, index: 0, kind: "fieldnote", text: "Pat said we don't really decide, we just argue about it." } as never]);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const store = new InMemoryLedgerStore();
    await act(async () =>
      root.render(React.createElement(LedgerProvider, { store }, React.createElement(StudyMaterial, { projectId: id }))),
    );
    await settle();
    const button = find(host, "read-data");
    expect(button?.textContent).toBe("Read the data");
    await act(async () => reactProps(button!)?.onClick?.({ preventDefault() {} }));
    await settle();
    expect(find(host, "read-data-done")?.textContent ?? "").toContain("Abductive");
    root.unmount();
  });
});
