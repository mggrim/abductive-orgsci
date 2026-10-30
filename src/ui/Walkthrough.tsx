/**
 * The walkthrough, and the gate that decides who sees it (M49, ISC-527).
 *
 * A co-author, on their first use of the tool on 2026-09-21: nobody reads the
 * landing page before creating a study, so the instruction has to be delivered
 * in place, one thing at a time. The long front page is not wrong about what it
 * says; it is 4,000px of correct sentences arranged so that the first control a
 * researcher wants is at the top and everything that would help them use it is
 * below the fold. A page you can skip is a page that gets skipped.
 *
 * So the first thing a researcher with no study of their own meets is four
 * screens, paced, each one a section of the long page rather than new prose.
 * Nothing here claims anything the long page does not claim: every sentence on
 * these four screens is imported from `Introduction.tsx` or from the tab table
 * in `routes.ts`, and the two sliders and the step loop are the same components
 * the long page mounts. A second copy of a sentence is how two surfaces come
 * apart, so there is not one.
 *
 * ── What bypasses it, and what does not ───────────────────────────────────
 *
 * Any study in this browser. A bundle a co-author sent counts: a researcher
 * holding a file of their own study has a study.
 *
 * Until M91 a copy of the example project (`importedAs === "example"`) did not
 * count, because reading somebody else's finished study is not starting your
 * own and the walkthrough's last screen led back to it. The owner removed the
 * example on 2026-10-14. A copy already in a browser is that researcher's data
 * and opens as an ordinary project, and the walkthrough no longer has a way to
 * it, so the rule went: such a browser gets the long page, whose Recent
 * projects lists the copy.
 *
 * The gate reads the project store rather than a flag of its own. A flag would
 * be a second answer to "has this person started a study", and the store is
 * already the one the front page's resume list and the studies table read.
 *
 * ── The fetch constraint (ISC-104 … ISC-106) ──────────────────────────────
 *
 * Unchanged and inherited. Every mark on these screens is the long page's own
 * inline SVG, there is no webfont, and the only same-origin files involved are
 * the optional photographs: the long page's six, and the four outputs' on the
 * third screen (M68).
 */

import { ONTOLOGY_TAB_LABEL } from "../concepts/vocabulary.ts";
import { useEffect, useRef, useState } from "react";
import { listProjects, type Project } from "../state/projects.ts";
import { MAIN_LANDMARK_ID } from "./landmarks.ts";
import { navigate, STUDY_TAB_TITLE } from "./routes.ts";
import { BringInStudy } from "./BringInStudy.tsx";
import {
  COMMITMENTS,
  COMMITMENTS_HEADING,
  IntroImage,
  DATA_LIVES_BODY,
  DATA_LIVES_HEADING,
  Introduction,
  OBSTACLES,
  OBSTACLES_HEADING,
  OBSTACLES_LEDE,
  ObstacleCardBody,
  PRODUCT_LINE,
  PURPOSE_LINE,
  StartStudyForm,
  STEPS_LEDE,
  STEPS_HEADING,
  STEPS_WHERE,
  StepRail,
  spelled,
} from "./Introduction.tsx";

/**
 * The outputs of a project, in the order ISC-527 names them, each with its
 * photo (M68, ISC-638). Three since M89: Checks went with the checks
 * (the owner, 2026-10-14), and its photo stays in public/ unshown so the
 * shipped files are unchanged.
 *
 * The owner, 2026-10-02: "There should also be images that correspond with
 * those outputs. Use codex to create those images." The lead generated the four
 * with Codex image generation (gpt-image-2), square and monochrome like the
 * governance vignettes. Unlike the six older photos these depict the thing the
 * label names, so each carries one sentence of alt text. A file that fails to
 * load renders nothing and leaves the label and its sentence (`IntroImage`).
 */
