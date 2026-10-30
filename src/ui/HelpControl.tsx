/**
 * One Help control per page, at the top right (M62, ISC-600).
 *
 * The owner, 2026-09-30: "there should be a help button at the top right, which
 * is contextually aware. Based on the page you're on, it should provide
 * explanations of what the page is trying to accomplish. If the user wants to
 * search for more help, there should be an option to get more help."
 *
 * It replaces M32's "?" chip, which was a `<details>` holding one route's
 * lede, anchored to a different corner on each page. This is one control in one
 * place: the study header's right end, and the head of Projects and Model
 * access. The words are `pageHelp.ts`'s, so the panel and the tests read one
 * table.
 *
 * M95c (Matthew, 2026-10-30, "Same panel, chat first"): the help chat opens the
 * panel, and the page's explanation folds under it as About this page.
 *
 * A native button, so Enter and Space open it with no key handling written
 * here. Opened, the question box takes focus (the panel, with no model); Escape and Close shut it and hand focus
 * back to the "?", and a press outside shuts it without moving focus. The panel
 * is a non-modal dialog: the page behind stays live, which is the point of help
 * that sits beside the thing it explains.
 */

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { stationById, isStationId } from "../flow/stations.ts";
import { walkPath } from "./routes.ts";
import { PAGE_HELP, type HelpPage, type HelpPart } from "./pageHelp.ts";
import type { Project } from "../state/projects.ts";
import { HelpChat } from "./HelpChat.tsx";

export function HelpControl(props: {
  readonly page: HelpPage;
  /** On Design, the step you are on: its own line joins the parts. */
  readonly station?: string;
  /** M95: the project a study page belongs to, which the help chat reads and records into. */
  readonly project?: Project;
  /** The help chat's client, for a test; the app leaves it to `activeInferenceClient`. */
  readonly inference?: ComponentProps<typeof HelpChat>["inference"];
}) {
  const { page, station, project, inference } = props;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const help = PAGE_HELP[page];

  /* A different page, or a different step, is a different panel. */
  useEffect(() => setOpen(false), [page, station]);

  useEffect(() => {
    if (!open) return;
    /* M95c: the question box takes focus when there is one; else the panel. */
    const box = panel.current?.querySelector<HTMLElement>('[data-testid="help-chat-input"]');
    (box ?? panel.current)?.focus();
    const outside = (e: PointerEvent) => {
      const at = e.target as Node | null;
      if (at !== null && !panel.current?.contains(at) && !trigger.current?.contains(at)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const step: HelpPart | null =
    page === "design" && station !== undefined && isStationId(station)
      ? { name: stationById(station).label, says: [stationById(station).blurb, stationById(station).feeds] }
      : null;
  /* The step's line second, after the loops it sits in. */
  const parts: readonly HelpPart[] =
    step === null ? help.parts : [help.parts[0]!, step, ...help.parts.slice(1)];

  return (
    <div className="page-help" data-testid="page-help">
      <button
        ref={trigger}
        type="button"
        className="page-help-trigger"
        aria-label="Help for this page"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        data-testid="page-help-open"
      >
        ?
      </button>
      {open && (
        <section
          ref={panel}
          id={panelId}
          className="page-help-panel"
          role="dialog"
          aria-labelledby={`${panelId}-title`}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
          data-testid="page-help-panel"
        >
          <p className="page-help-eyebrow">Help</p>
          <h2 className="page-help-title" id={`${panelId}-title`}>
            {help.title}
          </h2>
          {/* M95c (Matthew, 2026-10-30, "Same panel, chat first"): the help chat
              opens the panel, and the page's own explanation folds under it. */}
          <HelpChat
            page={page}
            {...(station === undefined ? {} : { station })}
            {...(project === undefined ? {} : { project })}
            {...(inference === undefined ? {} : { inference })}
            aboutPage={
              <details className="page-help-fold" data-testid="page-help-about">
                <summary>About this page</summary>
                {help.purpose.map((p) => (
                  <p key={p} className="page-help-purpose">
                    {p}
                  </p>
                ))}
                <h3 className="page-help-subhead">The parts of this page</h3>
                <dl className="page-help-parts">
                  {parts.map((part) => (
                    <div key={part.name} className="page-help-part">
                      <dt>{part.name}</dt>
                      {part.says.map((s) => (
                        <dd key={s}>{s}</dd>
                      ))}
                    </div>
                  ))}
                </dl>
                <p className="page-help-more-row">
                  <a className="btn" href={walkPath(help.screen)} data-testid="page-help-more">
                    More help
                  </a>
                </p>
              </details>
            }
          />
          <div className="page-help-foot">
            <button type="button" className="btn-quiet" onClick={close} data-testid="page-help-close">
              Close
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
