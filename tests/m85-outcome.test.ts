/**
 * M85, ISC-714: the Outcome question.
 *
 * A co-author (2026-10-13): "it is difficult for people to answer the question
 * 'What differences in outcome would you have to observe for this project to be
 * worth doing?' Instead could we write something like 'Which outcome/phenomena
 * are you tracking? Which variance do you see in this outcome? Why do you think
 * that this variance is important? Do you think that this variance is large
 * enough to make for an interesting and important paper?'"
 *
 * Matthew's ruling (2026-10-14): her framing, worded so that a researcher before
 * the field can answer: what they are interested in studying, or beginning to
 * see. Held here: the station's text, the follow-up present only in the
 * specifics register.
 */

import { describe, expect, test } from "bun:test";
import { conversationPrompt, type ConversationPromptInput } from "../src/interview/conversationPrompt.ts";
import { OUTCOME_FOLLOW_UP, registerLines, stepBoundsBlock } from "../src/interview/register.ts";
import { STATIONS, stationById, type StationId } from "../src/flow/stations.ts";

const outcome = stationById("outcome");

function promptAt(place: StationId, stepAnswered: boolean): string {
  const s = stationById(place);
  const input: ConversationPromptInput = {
    place,
    placeLabel: s.label,
    purpose: s.blurb,
    stationQuestion: s.prompt,
    mode: "interrogation",
    opener: false,
    nothingWrittenYet: false,
    stepAnswered,
    chunks: [],
    ontologySummary: "",
    here: [],
    earlier: [],
  };
  return conversationPrompt(input);
}

describe("ISC-714: the station's text, in the co-author's framing, for a researcher before the field", () => {
  test("the headline asks for the outcome, the variation in it and the reason that the variation matters", () => {
    expect(outcome.prompt).toBe(
      "Which outcome or phenomenon do you want to study, what variation in that outcome do you expect to find, and why would that variation matter?",
    );
    expect(outcome.prompt).not.toMatch(/would you have to observe|worth doing/);
    // M92 (Matthew, 2026-10-15): forward, so the variation is the one that they expect to find.
    expect(outcome.prompt).toMatch(/expect to find/);
    expect(outcome.prompt).not.toMatch(/expect or see/);
    // C1: at most 25 words.
    expect(outcome.prompt.split(/\s+/).length).toBeLessThanOrEqual(25);
  });

  test("the blurb and the feeds line follow", () => {
    expect(outcome.blurb).toBe(
      "The outcome that you want to study, the variation in that outcome that you expect to find, and the reason that the variation would matter.",
    );
    expect(outcome.feeds).toBe(
      "Abductive keeps this answer apart from your answer at Process, because a process and its outcome are two different questions.",
    );
  });

  test("every other step's prompt reads Outcome in the new terms", () => {
    for (const s of STATIONS.filter((x) => x.id !== "outcome")) {
      expect(stepBoundsBlock(s.id).join("\n")).toContain(
        "- Outcome is about the outcome that they want to study, the variation in that outcome that they expect to find, and the reason that the variation would matter; do not ask about it here.",
      );
    }
  });
});

describe("ISC-714: the follow-up comes after a saved answer", () => {
  test("pinned", () => {
    expect(OUTCOME_FOLLOW_UP).toBe(
      "- Ask next whether the variation that they identified is large enough to carry an interesting and important paper.",
    );
  });

  test("absent before a saved answer, present after, and at Outcome alone", () => {
    expect(registerLines("outcome", false).join("\n")).not.toContain(OUTCOME_FOLLOW_UP);
    expect(promptAt("outcome", false)).not.toContain(OUTCOME_FOLLOW_UP);
    expect(promptAt("outcome", true)).toContain(OUTCOME_FOLLOW_UP);
    for (const s of STATIONS.filter((x) => x.id !== "outcome")) {
      expect({ id: s.id, has: promptAt(s.id, true).includes(OUTCOME_FOLLOW_UP) }).toEqual({ id: s.id, has: false });
    }
  });
});
