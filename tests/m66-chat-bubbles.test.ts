/**
 * The chat reads like Messages (M66, ISC-627 to ISC-629).
 *
 * Matthew, 2026-10-01: "make the chats look more like imessage. Remove the
 * placeholder text in the chats." One component still draws every conversation
 * (Dialogue.tsx), on Starting point and on every Design step. What changes is
 * the surface: Abductive's turns are grey bubbles on the left and yours are ink
 * bubbles on the right, a run of bubbles from one side groups and the last one
 * carries the tail, the speaker's name is for a screen reader only, a centred
 * time opens the thread and marks a gap of more than ten minutes, a reply that
 * has not started yet is a typing bubble, and the composer is a pill with a
 * round send button and no placeholder. The summary fields beside the chat lose
 * their placeholders too.
 *
 * The send button is live only with text and is never disabled (the lead's
 * ruling of 2026-10-01): FND-03 and the M58 decision keep a control that is
 * inert at rest from being greyed without a sentence, so an empty box leaves
 * the button quiet and a no-op, the way tests/m58-chat.test.ts already holds.
 */
import "fake-indexeddb/auto";
import { openSummary } from "./openSummary.ts";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MockInferenceClient } from "../src/inference/mock.ts";
import type { CompleteRequest, CompleteResult, StreamDelta } from "../src/inference/types.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

let held = false;
const gates: Array<() => void> = [];
function release() {
  gates.shift()?.();
}
function gate(): Promise<void> {
  return held ? new Promise((resolve) => gates.push(resolve)) : Promise.resolve();
}
class GatedClient extends MockInferenceClient {
  override async completeStream(
    req: CompleteRequest,
    onDelta: (delta: StreamDelta) => void,
  ): Promise<CompleteResult> {
    const result = await this.complete(req);
    await gate();
    const cut = Math.floor(result.text.length / 2);
    onDelta({ text: result.text.slice(0, cut) });
    await gate();
    onDelta({ text: result.text.slice(cut) });
    return result;
  }
}

const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: new GatedClient(), live: true }),
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

const CSS = await Bun.file(`${SRC}ui/styles/design.css`).text();
const TOKENS = await Bun.file(`${SRC}ui/styles/tokens.css`).text();
const FRAMING = await Bun.file(`${SRC}flow/FramingBand.tsx`).text();
const WORKSPACE = await Bun.file(`${SRC}flow/StationWorkspace.tsx`).text();

/** The body of the first rule whose selector list is exactly `selector`. */
function rule(selector: string, css = CSS): string {
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const at = plain.indexOf(`\n${selector} {`);
  if (at < 0) return "";
  return plain.slice(at, plain.indexOf("}", at));
}

async function study(id: string) {
  await projects.saveProject({
    id,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: projects.emptyBrief(),
  } as never);
}
async function render(id: string, station: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const store = new InMemoryLedgerStore();
  await act(async () => {
    root.render(
      React.createElement(
        StrictMode,
        null,
        React.createElement(LedgerProvider, { store }, React.createElement(Workbench, { projectId: id, station })),
      ),
    );
  });
  return { host, root, store };
}
function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined
    ? undefined
    : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
function find<T extends Element>(host: Element, id: string): T | null {
  return host.querySelector(`[data-testid="${id}"]`) as T | null;
}
async function settle(times = 25) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
}
async function fresh(id: string) {
  held = false;
  gates.length = 0;
  dialogue.resetConversationOpeners();
  resetInterviewInFlight();
  await study(id);
  return render(id, "site");
}
async function talk(host: Element, text: string) {
  await act(async () => {
    reactProps(find(host, "answer-input") as Element)?.onFocus?.({});
  });
  await settle();
  const box = find<HTMLTextAreaElement>(host, "answer-input") as HTMLTextAreaElement;
  await act(async () => {
    box.value = text;
    reactProps(box)?.onChange?.({ target: box });
  });
  await act(async () =>
    reactProps(box)?.onKeyDown?.({ key: "Enter", shiftKey: false, preventDefault() {}, nativeEvent: {} }),
  );
  await settle();
}
const hiddenName = (li: Element | null | undefined) =>
  li?.querySelector(":scope > .visually-hidden")?.textContent ?? "";

