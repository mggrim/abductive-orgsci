/**
 * Persona runtime (ISC-14, ISC-19, ISC-22, ISC-23).
 *
 * Assembles the system prompt for a matrix-cell intervention as:
 *   persona creed markdown + cell intervention prompt + data-type question set
 * passes the selected chunks (with stable ids) as context, runs the active
 * InferenceClient once per persona on the cell, and converts the response
 * into typed ledger events:
 *   - one or more `challenge` events (persona actor, model + modelVersion)
 *   - `attention` layer 'citation' events for every [[chunk:ID]] cited
 *   - `attention` layer 'retrieval' events for every chunk placed in context
 *
 * The engine writes nothing itself — it returns validated events for the
 * caller to append via the ledger (single-source-of-state constraint).
 */

import type { AttentionEvent, ChallengeEvent, LedgerEvent } from "../ledger/events.ts";
import type { MatrixCell } from "../matrix/schema.ts";
import type { InferenceClient } from "../inference/types.ts";
import type { Chunk } from "../state/chunks.ts";
import type { DeclaredDataType, Project } from "../state/projects.ts";
import { VOICE_CONTRACT } from "./voice.ts";
import { completeInVoice, voiceRetryField } from "../inference/voiceRetry.ts";
import { providerField } from "../inference/types.ts";
import { effectiveUnit, unitWords, type UnitOfAnalysis } from "../interview/unitOfAnalysis.ts";
import { levelLines } from "../interview/levelPrompt.ts";

// ---------------------------------------------------------------------------
// Data-type-conditional question sets (ISC-19)
// ---------------------------------------------------------------------------

/**
 * Ethnographic data is partially observed and co-produced; archival data can
 * be interrogated directly; interviews sit in between. The persona's closing
 * question set switches accordingly — exported so it is unit-testable.
 */
export function questionSetFor(dataType: DeclaredDataType, chosen?: UnitOfAnalysis, unitOther?: string): string {
  /* M84, ISC-707: the set is read at the project's unit of analysis (a typed one too, M92). */
  const set = questionSetForKind(dataType);
  const unit = effectiveUnit(chosen, unitOther);
  if (unit === undefined || unit === "person") return set;
  return `${set}\n- Consider each passage for what it shows of ${unitWords(unit, unitOther)}, the project's unit of analysis, and ask at that level.`;
}

function questionSetForKind(dataType: DeclaredDataType): string {
  /* Nobody has said what the material is (D22, M43b).
   *
   * The brief opened on `interview` until M43b, so this function never met the
   * unstated case and the persona asked account-probing questions of fieldnotes.
   * Saying so is better than guessing: the set below probes the material as
   * material and asks the researcher to declare what it is, which is a question
   * the tool can put and a default cannot. */
  if (dataType === "") {
    return [
      "## Question set: the researcher has not stated the kind of material",
      "The researcher has not said whether they built this study on fieldnotes, interviews or archival documents, so do not assume. Treat what is in front of you as a record of uncertain provenance, and ask what kind of record it is.",
      "- What kind of record is this passage: something observed, something recounted to the researcher, or something produced by the setting for its own purposes?",
      "- Which interpretation of this passage would change if it turned out to be a rehearsed account rather than an observation?",
      "- What does this passage's own form tell you about who wrote it and whom they expected it to reach?",
    ].join("\n");
  }
  switch (dataType) {
    case "ethnographic":
      return [
        "## Question set: ethnographic data (reflective / prompting)",
        "You are considering fieldnotes: partial, positioned records of what one observer could see and chose to write down. You cannot interrogate the site directly, so prompt the researcher's reflection rather than asserting what happened.",
        "- What were you positioned to see here, and what was structurally invisible from where you stood?",
        "- Which of these observations would a differently-positioned observer likely record differently?",
        "- What did you choose not to write down, and what does that choice protect?",
        "- Where might your presence have produced the behavior you recorded?",
      ].join("\n");
    case "interview":
      return [
        "## Question set: interview data (account-probing)",
        "You are considering retrospective, self-presented accounts. Probe the accounts as accounts: what work is the telling doing, and what would corroborate or contradict it?",
        "- Where is the informant narrating a rehearsed story rather than recalling an episode?",
        "- Which claims rest on a single informant's account and what independent trace would corroborate them?",
        "- What question was the informant answering that the researcher did not ask?",
        "- Whose account is missing that this account implicitly argues against?",
      ].join("\n");
    case "archival":
      return [
        "## Question set: archival data (direct interrogation)",
        "You are considering fixed documentary traces. Interrogate the record directly and state what it does and does not establish.",
        "- What does this document establish on its face, and what is only inference from it?",
        "- Who produced this record, for what audience, and what did its production omit by design?",
        "- Which claims in the working interpretation have NO documentary trace in the corpus?",
        "- What contemporaneous document would falsify the current interpretation, and is it in the corpus?",
      ].join("\n");
  }
}

// ---------------------------------------------------------------------------
// Prompt assembly (ISC-14)
// ---------------------------------------------------------------------------

