/**
 * The single surface, now with a spine (ISC-59, ISC-61, ISC-80 … ISC-94).
 *
 * M5 built one flat surface to escape v1's three staged screens. That fixed
 * the gating and lost the orientation with it: nine panels went up at once and
 * nothing on screen said where you were in the arc of designing a study, so
 * the first move was to scan rather than to think. M8 puts the sequence back
 * as a *rail* — visible, clickable, never blocking.
 *
 * Material and exports moved out to their own study views at M12 and the
 * dialogue moved into the station column at M14. At M26 the right column
 * emptied entirely: the graph, the pages and the tray to the Ontology view,
 * the modal baseline to Coherence. This view is one column, and it is one
 * question, somewhere to answer it, and what was said at this station.
 *
 * The commitment that survived all of that, and the reason v2 exists: the
 * researcher must never be making claims about a model they cannot reach
 * (ISC-92, ISC-93, ISC-94). v1 had staged screens where you argued about an
 * ontology that was off-screen. That was read for eighteen milestones as "the
 * graph lives in this view's right column", and the graph is not the ontology
 * — at two pages it was 420px of white holding two truncated labels above a
 * list that said more in a tenth of the room. The property is structural now:
 * this view renders no ontology surface, so no station change can remount one,
 * and the route is on the tab bar at every station. `flow-discipline` pins
 * both halves.
 *
 * The dialogue is scoped to the focused station. Turns carry the station they
 * were taken at, so answering here is answering about *this* station, and the
 * whole conversation is on the Ontology view. Two things that are deliberately
 * not scoped: the interviewer's prompt still receives every turn, because a
 * model that forgets the study each time you move along the rail is worse than
 * a long prompt; and a question opened at another station blocks this one,
 * with a line saying where it is, because pretending you can answer it here
 * would put an answer box under a question that is not shown.
 *
 * Dialogue sits beside StationWorkspace rather than inside it, so a station
 * change reconciles it instead of dropping an in-flight streaming answer.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
// M39, ISC-503. The divider and the per-browser state that remembers its place.
// The companion and its sheet went at M59 (ISC-572).
import { Separator } from "../ui/components/Separator.tsx";
import { stationById } from "../flow/stations.ts";
import { gateSentence, gatedStations } from "../flow/loopGate.ts";
// M58, ISC-567. The tool's puzzle reading, offered at the puzzle step.
import { PuzzleOffer } from "../flow/PuzzleOffer.tsx";
import { PANE_MAX, PANE_MIN, readPaneState, writePaneState, type PaneState } from "./paneState.ts";
import { emptyBrief, getProject, listDocuments, type Project } from "../state/projects.ts";
import { dataChunkCount, type StoredDocument } from "../state/chunks.ts";
import { Dialogue } from "./Dialogue.tsx";
import { OutstandingBar } from "./OutstandingBar.tsx";
import { useWorkbench } from "./useWorkbench.ts";
import { StationRail } from "../flow/StationRail.tsx";
import { SinceLastHere } from "../flow/SinceLastHere.tsx";
import { StationWorkspace } from "../flow/StationWorkspace.tsx";
// M41: `FramingBand` is no longer imported here. It is chrome, mounted by
// `AppShell` as the shell's second grid row; see the comment at the foot of this
// main where it used to be rendered.
import { nextStep } from "./NextBar.tsx";
import { declinedStations, stationStates } from "../flow/stationBrief.ts";
import { navigateWithTransition, studyPath } from "../ui/routes.ts";
// M39, ISC-504. Moving along the rail morphs the step card rather than replacing
// it; the name itself is on `.station` in design.css, which is the one element
// that can ever carry it on this route.
import { TRANSITION } from "../ui/transitions.ts";
import { isStationId, type StationId } from "../flow/stations.ts";

import { MAIN_LANDMARK_ID } from "../ui/landmarks.ts";
// M32, R6. The route lede left the page body without losing a word.
import { useStudyFreshness } from "../state/useStudyFreshness.ts";

/**
 * Above this Design is two panes; below it, one column and a sheet.
 *
 * 1100, which is `styles-integrity`'s "responsive behaviour exists above 1100px"
 * number and every prose breakpoint in the stylesheet directory. The two other
 * numbers in that directory are about different questions and are deliberately
 * not reused here: 1000 in `panels.css` is whether a 320px pane fits beside a
 * `1fr` pane, and 1180 in `AppShell.tsx` is whether 224px of rail is affordable.
 */
