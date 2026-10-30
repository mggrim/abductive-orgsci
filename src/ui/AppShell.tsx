/**
 * The shell, and the two bars that make the levels legible (ISC-183 … ISC-196).
 *
 * One bar with four peers could not say what kind of thing each item was, so
 * it said nothing about where you were. Two tiers can: the app tier is always
 * the same things, and the study bar exists only when you are inside a study,
 * carries its name, and holds the views onto it. Level is readable from
 * position before you read a word.
 *
 * M32 turned the app tier through ninety degrees. It was `.appbar`, a flex row
 * with a wordmark, one text link and a settings link over a 1px border, which
 * is a website masthead: no rail, no persistent study switcher, no list of
 * studies, no place for global state. It is a rail down the left edge now, and
 * `.shell` is a full-viewport two-track grid rather than a centred 1120px
 * article column. The content cell owns the scroll, which is what lets the
 * study header stick and the next-step bar sit at the foot of the window.
 *
 * Routing lives in `routes.ts`; this file renders it.
 */

import { puzzleOfRecord } from "../views/puzzleReading.ts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// One stylesheet import in the whole app. src/ui/styles/index.ts is the single
// cascade-order declaration for the files the 989-line styles.css became
// (FND-10); adding a surface file means adding it there, not here.
import "./styles/index.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import type { LedgerEvent, LedgerEventType } from "../ledger/events.ts";
import { getProject, listProjects, type Project } from "../state/projects.ts";
// M41. `announceHere` is the in-tab half of the freshness signal, and the shell
// needs it because it is the shell that mounts the framing now: a save in the dock
// has to reach the Workbench and StudyViews, neither of which is its parent, and a
// BroadcastChannel never delivers to the tab that posted. See the hook's header.
import { announceHere, useStudyFreshness } from "../state/useStudyFreshness.ts";
// studyState is the projection /studies already reads. The rail shows the same
// state for the same study, off the same function, because a study that is
// "Question waiting" in the list and unmarked in the rail is two states (R2).
import { PROJECTS_CHANGED_EVENT, ProjectList, studyState } from "./ProjectList.tsx";
import { StatusChip } from "./components/index.ts";
import { AuthPanel } from "../auth/AuthPanel.tsx";
import { Workbench } from "../workbench/Workbench.tsx";
/* M53, ISC-540. The theoretical motivation is the body of the first tab. It was
   the shell's own footer dock from M41 to M52 (the owner: "a bar just like the
   menu bar at the left but as a footer bar that is always present"), and he
   reversed that on 2026-09-26: "Move Theoretical Motivation to its own tab in
   front of Design." So it is rendered below beside the other five route bodies
   rather than mounted as a second row of the shell grid. */
import { MotivationPage } from "../flow/FramingBand.tsx";
/* M49, ISC-527. The intro route is one of two surfaces now, and `FrontPage`
   holds the gate that chooses: the paced walkthrough before a researcher has a
   study of their own, the long page once they have one. */
import { FrontPage } from "./Walkthrough.tsx";
/* M49, ISC-528. Which of the five tabs this study has earned, and the one line
   that says so when one of them arrives or when a link asked for one that has
   not. */
import { closedTabs, isGatedTab, TAB_UNLOCK } from "../views/earnedTabs.ts";
import { inertAttrs, inertNoteId } from "./components/inert.tsx";
import { OfflineBanner } from "./OfflineBanner.tsx";
import { StudyExports, StudyMaterial } from "./StudyViews.tsx";
import { ConceptsView } from "./ConceptsView.tsx";
// M96, ISC-794: the keyboard shortcuts went (the owner, 2026-10-30: "the
// keyboard shortcuts should be eliminated"). The roving groups stay, because
// the arrows inside the rail and the bias grid are the ARIA widget's own keys,
// and Search opens from its button.
import { installRoving } from "./roving.ts";
import { StudySearch } from "./StudySearch.tsx";
import { MAIN_LANDMARK_ID, focusMainLandmark } from "./landmarks.ts";
import {
  LITERATURE_SECTION_ID,
  RECORD_OPEN_EVENT,
  type RecordOpenRequest,
  literatureRequested,
  mapRequested,
  MODEL_MAP_SECTION_ID,
  parseHash,
  placePath,
  studyPath,
  useRoute,
  STUDY_TABS,
  STUDY_TAB_LABEL,
  STUDY_TAB_TITLE,
  type Route,
  type StudyTab,
} from "./routes.ts";
// The one projection per place (M38). The study header's open-question line and
// the study list's chip read this, and so does the rail; a second computation of
// where the question is, is FIN-02 with a different noun.
import { openQuestionAt, placeLabel } from "../views/placeSummary.ts";
import { RecordPanel } from "./RecordPanel.tsx";
// M39, ISC-504. The record's control in the header travels to the panel it
// opens. The name moves between the two rather than sitting on both, because a
// name carried twice in one frame kills the transition with no error.
import { TRANSITION, withTransition } from "./transitions.ts";
import { HelpControl } from "./HelpControl.tsx";
import { useHasUnsaved } from "../flow/unsavedEdits.ts";

