/**
 * "What this paper expects", on the paper's row (M33).
 *
 * Driven through the real Material section rather than through the component in
 * isolation, because the three states this has to draw are the three states the
 * record puts it in, and two of them are what a row shows when there is nothing
 * to show. A paper nobody has judged and a paper judged with nothing to expect
 * looked identical before, and both looked like approval.
 *
 * The typed line gets the same section as the uploaded file, and that is the
 * case that matters most: its expectation comes from a model's memory of a
 * citation rather than from a file anyone read, and the researcher is the only
 * one in the loop who can catch a fabrication.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { beforeEach, describe, expect, test } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

const { SeminalCorpus } = await import(`${SRC}flow/SeminalCorpus.tsx`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const projects = await import(`${SRC}state/projects.ts`);
const {
  ADD_LABEL,
  ADDED_NOTE,
  DECLINE_LABEL,
  NOTHING_EXPECTED_NOTE,
  NOT_JUDGED_NOTE,
  notJudgedNote,
} = await import(`${SRC}flow/PaperExpectations.tsx`);
const { BASELINE_SECTION, baselineScopeLine, baselinesSettled } = await import(
  `${SRC}proposals/baselines.ts`
);
const { forgetDetectedBridge } = await import(`${SRC}inference/cliBridge.ts`);

/**
 * No model connected, which is the state these rows are being read in.
 *
 * Liveness is process-wide: the bridge probe caches its answer in a module
 * variable and the session token lives in one `sessionStorage`, both shared by
 * every test file. So a file that connects a bridge leaves this one connected,
 * and the judge that now runs when Material opens starts writing verdicts over
 * these fixtures. Stated here rather than inherited, because what each of these
 * tests renders depends on it.
 */
beforeEach(() => {
  forgetDetectedBridge();
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    // No storage in this environment, which reads as nobody signed in.
  }
});

let seq = 0;
const uid = () => `dddddddd-4444-4444-8444-${String((seq += 1)).padStart(12, "0")}`;

const doc = (id: string, name: string) => ({
  id,
  projectId: "",
  name,
  kind: "literature",
  createdAt: 1,
  chunkCount: 1,
});
const chunk = (id: string, documentId: string) => ({
  id,
  projectId: "",
  documentId,
  kind: "literature",
  text: "a passage",
  index: 0,
});

const EXPECTS = "Handoffs fail when the receiving clinician cannot question the sender.";
const SCOPE = "where the exchange is timed and status differences are large";

function fitEvent(projectId: string, baselines: readonly unknown[]): LedgerEvent {
  return {
    id: uid(),
    ts: 1,
    actor: "system",
    projectId,
    model: "m",
    modelVersion: "v",
    type: "paper-fit",
    paperKey: "d1",
    paperName: "bechky-2006.pdf",
    verdict: "fits",
    reason: "It speaks to handovers.",
    framingDigest: "",
    baselines,
  } as LedgerEvent;
}

async function mount(projectId: string, events: readonly LedgerEvent[]) {
  const store = new InMemoryLedgerStore();
  for (const event of events) await store.append(event as never);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        StrictMode as never,
        null,
        React.createElement(
          LedgerProvider as never,
          { store } as never,
          React.createElement(SeminalCorpus as never, {
            projectId,
            documents: [doc("d1", "bechky-2006.pdf")],
            chunks: [chunk("c1", "d1")],
            onAdded: () => {},
          } as never),
        ),
      ) as never,
    );
  });
  /* Settled means the expectations region has resolved, not merely that the
   * row exists. Material asks the judge for anything due when it opens now, and
   * the row draws nothing at all while a judgement is in flight, so a loop that
   * stopped at the first paint would read that silence as the answer. */
  for (let i = 0; i < 40; i += 1) {
    await act(async () => {
      await wait(5);
    });
    const resolved =
      host.querySelector('[data-testid^="expects-unjudged-"]') ??
      host.querySelector('[data-testid^="expects-none-"]') ??
      host.querySelector('[data-testid^="expects-"]');
    if (resolved !== null) break;
  }
  return { host, root, store };
}

async function study(id: string, corpus = "", framed = true) {
  await projects.saveProject({
    id,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: {
      ...projects.emptyBrief(),
      /* Framed by default, which is what every study on this page is by the
       * time a paper reaches it. `framed: false` is the fresh study that has
       * named a paper before it has said what it is studying, and the two get
       * different sentences (M35). */
      ...(framed ? { researchQuestion: "expected a shared picture, found a shared form" } : {}),
      seminalCorpus: corpus,
    },
  } as never);
}

