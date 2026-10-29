/**
 * M85, ISC-709: the card labels and the group rubric (a co-author's fourth
 * review, 2026-10-13; Matthew's ruling, 2026-10-14).
 *
 * The co-author: "instead of writing 'Abduction's help' then I think that it would be
 * better with 'How Abduction might help'"; "I do not think that it needs to say
 * 'the question' over each of the questions"; "Maybe the statement 'questions
 * about the theoretical starting point' … can have a different color (e.g.
 * different shade of grey) in order to indicate that they fit under the same
 * rubric."
 *
 * Held here: the kicker over the question is gone (the question is the h3), the
 * help's kicker reads "How Abductive might help" with its L13 exception
 * recorded, and the group label has a style of its own, a shade apart from the
 * kicker and the body, the same on every card of a group, on the long page and
 * on screen 1 alike.
 */

import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { HELP_LABEL, OBSTACLES, ObstacleSlider } from "../src/ui/Introduction.tsx";
import { Walkthrough } from "../src/ui/Walkthrough.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";

const STANDARD = readFileSync("docs/copy-standard.md", "utf8");
const CSS = readFileSync("src/ui/styles/intro.css", "utf8");

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

async function render(el: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(React.createElement(LedgerProvider, { store: new InMemoryLedgerStore(), children: el }));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

/** The declarations of one rule, by its exact selector. */
function rule(selector: string): string {
  const at = CSS.indexOf(`\n${selector} {`);
  if (at < 0) return "";
  return CSS.slice(at, CSS.indexOf("}", at));
}

const SURFACES = [
  { name: "the long page", el: () => React.createElement(ObstacleSlider), cards: '[data-testid="intro-obstacles-slider-track"] > li' },
  { name: "screen 1", el: () => React.createElement(Walkthrough), cards: '[data-testid="walk-aspects-track"] > li' },
] as const;

describe("ISC-709: the card's one kicker", () => {
  test("the help's label is the co-author's, with the owner's name for the tool", () => {
    expect(HELP_LABEL).toBe("How Abductive might help");
  });

  for (const surface of SURFACES) {
    test(`${surface.name}: every card reads the question, then How Abductive might help`, async () => {
      await render(surface.el());
      const cards = [...container.querySelectorAll<HTMLElement>(surface.cards)];
      expect(cards).toHaveLength(9);
      for (const [i, card] of cards.entries()) {
        const labels = [...card.querySelectorAll("p.intro-card-label")].map((p) => p.textContent);
        expect({ i, labels }).toEqual({ i, labels: ["How Abductive might help"] });
        // The question is the heading, with the kicker before it gone.
        const h3 = card.querySelector("h3");
        expect(h3?.textContent).toBe(OBSTACLES[i]?.title ?? "missing");
        expect(h3?.previousElementSibling?.classList.contains("intro-card-label")).toBe(false);
      }
      expect(container.textContent).not.toContain("The question");
      expect(container.textContent).not.toContain("Abductive's help ");
      const kickers = [...container.querySelectorAll("p.intro-card-label")].map((p) => p.textContent);
      expect(kickers).not.toContain("Abductive's help");
    });

    test(`${surface.name}: the group label carries its group, the same on every card of a group`, async () => {
      await render(surface.el());
      const cards = [...container.querySelectorAll<HTMLElement>(surface.cards)];
      for (const [i, card] of cards.entries()) {
        const group = card.querySelector<HTMLElement>("p.intro-card-group");
        expect({ i, group: group?.dataset.group }).toEqual({ i, group: OBSTACLES[i]?.group });
        // The rubric opens the card, above the number and the question.
        expect(card.firstElementChild).toBe(group);
      }
    });
  }
});

describe("ISC-709: the group label is a shade apart", () => {
  const group = rule("p.intro-card-group");
  const kicker = rule("p.intro-card-label");
  const body = rule(".obstacle-cards p");

  test("the rubric has a rule of its own and an ink of its own", () => {
    expect(group).toMatch(/border-left: \d+px solid;/);
    expect(group).toMatch(/color: var\(--rubric-ink\)/);
  });

  test("its ink is neither the kicker's nor the body's", () => {
    const ink = (decls: string) => /\bcolor: ([^;]+);/.exec(decls)?.[1] ?? "";
    expect(ink(kicker)).toBe("var(--ink-faint)");
    expect(ink(body)).toBe("var(--ink-muted)");
    expect(ink(group)).not.toBe(ink(kicker));
    expect(ink(group)).not.toBe(ink(body));
    const TOKENS = readFileSync("src/ui/styles/tokens.css", "utf8");
    const hex = (name: string) => new RegExp(`--${name}: (#[0-9a-f]{6});`).exec(TOKENS)?.[1] ?? "";
    expect(hex("rubric-ink")).not.toBe("");
    expect(hex("rubric-ink")).not.toBe(hex("ink-muted"));
    expect(hex("rubric-ink")).not.toBe(hex("ink-faint"));
  });

  test("each of the three groups has its own shade, set once for all its cards", () => {
    const shades = (["theory", "collection", "analysis"] as const).map((id) => {
      const decls = rule(`p.intro-card-group[data-group="${id}"]`);
      return {
        fill: /background: ([^;]+);/.exec(decls)?.[1] ?? "",
        line: /border-left-color: ([^;]+);/.exec(decls)?.[1] ?? "",
      };
    });
    expect(shades).toEqual([
      { fill: "var(--rubric-theory-fill)", line: "var(--rubric-theory-rule)" },
      { fill: "var(--rubric-collection-fill)", line: "var(--rubric-collection-rule)" },
      { fill: "var(--rubric-analysis-fill)", line: "var(--rubric-analysis-rule)" },
    ]);
  });
});

describe("ISC-709: the L13 exception", () => {
  test("is recorded under L13, dated, by the owner's ruling", () => {
    const l13 = STANDARD.slice(STANDARD.indexOf("- **L13."), STANDARD.indexOf("- **L14."));
    expect(l13).toContain("How Abductive might help");
    expect(l13).toContain("2026-10-14");
    expect(l13).toContain("ISC-709");
  });
});
