/**
 * The grab on a bottom panel's top edge (M45).
 *
 * The owner, 2026-09-13: "Your framing should be further expandable by way of
 * dragging the section divider up." The framing dock opens at a third of the
 * window and that third is a ceiling someone should be able to raise while they
 * are writing in it, which is what every bottom panel in an editor lets you do.
 *
 * ## Why this is not `Separator.tsx` with an orientation flag
 *
 * The two controls share a keyboard skeleton and nothing else. `Separator`'s
 * value is a pane's share of a frame, its geometry is a clientX inside its own
 * parent's box, and its bounds keep two columns readable. This one's value is a
 * height against the window, its geometry is a clientY measured from the
 * window's bottom edge and inverted, because dragging up grows the panel, and
 * its bounds keep a strip of the tab you are standing on. A flag would have
 * parameterised the axis, the direction, the box the pointer is measured
 * against, the value space and the label, which is five parameters to share
 * about twenty lines. Two small controls, each readable on its own.
 *
 * ## What it does not know
 *
 * The geometry. `valueAt` turns a pointer's y into a value and the caller owns
 * it, which keeps this file presentational the way `components/index.ts` says
 * every primitive here is: no storage, no arithmetic about the window, no
 * knowledge of what is being resized beyond the label it is handed.
 *
 * ## Arrow keys, and why they need no row in bindings.ts
 *
 * The same argument `Separator.tsx` makes. Arrow keys on a focused separator do
 * nothing unless this control has focus, they are what `role="separator"` with
 * `aria-valuenow` promises a screen reader, and putting them in the global table
 * would make them app-wide. Tab reaches this, arrows move it a step, Home and
 * End take it to its bounds, and `aria-valuetext` says where it is in words
 * rather than in pixels a reader cannot picture.
 */

import { useCallback, useRef, type KeyboardEvent, type PointerEvent } from "react";

/**
 * On the body while a drag is on, and it is on the body rather than on the
 * handle because of where the pointer goes. The drag is captured, so every event
 * reaches this control, and the selection the browser makes on the way does not:
 * without this, dragging up selects every line of the step above the panel.
 */
export const DOCK_RESIZING_CLASS = "dock-resizing";

export function DockHandle(props: {
  /** Where the edge sits, in whatever unit the caller's bounds are in. */
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** How far one arrow press moves it. */
  readonly step: number;
  readonly onChange: (next: number) => void;
  /** What a pointer at this y means, in the caller's unit. */
  readonly valueAt: (clientY: number) => number;
  /** The control's name, read out when it takes focus. */
  readonly label: string;
  /** Where it is, in words. */
  readonly valueText: string;
  readonly testId?: string;
}) {
  const { value, min, max, step, onChange, valueAt, label, valueText, testId } = props;
  const el = useRef<HTMLDivElement>(null);

  const clamp = useCallback(
    (next: number) => Math.min(max, Math.max(min, next)),
    [min, max],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      /* Up grows the panel, which is the direction the owner asked for and the
       * direction the pointer drag goes. Home is the floor rather than "the
       * default" because on this control they are the same number: the third of
       * the window the panel opens at. */
      const moves: Readonly<Record<string, number | "min" | "max">> = {
        ArrowUp: step,
        ArrowDown: -step,
        Home: "min",
        End: "max",
      };
      const move = moves[e.key];
      if (move === undefined) return;
      /* Only once the key is one this control answers to, so a Tab or a chord
       * passing through a focused handle still reaches the app. */
      e.preventDefault();
      onChange(move === "min" ? min : move === "max" ? max : clamp(value + move));
    },
    [value, min, max, step, clamp, onChange],
  );

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const node = el.current;
      if (node === null) return;
      /* Captured, for the reason `Separator.tsx` documents: without it the
       * pointer outruns a 12px target on the first fast movement and the drag
       * stops, which reads as a broken control rather than a fast one.
       *
       * M81: Safari throws NotFoundError when the pointer is one it isn't
       * tracking, and the throw used to end the handler before it listened for
       * a move, so the drag did nothing. Without capture the listeners go on
       * the window, which still sees the pointer once it leaves the strip. */
      let captured = true;
      try {
        node.setPointerCapture(e.pointerId);
      } catch {
        captured = false;
      }
      const target: EventTarget = captured ? node : window;
      document.body.classList.add(DOCK_RESIZING_CLASS);
      const move = (ev: Event) => onChange(clamp(valueAt((ev as globalThis.PointerEvent).clientY)));
      const up = (ev: Event) => {
        if (captured) {
          try {
            node.releasePointerCapture((ev as globalThis.PointerEvent).pointerId);
          } catch {
            /* Already released by the browser. */
          }
        }
        document.body.classList.remove(DOCK_RESIZING_CLASS);
        target.removeEventListener("pointermove", move);
        target.removeEventListener("pointerup", up);
        target.removeEventListener("pointercancel", up);
      };
      target.addEventListener("pointermove", move);
      target.addEventListener("pointerup", up);
      target.addEventListener("pointercancel", up);
    },
    [clamp, onChange, valueAt],
  );

  return (
    <div
      ref={el}
      className="dock-handle"
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      aria-valuetext={valueText}
      tabIndex={0}
      data-testid={testId === undefined ? "dock-handle" : testId}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    />
  );
}
