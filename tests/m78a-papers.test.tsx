/**
 * M78a, ISC-678: a paper named by its citation alone is Named, not read (the
 * serendipity walk of 2026-10-03, finding 3).
 *
 * The walk's student typed six citations and uploaded no paper, and Sources
 * marked all six READ, each with one or two expectations about the tool crib and
 * a "Where the expectation applies" line, written from the model's memory of
 * the citation ("though I can't confirm his exact boundaries without the text").
 * A paper with no text is Named: its row says so and carries no expectations and
 * no verdict, and the reading runs only on an uploaded text. Expectations that
 * an older project holds for a citation-only paper stay readable under "Written
 * from the citation alone". The raw "AbortError" became an error that says what failed and what to do.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { emptyBrief, type ProjectBrief } from "../src/state/projects.ts";
import {
  judgeArrivingPapers,
  papersNeedingJudgement,
  resetJudgementsInFlight,
} from "../src/proposals/paperFit.ts";
import { extractTheoryClaims, paperKeysWithText, paperRefs } from "../src/proposals/theory.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { PaperFitChip } from "../src/flow/PaperFitChip.tsx";
import { CITATION_ONLY_HEAD } from "../src/flow/PaperExpectations.tsx";
import { judgeFailureNote, NAMED_NOTE } from "../src/flow/SeminalCorpus.tsx";

const SRC = new URL("../src/", import.meta.url).pathname;
const src = (path: string) => Bun.file(`${SRC}${path}`).text();

const { SeminalCorpus } = await import(`${SRC}flow/SeminalCorpus.tsx`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const projects = await import(`${SRC}state/projects.ts`);

const P = "p-m78a-papers";
let seq = 0;
const uid = () => `aaaaaaaa-7878-4aaa-8aaa-${String((seq += 1)).padStart(12, "0")}`;
const now = () => 1_790_000_000_000 + seq;

const BRIEF: ProjectBrief = {
  ...emptyBrief(),
  startingInterest: "Serendipity at a shared tool workshop in an incubator.",
  researchQuestion: "I expected the prepared mind to find the leads, and the helpers find them.",
  context: "A deep-tech incubator with a shared tool crib.",
  seminalCorpus: "Dew 2009\nde Rond 2014",
};

const DOC = { id: "d-bechky", name: "bechky-2003.pdf" };
const CHUNK = {
  id: "c-bechky",
  projectId: P,
  documentId: DOC.id,
  kind: "literature",
  text: "Occupational communities share meaning through the objects that they make.",
  index: 0,
};

/** A verdict an older project holds for a citation-only paper, expectations and all. */
function oldCitationVerdict(): LedgerEvent {
  return {
    id: uid(),
    ts: now(),
    actor: "system",
    projectId: P,
    type: "paper-fit",
    paperKey: "dew 2009",
    paperName: "Dew 2009",
    verdict: "fits",
    reason: "Dew expects serendipity to need a prepared mind.",
    framingDigest: "an older framing",
    model: "m",
    modelVersion: "v",
    baselines: [
      { id: "dew 2009#00000001", expectation: "Founders with prior knowledge act on more chance encounters.", scope: "new ventures" },
    ],
  } as LedgerEvent;
}

function uploadVerdict(): LedgerEvent {
  return {
    id: uid(),
    ts: now(),
    actor: "system",
    projectId: P,
    type: "paper-fit",
    paperKey: DOC.id,
    paperName: DOC.name,
    verdict: "fits",
    reason: "Bechky speaks to shared meaning across groups.",
    framingDigest: "an older framing",
    model: "m",
    modelVersion: "v",
    baselines: [
      {
        id: "d-bechky#00000002",
        expectation: "Groups that share a workshop build a shared vocabulary for their objects.",
        scope: "shared workplaces",
        chunkId: CHUNK.id,
      },
    ],
  } as LedgerEvent;
}

describe("the reading runs only on an uploaded text", () => {
  beforeEach(() => resetJudgementsInFlight());

  test("a typed citation is a named paper, and an upload is not", () => {
    const refs = paperRefs({ documents: [], chunks: [], typedList: "Dew 2009\nMerton and Barber 2004" });
    expect(refs.map((r) => r.named)).toEqual([true, true]);
  });

  test("a named paper is never due for judging, whatever the record says", () => {
    const due = papersNeedingJudgement({
      papers: [{ key: "dew 2009", name: "Dew 2009", chunks: [], named: true }],
      verdicts: new Map(),
      digest: "d",
    });
    expect(due).toEqual([]);
  });

  test("a pass over six typed citations makes no model call and writes nothing", async () => {
    let calls = 0;
    const papers = paperRefs({
      documents: [],
      chunks: [],
      typedList: [
        "Merton and Barber 2004",
        "Cunha, Clegg and Mendonça 2010",
        "Dew 2009",
        "de Rond 2014",
        "Busch 2024",
        "Cohen, Bingham and Hallen 2019",
      ].join("\n"),
    });
    const written = await judgeArrivingPapers({
      projectId: P,
      papers,
      context: studyContext(BRIEF),
      events: [],
      client: {
        complete: async () => {
          calls += 1;
          return { text: "FIT: fits. It speaks to serendipity.", model: "m", modelVersion: "v" };
        },
      } as never,
      makeId: uid,
      now,
    });
    expect(calls).toBe(0);
    expect(written).toEqual([]);
  });

  test("an uploaded paper is still judged, once", async () => {
    let calls = 0;
    const papers = paperRefs({
      documents: [{ ...DOC, projectId: P, kind: "literature", createdAt: 1, chunkCount: 1 }] as never,
      chunks: [CHUNK] as never,
      typedList: "Dew 2009",
    });
    await judgeArrivingPapers({
      projectId: P,
      papers,
      context: studyContext(BRIEF),
      events: [],
      client: {
        complete: async () => {
          calls += 1;
          return { text: "FIT: fits. It speaks to workshops.", model: "m", modelVersion: "v" };
        },
      } as never,
      makeId: uid,
      now,
    });
    expect(calls).toBe(1);
  });
});

