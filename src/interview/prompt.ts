/**
 * Turn prompt assembly and the interrogation guarantee (ISC-43, ISC-46).
 *
 * Interrogation means the agent asks and does not supply the answer. The
 * temptation to help is exactly the failure this tool exists to measure: a
 * model that offers a plausible completion gets agreement, and agreement gets
 * recorded as the researcher's own construct. So the guarantee is enforced by
 * a detector run over the assembled prompt, not by asking the model nicely.
 *
 * The detector is deliberately blunt and will occasionally object to an
 * innocent phrase. That asymmetry is correct: a false positive costs a
 * rewrite, a false negative costs the study's provenance.
 */

import type { Chunk } from "../state/chunks.ts";
import { isLiterature } from "../state/chunks.ts";
import { documentKindLabel } from "../ui/materialVocabulary.ts";
import { INTERVIEW_CONTRACT } from "../personas/voice.ts";
import { countQuestions } from "./moves.ts";
import type { DeclaredDataType } from "../state/projects.ts";
import type { UnitOfAnalysis } from "./unitOfAnalysis.ts";
import { levelLines } from "./levelPrompt.ts";
import type { NextMove } from "./types.ts";

/**
 * Phrases that supply an answer rather than ask for one. Matched
 * case-insensitively against the assembled interrogation prompt.
 */
