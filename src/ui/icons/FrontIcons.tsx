/**
 * The front page's line glyphs (M34).
 *
 * The owner: "For what goes wrong early, there should be icons for each of the
 * nine aspects … seven steps should have an icon for each of the seven."
 *
 * What these are and what they are not. They are not information: every card
 * they sit on already carries a heading and a body that say the whole thing,
 * and each glyph is `aria-hidden`, so a screen reader meets the words and
 * nothing else. What they buy is a landing page whose three long lists can be
 * scanned rather than read end to end, and a card whose top-left corner says
 * which of the nine or seven it is before the eye reaches the sentence.
 *
 * Four rules the set is held to, and each one is a defect this page has already
 * had once in some other channel:
 *
 *   One metaphor per item, taken from that item's own words. The table below
 *   names all twenty-three in one line each, so the choice can be judged
 *   without reading twenty-three path strings. An icon that illustrates the
 *   section rather than the item is decoration and would be better absent.
 *
 *   Achromatic. `stroke="currentColor"` and nothing else, so a glyph inherits
 *   the ink of the card it sits in. Hue is spent entirely on page type
 *   (src/ui/tokens.ts), and a second palette on the first screen is exactly
 *   what the hero figure was sent back for: green meaning "from the data" here
 *   and "observation" two clicks later.
 *
 *   No fetch. Inline SVG, no sprite sheet, no icon font, no request. The claim
 *   the page rests on is that nothing leaves the machine, and a glyph that
 *   pulled a font would put a line in the network log of every session.
 *
 *   No dash. `strokeDasharray` is a channel the ontology surfaces spend on "no
 *   claim is joined to this page yet" (src/ui/components/PageMark.tsx), and
 *   tests/origin-boundary.test.ts holds it there. A dashed line in a front-page
 *   glyph would be teaching that channel a second meaning on the screen whose
 *   job is to teach the first. Where a metaphor wanted an absence it is drawn
 *   as an absence: the empty place at the table is a missing seat, not a ghost
 *   of one.
 *
 * ── The twenty-three metaphors ─────────────────────────────────────────────
 *
 * What goes wrong early (nine):
 *
 *   topic-not-puzzle        a bar's whole breadth funnelled to a single point
 *   no-conversation         two conversations running, no mark on which one is yours
 *   site-of-convenience     a door standing open onto its own threshold
 *   question-out-of-reach   a span that stops short of the mark it measures to
 *   convenient-sample       a picker that reaches only the nearest of a row
 *   thin-evidence           a short stack under the height it has to clear
 *   native-explanation      three identical figures, the setting's own chorus
 *   early-closure           a lidded box, shut, with what would not go in beside it
 *   lost-provenance         three discs, solid, half and hollow
 *
 * How to use the tool (seven): left the front page with "How the parts fit
 * together" at M88 (the owner, 2026-10-14), and its seven glyphs went with it.
 * The round notes below on decide and export describe drawings that are gone.
 *
 * The steps (seven):
 *
 *   context                 a horizon, with the study standing on it
 *   site                    a small enclosure marked off inside a wider field
 *   process                 three stages linked in a row, one run of the process
 *   outcome                 one course ending at two different heights
 *   sample                  three unlike items drawn out of one set
 *   early-data              a first pass cut across the material
 *   bind                    a form held between two opposing pressures
 *
 * ── What round four changed, and why ───────────────────────────────────────
 *
 * The design critic read all twenty-three at 24px and at 10x. Sixteen read as
 * their item, two did not, and five were "weak rather than wrong". The two are
 * redrawn and all five of the weak ones are amended, on the principle the
 * critique makes plain: at 24px a glyph has room for one shape, and a metaphor
 * that needs a second shape to disambiguate the first has already failed.
 *
 *   no-conversation   was seats round a table with one place unfilled. At 24px
 *                     a ring with three marks round it is a camera aperture or
 *                     a settings dial, and nothing in it said table or absence.
 *                     Now three staggered rules: two turns of an exchange
 *                     already running, and a third begun and stopped, which is
 *                     your line in a conversation you have not joined.
 *   early-closure     was a band folded back on itself, which renders as the
 *                     universal undo hook, so it read as "go back" when the
 *                     obstacle is closing too soon. Now a box with its lid
 *                     shut and one thing left outside it, which is what the
 *                     tool's answer to this obstacle is about: the list of
 *                     what your account cannot absorb.
 *   topic-not-puzzle  the narrowing read as a plain arrowhead. The wide end is
 *                     a full-height bar now, so it is a funnel from a breadth
 *                     to a point rather than a chevron.
 *   decide            the caret carried all the meaning and was inside the
 *                     sheet. It straddles the sheet's top edge now, at twice
 *                     the size, so the difference between the two sheets is
 *                     the first thing read rather than the last.
 *   export            three curves out of a box read as a knot. Straight now,
 *                     which at this size is the difference between three lines
 *                     and a tangle.
 *   process           two plain bars round a wave read as a chart. Brackets
 *                     now, which say a bounded stretch rather than an axis.
 *   sample            three stems of different heights on a base read as a
 *                     podium. The stems are gone; the three unlike items sit
 *                     on one line above the set they came out of, tied to it
 *                     by a single stroke.
 *
 * ── What round five changed ────────────────────────────────────────────────
 *
 * The critic read the seven redraws and passed four. The three below were each
 * on their third drawing, and each failed the same way twice for a reason worth
 * writing down, because all three reasons are about what a shape means at 24px
 * rather than about what it was meant to mean.
 *
 *   no-conversation   a horizontal rule reads as text at this size, whatever it
 *                     stands for, so three of them read as a list rather than
 *                     as turns of an exchange. Two speech bubbles now, because
 *                     a bubble is the one shape that says speech without a
 *                     second shape to explain it, and two of them say the
 *                     plural the item is actually about.
 *   export            what makes a knot is lines meeting at a point, not their
 *                     curvature, so straightening them (round four) changed
 *                     nothing. Nothing converges now: one record, three files,
 *                     one connector, four rectangles of one family.
 *   process           a line that rises and falls is a chart at 24px whatever
 *                     is drawn around it, so bracketing it made it a chart in a
 *                     box. The wave is gone. Three stages and two joins say a
 *                     sequence that runs rather than a quantity that varies.
 *
 * ── Completeness ───────────────────────────────────────────────────────────
 *
 * The two records below are keyed by a union type, so an item added to
 * OBSTACLES or STATIONS without a glyph is a compile error rather
 * than a card with a hole in it. tests/m34-front.test.ts asserts the same
 * property from the arrays' side, because a union that drifted away from the
 * array it describes would make the compile check agree with itself.
 */