describe("the pure rules (ISC-627)", () => {
  const MIN = 60_000;
  test("a time opens the thread, and another marks a gap of more than ten minutes", () => {
    const entries = [
      { id: "a", kind: "agent", text: "q", ts: 0 },
      { id: "b", kind: "human", text: "x", ts: 3 * MIN },
      { id: "c", kind: "agent", text: "r", ts: 13 * MIN },
      { id: "d", kind: "human", text: "y", ts: 24 * MIN },
    ] as const;
    const stamps = dialogue.chatStamps(entries);
    expect(stamps.lead).toBe(0);
    // Ten minutes exactly is not a gap; eleven is.
    expect([...stamps.before.entries()]).toEqual([["d", 24 * MIN]]);
    // An empty thread has no time to show.
    expect(dialogue.chatStamps([]).lead).toBeUndefined();
  });

  test("the time reads the way the rest of the app writes one, capitalised", () => {
    const now = new Date(2026, 9, 1, 18, 0).getTime();
    expect(dialogue.chatStampLabel(new Date(2026, 9, 1, 14, 5).getTime(), now)).toBe("Today at 14:05");
    expect(dialogue.chatStampLabel(new Date(2026, 8, 3, 9, 30).getTime(), now)).toBe("3 September 2026 at 09:30");
  });

  test("the last bubble of a run carries the tail, and a line or a time ends the run", () => {
    expect(dialogue.tailFlags(["tool", "tool", "you", "you", "tool"])).toEqual([false, true, false, true, true]);
    expect(dialogue.tailFlags(["tool", "break", "tool"])).toEqual([true, false, true]);
    expect(dialogue.tailFlags([])).toEqual([]);
  });
});

describe("bubbles (ISC-627)", () => {
  test("Abductive's bubbles and yours carry distinct classes and accessible names, with no name rows", async () => {
    const { host, root } = await fresh("m66-sides");
    await talk(host, "Night shifts run the ward on a skeleton crew.");
    const thread = find(host, "transcript");
    const bubbles = [...(thread?.querySelectorAll("li.chat-bubble") ?? [])];
    const tool = bubbles.filter((li) => li.classList.contains("chat-tool"));
    const you = bubbles.filter((li) => li.classList.contains("chat-you"));
    expect(tool.length).toBeGreaterThanOrEqual(2);
    expect(you.length).toBe(1);
    // No bubble is on both sides.
    expect(bubbles.every((li) => li.classList.contains("chat-tool") !== li.classList.contains("chat-you"))).toBe(true);
    // A screen reader hears who spoke; the eye reads the side.
    for (const li of tool) expect(hiddenName(li)).toMatch(/^Abductive/);
    expect(hiddenName(you[0])).toMatch(/^You/);
    // The labels and the mark are gone from the page.
    expect(thread?.querySelector(".turn-label")).toBeNull();
    expect(thread?.querySelector(".chat-mark")).toBeNull();
    root.unmount();
  });

  test("a run from one side ends in the one bubble with the tail", async () => {
    const { host, root } = await fresh("m66-tail");
    await talk(host, "The night sister decides who gets the float nurse.");
    const bubbles = [...(find(host, "transcript")?.querySelectorAll("li.chat-bubble") ?? [])];
    const sides = bubbles.map((li) => (li.classList.contains("chat-you") ? "you" : "tool"));
    const tails = bubbles.map((li) => li.classList.contains("chat-tail"));
    expect(tails).toEqual(dialogue.tailFlags(sides));
    // The step's question and the opener group: one tail between them.
    expect(sides[0]).toBe("tool");
    expect(sides[1]).toBe("tool");
    expect(tails.slice(0, 2)).toEqual([false, true]);
    root.unmount();
  });

  test("a centred time opens a thread that has turns, and an empty thread shows none", async () => {
    const { host, root } = await fresh("m66-stamp");
    expect(find(host, "transcript")?.querySelector(".chat-stamp")).toBeNull();
    await talk(host, "Two wards share one float nurse after midnight.");
    const first = find(host, "transcript")?.firstElementChild;
    expect(first?.classList.contains("chat-stamp")).toBe(true);
    expect(first?.textContent ?? "").toMatch(/^Today at \d\d:\d\d$/);
    root.unmount();
  });
});

