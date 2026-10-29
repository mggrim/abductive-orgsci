/**
 * M75, ISC-670 (the owner, 2026-10-03): "Change the question 'What in this
 * paper bears on your setting?' to 'How does this paper relate to your
 * setting?'" The flag and topic labels follow in affirmative form, and
 * "bearing" as a noun goes with the question.
 *
 * The brief's own label ("a paper whose relation to your setting you haven't
 * stated") puts the subject after the object, which L18 rejects, so the labels
 * read "a paper that you haven't related to your setting".
 */

import { describe, expect, test } from "bun:test";
import { BEARING_QUESTION, BEARING_SAID_HEAD } from "../src/views/paperBearings.ts";
import { topicLabel } from "../src/interview/topicLabel.ts";
import { sentenceBreaks } from "../src/copy/rules.ts";
import { FILES, proseRuns } from "./copyBarScan.ts";

describe("M75: how a paper relates to your setting (ISC-670)", () => {
  test("the question is the owner's wording", () => {
    expect(BEARING_QUESTION).toBe("How does this paper relate to your setting?");
  });

  test("the topic and the bearing head say 'related to your setting'", () => {
    expect(topicLabel("lint:paper-bearing-unstated:x")).toBe("a paper that you haven't related to your setting");
    expect(BEARING_SAID_HEAD).toBe("This paper's relation to your setting, in your words");
  });

  test("every new line keeps the copy rules", () => {
    for (const line of [
      BEARING_QUESTION,
      BEARING_SAID_HEAD,
      topicLabel("lint:paper-bearing-unstated:x"),
    ]) {
      expect(sentenceBreaks(line)).toEqual([]);
    }
  });

  test("Anti: no rendered run says 'bears on', 'bearing on' or 'bearing' as a noun", () => {
    const found: string[] = [];
    for (const { path, text } of FILES) {
      for (const run of proseRuns(text)) {
        if (/\bbears? on\b|\bbearing on\b|\b(?:the|its|a|this paper's|paper's)\s+bearings?\b/i.test(run)) {
          found.push(`${path}: ${run.slice(0, 100)}`);
        }
      }
    }
    expect(found).toEqual([]);
  });
});
