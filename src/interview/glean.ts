/**
 * Drafting ontology pages from what the researcher just said (ISC-247 … ISC-254).
 *
 * M63 (ISC-610, the owner, 2026-09-30): a turn no longer drafts claims. The
 * drafter was redirected to `concepts/suggest.ts`, which suggests concepts from
 * a saved summary and from a read of the data. What stays here are the rules
 * about which passages a drafter may be handed and cite, and what counts as an
 * answer with nothing in it, which the suggester reads. The history below is
 * kept because it is the argument those rules rest on.
 *
 * The tool's headline claim is that it builds the researcher's model of the
 * phenomenon as they answer. Until now it did not: an answer produced a
 * `response` event and stopped there. Extraction existed but was wired only to
 * uploaded documents, so the ontology could only ever fill from material, never
 * from the interview that is supposed to be the primary instrument.
 *
 * The obvious repair — point the document extractor at each answer and stage
 * what comes back — is wrong, and an advisor pass at the approach boundary is
 * what caught it. In the document path the adjudication question is
 * well-posed: does this proposal fairly represent what the source said? The
 * source is external and you have standing as its critic. In the interview
 * path the source is you, so the question becomes "is this a fair reading of
 * what I meant", which has no external referent and which the adjudicator
 * cannot answer against anything but their own memory. Worse, extraction is
 * lossy in one direction: answers are hedged, scoped and exploratory, typed
 * page slots hold none of that, and what survives is the confident residue.
 * Ratify that residue and the ontology fills with declarative commitments
 * distilled from tentative speech, each stamped with the researcher's name.
 * The mechanism meant to deliver the promise would have voided it.
 *
 * So the draft is a draft. The model writes a first pass, it lands in the same
 * tray under the same door as everything else, and the researcher is invited to
 * edit rather than approve. Whether they edited is what the record keeps.
 *
 * This paragraph used to end "and a page whose text the researcher changed
 * becomes `author-prior`", which was the first design and is not what ships.
 * `src/proposals/adjudicate.ts:172` stamps `origin: "model-proposed" as const`
 * on every accepted draft, edit or no edit, and the comment above that line
 * argues the reversal at length: `author-prior` asserts the researcher held the
 * concept before the model offered it, and editing a draft is evidence of the
 * opposite. The flip also taxed agreement, since the only way to be credited
 * would have been to diverge from text you endorse.
 *
 * What the researcher did to the text is kept beside the page on the
 * adjudication instead, as additive history. The Your model tab says the same
 * thing to the reader: the claim is recorded as the model's draft with your
 * edit beside it. A comment describing behaviour the code does not have is a
 * defect on its own, and this one had been describing the opposite of the
 * shipped rule since before release.
 *
 * Two limits are deliberate. `MAX_PER_TURN` is three, because forty answers at
 * four drafts each is a hundred and sixty queue items per session and a
 * backlog gets bulk-actioned, which is the mechanism by which flooding causes
 * the rubber-stamping the design is trying to avoid. And nothing is drafted
 * from a refusal or a one-line answer, because there is nothing in them to
 * draft from and a tray full of thin pages teaches the researcher to stop
 * reading the tray.
 *
 * No attention events, and that survives M35 (D8) even though passages now do
 * reach the model. The document path emits retrieval and citation attention so
 * you can audit what the extractor looked at, and the coverage map counts what
 * those events say. Emitting them here would count one reading twice: the same
 * passage is already read by the paper judge and by the data reader, and the
 * residue trajectory that "your account absorbed everything" is measured on
 * would move because the researcher answered a question. `sourceTurn` still
 * names the turn, `sourceChunks` now names what the answer rested on, and the
 * two together are the whole provenance of a drafted page.
 *
 * The puzzle bar in the prompt below is the one piece of this that came from
 * outside. A co-author read the first page this drafter ever produced, typed
 * `puzzle`, and said "that doesn't seem like a puzzle." They were right: it was
 * a restatement of the researcher's framing worry, with nothing unaccounted
 * for and nobody's expectation at stake. Getting that wrong is worse than
 * drafting nothing, because a puzzle sits at the root of the graph and the
 * rest of the ontology hangs off it.
 */

