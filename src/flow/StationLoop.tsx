/**
 * The shape of the seven steps, declared once (M34, round three).
 *
 * The owner: "The seven steps on the front page should be organized in the same
 * way as the framework layout in the design tab."
 *
 * Before this there were two arrangements of the same seven things. The Design
 * tab drew the loop of four with Site and Process either side of Context and
 * Outcome, the row of three under it, and a sentence beside each explaining
 * what its group is. The front page drew seven cards in an auto-fit grid, in
 * source order, with no loop and no row. A researcher met the seven in one
 * shape on the landing page and a different shape on the first working screen,
 * and the second shape is the one that carries the claim: the four are a loop
 * because answering one changes what the other three should say.
 *
 * So the arrangement moved here and both surfaces read it. What is shared is
 * everything that could drift and matters if it does: which stations are in the
 * loop and which in the row, the order of each, the classes the grid areas hang
 * off, and the two sentences beside them. What is not shared is the cell, and
 * that is the whole design of this module: the Design tab's cell carries a
 * status mark and a title naming the state, and the front page's carries the
 * step's glyph and no status at all, because on the front page there is no
 * study to have a status about.
 *
 * `.rail-*` classes rather than a second vocabulary, and the rules that lay
 * them out moved from design.css into components.css with this, because a
 * surface sheet holding the layout of something two surfaces draw is the same
 * drift one level down.
 */

import type { ReactNode } from "react";
import { STATIONS, type Station, type StationId } from "./stations.ts";

/**
 * How far along the seven a station is, in words, in one place.
 *
 * The Design workspace's kicker and the front page's panel say the same thing
 * about the same seven, and they said it in two files until this. The form is
 * the workspace's own: "Step 3 of 7 · Process", the number first because what
 * the rail cannot say is how far along you are.
 */
/** Where a step sits, in the loops' own words (M84, ISC-705). */
const RING_NAME: Readonly<Record<"outer" | "inner" | "external", string>> = {
  outer: "Outer loop",
  inner: "Inner loop",
  external: "Outside the loops",
};

/* M84, ISC-705: "Step 1 of 8" counted a ring as a queue, and a co-author read
 * the counts as a distraction. The kicker names the step's loop instead. */
export function stepKicker(id: StationId): string {
  const station = STATIONS.find((s) => s.id === id);
  return station === undefined ? "" : `${RING_NAME[station.ring]} · ${station.label}`;
}

/**
 * The figure's name (M83, ISC-698). A co-author asked for a name other than
 * "model" on 2026-10-05, and Matthew named it on 2026-10-06. A proper name,
 * capitalised as written; the glossary's "loop" stays the word for each ring.
 */
export const FRAMEWORK_NAME = "Qualitative Discovery Process Framework";

/**
 * The lede the front page and screen 2 print over the rings, and Design's Help
 * carries (M58, ISC-567; M83, ISC-698). The co-author's fuller lede of 2026-10-05,
 * carried over under the copy rules and the facts of the code: the outer and
 * inner rings are STATIONS by ring, and Sample and Early data open once the six
 * have saved answers (loopGate.ts). Every step is open in any order, which is
 * why it says "answering one step changes what the AI will ask at other steps"
 * rather than giving an order. M86, ISC-718 (Matthew, 2026-10-14): the owner's
 * wording verbatim, with "below" for the figure under it; Help, which prints it
 * away from the figure, takes TWO_LOOPS_LEDE_IN_HELP.
 */
export const TWO_LOOPS_LEDE =
  `Abductive uses the ${FRAMEWORK_NAME} below to take you through the design of your qualitative project. You lay the empirical basis of a strong theoretical contribution in the outer loop: Context, Process, Outcome and Site. You then work through the most interesting and puzzling parts of your data, and the tensions within them, in the inner loop: Puzzle and Bind. Answering one step changes what the AI will ask at other steps. Once you've answered all six, you can move to describing your sampling approach and bring in early data if you have any. You answer all eight steps on the Design tab.`;

