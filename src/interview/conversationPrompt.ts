/**
 * The system prompts for a conversation at a place (M37, ISC-482 … ISC-488).
 *
 * Model input, never rendered. It sits beside `prompt.ts` and follows the same
 * two rules that file was written under: the interrogation guarantee is
 * enforced by a detector run over the tool's own half of the prompt rather than
 * by asking the model nicely, and the researcher's own material is never
 * scanned, because they are allowed to write however they like.
 *
 * What is new here is that the question is the model's. Everywhere else in this
 * codebase the question text comes from a deterministic move and the model only
 * delivers it, which is what makes the tool auditable independently of what the
 * model felt like saying. A conversation cannot work that way: a follow-up that
 * cannot read the last answer is not a follow-up. So the audit moves rather than
 * disappearing. The model is required to end its reply on the question and then
 * write two marked lines naming the question and the reason for it, both of
 * which are recorded, and the reply is scanned on the way out for language that
 * supplies an answer. What the record loses in "the tool chose this sentence" it
 * keeps in "here is the question, here is why it was asked, here is whether the
 * tool answered its own question".
 */

import type { Chunk } from "../state/chunks.ts";
import {
  describeDesign,
  GUIDANCE_ALWAYS,
  GUIDANCE_HEAD,
  INTERROGATION_ALWAYS,
  INTERROGATION_HEAD,
  LITERATURE_RULES,
  materialBlock,
  proposedAnswerViolations,
  guidanceAnswerViolations,
  ROLE_BLOCK,
  type DesignDigest,
} from "./prompt.ts";
import { INTERVIEW_CONTRACT, OWNER_RULES } from "../personas/voice.ts";
import type { TurnMode } from "./types.ts";
import { FRAMING_PLACE, type FramingDraftField } from "./conversation.ts";
import { FRAMING_PROBES } from "./stationProbes.ts";
import { CONVERSATION_MARKER, DRAFT_MARKER } from "../inference/promptMarkers.ts";
import { challengeBlock } from "./challenges.ts";
import { levelLines } from "./levelPrompt.ts";
import { narrowingRule, registerLines, stepBoundsBlock } from "./register.ts";
import { isStationId } from "../flow/stations.ts";
import { effectiveUnit } from "./unitOfAnalysis.ts";

/**
 * The rules that make a turn a conversation rather than a delivery.
 *
 * The second one is the whole point of a co-author's note. A junior scholar
 * who cannot answer "what did you expect and what did you find instead" gets a
 * narrower question about something they have in front of them, not the same
 * question rephrased, which is what a form does when you leave it blank.
 */
const CONVERSATION_RULES: readonly string[] = [
  CONVERSATION_MARKER,
  "- Follow the researcher. Ask the one question that most helps them say what they have not said yet.",
  /* M84, ISC-703: the narrowing line is the place's own (`narrowingRule`):
   * before data, something that they know of the setting; at Early data, their
   * material. It asked for "one instance, one person, one thing that they saw",
   * which a co-author met as being pushed for data examples from the first step. */
  "- You may reflect their own words back to sharpen them. Do not supply content that they have not said.",
  /* M74b, ISC-665: the walk's "so I don't share a worry that you're \"not very
   * clever.\"" put words in the student's mouth that the student hadn't said. */
  "- Quote the researcher only word for word, from their own turns below. Use quotation marks only around their exact words, and do not paraphrase them inside quotation marks.",
  "- Do not set one thing against another with \"rather than\" or with an \"X, not Y\" reframe. Say what the thing is.",
];

/** The close of every turn that asks: the question last, then the two marked lines. */
const ASKING_CLOSE: readonly string[] = [
  "- End the reply on the question, and ask it once. Then leave a blank line and write exactly two marked lines, in this order, and end the reply there:",
  "QUESTION: the question you just asked, one sentence",
  "BECAUSE: why you asked it, one sentence, addressed to the researcher",
];

/**
 * The opener's close when the page already shows the step's question (M74b,
 * ISC-664).
 *
 * The bubble that opens the step carries the question, so the walk read it
 * there, then at the end of the opener, then on its own line. The opener now
 * says what the step is for and where in their own setting to start, and stops:
 * the question is the bubble's, and Abductive records the bubble's question as
 * the one it put.
 */
