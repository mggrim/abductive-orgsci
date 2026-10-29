/**
 * M83, ISC-698: the two loops are the Qualitative Discovery Process Framework.
 *
 * A co-author (2026-10-05): the lede "needs to be more elaborate and
 * explicit", and the figure needs a name other than "model". Matthew's name
 * (2026-10-06): the Qualitative Discovery Process Framework.
 *
 * Held here: the name on the front page's section, screen 2's title, the
 * caption over the Design rail's figure and Design's Help; a lede of three to
 * five sentences saying that Abductive uses the framework to take you through
 * the design, what each loop's steps are for (with the step names read off
 * STATIONS by ring), that answering one changes what the others should say, and
 * that Sample and Early data open after the six; and every sentence of it under
 * the copy rules.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { FRAMEWORK_NAME, TWO_LOOPS_LEDE, TWO_LOOPS_LEDE_IN_HELP, stationsIn } from "../src/flow/StationLoop.tsx";
import { STEPS_HEADING, STEPS_LEDE } from "../src/ui/Introduction.tsx";
import { WALKTHROUGH_TITLES } from "../src/ui/Walkthrough.tsx";
import { PAGE_HELP } from "../src/ui/pageHelp.ts";
import { sentenceBreaks, sentencesOf } from "../src/copy/rules.ts";

const RAIL = readFileSync("src/flow/StationRail.tsx", "utf8");
const LOOP = readFileSync("src/flow/StationLoop.tsx", "utf8");

const listed = (names: readonly string[]) =>
  names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

describe("ISC-698: the framework's name", () => {
  test("the name is Matthew's, capitalised as written", () => {
    expect(FRAMEWORK_NAME).toBe("Qualitative Discovery Process Framework");
  });

  test("the front page's section and screen 2 carry the name", () => {
    expect(STEPS_HEADING).toBe("The Qualitative Discovery Process Framework");
    expect(WALKTHROUGH_TITLES[1]).toBe(STEPS_HEADING);
  });

  test("the Design rail's figure carries the name as its caption", () => {
    // The rail passes the caption; the shared figure draws it above the rings
    // and names the rings by it for a screen reader.
    expect(RAIL).toMatch(/<StationLoop[^>]*caption=\{FRAMEWORK_CAPTION\}/);
    expect(RAIL).toContain("FRAMEWORK_CAPTION");
    expect(LOOP).toContain('data-testid={`${props.testIdPrefix}-caption`}');
    expect(LOOP).toMatch(/aria-label=\{props\.caption/);
  });

  test("Design's Help names the framework and carries the lede", () => {
    const steps = PAGE_HELP.design.parts.find((p) => p.name === "Steps");
    expect(steps?.says.join(" ")).toContain(FRAMEWORK_NAME);
    // M86, ISC-718: Help prints the lede away from the figure, so without "below".
    expect(steps?.says).toContain(TWO_LOOPS_LEDE_IN_HELP);
    expect(TWO_LOOPS_LEDE_IN_HELP).not.toContain("below");
    expect(TWO_LOOPS_LEDE_IN_HELP).toBe(TWO_LOOPS_LEDE.replace(" below", ""));
  });
});

describe("ISC-698: the fuller lede", () => {
  const sentences = sentencesOf(TWO_LOOPS_LEDE);

  test("three to six sentences, the front page's and screen 2's lede alike", () => {
    // M86, ISC-718: the owner's lede of 2026-10-14 runs to six sentences.
    expect(sentences.length).toBeGreaterThanOrEqual(3);
    expect(sentences.length).toBeLessThanOrEqual(6);
    expect(STEPS_LEDE).toBe(TWO_LOOPS_LEDE);
  });

  test("Abductive uses the framework to take you through the design", () => {
    expect(sentences[0]).toBe(
      `Abductive uses the ${FRAMEWORK_NAME} below to take you through the design of your qualitative project.`,
    );
  });

  test("each loop's steps, read off STATIONS, and what they are for", () => {
    const outer = listed(stationsIn("outer").map((s) => s.label));
    const inner = listed(stationsIn("inner").map((s) => s.label));
    expect(outer).toBe("Context, Process, Outcome and Site");
    expect(inner).toBe("Puzzle and Bind");
    expect(TWO_LOOPS_LEDE).toContain(`the empirical basis of a strong theoretical contribution in the outer loop: ${outer}.`);
    expect(TWO_LOOPS_LEDE).toContain(`the most interesting and puzzling parts of your data, and the tensions within them, in the inner loop: ${inner}.`);
    expect(TWO_LOOPS_LEDE).toContain("Answering one step changes what the AI will ask at other steps.");
  });

  test("after the six, you describe your sampling approach and bring in early data (M86, ISC-718)", () => {
    const outside = listed(stationsIn("external").map((s) => s.label));
    expect(outside).toBe("Sample and Early data");
    expect(TWO_LOOPS_LEDE).toContain(
      "Once you've answered all six, you can move to describing your sampling approach and bring in early data if you have any.",
    );
  });

  test("every sentence under the copy rules, and no 'model' for the figure", () => {
    for (const s of sentences) {
      expect({ s, breaks: sentenceBreaks(s).map((b) => b.rule) }).toEqual({ s, breaks: [] });
      expect({ s, words: s.split(/\s+/).length <= 25 }).toEqual({ s, words: true });
    }
    expect(TWO_LOOPS_LEDE).not.toMatch(/\bmodel\b/i);
    expect(TWO_LOOPS_LEDE).not.toMatch(/[—–]/);
  });
});
