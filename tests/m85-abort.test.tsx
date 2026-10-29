/**
 * M85, ISC-716: a reply or a suggestion sent just after Save answer completes,
 * and an aborted call that the researcher did not stop shows Abductive's
 * sentence with Try again.
 *
 * Seen three times (M84's walk, and twice in M85's): a bare "AbortError" on a
 * chat reply or on the concept suggestion, right after Save answer, with no way
 * to ask again. Reproduced in Safari on 2026-10-14 with every IndexedDB
 * transaction instrumented: within one millisecond WebKit aborted five
 * readwrite transactions on the ledger's events store, with a null error. Two
 * were the save's concept suggestion (`runSuggestionCounts`) and the chat
 * turn's record (`recordConversationTurnOnce`), each appending at once, and
 * the other three were their retries, which `tryAgainOnAbort` ran at once into
 * the same burst. All three tries failed, so the abort reached the page as
 * its bare name.
 *
 * Held here: the ledger store opens one readwrite transaction at a time; the
 * retry waits before it tries again; and a bare AbortError that the researcher
 * didn't cause renders as Abductive's sentence with Try again, in the chat and
 * on the suggestion note.
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
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

/** A bare abort, as WebKit's aborted transaction surfaces it: name and message both "AbortError". */
const bareAbort = (): Error => Object.assign(new Error("AbortError"), { name: "AbortError" });

