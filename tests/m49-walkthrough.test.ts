/**
 * M49-1, the walkthrough (ISC-527).
 *
 * Three properties, and each one fails in a way no screenshot catches.
 *
 *   the gate      who sees the walkthrough, off the project store. The rule is
 *                 one sentence and it has one edge that matters: a copy of the
 *                 shipped example is not a study of the researcher's own, so a
 *                 browser holding only the example still meets the walkthrough.
 *                 Tested as a pure function on a list AND through the rendered
 *                 front page, because the function being right says nothing
 *                 about the component asking it.
 *   the screens   four of them, in order, each carrying the sentences the long
 *                 page carries. Read from the constants the two surfaces share,
 *                 so a screen that stops rendering one fails here rather than
 *                 drifting quietly into a second copy of it.
 *   the bypass    once a study of their own exists, the front page is the long
 *                 page, and the walkthrough is reachable from the link on it.
 *                 Both directions, because a bypass with no way back is a
 *                 researcher who cannot read the instructions twice.
 */

import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  FrontPage,
  hasOwnStudy,
  Walkthrough,
  WALKTHROUGH_SCREENS,
  WALKTHROUGH_TITLES,
} from "../src/ui/Walkthrough.tsx";
import {
  COMMITMENTS,
  DATA_LIVES_BODY,
  DATA_LIVES_HEADING,
  OBSTACLES_LEDE,
  PRODUCT_LINE,
  PURPOSE_LINE,
  STEPS_LEDE,
} from "../src/ui/Introduction.tsx";
import { STUDY_TAB_TITLE } from "../src/ui/routes.ts";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import {
  deleteProject,
  emptyBrief,
  listProjects,
  saveProject,
  type Project,
  type StudyOrigin,
} from "../src/state/projects.ts";

let container: HTMLElement;
let root: Root;

function study(id: string, importedAs?: StudyOrigin): Project {
  return {
    id,
    title: `M49 walk: ${id}`,
    stage: "design-brief",
    brief: emptyBrief(),
    createdAt: Date.now(),
    ...(importedAs === undefined ? {} : { importedAs }),
  };
}

/** The DOM's own microtask queue, then React's. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function mount(node: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(
      React.createElement(LedgerProvider, { store: new InMemoryLedgerStore(), children: node }),
    );
  });
  await settle();
  await settle();
}

function find(testId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

/**
 * Whether a surface is on screen, as a boolean.
 *
 * `expect(element).toBeNull()` is not usable here: a React-rendered happy-dom
 * node carries circular fibers, and a failing comparison on one is reported as
 * a pass rather than printing a diff. Found while writing the M49-2 tests, where
 * an assertion held the opposite of what the screen showed and still went green.
 */
function shows(testId: string): boolean {
  return find(testId) !== null;
}

function press(testId: string): Promise<void> {
  const el = find(testId);
  if (el === null) throw new Error(`no control ${testId}`);
  return act(async () => {
    el.click();
  });
}

async function clearStudies(): Promise<void> {
  for (const project of await listProjects()) await deleteProject(project.id);
}

beforeEach(async () => {
  window.location.hash = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await clearStudies();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  await clearStudies();
});

describe("M49-1: the gate reads the project store", () => {
  test("no study at all means the walkthrough", () => {
    expect(hasOwnStudy([])).toBe(false);
  });

  /* M91 (2026-10-14): the owner removed the example project. A copy of it
   * already in a browser is that researcher's data and opens as an ordinary
   * project, so it counts: the walkthrough no longer offers a way back to it,
   * and the long page's Recent projects does. */
  test("a copy of the old example, already in a browser, counts as a project", () => {
    expect(hasOwnStudy([study("a", "example")])).toBe(true);
    expect(hasOwnStudy([study("a", "example"), study("b", "example")])).toBe(true);
  });

  test("a study they named bypasses it", () => {
    expect(hasOwnStudy([study("a")])).toBe(true);
    expect(hasOwnStudy([study("a", "example"), study("b")])).toBe(true);
  });

  test("a bundle a co-author sent counts, because a file of your study is your study", () => {
    expect(hasOwnStudy([study("a", "bundle")])).toBe(true);
  });
});

