/**
 * One word per origin value, for every surface that says it out loud.
 *
 * Split out of the mark module in round nine, and the split is the point. The
 * marks are a render boundary: nothing outside them may draw a page. The words
 * are the opposite kind of thing, a single definition that everything is
 * supposed to import, including the pure layers that must never see React.
 * Holding both in one file forced the structural checks (`lint/structural.ts`, on `with-checks` since M89) to choose between
 * importing a component tree to print a word and inventing its own word, and
 * every round of this defect it chose the second.
 *
 * What the rounds before this one kept producing. Round eight found PagePanel
 * holding a private ORIGIN_LABEL reading "your prior" while the module said
 * "yours" and the graph key 180px above it said "solid: you put this page here
 * out of your own prior thinking", and moved PagePanel onto the module. Round
 * nine measured the same screen again and found the raw slug still reaching the
 * reader in four more places the census had no syntax for:
 *
 *   OntologyGraph.tsx:275   the node's own hover title printed
 *                           "puzzle · author-prior · draft", so the object the
 *                           key defines as "yours" names itself "author-prior"
 *                           on the same screen, in the same 596px column
 *   Instrumentation.tsx:263 the trajectory point title, same slug, same screen
 *   views/Timeline.tsx:77   "create puzzle Handoff … (author-prior)" (that file
 *                           has since been deleted; the ledger panel in
 *                           Instrumentation.tsx replaced it)
 *   lint/structural.ts:107  a finding reason printing "(puzzle, author-prior)"
 *                           to the researcher
 *
 * None of those is a table, so the round-eight census rule (an origin literal
 * used as a key of a string) matched nothing in any of them. They are the same
 * defect: a value with a canonical human name, rendered by its internal slug.
 * The check that catches them is not a grep for a syntax, it is a render: no
 * surface's rendered TEXT may contain a raw origin slug. See
 * tests/origin-boundary.test.ts.
 *
 * Three registers, because one value genuinely needs three and only three.
 * `label` names it beside a mark, `reads` defines it in a legend, `written` is
 * the third person an exported document uses because a paper does not address
 * the researcher as "you". Anything that needs a fourth needs one of these.
 */

import type { Origin } from "../ledger/events.ts";

interface OriginWords {
  /** What the legend calls it. */
  readonly label: string;
  /** What the legend says it means. One sentence, identical on every surface. */
  readonly reads: string;
  /** The same value in the third person, for a document that leaves the tool. */
  readonly written: string;
}

/**
 * The table, private on purpose.
 *
 * It was exported as ORIGIN_MARK and callers reached through it for `.label`,
 * which meant the table's shape was public API and a caller could add a fourth
 * register to it from outside. Three accessors instead: a register that does
 * not exist here cannot be reached for, and the render surfaces read exactly
 * the same three words as the export surfaces.
 */
