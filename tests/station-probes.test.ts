/**
 * Socratic probes at the station (ISC-209 … ISC-220).
 *
 * The stations and the interview loop were built two milestones apart and
 * never introduced: nothing in `src/interview/` mentioned a station, so
 * standing at a station you got a fixed sentence from a constant file and a
 * textarea while the dialogue beside it asked about the graph. These are
 * content tests, like the station prompts and the bias glossary, because the
 * questions are the product.
 */

import { describe, expect, test } from "bun:test";
import { STATIONS, STATION_IDS } from "../src/flow/stations.ts";
import { allProbes, stationProbes, THIN } from "../src/interview/stationProbes.ts";
import { generateMoves } from "../src/interview/moves.ts";
import { emptyBrief, type ProjectBrief } from "../src/state/projects.ts";
import { MATRIX } from "../src/matrix/matrix.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectInterview } from "../src/interview/state.ts";

const PROJECT = "33333333-3333-3333-3333-333333333333";

const FILLED: ProjectBrief = {
  ...emptyBrief(),
  bind:
    "Openness against reputational closure. The people I have spoken to describe both in the same breath and neither gives way.",
};

describe("every station can be pressed", () => {
  // D3: eight stations became seven when challenge and tension merged.
  test("each of the seven has probes for empty, thin, and stated (ISC-209)", () => {
    for (const s of STATIONS) {
      expect(stationProbes(s.id, emptyBrief(), 0).length).toBeGreaterThan(0);
      const thin = { ...emptyBrief(), [s.id === "site" ? "siteRationale" : "context"]: "short" };
      expect(stationProbes(s.id, thin as ProjectBrief, 0).length).toBeGreaterThan(0);
    }
  });

  test("every probe is a question, never an instruction (ISC-210)", () => {
    for (const p of allProbes()) expect(p.question.trim().endsWith("?")).toBe(true);
  });

  test("every probe states why it is being asked (ISC-211)", () => {
    for (const p of allProbes()) expect(p.rationale.trim().length).toBeGreaterThan(30);
  });

  test("Anti: no probe suggests what to write (ISC-212)", () => {
    // Suggesting the answer is the assistant doing the researcher's bounding
    // for them, which is the move this whole tool exists to prevent.
    const banned = /\byou should\b|\btry writing\b|\bconsider saying\b|\bfor example, write\b|\bI suggest\b/i;
    for (const p of allProbes()) expect(banned.test(p.question)).toBe(false);
  });

  test("Anti: the tension probes import no literature (ISC-213)", () => {
    const prose = allProbes()
      .filter((p) => p.station === "bind")
      .map((p) => `${p.question} ${p.rationale}`)
      .join(" ")
      .toLowerCase();
    expect(prose).not.toContain("paradox");
    expect(prose).not.toContain("literature");
  });

  test("an empty station is asked what makes it hard, not nagged (ISC-214)", () => {
    const probes = stationProbes("outcome", emptyBrief(), 0);
    expect(probes).toHaveLength(1);
    expect(probes[0]!.question.toLowerCase()).toContain("outcome");
  });

  test("a thin answer gets a different probe from an empty one (ISC-215)", () => {
    const empty = stationProbes("bind", emptyBrief(), 0)[0]!.question;
    const thin = stationProbes("bind", { ...emptyBrief(), bind: "openness vs closure" }, 0)[0]!
      .question;
    expect(thin).not.toBe(empty);
  });

  test("a full answer is pressed on its content (ISC-216)", () => {
    expect(FILLED.bind.length).toBeGreaterThan(THIN);
    const probes = stationProbes("bind", FILLED, 0);
    expect(probes.length).toBeGreaterThan(1);
    expect(probes.map((p) => p.question)).not.toContain(
      stationProbes("bind", emptyBrief(), 0)[0]!.question,
    );
  });

  test("returning to a station does not repeat the same question (ISC-217)", () => {
    const first = stationProbes("bind", FILLED, 0)[0]!.question;
    const second = stationProbes("bind", FILLED, 0, 1)[0]!.question;
    expect(second).not.toBe(first);
  });

  /* D5 gave this step a box, so the criterion gains a half rather than losing
   * one: with nothing typed it is still pressed on the corpus, which is the
   * state it is usually in, and what the researcher writes there outranks the
   * corpus once there is something to read. Pressing on the material while
   * ignoring a direct answer to the step's own question is the loop not
   * listening. The full reading is in `early-data-field.test.ts`. */
  test("early-data is pressed on the corpus, and on its own box once that holds text (ISC-218)", () => {
    const none = stationProbes("early-data", emptyBrief(), 0)[0]!.question;
    const some = stationProbes("early-data", emptyBrief(), 12)[0]!.question;
    expect(some).not.toBe(none);

    const written: ProjectBrief = {
      ...emptyBrief(),
      earlySurprise:
        "They describe the handover as something that happens to them rather than something they decide, which is not what I expected to hear.",
    };
    const typed = stationProbes("early-data", written, 0);
    expect(typed[0]!.question).not.toBe(none);
    expect(typed.length).toBeGreaterThan(1);
  });
});

describe("the loop asks about the station you are on", () => {
  const base = {
    graph: projectOntology([], PROJECT),
    findings: [],
    state: projectInterview([], PROJECT),
    coveredCells: [],
    matrix: MATRIX,
    turnIndex: 0,
  };

  test("station probes reach the move list, marked as such (ISC-219)", () => {
    const moves = generateMoves({ ...base, station: "bind", brief: emptyBrief(), chunkCount: 0 });
    expect(moves.some((m) => m.source === "station")).toBe(true);
  });

  test("Anti: with no station, nothing station-sourced appears (ISC-220)", () => {
    // The bias, material and export views have no station, and inventing one
    // would put a question about the design in front of someone reading a
    // transcript.
    const moves = generateMoves(base);
    expect(moves.some((m) => m.source === "station")).toBe(false);
  });

  test("moving station changes what is asked", () => {
    const at = (s: "bind" | "sample") =>
      generateMoves({ ...base, station: s, brief: emptyBrief(), chunkCount: 0 })
        .filter((m) => m.source === "station")
        .map((m) => m.question);
    expect(at("bind")).not.toEqual(at("sample"));
  });

  test("every station id produces at least one probe through the loop", () => {
    for (const id of STATION_IDS) {
      const moves = generateMoves({ ...base, station: id, brief: emptyBrief(), chunkCount: 0 });
      expect(moves.filter((m) => m.source === "station").length).toBeGreaterThan(0);
    }
  });
});