describe("M49-1: the front page is one of two surfaces", () => {
  test("a browser with no study meets the walkthrough and not the long page", async () => {
    await mount(React.createElement(FrontPage));
    expect(shows("walkthrough")).toBe(true);
    expect(shows("introduction")).toBe(false);
  });

  /* M91 (2026-10-14): the example went, so a copy of it already in a browser
   * is an ordinary project and the long page, which lists it under Recent
   * projects, is the way back to it. */
  test("a browser holding only a copy of the old example gets the long page", async () => {
    await saveProject(study("ex", "example"));
    await mount(React.createElement(FrontPage));
    expect(shows("introduction")).toBe(true);
    expect(shows("walkthrough")).toBe(false);
  });

  test("a browser holding a study of their own gets the long page", async () => {
    await saveProject(study("mine"));
    await mount(React.createElement(FrontPage));
    expect(shows("introduction")).toBe(true);
    expect(shows("walkthrough")).toBe(false);
  });

  test("the link on the long page opens the walkthrough again, and leads back", async () => {
    await saveProject(study("mine"));
    await mount(React.createElement(FrontPage));
    const link = find("intro-reread");
    expect(link?.textContent).toBe("Open Getting started");
    await press("intro-reread");
    expect(shows("walkthrough")).toBe(true);
    expect(shows("introduction")).toBe(false);
    await press("walk-leave");
    expect(shows("introduction")).toBe(true);
  });

  test("the walkthrough offers no way back when there is no front page behind it", async () => {
    await mount(React.createElement(FrontPage));
    expect(shows("walk-leave")).toBe(false);
  });

  test("the long page offers the link only when the gate can give it one", async () => {
    // Rendered on its own, with no gate above it, the long page is the page it
    // has always been: the prop is absent and so is the control.
    const { Introduction } = await import("../src/ui/Introduction.tsx");
    await mount(React.createElement(Introduction));
    expect(shows("introduction")).toBe(true);
    expect(shows("intro-reread")).toBe(false);
  });
});

