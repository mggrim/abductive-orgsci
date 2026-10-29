/**
 * What a line between two nodes means (ISC-197 … ISC-208).
 *
 * The graph drew eight relation types as grey lines separated only by dash
 * pattern and stroke weight. Measured on the demo study: `evidences` rendered
 * `#bbb` at weight 1 solid and `resolves` rendered `#bbb` at weight 1.5 solid,
 * which is half a pixel of difference and nothing else. `contradicts` and
 * `tensions-with` were byte-identical. No edge carried an arrowhead, so every
 * directed relation was drawn without its direction, and the only way to learn
 * a role was to hover and read the raw slug out of a `<title>`.
 *
 * So the researcher's report that they could not understand the connections
 * was not a reading failure. There was nothing on screen to read.
 *
 * The eight group into three families, and the family is the first thing to
 * recognise: whether this line is holding the claim up, pushing against it, or
 * closing it down. Colour carries the family, dash separates members within
 * it, and the arrowhead carries direction. No two roles share an appearance.
 *
 * `stands-to` is deliberately the heaviest mark in the graph. It is the
 * puzzle→theory edge, the framing claim, and `events.ts` enforces that it is
 * the only role a `puzzleRelation` may ride on precisely so it cannot be
 * mistaken for an ordinary argumentative edge.
 */

import type { EdgeRole } from "../ledger/events.ts";
// Family reads the semantic triad rather than a palette of its own. Two of the
// three values coincide with a page-type hue, which is a collision tokens.css
// already carries and not one this file gets to resolve on its own.
import { COLOUR } from "../ui/tokens.ts";

export type RelationFamily = "supports" | "opposes" | "settles";

export interface RelationEntry {
  readonly role: EdgeRole;
  readonly family: RelationFamily;
  /** Display name, spaced rather than hyphenated. */
  readonly label: string;
  /** Reads as a sentence: "<from> <reads> <to>". */
  readonly reads: string;
  /** One sentence a researcher can act on. */
  readonly meaning: string;
}

/**
 * The three families and the ink each one draws in.
 *
 * These read the semantic triads rather than the page palette on purpose, and
 * after the palette moved they are the only place where that is not a
 * collision. Green is the tool's word for a thing that holds and rust for a
 * thing that pushes against, on an edge exactly as on an accepted page or a
 * destructive control, so an edge in green is consistent with the chrome rather
 * than borrowing from it. Settles takes the graphite, which is what closing a
 * question down looks like when it is neither. Role inside a family is carried
 * by dash and weight in EDGE_STYLE below, so no family needs a fourth hue.
 */
export const FAMILY: Readonly<
  Record<RelationFamily, { readonly label: string; readonly colour: string; readonly gloss: string }>
> = {
  supports: {
    label: "Supports a claim",
    colour: COLOUR.ok,
    gloss: "One claim gives another claim something to stand on.",
  },
  opposes: {
    label: "Pushes against a claim",
    colour: COLOUR.warn,
    gloss:
      "One claim is trouble for another claim, and Abductive keeps that trouble on the map rather than resolving it.",
  },
  settles: {
    label: "Closes a claim down",
    colour: COLOUR.accent,
    gloss: "One claim answers or limits another claim, and these links owe you the most.",
  },
};

export const RELATION_GLOSSARY: Readonly<Record<EdgeRole, RelationEntry>> = {
  evidences: {
    role: "evidences",
    family: "supports",
    label: "evidences",
    reads: "evidences",
    meaning:
      "This claim cites a passage from your data, and a citation is the only link that reaches into your data.",
  },
  predicts: {
    role: "predicts",
    family: "supports",
    label: "predicts",
    reads: "predicts",
    meaning:
      "If the first claim is true, you should expect to see the second claim, and that expectation makes a claim falsifiable.",
  },
  "stands-to": {
    role: "stands-to",
    family: "supports",
    label: "stands to",
    reads: "stands to",
    meaning:
      // The only entry in the eight that used the term it was defining.
      "The motivating claim: what your puzzle does to an expectation somebody holds. This link matters most and owes the most evidence, so Abductive draws it heaviest.",
  },
  contradicts: {
    role: "contradicts",
    family: "opposes",
    label: "contradicts",
    reads: "contradicts",
    meaning:
      "An observation that the other claim can't account for. Two such observations, from separate documents, turn a weird case into a pattern.",
  },
  rivals: {
    role: "rivals",
    family: "opposes",
    label: "rivals",
    reads: "rivals",
    meaning:
      /* "Records against you" was the phrasing the loop removed from the Design
       * decision row in round 2, because it implies a scoring system the
       * product says twice that it does not have: "a skip never counts as a
       * gap" on Design, "It will not treat a skip as a failure" on the intro.
       * The tool does record a retired rival; it does not hold it against
       * anybody. */
      "A competing explanation of the same phenomenon. Both explanations stay in your ontology. Retiring one explanation without defeating it is a choice that Abductive records.",
  },
  "tensions-with": {
    role: "tensions-with",
    family: "opposes",
    label: "tensions with",
    reads: "is in tension with",
    meaning:
      "Two claims pull against each other and neither has given way. You can leave the tension standing, because a tension isn't a fault to clear.",
  },
  resolves: {
    role: "resolves",
    family: "settles",
    label: "resolves",
    reads: "resolves",
    meaning:
      "You offer one claim as the answer to another claim. You can't resolve a puzzle while a rival explanation is still standing.",
  },
  bounds: {
    role: "bounds",
    family: "settles",
    label: "bounds",
    reads: "bounds",
    meaning:
      "One claim limits where another claim applies, which is a scope condition rather than an answer. Bound a claim and you keep the claim without over-claiming it.",
  },
};

/** Draw order within a family, so the key reads in the same order as the graph. */
export const RELATIONS_BY_FAMILY: Readonly<Record<RelationFamily, readonly EdgeRole[]>> = {
  supports: ["evidences", "predicts", "stands-to"],
  opposes: ["contradicts", "rivals", "tensions-with"],
  settles: ["resolves", "bounds"],
};

export function relationEntry(role: EdgeRole): RelationEntry {
  return RELATION_GLOSSARY[role];
}

/**
 * The sentence form for a role as the ledger recorded it, including one this
 * build's vocabulary does not have.
 *
 * The record is append-only, so a study started under an older vocabulary can
 * hold a role that is no longer in `EDGE_ROLES`, and the wiki's log renders
 * every recorded event rather than the projection. A strict lookup there turns
 * an old study into an export that throws, and `?? role` turns it into an
 * export that prints "anomalous-for" at a reader, which is the defect this
 * whole layer exists to stop. So an unknown role is spelled out rather than
 * decorated: it is still the recorded word, because inventing a family or a
 * meaning for it would be the tool saying something the ledger does not.
 */
export function relationReads(role: string): string {
  return RELATION_GLOSSARY[role as EdgeRole]?.reads ?? role.replace(/-/g, " ");
}
