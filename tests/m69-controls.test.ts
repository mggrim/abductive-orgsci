/**
 * M69 (Matthew, 2026-10-02): the tab hint, no set-aside, no "Not now".
 *
 *   ISC-640  No study tab carries a native tooltip. The sentence for the tab
 *            under the pointer or the focus shows in the one line under the
 *            strip, for every tab, and describes the tab for a screen reader.
 *   ISC-641  "Set step aside" and the rail's set-aside state are gone. Sample
 *            and Early data open once all six loop steps have a saved answer,
 *            and the hint names the steps still without one. Earlier set-asides
 *            stay on the record and render in History.
 *   ISC-642  "Not now" is gone; "I don't know" and "Ask me differently" stay;
 *            the governance card and the Help describe what remains.
 */
import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TAB_UNLOCK } from "../src/views/earnedTabs.ts";
import { STUDY_TABS, STUDY_TAB_TITLE, studyPath } from "../src/ui/routes.ts";
import { AppShell } from "../src/ui/AppShell.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { deleteProject, emptyBrief, listProjects, saveProject, type Project } from "../src/state/projects.ts";
import {
  firstUnsettledLoopStep,
  gateSentence,
  gatedStations,
  loopsSettled,
  unansweredLoopSteps,
} from "../src/flow/loopGate.ts";
import { declineStationEvent, declinedStations, stationStates } from "../src/flow/stationBrief.ts";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";
import { COMMITMENTS } from "../src/ui/Introduction.tsx";
import { PAGE_HELP } from "../src/ui/pageHelp.ts";
import { TWO_LOOPS_LEDE } from "../src/flow/StationLoop.tsx";
import { agentlessPassives, nonEntityActs, reducedRelatives } from "../src/copy/rules.ts";

const read = (rel: string) => Bun.file(new URL(`../${rel}`, import.meta.url).pathname).text();

/* ------------------------------------------------------------------------ */
/* ISC-640: the tab strip                                                    */
/* ------------------------------------------------------------------------ */

const PID = "m69-tabs";
let container: HTMLElement;
let root: Root;
async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => void (await Promise.resolve()));
}
async function mount() {
  await act(async () => {
    root.render(React.createElement(LedgerProvider, { store: new InMemoryLedgerStore(), children: React.createElement(AppShell) }));
  });
  await settle();
}
const tab = (t: string) => container.querySelector<HTMLElement>(`[data-testid="studytab-${t}"]`)!;
type Handlers = { onMouseEnter?: () => void; onMouseLeave?: () => void; onFocus?: () => void; onBlur?: () => void };
const handlers = (el: Element): Handlers => {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"))!;
  return (el as unknown as Record<string, Handlers>)[key]!;
};
const line = () => container.querySelector<HTMLElement>(".studybar-notice");

