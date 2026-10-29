/**
 * What the papers expect, and what the researcher has done about it (M33).
 *
 * The owner's ask: "the paper assessment shouldn't just examine fit, it should
 * establish the baseline expectations from the literature and incorporate those
 * into the questioning that the tool performs."
 *
 * What was there before. The fit judge made one call per paper on arrival and
 * wrote back a verdict and one sentence. The reader made a second call per
 * paper, and only when the researcher pressed a button. Between arrival and
 * that press a paper contributed one word to the study, and the interviewer's
 * literature source was gated on the first accepted theory page, so it was
 * silent through the whole early period. A paper could sit in the list for a
 * week having told the tool nothing but "fits".
 *
 * ── A baseline is not a theory page ───────────────────────────────────────
 *
 * A baseline is a property of the paper: what it leads a reader to expect in a
 * setting like this one, true whether or not the researcher agrees. A theory
 * page is their ratified version, and it carries `literature-derived`, takes
 * relations and obligations, and is read by the checks and the exports. Two
 * objects, one derivation. One object would put unratified model text inside
 * the model and break the commitment three surfaces state (ISC-409).
 *
 * ── One derivation, and where the second one went ─────────────────────────
 *
 * The reader used to derive the same three parts a second time, from the same
 * paper against the same study, on a button press. That is what produced the
 * walk finding where a second press staged eight differently-worded drafts of
 * the same three expectations: a model asked twice does not answer twice the
 * same. The owner's ruling for M33 is that the button keeps its place and stops
 * being a model call. It stages the baselines the researcher has not turned
 * down, through the tray, under the same door as everything else. One call per
 * paper instead of two, and the duplicate wording is gone by construction
 * rather than by a guard that could not work.
 *
 * ── What is in this module ────────────────────────────────────────────────
 *
 * The block the judge writes and how it is read back; how many each verdict
 * allows; the selectors that say which baselines a study holds and which of
 * them the researcher has answered or turned down; and the decline, which is
 * the same pair of events `ExpectationChooser` writes and never a rewrite of
 * the `paper-fit` event.
 */

import type {
  LedgerEvent,
  PaperBaseline,
  ProposalEvent,
  QuestionSelectionEvent,
  RefusalEvent,
} from "../ledger/events.ts";
import type { PaperFit } from "./fitVerdict.ts";

/**
 * Above this many drafts from one paper the tray stops being readable.
 *
 * One constant, and it used to be two. `MAX_PER_PAPER` capped what the reader
 * drafted and a separate cap would have limited what the judge writes down,
 * which would let a paper hold expectations the button could never stage.
 * `theory.ts` re-exports this so its old name still resolves.
 */
export const MAX_PER_PAPER = 3;

/**
 * What a claim with no uploaded paper behind it says instead of a citation.
 *
 * Moved here from `theory.ts` at M33 so the judge can use it without importing
 * the reader, which imports the judge. The string is unchanged: it is on the
 * record of every study that has read a typed line, and the exports print it.
 */
export const NO_SOURCE_FILE = "from your typed list, without a source file";

/**
 * How many baselines each verdict allows.
 *
 * `misfit` is zero rather than one, which is where this differs from the
 * reader's old draft allowance. Pressing the button on a paper the tool has
 * flagged is the researcher overriding the verdict, and an override is
 * something they did; arrival is not. Writing expectations down for a paper
 * nobody has asked about would put the model's doubt and the model's
 * expectations on the same row.
 */
export const BASELINES_ALLOWED: Readonly<Record<PaperFit, number>> = {
  fits: MAX_PER_PAPER,
  unclear: 1,
  misfit: 0,
};

/**
 * The id of one baseline: the paper it came from, and what it says.
 *
 * Derived from the expectation's own words rather than from its position, and
 * the difference is a live defect rather than a nicety. A framing change
 * re-judges every paper, so the second judgement writes a second set of
 * baselines about the same paper. Under a positional id the new first
 * expectation would inherit the answer and the decline given against the old
 * first expectation, which is a different sentence: the row would show a
 * turned-down notice under a claim the researcher had never seen, and the
 * staging would refuse to draft it. Keyed on the words, an answer follows the
 * sentence it was about, and a re-judgement that reaches the same expectation
 * keeps the answer that was given to it.
 *
 * Not a uuid, for the reason a uuid was never right here: it would make the id
 * depend on when the judge ran, so every re-judgement would silently discard
 * every answer.
 *
 * FNV-1a over the normalised text. Short, deterministic, no dependency, and it
 * only has to separate three sentences about one paper from each other.
 */
