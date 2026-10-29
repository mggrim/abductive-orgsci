/**
 * The station model (ISC-75 … ISC-91).
 *
 * These are content tests as much as logic tests, which is unusual and
 * deliberate. The station prompts are the product here — the textarea under
 * each one is incidental — so "every prompt is a question" and "the tension
 * station cites no literature" are assertions worth having a machine make,
 * exactly like the interrogation-leak detector in the interview loop. Prose
 * drifts under editing; a test does not.
 */

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_STATION,
  STATIONS,
  STATION_IDS,
  isStationId,
  resolveStationId,
  stationById,
} from "../src/flow/stations.ts";
import {
  briefChangeEvents,
  declineStationEvent,
  declinedStations,
  stationField,
  stationStated,
  stationStates,
  stationValue,
  withStationValue,
} from "../src/flow/stationBrief.ts";
import { emptyBrief, normalizeBrief, type ProjectBrief } from "../src/state/projects.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { parseHash, studyPath, STUDY_TABS } from "../src/ui/routes.ts";

/* M50, ISC-532. The two surfaces that draw a step, read as source: the sentence
   under the bind's prompt has to be on both, and a rendered test of either would
   stand up a ledger and an IndexedDB handle to say so. */
const SRC_DIR = new URL("../src/", import.meta.url).pathname;
const INTRO = await Bun.file(`${SRC_DIR}ui/Introduction.tsx`).text();
const WORKSPACE = await Bun.file(`${SRC_DIR}flow/StationWorkspace.tsx`).text();

const PROJECT = "11111111-2222-3333-4444-555555555555";

