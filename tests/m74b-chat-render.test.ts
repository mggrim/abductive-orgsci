/**
 * M74b, ISC-664, rendered: the opener states the step's question once, a reply
 * typed while the opener streams goes next, and a reply that could not reach the
 * model offers Try again, at the step, after leaving it and coming back
 * (docs/walks/2026-10-02-phd-student-walk.md, findings 2, 3 and 10).
 *
 * The real Workbench over a real ledger; the inference client is a script whose
 * stream the test holds open and whose failures the test chooses.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MockInferenceClient } from "../src/inference/mock.ts";
import type { CompleteRequest, CompleteResult, StreamDelta } from "../src/inference/types.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const { ModelUnreachableError } = await import(`${SRC}inference/cliBridge.ts`);

/** What the next stream does: answer, wait for the test, or fail on the network twice over. */
let next: "answer" | "hold" | "fail" = "answer";
let release: () => void = () => undefined;
class ScriptClient extends MockInferenceClient {
  override async completeStream(req: CompleteRequest, onDelta: (d: StreamDelta) => void): Promise<CompleteResult> {
    const how = next;
    if (how === "fail") throw new ModelUnreachableError();
    if (how === "hold") {
      onDelta({ text: "This step is " });
      await new Promise<void>((resolve) => (release = resolve));
    }
    return super.completeStream(req, onDelta);
  }
}
const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: new ScriptClient(), live: true }),
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
const { resetConversationOpeners, resetChatFailures } = await import(`${SRC}workbench/Dialogue.tsx`);
const { resetInterviewInFlight } = await import(`${SRC}interview/orchestrator.ts`);
const { stationById } = await import(`${SRC}flow/stations.ts`);
const projects = await import(`${SRC}state/projects.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);

async function study(id: string) {
  await projects.saveProject({
    id,
    title: "M74b test",
    stage: "design-brief",
    createdAt: 1,
    brief: projects.emptyBrief(),
  } as never);
}

type Store = InstanceType<typeof InMemoryLedgerStore>;
function tree(id: string, station: string, store: Store) {
  return React.createElement(
    StrictMode,
    null,
    React.createElement(LedgerProvider, { store }, React.createElement(Workbench, { projectId: id, station })),
  );
}

async function render(id: string, station: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const store = new InMemoryLedgerStore();
  await act(async () => root.render(tree(id, station, store)));
  return { host, root, store };
}

function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined ? undefined : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
const find = <T extends Element>(host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`) as T | null;
const focus = (el: Element | null) => reactProps(el as Element)?.onFocus?.({});
const press = (el: Element | null) => reactProps(el as Element)?.onClick?.({ preventDefault() {} });
function typeInto(el: HTMLTextAreaElement, value: string) {
  el.value = value;
  reactProps(el)?.onChange?.({ target: el });
}
const enter = (el: Element | null) =>
  reactProps(el as Element)?.onKeyDown?.({ key: "Enter", shiftKey: false, nativeEvent: {}, preventDefault() {} });

async function settle(times = 25) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
}

const humanTurns = (events: readonly LedgerEvent[]) =>
  events.filter((e) => e.type === "response" && e.actor === "human");
const toolTurns = (events: readonly LedgerEvent[]) =>
  events.filter((e) => e.type === "response" && e.actor !== "human");

function reset() {
  next = "answer";
  resetConversationOpeners();
  resetInterviewInFlight();
  resetChatFailures();
}

describe("the opener (finding 3)", () => {
  test("the step's question is on screen once, in the bubble, and the record names it as the opener's", async () => {
    reset();
    await study("m74b-opener");
    const { host, root, store } = await render("m74b-opener", "site");
    await settle();
    await act(async () => focus(find(host, "answer-input")));
    await settle();

    const prompt = stationById("site").prompt;
    const thread = find(host, "transcript")?.textContent ?? "";
    expect(thread.split(prompt).length - 1).toBe(1);
    // The mock's own closing question is gone from the opener too.
    expect(thread).not.toContain("What did you see that made you say it?");
    expect(host.querySelectorAll(".turn-asked")).toHaveLength(0);

    const events = await store.readAll("m74b-opener");
    const opener = (events as readonly LedgerEvent[]).find((e) => e.type === "question-selection");
    expect(opener?.type === "question-selection" && opener.opener).toBe(true);
    expect(opener?.type === "question-selection" && opener.question).toBe(prompt);
    root.unmount();
  });
});

describe("the wait (finding 2)", () => {
  test("a reply typed while the opener streams waits with a line, then goes when the opener ends", async () => {
    reset();
    await study("m74b-wait");
    const { host, root, store } = await render("m74b-wait", "context");
    await settle();
    next = "hold";
    await act(async () => focus(find(host, "answer-input")));
    await settle(5);
    expect(find(host, "streaming-turn")).not.toBeNull();

    const box = find<HTMLTextAreaElement>(host, "answer-input")!;
    await act(async () => typeInto(box, "It's a repair café in a church hall."));
    await act(async () => enter(box));
    await settle(3);
    expect(find(host, "reply-queued")?.textContent).toBe("Abductive is still writing; your reply goes next.");
    expect(box.value).toBe("It's a repair café in a church hall.");
    expect(humanTurns(await store.readAll("m74b-wait"))).toHaveLength(0);

    next = "answer";
    await act(async () => release());
    await settle();
    const events = await store.readAll("m74b-wait");
    expect(humanTurns(events).map((e) => (e.type === "response" ? e.text : ""))).toEqual([
      "It's a repair café in a church hall.",
    ]);
    // The opener, then the reply to the researcher's message.
    expect(toolTurns(events)).toHaveLength(2);
    expect(find(host, "reply-queued")).toBeNull();
    root.unmount();
  });
});

describe("Load failed (finding 10)", () => {
  test("a reply that could not reach the model offers Try again, which survives leaving the step and resends the same turn", async () => {
    reset();
    await study("m74b-fail");
    const { host, root, store } = await render("m74b-fail", "context");
    await settle();
    await act(async () => focus(find(host, "answer-input")));
    await settle();

    next = "fail";
    const box = find<HTMLTextAreaElement>(host, "answer-input")!;
    await act(async () => typeInto(box, "I only have notes from my two Saturdays."));
    await act(async () => press(find(host, "send-answer")));
    await settle();

    const line = find(host, "chat-unreachable");
    expect(line?.textContent).toContain("Abductive couldn't reach the model.");
    expect(find(host, "chat-try-again")?.textContent).toBe("Try again");
    // The message is on the record once, and not lost.
    expect(humanTurns(await store.readAll("m74b-fail"))).toHaveLength(1);
    expect(find(host, "dialogue-error")).toBeNull();

    // Leave the step and come back.
    await act(async () => root.render(tree("m74b-fail", "process", store)));
    await settle();
    expect(find(host, "chat-unreachable")).toBeNull();
    await act(async () => root.render(tree("m74b-fail", "context", store)));
    await settle();
    expect(find(host, "chat-unreachable")).not.toBeNull();

    next = "answer";
    await act(async () => press(find(host, "chat-try-again")));
    await settle();
    const events = await store.readAll("m74b-fail");
    expect(humanTurns(events)).toHaveLength(1);
    expect(toolTurns(events)).toHaveLength(2);
    expect(find(host, "chat-unreachable")).toBeNull();
    root.unmount();
  });
});
