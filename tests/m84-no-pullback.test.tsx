/**
 * M84, ISC-706: the pull-back goes.
 *
 * A co-author (2026-10-07): "people should be able to jump between different
 * 'boxes' in the framework without Abductive wanting the user to jump back and
 * answer a specific question."
 *
 * With a question open at Context and the researcher at Process, the Design page
 * (its header, its bars, its chat) says nothing that names Context's open
 * question and carries no control that goes to it. The question stays in its
 * own step: open Context, and the chat shows it. Moving to another step and
 * answering there is an ordinary act with no note.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const code = (f: string) => readFileSync(`${SRC}${f}`, "utf8");

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
/* Switchable, as m37-station-chat does: off for the page reads, on for the one
 * test that writes at a step and needs the composer. */
let live = false;
const { MockInferenceClient } = await import(`${SRC}inference/mock.ts`);
const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: live ? new MockInferenceClient() : undefined, live }),
}));
afterAll(() => {
  void mock.module(`${SRC}ui/personaRun.ts`, () => realPersonaRun);
});

const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { AppShell } = await import(`${SRC}ui/AppShell.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const { nextStep } = await import(`${SRC}workbench/NextBar.tsx`);
const { stationStates } = await import(`${SRC}flow/stationBrief.ts`);

const QUESTION = "What is going on in this setting that made you want to study these communities?";
let seq = 0;
const uid = () => `84848484-7060-4706-8706-${String((seq += 1)).padStart(12, "0")}`;

async function study(id: string): Promise<readonly LedgerEvent[]> {
  await projects.saveProject({
    id,
    title: "M84 pull-back (test project)",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...projects.emptyBrief(), startingInterest: "Communities forming a field." },
  } as never);
  return [
    {
      id: uid(),
      ts: 1_700_000_000_000 + seq,
      actor: "system",
      projectId: id,
      type: "question-selection",
      moveId: "conversation:context@1",
      topic: "station:context",
      question: QUESTION,
      alternatives: [],
      mode: "interrogation",
      reason: "Asked to open the step.",
      station: "context",
    } as LedgerEvent,
  ];
}

async function mount(events: readonly LedgerEvent[], hash: string) {
  const store = new InMemoryLedgerStore();
  for (const e of events) await store.append(e);
  window.location.hash = hash;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(LedgerProvider, { store }, React.createElement(AppShell))));
  for (let i = 0; i < 15; i += 1) await act(async () => void (await wait(5)));
  return { host, root, store };
}

function reactProps(el: Element | null): Record<string, (e: unknown) => void> {
  const key = Object.keys(el ?? {}).find((k) => k.startsWith("__reactProps$"));
  return key === undefined ? {} : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key] ?? {};
}

/** A sentence or a control that sends the researcher back to an open question. */
const PULL_BACK = /open question at|question is open|go to (?:the )?(?:open )?question|answer that question|change the subject first/i;

describe("ISC-706: at Process, nothing pulls the researcher back to Context's question", () => {
  test("the header, the bars and the chat name no open question elsewhere, and offer no control to it", async () => {
    const events = await study("m84-pull");
    const { host, root } = await mount(events, "#/study/m84-pull/design/process");
    const text = host.textContent ?? "";
    expect(text).not.toMatch(PULL_BACK);
    expect(text).not.toContain(QUESTION);
    expect(host.querySelector('[data-testid="studybar-open"]')).toBeNull();
    expect(host.querySelector('[data-testid="open-elsewhere"]')).toBeNull();
    /* The project's own link in the left rail goes to Design, whose default step
     * is Context, and carries the "Open question" chip, which is a state the
     * brief keeps (ISC-706). It is the project, not the question, so it is left
     * out; every other control that names a question and goes to Context counts. */
    const toContext = [...host.querySelectorAll("a, button")].filter(
      (el) =>
        !el.classList.contains("navrail-studylink") &&
        /question/i.test(el.textContent ?? "") &&
        (el.getAttribute("href") ?? "").endsWith("/design/context"),
    );
    expect(toContext.map((el) => el.outerHTML.slice(0, 300))).toEqual([]);
    root.unmount();
  });

  test("on another tab, the header says nothing about the open question either", async () => {
    const events = await study("m84-pull-tab");
    const { host, root } = await mount(events, "#/study/m84-pull-tab/material");
    expect(host.textContent ?? "").not.toMatch(PULL_BACK);
    expect(host.querySelector('[data-testid="studybar-open"]')).toBeNull();
    root.unmount();
  });

  test("the question stays in its own step: Context's chat shows it", async () => {
    const events = await study("m84-pull-here");
    const { host, root } = await mount(events, "#/study/m84-pull-here/design/context");
    expect(host.textContent ?? "").toContain(QUESTION);
    root.unmount();
  });

  /* The lead's ruling on question 3: the one-open-question invariant stays, and
   * writing at another step is a silent redirection. History still records it,
   * and Context still shows its question when the researcher opens the step. */
  test("writing at Process records the redirection in History, and Context still shows its question", async () => {
    live = true;
    const events = await study("m84-redirect");
    const { host, root, store } = await mount(events, "#/study/m84-redirect/design/process");
    const input = host.querySelector('[data-testid="answer-input"]');
    await act(async () => reactProps(input).onChange?.({ target: { value: "The process is how the communities came to share categories." } }));
    for (let i = 0; i < 5; i += 1) await act(async () => void (await wait(5)));
    await act(async () => reactProps(host.querySelector('[data-testid="send-answer"]')).onClick?.({ preventDefault() {} }));
    for (let i = 0; i < 15; i += 1) await act(async () => void (await wait(5)));
    expect(host.textContent ?? "").not.toMatch(PULL_BACK);
    root.unmount();

    const record = (await store.readAll("m84-redirect")) as readonly LedgerEvent[];
    const redirection = record.find((e) => e.type === "redirection");
    expect(redirection).toMatchObject({ type: "redirection", toTopic: "station:process" });
    expect(record.some((e) => e.type === "response" && (e as { station?: string }).station === "process")).toBe(true);

    const back = await mount(record, "#/study/m84-redirect/design/context");
    expect(back.host.textContent ?? "").toContain(QUESTION);
    back.root.unmount();
    live = false;
  });

  test("the next move is never the open question at another step", () => {
    const brief = projects.emptyBrief();
    const step = nextStep({
      station: "process",
      // Passed anyway, as an older caller might: the NextBar reads no open question now.
      openQuestionStation: "context",
      pendingDrafts: 0,
      brief,
      states: stationStates(brief, 0, new Set()),
      checksRun: false,
    });
    expect(step.rule).not.toBe("question");
    expect(step.sentence).not.toMatch(PULL_BACK);
  });

  test("the chat writes no refusal that sends the researcher back", () => {
    const chat = code("workbench/Dialogue.tsx");
    expect(chat).not.toContain("Answer that question, say you don't know, or change the subject first.");
    expect(chat).not.toContain('data-testid="open-elsewhere"');
    expect(code("ui/AppShell.tsx")).not.toContain('data-testid="studybar-open"');
  });
});
