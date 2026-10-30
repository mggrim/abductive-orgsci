/**
 * Why a concept or relation matters, and the argument so far (M82, ISC-695).
 *
 * The owner, 2026-10-04: "at the moment, it just feels like a list of concepts
 * and relationships, without insight into why those concepts or relationships
 * matter. Is that something that the tool is capturing and not presenting? Or
 * is it that the tool isn't capturing that insight." The tool wasn't capturing
 * it: a card carried a definition, properties, statements and evidence, and the
 * only synthesis was the read-back on Checks.
 *
 *   - `writeWhyLines`: one call that writes a "Why it matters" line for each
 *     accepted card without one (a card accepted before M82, one the researcher
 *     wrote, or one whose suggestion carried no line), from the puzzle, the
 *     expectation it bears on and the card's statements. Each line waits on its
 *     card, marked Suggested, for the researcher to accept or refine.
 *   - `writeArgument`: "The argument so far", two to four sentences and at most
 *     60 words from the accepted cards, the read-back's short form (M80's writer
 *     with the lower cap), rewritten whenever `argumentBasis` moves.
 */

import type { ArgumentWrittenEvent, LedgerEvent, WhySuggestedEvent } from "../ledger/events.ts";
import type { CompleteResult, InferenceClient } from "../inference/types.ts";
import { providerField } from "../inference/types.ts";
import { completeInVoice, voiceRetryField } from "../inference/voiceRetry.ts";
import { MODEL_VOICE_RULES } from "../inference/promptMarkers.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { OWNER_RULES, PROSE_CONTRACT } from "../personas/voice.ts";
import { renderStudyContext, type StudyContext } from "../interview/studyContext.ts";
import type { ProjectBrief } from "../state/projects.ts";
import { projectConcepts, type ProjectOntologyView } from "./projection.ts";
import { parseReadBack, sectionContext } from "./reportSections.ts";
import { whyLine } from "./suggest.ts";
import { numberWord, relationSentence } from "./vocabulary.ts";

/** The cards one call writes lines for; the rest wait for the next pass. */
export const WHY_PER_CALL = 40;

/** The statements a card lists in the prompt. */
const STATEMENTS_PER_CARD = 6;

export interface WhyInput {
  readonly projectId: string;
  readonly events: readonly LedgerEvent[];
  readonly graph: OntologyGraph;
  readonly context: StudyContext;
  readonly clock?: { readonly now?: () => number; readonly makeId?: () => string };
}

const WHY_SYSTEM = [
  "# Role",
  "You write a \"Why it matters\" line for each accepted concept and relation in a researcher's emerging project ontology: the concepts and the relations between them that they have accepted for their qualitative project.",
  "",
  "## What to write",
  "For each concept or relation listed as needing a line, one or two sentences, to the researcher as \"you\": what the concept or relation does for their argument about their puzzle and the expectation it bears on, and what the design loses without it.",
  "Ground each line in their puzzle, the concept's definition or the relation's claim, and the statements under it, and reuse their words. Where their words don't yet show what the concept or relation does for the argument, write [...] for that part. Do not supply a standard theoretical label.",
  "",
  "## Output format, strictly",
  "One line per concept or relation, starting with its label and a colon, such as:",
  "C2: <one or two sentences>",
  "R1: <one or two sentences>",
  "",
  PROSE_CONTRACT,
].join("\n");

