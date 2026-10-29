/**
 * One suggestion pass, from reading the record to appending (M63, ISC-610;
 * M67, ISC-631, ISC-633, ISC-634).
 *
 * Shared by the places that ask: a step's save, the data read, and the pass that
 * proposes homes for statements still to place. Each reads the project as it
 * stands now, asks the suggester, validates what comes back and appends it, so a
 * refused event never reaches History and every caller counts the same thing.
 */

import { assertValidEvent, type ConceptSource, type LedgerEvent } from "../ledger/events.ts";
import type { InferenceClient } from "../inference/types.ts";
import type { ProjectBrief } from "../state/projects.ts";
import type { Chunk } from "../state/chunks.ts";
import { projectOntology } from "../ontology/projection.ts";
import { studyContext } from "../interview/studyContext.ts";
import { pendingWindow, queueLine, suggestConcepts } from "./suggest.ts";
import { projectConcepts } from "./projection.ts";
import { lookForSync } from "./door.ts";
import { numberWord } from "./vocabulary.ts";
import { relateConcepts } from "./relate.ts";
import { argumentBasis, argumentEvent, writeWhyLines } from "./why.ts";
import { savedSummariesAt, unsurfacedTurns } from "./chat.ts";
import type { SurfacingEvent } from "../ledger/events.ts";

export interface SuggestionRun {
  readonly projectId: string;
  readonly brief: ProjectBrief;
  readonly source: ConceptSource;
  readonly text?: string;
  readonly chunks?: readonly Chunk[];
  /** For a pass of proposals: read again the statements an earlier pass found no home for. */
  readonly again?: boolean;
  readonly readEvents: (projectId: string) => Promise<readonly LedgerEvent[]>;
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<unknown>;
}

/** What one pass suggested, by kind. */
export interface SuggestionCounts {
  readonly concepts: number;
  readonly relations: number;
  readonly statements: number;
  /** Statements a pass of proposals gave a home to. */
  readonly homes: number;
  /** Suggestions past the tab's cap after this pass, waiting their turn (M74b). */
  readonly queued?: number;
}

/** Suggest and append. Returns what Abductive suggested, by kind. */
export async function runSuggestionCounts(run: SuggestionRun, client: InferenceClient): Promise<SuggestionCounts> {
  const events = await run.readEvents(run.projectId);
  const graph = projectOntology(events, run.projectId);
  const suggested = await suggestConcepts(
    {
      projectId: run.projectId,
      events,
      graph,
      context: studyContext(run.brief, graph),
      source: run.source,
      text: run.text ?? "",
      ...(run.chunks === undefined ? {} : { chunks: run.chunks }),
      ...(run.again === undefined ? {} : { again: run.again }),
    },
    client,
  );
  /* A read of the data can bring a passage behind a concept already in the
     ontology only through a decision, so no field line settles here; the sync
     runs anyway so the list and the ontology agree after every append. */
  const written = [...suggested, ...lookForSync(events, suggested, run.projectId, "system")];
  for (const e of written) assertValidEvent(e);
  if (written.length > 0) await run.appendAll(written);
  /* M74b, ISC-665: what the tab holds back after this pass. */
  const after = [...events, ...written];
  const queued = pendingWindow(projectConcepts(after, run.projectId, projectOntology(after, run.projectId))).queued;
  return {
    queued,
    concepts: suggested.filter((e) => e.type === "concept-suggested").length,
    relations: suggested.filter((e) => e.type === "relation-suggested").length,
    statements: suggested.filter((e) => e.type === "statement-suggested").length,
    homes: suggested.reduce((n, e) => (e.type === "homes-proposed" ? n + e.proposals.length : n), 0),
  };
}

/* ── M93: Surface concepts and relationships (ISC-755 to ISC-760) ───────── */

export interface SurfacingRunInput {
  readonly projectId: string;
  readonly brief: ProjectBrief;
  /** A station id, or "framing" for Starting point. */
  readonly place: string;
  readonly readEvents: (projectId: string) => Promise<readonly LedgerEvent[]>;
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<unknown>;
  readonly clock?: { readonly now?: () => number; readonly makeId?: () => string };
}

/** What one press surfaced, by kind, and how many items Abductive left out. */
export interface SurfacingCounts extends SuggestionCounts {
  readonly dropped: number;
}

/**
 * One press of Surface concepts and relationships: read both sides of the
 * step's chat since the last surfacing there, with the saved summary, ask the
 * suggester, and append the researcher's `surfacing` event first and the
 * model's suggestions after it, in one append. Nothing is written when the
 * model call fails, so the press can be made again over the same turns.
 */
