/**
 * Which origin stamps the ledger contradicts.
 *
 * Origin is the product's central claim. The attribution figure in the memo,
 * the fill share in the figure, the "yours" in the graph key and the whole
 * colonization-versus-discovery measurement all read one field, and on the
 * fixture study that field is wrong on at least one row.
 *
 * How it got wrong. `adjudicate.ts` briefly flipped a page's origin to
 * `author-prior` when the researcher edited a draft before accepting it, on the
 * reasoning that editing is authoring. That flip was removed and the argument
 * against it is written out in `mutationForAccept`, but removing the code did
 * nothing to the pages already stamped by it, and there is no migration that
 * could fix them without rewriting an append-only ledger. So the store holds
 * rows labelled as the researcher's own prior whose body is, character for
 * character, a model draft sitting a few events earlier in the same ledger.
 *
 * What the tool should do about it, decided here rather than left implicit.
 *
 * Not silently trust them. That is the state this replaces, and it is the worst
 * of the options: the memo prints a model share computed over a column that is
 * wrong in the direction that flatters the researcher, which is exactly the
 * number a reviewer would ask about.
 *
 * Not silently reclassify them. Rewriting `author-prior` to `model-proposed` at
 * read time would be the same mistake in the other direction, asserted with the
 * same false confidence, and it would hide that the tool ever had a bug.
 *
 * Not hide the rows. A page is still a page and the researcher still needs it.
 *
 * So: say so. A row whose stamp the ledger contradicts is marked as having an
 * origin the tool cannot vouch for, on screen and in the exports, and the
 * counts that depend on origin report how many such rows they were computed
 * over. An honest number with a stated uncertainty is worth more than a clean
 * number that is wrong, and this is a tool whose entire pitch is that it records
 * what actually happened.
 *
 * "On screen and in the exports" was written before it was true, and the gap it
 * left is the reason the register block below exists. The caveat reached
 * memo.md and ontology.json; the note reached one card behind a click; and the
 * index, the row's accessible name, the drawing, the graph key and the exported
 * figure asserted the claim flat. Two files generated from the same button row
 * disagreed about who wrote the same page, which is precisely the failure
 * OntologyView.tsx records as having cost the export voicing five rounds. The
 * doubt is a drawn channel now (PageMark's `doubted` bar) as well as four
 * written registers, so a surface that draws a page cannot draw its origin
 * without also drawing whether the origin is vouched for.
 *
 * The evidence, and it is deliberately narrow. A `proposal` event is a model
 * draft by construction, and accepting one always writes `model-proposed`, so
 * there is no legitimate path by which a page stamped anything else ends up with
 * a body identical to a proposal in the same ledger. Matching is exact once
 * whitespace and case are normalised: a looser rule would start guessing, and a
 * guess in this column is the thing being complained about.
 */

import type { LedgerEvent, Origin } from "../ledger/events.ts";
import { originLabel, originWritten } from "../ui/originVocabulary.ts";

/** One page whose recorded origin is not supported by the ledger. */
export interface OriginDoubt {
  readonly pageId: string;
  /**
   * The origin the event carries.
   *
   * Typed rather than a bare string, and that is a fix rather than tidying.
   * It was `string`, so `originDoubtNote` interpolated it directly and the
   * detail card printed "Recorded as author-prior, and the tool cannot vouch
   * for that" while the row two hundred pixels above it printed "yours". The
   * exported memo did the same in its own per-page list. That is the
   * round-nine defect, in the one sentence written to correct a different
   * defect in the same column: a value with a canonical human name, rendered
   * by its internal slug. Typed as Origin it goes through originVocabulary
   * like every other rendering of it.
   */
  readonly claimed: Origin;
  /** What in the ledger contradicts it, in the researcher's terms. */
  readonly evidence: string;
}

/**
 * The doubts that fall on a given set of pages, in the order those pages are in.
 *
 * Every surface that prints a COUNT of doubted pages goes through here, and
 * that is the point rather than a convenience. `originDoubts` reads the ledger,
 * so it can name a page that has since been superseded and is on nobody's
 * screen. A memo counting the ledger's doubts beside a screen counting the
 * live ones is a count the researcher can see in two places that disagree,
 * which is a defect this repo has already paid for once in the findings column.
 * The screen, the memo, the agent graph, the wiki and the figure all report the
 * doubts on the live pages they are each describing.
 */
