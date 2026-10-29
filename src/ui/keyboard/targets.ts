/**
 * The controls a binding can move focus to, and the aria-keyshortcuts stamp
 * (FND-02).
 *
 * Focus, never press. Every accelerator that points at a decision points at it
 * through this file, and everything in this file ends at `.focus()`. There is
 * no `.click()`, no `requestSubmit`, no synthesised event: a keystroke that
 * fired a control would be a keystroke that accepted a page, and the whole
 * keyboard model is built around that not being possible.
 *
 * A target is a list of selectors rather than one, because the surfaces this
 * has to reach are owned by five other builders. `[data-kbd="..."]` is the
 * contract going forward and it is read first; the rest are what the surfaces
 * render today, so the model works before anyone else has touched a file. When
 * a surface adopts the data attribute its legacy selector can go, and
 * tests/keyboard.test.ts reads the surface sources so a rename shows up as a
 * failure here rather than as a key that silently stops working.
 */

export type TargetName = "primary-input" | "send" | "decline" | "decline-reason" | "record";

export const TARGET_SELECTORS: Readonly<Record<TargetName, readonly string[]>> = {
  // The station answer box on Design, the reason field on Coherence, the
  // credential field on Settings. The last entry is the general case: the
  // first field inside the main region, which is what "the surface's primary
  // input" means on a surface that has not declared one.
  "primary-input": [
    '[data-kbd="primary-input"]',
    '[data-testid="answer-input"]',
    "main textarea:not([disabled])",
    'main input:not([disabled]):not([type="checkbox"]):not([type="radio"]):not([type="hidden"])',
  ],
  send: ['[data-kbd="send"]', '[data-testid="send-answer"]', '[data-testid="redirect-go"]'],
  decline: ['[data-kbd="decline"]', '.decision-group button[data-role="decline"]'],
  "decline-reason": ['[data-kbd="decline-reason"]', ".decision-reason .reason", "input.reason"],
  // M38, ISC-494. The record's control in the study header, on all five tabs.
  // It carries the contract attribute from the day it was written, so this
  // target has one selector and needs no legacy alternative.
  record: ['[data-kbd="record"]'],
};

/**
 * Rendered and reachable. `offsetParent` is null for anything display:none or
 * inside a collapsed <details>, and a zero-size rect catches the visually
 * hidden. A hidden control is not a place to put focus; the researcher would
 * lose the caret with no way to see where it went.
 */
export function isReachable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
  if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1;
}

export function resolveTarget(name: TargetName, root: ParentNode): HTMLElement | null {
  for (const selector of TARGET_SELECTORS[name]) {
    for (const el of root.querySelectorAll(selector)) {
      if (isReachable(el) && el instanceof HTMLElement) return el;
    }
  }
  return null;
}

/**
 * ARIA notation for one chord, or null where the shortcut cannot honestly be
 * expressed. aria-keyshortcuts takes a space-separated list of alternatives,
 * each one a set of keys joined with +, and it has no way to say "g then d":
 * stamping `g d` would be read out as "g or d", which is worse than saying
 * nothing. Sequences get `data-kbd-chord` instead, which says the same thing
 * to a surface that wants to print it and nothing at all to a screen reader.
 */
export function ariaKeyshortcut(keys: string): string | null {
  if (keys.includes(" ")) return null;
  const parts = keys.split("+");
  const last = parts[parts.length - 1] ?? "";
  const mods = parts.slice(0, -1);
  if (mods.includes("Mod")) {
    const rest = mods.filter((m) => m !== "Mod");
    const tail = [...rest, last].join("+");
    return `Meta+${tail} Control+${tail}`;
  }
  return [...mods, last].join("+");
}

/**
 * Put the shortcut on the control that answers to it. The survey's standard
 * was ATLAS.ti's: every action performed more than five times in a session has
 * a binding, shown next to the control. This is the machine-readable half of
 * that, and it is applied from the table so a control cannot advertise a
 * binding the hook does not have.
 */
export function stampShortcuts(
  root: ParentNode,
  bindings: readonly { readonly keys: string; readonly control?: string }[],
): number {
  let stamped = 0;
  for (const binding of bindings) {
    const selector = binding.control;
    if (selector === undefined) continue;
    const aria = ariaKeyshortcut(binding.keys);
    for (const el of root.querySelectorAll(selector)) {
      if (aria === null) el.setAttribute("data-kbd-chord", binding.keys);
      else el.setAttribute("aria-keyshortcuts", aria);
      stamped += 1;
    }
  }
  return stamped;
}
