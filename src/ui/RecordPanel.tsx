/**
 * The record, from every tab (M38, ISC-494).
 *
 * The record of a study was mounted once, at the foot of Design, collapsed, and
 * reachable from one of the five tabs. Counted from Material, Checks or
 * Exports, the timeline of everything that happened was a tab change, a scroll
 * to the bottom of the longest page in the app, and a press: three levels deep
 * from the surfaces where a reader most often asks how something got there. The
 * interface research ranked making it reachable third of ten, and the tab test
 * it fails is NN/g's own, that tabs hurt when you need two of them at once.
 *
 * So it is a panel over whatever tab you are standing on, opened from a control
 * in the study header that is on all five. A native <dialog>, for the reasons
 * the shortcut sheet is one: focus is trapped while it is open and handed back
 * to the control afterwards, Escape closes it, the rest of the page goes inert,
 * and the backdrop is the platform's rather than a div held in front of
 * everything by a z-index nobody can audit.
 *
 * One level, and the timeline first. The panel opens straight onto the record
 * itself; there is no fold inside it that hides the timeline, which is the
 * whole of the guarantee ISC-494 asks for and the reason `Instrumentation`
 * takes a `hosted` prop rather than being dropped in as it stands.
 *
 * Every value here is a replay of the ledger, so opening the panel costs no
 * model call and writes nothing. The four projections are the ones
 * `Instrumentation` reads; they are computed here rather than through
 * `useWorkbench` because the workbench hook also generates interview moves,
 * which is work this panel has no use for on four of the five tabs.
 */

import { useEffect, useRef } from "react";
import type { LedgerEventType } from "../ledger/events.ts";
import { RECORD_TITLE } from "../workbench/Instrumentation.tsx";
/* The record's body, shared with the Design companion (M39, ISC-503). This file
 * is the dialog around it; the pane is a different frame around the same thing,
 * so there is one record rather than two surfaces that agree. */
import { RecordBody } from "./RecordBody.tsx";
// M39, ISC-504. The panel is where the header's control lands.
import { TRANSITION } from "./transitions.ts";

export function RecordPanel(props: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** The kinds the press that opened the panel was counting (D51, M43d). */
  kinds?: readonly LedgerEventType[];
}) {
  const { projectId, open, onClose, kinds } = props;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    /* Escape and the backdrop close it without going through the control, so
       the dialog's own close event is what the state follows. */
    const onNativeClose = () => onClose();
    dialog.addEventListener("close", onNativeClose);
    return () => dialog.removeEventListener("close", onNativeClose);
  }, [onClose]);

  return (
    <dialog
      className="recordpanel"
      ref={ref}
      aria-labelledby="recordpanel-title"
      data-testid="record-panel"
      /* The other end of the record transition (M39, ISC-504). The header's
         control wears this name while the panel is closed and the panel wears it
         while it is open, so the browser has one old element and one new one to
         match and never two of either. */
      style={open ? { viewTransitionName: TRANSITION.record } : undefined}
    >
      <div className="recordpanel-body">
        <header className="recordpanel-head">
          <h2 id="recordpanel-title">{RECORD_TITLE}</h2>
          <button
            type="button"
            className="btn-bare"
            onClick={onClose}
            data-testid="record-panel-close"
          >
            Close
          </button>
        </header>
        {/* Only once it has been opened. The body replays the whole ledger, and
            a study route should not pay for a surface the reader has not asked
            for; `active` is what carries that. */}
        <RecordBody projectId={projectId} active={open} {...(kinds === undefined ? {} : { kinds })} />
      </div>
    </dialog>
  );
}
