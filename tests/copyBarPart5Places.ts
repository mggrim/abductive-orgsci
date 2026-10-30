/**
 * Part 5's place names (M61, ISC-584). The tab labels, the step names and the
 * app-level places a label may name as one word ("Go to Starting point"), from
 * the tables that render them so the scan and the screen cannot disagree. The
 * keyboard bindings' labels went with the shortcuts (M96, ISC-794).
 */
import { STUDY_TAB_LABEL } from "../src/ui/routes.ts";
import { STATIONS } from "../src/flow/stations.ts";

/** The places the rail and the header name, besides the tabs. */
export const RAIL_PLACES: readonly string[] = ["Studies", "Model access"];

export const TAB_AND_RAIL: readonly string[] = [...Object.values(STUDY_TAB_LABEL), ...RAIL_PLACES];

export const PART5_PLACES: readonly string[] = [
  ...Object.values(STUDY_TAB_LABEL),
  ...STATIONS.map((s) => s.label),
  ...RAIL_PLACES,
  "Getting started",
  "History",
  "front page",
];