export function doubtsOn(
  doubts: ReadonlyMap<string, OriginDoubt>,
  pages: readonly { readonly id: string }[],
): readonly OriginDoubt[] {
  if (doubts.size === 0) return [];
  const out: OriginDoubt[] = [];
  for (const page of pages) {
    const doubt = doubts.get(page.id);
    if (doubt !== undefined) out.push(doubt);
  }
  return out;
}

/** Whitespace-collapsed and case-folded, so reflowing a paragraph is not a difference. */
function norm(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Pages whose origin the ledger contradicts, keyed by page id.
 *
 * Empty on a study with no such rows, which is every study created after the
 * flip was removed. That is the intended end state: this is a reader for a
 * defect in historical data, not a permanent feature of the model.
 */
export function originDoubts(
  events: readonly LedgerEvent[],
  projectId?: string,
): ReadonlyMap<string, OriginDoubt> {
  const scoped =
    projectId === undefined ? events : events.filter((e) => e.projectId === projectId);

  /*
   * Every body and title a model drafted, whether or not the draft was
   * accepted, and against each one the origins the door was allowed to stamp
   * for it.
   *
   * M29 is why the value is a set rather than nothing. The premise this module
   * was written on, quoted from its own header, was that "accepting one always
   * writes `model-proposed`, so there is no legitimate path by which a page
   * stamped anything else ends up with a body identical to a proposal". R3
   * opened two such paths on purpose: an expectation drawn out of a named paper
   * accepts as `literature-derived`, and a framing relation chosen among four
   * shown neutrally accepts as `author-prior`. Both are drafts by construction
   * and both are honestly labelled, so doubting them would have put the
   * unvouched bar across every claim a researcher took from a paper.
   *
   * The narrowness is kept. The set holds only what the draft itself declared,
   * so an `author-prior` page matching an ordinary extractor draft still fires,
   * which is the historical defect this reader exists for.
   */
  const draftedBodies = new Map<string, Set<Origin>>();
  const draftedTitles = new Map<string, Set<Origin>>();
  const record = (into: Map<string, Set<Origin>>, key: string, allowed: Origin | undefined) => {
    if (key === "") return;
    const set = into.get(key) ?? new Set<Origin>();
    if (allowed !== undefined) set.add(allowed);
    into.set(key, set);
  };
  for (const event of scoped) {
    if (event.type !== "proposal") continue;
    record(draftedBodies, norm(event.body), event.originOnAccept);
    record(draftedTitles, norm(event.title), event.originOnAccept);
  }

  const out = new Map<string, OriginDoubt>();
  if (draftedBodies.size === 0 && draftedTitles.size === 0) return out;

  /** Whether a draft with this text could honestly have been stamped this way. */
  const declared = (into: Map<string, Set<Origin>>, key: string, origin: Origin): boolean =>
    into.get(key)?.has(origin) === true;

  for (const event of scoped) {
    if (event.type !== "ontology-mutation") continue;
    if (event.op !== "create" && event.op !== "revise") continue;
    // `model-proposed` is already the honest label; there is nothing to doubt.
    if (event.origin === "model-proposed") continue;

    const body = norm(event.body);
    // The body is the stronger evidence and is checked first: two pages can
    // share a title by coincidence and no two people write the same paragraph.
    if (body !== "" && draftedBodies.has(body) && !declared(draftedBodies, body, event.origin)) {
      out.set(event.targetId, {
        pageId: event.targetId,
        claimed: event.origin,
        evidence: "the claim's body is word for word a suggestion that the model wrote in this same session",
      });
      continue;
    }
    const title = norm(event.title);
    if (
      title !== "" &&
      draftedTitles.has(title) &&
      !declared(draftedTitles, title, event.origin)
    ) {
      out.set(event.targetId, {
        pageId: event.targetId,
        claimed: event.origin,
        evidence: "the claim's title is word for word a suggestion that the model wrote in this same session",
      });
    }
  }
  return out;
}

/**
 * The four registers a doubt is said in, and why there are four.
 *
 * The defect this set exists to close. Until now the module offered exactly two
 * strings: a long note for a detail card and a caveat for an export. So the
 * caveat reached memo.md and ontology.json, the note reached the one card a
 * researcher has to click, and every surface in between had nothing to print
 * and printed the bare claim. On the fixture that was the index cell, the row's
 * accessible name, the drawing, the graph key and the exported figure: five
 * places asserting "yours" flat while a file built by a button one tab away
 * opened with "1 page carries an origin this tool cannot vouch for".
 *
 * A register missing from the vocabulary is a surface that will invent one or
 * say nothing, and originVocabulary.ts already learned that lesson for the
 * words. These are the same three registers it names, plus the legend:
 * `originDoubtFlag` is what a cell or a label says beside the claim,
 * `originDoubtNote` is the full explanation on a card, `originDoubtLegend`
 * defines the mark, and `originDoubtWritten` is the third person a document
 * that leaves the tool uses.
 */

/**
 * Beside the claim, in a table cell or an accessible name (R4, copy C2).
 *
 * It was "not vouched for": an agentless passive, in the WHO column of the
 * claims table, four inches under the plain version of the same fact. What is
 * wrong is not that nobody vouched for it. It is that the record disagrees with
 * the mark, which is the thing a reader can act on and the words the note and
 * the legend on the same page already use.
 */
export const ORIGIN_DOUBT_FLAG = "record disagrees";

/** The same fact as a clause, for a label that is already a sentence. */
export const ORIGIN_DOUBT_CLAUSE = "and Abductive can't vouch for that";

/**
 * What the mark on a doubted page means, in a key.
 *
 * Held to the same measure as ADRIFT_READS, which is the sentence it sits
 * beside in both keys. The exported figure sets a legend row as one unwrapped
 * <text> starting 48 units in, so a sentence past about 127 characters runs off
 * the right edge of the file; the first draft of this one was 152 and did.
 * tests/origin-audit.test.ts holds every text element in the figure inside the
 * frame, so the next sentence written here cannot reopen it quietly.
 */
export const ORIGIN_DOUBT_READS =
  "bar across the disc: History disagrees with this claim's origin mark. You don't need to act.";

/** The sentence a surface prints beside a doubted row. One phrasing, everywhere. */
export function originDoubtNote(doubt: OriginDoubt): string {
  return (
    `Recorded as ${originLabel(doubt.claimed)}, ${ORIGIN_DOUBT_CLAUSE}: ${doubt.evidence}. ` +
    "Abductive leaves the mark as recorded and flags it wherever it appears."
  );
}

/** The same doubt in the third person, for a document that leaves the tool. */
export function originDoubtWritten(doubt: OriginDoubt): string {
  return `recorded as ${originWritten(doubt.claimed)}, and unverified: ${doubt.evidence}`;
}

/**
 * The caveat a surface or a file carries when any row it shows is doubted.
 *
 * Written as one sentence a reader meets before the attribution, because a
 * column with known errors in it should not be read first and qualified
 * second.
 *
 * It used to end "Every figure below that is computed from origin is computed
 * over that column as recorded, so read the share as an upper bound", and that
 * sentence was written for the memo and put everywhere. Rendered into the
 * exported figure it named figures the file does not contain and a share it
 * does not print, which is the same class of defect as a comment describing
 * behaviour the code does not have. The clause about the share now lives in
 * `originDoubtShareCaveat`, which the two artefacts that actually print a share
 * use, and everything else prints this. The head is identical in all of them,
 * so a reader holding two of these files side by side still meets one sentence.
 */
export function originDoubtCaveat(count: number): string {
  return (
    `${count} claim${count === 1 ? "" : "s"} say${count === 1 ? "s" : ""} you wrote ${count === 1 ? "it" : "them"} and History disagrees. ` +
    "The body is word for word a model suggestion from the same session. " +
    "Abductive leaves the mark as recorded and flags it wherever it appears."
  );
}

/** The same caveat where a share computed from origin is printed under it. */
export function originDoubtShareCaveat(count: number): string {
  return `${originDoubtCaveat(count)} Read any share computed from origin as an upper bound on the researcher's own contribution.`;
}
