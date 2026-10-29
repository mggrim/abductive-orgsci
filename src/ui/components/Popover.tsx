/**
 * The one anchored box, extracted from CellPopover (M39, ISC-505).
 *
 * `CellPopover` was built for the bias grid and hardened against three named
 * failure modes that any second hover box would otherwise rediscover. Its own
 * header lists them and they are worth restating here, because this file is now
 * where they are answered:
 *
 *  - **Boxes that vanish when you move the mouse toward them.** The close is
 *    delayed, and the delay is cancelled if the pointer lands on the box.
 *  - **Hover-only interfaces**, which are dead on a touch screen and unreachable
 *    from a keyboard. Focus opens it, press pins it, Escape closes it.
 *  - **Clipping.** Measured against the viewport rather than positioned inside
 *    the scrolling thing that owns the trigger.
 *
 * ISC-505 asks for provenance on hover and M32's route chip (retired at M62) recorded a decision
 * against hover cards in its own words: one does not exist on a touch screen,
 * does not print, and needs a keyboard affordance written by hand. The two are
 * reconciled here rather than argued: the trigger is a real `<button>`, so press
 * and focus both work, and the box is not the only path to what it says. Print
 * gets nothing, which is right, because provenance is a question you ask and not
 * a thing on the page.
 *
 * ## The measured path is the only path, and CSS anchor positioning is not used
 *
 * The plan asked for anchor positioning as a progressive enhancement behind
 * `@supports (anchor-name: --a)`, with this measurement as the fallback. Built
 * that way and then measured in Chrome 152 on the shipped example, it was not an
 * enhancement: `anchor-name` is a document-wide identifier and this popover has
 * many instances, so one shared name named two triggers at once and
 * `position-area` put the box at 2961px in a 900px viewport. Being layout rather
 * than an offset, it won over the inline `top` the measurement wrote. The block
 * is gone; components.css carries the numbers and what it would take to do it
 * properly.
 *
 * `popover="auto"` is used for what it gives beyond styling: the box goes in the
 * top layer, which means the clipping class of bug cannot come back inside a
 * `panel-frame` with its own scroll or inside the two-pane grid ISC-503 adds. It
 * also brings light dismiss for free. Applied through a ref rather than as a JSX
 * attribute, because React 18's type for it is `boolean` and the value the
 * platform wants is the string `"auto"`.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** How far the box sits from the control, and from the edge of the window. */
const GUTTER = 12;

/** How long the box waits before closing when the pointer leaves. */
const CLOSE_DELAY_MS = 180;

export interface PopoverPlacement {
  readonly top: number;
  readonly left: number;
}

/**
 * Place a box of this size near this rect, inside this window.
 *
 * Pure, and exported for the test: the flip-then-clamp order is the part that
 * was got wrong once. Flipping above is not enough on its own, because a trigger
 * near the fold puts the flipped box off the bottom of the screen, which is the
 * failure the whole thing exists to remove.
 */
export function placeBox(
  rect: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number },
  size: { readonly width: number; readonly height: number },
  view: { readonly width: number; readonly height: number },
): PopoverPlacement {
  const below = rect.bottom + GUTTER;
  const fitsBelow = below + size.height <= view.height - GUTTER;
  const preferred = fitsBelow ? below : rect.top - GUTTER - size.height;
  const top = Math.min(
    Math.max(GUTTER, preferred),
    Math.max(GUTTER, view.height - size.height - GUTTER),
  );
  const centred = (rect.left + rect.right) / 2 - size.width / 2;
  const left = Math.min(
    Math.max(GUTTER, centred),
    Math.max(GUTTER, view.width - size.width - GUTTER),
  );
  return { top, left };
}

/**
 * Escape, a scroll and a resize all close an anchored box.
 *
 * The one keydown listener outside the keyboard model, and it is here rather
 * than in each popover because `tests/keyboard.test.ts` asserts there is exactly
 * one: "a second ad hoc listener appearing in a surface file is the drift this
 * model was built to end". `CellPopover` had the original, written for the bias
 * grid, and the provenance box needs the identical three. So the behaviour moved
 * here and both use it, which is the extraction ISC-505 asks for rather than a
 * second implementation with the same shape.
 *
 * A scroll closes rather than repositions, which is `CellPopover`'s own choice
 * kept: a measured box chasing a scroll lags it by a frame, and a box that
 * quietly moves under the pointer is worse than one that gets out of the way.
 */
