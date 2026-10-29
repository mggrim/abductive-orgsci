/**
 * M53, ISC-545, rendered: the palette searches the study it is opened in, and
 * choosing a result moves the route and nothing else.
 */
import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { CommandPalette } from "../src/ui/keyboard/CommandPalette.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { emptyBrief, saveProject } from "../src/state/projects.ts";

const ID = "m53-search-render";

function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined ? undefined : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}

describe("the palette searches the study (ISC-545)", () => {
  test("typing finds a saved answer, and Enter goes to it without writing anything", async () => {
    await saveProject({
      id: ID,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: { ...emptyBrief(), context: "Handover at the nurses' station at seven." },
    } as never);
    const store = new InMemoryLedgerStore();
    const before = (await store.readAll?.(ID))?.length ?? 0;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    window.location.hash = `#/study/${ID}/ontology`;
    await act(async () => {
      root.render(
        React.createElement(LedgerProvider, {
          store,
          children: React.createElement(CommandPalette, {
            open: true,
            scope: "study",
            projectId: ID,
            onClose: () => {},
            onGo: () => {},
          }),
        }),
      );
    });
    for (let i = 0; i < 20; i += 1) await act(async () => await wait(5));

    const input = host.querySelector<HTMLInputElement>('[data-testid="palette-input"]');
    expect(input?.getAttribute("placeholder")).toBe("Search project");
    await act(async () => {
      if (input === null) return;
      input.value = "nurses station";
      reactProps(input)?.onChange?.({ target: input });
    });
    const first = host.querySelector('[data-testid="palette-row"]');
    expect(first?.getAttribute("data-kind")).toBe("answer");
    expect(first?.textContent ?? "").toContain("Context");

    await act(async () => {
      const body = host.querySelector(".kbd-palette-body");
      if (body === null) return;
      reactProps(body)?.onKeyDown?.({ key: "Enter", preventDefault: () => {} });
    });
    expect(window.location.hash).toBe(`#/study/${ID}/design/context`);
    const after = (await store.readAll?.(ID))?.length ?? 0;
    expect(after).toBe(before);
    root.unmount();
    host.remove();
  });
});
