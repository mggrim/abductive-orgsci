/**
 * Abductive suggests concepts, relations and statements (M63, ISC-610; M67,
 * ISC-631, ISC-633, ISC-634).
 *
 * Three occasions, one generator. After the researcher saves a summary at a
 * step, Abductive reads that summary; after a read of their data, it reads their
 * own passages; and for a project whose statements have no home yet, it reads
 * those statements and proposes a home for each. Each occasion yields at most
 * three concept suggestions and at most three relation suggestions, and every
 * one lands in the tab to be accepted, refined or rejected. Nothing joins the
 * ontology here.
 *
 * From M67 every statement arrives with a home (the owner, 2026-10-02): a
 * statement read from a summary or the data is a suggestion of its own, placed
 * at a concept or relation in the ontology or at one suggested beside it; a
 * statement already in the project gets a proposed home in a `homes-proposed`
 * event.
 *
 * The draft rule of every suggestion Abductive makes stands: the name, the
 * definition and the claim come from the researcher's words, and where their
 * words never said the thing the text carries `[...]` rather than an invented
 * clause.
 */

import type {
  ConceptRelation,
  ConceptSource,
  ConceptSuggestedEvent,
  HomesProposedEvent,
  LedgerEvent,
  RelationSuggestedEvent,
  StatementHome,
  SuggestionDroppedEvent,
  StatementSuggestedEvent,
  SuggestedRelation,
} from "../ledger/events.ts";
import { CONCEPT_RELATIONS } from "../ledger/events.ts";
import type { InferenceClient } from "../inference/types.ts";
import { providerField } from "../inference/types.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import type { Chunk } from "../state/chunks.ts";
import { dataOnly } from "../state/chunks.ts";
import { PROSE_CONTRACT } from "../personas/voice.ts";
import { completeInVoice, voiceRetryField } from "../inference/voiceRetry.ts";
import { renderStudyContext, type StudyContext } from "../interview/studyContext.ts";
import { MAX_PASSAGES_IN_PROMPT, MIN_ANSWER_CHARS, isDeclined } from "../interview/glean.ts";
import { projectConcepts, type ProjectOntologyView } from "./projection.ts";
import { projectProposals } from "../proposals/projection.ts";
import { RELATION_PHRASE, relationSentence } from "./vocabulary.ts";
import { NAME_CONTRACT, NAME_LINE, bundleReason, splitRequest } from "./conceptName.ts";
import type { ChatTurn } from "./chat.ts";

/**
 * Why a suggestion from the chat was left out (M93, ISC-757): it named no turn,
 * or a turn that isn't in the chat the pass read, so whose words it is can't be
 * worked out. History shows the drop with this reason.
 */
export const CHAT_DROP_REASON = "it named turns that aren't in the chat that Abductive considered";

/** The owner's cap: at most three concept suggestions, and three relation suggestions, per event. */
export const MAX_SUGGESTED = 3;

/** The statements one summary or data read may suggest, each with its home. */
export const MAX_STATEMENTS = 9;

/** How many statements to place one pass lists in one call. */
export const MAX_GROUPED = 60;

export interface ParsedConcept {
  readonly name: string;
  readonly definition: string;
  readonly properties: readonly string[];
  readonly relations: readonly { readonly relation: string; readonly to: string }[];
  readonly statements: readonly string[];
  readonly numbers: readonly number[];
  readonly chunkIds: readonly string[];
  /** The passage each statement cites first, by its position in `statements`. */
  readonly statementChunks: readonly (string | undefined)[];
  /** M82, ISC-695: why the concept matters, or "" when the block carries no WHY line. */
  readonly why: string;
  /** M93, ISC-757: the labels on the block's TURNS line (t1, s1), for a surfacing from the chat. */
  readonly turns: readonly string[];
  /** The turn labels each statement cites, by its position in `statements`. */
  readonly statementTurns: readonly (readonly string[])[];
}

export interface ParsedRelation {
  readonly from: string;
  readonly kind: string;
  readonly to: string;
  readonly claim: string;
  readonly conditions: string;
  /** The links the relation rests on, by their labels in the prompt (L1, L2). */
  readonly links: readonly string[];
  readonly statements: readonly string[];
  readonly numbers: readonly number[];
  readonly chunkIds: readonly string[];
  readonly statementChunks: readonly (string | undefined)[];
  /** M82, ISC-695: why the relation matters, or "". */
  readonly why: string;
  /** M82, ISC-694: the labels of the statements it rests on (S1, S2), for the Relate concepts pass. */
  readonly rests: readonly string[];
  readonly turns: readonly string[];
  readonly statementTurns: readonly (readonly string[])[];
}

/** A block that places statements at a home already in the ontology. */
export interface ParsedHome {
  readonly home: string;
  readonly statements: readonly string[];
  readonly numbers: readonly number[];
  readonly chunkIds: readonly string[];
  readonly statementChunks: readonly (string | undefined)[];
  readonly turns: readonly string[];
  readonly statementTurns: readonly (readonly string[])[];
}

export interface ParsedBlocks {
  readonly concepts: readonly ParsedConcept[];
  readonly relations: readonly ParsedRelation[];
  readonly homes: readonly ParsedHome[];
}

