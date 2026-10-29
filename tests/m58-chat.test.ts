/**
 * The chat as people know it (M58, ISC-564).
 *
 * Matthew, 2026-09-27: "the chat interfaces need a redesign. they should all
 * look like the AI chat interfaces that people are now familiar with." One
 * component draws every conversation: a thread with the tool's turns on the
 * left and the researcher's on the right, the step's question as the tool's
 * first turn, a composer at the foot with Enter to send and Shift+Enter for a
 * line, the three moves as chips, and replies that render as they stream. The
 * record's events are unchanged, which is asserted here by reading the events
 * the chips write.
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

/* A client whose stream can be held between its deltas, so the page can be read
 * mid-reply. `gates` opens one step per call to `release`. */
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
    const stopped = () => {
      if (req.signal?.aborted === true) throw new DOMException("stopped", "AbortError");
    };
    await gate();
    stopped();
    const cut = Math.floor(result.text.length / 2);
    onDelta({ text: result.text.slice(0, cut) });
    await gate();
    stopped();
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

async function study(id: string, brief: Record<string, unknown> = {}) {
  await projects.saveProject({
    id,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...projects.emptyBrief(), ...brief },
  } as never);
}

async function render(id: string, station: string, seed: readonly LedgerEvent[] = []) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const store = new InMemoryLedgerStore();
  for (const event of seed) await store.append(event);
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
function typeInto(el: HTMLTextAreaElement, value: string) {
  el.value = value;
  reactProps(el)?.onChange?.({ target: el });
}
function key(el: Element, init: { key: string; shiftKey?: boolean }) {
  reactProps(el)?.onKeyDown?.({ key: init.key, shiftKey: init.shiftKey === true, preventDefault() {}, nativeEvent: {} });
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
async function open(host: Element) {
  await act(async () => {
    reactProps(find(host, "answer-input") as Element)?.onFocus?.({});
  });
  await settle();
}
async function events(store: InstanceType<typeof InMemoryLedgerStore>, id: string): Promise<readonly LedgerEvent[]> {
  return store.readAll(id);
}

describe("the pure rules", () => {
  test("Enter sends and Shift+Enter breaks a line", () => {
    expect(dialogue.sendsOnKey({ key: "Enter", shiftKey: false })).toBe(true);
    expect(dialogue.sendsOnKey({ key: "Enter", shiftKey: true })).toBe(false);
    expect(dialogue.sendsOnKey({ key: "a", shiftKey: false })).toBe(false);
    // A composing input method keeps its own Enter.
    expect(dialogue.sendsOnKey({ key: "Enter", shiftKey: false, nativeEvent: { isComposing: true } })).toBe(false);
  });

  test("the thread follows the newest turn unless the reader has scrolled up", () => {
    // At the foot, or within a line of it: follow.
    expect(dialogue.nearBottom(600, 1000, 400)).toBe(true);
    expect(dialogue.nearBottom(580, 1000, 400)).toBe(true);
    // Scrolled back to read an older turn: stay put.
    expect(dialogue.nearBottom(200, 1000, 400)).toBe(false);
  });

  test("the saved answer sits under the last turn said before the save", () => {
    const entries = [
      { id: "a", kind: "agent", text: "q", ts: 10 },
      { id: "b", kind: "human", text: "x", ts: 20 },
      { id: "c", kind: "agent", text: "r", ts: 40 },
    ] as const;
    const bound = (subject: string, ts: number) =>
      ({ id: `s${ts}`, ts, actor: "human", projectId: "p", type: "bound", subject, statement: "s" }) as LedgerEvent;
    expect(dialogue.savedAnswerAt([bound("site", 30)], entries, "site")).toBe("b");
    // The latest save wins.
    expect(dialogue.savedAnswerAt([bound("site", 30), bound("site", 50)], entries, "site")).toBe("c");
    // Saved before anything was said: under the step's question.
    expect(dialogue.savedAnswerAt([bound("site", 5)], entries, "site")).toBeNull();
    // Nothing saved here, or a save at another step.
    expect(dialogue.savedAnswerAt([bound("context", 30)], entries, "site")).toBeUndefined();
    // Starting point is saved under the starting interest's subject.
    expect(dialogue.savedAnswerAt([bound("starting-interest", 30)], entries, "framing")).toBe("b");
  });
});

describe("the thread and the composer (ISC-564)", () => {
  test("the tool's turns sit left and the researcher's right, with the question first", async () => {
    const { host, root } = await fresh("m58-roles");
    await settle();
    const thread = find(host, "transcript");
    expect(thread?.getAttribute("role")).toBe("log");
    expect(thread?.getAttribute("aria-live")).toBe("polite");
    const first = thread?.querySelector("li");
    expect(first?.getAttribute("data-testid")).toBe("station-prompt");
    expect(first?.classList.contains("chat-tool")).toBe(true);
    expect(first?.textContent ?? "").toContain("Abductive");

    await open(host);
    const box = find<HTMLTextAreaElement>(host, "answer-input") as HTMLTextAreaElement;
    await act(async () => typeInto(box, "Night shifts run the ward on a skeleton crew."));
    await act(async () => key(box, { key: "Enter" }));
    await settle();

    const turns = [...(thread?.querySelectorAll("li.chat-turn") ?? [])];
    const you = turns.filter((li) => li.classList.contains("chat-you"));
    const tool = turns.filter((li) => li.classList.contains("chat-tool"));
    expect(you.length).toBe(1);
    expect(you[0]?.textContent ?? "").toContain("Night shifts run the ward");
    expect(tool.length).toBeGreaterThanOrEqual(2);
    // The exact time is on hover; M66 adds the centred times over a run.
    expect(you[0]?.getAttribute("title") ?? "").not.toBe("");
    root.unmount();
  });

  test("Shift+Enter keeps the text in the box and sends nothing", async () => {
    const { host, root, store } = await fresh("m58-shift");
    await open(host);
    const before = (await events(store, "m58-shift")).length;
    const box = find<HTMLTextAreaElement>(host, "answer-input") as HTMLTextAreaElement;
    await act(async () => typeInto(box, "first line"));
    await act(async () => key(box, { key: "Enter", shiftKey: true }));
    await settle();
    expect((await events(store, "m58-shift")).length).toBe(before);
    expect(find<HTMLTextAreaElement>(host, "answer-input")?.value).toBe("first line");
    root.unmount();
  });

  test("Send is quiet with an empty box and live with text", async () => {
    const { host, root } = await fresh("m58-send");
    await open(host);
    expect(find(host, "send-answer")?.getAttribute("data-live")).toBe("false");
    expect(find(host, "send-answer")?.hasAttribute("disabled")).toBe(false);
    await act(async () => typeInto(find<HTMLTextAreaElement>(host, "answer-input") as HTMLTextAreaElement, "x"));
    expect(find(host, "send-answer")?.getAttribute("data-live")).toBe("true");
    root.unmount();
  });

  test("the composer comes before the chips in the tab order", async () => {
    const { host, root } = await fresh("m58-tab");
    await open(host);
    const compose = find(host, "chat-compose");
    const order = [...(compose?.querySelectorAll("textarea, button") ?? [])].map(
      (el) => el.getAttribute("data-testid"),
    );
    expect(order.slice(0, 2)).toEqual(["answer-input", "send-answer"]);
    expect(order.indexOf("give-directions")).toBeGreaterThan(1);
    root.unmount();
  });
});

describe("the chips fire the moves the record already has", () => {
  /* M69, ISC-642: "Not now" went (Matthew: "Why does there need to be a not now
   * button?"), so I don't know is the one chip that declines. */
  /* M74b, ISC-665: the chip writes its own `dont-know` event, not a refusal. */
  test("I don't know records a dont-know event, and there is no Not now", async () => {
    const { host, root, store } = await fresh("m58-chips");
    await open(host);
    expect(find(host, "dont-know")).not.toBeNull();
    expect(find(host, "not-now")).toBeNull();
    await act(async () => reactProps(find(host, "dont-know") as Element)?.onClick?.({}));
    await settle();
    const kinds = (await events(store, "m58-chips"))
      .filter((e) => e.type === "refusal" || e.type === "dont-know")
      .map((e) => e.type);
    expect(kinds).toEqual(["dont-know"]);
    root.unmount();
  });

  test("Ask me differently (Suggest topics until M62) writes a guidance turn", async () => {
    const { host, root, store } = await fresh("m58-guide");
    await open(host);
    await act(async () => reactProps(find(host, "give-directions") as Element)?.onClick?.({}));
    await settle();
    const modes = (await events(store, "m58-guide"))
      .filter((e): e is Extract<LedgerEvent, { type: "question-selection" }> => e.type === "question-selection")
      .map((e) => e.mode);
    expect(modes).toContain("guidance");
    root.unmount();
  });
});

describe("a reply renders as it streams", () => {
  /* M66, ISC-628: the quiet mark is the typing indicator now, three dots in a
   * grey bubble, where it was the one glyph "…". */
  test("a quiet mark while the first token waits, then the text as it arrives", async () => {
    const { host, root } = await fresh("m58-stream");
    held = true;
    await act(async () => {
      reactProps(find(host, "answer-input") as Element)?.onFocus?.({});
    });
    await settle(10);
    expect(find(host, "streaming-turn")).not.toBeNull();
    expect(find(host, "chat-waiting")?.children.length).toBe(3);

    await act(async () => release());
    await settle(10);
    const half = find(host, "streaming-turn")?.textContent ?? "";
    expect(find(host, "chat-waiting")).toBeNull();
    expect(half.length).toBeGreaterThan(0);

    await act(async () => release());
    await settle();
    // Landed: the streaming turn is gone and the finished turn is in the thread.
    expect(find(host, "streaming-turn")).toBeNull();
    expect(find(host, "transcript")?.querySelectorAll("li.chat-tool").length ?? 0).toBeGreaterThanOrEqual(2);
    root.unmount();
  });
});

const READING_ID = "5b0c1d2e-3f40-4a51-8b62-7c83d94e0f15";
describe("the puzzle step offers the tool's reading as its first draft (M58, ISC-567)", () => {
  const reading = (id: string): LedgerEvent =>
    ({
      id: READING_ID,
      ts: 5,
      actor: "persona:interviewer",
      projectId: id,
      model: "m",
      modelVersion: "v",
      type: "puzzle-reading",
      text: "Mentors said the sheet judged the venture, yet the scores followed who knew the founder.",
      sources: [{ kind: "answer", subject: "context" }],
      digest: "d",
    }) as LedgerEvent;

  test("the thread asks the step's question, then offers the reading and asks whether it is the puzzle", async () => {
    held = false;
    dialogue.resetConversationOpeners();
    resetInterviewInFlight();
    await study("m58-puzzle");
    const { host, root } = await render("m58-puzzle", "puzzle", [reading("m58-puzzle")]);
    await settle();
    const turns = [...(find(host, "transcript")?.querySelectorAll("li") ?? [])];
    expect(turns[0]?.getAttribute("data-testid")).toBe("station-prompt");
    expect(turns[0]?.textContent).toContain("What do you see, or expect to see, in your setting that current accounts can't explain?");
    expect(turns[1]?.getAttribute("data-testid")).toBe("chat-offer");
    expect(find(host, "puzzle-offer-text")?.textContent).toContain("the scores followed who knew the founder");
    expect(turns[1]?.textContent).toContain("Is this the surprise that current accounts can't explain?");
    root.unmount();
  });

  test("taking the reading as a draft and saving records the reading as its source", async () => {
    held = false;
    dialogue.resetConversationOpeners();
    resetInterviewInFlight();
    await study("m58-puzzle-save");
    const { host, root, store } = await render("m58-puzzle-save", "puzzle", [reading("m58-puzzle-save")]);
    await settle();
    await act(async () => reactProps(find(host, "draft-from-reading") as Element)?.onClick?.({}));
    // M92, ISC-752: the reading lands as text, unsaved, until Save answer.
    expect(find(host, "station-text")?.textContent).toContain("the scores followed who knew the founder");
    expect(find(host, "station-drafted")?.textContent).toContain("Suggested from Abductive's reading");
    await act(async () => reactProps(find(host, "save-station") as Element)?.onClick?.({}));
    await settle();
    const bound = (await events(store, "m58-puzzle-save")).filter(
      (e): e is Extract<LedgerEvent, { type: "bound" }> => e.type === "bound" && e.subject === "puzzle",
    );
    expect(bound).toHaveLength(1);
    expect(bound[0]?.draftedFrom).toBe(READING_ID);
    expect((await projects.getProject("m58-puzzle-save"))?.brief.puzzleAnswer).toContain("who knew the founder");
    // The thread marks where the answer was saved.
    expect(find(host, "chat-saved")?.textContent).toBe("Answer saved");
    root.unmount();
  });

  test("a study with no reading shows the step and says the reading is not made yet", async () => {
    held = false;
    dialogue.resetConversationOpeners();
    resetInterviewInFlight();
    await study("m58-puzzle-none");
    const { host, root } = await render("m58-puzzle-none", "puzzle");
    await settle();
    expect(find(host, "puzzle-offer")?.getAttribute("data-state")).toBe("nothing-to-read");
    expect(find(host, "draft-from-reading")).toBeNull();
    root.unmount();
  });
});

describe("Stop keeps what the reader saw, marked cut short (M58)", () => {
  test("Stop takes Send's place while a reply streams, and the stopped turn is kept and asks nothing", async () => {
    const { host, root, store } = await fresh("m58-stop");
    held = true;
    await act(async () => {
      reactProps(find(host, "answer-input") as Element)?.onFocus?.({});
    });
    await settle(10);
    expect(find(host, "stop-reply")?.textContent).toBe("Stop");
    expect(find(host, "send-answer")).toBeNull();
    await act(async () => release());
    await settle(10);
    const seen = find(host, "streaming-turn")?.querySelector("p")?.textContent ?? "";
    expect(seen.length).toBeGreaterThan(0);

    await act(async () => reactProps(find(host, "stop-reply") as Element)?.onClick?.({}));
    await act(async () => release());
    await settle();

    const all = await events(store, "m58-stop");
    const responses = all.filter((e): e is Extract<LedgerEvent, { type: "response" }> => e.type === "response");
    expect(responses).toHaveLength(1);
    expect(responses[0]?.cutShort).toBe(true);
    expect(responses[0]?.text.length).toBeGreaterThan(0);
    // A stopped reply opens no question.
    expect(all.filter((e) => e.type === "question-selection")).toHaveLength(0);
    // The thread keeps the turn and says it was stopped; Send is back.
    expect(find(host, "streaming-turn")).toBeNull();
    expect(find(host, "turn-cut-short")?.textContent).toBe("You stopped this reply here.");
    expect(find(host, "send-answer")).not.toBeNull();
    root.unmount();
  });

  test("the validator takes the field on a tool turn only, and only as true", async () => {
    const { validateEvent } = await import(`${SRC}ledger/events.ts`);
    const base = {
      id: "3f0c1d2e-3f40-4a51-8b62-7c83d94e0f17",
      ts: 1,
      projectId: "p",
      type: "response",
      text: "Half a reply",
      station: "context",
    };
    const tool = { ...base, actor: "persona:interviewer", model: "sonnet", modelVersion: "sonnet" };
    expect(validateEvent({ ...tool, cutShort: true })).toEqual([]);
    expect(validateEvent(tool)).toEqual([]);
    expect(validateEvent({ ...tool, cutShort: false }).join()).toContain("cutShort must be true");
    expect(validateEvent({ ...base, actor: "human", cutShort: true }).join()).toContain("cutShort belongs");
  });

  test("the session replay says a turn was stopped", async () => {
    const { buildSessionReplay } = await import(`${SRC}export/sessionReplay.ts`);
    const turn = {
      id: "4f0c1d2e-3f40-4a51-8b62-7c83d94e0f18",
      ts: 1,
      actor: "persona:interviewer",
      model: "sonnet",
      modelVersion: "sonnet",
      projectId: "p",
      type: "response",
      text: "Half a reply",
      station: "context",
      cutShort: true,
    } as LedgerEvent;
    const md = buildSessionReplay({ project: { id: "p", title: "t" } as never, events: [turn] } as never);
    expect(md).toContain("_You stopped this reply here._");
  });
});

describe("Sample and Early data wait outside the loops (M58, ISC-567)", () => {
  test("on a fresh study the two are visible, labelled and inert, and say what opens them", async () => {
    held = false;
    dialogue.resetConversationOpeners();
    resetInterviewInFlight();
    await study("m58-gate");
    const { host, root } = await render("m58-gate", "sample");
    await settle();
    const rail = find(host, "station-rail") as HTMLElement;
    const inert = [...rail.querySelectorAll("button[aria-disabled='true']")].map((b) => b.getAttribute("data-station"));
    expect(inert).toEqual(["sample", "early-data"]);
    expect(rail.querySelectorAll("[disabled]")).toHaveLength(0);
    // M84 (the lead's ruling): the gate is said once, in Design's Help. The rail
    // names no steps still without an answer, and a screen reader hears the rule.
    expect(rail.textContent).not.toMatch(/still needs? an answer/);
    expect(rail.textContent).toContain("Sample opens once you have answered all six steps in the loops.");
    // A link that lands on a closed step gets the rule's first sentence, and no conversation.
    expect(find(host, "station-closed")?.textContent).toBe("Sample opens once you have answered all six steps in the loops.");
    expect(find(host, "station-closed-go")).toBeNull();
    expect(find(host, "dialogue")).toBeNull();
    root.unmount();
  });

  /* M69, ISC-641: a set-aside no longer settles a loop step. With five answers
   * and an older set-aside at Bind the two stay closed and name Bind; the sixth
   * answer opens them as before. */
  test("an older set-aside leaves the two closed and names the step; the sixth answer opens them", async () => {
    held = false;
    dialogue.resetConversationOpeners();
    resetInterviewInFlight();
    const five = {
      context: "c",
      processOfInterest: "p",
      outcomeOfInterest: "o",
      siteRationale: "s",
      puzzleAnswer: "q",
    };
    await study("m58-aside", five);
    const setAside = {
      id: "2f0c1d2e-3f40-4a51-8b62-7c83d94e0f16",
      ts: 3,
      actor: "human",
      projectId: "m58-aside",
      type: "bound",
      subject: "bind:not-applicable",
      statement: "Not applicable to this project.",
    } as LedgerEvent;
    const closed = await render("m58-aside", "sample", [setAside]);
    await settle();
    // M84: the rule's first sentence only.
    expect(find(closed.host, "station-closed")?.textContent).toBe("Sample opens once you have answered all six steps in the loops.");
    closed.root.unmount();

    await study("m58-open", { ...five, bind: "b" });
    const { host, root } = await render("m58-open", "sample");
    await settle();
    const rail = find(host, "station-rail") as HTMLElement;
    expect(rail.querySelectorAll("button[aria-disabled='true']")).toHaveLength(0);
    expect(find(host, "station-closed")).toBeNull();
    expect(find(host, "dialogue")).not.toBeNull();
    root.unmount();
  });
});