const CITATION_INSTRUCTION = [
  "## Output rules",
  "- Ground every claim about the data in specific chunks, citing them inline as [[chunk:ID]] using the exact IDs provided.",
  "- If you raise more than one distinct challenge, separate challenges with a line containing only '---'.",
  "- Speak in your persona's voice. Be direct; do not soften the challenge.",
  /* M78a, ISC-678: the walk's first challenge cited Allen (1977) and Fayard and
     Weeks (2007) "From memory (please verify each)", papers the project never
     named. A challenge that does so is dropped at run time too (outsideCitations). */
  "- Cite only the papers that the researcher identified and the researcher's own words. Do not name any other author, paper or year, and do not cite anything from memory.",
].join("\n");

/** System prompt = creed + intervention prompt + question set (exported for tests). */
export function assembleSystemPrompt(params: {
  creed: string;
  cell: MatrixCell;
  dataType: DeclaredDataType;
  /** M84, ISC-707: the unit of analysis named at Context. */
  unit?: UnitOfAnalysis | undefined;
  unitOther?: string | undefined;
}): string {
  return [
    "# Persona creed",
    params.creed.trim(),
    "",
    "# Intervention",
    `You are intervening at matrix cell '${params.cell.id}' (${params.cell.flag}).`,
    params.cell.prompt.trim(),
    "",
    questionSetFor(params.dataType, params.unit, params.unitOther),
    ...levelLines({ unit: params.unit, unitOther: params.unitOther, dataType: params.dataType }),
    "",
    VOICE_CONTRACT,
    "",
    CITATION_INSTRUCTION,
  ].join("\n");
}

