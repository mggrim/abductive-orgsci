/**
 * ISC-489: the Early data step has a box for its question (D5).
 *
 * The walk of record found step 6 asking "What has your material already shown
 * you that you did not expect?" over no field at all: `stationField` returned
 * null there, so the workspace rendered the kind select and the extraction
 * control and nothing to answer the question with. A step that asks and then
 * offers nowhere to reply is a step the researcher learns to walk past, and it
 * is the one step whose answer is the tool's best evidence that the material
 * has been read rather than merely uploaded.
 *
 * So the step gets `earlySurprise`, and it keeps the reading it already had:
 * material uploaded and nothing typed still counts as stated, because the
 * corpus is the other half of what this step holds. A field or material,
 * either way.
 */

import { describe, expect, test } from "bun:test";
import {
  briefChangeEvents,
  declineStationEvent,
  declinedStations,
  stationField,
  stationStated,
  stationStates,
  stationSubject,
  stationValue,
  withStationValue,
} from "../src/flow/stationBrief.ts";
import { stationById, STATIONS } from "../src/flow/stations.ts";
import { emptyBrief, normalizeBrief, type ProjectBrief } from "../src/state/projects.ts";
import { stationProbes, THIN } from "../src/interview/stationProbes.ts";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";

const PROJECT = "55555555-5555-4555-8555-555555555555";
const SURPRISE =
  "Nobody in the transcripts talks about the handover as a decision. They describe it as something that happens to them, which is not what I went in expecting to hear.";

describe("the step's question has a box under it (ISC-489)", () => {
  test("early-data maps to a brief field like every other written station", () => {
    expect(stationField("early-data")).toBe("earlySurprise");
    for (const station of STATIONS) expect(stationField(station.id)).not.toBeNull();
  });

  test("the field starts empty and a study written before this one gets an empty one", () => {
    expect(emptyBrief().earlySurprise).toBe("");
    expect(normalizeBrief({ context: "a ward" }).earlySurprise).toBe("");
    expect(normalizeBrief(undefined).earlySurprise).toBe("");
    // A bundle exported before M37 carries no such key at all.
    const older = JSON.parse('{"context":"a ward","bind":"openness against closure"}') as unknown;
    expect(normalizeBrief(older as Partial<ProjectBrief>).earlySurprise).toBe("");
  });

  test("writing at the step writes that field and nothing else", () => {
    const written = withStationValue(emptyBrief(), "early-data", SURPRISE);
    expect(written.earlySurprise).toBe(SURPRISE);
    expect(stationValue(written, "early-data")).toBe(SURPRISE);
    expect({ ...written, earlySurprise: "" }).toEqual(emptyBrief());
  });

  test("the save is filed under the station id, like every other station", () => {
    // The field is `earlySurprise` and the subject is the step. Owner's call,
    // 2026-09-10: three mechanisms key a save on the station id and a second
    // spelling would be invisible to all of them. The two below are the ones
    // this file can see; the third is the timeline row, further down.
    expect(stationSubject("early-data")).toBe("early-data");
    for (const station of STATIONS) expect(stationSubject(station.id)).toBe(station.id);
  });

  test("a save at the step clears an earlier 'decide later'", () => {
    const deferred = declineStationEvent(PROJECT, "early-data", "not-yet", "");
    expect(declinedStations([deferred]).get("early-data")).toBe("not-yet");
    const saved = briefChangeEvents(
      PROJECT,
      emptyBrief(),
      withStationValue(emptyBrief(), "early-data", SURPRISE),
    );
    expect(declinedStations([deferred, ...saved]).has("early-data")).toBe(false);
  });

  test("the timeline reads the save as the step, not as a field name", () => {
    // `boundSubjectLabel` resolves a station id to the station's label and
    // otherwise de-hyphenates whatever it was given, so a subject of its own
    // would have shown a researcher "early surprise" where every other station
    // shows its own name. Read through the exported projection rather than
    // through the private function, and Instrumentation.tsx is untouched.
    const [row] = projectLedger(
      briefChangeEvents(
        PROJECT,
        emptyBrief(),
        withStationValue(emptyBrief(), "early-data", SURPRISE),
      ),
    );
    expect(row?.changed).toBe(stationById("early-data").label);
    expect(row?.changed).toBe("Early data");
  });

  test("a save appends one bound event carrying the step's subject", () => {
    const events = briefChangeEvents(
      PROJECT,
      emptyBrief(),
      withStationValue(emptyBrief(), "early-data", SURPRISE),
    );
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("bound");
    expect(event.type === "bound" ? event.subject : "").toBe(stationSubject("early-data"));
    expect(event.type === "bound" ? event.statement : "").toBe(SURPRISE);
  });

  test("Anti: an unchanged field writes nothing, like every other station", () => {
    const filled = withStationValue(emptyBrief(), "early-data", SURPRISE);
    expect(briefChangeEvents(PROJECT, filled, filled)).toEqual([]);
  });
});

