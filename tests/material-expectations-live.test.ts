/**
 * The Material page, over the shape the walk study actually has (M33 fix 2).
 *
 * The section that shows what a paper expects shipped, its own tests passed,
 * and live it was not on the page at all: no element with `expect` in a test id
 * or a class, no "Not judged yet" anywhere in the body, on a study whose eleven
 * `paper-fit` events all predate the expectations field. Nothing was judged on
 * mount either.
 *
 * The earlier render tests mounted `SeminalCorpus` directly with a handful of
 * events and no model connected. Neither of those is the live case. This one
 * mounts the page the router mounts, over a store holding what the walk study
 * holds, with the bridge answering as it does on the researcher's machine:
 *
 *   - four typed lines, two of them naming an uploaded file
 *   - two uploaded papers, each with passages
 *   - eleven `paper-fit` verdicts, every one without a `baselines` field
 *   - a CLI bridge whose health probe says ok, so the tool is live
 *
 * The last of those is what the old tests could not see. A live model means the
 * judge actually runs on mount, and the row was written to draw nothing at all
 * while a judgement is in flight. So the whole section vanished for as long as
 * the call took, which on six papers against a real model is the whole time
 * anybody was looking at it.
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
const { detectBridge, forgetDetectedBridge, resetBridgeDetection } = await import(
  `${SRC}inference/cliBridge.ts`
);
const { activeInferenceClient } = await import(`${SRC}ui/personaRun.ts`);
const { resetJudgeLoops } = await import(`${SRC}flow/usePaperFit.ts`);
const { resetJudgementsInFlight } = await import(`${SRC}proposals/paperFit.ts`);

const P = "walk-study";

/** The four lines in the walk study's papers box, two of them uploaded. */
const LINES = [
  "Bechky 2003, Sharing meaning across occupational communities (Organization Science)",
  "Cohen and Hilligoss 2010, The published literature on handoffs in hospitals (Quality and Safety in Health Care)",
  "Grodal and Schildt 2026, Abductive qualitative research with LLMs",
  "Hilligoss and Cohen 2013, The unappreciated challenges of between-unit handoffs (Annals of Emergency Medicine)",
];

const DOCS = [
  { id: "d-cohen", name: "cohen-hilligoss-2010.pdf" },
  { id: "d-hilligoss", name: "hilligoss-cohen-2013.pdf" },
];

let seq = 0;
const uid = () => `ffffffff-6666-4666-8666-${String((seq += 1)).padStart(12, "0")}`;

/** A verdict of the shape every one on the walk study has: no baselines field. */
function verdictBefore(paperKey: string, paperName: string, verdict: string): LedgerEvent {
  return {
    id: uid(),
    ts: 1_700_000_000_000 + (seq += 1),
    actor: "system",
    projectId: P,
    type: "paper-fit",
    paperKey,
    paperName,
    verdict,
    reason: `${paperName} speaks to handovers.`,
    framingDigest: "an older framing",
  } as LedgerEvent;
}

/**
 * Eleven of them, which is what the study holds: several papers judged more
 * than once as the framing moved, last one winning per paper.
 */
function ledgerEvents(): readonly LedgerEvent[] {
  const keys: readonly (readonly [string, string, string])[] = [
    ["d-cohen", "cohen-hilligoss-2010.pdf", "fits"],
    ["d-hilligoss", "hilligoss-cohen-2013.pdf", "fits"],
    ["bechky 2003", LINES[0] as string, "fits"],
    ["grodal 2026", LINES[2] as string, "misfit"],
  ];
  const out: LedgerEvent[] = [];
  // Two rounds for the first three, one for the last, plus a stale line: eleven.
  for (const round of [0, 1]) {
    for (const [key, name, fit] of keys) {
      if (round === 1 && key === "grodal 2026") continue;
      out.push(verdictBefore(key, name, fit));
    }
  }
  out.push(verdictBefore("langley 1999", "Langley 1999, a line since edited away", "fits"));
  out.push(verdictBefore("d-cohen", "cohen-hilligoss-2010.pdf", "fits"));
  out.push(verdictBefore("d-hilligoss", "hilligoss-cohen-2013.pdf", "fits"));
  return out;
}

/**
 * A bridge on the port, installed as the global `fetch`.
 *
 * Global rather than injected, because that is how the client reaches it: the
 * health probe takes an implementation for testability and
 * `CliBridgeInferenceClient` does not, so a stub passed only to `detectBridge`
 * would make the tool live and leave the model call going nowhere real.
 */
