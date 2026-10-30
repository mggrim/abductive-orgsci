/**
 * What the study is about, in one block, for whatever is about to read on its
 * behalf (M29b).
 *
 * The occasion was a real failure, not a tidy-up. The paper reader was handed a
 * paper and nothing else, so it read a methods paper about language models for
 * a study of night-ward handoffs and duly drafted expectations out of it. It
 * could not have done otherwise: nothing in its prompt said what the study was
 * about, so "does this paper predict anything about a setting like theirs" was
 * not a question it was in a position to ask. A generator that does not know
 * the study cannot tell a paper that fits from one that does not.
 *
 * Two functions and one shape, deliberately. The typed block is what a caller
 * branches on, because a decision made by regex over a rendered string is a
 * decision made twice; `renderStudyContext` is the one rendering, so two
 * prompts cannot describe the same study in two vocabularies.
 *
 * ── Scope, and what is deliberately not wired ─────────────────────────────
 *
 * `theory.ts` is the only caller today. `extract.ts` and `glean.ts` read the
 * researcher's own material and their own answer, and whether they should see
 * the framing too is a live question the owner is deciding: framing in front of
 * an extractor is a standing invitation to read the material as confirming the
 * frame, which is the bias this whole tool is built to measure. So the helper
 * is shared by construction and used by one caller by decision, and that is the
 * state to leave it in until the owner rules.
 *
 * ── The relabelling ───────────────────────────────────────────────────────
 *
 * `brief.researchQuestion` reaches this block as `puzzle`, following the M27
 * relabel that `coherence.ts` already applies: a model told the answer is a
 * research question reads a settled question rather than the puzzle it is, and
 * judges it against the wrong bar. The storage field is untouched.
 *
 * M40 moved who wrote it. The field was the framing band's second box until then
 * and the researcher typed it; it is now the tool's own reading of their saved
 * answers, written by `flow/usePuzzleReading.ts` and projected by
 * `views/puzzleReading.ts`. So `renderStudyContext` below says the puzzle is the
 * tool's reading rather than what they state, because a model told the sentence
 * is the researcher's own commitment weighs it as evidence about their thinking,
 * and it is evidence about the tool's.
 *
 * One caller must not have this block at all for exactly that reason: the puzzle
 * reading itself, which would be shown its own previous output as material and
 * converge on it. See the header of `interview/puzzlePrompt.ts`.
 */

import { puzzlePromptLines } from "../views/puzzleReading.ts";
import type { OntologyGraph, OntologyPage } from "../ontology/schema.ts";
import { livePages } from "../ontology/schema.ts";
import type { ProjectBrief } from "../state/projects.ts";
import { pageTypeLabel } from "../ui/pageTypeVocabulary.ts";
import type { DeclaredDataType } from "../state/projects.ts";
import type { UnitOfAnalysis } from "./unitOfAnalysis.ts";
import { levelLines } from "./levelPrompt.ts";

/** One claim, as a reader of the block needs it. */
export interface StudyClaim {
  readonly title: string;
  /** The page type in the researcher's words, never the slug. */
  readonly kind: string;
}

/** A sample of the researcher's own data, named by where it came from. */
export interface StudyPassage {
  /** The file it came from, so the sample reads as evidence and not as prose. */
  readonly document: string;
  readonly index: number;
  readonly text: string;
}

/** How many data passages the block carries, and how much of each. */
export const DIGEST_PASSAGES = 3;
export const DIGEST_WORDS = 200;

/**
 * The study, as much of it as the researcher has said.
 *
 * Every field is optional and absent means unsaid rather than empty, because a
 * generator has to be able to tell "they have not written a puzzle yet" from
 * "their puzzle is the empty string". A caller that needs the difference reads
 * the field; a caller that needs the prose reads `renderStudyContext`, which
 * names the absence in words rather than dropping the line.
 */
