/**
 * Judging a paper against the study, on arrival (M29c).
 *
 * The owner's ask: "if a user does select a paper that doesn't map with the
 * current conversation, either the data or the theory that is being discussed,
 * then the tool should flag the misalignment."
 *
 * Two things were wrong with the gate this replaces. It ran only when the
 * researcher pressed "Draft what these papers expect", so a paper could sit in
 * the reading list for a week, be cited in the framing, and never be judged at
 * all. And it judged against the framing alone, so a paper squarely inside a
 * stated puzzle passed even when it said nothing about the setting the data
 * actually shows, which is half of what the owner asked to catch.
 *
 * So the judgement moves here, out of `extractTheoryClaims`, and runs when a
 * paper arrives: on upload, on a new line in the typed list, and on the framing
 * save that first makes the study judgeable. The reader reuses the verdict
 * rather than asking again, so a paper costs one judging call however many
 * times it is read, unless the framing has moved under it.
 *
 * ── What a verdict is, and is not ──────────────────────────────────────────
 *
 * A verdict is recorded as a `paper-fit` event for all three outcomes, and a
 * `paper-misfit` finding is emitted beside it only for `misfit`. That split is
 * the point. "Fits" and "unclear" are not problems and must not appear in the
 * open findings list; but they are facts the researcher is owed, because "this
 * paper was judged and it is fine" and "this paper has never been judged" look
 * identical without them, and the old build could not tell them apart.
 *
 * ── What it does not do ────────────────────────────────────────────────────
 *
 * It does not gate. A paper judged a misfit can still be drafted from: the
 * button stays live and the reader takes at most one draft from it, as it does
 * for `unclear`. The researcher knows their field and the model does not, and a
 * tool that refuses to read a paper because a model doubted it would be making
 * the methodological decision it exists to surface.
 */

import type { InferenceClient } from "../inference/types.ts";
import { MODEL_VOICE_RULES } from "../inference/promptMarkers.ts";
import { OWNER_RULES } from "../personas/voice.ts";
import { completeInVoice, voiceRetryField } from "../inference/voiceRetry.ts";
import type {
  AttentionEvent,
  LedgerEvent,
  PaperBaseline,
  PaperFitEvent,
} from "../ledger/events.ts";
import {
  canJudgeFit,
  renderStudyContext,
  type StudyContext,
} from "../interview/studyContext.ts";
import type { Chunk } from "../state/chunks.ts";
import { parseFit, type FitVerdict } from "./fitVerdict.ts";
import { bearingReasons } from "../views/paperBearings.ts";
import { BASELINES_ALLOWED, MAX_PER_PAPER, NO_SOURCE_FILE, parseBaselines } from "./baselines.ts";
import { BASELINE_INSTRUCTIONS, citeRule } from "./baselinePrompt.ts";
import { providerField, type Provider } from "../inference/types.ts";

/** A paper to judge: what it is called, and its key on the record. */
export interface PaperRef {
  /** The document id for an upload, the typed line's own text otherwise. */
  readonly key: string;
  /** What the researcher calls it. The file name, or the line they typed. */
  readonly name: string;
  /**
   * Its passages, when the researcher uploaded the file (M33).
   *
   * The judge got the name alone, which is why it could say whether a paper
   * belonged and could not say what it expects: an expectation with no passage
   * behind it is the model's memory of a citation. Empty, or absent, for a line
   * the researcher typed, and the prompt says so in their words rather than
   * leaving a claim that looks grounded and is not.
   */
  readonly chunks?: readonly Chunk[];
  /**
   * A paper named by its citation alone, with no text behind it (M78a,
   * ISC-678). The serendipity walk's six typed citations were all marked READ
   * with expectations the model wrote from memory ("though I can't confirm his
   * exact boundaries without the text"). A named paper is never judged; the
   * reading runs once the researcher uploads the text.
   */
  readonly named?: true;
}

