/**
 * The framing band, rendered, on the real store (walk repro).
 *
 * The lead's sequence, twice reported and twice lost in Chrome: type the venue,
 * click into the papers box, append a line, press Tab, wait for the paper
 * judgement, reload. Both fields came back empty.
 *
 * This drives the real component, inside the real shell, over a real IndexedDB and
 * the real ledger provider, in React StrictMode, with a paper judgement slow enough
 * that the second blur lands inside it. It passes. That is the point of keeping it:
 * the band's save loop is not what loses those fields, so a future round does not
 * start by rewriting it again. What lost them was every other writer of the brief
 * holding a whole copy of the project from whenever it last loaded one; see
 * `tests/brief-writers.test.ts`.
 *
 * Inside the shell rather than inside the Workbench since M41, because that is where
 * the band is mounted now: it is the app's footer dock, the second row of `.shell`'s
 * grid, and a Workbench mount would render no band at all. The sequence, the
 * textareas, the reload halves and the judge's delay are untouched — what changed is
 * one level of the tree above them, and the point of the test is that the save loop
 * does not care.
 *
 * The one thing not exercised here is the browser's own event dispatch. React's
 * change tracking does not fire under this DOM, so the handlers React attached
 * to the textareas are called directly. Everything after that is the component:
 * its state, its effects, its save loop, its writes.
 */

import "fake-indexeddb/auto";
import { openSummary } from "./openSummary.ts";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;

/* The judgement is the only thing here that would call a model. Slow on
 * purpose: the walk's second blur happened while the first save's judgement was
 * still in the air, which is the window the old in-flight guard threw saves
 * away in.
 *
 * The real module first, and put back afterwards (M35). `mock.module` is
 * process-wide and every test file shares the process, so a replacement object
 * holding two of the module's exports made the other four vanish for the whole
 * run. This file could not run on its own at all, because `FramingBand` imports
 * `useJudgeOnMount` and the replacement did not have one; and every file
 * ordered after this one got the stub judge, so a test asserting that the judge
 * reaches a model passed alone and reported nothing in the suite. Spreading the
 * real namespace keeps the other exports, and re-mocking with it in `afterAll`
 * hands the real judge back to whoever runs next. */
let judgeDelay = 0;
const realPaperFit = { ...(await import(`${SRC}flow/usePaperFit.ts`)) };
await mock.module(`${SRC}flow/usePaperFit.ts`, () => ({
  ...realPaperFit,
  usePaperFit: () => async () => {
    await wait(judgeDelay);
    return 1;
  },
  openedCounts: () => new Map(),
}));
afterAll(() => {
  void mock.module(`${SRC}flow/usePaperFit.ts`, () => realPaperFit);
});

const { AppShell } = await import(`${SRC}ui/AppShell.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const routes = await import(`${SRC}ui/routes.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);

/** The props React attached to a node, so its handler can be driven. */
function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined
    ? undefined
    : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
function type(el: HTMLTextAreaElement, value: string) {
  el.value = value;
  reactProps(el)?.onChange?.({ target: el });
}
function blur(el: HTMLTextAreaElement) {
  reactProps(el)?.onBlur?.({ target: el });
}
/** Save answer under one field (M78b). */
function save(host: Element, field: string) {
  const button = host.querySelector(`[data-testid="framing-save-${field}"]`);
  if (button !== null) reactProps(button)?.onClick?.({});
}

describe("the walk sequence, on the rendered band", () => {
  test("the venue and an appended papers line both survive a reload", async () => {
    const id = "walk-study";
    await projects.saveProject({
      id,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: {
        ...projects.emptyBrief(),
        startingInterest: "night shifts",
        researchQuestion: "expected a point, found a drift",
        seminalCorpus: "Bechky 2006\nBarley 1986\nOrlikowski 2002",
      },
    } as never);
    judgeDelay = 300;

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    /* The shell routes on the hash, so the study's theoretical motivation tab is
     * where the walk starts (M53, ISC-540). Set before the render, because the shell
     * reads it on the first one. */
    window.location.hash = routes.studyPath(id, "motivation");
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(LedgerProvider, null, React.createElement(AppShell)),
        ),
      );
    });
    for (let i = 0; i < 20; i += 1) {
      await act(async () => {
        await wait(5);
      });
      if (host.querySelector('[data-testid="framing-journal-edit"]') !== null) break;
    }
    // M92, ISC-752: each summary reads as text until Edit summary opens it.
    await openSummary(host, "framing-journal");
    await openSummary(host, "framing-literatures");
    const venue = host.querySelector('[data-testid="framing-venue"]') as HTMLTextAreaElement;
    const papers = host.querySelector(
      '[data-testid="framing-seminal-corpus"]',
    ) as HTMLTextAreaElement;
    expect(venue).not.toBeNull();

    // Type the venue, then click into the papers box, which blurs it.
    await act(async () => {
      type(venue, "A US management journal, ASQ or AMJ.");
    });
    // M78b, ISC-681: a field saves on its Save answer, so the walk's blur is a press now.
    await act(async () => {
      blur(venue);
      save(host, "targetVenue");
      await wait(20);
    });
    // Append a line to the papers, then Tab out, while the judgement runs.
    await act(async () => {
      type(papers, `${papers.value}\nGrodal and Schildt 2026`);
    });
    await act(async () => {
      blur(papers);
      save(host, "seminalCorpus");
      await wait(20);
    });
    // The thirty-second wait, scaled.
    await act(async () => {
      await wait(700);
    });

    const stored = await projects.getProject(id);
    expect({
      venue: stored?.brief.targetVenue,
      papers: stored?.brief.seminalCorpus,
      // And the fields the band does not own are untouched.
      site: stored?.brief.siteRationale,
    }).toEqual({
      venue: "A US management journal, ASQ or AMJ.",
      papers: "Bechky 2006\nBarley 1986\nOrlikowski 2002\nGrodal and Schildt 2026",
      site: "",
    });
    root.unmount();
  });
});