const CHUNK_REF = /\[\[chunk:([^\]\s]+)\]\]/g;
/* M93, ISC-757: a statement from the chat ends with the turns it came from. */
const TURN_REF = /\[\[turn:([^\]]+)\]\]/gi;
const turnLabels = (value: string) =>
  value
    .split(/[,\s]+/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => /^[ts]\d+$/.test(l));

function fields(raw: string) {
  const one = new Map<string, string>();
  const statements: string[] = [];
  const statementChunks: (string | undefined)[] = [];
  const numbers: number[] = [];
  const chunkIds: string[] = [];
  const properties: string[] = [];
  const relations: { relation: string; to: string }[] = [];
  const turns: string[] = [];
  const statementTurns: string[][] = [];
  for (const line of raw.split("\n")) {
    const m = /^\s*([A-Z]+)\s*:\s*(.*)$/.exec(line);
    if (m === null) continue;
    const key = m[1] ?? "";
    const value = (m[2] ?? "").trim();
    if (key === "PROPERTIES") properties.push(...value.split(";").map((p) => p.trim()).filter((p) => p !== ""));
    else if (key === "RELATION") {
      const [relation, to] = value.split("|").map((p) => p.trim());
      if (relation !== undefined && to !== undefined && to !== "") relations.push({ relation, to });
    } else if (key === "TURNS") {
      turns.push(...turnLabels(value));
    } else if (key === "STATEMENT") {
      const cited = [...value.matchAll(CHUNK_REF)].map((c) => c[1] ?? "");
      chunkIds.push(...cited);
      const fromTurns = [...value.matchAll(TURN_REF)].flatMap((c) => turnLabels(c[1] ?? ""));
      const said = value.replace(CHUNK_REF, "").replace(TURN_REF, "").replace(/\s+/g, " ").trim();
      if (said !== "") {
        statements.push(said);
        statementChunks.push(cited[0]);
        statementTurns.push(fromTurns);
      }
    } else if (key === "STATEMENTS") {
      for (const n of value.split(/[,\s]+/)) if (/^\d+$/.test(n)) numbers.push(Number(n));
    } else if (!one.has(key)) one.set(key, value);
  }
  return { one, statements, statementChunks, numbers, chunkIds, properties, relations, turns, statementTurns };
}

/**
 * Blocks separated by a line holding only `---`. A block with NAME is a
 * concept, one with FROM is a relation, one with HOME places statements at a
 * concept or relation already in the ontology; any other block is dropped.
 */
export function parseBlocks(text: string): ParsedBlocks {
  const concepts: ParsedConcept[] = [];
  const relations: ParsedRelation[] = [];
  const homes: ParsedHome[] = [];
  for (const raw of text.split(/^\s*---\s*$/m)) {
    const f = fields(raw);
    const name = f.one.get("NAME") ?? "";
    const from = f.one.get("FROM") ?? "";
    const home = f.one.get("HOME") ?? "";
    const shared = { statements: f.statements, numbers: f.numbers, chunkIds: f.chunkIds, statementChunks: f.statementChunks, turns: f.turns, statementTurns: f.statementTurns };
    if (name !== "") {
      const definition = f.one.get("DEFINITION") ?? "";
      concepts.push({ name, definition: definition === "" ? "[...]" : definition, properties: f.properties, relations: f.relations, why: whyLine(f.one.get("WHY")), ...shared });
    } else if (from !== "") {
      const claim = f.one.get("CLAIM") ?? "";
      relations.push({
        from,
        kind: f.one.get("KIND") ?? "",
        to: f.one.get("TO") ?? "",
        claim: claim === "" ? "[...]" : claim,
        conditions: f.one.get("CONDITIONS") ?? "",
        links: (f.one.get("LINK") ?? "").split(/[,\s]+/).map((l) => l.trim().toLowerCase()).filter((l) => /^l\d+$/.test(l)),
        why: whyLine(f.one.get("WHY")),
        rests: (f.one.get("RESTS") ?? "").split(/[,\s]+/).map((l) => l.trim().toLowerCase()).filter((l) => /^s\d+$/.test(l)),
        ...shared,
      });
    } else if (home !== "") {
      homes.push({ home, ...shared });
    }
  }
  return { concepts, relations, homes };
}

/**
 * A WHY line held to its two sentences (M82, ISC-695): the owner asked for one
 * or two, and a longer line is cut at the second. "" when the block has none or
 * the line is a gap marker alone.
 */
export function whyLine(text: string | undefined): string {
  const said = (text ?? "").trim();
  if (said === "" || /^\[\.\.\.\]\.?$/.test(said)) return "";
  return said
    .split(/(?<=[.!?]["\u201d]?)\s+(?=["\u201c]?[A-Z])/)
    .slice(0, 2)
    .join(" ");
}

/** The concept blocks alone, as M63 read them. */
export function parseConceptBlocks(text: string): readonly ParsedConcept[] {
  return parseBlocks(text).concepts;
}

/** The offer to group: claims exist, and no concept has been suggested, accepted or written yet. */
export function groupingOffered(view: ProjectOntologyView): boolean {
  return view.toPlace.length > 0 && view.concepts.size === 0;
}

