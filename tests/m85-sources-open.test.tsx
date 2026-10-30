/**
 * M85, ISC-712: Sources is open from the project's first moment.
 *
 * A co-author (2026-10-13): "Under 'Starting point' I am not able to upload any
 * papers. When I click on upload papers then I am taken to the 'sources' page,
 * but there I am not really able to upload anything."
 *
 * The cause was the tab gate (views/earnedTabs.ts): Sources waited for a saved
 * answer at Context or the Puzzle, and both Upload papers links landed on the
 * closed tab. The lead's ruling (2026-10-14): the gate for Sources goes. A paper
 * added before a setting exists waits with PaperExpectations' existing note, and
 * the other gated tabs stay as they are (two since M89, when Checks was tabled).
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;

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
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { AppShell } = await import(`${SRC}ui/AppShell.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const gate = await import(`${SRC}views/earnedTabs.ts`);
const { NOT_JUDGED_NOTE } = await import(`${SRC}flow/PaperExpectations.tsx`);
const { framingPapersHref } = await import(`${SRC}flow/FramingBand.tsx`);
const { papersPath } = await import(`${SRC}ui/routes.ts`);

async function freshProject(id: string): Promise<void> {
  await projects.saveProject({
    id,
    title: "M85 Sources (test project)",
    stage: "design-brief",
    createdAt: 1,
    brief: projects.emptyBrief(),
  } as never);
}

async function mount(hash: string) {
  window.location.hash = hash;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(React.createElement(LedgerProvider, { store: new InMemoryLedgerStore() }, React.createElement(AppShell))),
  );
  for (let i = 0; i < 15; i += 1) await act(async () => void (await wait(5)));
  return { host, root };
}

describe("ISC-712: the gate for Sources goes", () => {
  test("Sources is neither gated nor closed on an empty record", () => {
    expect([...gate.GATED_TABS]).toEqual(["ontology", "exports"]);
    expect(Object.keys(gate.TAB_UNLOCK)).not.toContain("material");
    expect(gate.closedTabs([], "p").has("material")).toBe(false);
    // The other two stay greyed on a fresh project (M89: Checks was tabled).
    expect([...gate.closedTabs([], "p")].sort()).toEqual(["exports", "ontology"]);
  });

  test("the greyed sentence for Sources is gone from the code", () => {
    const code = readFileSync(`${SRC}views/earnedTabs.ts`, "utf8");
    expect(code).not.toContain("Sources opens once");
    expect(readFileSync(`${SRC}flow/SuggestFromData.tsx`, "utf8")).not.toContain("TAB_UNLOCK.material");
  });

  test("a paper added before a setting exists waits with the existing note, and Help says so", async () => {
    expect(NOT_JUDGED_NOTE).toBe("Answer the Context or Puzzle step on Design so Abductive can judge this paper.");
    const { PAGE_HELP } = await import(`${SRC}ui/pageHelp.ts`);
    const papers = PAGE_HELP.material.parts.find((p: { name: string }) => p.name === "Papers");
    expect(papers?.says).toContain(
      "You can add papers from the first moment of a project. Abductive judges each paper once you've saved an answer at Context or the Puzzle, and shows a note beside the paper until then.",
    );
  });
});

describe("ISC-712: on a fresh project, Upload papers lands on an open Sources", () => {
  test("the Sources tab is not greyed, and its page shows the upload control", async () => {
    await freshProject("m85-sources");
    const { host, root } = await mount("#/study/m85-sources/material");
    const tab = host.querySelector<HTMLElement>('[data-testid="studytab-material"]');
    expect(tab?.dataset.closed).toBeUndefined();
    expect(tab?.getAttribute("href")).toBe("#/study/m85-sources/material");
    expect(host.querySelector('[data-testid="closed-tab"]')).toBeNull();
    expect(host.querySelector('[data-testid="literature-upload"]')).not.toBeNull();
    root.unmount();
  });

  test("Starting point's Upload papers link lands on the open Sources with the control", async () => {
    await freshProject("m85-sp");
    const sp = await mount("#/study/m85-sp/motivation");
    const link = sp.host.querySelector<HTMLAnchorElement>('[data-testid="framing-papers-link"]');
    expect(link?.textContent).toBe("Upload papers");
    const href = link?.getAttribute("href") ?? "";
    expect(href).toBe(framingPapersHref("m85-sp"));
    sp.root.unmount();

    const there = await mount(href);
    expect(there.host.querySelector('[data-testid="closed-tab"]')).toBeNull();
    expect(there.host.querySelector('[data-testid="literature-upload"]')).not.toBeNull();
    there.root.unmount();
  });

  test("the front page's Upload papers goes to the same place", () => {
    expect(papersPath("m85-sp")).toBe(framingPapersHref("m85-sp"));
  });
});
