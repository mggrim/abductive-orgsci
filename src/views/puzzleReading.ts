/**
 * The puzzle's state, as one projection (M40, ISC-508, ISC-509).
 *
 * The puzzle stopped being a field. It was the second box in the framing band,
 * asking what you expected to find and what you found instead, and a
 * co-author's point at M37 was that the question presumes three things a researcher
 * on day one does not have: an expectation, a finding, and the conflict between
 * them. M37 answered by letting the box come back empty. M40 answers by not
 * asking. What the researcher has already saved holds both halves — an
 * expectation in what they came in looking for and in the answers at the steps,
 * something that did not fit it in the Early data surprise and in the passages
 * they keep opening — so the tool reads it out of those and says on its face
 * that it did.
 *
 * Everything any surface says about the puzzle comes from here, and that is
 * ISC-501 rather than tidiness. Five checks read the puzzle, the study bar prints
 * it, two exports print it, the band shows it and four prompts carry it. Any one
 * of them working out for itself whether a reading is current is a second answer
 * to a question the researcher can see both answers to at once. `flow/` and
 * `ui/` recompute none of it; `tests/m38-one-projection.test.ts` scans those two
 * directories, which is why this lives in `views/`.
 *
 * Two things this file will not do.
 *
 * It never writes. `usePuzzleReading` in `flow/` makes the model call and appends
 * the event; this reads the record back. So a test can put a reading on a ledger
 * and assert every sentence the band will say about it without a model anywhere
 * near the test.
 *
 * And the digest never includes `brief.researchQuestion`. The reading writes that
 * field, so a digest that covered it would compare unequal to itself the instant
 * the write landed, and every reading would be stale on its own output: the band
 * would say "something it read has moved since" about the thing it had just
 * written, for ever, with a control beside it that made it happen again.
 */

import { readingDecision, rejectedBefore, type ReadingDecision } from "../concepts/decisions.ts";
import type { LedgerEvent, PuzzleReadingEvent, PuzzleSource } from "../ledger/events.ts";
import { STATIONS, stationById, type StationId } from "../flow/stations.ts";
import { INTEREST_SUBJECT, stationSubject, stationValue } from "../flow/stationBrief.ts";
import type { ProjectBrief } from "../state/projects.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import { dataOnly } from "../state/chunks.ts";
import { digestSelection, type DigestChunk } from "../interview/studyContext.ts";
import { openedCounts } from "../flow/usePaperFit.ts";

/**
 * What a reader is shown instead of the starting interest's subject.
 *
 * The subject itself is `INTEREST_SUBJECT` in `flow/stationBrief.ts`, beside the
 * writer that files it. The station labels come out of `flow/stations.ts`; this is
 * the one source with no station behind it, so it is the one that needs a label
 * written down, and it is written once here rather than in the band and again in
 * the record.
 */
export const INTEREST_LABEL = "Your starting interest";

/**
 * The six steps a reading is held against, in the order it reads them.
 *
 * Six of the seven stations. `bind` is left out on purpose: it asks what pulls
 * against what, which is a reading of the tension rather than evidence about the
 * setting, and handing the tool an answer that is already an account of a
 * conflict is how a reading starts agreeing with the researcher's own framing
 * instead of being read out of what they observed.
 */
export const PUZZLE_STATIONS: readonly StationId[] = [
  "context",
  "site",
  "process",
  "outcome",
  "sample",
  "early-data",
];

/** What a reading was made of, in the words a reader meets. */
export interface PuzzleBlock {
  /** The place's own label, never a slug. */
  readonly label: string;
  readonly text: string;
}

export interface PuzzleReadingInput {
  readonly brief: ProjectBrief;
  readonly chunks: readonly Chunk[];
  readonly documents: readonly StoredDocument[];
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
}

export interface PuzzleSourcesView {
  readonly sources: readonly PuzzleSource[];
  readonly digest: string;
  readonly blocks: readonly PuzzleBlock[];
  /**
   * Passages of the researcher's own data the study holds, all of them (D21).
   *
   * The reading is made of at most `DIGEST_PASSAGES` of them, and the walk of
   * 2026-09-13 read "and 3 passages" over a corpus of twelve with nothing on the
   * screen saying which three or why three. A count of what was left out is the
   * smallest honest answer, and it is a fact about the corpus rather than about
   * the reading, so it is counted here where the corpus is filtered.
   */
  readonly passagesHeld: number;
}