import type { PageType } from "../ledger/events.ts";
import { dataOnly, type Chunk } from "../state/chunks.ts";
import { lineNamesDocument } from "../proposals/theory.ts";

/** Above this many drafts from one answer the tray stops being readable. */
export const MAX_PER_TURN = 3;

/** Below this many characters there is nothing to draft from. */
export const MIN_ANSWER_CHARS = 60;

/**
 * How many data passages the drafter is handed before the answer has to choose
 * (M35, D8).
 *
 * A whole corpus in every prompt is a cost paid on every answer, and most of it
 * is about something else. Past this many, only the documents the answer names
 * are handed over, which on a large study is usually one or two.
 *
 * Forty is the team lead's number and it is a judgement rather than a
 * measurement: it is roughly where a corpus stops fitting comfortably beside a
 * question and an answer, and it is above the size of every study the tool has
 * been walked through. A study at or under it hands everything over, because
 * the passage an answer draws on is the one thing the drafter cannot guess.
 */
export const MAX_PASSAGES_IN_PROMPT = 40;

/** The study's own material, for the drafter to cite from. */
export interface GleanDataInput {
  /** Every passage in the study. Papers are filtered out here, not by the caller. */
  readonly chunks: readonly Chunk[];
  /** Which file each passage came from, for the choosing past the cap. */
  readonly documentNames: ReadonlyMap<string, string>;
}

/**
 * The passages this answer gets to cite from.
 *
 * Data only, and the filter is here rather than at the caller for the reason
 * `extractProposals` gives one function over: this is the boundary the rule is
 * stated at, and a second caller that forgot it would be a silent hole.
 *
 * Past the cap the answer's own words choose. The match is `lineNamesDocument`,
 * which is the one definition in this codebase of whether a piece of text names
 * a file, so a document is handed over when the answer carries a distinctive
 * word of its name. That is the whole of the signal available: a document knows
 * its name and nothing else, so an interviewee or a date reaches this only as
 * part of the file name a researcher gave it.
 */
export function passagesForAnswer(
  data: GleanDataInput | undefined,
  answer: string,
): readonly Chunk[] {
  if (data === undefined) return [];
  const chunks = dataOnly(data.chunks);
  if (chunks.length <= MAX_PASSAGES_IN_PROMPT) return chunks;
  const named = new Set(
    [...new Set(chunks.map((c) => c.documentId))].filter((id) => {
      const name = data.documentNames.get(id);
      return name !== undefined && lineNamesDocument(answer, name);
    }),
  );
  return chunks.filter((c) => named.has(c.documentId));
}


/**
 * What a drafted page is allowed to cite (M29, E4/R6).
 *
 * The guarantee: no page drafted out of an interview answer rests on a paper
 * unless it is a theory page, which is the one kind of page whose whole content
 * is what a paper expects. Anything else citing a paper is somebody's argument
 * standing in for what happens in the setting.
 *
 * What was actually there when this was built, because it is worth writing down
 * rather than leaving the next reader to rediscover. The design escalation
 * predicted a live leak here and there was not one: `gleanFromTurn` set
 * `sourceChunks` to the empty array on every draft, so nothing citing a paper
 * could come out of it. The leak it predicted was real one step earlier and is
 * fixed there, in `prompt.ts`, where the papers now arrive marked.
 *
 * So this was written as a guard rather than a repair, on the live path rather
 * than in a comment, against the day the drafter would be allowed to cite. That
 * day is M35 (D8), the change was made by somebody who did not have to be told
 * this rule, and the guard was already sitting on the line that writes
 * `sourceChunks`. This is what putting a rule where the change cannot miss it
 * buys.
 */
export function citableChunks(
  pageType: PageType,
  chunkIds: readonly string[],
  literatureChunkIds: ReadonlySet<string>,
): readonly string[] {
  if (pageType === "theory") return chunkIds;
  return chunkIds.filter((id) => !literatureChunkIds.has(id));
}

/** A declined question is an answer, and it is not a page. */
export function isDeclined(answer: string): boolean {
  return /^\s*(i don't know|i do not know|not now|no comment|pass)\s*[.!]?\s*$/i.test(answer);
}

