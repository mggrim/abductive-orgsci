/**
 * The judge that never ran, and the two silences around it (M35).
 *
 * The walk of a fresh study on 2026-09-09: a paper uploaded on Material sat at
 * "Not judged yet. Fill in your puzzle or your setting and this line fills in." for
 * eight minutes, through one hard reload, with the framing fully filled in. A
 * second hard reload judged it in thirty one seconds. Three defects, one shape:
 * the tool had nothing to say and said nothing.
 *
 * D1, the race. `detectBridge` memoises a probe of the bridge's health and
 * `bridgeDetected` answers `false` while that probe is still in the air.
 * `activeInferenceClient` reads it synchronously, so a study whose project
 * loaded from IndexedDB before the probe answered was judged with the mock
 * client, refused by the `live` guard, and never asked again: `useJudgeOnMount`
 * marks the study asked the first time it is ready and that is its one shot.
 * Which reload won was a coin toss on IndexedDB against a fetch.
 *
 * D2, the sentence. The unjudged row told a researcher who had filled in their
 * framing to fill in their framing. Whether that sentence is true depends on
 * `canJudgeFit`, which the row was never told about.
 *
 * D3, the swallow. `judgeArrivals(brief).catch(() => undefined)` and a
 * `judgeArrivals` that only toggled a flag. A throw from the model call left
 * nothing on screen and no retry, which looks exactly like D2 from the outside.
 *
 * The three tests below are one per defect, plus the source check that the dead
 * catches went with the fix.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

const { StudyMaterial } = await import(`${SRC}ui/StudyViews.tsx`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const projects = await import(`${SRC}state/projects.ts`);
const { forgetDetectedBridge, resetBridgeDetection, CLI_PROVIDER_KEY } = await import(
  `${SRC}inference/cliBridge.ts`
);
const { resetJudgeLoops } = await import(`${SRC}flow/usePaperFit.ts`);
const { resetJudgementsInFlight } = await import(`${SRC}proposals/paperFit.ts`);
const { NOT_JUDGED_NOTE, notJudgedNote } = await import(`${SRC}flow/PaperExpectations.tsx`);
const { judgeFailureNote, readPapersLabel } = await import(`${SRC}flow/SeminalCorpus.tsx`);

const P = "race-study";
const PAPER = { id: "d-bechky", name: "bechky-2003.pdf" };

/**
 * A study with one paper and a framing that can be judged against.
 *
 * One paper on purpose. The count of model calls is then the count of judging
 * passes, so "judged exactly once" is a number this file can read rather than
 * an inference about which of six calls belonged to which pass.
 */
async function seed(): Promise<void> {
  await projects.saveProject({
    id: P,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: {
      ...projects.emptyBrief(),
      startingInterest: "How night shifts hand patients over",
      researchQuestion: "I expected a shared picture and found a shared form",
      context: "Two wards of a teaching hospital",
      seminalCorpus: "",
    },
  } as never);
  await projects.saveDocument({
    id: PAPER.id,
    projectId: P,
    name: PAPER.name,
    kind: "literature",
    createdAt: 1,
    chunkCount: 1,
  } as never);
  await projects.saveChunks([
    {
      id: `c-${PAPER.id}`,
      projectId: P,
      documentId: PAPER.id,
      kind: "literature",
      text: "a passage about handovers",
      index: 0,
    },
  ] as never);
}

let restore: (() => void) | null = null;

/**
 * A bridge whose health probe answers late, and a completion that counts.
 *
 * `healthDelayMs` is the whole point of the file. The defect is a probe still in
 * the air when the project finishes loading out of IndexedDB, and the only way
 * to hold that shape steady in a test is to make the probe slower than the
 * store. Global `fetch`, because that is how `CliBridgeInferenceClient` reaches
 * the bridge: a stub handed only to `detectBridge` would make the tool live and
 * send the model call somewhere real.
 */