/**
 * The label for one answer a reading was held against.
 *
 * Answers only, because a passage has no place label: it is a chunk of the
 * researcher's own material and the line that names it counts them instead. A
 * subject this does not recognise is de-hyphenated rather than dropped, which is
 * what keeps a reading written by an older build readable rather than blank.
 */
export function answerLabel(source: Extract<PuzzleSource, { kind: "answer" }>): string {
  if (source.subject === INTEREST_SUBJECT) return INTEREST_LABEL;
  const station = STATIONS.find((s) => stationSubject(s.id) === source.subject);
  return station === undefined ? source.subject.replace(/-/g, " ") : station.label;
}

/**
 * FNV-1a over the normalised material, the same hash `baselineId` uses.
 *
 * Short, deterministic, no dependency, and all it has to do is tell one state of
 * the answers from another. Not a uuid and not a timestamp, for the reason a
 * baseline id is neither: the digest has to compare equal across two calls over
 * the same material or staleness would fire on every render.
 */
function hash(parts: readonly string[]): string {
  /* A visible separator, and the repo has paid for the alternative once already:
   * `framingDigest` in `proposals/paperFit.ts` used a NUL byte here until M33, git
   * read the whole module as binary, and a milestone's work on the paper judge went
   * through unreviewable because no diff could show it. */
  const text = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Whitespace-normalised and lower-cased, so a reformatting is not a change. */
function flat(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * What there is to read, what it hashes to, and what the prompt will list.
 *
 * The three come back together because they are three views of one selection. A
 * caller that took the sources from here and the blocks from somewhere else
 * could file a reading citing a passage the model was never shown.
 */
export function puzzleSources(input: PuzzleReadingInput): PuzzleSourcesView {
  const { brief, chunks, documents, events, projectId } = input;
  const sources: PuzzleSource[] = [];
  const blocks: PuzzleBlock[] = [];
  /* The digest's own parts, collected as the sources are, so the hash covers
   * exactly what was read and in the order it was read. */
  const parts: string[] = [];

  const interest = (brief.startingInterest ?? "").trim();
  if (interest !== "") {
    sources.push({ kind: "answer", subject: INTEREST_SUBJECT });
    blocks.push({ label: INTEREST_LABEL, text: interest });
    parts.push(`${INTEREST_SUBJECT}=${flat(interest)}`);
  }

  for (const id of PUZZLE_STATIONS) {
    const text = stationValue(brief, id).trim();
    /* An empty answer is not a source. A block reading "Early data: " tells the
     * model the step exists and says nothing about the study, and citing it
     * would put a source on the event that carries no evidence. */
    if (text === "") continue;
    sources.push({ kind: "answer", subject: stationSubject(id) });
    blocks.push({ label: stationById(id).label, text });
    parts.push(`${stationSubject(id)}=${flat(text)}`);
  }

  /* The data half, through the selection the paper judge already uses. Data
   * passages only: a paper is not evidence about the setting, and a reading held
   * against one paper would be reading the literature back as a finding. */
  const names = new Map(documents.map((d) => [d.id, d.name] as const));
  const selected: readonly DigestChunk[] = digestSelection({
    chunks: dataOnly(chunks),
    documentNames: names,
    openedCounts: openedCounts(events, projectId),
  });
  for (const chunk of selected) {
    sources.push({ kind: "passage", chunkId: chunk.id });
    blocks.push({
      label: `${names.get(chunk.documentId) ?? chunk.documentId}, passage ${chunk.index + 1}`,
      text: chunk.text,
    });
  }
  /* Sorted by id rather than taken in selection order, so the same three
   * passages hash the same however the attention counts happened to order them.
   * Which three were selected is what the reading is about; the order the sort
   * put them in is not. */
  for (const chunk of [...selected].sort((a, b) => a.id.localeCompare(b.id))) {
    parts.push(`${chunk.id}=${flat(chunk.text)}`);
  }

  return { sources, digest: hash(parts), blocks, passagesHeld: dataOnly(chunks).length };
}

/**
 * The latest reading that counts as the research question (M93, ISC-763): one
 * the researcher accepted, with the words they accepted, or one from before M93.
 * A reading still waiting, or rejected, is not passed to an export.
 */
export function decidedReading(events: readonly LedgerEvent[], projectId: string): { readonly text: string } | null {
  let found: { text: string } | null = null;
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    if (e.type === "puzzle-reading" && e.awaitsDecision !== true) found = { text: e.text };
    if (e.type === "reading-accepted") found = { text: e.text };
  }
  return found;
}

/** The last reading on the record for this study, or null. */
export function latestReading(
  events: readonly LedgerEvent[],
  projectId: string,
): PuzzleReadingEvent | null {
  let found: PuzzleReadingEvent | null = null;
  for (const event of events) {
    if (event.type !== "puzzle-reading" || event.projectId !== projectId) continue;
    /* Append order rather than timestamp, the way every other projection here
     * reads a latest: two events written in the same millisecond are ordered by
     * the ledger and by nothing else. */
    found = event;
  }
  return found;
}

/**
 * How the puzzle stands, in one of six states.
 *
 * Every sentence the band says comes out of this, including the ones that are
 * about nothing having happened. A surface that branched on
 * `researchQuestion === ""` would collapse three of these into one: never read,
 * read and found nothing, and typed before the tool read puzzles at all are
 * three different things to say to a researcher and only one of them is a gap.
 */
export type PuzzleState =
  /** Nothing saved for a reading to be made of. */
  | { readonly kind: "nothing-to-read" }
  /** There is material and no reading yet. */
  | { readonly kind: "unread"; readonly sources: readonly PuzzleSource[] }
  /**
   * A puzzle in the field that no reading wrote.
   *
   * A study framed before M40 typed one into the box that used to be there, and
   * the hosted example is one. It is theirs, so it is shown and it is not
   * relabelled as the tool's; the line under it says when it was stated.
   */
  | { readonly kind: "stated"; readonly text: string }
  /** The latest reading found no puzzle, and says which half was missing. */
  | {
      readonly kind: "none";
      readonly reason: string;
      readonly reading: PuzzleReadingEvent;
      readonly stale: boolean;
    }
  /** The latest reading found one. */
  | {
      readonly kind: "read";
      readonly text: string;
      readonly reading: PuzzleReadingEvent;
      /** Place labels, and "n passages" as one entry. */
      readonly readFrom: readonly string[];
      readonly stale: boolean;
      /** Passages this reading was made of, and passages the study holds (D21). */
      readonly passagesRead: number;
      readonly passagesHeld: number;
      /** M93, ISC-763: the researcher's decision on the reading. */
      readonly decision: ReadingDecision;
    };

/**
 * Where a reading was read from, in words.
 *
 * The passages collapse to a count and the answers keep their labels, because
 * those are the two things a reader can act on: an answer is somewhere they can
 * go and revise, and the passages are their own material, which they do not
 * revise. "Early data, Context and 3 passages" is the shape.
 */
export function readFromLabels(sources: readonly PuzzleSource[]): readonly string[] {
  const labels = sources
    .filter((s): s is Extract<PuzzleSource, { kind: "answer" }> => s.kind === "answer")
    .map((s) => answerLabel(s));
  const passages = sources.filter((s) => s.kind === "passage").length;
  return passages === 0
    ? labels
    : [...labels, `${passages} passage${passages === 1 ? "" : "s"}`];
}

/**
 * Which passages of the corpus a reading covers, or the empty string (D21, M43b).
 *
 * The walk of 2026-09-13 read "Read from Your starting interest, Context, Site,
 * Process, Outcome, Sample, Early data and 3 passages" over a study holding
 * twelve passages, with nothing saying which three or why three. Three is the cap
 * `DIGEST_PASSAGES` sets on every digest the tool builds, and the three are the
 * most-read ones, so the line says both and says how much of the corpus is
 * outside the reading.
 *
 * "Most often read" rather than "you have opened most": the order comes from
 * every `attention` event on a passage, which includes the tool's own reads of
 * the corpus, so a sentence about what the researcher opened would be false on a
 * study where they have opened nothing.
 */
export function passageCoverageLine(read: number, held: number): string {
  if (read === 0) return "";
  const cap = `Abductive considers at most ${read} ${read === 1 ? "passage" : "passages"} of your sources, the passages that you've opened most often.`;
  const left = held - read;
  if (left <= 0) return cap;
  return `${cap} Abductive excludes the other ${left} ${left === 1 ? "passage" : "passages"} from this suggestion.`;
}

/** The labels as one clause: "a, b and c". */
export function readFromSentence(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0] as string;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1] as string}`;
}

export function puzzleState(input: PuzzleReadingInput): PuzzleState {
  const { sources, digest, passagesHeld } = puzzleSources(input);
  const reading = latestReading(input.events, input.projectId);

  if (reading !== null) {
    const stale = reading.digest !== digest;
    if (reading.text.trim() !== "") {
      const decision = readingDecision(input.events, input.projectId, reading);
      return {
        kind: "read",
        text: reading.text.trim(),
        reading,
        readFrom: readFromLabels(reading.sources),
        stale,
        passagesRead: reading.sources.filter((s) => s.kind === "passage").length,
        passagesHeld,
        /* A reading that repeats a rejected one word for word is not offered again. */
        decision: decision.kind === "pending" && rejectedBefore(input.events, input.projectId, reading) ? { kind: "rejected" } : decision,
      };
    }
    return {
      kind: "none",
      /* The event validates only with one of the two, so this fallback is for a
       * row written by a future version of this file rather than for a state the
       * writer can reach. It says what is true of it either way. */
      reason: (reading.none ?? "").trim() === "" ? NO_REASON_GIVEN : sentenceCase((reading.none as string).trim()),
      reading,
      stale,
    };
  }

  const typed = input.brief.researchQuestion.trim();
  if (typed !== "") return { kind: "stated", text: typed };
  if (sources.length === 0) return { kind: "nothing-to-read" };
  return { kind: "unread", sources };
}

/** What a reading with neither a puzzle nor a reason is reported as. */
export const NO_REASON_GIVEN = "Abductive didn't say which half was missing.";

/**
 * What a reading holding nothing but gap markers is reported as.
 *
 * Written here rather than with the prompt that produces the reading (M42), for
 * the reason `NO_REASON_GIVEN` above is: both are sentences the band and the
 * record print when a reading said nothing, and `interview/puzzlePrompt.ts` is
 * model input from end to end otherwise.
 */
export const GAP_ONLY_REASON =
  "You haven't saved an answer that states an expectation, so your puzzle is missing the expectation that it cuts against.";

/**
 * A capital first letter, and nothing else touched.
 *
 * The reason follows "No puzzle yet." on the band's line, and the first live
 * reading came back starting in lower case, so the line read as one broken
 * sentence. The prompt asks for a capital now; this is for the model that does
 * not oblige. Only the first character moves, because the rest is the model's
 * sentence and the record holds it as written.
 */
export function sentenceCase(text: string): string {
  return text === "" ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The puzzle the rest of the tool reads (M58, ISC-568).
 *
 * The researcher's own answer at The puzzle step when there is one, and the
 * tool's reading otherwise. Every reader that used to take `researchQuestion`
 * as "the puzzle" asks here, so a study with an answer and no reading, or a
 * reading and no answer, reads the same way on every surface. `whose` says
 * which one it is, for the surfaces that print provenance beside it.
 */
export function puzzleOfRecord(brief: {
  readonly puzzleAnswer?: string;
  readonly researchQuestion?: string;
}): { readonly text: string; readonly whose: "answer" | "reading" } | null {
  const answer = (brief.puzzleAnswer ?? "").trim();
  if (answer !== "") return { text: answer, whose: "answer" };
  const reading = (brief.researchQuestion ?? "").trim();
  if (reading !== "") return { text: reading, whose: "reading" };
  return null;
}

/** The two puzzle lines a prompt carries, each saying whose words they are. */
export function puzzlePromptLines(input: {
  readonly puzzleAnswer?: string;
  readonly researchQuestion?: string;
}): readonly string[] {
  const lines: string[] = [];
  const answer = (input.puzzleAnswer ?? "").trim();
  const reading = (input.researchQuestion ?? "").trim();
  if (answer !== "") lines.push(`The puzzle, in their own words at the Puzzle step: ${answer}`);
  lines.push(
    reading === ""
      ? "The puzzle, as the tool suggests it from their answers: not yet suggested."
      : `The puzzle, as the tool suggests it from their answers: ${reading}`,
  );
  return lines;
}

/**
 * The puzzle as the memo and the wiki print it (M58, ISC-568): the researcher's
 * own answer first when there is one, then the tool's reading, each under a
 * bold lead naming whose words it is.
 */
export function puzzleExportLines(
  brief: {
    readonly puzzleAnswer?: string;
    readonly researchQuestion: string;
  },
  /** The latest reading on the record, so the Report can say whether it agrees with the saved puzzle. */
  latest: { readonly text: string } | null = null,
): readonly string[] {
  const answer = (brief.puzzleAnswer ?? "").trim();
  const reading = brief.researchQuestion.trim();
  /* M74a, ISC-661 (the walk, finding 9): one puzzle, stated once, or one line
     saying it is missing. An empty reading printed "**Suggested puzzle.**" with
     nothing after it under the student's own puzzle, and the Report later said
     no puzzle was established. The saved puzzle is the Report's puzzle; the
     reading stays beside it (M58), and one line says whether the two agree. */
  if (answer === "" && reading === "") return [`**Your puzzle.** ${PUZZLE_MISSING}`, ""];
  const shown = !(reading === "" || reading === answer);
  /* The reading is printed just above as the suggested puzzle, so the line points at it. */
  const agreement = puzzleAgreement(answer, latest, { quote: !shown });
  return [
    ...(answer === "" ? [] : [`**Your puzzle.** ${answer}`, ""]),
    ...(shown ? [`**Suggested puzzle.** ${reading}`, ""] : []),
    ...(agreement === null ? [] : [agreement, ""]),
  ];
}

/* ── The reading beside a saved puzzle (M74a, ISC-661; the lead's ruling B) ──
 *
 * The reading is drawn from the observations alone (see PUZZLE_STATIONS), so it
 * can't agree with the researcher by construction. Once the researcher has
 * saved a puzzle, the panel and the Report compare the two in one sentence.
 */
export const PUZZLE_READING_MATCHES = "Abductive's suggested puzzle matches your saved puzzle.";
export const PUZZLE_READING_NONE = "Your answers don't yet show a puzzle; your saved puzzle stands as your own.";

const STOP = new Set([
  "that",
  "this",
  "with",
  "what",
  "which",
  "when",
  "where",
  "they",
  "them",
  "their",
  "there",
  "then",
  "than",
  "have",
  "about",
  "from",
  "your",
  "into",
  "just",
  "could",
  "would",
  "should",
  "does",
  "whether",
  "because",
  "while",
  "also",
  "only",
  "some",
  "more",
  "most",
  "very",
  "much",
  "yet",
]);

/** Content words, crudely stemmed, for comparing two short paragraphs. */
function contentWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (raw.length < 4 || STOP.has(raw)) continue;
    out.add(raw.replace(/(?:ing|ed|es|s)$/, ""));
  }
  return out;
}

/**
 * Whether a reading states the same puzzle as the saved one: at least half of
 * the shorter text's content words appear in the other. A lexical test, so a
 * reading that says the same thing in other words reads as different, and the
 * sentence then quotes it for the researcher to judge.
 */
export function samePuzzle(saved: string, reading: string): boolean {
  const a = contentWords(saved);
  const b = contentWords(reading);
  const smaller = Math.min(a.size, b.size);
  if (smaller === 0) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / smaller >= 0.5;
}

/** The one sentence comparing the latest reading with the saved puzzle, or null when either is missing. */
export function puzzleAgreement(
  saved: string,
  reading: { readonly text: string } | null,
  opts: { readonly quote?: boolean } = {},
): string | null {
  if (saved.trim() === "" || reading === null) return null;
  const read = reading.text.trim();
  if (read === "") return PUZZLE_READING_NONE;
  if (samePuzzle(saved, read)) return PUZZLE_READING_MATCHES;
  if (opts.quote === false) return "Abductive suggests a different puzzle from your answers: the suggested puzzle above.";
  return `Abductive suggests a different puzzle from your answers: ${/[.!?]$/.test(read) ? read : `${read}.`}`;
}

/** The Report's one line for a project with no puzzle yet. */
export const PUZZLE_MISSING = "You haven't stated a puzzle yet. At the Puzzle step, state your expectation and the contrast that you found.";

/* ── The expectation, in the researcher's words (M78a, ISC-678) ─────────────
 *
 * The serendipity walk's two readings opened "You expected that Dave's walking
 * founders over to each other was what produced the useful leads", while the
 * student's saved puzzle expected the reverse of what they found: the prepared
 * mind, so that founders who come for their own repairs find more leads. The
 * expectation half of a reading is the researcher's or it is absent, so "You
 * expected that …" has to be a verbatim or near-verbatim span of their saved
 * words, checked here the way M74b checks a quotation in a reply.
 */

/** What a reading says in place of an expectation that the answers don't state. */
export const EXPECTATION_UNSTATED = "Your answers don't yet state the expectation; Abductive suggests this contrast:";

/** The rule the reading's prompt carries, appended by the hook that sends it. */
export const EXPECTATION_RULE = [
  "## The expectation, in their words",
  `- Open the PUZZLE line on the words "You expected" only to quote a sentence from the blocks below in which the researcher states an expectation, word for word or nearly so. Do not compose an expectation from the researcher's observations or data.`,
  `- When none of the researcher's answers states an expectation, start the PUZZLE line with "${EXPECTATION_UNSTATED}" and then state the contrast that you see.`,
].join("\n");

