/**
 * Relate concepts (M82, ISC-694).
 *
 * The owner, 2026-10-04: "why aren't there more links between concepts? It
 * seems like there are only dyads that are independent of one another. Is that
 * a problem? Is there a way to improve the system so that it captures more
 * interdependencies across these concepts?"
 *
 * Each suggestion pass relates the concepts of its own batch, so the ontology
 * grew as separate pairs: on the serendipity walk, eight of twenty-two accepted
 * concepts stood alone. This pass reads every accepted concept with its
 * definition and its statements, and the relations already set, and proposes
 * up to three relations among the accepted concepts. Each rests on a statement
 * it names, so a proposal is grounded in the researcher's own words rather
 * than in the model's sense of what usually goes with what. The proposals are
 * ordinary relation suggestions: the researcher accepts, refines or rejects
 * each one on its card.
 *
 * It runs on a press of Suggest relations, and after the researcher accepts a
 * concept that leaves the newest concept standing alone in an ontology of
 * three or more (the tab decides when; `focus` names that concept).
 */

import { CONCEPT_RELATIONS, type ConceptRelation, type LedgerEvent, type RelationSuggestedEvent } from "../ledger/events.ts";
import type { InferenceClient } from "../inference/types.ts";
import { providerField } from "../inference/types.ts";
import { completeInVoice, voiceRetryField } from "../inference/voiceRetry.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { PROSE_CONTRACT } from "../personas/voice.ts";
import { renderStudyContext, type StudyContext } from "../interview/studyContext.ts";
import { loneConcepts, projectConcepts } from "./projection.ts";
import { parseBlocks } from "./suggest.ts";
import { RELATION_PHRASE, relationSentence } from "./vocabulary.ts";

/** At most three relations per press, as every pass of suggestions has. */
export const MAX_RELATED = 3;

/** The statements one concept or relation lists, so a large ontology stays readable to the model. */
const STATEMENTS_PER_CARD = 8;

export interface RelateInput {
  readonly projectId: string;
  readonly events: readonly LedgerEvent[];
  readonly graph: OntologyGraph;
  readonly context: StudyContext;
  /** The concept to relate first: the newest, when it stands alone after an accept. */
  readonly focus?: string;
  readonly clock?: { readonly now?: () => number; readonly makeId?: () => string };
}

