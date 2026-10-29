/**
 * Human-layer attention capture (ISC-24).
 *
 * DOM-side utilities that watch the chunk viewer for engagement PROXIES —
 * these are not measurements of reading or comprehension, and every UI
 * surface that renders this layer labels it as a proxy:
 *   - chunk-expanded: a `<details class="chunk" data-chunk-id>` opened
 *     (emitted once per chunk per attach session);
 *   - dwell: a chunk stayed expanded AND visible for > 3s
 *     (emitted once per chunk per attach session).
 *
 * Event delegation only: one capture-phase 'toggle' listener on the container
 * (the toggle event does not bubble, but it does capture), so chunks may be
 * re-rendered freely. The module emits plain signals through a callback; the
 * `useHumanAttention` hook converts them into `attention` ledger events with
 * layer 'human' and actor 'human'. Nothing here ever blocks the workflow —
 * failures are swallowed by the caller (ISC-44).
 */

export interface HumanAttentionSignal {
  readonly chunkId: string;
  readonly kind: "chunk-expanded" | "dwell";
}

export const DEFAULT_DWELL_MS = 3000;

export interface AttachChunkObserversOptions {
  /** Dwell threshold in ms (default 3000). */
  readonly dwellMs?: number;
  /** Injectable visibility check (defaults to a viewport-rect test). */
  readonly isVisible?: (el: HTMLElement) => boolean;
}

function defaultIsVisible(el: HTMLElement): boolean {
  if (typeof window === "undefined") return false;
  const rect = el.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < window.innerHeight &&
    rect.left < window.innerWidth
  );
}

/**
 * Attach delegated chunk observers to `root`. Returns a detach function that
 * removes the listener and cancels all pending dwell timers.
 */
export function attachChunkObservers(
  root: HTMLElement,
  onEvent: (signal: HumanAttentionSignal) => void,
  options: AttachChunkObserversOptions = {},
): () => void {
  const dwellMs = options.dwellMs ?? DEFAULT_DWELL_MS;
  const isVisible = options.isVisible ?? defaultIsVisible;

  const expandedSeen = new Set<string>();
  const dwellFired = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const handler = (raw: Event): void => {
    const target = raw.target;
    if (!(target instanceof HTMLElement)) return;
    const details = target.closest("details.chunk[data-chunk-id]");
    if (!(details instanceof HTMLDetailsElement)) return;
    const chunkId = details.dataset.chunkId;
    if (chunkId === undefined || chunkId === "") return;

    if (details.open) {
      if (!expandedSeen.has(chunkId)) {
        expandedSeen.add(chunkId);
        onEvent({ chunkId, kind: "chunk-expanded" });
      }
      if (!dwellFired.has(chunkId) && !timers.has(chunkId)) {
        const timer = setTimeout(() => {
          timers.delete(chunkId);
          // Dwell only counts if still expanded AND visible when the
          // threshold elapses — expanded-but-scrolled-away does not fire.
          if (details.open && isVisible(details) && !dwellFired.has(chunkId)) {
            dwellFired.add(chunkId);
            onEvent({ chunkId, kind: "dwell" });
          }
        }, dwellMs);
        timers.set(chunkId, timer);
      }
    } else {
      const timer = timers.get(chunkId);
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(chunkId);
      }
    }
  };

  root.addEventListener("toggle", handler, true);

  return () => {
    root.removeEventListener("toggle", handler, true);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
