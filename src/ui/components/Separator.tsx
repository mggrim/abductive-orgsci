/**
 * The divider between two panes (M39, ISC-503).
 *
 * Hand-rolled, about sixty lines, rather than `react-resizable-panels`, which is
 * well built and is the wrong trade here: 10.9 kB gzipped for a panel-group
 * abstraction, nested groups, collapse behaviour and its own persistence layer,
 * when the app needs one divider on one route and already has its own convention
 * for where interface state lives. `AppShell.tsx`'s `railCollapsed` is that
 * convention, down to the documented decision about whether the value persists.
 *
 * ## Why arrow keys here need no row in bindings.ts
 *
 * The keyboard model's four-effect rule governs app shortcuts: a key that acts
 * while focus is somewhere else. Arrow keys on a focused separator are a
 * `focus`-class interaction in the platform's own sense, the same as arrows in a
 * listbox or a slider. They do nothing unless this control has focus, they are
 * what `role="separator"` with `aria-valuenow` promises a screen reader, and
 * putting them in the global table would make them app-wide. So the rule stays
 * intact and this stays local.
 *
 * The control is reachable, named and operable without a pointer, which is the
 * part that usually gets skipped: Tab reaches it, arrows move it a step, Home
 * and End take it to its bounds, and `aria-valuenow` says where it is as a
 * percentage rather than in pixels a reader cannot picture.
 */

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";

/** How far one arrow press moves the divider, as a fraction of the frame. */
const STEP = 0.02;

export function Separator(props: {
  /** Where the divider sits, as the left pane's share of the frame, 0 to 1. */
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (next: number) => void;
  readonly label: string;
  readonly testId?: string;
}) {
  const { value, min, max, onChange, label, testId } = props;
  const el = useRef<HTMLDivElement>(null);

  const clamp = useCallback(
    (next: number) => Math.min(max, Math.max(min, next)),
    [min, max],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const moves: Readonly<Record<string, number | "min" | "max">> = {
        ArrowLeft: -STEP,
        ArrowRight: STEP,
        Home: "min",
        End: "max",
      };
      const move = moves[e.key];
      if (move === undefined) return;
      /* Only once the key is one this control answers to, so a Tab or a chord
       * passing through a focused separator still reaches the app. */
      e.preventDefault();
      onChange(move === "min" ? min : move === "max" ? max : clamp(value + move));
    },
    [value, min, max, clamp, onChange],
  );

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const node = el.current;
      if (node === null) return;
      const frame = node.parentElement;
      if (frame === null) return;
      /* Captured, so a drag that leaves the divider still steers it. Without
       * this the pointer outruns a 6px target on the first fast movement and the
       * drag simply stops, which reads as a broken control rather than a fast
       * one. */
      node.setPointerCapture(e.pointerId);
      const box = frame.getBoundingClientRect();
      const move = (ev: globalThis.PointerEvent) => {
        if (box.width === 0) return;
        onChange(clamp((ev.clientX - box.left) / box.width));
      };
      const up = (ev: globalThis.PointerEvent) => {
        node.releasePointerCapture(ev.pointerId);
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        node.removeEventListener("pointercancel", up);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
      node.addEventListener("pointercancel", up);
    },
    [clamp, onChange],
  );

  return (
    <div
      ref={el}
      className="pane-separator"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      aria-valuetext={`${Math.round(value * 100)}% to the conversation`}
      tabIndex={0}
      data-testid={testId === undefined ? "pane-separator" : testId}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    />
  );
}