/** The same lede for Design's Help, which prints it away from the figure, so "below" goes (M86, ISC-718). */
export const TWO_LOOPS_LEDE_IN_HELP = TWO_LOOPS_LEDE.replace(" below", "");

/** Stations by ring, in STATIONS order. */
export function stationsIn(ring: Station["ring"]): readonly Station[] {
  return STATIONS.filter((s) => s.ring === ring);
}

/**
 * The two loops and the two pieces outside them (M58, ISC-567).
 *
 * Matthew, 2026-09-27: "The puzzle and the bind should become two components of
 * an inner loop in the middle of the Context Process Outcome Site cycle. Make
 * the visual and categories look like two loops, an inner and outer. and then
 * sample and early data are two external pieces."
 *
 * The outer ring is a three-by-three grid with Context on top, Process on the
 * right, Outcome below and Site on the left, so reading clockwise from the top
 * gives the owner's order. Its centre cell holds the inner ring, so the inner
 * ring sits inside the outer by construction and cannot overlap it at any
 * width. The rings themselves are drawn by the stylesheet behind the cells,
 * with a chevron on each arc pointing clockwise. Sample and Early data are a
 * list of their own to the right, apart from both rings.
 *
 * `cell` is the caller's and renders whatever goes inside the list item; the
 * list items, their classes and which list they land in are this module's,
 * because those are the geometry. No partition may drop a station (ISC-82,
 * asserted from STATIONS in tests/flow-discipline.test.ts).
 */
export function StationLoop(props: {
  cell: (station: Station) => ReactNode;
  /** Distinguishes the two surfaces' lists in the DOM for tests and nothing else. */
  testIdPrefix: string;
  /**
   * The sentence beside the figure. The rail passes none and gets the lede; the
   * front page and the walkthrough pass `false`, since they print the lede as
   * the section's own paragraph above the figure.
   */
  note?: ReactNode | false;
  /**
   * M83, ISC-698: the figure's name above the rings. The Design rail passes it;
   * the front page and screen 2 pass none, since their heading is the name.
   */
  caption?: string;
}) {
  const item = (station: Station) => (
    <li key={station.id} className={`rail-cell rail-cell-${station.id}`} data-ring={station.ring}>
      {props.cell(station)}
    </li>
  );

  return (
    <div
      className="rail-rings"
      data-testid={`${props.testIdPrefix}-rings`}
      role={props.caption === undefined ? undefined : "group"}
      aria-label={props.caption ?? undefined}
    >
      {props.caption !== undefined && (
        <p className="rail-caption" data-testid={`${props.testIdPrefix}-caption`} aria-hidden="true">
          {props.caption}
        </p>
      )}
      <ol className="rail-loop" data-testid={`${props.testIdPrefix}-loop`} aria-label="Outer loop">
        {stationsIn("outer").map(item)}
        <li className="rail-centre">
          <ol className="rail-inner" data-testid={`${props.testIdPrefix}-inner`} aria-label="Inner loop">
            {stationsIn("inner").map(item)}
            <li className="ring-arrow ring-arrow-inner-right" aria-hidden="true" />
            <li className="ring-arrow ring-arrow-inner-left" aria-hidden="true" />
          </ol>
        </li>
        <li className="ring-arrow ring-arrow-ne" aria-hidden="true" />
        <li className="ring-arrow ring-arrow-se" aria-hidden="true" />
        <li className="ring-arrow ring-arrow-sw" aria-hidden="true" />
        <li className="ring-arrow ring-arrow-nw" aria-hidden="true" />
      </ol>

      <ol
        className="rail-outer"
        data-testid={`${props.testIdPrefix}-outer`}
        aria-label="Outside the loops"
      >
        {stationsIn("external").map(item)}
      </ol>

      {props.note !== false && <p className="rail-note small muted">{props.note ?? TWO_LOOPS_LEDE}</p>}
    </div>
  );
}
