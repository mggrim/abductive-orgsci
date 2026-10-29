/**
 * The bindings, as data (FND-02).
 *
 * The survey found one keyboard handler in the whole repo, the Escape listener
 * in CellPopover, and zero uses of tabIndex. The station loop, the proposals
 * tray, the findings list and station navigation were mouse-only, and the bias
 * grid offered its 63 squares as 63 tab stops. Linear catalogues 85 bindings
 * with g-prefix navigation and a sheet on `?`; NVivo ships Ctrl+F2, F8 and
 * Shift+F2 for its inner loop. This file is the answer to that gap, and it is
 * a table rather than a switch statement for one reason: the sheet on `?` is
 * rendered from it, so the documentation and the behaviour cannot drift apart.
 * A binding that is not in here does not exist, and a binding in here is
 * printed whether its author remembered the sheet or not.
 *
 * THE GOVERNING RULE. No single keystroke may accept a page, dispose of a
 * finding, spend a model call or write a file. Speed is granted to navigation
 * and to declining, never to accepting. Accelerators on those actions move
 * focus to the control; the researcher presses it.
 *
 * The rule is enforced three ways rather than remembered. `Intent` is a closed
 * union with no member capable of any of those four acts, so there is nothing
 * to wire an accepting binding to. `KeyEffect` is a closed union of four
 * movements. And tests/keyboard.test.ts enumerates this table, checks both
 * unions at runtime, and reads every file in this directory for the shapes
 * that could smuggle an act past the type system: a synthesised `.click()`, a
 * `requestSubmit`, an import of the ledger, the inference boundary or the
 * export bundle.
 *
 * The tab and station rows are generated from STUDY_TABS and STATIONS rather
 * than typed out, for the same reason stations.ts is the single declaration of
 * the flow: a second hand-written list of station names is how a rail and a
 * shortcut sheet drift apart, and the drift is invisible until a co-author
 * asks why key 5 goes somewhere the sheet does not name.
 */

import { STATIONS, type StationId } from "../../flow/stations.ts";
import { STUDY_TABS, STUDY_TAB_LABEL, type StudyTab } from "../routes.ts";
import type { TargetName } from "./targets.ts";

/**
 * What a binding is allowed to do. Four movements, and nothing else exists.
 *
 *   navigate         changes the route, which is a hash change and nothing more
 *   focus            moves focus to a control, which the researcher then presses
 *   reveal           opens the sheet or the palette
 *   dismiss-overlay  closes whichever of those two is open
 *
 * Absent on purpose, and the absence is the point: accept, decline, dispose,
 * send, draft, export, download, delete.
 */
export type KeyEffect = "navigate" | "focus" | "reveal" | "dismiss-overlay";

/**
 * The act a binding carries. Every member is a movement of the route, of
 * focus, or of an overlay. There is no member that appends to the ledger,
 * calls a model or writes a file, so a binding cannot be wired to one.
 *
 * `browser-opens-a-fold` is the ninth and it is the only member this layer does
 * not perform. Enter and Space on a focused <summary> are the platform's, and
 * the row exists because the sheet is the app's one statement of what the
 * keyboard does: /material puts three passages behind two folds, opening a
 * passage is the event the attention layer records, and until now the sheet had
 * nothing to say about either. A member that does nothing is the honest way to
 * print it. The alternative was to hang the row off `rove` or `open`, which
 * would have made the table say the app moves focus or opens an overlay when it
 * does neither.
 */
export type Intent =
  | { readonly kind: "browser-opens-a-fold" }
  | { readonly kind: "go-tab"; readonly tab: StudyTab }
  | { readonly kind: "cycle-tab"; readonly delta: 1 | -1 }
  | { readonly kind: "go-station"; readonly station: StationId }
  | { readonly kind: "go-route"; readonly hash: string }
  | { readonly kind: "focus"; readonly target: TargetName }
  | { readonly kind: "rove"; readonly delta: 1 | -1 }
  | { readonly kind: "open"; readonly overlay: Overlay }
  | { readonly kind: "close-overlay" };

export type Overlay = "sheet" | "palette";

/** The intent kinds, as data, so the test can assert the set is still four movements. */
export const INTENT_KINDS = [
  "browser-opens-a-fold",
  "go-tab",
  "cycle-tab",
  "go-station",
  "go-route",
  "focus",
  "rove",
  "open",
  "close-overlay",
] as const;

/**
 * Where a binding applies. A station key outside a study has nowhere to go, so
 * it does nothing rather than guessing at a project id.
 */
export type Scope = "global" | "study";

export type SectionId = "move" | "stations" | "lists" | "folds" | "controls" | "help";

