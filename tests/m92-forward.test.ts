/**
 * M92, ISC-742 to ISC-746: Sample asks what stays constant, and every question
 * faces forward.
 *
 * Matthew, 2026-10-15: "The sample section should also push not just on what
 * needs to vary but also what should remain cosistent across the sample.
 * More generally, questions from the tool need to be focused on what the
 * research will focus or wants to explore? It should be future facing".
 *
 * Checked here: the Sample question, probes and register lines name the
 * constants as well as the variation; every station prompt and every probe
 * outside Early data is free of the backward forms; the model's instructions
 * carry the forward rule at every place but Early data, and Early data's
 * question and rule end on what comes next.
 */

import { describe, expect, test } from "bun:test";
import { conversationPrompt, type ConversationPromptInput } from "../src/interview/conversationPrompt.ts";
import {
  EARLY_DATA_RULE,
  FORWARD_RULE,
  SAMPLE_FOLLOW_UP,
  SAMPLE_OVERVIEW_LINE,
  registerLines,
} from "../src/interview/register.ts";
import { allProbes, stationProbes } from "../src/interview/stationProbes.ts";
import { STATIONS, stationById, type StationId } from "../src/flow/stations.ts";
import { generateMoves } from "../src/interview/moves.ts";
import { emptyBrief } from "../src/state/projects.ts";