const TWO_PANES_ABOVE = "(min-width: 1101px)";

export function Workbench(props: { projectId: string; station: StationId }) {
  const { projectId, station } = props;
  const wb = useWorkbench(projectId, station);
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [documents, setDocuments] = useState<readonly StoredDocument[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);
  /* And when another tab writes to this study (walk finding). The ledger
   * refreshes itself on the same signal; this is the project record, which is
   * not a projection of the ledger and so has to be fetched again. */
  useStudyFreshness(projectId, reload);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getProject(projectId), listDocuments(projectId)]).then(([p, docs]) => {
      if (cancelled) return;
      setProject(p);
      setDocuments(docs);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, reloadKey]);

  const declined = declinedStations(wb.events);
  /* M89 (2026-10-14): the rail dot read the open flags at each step here
   * (`flaggedStations` over `openFindings`) until the checks left main. */
  const states = stationStates(
    project?.brief ?? emptyBrief(),
    /* Data only (D12). This is the count the rail dot reads, and it was the
     * whole study's: one PDF on the reading list marked Early data answered. */
    dataChunkCount(wb.chunks),
  );

  /* Moving along the rail (M39, ISC-504).
   *
   * The step card at the step you left becomes the step card at the step you
   * arrive at, which is one element under one name rather than a card leaving
   * and another arriving. Every other route change in the app is unarmed and so
   * animates nothing. */
  /* Two panes, and the one number that decides it (M39, ISC-503).
   *
   * 1100 is the number `styles-integrity`'s "responsive behaviour exists above
   * 1100px" test uses and the number every prose breakpoint in the stylesheet
   * directory uses. Not 1000, which `panels.css` uses, because that one is about
   * whether a 320px pane fits beside a `1fr` pane; and not 1180, which
   * `AppShell.tsx` uses, because that one is about whether 224px of rail is
   * affordable. Three numbers in one directory is exactly the confusion
   * `panels.css` documents at length, so this one says which of the three it is.
   *
   * Read from the viewport rather than persisted, the same way the rail's fold
   * is: it is a response to how much room there is, not a preference. */
  const [twoPanes, setTwoPanes] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(TWO_PANES_ABOVE).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(TWO_PANES_ABOVE);
    const onChange = (e: MediaQueryListEvent) => setTwoPanes(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  /* The divider's place, per browser and per study. Read once on mount, written
   * on every change, both in try/catch inside paneState.ts. A study whose stored
   * value is missing or malformed opens at the default. */
  const [pane, setPane] = useState<PaneState>(() => readPaneState(projectId));
  /* The right pane, which the step's summary is drawn into above 1100px (M59,
   * ISC-573). Held as state through a callback ref so the summary moves into it
   * once it exists, and back under the thread when the window narrows. */
  const [summaryHost, setSummaryHost] = useState<HTMLElement | null>(null);
  useEffect(() => setPane(readPaneState(projectId)), [projectId]);
  useEffect(() => {
    writePaneState(projectId, pane);
  }, [projectId, pane]);

  /**
   * How much room the sticky right pane has, measured rather than declared (M47;
   * the pane held the companion until M59 and holds the summary now).
   *
   * The owner, on the demo of 2026-09-13: "you need to use more of the available
   * space. look at the unutilized space in the different stations." Measured at
   * 1480x853 on the shipped example, the right track held one 682px companion
   * beside a 2,798px station pane, so 2,116px of the right half of the window was
   * blank from the moment the reader scrolled past the companion's end.
   *
   * The pane sticks under the study bar and takes the rest of the scroller's
   * visible height, so it is beside the step wherever the step is. Both numbers are
   * read from the DOM rather than written as a token, because the study bar's own
   * height is not a constant: it gains and loses the open-question row, and the
   * research question it prints wraps at narrow widths.
   *
   * One watcher since M53. There were two: a ResizeObserver for the window, the
   * rail folding and the study bar, and a MutationObserver on the framing dock,
   * which used to change this scroller's height without resizing anything the
   * resize observer was watching. The dock was the shell grid's second row and its
   * `open` attribute and inline `--framing-height` were attribute changes rather
   * than resizes. The theoretical motivation is a tab of its own now (ISC-540), so
   * nothing outside this scroller changes its height while the reader is looking at
   * it, and the observer with nothing left to observe has gone.
   */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [chrome, setChrome] = useState({ top: 0, height: 0 });
  useEffect(() => {
    if (!twoPanes) return;
    const body = bodyRef.current;
    if (body === null) return;
    const scroller = body.closest(".shell-content");
    if (scroller === null) return;
    const bar = scroller.querySelector(".studybar");
    const measure = () => {
      const top = bar === null ? 0 : Math.round(bar.getBoundingClientRect().height);
      setChrome((was) => {
        const next = { top, height: Math.max(0, scroller.clientHeight - top) };
        return was.top === next.top && was.height === next.height ? was : next;
      });
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(scroller);
    if (bar !== null) sizes.observe(bar);
    window.addEventListener("resize", measure);
    return () => {
      sizes.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [twoPanes, station]);

  /* Sample and Early data wait for the loops (M58, flow/loopGate.ts). Computed
   * once here, drawn by the rail, refused by `focus`, and said by the step page
   * when a link lands on one of them anyway. */
  const gated = gatedStations(project?.brief ?? emptyBrief(), declined, {
    events: wb.events,
    projectId,
    dataCorpusSize: dataChunkCount(wb.chunks),
  });
  const gatedRef = useRef(gated);
  gatedRef.current = gated;
  /* M84 (the lead's ruling on question 2): a link that lands on a closed step
     gets the rule's first sentence only; the list of steps still without an
     answer and the link to the first of them went, and Design's Help says the
     gate once. */
  const closedHere = gated.has(station) && project !== undefined ? { sentence: gateSentence(station) } : null;

  const focus = useCallback(
    (id: StationId) => {
      if (gatedRef.current.has(id)) return;
      navigateWithTransition(studyPath(projectId, "design", id), TRANSITION.step);
    },
    [projectId],
  );

  /* M84, ISC-706: the NextBar's first rule, the open question at another step,
   * went, so this page no longer reads where the open question is. */
  /* The one reading of "what now" on this page (R3 item 2). Both bars render
   * from it, so the head cannot name one move while the foot names another. */
  const step = nextStep({
    station,
    pendingDrafts: wb.tray.pending.length,
    brief: project?.brief ?? emptyBrief(),
    states,
  });

  /* The tool's puzzle reading, offered into the puzzle step's conversation
   * (M58, ISC-567). Decided here rather than in the body below, which never
   * branches on the focused station (ISC-94): the Dialogue is the same element
   * at every step and only this prop differs. */
  const puzzleOffer =
    project === undefined || station !== "puzzle" ? null : (
      <PuzzleOffer
        projectId={projectId}
        brief={project.brief}
        events={wb.events}
        chunks={wb.chunks}
        documents={documents}
        onChanged={reload}
      />
    );

  return (
    /* A <main> and an <h1>, and this view was the only one of the ten routes
       with neither. The other eight all render one of each, so a screen reader
       user landing on the study's primary surface got a bare <div> and no
       heading to jump to, on the two routes a researcher spends the most time
       on. design.css already carried a `.workbench-head h1` rule, written for a
       heading that was never rendered. */
    <main
      className="workbench"
      id={MAIN_LANDMARK_ID}
      tabIndex={-1}
      data-testid="workbench"
      data-project-id={projectId}
    >
      {/* The study bar above names the study and its question, so repeating
          them here would be the duplication the bias page was rebuilt to
          remove. What belongs to this view is what is outstanding in it.

          The h1 says "Design" 46px under an underlined "Design" tab, which is
          the duplication above named one line up, and it costs 36px of a first
          screen that is 77% chrome. Folding it onto the bar's row was tried and
          measured this round and reverted; the numbers and the reason are at
          `.workbench-head` in design.css. Deleting it is not the answer either:
          this route had neither a <main> nor an <h1> until FND-03 and
          landmarks.test pins both. */}
      <header className="workbench-head">
        {/* M32, R3 and R6. The h1 is in the sticky study header and the lede is
            in the popover on this row, word for word. The h1 said "Design"
            46px under an underlined "Design" tab, which is a duplication this
            file already named one line up, and it cost 36px of a first screen
            that was 77% chrome. Folding it onto the bar's row was tried at
            FIN-02 and reverted because the bar was not sticky then and the
            frame moved with the content; both of those are fixed now, so the
            heading is on the bar and this row starts with the move. */}
        {/* M62, ISC-600: The route lede moved into the page's Help control (ui/pageHelp.ts). */}
        {/* One move, computed once, read by the head and the foot of this page
            (R3 item 2). The two bars used to answer "what now" separately and
            they disagreed on the shipped screen: the head said a question was
            waiting below while the foot sent the reader to another tab. */}
        <OutstandingBar
          projectId={projectId}
          interview={wb.interview}
          saturation={wb.saturation}
          step={step}
        />
        {/* What moved while this browser was elsewhere (M38, ISC-498).

            Under the standing bar, because the bar says what is outstanding
            now and this says what changed since the reader last looked. It
            reads a per-browser timestamp and writes nothing to the record: a
            study's history is the study's, and who read it when is not part of
            it. */}
        <SinceLastHere projectId={projectId} events={wb.events} />
      </header>

      <StationRail focused={station} states={states} onFocus={focus} gated={gated} />

      {/* One column since M26c.
        *
        * The right column emptied out over three changes and each removal had
        * its own argument. The pages went because a list headed "Your model so
        * far" above a tray headed "Waiting to go into your model" is one idea
        * printed twice. The tray went because adjudicating what your model
        * contains, in the same glance as a question about your site, is being
        * asked to do two jobs at once. The modal baseline went because its own
        * copy warns that reading it early costs you the ability to tell
        * convergence from independence, and it was sitting in peripheral
        * vision on the page where all the thinking happens.
        *
        * What is left is the thing this view is for: a question, somewhere to
        * answer it, and the record of what was said here. A single column is
        * not a smaller version of the old layout, it is the shape the view
        * turned out to have. */}
      {/* Two panes above 1100px, one column below (M39, ISC-503).
        *
        * The grid `.workbench-body` has carried since M26c is live again, with
        * `--design-left` set from state and the separator between the tracks.
        * `data-panes` is what design.css branches on, so the one-column case is
        * the absence of an attribute rather than a second class.
        *
        * The companion that sat in the right track (the papers) went at M59,
        * ISC-572, and the step's summary took the track (ISC-573); below 1100px
        * the summary sits under the thread inside the station pane. */}
      <div
        ref={bodyRef}
        className="workbench-body"
        {...(twoPanes ? { "data-panes": "two" } : {})}
        /* Both tracks from the one fraction, and that is not a redundancy.
         *
         * Writing only the left track as `0.58fr` against a right track of `1fr`
         * gives the left 37% of the free space while the separator's
         * `aria-valuenow` says 58, so a screen reader user would be told a
         * number the layout does not honour. The complement makes the reported
         * share the actual share. */
        style={
          twoPanes
            ? ({
                "--design-left": `${pane.left}fr`,
                "--design-right": `${1 - pane.left}fr`,
                /* The sticky summary pane's two numbers (M47). Written here for the
                 * reason `--design-left` is: the value is state and the rule that
                 * reads it is in design.css. Both are `0px` until the first
                 * measurement lands, and design.css falls back rather than
                 * sticking a pane to nothing. */
                "--summary-top": `${chrome.top}px`,
                "--summary-h": `${chrome.height}px`,
              } as CSSProperties)
            : undefined
        }
      >
        <div className="station-pane" data-testid="station-pane">
          {/* The conversation is drawn inside the step's card and owned out
              here (M37).
              
              The element is created by this render and handed down as a prop,
              so it keeps its position in this component's tree: a station change
              reconciles it exactly as it did when it was a sibling below the
              card, and an answer that is still streaming survives moving along
              the rail. What changed is where it is drawn. It used to sit in a
              second column, which put the tool's question at the top of one
              column and the researcher's answer at the top of the other; the
              step is one act now, read top to bottom, and the conversation is
              the middle of it. */}
          {project !== undefined && (
            <StationWorkspace
              project={project}
              station={station}
              graph={wb.graph}
              documents={documents}
              chunks={wb.chunks}
              {...(closedHere === null ? {} : { closed: closedHere })}
              summaryHost={twoPanes ? summaryHost : null}
              conversation={
                <Dialogue
                  projectId={projectId}
                  graph={wb.graph}
                  interview={wb.interview}
                  moves={wb.moves}
                  events={wb.events}
                  chunks={wb.chunks}
                  documents={documents}
                  station={station}
                  question={stationById(station).prompt}
                  {...(puzzleOffer === null ? {} : { offer: puzzleOffer })}
                  onGoToStation={focus}
                  brief={project.brief}
                />
              }
              onChanged={reload}
            />
          )}

          {/* What the tool has open here, directly under the conversation that
              produced it (D4).
              
              `StationAside` used to sit between them: a 17rem column headed
              "What the tool does at this station", holding explanatory prose,
              third in the reading order between the two things the researcher
              acts on and the tool's actual output. Left to right that read as
              what you do, what you do again, what the tool says about itself,
              and only then what it found. The aside is a fold under the save
              button now and this column is the tool answering back: the
              conversation, then the findings, in the order they happen. */}
        </div>

        {/* The divider and the summary pane, above 1100px only. Below it the
            separator is not rendered at all, rather than rendered and hidden: a
            `role="separator"` in the tab order that moves nothing is worse than
            no separator. */}
        {twoPanes && (
          <>
            <Separator
              value={pane.left}
              min={PANE_MIN}
              max={PANE_MAX}
              onChange={(left) => setPane((p) => ({ ...p, left }))}
              label="Chat width"
            />
            {/* The step's summary, drawn here by StationWorkspace (M59, ISC-573). */}
            <aside
              ref={setSummaryHost}
              className="summary-pane"
              data-testid="summary-pane"
            />
          </>
        )}
      </div>

      {/* The next-move bar was mounted here, at the foot of every station (D4),
          until 2026-09-12. The owner's ruling on seeing M40: the framing fold
          "should replace" it. The bar is the standing header's first line now
          (see OutstandingBar), so the page still names one move with one
          control, at the top, and the foot is the framing's alone. */}

      {/* The framing band was mounted here, as this main's last child, from M40
          until 2026-09-12. It is the app's footer dock now, mounted by `AppShell`
          as the second row of the shell grid; see the comment at that mount.

          The owner's words, on being shown M40 twice: first "it should replace the
          'Every step has an answer and checks have run' bar", then "NO!! It needs
          to look like an app. It needs to be a bar just like the menu bar at the
          left but as a footer bar that is always present, expandable and
          collapsible." A section at the foot of this page could not be that. It
          scrolled away with the page, and it was on one tab of five while the
          framing is what all five are about.

          What this page keeps is the step. It still computes `step` and hands it to
          the standing header's `OutstandingBar`, which is where the one named move
          and its one control have been since the same morning. Two mounts of the
          band would be two surfaces taking writes to one brief, so this comment is
          the guard against putting one back. */}

      {/* The record used to be mounted here, at the foot of this one tab, and
          that is where the interface research found it: three levels deep from
          Design and unreachable from the other four tabs. It is one control in
          the study header now (M38, ISC-494), which is why there is no mount
          here. Two mounts would be two panels claiming to be the same record,
          so this comment is the guard against putting one back. */}
    </main>
  );
}
