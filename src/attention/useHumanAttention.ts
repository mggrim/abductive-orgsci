/**
 * React binding for human-layer attention capture (ISC-24, ISC-29).
 *
 * Returns a callback ref to place on the container that holds the chunk
 * `<details>` elements. Signals from `attachChunkObservers` become
 * `attention` ledger events (layer 'human', actor 'human') via the shared
 * ledger context — the hook holds NO domain state, only a detach handle.
 * Append failures are swallowed: attention capture must never block or break
 * the workflow (ISC-44).
 */

import { useCallback, useRef } from "react";
import type { AttentionEvent } from "../ledger/events.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { attachChunkObservers } from "./capture.ts";

/**
 * Detach is handled entirely by the callback ref below — React invokes it with
 * `null` on unmount, and the first thing it does is detach.
 *
 * There used to be an unmount-cleanup `useEffect` here as well. It was both
 * redundant and actively harmful: React 18 StrictMode simulates an unmount in
 * development, which fired the cleanup and detached the observer, but callback
 * refs are not re-invoked on that simulated remount — so nothing re-attached
 * and the human attention layer silently captured nothing in dev. Verified
 * 2026-07-31: 0 human-layer events under `vite`, 2 under `vite preview` on the
 * same interaction.
 */
export function useHumanAttention(projectId: string): (node: HTMLElement | null) => void {
  const { append } = useLedger();
  const detachRef = useRef<(() => void) | null>(null);

  return useCallback(
    (node: HTMLElement | null) => {
      detachRef.current?.();
      detachRef.current = null;
      if (node === null) return;
      detachRef.current = attachChunkObservers(node, (signal) => {
        const event: AttentionEvent = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          actor: "human",
          projectId,
          type: "attention",
          layer: "human",
          chunkId: signal.chunkId,
        };
        append(event).catch(() => {
          // Deliberately swallowed — proxy capture never interrupts work.
        });
      });
    },
    [append, projectId],
  );
}
