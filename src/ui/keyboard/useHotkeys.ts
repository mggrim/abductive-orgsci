/**
 * One hook, one listener, one table (FND-02).
 *
 * There was no keyboard model at all before this: one Escape handler in
 * CellPopover and nothing else. The temptation with the second one is to put
 * it next to the control it serves, and by the tenth the app has ten listeners
 * that do not know about each other, no way to answer what is bound, and a
 * sheet written by hand that is wrong within a week. So there is one listener
 * on the document, it reads the table, and every surface that wants a binding
 * adds a row rather than a handler.
 *
 * The hook holds three pieces of state and no policy. What a binding means is
 * bindings.ts; where focus can land is targets.ts; what the researcher is
 * allowed to reach at speed is the governing rule, enforced by the shape of
 * `Intent` and by tests/keyboard.test.ts. This file decides only when a
 * keystroke counts.
 */

import { useEffect, useRef, useState } from "react";
import { CHORD_TIMEOUT_MS, isTypingTarget, resolveStroke, strokeToken } from "./chords.ts";
import type { Binding, Intent } from "./bindings.ts";

export interface HotkeyOptions {
  /** Off while a study is loading, so a key cannot outrun the route it needs. */
  readonly enabled?: boolean;
  readonly timeoutMs?: number;
}

/**
 * Returns the prefix currently held, or null. The layer prints it, because a
 * sequence with no feedback is a sequence the researcher cannot tell they
 * started: g followed by a pause looks identical to nothing happening.
 */
export function useHotkeys(
  bindings: readonly Binding[],
  run: (intent: Intent, binding: Binding) => void,
  options: HotkeyOptions = {},
): string | null {
  const enabled = options.enabled ?? true;
  const timeoutMs = options.timeoutMs ?? CHORD_TIMEOUT_MS;
  const [pending, setPending] = useState<string | null>(null);

  // The listener is installed once. Everything that changes between renders is
  // read through a ref, because rebinding a document listener on every route
  // change was how the first version dropped the keystroke that caused the
  // change.
  const latest = useRef({ bindings, run, enabled });
  latest.current = { bindings, run, enabled };

  const held = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      held.current = null;
      setPending(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const { bindings: table, run: act, enabled: on } = latest.current;
      if (!on || e.defaultPrevented) return;
      // A dead key or an IME candidate window is mid-word, not a shortcut.
      if (e.isComposing || e.key === "Dead" || e.key === "Process") return;

      const target = e.target;
      const typing =
        target instanceof HTMLElement
          ? isTypingTarget({
              tagName: target.tagName,
              ...(target instanceof HTMLInputElement ? { type: target.type } : {}),
              isContentEditable: target.isContentEditable,
              ...(target.getAttribute("role") === null
                ? {}
                : { role: target.getAttribute("role") ?? "" }),
            })
          : false;

      // While the caret is in a field, only the chords that declared themselves
      // safe there are live, and no sequence can be started. Bare j and k are
      // the reason: a researcher typing "just" into the answer box must not be
      // thrown to another station on the j.
      const live = typing ? table.filter((b) => b.whileTyping === true) : table;
      const prefixes = typing
        ? new Set<string>()
        : new Set(
            live
              .map((b) => b.keys.split(" "))
              .filter((parts) => parts.length > 1)
              .map((parts) => parts[0] ?? ""),
          );

      const match = resolveStroke(live, held.current, strokeToken(e), prefixes);

      if (match.status === "pending") {
        e.preventDefault();
        held.current = match.pending;
        setPending(match.pending);
        if (timer.current !== null) clearTimeout(timer.current);
        // A prefix that never expires eats the next real keystroke, so g
        // pressed by accident is forgotten rather than remembered forever.
        timer.current = setTimeout(clear, timeoutMs);
        return;
      }

      if (match.status === "match" && match.binding !== undefined) {
        e.preventDefault();
        clear();
        act(match.binding.intent, match.binding);
        return;
      }

      // A sequence that resolved to nothing clears without firing the second
      // key's own binding. g then b would otherwise land on Biases by way of a
      // typo, and a table this size makes that a surprise rather than a shortcut.
      if (held.current !== null) clear();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [timeoutMs]);

  return pending;
}