export async function runSurfacing(run: SurfacingRunInput, client: InferenceClient): Promise<SurfacingCounts> {
  const now = run.clock?.now ?? (() => Date.now());
  const makeId = run.clock?.makeId ?? (() => crypto.randomUUID());
  const events = await run.readEvents(run.projectId);
  const turns = unsurfacedTurns(events, run.projectId, run.place);
  const zero: SurfacingCounts = { concepts: 0, relations: 0, statements: 0, homes: 0, dropped: 0 };
  if (!turns.some((t) => t.who === "researcher")) return zero;
  const summaries = savedSummariesAt(events, run.projectId, run.place);
  const surfacing: SurfacingEvent = {
    id: makeId(),
    ts: now(),
    actor: "human",
    projectId: run.projectId,
    type: "surfacing",
    station: run.place,
    turnIds: turns.map((t) => t.id),
    summaryIds: summaries.map((t) => t.id),
  };
  const graph = projectOntology(events, run.projectId);
  const suggested = await suggestConcepts(
    {
      projectId: run.projectId,
      events,
      graph,
      context: studyContext(run.brief, graph),
      source: { kind: "chat", station: run.place, turnIds: [...turns, ...summaries].map((t) => t.id), surfacingId: surfacing.id },
      text: "",
      turns: [...turns, ...summaries],
      ...(run.clock === undefined ? {} : { clock: run.clock }),
    },
    client,
  );
  const after = [...events, surfacing];
  const written = [surfacing, ...suggested, ...lookForSync(after, suggested, run.projectId, "system")];
  for (const e of written) assertValidEvent(e);
  await run.appendAll(written);
  return {
    concepts: suggested.filter((e) => e.type === "concept-suggested").length,
    relations: suggested.filter((e) => e.type === "relation-suggested").length,
    statements: suggested.filter((e) => e.type === "statement-suggested").length,
    homes: 0,
    dropped: suggested.filter((e) => e.type === "suggestion-dropped").length,
  };
}

/** Suggest and append. Returns how many concepts and relations Abductive suggested. */
export async function runSuggestion(run: SuggestionRun, client: InferenceClient): Promise<number> {
  const c = await runSuggestionCounts(run, client);
  return c.concepts + c.relations;
}

const counted = (n: number, one: string, many: string) => `${numberWord(n)} ${n === 1 ? one : many}`;

/**
 * The line a place prints after a pass, naming the tab where the suggestions
 * are. A number is the M63 count of concepts.
 */
export function suggestedLine(count: number | SuggestionCounts): string {
  const c: SuggestionCounts = typeof count === "number" ? { concepts: count, relations: 0, statements: 0, homes: 0 } : count;
  const parts = [
    ...(c.concepts > 0 ? [counted(c.concepts, "concept", "concepts")] : []),
    ...(c.relations > 0 ? [counted(c.relations, "relation", "relations")] : []),
    ...(c.statements > 0 ? [counted(c.statements, "statement with a home", "statements, each with a home")] : []),
  ];
  if (parts.length === 0) return "Abductive read this and left your suggestions as they were.";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const many = c.concepts + c.relations + c.statements > 1;
  const queue = queueLine(c.queued ?? 0);
  return `Abductive suggested ${list}. Review the ${many ? "suggestions" : "suggestion"} on the Emerging project ontology tab.${queue === null ? "" : ` ${queue}`}`;
}

/* ── M82: Relate concepts, Why it matters, The argument so far ───────────── */

export interface PassRun {
  readonly projectId: string;
  readonly brief: ProjectBrief;
  readonly readEvents: (projectId: string) => Promise<readonly LedgerEvent[]>;
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<unknown>;
}

async function appendChecked(run: PassRun, written: readonly LedgerEvent[]): Promise<void> {
  for (const e of written) assertValidEvent(e);
  if (written.length > 0) await run.appendAll(written);
}

/**
 * Relate concepts (ISC-694): the relations Abductive proposes among the
 * accepted concepts, appended as suggestions with the field lines brought up
 * to date. Returns how many it suggested.
 */
export async function runRelate(run: PassRun & { readonly focus?: string }, client: InferenceClient): Promise<number> {
  const events = await run.readEvents(run.projectId);
  const graph = projectOntology(events, run.projectId);
  const suggested = await relateConcepts(
    { projectId: run.projectId, events, graph, context: studyContext(run.brief, graph), ...(run.focus === undefined ? {} : { focus: run.focus }) },
    client,
  );
  await appendChecked(run, [...suggested, ...lookForSync(events, suggested, run.projectId, "system")]);
  return suggested.length;
}

/** Why it matters (ISC-695): a line for each accepted card without one. Returns how many it wrote. */
export async function runWhyLines(run: PassRun, client: InferenceClient): Promise<number> {
  const events = await run.readEvents(run.projectId);
  const graph = projectOntology(events, run.projectId);
  const written = await writeWhyLines({ projectId: run.projectId, events, graph, context: studyContext(run.brief, graph) }, client);
  await appendChecked(run, written);
  return written.length;
}

/**
 * The argument so far (ISC-695), rewritten when the accepted cards have moved
 * since the last one. Returns whether Abductive wrote a new paragraph.
 */
export async function runArgument(run: PassRun, client: InferenceClient): Promise<boolean> {
  const events = await run.readEvents(run.projectId);
  const view = projectConcepts(events, run.projectId, projectOntology(events, run.projectId));
  if (view.accepted.length === 0 || view.argument?.basis === argumentBasis(view)) return false;
  const event = await argumentEvent({ projectId: run.projectId, brief: run.brief, view }, client);
  if (event === null) return false;
  await appendChecked(run, [event]);
  return true;
}