describe("station declaration", () => {
  // D3: eight became seven. `challenge` and `tension` merged into `bind`, and
  // the outer ring reads sample, early data, the bind.
  /* M58, ISC-567: eight, in the owner's order. Outer loop clockwise from
   * the top (Context, Process, Outcome, Site), the inner loop (The puzzle, The
   * bind), then the two pieces outside both (Sample, Early data). */
  test("the eight stations the flow names are present, in the two loops' order (ISC-75, M58)", () => {
    expect(STATION_IDS).toEqual([
      "context",
      "process",
      "outcome",
      "site",
      "puzzle",
      "bind",
      "sample",
      "early-data",
    ]);
  });

  test("bind replaces challenge and tension, and neither id is a station any more (D3)", () => {
    expect(STATION_IDS).not.toContain("challenge");
    expect(STATION_IDS).not.toContain("tension");
    expect(isStationId("challenge")).toBe(false);
    expect(isStationId("tension")).toBe(false);
    // Retired, not dead. A co-author holding an old link, and a study whose
    // ledger names either station, both land on the one that absorbed them.
    expect(resolveStationId("challenge")).toBe("bind");
    expect(resolveStationId("tension")).toBe("bind");
    expect(resolveStationId("nonsense")).toBeUndefined();
    for (const id of STATION_IDS) expect(resolveStationId(id)).toBe(id);
  });

  test("labels drop 'of interest' and 'selection' (D3)", () => {
    expect(stationById("site").label).toBe("Site");
    expect(stationById("process").label).toBe("Process");
    expect(stationById("outcome").label).toBe("Outcome");
    expect(stationById("bind").label).toBe("Bind");
  });

  test("the context blurb no longer carries the question, which is Framing's (D2)", () => {
    expect(stationById("context").blurb.toLowerCase()).not.toContain("question");
  });

  test("every station states in one sentence what it is for (ISC-86)", () => {
    for (const s of STATIONS) {
      expect(s.blurb.trim().length).toBeGreaterThan(20);
    }
  });

  test("every methods prompt is a question, not an instruction (ISC-87)", () => {
    for (const s of STATIONS) {
      expect(s.prompt.trim().endsWith("?")).toBe(true);
    }
  });

  test("every station names what the tool does with the answer (ISC-91)", () => {
    for (const s of STATIONS) {
      expect(s.feeds.trim().length).toBeGreaterThan(20);
    }
  });

  test("process and outcome are separate stations with separate fields (ISC-90)", () => {
    expect(stationField("process")).toBe("processOfInterest");
    expect(stationField("outcome")).toBe("outcomeOfInterest");
    expect(stationField("process")).not.toBe(stationField("outcome"));
  });

  /* ISC-89 asked the challenge station to distinguish a challenge from a
   * puzzle, and it did that by spending three sentences on what it was not,
   * which is what a station does when it is not carrying its own weight. D3
   * merged it into `bind`. What survives of the criterion is the half that was
   * about the researcher rather than about the pair: the station asks what
   * people in the setting are caught in, in the setting's own terms, and never
   * asks them to start from what troubles theory. */
  test("the bind station asks about people, not about theory (ISC-89, D3)", () => {
    const bind = stationById("bind");
    const prose = `${bind.blurb} ${bind.prompt}`.toLowerCase();
    expect(prose).toContain("people");
    expect(prose).not.toContain("theory");
    expect(prose).not.toContain("puzzle");
  });

  /* M50, ISC-532. A co-author, on their first use, 2026-09-21: the bind and the
   * puzzle read as the same thing. The step keeps its question and gains one
   * sentence under it saying which is which and that a study may have neither.
   *
   * The sentence is on the station and not in a component, so the two surfaces
   * that draw a step cannot say it differently, and the test above holding the
   * bind's own prose clear of the word "puzzle" reads `blurb` and `prompt`
   * rather than the whole station, which is why that one still passes: the
   * question asks about people and this sentence is what stands beside it. */
  test("the bind carries the sentence that tells it from the puzzle (ISC-532)", () => {
    expect(stationById("bind").apart).toBe(
      "A bind is the tension that the people in your setting feel. The puzzle is the surprise: what you see, or expect to see, that current accounts can't explain. Not every project has a bind.",
    );
  });

  test("no other station carries one, because no other has been read as something else", () => {
    for (const s of STATIONS) {
      expect({ id: s.id, apart: s.apart !== undefined }).toEqual({
        id: s.id,
        apart: s.id === "bind",
      });
    }
  });

  test("the sentence names both things and says a study may have neither", () => {
    const apart = stationById("bind").apart ?? "";
    // Both nouns, so a reader meeting one of them here can tell it from the
    // other rather than being told only what a bind is.
    expect(apart.toLowerCase()).toContain("bind");
    expect(apart.toLowerCase()).toContain("puzzle");
    // And the release: a step a study does not need is not a step it has failed.
    expect(apart).toContain("Not every project has a bind.");
    // Held to the copy standard like every other sentence on a step.
    expect(apart).not.toMatch(/[\u2014\u2013]/);
    for (const sentence of apart.split(/(?<=\.)\s+/)) {
      expect({ sentence, words: sentence.trim().split(/\s+/).length <= 25 }).toEqual({
        sentence,
        words: true,
      });
    }
  });

  test("both surfaces that draw a step draw the sentence", () => {
    // One sentence, two renderers, and neither may reword it: the front page's
    // step panel and the workspace's own header both read `station.apart`.
    expect(INTRO).toContain("station.apart !== undefined");
    expect(WORKSPACE).toContain("station.apart !== undefined");
  });

  test("the bind station asks about the field, and imports no literature (ISC-88, D3)", () => {
    const bind = stationById("bind");
    const prose = `${bind.blurb} ${bind.prompt} ${bind.feeds}`.toLowerCase();
    // Rated 3/10 twice for drifting to paradox scholarship when the ask was
    // tensions from practice. Whether a bind persists is a finding the model
    // records, not a prior the tool installs.
    expect(prose).not.toContain("paradox");
    expect(prose).not.toContain("literature");
    expect(prose).toContain("field");
  });

  test("station ids round-trip through the guard", () => {
    for (const id of STATION_IDS) expect(isStationId(id)).toBe(true);
    expect(isStationId("nonsense")).toBe(false);
    expect(isStationId("dashboard")).toBe(false);
  });

  test("the default station is the first one", () => {
    expect(STATION_IDS[0]).toBe(DEFAULT_STATION);
  });
});

