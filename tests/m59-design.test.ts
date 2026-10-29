/**
 * The Design step as a conversation and its summary (M59).
 *
 * Matthew, 2026-09-27: "get rid of ask about something else. get rid of doesn't
 * apply to this study. remove the papers from the sidebar of the design, since
 * this can jsut be in the material tab. replace the bar on the right with your
 * answer as it stands, which is essentially a summary statement of what has been
 * discussed on the left. Change the title from your answer as it stands to
 * summary for this section."
 */

import "fake-indexeddb/auto";
import { openSummary } from "./openSummary.ts";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, mock, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;
const read = (rel: string): Promise<string> => Bun.file(`${SRC}${rel}`).text();

const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
const { MockInferenceClient } = await import(`${SRC}inference/mock.ts`);
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: new MockInferenceClient(), live: true }),
}));
afterAll(() => {
  void mock.module(`${SRC}ui/personaRun.ts`, () => realPersonaRun);
});

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

const { Dialogue, dialogueOrder } = await import(`${SRC}workbench/Dialogue.tsx`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { projectOntology } = await import(`${SRC}ontology/projection.ts`);
const { projectInterview } = await import(`${SRC}interview/state.ts`);

const P = "m59-design";

const MOVES = [
  {
    id: "station:context@0",
    topic: "station:context",
    mode: "interrogation",
    question: "Which setting did you watch this happen in?",
    rationale: "Nothing is on the record about your setting yet.",
    source: "researcher-agenda",
  },
  {
    id: "station:site@0",
    topic: "station:site",
    mode: "interrogation",
    question: "Where would you go to see the process again?",
    rationale: "The step has no site yet.",
    source: "researcher-agenda",
  },
];

function renderDialogue(moves: readonly unknown[]) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      React.createElement(
        LedgerProvider as never,
        { store: new InMemoryLedgerStore() } as never,
        React.createElement(Dialogue as never, {
          projectId: P,
          graph: projectOntology([], P),
          interview: projectInterview([], P),
          moves,
          events: [],
          chunks: [],
          station: "context",
          question: "What is the setting?",
        } as never),
      ),
    );
  });
  return { host, root };
}

describe("item 1: the conversation offers no menu of other questions (ISC-570)", () => {
  test("with moves ready, the step shows no 'Ask about something else' and no move cards", () => {
    const { host, root } = renderDialogue(MOVES);
    expect(host.textContent ?? "").not.toContain("Ask about something else");
    expect(host.textContent ?? "").not.toContain("Ask something else instead");
    expect(host.textContent ?? "").not.toContain("Pick what the tool asks next");
    expect(host.querySelector("[data-testid='ask-something-else']")).toBeNull();
    expect(host.querySelector("[data-move-id]")).toBeNull();
    // The one chip that asks the tool to steer, named for the act at M62 (ISC-604).
    expect(host.querySelector("[data-testid='give-directions']")?.textContent).toBe(
      "Ask me differently",
    );
    act(() => root.unmount());
  });

  test("no ordering of the column carries the menu's slot", () => {
    for (const live of [true, false]) {
      for (const place of ["none", "here", "elsewhere", "unplaced"] as const) {
        expect(dialogueOrder(live, false, place)).not.toContain("action");
      }
    }
  });

  test("the conversation offers no 'about something else' control", async () => {
    const src = await read("workbench/Dialogue.tsx");
    expect(src).not.toContain("Ask about something else");
    /* M89 (2026-10-14): this test also asserted that the conversation turn hands
     * the moves to the model (`[projectId, moves,`) and that the question
     * brought from Checks finds its move (`moves.find((m) => m.topic ===
     * invited.topic)`). The only path that put an offered question was the
     * invitation from Checks, and it left main with the tab. */
  });
});

describe("item 3: Design carries no papers panel and no companion (ISC-572)", () => {
  test("the companion's module is gone and nothing on Design mounts one", async () => {
    expect(await Bun.file(`${SRC}workbench/DesignCompanion.tsx`).exists()).toBe(false);
    const workbench = await read("workbench/Workbench.tsx");
    for (const gone of ["DesignCompanion", "companion-open", "companion-sheet", "<Sheet", "COMPANION_READ"]) {
      expect(workbench).not.toContain(gone);
    }
  });

  test("no remembered choice: the pane state holds a width and nothing else", async () => {
    const pane = await import(`${SRC}workbench/paneState.ts`);
    // This file's own store: other files leave a stub or a throwing getter here.
    const map = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, String(v)),
        removeItem: (k: string) => void map.delete(k),
        clear: () => map.clear(),
      },
    });
    for (const gone of ["COMPANIONS", "isCompanionId", "storedCompanion", "defaultCompanion"]) {
      expect(Object.keys(pane)).not.toContain(gone);
    }
    expect(pane.DEFAULT_PANE).toEqual({ left: 0.58 });
    // A browser that stored a companion before M59 opens on the width alone.
    globalThis.localStorage?.setItem(
      pane.paneKey(P),
      JSON.stringify({ left: 0.5, companion: "papers" }),
    );
    expect(pane.readPaneState(P)).toEqual({ left: 0.5 });
    pane.writePaneState(P, { left: 0.6 });
    expect(JSON.parse(globalThis.localStorage?.getItem(pane.paneKey(P)) ?? "{}")).toEqual({
      left: 0.6,
    });
  });

  test("the papers still live on Material and in Starting point's third question", async () => {
    // The two places Matthew named. Neither is touched by this change.
    expect(await read("flow/FramingBand.tsx")).toContain('from "../views/paperRows.ts"');
    expect(await read("ui/StudyViews.tsx")).toContain("<SeminalCorpus");
  });
});