export function baselineId(paperKey: string, expectation: string): string {
  const text = expectation.trim().toLowerCase().replace(/\s+/g, " ");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${paperKey}#${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Read the blocks back off the judge's answer.
 *
 * Everything is dropped rather than repaired. A block with no expectation is
 * nothing; a block with no scope is an expectation with no boundary, which is
 * the half of a baseline the questioning turns on; a citation naming a passage
 * of another paper is the model reaching outside the one document it was
 * handed. In every case the right move is to have one fewer baseline, because
 * a researcher can answer a paper that expects two things and cannot answer a
 * row that says nothing.
 */
export function parseBaselines(
  text: string,
  input: {
    readonly paperKey: string;
    readonly allowed: number;
    /** The passages this paper owns. Empty for a line the researcher typed. */
    readonly ownChunks?: ReadonlySet<string>;
  },
): readonly PaperBaseline[] {
  if (input.allowed <= 0) return [];
  const out: PaperBaseline[] = [];
  for (const block of text.split(/\n\s*---\s*\n/)) {
    if (out.length >= input.allowed) break;
    const expectation = (/^[ \t]*EXPECTS:[ \t]*(.+)$/im.exec(block)?.[1] ?? "").trim();
    const scope = (/^[ \t]*SCOPE:[ \t]*(.+)$/im.exec(block)?.[1] ?? "").trim();
    if (expectation === "" || scope === "") continue;
    const cite = /\[\[chunk:([^\]]+)\]\]/.exec(
      /^[ \t]*CITE:[ \t]*(.+)$/im.exec(block)?.[1] ?? "",
    )?.[1];
    /* Only this paper's own passages. A citation to another paper, or to the
     * researcher's data, is a claim resting on something nobody asked the model
     * to read. Dropped rather than kept, which leaves the baseline standing
     * without a passage: the expectation is still the paper's, and the row says
     * so by having nothing to open. */
    const chunkId =
      cite !== undefined && input.ownChunks?.has(cite) === true ? cite : undefined;
    const id = baselineId(input.paperKey, expectation);
    /* Two blocks saying the same thing are one expectation. They would share an
     * id, so an answer to one would be an answer to both, and the row would draw
     * the same sentence twice with two sets of controls. */
    if (out.some((b) => b.id === id)) continue;
    out.push({
      id,
      expectation,
      scope,
      ...(chunkId === undefined ? {} : { chunkId }),
    });
  }
  return out;
}

/** One paper's expectations, as a surface or a check needs them. */
export interface PaperBaselines {
  readonly paperKey: string;
  readonly paperName: string;
  readonly baselines: readonly PaperBaseline[];
}

/**
 * The baselines the study currently holds, by paper key.
 *
 * Last verdict wins, for the reason `paperVerdicts` gives: the record appends,
 * and a re-judgement is a later event about the same paper rather than a
 * correction of the earlier one. `live` filters to the keys the study still
 * names, so a typed line the researcher has edited stops being counted the
 * moment the line it judged is gone, exactly as its verdict does.
 */
export function paperBaselines(
  events: readonly LedgerEvent[],
  projectId: string,
  live?: ReadonlySet<string>,
): ReadonlyMap<string, PaperBaselines> {
  const out = new Map<string, PaperBaselines>();
  for (const event of events) {
    if (event.type !== "paper-fit" || event.projectId !== projectId) continue;
    if (live !== undefined && !live.has(event.paperKey)) continue;
    out.set(event.paperKey, {
      paperKey: event.paperKey,
      paperName: event.paperName,
      baselines: event.baselines ?? [],
    });
  }
  return out;
}

/** The topic one baseline's question is asked and refused under. */
export function baselineTopic(id: string): string {
  return `literature:baseline:${id}`;
}

/** The baseline a topic is about, or undefined when the topic is not one. */
export function baselineOfTopic(topic: string): string | undefined {
  return topic.startsWith("literature:baseline:")
    ? topic.slice("literature:baseline:".length)
    : undefined;
}

/**
 * Which baselines the researcher has already dealt with.
 *
 * Two ways to deal with one and the record keeps them apart, because they mean
 * different things: an answer is evidence about the setting, and a decline is
 * evidence about the paper or about the boundary of the study. Both stop the
 * tool asking, which is what these sets are for.
 *
 * An answer is the researcher's own `response` to a question asked under the
 * baseline's topic. The actor check is the one `interview/state.ts` makes for
 * the same reason: the interviewer's delivery of a question carries the same
 * `inReplyTo` so the transcript threads, and counting it would mark every
 * baseline answered the instant it was asked. A decline is a `refusal` against
 * the same question, which is the pair `baselineDeclineEvents` appends.
 * Nothing is deleted either way and the `paper-fit` event is never rewritten.
 */
export interface SettledBaselines {
  /** Baseline ids the researcher has answered. */
  readonly answered: ReadonlySet<string>;
  /**
   * Baseline ids they turned down, each with the note the refusal carries.
   *
   * A map rather than a set, because the row that shows a turned-down
   * expectation has to be able to say what the researcher said about it, and
   * the three reasons mean three different things. Reading the note back off
   * the record is the only honest way to get it: nothing else knows which of
   * the three was picked.
   */
  readonly declined: ReadonlyMap<string, string>;
}

