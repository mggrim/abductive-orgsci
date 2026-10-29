/**
 * The papers, staged for what they expect (M29 spec A1; rewritten at M33).
 *
 * The sibling of `extract.ts`, one field over. That module reads the
 * researcher's data and is forbidden the papers; this one is about the papers
 * and is forbidden the data. Same door at the end of both: what comes back is
 * `ProposalEvent[]`, a type that cannot express a mutation, so there is no path
 * from a paper to changing what the study believes.
 *
 * ── What a theory claim is, and what it is not ─────────────────────────────
 *
 * Not a summary. A prediction about a setting like this one, stated so this
 * setting could break it. That distinction decides everything downstream,
 * because only the first kind can be contradicted by a night ward.
 *
 * "Handoffs fail when the receiving clinician cannot question the sender" is a
 * claim. "Bechky on occupational boundaries" is a citation, and a model built
 * out of citations holds no expectations to break.
 *
 * ── What changed at M33, and why the model call went ──────────────────────
 *
 * This module used to make one call per paper, on a button press, and derive
 * three things the arrival judge had already derived from the same paper
 * against the same study: an expectation, its scope, and the passage behind it.
 * Two calls for one sentence, and the second one produced the walk finding
 * where a second press staged eight differently-worded drafts of the same three
 * expectations. A model asked twice does not answer twice the same, so the
 * guard against duplicates, which compared titles, could not fire.
 *
 * The owner's ruling: the button keeps its place, its label and its sentences,
 * and stops being a model call. What it does now is stage the baselines already
 * on the record, minus the ones the researcher has turned down, as drafts in
 * the tray under the same door as everything else. One derivation the whole
 * tool agrees on, and the duplicate wording is gone by construction rather than
 * by a guard that never worked. `MAX_PER_PAPER` and the judge's baseline cap
 * are one constant now, in `baselines.ts`.
 *
 * So this file is a pure function over the record. It costs nothing, it can be
 * pressed twice with no effect, and it cannot fail because there is nothing in
 * it that can fail.
 *
 * ── The fit gate ──────────────────────────────────────────────────────────
 *
 * There is one judge and it runs on arrival (`paperFit.ts`), when a paper is
 * uploaded or typed and again when the framing moves under it. This module
 * parses no `FIT:` line of its own: it did, and a paper judged here left no
 * `paper-fit` event, so it would have had no baselines either. A paper with no
 * verdict on the record is one that arrived before the study was judgeable, and
 * it has nothing to stage until the next framing save picks it up.
 *
 * ── The typed list ────────────────────────────────────────────────────────
 *
 * A researcher can name their papers without uploading them, and most do at
 * first. A line of `brief.seminalCorpus` that no uploaded file answers to is
 * judged like any other paper, with no passages in context, and what it stages
 * cites nothing. The body says so in the researcher's words rather than leaving
 * a claim that looks grounded and is not.
 */

import type { LedgerEvent, PaperBaseline, ProposalEvent } from "../ledger/events.ts";
import type { AttentionEvent } from "../ledger/events.ts";
import { literatureOnly } from "../state/chunks.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import type { PaperRef, PaperVerdict } from "./paperFit.ts";
import { projectProposals } from "./projection.ts";
import { citationKey } from "./paperFit.ts";
/* Re-exported, not used (M33). This module parses no verdict of its own any
 * more: there is one judge and it is the arrival gate. The names stay resolvable
 * here because callers and tests ask for them at this path, and a second
 * definition anywhere would be a second standard for what the three words mean. */
import { parseFit, PAPER_FITS, type FitVerdict, type PaperFit } from "./fitVerdict.ts";
export { parseFit, PAPER_FITS, type FitVerdict, type PaperFit };
import {
  MAX_PER_PAPER,
  NO_SOURCE_FILE,
  baselineScopeLine,
} from "./baselines.ts";
import { providerField } from "../inference/types.ts";
/* Both moved to `baselines.ts` at M33 so the arrival judge can use them without
 * importing the module that imports it. The names still resolve here, because
 * they are what every caller and every test already asks for. */
