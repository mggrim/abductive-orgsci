/**
 * M84, ISC-705, question 2 (the lead's ruling of 2026-10-08): the gate is said
 * once, in Design's Help. The note under the greyed Sample and Early data cells
 * and its "still need an answer" list go; the cells stay greyed and inert. A link
 * that lands on a closed step keeps the rule's first sentence only, with no list
 * and no link onward.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
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
const { Workbench } = await import(`${SRC}workbench/Workbench.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const { PAGE_HELP } = await import(`${SRC}ui/pageHelp.ts`);

async function render(station: string) {
  await projects.saveProject({ id: "m84-gate", title: "M84 gate (test project)", stage: "design-brief", createdAt: 1, brief: projects.emptyBrief() } as never);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(React.createElement(LedgerProvider, { store: new InMemoryLedgerStore() }, React.createElement(Workbench, { projectId: "m84-gate", station }))),
  );
  for (let i = 0; i < 20; i += 1) await act(async () => void (await wait(5)));
  return { host, root };
}

describe("the gate, said once in Help (M84, the lead's ruling on question 2)", () => {
  test("the rail's closed cells are greyed and inert, with no visible note, tooltip or list", async () => {
    const { host, root } = await render("context");
    const rail = host.querySelector('[data-testid="station-rail"]') as HTMLElement;
    const closed = [...rail.querySelectorAll("button[aria-disabled='true']")];
    expect(closed.map((b) => b.getAttribute("data-station"))).toEqual(["sample", "early-data"]);
    expect(rail.querySelectorAll(".inert-note:not(.visually-hidden)")).toHaveLength(0);
    for (const b of closed) expect(b.getAttribute("title")).toBeNull();
    expect(rail.textContent).not.toMatch(/still needs? an answer/);
    // A screen reader still hears the rule's first sentence, through the primitive's note.
    const described = closed[0]?.getAttribute("aria-describedby") ?? "";
    expect(host.querySelector(`#${described}`)?.textContent).toBe("Sample opens once you have answered all six steps in the loops.");
    expect(host.querySelector(`#${described}`)?.classList.contains("visually-hidden")).toBe(true);
    root.unmount();
  });

  test("a link that lands on a closed step keeps the rule's first sentence only", async () => {
    const { host, root } = await render("sample");
    expect(host.querySelector('[data-testid="station-closed"]')?.textContent).toBe(
      "Sample opens once you have answered all six steps in the loops.",
    );
    expect(host.querySelector('[data-testid="station-closed-go"]')).toBeNull();
    root.unmount();
  });

  test("Design's Help says the gate", () => {
    const says = [...PAGE_HELP.design.purpose, ...PAGE_HELP.design.parts.flatMap((p: { says: readonly string[] }) => p.says)];
    expect(says.filter((s: string) => /Sample and Early data open/.test(s))).toHaveLength(1);
  });
});
