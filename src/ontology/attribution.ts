/**
 * The origin census, and the denominator every one of its numbers is over.
 *
 * Third sibling of `src/ui/originVocabulary.ts` and
 * `src/ui/pageTypeVocabulary.ts`, and written for the third version of the same
 * failure. Those two modules fixed a value rendered under five different words.
 * This one fixes a value counted over two different populations and printed
 * under one set of words, which is worse: a reader comparing two spellings knows
 * they are looking at one thing, and a reader comparing two counts of "yours"
 * has no way to tell that they are not.
 *
 * What the 44-page density probe put on four surfaces at once. The /ontology
 * index listed 44 rows carrying 15 solid discs, 15 half-filled and 14 hollow.
 * The Design tab, using the same three marks from the same module, printed
 * "98 revisions, 33% model-originated" over a legend reading "yours (33), from
 * the data (33), model-proposed (32)". memo.md wrote "44 live pages across 98
 * recorded revisions: 33 the researcher's prior, 33 forced by the data, 32
 * proposed by a model", a sentence whose colon invites the reader to read 33,
 * 33 and 32 as a breakdown of 44. ontology.json carried `attribution.byOrigin`
 * 33/33/32 and `modelShare` 0.3265 beside a `pages` array of 44 whose own
 * `origin` fields give 15/15/14 and 0.318, with no denominator written anywhere
 * in the file. The 200-page probe repeated it at 147/147/146 against 67/67/66.
 *
 * The arithmetic behind the gap: 98 is not 44 revised, it is 44 creates plus 54
 * relates plus zero revises. So the larger number counted relations as though
 * they were pages, and called them revisions when nothing had been revised.
 * Attribution is the tool's central claim. It cannot be the field where the
 * tool is loosest about what it is counting.
 *
 * The rule this module exists to enforce: a count of origins is never handed to
 * a surface on its own. It travels with the unit it counted and the population
 * it counted out of, and every surface that prints one prints all three. There
 * is no way to obtain a bare `byOrigin` from here.
 *
 * Two populations are legitimate and both are wanted. The live pages are what
 * the ontology *is*, and that is what the claim is about. The recorded
 * mutations are what the *work* was, and that is what the trajectory plots. The
 * defect was never that both existed; it was that only one of them said so.
 */

import type { Origin } from "../ledger/events.ts";
import { ORIGIN_ORDER, originLabel, originWritten } from "../ui/originVocabulary.ts";

/**
 * What is being counted, singular and plural.
 *
 * A record rather than a string because "1 live pages" is the kind of thing a
 * research instrument should not print, and because a unit with two forms
 * cannot be silently swapped for a bare noun by a caller in a hurry.
 */
export interface CensusUnit {
  readonly one: string;
  readonly many: string;
}

/**
 * The ontology as it currently stands. The tool's attribution claim is over
 * this population and no other: it is the population the /ontology index lists,
 * the population `pages` holds in ontology.json, and the population a reader
 * means by "the ontology".
 */
export const LIVE_PAGES: CensusUnit = { one: "claim", many: "claims" };

/**
 * Every recorded change to the model, claims and links alike.
 *
 * "Changes" and not "revisions", and not "mutations" either. `revise` is one of
 * six ops and on the probe it had fired zero times, so "revisions" described
 * the one thing that had not happened, over a population more than half of
 * which was links rather than claims.
 *
 * M28 r6: and "mutation" is a data-model word that rendered five times on one
 * screen, in "2 recorded mutations: 2 claims created" and four times again in
 * the census line under it. Same defect as `LIVE_PAGES` two constants up, which
 * this loop fixed three rounds ago and which came back here.
 */
export const RECORDED_MUTATIONS: CensusUnit = {
  one: "change",
  many: "changes",
};

export interface OriginCensus {
  readonly unit: CensusUnit;
  /** The denominator. Never absent, on any surface, in any file. */
  readonly population: number;
  readonly byOrigin: Readonly<Record<Origin, number>>;
  /** Model-originated share of this population, 0 to 1. `null` when empty. */
  readonly modelShare: number | null;
}

/** Count anything that carries an origin, and remember what was counted. */
export function originCensus(
  items: readonly { readonly origin: Origin }[],
  unit: CensusUnit,
): OriginCensus {
  const byOrigin: Record<Origin, number> = {
    "author-prior": 0,
    // M29. The denominator does not move; what moves is that the "yours" count
    // stops carrying other people's thinking inside it.
    "literature-derived": 0,
    "data-driven": 0,
    "model-proposed": 0,
  };
  for (const item of items) byOrigin[item.origin] += 1;
  const population = items.length;
  return {
    unit,
    population,
    byOrigin,
    modelShare: population === 0 ? null : byOrigin["model-proposed"] / population,
  };
}

/** The population, named: "44 live pages", "1 recorded mutation". */
export function censusOf(census: OriginCensus): string {
  return `${census.population} ${census.population === 1 ? census.unit.one : census.unit.many}`;
}

/**
 * One origin's count with its denominator attached: "33 of 98 recorded
 * mutations".
 *
 * This is the string a legend row prints beside its mark. The row used to print
 * "(33)", which is the whole defect in three characters: a number with no unit,
 * under a glyph that means the same thing on a tab where the number is 15.
 */
export function censusShare(census: OriginCensus, origin: Origin): string {
  return `${census.byOrigin[origin]} of ${censusOf(census)}`;
}

/**
 * The census as a screen reads it: "44 claims: 20 yours, 24 from the model"
 * (M38).
 *
 * The label register rather than the third person, because this one is read on
 * a tab and not in a document, and it is written here rather than at the call
 * site for the reason `censusWritten` below is: the population leads the
 * sentence, so every share after the colon is read against a denominator that
 * is already in it. Assembling it at the call site is what let the memo attach
 * page words to an event count, and it is also what would make a new surface a
 * second speaker of the origin vocabulary.
 *
 * Origins with nothing in them are left out. A screen listing "0 from the
 * papers" beside three real counts spends a line saying nothing happened.
 */
export function censusRead(census: OriginCensus): string {
  if (census.population === 0) return `${census.unit.many} still to come`;
  const parts = ORIGIN_ORDER.filter((o) => census.byOrigin[o] > 0).map(
    (o) => `${census.byOrigin[o]} ${originLabel(o)}`,
  );
  return `${censusOf(census)}: ${parts.join(", ")}`;
}

/**
 * The whole attribution sentence, in the third person, for a document that
 * leaves the tool.
 *
 * Owned here rather than assembled at each call site, because it was assembled
 * at each call site and the memo's version attached page words to an event
 * count. The population leads the sentence, so the three numbers after the
 * colon are read against a denominator that is already on the page.
 */
export function censusWritten(census: OriginCensus): string {
  return `${censusOf(census)}: ${ORIGIN_ORDER.map(
    (o) => `${census.byOrigin[o]} ${originWritten(o)}`,
  ).join(", ")}`;
}
