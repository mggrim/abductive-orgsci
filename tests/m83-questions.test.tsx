/**
 * M83, ISC-697: the nine read as questions, in three groups (a co-author's
 * second review, 2026-10-05; Matthew's ruling, 2026-10-06).
 *
 * The co-author: "I am also wondering whether 'problems' is the right term, or whether
 * we instead can call them questions?", grouped as questions related to the
 * theoretical starting point, data collection and data analysis; and the text
 * under each "nearly assumed that the user has those problems."
 *
 * Held here: each title is a question with its question mark (the L12
 * exception, recorded in docs/copy-standard.md), the three groups are the co-author's
 * and in their order, every card on both surfaces carries its group's label so a
 * label is in view on every page of the pager at two-up and three-up, and the
 * help under each question says what Abductive asks or does without the
 * assuming openers it carried before.
 */

import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  OBSTACLES,
  OBSTACLES_HEADING,
  OBSTACLES_LEDE,
  OBSTACLE_GROUPS,
  ObstacleSlider,
} from "../src/ui/Introduction.tsx";
import { Walkthrough } from "../src/ui/Walkthrough.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";

const STANDARD = readFileSync("docs/copy-standard.md", "utf8");
const REAL_MATCH_MEDIA = window.matchMedia;

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

async function render(el: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(React.createElement(LedgerProvider, { store: new InMemoryLedgerStore(), children: el }));
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const HEADING_OF = new Map<string, string>(OBSTACLE_GROUPS.map((g) => [g.id, g.heading]));

describe("ISC-697: the nine are questions", () => {
  test("each title is the co-author's question, reworded only where the copy rules ask", () => {
    expect(OBSTACLES.map((o) => o.title)).toEqual([
      "Have you identified a puzzle or a topic?",
      "Which conversation are you joining?",
      "What drew you to this site over another?",
      "Can your data answer your question?",
      "Is your sample a theoretical or a convenience sample?",
      "Does your data live up to the expectations of the journal that you're aiming at?",
      // M84, ISC-702: the co-author's affirmative form of 2026-10-07.
      "Are you moving beyond your informants' statements when you explain the puzzle?",
      "Are you reading your data with an open mind, or through the ideas that you already have?",
      "Do you know where each of your ideas came from?",
    ]);
    for (const o of OBSTACLES) expect({ id: o.id, asks: o.title.endsWith("?") }).toEqual({ id: o.id, asks: true });
  });

  test("the section heading and lede speak of questions", () => {
    // M84, ISC-702: the heading names Abductive's help, and the lede says what the nine set you up for.
    expect(OBSTACLES_HEADING).toBe("Abductive helps you answer nine early, critical questions about your research.");
    expect(OBSTACLES_LEDE).toBe("These nine questions prepare you to identify a novel phenomenon and to make a theoretical contribution, before you collect anything.");
    expect(`${OBSTACLES_HEADING} ${OBSTACLES_LEDE}`).not.toMatch(/problem/i);
  });

  test("the L12 exception is recorded, dated, under L12", () => {
    const l12 = STANDARD.slice(STANDARD.indexOf("- **L12."), STANDARD.indexOf("| Object | Say | Never |"));
    expect(l12).toContain("2026-10-06");
    expect(l12).toContain("ISC-697");
    expect(l12).toMatch(/question mark/);
  });
});

describe("ISC-697: three groups, in the co-author's terms and order", () => {
  test("the three headings, in order", () => {
    expect(OBSTACLE_GROUPS.map((g) => g.heading)).toEqual([
      "Questions about the theoretical starting point",
      "Questions about data collection",
      "Questions about data analysis",
    ]);
  });

  test("the members are the co-author's, one to one with the nine in order", () => {
    const members = (id: string) => OBSTACLES.filter((o) => o.group === id).map((o) => o.id);
    expect(OBSTACLE_GROUPS.map((g) => members(g.id))).toEqual([
      ["topic-not-puzzle", "no-conversation"],
      ["site-of-convenience", "question-out-of-reach", "convenient-sample", "thin-evidence"],
      ["native-explanation", "early-closure", "lost-provenance"],
    ]);
    // Contiguous, so a divider between two groups falls between two cards once.
    const order = OBSTACLES.map((o) => o.group);
    const runs = order.filter((g, i) => i === 0 || order[i - 1] !== g);
    expect(runs).toEqual(OBSTACLE_GROUPS.map((g) => g.id));
  });

  test("the long page's track labels every card with its group", async () => {
    await render(React.createElement(ObstacleSlider));
    const cards = [...container.querySelectorAll<HTMLElement>('[data-testid="intro-obstacles-slider-track"] > li')];
    expect(cards).toHaveLength(9);
    cards.forEach((card, i) => {
      const label = card.querySelector('[data-testid="obstacle-group"]')?.textContent;
      expect({ i, label }).toEqual({ i, label: HEADING_OF.get(OBSTACLES[i]?.group ?? "") });
    });
  });

  for (const wide of [true, false]) {
    const perPage = wide ? 3 : 2;
    test(`Getting started's pager shows a group label on every page at ${perPage}-up`, async () => {
      pretendWide(wide);
      await render(React.createElement(Walkthrough));
      const pager = container.querySelector<HTMLElement>('[data-testid="walk-aspects"]');
      expect(pager?.dataset.perPage).toBe(String(perPage));
      const cards = [...container.querySelectorAll<HTMLElement>('[data-testid="walk-aspects-track"] > li')];
      expect(cards).toHaveLength(9);
      const pages = Math.ceil(cards.length / perPage);
      for (let p = 0; p < pages; p++) {
        // The pager's own clamp: the last page shows the last `perPage` cards.
        const start = Math.min(p * perPage, cards.length - perPage);
        const shown = cards.slice(start, start + perPage);
        const labels = shown.map((c) => c.querySelector('[data-testid="obstacle-group"]')?.textContent ?? "");
        expect({ p, labelled: labels.every((l) => l !== "") }).toEqual({ p, labelled: true });
        // The first card in view says which group the page opens in.
        expect(labels[0]).toBe(HEADING_OF.get(OBSTACLES[start]?.group ?? "") ?? "missing");
      }
    });
  }
});

describe("ISC-697: the card's two labels and the help under each question", () => {
  test("the card reads its question, then How Abductive might help", async () => {
    // M85, ISC-709: "The question" went (the question is the heading), and the
    // help's kicker is the co-author's wording of 2026-10-13.
    await render(React.createElement(ObstacleSlider));
    const card = container.querySelector('[data-testid="intro-obstacles-slider-track"] > li');
    const labels = [...(card?.querySelectorAll("p.intro-card-label") ?? [])].map((p) => p.textContent);
    expect(labels).toEqual(["How Abductive might help"]);
    expect(container.textContent).not.toContain("The problem");
  });

  test("each help says what Abductive asks or does", () => {
    for (const o of OBSTACLES) {
      const first = o.body.split(/(?<=[.!?])\s+/)[0] ?? "";
      expect({ id: o.id, acts: /\bAbductive (?:asks|inquires|tells|flags|keeps|marks|pushes|labels)\b/.test(first) }).toEqual({ id: o.id, acts: true });
    }
  });

  test("the openers that assumed the fault are gone", () => {
    const helps = OBSTACLES.map((o) => o.body).join("\n");
    for (const gone of [
      "Start from the interest that you actually have",
      "actually",
      "Projects that skip these steps",
      "find out in year three",
      "Abductive flags that explanation",
      "You get a running list",
      "Delete a rival explanation and",
      "You give your reason",
      "You name the variation",
      "You name the journal",
    ]) {
      expect({ gone, present: helps.includes(gone) }).toEqual({ gone, present: false });
    }
  });
});