/** A statement or a waiting tray claim, as a pass of proposals lists it. */
export interface ToRead {
  readonly id: string;
  readonly text: string;
  /** A claim from the papers or the rival writer that the researcher has not decided yet. */
  readonly waiting: boolean;
}

/**
 * What a pass of proposals reads: the statements still to place, then the
 * claims still waiting in the tray (the lead's ruling, M67), each one that no
 * earlier pass has read, or with `again`, each one without a home yet.
 */
export function toRead(events: readonly LedgerEvent[], projectId: string, view: ProjectOntologyView, again = false): readonly ToRead[] {
  const statements = statementsToRead(view, again).map((s) => ({ id: s.id, text: s.text, waiting: false }));
  const waiting = projectProposals(events, projectId)
    .pending.filter((p) => p.edge === undefined)
    .filter((p) => (again ? !view.proposalHomes.has(p.id) : !view.homesRead.has(p.id)))
    .map((p) => ({ id: p.id, text: p.title, waiting: true }));
  return [...statements, ...waiting];
}

/** The statements a pass of proposals should read: still to place, and not read by an earlier pass. */
/* M75, ISC-669 (the lead's ruling B): the statements to place only; a paper's
   claim and a rival are not statements to place. */
export function statementsToRead(view: ProjectOntologyView, again = false): readonly ProjectOntologyView["toPlace"][number][] {
  return view.toPlace.filter((s) => again ? !view.homes.has(s.id) : !view.homesRead.has(s.id));
}

function system(source: ConceptSource): string {
  const chat = source.kind === "chat";
  const from =
    source.kind === "summary"
      ? "a summary the researcher has just saved at one step of their design"
      : source.kind === "data"
        ? "passages of the researcher's own early data: transcripts, field notes or memos they collected"
        : chat
          ? "the chat between the researcher and Abductive at one step of their design, both sides, with the summary they saved there"
          : "the statements already in their project, which they accepted one at a time and which still wait for a concept or a relation";
  const statementLine =
    source.kind === "grouping"
      ? "STATEMENTS: <the numbers of the listed statements that belong here, comma separated>"
      : source.kind === "data"
        ? "STATEMENT: <one statement in their words, ending with the passage it came from as [[chunk:ID]], using an id exactly as given>"
        : chat
          ? "STATEMENT: <one statement, ending with the turns it came from as [[turn:T2]] or [[turn:T2, S1]], using labels exactly as given>"
          : "STATEMENT: <one statement in their words>";
  /* M93, ISC-757: every block from the chat names the turns it draws on. */
  const turnsLine = chat ? ["TURNS: <the labels of every turn it draws on, such as T2, T5, S1, exactly as given>"] : [];
  return [
    "# Role",
    `You suggest concepts and relations for a researcher's emerging project ontology, from ${from}. The ontology comes before coding: it is the set of concepts the researcher will look for and ask about in the field, each with a definition and the properties that vary, and the relations between concepts, each with a one-sentence claim. You suggest; the researcher accepts, refines or rejects every one.`,
    "",
    "## Every statement has a home",
    "Each statement you write or list sits under exactly one home: a concept, or a relation between two concepts. The home is a concept or relation already in their ontology, or one you suggest in the same reply. Put a statement under the concept it is about; put it under a relation when it says how one concept bears on another.",
    ...(source.kind === "grouping"
      ? [
          "Give every numbered statement exactly one home, all of them. Where a statement fits none of the concepts and relations in their ontology, suggest a new concept or a new relation for it in this reply, within the limits below, and group statements under the homes you suggest. A reply that leaves a statement without a home is incomplete.",
        ]
      : []),
    "",
    "## Draft rules",
    ...(source.kind === "summary"
      ? [
          `Take every name, definition, claim and statement from the summary they saved at the ${source.station} step. The rest of their project is there to orient you: do not take wording from it, so that each suggestion marked as from this summary is from this summary.`,
        ]
      : source.kind === "data"
        ? ["Take every statement from their passages, and cite the passage that it came from. Do not take wording from their answers at the steps."]
        : chat
          ? [
              "Take every name, definition, claim and statement from the turns listed under the chat, both the researcher's and Abductive's, and from the summary they saved there. The rest of their project is there to orient you: do not take wording from it.",
              "Name on a TURNS line every turn that a concept or a relation draws on, by its label exactly as given, and end each statement with the turns it came from. Abductive works out whose words each suggestion came from by looking at the turns you name, so name each turn that the wording came from, and only those turns.",
            ]
          : []),
    "Do not restate a sentence of their summaries word for word as a statement, and do not suggest a statement that is already in their project or already suggested.",
    /* M90, ISC-730 (the owner, 2026-10-14): a concept is one noun or gerund,
       and the relations carry the joins. */
    `${chat ? "Use only the words of the chat and the summary." : "Use only their words."} ${NAME_CONTRACT} The definition says what the concept is in their setting, close to their wording. A relation's claim is one sentence in their words that says how the first concept bears on the second, for example: Longer office-hours slots lead to higher command scores.`,
    "Where their words leave out something a definition or a claim needs, write [...] in its place. Do not supply the standard theoretical label, resolve their uncertainty, or finish a thought they left open.",
    "A property is an aspect of the concept that varies from case to case. Name it only; how it varies is theirs to say.",
    "",
    "## How many",
    `At most ${MAX_SUGGESTED} new concepts and at most ${MAX_SUGGESTED} new relations, and fewer is normal. Write a block only for a concept or relation that you would defend, and do not suggest a concept or relation already listed as in their ontology or waiting.`,
    "",
    "## Relations",
    "A relation runs from one concept to another, each named exactly as listed in their ontology or as you name it in this reply. Use only these five kinds:",
    ...CONCEPT_RELATIONS.map((r) => `- ${r}: ${RELATION_PHRASE[r]}`),
    /* M82, ISC-694 (the owner, 2026-10-04): the ontology grew as dyads, because
       each pass related only the concepts of its own batch. */
    "Relate each new concept to at least one concept already in their ontology where their words support the link, within the limit on relations: write a relation block whose FROM or TO is a concept listed as in their ontology. A chain is welcome (one concept leads to a second, and the second leads to a third), and so is a condition (one concept is a condition for another). Where their words connect a new concept to none of the others, leave it unrelated; do not invent a link.",
    "",
    "## Why it matters",
    "Give each new concept and each new relation a WHY line: one or two sentences, to the researcher as \"you\", on what the concept or relation does for their argument about the puzzle, and what their design loses without it. Ground it in their puzzle, the expectation it bears on and their own words. Where their words don't yet show what it does for the argument, write [...] for that part.",
    "",
    "## Output format, strictly",
    "Blocks separated by a line containing only '---'. Three kinds of block.",
    "",
    "A new concept:",
    NAME_LINE,
    "DEFINITION: <one or two sentences, their words, [...] for anything they did not say>",
    "PROPERTIES: <names separated by semicolons, or leave the line out>",
    "WHY: <one or two sentences on what this concept does for their argument and what the design loses without it>",
    ...turnsLine,
    `${statementLine}   (repeat the line, or leave it out)`,
    "",
    "A new relation:",
    "FROM: <a concept name>",
    "KIND: <one of the five>",
    "TO: <a concept name>",
    "CLAIM: <one sentence in their words, [...] for anything they did not say>",
    "CONDITIONS: <when they expect it to apply, in their words, or leave the line out>",
    ...(source.kind === "grouping" ? ["LINK: <the labels of the links it rests on, such as L2, or leave the line out>"] : []),
    "WHY: <one or two sentences on what this relation does for their argument and what the design loses without it>",
    ...turnsLine,
    `${statementLine}   (repeat the line, or leave it out)`,
    "",
    "Statements for a home already in their ontology:",
    "HOME: <a concept name exactly as listed, or a relation's label such as R2>",
    `${statementLine}   (repeat the line)`,
    "",
    PROSE_CONTRACT,
  ].join("\n");
}