/**
 * The instruction, and the whole of it.
 *
 * Shorter than the reader's prompt on purpose: everything about page types and
 * tray etiquette is absent, because nothing here reaches the model. The verdict
 * wording is the reader's, word for word, because a paper judged here and read
 * there has to be judged by the same standard.
 *
 * M33 adds the second half. The call already had the paper and the study in
 * front of it and was throwing away everything except one word and one
 * sentence, so what a paper expects is written on the same call rather than on
 * a second one made later and only if a button is pressed.
 */
export function fitSystem(input: { readonly bearing: boolean } = { bearing: false }): string {
  return [
  MODEL_VOICE_RULES,
  "",
  /* M69, ISC-644: the owner's rules, which the reason and the expectations a researcher reads must keep. */
  OWNER_RULES,
  "",
  "# Role",
  "A researcher has named a paper they are arguing with. Your job is to say whether that paper predicts anything about a setting like theirs, and then to write down what it leads a reader to expect.",
  "",
  "# First, does it belong here",
  /* The reasoning before the verdict (M33 fix 3).
   *
   * The walk caught the judge calling one paper a misfit and a fit two seconds
   * apart, on identical input: `cohen-hilligoss-2010.pdf` at 09:39:03 and
   * 09:39:05. Last-wins settled the record and the in-flight guard stopped the
   * study paying twice, but neither makes the one answer steadier.
   *
   * It was asked for the verdict token first and the sentence after it, so it
   * committed to a word before writing anything that supported one. This asks
   * for the prediction first. The FIT line keeps its place and its shape, so
   * `parseFit` is untouched: it matches the line wherever in the answer it
   * falls, and the line above it is prose the parser never looks at. */
  "Write one sentence first, and nothing above it: what this paper predicts about a setting like the one described below, or that it predicts nothing about one.",
  /* The line's shape, stated as a shape (D2, D3, M43).
   *
   * It read "FIT: fits | unclear | misfit" and then "Then, on the same line, one
   * sentence saying why", and the walk of 2026-09-13 got back both failures the
   * wording allows. One paper's line rendered as the literal "one sentence saying
   * why" with no sentence behind it, and another as "one sentence why: it speaks
   * directly to…", so the same slot rendered three different ways across five
   * cards: a clean sentence, a labelled sentence, and the label alone.
   *
   * Two things were wrong with the old wording. "FIT: fits | unclear | misfit" is
   * a menu that reads as a line to copy, pipes and all, which is how a table
   * character reached a researcher once already (see `parseFit`). And "one
   * sentence saying why" describes the sentence in words the model can write
   * instead of writing the sentence. Angle-bracketed placeholders with an
   * instruction to replace them is the one shape a model does not copy, and the
   * parser strips the residue anyway if it does. */
  "Then write one line, and nothing else on it:",
  "FIT: <fits, unclear or misfit>. <your sentence>",
  'Replace both angle-bracketed parts. <fits, unclear or misfit> is one of those three words and nothing else. <your sentence> is one sentence saying why, addressed to the researcher as "you".',
  'Write the sentence itself. Do not write the angle brackets, the word "sentence", or a label such as "why:" or "because:" on that line.',
  "",
  "Answer 'misfit' when the paper predicts nothing about a setting like the one described below. A paper about a different kind of setting, a different kind of actor, or about method rather than about the world, is a misfit however good it is and however often others cite it.",
  "Answer 'unclear' when you cannot tell from the material below.",
  "Answer 'fits' when the paper expects something to be true in a setting like theirs.",
  "",
  "Judge against all of the material below: what they are exploring, their puzzle, their setting, the sample of their own data, and the claims already in their model. A paper can sit squarely inside their stated puzzle and still say nothing about the setting their data shows. That is a misfit.",
  "",
  /* The one line a recorded bearing replaces (M51, ISC-533).
   *
   * Without the researcher's sentence, a paper the judge cannot place has
   * nothing behind an expectation and writing one would be the model's memory of
   * a citation. With it, the researcher has said what the paper bears on, so the
   * question is no longer whether the paper belongs: they have answered that,
   * and the call is being made to write down what the paper leads a reader to
   * expect in the setting they named. The verdict is still asked for and still
   * recorded, because a later pass has to know what the judgement thought. */
  ...(input.bearing
    ? [
        "The researcher has told you what this paper bears on in their setting, in their own words below. Take what they say as given.",
        "The question is no longer whether the paper belongs. They have answered that. The remaining question is what the paper leads a reader to expect about the part of their setting they named, so write the blocks below about that, whichever word you put on the FIT line.",
        "Write an expectation only when you can ground it in the paper itself. Where the paper carries none, say so on the FIT line and leave out the blocks.",
      ]
    : ["On 'misfit', stop after that line and leave out the blocks."]),
  ...BASELINE_INSTRUCTIONS,
  "",
  "Write only these lines. Start with the FIT line, and keep commentary out from between blocks.",
  ].join("\n");
}

