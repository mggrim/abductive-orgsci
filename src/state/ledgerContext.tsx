/**
 * Ledger React context (ISC-6 consumer side; single-source-of-state rule).
 *
 * Provides ONE ledger store instance to the whole tree. `useLedger()` exposes
 * the live event array (re-read from the store after every append, so every
 * view derives from the same replayable log) and the append function. React
 * components hold no domain state of their own; the ledger and the IndexedDB
 * stores are the only owners.
 *
 * Every read passes through `normaliseLedgerProse`, which is the read half of
 * the voice gate. Rows written before the gate shipped still carry the dashes
 * the house rule bans, and this is the one place all six surfaces read through,
 * so it is the one place that has to know. Nothing is written back: the stored
 * event is untouched and replay over it is unchanged. See
 * `src/ledger/displayProse.ts` for which fields are in scope and why the
 * researcher's own words are not among them.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LedgerEvent } from "../ledger/events.ts";
import { normaliseLedgerProse } from "../ledger/displayProse.ts";
import {
  IndexedDBLedgerStore,
  InMemoryLedgerStore,
  type LedgerStore,
} from "../ledger/ledger.ts";
import { makeStudyChannel, type StudyChannel } from "./studyChannel.ts";

export interface LedgerContextValue {
  /** All events in append order, live-updated. */
  readonly events: readonly LedgerEvent[];
  /** Validate + persist + reflect a new event. */
  readonly append: (event: LedgerEvent) => Promise<void>;
  /** Append a batch in order (persona interventions emit several events). */
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<void>;
  /**
   * Read straight from the store, bypassing React state. `events` is a render
   * snapshot and goes stale between an append and the next render; any
   * check-then-act decision (has this cell already fired?) must read through
   * this instead.
   */
  readonly readEvents: (projectId?: string) => Promise<readonly LedgerEvent[]>;
  readonly ready: boolean;
}

const LedgerContext = createContext<LedgerContextValue | null>(null);

function makeDefaultStore(): LedgerStore {
  try {
    if (typeof indexedDB !== "undefined") return new IndexedDBLedgerStore();
  } catch {
    // fall through to in-memory
  }
  return new InMemoryLedgerStore();
}

export function LedgerProvider(props: {
  children: ReactNode;
  /** Injectable store for tests/dev; defaults to the IndexedDB-backed store. */
  store?: LedgerStore;
  /** Injectable cross-tab channel, so two providers can be driven in one test. */
  channel?: StudyChannel;
}) {
  const storeRef = useRef<LedgerStore | null>(null);
  storeRef.current ??= props.store ?? makeDefaultStore();
  const store = storeRef.current;
  const channelRef = useRef<StudyChannel | null>(null);
  channelRef.current ??= props.channel ?? makeStudyChannel();
  const channel = channelRef.current;

  const [events, setEvents] = useState<readonly LedgerEvent[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void store.readAll().then((all) => {
      if (!cancelled) {
        setEvents(normaliseLedgerProse(all));
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  /*
   * Somebody else wrote to this study, so re-read it (walk finding).
   *
   * A full read of the shared store rather than an attempt to apply what came
   * over the channel. The channel carries the news, not the data: applying a
   * payload would mean two tabs each building their own version of the log, and
   * the whole claim of this app is that there is one log and every view is a
   * projection of it. Re-reading is also the merge, because the store already
   * holds the union of both tabs' appends and an event is written once under
   * its own id.
   */
  useEffect(() => {
    return channel.subscribe(() => {
      void store.readAll().then((all) => setEvents(normaliseLedgerProse(all)));
    });
  }, [channel, store]);

  /* Re-read, then tell the other tabs. In that order: a tab that announced
   * first could be asked for state it had not finished writing. */
  const reflect = useCallback(
    async (written: readonly LedgerEvent[]) => {
      const all = await store.readAll();
      setEvents(normaliseLedgerProse(all));
      const projectIds = new Set(written.map((event) => event.projectId));
      for (const projectId of projectIds) channel.post({ projectId, kind: "events" });
    },
    [store, channel],
  );

  const append = useCallback(
    async (event: LedgerEvent) => {
      await store.append(event);
      await reflect([event]);
    },
    [store, reflect],
  );

  const appendAll = useCallback(
    async (batch: readonly LedgerEvent[]) => {
      /* M85, ISC-716: whole or not at all, where the store can. */
      if (store.appendAll !== undefined) await store.appendAll(batch);
      else for (const event of batch) await store.append(event);
      await reflect(batch);
    },
    [store, reflect],
  );

  const readEvents = useCallback(
    async (projectId?: string) => normaliseLedgerProse(await store.readAll(projectId)),
    [store],
  );

  const value = useMemo<LedgerContextValue>(
    () => ({ events, append, appendAll, readEvents, ready }),
    [events, append, appendAll, readEvents, ready],
  );

  return <LedgerContext.Provider value={value}>{props.children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const value = useContext(LedgerContext);
  if (value === null) {
    throw new Error("useLedger must be used inside <LedgerProvider>");
  }
  return value;
}

/**
 * The ledger when the tree has one, or null (M95). The Help panel renders on
 * Projects and Model access too, where the help chat writes to no project and
 * a test may mount the panel without a provider.
 */
export function useOptionalLedger(): LedgerContextValue | null {
  return useContext(LedgerContext);
}

/** Convenience: events scoped to one project. */
export function useProjectEvents(projectId: string): readonly LedgerEvent[] {
  const { events } = useLedger();
  return useMemo(
    () => events.filter((e) => e.projectId === projectId),
    [events, projectId],
  );
}