function installBridge(options: {
  readonly healthDelayMs?: number;
  readonly completeStatus?: number;
}): { completions: () => number } {
  const healthDelayMs = options.healthDelayMs ?? 0;
  const completeStatus = options.completeStatus ?? 200;
  let completions = 0;
  const real = globalThis.fetch;
  restore = () => {
    globalThis.fetch = real;
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/health")) {
      if (healthDelayMs > 0) await wait(healthDelayMs);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    completions += 1;
    if (completeStatus !== 200) {
      return new Response("the model refused the request", { status: completeStatus });
    }
    return new Response(
      JSON.stringify({
        text: [
          "FIT: fits. Yes.",
          "EXPECTS: Handoffs fail when the receiver cannot question the sender.",
          // M69: active, so the reply keeps the owner's rules and the voice retry adds no call.
          "SCOPE: where the sender times the exchange",
        ].join("\n"),
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  return { completions: () => completions };
}

async function mountMaterial(events: readonly LedgerEvent[] = []) {
  const store = new InMemoryLedgerStore();
  for (const event of events) await store.append(event as never);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      /* `StrictMode`, the way `main.tsx` mounts it, so the double-invoked effect
       * is part of what "asked once" is asserted against. */
      React.createElement(
        StrictMode as never,
        null,
        React.createElement(
          LedgerProvider as never,
          { store } as never,
          React.createElement(StudyMaterial as never, { projectId: P } as never),
        ),
      ) as never,
    );
  });
  return { host, root, store };
}

/** Pump React until `done` or the budget runs out. */
async function settle(done: () => boolean, steps = 120): Promise<void> {
  for (let i = 0; i < steps; i += 1) {
    await act(async () => {
      await wait(5);
    });
    if (done()) return;
  }
}

beforeEach(async () => {
  resetJudgeLoops();
  resetJudgementsInFlight();
  resetBridgeDetection();
  /* Another file's provider choice would make the tool live without a probe,
   * which is the one condition under which this file's first test passes for
   * the wrong reason. */
  try {
    localStorage.removeItem(CLI_PROVIDER_KEY);
  } catch {
    /* No session storage in this environment; nothing to clear. */
  }
  await seed();
});

afterEach(() => {
  forgetDetectedBridge();
  restore?.();
  restore = null;
});

describe("a bridge that answers after the study has loaded", () => {
  test("the paper is judged once, after the probe comes back", async () => {
    /* D1. The health probe is slower than IndexedDB here, which is the ordering
     * the walk hit. Before the fix the mount judge read `bridgeDetected()` while
     * it was still `null`, took the mock client, refused it, and never asked
     * again: nought model calls, and a row that said "Not judged yet" for as
     * long as the tab stayed open. */
    const bridge = installBridge({ healthDelayMs: 150 });
    const { host, root } = await mountMaterial();

    // The study is on screen well before the probe answers.
    await settle(() => host.querySelector(`[data-testid="literature-doc-${PAPER.id}"]`) !== null);
    expect({
      onScreen: host.querySelector(`[data-testid="literature-doc-${PAPER.id}"]`) !== null,
      asked: bridge.completions(),
    }).toEqual({ onScreen: true, asked: 0 });

    // And once it does, the one paper that is due is judged, exactly once.
    await settle(() => bridge.completions() > 0);
    await act(async () => {
      await wait(60);
    });
    expect(bridge.completions()).toBe(1);
    root.unmount();
  });
});

describe("what the row says when nothing has judged the paper", () => {
  test("it says what reads a paper, and names no control that cannot (D20)", () => {
    /* D2 got the first sentence right: telling a researcher who has filled in
     * their puzzle and their setting to fill in their puzzle or their setting
     * sends them to a field that is already correct.
     *
     * The second sentence was wrong twice over, found on the walk of 2026-09-13.
     * It named the bulk control as the way to read this paper, and that control
     * has made no model call since M33: it stages expectations that were written
     * when the paper arrived, so it cannot read a paper nothing has read. It also
     * acts on every paper, which is how the walk staged all seven expectations of
     * four papers while trying to read a fifth. */
    expect(notJudgedNote({ judgeable: true })).toBe(
      "Abductive hasn't read this paper yet. Abductive reads a paper when the paper arrives, and again when you save your starting point.",
    );
    expect(notJudgedNote({ judgeable: true })).not.toContain("Press ");
    expect(notJudgedNote({ judgeable: true })).not.toContain(readPapersLabel(1, 1));
  });

  test("it keeps the old sentence when the framing says too little", () => {
    // Unchanged, and still the right thing to say: with no puzzle and no
    // setting there is nothing to hold the paper against, and `canJudgeFit`
    // refuses. Filling the framing in is what makes the reading possible.
    expect(notJudgedNote({ judgeable: false })).toBe(NOT_JUDGED_NOTE);
  });

  test("the framing is passed in, never read a second time from the brief", async () => {
    const src = await Bun.file(`${SRC}flow/PaperExpectations.tsx`).text();
    // Told, not derived: it neither reaches for the study context nor calls the
    // gate. Naming `canJudgeFit` in a comment is how the row says where its
    // answer came from, so the check is on the call and the import.
    expect(src).not.toContain("canJudgeFit(");
    expect(src).not.toContain("studyContext.ts");
    expect(src).toContain("readonly judgeable: boolean");
  });
});

/* M78a, ISC-678 (L9): the failure says what failed and what to do, and the
   panel offers Try again. The exception's own text ("AbortError" on the
   serendipity walk) stays out of the sentence. */
describe("a judge that throws says so", () => {
  test("the message names the paper that was due", () => {
    expect(judgeFailureNote(PAPER.name)).toBe("Abductive couldn't read bechky-2003.pdf. Try again.");
  });

  test("with several papers due it names the papers rather than one of them", () => {
    expect(judgeFailureNote(null)).toBe("Abductive couldn't read your papers. Try again.");
  });

  test("the panel shows it, where it already shows an upload that failed", async () => {
    /* D3. `judgeArrivals` toggled a flag and nothing else, and both call sites
     * threw the failure away. A bridge that answers its health probe and then
     * fails the completion left the row saying "Not judged yet" with no retry
     * and nothing to say why, which is indistinguishable from D2. */
    installBridge({ completeStatus: 500 });
    const { host, root } = await mountMaterial();
    await settle(
      () => (host.querySelector('[data-testid="literature-error"]')?.textContent ?? "") !== "",
    );
    const shown = host.querySelector('[data-testid="literature-error"]')?.textContent ?? "";
    expect(shown).toContain("Abductive couldn't read bechky-2003.pdf");
    expect(shown).not.toContain("the model refused the request");
    expect(host.querySelector('[data-testid="literature-retry"]')?.textContent).toBe("Try again");
    root.unmount();
  });

  test("the call sites no longer throw the failure away", async () => {
    // The catches were load bearing while `judgeArrivals` could throw. It
    // cannot now, so a catch there would only hide the next failure.
    const src = await Bun.file(`${SRC}flow/SeminalCorpus.tsx`).text();
    expect(src).not.toContain(".catch(() => undefined)");
  });
});
