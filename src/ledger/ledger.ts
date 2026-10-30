/**
 * Ledger core — append + replay ONLY (ISC-2, ISC-3).
 *
 * This module deliberately exports no update, delete, or in-place mutation
 * API. Past events are immutable; the only write operation is appending a new
 * validated event, and all derived state is computed by the pure `replay`
 * function over the full event array. No module holds private domain state.
 */

import type { AttentionLayer, LedgerEvent, Verdict } from "./events.ts";
import { assertValidEvent } from "./events.ts";

// ---------------------------------------------------------------------------
// Append (pure)
// ---------------------------------------------------------------------------

/**
 * Pure append: validates `event` and returns a NEW frozen array with the
 * event added. The input array is never mutated. Duplicate event ids are
 * rejected — an id can enter the ledger exactly once.
 */
export function appendEvent(
  events: readonly LedgerEvent[],
  event: LedgerEvent,
): readonly LedgerEvent[] {
  assertValidEvent(event);
  if (events.some((e) => e.id === event.id)) {
    throw new Error(`Duplicate event id: ${event.id}, and the ledger is append-only`);
  }
  return Object.freeze([...events, Object.freeze({ ...event }) as LedgerEvent]);
}

// ---------------------------------------------------------------------------
// Replay (pure derived state)
// ---------------------------------------------------------------------------

export type ChallengeStatus = "open" | "adjudicated";

export interface ChallengeProjection {
  readonly challengeId: string;
  readonly text: string;
  readonly matrixCell?: string;
  readonly status: ChallengeStatus;
  /** Verdict of the latest adjudication, if any. */
  readonly verdict?: Verdict;
  /** Number of ledger events appended after the challenge (staleness input). */
  readonly eventsSince: number;
}

export interface FlagProjection {
  readonly matrixCell: string;
  readonly reason: string;
  readonly ts: number;
}

export interface DerivedState {
  readonly projectIds: readonly string[];
  readonly eventCount: number;
  readonly countsByType: Readonly<Record<LedgerEvent["type"], number>>;
  readonly challenges: readonly ChallengeProjection[];
  readonly openChallengeIds: readonly string[];
  readonly flags: readonly FlagProjection[];
  /** Flag counts per matrix cell (bias-flag panel projection). */
  readonly flagCountsByCell: Readonly<Record<string, number>>;
  /** Distinct chunk ids touched, per attention layer. */
  readonly attentionByLayer: Readonly<Record<AttentionLayer, readonly string[]>>;
  /** Adjudication verdicts in ledger order (streak-signal input). */
  readonly adjudicationVerdicts: readonly Verdict[];
  readonly revealCount: number;
  readonly lastEventTs: number | null;
}

/**
 * Pure, deterministic replay: derives the full projection state from the
 * event array alone (ISC-3). Same events in, deep-equal state out — always.
 */