describe("M49-1: four screens, in order, carrying the long page's own sentences", () => {
  /* ISC-590 (owner, 2026-09-30): the order is the lede and the nine problems,
   * the two loops, where things live and what Abductive will not do, then the
   * create block. The strings are the ones the screens always carried. */
  test("there are four of them and the titles are the sections they came from", () => {
    expect(WALKTHROUGH_SCREENS).toBe(4);
    // M68, ISC-637: the owner renamed the third screen "The outputs of a project".
    // M83, ISC-698: the second is the framework's name.
    // M83, ISC-699: the third is the process heading; the outputs keep their label as its subhead.
    expect(WALKTHROUGH_TITLES).toEqual([PRODUCT_LINE, "The Qualitative Discovery Process Framework", "Working with Abductive", "New project"]);
  });

  test("screen one is the lede on the corridor, then the nine early questions", async () => {
    await mount(React.createElement(Walkthrough));
    expect(find("walk-title")?.textContent).toBe(PRODUCT_LINE);
    // M53, ISC-543: the purpose line sits with the title on the corridor band.
    expect(find("walk-hero")?.textContent).toContain(PURPOSE_LINE);
    const body = find("walk-body") as HTMLElement;
    expect(body.textContent).toContain("Abductive helps you answer nine early, critical questions about your research.");
    expect(body.textContent).toContain(OBSTACLES_LEDE);
    expect(container.querySelectorAll("ol.obstacle-cards > li")).toHaveLength(9);
    // Nothing of the later screens yet.
    expect(shows("walk-commitments")).toBe(false);
    expect(shows("walk-places")).toBe(false);
    // The count is on screen from the first screen, and Back is not.
    expect(find("walk-count")?.textContent).toBe("1 of 4");
    expect(shows("walk-back")).toBe(false);
    expect(shows("walk-next")).toBe(true);
  });

  /* M58, ISC-567: the section is "The two loops", with the owner's lede. */
  test("screen two is the Qualitative Discovery Process Framework", async () => {
    await mount(React.createElement(Walkthrough));
    await press("walk-next");
    expect(find("walk-title")?.textContent).toBe("The Qualitative Discovery Process Framework");
    expect((find("walk-body") as HTMLElement).textContent).toContain(
      // M83, ISC-698: the fuller lede, which names the framework.
      "Abductive uses the Qualitative Discovery Process Framework below to take you through the design of your qualitative project.",
    );
    expect(container.querySelector('[data-testid="intro-steps-inner"]')).not.toBeNull();
    expect(find("walk-count")?.textContent).toBe("2 of 4");
    expect((find("walk-body") as HTMLElement).textContent).toContain(STEPS_LEDE);
    // The loop itself, which is the component the Design rail draws from.
    expect(shows("intro-steps-rail")).toBe(true);
    expect(container.querySelectorAll(".rail-item")).toHaveLength(8);
  });

  test("screen three is the process, the outputs of a project, then research governance", async () => {
    await mount(React.createElement(Walkthrough));
    await press("walk-next");
    await press("walk-next");
    // M68, ISC-637: the title is the panel's heading. M83, ISC-699: it is the
    // process heading, and the owner's label heads the outputs below it.
    expect(find("walk-title")?.textContent).toBe("Working with Abductive");
    expect(find("walk-outputs-head")?.textContent).toBe("The outputs of a project");
    expect(find("walk-count")?.textContent).toBe("3 of 4");
    const places = find("walk-places") as HTMLElement;
    expect([...places.querySelectorAll(".walk-list-title")].map((n) => n.textContent)).toEqual([
      "History",
      // M63, ISC-614: the two tabs in the owner's terms, one sentence each.
      "Emerging project ontology",
      "Export",
    ]);
    expect(places.textContent).toContain("Abductive keeps every change in order, so you can follow the project back to its start.");
    expect(places.textContent).toContain(STUDY_TAB_TITLE.ontology);
    expect(places.textContent).toContain(STUDY_TAB_TITLE.exports);
    const body = find("walk-body") as HTMLElement;
    // ISC-595: stated in the affirmative.
    expect(body.textContent).toContain("Research governance in Abductive");
    const refusals = find("walk-commitments") as HTMLElement;
    // M89: the card "Abductive keeps contradictions visible" went with the checks.
    expect(refusals.querySelectorAll("li")).toHaveLength(2);
    for (const c of COMMITMENTS) {
      expect(refusals.textContent).toContain(c.title);
      expect(refusals.textContent).toContain(c.body);
    }
    // Places first, then the refusals.
    expect(places.compareDocumentPosition(refusals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The create block waits for the last screen.
    expect(shows("walk-start")).toBe(false);
  });

  test("screen four is the create block and the data sentence, and nothing else", async () => {
    await mount(React.createElement(Walkthrough));
    for (let i = 0; i < 3; i += 1) await press("walk-next");
    expect(find("walk-title")?.textContent).toBe("New project");
    expect(find("walk-count")?.textContent).toBe("4 of 4");
    // The two ways to have a project, both on the last screen (M91: the
    // example went, 2026-10-14).
    expect(shows("walk-start")).toBe(true);
    expect(shows("intro-title-input")).toBe(true);
    expect(find("intro-start")?.textContent).toBe("Create project");
    expect(shows("bringin-example")).toBe(false);
    expect(shows("bringin-input")).toBe(true);
    // The data sentence, after the doors.
    const body = find("walk-body") as HTMLElement;
    expect(body.textContent).toContain(DATA_LIVES_HEADING);
    expect(body.textContent).toContain(DATA_LIVES_BODY);
    const start = find("walk-start") as HTMLElement;
    expect(start.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nothing else: no places, no refusals, no problems, no loop.
    for (const id of ["walk-places", "walk-commitments", "walk-aspects", "intro-steps-rail"]) {
      expect({ id, shown: shows(id) }).toEqual({ id, shown: false });
    }
    // Nothing further to step to, so no Next; Back is still there.
    expect(shows("walk-next")).toBe(false);
    expect(shows("walk-back")).toBe(true);
  });

  test("Back walks the four in reverse, and neither control is ever drawn inert", async () => {
    await mount(React.createElement(Walkthrough));
    for (let i = 0; i < 3; i += 1) await press("walk-next");
    for (const expected of ["3 of 4", "2 of 4", "1 of 4"]) {
      await press("walk-back");
      expect(find("walk-count")?.textContent).toBe(expected);
    }
    for (const id of ["walk-next"]) {
      const el = find(id) as HTMLElement;
      expect(el.getAttribute("aria-disabled")).toBeNull();
      expect(el.hasAttribute("disabled")).toBe(false);
    }
  });

  test("no screen offers the example (M91, 2026-10-14)", async () => {
    await mount(React.createElement(Walkthrough));
    for (let i = 0; i < 4; i += 1) {
      expect(shows("bringin-example")).toBe(false);
      expect(shows("open-example")).toBe(false);
      expect(container.textContent ?? "").not.toContain("example project");
      if (i < 3) await press("walk-next");
    }
  });

  test("the position is announced as well as drawn", async () => {
    await mount(React.createElement(Walkthrough));
    expect(find("walk-count")?.getAttribute("aria-live")).toBe("polite");
  });
});
