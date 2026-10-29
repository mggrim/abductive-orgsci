/**
 * Two doors that opened onto the wrong thing (D39, D51, M43d).
 *
 * D39. `#/study/<id>/checks` rendered the Design station and said nothing. The
 * token is not a tab id, so the slot fell through, and `location.hash` still
 * reported `/checks` while another surface was on screen. Leg A hit the same
 * shape with `/earlydata`. The tab is called Checks on screen and its route is
 * `coherence`, which is where a hand-written link is most likely to come from.
 *
 * D51. The Exports header says "Press a count to open the record at the entries
 * it counts", and pressing "9 findings" opened the record at `EVENTS 1447 ·
 * SHOWN 1447`. It opened the record; it did not open it at the entries.
 */

import { describe, expect, test } from "bun:test";
import { parseHash } from "../src/ui/routes.ts";
import { resolveStationId, STATION_IDS } from "../src/flow/stations.ts";
import { ARRIVED_KINDS } from "../src/views/exportHeader.ts";
import { LEDGER_KINDS, startingKinds } from "../src/workbench/Instrumentation.tsx";

const ID = "48eb0638-78de-4628-ab54-73d9d7fb2a5b";

describe("a link named by the label on screen lands on the tab that wears it", () => {
  test("checks and coherence are no tab any more, and fall through to Design (M89)", () => {
    // The Checks tab was tabled on 2026-10-14, so a hand-written link to it
    // lands on Design like any other token that is not a tab.
    for (const token of ["checks", "coherence"]) {
      expect(parseHash(`#/study/${ID}/${token}`)).toEqual({
        view: "study",
        projectId: ID,
        tab: "design",
        station: "context",
      });
    }
  });

  test("the two other labels resolve too", () => {
    expect(parseHash(`#/study/${ID}/model`)).toMatchObject({ tab: "ontology" });
    expect(parseHash(`#/study/${ID}/export`)).toMatchObject({ tab: "exports" });
  });

  test("a station written without its hyphen is that station", () => {
    expect(resolveStationId("earlydata")).toBe("early-data");
    expect(parseHash(`#/study/${ID}/earlydata`)).toEqual({
      view: "study",
      projectId: ID,
      tab: "design",
      station: "early-data",
    });
  });

  test("every station id survives its own hyphenless form", () => {
    for (const id of STATION_IDS) expect(resolveStationId(id.replace(/-/g, ""))).toBe(id);
  });

  test("a name nobody shows is still a fall-through rather than a guess", () => {
    expect(resolveStationId("erlydta")).toBeUndefined();
    expect(parseHash(`#/study/${ID}/dashboard`)).toMatchObject({ tab: "design" });
  });
});

describe("a count opens the record at what it counts", () => {
  test("the claims count names the ontology's rows and the decisions on them", () => {
    expect(ARRIVED_KINDS.claims).toEqual([
      "ontology-mutation",
      "proposal",
      "proposal-adjudication",
      "statement-attached",
      "relation-statement-attached",
    ]);
    // M89: the findings count went with the Checks tab.
    expect(ARRIVED_KINDS.findings).toBeUndefined();
  });

  test("every count names kinds the record actually holds", () => {
    for (const kinds of Object.values(ARRIVED_KINDS)) {
      expect(kinds.length).toBeGreaterThan(0);
      for (const kind of kinds) expect(LEDGER_KINDS).toContain(kind);
    }
  });

  test("the timeline starts on those kinds, and on everything without them", () => {
    expect([...startingKinds(ARRIVED_KINDS.claims!)]).toEqual([...ARRIVED_KINDS.claims!]);
    expect(startingKinds(undefined).size).toBe(LEDGER_KINDS.length);
    // An empty list is the study-bar control, which counts nothing in particular.
    expect(startingKinds([]).size).toBe(LEDGER_KINDS.length);
  });
});