export interface SuggestInput {
  readonly projectId: string;
  readonly events: readonly LedgerEvent[];
  readonly graph: OntologyGraph;
  readonly context: StudyContext;
  readonly source: ConceptSource;
  /** The summary saved, for a summary; empty otherwise. */
  readonly text: string;
  /** The project's passages, for a read of the data. Papers are dropped here. */
  readonly chunks?: readonly Chunk[];
  /** For a pass of proposals: read the statements again that an earlier pass found no home for. */
  readonly again?: boolean;
  /** M93, ISC-756: for a surfacing, the chat's turns since the last one and the saved summaries, in order. */
  readonly turns?: readonly ChatTurn[];
  readonly clock?: { readonly now?: () => number; readonly makeId?: () => string };
}

export type SuggestionEvent =
  | ConceptSuggestedEvent
  | RelationSuggestedEvent
  | StatementSuggestedEvent
  | HomesProposedEvent
  | SuggestionDroppedEvent;

/**
 * The suggestions for one occasion, as events ready to append. An empty list
 * when there is nothing to read from, and then no call is made.
 */
export async function suggestConcepts(
  input: SuggestInput,
  client: InferenceClient,
): Promise<readonly SuggestionEvent[]> {
  const now = input.clock?.now ?? (() => Date.now());
  const makeId = input.clock?.makeId ?? (() => crypto.randomUUID());
  const view = projectConcepts(input.events, input.projectId, input.graph);
  const standing = [...view.concepts.values()];
  const inOntology = view.accepted;
  const taken = new Set(standing.map((c) => c.name.trim().toLowerCase()));
  const name = (id: string) => view.concepts.get(id)?.name ?? "";
  const liveRelations = view.acceptedRelations;

  const data = input.source.kind === "data" ? dataOnly(input.chunks ?? []).slice(0, MAX_PASSAGES_IN_PROMPT) : [];
  const listed = input.source.kind === "grouping" ? toRead(input.events, input.projectId, view, input.again === true).slice(0, MAX_GROUPED) : [];
  /* The lead's ruling (M67): the links that the researcher drew between two of
     the listed statements are evidence for a relation between the concepts
     that hold them, so the pass sees them, labelled, and a relation that rests
     on one names it. */
  const position = new Map(listed.map((s, i) => [s.id, i + 1] as const));
  const puzzleRelationOf = new Map(input.graph.relations.map((r) => [r.edgeId, r.relation] as const));
  const links = [...input.graph.edges.values()]
    .filter((e) => !e.retired && position.has(e.from) && position.has(e.to))
    .map((e, i) => ({ label: `l${i + 1}`, id: e.id, line: `L${i + 1}. Statement ${position.get(e.from)} ${puzzleRelationOf.get(e.id) ?? e.role.replace(/-/g, " ")} statement ${position.get(e.to)}` }));
  const linkId = new Map(links.map((l) => [l.label, l.id] as const));
  if (input.source.kind === "summary" && (input.text.trim().length < MIN_ANSWER_CHARS || isDeclined(input.text))) return [];
  if (input.source.kind === "data" && data.length === 0) return [];
  if (input.source.kind === "grouping" && listed.length === 0) return [];
  /* M93, ISC-756: the chat's turns, labelled T1, T2 for the conversation and S1
     for a saved summary, so a block can name the turns it draws on. */
  const chatTurns = input.source.kind === "chat" ? (input.turns ?? []) : [];
  if (input.source.kind === "chat" && !chatTurns.some((t) => t.who === "researcher" && t.kind === "turn")) return [];
  const turnLabel = new Map<string, string>();
  let tn = 0;
  let sn = 0;
  for (const t of chatTurns) turnLabel.set(t.id, t.kind === "summary" ? `s${(sn += 1)}` : `t${(tn += 1)}`);
  const turnOfLabel = new Map([...turnLabel].map(([id, label]) => [label, id] as const));
  const chatPlace = input.source.kind === "chat" ? input.source.station : "";

  const material =
    input.source.kind === "summary"
      ? ["# The summary they saved", `At the ${input.source.station} step:`, input.text.trim()]
      : input.source.kind === "chat"
        ? [
            `# The chat at ${chatPlace === "framing" ? "Starting point" : `the ${chatPlace} step`}, both sides, in order`,
            ...chatTurns
              .filter((t) => t.kind === "turn")
              .map((t) => `${(turnLabel.get(t.id) ?? "").toUpperCase()}. (${t.who === "researcher" ? "The researcher" : "Abductive"}) ${t.text.replace(/\s+/g, " ").trim()}`),
            ...(chatTurns.some((t) => t.kind === "summary")
              ? [
                  "",
                  "# The summary they saved at this step",
                  ...chatTurns
                    .filter((t) => t.kind === "summary")
                    .map((t) => `${(turnLabel.get(t.id) ?? "").toUpperCase()}. (The researcher's saved summary) ${t.text.replace(/\s+/g, " ").trim()}`),
                ]
              : []),
          ]
      : input.source.kind === "data"
        ? ["# Their passages", ...data.map((c) => `[[chunk:${c.id}]] ${c.text.replace(/\s+/g, " ").trim()}`)]
        : [
            "# The statements in their project, numbered, each still to place",
            ...listed.map((s, i) => `${i + 1}. ${s.text}${s.waiting ? " (a suggestion still waiting for their decision)" : ""}`),
            ...(links.length === 0
              ? []
              : [
                  "",
                  "# Links they drew between these statements",
                  "A link is evidence for a relation between the concepts that hold its two statements: a statement that contradicts or rivals another suggests that their concepts contrast with each other. A relation that rests on a link names it on a LINK line.",
                  ...links.map((l) => l.line),
                ]),
          ];

  const relationLabel = new Map<string, string>(liveRelations.map((r, i) => [`r${i + 1}`, r.id]));
  const userMessage = [
    renderStudyContext(input.context),
    "",
    "# Concepts already in their ontology",
    inOntology.length === 0 ? "(none yet)" : inOntology.map((c) => `- ${c.name}: ${c.definition}`).join("\n"),
    "",
    "# Relations already in their ontology",
    liveRelations.length === 0
      ? "(none yet)"
      : liveRelations
          .map((r, i) => `R${i + 1}. ${relationSentence(name(r.from), r.relation, name(r.to))}${r.claim === "" ? "" : `: ${r.claim}`}`)
          .join("\n"),
    "",
    "# Concepts and relations already suggested or rejected, which you must not suggest again",
    [
      ...standing.filter((c) => c.status !== "accepted").map((c) => `- ${c.name}`),
      ...[...view.relations.values()]
        .filter((r) => r.status !== "accepted")
        .map((r) => `- ${relationSentence(name(r.from), r.relation, name(r.to))}`),
    ].join("\n") || "(none)",
    "",
    ...material,
  ].join("\n");

  /* M69, ISC-644: PROSE_CONTRACT carries the owner's rules, and a reply that
     breaks one goes back once for the offending sentences. */
  const firstAsked = [{ role: "user" as const, content: userMessage }];
  const first = await completeInVoice(client, { system: system(input.source), messages: firstAsked });

  const byName = new Map(inOntology.map((c) => [c.name.trim().toLowerCase(), c.id] as const));
  const dataIds = new Set(data.map((c) => c.id));
  const cite = (ids: readonly string[]) => [...new Set(ids.filter((id) => dataIds.has(id)))];
  /* M74b, ISC-665: a block that groups only claims still waiting from the
   * papers is marked from the papers. */
  const fromPapers = (numbers: readonly number[]) =>
    numbers.length > 0 && numbers.every((k) => listed[k - 1]?.waiting === true);
  const sourceOf = (ids: readonly string[], numbers: readonly number[] = []): ConceptSource =>
    input.source.kind === "data"
      ? { kind: "data", chunkIds: cite(ids) }
      : input.source.kind === "grouping" && fromPapers(numbers)
        ? { kind: "grouping", from: "papers" }
        : input.source;
  const listedIds = (numbers: readonly number[]) =>
    [...new Set(numbers.flatMap((n) => (listed[n - 1] === undefined ? [] : [listed[n - 1]!.id])))];

  const concepts: ConceptSuggestedEvent[] = [];
  const relations: RelationSuggestedEvent[] = [];
  const statements: StatementSuggestedEvent[] = [];
  const proposals = new Map<string, StatementHome>();
  const sayKey = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  /* M74b, ISC-665: a statement already in the project, or already suggested
   * under any home, is not suggested again; and a statement that is a sentence
   * of a saved summary word for word is the summary itself, not a statement
   * about it. */
  const said = new Set<string>([
    ...[...view.statements.values()].map((x) => sayKey(x.text)),
    ...input.events.flatMap((e) => (e.projectId === input.projectId && e.type === "statement-suggested" ? [sayKey(e.text)] : [])),
  ]);
  const summarySentences = new Set<string>(
    [...savedSummaries(input.events, input.projectId), ...(input.source.kind === "summary" ? [input.text] : [])]
      .flatMap((text) => text.split(/(?<=[.!?])\s+/))
      .map(sayKey)
      .filter((k) => k !== ""),
  );
  const grounded = (labels: readonly string[]) => [...new Set(labels.flatMap((l) => (linkId.has(l) ? [linkId.get(l)!] : [])))];
  const existingPairs = new Set([...view.relations.values()].map((r) => `${r.from}|${r.to}|${r.relation}`));
  const relationName = (id: string) =>
    concepts.find((c) => c.conceptId === id)?.name ?? view.concepts.get(id)?.name ?? "a concept";

  const dropped: SuggestionDroppedEvent[] = [];

  /* One reply, absorbed into the batch: its concepts and relations within the
     caps, and every statement it names at the first home a block gives it. A
     concept whose name carries more than one thing (M90, ISC-731) is held back
     and returned, for the caller to send back once to be split. */
  const absorb = (result: Awaited<ReturnType<InferenceClient["complete"]>>, split = false) => {
    const parsed = parseBlocks(result.text);
    const bundles: string[] = [];
    let added = 0;
    const envelope = () => ({
      id: makeId(),
      ts: now(),
      actor: "persona:concept-suggester" as const,
      projectId: input.projectId,
      model: result.model,
      modelVersion: result.modelVersion,
      ...providerField(result),
      ...voiceRetryField(result),
      ...(split ? { splitRetry: true as const } : {}),
    });
    /* M93, ISC-757: the turns a block from the chat names, as event ids, or
       null when it names none or one the pass didn't read; the item is then
       dropped, and the drop is on the record. */
    const drawnOf = (labels: readonly string[]): readonly string[] | null => {
      const ids = [...new Set(labels)].map((l) => turnOfLabel.get(l));
      if (ids.length === 0 || ids.some((id) => id === undefined)) return null;
      return ids as string[];
    };
    const drop = (name: string) =>
      dropped.push({ ...envelope(), type: "suggestion-dropped", name, reason: CHAT_DROP_REASON, source: input.source });
    const home = (
      block: {
        statements: readonly string[];
        numbers: readonly number[];
        statementChunks: readonly (string | undefined)[];
        turns: readonly string[];
        statementTurns: readonly (readonly string[])[];
      },
      at: StatementHome,
      from: ConceptSource,
    ) => {
      if (input.source.kind === "grouping") {
        for (const id of listedIds(block.numbers)) if (!proposals.has(id)) proposals.set(id, at);
        return;
      }
      block.statements.forEach((text, i) => {
        if (statements.length >= MAX_STATEMENTS) return;
        if (said.has(sayKey(text)) || summarySentences.has(sayKey(text))) return;
        const chunk = block.statementChunks[i];
        /* M74b: a statement read from the data cites a passage of the data. The
         * walk's Early data statements quoted the Context chat. */
        if (input.source.kind === "data" && (chunk === undefined || !dataIds.has(chunk))) return;
        const own = block.statementTurns[i] ?? [];
        const drawn = input.source.kind === "chat" ? drawnOf(own.length > 0 ? own : block.turns) : null;
        if (input.source.kind === "chat" && drawn === null) {
          drop(text);
          return;
        }
        said.add(sayKey(text));
        statements.push({
          ...envelope(),
          type: "statement-suggested",
          statementId: makeId(),
          text,
          home: at,
          source: from,
          ...(chunk !== undefined && dataIds.has(chunk) ? { chunkId: chunk } : {}),
          ...(drawn === null ? {} : { drawnFrom: drawn }),
        });
      });
    };

    for (const c of parsed.concepts) {
      if (concepts.length >= MAX_SUGGESTED) break;
      if (bundleReason(c.name) !== null) {
        bundles.push(c.name.trim());
        continue;
      }
      const name = c.name.trim().toLowerCase();
      if (taken.has(name)) continue;
      const conceptDrawn = input.source.kind === "chat" ? drawnOf(c.turns) : null;
      if (input.source.kind === "chat" && conceptDrawn === null) {
        drop(c.name.trim());
        continue;
      }
      taken.add(name);
      const rels: SuggestedRelation[] = [];
      for (const r of c.relations) {
        const to = byName.get(r.to.trim().toLowerCase());
        if (to === undefined || !CONCEPT_RELATIONS.includes(r.relation as ConceptRelation)) continue;
        rels.push({ relation: r.relation as ConceptRelation, to });
      }
      const conceptId = makeId();
      const source = sourceOf(c.chunkIds, c.numbers);
      concepts.push({
        ...envelope(),
        type: "concept-suggested",
        conceptId,
        name: c.name,
        definition: c.definition,
        properties: c.properties,
        relations: rels,
        statementIds: [],
        statements: [],
        source,
        ...(c.why === "" ? {} : { whyItMatters: c.why }),
        ...(conceptDrawn === null ? {} : { drawnFrom: conceptDrawn }),
      });
      byName.set(name, conceptId);
      added += 1;
      home(c, { kind: "concept", id: conceptId }, source);
    }

    for (const r of parsed.relations) {
      if (relations.length >= MAX_SUGGESTED) break;
      const from = byName.get(r.from.trim().toLowerCase());
      const to = byName.get(r.to.trim().toLowerCase());
      if (from === undefined || to === undefined || from === to) continue;
      if (!CONCEPT_RELATIONS.includes(r.kind as ConceptRelation)) continue;
      const kind = r.kind as ConceptRelation;
      if (existingPairs.has(`${from}|${to}|${kind}`)) continue;
      const relationDrawn = input.source.kind === "chat" ? drawnOf(r.turns) : null;
      if (input.source.kind === "chat" && relationDrawn === null) {
        drop(relationSentence(relationName(from), kind, relationName(to)));
        continue;
      }
      existingPairs.add(`${from}|${to}|${kind}`);
      const relationId = makeId();
      const source = sourceOf(r.chunkIds, r.numbers);
      relations.push({
        ...envelope(),
        type: "relation-suggested",
        relationId,
        from,
        to,
        relation: kind,
        claim: r.claim,
        ...(r.conditions === "" ? {} : { conditions: r.conditions }),
        ...(grounded(r.links).length === 0 ? {} : { grounds: grounded(r.links) }),
        statementIds: [],
        statements: [],
        source,
        ...(r.why === "" ? {} : { whyItMatters: r.why }),
        ...(relationDrawn === null ? {} : { drawnFrom: relationDrawn }),
      });
      // A relation in this batch is named B1, B2 when a later reply homes a statement under it.
      relationLabel.set(`b${relations.length}`, relationId);
      home(r, { kind: "relation", id: relationId }, source);
    }

    for (const h of parsed.homes) {
      const label = h.home.trim().toLowerCase();
      const relationId = relationLabel.get(label);
      const conceptId = byName.get(label);
      const at: StatementHome | undefined =
        relationId !== undefined ? { kind: "relation", id: relationId } : conceptId !== undefined ? { kind: "concept", id: conceptId } : undefined;
      if (at === undefined) continue;
      home(h, at, sourceOf(h.chunkIds));
    }
    return { envelope, bundles, added };
  };

  /* M90, ISC-731 and ISC-732 (the owner, 2026-10-14): a reply that names a
     concept with more than one thing in it goes back once, for those concepts
     only, with the instruction to split each into concepts and the relations
     that joined them. A name in the second answer that still carries more than
     one thing is dropped, and so is a concept the second answer leaves out; each
     drop is an event in History and a line in the tray. */
  const absorbSplit = async (
    result: Awaited<ReturnType<InferenceClient["complete"]>>,
    asked: readonly { role: "user" | "assistant"; content: string }[],
  ) => {
    const once = absorb(result);
    if (once.bundles.length === 0) return once.envelope;
    const second = await completeInVoice(client, {
      system: system(input.source),
      messages: [...asked, { role: "assistant", content: result.text }, { role: "user", content: splitRequest(once.bundles) }],
    });
    const after = absorb(second, true);
    const lost = after.bundles.length > 0 ? after.bundles : after.added === 0 ? once.bundles : [];
    for (const name of lost) {
      dropped.push({ ...after.envelope(), type: "suggestion-dropped", name, reason: bundleReason(name) ?? "left out of the second answer", source: input.source });
    }
    return after.envelope;
  };

  let envelope = await absorbSplit(first, firstAsked);

  /* The lead's ruling (M67): a pass of proposals is complete when every
     statement it read has a home. A reply that leaves one without is refused
     and the model is asked once more, for those statements only, with the
     homes of this batch named; what a second reply still leaves out waits for
     Suggest homes. */
  if (input.source.kind === "grouping") {
    const missing = listed.map((s, i) => ({ s, n: i + 1 })).filter(({ s }) => !proposals.has(s.id));
    if (missing.length > 0) {
      const batch = [
        ...concepts.map((c) => `- ${c.name}`),
        ...relations.map((r, i) => `B${i + 1}. ${relationSentence(relationName(r.from), r.relation, relationName(r.to))}`),
      ];
      const again = [
        `Your reply left ${missing.length === 1 ? "one statement" : `${missing.length} statements`} without a home: ${missing.map(({ n }) => n).join(", ")}.`,
        "Give each of them exactly one home. Use a concept or relation already in their ontology, one from your reply, or a new concept or relation where none of those fits, within the limits in your instructions.",
        batch.length === 0 ? "" : ["The homes in your reply:", ...batch].join("\n"),
        "Answer in the same format, with a HOME block for a home that already exists or that your reply suggested, naming a relation from your reply by its label such as B1.",
      ]
        .filter((l) => l !== "")
        .join("\n\n");
      const askedAgain = [
        { role: "user" as const, content: userMessage },
        { role: "assistant" as const, content: first.text },
        { role: "user" as const, content: again },
      ];
      const second = await completeInVoice(client, { system: system(input.source), messages: askedAgain });
      envelope = await absorbSplit(second, askedAgain);
    }
  }

  /* The homes pass records what it read, so a statement still without a home
     after the second reply is not read again on the next open; Suggest homes
     reads it again. */
  const homesEvent: HomesProposedEvent[] =
    input.source.kind === "grouping"
      ? [
          {
            ...envelope(),
            type: "homes-proposed",
            read: listed.map((s) => s.id),
            proposals: [...proposals].map(([statementId, at]) => ({ statementId, home: at })),
          },
        ]
      : [];
  return [...concepts, ...relations, ...statements, ...homesEvent, ...dropped];
}