/** A share of the clause's words that one run of the researcher's words has to cover. */
const NEAR_VERBATIM = 0.75;

const FIRST_TO_SECOND: Readonly<Record<string, string>> = {
  i: "you",
  me: "you",
  my: "your",
  mine: "yours",
  myself: "yourself",
  "i'm": "you're",
  "i've": "you've",
  "i'd": "you'd",
  "i'll": "you'll",
  we: "you",
  our: "your",
  us: "you",
};

function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim()
    .split(" ")
    .filter((w) => w !== "")
    .map((w) => FIRST_TO_SECOND[w] ?? w);
}

/** The longest run of the clause's words that appears, in order and unbroken, in one of the texts. */
function longestRun(clause: readonly string[], texts: readonly (readonly string[])[]): number {
  let best = 0;
  for (const text of texts) {
    let prev = new Array<number>(text.length + 1).fill(0);
    for (let i = 1; i <= clause.length; i += 1) {
      const row = new Array<number>(text.length + 1).fill(0);
      for (let j = 1; j <= text.length; j += 1) {
        if (clause[i - 1] === text[j - 1]) {
          row[j] = (prev[j - 1] ?? 0) + 1;
          if ((row[j] ?? 0) > best) best = row[j] ?? 0;
        }
      }
      prev = row;
    }
  }
  return best;
}

