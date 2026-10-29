/**
 * M78b, ISC-681: Starting point saves on Save answer (the serendipity walk,
 * finding 2). An edited summary saved when the field lost focus, and the chat
 * said "Answer saved"; a researcher who edited the last field and went to
 * another tab couldn't tell whether the edit stayed. Now leaving the field keeps
 * the edit as a draft, the tab strip shows a dot on Starting point until it is
 * saved, and Save answer writes it, with the step's chip.
 */
import "fake-indexeddb/auto";
import { openSummary } from "./openSummary.ts";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const realPaperFit = { ...(await import(`${SRC}flow/usePaperFit.ts`)) };
await mock.module(`${SRC}flow/usePaperFit.ts`, () => ({
  ...realPaperFit,
  usePaperFit: () => async () => 0,
  openedCounts: () => new Map(),
}));
afterAll(() => {
  void mock.module(`${SRC}flow/usePaperFit.ts`, () => realPaperFit);
});

const { AppShell } = await import(`${SRC}ui/AppShell.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const routes = await import(`${SRC}ui/routes.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { hasUnsaved } = await import(`${SRC}flow/unsavedEdits.ts`);

function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined ? undefined : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
const find = (host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`);
async function settle(times = 30) {
  for (let i = 0; i < times; i += 1) await act(async () => void (await wait(5)));
}

describe("Starting point saves on Save answer (ISC-681)", () => {
  test("leaving the field keeps the edit unsaved, with the dot; Save answer writes it", async () => {
    const id = "m78b-starting-point";
    const venue0 = "Organization Science";
    await projects.saveProject({
      id,
      title: "tool crib",
      stage: "design-brief",
      createdAt: 1,
      brief: { ...projects.emptyBrief(), startingInterest: "Serendipity at the tool crib.", targetVenue: venue0 },
    } as never);
    const store = new InMemoryLedgerStore();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    window.location.hash = routes.studyPath(id, "motivation");
    const mount = async () => {
      await act(async () => {
        root.render(React.createElement(StrictMode, null, React.createElement(LedgerProvider, { store }, React.createElement(AppShell))));
      });
      await settle();
    };
    await mount();
    await openSummary(host, "framing-journal");
    const venue = find(host, "framing-venue") as HTMLTextAreaElement;
    expect(find(host, "framing-saved-targetVenue")?.textContent).toBe("Saved");
    expect(find(host, "studytab-motivation")?.getAttribute("data-unsaved")).toBeNull();

    const edit = "Organization Science first, and AMJ second.";
    await act(async () => {
      venue.value = edit;
      reactProps(venue)?.onChange?.({ target: venue });
    });
    await act(async () => {
      reactProps(venue)?.onBlur?.({ target: venue });
      await wait(20);
    });
    await settle();
    // Nothing written on leaving the field.
    expect((await projects.getProject(id))?.brief.targetVenue).toBe(venue0);
    expect((await store.readAll(id)).filter((e: LedgerEvent) => e.type === "bound")).toEqual([]);
    expect(find(host, "framing-save-targetVenue")?.textContent).toBe("Save answer");
    expect(hasUnsaved(id)).toBe(true);
    expect(find(host, "studytab-motivation")?.getAttribute("data-unsaved")).toBe("true");
    expect(find(host, "studytab-unsaved-dot")?.getAttribute("aria-label")).toBe("Unsaved edit");

    // Another tab and back: the edit is still a draft in the field.
    await act(async () => {
      window.location.hash = routes.studyPath(id, "design");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();
    await act(async () => {
      window.location.hash = routes.studyPath(id, "motivation");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();
    // M92: back on the tab the summary reads as text, the unsaved edit in it.
    expect(find(host, "framing-venue-text")?.textContent).toBe(edit);

    await act(async () => reactProps(find(host, "framing-save-targetVenue") as Element)?.onClick?.({}));
    await settle();
    expect((await projects.getProject(id))?.brief.targetVenue).toBe(edit);
    const bound = (await store.readAll(id)).filter((e: LedgerEvent) => e.type === "bound");
    expect(bound.map((e: LedgerEvent) => (e as { statement: string }).statement)).toEqual([edit]);
    expect(find(host, "framing-saved-targetVenue")?.textContent).toBe("Saved");
    expect(hasUnsaved(id)).toBe(false);
    expect(find(host, "studytab-motivation")?.getAttribute("data-unsaved")).toBeNull();
    root.unmount();
    host.remove();
  });

  test("the note that Abductive wrote the summary goes once the field is saved", async () => {
    const id = "m78b-drafted-note";
    await projects.saveProject({ id, title: "tool crib", stage: "design-brief", createdAt: 1, brief: projects.emptyBrief() } as never);
    const store = new InMemoryLedgerStore();
    const turn = crypto.randomUUID();
    await store.append({
      id: turn,
      ts: 1,
      actor: "human",
      projectId: id,
      type: "response",
      text: "Organization Science is my first choice, and AMJ is my second.",
      station: "framing",
    } as LedgerEvent);
    await store.append({
      id: crypto.randomUUID(),
      ts: 2,
      actor: "persona:interviewer",
      projectId: id,
      model: "m",
      modelVersion: "m",
      type: "brief-draft",
      station: "framing",
      field: "targetVenue",
      text: "Organization Science is my first choice, and AMJ is my second.",
      fromTurnIds: [turn],
    } as LedgerEvent);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    window.location.hash = routes.studyPath(id, "motivation");
    await act(async () => {
      root.render(React.createElement(StrictMode, null, React.createElement(LedgerProvider, { store }, React.createElement(AppShell))));
    });
    await settle();
    expect(find(host, "framing-drafted-targetVenue")?.textContent).toBe("Abductive wrote this from your replies. Save answer makes the summary yours.");
    await act(async () => reactProps(find(host, "framing-save-targetVenue") as Element)?.onClick?.({}));
    await settle();
    expect((await projects.getProject(id))?.brief.targetVenue).toBe("Organization Science is my first choice, and AMJ is my second.");
    const bound = (await store.readAll(id)).filter((e: LedgerEvent) => e.type === "bound") as { draftedFrom?: string }[];
    expect(bound.length).toBe(1);
    expect(bound[0]?.draftedFrom).toBeDefined();
    expect(find(host, "framing-drafted-targetVenue")).toBeNull();
    expect(find(host, "framing-saved-targetVenue")?.textContent).toBe("Saved");
    root.unmount();
    host.remove();
  });
});