/** The instruction with no bearing in hand, which is every first judgement. */
export const FIT_SYSTEM = fitSystem({ bearing: false });

/** The heading the researcher's own sentence arrives under. */
export const BEARING_BLOCK_HEAD = "# What the researcher says this paper bears on";

export interface JudgePaperFitInput {
  readonly paper: PaperRef;
  readonly context: StudyContext;
  readonly client: InferenceClient;
  /**
   * What the researcher said this paper bears on, when they have said it (M51).
   *
   * Present means they answered the question the row put to them. The sentence
   * goes into the prompt as their words, the instruction that stops a paper the
   * judge cannot place from producing expectations is dropped, and the allowance
   * below stops being the verdict's.
   */
  readonly bearing?: string;
}

/**
 * A verdict and the expectations that came with it (M33).
 *
 * One object, because they came off one answer about one paper and a caller
 * that could hold one without the other would be able to write a verdict whose
 * baselines belong to a different judgement.
 */
export interface PaperJudgement extends FitVerdict {
  readonly baselines: readonly PaperBaseline[];
  /** What the researcher said the paper bears on, when the call was told (M51). */
  readonly bearing?: string;
  /**
   * Which model wrote the expectations, and which version of it (M33).
   *
   * Carried onto the `paper-fit` event and from there onto anything staged out
   * of a baseline, because a page whose sentence a model wrote has to be able
   * to say which model wrote it. Nothing else in the tool stages a claim
   * without that, and the staging pass makes no call of its own to ask.
   */
  readonly model: string;
  readonly modelVersion: string;
  /** The bridge's lane that wrote them (M56, ISC-575); absent when there was none. */
  readonly provider?: Provider;
  /** M60: the local server, beside provider "local". */
  readonly server?: string;
  /** M69, ISC-644: the reply went back once for a sentence that broke one of the owner's rules. */
  readonly voiceRetry?: true;
}

/**
 * One paper, one call, one verdict, and what the paper expects.
 *
 * Returns `undefined` when the study says too little to judge against, which is
 * not a failure and must not be recorded as one: against a blank brief every
 * paper is a misfit and none of them is. The caller records nothing and tries
 * again when the framing arrives.
 */