/** User message: project brief + prior-loop summary + chunks with stable ids. */
export function assembleUserMessage(params: {
  project: Project;
  chunks: readonly Chunk[];
  priorEvents: readonly LedgerEvent[];
}): string {
  const { project, chunks, priorEvents } = params;
  const brief = project.brief;

  const priorChallenges = priorEvents.filter((e) => e.type === "challenge").length;
  const priorAdjudications = priorEvents.filter((e) => e.type === "adjudication").length;

  const chunkBlocks =
    chunks.length === 0
      ? "(the researcher hasn't selected data chunks at this stage)"
      : chunks
          .map(
            (chunk) =>
              `[chunk:${chunk.id}] (${chunk.kind}, #${chunk.index})\n${chunk.text}`,
          )
          .join("\n\n");

  const venue = brief.targetVenue === undefined ? "" : `\nTarget venue: ${brief.targetVenue}`;
  /* M78a, ISC-678: the papers a challenge may cite, as the researcher named them. */
  const named = (brief.seminalCorpus ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  const papers = named.length === 0 ? "" : `\nPapers the researcher identified: ${named.join("; ")}`;

  return [
    `# Project brief: ${project.title}`,
    ...((brief.puzzleAnswer ?? "").trim() === "" ? [] : [`Puzzle, in their own words: ${brief.puzzleAnswer}`]),
    `Puzzle, as the tool suggests it: ${brief.researchQuestion}`,
    `Site rationale: ${brief.siteRationale}`,
    `Sample rationale: ${brief.sampleRationale}`,
    `Declared data type: ${brief.dataType === "" ? "not stated" : brief.dataType}${venue}${papers}`,
    `Unit of analysis: ${effectiveUnit(brief.unit, brief.unitOther) === undefined ? "not identified yet" : brief.unit === "other" ? (brief.unitOther ?? "").trim() : brief.unit}`,
    `Current stage: ${project.stage}`,
    `Loop so far: ${priorEvents.length} ledger events (${priorChallenges} challenges, ${priorAdjudications} adjudications).`,
    "",
    "# Data chunks in context",
    chunkBlocks,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Response parsing (ISC-14, ISC-23)
// ---------------------------------------------------------------------------

const CITATION_RE = /\[\[chunk:([^\]\s]+)\]\]/g;

/** Extract distinct chunk ids cited as [[chunk:ID]] in a response. */
export function extractCitations(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(CITATION_RE)) {
    const id = match[1];
    if (id !== undefined && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Split a persona response into one or more non-empty challenge texts. */
export function splitChallenges(text: string): string[] {
  return text
    .split(/\n\s*---\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

// ---------------------------------------------------------------------------
// runIntervention (ISC-14, ISC-22, ISC-23)
// ---------------------------------------------------------------------------

export interface PersonaContext {
  readonly project: Project;
  readonly chunks: readonly Chunk[];
  readonly priorEvents: readonly LedgerEvent[];
  /** Creed markdown by persona slug (from personas/creeds.ts at runtime; injected in tests). */
  readonly creeds: Readonly<Record<string, string>>;
  readonly now?: () => number;
  readonly makeId?: () => string;
}

export interface InterventionResult {
  readonly challenges: readonly ChallengeEvent[];
  readonly citationAttention: readonly AttentionEvent[];
  readonly retrievalAttention: readonly AttentionEvent[];
  /** All events in append order (retrieval → challenges → citations). */
  readonly events: readonly LedgerEvent[];
}

/**
 * Run one matrix-cell intervention: one inference call per persona on the
 * cell. Returns the ledger events to append; appends nothing itself.
 */
export async function runIntervention(
  cell: MatrixCell,
  ctx: PersonaContext,
  client: InferenceClient,
): Promise<InterventionResult> {
  const now = ctx.now ?? (() => Date.now());
  const makeId = ctx.makeId ?? (() => crypto.randomUUID());
  const projectId = ctx.project.id;

  // Retrieval layer: every chunk placed into inference context (ISC-22).
  const retrievalAttention: AttentionEvent[] = ctx.chunks.map((chunk) => ({
    id: makeId(),
    ts: now(),
    actor: "system",
    projectId,
    type: "attention",
    layer: "retrieval",
    chunkId: chunk.id,
  }));

  const userMessage = assembleUserMessage(ctx);
  /* What a challenge may cite: the brief in the researcher's words and their passages. */
  const allowed = [
    ...Object.values(ctx.project.brief).filter((v): v is string => typeof v === "string"),
    ...ctx.chunks.map((c) => c.text),
  ].join("\n");
  const challenges: ChallengeEvent[] = [];
  const citationAttention: AttentionEvent[] = [];

  for (const personaSlug of cell.personas) {
    const creed = ctx.creeds[personaSlug];
    if (creed === undefined || creed.trim().length === 0) {
      throw new Error(`No creed loaded for persona '${personaSlug}' (cell ${cell.id})`);
    }

    /* M69, ISC-644: the owner's rules ride in VOICE_CONTRACT, and a reply that
       breaks one goes back once for the offending sentences. */
    const result = await completeInVoice(client, {
      system: assembleSystemPrompt({ creed, cell, dataType: ctx.project.brief.dataType, unit: ctx.project.brief.unit, unitOther: ctx.project.brief.unitOther }),
      messages: [{ role: "user", content: userMessage }],
    });

    const actor = `persona:${personaSlug}` as const;

    for (const text of splitChallenges(result.text)) {
      /* M78a, ISC-678: a challenge that cites a paper outside the project, or
         says it cites from memory, is not written. */
      if (FROM_MEMORY.test(text) || outsideCitations(text, allowed).length > 0) continue;
      challenges.push({
        id: makeId(),
        ts: now(),
        actor,
        projectId,
        model: result.model,
        modelVersion: result.modelVersion,
        ...providerField(result),
        type: "challenge",
        text,
        matrixCell: cell.id,
        ...voiceRetryField(result),
      });
    }

    // Citation layer: chunk ids the persona actually cited (ISC-23).
    for (const chunkId of extractCitations(result.text)) {
      citationAttention.push({
        id: makeId(),
        ts: now(),
        actor,
        projectId,
        model: result.model,
        modelVersion: result.modelVersion,
        ...providerField(result),
        type: "attention",
        layer: "citation",
        chunkId,
      });
    }
  }

  return {
    challenges,
    citationAttention,
    retrievalAttention,
    events: [...retrievalAttention, ...challenges, ...citationAttention],
  };
}

// ---------------------------------------------------------------------------
// Citations from outside the project (M78a, ISC-678)
// ---------------------------------------------------------------------------

const FROM_MEMORY = /\bfrom memory\b/i;
const NAME = "[A-Z][\\p{L}'\u2019-]+";
const MONTHS = new Set(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);
/* "Allen (1977)", "Fayard and Weeks (2007)", "Cunha, Clegg and Mendonça (2010)", "Busch et al. (2024)". */
const NARRATIVE = new RegExp(
  `\\b(${NAME})(?:\\s+et al\\.?|(?:,\\s+${NAME})*,?\\s+(?:and|&)\\s+${NAME})?\\s+\\((\\d{4})[a-z]?\\)`,
  "gu",
);
/* "(Allen, 1977)", "(Fayard and Weeks, 2007)". */
const PARENTHETICAL = new RegExp(`\\((${NAME})(?:\\s+et al\\.?|\\s+(?:and|&)\\s+${NAME})?,?\\s+(\\d{4})[a-z]?\\)`, "gu");

/**
 * The author-and-year citations in a challenge that name a paper outside the
 * project: neither the papers the researcher named nor their own words carry
 * that surname with that year. A month before a year is a date, not a citation.
 */
export function outsideCitations(text: string, allowed: string): string[] {
  const held = allowed.toLowerCase();
  const out: string[] = [];
  for (const re of [PARENTHETICAL, NARRATIVE]) {
    for (const m of text.matchAll(re)) {
      const surname = m[1] ?? "";
      const year = m[2] ?? "";
      if (MONTHS.has(surname)) continue;
      if (held.includes(surname.toLowerCase()) && held.includes(year)) continue;
      if (out.some((o) => o.includes(m[0]) || m[0].includes(o))) continue;
      out.push(m[0]);
    }
  }
  return out;
}
