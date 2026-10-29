/**
 * Part 5's place names (M61, ISC-584). The tab labels, the step names and the
 * app-level places a label may name as one word ("Go to Starting point"), and
 * the keyboard bindings' labels, read from the tables that render them so the
 * scan and the screen cannot disagree.
 */
import { STUDY_TAB_LABEL } from "../src/ui/routes.ts";
import { STATIONS } from "../src/flow/stations.ts";
import { BINDINGS } from "../src/ui/keyboard/bindings.ts";

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

export const BINDING_LABELS: readonly string[] = [...new Set(BINDINGS.map((b) => b.label))];