export const WALKTHROUGH_OUTPUTS: readonly { name: string; line: string; src: string; alt: string }[] = [
  /* History's sentence, said about the place it is a fact about. M83,
   * ISC-699: the co-author read this line and the authorship card as one claim, so the
   * line is about change over time (History keeps every event in order,
   * HISTORY_HELP) and the card keeps the permanent mark. */
  {
    name: "History",
    line: "Abductive keeps every change in order, so you can follow the project back to its start.",
    src: "/intro/output-history.jpg",
    alt: "An open logbook with a fountain pen lying across its handwritten pages.",
  },
  /* M63, ISC-614: the two tabs in the owner's terms, one sentence each. */
  {
    name: ONTOLOGY_TAB_LABEL,
    line: STUDY_TAB_TITLE.ontology,
    src: "/intro/output-ontology.jpg",
    alt: "Rows of paper slips on a desk, joined to each other by string.",
  },
  {
    name: "Export",
    line: STUDY_TAB_TITLE.exports,
    src: "/intro/output-export.jpg",
    alt: "A stack of pages with a folded diagram on top, beside an envelope.",
  },
];

/* M83, ISC-699 put three process points under the third screen's title; the
 * owner removed them on 2026-10-14 (M86, ISC-720), asked for a subsection
 * "What you bring to the table" in their place (ISC-721) and removed that too
 * the same day (ISC-723). The screen opens on the outputs. */
/** The third screen's heading. */
const OUTPUTS_TITLE_ID = "walk-outputs-title";
/** M83: the outputs' own subhead, which the outputs are labelled by. */
const OUTPUTS_HEAD_ID = "walk-outputs-head";

/* M68, ISC-637 (owner, 2026-10-02): "The title for this page should be brought
 * down into the subsection at the top." On this screen the h1 is the first thing
 * on the white panel, the heading of the four outputs, and only the eyebrow
 * sits above the banner. */
const TITLE_IN_PANEL: ReadonlySet<number> = new Set([2]);

/* ISC-590 (owner, 2026-09-30): the lede and the nine problems, the two loops,
 * where things live and what Abductive will not do, then the create block. The
 * long page tells its shared sections in the same order (tests/m61-walk-order).
 * The fourth screen's title is the create block's own heading, which it carried
 * as a subhead when the block sat under the places. */
export const WALKTHROUGH_TITLES: readonly string[] = [
  PRODUCT_LINE,
  STEPS_HEADING,
  /* M83, ISC-699: the process heading, above the outputs, which keep the
   * owner's label of M68 as their subhead (OUTPUTS_HEADING). The brief's "How
   * Abductive works with you" is a wh-clause standing for a thing (L13, as
   * ISC-596 ruled on "How Abductive helps"), so the heading names the act. */
  "Working with Abductive",
  "New project",
];

export const WALKTHROUGH_SCREENS = WALKTHROUGH_TITLES.length;

/** The owner's label for the outputs (M68, ISC-637), the subhead under the process since M83. */
export const OUTPUTS_HEADING = "The outputs of a project";

/**
 * The photographs behind the screens (M53, ISC-543).
 *
 * The owner, on the M52 build: "What happened to the other images you created for
 * those sections? Can't they be brought in as helpful backdrop." They are the
 * long page's since M32, from the same files, and they replace ISC-539's scenes.
 * The corridor is a hero band behind the first screen's title and lede, the way
 * the long page's hero sits on it (`WALKTHROUGH_HERO`); the three vignettes sit
 * one per commitment card, exactly as the long page binds each picture to the
 * refusal it illustrates (`WALKTHROUGH_VIGNETTES`), on the third screen since
 * ISC-590; the loops' banner runs across the top of the second screen and the
 * problems' across the third (ISC-594), each with the content panel over its
 * lower edge. The fourth screen carries no image.
 *
 * The problems' banner is not on the first screen (ISC-590 allowed it "if it
 * fits without crowding"): that screen already carries the corridor band, and a
 * second photograph between the band and the cards stacked two pictures above
 * the one row the screen is for.
 *
 * Every word on a screen is on `.walk-panel`, an opaque surface, so contrast is
 * the panel's and never the photograph's. A file that fails to load renders
 * nothing, as on the long page (`IntroImage`).
 */
export const WALKTHROUGH_HERO = "/intro/hero.jpg";
export const WALKTHROUGH_VIGNETTES: readonly string[] = COMMITMENTS.map((_, i) => `/intro/commit-${i + 1}.jpg`);

