/**
 * Where the divider sits (M39, ISC-503; M59 took the companion out).
 *
 * Per browser, not per study's record. A pane width is the viewer's and not the
 * study's, the same argument M38 makes for the since-last-here timestamp: the
 * record is what happened in the research, and how wide someone dragged a
 * divider is not that. So it is `localStorage`, keyed by study, and nothing here
 * ever reaches the ledger.
 *
 * Worth stating plainly so nobody reads it as a conflict with
 * `auth/claudeAuth.ts`, whose rule is absolute: **keys** never go in
 * `localStorage`. A pane width is not a key.
 *
 * Every read and write is in a `try`/`catch` and every malformed value is the
 * default. A browser in private mode, a quota that is full, a user who has
 * blocked site data, and a value written by a future version of this file all
 * arrive here as the same thing: a study that opens with the default
 * arrangement, which is a perfectly good study. Nothing about the pane is
 * allowed to be a reason the page does not render.
 */

/* M59, ISC-572. The companion went: Matthew, 2026-09-27, "remove the papers
 * from the sidebar of the design, since this can jsut be in the material tab".
 * The right pane holds the step's summary now, which is not a choice, so there
 * is nothing to remember but the width. A `companion` a browser stored before
 * M59 is read past and dropped by the next write. */

export interface PaneState {
  /** The left pane's share of the frame, between the bounds below. */
  readonly left: number;
}

/**
 * The bounds, and what they are for.
 *
 * Not a gate on anything: they are a constraint on a control, which is the
 * distinction ISC-82 draws. What they stop is a drag that destroys the surface.
 * The left minimum is what keeps the box the researcher types in at its measure,
 * and the right is what keeps the right pane readable rather than a column of
 * broken words.
 */
export const PANE_MIN = 0.35;
export const PANE_MAX = 0.75;

export const DEFAULT_PANE: PaneState = { left: 0.58 };

export function paneKey(projectId: string): string {
  return `abductive:pane:${projectId}`;
}

/** Read this browser's arrangement for this study. Never throws. */
export function readPaneState(projectId: string): PaneState {
  try {
    const raw = globalThis.localStorage?.getItem(paneKey(projectId));
    if (raw === null || raw === undefined) return DEFAULT_PANE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_PANE;
    const it = parsed as Record<string, unknown>;
    const left =
      typeof it.left === "number" && Number.isFinite(it.left)
        ? Math.min(PANE_MAX, Math.max(PANE_MIN, it.left))
        : DEFAULT_PANE.left;
    return { left };
  } catch {
    return DEFAULT_PANE;
  }
}

/** Remember it for next time. Never throws, and failing to store costs nothing. */
export function writePaneState(projectId: string, state: PaneState): void {
  try {
    globalThis.localStorage?.setItem(paneKey(projectId), JSON.stringify({ left: state.left }));
  } catch {
    /* A browser that will not store this is one where the panes still work and
     * open at the default next time. Nothing else depends on it. */
  }
}
