/**
 * M85, ISC-713: the Process question.
 *
 * A co-author (2026-10-13): "the expression 'What is the process that you are
 * following?' is difficult to understand. It is not clear which process the
 * sentence refers to. Instead, we might write 'If your study unfolds over time,
 * what is the time period that you are studying? And during this period of
 * time, what is the central phenomenon that you are interested in tracking over
 * time? If your study is a variance study, then what is your unit of analysis
 * and where are you observing variance?'"
 *
 * Matthew's ruling (2026-10-14): her framing, with the questions of variance
 * and unit of analysis as follow-ups inside the step rather than in the
 * headline; the unit already has its field at Context (M84).
 *
 * Held here: the station's text; the follow-up lines present only in the
 * specifics register (after a saved answer); the unit of analysis not asked
 * when Context carries one, and asked as a follow-up when Context's field is
 * empty.
 */

import { describe, expect, test } from "bun:test";
import { conversationPrompt, type ConversationPromptInput } from "../src/interview/conversationPrompt.ts";
import {
  PROCESS_FOLLOW_UP,
  UNIT_EMPTY_FOLLOW_UP,
  UNIT_KNOWN_LINE,
  registerLines,
  stepBoundsBlock,
} from "../src/interview/register.ts";
import { STATIONS, stationById, type StationId } from "../src/flow/stations.ts";
import { PAGE_HELP } from "../src/ui/pageHelp.ts";
import type { UnitOfAnalysis } from "../src/interview/unitOfAnalysis.ts";

const process = stationById("process");

function promptAt(place: StationId, stepAnswered: boolean, unit?: UnitOfAnalysis): string {
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
    design: { stations: [], ...(unit === undefined ? {} : { unit }) },
  };
  return conversationPrompt(input);
}

describe("ISC-713: the station's text, in the co-author's framing", () => {
  test("the headline asks for the period and the phenomenon tracked through it", () => {
    expect(process.prompt).toBe(
      "What period of time will you study, and what central phenomenon do you plan to track through that period?",
    );
    expect(process.prompt.endsWith("?")).toBe(true);
    expect(process.prompt).not.toMatch(/process that you're following/);
    // Variance and the unit are follow-ups, out of the headline.
    expect(process.prompt).not.toMatch(/varian|unit of analysis/i);
  });

  test("the blurb and the feeds line follow", () => {
    expect(process.blurb).toBe("The period that your project covers, and the phenomenon that you plan to follow through that period.");
    expect(process.feeds).toBe(
      "Your sample hangs off this answer. Until you can name the phenomenon and its period, you can't name the people or the material that would show the phenomenon across that period.",
    );
  });

  test("Design's Help at Process reads the new blurb and feeds", () => {
    // HelpControl puts the step's blurb and feeds under the step's name.
    expect(PAGE_HELP.design.title).toBe("Design");
    expect(`${process.blurb} ${process.feeds}`).toContain("the phenomenon");
  });

  test("every other step's prompt reads Process in the new terms", () => {
    for (const s of STATIONS.filter((x) => x.id !== "process")) {
      expect(stepBoundsBlock(s.id).join("\n")).toContain(
        "- Process is about the period that their project covers, and the phenomenon that they plan to follow through that period; do not ask about it here.",
      );
    }
  });
});

describe("ISC-713: variance and the unit come as follow-ups, after a saved answer", () => {
  test("the follow-up lines, pinned", () => {
    expect(PROCESS_FOLLOW_UP).toBe(
      "- Ask next about variation: how they expect the phenomenon that they'll track to vary across their period and, where their project compares cases, the cases in which they expect the variation to show.",
    );
    expect(UNIT_KNOWN_LINE).toBe("- They identified their unit of analysis at Context. Read the unit from there, and do not ask for it again.");
    expect(UNIT_EMPTY_FOLLOW_UP).toBe(
      "- The unit of analysis at Context is still empty. After the question about variation, ask which unit the variation shows in: a person, a team, an organisation, a community or a field.",
    );
  });

  test("before a saved answer the follow-ups are absent", () => {
    for (const unit of [undefined, "community"] as const) {
      const lines = registerLines("process", false, unit).join("\n");
      expect(lines).not.toContain(PROCESS_FOLLOW_UP);
      expect(lines).not.toContain(UNIT_EMPTY_FOLLOW_UP);
      expect(lines).not.toContain(UNIT_KNOWN_LINE);
      expect(promptAt("process", false, unit)).not.toContain(PROCESS_FOLLOW_UP);
    }
  });

  test("after a saved answer, variation is the next question", () => {
    const text = promptAt("process", true, "community");
    expect(text).toContain(PROCESS_FOLLOW_UP);
  });

  test("with a unit named at Context, the prompt reads it and does not ask for it again", () => {
    const text = promptAt("process", true, "community");
    expect(text).toContain(UNIT_KNOWN_LINE);
    expect(text).not.toContain(UNIT_EMPTY_FOLLOW_UP);
    expect(text).not.toMatch(/ask which unit/i);
    expect(text).toContain("Their unit of analysis is communities");
  });

  test("with Context's unit field empty, the unit comes after the question about variation", () => {
    const text = promptAt("process", true);
    expect(text).toContain(UNIT_EMPTY_FOLLOW_UP);
    expect(text).not.toContain(UNIT_KNOWN_LINE);
    expect(text.indexOf(PROCESS_FOLLOW_UP)).toBeLessThan(text.indexOf(UNIT_EMPTY_FOLLOW_UP));
  });

  test("the follow-ups belong to Process alone", () => {
    for (const s of STATIONS.filter((x) => x.id !== "process")) {
      const text = promptAt(s.id, true);
      expect({ id: s.id, has: text.includes(PROCESS_FOLLOW_UP) || text.includes(UNIT_EMPTY_FOLLOW_UP) }).toEqual({
        id: s.id,
        has: false,
      });
    }
  });
});
