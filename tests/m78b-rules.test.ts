/**
 * M78b, ISC-682: the scan's gaps that the serendipity walk found
 * (docs/walks/2026-10-03-serendipity-walk.md, "Abductive's prose against the
 * owner's rules"). Each sentence below is Abductive's final reply on the walk,
 * quoted, and the scan let every one of them through.
 */
import { describe, expect, test } from "bun:test";
import { sentenceBreaks, type RuleId } from "../src/copy/rules.ts";

const rules = (s: string): readonly RuleId[] => sentenceBreaks(s).map((b) => b.rule);

describe("L17: the walk's things that act", () => {
  const walk = [
    "That tells me the crib still produces leads on some days, and that some leads have moved elsewhere.",
    "It shows that at least one lead since May did not pass through the crib, and you've told me the kettle founder gave you a habit without offering an example.",
    "Dave's \"It's calmer, and everyone wanted calmer\" and the battery founder's \"a really good change\" both describe the booking system as a gain, and her remark that she didn't really go to the crib to meet people tells me she wasn't looking for encounters in the first place.",
    "Priya's \"drive-by help\" and her line that the calendar had made her \"a worse neighbour\" show a helper letting the next booking settle the pull for her, and that gives the helpers a concrete source like the one Dave has.",
    "The March episode with Priya, the motor controller and the oscilloscope queue gives me a clear picture of the way that the crib works as a place.",
  ];
  for (const sentence of walk) {
    test(sentence.slice(0, 60), () => {
      expect(rules(sentence)).toContain("L17");
    });
  }

  test("a person who tells, gives or shows still passes", () => {
    for (const s of [
      "You told me that the crib changed in May.",
      "Dave tells me that the whiteboard has gone.",
      "You've given me two reasons for the crib.",
      "The founders tell me that the booking system is a gain.",
      "Priya gave him the supplier's contact on the spot.",
      "That means you'd compare the same founders in the two periods.",
    ]) {
      expect({ s, rules: rules(s).filter((r) => r === "L17") }).toEqual({ s, rules: [] });
    }
  });
});

describe("L18: a relative clause that ends on a stranded preposition", () => {
  test("the walk's 20:52 sentence, which the retry introduced", () => {
    expect(
      rules(
        "Eight months of two days a week at the tool crib gives you a lot to look at, and I can see the reason that a bounded place that encounters happen in or fail to happen in appeals to you.",
      ),
    ).toContain("L18");
  });
  test("a relative with its preposition in front passes", () => {
    expect(rules("I can see the appeal of a bounded place in which encounters happen.").filter((r) => r === "L18")).toEqual([]);
  });
});

describe("L13: the triggers the walk lists", () => {
  for (const s of [
    "You haven't answered what Merton and Barber 2004 expects.",
    "You said what the crib was like before May.",
    "I know where the founders queue.",
    "I can see why the crib appeals to you.",
    "You've told me about it mostly through what founders reported to you.",
  ]) {
    test(s, () => {
      expect(rules(s)).toContain("L13");
    });
  }
  test("a question still keeps its wh-word", () => {
    expect(rules("Have you answered what the paper expects?")).not.toContain("L13");
  });
});