export { MAX_PER_PAPER, NO_SOURCE_FILE };

/** One paper: an uploaded document with its passages, or a line with neither. */
export interface PaperInput {
  /** What the researcher calls it: the file name, or the line they typed. */
  readonly name: string;
  /**
   * The uploaded document, when there is one. Absent for a typed line.
   *
   * The finding a misfit raises has to name the paper, and on Material that
   * means the row, which is keyed by document. A typed line has no row and is
   * named by itself.
   */
  readonly documentId?: string;
  /** Its passages, empty for a typed line. */
  readonly chunks: readonly Chunk[];
}

/**
 * How many expectations each paper has produced, and against which framing
 * (walk finding).
 *
 * Pressing the read button twice read the same three papers twice and staged
 * eight expectations, two or four per paper, with different titles each time.
 * The only guard was a list of titles already in the model, and a model asked
 * the same question twice does not answer in the same words, so the guard never
 * fired.
 *
 * A paper counts as read when it has a draft waiting or a claim accepted from
 * it. A paper whose every draft was turned down does not: the researcher said
 * no to what it produced, and asking again is a reasonable thing for them to
 * want.
 */
export function papersAlreadyRead(
  events: readonly LedgerEvent[],
  projectId: string,
): ReadonlyMap<string, { readonly drafts: number; readonly digests: ReadonlySet<string> }> {
  const tray = projectProposals(events, projectId);
  const live = [...tray.pending, ...tray.accepted];
  const out = new Map<string, { drafts: number; digests: Set<string> }>();
  for (const proposal of live) {
    const key = proposal.paperKey;
    if (key === undefined) continue;
    const entry = out.get(key) ?? { drafts: 0, digests: new Set<string>() };
    entry.drafts += 1;
    entry.digests.add(proposal.framingDigest ?? "");
    out.set(key, entry);
  }
  return out;
}

/* `papersToSkip` was here and went at M33.
 *
 * It answered "which papers are not worth spending a call on", which was the
 * right question while a press cost one model call per paper. There is no call
 * now, and the question that replaced it is whether a paper has an expectation
 * left to stage, which `papersFullyStaged` in `baselines.ts` answers off the
 * baselines and the tray rather than off a framing digest. Keeping both would
 * have been two ideas of when a paper is finished, and the walk has already
 * shown what two ideas of one fact do to a surface. */

/** What the row beside a paper says about what it has produced. */
export function expectationsFrom(n: number): string {
  return `${n} expectation${n === 1 ? "" : "s"} drafted`;
}

export interface TheoryExtractionInput {
  readonly projectId: string;
  /** The literature documents in storage. Data documents are ignored. */
  readonly documents: readonly StoredDocument[];
  /** Every passage. Filtered to the papers here, the way `extract.ts` filters the other way. */
  readonly chunks: readonly Chunk[];
  /** `brief.seminalCorpus`, as typed. Lines no uploaded file answers to are papers too. */
  readonly typedList?: string;
  /** Titles already in the model or already drafted, so nothing is written twice. */
  readonly existingTitles?: readonly string[];
  /**
   * The verdicts and the baselines on the record (M29c; M33).
   *
   * The whole input to the staging now, and the reason this function makes no
   * model call. A paper is judged on arrival and what it expects is written
   * down then; this reads that back. A paper with nothing here is one that
   * arrived before the study was judgeable, and it stages nothing until the
   * next framing save picks it up.
   *
   * Built by `paperVerdicts(events, projectId, live)`, which is the same
   * projection every surface reads, so the row on Material and the tray cannot
   * disagree about what a paper expects.
   */
  readonly verdicts?: ReadonlyMap<string, PaperVerdict>;
  /**
   * Baselines the researcher has turned down, by baseline id (M33).
   *
   * A decline is an answer and staging it anyway would put a claim in the tray
   * the researcher has already said the paper does not hold. Built by
   * `baselinesSettled(events, projectId).declined`. Answered ones are not
   * excluded: saying what in your setting fits an expectation is a reason to
   * want it in the model, not a reason to withhold it.
   */
  readonly declined?: { readonly has: (id: string) => boolean };
  /**
   * What was on the record when this staged, for the draft's framing stamp.
   *
   * A baseline is only true of the study its verdict judged, and the stamp is
   * what lets a second press tell a paper already staged against this framing
   * from one whose framing has moved under it.
   */
  readonly framingDigest?: string;
  /**
   * Paper keys not to stage, because they have been staged against this framing
   * already (walk finding).
   *
   * Computed by `papersToSkip` off the record. Passed in rather than read here,
   * so this function stays a reader of papers rather than a reader of the
   * ledger, and so the count the button shows and the papers it acts on come
   * from one place.
   */
  readonly skip?: ReadonlySet<string>;
  readonly now?: () => number;
  readonly makeId?: () => string;
}