describe("the step still reads as stated on material alone", () => {
  const step = stationById("early-data");

  test("material and nothing typed is stated; neither is empty", () => {
    expect(stationStated(emptyBrief(), step, 0)).toBe(false);
    expect(stationStated(emptyBrief(), step, 3)).toBe(true);
  });

  test("typed and no material is stated too — a field or material, either way", () => {
    const written = withStationValue(emptyBrief(), "early-data", SURPRISE);
    expect(stationStated(written, step, 0)).toBe(true);
    expect(stationStated(written, step, 3)).toBe(true);
  });

  test("the rail counts it the way it counts the written stations", () => {
    const written = withStationValue(emptyBrief(), "early-data", SURPRISE);
    expect(stationStates(emptyBrief(), 0).get("early-data")).toBe("empty");
    expect(stationStates(written, 0).get("early-data")).toBe("stated");
    expect(stationStates(emptyBrief(), 3).get("early-data")).toBe("stated");
  });
});

describe("the probes read the field when it holds text, the corpus when it does not", () => {
  const typed = (text: string): ProjectBrief => withStationValue(emptyBrief(), "early-data", text);

  test("empty field and no material asks what will be read first", () => {
    const [probe] = stationProbes("early-data", emptyBrief(), 0);
    expect(probe?.question).toBe(
      stationProbes("early-data", emptyBrief(), 0, 0, 0)[0]?.question,
    );
    expect(probe?.question.toLowerCase()).toContain("first piece of material");
  });

  test("empty field and material keeps the corpus reading (M29, R9)", () => {
    const barelyOpened = stationProbes("early-data", emptyBrief(), 12, 0, 1)[0]!.question;
    const readThrough = stationProbes("early-data", emptyBrief(), 12, 0, 9)[0]!.question;
    expect(barelyOpened).not.toBe(stationProbes("early-data", emptyBrief(), 0)[0]!.question);
    expect(readThrough).not.toBe(barelyOpened);
  });

  test("a thin answer is read as thin, whatever the corpus says", () => {
    const thin = stationProbes("early-data", typed("not much yet"), 0)[0]!.question;
    expect(thin.length).toBeLessThan(200);
    expect(thin).not.toBe(stationProbes("early-data", emptyBrief(), 0)[0]!.question);
    // Read through the corpus this would have been the stated probe.
    expect(thin).not.toBe(stationProbes("early-data", emptyBrief(), 12, 0, 9)[0]!.question);
  });

  test("a full answer is pressed on the answer, with no material at all", () => {
    expect(SURPRISE.length).toBeGreaterThan(THIN);
    const probes = stationProbes("early-data", typed(SURPRISE), 0);
    expect(probes.length).toBeGreaterThan(1);
    expect(probes.map((p) => p.question)).not.toContain(
      stationProbes("early-data", emptyBrief(), 0)[0]!.question,
    );
  });

  test("returning to the step does not put the same question twice", () => {
    const first = stationProbes("early-data", typed(SURPRISE), 0)[0]!.question;
    const second = stationProbes("early-data", typed(SURPRISE), 0, 1)[0]!.question;
    expect(second).not.toBe(first);
  });
});