const listed = (items: readonly string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const SYSTEM = [
  "# Role",
  "You propose relations among the concepts that a researcher has already accepted into the emerging project ontology for their qualitative project, so that the concepts connect into one account of their puzzle. You propose; the researcher accepts, refines or rejects each relation.",
  "",
  "## What to propose",
  `At most ${MAX_RELATED} relations, each between two concepts listed under "Accepted concepts", named exactly as listed. Fewer is normal: propose a relation only where one or more of the listed statements shows it, and name those statements on its RESTS line.`,
  "Prefer a relation that involves a concept that stands alone, and a relation that joins two concepts that the relations in the ontology don't yet connect. A chain is welcome (one concept leads to a second, and the second leads to a third), and so is a condition (one concept is a condition for another).",
  "Do not propose a relation that is already in their ontology, already suggested or rejected.",
  "",
  "## Draft rules",
  "The claim is one sentence in their words that says how the first concept bears on the second. Where their words leave out something the claim needs, write [...] in its place. Do not supply the standard theoretical label, resolve their uncertainty, or finish a thought they left open.",
  "",
  "## Relations",
  "Use only these five kinds:",
  ...CONCEPT_RELATIONS.map((r) => `- ${r}: ${RELATION_PHRASE[r]}`),
  "",
  "## Why it matters",
  "Give each relation a WHY line: one or two sentences, to the researcher as \"you\", on what the relation does for their argument about the puzzle, and what their design loses without it.",
  "",
  "## Output format, strictly",
  "Blocks separated by a line containing only '---', one block per relation:",
  "FROM: <a concept name exactly as listed>",
  "KIND: <one of the five>",
  "TO: <a concept name exactly as listed>",
  "CLAIM: <one sentence in their words, [...] for anything they did not say>",
  "CONDITIONS: <when they expect it to apply, in their words, or leave the line out>",
  "RESTS: <the labels of the statements it rests on, such as S2, S5; at least one>",
  "WHY: <one or two sentences on what this relation does for their argument and what the design loses without it>",
  "",
  PROSE_CONTRACT,
].join("\n");

/** The relations Abductive proposes among the accepted concepts, as events ready to append. */
export async function relateConcepts(input: RelateInput, client: InferenceClient): Promise<readonly RelationSuggestedEvent[]> {
  const now = input.clock?.now ?? (() => Date.now());
  const makeId = input.clock?.makeId ?? (() => crypto.randomUUID());
  const view = projectConcepts(input.events, input.projectId, input.graph);
  if (view.accepted.length < 2) return [];
  const name = (id: string) => view.concepts.get(id)?.name ?? "a concept";

  /* Every statement under an accepted concept or relation, labelled S1, S2 across the ontology. */
  const label = new Map<string, string>();
  const statementLines = (ids: readonly string[]) =>
    ids.slice(0, STATEMENTS_PER_CARD).flatMap((id) => {
      const s = view.statements.get(id);
      if (s === undefined) return [];
      const at = `S${label.size + 1}`;
      label.set(at.toLowerCase(), id);
      return [`  ${at}. ${s.text}`];
    });
  const concepts = view.accepted.flatMap((c) => [`- ${c.name}: ${c.definition}`, ...statementLines(c.statementIds)]);
  const relations = view.acceptedRelations.flatMap((r, i) => [
    `R${i + 1}. ${relationSentence(name(r.from), r.relation, name(r.to))}${r.claim === "" ? "" : `: ${r.claim}`}`,
    ...statementLines(r.statementIds),
  ]);
  const lone = loneConcepts(view).map((c) => c.name);
  const focus = input.focus === undefined ? undefined : view.concepts.get(input.focus);
  const elsewhere = [...view.relations.values()]
    .filter((r) => r.status !== "accepted")
    .map((r) => `- ${relationSentence(name(r.from), r.relation, name(r.to))}`);
  const user = [
    renderStudyContext(input.context),
    "",
    "# Accepted concepts, each with the statements placed under it",
    ...concepts,
    "",
    "# Relations already in their ontology, each with its statements",
    ...(relations.length === 0 ? ["(none yet)"] : relations),
    "",
    "# Relations already suggested or rejected, which you must not propose again",
    ...(elsewhere.length === 0 ? ["(none)"] : elsewhere),
    ...(lone.length === 0 ? [] : ["", `These concepts stand alone: ${listed(lone)}.`]),
    ...(focus?.status === "accepted" ? ["", `Relate ${focus.name} first, the concept that they accepted last.`] : []),
  ].join("\n");

  const result = await completeInVoice(client, { system: SYSTEM, messages: [{ role: "user", content: user }] });
  const byName = new Map(view.accepted.map((c) => [c.name.trim().toLowerCase(), c.id] as const));
  const taken = new Set([...view.relations.values()].map((r) => `${r.from}|${r.to}|${r.relation}`));
  const out: RelationSuggestedEvent[] = [];
  for (const r of parseBlocks(result.text).relations) {
    if (out.length >= MAX_RELATED) break;
    const from = byName.get(r.from.trim().toLowerCase());
    const to = byName.get(r.to.trim().toLowerCase());
    if (from === undefined || to === undefined || from === to) continue;
    if (!CONCEPT_RELATIONS.includes(r.kind as ConceptRelation)) continue;
    const kind = r.kind as ConceptRelation;
    if (taken.has(`${from}|${to}|${kind}`)) continue;
    const rests = [...new Set(r.rests.flatMap((l) => (label.has(l) ? [label.get(l)!] : [])))];
    if (rests.length === 0) continue;
    taken.add(`${from}|${to}|${kind}`);
    out.push({
      id: makeId(),
      ts: now(),
      actor: "persona:concept-suggester",
      projectId: input.projectId,
      model: result.model,
      modelVersion: result.modelVersion,
      ...providerField(result),
      ...voiceRetryField(result),
      type: "relation-suggested",
      relationId: makeId(),
      from,
      to,
      relation: kind,
      claim: r.claim,
      ...(r.conditions === "" ? {} : { conditions: r.conditions }),
      statementIds: [],
      statements: [],
      source: { kind: "relate" },
      restsOn: rests.map((statementId) => ({ kind: "statement" as const, statementId })),
      ...(r.why === "" ? {} : { whyItMatters: r.why }),
    });
  }
  return out;
}
