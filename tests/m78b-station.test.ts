/**
 * M78b, ISC-681: the save lines under a step belong to that step (the
 * serendipity walk, finding 14). The walk saved Context, opened Process, and
 * read Context's "Abductive suggested three concepts …" under Process until the
 * Process save replaced it. And the banner reads "Next for you: the Context
 * step." (the walk's table, row 8), where it read "Next for you: Next step:
 * Context."
 */
import "fake-indexeddb/auto";
import { openSummary } from "./openSummary.ts";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MockInferenceClient } from "../src/inference/mock.ts";

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
const dialogue = await import(`${SRC}workbench/Dialogue.tsx`);
const { resetInterviewInFlight } = await import(`${SRC}interview/orchestrator.ts`);
const projects = await import(`${SRC}state/projects.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
/* M93, ISC-759: the save-time pass is off behind SAVE_SUGGESTS_CONCEPTS; these
   tests keep its reversible path covered by turning it on for this file. */
const { SAVE_SUGGESTS_CONCEPTS } = await import(`${SRC}flow/StationWorkspace.tsx`);
SAVE_SUGGESTS_CONCEPTS.on = true;
afterAll(() => {
  SAVE_SUGGESTS_CONCEPTS.on = false;
});

function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined ? undefined : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
const find = (host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`);
async function settle(times = 40) {
  for (let i = 0; i < times; i += 1) await act(async () => void (await wait(5)));
}

function render(root: Root, store: InstanceType<typeof InMemoryLedgerStore>, id: string, station: "context" | "process") {
  root.render(
    React.createElement(
      StrictMode,
      null,
      React.createElement(LedgerProvider, { store }, React.createElement(Workbench, { projectId: id, station })),
    ),
  );
}

describe("save lines belong to their step (ISC-681)", () => {
  test("Context's suggestion line is absent under Process, and back under Context", async () => {
    const id = "m78b-stale-lines";
    dialogue.resetConversationOpeners();
    resetInterviewInFlight();
    await projects.saveProject({ id, title: "tool crib", stage: "design-brief", createdAt: 1, brief: projects.emptyBrief() } as never);
    const store = new InMemoryLedgerStore();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => render(root, store, id, "context"));
    await settle();
    await openSummary(host, "station-summary");
    const box = find(host, "station-input") as HTMLTextAreaElement;
    await act(async () => {
      box.value = "The tool crib is the one room in which founders from different ventures meet without anyone arranging it.";
      reactProps(box)?.onChange?.({ target: box });
    });
    await act(async () => reactProps(find(host, "save-station") as Element)?.onClick?.({}));
    await settle(80);
    expect(find(host, "station-suggested")).not.toBeNull();

    await act(async () => render(root, store, id, "process"));
    await settle();
    expect(host.querySelector('[data-testid="station-workspace"]')?.getAttribute("data-station")).toBe("process");
    expect(find(host, "station-suggested")).toBeNull();
    expect(find(host, "station-suggesting")).toBeNull();
    expect(find(host, "station-scanning")).toBeNull();

    await act(async () => render(root, store, id, "context"));
    await settle();
    expect(find(host, "station-suggested")).not.toBeNull();
    root.unmount();
    host.remove();
  });

  test("the banner reads \"Next for you: the Context step.\"", async () => {
    const id = "m78b-next-banner";
    dialogue.resetConversationOpeners();
    resetInterviewInFlight();
    await projects.saveProject({
      id,
      title: "tool crib",
      stage: "design-brief",
      createdAt: 1,
      brief: { ...projects.emptyBrief(), startingInterest: "Serendipity at the tool crib.", seminalCorpus: "Dew 2009", targetVenue: "Organization Science" },
    } as never);
    const store = new InMemoryLedgerStore();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => render(root, store, id, "process"));
    await settle();
    expect(find(host, "waiting-on")?.textContent).toBe("Next for you: the Context step.");
    expect(find(host, "next-action")?.textContent).toBe("Open Context");
    root.unmount();
    host.remove();
  });
});
