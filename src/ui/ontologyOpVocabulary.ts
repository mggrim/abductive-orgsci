/**
 * One phrase per ontology op, for a surface that counts them.
 *
 * Third sibling of `src/ui/originVocabulary.ts` and
 * `src/ui/pageTypeVocabulary.ts`. `Instrumentation.tsx` already owns
 * `ontologyClause`, which is the register for one row of the ledger ("Created
 * an observation", "Joined two pages in tension with"). This is the other
 * register the surfaces need and did not have: the op counted in bulk.
 *
 * Without it the trajectory called all six ops "revisions". On the 44-page
 * probe that was 44 creates, 54 relates and zero revises printed as "98
 * revisions", so the one word the summary chose named the only op that had not
 * fired, and it flattened relations into pages on the surface whose subject is
 * how many pages there are and who wrote them.
 */

import type { OntologyOp } from "../ledger/events.ts";

interface OpCounted {
  readonly one: string;
  readonly many: string;
}

/** Creation first, then the rest in the order a study tends to reach them. */
export const ONTOLOGY_OP_ORDER: readonly OntologyOp[] = [
  "create",
  "revise",
  "relate",
  "unrelate",
  "retire",
  "reinstate",
  /* M44. Last, because it is the one op that changes nothing about what a claim
   * says: the researcher names who in the setting holds an expectation they
   * already accepted. */
  "mark",
];

/**
 * The noun says what the op acted on, which is the half "revisions" dropped.
 * Two of these act on links and four on claims, and a count that does not
 * distinguish them is a count of two different things.
 */
const COUNTED: Readonly<Record<OntologyOp, OpCounted>> = {
  create: { one: "claim created", many: "claims created" },
  revise: { one: "claim revised", many: "claims revised" },
  relate: { one: "link added", many: "links added" },
  unrelate: { one: "link removed", many: "links removed" },
  retire: { one: "claim retired", many: "claims retired" },
  reinstate: { one: "claim restored", many: "claims restored" },
  /* The noun is the expectation rather than the claim, because a mark only ever
   * lands on one: the ledger refuses `heldBy` on any other page type. */
  mark: {
    one: "expectation marked as held in the setting",
    many: "expectations marked as held in the setting",
  },
};

/** One op, counted: "44 claims created". */
export function opCounted(op: OntologyOp, count: number): string {
  const words = COUNTED[op];
  return `${count} ${count === 1 ? words.one : words.many}`;
}

/**
 * What a run of mutations actually was: "44 claims created, 54 links drawn".
 *
 * Only the ops that fired, in declaration order. An op listed at zero teaches
 * the reader to stop reading the list, which is the rule the graph key already
 * follows for its own channels. Empty string when nothing happened, so a caller
 * can drop the clause rather than print a colon with nothing after it.
 */
export function opsCounted(byOp: Readonly<Record<OntologyOp, number>>): string {
  return ONTOLOGY_OP_ORDER.filter((op) => (byOp[op] ?? 0) > 0)
    .map((op) => opCounted(op, byOp[op] ?? 0))
    .join(", ");
}