export interface TheoryExtractionResult {
  /** Staged candidates. Nothing here has touched the model. */
  readonly proposals: readonly ProposalEvent[];
  /**
   * Empty since M33, and the field stays so callers do not have to branch.
   *
   * Attention is the record that the tool put a passage in front of a model.
   * That happens at the arrival judge now, which is the only thing left in the
   * papers path that reads a file, and `paperFitEvents` writes both layers
   * there. Writing them again here would count one reading twice on the
   * coverage map.
   */
  readonly attention: readonly AttentionEvent[];
  /** What the caller appends. Proposals, in paper order. */
  readonly events: readonly LedgerEvent[];
  /**
   * Empty since M33. The misfit finding is raised by the arrival judge, which
   * is the only judge, and raising it again on a button press would put a
   * second identical row in the open list every time the researcher pressed.
   */
  readonly findings: readonly LedgerEvent[];
  /** One per paper staged from. Zero when there was nothing on the record. */
  readonly papersRead: number;
}

/**
 * The distinctive words of a file name, for matching it against a typed line.
 *
 * "thorp.pdf" gives ["thorp"], which is what a researcher writes when they type
 * "Thorp 2019 on the mathematics of the bet". Deliberately loose in the
 * direction that costs least: a typed line wrongly matched to a file is read
 * once with the file's passages in context, and a line wrongly unmatched is read
 * once with none. Neither loses the paper.
 */
