/**
 * M52-1, the walkthrough's frame and the paged aspects (ISC-536, ISC-537).
 *
 * What the owner saw on the live site: "the frame for the intro information
 * overlaps with the content. Visually it looks sloppy." Measured at 1495 with
 * the dock closed, the surface was a 928px column centred in a 1,265px cell and
 * the nine-aspect track it mounted measured 3,008px, so the fourth card was cut
 * at the window's right edge and the track's own Previous and Next sat fifty
 * pixels above the screen's Back and Next. Two Nexts, and one of them lied
 * about what it moved.
 *
 * Three properties here, none of which a screenshot settles:
 *
 *   the cap        the surface no longer carries a width narrower than the
 *                  cell. This is a sheet assertion because the defect was a
 *                  sheet declaration, and a rendered test in happy-dom has no
 *                  layout to measure. The rects are in the build report.
 *   one foot       (retired 2026-10-15: the screens are as tall as their content) the four screens
 *                  are one height and Back does not land where Next was.
 *   the pager      nine cards, paged, with one pair of words on the screen. The
 *                  page arithmetic is held to the sheet's own breakpoint, and
 *                  the range the reader is told is the range they can see,
 *                  including at the end of the row where the last page of two
 *                  shows the eighth card beside the ninth.
 */

import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Walkthrough } from "../src/ui/Walkthrough.tsx";
import { OBSTACLES } from "../src/ui/Introduction.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";

const INTRO_CSS = readFileSync("src/ui/styles/intro.css", "utf8");
const WALK_TSX = readFileSync("src/ui/Walkthrough.tsx", "utf8");

const REAL_MATCH_MEDIA = window.matchMedia;

/** A window that answers one way about width, so a page size can be forced. */
function pretendWide(wide: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width") ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

let container: HTMLElement;
let root: Root;

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function mount(): Promise<void> {
  await act(async () => {
    root.render(
      React.createElement(LedgerProvider, {
        store: new InMemoryLedgerStore(),
        children: React.createElement(Walkthrough),
      }),
    );
  });
  await settle();
}

function find(testId: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
}

function press(testId: string): Promise<void> {
  const el = find(testId);
  if (el === null) throw new Error(`no control ${testId}`);
  return act(async () => {
    el.click();
  });
}

/** The first screen, which is the one the nine aspects sit on since ISC-590. */
async function toAspects(): Promise<void> {
  await mount();
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.matchMedia = REAL_MATCH_MEDIA;
});

describe("M52-1: the frame is the content cell (ISC-536, ISC-537)", () => {
  test("the surface carries no cap narrower than the cell it sits in", () => {
    const rule = /\.walk \{([^}]*)\}/.exec(INTRO_CSS)?.[1] ?? "";
    // Vacuity: the rule has to exist for the assertion under it to mean
    // anything. It read `max-width: 58rem` until M52.
    expect(rule.length).toBeGreaterThan(0);
    expect(rule).toContain("max-width: none");
    expect(rule).not.toMatch(/max-width:\s*\d/);
  });

  test("every screen is as tall as its content, so the foot sits under the body", () => {
    // Matthew, 2026-10-15: "minimize the vertical space between the main body and
    // the footers". The min-height pins of M52 to M83 held Back and Next in one
    // place, but once M86 to M91 shortened the third screen they left 150 to
    // 240px of empty space above the foot. No screen carries a pin now.
    expect(INTRO_CSS).not.toMatch(/\.walk-screen[^{]*\{[^}]*min-height/);
    expect(INTRO_CSS).not.toContain("@media (min-width: 1180px) and (max-width: 1234px)");
    const base = /\.walk-screen \{([^}]*)\}/.exec(INTRO_CSS)?.[1] ?? "";
    expect(base.length).toBeGreaterThan(0);
  });

  test("the page size and the column count read the same breakpoint", () => {
    // The sheet owns the columns (FND-08 forbids a `var(--x)` tokens.css does
    // not declare, and a pager's column count is not a token) while the
    // component owns the count it announces. Two declarations of one number is
    // exactly how a screen ends up saying three and drawing two, so they are
    // held to each other here.
    const inTs = /\(min-width:\s*(\d+)px\)/.exec(
      /ASPECTS_THREE_UP = "([^"]+)"/.exec(WALK_TSX)?.[1] ?? "",
    )?.[1];
    const inCss = /@media \(min-width:\s*(\d+)px\) \{\s*\.walk-pager-track \{/.exec(INTRO_CSS)?.[1];
    expect(inTs).toBe("1200");
    expect(inCss).toBe(inTs);
  });
});

