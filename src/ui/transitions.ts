/**
 * Following one element to where it lands (M39, ISC-504).
 *
 * Two gestures in the tool move a thing the researcher pressed to somewhere
 * else on screen: the record opening over the tab they are standing on, and
 * the step card changing as they move along the rail. (A flag taken from
 * Checks to the conversation was a third until M89.) Each of those is a place where a reader
 * has to work out for themselves that the thing they just pressed became the
 * thing now in front of them. A transition says it instead.
 *
 * Nothing else. There is no page cross-fade, no list stagger and no entrance
 * animation, and `tests/view-transitions.test.ts` counts the names in `src/` so
 * a third cannot arrive quietly.
 *
 * ## Why this is a helper rather than a call at each site
 *
 * Three things have to be true at every call and exactly one of them is about
 * the animation:
 *
 *  - **`flushSync`.** React 18 has no `<ViewTransition>`, so the DOM change has
 *    to happen inside the callback `startViewTransition` gives us. React
 *    batches state updates, so without a synchronous flush the callback returns
 *    before anything has changed, the browser captures the same DOM twice, and
 *    the result is a wasted frame and no animation. It fails silently, which is
 *    the worst way for it to fail.
 *  - **Reduced motion.** Checked here, before the API is touched, so the
 *    pseudo-elements are never created at all. `base.css` carries a second
 *    guard for a transition started by anything else; two guards because the
 *    first one is a promise made in TypeScript and the second is one made in
 *    the cascade.
 *  - **The feature check.** A browser without the API gets the plain
 *    navigation, which is what the app did before this file existed.
 *
 * Any one of the three forgotten at a call site is a defect that looks like
 * nothing. So there are no call sites: there is this.
 *
 * ## The hash router, and why arming is separate from starting
 *
 * `navigate()` writes `window.location.hash`, the browser fires `hashchange`,
 * and `useRoute` in routes.ts turns that into state. The DOM change is the
 * `setRoute`, not the `navigate`, and the two are separated by an event, so a
 * caller cannot wrap the change it wants. It arms instead: one module-scoped
 * slot, written by the caller, read and cleared by the one `hashchange`
 * listener that renders a route. Cleared on every event whether it was set or
 * not, so a hash change nobody armed can never inherit a name left behind by
 * one that was.
 *
 * `routes.ts` imports this file and this file imports nothing of it, which is
 * deliberate: the arming slot and the navigation live one import apart rather
 * than in a cycle.
 */

import { flushSync } from "react-dom";

/**
 * The three names, and the fact that there are three.
 *
 * A `view-transition-name` must be unique per frame: two elements carrying one
 * name kills the transition outright, and the browser logs nothing. So the
 * names are declared here, once, and every element that wears one wears it
 * from this table.
 */
export const TRANSITION = {
  /* M89: `finding`, a flag row travelling to its invitation card on Design, went with the checks. */
  /** The record's control in the study header, travelling to the record panel. */
  record: "vt-record",
  /** The step card, morphing from the step you left to the step you arrived at. */
  step: "vt-step",
} as const;

export type TransitionName = (typeof TRANSITION)[keyof typeof TRANSITION];

/** A document that may or may not have the API. Narrowed rather than cast at each use. */
type MaybeTransitioningDocument = Document & {
  startViewTransition?: (callback: () => void) => { readonly finished: Promise<void> };
};

/** Whether the researcher has asked for less movement. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    /* A window without matchMedia is a test environment or a very old browser.
     * Treating that as "reduce" would turn the transitions off everywhere they
     * are hardest to notice; treating it as "no preference" and then failing
     * the feature check below is the honest order. */
    return false;
  }
}

/** Whether a transition would run right now, if one were asked for. */
export function transitionsAvailable(): boolean {
  if (prefersReducedMotion()) return false;
  return typeof (document as MaybeTransitioningDocument).startViewTransition === "function";
}

/**
 * Make the change, inside a transition where there is one to be inside.
 *
 * The `change` is synchronous by signature and that is a constraint rather than
 * a convenience: a transition is a way of following something that has already
 * happened, so there is nowhere here to put a request, a model call or an
 * append. If a caller has to await something, it awaits it first and calls this
 * with what is left.
 */
export function withTransition(change: () => void): void {
  if (!transitionsAvailable()) {
    change();
    return;
  }
  const doc = document as MaybeTransitioningDocument;
  doc.startViewTransition?.(() => {
    flushSync(change);
  });
}

/**
 * The name a `hashchange` about to arrive should animate under, if any.
 *
 * One slot. One writer, `armTransition`. One reader, `takeArmedTransition`,
 * which clears it as it reads.
 */
let armed: TransitionName | null = null;

/** Say that the next route change is the landing of this gesture. */
export function armTransition(name: TransitionName): void {
  armed = name;
}

/** Read the armed name and clear the slot, whether or not one was set. */
export function takeArmedTransition(): TransitionName | null {
  const name = armed;
  armed = null;
  return name;
}

/* `markTransitionOrigin`, which marked the one pressed flag row on Checks for
 * the frame it travelled to the conversation, went with the checks at M89. */
