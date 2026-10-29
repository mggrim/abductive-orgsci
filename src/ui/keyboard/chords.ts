/**
 * Chord notation, and the input suppression that makes bare keys safe
 * (FND-02).
 *
 * Two pure functions with no DOM in their signatures, because both of them are
 * where a keyboard model goes wrong and neither is testable through a browser
 * in this suite. The first defect a bare-letter binding produces is a
 * researcher typing the word "just" into the answer box and being thrown to
 * the Site station on the j; the second is a sequence prefix that never times
 * out, so a g pressed by accident swallows the next real keystroke. Both are
 * decided here rather than inside the listener.
 */

/** The parts of a KeyboardEvent the matcher reads. */
export interface KeyStroke {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** The parts of an element the suppression rule reads. */
export interface StrokeTarget {
  readonly tagName: string;
  readonly type?: string;
  readonly isContentEditable?: boolean;
  readonly role?: string;
}

/**
 * Types that hold a caret. A checkbox or a radio takes no text, so a bare key
 * pressed on one is a shortcut rather than typing, and suppressing there would
 * cost the researcher the bindings for no gain.
 */
const TEXTUAL_INPUT = new Set([
  "",
  "text",
  "search",
  "url",
  "email",
  "password",
  "number",
  "tel",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
]);

export function isTypingTarget(target: StrokeTarget | null | undefined): boolean {
  if (target === null || target === undefined) return false;
  if (target.isContentEditable === true) return true;
  if (target.role === "textbox" || target.role === "searchbox") return true;
  const tag = target.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return TEXTUAL_INPUT.has((target.type ?? "text").toLowerCase());
  return false;
}

/**
 * One stroke as a token in the table's notation. Mod stands for Cmd on a Mac
 * and Ctrl everywhere else, and it is one token rather than two because a
 * table that spelled both would drift by exactly one platform.
 *
 * Shift is only named when a modifier is already held. Without one, the shift
 * has already done its job in the character: `?` arrives as `?` and writing it
 * as `Shift+/` would make the sheet print a key nobody presses.
 */
export function strokeToken(e: KeyStroke): string {
  const mod = e.metaKey || e.ctrlKey;
  const named = e.key.length > 1;
  if (!mod && !e.altKey) return named ? e.key : e.key.toLowerCase();
  const parts: string[] = [];
  if (mod) parts.push("Mod");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(named ? e.key : e.key.toUpperCase());
  return parts.join("+");
}

export interface Match<B> {
  /** `pending` means the token opened a sequence and the next one decides it. */
  readonly status: "match" | "pending" | "none";
  readonly binding?: B;
  /** The prefix now held, or null. The caller stores it and passes it back. */
  readonly pending: string | null;
}

/**
 * Resolve one token against the table, given whatever prefix is held.
 *
 * A sequence that fails on its second token resolves to none and clears rather
 * than falling back to the second token's own binding. Pressing g then b would
 * otherwise land on Biases twice over, and a mistyped prefix would fire
 * something the researcher did not ask for, which on a table this size is how
 * an accelerator becomes a surprise.
 */
export function resolveStroke<B extends { readonly keys: string }>(
  bindings: readonly B[],
  pending: string | null,
  token: string,
  prefixes: ReadonlySet<string>,
): Match<B> {
  if (pending !== null) {
    const binding = bindings.find((b) => b.keys === `${pending} ${token}`);
    return binding === undefined
      ? { status: "none", pending: null }
      : { status: "match", binding, pending: null };
  }
  const direct = bindings.find((b) => b.keys === token);
  if (direct !== undefined) return { status: "match", binding: direct, pending: null };
  if (prefixes.has(token)) return { status: "pending", pending: token };
  return { status: "none", pending: null };
}

/** How long a held prefix waits for its second key before it is dropped. */
export const CHORD_TIMEOUT_MS = 1500;

/** The chord as the sheet prints it: one <kbd> per key. */
export function keyCaps(keys: string): readonly string[] {
  if (keys === "Arrow keys") return ["Left", "Right", "Up", "Down"];
  return keys.split(" ").flatMap((step) => step.split("+"));
}

/**
 * Mod is written out for the platform the researcher is on, because a sheet
 * that says Mod is a sheet that has to be decoded. Detection is on the
 * platform string rather than the user agent, and it falls back to Ctrl, which
 * is the safer wrong answer: a Mac user reading Ctrl tries Cmd next, and a
 * Windows user reading Cmd has nothing to try.
 */
export function modLabel(platform: string): string {
  return /mac|iphone|ipad/i.test(platform) ? "Cmd" : "Ctrl";
}