export const OPENER_LEAD_IN =
  "- The page shows the step's question in the bubble just above your turn. Do not ask it again and do not end on a question: write two or three sentences that lead into it, and stop. Leave out the marked lines.";

/**
 * The hold-off at the framing, and why it survives the field going away.
 *
 * M37 added it because the band asked what you expected to find and what you
 * found instead, immediately under what you are exploring, and that question
 * presumes an expectation, a finding and the conflict between them. M40 removed
 * the field: the puzzle is the tool's reading of saved answers now, so nothing on
 * the page asks for it.
 *
 * The line stays, because the model can still ask it unprompted and it is still
 * the wrong first question. What a conversation at the framing is for is getting
 * the researcher to say what they are looking at, which is the material a reading
 * is later made of.
 */
/* M92, ISC-745: forward, like every question outside Early data. */
const FRAMING_HOLD_OFF =
  "- Do not ask what they expect to find, and what the papers would lead them to expect instead, until they have said what they want to explore. Ask first what they plan to look at and what draws them to it.";

/**
 * The rule that keeps a step's own question open while data is in the study
 * (M51, ISC-534).
 *
 * A co-author uploaded their data before answering anything, and the design
 * conversation stopped asking them open questions: it had their transcripts in the
 * prompt, so every turn could answer the step out of their material instead of
 * asking them for it. The owner's decision of 2026-09-26: data can be added at
 * any time, and until a step has a saved answer that step's conversation asks
 * its open question and does not answer from the material.
 *
 * ## The mechanism, and why this one
 *
 * The passages are left out of the prompt. The alternative was to send them and
 * instruct the model not to draw on them, and this codebase already knows what
 * that is worth: the interrogation guarantee is enforced by a detector run over
 * the tool's own half of the prompt rather than by asking the model nicely, and
 * M37's whole design note says so. An instruction not to use material that is
 * sitting in the context is unverifiable from the outside and unfalsifiable from
 * the inside; a prompt that does not hold the passages cannot answer from them,
 * and a test can read the prompt and say so.
 *
 * It costs the model the ability to ask a question grounded in a passage at an
 * unanswered step. That is the trade the owner made, and it is the cheaper half:
 * the step's question is the thing the researcher has not answered, and a
 * follow-up about their own transcript is available the moment they answer it.
 *
 * Nothing else changes. The data reader still drafts claims to Your model from
 * the same passages, uploads stay open at every step, and once the step has a
 * saved answer the material comes back into the prompt as it always did.
 */
/**
 * The three parts of a starting point, and which one to ask about now (M62,
 * ISC-599).
 *
 * The hold-off above keeps the first question on what the researcher is looking
 * at. Once they have said it, the turn asks which literatures they expect to draw
 * on and then where they want the project to land, one question a turn, so that
 * a Summarise afterwards has something of theirs to draw each part from. Which
 * part is covered is the replay's reading of the record (`framingCoverage`), not
 * the model's memory of the conversation, and a covered part is not asked again.
 */
const FRAMING_PART_NAME: Readonly<Record<FramingDraftField, string>> = {
  startingInterest: "the interest",
  seminalCorpus: "the literatures",
  targetVenue: "the target journal",
};

export interface FramingProgress {
  readonly covered: Readonly<Record<FramingDraftField, boolean>>;
  /** Covered but still open by their own account (the owner's amendment). */
  readonly open?: ReadonlySet<FramingDraftField>;
  readonly next: FramingDraftField | null;
}

export function framingPartsBlock(progress: FramingProgress): readonly string[] {
  const fields = Object.keys(FRAMING_PART_NAME) as FramingDraftField[];
  const name = (f: FramingDraftField) => FRAMING_PART_NAME[f].replace(/^the/, "The");
  return [
    "",
    "## The three parts of a starting point",
    ...fields.map((f) => {
      const status = !progress.covered[f]
        ? "not covered yet"
        : progress.open?.has(f) === true
          ? "covered, still open by their own account, so leave it with them"
          : "covered";
      return `- ${name(f)}: ${status}. Its question: ${FRAMING_PROBES[f]}`;
    }),
    progress.next === null
      ? "- The conversation has covered all three parts. Follow the researcher, and don't ask again about any of the three."
      : `- Ask about this part now: ${FRAMING_PART_NAME[progress.next]}. Its question: ${FRAMING_PROBES[progress.next]}`,
    "- Ask it in these words, or as close to them as the conversation allows. Ask only that one, and don't ask again about a part marked covered.",
    "- \"Still up in the air\" or \"still working it out\" is a complete answer. Acknowledge it and move on.",
  ];
}

