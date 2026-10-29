/**
 * One study, two tabs (walk finding).
 *
 * A researcher with the same study open twice accepted thirteen drafts in one
 * tab and recorded a relation, and the other tab went on showing seventeen
 * drafts and "Nothing in your model yet" through every hash navigation until a
 * hard reload. Neither tab was wrong about what it had read. The ledger is read
 * into memory once when a tab loads and re-read only after that tab's own
 * appends, so a write from anywhere else is invisible until the page is loaded
 * again.
 *
 * The store underneath is IndexedDB, which both tabs already share, so nothing
 * has to be sent between them but the news that something changed. Each tab
 * then re-reads the store, which is a merge rather than a replace: the store is
 * the union of every tab's appends, keyed by event id, and a tab that appends
 * after missing a remote write still ends up holding both. There is no
 * last-writer-wins here, because nothing is overwritten. An event is appended
 * once and never edited, and a page is a projection of the events.
 *
 * BroadcastChannel where it exists, which is every browser this app supports
 * and the test runner. Where it does not, a same-process bus, so a fallback is
 * never silently no news at all. A channel never hears its own posts, in either
 * implementation: a tab re-reading because of its own write would be a loop.
 */

/** What changed, and in which study. */
export interface StudyChange {
  readonly projectId: string;
  /** `events` for a ledger append, `project` for a brief or title write. */
  readonly kind: "events" | "project";
}

export interface StudyChannel {
  readonly post: (change: StudyChange) => void;
  readonly subscribe: (listener: (change: StudyChange) => void) => () => void;
  readonly close: () => void;
}

export const STUDY_CHANNEL_NAME = "abductive-study";

/** The fallback bus, for a runtime with no BroadcastChannel. */
const local = new Map<string, Set<(change: StudyChange, from: object) => void>>();

function isChange(value: unknown): value is StudyChange {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.projectId === "string" && (c.kind === "events" || c.kind === "project")
  );
}

export function makeStudyChannel(name: string = STUDY_CHANNEL_NAME): StudyChannel {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(name);
    const listeners = new Set<(change: StudyChange) => void>();
    channel.onmessage = (event: MessageEvent) => {
      /* Anything could be on a channel with this name, including a message from
       * a future version of the app, so it is checked rather than trusted. */
      if (!isChange(event.data)) return;
      for (const listener of listeners) listener(event.data);
    };
    return {
      post: (change) => channel.postMessage(change),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      close: () => {
        listeners.clear();
        channel.close();
      },
    };
  }

  const self = {};
  const bus = local.get(name) ?? new Set();
  local.set(name, bus);
  const listeners = new Set<(change: StudyChange) => void>();
  const receive = (change: StudyChange, from: object) => {
    if (from === self) return;
    for (const listener of listeners) listener(change);
  };
  bus.add(receive);
  return {
    post: (change) => {
      for (const fn of [...bus]) fn(change, self);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close: () => {
      listeners.clear();
      bus.delete(receive);
    },
  };
}

/**
 * The channel the app writes through.
 *
 * A module singleton, so `updateBrief` and the ledger store can announce a write
 * without a React tree to hang a provider off. Created lazily, because a build
 * step that imports this module for a type must not open a channel.
 */
let shared: StudyChannel | null = null;

export function studyChannel(): StudyChannel {
  shared ??= makeStudyChannel();
  return shared;
}

/** Announce a write. Never throws: freshness is not worth losing a save over. */
export function announce(change: StudyChange): void {
  try {
    studyChannel().post(change);
  } catch {
    // A closed or unavailable channel means the other tab reloads later.
  }
}

/** Test seam: drop the singleton so the next call opens a fresh channel. */
export function resetStudyChannel(): void {
  shared?.close();
  shared = null;
}