describe("brief persistence", () => {
  test("a pre-M8 brief normalises rather than yielding undefined fields (ISC-76)", () => {
    const legacy = {
      researchQuestion: "Why do directors decline credited roles?",
      siteRationale: "One production company.",
      sampleRationale: "Twelve directors.",
      dataType: "interview" as const,
    };
    const normalized = normalizeBrief(legacy);
    expect(normalized.researchQuestion).toBe(legacy.researchQuestion);
    expect(normalized.context).toBe("");
    expect(normalized.processOfInterest).toBe("");
    expect(normalized.outcomeOfInterest).toBe("");
    expect(normalized.challenge).toBe("");
    expect(normalized.tension).toBe("");
    expect(normalized.bind).toBe("");
    for (const s of STATIONS) expect(typeof stationValue(normalized, s.id)).toBe("string");
  });

  test("normalising an absent brief yields the empty brief", () => {
    expect(normalizeBrief(undefined)).toEqual(emptyBrief());
  });

  test("writing a station value touches only that station", () => {
    const before = emptyBrief();
    // D3: the tension station's field is `bind` now.
    const after = withStationValue(before, "bind", "credit versus access");
    expect(after.bind).toBe("credit versus access");
    expect(after.context).toBe("");
    expect(after.sampleRationale).toBe("");
  });

  /* D3. Two stations became one, and a study designed before the merge had
   * answered them separately. Dropping either would be the tool discarding
   * something the researcher wrote, so both are kept, in the order they were
   * asked, and the join is visible rather than run together. */
  describe("the retired fields fold into bind (D3)", () => {
    test("both are carried over, in order, separated by a blank line", () => {
      const folded = normalizeBrief({
        challenge: "They cannot tell what mattered.",
        tension: "Openness against reputational closure.",
      });
      expect(folded.bind).toBe(
        "They cannot tell what mattered.\n\nOpenness against reputational closure.",
      );
    });

    test("one of the two on its own folds without a stray blank line", () => {
      expect(normalizeBrief({ tension: "Openness against closure." }).bind).toBe(
        "Openness against closure.",
      );
      expect(normalizeBrief({ challenge: "They cannot tell." }).bind).toBe("They cannot tell.");
    });

    test("Anti: an answered bind is never overwritten by the old fields", () => {
      // The fold has to be idempotent, or the second load pastes the old text
      // back underneath whatever the researcher has since written.
      const once = normalizeBrief({ challenge: "old", tension: "older" });
      expect(normalizeBrief(once).bind).toBe(once.bind);
      expect(normalizeBrief({ ...once, bind: "what I say now" }).bind).toBe("what I say now");
    });

    test("Anti: a brief with neither gets an empty bind, not a blank-line pair", () => {
      expect(normalizeBrief({ context: "a ward" }).bind).toBe("");
    });

    test("the retired fields stay on the type so an old bundle still loads", () => {
      const legacy = normalizeBrief({ challenge: "c", tension: "t" });
      expect(legacy.challenge).toBe("c");
      expect(legacy.tension).toBe("t");
    });
  });

  /* Was "early-data has no text field; its content is the corpus". It had no
   * text field, and it asked a question anyway — the walk found step 6 putting
   * "What has your material already shown you that you didn't expect?" over
   * the kind select and the extraction control and nothing to answer it with
   * (D5). The corpus is half of what the step holds; this is the other half,
   * and it is the only line in the brief that can only be written after the
   * material has been read. What survives of the old criterion is the reading
   * that made it: material and nothing typed is still the step said. */
  test("early-data has a box of its own, and the corpus still counts (ISC-489)", () => {
    expect(stationField("early-data")).toBe("earlySurprise");
    expect(withStationValue(emptyBrief(), "early-data", "x").earlySurprise).toBe("x");
    expect(stationStated(emptyBrief(), stationById("early-data"), 0)).toBe(false);
    expect(stationStated(emptyBrief(), stationById("early-data"), 3)).toBe(true);
    expect(
      stationStated(withStationValue(emptyBrief(), "early-data", "x"), stationById("early-data"), 0),
    ).toBe(true);
  });
});