export const HOLD_THE_QUESTION =
  "- They haven't saved an answer at the step yet, so this turn puts the step's question to them in their own setting and waits for their answer. Their material is not in front of you for this turn.";

export interface ConversationPromptInput {
  /** Station id, or "framing". */
  readonly place: string;
  /** The place in the rail's own words. */
  readonly placeLabel: string;
  /** What this step is for, in the tool's words, for the model to reword. */
  readonly purpose: string;
  /** The step's own question, as the page puts it. */
  readonly stationQuestion: string;
  readonly mode: TurnMode;
  /** True for the first turn at this place, which the tool speaks. */
  readonly opener: boolean;
  /**
   * True when the opener asks a question of its own, because the bubble above
   * it shows a different one (M74b). Absent or false, an opener leads into the
   * bubble's question and asks nothing.
   */
  readonly openerAsks?: boolean;
  /** True when the researcher has written nothing anywhere yet. */
  readonly nothingWrittenYet: boolean;
  /**
   * Whether this step already holds a saved answer (M51, ISC-534).
   *
   * The same question `stationStated` answers for the rail and the step's own
   * status, computed by the caller and passed rather than derived here, so the
   * conversation and the rail cannot disagree about whether a step has been
   * answered. False also for a study whose brief has not loaded, which is the
   * safe way round: a turn that asks is recoverable and a turn that answers from
   * material the researcher has not been asked about is not.
   */
  readonly stepAnswered: boolean;
  readonly chunks: readonly Chunk[];
  readonly ontologySummary: string;
  readonly design?: DesignDigest;
  /** The exchange at this place, oldest first. */
  readonly here: readonly string[];
  /** The rest of the study's conversation, oldest first. */
  readonly earlier: readonly string[];
  /** At the framing, which of its three parts are covered (M62, ISC-599). */
  readonly framing?: FramingProgress;
  /**
   * The design challenge waiting at this step, and whether the researcher's
   * last reply is owed a follow-up first (M78b, ISC-682).
   */
  readonly challenge?: { readonly text: string; readonly followUp: boolean };
}

/**
 * Assemble the system prompt for one turn of a conversation.
 *
 * Throws when the tool's own half would supply an answer, exactly as
 * `assembleTurnPrompt` does, and for the same reason: a thrown error at
 * assembly time is recoverable and a leaked answer in the ledger is not.
 */
