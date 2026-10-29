/**
 * The keyboard model, in one import (FND-02).
 *
 * Surface builders need three things from here and should not need a fourth:
 * `KeyboardLayer`, which AppShell already mounts; the table, if they want to
 * print a binding beside a control; and the roving contract, which is two data
 * attributes rather than a component. Everything else is internal.
 */

export { KeyboardLayer } from "./KeyboardLayer.tsx";
export { useHotkeys } from "./useHotkeys.ts";
export { Caps } from "./Caps.tsx";
export {
  BINDINGS,
  LISTENED,
  SECTIONS,
  INTENT_KINDS,
  bindingsInScope,
  bindingsInSection,
  type Binding,
  type Intent,
  type KeyEffect,
  type Overlay,
  type Scope,
  type Section,
  type SectionId,
} from "./bindings.ts";
export { ROVING_GROUPS, syncRoving, moveRoving, type RovingGroup } from "./roving.ts";
export { TARGET_SELECTORS, ariaKeyshortcut, resolveTarget, type TargetName } from "./targets.ts";
export { keyCaps, modLabel, isTypingTarget, resolveStroke, strokeToken } from "./chords.ts";