describe("bound events", () => {
  const filled: ProjectBrief = {
    ...emptyBrief(),
    context: "Both fields are described as meritocratic and known not to be.",
    // D3: what the tension station wrote is the bind field now.
    bind: "Openness against reputational closure.",
  };

  test("saving a station appends a bound event carrying that station's id (ISC-77)", () => {
    const events = briefChangeEvents(PROJECT, emptyBrief(), filled);
    const subjects = events.map((e) => (e.type === "bound" ? e.subject : ""));
    expect(subjects).toContain("context");
    expect(subjects).toContain("bind");
    expect(subjects).not.toContain("site");
  });

  test("the events it produces are valid ledger events", () => {
    for (const event of briefChangeEvents(PROJECT, emptyBrief(), filled)) {
      expect(validateEvent(event)).toEqual([]);
    }
  });

  test("Anti: an unchanged station appends nothing (ISC-78)", () => {
    expect(briefChangeEvents(PROJECT, filled, filled)).toEqual([]);
  });

  test("Anti: editing one station does not re-log the other seven (ISC-78)", () => {
    const next = { ...filled, sampleRationale: "Twelve directors, theoretically sampled." };
    const events = briefChangeEvents(PROJECT, filled, next);
    expect(events).toHaveLength(1);
    expect(events[0]?.type === "bound" ? events[0].subject : "").toBe("sample");
  });

  test("the starting interest and the data type keep their own subjects", () => {
    const next = {
      ...emptyBrief(),
      startingInterest: "night shifts",
      dataType: "archival" as const,
    };
    const subjects = briefChangeEvents(PROJECT, emptyBrief(), next).map((e) =>
      e.type === "bound" ? e.subject : "",
    );
    expect(subjects).toEqual(["starting-interest", "data-type"]);
  });

  test("Anti: the puzzle writes no bound row at all (M40, ISC-509)", () => {
    /* `research-question` was a subject here until M40. The field still exists and
     * still holds the puzzle; what changed is who writes it. The tool reads the
     * puzzle out of the saved answers and `flow/usePuzzleReading.ts` mirrors it into
     * the field, and a `bound` row is the researcher committing to a boundary of
     * their design. They committed to the answers it was read from, not to the
     * reading, so a row here would file the tool's sentence on the bounding timeline
     * under `actor: "human"`. The reading has its own event.
     *
     * Deleted rather than guarded, so there is no branch left for a future writer to
     * reach by accident: the whole brief moving, puzzle included, writes nothing
     * under this subject. */
    const next = { ...emptyBrief(), researchQuestion: "the reading the tool wrote" };
    expect(briefChangeEvents(PROJECT, emptyBrief(), next)).toEqual([]);
    const withStation = { ...next, context: "nights on one ward" };
    const subjects = briefChangeEvents(PROJECT, emptyBrief(), withStation).map((e) =>
      e.type === "bound" ? e.subject : "",
    );
    expect(subjects).toEqual(["context"]);
  });

  test("clearing a station logs nothing — an emptied field is not a new commitment", () => {
    expect(briefChangeEvents(PROJECT, filled, { ...filled, bind: "" })).toEqual([]);
  });
});

describe("rail state", () => {
  test("the rail reports empty or stated per station (ISC-83)", () => {
    const brief = { ...emptyBrief(), context: "something" };
    const states = stationStates(brief, 0);
    expect(states.get("context")).toBe("stated");
    expect(states.get("site")).toBe("empty");
    expect(states.get("puzzle")).toBe("empty");
    expect(states.get("bind")).toBe("empty");
  });

  test("every station gets a state, always", () => {
    const states = stationStates(emptyBrief(), 0);
    expect(states.size).toBe(STATIONS.length);
    for (const s of STATIONS) expect(states.get(s.id)).toBe("empty");
  });
});

describe("declining a station is first-class", () => {
  const decline = (station: Parameters<typeof declineStationEvent>[1], kind: "not-yet" | "not-applicable") =>
    declineStationEvent(PROJECT, station, kind, "");

  test("a declination is a valid ledger event", () => {
    expect(validateEvent(decline("outcome", "not-applicable"))).toEqual([]);
  });

  test("both kinds are readable back off the ledger", () => {
    const map = declinedStations([decline("outcome", "not-applicable"), decline("sample", "not-yet")]);
    expect(map.get("outcome")).toBe("not-applicable");
    expect(map.get("sample")).toBe("not-yet");
    expect(map.get("context")).toBeUndefined();
  });

  test("a later save at the same station supersedes the declination", () => {
    const events = [
      decline("bind", "not-yet"),
      ...briefChangeEvents(PROJECT, emptyBrief(), { ...emptyBrief(), bind: "openness vs closure" }),
    ];
    expect(declinedStations(events).get("bind")).toBeUndefined();
  });

  test("the last declination wins", () => {
    const map = declinedStations([decline("outcome", "not-yet"), decline("outcome", "not-applicable")]);
    expect(map.get("outcome")).toBe("not-applicable");
  });

  /* M69, ISC-641: the rail's set-aside state went with the control. An earlier
   * declination stays on the record (above) and no longer draws a state. */
  test("an earlier set-aside draws no state of its own on the rail", () => {
    const states = stationStates(emptyBrief(), 0);
    expect(declinedStations([decline("outcome", "not-yet")]).get("outcome")).toBe("not-yet");
    expect(states.get("outcome")).toBe("empty");
    expect([...new Set(states.values())]).toEqual(["empty"]);
  });

  test("writing something reads as answered", () => {
    const brief = { ...emptyBrief(), outcomeOfInterest: "whether they are still working" };
    const states = stationStates(brief, 0);
    expect(states.get("outcome")).toBe("stated");
  });

  test("a bound event with a non-station subject is not mistaken for a declination", () => {
    const seedish = {
      id: crypto.randomUUID(),
      ts: 1,
      actor: "system" as const,
      projectId: PROJECT,
      type: "bound" as const,
      subject: "research-question",
      statement: "Stated the research question",
    };
    expect(declinedStations([seedish]).size).toBe(0);
  });
});