export async function judgePaperFit(
  input: JudgePaperFitInput,
): Promise<PaperJudgement | undefined> {
  const { paper, context, client, bearing } = input;
  if (!canJudgeFit(context)) return undefined;
  const chunks = paper.chunks ?? [];
  const result = await completeInVoice(client, {
    system: fitSystem({ bearing: bearing !== undefined }),
    messages: [
      {
        role: "user",
        content: [
          renderStudyContext(context),
          "",
          "# The paper you are judging",
          paper.name,
          "",
          citeRule(chunks.length > 0, NO_SOURCE_FILE),
          /* The researcher's own sentence, above the passages (M51, ISC-533).
           * Their words are quoted material and nothing rewrites them, the rule
           * every other researcher-written block in this codebase follows. */
          ...(bearing === undefined ? [] : ["", BEARING_BLOCK_HEAD, bearing]),
          /* The passages, which is the one real cost rise in M33: a bigger
           * prompt on the same single call. Without them the judge could say
           * whether a paper belonged and could not say what it expects without
           * inventing the passage it came from. */
          ...(chunks.length === 0
            ? []
            : ["", "# Passages", ...chunks.map((c) => `[[chunk:${c.id}]] (#${c.index + 1})\n${c.text}`)]),
        ].join("\n"),
      },
    ],
  });
  const verdict = parseFit(result.text);
  return {
    ...verdict,
    model: result.model,
    modelVersion: result.modelVersion,
    ...providerField(result),
    ...voiceRetryField(result),
    ...(bearing === undefined ? {} : { bearing }),
    baselines: parseBaselines(result.text, {
      paperKey: paper.key,
      /* The verdict's allowance until the researcher has placed the paper
       * themselves (M51, ISC-533). `BASELINES_ALLOWED` gives a paper the judge
       * could not place none, on the reasoning that writing expectations down
       * for a paper nobody has argued for would put the model's doubt and the
       * model's expectations on the same row. The researcher's own sentence is
       * the argument that reasoning was waiting for, and its own docstring says
       * an override is something they did. */
      allowed: bearing === undefined ? BASELINES_ALLOWED[verdict.fit] : MAX_PER_PAPER,
      ownChunks: new Set(chunks.map((c) => c.id)),
    }),
  };
}

/**
 * A digest of the framing a verdict was reached against (M29c, rewritten D19b).
 *
 * ## What it was, and what that cost
 *
 * The exploring text and the puzzle. The puzzle looked like a framing field when
 * it was one; since M40 it is the tool's own reading of the researcher's saved
 * answers, rewritten by `flow/usePuzzleReading.ts` whenever any saved answer
 * moves and whenever the three most-opened passages change, and the passages are
 * ordered by attention events the tool's own reads write. So every station save
 * and every press of "Read your data" moved this digest, and a moved digest
 * re-judges every paper in the study.
 *
 * The demo ledger of 2026-09-13 holds 65 `paper-fit` events for six papers,
 * eleven distinct digests, and verdicts that flip with no researcher input in
 * between: Csaszar from misfit to fits to unclear, Huang from fits to unclear to
 * misfit, Cohen from unclear to fits and back. Each flip is a model call spent to
 * contradict the last one, and each one moves what the researcher is told about
 * their reading list.
 *
 * ## What it is now
 *
 * The three fields the researcher types into the framing band, plus a flag for
 * whether the tool has read a puzzle at all. So a paper is judged when it
 * arrives, when the researcher changes their starting interest, their papers or
 * their venue, and once when the puzzle goes from empty to stated. A later
 * re-reading of the puzzle changes the words and judges nothing, because the
 * judge would be answering the same question about the same study.
 *
 * Decision by the orchestrator on 2026-09-13, to be confirmed by the owner.
 *
 * Whitespace-normalised and lower-cased, so a reformatting is not a change. The
 * parts are joined by a newline, which none of the three fields can hold after
 * normalising, so two studies cannot collide by running their fields together.
 *
 * Changing it changes every digest, so on the next framing save every paper in
 * every existing study is judged once more. That is the same cost M33 accepted
 * for the same reason: a digest in a new vocabulary cannot be compared against
 * one in the old.
 */
export function framingDigest(context: StudyContext): string {
  const part = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  /* Stated or not, never the words. The puzzle is the tool's reading, and a
   * reading that has been rewritten is not a study that has changed. */
  const puzzle = part(context.puzzle) === "" ? "puzzle-empty" : "puzzle-stated";
  return [part(context.exploring), part(context.papers), part(context.venue), puzzle].join("\n");
}