export interface StudyContext {
  /** What they are thinking about exploring, before there is a question. */
  readonly exploring?: string;
  /**
   * The puzzle as the tool reads it today. `brief.researchQuestion`, relabelled.
   *
   * The tool's sentence since M40, not the researcher's: it is read out of their
   * starting interest, their answers at six steps and their three most-opened
   * passages. A reader of this field is reading the tool's reading of them.
   */
  readonly puzzle?: string;
  /** Their own answer at The puzzle step (M58, ISC-568). `brief.puzzleAnswer`. */
  readonly puzzleAnswer?: string;
  /** The setting. `brief.context`. */
  readonly setting?: string;
  /** The papers they are arguing with, as typed. */
  readonly papers?: string;
  /** Where they want this to land. */
  readonly venue?: string;
  /** Titles of the live puzzle roots, which may say more than the brief field. */
  readonly puzzleRoots: readonly string[];
  /** Everything live in the model, so a reader can see what is already claimed. */
  readonly liveClaims: readonly StudyClaim[];
  /**
   * A sample of the data, most-opened first (M29c).
   *
   * A paper is judged against the study, and until now "the study" meant the
   * framing alone: what the researcher said they were exploring, and what they
   * wrote as the puzzle. A paper can sit squarely inside a stated puzzle and
   * still say nothing about the setting the data actually shows, which is the
   * misalignment the owner asked to catch, and no amount of framing text
   * surfaces it.
   *
   * Most-opened first, because attention is the best available proxy for which
   * material the researcher thinks is central, and three passages of two
   * hundred words is a sample rather than a corpus: enough to tell a night-ward
   * handoff study from a study of code review, which is the distinction the
   * gate has to make.
   */
  readonly data: readonly StudyPassage[];
  /** M84, ISC-707: the unit of analysis and the declared data kind. */
  readonly unit?: UnitOfAnalysis;
  readonly unitOther?: string;
  readonly dataType?: DeclaredDataType;
}