describe("ISC-640: one line under the strip, and no tooltip over it", () => {
  beforeEach(async () => {
    for (const p of await listProjects()) await deleteProject(p.id);
    const project: Project = { id: PID, title: "M69 tabs", stage: "design-brief", brief: emptyBrief(), createdAt: Date.now() };
    await saveProject(project);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    window.location.hash = studyPath(PID, "design");
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.location.hash = "";
    for (const p of await listProjects()) await deleteProject(p.id);
  });

  test("no study tab carries a title attribute, open or greyed", async () => {
    await mount();
    for (const t of STUDY_TABS) expect({ t, title: tab(t).getAttribute("title") }).toEqual({ t, title: null });
  });

  test("every tab is described by its sentence for a screen reader", async () => {
    await mount();
    for (const t of STUDY_TABS) {
      const described = container.querySelector(`#${tab(t).getAttribute("aria-describedby")}`);
      const expected = tab(t).getAttribute("aria-disabled") === "true" ? TAB_UNLOCK[t as keyof typeof TAB_UNLOCK] : STUDY_TAB_TITLE[t];
      expect({ t, said: described?.textContent }).toEqual({ t, said: expected });
    }
  });

  test("hovering an open tab shows its sentence in the line; leaving hides it", async () => {
    await mount();
    expect(line()).toBeNull();
    await act(async () => handlers(tab("design")).onMouseEnter?.());
    expect(line()?.textContent).toBe(STUDY_TAB_TITLE.design);
    await act(async () => handlers(tab("design")).onMouseLeave?.());
    expect(line()).toBeNull();
    await act(async () => handlers(tab("motivation")).onFocus?.());
    expect(line()?.textContent).toBe(STUDY_TAB_TITLE.motivation);
    await act(async () => handlers(tab("motivation")).onBlur?.());
    expect(line()).toBeNull();
  });

  test("a greyed tab still shows how to open it, in the same line", async () => {
    await mount();
    await act(async () => handlers(tab("exports")).onMouseEnter?.());
    expect(line()?.textContent).toBe(TAB_UNLOCK.exports);
    expect(line()?.getAttribute("data-testid")).toBe("studybar-unlock");
  });

  test("Anti: the strip's source writes no title on a tab", async () => {
    const shell = await read("src/ui/AppShell.tsx");
    const strip = shell.slice(shell.indexOf('className="studybar-tabs"'), shell.indexOf('className="studybar-notice"'));
    expect(strip.length).toBeGreaterThan(500);
    expect(strip).not.toMatch(/\btitle=\{/);
    expect(strip).toContain("{ tooltip: false }");
  });
});

/* ------------------------------------------------------------------------ */
/* ISC-641: the gate reads saved answers                                     */
/* ------------------------------------------------------------------------ */

describe("ISC-641: Sample and Early data open on six saved answers", () => {
  test("a fresh project names all six steps", () => {
    const fresh = emptyBrief();
    expect([...unansweredLoopSteps(fresh)]).toEqual(["context", "process", "outcome", "site", "puzzle", "bind"]);
    expect(gateSentence("sample", unansweredLoopSteps(fresh))).toBe(
      "Sample opens once you have answered all six steps in the loops. Context, Process, Outcome, Site, Puzzle and Bind still need an answer.",
    );
    expect(firstUnsettledLoopStep(fresh)).toBe("context");
  });

  test("the hint names the steps still open, in the owner's form", () => {
    const brief = { ...emptyBrief(), processOfInterest: "p", outcomeOfInterest: "o", siteRationale: "s", puzzleAnswer: "q" };
    expect(gateSentence("early-data", unansweredLoopSteps(brief))).toBe(
      "Early data opens once you have answered all six steps in the loops. Context and Bind still need an answer.",
    );
  });

  test("set-asides on the record no longer settle a step", () => {
    const aside = declinedStations(
      ["context", "process", "outcome", "site", "puzzle", "bind"].map((id) => declineStationEvent("p", id as never, "not-yet", "")),
    );
    expect(loopsSettled(emptyBrief())).toBe(false);
    expect([...gatedStations(emptyBrief(), aside)].sort()).toEqual(["early-data", "sample"]);
  });

  test("an older set-aside at Sample itself still keeps Sample open (work never closes)", () => {
    expect([...gatedStations(emptyBrief(), new Map([["sample", "not-yet"]]))]).toEqual(["early-data"]);
  });

  test("the rail draws three states, none of them set aside", async () => {
    const states = stationStates(emptyBrief(), 0);
    expect(new Set(states.values())).toEqual(new Set(["empty"]));
    const rail = await read("src/flow/StationRail.tsx");
    expect(rail).not.toContain("deferred");
    expect(rail).not.toContain('"Set aside"');
  });

  test("the step page has no set-aside control", async () => {
    const step = await read("src/flow/StationWorkspace.tsx");
    expect(step).not.toMatch(/>\s*Set step aside\s*</);
    expect(step).not.toContain("set-aside-station");
    expect(step).not.toContain("declineStationEvent(");
  });

  test("History still renders a set-aside and a Not now written before M69", () => {
    const base = { ts: 1, projectId: "p" };
    const aside = { ...declineStationEvent("p", "site", "not-yet", ""), ts: 1 };
    const question = {
      ...base,
      id: "q1",
      actor: "persona:interviewer",
      model: "m",
      modelVersion: "m",
      type: "question-selection",
      topic: "station:site",
      question: "Which wards?",
      station: "site",
      offered: [],
    } as unknown as LedgerEvent;
    const notNow = { ...base, id: "r1", actor: "human", type: "refusal", kind: "not-now", questionEventId: "q1" } as LedgerEvent;
    const rows = projectLedger([aside, question, notNow]);
    expect(rows[0]?.changed).toBe("Site, set aside for now");
    expect(rows[2]?.happened).toContain("Set the question aside for now");
  });

  test("the copy says who answers, with no passive and no non-entity acting", () => {
    for (const s of [gateSentence("sample", ["context", "bind"]), TWO_LOOPS_LEDE]) {
      expect({ s, passive: agentlessPassives(s), relative: reducedRelatives(s), acts: nonEntityActs(s) }).toEqual({
        s,
        passive: [],
        relative: [],
        acts: false,
      });
    }
    // M83, ISC-698: the fuller lede keeps the rule in its own words.
    expect(TWO_LOOPS_LEDE).toContain("Once you've answered all six, you can move to describing your sampling approach");
  });
});

/* ------------------------------------------------------------------------ */
/* ISC-642: no Not now                                                       */
/* ------------------------------------------------------------------------ */

describe("ISC-642: I don't know and Ask me differently stay; Not now goes", () => {
  test("the chat offers no Not now", async () => {
    const chat = await read("src/workbench/Dialogue.tsx");
    expect(chat).not.toContain('data-testid="not-now"');
    expect(chat).not.toContain('decline("not-now")');
    expect(chat).toContain('data-testid="dont-know"');
    expect(chat).toContain('data-testid="give-directions"');
  });

  test("the governance card names what remains", () => {
    const card = COMMITMENTS[1];
    expect(card?.title).toBe("Abductive keeps your choices in History");
    expect(card?.body).toBe("Say you don't know or change the subject, and Abductive keeps both in History as your choices.");
    expect(`${card?.title} ${card?.body} ${card?.why}`).not.toMatch(/\bskip|set aside|Not now/i);
  });

  test("the Help names the two replies and the gate's new rule", () => {
    const design = PAGE_HELP.design;
    const said = [...design.purpose, ...design.parts.flatMap((p) => p.says)].join(" ");
    expect(said).toContain("I don't know and Ask me differently are replies too.");
    expect(said).not.toContain("Not now");
    expect(said).toContain("Once you've answered all six, you can move to describing your sampling approach");
    expect(said).not.toContain("set aside all six");
  });

  test("the copy standard's L5 no longer names Skip or Set aside as verbs", async () => {
    const standard = await read("docs/copy-standard.md");
    const l5 = standard.split("\n").find((l) => l.includes("**L5.")) ?? "";
    expect(l5).not.toContain("Skip for a question");
    expect(l5).not.toContain("Set aside for a step");
  });
});