describe("M52-1: the nine aspects are paged inside the frame (ISC-536, ISC-537)", () => {
  test("all nine cards are there, and the row clips rather than the window", async () => {
    pretendWide(true);
    await toAspects();
    expect(container.querySelectorAll("ol.obstacle-cards > li")).toHaveLength(OBSTACLES.length);
    const rule = /\.walk-pager-track \{([^}]*)\}/.exec(INTRO_CSS)?.[1] ?? "";
    expect(rule).toContain("overflow-x: hidden");
  });

  test("the screen shows one Next, and it is the walkthrough's", async () => {
    pretendWide(true);
    await toAspects();
    // The defect, stated as a test: the track's own worded controls were on
    // this screen beside the screen's own.
    const worded = [...container.querySelectorAll("button")].filter(
      (b) => b.textContent === "Next" || b.textContent === "Previous",
    );
    expect(worded.map((b) => b.textContent)).toEqual(["Next"]);
    expect(find("walk-next")).not.toBeNull();
    expect(find("intro-obstacles-slider-next")).toBeNull();
  });

  test("three to a page above the breakpoint, and the arrows say how many they move", async () => {
    pretendWide(true);
    await toAspects();
    expect(find("walk-aspects")?.dataset.perPage).toBe("3");
    expect(find("walk-aspects-prev")?.getAttribute("aria-label")).toBe("Previous three");
    expect(find("walk-aspects-next")?.getAttribute("aria-label")).toBe("Next three");
    expect(find("walk-aspects-dots")?.children).toHaveLength(3);
    expect(find("walk-aspects-position")?.textContent).toBe("1 to 3 of 9");
  });

  test("two to a page below it, and the count in the arrows follows", async () => {
    pretendWide(false);
    await toAspects();
    expect(find("walk-aspects")?.dataset.perPage).toBe("2");
    expect(find("walk-aspects-prev")?.getAttribute("aria-label")).toBe("Previous two");
    expect(find("walk-aspects-next")?.getAttribute("aria-label")).toBe("Next two");
    expect(find("walk-aspects-dots")?.children).toHaveLength(5);
  });

  test("every dot names the cards it shows, and the last one names what is in view", async () => {
    pretendWide(false);
    await toAspects();
    const dots = [...(find("walk-aspects-dots")?.children ?? [])].map((d) =>
      d.getAttribute("aria-label"),
    );
    // Nine cards two to a page is four full pages and one card over. The row
    // stops at its own end, so the last page draws the eighth card beside the
    // ninth (measured at 1100: scrollLeft 3318, the row's maximum). A dot
    // saying "9 to 9" would name something other than what is on screen.
    expect(dots).toEqual([
      "Show 1 to 2 of the nine",
      "Show 3 to 4 of the nine",
      "Show 5 to 6 of the nine",
      "Show 7 to 8 of the nine",
      "Show 8 to 9 of the nine",
    ]);
  });

  test("pressing a dot moves the announced page, and the announcement follows", async () => {
    pretendWide(true);
    await toAspects();
    const dots = find("walk-aspects-dots") as HTMLElement;
    await act(async () => {
      (dots.children[2] as HTMLElement).click();
    });
    expect(find("walk-aspects-position")?.textContent).toBe("7 to 9 of 9");
    expect((dots.children[2] as HTMLElement).dataset.current).toBe("true");
    expect((dots.children[0] as HTMLElement).dataset.current).toBeUndefined();
  });

  test("the position is announced as well as drawn", async () => {
    pretendWide(true);
    await toAspects();
    expect(find("walk-aspects-position")?.getAttribute("aria-live")).toBe("polite");
    // The dots are controls with their own names, so nothing else speaks.
    expect(find("walk-aspects-dots")?.getAttribute("aria-live")).toBeNull();
  });
});
