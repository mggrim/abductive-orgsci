/**
 * M61 follow-up, ISC-593 and ISC-594: the walkthrough's banners (owner,
 * 2026-09-30). The two loops' banner is cut to about 120px and the panel lies
 * over it by the hero's own padding, so the lede starts within the screen's first
 * 200px. Screen 3 (the outputs of a project, then governance) takes the obstacles
 * banner at its top and the three vignettes on its governance cards. Geometry
 * is measured in Chrome at 1480 and 1100; the rules are held here.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;
const TOKENS = readFileSync(join(ROOT, "src/ui/styles/tokens.css"), "utf8");
const INTRO = readFileSync(join(ROOT, "src/ui/styles/intro.css"), "utf8");

describe("ISC-593: the two loops start higher", () => {
  test("the banner is 120px and the panel overlaps it by the hero's inside margin", () => {
    expect(TOKENS).toMatch(/--walk-banner-h:\s*120px;/);
    // --space-3xl is the token tokens.css names "the inside of the hero".
    expect(TOKENS).toMatch(/--space-3xl:[^\n]*the inside of the hero/);
    const panel = /\.walk-screen\[data-backdrop="banner"\] \.walk-panel \{([^}]*)\}/.exec(INTRO)?.[1] ?? "";
    // The screen's own padding is 2xl, so the panel meets the banner 3xl above its foot.
    expect(panel).toContain("margin-top: calc(var(--walk-banner-h) - var(--space-2xl) - var(--space-3xl))");
  });
});

describe("ISC-594: screen 3 has its imagery", () => {
  test("the obstacles banner at the top, the loops' on screen 2, none on 1 and 4", async () => {
    const { WALKTHROUGH_BACKDROPS, WALKTHROUGH_VIGNETTES } = await import("../src/ui/Walkthrough.tsx");
    expect(WALKTHROUGH_BACKDROPS).toEqual([
      null,
      { src: "/intro/steps.jpg", kind: "banner" },
      { src: "/intro/obstacles.jpg", kind: "banner" },
      null,
    ]);
    // One vignette per governance card, in order.
    expect(WALKTHROUGH_VIGNETTES).toEqual(["/intro/commit-1.jpg", "/intro/commit-2.jpg"]);
  });
});