export function conversationPrompt(input: ConversationPromptInput): string {
  const interrogating = input.mode === "interrogation";
  const leadIn = openerLeadsIn(input);
  const authored: string[] = [
    ...ROLE_BLOCK,
    "",
    INTERVIEW_CONTRACT.trim(),
    "",
    interrogating ? INTERROGATION_HEAD : GUIDANCE_HEAD,
    ...(interrogating ? INTERROGATION_ALWAYS : GUIDANCE_ALWAYS),
    "",
    ...LITERATURE_RULES.split("\n"),
    "",
    ...CONVERSATION_RULES,
    narrowingRule(input.place),
    ...(leadIn ? [OPENER_LEAD_IN] : ASKING_CLOSE),
    ...(input.place === FRAMING_PLACE ? [FRAMING_HOLD_OFF] : []),
    ...(input.place === FRAMING_PLACE && input.framing !== undefined ? framingPartsBlock(input.framing) : []),
    ...(input.stepAnswered ? [] : [HOLD_THE_QUESTION]),
    /* M84, ISC-707: the unit and the data kind; at Context with the unit
     * empty, the unit is the first question. */
    ...levelLines({ unit: input.design?.unit, unitOther: input.design?.unitOther, dataType: input.design?.dataType }, input.place),
    /* M84, ISC-703 and ISC-704: the stage, the register read from the record,
     * and what the other steps cover. */
    "",
    "## The stage and the register",
    ...registerLines(input.place, input.stepAnswered, effectiveUnit(input.design?.unit, input.design?.unitOther)),
    ...(isStationId(input.place) ? stepBoundsBlock(input.place) : []),
  ];

  if (input.opener) {
    authored.push(
      "",
      "## Your first turn here",
      "- Say in one sentence what this step is for, in your own words. Do not repeat the sentence that this prompt gives you.",
      leadIn
        ? input.nothingWrittenYet
          ? "- They haven't written an answer anywhere yet, so lead into the easier question: what they plan to look at, what draws them to it, what they want to explore."
          : "- Then point them to the place in their own setting where an answer could start, using what they have written elsewhere."
        : input.nothingWrittenYet
          ? "- They haven't written an answer anywhere yet, so put the easier question: what they plan to look at, what draws them to it, what they want to explore."
          : "- Then put the step's question to them in their own setting, using what they have written elsewhere.",
    );
  }

  const quoted: string[] = [
    "",
    `## The step: ${input.placeLabel}`,
    `What it is for: ${input.purpose}`,
    `The question the page puts: ${input.stationQuestion}`,
    "",
    "## Where the study currently stands",
    input.ontologySummary.trim() === "" ? "The ontology is empty." : input.ontologySummary.trim(),
    ...describeDesign(input.design),
    ...(input.challenge === undefined || openerLeadsIn(input) ? [] : challengeBlock(input.challenge, input.challenge.followUp)),
  ];

  if (input.earlier.length > 0) {
    quoted.push(
      "",
      "## Earlier in this study, at other steps",
      ...input.earlier,
      "",
      "Do not ask again for something that they have already given you.",
    );
  }

  if (input.here.length > 0) {
    quoted.push(
      "",
      "## The conversation here, oldest first",
      ...input.here,
      "",
      "Your reply follows the last line of this.",
    );
  }

  /* The material, once the step has an answer to build on (M51, ISC-534). The
   * citation instruction travels with the passages, so a turn that cannot see
   * them is not told to cite ids that are not there. */
  if (input.stepAnswered && input.chunks.length > 0) {
    const block = materialBlock(input.chunks);
    quoted.push(...block.quoted);
    authored.push(...block.authored);
  }

  /* M62, ISC-604: the guidance half is held to its own detector as well. */
  {
    const leaks = (interrogating ? proposedAnswerViolations : guidanceAnswerViolations)(authored.join("\n"));
    if (leaks.length > 0) {
      throw new Error(
        `conversation prompt at '${input.place}' supplies an answer: ${leaks
          .map((l) => `"${l.phrase}" (${l.why})`)
          .join("; ")}`,
      );
    }
  }

  return [...authored, ...quoted].join("\n");
}

/**
 * Whether this turn is an opener that leads into the bubble's question rather
 * than asking one of its own (M74b, ISC-664). An opener asks only where the
 * caller says the bubble shows a different question: at Starting point once the
 * interest is covered, the opener asks about the next part.
 */
export function openerLeadsIn(input: Pick<ConversationPromptInput, "opener" | "openerAsks">): boolean {
  return input.opener && input.openerAsks !== true;
}

/** The user turn that opens a conversation, so the model asks rather than answers. */
export function CONVERSATION_INSTRUCTION(opener: boolean, asks = !opener): string {
  if (opener && !asks) return "Open the conversation now. Address your lead-in to the researcher.";
  return opener
    ? "Open the conversation now. Address your reply to the researcher and end it on one question."
    : "Reply to the researcher now. Address your reply to them and end it on one question.";
}

