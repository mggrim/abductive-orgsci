/**
 * One word for a slice of material, for every surface that says it out loud.
 *
 * Third sibling of `src/ui/originVocabulary.ts` and `src/ui/pageTypeVocabulary.ts`,
 * written for the same reason one field further out. Those two ended a slug
 * reaching the reader where a canonical English word existed. This one ends the
 * inverse: a canonical English word exists, is used on the surface that owns the
 * object, and five other surfaces kept the internal one.
 *
 * The internal type is `Chunk` and the store is `chunks.ts`, which is fine and
 * stays. What the researcher is looking at is a passage. /material says so in
 * every register it has: the lede ("split into 3 passages for citing and
 * retrieval"), the stat chip, all four filter options, and the accessible name
 * of every row, which reads "Passage 2, opened". `PagePanel` agrees ("Cites 1
 * passage"), so does the export manifest, and so does the falsifier the
 * `uncited-chunk` rule ships with, which offers "you have read the passage and
 * decided nothing in it belongs in your model".
 *
 * What the coherence walk found saying otherwise, all of it about the same
 * objects in the same study:
 *
 *   lint/structural.ts:153   the finding's own claim read "chunk 79a5efe9 is in
 *                            the corpus but no page cites it" directly above its
 *                            own falsifier saying "the passage". One row, one
 *                            object, both words, eighteen pixels apart
 *   lint/structural.ts:123   "accepted without a single supporting chunk"
 *   lint/structural.ts:124   "cites no corpus chunk. It is asserted, not
 *                            grounded", under the comment recording two earlier
 *                            rounds cleaning the parenthesis beside it
 *   views/CoverageMap.tsx    "Chunk #12" in the cell title, for the object
 *                            /material names "Passage 12" in the same study,
 *                            and "one square per chunk of your material" in the
 *                            empty state
 *   Instrumentation.tsx:927  the ledger's own subject column, "chunk 79a5efe9",
 *                            beside rows whose subject is a page or a station
 *   Instrumentation.tsx      the three attention layer sentences, which are the
 *                            legend for that column
 *   ontology/relations.ts    "3 supporting chunk(s)", which also carried the
 *                            "(s)" plural that no other count in the app uses
 *
 * Two of these reach the model rather than the reader, and they are the ones
 * that matter most, for the reason the page-type module records: a word handed
 * to the model comes back as model prose the researcher reads, and by then it is
 * not a literal any source file contains. `lint/semantic.ts` described every
 * page to the checker as carrying N "supporting chunks", and `matrix/matrix.ts`
 * told the model to "count the supporting chunks" in the sycophancy
 * intervention.
 *
 * `[[chunk:ID]]` in `interview/prompt.ts` is deliberately not here. That is a
 * citation syntax the extractor parses back out, not prose, and it never reaches
 * a rendered surface.
 */

import type { DocumentKind } from "../state/chunks.ts";

/** What the researcher calls one slice of their material. */
export const PASSAGE_WORD = "passage";

/** The same word, counted. Singular and plural, no parenthesised "(s)". */
export function passageCount(n: number): string {
  return `${n} ${n === 1 ? PASSAGE_WORD : `${PASSAGE_WORD}s`}`;
}

/**
 * What the researcher calls one of the files they loaded, counted (M29).
 *
 * The sibling of `passageCount`, and it exists because the `contradicts`
 * obligation now counts the right object. Its requirement has always promised
 * "more than one source document" and its result said "1 passage behind them",
 * which named the thing the check used to count rather than the thing the
 * sentence above it asks for.
 */
export function documentCount(n: number): string {
  return `${n} ${n === 1 ? "document" : "documents"}`;
}

/**
 * One passage named by its id, for a claim or a ledger row.
 *
 * The short id is what the researcher can match against the corpus, and eight
 * characters is what every other short id in the app is cut to.
 */
export function passageRef(chunkId: string): string {
  return `${PASSAGE_WORD} ${chunkId.slice(0, 8)}`;
}

/**
 * One passage named the way the reader can go and find it (M29b).
 *
 * `passageRef` prints eight characters of a uuid, which is the right thing for
 * a ledger row and the wrong thing for a sentence: the Checks list told a
 * researcher that "passage 79a5efe9" was cited by nothing, over an id they have
 * no way to look up. The file and the place in the file are what they have.
 */
export function passageIn(document: string, index: number): string {
  return `${PASSAGE_WORD} ${index} of ${document}`;
}

/**
 * One passage named by its position in its document, for a grid cell or a row.
 *
 * Capitalised because both callers open a line with it. /material's row label
 * and the coverage map's cell title now read the same string for the same
 * object, which they did not before.
 */
export function passageAt(index: number): string {
  return `Passage ${index}`;
}

/**
 * What the researcher calls a kind of document (D5).
 *
 * Four of the five are already the English word and pass through. The fifth is
 * not: the stored kind is `literature`, which is the category, and what sits on
 * a row is one item from it. A row reading LITERATURE beside `thorp.pdf` names
 * the shelf; a row reading PAPER names the thing. Same reasoning as the two
 * vocabulary modules this one was written beside, one field further out.
 */
export function documentKindLabel(kind: DocumentKind): string {
  /* M74b: the stored `chatnote` reads as two words. */
  return kind === "literature" ? "paper" : kind === "chatnote" ? "chat note" : kind;
}
