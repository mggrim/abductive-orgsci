/**
 * A first saved answer under an open question writes its History event (M73, ISC-658).
 *
 * The M71 builder found it on the merged build: on a fresh project at Context,
 * one chat reply, Abductive's follow-up question, then a typed summary and Save.
 * The first press wrote nothing, and a second press said "Saved" and still wrote
 * no `bound` row, so the answer lived in the brief with no save in History.
 */
import "fake-indexeddb/auto";
import { openSummary } from "./openSummary.ts";
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
const dialogue = await import(`${SRC}workbench/Dialogue.tsx`);
const { resetInterviewInFlight } = await import(`${SRC}interview/orchestrator.ts`);
const projects = await import(`${SRC}state/projects.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);

function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined
    ? undefined
    : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
function find<T extends Element>(host: Element, id: string): T | null {
  return host.querySelector(`[data-testid="${id}"]`) as T | null;
}
function typeInto(el: HTMLTextAreaElement, value: string) {
  el.value = value;
  reactProps(el)?.onChange?.({ target: el });
}
async function settle(times = 30) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
}

/** A ledger that refuses the first `bound` it is asked to store, as Safari's did (see m73-ledger-retry). */
class RefusesFirstBound extends InMemoryLedgerStore {
  refused = 0;
  async append(event: LedgerEvent): Promise<void> {
    if (event.type === "bound" && this.refused === 0) {
      this.refused += 1;
      throw new Error("Attempt to generate key in database without an in-progress transaction");
    }
    return super.append(event);
  }
}

async function fresh(
  id: string,
  store: InstanceType<typeof InMemoryLedgerStore> = new InMemoryLedgerStore(),
  brief: Record<string, unknown> = {},
) {
  dialogue.resetConversationOpeners();
  resetInterviewInFlight();
  await projects.saveProject({
    id,
    title: "repair cafe",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...projects.emptyBrief(), ...brief },
  } as never);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        StrictMode,
        null,
        React.createElement(LedgerProvider, { store }, React.createElement(Workbench, { projectId: id, station: "context" })),
      ),
    );
  });
  await settle();
  return { host, root, store };
}

/** One reply in the chat, and Abductive's follow-up question back. */
async function replyAndQuestion(host: Element, store: InstanceType<typeof InMemoryLedgerStore>, id: string) {
  await act(async () => {
    reactProps(find(host, "answer-input") as Element)?.onFocus?.({});
  });
  await settle();
  const asked = (await store.readAll(id)).filter((e: LedgerEvent) => e.type === "question-selection").length;
  const box = find<HTMLTextAreaElement>(host, "answer-input") as HTMLTextAreaElement;
  await act(async () => typeInto(box, "Repair cafes, maybe. People bring broken toasters."));
  await act(async () => reactProps(find(host, "send-answer") as Element)?.onClick?.({}));
  await settle(60);
  const after = (await store.readAll(id)).filter((e: LedgerEvent) => e.type === "question-selection").length;
  return { asked, after };
}

async function pressSave(host: Element) {
  // M92 polish: Save answer sits under an open or unsaved summary.
  if (find(host, "save-station") === null) await openSummary(host, "station-summary");
  await act(async () => reactProps(find(host, "save-station") as Element)?.onClick?.({}));
  await settle();
}

const boundAt = async (store: InstanceType<typeof InMemoryLedgerStore>, id: string, subject: string) =>
  (await store.readAll(id)).filter((e: LedgerEvent) => e.type === "bound" && e.subject === subject);

describe("the first save at a step with Abductive's question open (ISC-658)", () => {
  test("reply, question arrives, type, Save: one press writes the bound row", async () => {
    const id = "m73-first-save";
    const { host, root, store } = await fresh(id);
    const { asked, after } = await replyAndQuestion(host, store, id);
    // The question is open at the step before the summary is typed.
    expect(after).toBeGreaterThan(asked);

    const summary = "Repair cafes as a site where people decide what is worth fixing.";
    await openSummary(host, "station-summary");
    await act(async () => typeInto(find<HTMLTextAreaElement>(host, "station-input") as HTMLTextAreaElement, summary));
    await pressSave(host);

    const bound = await boundAt(store, id, "context");
    expect(bound.map((e: LedgerEvent) => (e as Extract<LedgerEvent, { type: "bound" }>).statement)).toEqual([summary]);
    expect((await projects.getProject(id))?.brief.context).toBe(summary);
    expect(find(host, "station-status")?.textContent).toBe("Saved");
    root.unmount();
  });

  test("a save the record refuses writes nothing, says so, and the next press writes the bound row", async () => {
    const id = "m73-refused-save";
    const store = new RefusesFirstBound();
    const { host, root } = await fresh(id, store);
    await replyAndQuestion(host, store, id);

    const summary = "Repair cafes where volunteers decide what is worth fixing.";
    await openSummary(host, "station-summary");
    await act(async () => typeInto(find<HTMLTextAreaElement>(host, "station-input") as HTMLTextAreaElement, summary));
    await pressSave(host);

    // The first press: the record refused the row, so the brief is not written
    // either, and the page says the save did not happen.
    expect(store.refused).toBe(1);
    expect(await boundAt(store, id, "context")).toEqual([]);
    expect((await projects.getProject(id))?.brief.context ?? "").toBe("");
    expect(find(host, "station-save-error")?.getAttribute("role")).toBe("alert");
    expect(find(host, "station-save-error")?.textContent).toBe("Abductive couldn't record the answer. Try again.");
    expect(find(host, "station-status")?.textContent).toBe("Not saved");
    await openSummary(host, "station-summary");
    expect(find<HTMLTextAreaElement>(host, "station-input")?.value).toBe(summary);

    // The second press is the save.
    await pressSave(host);
    const bound = await boundAt(store, id, "context");
    expect(bound.map((e: LedgerEvent) => (e as Extract<LedgerEvent, { type: "bound" }>).statement)).toEqual([summary]);
    expect((await projects.getProject(id))?.brief.context).toBe(summary);
    expect(find(host, "station-save-error")).toBeNull();
    expect(find(host, "station-status")?.textContent).toBe("Saved");
    root.unmount();
  });

  test("an unchanged answer still writes nothing and says so", async () => {
    const id = "m73-unchanged";
    const { host, root, store } = await fresh(id);
    const summary = "Repair cafes.";
    await openSummary(host, "station-summary");
    await act(async () => typeInto(find<HTMLTextAreaElement>(host, "station-input") as HTMLTextAreaElement, summary));
    await pressSave(host);
    expect((await boundAt(store, id, "context")).length).toBe(1);
    await pressSave(host);
    expect((await boundAt(store, id, "context")).length).toBe(1);
    expect(find(host, "station-status")?.textContent).toBe("Unchanged");
    root.unmount();
  });

  /* The lead's ruling: a press writes the bound whenever the step's latest bound
   * differs from the box, even when the disk already matches. That is the state
   * the failed save left behind: the answer on disk and no row in History. */
  test("an answer on disk with no bound row is recorded by the next press", async () => {
    const id = "m73-repair";
    const summary = "Repair cafes where volunteers decide what is worth fixing.";
    const { host, root, store } = await fresh(id, new InMemoryLedgerStore(), { context: summary });
    await openSummary(host, "station-summary");
    expect(find<HTMLTextAreaElement>(host, "station-input")?.value).toBe(summary);
    await pressSave(host);
    const bound = await boundAt(store, id, "context");
    expect(bound.map((e: LedgerEvent) => (e as Extract<LedgerEvent, { type: "bound" }>).statement)).toEqual([summary]);
    expect(find(host, "station-status")?.textContent).toBe("Saved");
    // Recorded now, so the next press has nothing to write.
    await pressSave(host);
    expect((await boundAt(store, id, "context")).length).toBe(1);
    expect(find(host, "station-status")?.textContent).toBe("Unchanged");
    root.unmount();
  });

  test("an answer on disk whose latest bound row says something older is recorded too", async () => {
    const id = "m73-repair-older";
    const summary = "Repair cafes where volunteers decide what is worth fixing.";
    const store = new InMemoryLedgerStore();
    await store.append({
      id: crypto.randomUUID(),
      ts: 1,
      actor: "human",
      projectId: id,
      type: "bound",
      subject: "context",
      statement: "Repair cafes.",
    } as LedgerEvent);
    const { host, root } = await fresh(id, store, { context: summary });
    await pressSave(host);
    const statements = (await boundAt(store, id, "context")).map((e: LedgerEvent) => (e as Extract<LedgerEvent, { type: "bound" }>).statement);
    expect(statements).toEqual(["Repair cafes.", summary]);
    root.unmount();
  });

  /* The other half of the ruling: the record already holds the box, so the
   * press writes no second row. The disk can still lag it, when a save wrote the
   * row and then the brief's write failed, and the press brings the disk up. */
  test("an answer the record holds but the disk lacks is written to disk without a second row", async () => {
    const id = "m73-record-ahead";
    const summary = "Repair cafes where volunteers decide what is worth fixing.";
    const store = new InMemoryLedgerStore();
    await store.append({
      id: crypto.randomUUID(),
      ts: 1,
      actor: "human",
      projectId: id,
      type: "bound",
      subject: "context",
      statement: summary,
    } as LedgerEvent);
    const { host, root } = await fresh(id, store);
    await openSummary(host, "station-summary");
    await act(async () => typeInto(find<HTMLTextAreaElement>(host, "station-input") as HTMLTextAreaElement, summary));
    await pressSave(host);
    expect((await boundAt(store, id, "context")).length).toBe(1);
    expect((await projects.getProject(id))?.brief.context).toBe(summary);
    expect(find(host, "station-status")?.textContent).toBe("Saved");
    root.unmount();
  });
});

