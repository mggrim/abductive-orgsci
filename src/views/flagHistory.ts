/**
 * Where History files a flag that a check recorded (M89; D54, M43d).
 *
 * The owner tabled the checks on 2026-10-14: "I think we should fork and remove
 * it from the main version of the prototype." Nothing on main raises a flag any
 * more, but History keeps every past event, and the shipped example and every
 * project walked before M89 carry `lint-finding` and `finding-disposition`
 * events. History files each at the step its rule spoke to, so this module
 * keeps the two readings History needs from the modules that went with the
 * checks (`flow/stationLint.ts` and `views/openFindings.ts` on the branch
 * `with-checks`):
 *
 *   - the step each recorded rule spoke to, and
 *   - the rule inside a derived `structural:<rule>:<target>` id, which a
 *     dismissal of a recomputed finding points at.
 *
 * Rule ids are plain strings here because the union of rule ids went with the
 * checks. A rule this map doesn't name belongs to the project as a whole.
 */

import type { StationId } from "../flow/stations.ts";

const RULE_STATION: Readonly<Record<string, StationId>> = {
  "puzzle-without-referent": "puzzle",
  "intuition-as-theory": "bind",
  "phenomenon-troubling-no-theory": "puzzle",
  "unmet-relation-obligation": "bind",
  "resolution-without-rival": "puzzle",
  "premature-resolution": "bind",
  "resolution-destroys-theory": "bind",
  "defender-bar": "bind",
  "mediation-without-trouble": "process",
  "deviation-anecdotal": "sample",
  "audience-acceptance": "context",
  "orphan-construct": "early-data",
  "uncited-chunk": "early-data",
  "monotonic-residue-shrink": "early-data",
  "data-cannot-answer": "sample",
  "variance-process-mismatch": "process",
  "case-logic-mismatch": "sample",
  "venue-scale-mismatch": "sample",
  "access-unstated": "site",
  "horizon-mismatch": "process",
  "context-literature-misfit": "context",
  "confirmation-not-theory-building": "bind",
  "puzzle-without-sourced-theory": "context",
  "paper-bearing-unstated": "context",
  "expectation-untested": "context",
  "unit-mismatch": "context",
};

/** The step a recorded rule spoke to, or undefined for a rule about the whole project. */
export function stationForRule(rule: string): StationId | undefined {
  return Object.hasOwn(RULE_STATION, rule) ? RULE_STATION[rule] : undefined;
}

const STRUCTURAL_PREFIX = "structural:";

/**
 * The rule and target inside a derived `structural:<rule>:<target>` id.
 *
 * A rule id is kebab-case and a target is a uuid, a paper key or empty, so the
 * first colon after the prefix splits them. Undefined for any other id, so an
 * opaque event id is never read as a derived one.
 */
export function structuralParts(id: string): { readonly rule: string; readonly targetId: string } | undefined {
  if (!id.startsWith(STRUCTURAL_PREFIX)) return undefined;
  const rest = id.slice(STRUCTURAL_PREFIX.length);
  const at = rest.indexOf(":");
  if (at === -1) return undefined;
  return { rule: rest.slice(0, at), targetId: rest.slice(at + 1) };
}