import type { ReactElement, ReactNode } from "react";
import type { StationId } from "../../flow/stations.ts";

/** The nine, in the order a researcher meets them. */
export type ObstacleId =
  | "topic-not-puzzle"
  | "no-conversation"
  | "site-of-convenience"
  | "question-out-of-reach"
  | "convenient-sample"
  | "thin-evidence"
  | "native-explanation"
  | "early-closure"
  | "lost-provenance";

/**
 * The one box every glyph is drawn in.
 *
 * 24 units square, 1.5 of stroke, round caps and joins, no fill. The single
 * exception is the origin marks in `lost-provenance`, where fill share IS the
 * metaphor: it is the encoding the product turns on, and drawing it hollow to
 * satisfy a rule about fills would draw the wrong thing.
 */
function Glyph(props: { children: ReactNode }): ReactElement {
  return (
    <svg
      className="front-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {props.children}
    </svg>
  );
}

export const OBSTACLE_ICONS: Readonly<Record<ObstacleId, ReactElement>> = {
  /* A bar's whole breadth funnelled to a single point: the interest you arrived
   * with, and the one thing the answers turn it into. The bar is what stops the
   * two converging lines reading as an arrowhead (round four). */
  "topic-not-puzzle": (
    <Glyph>
      <path d="M3 4 v16" />
      <path d="M3 4 L16.5 12" />
      <path d="M3 20 L16.5 12" />
      <circle cx="19.8" cy="12" r="1.7" />
    </Glyph>
  ),
  /* Two conversations already running, one behind the other, and no mark on
   * which of them is yours. The obstacle is not that nobody is talking, it is
   * that several arguments are under way and you have not said which one you
   * are joining.
   *
   * Third drawing of this one. Round four's ring of seats read as a camera
   * aperture; round five's staggered rules read as a list, because a horizontal
   * rule at this size reads as text whatever it is standing for. A bubble is
   * the one shape that says speech without needing a second shape to say it,
   * and two of them say the thing the item is actually about, which is the
   * plural. */
  "no-conversation": (
    <Glyph>
      <path d="M9 3.5 h9.5 a2 2 0 0 1 2 2 v5 a2 2 0 0 1-2 2 H17" />
      <path d="M13.5 8 H5 a2 2 0 0 0-2 2 v5 a2 2 0 0 0 2 2 h1.5 v3.5 l3.5-3.5 h3.5 a2 2 0 0 0 2-2 v-5 a2 2 0 0 0-2-2 z" />
    </Glyph>
  ),
  /* A door standing open onto its own threshold: the site you picked because
   * you could get in. */
  "site-of-convenience": (
    <Glyph>
      <path d="M5 20 V4 h9" />
      <path d="M14 3.5 l5 2.5 v12 l-5 2.5 z" />
      <path d="M3 20 h18" />
    </Glyph>
  ),
  /* A span that stops short of the mark it measures to: the level and the
   * timespan your data reaches, against the one your question asks about. */
  "question-out-of-reach": (
    <Glyph>
      <path d="M3.5 8.5 v7" />
      <path d="M3.5 12 h9" />
      <path d="M12.5 9.5 v5" />
      <path d="M20 4.5 v15" />
    </Glyph>
  ),
  /* A picker that reaches only the nearest of a row: a sample chosen by what
   * was in arm's reach, with a rationale written afterwards. */
  "convenient-sample": (
    <Glyph>
      <path d="M19 4 C10.5 4 6 7 6 13" />
      <path d="M3.6 10.6 L6 13.4 L8.4 10.6" />
      <circle cx="6" cy="18.5" r="1.6" />
      <circle cx="12" cy="18.5" r="1.6" />
      <circle cx="18" cy="18.5" r="1.6" />
    </Glyph>
  ),
  /* A short stack under the height it has to clear: the evidence base against
   * what the venue's reviewers expect of one. */
  "thin-evidence": (
    <Glyph>
      <path d="M3.5 6.5 h17" />
      <rect x="5" y="13" width="14" height="3.2" rx="1.2" />
      <rect x="5" y="17.2" width="14" height="3.2" rx="1.2" />
    </Glyph>
  ),
  /* Three identical figures: the setting's own chorus, which is what you are
   * explaining with when everyone there already senses it. */
  "native-explanation": (
    <Glyph>
      <circle cx="5.5" cy="8" r="2" />
      <path d="M2.5 17 a3 3 0 0 1 6 0" />
      <circle cx="12" cy="8" r="2" />
      <path d="M9 17 a3 3 0 0 1 6 0" />
      <circle cx="18.5" cy="8" r="2" />
      <path d="M15.5 17 a3 3 0 0 1 6 0" />
    </Glyph>
  ),
  /* A box with its lid shut, and the one thing left outside it. Closing early
   * is the act; what your account could not absorb is what the tool keeps in
   * front of you. Redrawn at round four, where the fold read as the undo hook
   * and so said "go back" under an obstacle about shutting too soon. */
  "early-closure": (
    <Glyph>
      <rect x="2.5" y="8.5" width="13" height="12.5" rx="2" />
      <path d="M2.5 12.5 h13" />
      <circle cx="19.5" cy="17" r="2" />
    </Glyph>
  ),
  /* Three discs, solid, half and hollow. Fill share is how the product says
   * who wrote a claim, and this is the obstacle that mark exists for. */
  "lost-provenance": (
    <Glyph>
      <circle cx="5" cy="12" r="3" fill="currentColor" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 9 a3 3 0 0 1 0 6 z" fill="currentColor" />
      <circle cx="19" cy="12" r="3" />
    </Glyph>
  ),
};