export function replay(events: readonly LedgerEvent[]): DerivedState {
  const countsByType: Record<LedgerEvent["type"], number> = {
    bound: 0,
    "brief-draft": 0,
    "puzzle-reading": 0,
    challenge: 0,
    "bias-scan": 0,
    flag: 0,
    attention: 0,
    response: 0,
    adjudication: 0,
    reveal: 0,
    "ontology-mutation": 0,
    proposal: 0,
    "proposal-adjudication": 0,
    "question-selection": 0,
    redirection: 0,
    refusal: 0,
    "dont-know": 0,
    "ask-differently": 0,
    "saturation-check": 0,
    "puzzle-collapse": 0,
    "lint-finding": 0,
    "finding-disposition": 0,
    "paper-fit": 0,
    "paper-bearing": 0,
    "document-removed": 0,
    export: 0,
    "concept-suggested": 0,
    "concept-accepted": 0,
    "concept-refined": 0,
    "concept-rejected": 0,
    "concept-property-set": 0,
    "concept-relation-set": 0,
    "concept-relation-removed": 0,
    "statement-attached": 0,
    "look-for-raised": 0,
    "look-for-settled": 0,
    "readiness-report": 0,
    "concept-flag": 0,
    "relation-suggested": 0,
    "relation-accepted": 0,
    "relation-refined": 0,
    "relation-rejected": 0,
    "relation-claim-set": 0,
    "relation-conditions-set": 0,
    "relation-statement-attached": 0,
    "homes-proposed": 0,
    "statement-suggested": 0,
    "statement-rejected": 0,
    "concept-retired": 0,
    "why-suggested": 0,
    "why-accepted": 0,
    "why-refined": 0,
    "argument-written": 0,
    "suggestion-dropped": 0,
    "why-rejected": 0,
    "argument-accepted": 0,
    surfacing: 0,
    "reading-accepted": 0,
    "draft-declined": 0,
    "property-rejected": 0,
    "help-asked": 0,
    "help-answered": 0,
  };

  const projectIds: string[] = [];
  const challengeOrder: string[] = [];
  const challengeText = new Map<string, { text: string; matrixCell?: string }>();
  const challengeIndex = new Map<string, number>(); // index in event stream
  const verdictByChallenge = new Map<string, Verdict>();
  const flags: FlagProjection[] = [];
  const flagCountsByCell: Record<string, number> = {};
  const attention: Record<AttentionLayer, string[]> = {
    retrieval: [],
    citation: [],
    human: [],
  };
  const adjudicationVerdicts: Verdict[] = [];

  events.forEach((event, i) => {
    countsByType[event.type] += 1;
    if (!projectIds.includes(event.projectId)) projectIds.push(event.projectId);

    switch (event.type) {
      case "challenge": {
        challengeOrder.push(event.id);
        const entry: { text: string; matrixCell?: string } = { text: event.text };
        if (event.matrixCell !== undefined) entry.matrixCell = event.matrixCell;
        challengeText.set(event.id, entry);
        challengeIndex.set(event.id, i);
        break;
      }
      case "adjudication": {
        adjudicationVerdicts.push(event.verdict);
        verdictByChallenge.set(event.challengeId, event.verdict);
        break;
      }
      case "flag": {
        flags.push({ matrixCell: event.matrixCell, reason: event.reason, ts: event.ts });
        flagCountsByCell[event.matrixCell] = (flagCountsByCell[event.matrixCell] ?? 0) + 1;
        break;
      }
      case "attention": {
        if (!attention[event.layer].includes(event.chunkId)) {
          attention[event.layer].push(event.chunkId);
        }
        break;
      }
      case "bound":
      case "response":
      case "reveal":
        break;
    }
  });

  const challenges: ChallengeProjection[] = challengeOrder.map((challengeId) => {
    const meta = challengeText.get(challengeId);
    const verdict = verdictByChallenge.get(challengeId);
    const idx = challengeIndex.get(challengeId) ?? 0;
    const projection: ChallengeProjection = {
      challengeId,
      text: meta?.text ?? "",
      status: verdict === undefined ? "open" : "adjudicated",
      eventsSince: events.length - 1 - idx,
      ...(meta?.matrixCell !== undefined ? { matrixCell: meta.matrixCell } : {}),
      ...(verdict !== undefined ? { verdict } : {}),
    };
    return projection;
  });

  const lastEvent = events[events.length - 1];

  return {
    projectIds,
    eventCount: events.length,
    countsByType,
    challenges,
    openChallengeIds: challenges
      .filter((c) => c.status === "open")
      .map((c) => c.challengeId),
    flags,
    flagCountsByCell,
    attentionByLayer: attention,
    adjudicationVerdicts,
    revealCount: countsByType.reveal,
    lastEventTs: lastEvent === undefined ? null : lastEvent.ts,
  };
}

// ---------------------------------------------------------------------------
// Stores (append + read only)
// ---------------------------------------------------------------------------

/**
 * Persistence boundary for the ledger. Deliberately append/read only —
 * no update or delete surface exists (ISC-2).
 */
