/**
 * M84, ISC-703 and ISC-704: the interview's register.
 *
 * A co-author (2026-10-07): "the questions that I am getting from Abductive
 * when I am filling out 'process' seem to be very similar to the ones which I
 * am filling out when I am filling out 'outcome.' … initially, the tool should
 * ask for big picture overviews and then move to want to have data examples
 * over time. I was a little overwhelmed with being pushed for data examples
 * very early."
 *
 * ISC-703: the tool is for the design stage, so a step's prompt asks for what
 * the researcher knows of the setting and the literature, and asks for an
 * instance from data only at Early data.
 *
 * ISC-704: two registers read from the record. Before a step has a saved
 * answer the prompt asks for the big picture; after, it may press for
 * specifics. And every step's prompt says what each other step covers, written
 * once from STATIONS.
 */

import { describe, expect, test } from "bun:test";
import { conversationPrompt, type ConversationPromptInput } from "../src/interview/conversationPrompt.ts";
import { stepBoundsBlock, OVERVIEW_LINE } from "../src/interview/register.ts";
import { STATIONS, stationById, type StationId } from "../src/flow/stations.ts";

function promptAt(place: StationId, stepAnswered: boolean, opener = false): string {
  const s = stationById(place);
  const input: ConversationPromptInput = {
    place,
    placeLabel: s.label,
    purpose: s.blurb,
    stationQuestion: s.prompt,
    mode: "interrogation",
    opener,
    nothingWrittenYet: false,
    stepAnswered,
    chunks: [],
    ontologySummary: "",
    here: [],
    earlier: [],
  };
  return conversationPrompt(input);
}

/** An ask for an instance, a date or an example from the researcher's data. */
const INSTANCE_ASK = /\bone instance(?! of that process)\b|\bone person\b|\bone thing that they saw\b|\bone passage\b|\bone moment that they recorded\b/i;

const NOT_EARLY = STATIONS.filter((s) => s.id !== "early-data").map((s) => s.id);

describe("ISC-703: the design stage, before data", () => {
  for (const id of NOT_EARLY) {
    test(`${id}: the prompt asks for knowledge of the setting and reserves data instances to Early data`, () => {
      for (const answered of [false, true]) {
        const text = promptAt(id, answered);
        expect(text).toContain("before data collection");
        expect(text).toContain("Ask for an instance from their data only at Early data.");
        expect(text).toMatch(/one place, one practice, one kind of document that they expect to find there/);
        expect({ id, answered, ask: INSTANCE_ASK.exec(text)?.[0] ?? null }).toEqual({ id, answered, ask: null });
      }
    });
  }

  test("early-data: the prompt may ask for one instance from the material", () => {
    const text = promptAt("early-data", true);
    expect(text).toMatch(/At Early data, ask for one instance from their material/);
    expect(text).not.toContain("Ask for an instance from their data only at Early data.");
  });
});

describe("ISC-704: overview first, specifics after a saved answer", () => {
  for (const s of STATIONS) {
    test(`${s.id}: before a saved answer, the prompt asks for the big picture and asks for nothing specific`, () => {
      const text = promptAt(s.id, false);
      expect(text).toContain(OVERVIEW_LINE(s.label));
      expect(text).toContain(
        `The researcher has not yet saved an answer for this step. Ask for the big picture of ${s.label} in one question. Do not ask for instances, dates or examples yet.`,
      );
      expect(text).not.toMatch(/You may now press for specifics/);
    });

    test(`${s.id}: after a saved answer, the prompt may press for specifics`, () => {
      const text = promptAt(s.id, true);
      expect(text).not.toContain(OVERVIEW_LINE(s.label));
      expect(text).toMatch(/You may now press for specifics/);
    });
  }

  test("the opener at a step with no saved answer asks for the big picture too", () => {
    expect(promptAt("process", false, true)).toContain(OVERVIEW_LINE("Process"));
  });
});

describe("ISC-704: each step says what the other steps cover", () => {
  for (const s of STATIONS) {
    test(`${s.id}: the block names every other step, each as not this step's question`, () => {
      const block = stepBoundsBlock(s.id).join("\n");
      const text = promptAt(s.id, false);
      expect(text).toContain(block);
      expect(block).toContain(`This step is ${s.label}`);
      for (const other of STATIONS) {
        if (other.id === s.id) continue;
        expect({ step: s.id, other: other.id, named: block.includes(`- ${other.label} is about `) }).toEqual({
          step: s.id,
          other: other.id,
          named: true,
        });
      }
    });
  }

  test("Process says Outcome is not its question, and Outcome says the same of Process", () => {
    const process = stepBoundsBlock("process").join("\n");
    const outcome = stepBoundsBlock("outcome").join("\n");
    // M85, ISC-713 and ISC-714: the co-author's framings of 2026-10-13.
    expect(process).toContain(
      "- Outcome is about the outcome that they want to study, the variation in that outcome that they expect to find, and the reason that the variation would matter; do not ask about it here.",
    );
    expect(outcome).toContain(
      "- Process is about the period that their project covers, and the phenomenon that they plan to follow through that period; do not ask about it here.",
    );
    expect(process).not.toMatch(/- Process is about/);
    expect(outcome).not.toMatch(/- Outcome is about/);
  });

  test("the block is written from STATIONS, so a blurb's change reaches it", () => {
    for (const s of STATIONS) {
      const own = stepBoundsBlock(s.id).join("\n");
      expect(own).toContain(s.prompt);
    }
  });
});