/** Absent rather than blank, so "unsaid" and "empty" stay distinguishable. */
function said(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * The block, assembled from the brief and, when there is one, the model.
 *
 * The graph is optional because the first thing to need this ran before there
 * was a model to read: a researcher uploads their papers and presses the button
 * on the Material tab with a brief and nothing else.
 */
export function studyContext(
  brief: ProjectBrief,
  graph?: OntologyGraph,
  data?: StudyDataInput,
): StudyContext {
  const pages: readonly OntologyPage[] = graph === undefined ? [] : livePages(graph);
  const roots =
    graph === undefined
      ? []
      : graph.puzzleRoots.flatMap((id) => {
          const page = graph.pages.get(id);
          return page === undefined || page.retired ? [] : [page.title];
        });
  return {
    ...(said(brief.startingInterest) === undefined ? {} : { exploring: said(brief.startingInterest) as string }),
    ...(said(brief.researchQuestion) === undefined ? {} : { puzzle: said(brief.researchQuestion) as string }),
    ...(said(brief.puzzleAnswer) === undefined ? {} : { puzzleAnswer: said(brief.puzzleAnswer) as string }),
    ...(said(brief.context) === undefined ? {} : { setting: said(brief.context) as string }),
    ...(said(brief.seminalCorpus) === undefined ? {} : { papers: said(brief.seminalCorpus) as string }),
    ...(said(brief.targetVenue) === undefined ? {} : { venue: said(brief.targetVenue) as string }),
    puzzleRoots: roots,
    // The label, never the slug. A model writes back the vocabulary it is
    // given, which is how "analytic-residue" reached the Checks tab as model
    // prose no source file contains.
    liveClaims: pages.map((p) => ({ title: p.title, kind: pageTypeLabel(p.type) })),
    data: dataDigest(data),
    ...(brief.unit === undefined ? {} : { unit: brief.unit }),
    /* M92, ISC-749: the typed unit, when the unit is Other. */
    ...(brief.unit === "other" && brief.unitOther !== undefined ? { unitOther: brief.unitOther } : {}),
    ...(brief.dataType === "" ? {} : { dataType: brief.dataType }),
  };
}

/** What the caller has of the corpus, when it has any. */
export interface StudyDataInput {
  /** Data passages only. A paper is not evidence about the setting. */
  readonly chunks: readonly {
    readonly id: string;
    readonly documentId: string;
    readonly index: number;
    readonly text: string;
  }[];
  /** Document names by id, so a passage says where it came from. */
  readonly documentNames: ReadonlyMap<string, string>;
  /** Passage ids the researcher has opened, most recent first is not needed. */
  readonly openedCounts?: ReadonlyMap<string, number>;
}

/** The first words of a passage, cut on a word boundary. */
function firstWords(text: string, words: number): string {
  const parts = text.trim().split(/\s+/);
  return parts.length <= words ? parts.join(" ") : `${parts.slice(0, words).join(" ")}…`;
}

/** One passage as a caller hands it over: the id is what a citation needs. */
export type DigestChunk = StudyDataInput["chunks"][number];

/**
 * Which up-to-three passages the digest is of, most-opened first.
 *
 * Split out of `dataDigest` below at M40 and exported, because the puzzle
 * reading cites the passages it read by id and `StudyPassage` carries the
 * document name rather than the id. Two selections would be two answers to
 * "which three passages is the tool looking at", which is the FIN-02 shape: the
 * reading would name one set and a paper's verdict would be reached against
 * another, on the same study, in the same second.
 *
 * Ties break on the passage's own position, so the sample is stable across
 * calls: a selection that reshuffled on every save would make a paper's verdict
 * depend on which of two equally-opened passages happened to sort first, and a
 * verdict that moves for no reason the researcher can see is worse than none.
 */
export function digestSelection(input: StudyDataInput | undefined): readonly DigestChunk[] {
  if (input === undefined) return [];
  const opened = input.openedCounts ?? new Map<string, number>();
  return [...input.chunks]
    .sort((a, b) => {
      const byOpened = (opened.get(b.id) ?? 0) - (opened.get(a.id) ?? 0);
      if (byOpened !== 0) return byOpened;
      const byDoc = a.documentId.localeCompare(b.documentId);
      return byDoc !== 0 ? byDoc : a.index - b.index;
    })
    .slice(0, DIGEST_PASSAGES);
}

/** Those passages, named by where they came from and cut to two hundred words. */
function dataDigest(input: StudyDataInput | undefined): readonly StudyPassage[] {
  if (input === undefined) return [];
  return digestSelection(input).map((c) => ({
    document: input.documentNames.get(c.documentId) ?? c.documentId,
    index: c.index,
    text: firstWords(c.text, DIGEST_WORDS),
  }));
}

/**
 * The block as a model reads it.
 *
 * An absent field is named as absent rather than dropped, for the same reason
 * the coherence digest names one: a generator handed a shorter list cannot tell
 * a study that has not said where it is set from one whose setting it was not
 * shown, and the two call for opposite behaviour.
 */
export function renderStudyContext(context: StudyContext): string {
  const lines: string[] = ["# The study you are working for"];
  lines.push(
    context.exploring === undefined
      ? "What they are exploring: not yet said."
      : `What they are exploring: ${context.exploring}`,
  );
  /* M58, ISC-568: their own answer at The puzzle step, then the reading. */
  lines.push(
    ...puzzlePromptLines({
      ...(context.puzzleAnswer === undefined ? {} : { puzzleAnswer: context.puzzleAnswer }),
      ...(context.puzzle === undefined ? {} : { researchQuestion: context.puzzle }),
    }),
  );
  lines.push(
    context.setting === undefined
      ? "The setting: not yet described."
      : `The setting: ${context.setting}`,
  );
  if (context.venue !== undefined) lines.push(`Where they want this to land: ${context.venue}`);
  /* M84, ISC-707. */
  lines.push(...levelLines({ unit: context.unit, unitOther: context.unitOther, dataType: context.dataType }).filter((l) => l !== ""));
  if (context.papers !== undefined) {
    lines.push("The papers they are arguing with, as they typed them:", context.papers);
  }
  if (context.puzzleRoots.length > 0) {
    lines.push(`Puzzles live in their model: ${context.puzzleRoots.join("; ")}`);
  }
  if (context.liveClaims.length > 0) {
    lines.push(
      `Already in their model: ${context.liveClaims
        .map((c) => `${c.title} (${c.kind})`)
        .join("; ")}`,
    );
  }
  /* The data, last and named as a sample (M29c). A model handed three passages
   * with no note about how many there are will reason about the corpus it can
   * see, so the line says what it is looking at. */
  if (context.data.length > 0) {
    lines.push(
      "",
      "A sample of their own data, most-opened first. This is a sample, not the whole corpus:",
      ...context.data.map((d) => `- ${d.document}, passage ${d.index}: ${d.text}`),
    );
  }
  lines.push(
    "",
    "This is theirs, not yours. Do not repeat it back approvingly, and do not treat a gap in it as a failing.",
  );
  return lines.join("\n");
}

/**
 * Whether the block says enough about the setting to judge a paper against it.
 *
 * The fit gate is only honest when there is something to be a misfit with. A
 * study that has written no puzzle, no setting and no starting interest gives a
 * reader nothing to hold a paper against, and a verdict returned anyway would
 * be the model guessing and the tool recording the guess as a finding.
 */
export function canJudgeFit(context: StudyContext): boolean {
  return (
    context.setting !== undefined ||
    context.puzzle !== undefined ||
    context.exploring !== undefined ||
    context.puzzleRoots.length > 0
  );
}
