/**
 * M53, ISC-543: the six photographs sit behind the walkthrough's screens.
 *
 * The owner, on the M52 build: "What happened to the other images you created for
 * those sections? Can't they be brought in as helpful backdrop." The corridor is
 * a hero band behind screen 1's title and lede, the three vignettes sit one per
 * commitment card below it (the lead's decision: they illustrate the three
 * refusals, and the long page binds each picture to its refusal), the two banners
 * run across screens 2 and 3, and screen 4 is plain. Every text block is on an opaque panel, which is
 * what makes 4.5:1 measurable and what the browser measurement in the report
 * checks; here the structure is held: the text is inside the panel and the
 * photograph is outside it.
 *
 * ISC-590 reordered the screens: the vignettes are on screen 3 with the refusals,
 * the loops keep their banner on screen 2, and the problems, now on screen 1 under
 * the corridor, carry no banner of their own.
 */
import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Walkthrough, WALKTHROUGH_BACKDROPS, WALKTHROUGH_HERO, WALKTHROUGH_VIGNETTES } from "../src/ui/Walkthrough.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";

const ROOT = join(import.meta.dir, "..");
let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function mountAt(screen: number): Promise<void> {
  await act(async () => {
    root.render(
      React.createElement(LedgerProvider, {
        store: new InMemoryLedgerStore(),
        children: React.createElement(Walkthrough),
      }),
    );
  });
  for (let i = 0; i < screen; i += 1) {
    const next = container.querySelector<HTMLElement>('[data-testid="walk-next"]');
    if (next === null) throw new Error("no Next");
    await act(async () => {
      next.click();
    });
  }
}

function backdropSrc(): string | null {
  /* The wrapper names its file, because a test DOM fails every image load and the
   * image then renders nothing, which is the missing-file behaviour working. */
  return container.querySelector('[data-testid="walk-backdrop"]')?.getAttribute("data-src") ?? null;
}

describe("which photograph is behind which screen (ISC-543)", () => {
  /* ISC-590 moved the problems to screen 1 without their banner; ISC-594 put
   * that banner on screen 3, over the outputs of a project and the governance cards. */
  test("the five files, each once: the corridor, two vignettes, two banners", () => {
    const all = [WALKTHROUGH_HERO, ...WALKTHROUGH_VIGNETTES, ...WALKTHROUGH_BACKDROPS.map((b) => b?.src ?? null).filter((x) => x !== null)];
    expect(all).toEqual([
      "/intro/hero.jpg",
      "/intro/commit-1.jpg",
      "/intro/commit-2.jpg",
      "/intro/steps.jpg",
      "/intro/obstacles.jpg",
    ]);
    expect(WALKTHROUGH_BACKDROPS.map((b) => b?.kind ?? null)).toEqual([null, "banner", "banner", null]);
  });

  test("screen 1: the corridor is a band behind the title and the lede only", async () => {
    await mountAt(0);
    const hero = container.querySelector('[data-testid="walk-hero"]');
    expect(hero?.getAttribute("data-src")).toBe("/intro/hero.jpg");
    expect(hero?.querySelector('[data-testid="walk-title"]')).not.toBeNull();
    expect(hero?.querySelector(".walk-hero-lede")).not.toBeNull();
    // The commitments are not on it.
    expect(hero?.querySelector('[data-testid="walk-commitments"]')).toBeNull();
    expect(backdropSrc()).toBeNull();
  });

  test("screen 3: each commitment card carries its own vignette, in order, sized before it loads", async () => {
    await mountAt(2);
    const cards = [...container.querySelectorAll('[data-testid="walk-commitments"] > li')];
    expect(cards.length).toBe(2);
    cards.forEach((li, i) => {
      expect(li.querySelector('[data-testid^="walk-image-commit-"]')?.getAttribute("data-src")).toBe(`/intro/commit-${i + 1}.jpg`);
    });
    const css = readFileSync(join(ROOT, "src/ui/styles/intro.css"), "utf8");
    expect(/\.commitment-image img \{[^}]*aspect-ratio: 1 \/ 1/.test(css)).toBe(true);
  });

  test("the banners on screens 2 and 3", async () => {
    await mountAt(1);
    expect(backdropSrc()).toBe("/intro/steps.jpg");
    expect(container.querySelector('[data-testid="walk-backdrop"]')?.getAttribute("data-kind")).toBe("banner");
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="walk-next"]')?.click();
    });
    expect(backdropSrc()).toBe("/intro/obstacles.jpg");
  });

  test("screen 4 carries no image", async () => {
    await mountAt(3);
    expect(container.querySelectorAll('[data-testid="walk-screen"] img').length).toBe(0);
    expect(container.querySelectorAll('[data-testid="walk-screen"] [data-src]').length).toBe(0);
  });
});

describe("the text is on a panel and the photograph is decoration (ISC-543)", () => {
  for (const screen of [1, 2, 3]) {
    test(`screen ${screen + 1}: every paragraph and heading is inside the panel`, async () => {
      await mountAt(screen);
      const panel = container.querySelector('[data-testid="walk-panel"]');
      expect(panel).not.toBeNull();
      const stray = [...container.querySelectorAll('[data-testid="walk-screen"] p, [data-testid="walk-screen"] h2, [data-testid="walk-screen"] h3')].filter(
        (el) => !panel?.contains(el),
      );
      expect(stray.map((el) => el.textContent)).toEqual([]);
    });
  }

  test("every backdrop is hidden from assistive technology", async () => {
    // Two banners since ISC-594, on screens 2 and 3: mounted on 2, stepped to 3.
    await mountAt(1);
    for (let screen = 1; screen < 3; screen += 1) {
      const back = container.querySelector('[data-testid="walk-backdrop"]');
      expect(back).not.toBeNull();
      expect(back?.getAttribute("aria-hidden")).toBe("true");
      await act(async () => {
        container.querySelector<HTMLElement>('[data-testid="walk-next"]')?.click();
      });
    }
  });

  test("the backdrop is placed absolutely, so it cannot move the text as it loads", () => {
    const css = readFileSync(join(ROOT, "src/ui/styles/intro.css"), "utf8");
    const rule = /\.walk-backdrop \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(rule).toContain("position: absolute");
    const panel = /\.walk-panel \{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(panel).toContain("background: var(--surface)");
  });
});