const ANSWER_SUPPLYING_PATTERNS: readonly { readonly re: RegExp; readonly why: string }[] = [
  { re: /\bfor example,? (you|the researcher) (could|might|should)\b/i, why: "offers a worked example of the answer" },
  { re: /\bthe answer is\b/i, why: "states the answer" },
  { re: /\b(i|you) (would|should|could) say\b/i, why: "scripts the researcher's reply" },
  { re: /\bi suggest\b/i, why: "suggests rather than asks" },
  { re: /\bi'd propose\b/i, why: "proposes rather than asks" },
  { re: /\bperhaps because\b/i, why: "supplies a candidate explanation" },
  { re: /\bpresumably\b/i, why: "asserts the likely answer" },
  { re: /\bwhich is (probably|likely|presumably)\b/i, why: "asserts the likely answer" },
  { re: /\byou should (?!answer|say nothing)/i, why: "instructs the researcher" },
  { re: /\bconsider (?:whether )?(?:that|the possibility)\b/i, why: "plants a candidate answer" },
  { re: /\bin other words,? (?:you|this) (?:mean|are|is)\b/i, why: "restates the answer for the researcher" },
];

export interface AnswerLeak {
  readonly phrase: string;
  readonly why: string;
}

/**
 * Scan a prompt for language that supplies the answer. Empty result means the
 * prompt only asks.
 */
export function proposedAnswerViolations(prompt: string): readonly AnswerLeak[] {
  const leaks: AnswerLeak[] = [];
  for (const { re, why } of ANSWER_SUPPLYING_PATTERNS) {
    const match = re.exec(prompt);
    if (match !== null) leaks.push({ phrase: match[0], why });
  }
  return leaks;
}

/**
 * The interrogation heading, split out so the conversation can wear it too.
 *
 * M37: a turn of a conversation is an interrogation turn in every respect
 * except one. It is not delivering a question chosen beforehand, so the single
 * bullet that names "the question given below" is the only line of the block
 * that does not hold there. Splitting the block is what lets the conversation
 * prompt reuse the rest verbatim rather than restating five rules in a second
 * file, where they would drift.
 */
export const INTERROGATION_HEAD = "## Turn rules: interrogation";

/** The interrogation rules that hold whether or not a question was chosen. */
export const INTERROGATION_ALWAYS: readonly string[] = [
  "- Do NOT supply, hint at, or illustrate an answer. Leave out examples of a good answer, candidate explanations and 'perhaps'.",
  "- If the researcher has already answered something adjacent, acknowledge it in one sentence and still ask the question as written.",
  "- 'I don't know' is a complete and acceptable answer. Do not treat it as a failure, and do not re-ask the same question to extract a better one.",
  "- End your turn on the question. Do not summarise, do not offer next steps.",
  "- You are the interviewer. Do not write in the researcher's voice, answer on their behalf, or invent their site, their data, their participants or their experience. If you find yourself writing 'I keep coming back to' or describing fieldwork, you have taken the wrong role.",
];

const INTERROGATION_RULES = [
  INTERROGATION_HEAD,
  "- Ask only the single question given below. Do not add a second question, a follow-up, or a preamble question.",
  ...INTERROGATION_ALWAYS,
].join("\n");

/**
 * What the interviewer may never do with the papers (M29, A4).
 *
 * Standing rules rather than a branch on whether literature is in context,
 * because two of the three are about what the model must not reach for when the
 * papers are absent from the turn but present in the researcher's list. The
 * third is the D5 guarantee restated in the one place the extractor's
 * `dataOnly` filter cannot reach: a passage placed in this prompt is available
 * to be cited, and the rule says what it may be cited as.
 */
export const LITERATURE_RULES = [
  "## The papers",
  "- Do not treat a passage from a paper as evidence for something happening in their setting. It is evidence only of what someone expects.",
  "- Do not ask them to summarise a paper. You are not a literature review assistant and their list of papers is not the subject.",
  "- Do not put forward an expectation from a paper that they have not identified or uploaded. Work with the list that they gave you.",
].join("\n");

/** The guidance heading, split for the same reason the interrogation one is. */
export const GUIDANCE_HEAD = "## Turn rules: guidance";

/**
 * The guidance rules that apply whether or not a question was chosen.
 *
 * M62, ISC-604 (the owner, 2026-09-30): the guidance turn must never hand the
 * researcher a shortcut to an answer. Until M62 it could "propose exactly one
 * concrete construction", which is a candidate answer by another name. It now
 * asks differently and nothing else, and `guidanceAnswerViolations` reads the
 * reply for the shapes these rules forbid.
 */
export const GUIDANCE_ALWAYS: readonly string[] = [
  "- They asked you to ask differently. Help them reach their own answer: offer only a narrower question, a distinction that they might consider, or examples of what an answer might attend to (a case at their unit of analysis, a moment, a document, a count).",
  "- Do not give a candidate answer, a draft sentence that they could adopt, or a summary of what they have said. Do not write a sentence in their voice, and do not tell them what their answer is.",
  "- End on one question that they can answer from what they have in front of them.",
];

/**
 * The shapes a guidance reply may not take (M62, ISC-604), on top of the ones
 * the interrogation guarantee already names: a candidate answer, a draft
 * sentence, a summary, and the researcher's answer stated for them.
 */
const GUIDANCE_ANSWER_PATTERNS: readonly { readonly re: RegExp; readonly why: string }[] = [
  { re: /\b(?:your|one|a possible|a candidate|the) (?:possible |candidate )?answer (?:could|might|would|may) be\b/i, why: "offers a candidate answer" },
  { re: /\bone answer (?:is|would be|could be)\b/i, why: "offers a candidate answer" },
  { re: /\byou (?:could|might|can) (?:write|put|answer)\b/i, why: "scripts the researcher's reply" },
  { re: /\bsomething like[:,]?\s*["\u201c\u2018]/i, why: "offers a draft sentence" },
  { re: /\bhere(?:'s| is) (?:a|one|my) (?:draft|version|summary|answer|sentence|way to put it)\b/i, why: "offers a draft" },
  { re: /\b(?:in summary|to sum up|summing up|so far you(?:'ve| have) said)\b/i, why: "summarises the researcher" },
  { re: /["\u201c]I (?:am|was|want|think|expect|keep|study|noticed)\b/, why: "writes a sentence in the researcher's voice" },
  { re: /\byour (?:puzzle|interest|answer|claim|summary) (?:is|seems to be|sounds like)\b/i, why: "tells the researcher what their answer is" },
];

/** Scan a guidance reply for a shortcut to an answer. Empty means it only asks. */
export function guidanceAnswerViolations(text: string): readonly AnswerLeak[] {
  const leaks: AnswerLeak[] = [...proposedAnswerViolations(text)];
  for (const { re, why } of GUIDANCE_ANSWER_PATTERNS) {
    const match = re.exec(text);
    if (match !== null) leaks.push({ phrase: match[0], why });
  }
  return leaks;
}

const GUIDANCE_RULES = [
  GUIDANCE_HEAD,
  ...GUIDANCE_ALWAYS,
  "- End on the question given below.",
].join("\n");

/**
 * The design as the researcher has stated it, in their own words.
 *
 * Until M17 the interviewer saw none of this. It got a count of pages by type
 * and the previous message, so the first live turn of the M16 walk opened
 * "Since the ontology is empty right now, I want to start from the ground"
 * immediately after the context station had been filled in with a site, a
 * phenomenon and a research question. The model was not being obtuse; it had
 * genuinely not been shown any of it.
 */
export interface DesignDigest {
  /** The question as they would state it today. */
  readonly researchQuestion?: string;
  /** The researcher's own answer at The puzzle step (M58, ISC-568). */
  readonly puzzleAnswer?: string;
  /** Station answers, in rail order, empty ones already dropped. The puzzle
   * step travels in `puzzleAnswer` rather than here (M58). */
  readonly stations: readonly { readonly label: string; readonly text: string }[];
  /** Where they are aiming. A class of journals, not necessarily one. */
  readonly targetVenue?: string;
  /** The literature they are arguing with, as they named it. */
  readonly corpus?: string;
  /** The unit of analysis named at Context (M84, ISC-707). */
  readonly unit?: UnitOfAnalysis;
  /** The typed unit when the unit is Other (M92, ISC-749). */
  readonly unitOther?: string;
  /** The declared kind of data (M84, ISC-707): every prompt asks at its level. */
  readonly dataType?: DeclaredDataType;
}

export interface TurnPromptInput {
  readonly move: NextMove;
  /** Chunks placed in context for this turn, with their stable ids. */
  readonly chunks: readonly Chunk[];
  /** Short description of the current ontology, for orientation. */
  readonly ontologySummary: string;
  /** The researcher's last message, when there is one. */
  readonly lastResponse?: string;
  /** What they have said about the study so far. */
  readonly design?: DesignDigest;
  /** Earlier exchanges, oldest first, so a turn can follow an arc. */
  readonly transcriptDigest?: readonly string[];
}

/**
 * The role, in one place.
 *
 * Exported at M37 so the conversation prompt opens with the same two sentences
 * rather than a second wording of them. `tests/interviewer-role.test.ts` reads
 * the assembled prompt for "never speaking as them", and a conversation turn
 * has to clear the same bar, which it cannot do by paraphrase.
 */
export const ROLE_BLOCK: readonly string[] = [
  "# Role",
  "You are conducting a design interview with a qualitative researcher. You are not reviewing their work, not writing it for them, and not speaking as them. Your entire output is what you say to the researcher, ending on one question. One turn, one question.",
];

/** Render the design digest, or nothing when the researcher has said nothing yet. */
export function describeDesign(design: DesignDigest | undefined): readonly string[] {
  if (design === undefined) return [];
  const lines: string[] = [];
  if (design.puzzleAnswer !== undefined && design.puzzleAnswer.trim() !== "") {
    lines.push(`The puzzle, in their own words at the Puzzle step: ${design.puzzleAnswer.trim()}`);
  }
  if (design.researchQuestion !== undefined && design.researchQuestion.trim() !== "") {
    lines.push(
      `The puzzle, as the tool suggested it from their answers today: ${design.researchQuestion.trim()}`,
    );
  }
  for (const s of design.stations) {
    if (s.text.trim() === "") continue;
    lines.push(`${s.label}: ${s.text.trim()}`);
  }
  if (design.targetVenue !== undefined && design.targetVenue.trim() !== "") {
    lines.push(`Where they want this to land: ${design.targetVenue.trim()}`);
  }
  if (design.corpus !== undefined && design.corpus.trim() !== "") {
    lines.push(`The literature that they are in conversation with:\n${design.corpus.trim()}`);
  }
  if (lines.length === 0) return [];
  return [
    "",
    "## What they have told you about the study",
    ...lines,
    "",
    "This is theirs, not yours. Do not repeat it back approvingly, and do not treat a gap in it as a failing.",
  ];
}

/**
 * The passages placed in context, and the two lines that say how to cite them.
 *
 * Two piles rather than one, because only the authored half is scanned for
 * supplied answers: the researcher's own field note is allowed to contain the
 * word "presumably" and scanning it broke every interview turn once already.
 * Exported at M37 so a conversation turn is handed the material the same way,
 * with the same mark on a paper, rather than a second assembly of it.
 */
export function materialBlock(
  chunks: readonly Chunk[],
  /**
   * The file each passage came from (M96, ISC-790). At Early data the block
   * carries every data file, so each passage says which file it is from; the
   * files past the budget are named, so the model knows the corpus is larger
   * than the block.
   */
  files?: { readonly names: ReadonlyMap<string, string>; readonly leftOut: readonly string[] },
): {
  readonly quoted: readonly string[];
  readonly authored: readonly string[];
} {
  const from = (c: Chunk): string => {
    const name = files?.names.get(c.documentId);
    return name === undefined ? "" : `(${name}, passage ${c.index + 1}) `;
  };
  return {
    quoted: [
      "",
      files === undefined ? "## Material in context" : "## Material in context: every data file that they have added",
      ...chunks.map((c) =>
        isLiterature(c.kind)
          ? `[[chunk:${c.id}]] (${documentKindLabel(c.kind)}) ${c.text}`
          : `[[chunk:${c.id}]] ${from(c)}${c.text}`,
      ),
      ...(files !== undefined && files.leftOut.length > 0
        ? ["", `Their other data files, past the length that this conversation can carry, and so not shown to you: ${files.leftOut.join(", ")}.`]
        : []),
    ],
    authored: [
      "",
      "Cite any passage that you refer to as [[chunk:ID]] using the exact ids given under 'Material in context'.",
      "A passage marked (paper) is from the literature that they are arguing with. It is evidence of what someone expects. Do not treat it as evidence of what happens in their setting.",
    ],
  };
}

/**
 * Assemble the system prompt for one interview turn. Throws when an
 * interrogation prompt would leak an answer — a thrown error at assembly time
 * is recoverable; a leaked answer in the ledger is not.
 */
export function assembleTurnPrompt(input: TurnPromptInput): string {
  const { move, chunks, ontologySummary, lastResponse, design, transcriptDigest } = input;

  if (countQuestions(move.question) !== 1) {
    throw new Error(
      `interview move '${move.id}' must ask exactly one question, found ${countQuestions(move.question)}`,
    );
  }

  // Two piles, and the split is load-bearing. `authored` is what the tool says
  // in its own voice; `quoted` is the researcher's material, echoed back so the
  // model can see it. Only `authored` is scanned for supplied answers.
  //
  // Scanning everything, which is what happened until M17, meant a researcher's
  // own field note could break their interview: a chunk containing the word
  // "presumably" tripped the "asserts the likely answer" pattern and
  // assembleTurnPrompt threw for every interrogation turn. The detector is
  // there to stop the tool putting an answer in the researcher's mouth. It was
  // never meant to police the researcher's own prose, and it cannot, because
  // they are allowed to write however they like.
  const authored: string[] = [
    ...ROLE_BLOCK,
    "",
    INTERVIEW_CONTRACT.trim(),
    "",
    move.mode === "interrogation" ? INTERROGATION_RULES : GUIDANCE_RULES,
    "",
    LITERATURE_RULES,
    /* M84, ISC-707: the unit and the data kind, for every interview prompt. */
    ...levelLines({ unit: design?.unit, unitOther: design?.unitOther, dataType: design?.dataType }),
  ];

  const quoted: string[] = [
    "",
    "## Where the study currently stands",
    ontologySummary.trim() === "" ? "The ontology is empty." : ontologySummary.trim(),
    ...describeDesign(design),
  ];

  if (transcriptDigest !== undefined && transcriptDigest.length > 0) {
    quoted.push(
      "",
      "## Earlier in this conversation",
      ...transcriptDigest,
      "",
      "Do not ask again for something that they have already given you here.",
    );
  }

  if (lastResponse !== undefined && lastResponse.trim() !== "") {
    quoted.push(
      "",
      "## The researcher's last message",
      lastResponse.trim(),
      "",
      "React to this in at most two sentences before asking. Reacting means engaging with what they said, not praising it.",
    );
  }

  if (chunks.length > 0) {
    /*
     * The papers are marked, because they were not (M29, E4/R6).
     *
     * Literature reaches this block by design: the interviewer is supposed to
     * know which conversation the researcher thinks they are joining. What it
     * could not tell was which of these passages is a paper and which is a
     * night shift, so a journal editorial and a field note arrived as one
     * undifferentiated pile under the heading "Material", and the next line
     * told the model to cite any of them. A passage of somebody's argument
     * cited as evidence for an observation is the D5 defect reaching the one
     * path `dataOnly` does not guard.
     *
     * The mark is the word /material puts on the row, so the model is handed
     * the same word the researcher reads.
     */
    const block = materialBlock(chunks);
    quoted.push(...block.quoted);
    authored.push(...block.authored);
  }

  // The question is the tool's own, so it is scanned. That is the whole point
  // of the check: a move must not arrive carrying its own answer.
  authored.push("", "## Your question this turn", move.question);

  if (move.mode === "interrogation") {
    const leaks = proposedAnswerViolations(authored.join("\n"));
    if (leaks.length > 0) {
      throw new Error(
        `interrogation prompt for '${move.id}' supplies an answer: ${leaks
          .map((l) => `"${l.phrase}" (${l.why})`)
          .join("; ")}`,
      );
    }
  }

  // Quoted material sits between the rules and the question, so the question
  // is the last thing the model reads.
  const head = authored.slice(0, authored.length - 3);
  const tail = authored.slice(authored.length - 3);
  return [...head, ...quoted, ...tail].join("\n");
}

/**
 * The user turn.
 *
 * It used to be the bare question, which framed the model as the person being
 * asked; it answered in first person and invented the researcher's clinical
 * experience. Caught on the first live run through the local CLI, and by
 * nothing in the test suite, because the mock client returns fixed text.
 */
export function TURN_INSTRUCTION(question: string): string {
  return [
    "Put this question to the researcher now, in your own words if you wish, but do not change what it asks:",
    "",
    question,
    "",
    "Address your reply to the researcher and end it on that question. Do not answer it yourself.",
  ].join("\n");
}
