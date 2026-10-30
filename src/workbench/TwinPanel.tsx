/**
 * The modal twin, gated (M7 parity; carries ISC-30, ISC-31, ISC-42 forward,
 * and delivers ISC-66/67 to the surface).
 *
 * The gating is the whole point and it survives the v2 rewrite unchanged: the
 * baseline is generated early and never shown until the researcher's own
 * ontology has a shape of its own. Showing it sooner would make it a template.
 * v1 gated on reaching the anomaly stage; there are no stages now, so the gate
 * is the ontology itself — a puzzle root and enough pages to have committed to
 * something. Both reveal paths log a `reveal` event, exactly as before.
 *
 * On the on-demand path the warning is stated plainly rather than buried in a
 * confirm dialog, because the risk is real: once you have seen the modal
 * design you cannot un-see it, and any convergence afterwards is unreadable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LedgerEvent } from "../ledger/events.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { livePages, pagesOfType } from "../ontology/schema.ts";
import { compareToTwin, type TwinComparison } from "../twin/compare.ts";
import { extractTwinOntology } from "../twin/twinOntology.ts";
import { generateAndStoreTwin, makeRevealEvent, type ModalTwin } from "../twin/twin.ts";
import { activeInferenceClient } from "../ui/personaRun.ts";
import type { Project } from "../state/projects.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { Disclosure } from "../ui/components/index.ts";
// Both lists below printed "(analytic-residue)" beside a title, which is the
// same leak the ontology index and the exported legend were carrying, on a
// panel whose whole job is to hand the researcher two accounts of the same
// study side by side. Two lists that name the same kind of page two ways
// cannot be compared.
import { pageTypeLabel } from "../ui/pageTypeVocabulary.ts";

/** Enough of an ontology to have committed to something of your own. */
export function revealGateOpen(graph: OntologyGraph): boolean {
  return graph.puzzleRoots.length > 0 && livePages(graph).length >= 4;
}

/**
 * When the wait stops being ordinary (M47).
 *
 * The call is two model round trips, writing the baseline and then reading an
 * ontology back out of it, so a minute is normal and two is not alarming. The
 * ceiling is where the tool stops promising a minute and starts offering the
 * press again, which is the only thing a reader can do about it.
 */
export const TWIN_SLOW_AFTER_SECONDS = 75;

/**
 * What the reader is told while the ordinary version is being written (M47).
 *
 * "I clicked on 'the ordinary version of your study' button and it says writing
 * it, but I'm not sure if it's actually doing anything." (Matthew, demo of
 * 2026-09-13.) The button's label was the whole of the feedback, the call takes
 * about a minute, and nothing said where the result would land.
 *
 * A pure function because the three things it has to get right are a matter of
 * arithmetic: the count is only spoken once a whole second has passed, the
 * promise of a minute is withdrawn once the call has outlived one, and the
 * sentence never claims a duration the clock does not support. On the hosted
 * site with no model key the mock returns inside a frame, so the first branch
 * has to read correctly with nothing to count.
 */
export function twinStatusLine(elapsedSeconds: number): {
  readonly text: string;
  readonly slow: boolean;
} {
  const counted =
    elapsedSeconds < 1
      ? ""
      : `${elapsedSeconds} second${elapsedSeconds === 1 ? "" : "s"} so far. `;
  const opening = `Abductive is writing the ordinary version of your project. ${counted}`;
  if (elapsedSeconds >= TWIN_SLOW_AFTER_SECONDS) {
    return {
      text: `${opening}Abductive is taking longer than usual. Wait, or try again.`,
      slow: true,
    };
  }
  return {
    text: `${opening}The version appears under this button when Abductive is done, usually within a minute.`,
    slow: false,
  };
}