/** The end of the expectation clause: the first ", yet", "; ", ", but", ", instead" or sentence end outside a quotation. */
function clauseEnd(text: string, from: number): number {
  let quoted = false;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"' || c === "\u201c" || c === "\u201d") quoted = !quoted;
    if (quoted) continue;
    const rest = text.slice(i);
    if (/^(?:,\s+(?:yet|but|instead|while|whereas)\b|;\s|[.!?](?:\s|$))/.test(rest)) return i;
  }
  return text.length;
}

/**
 * A reading whose "You expected that …" is the researcher's own words, or the
 * same reading with the expectation set aside and the contrast kept.
 */
export function groundedExpectation(reading: string, said: readonly string[]): string {
  const open = /^\s*You expected(?: that)?\s+/.exec(reading);
  if (open === null) return reading;
  const start = open[0].length;
  const end = clauseEnd(reading, start);
  const clause = wordsOf(reading.slice(start, end));
  if (clause.length === 0) return reading;
  const run = longestRun(clause, said.map(wordsOf));
  if (run / clause.length >= NEAR_VERBATIM) return reading;
  const rest = reading
    .slice(end)
    .replace(/^[\s.,;!?]+/, "")
    .replace(/^(?:yet|but|instead|while|whereas)\b[\s,]*/i, "")
    .trim();
  if (rest === "") return EXPECTATION_UNSTATED.replace(/; Abductive suggests this contrast:$/, ".");
  return `${EXPECTATION_UNSTATED} ${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
}