export interface Section {
  readonly id: SectionId;
  readonly title: string;
  /** Printed under the section title on the sheet. */
  readonly note?: string;
}

export const SECTIONS: readonly Section[] = [
  { id: "move", title: "Views" },
  {
    id: "stations",
    title: "Steps",
    note: "You can open every step from the start, in any order.",
  },
  { id: "lists", title: "Lists" },
  {
    id: "folds",
    title: "Sections",
    note: "The browser handles this key. Every document and every passage on Sources is a section that you can open. Abductive records which passages you open.",
  },
  {
    id: "controls",
    title: "Controls",
    note: "Keys move focus to the control. You press the control.",
  },
  { id: "help", title: "Shortcuts" },
];

export interface Binding {
  readonly id: string;
  /**
   * The chord, in the notation both the matcher and the sheet read. `Mod` is
   * Cmd on a Mac and Ctrl everywhere else. A space separates the two steps of
   * a sequence, so `g d` is g then d rather than g and d together.
   */
  readonly keys: string;
  /** What it does, in the tool's voice. The sheet prints this verbatim. */
  readonly label: string;
  /** One sentence under the label, where the label alone would mislead. */
  readonly note?: string;
  readonly section: SectionId;
  readonly scope: Scope;
  readonly effect: KeyEffect;
  readonly intent: Intent;
  /**
   * Whether the binding fires while the caret is in a field. Off for every
   * bare key, which is what stops `j` from being unusable in a textarea.
   */
  readonly whileTyping?: boolean;
  /**
   * The on-screen control this binding relates to, as a selector. Used to
   * stamp aria-keyshortcuts, and for nothing else: the layer never clicks it.
   */
  readonly control?: string;
}

/** The letter each tab answers to after g. Exhaustive over StudyTab by type. */
const TAB_KEY: Readonly<Record<StudyTab, string>> = {
  /* M53, ISC-540. `t` for the theoretical motivation. `m` is Material's and has
   * been since M27, and the sheet is generated from this table, so the letter a
   * reader is shown is the letter that works. */
  motivation: "t",
  design: "d",
  // D1 (M27). `o` still, because the route is still `ontology` and the key is
  // the route's; the label above it is the tab's. `b` went with the Biases tab,
  // and `c` went with Checks at M89.
  ontology: "o",
  material: "m",
  exports: "e",
};

const TAB_BINDINGS: readonly Binding[] = STUDY_TABS.map((tab) => ({
  id: `go-tab-${tab}`,
  keys: `g ${TAB_KEY[tab]}`,
  label: `Go to ${STUDY_TAB_LABEL[tab]}`,
  section: "move" as const,
  scope: "study" as const,
  effect: "navigate" as const,
  intent: { kind: "go-tab" as const, tab },
  control: `[data-testid="studytab-${tab}"]`,
}));

const STATION_BINDINGS: readonly Binding[] = STATIONS.map((station, i) => ({
  id: `go-station-${station.id}`,
  keys: String(i + 1),
  label: `Go to ${station.label}`,
  section: "stations" as const,
  scope: "study" as const,
  effect: "navigate" as const,
  intent: { kind: "go-station" as const, station: station.id },
  control: `.rail-item[data-station="${station.id}"]`,
}));

