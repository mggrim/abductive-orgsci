/**
 * What moved while you were away (M38, ISC-498).
 *
 * The projection is pure and the timestamp is not: the counts come from the
 * ledger, the "since" comes from this browser's own localStorage. Both halves
 * are pinned here, because the second one is where a first visit and a visit
 * with nothing new have to stay different from each other.
 */

import { useDom } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type {
  BoundEvent,
  LedgerEvent,
  PaperFitEvent,
  ProposalAdjudicationEvent,
  QuestionSelectionEvent,
  ResponseEvent,
} from "../src/ledger/events.ts";
import { envelope } from "./helpers.ts";
import {
  FIRST_VISIT,
  lastSeenKey,
  readLastSeen,
  sinceLastVisit,
  writeLastSeen,
} from "../src/views/sinceLastVisit.ts";
import { SinceLastHere } from "../src/flow/SinceLastHere.tsx";

const PROJECT = "proj-test";

function saved(subject: string, draftedFrom?: string): BoundEvent {
  return {
    ...envelope("human"),
    type: "bound",
    subject,
    statement: "what they wrote",
    ...(draftedFrom === undefined ? {} : { draftedFrom }),
  };
}

function adjudicated(disposition: "accept" | "reject" | "merge" | "defer"): ProposalAdjudicationEvent {
  return {
    ...envelope("human"),
    type: "proposal-adjudication",
    proposalId: crypto.randomUUID(),
    disposition,
  };
}

function judged(
  verdict: "fits" | "unclear" | "misfit",
  paperKey = "smith-2020",
): PaperFitEvent {
  return {
    ...envelope("persona:judge"),
    type: "paper-fit",
    paperKey,
    paperName: paperKey,
    verdict,
    reason: "it speaks to the same setting",
    framingDigest: "abc",
  } as PaperFitEvent;
}

function asked(station: string): QuestionSelectionEvent {
  return {
    ...envelope("system"),
    type: "question-selection",
    moveId: `conversation:${station}@1`,
    topic: `station:${station}`,
    question: "What did you see?",
    alternatives: [],
    mode: "interrogation",
    reason: "asked here",
    station,
  };
}

function replied(q: QuestionSelectionEvent): ResponseEvent {
  return { ...envelope("human"), type: "response", text: "I saw a queue.", inReplyTo: q.id };
}

describe("sinceLastVisit counts what moved after a moment", () => {
  test("nothing before the moment is counted, everything after it is", () => {
    const before = saved("site");
    const q = asked("context");
    const after = saved("context", "turn-1");
    const cut = after.ts - 1;
    const view = sinceLastVisit({ events: [before, q, after], projectId: PROJECT, since: cut });
    expect(view.kind).toBe("since");
    expect(view.answersSaved.count).toBe(1);
    expect(view.answersSaved.ids).toEqual([after.id]);
    expect(view.questionsAsked.count).toBe(0);
    expect(view.total).toBe(1);
  });

  test("every row the panel draws has a count and the ids behind it", () => {
    const q = asked("site");
    const a = replied(q);
    const events: LedgerEvent[] = [
      saved("site"),
      saved("context", "turn-9"),
      adjudicated("accept"),
      adjudicated("merge"),
      adjudicated("reject"),
      adjudicated("defer"),
      judged("fits"),
      q,
      a,
    ];
    const view = sinceLastVisit({ events, projectId: PROJECT, since: 0 });
    expect(view.answersSaved.count).toBe(2);
    expect(view.draftsAccepted.count).toBe(2);
    expect(view.draftsDeclined.count).toBe(1);
    expect(view.paperVerdicts.count).toBe(1);
    expect(view.questionsAsked.count).toBe(1);
    expect(view.questionsAnswered.count).toBe(1);
    // M89: the two flag rows went, so eight rows add up.
    expect(view.total).toBe(8);
    // A deferred draft is neither accepted nor declined, and is not counted as
    // either. It is still in the ledger; nothing here says it is not.
    expect(view.draftsAccepted.ids).toHaveLength(2);
  });

  /**
   * The two counts the walk of 2026-09-13 read as false (D16, M43b).
   *
   * The strip said "Papers judged 30" over a study holding six papers (and
   * "Flags you settled 2" to a researcher who had settled none; that row went
   * with the checks at M89). One ledger holding five re-judgements of one paper,
   * which is the shape the walk left behind, and the row now says what happened.
   */
  test("a paper re-judged five times is one paper judged", () => {
    const events: LedgerEvent[] = [
      judged("fits"),
      judged("misfit"),
      judged("fits"),
      judged("unclear"),
      judged("fits"),
      judged("misfit", "jones-2019"),
    ];
    const view = sinceLastVisit({ events, projectId: PROJECT, since: 0 });
    expect(view.paperVerdicts.count).toBe(2);
    /* The ids still point at real events, one per paper, so the row can say how
     * it was reached. The last verdict written for a paper is the one that
     * stands, which is how every other reader of `paper-fit` reads it. */
    expect(view.paperVerdicts.ids).toHaveLength(2);
    const lastForSmith = events.filter(
      (e) => e.type === "paper-fit" && e.paperKey === "smith-2020",
    );
    expect(view.paperVerdicts.ids).toContain(
      (lastForSmith[lastForSmith.length - 1] as PaperFitEvent).id,
    );
    expect(view.total).toBe(2);
  });

  test("another study's events never reach the panel", () => {
    const mine = saved("site");
    const theirs = { ...saved("site"), projectId: "other" };
    const view = sinceLastVisit({ events: [mine, theirs], projectId: PROJECT, since: 0 });
    expect(view.answersSaved.ids).toEqual([mine.id]);
  });

  test("the latest place a question was asked at is the one the row links to", () => {
    const first = asked("context");
    const second = asked("site");
    const view = sinceLastVisit({ events: [first, second], projectId: PROJECT, since: 0 });
    expect(view.lastQuestionPlace).toBe("site");
    expect(sinceLastVisit({ events: [], projectId: PROJECT, since: 0 }).lastQuestionPlace).toBeNull();
  });

  test("the latest step an answer was saved at is the one the answers row links to", () => {
    const view = sinceLastVisit({
      events: [saved("context"), saved("bind"), saved("starting-interest")],
      projectId: PROJECT,
      since: 0,
    });
    /* `starting-interest` is the framing's subject, not a step id. It was one of
     * two until M40, when the puzzle stopped writing a `research-question` row:
     * nothing files that subject any more, so the framing owns one. */
    expect(view.lastAnswerPlace).toBe("framing");
  });

  test("no timestamp means a first visit, and no counts are claimed", () => {
    const view = sinceLastVisit({ events: [saved("site")], projectId: PROJECT, since: null });
    expect(view.kind).toBe(FIRST_VISIT);
    expect(view.total).toBe(0);
  });
});