let streamFails = 0;
class ScriptClient extends MockInferenceClient {
  override async completeStream(req: CompleteRequest, onDelta: (d: StreamDelta) => void): Promise<CompleteResult> {
    if (streamFails > 0) {
      streamFails -= 1;
      throw bareAbort();
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
/* The concept suggestion after a save: the test chooses whether it aborts. */
let suggestFails = 0;
let suggestCalls = 0;
const realRun = { ...(await import(`${SRC}concepts/run.ts`)) };
await mock.module(`${SRC}concepts/run.ts`, () => ({
  ...realRun,
  runSuggestionCounts: async () => {
    suggestCalls += 1;
    if (suggestFails > 0) {
      suggestFails -= 1;
      throw bareAbort();
    }
    return { concepts: 2, relations: 1, statements: 3 };
  },
}));
afterAll(() => {
  void mock.module(`${SRC}concepts/run.ts`, () => realRun);
});

const { IndexedDBLedgerStore, InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { tryAgainOnAbort } = await import(`${SRC}ledger/idbAgain.ts`);
const { Workbench } = await import(`${SRC}workbench/Workbench.tsx`);
const { resetConversationOpeners, resetChatFailures, REPLY_INTERRUPTED } = await import(`${SRC}workbench/Dialogue.tsx`);
const { SUGGEST_INTERRUPTED, SAVE_SUGGESTS_CONCEPTS } = await import(`${SRC}flow/StationWorkspace.tsx`);
/* M93, ISC-759: the save-time pass is off behind SAVE_SUGGESTS_CONCEPTS; this
   file keeps its reversible path covered by turning it on. */
SAVE_SUGGESTS_CONCEPTS.on = true;
afterAll(() => {
  SAVE_SUGGESTS_CONCEPTS.on = false;
});
const { resetInterviewInFlight } = await import(`${SRC}interview/orchestrator.ts`);
const projects = await import(`${SRC}state/projects.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);

let seq = 0;
const event = (projectId: string, text: string): LedgerEvent =>
  ({
    id: crypto.randomUUID(),
    ts: 1_790_000_000_000 + (seq += 1),
    actor: "human",
    projectId,
    type: "response",
    text,
    inReplyTo: "q",
  }) as unknown as LedgerEvent;

describe("ISC-716: the ledger opens one readwrite transaction at a time", () => {
  test("two writers appending at once never hold two write transactions open together", async () => {
    let open = 0;
    let most = 0;
    const real = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase["transaction"]>) {
      const tx = real.apply(this, args);
      if (args[1] === "readwrite") {
        open += 1;
        most = Math.max(most, open);
        const close = () => {
          open -= 1;
        };
        tx.addEventListener("complete", close);
        tx.addEventListener("abort", close);
      }
      return tx;
    } as IDBDatabase["transaction"];
    try {
      const store = new IndexedDBLedgerStore("m85-abort-ledger");
      const suggestion = Array.from({ length: 6 }, (_, i) => store.append(event("p", `suggestion ${i}`)));
      const turn = Array.from({ length: 6 }, (_, i) => store.append(event("p", `turn ${i}`)));
      await Promise.all([...suggestion, ...turn]);
      expect((await store.readAll("p")).length).toBe(12);
      expect(most).toBe(1);
    } finally {
      IDBDatabase.prototype.transaction = real;
    }
  });

  test("a write that fails leaves the next one free to run", async () => {
    const store = new IndexedDBLedgerStore("m85-abort-ledger-2");
    const first = event("q", "first");
    await store.append(first);
    // The same id again is refused by the unique index.
    await expect(store.append(first)).rejects.toBeDefined();
    await store.append(event("q", "after"));
    expect((await store.readAll("q")).length).toBe(2);
  });
});

describe("ISC-716: a batch lands whole or not at all", () => {
  test("a batch whose second event fails writes none of its events", async () => {
    const store = new IndexedDBLedgerStore("m85-abort-ledger-3");
    const kept = event("r", "already there");
    await store.append(kept);
    const fresh = event("r", "the question");
    // The second event repeats an id that is stored, so the unique index refuses it.
    await expect(store.appendAll([fresh, kept])).rejects.toBeDefined();
    const ids = (await store.readAll("r")).map((e: LedgerEvent) => e.id);
    expect(ids).toEqual([kept.id]);
  });

  test("the provider writes a batch through the store's own batch write", async () => {
    const code = await Bun.file(new URL("../src/state/ledgerContext.tsx", import.meta.url).pathname).text();
    expect(code).toContain("store.appendAll");
  });
});

describe("ISC-716: the retry waits before it tries again", () => {
  test("an aborted try is followed by a pause, longer each time, and then succeeds", async () => {
    const waits: number[] = [];
    let tries = 0;
    const result = await tryAgainOnAbort(
      async () => {
        tries += 1;
        if (tries < 3) throw bareAbort();
        return "written";
      },
      3,
      async (ms: number) => {
        waits.push(ms);
      },
    );
    expect(result).toBe("written");
    expect(waits.length).toBe(2);
    expect(waits[0]).toBeGreaterThan(0);
    expect(waits[1]).toBeGreaterThan(waits[0] ?? 0);
  });
});

/* ── Rendered: the chat and the suggestion note ─────────────────────────── */

async function study(id: string) {
  await projects.saveProject({
    id,
    title: "M85 abort (test project)",
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
async function render(id: string, station: string, store: Store = new InMemoryLedgerStore()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
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
async function settle(times = 25) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
}
const toolTurns = (events: readonly LedgerEvent[]) => events.filter((e) => e.type === "response" && e.actor !== "human");
const humanTurns = (events: readonly LedgerEvent[]) => events.filter((e) => e.type === "response" && e.actor === "human");

function reset() {
  streamFails = 0;
  suggestFails = 0;
  suggestCalls = 0;
  resetConversationOpeners();
  resetInterviewInFlight();
  resetChatFailures();
}

/** A store whose next batch holding Abductive's turn aborts whole, as WebKit's transaction did. */
class AbortingStore extends InMemoryLedgerStore {
  failTurns = 0;
  async appendAll(batch: readonly LedgerEvent[]): Promise<void> {
    if (this.failTurns > 0 && batch.some((e) => e.type === "response" && e.actor !== "human")) {
      this.failTurns -= 1;
      throw bareAbort();
    }
    for (const e of batch) await this.append(e);
  }
}

describe("ISC-716: the chat names an abort that the researcher didn't cause, and offers Try again", () => {
  test("the sentence is Abductive's, by L9", () => {
    expect(REPLY_INTERRUPTED).toBe("Abductive couldn't finish that reply. Try again.");
  });

  test("an aborted stream shows the sentence with Try again, and Try again completes the turn", async () => {
    reset();
    await study("m85-abort-stream");
    const { host, root, store } = await render("m85-abort-stream", "context");
    await settle();
    await act(async () => focus(find(host, "answer-input")));
    await settle();

    streamFails = 1;
    await act(async () => typeInto(find<HTMLTextAreaElement>(host, "answer-input")!, "The communities in the field."));
    await act(async () => press(find(host, "send-answer")));
    await settle();

    expect(find(host, "chat-unreachable")?.textContent).toContain("Abductive couldn't finish that reply.");
    expect(find(host, "chat-try-again")?.textContent).toBe("Try again");
    expect(host.textContent ?? "").not.toMatch(/(^|[^a-z])AbortError/);
    expect(humanTurns(await store.readAll("m85-abort-stream"))).toHaveLength(1);

    const before = toolTurns(await store.readAll("m85-abort-stream")).length;
    await act(async () => press(find(host, "chat-try-again")));
    await settle();
    expect(toolTurns(await store.readAll("m85-abort-stream")).length).toBe(before + 1);
    expect(find(host, "chat-unreachable")).toBeNull();
    root.unmount();
  });

  test("a turn whose record aborts shows the same sentence, and Try again records it", async () => {
    reset();
    await study("m85-abort-record");
    const store = new AbortingStore();
    const { host, root } = await render("m85-abort-record", "context", store);
    await settle();
    await act(async () => focus(find(host, "answer-input")));
    await settle();

    store.failTurns = 1;
    await act(async () => typeInto(find<HTMLTextAreaElement>(host, "answer-input")!, "The communities in the field."));
    await act(async () => press(find(host, "send-answer")));
    await settle();

    expect(find(host, "chat-unreachable")?.textContent).toContain("Abductive couldn't finish that reply.");
    expect(host.textContent ?? "").not.toMatch(/(^|[^a-z])AbortError/);
    const before = toolTurns(await store.readAll("m85-abort-record")).length;
    await act(async () => press(find(host, "chat-try-again")));
    await settle();
    expect(toolTurns(await store.readAll("m85-abort-record")).length).toBe(before + 1);
    root.unmount();
  });
});

describe("ISC-716: the suggestion after a save names an abort, and offers Try again", () => {
  test("the sentence is Abductive's, by L9", () => {
    expect(SUGGEST_INTERRUPTED).toBe("Abductive couldn't finish suggesting concepts from this summary.");
  });

  test("an aborted suggestion shows the sentence with Try again, and Try again suggests", async () => {
    reset();
    await study("m85-abort-suggest");
    const { host, root } = await render("m85-abort-suggest", "context");
    await settle();

    suggestFails = 1;
    await openSummary(host, "station-summary"); // M92, ISC-752
    await act(async () => typeInto(find<HTMLTextAreaElement>(host, "station-input")!, "A field that formed between 1995 and 2015."));
    await act(async () => press(find(host, "save-station")));
    await settle();

    expect(suggestCalls).toBe(1);
    expect(find(host, "station-suggested")?.textContent).toContain("Abductive couldn't finish suggesting concepts from this summary.");
    expect(find(host, "suggest-try-again")?.textContent).toBe("Try again");
    expect(host.textContent ?? "").not.toMatch(/(^|[^a-z])AbortError/);

    await act(async () => press(find(host, "suggest-try-again")));
    await settle();
    expect(suggestCalls).toBe(2);
    expect(find(host, "station-suggested")?.textContent).toContain("Abductive suggested two concepts");
    expect(find(host, "suggest-try-again")).toBeNull();
    root.unmount();
  });
});