export function baselinesSettled(
  events: readonly LedgerEvent[],
  projectId: string,
): SettledBaselines {
  /* The question events first, by id, because a response and a refusal both
   * point at the question rather than carrying the topic themselves. */
  const topicOf = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "question-selection" || event.projectId !== projectId) continue;
    const id = baselineOfTopic(event.topic);
    if (id !== undefined) topicOf.set(event.id, id);
  }
  const answered = new Set<string>();
  const declined = new Map<string, string>();
  for (const event of events) {
    if (event.projectId !== projectId) continue;
    if (event.type === "response" && event.actor === "human" && event.inReplyTo !== undefined) {
      const id = topicOf.get(event.inReplyTo);
      if (id !== undefined) answered.add(id);
    }
    if (event.type === "refusal") {
      const id = topicOf.get(event.questionEventId);
      if (id !== undefined) declined.set(id, event.note ?? "");
    }
  }
  return { answered, declined };
}

/** One paper's baselines that are neither answered nor turned down. */
export function waitingBaselines(
  paper: PaperBaselines,
  settled: SettledBaselines,
): readonly PaperBaseline[] {
  return paper.baselines.filter((b) => !settled.answered.has(b.id) && !settled.declined.has(b.id));
}

/**
 * The papers with nothing left to stage (M33).
 *
 * What "already read" means now that the button stages rather than reads. It
 * used to mean "some draft from this paper exists against this framing", which
 * was right when a press cost one model call per paper and produced whatever it
 * produced. It is wrong now: adding one expectation from its own row on
 * Material puts a draft on the record from that paper, and the paper-level
 * guard would then skip it entirely, so the other two expectations became
 * reachable one row-click at a time and the button told the researcher to
 * change their framing.
 *
 * A paper is done when every expectation it holds is either already in the tray
 * or the model, or turned down. A paper holding no expectations is never done,
 * which is the state it was in before: nothing has been written about it, so
 * there is nothing a press could have finished.
 */
export function papersFullyStaged(input: {
  readonly baselines: ReadonlyMap<string, PaperBaselines>;
  readonly declined: { readonly has: (id: string) => boolean };
  /** Titles already in the tray or the model, trimmed and lower-cased. */
  readonly staged: ReadonlySet<string>;
}): ReadonlySet<string> {
  const done = new Set<string>();
  for (const [key, paper] of input.baselines) {
    if (paper.baselines.length === 0) continue;
    const outstanding = paper.baselines.filter(
      (b) =>
        !input.declined.has(b.id) && !input.staged.has(b.expectation.trim().toLowerCase()),
    );
    if (outstanding.length === 0) done.add(key);
  }
  return done;
}

