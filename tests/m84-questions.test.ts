/**
 * M84, ISC-702: the nine questions, after a co-author's third review
 * (2026-10-07). Six corrections, each pinned to the words that answer it.
 *
 *   heading  Abductive helps you answer the nine; it does not answer them
 *   lede     the questions set you up for a novel phenomenon and a contribution
 *   card 1   a topic and a puzzle, glossed, and no "finding" before data
 *   card 2   questions drawn from the literature that you named
 *   card 4   "For example" before the dozen interviews
 *   card 7   the co-author's affirmative question, and its help to match
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OBSTACLES, OBSTACLES_HEADING, OBSTACLES_LEDE } from "../src/ui/Introduction.tsx";
import { stationById } from "../src/flow/stations.ts";

const card = (id: string) => {
  const found = OBSTACLES.find((o) => o.id === id);
  if (found === undefined) throw new Error(`no card ${id}`);
  return found;
};

describe("ISC-702: the heading and the lede", () => {
  test("the heading says Abductive helps you answer the nine (M86, ISC-717: the owner's sentence)", () => {
    expect(OBSTACLES_HEADING).toBe("Abductive helps you answer nine early, critical questions about your research.");
    expect(OBSTACLES_HEADING).toMatch(/helps you answer/);
    expect(OBSTACLES_HEADING).not.toMatch(/\bis designed\b/);
  });

  test("the lede says what the questions set you up for, before you collect anything", () => {
    expect(OBSTACLES_LEDE).toBe(
      "These nine questions prepare you to identify a novel phenomenon and to make a theoretical contribution, before you collect anything.",
    );
    expect(OBSTACLES_LEDE).not.toMatch(/\bensure\b/i);
  });
});

describe("ISC-702: the cards", () => {
  test("card 1 tells a topic from a puzzle, glossed, and says nothing of a finding", () => {
    const one = card("topic-not-puzzle");
    expect(one.body).toBe(
      "Abductive inquires into your expectations and observations, and helps you decipher a topic (a broad interest) from a puzzle (what you see, or expect to see, that current accounts can't explain).",
    );
    expect(one.body).not.toMatch(/finding/i);
  });

  test("card 2 says Abductive asks questions drawn from the literature that you identified (M86 wording)", () => {
    const two = card("no-conversation");
    expect(two.body).toBe(
      "Abductive asks you questions drawn from the literature that you identified, so that you can see the contribution that your project might make to that stream of research. Abductive considers each paper that you have flagged, to help you weigh its expectations for your setting.",
    );
  });

  test("card 4 opens its example with For example", () => {
    expect(card("question-out-of-reach").body).toContain(
      "For example, a dozen interviews won't show you a field's change over time.",
    );
  });

  test("card 7 asks the co-author's question in the affirmative, and keeps its id", () => {
    const seven = card("native-explanation");
    expect(seven.title).toBe("Are you moving beyond your informants' statements when you explain the puzzle?");
    expect(seven.body).toBe(
      "Abductive pushes you on your initial interpretations of early-stage data.",
    );
    expect(`${seven.title} ${seven.body}`).not.toMatch(/common sense/i);
    expect(OBSTACLES[6]?.id).toBe("native-explanation");
  });

  test("card 1's claim stands on the Puzzle step: it asks for expectation and observation", () => {
    const puzzle = stationById("puzzle");
    // M92, ISC-751: the surprise, against current accounts.
    expect(puzzle.blurb).toMatch(/surprise/);
    expect(puzzle.blurb).toMatch(/current accounts/);
  });

  test("card 2's claim stands on the code: the interview's challenges and paper fit read the papers", () => {
    const fit = readFileSync(join(import.meta.dir, "..", "src", "proposals", "paperFit.ts"), "utf8");
    expect(fit).toMatch(/expect/i);
  });
});