/** The backward forms: asking what they have seen, noticed, observed, found or tried, or for a past moment. */
const BACKWARD: readonly RegExp[] = [
  /\bhave (?:you|they) (?:already )?(?:seen|noticed|observed|found|tried)\b/i,
  /\b(?:you|they) (?:have|'ve) (?:already )?(?:seen|noticed|observed|found|tried)\b/i,
  /\bhas (?:anyone|anything)\b/i,
  /\bdid (?:you|they)\b/i,
  /\bwhen did\b/i,
  /\balready (?:tried|seen|shown|found)\b/i,
  /\bwhat struck\b/i,
  /\bwhat (?:you|they) noticed\b/i,
];

function backward(text: string): string | null {
  for (const re of BACKWARD) {
    const m = re.exec(text);
    if (m !== null) return m[0];
  }
  return null;
}

const NOT_EARLY: readonly StationId[] = STATIONS.filter((s) => s.id !== "early-data").map((s) => s.id);

function promptAt(place: StationId, stepAnswered: boolean, opener = false): string {
  const s = stationById(place);
  const input: ConversationPromptInput = {
    place,
    placeLabel: s.label,
    purpose: s.blurb,
    stationQuestion: s.prompt,
    mode: "interrogation",
    opener,
    nothingWrittenYet: opener,
    stepAnswered,
    chunks: [],
    ontologySummary: "",
    here: [],
    earlier: [],
    design: { stations: [] },
  };
  return conversationPrompt(input);
}

const CONSTANT = /\bconstant|\bshare by design/i;
const VARY = /\bvar(?:y|ies|iation)\b/i;

describe("ISC-742 and ISC-744: Sample asks what stays constant as well as what varies", () => {
  const sample = stationById("sample");

  test("the station's question names both the variation and the constants", () => {
    // The owner's wording, 2026-10-15, verbatim: three questions in one prompt.
    expect(sample.prompt).toBe(
      "What comparisons are you looking to explore? How would your sample need to vary in order to adequately examine those comparisons? And what would you ideally want to hold constant across the sample?",
    );
    expect(sample.prompt).toMatch(/comparisons/);
    expect(sample.prompt).toMatch(VARY);
    expect(sample.prompt).toMatch(CONSTANT);
  });

  test("the blurb and the feeds line name the sample's logic: the variation and the constants", () => {
    expect(sample.blurb).toMatch(VARY);
    expect(sample.blurb).toMatch(CONSTANT);
    expect(sample.blurb).toMatch(/comparisons/);
    expect(sample.feeds).toMatch(/your comparisons, the variation and the constants/);
  });

  test("a probe in each register before a full answer, and after one, pushes on the constants", () => {
    const brief = emptyBrief();
    const empty = stationProbes("sample", brief, 0);
    const thin = stationProbes("sample", { ...brief, sampleRationale: "Founders in two cohorts." }, 0);
    const stated = stationProbes("sample", { ...brief, sampleRationale: "x".repeat(200) }, 0);
    for (const [name, probes] of [["empty", empty], ["thin", thin], ["stated", stated]] as const) {
      expect({ name, constants: probes.some((p) => CONSTANT.test(p.question)) }).toEqual({ name, constants: true });
    }
    // The stated set asks what the cases share, why, and what a case that broke a constant would do.
    const questions = stated.map((p) => p.question).join("\n");
    expect(questions).toContain("share by design, and why");
    expect(questions).toContain("a case that broke one of those constants");
  });

  test("the model is told about the constants in both registers at Sample, and only at Sample", () => {
    const before = registerLines("sample", false);
    const after = registerLines("sample", true);
    expect(before).toContain(SAMPLE_OVERVIEW_LINE);
    expect(after).toContain(SAMPLE_FOLLOW_UP);
    expect(SAMPLE_OVERVIEW_LINE).toMatch(CONSTANT);
    expect(SAMPLE_OVERVIEW_LINE).toMatch(/comparisons/);
    expect(SAMPLE_FOLLOW_UP).toMatch(CONSTANT);
    expect(SAMPLE_FOLLOW_UP).toContain("what a case that broke a constant would do to their comparison");
    expect(promptAt("sample", false)).toContain(SAMPLE_OVERVIEW_LINE);
    expect(promptAt("sample", true)).toContain(SAMPLE_FOLLOW_UP);
    for (const id of STATIONS.map((s) => s.id).filter((id) => id !== "sample")) {
      for (const answered of [false, true]) {
        const text = promptAt(id, answered);
        expect({ id, answered, sample: text.includes(SAMPLE_OVERVIEW_LINE) || text.includes(SAMPLE_FOLLOW_UP) }).toEqual({
          id,
          answered,
          sample: false,
        });
      }
    }
  });
});

describe("ISC-742, ISC-743 and ISC-746: every question faces forward", () => {
  test("every station prompt outside Early data is free of the backward forms", () => {
    for (const id of NOT_EARLY) {
      const s = stationById(id);
      expect({ id, hit: backward(s.prompt) }).toEqual({ id, hit: null });
      expect({ id, blurb: backward(s.blurb) }).toEqual({ id, blurb: null });
    }
  });

  test("every probe outside Early data, question and reason, is free of the backward forms", () => {
    const probes = allProbes().filter((p) => p.station !== "early-data");
    expect(probes.length).toBeGreaterThan(20);
    for (const p of probes) {
      expect({ q: p.question, hit: backward(p.question) }).toEqual({ q: p.question, hit: null });
      expect({ r: p.rationale, hit: backward(p.rationale) }).toEqual({ r: p.rationale, hit: null });
    }
  });

  test("the Bind question asks which tension the researcher expects, and who they expect to feel it", () => {
    expect(stationById("bind").prompt).toBe(
      "What tension do you expect the people in your setting to face, and who do you expect to feel that tension?",
    );
    const bind = allProbes().filter((p) => p.station === "bind").map((p) => `${p.question} ${p.rationale}`).join("\n");
    expect(bind).not.toMatch(/\bhave seen\b|\bhave observed\b/);
    expect(bind).toContain("Where in the field do you plan to look for this tension");
  });

  test("the station questions in their M92 wording", () => {
    expect(stationById("context").prompt).toBe("What setting do you plan to study, and what draws you to that setting?");
    expect(stationById("process").prompt).toBe(
      "What period of time will you study, and what central phenomenon do you plan to track through that period?",
    );
    expect(stationById("outcome").prompt).toBe(
      "Which outcome or phenomenon do you want to study, what variation in that outcome do you expect to find, and why would that variation matter?",
    );
  });

  test("Early data's question keeps the material in hand and turns forward at the end", () => {
    const early = stationById("early-data").prompt;
    expect(early).toBe(
      "What has your early material shown you that you didn't expect, and what does that surprise make you want to explore next?",
    );
    expect(early).toMatch(/explore next\?$/);
    // Each of its probes ends on what the researcher will do or look for next.
    for (const p of allProbes().filter((x) => x.station === "early-data")) {
      expect({ q: p.question, next: /\b(?:will you|do you expect|explore next|look for)\b/.test(p.question) }).toEqual({
        q: p.question,
        next: true,
      });
    }
  });

  test("the questions that the move generator writes are free of the backward forms", () => {
    const src = Bun.file(new URL("../src/interview/moves.ts", import.meta.url));
    return src.text().then((text) => {
      const questions = [...text.matchAll(/question:\s*(?:\n\s*)?["`]([^"`]+)["`]/g)].map((m) => m[1] ?? "");
      expect(questions.length).toBeGreaterThan(5);
      for (const q of questions) expect({ q, hit: backward(q) }).toEqual({ q, hit: null });
      expect(typeof generateMoves).toBe("function");
    });
  });
});

describe("ISC-745: the model's instructions carry the forward rule", () => {
  test("the rule, in the prompt's own voice", () => {
    expect(FORWARD_RULE).toBe(
      "- Outside Early data, ask what the researcher plans to study, expects to find and wants to explore. Do not ask what they have already seen, noticed or found.",
    );
    expect(FORWARD_RULE).not.toMatch(/\bnever\b/i);
  });

  test("every place but Early data carries it, in both registers, at the framing too", () => {
    for (const id of NOT_EARLY) {
      for (const answered of [false, true]) {
        expect({ id, answered, has: promptAt(id, answered).includes(FORWARD_RULE) }).toEqual({ id, answered, has: true });
      }
    }
    expect(registerLines("framing", false)).toContain(FORWARD_RULE);
    for (const answered of [false, true]) {
      expect(promptAt("early-data", answered)).not.toContain(FORWARD_RULE);
    }
  });

  test("Early data's rule asks for an instance and ends on what it makes them want to explore next", () => {
    expect(EARLY_DATA_RULE).toContain("ask for one instance from their material");
    expect(EARLY_DATA_RULE).toMatch(/look for or explore next\.$/);
    expect(promptAt("early-data", true)).toContain(EARLY_DATA_RULE);
  });

  test("the instructions written for the model outside Early data are free of the backward forms", () => {
    for (const id of NOT_EARLY) {
      for (const answered of [false, true]) {
        for (const opener of [false, true]) {
          // The forward rule names the backward forms in order to forbid them.
          const text = promptAt(id, answered, opener).replace(FORWARD_RULE, "");
          expect({ id, answered, opener, hit: backward(text) }).toEqual({ id, answered, opener, hit: null });
        }
      }
    }
  });
});
