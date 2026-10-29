/**
 * Reload when the study's record is written, here or in another tab.
 *
 * The ledger provider re-reads its own events on the same signal. This is for
 * the other half: the project record, which holds the brief and the title and
 * is not a projection of the ledger, so a tab that never reloads it goes on
 * showing a framing that is no longer stored.
 *
 * A callback rather than data. Every surface that holds a project already knows
 * how to fetch one, and handing back a project here would mean two loaders for
 * one record with two chances to disagree about normalisation.
 *
 * Two signals, not one (M41). The cross-tab one is `studyChannel`, and it cannot
 * be the only one: a `BroadcastChannel` never delivers to the tab that posted,
 * by design and in both of `studyChannel`'s implementations, because a tab
 * re-reading on its own write would loop. That was fine while the only writer of
 * the framing was a component inside the surface that had to re-read it — the
 * band was mounted by the Workbench and handed the Workbench's own `reload`. It
 * stopped being fine when the framing became the shell's footer dock: the writer
 * is now three levels above the two surfaces that hold the same brief, so a save
 * in the dock has to reach the shell's `current`, the Workbench's `reload` and
 * StudyViews' `reread`, none of which is its parent.
 *
 * `announceHere` is the in-tab half. A document `CustomEvent` rather than
 * self-delivery on the channel, because self-delivery is the wrong fix in one
 * specific way: `ledgerContext` subscribes to the same channel and would then
 * re-read its own store on its own appends, which is the loop the channel was
 * built to avoid. One event, one listener per subscriber, filtered on the same
 * project id as the channel's messages.
 */

import { useEffect } from "react";
import { studyChannel, type StudyChange } from "./studyChannel.ts";

/**
 * The in-tab counterpart of a `StudyChange` on the channel.
 *
 * Written down here, beside the hook that listens for it, for the reason
 * `FRAMING_OPEN_EVENT` is written in `routes.ts`: two surfaces need the name and
 * a second one hand-rolling it is two names.
 */
export const STUDY_CHANGED_EVENT = "abductive:study-changed";

/** What an `abductive:study-changed` event carries. */
export interface StudyChangedDetail {
  readonly projectId: string;
}

/**
 * Tell this tab's own subscribers that the study's record moved.
 *
 * Never throws, the same call `announce` makes about the channel: freshness is
 * not worth losing a save over, and a runtime with no `document` at all (a build
 * step importing this module for a type) must not be broken by the attempt.
 */
export function announceHere(projectId: string): void {
  try {
    document.dispatchEvent(
      new CustomEvent<StudyChangedDetail>(STUDY_CHANGED_EVENT, { detail: { projectId } }),
    );
  } catch {
    /* The surfaces re-read on their next route change instead. */
  }
}

export function useStudyFreshness(projectId: string, reload: () => void): void {
  useEffect(() => {
    const unsubscribe = studyChannel().subscribe((change: StudyChange) => {
      if (change.projectId !== projectId) return;
      reload();
    });
    const onHere = (event: Event) => {
      const detail = (event as CustomEvent<Partial<StudyChangedDetail>>).detail;
      if (detail?.projectId !== projectId) return;
      reload();
    };
    document.addEventListener(STUDY_CHANGED_EVENT, onHere);
    return () => {
      unsubscribe();
      document.removeEventListener(STUDY_CHANGED_EVENT, onHere);
    };
  }, [projectId, reload]);
}