function nameTokens(fileName: string): readonly string[] {
  return fileName
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

/** A year, as a whole token and as something to find inside a typed line. */
const YEAR_TOKEN = /^(1[89]\d{2}|20\d{2})$/;
const YEAR_IN_LINE = /\b(1[89]\d{2}|20\d{2})\b/;

/**
 * The words that say nothing about which paper this is (M35, D4).
 *
 * A year is the first of them, and the walk of 2026-09-09 is what it cost:
 * "Battilana and Dorado 2010, Building sustainable hybrid organizations, AMJ"
 * was paired with `cohen-hilligoss-2010.pdf`, on "2010" and on nothing else.
 * The row then drew the file's verdict and the file's empty expectations
 * instead of its own, and the line stopped counting as a paper anywhere.
 *
 * Function words are the same defect one vocabulary over. The three-letter
 * floor above lets "the", "and", "for" and their like through, so a file named
 * after its title matched any line carrying an ordinary English sentence.
 *
 * Short, and only what a file name and an unrelated citation can share. A word
 * that names an author, a concept or a venue is not on it, because that is
 * exactly the evidence a pairing is supposed to rest on.
 */
const UNDISTINGUISHING: ReadonlySet<string> = new Set([
  "the",
  "and",
  "for",
  "from",
  "with",
  "into",
  "that",
  "this",
  "these",
  "those",
  "how",
  "why",
  "what",
  "when",
  "who",
  "not",
  "but",
  "its",
  "our",
  "your",
  "their",
  "are",
  "was",
  "were",
  "been",
  "over",
  "under",
  /* File names, rather than English. A researcher's downloads folder is full of
   * these and none of them is a title. */
  "pdf",
  "copy",
  "final",
  "draft",
  "paper",
  "preprint",
  "manuscript",
]);

/** The words of a file name that say which paper it is. */
function distinctiveTokens(tokens: readonly string[]): readonly string[] {
  return tokens.filter((t) => !YEAR_TOKEN.test(t) && !UNDISTINGUISHING.has(t));
}

/**
 * How much of a file's name a typed line carries, or undefined when the file is
 * not what the line names.
 *
 * One function, because `lineNamesDocument` and `bestNamedDocument` are two
 * readings of one question and the surfaces disagreed when they were two. The
 * loose one had no year filter, so "Bechky 2003" was read as answered by
 * `bechky-2006.pdf` and dropped from the reading list, while the row it drew
 * said no file answered to it and showed no upload.
 *
 * Three rules, in the order they matter.
 *
 *   1. Two years that disagree are not the same paper, whatever else the names
 *      share. This is what the year has always been good for here.
 *   2. A pairing rests on at least one word that says which paper this is. A
 *      year alone is not a pairing (D4), and neither is "the".
 *   3. A year both sides agree on adds one, as a tie-breaker between two files
 *      by the same authors. It can raise a pairing, never make one.
 */
function pairingScore(line: string, fileName: string): number | undefined {
  const haystack = line.toLowerCase();
  const tokens = nameTokens(fileName);
  const docYear = tokens.find((t) => YEAR_TOKEN.test(t));
  const lineYear = YEAR_IN_LINE.exec(haystack)?.[1];
  if (lineYear !== undefined && docYear !== undefined && lineYear !== docYear) return undefined;
  const named = distinctiveTokens(tokens).filter((token) => haystack.includes(token)).length;
  if (named === 0) return undefined;
  return named + (lineYear !== undefined && lineYear === docYear ? 1 : 0);
}

/**
 * Whether an uploaded file is what a typed line is naming.
 *
 * The gate `papersToRead` reads the list with, and the one `coherence.ts`
 * reuses so a line read as naming a file in one place cannot be read as naming
 * nothing in the other. Since M35 it is the same question `bestNamedDocument`
 * answers, asked without the ranking.
 */
export function lineNamesDocument(line: string, fileName: string): boolean {
  return pairingScore(line, fileName) !== undefined;
}

/**
 * Which uploaded file a typed line names, when several could answer to it.
 *
 * `lineNamesDocument` asks whether a file could be the one at all. That is not
 * enough to choose between two files by the same authors: "Hilligoss and Cohen
 * 2013" contains "cohen", so it matched `cohen-hilligoss-2010.pdf` on the first
 * look and the row said the wrong file was behind it.
 *
 * So: the file sharing the most of its name with the line, ranked by
 * `pairingScore`, which is the same function the loose gate asks. Two readings
 * of one question, and they used to be two functions that disagreed.
 */
export function bestNamedDocument(
  line: string,
  documents: readonly StoredDocument[],
): StoredDocument | undefined {
  let best: { doc: StoredDocument; score: number } | undefined;
  for (const doc of documents) {
    const score = pairingScore(line, doc.name);
    if (score === undefined) continue;
    if (best === undefined || score > best.score) best = { doc, score };
  }
  return best?.doc;
}

/**
 * The papers to read: every uploaded one, then every typed line no upload
 * answers to.
 *
 * Exported because the Material tab counts them to say how many calls the
 * button is about to spend, and a second count computed there would be a second
 * definition of what a paper is.
 */
export function papersToRead(input: {
  readonly documents: readonly StoredDocument[];
  readonly chunks: readonly Chunk[];
  readonly typedList?: string;
}): readonly PaperInput[] {
  const documents = literatureOnly(input.documents);
  const chunks = literatureOnly(input.chunks);
  const papers: PaperInput[] = documents
    .map((doc) => ({
      name: doc.name,
      documentId: doc.id,
      chunks: chunks
        .filter((c) => c.documentId === doc.id)
        .sort((a, b) => a.index - b.index),
    }))
    /* A file nothing came out of is not a paper (walk item 3). An image-only
     * PDF is stored like any other and yields no passages, and reading it would
     * be a model call over an empty prompt returning an expectation the tool
     * invented. It is still on the list and its row says the tool could not
     * read it; it is not counted as something to read or to judge.
     *
     * A typed line has no passages either, and is added below rather than here:
     * a line the researcher wrote is a paper they are naming, and reading it is
     * reading the name. A document is a file, and a file with no text is a
     * failure to read it. */
    .filter((paper) => paper.chunks.length > 0);

  for (const line of (input.typedList ?? "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    /* M74b, ISC-664 (the lead's ruling, option B): a typed line is a paper only
     * when it reads as a citation. The walk's student answered "I think there's
     * stuff on volunteering? and craft? ...", which is literatures, not a paper,
     * and Abductive had filed it as one, marked read, with a bearing flag. */
    if (!readsAsCitation(trimmed)) continue;
    if (documents.some((doc) => lineNamesDocument(trimmed, doc.name))) continue;
    papers.push({ name: trimmed, chunks: [] });
  }

  return papers;
}

/**
 * Whether a typed line reads as a citation: an author and then a year, the
 * shape `citationKey` keys on (M74b, ISC-664). Only such a line becomes a paper;
 * the rest of the Literatures answer names the literatures.
 */
export function readsAsCitation(line: string): boolean {
  const flat = line.trim();
  const year = /\b(1[89]\d{2}|20\d{2})\b/.exec(flat);
  if (year === null || year.index === 0) return false;
  return /[A-Za-z][A-Za-z'’-]{1,}/.test(flat.slice(0, year.index));
}

/** Every paper the study currently names, keyed the way a finding keys it. */
export function paperRefs(input: {
  readonly documents: readonly StoredDocument[];
  readonly chunks: readonly Chunk[];
  readonly typedList?: string;
}): readonly PaperRef[] {
  return papersToRead(input).map((paper) => ({
    key: paper.documentId ?? citationKey(paper.name),
    name: paper.name,
    /* The passages travel with the paper now (M33). The judge writes what the
     * paper expects on the call it already makes, and an expectation with no
     * passage behind it is the model's memory of a citation rather than a
     * reading of the file. Every caller of the arrival gate goes through this
     * function, so none of them has to know. */
    chunks: paper.chunks,
    /* M78a, ISC-678: a typed line with no file behind it is named, not read. */
    ...(paper.documentId === undefined ? { named: true as const } : {}),
  }));
}

/**
 * The papers that have text behind them, by the key their verdicts carry (M78a,
 * ISC-678). Checks counts expectations only for these: an expectation written
 * from a citation alone is the model's memory of the paper, so it counts for
 * nothing there and stays readable on Sources under its own label.
 */
export function paperKeysWithText(input: {
  readonly documents: readonly StoredDocument[];
  readonly chunks: readonly Chunk[];
  readonly typedList?: string;
}): ReadonlySet<string> {
  return new Set(paperRefs(input).filter((paper) => paper.named !== true).map((paper) => paper.key));
}

/**
 * Stage what the papers expect, from the record (M33).
 *
 * Writes nothing; returns events for the caller to append. Pure, so it costs no
 * call, cannot fail and can be pressed twice with no effect beyond the first,
 * which is the property the old model call could not have.
 *
 * The body of each draft is the baseline's other two parts. The expectation is
 * the title, because that is what a researcher reads in the tray and what the
 * near-duplicate check compares; the scope and the passage go below it, in the
 * order the reader's own prompt asked for them.
 */
export function extractTheoryClaims(
  input: TheoryExtractionInput,
): TheoryExtractionResult {
  const now = input.now ?? (() => Date.now());
  const makeId = input.makeId ?? (() => crypto.randomUUID());
  const { projectId } = input;

  const skip = input.skip ?? new Set<string>();
  const declined = input.declined ?? new Set<string>();
  const papers = papersToRead(input).filter(
    (paper) => !skip.has(paper.documentId ?? citationKey(paper.name)),
  );
  const proposals: ProposalEvent[] = [];
  /* One set across every paper, so a second paper's baseline does not restate
   * the first one's in the tray. Titles are the judge's own sentences now, so
   * an exact match is a real duplicate rather than the coincidence it used to
   * be. */
  const seen = new Set((input.existingTitles ?? []).map((t) => t.trim().toLowerCase()));
  let staged = 0;

  for (const paper of papers) {
    /* The same key the draft is stamped with, and the same key the verdict was
     * written under: the document for an upload, the first author and year for
     * a typed line. It used to look this up by the raw line, which is not the
     * key `paperVerdicts` returns, so a typed paper's verdict was never found. */
    const key = paper.documentId ?? citationKey(paper.name);
    /* M78a, ISC-678: a paper with no text stages nothing. An older project's
     * expectations for it were written from the citation alone. */
    if (paper.documentId === undefined) continue;
    const recorded = input.verdicts?.get(key);
    /* No verdict, or a verdict from before the expectations were written down.
     * Neither has anything to stage, and the second is not a paper that expects
     * nothing: it is one the judge has not been asked about yet, and the next
     * pass over the record picks it up. */
    const expectations = recorded?.baselines ?? [];
    if (recorded === undefined || expectations.length === 0) continue;
    let fromThisPaper = 0;
    for (const baseline of expectations) {
      if (fromThisPaper >= MAX_PER_PAPER) break;
      if (declined.has(baseline.id)) continue;
      const title = baseline.expectation.trim();
      const dedupe = title.toLowerCase();
      if (title === "" || seen.has(dedupe)) continue;
      seen.add(dedupe);
      fromThisPaper += 1;
      proposals.push({
        id: makeId(),
        ts: now(),
        /* Still the reader, and still named as a model's sentence (M33). What
         * changed is when the model wrote it: on the call that judged the paper
         * rather than on a second one made here. The model that answered is
         * recorded on the `paper-fit` event and carried through, because a page
         * a model composed has to be able to say which model composed it. */
        actor: "persona:reader",
        projectId,
        ...(recorded.model === undefined || recorded.modelVersion === undefined
          ? {}
          : { model: recorded.model, modelVersion: recorded.modelVersion, ...providerField(recorded) }),
        type: "proposal",
        proposalId: makeId(),
        pageType: "theory",
        title,
        body: baselineBody(baseline),
        /* Only the passage the judge cited, and it was checked against this
         * paper's own ids when it was written down. A citation to another
         * paper, or to the researcher's data, is a claim resting on something
         * nobody asked a model to read. */
        sourceChunks: baseline.chunkId === undefined ? [] : [baseline.chunkId],
        paperKey: key,
        /* What the study said when this was staged, so a second press can tell
         * a paper already staged from one whose framing has moved under it. */
        framingDigest: input.framingDigest ?? recorded.framingDigest,
        // The whole point of the pass. Accepting one of these is not
        // ratification of a model's idea: what the page holds is the paper's
        // expectation, and the record says so forever.
        originOnAccept: "literature-derived",
      });
    }
    if (fromThisPaper > 0) staged += 1;
  }

  return {
    proposals,
    attention: [],
    findings: [],
    events: proposals,
    papersRead: staged,
  };
}

/**
 * The two parts of a baseline that are not its title.
 *
 * Where it holds, in the words the paper's row on Material already uses, and
 * then the passage. A typed line says so in the researcher's words rather than
 * leaving a claim that looks grounded and is not.
 */
function baselineBody(baseline: PaperBaseline): string {
  return [
    baselineScopeLine(baseline.scope),
    baseline.chunkId === undefined ? NO_SOURCE_FILE : `[[chunk:${baseline.chunkId}]]`,
  ].join("\n\n");
}