export const STEP_ICONS: Readonly<Record<StationId, ReactElement>> = {
  /* A horizon with the study standing on it: the world the study is set in. */
  context: (
    <Glyph>
      <path d="M2.5 17.5 C7 12 17 12 21.5 17.5" />
      <path d="M12 14.2 V8" />
      <circle cx="12" cy="6" r="1.8" />
    </Glyph>
  ),
  /* A small enclosure marked off inside a wider field: this place rather than
   * anywhere else. */
  site: (
    <Glyph>
      <rect x="2.5" y="3.5" width="19" height="17" rx="2.5" />
      <rect x="8" y="9" width="8" height="6.5" rx="1.2" />
    </Glyph>
  ),
  /* Three stages linked in a row: one instance of the process, running left to
   * right from its first stage to its last.
   *
   * Third drawing, and the lesson is that the wave was always the problem. A
   * line that rises and falls is a chart at 24px whatever is drawn around it,
   * and putting brackets round it (round four) only made it a chart in a box.
   * Nothing rises here. Three identical stages and two joins say a sequence
   * that runs rather than a quantity that varies, which is the distinction the
   * step's own words turn on: a thing you follow as it happens, rather than a
   * condition that holds. */
  process: (
    <Glyph>
      <rect x="1.25" y="9" width="5.5" height="6" rx="1.5" />
      <path d="M6.75 12 h2.5" />
      <rect x="9.25" y="9" width="5.5" height="6" rx="1.5" />
      <path d="M14.75 12 h2.5" />
      <rect x="17.25" y="9" width="5.5" height="6" rx="1.5" />
    </Glyph>
  ),
  /* One course ending at two different heights: what varies at the end, and how
   * you would know it varied. */
  outcome: (
    <Glyph>
      <path d="M2.5 12 h5.5" />
      <path d="M8 12 C12.5 12 13.5 6 19 6" />
      <path d="M8 12 C12.5 12 13.5 18 19 18" />
      <path d="M20.5 4 v4" />
      <path d="M20.5 16 v4" />
    </Glyph>
  ),
  /* Three unlike items drawn out of one set: the variation the comparison
   * needs, against the cases you actually chose. Three stems of unequal length
   * on a base read as a podium, so the items sit on one line and a single
   * stroke ties them to the set they came out of (round four). */
  sample: (
    <Glyph>
      <circle cx="5.5" cy="7.5" r="1.4" />
      <circle cx="12" cy="7.5" r="2.8" />
      <circle cx="18.5" cy="7.5" r="1" />
      <path d="M12 14 v-3.7" />
      <rect x="3" y="14" width="18" height="6.5" rx="2" />
    </Glyph>
  ),
  /* A first pass cut across the material: what your early data has already
   * shown you that you did not expect. */
  "early-data": (
    <Glyph>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M3.5 15.5 L20.5 8.5" />
      <path d="M17.6 7 L20.8 8.4 L19.5 11.6" />
    </Glyph>
  ),
  /* A form held between two opposing pressures: what the people you study are
   * caught between. */
  bind: (
    <Glyph>
      <rect x="9" y="8" width="6" height="8" rx="1.2" />
      <path d="M2 12 h5" />
      <path d="M4.5 9.5 L7 12 L4.5 14.5" />
      <path d="M22 12 h-5" />
      <path d="M19.5 9.5 L17 12 L19.5 14.5" />
    </Glyph>
  ),
  /* M58. A path that runs on and then stops short of where it was heading: the
   * gap between what you expected and what you found. The dashed tail is the
   * part the study cannot yet explain. */
  puzzle: (
    <Glyph>
      <path d="M3 17 C7 17 9 7 13 7" />
      <path d="M15.5 7 h1.5" />
      <path d="M19 7 h1.5" />
      <circle cx="13" cy="7" r="1.6" />
      <path d="M17 16.5 h4" />
    </Glyph>
  ),
};