export function TwinPanel(props: {
  project: Project;
  graph: OntologyGraph;
  events: readonly LedgerEvent[];
}) {
  const { project, graph, events } = props;
  const { appendAll } = useLedger();
  const [twin, setTwin] = useState<ModalTwin | null>(null);
  const [comparison, setComparison] = useState<TwinComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const inFlight = useRef(false);
  /* The clock under the button (M47). `startedAt` is state rather than a ref
   * because the line has to redraw every second, and the run counter is what
   * lets a second press supersede the first: the abandoned call still resolves,
   * and without the counter it would write its result over the newer one. */
  const [elapsed, setElapsed] = useState(0);
  const runId = useRef(0);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    setElapsed(0);
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, [busy]);

  const gated = revealGateOpen(graph);
  const alreadyRevealed = events.some((e) => e.type === "reveal" && e.subject === "modal-twin");

  const reveal = useCallback(
    async (via: "stage-gate" | "on-demand", restart = false) => {
      // A restart is the one press allowed past the guard, because the whole
      // point of offering it is that the first call has not come back.
      if (inFlight.current && !restart) return;
      runId.current += 1;
      const run = runId.current;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      try {
        const { client } = activeInferenceClient();
        /* The expectations, not the corpus (M29, A6). The ordinary version is
         * the study these papers would lead a competent person to design, so
         * what it needs is what the researcher has accepted out of them. A
         * stored twin is returned untouched, so a study whose baseline predates
         * this change keeps its three facets. */
        const claims = pagesOfType(graph, "theory").map((page) => ({
          title: page.title,
          body: page.body,
        }));
        const baseline = await generateAndStoreTwin({ project, claims, client });
        const twinOntology = await extractTwinOntology(baseline, client);
        if (run !== runId.current) return;
        setTwin(baseline);
        setComparison(compareToTwin(graph, twinOntology.graph));
        // Every reveal is logged, both paths, no exceptions — the whole
        // measurement depends on knowing when the researcher saw this.
        await appendAll([makeRevealEvent(project.id, via)]);
      } catch (err) {
        if (run !== runId.current) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (run === runId.current) {
          setBusy(false);
          setConfirming(false);
          inFlight.current = false;
        }
      }
    },
    [project, graph, appendAll],
  );

  const status = twinStatusLine(elapsed);

  return (
    <section className="twin-panel" data-testid="twin-panel">
      {/* M80, ISC-689: the panel lives in the dialog that the Modal framing
          flag opens, and the dialog's heading names it. */}

      {twin === null && (
        <>
          {/*
            * This used to say the baseline "was generated from your brief and
            * has been sitting unread", which was false in exactly the branch
            * that rendered it: this block only shows when no twin is stored.
            * Nothing had been generated and nothing was sitting anywhere. The
            * gating argument survives the correction intact: the baseline is
            * built from the brief and from the expectations the researcher
            * accepted out of the papers, so it stays a fair comparison whenever
            * it is made. What it cannot be is a thing that already happened.
            *
            * M29, A6. It used to say "the brief and the material". The material
            * never reached it in any form but a count, and the count is gone;
            * the accepted theory claims arrived in its place, because "the
            * ordinary version" needs a literature to be ordinary with respect
            * to. Those claims are pages of the researcher's model, which is the
            * one place this comparison is now less independent than it was, and
            * the copy below says so rather than keeping the old sentence.
            */}
          {/* R3 item 6. One sentence before the button; the fairness argument
              and the warning about reading it early are a fold, because both
              are answers to "why" and neither changes what you press. */}
          <p className="small muted">
            See the design of an ordinary, by-the-book version of this project, then compare your design
            with the ordinary version.
          </p>
          <Disclosure summary="Learn more" testId="twin-why">
            <p className="small muted">
              Abductive writes the ordinary version only from your starting point and the expectations that
              you took from the papers. If you open the ordinary version early, you can't tell
              afterward whether you followed the ordinary version or reached the same design on your own.
            </p>
          </Disclosure>
          {gated ? (
            <button
              type="button"
              onClick={() => void reveal("stage-gate")}
              disabled={busy}
              data-testid="twin-reveal"
            >
              {busy ? "Writing…" : "Compare versions"}
            </button>
          ) : confirming ? (
            <div data-testid="twin-warning">
              {/* M80: the claim count went. The walk read "Your model has 0 claims"
                  over a project built from 22 concepts. */}
              <p className="warn small">
                Opening the ordinary version now will shape what you build next, and you will not be
                able to tell afterwards whether you converged on it or arrived there yourself.
                Abductive records that you opened it either way.
              </p>
              <button type="button" onClick={() => void reveal("on-demand")} data-testid="twin-reveal-anyway">
                Show anyway
              </button>
              {/* "Back", not "Not yet". This control closes the confirm and
                  writes nothing at all, and "Not yet" is a decision verb
                  everywhere else in the app: the station row wore it for a
                  defer that appends a bound event and redraws the rail. A
                  control that looks like a recorded declination and records
                  nothing is the one thing this tool cannot afford to ship.
                  "Back" is what DecisionGroup and FindingRow already call
                  leaving a panel without deciding. */}
              <button type="button" className="btn-bare" onClick={() => setConfirming(false)}>
                Back
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} data-testid="twin-request">
              Compare early
            </button>
          )}
          {/* What is happening, where the result lands, and how long it has been
              going (M47).
              
              The button's label said "Writing the ordinary version…" and nothing else did, on a
              call that takes about a minute and lands its result somewhere the
              reader had not been told about. `role="status"` so a screen reader
              hears the change without the focus moving, and `aria-live="polite"`
              so it waits for a gap rather than cutting in every second. */}
          {busy && (
            <div className="twin-status" data-testid="twin-status">
              <p className="small muted" role="status" aria-live="polite">
                {status.text}
              </p>
              {status.slow && (
                <button
                  type="button"
                  className="btn-quiet"
                  data-testid="twin-restart"
                  onClick={() => void reveal(gated ? "stage-gate" : "on-demand", true)}
                >
                  Try again
                </button>
              )}
            </div>
          )}
          {alreadyRevealed && (
            <p className="small muted">You opened this before, and the entry is in History.</p>
          )}
        </>
      )}

      {error !== null && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}

      {comparison !== null && (
        <div data-testid="twin-comparison">
          <p>{comparison.summary}</p>
          {comparison.researcherOnly.length > 0 && (
            <>
              <h4 className="small">Claims only you made</h4>
              <ul className="small">
                {comparison.researcherOnly.map((c) => (
                  <li key={c.pageId}>
                    {c.title} <span className="muted">({pageTypeLabel(c.type)})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {comparison.twinOnly.length > 0 && (
            <>
              <h4 className="small">Conventional choices you haven't made</h4>
              <ul className="small">
                {comparison.twinOnly.map((c) => (
                  <li key={c.pageId}>
                    {c.title} <span className="muted">({pageTypeLabel(c.type)})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