export const BINDINGS: readonly Binding[] = [
  ...TAB_BINDINGS,

  {
    id: "cycle-tab-prev",
    keys: "[",
    label: "Go to previous view",
    section: "move",
    scope: "study",
    effect: "navigate",
    intent: { kind: "cycle-tab", delta: -1 },
  },
  {
    id: "cycle-tab-next",
    keys: "]",
    label: "Go to next view",
    section: "move",
    scope: "study",
    effect: "navigate",
    intent: { kind: "cycle-tab", delta: 1 },
  },
  {
    id: "go-studies",
    keys: "g s",
    label: "Go to projects",
    section: "move",
    scope: "global",
    effect: "navigate",
    intent: { kind: "go-route", hash: "#/studies" },
  },
  {
    id: "go-intro",
    keys: "g i",
    label: "Go to front page",
    section: "move",
    scope: "global",
    effect: "navigate",
    intent: { kind: "go-route", hash: "#/" },
  },

  ...STATION_BINDINGS,

  {
    id: "list-next",
    keys: "j",
    label: "Go to next item",
    note: "Moves within the loop of steps, the bias grid, or whichever list has focus.",
    section: "lists",
    scope: "global",
    effect: "focus",
    intent: { kind: "rove", delta: 1 },
  },
  {
    id: "list-prev",
    keys: "k",
    label: "Go to previous item",
    section: "lists",
    scope: "global",
    effect: "focus",
    intent: { kind: "rove", delta: -1 },
  },
  {
    id: "grid-arrows",
    keys: "Arrow keys",
    label: "Go to adjacent item",
    note: "The loop of steps and the bias grid are one tab stop each, so Tab leaves the group and the arrows move inside it.",
    section: "lists",
    scope: "global",
    effect: "focus",
    intent: { kind: "rove", delta: 1 },
  },

  {
    id: "open-fold",
    keys: "Enter",
    label: "Open section",
    note: "Space does the same. You can open a document row on Sources, a passage inside that row or any other section in the app. Abductive records each passage that you open, and each recorded passage adds to the counts on Sources.",
    section: "folds",
    scope: "global",
    effect: "reveal",
    intent: { kind: "browser-opens-a-fold" },
  },

  {
    id: "focus-primary-input",
    keys: "/",
    label: "Go to main field",
    section: "controls",
    scope: "global",
    effect: "focus",
    intent: { kind: "focus", target: "primary-input" },
    control: '[data-kbd="primary-input"]',
  },
  {
    id: "focus-send",
    keys: "Mod+Enter",
    label: "Go to Send",
    note: "Focus moves to the button, and you press it to send.",
    section: "controls",
    scope: "global",
    effect: "focus",
    intent: { kind: "focus", target: "send" },
    whileTyping: true,
    control: '[data-testid="send-answer"]',
  },
  {
    id: "focus-decline",
    keys: "Mod+Shift+D",
    label: "Go to Reject",
    note: "You open the reason field when you press the control. Abductive records your rejection and your reason, and everything that you reject stays on the list.",
    section: "controls",
    scope: "global",
    effect: "focus",
    intent: { kind: "focus", target: "decline" },
    whileTyping: true,
    control: '.decision-group button[data-role="decline"]',
  },
  {
    id: "focus-decline-reason",
    keys: "Mod+Shift+N",
    label: "Go to reason",
    section: "controls",
    scope: "global",
    effect: "focus",
    intent: { kind: "focus", target: "decline-reason" },
    whileTyping: true,
    control: ".decision-reason .reason",
  },

  {
    /* M38, ISC-494. The record is reachable from every tab now, so it is worth a
     * key, and it takes the shape every control in this section takes: the key
     * moves focus to the control and the researcher presses it. Opening the
     * record writes nothing and calls nothing, so a reveal would have been
     * defensible; focus is what keeps one path to the panel, since the control
     * in the header is what the shell listens to. */
    id: "focus-record",
    keys: "g r",
    label: "Go to History",
    note: "Focus moves to the History control in the project header. Press that control to open History.",
    section: "controls",
    scope: "study",
    effect: "focus",
    intent: { kind: "focus", target: "record" },
    control: '[data-kbd="record"]',
  },

  {
    id: "open-sheet",
    keys: "?",
    label: "Open shortcuts",
    section: "help",
    scope: "global",
    effect: "reveal",
    intent: { kind: "open", overlay: "sheet" },
  },
  {
    id: "open-palette",
    keys: "Mod+K",
    label: "Open search",
    note: "The search takes you to each result and leaves your project as it is.",
    section: "help",
    scope: "global",
    effect: "reveal",
    intent: { kind: "open", overlay: "palette" },
    whileTyping: true,
  },
  {
    id: "close-overlay",
    keys: "Escape",
    label: "Close",
    section: "help",
    scope: "global",
    effect: "dismiss-overlay",
    intent: { kind: "close-overlay" },
    whileTyping: true,
  },
];

/**
 * The bindings the matcher listens for. Two rows on the sheet are not chords
 * this layer resolves, and both are printed for the same reason: the sheet is
 * the app's one statement of what the keyboard does, so a key that works has to
 * appear on it whoever implements the key.
 *
 * `Arrow keys` is handled inside the roving group that owns it, because which
 * direction means what depends on whether the group is a list or a grid.
 * `Enter` on a fold is the browser's, and binding it here would be worse than
 * useless: a global Enter listener would fire on every button in the app.
 */
export const LISTENED: readonly Binding[] = BINDINGS.filter(
  (b) => b.keys !== "Arrow keys" && b.intent.kind !== "browser-opens-a-fold",
);

/** The prefixes a sequence can start with, derived rather than declared. */
export const PREFIXES: ReadonlySet<string> = new Set(
  LISTENED.map((b) => b.keys.split(" ")).filter((parts) => parts.length > 1).map((parts) => parts[0] ?? ""),
);

export function bindingsInScope(scope: Scope): readonly Binding[] {
  return BINDINGS.filter((b) => b.scope === "global" || b.scope === scope);
}

export function bindingsInSection(section: SectionId, scope: Scope): readonly Binding[] {
  return bindingsInScope(scope).filter((b) => b.section === section);
}