/** One paper's standing on the record: the last verdict, and what it judged. */
/**
 * What a typed paper is keyed on (walk item 4).
 *
 * It was the whole line, so rewriting "Cohen and Hilligoss 2010, The published
 * literature on handof…" into the full title and journal made it a different
 * paper: the verdict reached at 16:05 was left behind on a line that no longer
 * existed, and the rewritten line showed no verdict and no sign that none had
 * been reached.
 *
 * First author's surname and the year, which is what a researcher means when
 * they say which paper they are arguing with, and what survives them fixing the
 * title, adding the journal or spelling out the subtitle. Where there is no
 * year to find, the whole line, normalised: a line with no year is a line the
 * tool cannot identify any better than by its words.
 */
export function citationKey(line: string): string {
  const trimmed = line.trim();
  const year = /\b(1[89]\d{2}|20\d{2})\b/.exec(trimmed);
  if (year !== null && year.index > 0) {
    const before = trimmed.slice(0, year.index);
    const surname = /([A-Za-z][A-Za-z'’-]{1,})/.exec(before)?.[1];
    if (surname !== undefined) return `${surname.toLowerCase()} ${year[1]}`;
  }
  return trimmed.replace(/\s+/g, " ").toLowerCase();
}

export interface PaperVerdict {
  /** The `paper-fit` event this verdict is, so a sentence begun from its reason can name it (M93, ISC-768). */
  readonly eventId?: string;
  readonly paperKey: string;
  readonly paperName: string;
  readonly verdict: PaperFitEvent["verdict"];
  readonly reason: string;
  readonly framingDigest: string;
  /**
   * What this paper expects, from the same event (M33).
   *
   * Absent and empty are different states and the walk found out why. A verdict
   * reached before the field existed has no baselines because nobody has asked
   * this paper what it expects; a `misfit`, and a paper the judge found nothing
   * in, has an empty list because the question was put and the answer was none.
   * Collapsing the two put "This paper expects nothing about a setting like
   * yours" under a paper that fits, which is the tool reporting an absence it
   * has not looked for.
   *
   * So `undefined` means unasked and the surfaces say so, and a paper in that
   * state is due for judging.
   */
  readonly baselines?: readonly PaperBaseline[];
  /** The model that wrote them, when the event records one. */
  readonly model?: string;
  readonly modelVersion?: string;
  /** M56: the lane beside the model, carried like it. */
  readonly provider?: Provider;
  /** M60: the local server, beside provider "local". */
  readonly server?: string;
  /**
   * What the researcher had said the paper bears on when this was judged (M51).
   *
   * Absent on every verdict reached before they answered, which is what makes
   * the diff below exact: a sentence on the record that this verdict was not
   * told about is a paper due for one more reading, and no timestamps are
   * compared to find out.
   */
  readonly bearing?: string;
}

/**
 * The latest verdict per paper, from the record.
 *
 * Last wins, because the record appends and a re-judgement is a later event
 * about the same paper rather than a correction of the earlier one. The earlier
 * verdict stays readable in the ledger, which is where a researcher asking
 * "when did this stop fitting" will look.
 */
export function paperVerdicts(
  events: readonly LedgerEvent[],
  projectId: string,
  /**
   * The keys the study currently names, when the caller knows them.
   *
   * A typed line is keyed by its own text, so editing "Bechky, ASQ" to
   * "Bechky, Organization Science" does not correct the old verdict, it adds a
   * second one about a line that no longer exists. A band reading three lines
   * then reported four papers judged. The events stay: they are what the study
   * thought at the time, and the ledger does not rewrite. What is filtered is
   * what a surface counts and renders.
   */
  live?: ReadonlySet<string>,
): ReadonlyMap<string, PaperVerdict> {
  const out = new Map<string, PaperVerdict>();
  for (const event of events) {
    if (event.type !== "paper-fit" || event.projectId !== projectId) continue;
    if (live !== undefined && !live.has(event.paperKey)) continue;
    out.set(event.paperKey, {
      eventId: event.id,
      paperKey: event.paperKey,
      paperName: event.paperName,
      verdict: event.verdict,
      reason: event.reason,
      framingDigest: event.framingDigest,
      /* Carried exactly as the event holds it, absence included. `?? []` here
       * is what made a pre-M33 verdict indistinguishable from a judged paper
       * that expects nothing. */
      ...(event.baselines === undefined ? {} : { baselines: event.baselines }),
      ...(event.model === undefined ? {} : { model: event.model }),
      ...(event.modelVersion === undefined ? {} : { modelVersion: event.modelVersion }),
      ...providerField(event),
      ...(event.bearing === undefined ? {} : { bearing: event.bearing }),
    });
  }
  return out;
}

/**
 * Which papers need judging now, and why.
 *
 * Three reasons, and the diff is the whole point of the function: a researcher
 * who adds one line to a list of five must cost one call, not five, and a
 * researcher who fixes a typo in their venue must cost none.
 */
export function papersNeedingJudgement(input: {
  readonly papers: readonly PaperRef[];
  readonly verdicts: ReadonlyMap<string, PaperVerdict>;
  readonly digest: string;
  /**
   * What the researcher has said each paper bears on (M51, ISC-533).
   *
   * The fourth reason a paper is due, and the only one that is the researcher
   * answering rather than the study moving: they have said what the paper bears
   * on and the standing verdict was reached without that sentence. One reading
   * per sentence they write, because the sentence is compared rather than the
   * clock, so a paper cannot become permanently due.
   *
   * Omitted by callers that have no record to read, which is the tests and
   * nothing in the app.
   */
  readonly bearings?: ReadonlyMap<string, string>;
}): readonly PaperRef[] {
  const { papers, verdicts, digest } = input;
  const bearings = input.bearings ?? new Map<string, string>();
  return papers.filter((paper) => {
    /* M78a, ISC-678: a paper with no text is Named, and the reading waits for the upload. */
    if (paper.named === true) return false;
    const seen = verdicts.get(paper.key);
    if (seen === undefined) return true;
    // Judged against a framing that has since moved.
    if (seen.framingDigest !== digest) return true;
    // Judged before the researcher said what the paper bears on (M51).
    if ((seen.bearing ?? "") !== (bearings.get(paper.key) ?? "")) return true;
    /* Judged for fit, never asked what it expects (M33 fix). A verdict written
     * before the field existed is current about the one question it answered
     * and silent about the other, and silence there is what the row was
     * reporting as "expects nothing". One call brings it up to date, and it is
     * the same call the diff would have paid for if the framing had moved. */
    return seen.baselines === undefined;
  });
}

/**
 * What one verdict writes to the record: what was read, then the marker.
 *
 * M89 (2026-10-14): a paper that yielded no expectation and whose bearing the
 * researcher had not said also raised a `paper-bearing-unstated` flag here
 * (M51), withdrawn when the framing moved or the paper left the list. The flag
 * and both withdrawals went with the checks, on the owner's instruction. The
 * question on the paper's own row reads the verdict (`views/paperBearings.ts`)
 * and stays.
 */
export function paperFitEvents(input: {
  readonly projectId: string;
  readonly paper: PaperRef;
  readonly verdict: FitVerdict | PaperJudgement;
  readonly framingDigest: string;
  readonly makeId: () => string;
  readonly now: () => number;
  readonly runId?: string;
}): readonly LedgerEvent[] {
  const { projectId, paper, verdict, framingDigest: digest, makeId, now } = input;
  const provenanceKnown =
    "model" in verdict && verdict.model !== "" && verdict.modelVersion !== "";
  /* No expectations without a model to name (M33).
   *
   * Anything staged out of a baseline is stamped `persona:reader`, and the
   * ledger refuses a persona actor with no model. A baseline written without
   * provenance could therefore be shown to the researcher and never staged,
   * and the failure would arrive as a rejected append rather than as anything
   * they could read. The two conditions are coupled here rather than left to
   * agree by accident. */
  const baselines =
    "baselines" in verdict && provenanceKnown ? verdict.baselines : [];
  /* The model that judged, on the event that holds what it wrote (M33).
   *
   * The actor stays `system`: a rule fired and no creed produced it, which is
   * what it has said since M29c. What is new is that this event now carries a
   * sentence a model composed, and anything staged out of it is stamped
   * `persona:reader` and has to name the model. Without this the provenance
   * chain would end here, on the one tool whose central promise is attribution. */
  const provenance = provenanceKnown
    ? {
        model: (verdict as PaperJudgement).model,
        modelVersion: (verdict as PaperJudgement).modelVersion,
        ...providerField(verdict as PaperJudgement),
        ...voiceRetryField(verdict as PaperJudgement),
      }
    : {};
  const marker: PaperFitEvent = {
    id: makeId(),
    ts: now(),
    actor: "system",
    projectId,
    ...provenance,
    type: "paper-fit",
    paperKey: paper.key,
    paperName: paper.name,
    verdict: verdict.fit,
    reason: verdict.reason,
    framingDigest: digest,
    baselines,
    /* What this judgement was told the paper bears on (M51, ISC-533). The diff
     * in `papersNeedingJudgement` compares it against the record, so a sentence
     * the researcher writes buys exactly one more reading of that paper. */
    ...("bearing" in verdict && verdict.bearing !== undefined
      ? { bearing: verdict.bearing }
      : {}),
  };
  /* What the tool put in front of a model, and what came back cited (M33).
   *
   * These used to be written by the reader, which is the only thing in the tool
   * that had ever placed a passage in a prompt. The judge does that now, so the
   * attention layers move with it: without this the one layer whose value is
   * that its ids resolve would go quiet for the papers, and the coverage map
   * would say nobody had read them. Written before the marker, the order
   * `theory.ts` used: what was read, then what came of it. */
  const attention: AttentionEvent[] = (paper.chunks ?? []).map((chunk) => ({
    id: makeId(),
    ts: now(),
    actor: "system",
    projectId,
    type: "attention",
    layer: "retrieval",
    chunkId: chunk.id,
  }));
  for (const baseline of baselines) {
    if (baseline.chunkId === undefined) continue;
    attention.push({
      id: makeId(),
      ts: now(),
      actor: "system",
      projectId,
      type: "attention",
      layer: "citation",
      chunkId: baseline.chunkId,
    });
  }
  return [...attention, marker];
}

/**
 * The papers a judgement is in the air for, right now (M33 fix 3).
 *
 * The walk found each uploaded PDF judged twice within seconds, by two runs
 * that had both worked out what was due before either wrote, and the model gave
 * opposite verdicts two seconds apart: `cohen-hilligoss-2010.pdf` a misfit at
 * 09:39:03 and a fit at 09:39:05. Last-wins meant the record settled, but the
 * study paid for two calls per paper and carried a contradiction in its
 * history.
 *
 * There was already a guard, and it was at the wrong level. One loop per study
 * (`usePaperFit`) makes two calls through that loop impossible, and it cannot
 * see a second loop: a component that remounts, a second module instance under
 * a hot reload, or a caller keyed on a project id that differs from the one the
 * other caller holds. Each of those defeats it, and none of them is visible
 * from inside it.
 *
 * So the guard states the thing that has to be true, which is about a paper and
 * not about a loop: one judgement per paper in flight, whoever asked for it.
 * Module-level for the same reason the loop is, because what is being protected
 * is the record rather than any component's state.
 *
 * Keyed by study and paper, so two studies naming the same file do not block
 * each other.
 */
const IN_FLIGHT = new Set<string>();

function flightKey(projectId: string, paperKey: string): string {
  return `${projectId}::${paperKey}`;
}

/** Test seam: drop the set, so one test's in-flight state is not another's. */
export function resetJudgementsInFlight(): void {
  IN_FLIGHT.clear();
}

/**
 * Judge every paper that needs it, and say what to write (M29c).
 *
 * The one entry point the surfaces call, so an upload, a saved line and a
 * changed framing all take the same path and cannot drift into three different
 * ideas of when a paper is judged. It writes nothing: every caller appends what
 * comes back, which keeps this pure and testable and keeps the ledger writes
 * where the surfaces already own them.
 *
 * Costs one call per paper that needs one and none for the rest, which is the
 * property the diff exists for: a researcher adding a sixth line to a list of
 * five pays for one paper, and a researcher fixing a typo in their venue pays
 * for none.
 */
export async function judgeArrivingPapers(input: {
  readonly projectId: string;
  readonly papers: readonly PaperRef[];
  readonly context: StudyContext;
  readonly events: readonly LedgerEvent[];
  readonly client: InferenceClient;
  readonly makeId?: () => string;
  readonly now?: () => number;
  /**
   * Where each paper's events go, as soon as that paper is judged (M33 fix 2).
   *
   * Everything used to be returned in one array at the end, so a study with six
   * papers put nothing on the record until the sixth model call came back. The
   * walk read that as the judge never having run: forty seconds after the page
   * opened there was no new event, because there would not be one until every
   * paper was done. A call that failed part way through lost the papers already
   * judged with it, which is the defect `CorpusMaterial.onUpload` was fixed for
   * one surface over.
   *
   * A caller that passes this must not also append the return value, or every
   * event lands twice. The array still comes back whole, for callers that have
   * nothing to write to and for the tests.
   */
  readonly onJudged?: (events: readonly LedgerEvent[]) => Promise<void>;
}): Promise<readonly LedgerEvent[]> {
  const makeId = input.makeId ?? (() => crypto.randomUUID());
  const now = input.now ?? (() => Date.now());
  const { projectId, context, client } = input;

  /* Nothing to judge against is not a verdict of any kind. The papers stay
   * unjudged and the next framing save picks them all up, which is what makes
   * "judge on arrival" true for a researcher who uploads before they write. */
  if (!canJudgeFit(context)) return [];

  const digest = framingDigest(context);
  const verdicts = paperVerdicts(input.events, projectId);
  /* What the researcher has said each paper bears on (M51, ISC-533). Read off
   * the record here rather than passed in, because every caller already hands
   * over the record and a second source for the same sentences is how a prompt
   * comes to be told something the diff was not. */
  const bearings = bearingReasons(input.events, projectId);
  const written: LedgerEvent[] = [];

  /* M89: a notice about a paper the project no longer names was withdrawn
   * here until the paper notice went with the checks. */

  const due = papersNeedingJudgement({ papers: input.papers, verdicts, digest, bearings });
  if (due.length === 0) return written;

  const runId = makeId();
  for (const paper of due) {
    /* Already being judged by somebody (M33 fix 3). Not an error and not worth
     * a message: the other run will write the verdict, and this one asking
     * again would spend a second call to get a second opinion nobody asked for.
     * The model is not stable enough for that to be free, as the walk showed. */
    const flight = flightKey(projectId, paper.key);
    if (IN_FLIGHT.has(flight)) continue;
    IN_FLIGHT.add(flight);
    let verdict: PaperJudgement | undefined;
    const bearing = bearings.get(paper.key);
    try {
      verdict = await judgePaperFit({
        paper,
        context,
        client,
        ...(bearing === undefined ? {} : { bearing }),
      });
    } finally {
      /* Released as soon as the answer is in hand, before it is written. A
       * paper held past the write would be skipped by a pass that could see the
       * verdict anyway, and a throw must not leave it held for the session. */
      IN_FLIGHT.delete(flight);
    }
    if (verdict === undefined) continue;
    const batch: LedgerEvent[] = [
      ...paperFitEvents({
        projectId,
        paper,
        verdict,
        framingDigest: digest,
        makeId,
        now,
        runId,
      }),
    ];
    written.push(...batch);
    /* This paper's answer, on the record now rather than when the last paper
     * comes back (M33 fix 2). Six papers is six model calls, and a researcher
     * watching the page had nothing to see until all six had finished. */
    await input.onJudged?.(batch);
  }
  return written;
}