const WORDS: Readonly<Record<Origin, OriginWords>> = {
  "author-prior": {
    label: "yours",
    reads: "solid: you put this claim here yourself.",
    written: "the researcher's prior",
  },
  "data-driven": {
    label: "from the data",
    reads: "half filled: this claim came out of your data rather than out of your prior ideas.",
    written: "forced by the data",
  },
  "model-proposed": {
    // "model-proposed" was the label, which is to say this value had no label:
    // it had its slug, sitting in a legend between "yours" and "from the data".
    // The coherence walk read the three of them in a row on the intro hero, on
    // the graph key and in the ontology census, and one of them is not English.
    //
    // Worse than an odd word, because of what it did to the check. The boundary
    // test in tests/origin-boundary.test.ts asserts that no rendered surface
    // contains a raw origin slug, and it carried four `if (slug ===
    // originLabel("model-proposed")) continue;` skips, one per surface, because
    // the slug and the label were the same string and no assertion could tell
    // them apart. So the one origin the tool most needs to render honestly, on
    // the one screen where a model-written check names a model-written page,
    // was the one origin the leak check could not see. The skips are gone with
    // the slug.
    //
    // "from the model" rather than "the model's". The census heading is "Who
    // wrote them" and a possessive answers it, which is what /biases does when
    // it splits the nine biases into "yours" and "the model's". But the three
    // words here are read as a set, in a legend, in a column and in a row of
    // metadata, and "yours / from the data / from the model" is the set that
    // parses. The data has no possessive and never will, so a possessive here
    // makes one of the three the odd one out again, one word to the right.
    //
    // It also keeps the label free of an apostrophe, which matters more than it
    // looks: this string is asserted against rendered markup in four places,
    // and React escapes U+0027 to &#x27;, so a possessive label would have made
    // every one of those assertions read a different string than the researcher
    // does.
    /* M42. "from the model" sat in the Who column on the Your model tab, where
     * "your model" means the researcher's own claims, so one phrase carried both
     * meanings eight pixels apart. The language model is the one that drafts. */
    label: "AI-suggested",
    reads: "hollow: the model suggested this claim and you accepted it.",
    written: "suggested by the model, accepted by the researcher",
  },
  // M29. The third party, and the one a researcher is least able to see. A
  // claim read in 2024 and now felt as your own intuition was counted as
  // "yours", which is the one error this whole scheme exists to prevent.
  //
  // "From the papers" rather than "from the literature", for the same reason
  // /material's rows say "paper" rather than "literature": the shelf is the
  // literature and the thing you argued with is a paper. It also keeps the four
  // labels reading as one set, "yours / from the papers / from the data / from
  // the model", where three of the four name where a claim came from and none
  // of them takes a possessive.
  "literature-derived": {
    label: "from the papers",
    reads:
      "solid with a ring inside: you took this claim from a paper rather than from your data or your own thinking.",
    written: "taken from the cited literature",
  },
};

/**
 * Ordered: the researcher's own, then the papers', then the data's, then the
 * model's.
 *
 * The papers sit second because that is the order a study is supposed to move
 * in. What you brought and what you read come first, what the field showed you
 * comes after, and the share moving rightwards over a study is the reading the
 * three-way split could not offer.
 */
export const ORIGIN_ORDER: readonly Origin[] = [
  "author-prior",
  "literature-derived",
  "data-driven",
  "model-proposed",
];

/** The name, beside a mark or in a row of metadata. */
export function originLabel(origin: Origin): string {
  return WORDS[origin].label;
}

/** The definition, in a legend, beside the mark it defines. */
export function originReads(origin: Origin): string {
  return WORDS[origin].reads;
}

/** The same value in the third person, for a document that leaves the tool. */
export function originWritten(origin: Origin): string {
  return WORDS[origin].written;
}

/**
 * A concept's or a relation's mark on its card (M74a, ISC-663).
 *
 * The walk of 2026-10-02 (finding 14): the student refined "Arguing about it"
 * into "Arguing about whether it's worth it", in their own definition, and the
 * card still read "from the data". The mark is fixed on acceptance (M29, an edit
 * is no evidence that the researcher held the concept first), so the refinement
 * is added beside it. A concept that was the researcher's from the start reads
 * "yours" whatever they later changed.
 */
export const REFINED_MARK = "refined by you";

export function conceptMarkLabel(origin: Origin, refined: boolean): string {
  return refined && origin !== "author-prior" ? `${originLabel(origin)}, ${REFINED_MARK}` : originLabel(origin);
}

/** The Report's line under a concept or relation: who wrote it, and who refined it. */
export function conceptWrittenLine(origin: Origin, refined: boolean): string {
  return refined && origin !== "author-prior" ? `Written by Abductive, ${REFINED_MARK}` : `Written by: ${originWritten(origin)}`;
}

/**
 * What the dashed ring means, everywhere it is drawn.
 *
 * Here rather than in the mark module because it is a sentence and the mark
 * module is now unimportable outside its own boundary; the export legend, the
 * graph key and the tests all need to print it.
 */
export const ADRIFT_READS =
  "dashed ring: this claim's links are still to come. A missing link is often the thing worth looking at.";