export { parseHash, navigate, studyPath } from "./routes.ts";
export type { Route } from "./routes.ts";

/**
 * The sections a link can land on partway down a tab, and how to recognise one.
 *
 * Three entries, and the shape is the point: adding one is a row rather than a
 * second effect, which is what stopped the first one being copied. The third
 * arrived at M30 and cost exactly the row it was supposed to.
 *
 * The fifth landing, a passage of the material (M46), is not in this table, and
 * the reason is the timing rather than the shape. Every row here names a section
 * the view renders on its first paint, so one frame is enough. A passage exists
 * only after `listChunks` resolves and after the fold holding it opens, which is
 * two async steps later: measured in real Chrome, this effect ran, found nothing,
 * and the reader landed at the top of a tab holding nine documents. So
 * `CorpusMaterial` scrolls to its own passage when its own corpus is on screen,
 * on the same reasoning `FRAMING_OPEN_EVENT` gives for the framing band owning
 * its open-paint-scroll-focus sequence.
 */
const SECTION_LANDINGS: readonly {
  readonly tab: StudyTab;
  readonly id: string;
  readonly asked: (hash: string) => boolean;
}[] = [
  /* M89: the bias grid's and the ordinary version's rows on Checks went with the tab. */
  { tab: "material", id: LITERATURE_SECTION_ID, asked: literatureRequested },
  /* The framing's row was here (M38). It put the dock on screen when a link
     asked for `#/study/:id/design/framing`, because the dock was a section at
     the foot of a page that ran to 4,000px. The motivation is a tab as of M53, so
     arriving at it needs no scroll: the route change is the landing. A link that
     names one of its three fields is handled by the page itself, for the reason
     the passage landing is handled by `CorpusMaterial` rather than here. */
  // M39, ISC-502. The map is a view of Your model's claims section rather than a
  // page of its own, so the link lands on that section and OntologyView reads
  // the same hash to arrive with the map showing rather than the list.
  { tab: "ontology", id: MODEL_MAP_SECTION_ID, asked: mapRequested },
];


/**
 * Below this the rail is folded to its marks (R2).
 *
 * 1180 rather than 1100, which is where every other breakpoint in the app
 * sits, because the number this one is about is different: it is the width at
 * which 224px of rail stops being affordable beside a three-pane study route,
 * not the width at which prose stops flowing into two tracks. At 1024 the rail
 * is folded and the panels still hold, which is the constraint the build was
 * given.
 */
const RAIL_FOLDS_BELOW = "(max-width: 1179px)";