describe("expectations written from a citation are not counted as tested", () => {
  test("the keys Checks counts are the papers with text behind them", () => {
    const keys = paperKeysWithText({
      documents: [{ ...DOC, projectId: P, kind: "literature", createdAt: 1, chunkCount: 1 }] as never,
      chunks: [CHUNK] as never,
      typedList: "Dew 2009",
    });
    expect([...keys]).toEqual([DOC.id]);
  });

  test("Suggest expectations stages nothing from a citation-only verdict", () => {
    const events = [oldCitationVerdict()];
    const result = extractTheoryClaims({
      projectId: P,
      documents: [],
      chunks: [],
      typedList: "Dew 2009",
      skip: new Set(),
      verdicts: new Map([
        [
          "dew 2009",
          {
            paperKey: "dew 2009",
            paperName: "Dew 2009",
            verdict: "fits",
            reason: "",
            framingDigest: "d",
            model: "m",
            modelVersion: "v",
            baselines: (events[0] as unknown as { baselines: never[] }).baselines,
          },
        ],
      ]) as never,
      declined: new Map(),
      framingDigest: "d",
    });
    expect(result.events.filter((e) => e.type === "proposal")).toEqual([]);
  });
});

describe("the row says Named, and the error says what to do", () => {
  test("the chip reads Named for a paper with no text", () => {
    const html = renderToStaticMarkup(React.createElement(PaperFitChip, { verdict: undefined, state: "named" }));
    expect(html).toContain("Identified"); // M92, ISC-753
    expect(html).not.toContain(">Read<");
  });

  test("a verdict on a named paper does not turn its chip into Read", () => {
    const html = renderToStaticMarkup(React.createElement(PaperFitChip, { verdict: "fits", state: "named" }));
    expect(html).toContain("Identified"); // M92, ISC-753
  });

  test("the named note is the brief's sentence", () => {
    expect(NAMED_NOTE).toBe("Identified at Starting point; upload the paper and Abductive considers it.");
  });

  test("a failed read names no exception and offers Try again", async () => {
    expect(judgeFailureNote(null)).toBe("Abductive couldn't consider your papers. Try again.");
    expect(judgeFailureNote("bechky-2003.pdf")).toBe("Abductive couldn't consider bechky-2003.pdf. Try again.");
    const corpus = await src("flow/SeminalCorpus.tsx");
    expect(corpus).toContain('data-testid="literature-retry"');
    expect(corpus).not.toContain("${message}");
  });

  test("Sources gives one instruction for the paper list", async () => {
    const corpus = await src("flow/SeminalCorpus.tsx");
    expect(corpus).not.toContain("whatever form you like");
    expect(corpus.match(/one paper per line/g)?.length).toBe(1);
  });
});

/* ── Rendered, over a project shaped like an older one ─────────────────────── */

async function seed(): Promise<void> {
  await projects.saveProject({
    id: P,
    title: "tool crib",
    stage: "design-brief",
    createdAt: 1,
    brief: BRIEF,
  } as never);
  await projects.saveDocument({ ...DOC, projectId: P, kind: "literature", createdAt: 1, chunkCount: 1 } as never);
  await projects.saveChunks([CHUNK] as never);
}

async function mount(events: readonly LedgerEvent[]) {
  const store = new InMemoryLedgerStore();
  for (const e of events) await store.append(e as never);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        LedgerProvider as never,
        { store } as never,
        React.createElement(SeminalCorpus as never, {
          projectId: P,
          documents: [{ ...DOC, projectId: P, kind: "literature", createdAt: 1, chunkCount: 1 }],
          chunks: [CHUNK],
          onAdded: () => {},
        } as never),
      ) as never,
    );
  });
  for (let i = 0; i < 60; i += 1) {
    await act(async () => {
      await wait(5);
    });
    if (host.querySelector('[data-testid="typed-line-0"]') !== null) break;
  }
  await act(async () => {
    await wait(20);
  });
  return { host, root };
}

describe("Sources over an older project with citation-only expectations", () => {
  test("a typed line reads Named with the note, and its old expectations sit under their own label without controls", async () => {
    seq = 0;
    await seed();
    const { host, root } = await mount([oldCitationVerdict(), uploadVerdict()]);
    const line = host.querySelector('[data-testid="typed-line-0"]');
    expect(line).not.toBeNull();
    const text = line?.textContent ?? "";
    expect(text).toContain("Identified");
    expect(text).toContain(NAMED_NOTE);
    expect(text).not.toContain("Dew expects serendipity");
    expect(text).toContain(CITATION_ONLY_HEAD);
    expect(text).toContain("Founders with prior knowledge act on more chance encounters.");
    expect(line?.querySelector('[data-testid^="expects-add-"]')).toBeNull();
    expect(line?.querySelector('[data-testid^="expects-decline-"]')).toBeNull();
    expect(line?.querySelector('[data-testid="paper-fit-read"]')).toBeNull();

    const second = host.querySelector('[data-testid="typed-line-1"]')?.textContent ?? "";
    expect(second).toContain(NAMED_NOTE);
    expect(second).not.toContain(CITATION_ONLY_HEAD);

    // The uploaded paper keeps its reading and its controls.
    const doc = host.querySelector(`[data-testid="literature-doc-${DOC.id}"]`);
    expect(doc?.querySelector('[data-testid^="expects-add-"]')).not.toBeNull();
    await act(async () => root.unmount());
  });
});
