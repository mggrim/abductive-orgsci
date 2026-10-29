/**
 * Adjudicated non-coverage (ISC-131 … ISC-136).
 *
 * The coverage grid's first draft treated every blank square the same way and
 * then reported a ratio off it — "site & sample watched by 2 of 9". The
 * advisor pass killed that claim, correctly: a blank is ambiguous between
 * three states, and collapsing them destroys the denominator the headline
 * rests on.
 *
 *   1. **Structural zero** — the bias cannot manifest at that point in the
 *      work. Correctly empty; it should not count against coverage.
 *   2. **Sampling zero** — it can manifest there and nothing watches it. A
 *      real gap, and the finding the page exists to produce.
 *   3. **Unadjudicated** — nobody has yet decided which of the two it is.
 *
 * Every one of the 34 blanks is currently in state 3, and this map is
 * deliberately empty to say so out loud. The field exists now rather than
 * later because it is schema: cheap to add before the page is durable, and
 * the one thing here that is genuinely painful to retrofit afterwards.
 *
 * Judging a combination structurally incoherent is a methodological call about
 * this researcher's own construct scheme. The tool will not make it — an
 * adjudication the interface invented would be exactly the improvisation this
 * page exists to rule out. Entries are added by hand, with a reason, or they
 * are not added.
 */

import type { BiasId, ContextId } from "./schema.ts";

/** Key convention matches `MatrixCellId`: `<bias>:<context>`. */
export type CoverageKey = `${BiasId}:${ContextId}`;

/**
 * Blanks adjudicated as structurally inapplicable, each with the reason it is
 * not a gap. Empty by design — see the module note. Adding an entry removes
 * that square from the applicable denominator and shows it as adjudicated on
 * the grid rather than as an absence.
 */
export const NOT_APPLICABLE: Readonly<Partial<Record<CoverageKey, string>>> = {};

export function notApplicableReason(
  bias: BiasId,
  context: ContextId,
): string | undefined {
  return NOT_APPLICABLE[`${bias}:${context}` as CoverageKey];
}

export function adjudicatedCount(): number {
  return Object.keys(NOT_APPLICABLE).length;
}
