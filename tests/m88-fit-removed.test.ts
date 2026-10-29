/**
 * M88, ISC-724: "How the parts fit together" leaves the front page.
 *
 * The owner, 2026-10-14: "remove how the parts fit together section". The
 * section was the seven moves (FIT_MOVES) in a vertical slider beside the
 * two-column drawing (FitDiagram), between the nine question cards and the
 * framework. All of it goes: the heading, the slider, the drawing, the
 * moves' glyphs, their styles and the tests that pinned them.
 *
 * What stays: the horizontal slider of the nine cards, which shares the track
 * reader the moves' slider used, and every other section of the front page in
 * its order. (CHECKS_WHY and the Checks Help it opened went with the checks at
 * M89.)
 */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as Intro from "../src/ui/Introduction.tsx";
import * as Icons from "../src/ui/icons/FrontIcons.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const read = (rel: string) => Bun.file(SRC + rel).text();

function frontPage(): string {
  return renderToStaticMarkup(
    createElement(LedgerProvider, { store: new InMemoryLedgerStore(), children: createElement(Intro.Introduction) }),
  );
}

describe("ISC-724: the section is gone from the front page", () => {
  test("the rendered page carries neither the heading, the slider nor the drawing", () => {
    const html = frontPage();
    expect(html).not.toContain("How the parts fit together");
    expect(html).not.toContain('data-testid="intro-fit"');
    expect(html).not.toContain("intro-moves");
    expect(html).not.toContain("fit-svg");
    expect(html).not.toContain("fit-node");
    expect(html).not.toContain('data-testid="fit-papers-link"');
  });

  test("the sections around it sit together, in their order", () => {
    const html = frontPage();
    const order = ["intro-obstacles", "intro-stations", "intro-commitments", "intro-terms"].map((id) =>
      html.indexOf(`data-testid="${id}"`),
    );
    for (const at of order) expect(at).toBeGreaterThan(-1);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    /* The nine cards' section closes and the framework's opens next, with no
     * section between them. */
    const stationsOpen = html.lastIndexOf("<section", order[1]);
    const between = html.slice(order[0], stationsOpen);
    expect(between.match(/<section/g) ?? []).toHaveLength(0);
    expect(between.match(/<\/section>/g) ?? []).toHaveLength(1);
  });

  test("the module exports none of the section's parts", () => {
    const gone = [
      "FIT_MOVES",
      "FitDiagram",
      "MoveSlider",
      "PAPERS_MOVE_TITLE",
      "FIT_NODES",
      "FIT_EDGES",
      "FIT_BOX",
      "FIT_VIEWBOX",
      "FIT_LINE_MAX",
      "fitNodeRect",
      "wrapFitLabel",
    ];
    for (const name of gone) expect({ name, exported: name in Intro }).toEqual({ name, exported: false });
    expect("MOVE_ICONS" in Icons).toBe(false);
    /* The nine cards' slider stays. */
    expect(typeof Intro.ObstacleSlider).toBe("function");
  });

  test("the source and the stylesheets carry none of it", async () => {
    const intro = await read("ui/Introduction.tsx");
    for (const word of ["How the parts fit together", "FIT_MOVES", "FitDiagram", "MoveSlider", "MoveId", "MOVE_ICONS", "fit-"]) {
      expect({ word, present: intro.includes(word) }).toEqual({ word, present: false });
    }
    const icons = await read("ui/icons/FrontIcons.tsx");
    expect(icons).not.toContain("MoveId");
    expect(icons).not.toContain("FIT_MOVES");
    const css = (await read("ui/styles/intro.css")) + (await read("ui/styles/base.css"));
    expect(css.match(/\.fit-[a-z-]+/g) ?? []).toEqual([]);
    expect(css).not.toContain(".intro-fit");
  });
});