/** Lines for the accepted cards that have none, as events ready to append. An empty list makes no call. */
export async function writeWhyLines(input: WhyInput, client: InferenceClient): Promise<readonly WhySuggestedEvent[]> {
  const now = input.clock?.now ?? (() => Date.now());
  const makeId = input.clock?.makeId ?? (() => crypto.randomUUID());
  const view = projectConcepts(input.events, input.projectId, input.graph);
  const name = (id: string) => view.concepts.get(id)?.name ?? "a concept";
  const statements = (ids: readonly string[]) =>
    ids.slice(0, STATEMENTS_PER_CARD).flatMap((id) => {
      const s = view.statements.get(id);
      return s === undefined ? [] : [`  - ${s.text}`];
    });
  const cards = [
    ...view.accepted.map((c, i) => ({ label: `C${i + 1}`, target: { kind: "concept" as const, id: c.id }, lacks: c.why === null, lines: [`C${i + 1}. ${c.name}: ${c.definition}`, ...statements(c.statementIds)] })),
    ...view.acceptedRelations.map((r, i) => ({
      label: `R${i + 1}`,
      target: { kind: "relation" as const, id: r.id },
      lacks: r.why === null,
      lines: [`R${i + 1}. ${relationSentence(name(r.from), r.relation, name(r.to))}${r.claim === "" ? "" : `: ${r.claim}`}`, ...statements(r.statementIds)],
    })),
  ];
  const needed = cards.filter((c) => c.lacks).slice(0, WHY_PER_CALL);
  if (needed.length === 0) return [];
  const user = [
    renderStudyContext(input.context),
    "",
    "# Their accepted concepts and relations, each with its statements",
    ...cards.flatMap((c) => c.lines),
    "",
    `# Concepts and relations that need a line: ${needed.map((c) => c.label).join(", ")}`,
  ].join("\n");
  const result = await completeInVoice(client, { system: WHY_SYSTEM, messages: [{ role: "user", content: user }] });
  const byLabel = new Map(needed.map((c) => [c.label.toLowerCase(), c] as const));
  const out: WhySuggestedEvent[] = [];
  const seen = new Set<string>();
  for (const m of result.text.matchAll(/^\s*([CR]\d+)\s*[:.]\s*(.+)$/gim)) {
    const card = byLabel.get((m[1] ?? "").toLowerCase());
    const text = whyLine(m[2]);
    if (card === undefined || text === "" || seen.has(card.label)) continue;
    seen.add(card.label);
    out.push({
      id: makeId(),
      ts: now(),
      actor: "persona:why-writer",
      projectId: input.projectId,
      model: result.model,
      modelVersion: result.modelVersion,
      ...providerField(result),
      ...voiceRetryField(result),
      type: "why-suggested",
      target: card.target,
      text,
    });
  }
  return out;
}

/* ── The argument so far ─────────────────────────────────────────────────── */

/* The lead's cap for the short form (M82): the read-back's 150 words became 60. */
export const ARGUMENT_MAX_WORDS = 60;
export const ARGUMENT_MAX_SENTENCES = 4;

const RULES = [MODEL_VOICE_RULES, "", OWNER_RULES].join("\n");

const ARGUMENT_SYSTEM = [
  "# Role",
  "You write \"The argument so far\" for a researcher: a short paragraph at the top of the emerging project ontology for their qualitative project, saying what the concepts and relations that they have accepted argue about their puzzle so far.",
  "",
  "## What to write",
  `Two to four sentences and at most ${ARGUMENT_MAX_WORDS} words, addressed to the researcher as "you", in the researcher's own words: reuse their phrases and their concept names. Say what the accepted relations claim about the puzzle, and name the part of the argument that the accepted concepts and relations don't yet connect.`,
  "Use only what the researcher has accepted and written.",
  "",
  "## Your answer",
  "Write the paragraph alone, without a heading or a label.",
  "",
  RULES,
].join("\n");

const SHORTEN = [
  "# Shorten",
  `You shorten a paragraph that states a researcher's argument so far. Keep their phrases and their concept names. Rewrite the paragraph as two to four sentences and at most ${ARGUMENT_MAX_WORDS} words, addressed to the researcher as "you". Use only what the paragraph says.`,
  "Write the paragraph alone, without a heading or a label.",
  "",
  RULES,
].join("\n");

const sentences = (text: string) =>
  text.trim().split(/(?<=[.!?]["”]?)\s+(?=["“]?[A-Z])/).map((x) => x.trim()).filter((x) => x !== "");
const words = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Whether the paragraph keeps the cap: at most 60 words in at most four sentences. */
export function argumentFits(text: string): boolean {
  return words(text) <= ARGUMENT_MAX_WORDS && sentences(text).length <= ARGUMENT_MAX_SENTENCES;
}

/** The accepted cards as the paragraph is written from them. */
function argumentRequest(brief: ProjectBrief, view: ProjectOntologyView): string {
  const ctx = sectionContext(brief, view);
  const name = (id: string) => view.concepts.get(id)?.name ?? "a concept";
  const why = (line: ProjectOntologyView["accepted"][number]["why"]) => (line !== null && line.status === "accepted" ? ` Why it matters: ${line.text}` : "");
  return [
    "# The puzzle, in the researcher's words",
    ctx.puzzle === "" ? "(still to come)" : ctx.puzzle,
    "",
    "# Accepted concepts",
    ...view.accepted.map((c) => `- ${c.name}: ${c.definition}${why(c.why)}`),
    "",
    "# Accepted relations",
    ...(view.acceptedRelations.length === 0
      ? ["(none yet)"]
      : view.acceptedRelations.map((r) => `- ${relationSentence(name(r.from), r.relation, name(r.to))}${r.claim === "" ? "" : `: ${r.claim}`}${why(r.why)}`)),
  ].join("\n");
}