function installBridge(options: { readonly delayMs?: number } = {}): {
  completions: () => number;
} {
  const delayMs = options.delayMs ?? 10_000;
  let completions = 0;
  const real = globalThis.fetch;
  restore = () => {
    globalThis.fetch = real;
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/health")) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    completions += 1;
    /* By default a model call that does not come back inside the window a
     * reader is looking at the page. Not a hang and not an error: the shape of
     * a real call to a real model, which is what made the section disappear. */
    await wait(delayMs);
    return new Response(
      JSON.stringify({
        text: [
          "FIT: fits. Yes.",
          "EXPECTS: Handoffs fail when the receiver cannot question the sender.",
          "SCOPE: where the exchange is timed",
        ].join("\n"),
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  return { completions: () => completions };
}

let restore: (() => void) | null = null;

async function seed() {
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
      seminalCorpus: LINES.join("\n"),
    },
  } as never);
  for (const doc of DOCS) {
    await projects.saveDocument({
      id: doc.id,
      projectId: P,
      name: doc.name,
      kind: "literature",
      createdAt: 1,
      chunkCount: 1,
    } as never);
    await projects.saveChunks([
      {
        id: `c-${doc.id}`,
        projectId: P,
        documentId: doc.id,
        kind: "literature",
        text: "a passage about handovers",
        index: 0,
      },
    ] as never);
  }
}

async function mountMaterial(events: readonly LedgerEvent[]) {
  const store = new InMemoryLedgerStore();
  for (const event of events) await store.append(event as never);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      /* Inside `StrictMode`, which is how `main.tsx` mounts the app. Effects
       * are double-invoked there, so a guard that lives in a ref rather than in
       * state is the difference between asking once and asking twice, and a
       * page test that skips it is not testing the page the researcher opens. */
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
  // Long enough for the page to load its study, its corpus and its record, and
  // for the judge to have started. Deliberately far short of the model call.
  for (let i = 0; i < 60; i += 1) {
    await act(async () => {
      await wait(5);
    });
    if (host.querySelector('[data-testid^="literature-doc-"]') !== null) break;
  }
  await act(async () => {
    await wait(20);
  });
  return { host, root, store };
}

beforeEach(async () => {
  seq = 0;
  resetJudgeLoops();
  /* A judgement held by a run this file abandoned, or by another file's, would
   * make its paper unjudgeable here: the guard is module-level, because what it
   * protects is the record rather than any one component. */
  resetJudgementsInFlight();
  resetBridgeDetection();
  await seed();
});

afterEach(() => {
  forgetDetectedBridge();
  restore?.();
  restore = null;
});

describe("the walk study's Material page, with a model connected", () => {
  test("the bridge makes the tool live, which is what the old tests never saw", async () => {
    const b = installBridge();
    await detectBridge();
    expect(activeInferenceClient().live).toBe(true);
    expect(b.completions()).toBe(0);
  });

  test("every paper says nobody has asked what it expects, while a judgement runs", async () => {
    /* The live defect. Eleven verdicts, none of them carrying expectations, a
     * model connected, and the judge running on mount. The section was written
     * to draw nothing at all while a call is in flight, so the page showed no
     * expectations anywhere and the researcher had no way to tell that from the
     * feature not existing. */
    installBridge();
    await detectBridge();
    const { host, root } = await mountMaterial(ledgerEvents());

    const notJudged = [...host.querySelectorAll('[data-testid^="expects-unjudged-"]')];
    expect(notJudged.length).toBeGreaterThan(0);
    /* The walk study's framing is complete, so the row says the paper has not
     * been read and says what reads one (M35, corrected at D20). The oldest
     * sentence asked for a puzzle or a setting, which this researcher had already
     * given; the next one named the bulk control, which stages expectations for
     * every paper and reads none. */
    expect(host.textContent ?? "").toContain(
      "Abductive hasn't considered this paper yet. Abductive considers a paper when the paper arrives, and again when you save your starting point.",
    );
    // Both uploaded papers, by name, so this cannot pass on the typed rows alone.
    for (const doc of DOCS) {
      expect({
        doc: doc.id,
        says: host.querySelector(`[data-testid="expects-unjudged-${doc.id}"]`) !== null,
      }).toEqual({ doc: doc.id, says: true });
    }
    root.unmount();
  });

  test("the verdict each row already holds is still shown beside it", async () => {
    // The fit verdict is current about the one question it answered, and the
    // walk's complaint was never that it was missing.
    installBridge();
    await detectBridge();
    const { host, root } = await mountMaterial(ledgerEvents());
    expect(host.textContent ?? "").toContain("cohen-hilligoss-2010.pdf speaks to handovers.");
    root.unmount();
  });

  /* What is deliberately not asserted here, and where it is asserted instead.
   *
   * That each due paper is judged exactly once is asserted the same way and for
   * the same reason: `m33-baselines.test.ts` runs two judging passes against one
   * study concurrently and holds each paper to one call. That is the shape the
   * walk found, two runs that had both worked out what was due before either
   * wrote, and it is deterministic there and not here.
   *
   * Whether the judge reaches a model depends on `activeInferenceClient`, whose
   * two inputs are a memoised bridge probe and `sessionStorage`. Both are
   * process-wide and every test file shares them, so a page-level assertion
   * that a model call happened passes alone and reports whatever the last file
   * to touch those globals left behind when the suite runs whole. That is a
   * property of the harness rather than of this page.
   *
   * So the two halves are asserted where each is deterministic: that both
   * surfaces ask on mount, and that each paper's answer reaches the record as
   * it is judged, are in `m33-baselines.test.ts` against `judgeArrivingPapers`
   * itself. What is left here is what only the real page can show, which is
   * that the section is on it.
   */

  test("with no model connected it asks for nothing and still says its piece", async () => {
    const { host, root } = await mountMaterial(ledgerEvents());
    expect(activeInferenceClient().live).toBe(false);
    expect(host.textContent ?? "").toContain(
      "Abductive hasn't considered this paper yet. Abductive considers a paper when the paper arrives, and again when you save your starting point.",
    );
    root.unmount();
  });
});