describe("routing", () => {
  test("the root is the introduction (ISC-95)", () => {
    expect(parseHash("#/")).toEqual({ view: "intro" });
    expect(parseHash("")).toEqual({ view: "intro" });
  });

  test("the studies list keeps its own route, under both names (ISC-183)", () => {
    expect(parseHash("#/studies")).toEqual({ view: "studies" });
    expect(parseHash("#/projects")).toEqual({ view: "studies" });
  });

  test("provider settings resolve under both names (ISC-184)", () => {
    expect(parseHash("#/settings")).toEqual({ view: "settings" });
    expect(parseHash("#/auth")).toEqual({ view: "settings" });
  });

  test("a study opens on its design view at the first station (ISC-185)", () => {
    expect(parseHash("#/study/abc")).toEqual({
      view: "study",
      projectId: "abc",
      tab: "design",
      station: DEFAULT_STATION,
    });
  });

  test("the focused station is in the URL (ISC-85, ISC-186)", () => {
    expect(parseHash("#/study/abc/design/bind")).toEqual({
      view: "study",
      projectId: "abc",
      tab: "design",
      station: "bind",
    });
  });

  // D3. Nobody's link dies because two stations merged.
  test("a link to a retired station lands on the one that absorbed it (D3)", () => {
    for (const retired of ["challenge", "tension"]) {
      expect(parseHash(`#/study/abc/design/${retired}`)).toEqual({
        view: "study",
        projectId: "abc",
        tab: "design",
        station: "bind",
      });
      expect(parseHash(`#/project/abc/${retired}`)).toEqual({
        view: "study",
        projectId: "abc",
        tab: "design",
        station: "bind",
      });
    }
  });

  test("every study tab is reachable (ISC-187)", () => {
    for (const tab of STUDY_TABS) {
      expect(parseHash(`#/study/p/${tab}`)).toEqual({
        view: "study",
        projectId: "p",
        tab,
        station: DEFAULT_STATION,
      });
    }
  });

  test("every station id is reachable inside the design view", () => {
    for (const id of STATION_IDS) {
      expect(parseHash(`#/study/p/design/${id}`)).toEqual({
        view: "study",
        projectId: "p",
        tab: "design",
        station: id,
      });
    }
  });

  test("the retired /project/:id/:station links still resolve (ISC-188)", () => {
    // Someone is holding one of these. A link that dies is worse than one that
    // lands a little to the left of where it used to.
    expect(parseHash("#/project/abc/sample")).toEqual({
      view: "study",
      projectId: "abc",
      tab: "design",
      station: "sample",
    });
    expect(parseHash("#/project/abc")).toEqual({
      view: "study",
      projectId: "abc",
      tab: "design",
      station: DEFAULT_STATION,
    });
  });

  test("v1's retired screens resolve to the study rather than 404 (ISC-189)", () => {
    for (const legacy of ["#/project/abc/legacy", "#/project/abc/dashboard", "#/study/abc/nonsense"]) {
      expect(parseHash(legacy)).toEqual({
        view: "study",
        projectId: "abc",
        tab: "design",
        station: DEFAULT_STATION,
      });
    }
  });

  test("the retired bias page lands on the studies list, under both names (ISC-190, M89)", () => {
    expect(parseHash("#/biases")).toEqual({ view: "studies" });
    expect(parseHash("#/matrix")).toEqual({ view: "studies" });
  });

  test("studyPath round-trips through parseHash (ISC-191)", () => {
    for (const tab of STUDY_TABS) {
      const route = parseHash(studyPath("xyz", tab, "bind"));
      expect(route).toEqual({
        view: "study",
        projectId: "xyz",
        tab,
        station: tab === "design" ? "bind" : DEFAULT_STATION,
      });
    }
  });

  test("Anti: a trailing slash does not produce a different route", () => {
    expect(parseHash("#/studies/")).toEqual(parseHash("#/studies"));
    expect(parseHash("#/study/abc/design/bind/")).toEqual(parseHash("#/study/abc/design/bind"));
  });
});
