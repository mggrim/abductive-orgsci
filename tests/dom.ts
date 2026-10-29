/**
 * A DOM for the tests that render.
 *
 * Happy DOM registers into the process globals, and the process is shared by
 * every test file, so a second registration throws and an unregistration would
 * pull the DOM out from under a file that has not run yet. Registered once,
 * left in place, and the real timers are captured first because the registered
 * `setTimeout` belongs to the DOM's own task queue and does not settle a
 * promise chain the way a test needs.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

/** Bun's own timer, kept before the DOM replaces it. */
export const realTimeout: typeof setTimeout = globalThis.setTimeout;

export function useDom(): void {
  if (typeof (globalThis as { window?: unknown }).window !== "undefined") return;
  GlobalRegistrator.register();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
}

/** A promise that settles after `ms` of real time, not DOM time. */
export const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => realTimeout(resolve, ms));