describe("the timestamp is this browser's, and a broken store is a first visit", () => {
  /**
   * Its own store, injected, rather than the one the DOM registers.
   *
   * `tests/auth.test.ts` deletes `globalThis.localStorage` in an `afterEach`,
   * and every test file shares one process, so a suite that leans on the DOM's
   * own store passes alone and fails in the run. A stub put up per test and
   * taken down after it is the only version of this that is order-independent.
   */
  const map = new Map<string, string>();
  let real: PropertyDescriptor | undefined;

  beforeEach(() => {
    map.clear();
    real = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
      },
    });
  });

  afterEach(() => {
    if (real === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else Object.defineProperty(globalThis, "localStorage", real);
  });

  test("the key names the study", () => {
    expect(lastSeenKey("abc")).toBe("abductive:lastSeen:abc");
  });

  test("a written moment reads back, and an unwritten one is null", () => {
    expect(readLastSeen("never-opened")).toBeNull();
    writeLastSeen("opened", 1_700_000_000_000);
    expect(readLastSeen("opened")).toBe(1_700_000_000_000);
  });

  test("a value that is not a number reads as never having been here", () => {
    map.set(lastSeenKey("junk"), "yesterday");
    expect(readLastSeen("junk")).toBeNull();
  });

  test("a store that throws is a first visit rather than a crash", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    expect(readLastSeen("anything")).toBeNull();
    expect(() => writeLastSeen("anything", 1)).not.toThrow();
  });

  test("no store at all is a first visit too", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(readLastSeen("anything")).toBeNull();
    expect(() => writeLastSeen("anything", 1)).not.toThrow();
  });
});

describe("the panel says which of the three states the study is in", () => {
  const map = new Map<string, string>();
  let real: PropertyDescriptor | undefined;

  beforeEach(() => {
    map.clear();
    real = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
      },
    });
  });
  afterEach(() => {
    if (real === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else Object.defineProperty(globalThis, "localStorage", real);
  });

  function render(events: readonly LedgerEvent[]) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(React.createElement(SinceLastHere, { projectId: PROJECT, events }));
    });
    return { host, root };
  }
  const at = (host: Element, id: string) =>
    host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  test("a browser that has never opened the study says so, and claims nothing", () => {
    const { host, root } = render([saved("site")]);
    expect(at(host, "since-last-first")?.textContent).toBe(
      "Your first visit to this project.",
    );
    // No fold, no counts, nothing that reads as a digest of a visit that did
    // not happen.
    expect(at(host, "since-last-fold")).toBeNull();
    root.unmount();
  });

  test("a return visit with something new lists it, open, with a link each", () => {
    const older = saved("site");
    writeLastSeen(PROJECT, older.ts);
    const q = asked("context");
    const { host, root } = render([older, q, replied(q), saved("context", "turn-1")]);

    const fold = at(host, "since-last-fold") as HTMLDetailsElement;
    expect(fold).not.toBeNull();
    expect(fold.hasAttribute("open")).toBe(true);
    // One row per thing that moved, and nothing for the things that did not.
    // M84, ISC-705: the questions asked and answered are counts a co-author
    // read as a distraction, so those two rows went; History keeps both.
    expect(at(host, "since-questions")).toBeNull();
    expect(at(host, "since-answered")).toBeNull();
    expect(at(host, "since-answers")?.textContent).toBe("Answers saved");
    expect(at(host, "since-papers")).toBeNull();
    // Each one goes to the surface that holds it.
    expect(at(host, "since-answers")?.getAttribute("href")).toBe(
      `#/study/${PROJECT}/design/context`,
    );
    root.unmount();
  });

  test("a return visit with nothing new is collapsed and says the study stood still", () => {
    const older = saved("site");
    writeLastSeen(PROJECT, older.ts + 1000);
    const { host, root } = render([older]);
    const fold = at(host, "since-last-fold") as HTMLDetailsElement;
    expect(fold.hasAttribute("open")).toBe(false);
    expect(at(host, "since-last-nothing")?.textContent).toBe(
      "Your project is as you left it at your last visit.",
    );
    root.unmount();
  });

  test("leaving writes the moment, so the next visit measures from now", () => {
    writeLastSeen(PROJECT, 1);
    const { root } = render([saved("site")]);
    act(() => {
      root.unmount();
    });
    expect(readLastSeen(PROJECT)).toBeGreaterThan(1);
  });
});