const { Workbench } = await import(`${SRC}workbench/Workbench.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const { resetInterviewInFlight } = await import(`${SRC}interview/orchestrator.ts`);

const HEADING = "Summary";
/* The lead's ruling of 2026-09-27: one sentence at every width, no direction. */
/* M62, ISC-600: the summary's lede left the pane for Design's Help panel. */
const LEDE =
  "One statement of the points that this conversation has settled. Abductive saves your words exactly as you wrote them.";
const HELP_TEXT = await Bun.file(new URL("../src/ui/pageHelp.ts", import.meta.url).pathname).text();

function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const k = Object.keys(el).find((key) => key.startsWith("__reactProps$"));
  return k === undefined ? undefined : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[k];
}
const byId = <T extends Element>(host: Element, id: string): T | null =>
  host.querySelector(`[data-testid="${id}"]`) as T | null;
async function settle(times = 20) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
}

async function renderStep(id: string, station: string, wide: boolean) {
  const real = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: wide && query === "(min-width: 1101px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  resetInterviewInFlight();
  await projects.saveProject({
    id,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: projects.emptyBrief(),
  } as never);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const store = new InMemoryLedgerStore();
  await act(async () => {
    root.render(
      React.createElement(
        LedgerProvider as never,
        { store } as never,
        React.createElement(Workbench as never, { projectId: id, station } as never),
      ),
    );
  });
  await settle();
  return {
    host,
    store,
    done: () => {
      act(() => root.unmount());
      host.remove();
      window.matchMedia = real;
    },
  };
}

describe("item 4: the summary on the right (ISC-573)", () => {
  test("above 1100, the thread is on the left and the summary is the right pane", async () => {
    const { host, done } = await renderStep("m59-wide", "context", true);
    const body = host.querySelector(".workbench-body");
    expect(body?.getAttribute("data-panes")).toBe("two");
    const kids = [...(body?.children ?? [])].map((el) => el.getAttribute("data-testid"));
    expect(kids).toEqual(["station-pane", "pane-separator", "summary-pane"]);
    const left = byId(host, "station-pane");
    const right = byId(host, "summary-pane");
    // The thread and its composer on the left, and no answer box there.
    expect(left?.querySelector("[data-testid='transcript']")).not.toBeNull();
    expect(left?.querySelector("[data-testid='answer-input']")).not.toBeNull();
    expect(left?.querySelector("[data-testid='station-input']")).toBeNull();
    // The step's answer editor on the right, under the new heading.
    expect(right?.querySelector("[data-testid='summary-head']")?.textContent).toBe(HEADING);
    // M92, ISC-748: one sentence under the heading again, by the lead's ruling of 2026-10-15.
    expect(right?.querySelector("[data-testid='summary-lede']")).not.toBeNull();
    expect(HELP_TEXT).toContain(LEDE);
    // M92, ISC-752: the summary reads as text until Edit summary opens the box.
    expect(right?.querySelector("[data-testid='station-input']")).toBeNull();
    expect(right?.querySelector("[data-testid='station-text']")).not.toBeNull();
    // M92 polish: Save answer shows under an open or unsaved summary only.
    expect(right?.querySelector("[data-testid='save-station']")).toBeNull();
    expect(right?.querySelector("[data-testid='draft-from-conversation']")).toBeNull();
    expect(right?.querySelector("[data-testid='station-summary-generate']")?.textContent).toBe(
      "Auto-generate summary from chat",
    );
    expect(right?.querySelector("[data-testid='station-summary-edit']")?.textContent).toBe("Edit summary");
    expect(right?.querySelector("[data-testid='station-status']")?.textContent).toBe("Not started");
    expect(host.textContent ?? "").not.toContain("Your answer, as it stands");
    done();
  });

  test("at 1100 and below, the summary sits under the thread, headed the same", async () => {
    const { host, done } = await renderStep("m59-narrow", "site", false);
    expect(host.querySelector(".workbench-body")?.getAttribute("data-panes")).toBeNull();
    expect(byId(host, "summary-pane")).toBeNull();
    const html = byId(host, "station-pane")?.innerHTML ?? "";
    const at = (id: string) => html.indexOf(`data-testid="${id}"`);
    expect(at("transcript")).toBeGreaterThan(-1);
    expect(at("answer-input")).toBeGreaterThan(at("transcript"));
    expect(at("station-summary")).toBeGreaterThan(at("answer-input"));
    expect(byId(host, "summary-head")?.textContent).toBe(HEADING);
    expect(byId(host, "summary-lede")).not.toBeNull();
    done();
  });

  test("a saved summary is the step's saved answer, on the record as before", async () => {
    const { host, store, done } = await renderStep("m59-save", "context", true);
    await openSummary(host, "station-summary");
    const box = byId<HTMLTextAreaElement>(host, "station-input") as HTMLTextAreaElement;
    await act(async () => {
      box.value = "One ward, nights, where handovers drift.";
      reactProps(box)?.onChange?.({ target: box });
    });
    await act(async () => reactProps(byId(host, "save-station") as Element)?.onClick?.({}));
    await settle();
    const bound = (await store.readAll()).filter(
      (e: { type: string; subject?: string; projectId: string }) =>
        e.type === "bound" && e.subject === "context" && e.projectId === "m59-save",
    );
    expect(bound).toHaveLength(1);
    expect((await projects.getProject("m59-save"))?.brief.context).toBe(
      "One ward, nights, where handovers drift.",
    );
    // The saved mark: the chip says the box matches the record once the study
    // re-reads, and the thread marks where the answer was saved (M58).
    expect(byId(host, "station-status")?.textContent).toBe("Saved");
    expect(byId(host, "chat-saved")?.textContent).toBe("Answer saved");
    done();
  });

  test("the old heading is gone everywhere, and the hint is not said twice", async () => {
    const proc = Bun.spawnSync(["grep", "-rn", "Your answer, as it stands", `${SRC}`, `${SRC}../index.html`]);
    expect(proc.stdout.toString()).toBe("");
    const workspace = await read("flow/StationWorkspace.tsx");
    expect(workspace).not.toContain('data-testid="station-hint"');
  });
});

const { declineStationEvent, declinedStations, stationStates } = await import(`${SRC}flow/stationBrief.ts`);
const { gatedStations, LOOP_STATIONS } = await import(`${SRC}flow/loopGate.ts`);
const { validateEvent } = await import(`${SRC}ledger/events.ts`);

/* M69, ISC-641 supersedes ISC-571's set-aside: Matthew, 2026-10-02, "Can't we
 * just get rid of the 'set aside' command and option? ... They can just move
 * on." The step offers neither control now, the gate reads saved answers only,
 * and older declinations still validate, stay on the record and render in
 * History (tests/m69-controls.test.ts). */
describe("item 2: no step offers 'doesn't apply' or a set-aside (ISC-571, ISC-641)", () => {
  test("the summary offers neither 'Set step aside' nor 'doesn't apply'", async () => {
    const { host, done } = await renderStep("m59-aside-offer", "site", true);
    expect(host.textContent ?? "").not.toContain("Doesn't apply to this study");
    expect(host.textContent ?? "").not.toContain("Set step aside");
    expect(byId(host, "station-decisions")).toBeNull();
    expect(byId(host, "set-aside-station")).toBeNull();
    expect(byId(host, "station-summary-edit")).not.toBeNull();
    done();
  });

  test("six older set-asides leave the gate closed, and the rail draws no set-aside state", () => {
    const aside = (ids: readonly string[]) =>
      declinedStations(ids.map((id) => declineStationEvent("p", id as never, "not-yet", "")));
    expect([...gatedStations(projects.emptyBrief(), aside(LOOP_STATIONS))].sort()).toEqual(["early-data", "sample"]);
    const states = stationStates(projects.emptyBrief(), 0, new Set());
    for (const id of LOOP_STATIONS) expect(states.get(id)).toBe("empty");
  });

  test("older not-applicable events still validate and are read", () => {
    const old = declineStationEvent("p", "outcome", "not-applicable", "Interpretivist study.");
    expect(validateEvent(old)).toEqual([]);
    expect(declinedStations([old]).get("outcome")).toBe("not-applicable");
  });

  test("an older not-applicable stays on the record and puts no note on the step", async () => {
    const id = "m59-old-na";
    const { host, store, done } = await renderStep(id, "outcome", true);
    await act(async () => {
      await store.append(declineStationEvent(id, "outcome", "not-applicable", ""));
    });
    done();
    const again = document.createElement("div");
    document.body.appendChild(again);
    const root = createRoot(again);
    await act(async () => {
      root.render(
        React.createElement(
          LedgerProvider as never,
          { store } as never,
          React.createElement(Workbench as never, { projectId: id, station: "outcome" } as never),
        ),
      );
    });
    await settle();
    expect(byId(again, "station-declined")).toBeNull();
    expect((await store.readAll()).some((e: { subject?: string }) => e.subject === "outcome:not-applicable")).toBe(true);
    act(() => root.unmount());
    again.remove();
  });
});