/** What an unjudged row says on a study whose framing is filled in (M35, D20). */
const UNREAD_NOTE = notJudgedNote({ judgeable: true });

const text = (host: HTMLElement, selector: string) =>
  host.querySelector(selector)?.textContent ?? "";

describe("what a paper expects, on its row", () => {
  test("a paper nobody has judged says so, and says what would fill it in", async () => {
    const P = "expects-unjudged";
    await study(P);
    const { host, root } = await mount(P, []);
    /* The framing on this study says enough to judge against, so the sentence
     * is the one that names the control rather than the one that asks for a
     * puzzle the researcher has already written (M35). */
    expect(text(host, '[data-testid="expects-unjudged-d1"]')).toBe(UNREAD_NOTE);
    // Silence here reads as approval, which is the state this replaces.
    expect(host.querySelector('[data-testid="expects-d1"]')).toBeNull();
    root.unmount();
  });

  test("a study with no framing yet is asked for one, which is what it is missing", async () => {
    /* The other half of M35. The sentence that asks for a puzzle or a setting is
     * right here and only here: `canJudgeFit` refuses a study with neither, so
     * pressing the control would spend nothing and change nothing. */
    const P = "expects-unframed";
    await study(P, "", false);
    const { host, root } = await mount(P, []);
    expect(text(host, '[data-testid="expects-unjudged-d1"]')).toBe(NOT_JUDGED_NOTE);
    root.unmount();
  });

  test("a verdict from before the field says nobody has asked, not that it expects nothing", async () => {
    /* The walk, exactly. Bechky 2003 read "fits your setting" with its reason,
     * and under it "This paper expects nothing about a setting like yours". The
     * verdict predates the expectations field, so the row was reporting an
     * absence nobody had looked for. */
    const P = "expects-predates";
    await study(P);
    const before = { ...(fitEvent(P, []) as object) } as Record<string, unknown>;
    delete before.baselines;
    const { host, root } = await mount(P, [before as unknown as LedgerEvent]);
    expect(text(host, '[data-testid="expects-unjudged-d1"]')).toBe(UNREAD_NOTE);
    expect(host.querySelector('[data-testid="expects-none-d1"]')).toBeNull();
    // The fit verdict it does hold is still shown: it is current about the one
    // question it answered.
    expect(text(host, '[data-testid="literature-verdict-d1"]')).toBe("It speaks to handovers.");
    root.unmount();
  });

  test("a paper judged with nothing to expect says that, which is a real answer", async () => {
    const P = "expects-none";
    await study(P);
    const { host, root } = await mount(P, [fitEvent(P, [])]);
    expect(text(host, '[data-testid="expects-none-d1"]')).toBe(NOTHING_EXPECTED_NOTE);
    root.unmount();
  });

  test("each expectation renders with where it holds and its two controls", async () => {
    const P = "expects-two";
    await study(P);
    const { host, root } = await mount(P, [
      fitEvent(P, [
        { id: "d1#0", expectation: EXPECTS, scope: SCOPE, chunkId: "c1" },
        { id: "d1#1", expectation: "Understanding is built by asking.", scope: "on night wards" },
      ]),
    ]);
    expect(text(host, ".paper-expects-head")).toBe(BASELINE_SECTION);
    const claims = [...host.querySelectorAll(".paper-expects-claim")].map((n) => n.textContent);
    expect(claims).toEqual([EXPECTS, "Understanding is built by asking."]);
    const scopes = [...host.querySelectorAll(".paper-expects-scope")].map((n) => n.textContent);
    expect(scopes).toEqual([baselineScopeLine(SCOPE), baselineScopeLine("on night wards")]);
    expect(text(host, '[data-testid="expects-add-d1#0"]')).toBe(ADD_LABEL);
    expect(text(host, '[data-testid="expects-decline-d1#0"]')).toBe(DECLINE_LABEL);
    root.unmount();
  });

  test("turning one down records the reason and never rewrites the verdict", async () => {
    const P = "expects-decline";
    await study(P);
    const { host, root, store } = await mount(P, [
      fitEvent(P, [{ id: "d1#0", expectation: EXPECTS, scope: SCOPE, chunkId: "c1" }]),
    ]);

    // The reasons are opened by the control rather than standing beside it.
    expect(host.querySelector('[data-testid="expects-reasons-d1#0"]')).toBeNull();
    await act(async () => {
      (host.querySelector('[data-testid="expects-decline-d1#0"]') as HTMLButtonElement).click();
    });
    const labels = [
      ...host.querySelectorAll('[data-testid="expects-reasons-d1#0"] button'),
    ].map((b) => b.textContent);
    expect(labels).toEqual([
      "The paper doesn't say this",
      "This expectation doesn't apply to my setting",
      "Not yet",
    ]);

    await act(async () => {
      (
        host.querySelector(
          '[data-testid="expects-decline-d1#0-not-what-it-says"]',
        ) as HTMLButtonElement
      ).click();
    });
    await act(async () => {
      await wait(10);
    });

    const written = await store.readAll(P);
    const kinds = written.map((e: { type: string }) => e.type);
    // Two new events and no edit: a decline is what the researcher said about
    // the paper, not a correction of what the paper expects.
    expect(kinds).toEqual(["paper-fit", "question-selection", "refusal"]);
    expect(baselinesSettled(written, P).declined.get("d1#0")).toBe(
      "You said the paper doesn't state this expectation.",
    );
    expect(text(host, '[data-testid="expects-declined-d1#0"]')).toBe(
      "You said the paper doesn't state this expectation.",
    );
    root.unmount();
  });

  test("adding one stages a draft through the door, and the row then says so", async () => {
    const P = "expects-add";
    await study(P);
    const { host, root, store } = await mount(P, [
      fitEvent(P, [{ id: "d1#0", expectation: EXPECTS, scope: SCOPE, chunkId: "c1" }]),
    ]);
    await act(async () => {
      (host.querySelector('[data-testid="expects-add-d1#0"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      await wait(10);
    });

    const written = await store.readAll(P);
    const proposal = written.find((e: { type: string }) => e.type === "proposal") as {
      pageType: string;
      title: string;
      originOnAccept: string;
      sourceChunks: string[];
      actor: string;
      model?: string;
    };
    expect(proposal.pageType).toBe("theory");
    expect(proposal.title).toBe(EXPECTS);
    expect(proposal.originOnAccept).toBe("literature-derived");
    expect(proposal.sourceChunks).toEqual(["c1"]);
    // The model that composed the sentence, carried from the event that holds it.
    expect(proposal.actor).toBe("persona:reader");
    expect(proposal.model).toBe("m");
    // Nothing joined the model: the tray did.
    expect(written.some((e: { type: string }) => e.type === "ontology-mutation")).toBe(false);

    await act(async () => {
      await wait(10);
    });
    expect(text(host, '[data-testid="expects-added-d1#0"]')).toContain(ADDED_NOTE);
    root.unmount();
  });

  /* M78a, ISC-678: a typed line with no file behind it is Named. An older
     project's expectations for it stay readable under their own label, with no
     controls, and count for nothing in Checks. */
  test("a typed line with no file behind it keeps its old expectations under Written from the citation alone", async () => {
    const P = "expects-typed";
    await study(P, "Zuckerman 2017 on genres and puzzles");
    const typed: LedgerEvent = {
      id: uid(),
      ts: 1,
      actor: "system",
      projectId: P,
      model: "m",
      modelVersion: "v",
      type: "paper-fit",
      paperKey: "zuckerman 2017",
      paperName: "Zuckerman 2017 on genres and puzzles",
      verdict: "fits",
      reason: "It speaks to how a puzzle is framed.",
      framingDigest: "",
      baselines: [
        {
          id: "zuckerman 2017#0",
          expectation: "A puzzle lands only where its audience already holds the expectation.",
          scope: "in fields with a settled canon",
        },
      ],
    } as LedgerEvent;
    const { host, root } = await mount(P, [typed]);
    expect(host.querySelector('[data-testid="expects-citation-line-0"]')).not.toBeNull();
    expect(text(host, '[data-testid="expects-citation-line-0"] .paper-expects-head')).toBe("Written from the citation alone");
    expect(text(host, '[data-testid="expects-citation-line-0"] .paper-expects-claim')).toBe(
      "A puzzle lands only where its audience already holds the expectation.",
    );
    expect(host.querySelector('[data-testid="typed-line-0"] [data-testid^="expects-add-"]')).toBeNull();
    root.unmount();
  });
});