/** Every waiting baseline in the study, papers in the order they were judged. */
export function openBaselines(
  baselines: ReadonlyMap<string, PaperBaselines>,
  settled: SettledBaselines,
): readonly { readonly paper: PaperBaselines; readonly baseline: PaperBaseline }[] {
  const out: { paper: PaperBaselines; baseline: PaperBaseline }[] = [];
  for (const paper of baselines.values()) {
    for (const baseline of waitingBaselines(paper, settled)) out.push({ paper, baseline });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Turning one down
// ---------------------------------------------------------------------------

/**
 * The three answers that are not an answer, and what each one means.
 *
 * The first matters most and is why the list is three rather than two. A
 * baseline for a line the researcher typed comes from the model's memory of a
 * citation rather than from a file it read, and the researcher is the only one
 * in the loop who can catch a fabrication. Saying so is a decision about the
 * paper; saying it does not apply is a decision about the study's boundary; and
 * "not yet" is neither. Three of either kind of decision silences the topic,
 * and silencing on a postponement is the tool giving up early, so the two stay
 * distinguishable on the record.
 */
export const BASELINE_DECLINES = [
  {
    id: "not-what-it-says",
    label: "The paper doesn't say this",
    kind: "wont-answer",
    note: "You said the paper doesn't state this expectation.",
  },
  {
    id: "not-my-setting",
    label: "This expectation doesn't apply to my setting",
    kind: "wont-answer",
    note: "You said this expectation doesn't apply to your setting.",
  },
  {
    id: "not-yet",
    label: "Not yet",
    kind: "not-now",
    note: "You haven't decided yet.",
  },
] as const;

export type BaselineDeclineId = (typeof BASELINE_DECLINES)[number]["id"];

/** The question a baseline puts, which the decline is a decline of. */
export const BASELINE_QUESTION =
  "What in your setting fits this expectation, and what breaks it?";

/** Why the tool is asking, with the paper named as the source of the claim. */
export function baselineRationale(paperName: string): string {
  return `${paperName} leads a reader to expect this, and your verdict on the fit is the paper's way into your project.`;
}

/** The heading over one paper's expectations, wherever they are shown. */
export const BASELINE_SECTION = "What this paper expects";

/** The second line under each one. */
export function baselineScopeLine(scope: string): string {
  return `Where the expectation applies: ${scope}`;
}

/**
 * A decline, as the pair of events it is.
 *
 * The same shape `ExpectationChooser.declineEvents` writes, and appended
 * together for the same reason: a refusal on its own points at a question
 * nobody can read, and a question on its own leaves one standing open. Nothing
 * is deleted and the `paper-fit` event carrying the baseline is not touched,
 * because a decline is what the researcher said about it and not a correction
 * of what the paper expects.
 */
export function baselineDeclineEvents(
  input: {
    readonly projectId: string;
    readonly baselineId: string;
    readonly paperName: string;
    readonly decline: BaselineDeclineId;
  },
  options: { readonly now?: () => number; readonly makeId?: () => string } = {},
): readonly [QuestionSelectionEvent, RefusalEvent] {
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  const entry = BASELINE_DECLINES.find((d) => d.id === input.decline) ?? BASELINE_DECLINES[0];
  const questionId = makeId();
  const ts = now();
  const topic = baselineTopic(input.baselineId);
  return [
    {
      id: questionId,
      ts,
      actor: "human",
      projectId: input.projectId,
      type: "question-selection",
      moveId: `${topic}@${ts}`,
      topic,
      question: BASELINE_QUESTION,
      alternatives: BASELINE_DECLINES.map((d) => d.label),
      mode: "interrogation",
      reason: baselineRationale(input.paperName),
    },
    {
      id: makeId(),
      ts,
      actor: "human",
      projectId: input.projectId,
      type: "refusal",
      questionEventId: questionId,
      kind: entry.kind,
      note: entry.note,
    },
  ];
}

// ---------------------------------------------------------------------------
// What the checks read
// ---------------------------------------------------------------------------

/** One paper's expectations, counted for the rules that read them. */
export interface PaperExpectationCount {
  readonly paperName: string;
  /** How many the judge wrote down. */
  readonly total: number;
  /** How many are neither answered nor turned down. */
  readonly waiting: number;
}

/**
 * The counts two coherence rules need, from the record (M33).
 *
 * Derived here rather than in `lint/`, which reads a design and a graph and has
 * no business projecting a ledger. The caller holds the record and hands the
 * arithmetic down, exactly as it already does for the misfits and the pending
 * drafts.
 */
export function expectationCounts(
  events: readonly LedgerEvent[],
  projectId: string,
  live?: ReadonlySet<string>,
): ReadonlyMap<string, PaperExpectationCount> {
  const settled = baselinesSettled(events, projectId);
  const out = new Map<string, PaperExpectationCount>();
  for (const [key, paper] of paperBaselines(events, projectId, live)) {
    out.set(key, {
      paperName: paper.paperName,
      total: paper.baselines.length,
      waiting: waitingBaselines(paper, settled).length,
    });
  }
  return out;
}

/**
 * What the paper behind each theory page expects, by page id (M33).
 *
 * For `defender-bar`, which asks whether committed defenders of a theory would
 * concede the researcher's anomaly and had only the researcher's own wording of
 * that theory to go on.
 *
 * The link is the citation. A page that came out of a baseline cites the
 * passage that baseline cites, and a passage belongs to a document, and a
 * document is a paper's key. A page whose passages belong to no judged paper
 * gets nothing, which is right: a theory page the researcher wrote themselves
 * has no paper behind it, and inventing one would be worse than silence.
 */
export function theoryBaselines(input: {
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
  readonly pages: readonly { readonly id: string; readonly type: string; readonly supportingChunks: readonly string[] }[];
  readonly chunks: readonly { readonly id: string; readonly documentId: string }[];
}): ReadonlyMap<string, readonly PaperBaseline[]> {
  const byPaper = paperBaselines(input.events, input.projectId);
  const documentOf = new Map(input.chunks.map((c) => [c.id, c.documentId] as const));
  const out = new Map<string, readonly PaperBaseline[]>();
  for (const page of input.pages) {
    if (page.type !== "theory") continue;
    for (const chunkId of page.supportingChunks) {
      const documentId = documentOf.get(chunkId);
      if (documentId === undefined) continue;
      const paper = byPaper.get(documentId);
      if (paper === undefined || paper.baselines.length === 0) continue;
      out.set(page.id, paper.baselines);
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Attaching an answer to the expectation it answered
// ---------------------------------------------------------------------------

/* M63 (the lead's ruling): `attachToBaseline` retired with the per-claim wiring. An
   answer to the question now attaches its observation as a statement under the
   concept, through `concepts/door.ts` (`answerLineEvents`). */