export function AppShell() {
  const route = useRoute();
  const { events, ready } = useLedger();
  const [studies, setStudies] = useState<readonly Project[]>([]);
  const [current, setCurrent] = useState<Project | undefined>(undefined);
  /* Folded by the window, and by the researcher. The viewport sets the default
     and the toggle overrides it until the window crosses the breakpoint again,
     which is the behaviour every rail the researcher already uses has: it is
     not a preference to persist, it is a response to how much room there is. */
  const [railCollapsed, setRailCollapsed] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(RAIL_FOLDS_BELOW).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(RAIL_FOLDS_BELOW);
    const onChange = (e: MediaQueryListEvent) => setRailCollapsed(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  const toggleRail = useCallback(() => setRailCollapsed((c) => !c), []);

  /* The record, over whichever tab is showing (M38, ISC-494).
   *
   * The state is here because the control is in the study header and the header
   * is here; the panel is a sibling of the body rather than a child of a view,
   * which is what makes it the same panel on all five tabs rather than five
   * panels that agree. Exports asks for it by event, for the reason written at
   * `openRecord` in routes.ts. */
  const [recordOpen, setRecordOpen] = useState(false);
  /* Which kinds the press that opened the record was counting (D51, M43d).
   * Empty is every kind, which is what the header control in the study bar means. */
  const [recordKinds, setRecordKinds] = useState<readonly LedgerEventType[]>([]);
  /* Opened and closed inside a transition, so the control the researcher pressed
   * is visibly what became the panel (M39, ISC-504). `withTransition` is where
   * the reduced-motion and feature checks live, so both paths are the plain
   * state change wherever a transition would be wrong or unavailable. */
  const openRecordPanel = useCallback(
    (event?: Event) => {
      const detail = (event as CustomEvent<RecordOpenRequest> | undefined)?.detail;
      setRecordKinds(detail?.kinds ?? []);
      withTransition(() => setRecordOpen(true));
    },
    [],
  );
  const closeRecordPanel = useCallback(() => withTransition(() => setRecordOpen(false)), []);
  /* M96, ISC-794: the arrows inside the rail and the bias grid, the one keyboard
   * behaviour that stayed when the shortcuts went (an ARIA widget's own keys). */
  useEffect(() => installRoving(document), []);
  useEffect(() => {
    document.addEventListener(RECORD_OPEN_EVENT, openRecordPanel);
    return () => document.removeEventListener(RECORD_OPEN_EVENT, openRecordPanel);
  }, [openRecordPanel]);
  /* Leaving the study takes the record with it. It is one study's record, and a
   * panel left open across a route change would be showing the study you just
   * left. */
  useEffect(() => {
    if (route.view !== "study") setRecordOpen(false);
  }, [route]);

  /* M71. A delete on the Projects page leaves the route where it is, so the
   * rail would go on listing the project; the page says so on the document. */
  const [projectsChanged, setProjectsChanged] = useState(0);
  useEffect(() => {
    const bump = () => setProjectsChanged((n) => n + 1);
    document.addEventListener(PROJECTS_CHANGED_EVENT, bump);
    return () => document.removeEventListener(PROJECTS_CHANGED_EVENT, bump);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void listProjects().then((list) => {
      if (!cancelled) setStudies(list);
    });
    return () => {
      cancelled = true;
    };
  }, [route, projectsChanged]);

  const studyId = route.view === "study" ? route.projectId : undefined;
  /* Re-read whenever the study's record moves, not only when the route does
   * (walk of 2026-09-12, M40). The bar prints the puzzle, and the puzzle is
   * written by the tool while the researcher sits on the page: read once per
   * route, the bar printed nothing under a band that printed the reading. Every
   * write to the brief in this tab is followed by an append in this tab, so
   * `events` is the signal; another tab's write arrives over the study channel. */
  const [movedElsewhere, setMovedElsewhere] = useState(0);

  /* ── The tab strip (M62, ISC-607; M49, ISC-528 before it) ────────────────
   *
   * All six tabs show from the start. Starting point, Design and Sources are
   * open (Sources from M85, ISC-712), and the three a project earns are greyed,
   * each with the line that says how to open it (views/earnedTabs.ts). A link to
   * a greyed tab lands on that tab's page, which says the same line; M49's
   * redirect to Design and its arrival lines under the strip are gone. */
  const closedStudyTabs = useMemo<ReadonlySet<StudyTab>>(
    () => (route.view === "study" ? closedTabs(events, route.projectId) : new Set()),
    [events, route],
  );
  useStudyFreshness(
    studyId ?? "",
    useCallback(() => setMovedElsewhere((n) => n + 1), []),
  );
  useEffect(() => {
    let cancelled = false;
    if (studyId === undefined) {
      setCurrent(undefined);
      return;
    }
    void getProject(studyId).then((p) => {
      if (!cancelled) setCurrent(p);
    });
    return () => {
      cancelled = true;
    };
    /* `events` and `movedElsewhere` are the two signals, not inputs. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, events, movedElsewhere]);

  /* Landing on a section of a tab rather than at the top of it.
   *
   * D1, D5, D7 (M27). The app routes on `window.location.hash`, so the
   * browser's own fragment scrolling is not available to it: the hash is the
   * route, not an anchor, and a link written `#/study/:id/material#literature`
   * resolves to the Design tab. Both surfaces that need to be landed on
   * partway down declare a path segment instead, and the hash is read here.
   *
   * One effect over a table rather than one effect per section, because there
   * are two of them now and they differ in three literals. `ready` is in the
   * dependency list because the shell renders "Loading…" until the
   * ledger resolves, and a scroll taken before the view has painted finds
   * nothing and reports success. */
  useEffect(() => {
    if (!ready || route.view !== "study") return;
    const hash = window.location.hash;
    const landing = SECTION_LANDINGS.find((l) => l.tab === route.tab && l.asked(hash));
    if (landing === undefined) return;
    const frame = requestAnimationFrame(() => {
      /* Optional, and it has to be. The section is owned by the view, not by
         the shell, so a build in which it has not landed yet must scroll
         nowhere rather than throw on the way past. */
      document.getElementById(landing.id)?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, route]);

  return (
    // M32, R1. Two tracks and a viewport height, not a centred article column.
    // The rail is the first track and `.shell-content` is the second; the
    // content cell owns the scroll, which is what lets the study header stick
    // and the next-step bar sit at the foot of the window. `data-rail` is read
    // by shell.css for the grid template and by rail.css for what the folded
    // rail hides.
    <div className="shell" data-rail={railCollapsed ? "collapsed" : "open"}>
      {/* The first tab stop on every route, and there was none on any of them.
          A button rather than an anchor: this app routes on window.location.hash
          and an href="#main-landmark" would be read by parseHash as a route,
          so the one control whose job is to not disturb the page would have
          navigated it. See ui/landmarks.ts. */}
      <button type="button" className="skip-link" onClick={focusMainLandmark}>
        Skip to main content
      </button>
      <NavRail
        route={route}
        studies={studies}
        events={events}
        collapsed={railCollapsed}
        onToggle={toggleRail}
      />

      <div className="shell-content">
        {/* Above everything in the content cell, on every route. See
            OfflineBanner for why. It sits inside the cell rather than across
            the frame because the rail is chrome and the banner is about the
            page. */}
        <OfflineBanner />

        {route.view === "study" && (
          <StudyBar
            study={current}
            projectId={route.projectId}
            tab={route.tab}
            station={route.station}
            events={events}
            tabs={STUDY_TABS}
            closed={closedStudyTabs}
            onOpenRecord={openRecordPanel}
            recordOpen={recordOpen}
          />
        )}
        {/* One mount, outside the tab bodies, so the record is the same panel
            from all five (ISC-494). */}
        {route.view === "study" && (
          <RecordPanel
            kinds={recordKinds}
            projectId={route.projectId}
            open={recordOpen}
            onClose={closeRecordPanel}
          />
        )}

        <div className="shell-body">
          {/* M89: the watch that read Abductive's own words for the four machine biases (M75, ISC-667) went with the checks. */}
          {!ready && <p className="muted">Loading…</p>}
          {ready && route.view === "intro" && <FrontPage {...(route.walk === undefined ? {} : { walk: route.walk })} />}
          {ready && route.view === "studies" && <ProjectList />}
          {ready && route.view === "settings" && <AuthPanel />}
          {ready && route.view === "study" && route.tab === "motivation" && current?.id === route.projectId && (
            /* Gated on the study matching the route, not on the route alone.
               `current` is state fetched for a study id, so between a route change
               and its fetch it still holds the study just left, and this page takes
               writes: showing the previous study's answers on the new study's tab
               would be the worst kind of wrong. */
            <MotivationPage
              project={current}
              /* The three holders of this brief in this tab: the shell's own
                 `current`, the Workbench's `reload` and StudyViews' `reread`. All
                 three listen through `useStudyFreshness`, so one announcement
                 reaches all of them and this page does not have to know who they
                 are. */
              onChanged={() => announceHere(route.projectId)}
            />
          )}
          {/* ISC-607: a link to a greyed tab lands on that tab's page, which says how
              to open it; nothing is redirected. */}
          {ready && route.view === "study" && isGatedTab(route.tab) && closedStudyTabs.has(route.tab) && (
            <main className="closed-tab" id={MAIN_LANDMARK_ID} tabIndex={-1} data-testid="closed-tab">
              <p className="closed-tab-line" data-testid="closed-tab-line">
                {TAB_UNLOCK[route.tab]}
              </p>
            </main>
          )}
          {ready && route.view === "study" && route.tab === "design" && (
            <Workbench projectId={route.projectId} station={route.station} />
          )}
          {ready && route.view === "study" && route.tab === "ontology" && !closedStudyTabs.has(route.tab) && (
            <ConceptsView projectId={route.projectId} />
          )}
          {ready && route.view === "study" && route.tab === "material" && !closedStudyTabs.has(route.tab) && (
            <StudyMaterial projectId={route.projectId} />
          )}
          {ready && route.view === "study" && route.tab === "exports" && !closedStudyTabs.has(route.tab) && (
            <StudyExports projectId={route.projectId} />
          )}
        </div>
      </div>

    </div>
  );
}

/**
 * The rail (M32, R2).
 *
 * The masthead's three items, laid down the left edge, plus the two things a
 * masthead cannot hold: which study you are in, and which other studies are
 * waiting on you. That second one is the whole argument for a rail. The app
 * had a study switcher buried in the study bar and a list of studies on a
 * route you had to leave the study to reach, so "what else is open" cost a
 * navigation.
 *
 * Every string here already existed: the wordmark, "Studies", "Claude access",
 * the study titles, and the "Question waiting" chip the studies table renders
 * off the same projection. The two the rail adds are the fold control's own
 * name, which is the only new copy in this build and is one imperative of three
 * words.
 */
function NavRail(props: {
  route: Route;
  studies: readonly Project[];
  events: readonly LedgerEvent[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { route, studies, collapsed, onToggle } = props;
  const currentId = route.view === "study" ? route.projectId : undefined;
  const tab: StudyTab | undefined = route.view === "study" ? route.tab : undefined;
  return (
    <nav className="navrail" aria-label="Abductive" data-testid="navrail">
      <div className="navrail-top">
        <a
          className="navrail-brand"
          href="#/"
          aria-current={route.view === "intro" ? "page" : undefined}
        >
          {/* The mark survives the fold and the name does not, so a 56px rail
              still says which application this is. Decoration: the accessible
              name is the word beside it, which stays in the tree at both
              widths. */}
          <span className="navrail-mark" aria-hidden="true">
            A
          </span>
          <span className="navrail-name">Abductive</span>
        </a>
        <button
          type="button"
          className="navrail-toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
          data-testid="navrail-toggle"
        >
          <span aria-hidden="true">{collapsed ? "»" : "«"}</span>
        </button>
      </div>

      {/* M32c, fix 3. The select is gone and the list is the switcher.
       *
       * A `<select>` labelled "Study" sat directly above a list of the same
       * eight studies: two controls doing one job, stacked, and the select was
       * the worse of the two. It clipped mid-word with no ellipsis, because
       * `text-overflow` does not apply to a `<select>`, and it could not carry
       * the "Question waiting" chip that is the only reason to look at this
       * list rather than at the tab bar. The list does the switching, the
       * navigating and the reporting; the full picker lives on the studies
       * table, which is what that screen is for.
       *
       * One control doing two jobs, and it is the `Studies` link the masthead
       * carried: it names the list under it and goes to the full one. */}
      <a
        className="navrail-head"
        href="#/studies"
        aria-current={route.view === "studies" ? "page" : undefined}
      >
        Projects
      </a>

      <ul className="navrail-studies" data-testid="navrail-studies">
        {studies.map((s) => {
          const state = studyState({ project: s, events: props.events, corpusChunkIds: [] });
          return (
            <li key={s.id} className="navrail-study">
              <a
                className="navrail-studylink"
                href={studyPath(s.id, tab ?? "design")}
                aria-current={s.id === currentId ? "page" : undefined}
                /* The folded rail shows the initial and nothing else, so the
                   name has to be reachable from the row itself. Open, it is
                   the same string the row already prints. */
                title={s.title}
                data-current={s.id === currentId ? "true" : undefined}
              >
                {/* Folded, this is the whole row. Derived from the title rather
                    than written down, so it cannot say a different letter from
                    the name beside it. `aria-hidden` because the accessible
                    name is the title, which is in the tree at both widths. */}
                <span className="navrail-initial" aria-hidden="true">
                  {s.title.trim().slice(0, 1).toUpperCase()}
                </span>
                <span className="navrail-studytitle">{s.title}</span>
                {state.questionOnTable && <StatusChip label="Open question" tone="accent" />}
              </a>
            </li>
          );
        })}
      </ul>

      <div className="navrail-foot">
        <a
          className="navrail-settings"
          href="#/settings"
          aria-current={route.view === "settings" ? "page" : undefined}
        >
          <span className="navrail-settingsname">Model access</span>
        </a>
      </div>
    </nav>
  );
}

/**
 * The second tier. It exists only inside a study, which is what makes the
 * boundary between app and study readable without a label saying so.
 *
 * M32, R3. Three changes and one relocation.
 *
 * It is sticky at the top of the content cell, so the study's identity and the
 * five tabs do not scroll away on a page that runs to 4,000px.
 *
 * It carries the route's own `h1`. That heading used to sit 46px below in the
 * page body at --text-head, which put a 22px "Material" over an empty page and
 * made the most-seen surface in the product open like an article. It is at
 * --text-title here, beside the study name, separated by a rule rather than by
 * a glyph so that no separator string had to be invented.
 *
 * The tabs are segmented controls rather than underlined text. Their order is
 * unchanged and is not the kind of thing this pass may change: Design,
 * Material, Your model, Checks, Exports.
 *
 * And the picker went to the rail, where a switcher belongs. What is left here
 * is the study's name as text, which the rail cannot show while it is folded.
 */
function StudyBar(props: {
  study: Project | undefined;
  projectId: string;
  tab: StudyTab;
  station: string;
  events: readonly LedgerEvent[];
  /** Every tab, in the tab table's order (M62, ISC-607: all six show). */
  tabs: readonly StudyTab[];
  /** The tabs greyed until earned (ISC-607). */
  closed: ReadonlySet<StudyTab>;
  onOpenRecord: () => void;
  /** Whether the panel this control opens is showing (M39, ISC-504). */
  recordOpen: boolean;
}) {
  const { study, projectId, tab, station, tabs, closed, events, onOpenRecord, recordOpen } = props;
  /* M78b, ISC-681: Starting point saves on Save answer, so an edit not yet saved
     is marked on its tab until it is. */
  const unsaved = useHasUnsaved(projectId);
  /* The tab the pointer or the focus is on, whose line shows under the strip
   * (ISC-607; M69, ISC-640: every tab, and no native tooltip over the line). */
  const [hint, setHint] = useState<StudyTab | null>(null);
  const [searching, setSearching] = useState(false);
  /* The one sentence per tab: how to open a greyed tab, or when to come to an
   * open one. It used to ride as the open tab's `title`, and the browser drew
   * that tooltip over the line under the strip (Matthew, 2026-10-02). */
  const tabLine = (t: StudyTab): string => (closed.has(t) && isGatedTab(t) ? TAB_UNLOCK[t] : STUDY_TAB_TITLE[t]);
  const hintHandlers = (t: StudyTab) => ({
    onMouseEnter: () => setHint(t),
    onMouseLeave: () => setHint((h) => (h === t ? null : h)),
    onFocus: () => setHint(t),
    onBlur: () => setHint((h) => (h === t ? null : h)),
  });
  const studyPuzzle = study === undefined ? null : puzzleOfRecord(study.brief);
  /* The study's one open question, and where it is (M38, ISC-492).
   *
   * Off `openQuestionAt`, which the study list's chip and the rail read too.
   * Iqbal and Horvitz measured what this line is for: a suspended task less than
   * a quarter visible took significantly longer to come back to than one mostly
   * on screen, and eight conversations behind five tabs hide seven of the eight
   * by construction. A question you cannot see from Material is a question you
   * answer tomorrow.
   *
   * Nothing renders when nothing is open. A line reading "no open question" is a
   * report on nothing having happened, in the chrome, on every tab. */
  const open = useMemo(() => openQuestionAt(events, projectId), [events, projectId]);
  return (
    <div className="studybar" data-testid="studybar">
      <div className="studybar-head">
        <span className="studybar-name">{study?.title ?? ""}</span>
        {/* The page heading. It is the tab's own label, which is what
            one-instrument.test.ts holds every study route to; what changed at
            M32 is where it is rendered, not what it says. */}
        <h1>{STUDY_TAB_LABEL[tab]}</h1>
        {/* M40, ISC-509. The bar prints the puzzle and the puzzle is the tool's
            reading now, so the tooltip says whose sentence it is. A visible label
            would be a second heading on a row that already carries the study name
            and the tab's own h1, which is the duplication M32 took off this row. */}
        {/* M58, ISC-568: the researcher's answer at The puzzle step when there
            is one, and the tooltip says whose words the line is. */}
        <span
          className="studybar-rq"
          title={
            studyPuzzle?.whose === "answer"
              ? "Your puzzle"
              : "Suggested puzzle"
          }
        >
          {studyPuzzle?.text}
        </span>
        <span className="studybar-spacer" />
        <div className="studybar-actions">
          {/* M38, ISC-494. One control, on all five tabs, opening the record
              over the tab you are standing on. It was at the foot of Design and
              nowhere else, which put the timeline of everything that happened
              three levels away from Material, Checks and Exports. */}
          <button
            type="button"
            className="btn-quiet studybar-record"
            onClick={onOpenRecord}
            /* The name is on the control while the panel is closed and on the
               panel while it is open, so exactly one element wears it in any
               frame. Inline because it follows a state rather than a selector. */
            style={recordOpen ? undefined : { viewTransitionName: TRANSITION.record }}
            data-kbd="record"
            data-testid="record-open"
          >
            History
          </button>
          {/* M53, ISC-545; M96, ISC-794: Search opens from its button. */}
          {study !== undefined && (
            <button
              type="button"
              className="studybar-search"
              onClick={() => setSearching(true)}
              data-testid="palette-chip"
            >
              Search
            </button>
          )}
          {study !== undefined && <StudySearch open={searching} projectId={study.id} onClose={() => setSearching(false)} />}
          {/* M62, ISC-600: the page's one Help control, at the right end of the
              header, for the tab you are on (and on Design, the step). */}
          <HelpControl page={tab} {...(tab === "design" ? { station } : {})} {...(study === undefined ? {} : { project: study })} />
        </div>
      </div>
      {/* M84, ISC-706: the line "Go to the open question at X" went from the
          header on every tab. The question stays open in its own step and in
          History, and the study list's chip still marks a project with one. */}
      <div className="studybar-tabs" role="tablist" aria-label="Project views">
        {tabs.map((t) =>
          closed.has(t) && isGatedTab(t) ? (
            /* ISC-607: greyed, labelled and not openable. No href, so nothing
               navigates; focusable, so the keyboard reaches it; described by its
               line, so a screen reader reads how to open it. No `title`
               (M69, ISC-640): the line under the strip says it. */
            <a
              key={t}
              role="tab"
              aria-selected={t === tab}
              {...inertAttrs(`tab-${t}`, TAB_UNLOCK[t], { tooltip: false })}
              tabIndex={0}
              data-closed="true"
              data-current={t === tab}
              data-label={STUDY_TAB_LABEL[t]}
              data-testid={`studytab-${t}`}
              onClick={(e) => e.preventDefault()}
              {...hintHandlers(t)}
            >
              {STUDY_TAB_LABEL[t]}
            </a>
          ) : (
            <a
              key={t}
              role="tab"
              href={studyPath(projectId, t)}
              aria-selected={t === tab}
              /* D1 (M27): the sentence saying when to open the tab. Since M69
                 (ISC-640) it shows in the line under the strip on hover and
                 focus, and describes the tab for a screen reader, rather than
                 riding as a native tooltip that covered that line. */
              aria-describedby={inertNoteId(`tab-${t}`)}
              data-current={t === tab}
              data-label={STUDY_TAB_LABEL[t]}
              data-testid={`studytab-${t}`}
              data-unsaved={t === "motivation" && unsaved ? "true" : undefined}
              {...hintHandlers(t)}
            >
              {STUDY_TAB_LABEL[t]}
              {t === "motivation" && unsaved && (
                <span className="studytab-dot" role="img" aria-label="Unsaved edit" data-testid="studytab-unsaved-dot" />
              )}
            </a>
          ),
        )}
      </div>
      {/* The line each tab is described by, always in the tree for the screen
          reader, and the one for the tab under the pointer or the focus shown
          under the strip (ISC-607, ISC-640). */}
      <div className="visually-hidden">
        {tabs.map((t) => (
          <span key={t} id={inertNoteId(`tab-${t}`)}>
            {tabLine(t)}
          </span>
        ))}
      </div>
      {/* The line's room is always reserved (two lines of small text), so the
          page below does not shift when the pointer reaches a tab; the <p> is
          in the tree only while a tab is under the pointer or the focus, as
          the M62 tests expect. */}
      <div className="studybar-notice-room">
        {hint !== null && (
          <p
            className="studybar-notice"
            data-testid={closed.has(hint) && isGatedTab(hint) ? "studybar-unlock" : "studybar-hint"}
            aria-hidden="true"
          >
            {tabLine(hint)}
          </p>
        )}
      </div>
    </div>
  );
}