/**
 * How many suggestions the tab shows at once (M74b, ISC-665): the owner's three
 * at a time, held across the tab rather than per pass. The walk ended with 21
 * concepts, 6 relations and 38 statements waiting at once.
 */
export const PENDING_CAP = { concepts: 3, relations: 3, statements: 6 } as const;

/** What the tab shows, and how many suggestions wait their turn behind it. */
export interface PendingWindow {
  readonly view: ProjectOntologyView;
  readonly queued: number;
}

/**
 * The pending suggestions the tab shows, oldest first, within the cap; the rest
 * stay on the record and wait their turn (M74b, ISC-665). A decision on one
 * frees its place and the next one shows. A relation or a statement whose home
 * waits in the queue waits with it, so every card on screen names cards that
 * are on screen.
 */
export function pendingWindow(view: ProjectOntologyView): PendingWindow {
  const concepts = view.suggested.slice(0, PENDING_CAP.concepts);
  const conceptsShown = new Set([...view.accepted, ...concepts].map((c) => c.id));
  const relations = view.suggestedRelations
    .filter((r) => conceptsShown.has(r.from) && conceptsShown.has(r.to))
    .slice(0, PENDING_CAP.relations);
  const homesShown = new Set([...conceptsShown, ...view.acceptedRelations.map((r) => r.id), ...relations.map((r) => r.id)]);
  /* M78b, ISC-681: a statement whose proposed home the researcher rejected
     comes back to place, with its home to choose; on the serendipity walk five
     waited in the queue behind a home that would never show. */
  const statements = view.suggestedStatements
    .filter((s) => homesShown.has(s.home.id) || homeRejected(view, s.home))
    .slice(0, PENDING_CAP.statements);
  const queued =
    view.suggested.length - concepts.length +
    (view.suggestedRelations.length - relations.length) +
    (view.suggestedStatements.length - statements.length);
  return {
    view: { ...view, suggested: concepts, suggestedRelations: relations, suggestedStatements: statements },
    queued,
  };
}

/** Whether a statement's proposed home is a concept or a relation that the researcher rejected (M78b). */
export function homeRejected(view: ProjectOntologyView, home: StatementHome): boolean {
  return home.kind === "concept"
    ? view.concepts.get(home.id)?.status === "rejected" || view.concepts.get(home.id)?.status === "retired"
    : view.relations.get(home.id)?.status === "rejected";
}

const QUEUE_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** The line that says suggestions wait their turn, or null when none do (M74b). */
export function queueLine(queued: number): string | null {
  if (queued <= 0) return null;
  const count = QUEUE_WORDS[queued] ?? String(queued);
  return `Abductive has ${count} more ${queued === 1 ? "suggestion" : "suggestions"} in the queue and shows the next when you decide one.`;
}

/** The latest saved answer at each step and at Starting point, from the record. */
function savedSummaries(events: readonly LedgerEvent[], projectId: string): readonly string[] {
  const latest = new Map<string, string>();
  for (const e of events) {
    if (e.projectId === projectId && e.type === "bound") latest.set(e.subject, e.statement);
  }
  return [...latest.values()];
}