describe("typing (ISC-628)", () => {
  test("a grey bubble with three dots while the reply waits, then the text in the same place", async () => {
    const { host, root } = await fresh("m66-typing");
    held = true;
    await act(async () => {
      reactProps(find(host, "answer-input") as Element)?.onFocus?.({});
    });
    await settle(10);
    const typing = find(host, "streaming-turn");
    expect(typing?.classList.contains("chat-bubble")).toBe(true);
    expect(typing?.classList.contains("chat-tool")).toBe(true);
    const dots = find(host, "chat-waiting");
    expect(dots?.classList.contains("chat-typing")).toBe(true);
    expect(dots?.children.length).toBe(3);
    expect(dots?.getAttribute("aria-label")).toBe("Abductive is writing");

    await act(async () => release());
    await settle(10);
    expect(find(host, "chat-waiting")).toBeNull();
    expect(find(host, "streaming-turn")?.querySelector("p")?.textContent?.length ?? 0).toBeGreaterThan(0);
    await act(async () => release());
    await settle();
    root.unmount();
  });
});

describe("the composer (ISC-629)", () => {
  test("the box has no placeholder and is named Your reply", async () => {
    const { host, root } = await fresh("m66-box");
    const box = find(host, "answer-input");
    expect(box?.hasAttribute("placeholder")).toBe(false);
    expect(box?.getAttribute("aria-label")).toBe("Your reply");
    root.unmount();
  });

  test("the send button is round, holds an arrow, and is live only with text and never disabled", async () => {
    const { host, root } = await fresh("m66-send");
    await act(async () => {
      reactProps(find(host, "answer-input") as Element)?.onFocus?.({});
    });
    await settle();
    const send = find(host, "send-answer");
    expect(send?.closest("[data-testid='answer-box']")).not.toBeNull();
    expect(send?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(send?.textContent).toBe("Send");
    expect(send?.getAttribute("data-live")).toBe("false");
    expect(send?.hasAttribute("disabled")).toBe(false);
    expect(send?.hasAttribute("aria-disabled")).toBe(false);
    const box = find<HTMLTextAreaElement>(host, "answer-input") as HTMLTextAreaElement;
    await act(async () => {
      box.value = "x";
      reactProps(box)?.onChange?.({ target: box });
    });
    expect(find(host, "send-answer")?.getAttribute("data-live")).toBe("true");
    root.unmount();
  });

  test("the pill, the round button and the two bubble colours are in the stylesheet", () => {
    expect(TOKENS).toMatch(/--radius-bubble:\s*18px/);
    expect(rule(".chat-composer")).toContain("border-radius: var(--radius-composer)");
    expect(rule(".chat-send")).toContain("border-radius: var(--radius-pill)");
    expect(rule('.chat-send[data-live="true"]')).toContain("background: var(--accent)");
    expect(rule(".chat-bubble")).toContain("border-radius: var(--radius-bubble)");
    expect(rule(".chat-bubble")).toContain("max-width: 75%");
    expect(rule(".chat-tool.chat-bubble")).toContain("background: var(--accent-fill)");
    expect(rule(".chat-you.chat-bubble")).toContain("background: var(--accent)");
    expect(rule(".chat-you.chat-bubble")).toContain("color: var(--ink-inverse)");
    // At phone width the bubbles take up to 85% and the composer stays in view.
    expect(CSS).toMatch(/@media \(max-width: 700px\) \{[^@]*\.chat-bubble \{\s*max-width: 85%/);
    expect(CSS).toMatch(/@media \(max-width: 700px\) \{[^@]*\.chat-compose \{[^}]*position: sticky/);
    // The saved note sits where Messages puts "Delivered".
    expect(rule(".chat-saved")).toContain("align-self: flex-end");
  });
});

describe("no placeholder in the fields beside the chat (ISC-629)", () => {
  test("Starting point's three fields and a step's summary carry none", () => {
    for (const gone of [
      "A topic, a setting or an itch",
      "Zuckerman 2017 on genres and puzzles",
      "US management journals, or a specialist outlet",
    ]) {
      expect(FRAMING).not.toContain(gone);
    }
    expect(WORKSPACE).not.toContain("what this section has settled");
  });

  test("the rendered summary box on a Design step has no placeholder", async () => {
    const { host, root } = await fresh("m66-summary");
    await openSummary(host, "station-summary"); // M92, ISC-752
    const box = find(host, "station-input");
    expect(box).not.toBeNull();
    expect(box?.hasAttribute("placeholder")).toBe(false);
    root.unmount();
  });
});