export function useDismissOnEscapeOrMove(active: boolean, close: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Stopped here so Escape does not also close the dialog behind the box, or
      // leave fullscreen mid-demo. CellPopover's rule, kept.
      e.stopPropagation();
      close();
    };
    const onMove = () => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, [active, close]);
}

/**
 * The state a trigger and its box share, as a hook.
 *
 * The hook rather than a component, because the trigger belongs to whatever row
 * it labels and the box belongs to the top layer, so the two cannot be one
 * element. What they share is: whether it is open, whether it is pinned, and the
 * one timer that makes the delayed close survivable.
 */
export function usePopover(): {
  readonly open: boolean;
  readonly pinned: boolean;
  readonly triggerProps: {
    readonly onMouseEnter: () => void;
    readonly onMouseLeave: () => void;
    readonly onFocus: () => void;
    readonly onBlur: () => void;
    readonly onClick: () => void;
    readonly "aria-expanded": boolean;
  };
  readonly boxProps: {
    readonly onMouseEnter: () => void;
    readonly onMouseLeave: () => void;
  };
  readonly close: () => void;
} {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);

  /* The delay is the whole answer to "boxes that vanish when you move the mouse
   * toward them": the pointer has to cross the gap between the control and the
   * box, and during that crossing it is over neither. */
  const closeSoon = useCallback(() => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const close = useCallback(() => {
    cancelClose();
    setPinned(false);
    setOpen(false);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  return {
    open,
    pinned,
    triggerProps: {
      onMouseEnter: () => {
        cancelClose();
        setOpen(true);
      },
      onMouseLeave: () => {
        if (!pinned) closeSoon();
      },
      onFocus: () => {
        cancelClose();
        setOpen(true);
      },
      onBlur: () => {
        if (!pinned) closeSoon();
      },
      /* Press pins, and a second press lets go. On a touch screen this is the
       * only way in, which is why it is a press on a real button and not a
       * hover on a span. */
      onClick: () => {
        cancelClose();
        setOpen(true);
        setPinned((p) => !p);
      },
      "aria-expanded": open,
    },
    boxProps: {
      onMouseEnter: cancelClose,
      onMouseLeave: () => {
        if (!pinned) closeSoon();
      },
    },
    close,
  };
}

/**
 * The box itself: measured, clamped, in the top layer, and out of the way.
 *
 * `anchorRect` is read from the trigger by the caller, because the caller is the
 * only one that holds the trigger's element.
 */
export function Popover(props: {
  /** The control this belongs to, so the box can be measured against it. */
  readonly anchor: HTMLElement | null;
  readonly open: boolean;
  readonly pinned: boolean;
  readonly label: string;
  readonly width: number;
  readonly className?: string;
  readonly testId?: string;
  readonly onClose: () => void;
  readonly onMouseEnter: () => void;
  readonly onMouseLeave: () => void;
  readonly children: ReactNode;
}) {
  const { anchor, open, pinned, label, width, className, testId, onClose, children } = props;
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopoverPlacement | null>(null);

  /* Measured after paint, because the height depends on what is inside it and
   * whether the box goes above or below is decided by whether it actually fits. */
  useLayoutEffect(() => {
    const el = box.current;
    if (el === null || anchor === null || !open) return;
    setPos(
      placeBox(anchor.getBoundingClientRect(), { width, height: el.offsetHeight }, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, [anchor, open, width, children]);

  /* The top layer, and the platform's own light dismiss with it. Through a ref
   * because React 18 types `popover` as a boolean and the platform wants a
   * string, and a browser without the API simply has no `showPopover` and gets a
   * `position: fixed` box, which is what the app had before this. */
  useEffect(() => {
    const el = box.current as (HTMLDivElement & {
      popover?: string;
      showPopover?: () => void;
      hidePopover?: () => void;
    }) | null;
    if (el === null || typeof el.showPopover !== "function") return;
    el.setAttribute("popover", "auto");
    try {
      if (open) el.showPopover();
      else el.hidePopover();
    } catch {
      /* Calling showPopover on an already-open popover throws, and so does
       * hiding one that is not open. Both are the state we wanted. */
    }
  }, [open]);

  useDismissOnEscapeOrMove(open, onClose);

  if (!open) return null;

  return (
    <div
      ref={box}
      className={className === undefined ? "popbox" : `popbox ${className}`}
      role="dialog"
      aria-label={label}
      data-pinned={pinned}
      {...(testId === undefined ? {} : { "data-testid": testId })}
      style={{
        width,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos === null ? "hidden" : "visible",
      }}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
    >
      {children}
      {pinned && (
        <button type="button" className="popbox-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      )}
    </div>
  );
}
