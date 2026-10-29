/**
 * A panel over the page, extracted from ShortcutSheet (M39, ISC-503).
 *
 * Below 1100px Design is one column and the companion is reachable as a sheet.
 * There was no sheet component in the app, and two near-identical ones already:
 * `keyboard/ShortcutSheet.tsx` and `RecordPanel.tsx` both wrap a native
 * `<dialog>` in the same four lines, for the same four reasons. Writing a third
 * is the shape `Disclosure` and M32's route chip (retired at M62) were split to avoid.
 *
 * A native `<dialog>` rather than a hand-rolled overlay, which is
 * `ShortcutSheet`'s own argument and is kept: focus is trapped while it is open
 * and handed back to the control that opened it, Escape closes it, the rest of
 * the page goes inert, and the backdrop is the platform's rather than a div held
 * in front of everything by a z-index nobody can audit.
 *
 * What this does not own is what is inside it. The sheet is a frame; every
 * caller writes its own body, and no caller gets a fold inside it, because two
 * levels of disclosure is the ceiling and the sheet is one of them.
 */

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Sheet(props: {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The heading, which is also what a screen reader announces on open. */
  readonly title: string;
  readonly className?: string;
  readonly testId?: string;
  /**
   * Close on a press outside the panel (M70, the owner: the card overlay closes
   * "on a click outside"). A press on the backdrop lands on the dialog itself,
   * since the body fills the panel, so the target tells the two apart.
   */
  readonly closeOnBackdrop?: boolean;
  readonly children: ReactNode;
}) {
  const { open, onClose, title, className, testId, children } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    /* Escape and the backdrop close it without going through the control, so the
     * dialog's own close event is what the state follows. Both callers had this
     * line and both had the comment; it is written once now. */
    const onNativeClose = () => onClose();
    dialog.addEventListener("close", onNativeClose);
    return () => dialog.removeEventListener("close", onNativeClose);
  }, [onClose]);

  return (
    <dialog
      className={className === undefined ? "sheet" : `sheet ${className}`}
      ref={ref}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (props.closeOnBackdrop === true && e.target === e.currentTarget) onClose();
      }}
      {...(testId === undefined ? {} : { "data-testid": testId })}
    >
      <div className="sheet-body">
        <header className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="btn-bare"
            onClick={onClose}
            {...(testId === undefined ? {} : { "data-testid": `${testId}-close` })}
          >
            Close
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