export const WALKTHROUGH_BACKDROPS: readonly ({ src: string; kind: "banner" } | null)[] = [
  null,
  { src: "/intro/steps.jpg", kind: "banner" },
  /* ISC-594 (owner, 2026-09-30): the problems' banner, left off screen 1, heads
   * screen 3 over the outputs of a project and the governance cards. */
  { src: "/intro/obstacles.jpg", kind: "banner" },
  null,
];

/**
 * Above this width a page of the nine aspects holds three cards; below it, two.
 *
 * 1200 rather than a width of the track's own, because it is the width the
 * frame and the gutter already step at (tokens.css), so the page count changes
 * on the same pixel the column it sits in changes. Measured: three at 1480, two
 * at 1100, which is what ISC-537 asks for.
 */
const ASPECTS_THREE_UP = "(min-width: 1200px)";

/** How many aspect cards a page holds at this width, watched for changes. */
function usePerPage(): number {
  const [three, setThree] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(ASPECTS_THREE_UP).matches,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(ASPECTS_THREE_UP);
    const read = (): void => setThree(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return three ? 3 : 2;
}

/** The pager's own two marks, in the glyph register M34 set for this surface. */
function PageChevron(props: { back: boolean }) {
  return (
    <svg
      className="front-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={props.back ? "M15 5 L8 12 L15 19" : "M9 5 L16 12 L9 19"} />
    </svg>
  );
}

/**
 * The nine aspects, paged inside the walkthrough's frame (M52, ISC-537).
 *
 * The long page scrolls them as a track (`ObstacleSlider`). That component is
 * wrong inside a screen with a foot of its own, and the live site showed both
 * reasons at once: the track measured 3,008px inside a 928px frame, so the
 * fourth card was cut at the window's edge, and the track's own Previous and
 * Next sat fifty pixels above the walkthrough's Back and Next, so the screen
 * offered two Nexts and neither said which one it moved.
 *
 * So the nine are paged here instead. A page is exactly as wide as the row, the
 * columns are a share of it rather than a held 320px, and the row clips what is
 * off the page, so no card is ever half-drawn at an edge. The controls are two
 * small chevrons and a row of dots, inside the row, in the micro register: they
 * cannot be read as the screen's own controls because they are not words and
 * they are not in the foot.
 *
 * The scroll offset of page n is n × (the row's width + one gap), whatever the
 * cards measure: a column is `(100% − gaps) / perPage` of the row, so a page's
 * worth of columns and gaps is the row plus the gap that follows it. The gap is
 * read off the element rather than written here, so the sheet stays the one
 * place it is declared.
 *
 * Why the row scrolls rather than translates: a card is reachable by Tab, and a
 * browser brings a focused box into view by scrolling its clipping ancestor.
 * With a transform it would scroll nothing and focus would land off screen. The
 * scroll listener reads the page back out, so the dots follow the Tab key
 * without a second rule about what focus should do.
 */
function AspectPager() {
  const perPage = usePerPage();
  const pages = Math.ceil(OBSTACLES.length / perPage);
  const [page, setPage] = useState(0);
  const track = useRef<HTMLOListElement | null>(null);
  const here = Math.min(page, pages - 1);

  /** The row's width plus one gap: the distance from one page to the next. */
  function stride(el: HTMLElement): number {
    const gap = Number.parseFloat(getComputedStyle(el).columnGap);
    return el.clientWidth + (Number.isFinite(gap) ? gap : 0);
  }

  function goTo(next: number): void {
    const want = Math.max(0, Math.min(pages - 1, next));
    setPage(want);
    const el = track.current;
    if (el === null) return;
    const step = stride(el);
    if (step > 0) el.scrollLeft = want * step;
  }

  /* A width change can leave the reader on a page that no longer exists (nine
   * cards are four pages of two and three pages of three), and it always leaves
   * the scroll offset measured against the old stride. Both are corrected here
   * rather than at the press, so the row and the dots agree after a resize. */
  useEffect(() => {
    goTo(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perPage]);

  /* Which of the nine a page actually shows. The start is clamped because the
   * row stops at its own end: nine cards two to a page leaves the last page one
   * card, and a row that can go no further shows the eighth beside the ninth.
   * Measured at 1100 (M52): the last page sits at scrollLeft 3318, which is the
   * row's maximum, with cards eight and nine in view. Saying "9 to 9" there
   * would name something other than what the reader is looking at. */
  function windowOf(p: number): { from: number; to: number } {
    const start = Math.min(p * perPage, Math.max(0, OBSTACLES.length - perPage));
    return { from: start + 1, to: Math.min(OBSTACLES.length, start + perPage) };
  }
  const shown = windowOf(here);
  const count = spelled(perPage);

  return (
    <div className="walk-pager" data-testid="walk-aspects" data-per-page={perPage}>
      <button
        type="button"
        className="walk-pager-arrow"
        onClick={() => goTo(here - 1)}
        aria-label={`Previous ${count}`}
        data-testid="walk-aspects-prev"
      >
        <PageChevron back />
      </button>
      <ol
        className="obstacle-cards walk-pager-track"
        ref={track}
        data-testid="walk-aspects-track"
        onScroll={(e) => {
          const step = stride(e.currentTarget);
          if (step > 0) setPage(Math.round(e.currentTarget.scrollLeft / step));
        }}
      >
        {OBSTACLES.map((o, i) => (
          <li key={o.title} className="obstacle-card walk-pager-card" tabIndex={0}>
            <ObstacleCardBody index={i} />
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="walk-pager-arrow"
        onClick={() => goTo(here + 1)}
        aria-label={`Next ${count}`}
        data-testid="walk-aspects-next"
      >
        <PageChevron back={false} />
      </button>
      <div className="walk-pager-dots" data-testid="walk-aspects-dots">
        {Array.from({ length: pages }, (_, p) => {
          const { from, to } = windowOf(p);
          return (
            <button
              key={p}
              type="button"
              className="walk-pager-dot"
              aria-label={`Show ${from} to ${to} of the nine`}
              aria-current={p === here ? "true" : undefined}
              data-current={p === here ? "true" : undefined}
              onClick={() => goTo(p)}
            />
          );
        })}
      </div>
      {/* Said in words for a reader who cannot see which dot is filled. The
          drawn dots are controls and carry their own names, so this line is the
          only thing that speaks on a page change. */}
      <p className="visually-hidden" aria-live="polite" data-testid="walk-aspects-position">
        {shown.from} to {shown.to} of {OBSTACLES.length}
      </p>
    </div>
  );
}

/**
 * One screen of the four. Which one is `index`; the content is a switch rather
 * than an array of elements, so a screen that needs a component (the step loop,
 * the obstacle slider) mounts only when it is on screen and a track's scroll
 * position is not being measured on a box nobody can see.
 */
function Screen(props: { index: number }) {
  switch (props.index) {
    case 0:
      /* Under the corridor band: the nine early problems, paged. Its heading is
       * a subhead here because the screen's title is the product line. */
      return (
        <>
          <h3 className="walk-subhead">{OBSTACLES_HEADING}</h3>
          <p className="walk-lede">{OBSTACLES_LEDE}</p>
          <AspectPager />
        </>
      );
    case 1:
      return (
        <>
          <p className="walk-lede">
            {STEPS_LEDE} {STEPS_WHERE}
          </p>
          <StepRail />
        </>
      );
    case 2:
      /* Where the work ends up, under the screen's own title (ISC-637), each
       * output with its photo (ISC-638); then research governance. The process
       * points of ISC-699 are gone (ISC-720). */
      return (
        <>
          <h1 className="walk-title walk-panel-title" id={OUTPUTS_TITLE_ID} data-testid="walk-title">
            {WALKTHROUGH_TITLES[2]}
          </h1>
          <h3 className="walk-subhead" id={OUTPUTS_HEAD_ID} data-testid="walk-outputs-head">
            {OUTPUTS_HEADING}
          </h3>
          <ul className="walk-list walk-outputs" data-testid="walk-places" aria-labelledby={OUTPUTS_HEAD_ID}>
            {WALKTHROUGH_OUTPUTS.map((output, i) => (
              <li key={output.name}>
                {/* The wrapper names its file, as the vignettes' does, because
                    a test DOM fails every image load. */}
                <div className="walk-output-image" data-testid={`walk-output-image-${i + 1}`} data-src={output.src}>
                  <IntroImage
                    src={output.src}
                    alt={output.alt}
                    className="commitment-image"
                    testId={`walk-output-photo-${i + 1}`}
                  />
                </div>
                <p className="walk-list-title">{output.name}</p>
                <p>{output.line}</p>
              </li>
            ))}
          </ul>
          <h3 className="walk-subhead">{COMMITMENTS_HEADING}</h3>
          <ul className="walk-list" data-testid="walk-commitments">
            {COMMITMENTS.map((c, i) => (
              <li key={c.title}>
                {/* One square per card, in the order the cards are declared, as
                    on the long page, so the picture and the refusal it
                    illustrates cannot drift apart (M53, ISC-543). */}
                <div
                  className="walk-commit-image"
                  data-testid={`walk-image-commit-${i + 1}`}
                  data-src={WALKTHROUGH_VIGNETTES[i]}
                  aria-hidden="true"
                >
                  <IntroImage
                    src={WALKTHROUGH_VIGNETTES[i] ?? ""}
                    className="commitment-image"
                    testId={`walk-commit-image-${i + 1}`}
                  />
                </div>
                <p className="walk-list-title">{c.title}</p>
                <p>{c.body}</p>
              </li>
            ))}
          </ul>
        </>
      );
    default:
      /* The last screen is the create block (drawn by `Walkthrough`, above this)
       * and the sentence about where the data lives, and nothing else. */
      return (
        <>
          <h3 className="walk-subhead">{DATA_LIVES_HEADING}</h3>
          <p className="walk-lede">{DATA_LIVES_BODY}</p>
        </>
      );
  }
}

/**
 * Four screens, with the two controls on the last one.
 *
 * Back is absent on the first screen and Next on the last, rather than drawn
 * held back. The owner's ruling at M34 governs this: the app's inert primitive
 * marks a control waiting on a condition and owes the reader a sentence naming
 * it, and a step with nothing behind it is not waiting on anything. The foot
 * keeps its height either way, so nothing under it jumps when a control leaves.
 */
export function Walkthrough(props: {
  onLeave?: () => void;
  /** The screen to open on (M62): a page's More help opens the one covering it. */
  start?: number;
}) {
  const [at, setAt] = useState(props.start ?? 0);
  const last = at === WALKTHROUGH_SCREENS - 1;
  const backdrop = WALKTHROUGH_BACKDROPS[at] ?? null;

  return (
    <main
      className="walk"
      id={MAIN_LANDMARK_ID}
      tabIndex={-1}
      data-testid="walkthrough"
      data-screen={at}
    >
      {at !== 0 && <p className="walk-eyebrow">Abductive</p>}
      {at !== 0 && !TITLE_IN_PANEL.has(at) && (
        <h1 className="walk-title" data-testid="walk-title">
          {WALKTHROUGH_TITLES[at]}
        </h1>
      )}
      {/* The screen, and the box that holds the four to one height (ISC-537).
          Back and Next sat at a different y on every screen before this, so
          stepping through moved the control you were pressing. The min-height
          is pinned in the sheet off the tallest of the four, which is this last
          one with the create form in it. */}
      <div
        className="walk-screen"
        data-testid="walk-screen"
        data-screen={at}
        data-backdrop={backdrop?.kind ?? "none"}
      >
        {at === 0 && (
          /* The first screen's head on the corridor, the long page's hero pattern:
             the photograph behind, the scrim on its left, the copy in the hero
             inks on the scrim (M53, ISC-543). */
          <div className="walk-hero" data-testid="walk-hero" data-src={WALKTHROUGH_HERO}>
            <IntroImage src={WALKTHROUGH_HERO} className="intro-hero-back" scrim testId="walk-hero-image" />
            <div className="walk-hero-copy">
              <p className="walk-eyebrow walk-hero-eyebrow">Abductive</p>
              <h1 className="walk-title walk-hero-title" data-testid="walk-title">
                {WALKTHROUGH_TITLES[at]}
              </h1>
              <p className="walk-hero-lede">{PURPOSE_LINE}</p>
            </div>
          </div>
        )}
        {backdrop !== null && (
          <div
            className="walk-backdrop"
            data-testid="walk-backdrop"
            data-kind={backdrop.kind}
            data-src={backdrop.src}
            aria-hidden="true"
          >
            {/* Keyed by file, so a screen change mounts a fresh image and a
                failure on one screen does not hide the next screen's. */}
            <IntroImage
              key={backdrop.src}
              src={backdrop.src}
              className="walk-backdrop-image"
              testId="walk-backdrop-image"
            />
          </div>
        )}
        <div className="walk-text walk-panel" data-testid="walk-panel">
          {!last && (
            <div className="walk-body" data-testid="walk-body">
              <Screen index={at} />
            </div>
          )}

          {last && (
            <div className="walk-start" data-testid="walk-start">
              {/* ISC-590: "New project" is the screen's title, so the block
                  opens on the form. */}
              <StartStudyForm />
              {/* The same import the long page offers, and the reason it is
                  here rather than on the first screen: it opens a study, and a
                  reader who has not reached this screen has not been told what
                  a study is for yet. (M91: the example beside it went.) */}
              <div className="intro-alt" data-testid="walk-alt">
                <BringInStudy />
              </div>
            </div>
          )}
          {last && (
            <div className="walk-body" data-testid="walk-body">
              <Screen index={at} />
            </div>
          )}
        </div>
      </div>

      <div className="walk-foot">
        <div className="walk-foot-buttons">
          {at > 0 && (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => setAt((n) => n - 1)}
              /* Screen one carries the obstacle track, whose own arrows sit
                 above these. The rule, the weight and the count separate the
                 two pairs; the sentence says which one moves. */
              title="Previous screen"
              data-testid="walk-back"
            >
              Back
            </button>
        )}
          {!last && (
            <button
              type="button"
              className="primary"
              onClick={() => setAt((n) => n + 1)}
              title="Next screen"
              data-testid="walk-next"
            >
              Next
            </button>
        )}
        </div>
        <p className="walk-count" aria-live="polite" data-testid="walk-count">
          {at + 1} of {WALKTHROUGH_SCREENS}
        </p>
      </div>

      {/* Only when a study already exists, which is the only case where there
          is a front page behind this one to go back to. */}
      {props.onLeave !== undefined && (
        <p className="walk-leave">
          <button
            type="button"
            className="linkish"
            onClick={props.onLeave}
            data-testid="walk-leave"
          >
            Go to front page
          </button>
        </p>
      )}
    </main>
  );
}

/**
 * Whether this browser holds a study the researcher started (M49, ISC-527).
 *
 * Exported and taking a list rather than reading storage, so the gate's rule is
 * testable without IndexedDB and so there is one sentence of logic behind it
 * rather than a condition written at the call site.
 */
export function hasOwnStudy(projects: readonly Project[]): boolean {
  return projects.length > 0;
}

/**
 * The front page, which is one of two surfaces.
 *
 * The read is awaited before either is drawn. Rendering the walkthrough while
 * the store is still answering would show it for a frame to every returning
 * researcher, which is the one reader it is not for, and a frame of nothing is
 * cheaper than a frame of the wrong screen.
 */
export function FrontPage(props: { walk?: number } = {}) {
  const [projects, setProjects] = useState<readonly Project[] | undefined>(undefined);
  /* Set by the link on the long page, and by nothing else. A researcher who has
   * a study and wants to read the walkthrough again is asking for this screen,
   * so the request outranks the gate. */
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    void listProjects().then(setProjects);
  }, []);

  if (projects === undefined) return null;
  /* M62, ISC-600: a page's More help, at the screen covering that page, with
   * Go to front page beneath it whether or not the browser holds a project. */
  if (props.walk !== undefined) return <Walkthrough key={props.walk} start={props.walk} onLeave={() => navigate("#/")} />;
  if (asked) return <Walkthrough onLeave={() => setAsked(false)} />;
  if (!hasOwnStudy(projects)) return <Walkthrough />;
  return <Introduction onReadWalkthrough={() => setAsked(true)} />;
}