export interface LedgerStore {
  append(event: LedgerEvent): Promise<void>;
  /**
   * Append a batch whole or not at all (M85, ISC-716). A conversation turn is a
   * question and Abductive's reply; written one transaction each, an abort of
   * the reply left the question open with no reply, and the turn could not be
   * asked again. Optional, so a store that has only `append` still serves.
   */
  appendAll?(events: readonly LedgerEvent[]): Promise<void>;
  /** Read all events in append order, optionally filtered by project. */
  readAll(projectId?: string): Promise<readonly LedgerEvent[]>;
}

/** In-memory store for tests and ephemeral sessions. */
export class InMemoryLedgerStore implements LedgerStore {
  #events: readonly LedgerEvent[] = Object.freeze([]);

  async append(event: LedgerEvent): Promise<void> {
    this.#events = appendEvent(this.#events, event);
  }

  readAll(projectId?: string): Promise<readonly LedgerEvent[]> {
    const all = this.#events;
    return Promise.resolve(
      projectId === undefined ? all : all.filter((e) => e.projectId === projectId),
    );
  }
}

// ---------------------------------------------------------------------------
// IndexedDB adapter (thin; ISC-6 groundwork)
// ---------------------------------------------------------------------------

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { errorName, oneAtATime, tryAgainOnAbort } from "./idbAgain.ts";

interface LedgerDB extends DBSchema {
  events: {
    key: number; // auto-increment append order
    value: LedgerEvent;
    indexes: { byProject: string; byEventId: string };
  };
}

const DB_NAME = "qual-design-ledger";
const DB_VERSION = 1;

/**
 * Thin IndexedDB-backed store. Uses an auto-increment key to preserve append
 * order and a unique index on event id to reject duplicates at the storage
 * layer. No update/delete pathway is exposed.
 */
export class IndexedDBLedgerStore implements LedgerStore {
  #db: Promise<IDBPDatabase<LedgerDB>>;
  /* M85, ISC-716: one readwrite transaction at a time (see `oneAtATime`). */
  #write = oneAtATime();

  constructor(dbName: string = DB_NAME) {
    this.#db = openDB<LedgerDB>(dbName, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("events", { autoIncrement: true });
        store.createIndex("byProject", "projectId");
        store.createIndex("byEventId", "id", { unique: true });
      },
    });
  }

  async append(event: LedgerEvent): Promise<void> {
    assertValidEvent(event);
    await this.#write(() => this.#again(async (db, attempt) => {
      try {
        await db.add("events", event); // unique byEventId index rejects duplicates
      } catch (err) {
        /* A retry that meets its own id already stored means the aborted try
         * landed after all; the event is on the record once, which is the point. */
        if (attempt > 0 && errorName(err) === "ConstraintError") return;
        throw err;
      }
    }));
  }

  async appendAll(events: readonly LedgerEvent[]): Promise<void> {
    for (const event of events) assertValidEvent(event);
    if (events.length === 0) return;
    await this.#write(() =>
      this.#again(async (db, attempt) => {
        const tx = db.transaction("events", "readwrite");
        const done = tx.done;
        /* Handled from the start: a refused add aborts the transaction before
         * the catch below runs, and idb's `done` rejects with a bare
         * DOMException("AbortError"), the word the page used to print. */
        done.catch(() => undefined);
        for (const event of events) {
          /* An aborted transaction writes nothing, so a retry writes the
           * batch again; one that did land after all is not written twice. */
          if (attempt > 0 && (await tx.store.index("byEventId").getKey(event.id)) !== undefined) continue;
          await tx.store.add(event);
        }
        await done;
      }),
    );
  }

  async readAll(projectId?: string): Promise<readonly LedgerEvent[]> {
    const all = await this.#again(async (db) => {
      const tx = db.transaction("events", "readonly");
      const [events] = await Promise.all([tx.store.getAll(), tx.done]); // key order === append order
      return events;
    });
    return projectId === undefined
      ? all
      : all.filter((e) => e.projectId === projectId);
  }

  /** The operation on this store's database, tried again on an abort (see `idbAgain.ts`). */
  async #again<T>(op: (db: IDBPDatabase<LedgerDB>, attempt: number) => Promise<T>): Promise<T> {
    const db = await this.#db;
    return tryAgainOnAbort((attempt) => op(db, attempt));
  }
}