export interface DraftPromptInput {
  /** The question the draft is an answer to. */
  readonly question: string;
  /** The researcher's own turns at this place, oldest first. */
  readonly said: readonly string[];
  /**
   * The parts of a several-answer draft, each under its label (ISC-592): the
   * Starting point drafts its three answers in one call. Absent for a one-part
   * draft, which is every step's.
   */
  readonly parts?: readonly { readonly label: string; readonly question: string }[];
  /** Labels of parts still open by their own account, which stay [...] (the owner's amendment to M62). */
  readonly openLabels?: readonly string[];
  /**
   * The researcher's replies to each part's question, by label (M78b, ISC-681):
   * printed under the parts, so a part with their words is summarised from them
   * and never left as the gap.
   */
  readonly partWords?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The prompt for a draft made only of the researcher's own words.
 *
 * The hard rule is the fourth bullet, and it is the one this whole control
 * lives or dies on: where the answer would need something they did not say, the
 * model leaves a gap rather than filling it. A tool that writes the missing
 * half of a researcher's answer and puts their name on it is the failure
 * Abductive exists to measure, arriving through the door marked helpful.
 */
export function draftPrompt(input: DraftPromptInput): string {
  const lines: string[] = [
    "# Role",
    "You are summarising the researcher's own answer, out of what they said in this conversation. You are not adding to it.",
    "",
    DRAFT_MARKER,
    /* M74b, ISC-664: both presses of Summarise on the walk of 2026-10-02 returned
     * the student's replies joined end to end. */
    "- Write the answer as a summary of two to five sentences, or fewer where they said less, in first person.",
    "- Use only what the researcher said in the turns below. Keep their phrasing where it stands on its own, and reword a phrase that only makes sense as a reply to your question.",
    "- Leave out their questions and asides, such as \"Is that what you mean?\" or \"I'm not sure that sent\".",
    "- Do not join their replies end to end. A summary is shorter than the replies that it summarises.",
    "- Keep their hedges and their uncertainty. A tentative sentence stays tentative.",
    "- Where the answer would need something that they did not say, write [...] and carry on. Do not fill the gap.",
    "- Add only facts that they gave, do not read meaning into their words, and do not praise them. Keep each fact with the person or the event that they gave it for.",
    /* M78b, ISC-681: the serendipity walk's summaries dropped the student's
     * relativizers eight times, turned their active verbs passive, reordered
     * their words, and ran to six or seven sentences four times out of nine. */
    '- Keep their relative pronouns: where they wrote "the leads that founders have told me about" or "the way that founders notice", keep "that".',
    '- Keep their active voice and their word order: where they wrote "feel a pull between" or "I know the other two", keep those words in that order.',
    "- Write at most five sentences for each part. Count only prose: a line with a paper's author and year is not a sentence.",
  ];

  const parts = input.parts ?? [];
  if (parts.length > 0) {
    /* ISC-592: the Starting point's three answers in one call. Each part is held
     * to the same rule as a one-part draft, and a part the conversation never
     * touched is the gap alone: a literature or a journal they never named is
     * not a thing to supply. */
    const labels = parts.map((p) => `${p.label}:`).join(", ");
    lines.push(
      `- Write ${parts.length} parts, each starting on a new line with its label and a colon, in this order: ${labels}`,
      "- A part that the conversation did not mention is [...] alone. Do not invent a literature, a journal or anything else that they did not say.",
      "- A turn that opens with (reply to the LABEL question) was their answer to that part's question. Take that part from it first, and from anything else that they said about it.",
      "- Return only the labelled parts. Start with the first part and end with the last, without a heading.",
      ...((input.openLabels ?? []).length > 0
        ? [`- These parts are still open by their own account, so write [...] alone for them: ${(input.openLabels ?? []).join(", ")}`]
        : []),
      '- Summarise each part listed under "Their words for each part" from the words under its label, hedges included. Do not write [...] alone for such a part.',
      "",
      "## The questions, one per part",
      ...parts.map((p) => `${p.label}: ${p.question}`),
      "",
    );
    const words = parts.filter((p) => (input.partWords?.[p.label] ?? []).length > 0 && !(input.openLabels ?? []).includes(p.label));
    if (words.length > 0) {
      lines.push("## Their words for each part", ...words.flatMap((p) => [`${p.label}:`, ...(input.partWords?.[p.label] ?? []), ""]));
    }
  } else {
    /* One part at every step (M40). */
    lines.push("- Return only the answer. Start with the answer and end with the answer, without a heading.");
    lines.push("", "## The question this answers", input.question, "");
  }

  lines.push(
    "## What the researcher said, oldest first",
    ...(input.said.length === 0 ? ["They haven't said anything yet."] : input.said),
    "",
    OWNER_RULES,
  );

  return lines.join("\n");
}