/**
 * The argument so far, held to the cap: a longer one is sent back once, and a
 * reply that is still long is cut at the fourth sentence. Null before the first
 * accepted concept, and then no call is made.
 */
export async function writeArgument(input: { readonly brief: ProjectBrief; readonly view: ProjectOntologyView }, client: InferenceClient): Promise<string | null> {
  return (await argumentDraft(input, client))?.text ?? null;
}

/** The paragraph and the reply it came from, for the event's provenance. */
async function argumentDraft(
  input: { readonly brief: ProjectBrief; readonly view: ProjectOntologyView },
  client: InferenceClient,
): Promise<{ readonly text: string; readonly result: CompleteResult } | null> {
  if (input.view.accepted.length === 0) return null;
  const result = await completeInVoice(client, { system: ARGUMENT_SYSTEM, messages: [{ role: "user", content: argumentRequest(input.brief, input.view) }] });
  const first = parseReadBack(result.text);
  if (first === null) return null;
  if (argumentFits(first)) return { text: first, result };
  let rewrite: string | null = null;
  try {
    const n = sentences(first).length;
    rewrite = parseReadBack(
      (
        await client.complete({
          system: SHORTEN,
          messages: [
            {
              role: "user",
              content: `This paragraph has ${words(first)} words in ${numberWord(n)} sentence${n === 1 ? "" : "s"}. Rewrite the paragraph as at most ${ARGUMENT_MAX_WORDS} words in two to four sentences.\n\n${first}`,
            },
          ],
        })
      ).text,
    );
  } catch {
    /* A failed send-back keeps the paragraph: the cut below brings it to the cap. */
  }
  if (rewrite !== null && argumentFits(rewrite)) return { text: rewrite, result };
  return { text: cutToFit(rewrite ?? first), result };
}

/**
 * A paragraph cut to the cap: at most four sentences, then sentences dropped
 * from the end while it runs past 60 words, keeping the first. The Safari walk
 * read 62 words in three sentences, which the four-sentence cut alone kept.
 */
function cutToFit(text: string): string {
  const kept = sentences(text).slice(0, ARGUMENT_MAX_SENTENCES);
  while (kept.length > 1 && words(kept.join(" ")) > ARGUMENT_MAX_WORDS) kept.pop();
  return kept.join(" ");
}

/** The argument so far as an event ready to append, or null when there is nothing to write from. */
export async function argumentEvent(
  input: {
    readonly projectId: string;
    readonly brief: ProjectBrief;
    readonly view: ProjectOntologyView;
    readonly clock?: { readonly now?: () => number; readonly makeId?: () => string };
  },
  client: InferenceClient,
): Promise<ArgumentWrittenEvent | null> {
  const draft = await argumentDraft(input, client);
  if (draft === null) return null;
  return {
    id: (input.clock?.makeId ?? (() => crypto.randomUUID()))(),
    ts: (input.clock?.now ?? (() => Date.now()))(),
    actor: "persona:argument-writer",
    projectId: input.projectId,
    model: draft.result.model,
    modelVersion: draft.result.modelVersion,
    ...providerField(draft.result),
    ...voiceRetryField(draft.result),
    type: "argument-written",
    text: draft.text,
    basis: argumentBasis(input.view),
    /* M93, ISC-762: the paragraph is a suggestion until the researcher accepts it. */
    awaitsDecision: true,
  };
}

/**
 * The signature of the cards the paragraph is written from: every accepted
 * concept's name and definition, every accepted relation's kind and claim, and
 * every accepted Why it matters line. It moves with each accept and refine, so
 * the tab rewrites the paragraph when it no longer matches the ontology.
 */
export function argumentBasis(view: ProjectOntologyView): string {
  const why = (line: ProjectOntologyView["accepted"][number]["why"]) => (line !== null && line.status === "accepted" ? line.text : "");
  const parts = [
    ...view.accepted.map((c) => `c|${c.id}|${c.name}|${c.definition}|${why(c.why)}`),
    ...view.acceptedRelations.map((r) => `r|${r.id}|${r.from}|${r.relation}|${r.to}|${r.claim}|${why(r.why)}`),
  ].sort();
  /* FNV-1a, 32 bits: a short stamp is enough to tell two bases apart on one project. */
  let hash = 0x811c9dc5;
  for (const ch of parts.join("\n")) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${parts.length}:${hash.toString(16)}`;
}
