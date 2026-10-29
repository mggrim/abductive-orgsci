/**
 * The render boundary for a page's identity. The only thing in the app allowed
 * to draw one (FND-04, round nine).
 *
 * Nine rounds of the same defect, and this file is the answer to why eight
 * fixes did not hold.
 *
 * Origin, who put a page in the ontology, is the product's one epistemic claim.
 * It was encoded by convention: a rule in a header, a hue table over here, an
 * origin table over there, and every surface free to reach for either one on
 * its own. Round seven found three surfaces each drawing origin its own way and
 * unified the numbers. Round eight found PagePanel painting the hue and
 * omitting origin entirely, 180px under a key that reads a solid mark as the
 * researcher's own prior, and unified that surface too. Both fixes were correct
 * and neither was a boundary, so both were followed by a census: a grep over
 * the source for the syntax the last offender happened to use. The critic named
 * the pattern in round eight and it is exact: "the rule is written in a header,
 * the named call sites are guarded, and the violation lives in the one nobody
 * globbed."
 *
 * A census can only see a syntax someone thought of. Omitting a channel is not
 * a syntax. So the fix is not a better census, it is that the wrong thing stops
 * being expressible.
 *
 * How that works here. This module imports PAGE_TYPE_COLOUR and nothing else in
 * src may (tests/origin-boundary.test.ts fails on the import, and an import has
 * exactly one syntax, which is the whole reason the check moved from rendering
 * to imports). Nothing about a mark leaves this file as a value: there is no
 * exported fill share, no exported rim weight, no exported hue and no exported
 * attribute record. What leaves is rendered output, React elements for the app
 * and SVG text for the export, and every one of the page forms takes the page
 * and draws hue and origin in the same call. A caller physically cannot obtain
 * the hue without also drawing who wrote the page, because the hue never
 * becomes a value it can hold.
 *
 * The three legend forms are the deliberate exceptions and they are typed so
 * they cannot be misused: `PageTypeKeySwatch` takes a PageType and not a page,
 * `OriginMark` takes an Origin and not a page. A legend names one channel at a
 * time, which is what a legend is for. A row of the ontology index is not a
 * legend, and passing `page.type` to the key swatch is caught by the one rule
 * the census keeps: a file that renders `data-page-id` may not render a key
 * swatch.
 *
 * ── The encoding itself, unchanged from round seven ────────────────────────
 *
 * Origin is fill share and nothing else: solid, half, hollow, in that order,
 * because origin is ordered in a way page type is not. Colour is not part of
 * it on any surface. An earlier pass gave origin an ink ramp as well, which was
 * a second channel saying the same thing on the two surfaces that have no page
 * hue and saying nothing at all on the two that do. The disc's rim is always
 * the mark's own colour at full strength, which is what makes the hollow one
 * still a page of its type; it was --surface, a white ring, which works under a
 * filled disc and erases a hollow one.
 *
 * A dashed ring means one thing everywhere: nothing joins this page yet. It is
 * drawn outside the disc rather than on its rim, and that is not a style
 * choice. The first version of that fix put the dash on the rim and the live
 * check showed why it cannot go there: with origin owning the fill, the rim has
 * to be the page's own hue at full strength, so a dashed rim on a solid disc is
 * a hue drawn on itself and disappears. Measured on the fixture, the
 * model-proposed page showed its dash and the author-prior page did not, which
 * is the same asymmetry the defect started as.
 *
 * The numbers mirror tokens.css (--origin-fill-*, --origin-rim-*,
 * --adrift-dash) and tests/origin-boundary.test.ts holds the RENDERED mark to
 * the sheet rather than holding a table to it, because a table that agrees with
 * the sheet while three surfaces ignore the table is exactly what shipped.
 */

import type { CSSProperties, ReactNode } from "react";
import type { Origin, PageType } from "../../ledger/events.ts";
import { COLOUR, PAGE_TYPE_COLOUR } from "../tokens.ts";

/**
 * Everything a caller needs to hand over to have a page drawn.
 *
 * Structural rather than the full OntologyPage, so a layout node, a projection
 * row and a revision in a page's history can all be drawn by the same call. It
 * is the pair, always: there is no form of this type carrying only a type or
 * only an origin, which is what makes the round-eight defect a compile error
 * rather than something a census has to notice.
 */
export interface PageIdentity {
  readonly type: PageType;
  readonly origin: Origin;
}

// ── The encoding, private ───────────────────────────────────────────────────

interface Channel {
  readonly fillOpacity: number;
  readonly strokeWidth: number;
}

/** Mirrors --origin-fill-* and --origin-rim-* in tokens.css. */
const CHANNEL: Readonly<Record<Origin, Channel>> = {
  "author-prior": { fillOpacity: 1, strokeWidth: 1.5 },
  "data-driven": { fillOpacity: 0.45, strokeWidth: 1.5 },
  // Heavier on the hollow one so it holds its shape with no fill behind it.
  "model-proposed": { fillOpacity: 0, strokeWidth: 2 },
  // M29. Solid, because a claim you took from a paper is one you are asserting;
  // the ring inside is what says whose it was. See INNER_RING below for why the
  // fourth value could not be another step down the fill ramp.
  "literature-derived": { fillOpacity: 1, strokeWidth: 1.5 },
};

/**
 * The fourth origin's second element: a ring inside the disc (M29, E1).
 *
 * Why not a fourth fill share. Fill runs solid, half, hollow and it is already
 * spent: a fourth step is a value between two existing ones, which at r=5.5 in
 * the trajectory is not a distinction anybody can make, and the ramp's order
 * carries meaning that a fourth value in the middle of it would scramble.
 * Origin stays fill share for the three it was written for; the fourth is
 * solid, which is honest, plus one more mark.
 *
 * Why a ring drawn in the ground colour rather than in the mark's own. The
 * same contrast trap the first dashed-rim fix fell into and the doubt bar had
 * to solve: anything drawn in the mark's colour on a solid fill of that colour
 * disappears. The bar answered it with a ground-coloured halo, and this answers
 * it the same way, with the same value.
 *
 * The ring carries a class as well as the attribute, because there is one
 * surface where the ground is not paper: the intro hero draws in --hero-ink on
 * a dark ground, so intro.css re-points the stroke there. A presentation
 * attribute loses to any rule, which is exactly the precedence this needs.
 *
 * The weight is a share of the radius with a floor and a ceiling, for the
 * reason the doubt bar's is: a flat weight is most of a 14px swatch and a
 * hairline on a 56-unit node. The radius is a share, so the ring sits inside
 * the fill at every size and leaves a solid core inside itself.
 */
const INNER_RING_RATIO = 0.5;
const INNER_RING_WEIGHT_RATIO = 0.2;
const INNER_RING_MIN = 1;
const INNER_RING_MAX = 3.5;
const INNER_RING_CLASS = "mark-inner-ring";

/** Which origins draw one. A list, not a boolean, so adding a fifth is one edit. */
function hasInnerRing(origin: Origin): boolean {
  return origin === "literature-derived";
}

interface InnerRingAttrs {
  readonly r: number;
  readonly strokeWidth: number;
}

function innerRing(discRadius: number): InnerRingAttrs {
  return {
    r: discRadius * INNER_RING_RATIO,
    strokeWidth: Math.min(
      INNER_RING_MAX,
      Math.max(INNER_RING_MIN, discRadius * INNER_RING_WEIGHT_RATIO),
    ),
  };
}

/** The ring as an element, for React. Drawn after the disc, on top of the fill. */
function InnerRing(props: { cx: number; cy: number; radius: number }) {
  const ring = innerRing(props.radius);
  return (
    <circle
      className={INNER_RING_CLASS}
      cx={props.cx}
      cy={props.cy}
      r={ring.r}
      fill="none"
      stroke={COLOUR.paper}
      strokeWidth={ring.strokeWidth}
    />
  );
}

/** The same ring as SVG text, for the export. Same arithmetic, same order. */
function innerRingSvg(cx: number, cy: number, radius: number): string {
  const ring = innerRing(radius);
  return `<circle class="${INNER_RING_CLASS}" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${ring.r.toFixed(1)}" fill="none" stroke="${COLOUR.paper}" stroke-width="${ring.strokeWidth.toFixed(1)}"/>`;
}

/** Mirrors --adrift-dash. It was "2 3" in the graph, "4 2" in the export and
 * "4 3" on the intro, for two different meanings. One value, one sentence. */
const ADRIFT_DASH = "4 3";
const ADRIFT_RING_WEIGHT = 1.5;

/**
 * The bar across a disc whose origin the ledger contradicts. Mirrors
 * --doubt-bar-max and --doubt-halo in tokens.css.
 *
 * Why it is a channel on the mark and not only a sentence somewhere. Origin is
 * the fill share and nothing else, so on a page the ledger contradicts the fill
 * share is the thing that is not sound. A caveat printed in a card the reader
 * has to click, or a footnote under a figure, leaves the disc itself asserting
 * the claim to every reader who only looks: on the fixture that was the index
 * cell, the drawing and ontology.svg, all three showing the solid disc the key
 * defines as "you put this page here out of your own prior thinking".
 *
 * Why it is drawn twice. Every other treatment tried here failed on contrast
 * for a reason already written into this file: the rim is the mark's own colour
 * at full strength, so anything drawn in that colour on top of a solid fill of
 * that colour disappears, which is exactly how the first dashed-rim fix died.
 * The bar is drawn once in the ground colour at the wider weight and once in
 * the mark's colour on top, which is the same halo trick ontology.css already
 * uses to keep a node caption legible where it crosses an edge. On a solid disc
 * the ground-coloured halo does the work; on a hollow one the coloured bar
 * does; neither case depends on the other.
 *
 * The weight is a share of the radius with a floor and a ceiling. A flat weight
 * is most of a 14px swatch and a hairline on a 56-unit node; an uncapped ratio
 * puts a 9-unit slab across the node in the figure.
 */
const DOUBT_BAR_RATIO = 0.16;
const DOUBT_BAR_MIN = 1.5;
const DOUBT_BAR_MAX = 4;
const DOUBT_HALO_EXTRA = 1.5;

function barWeight(discRadius: number): number {
  return Math.min(DOUBT_BAR_MAX, Math.max(DOUBT_BAR_MIN, discRadius * DOUBT_BAR_RATIO));
}

interface BarAttrs {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly weight: number;
  readonly halo: number;
}

/** A chord at 45 degrees through the centre, ending on the rim. */
function bar(cx: number, cy: number, radius: number): BarAttrs {
  const reach = radius * Math.SQRT1_2;
  const weight = barWeight(radius);
  return {
    x1: cx - reach,
    y1: cy + reach,
    x2: cx + reach,
    y2: cy - reach,
    weight,
    halo: weight + DOUBT_HALO_EXTRA,
  };
}

/**
 * How far outside the rim the ring sits, as a share of the disc's own radius,
 * and never less than the floor below.
 *
 * Both halves were measured live and both were wrong on their own. A flat 4
 * units is a tenth of the graph's 38-unit disc and most of a 14px legend
 * swatch, which left the swatch drawing its disc at r=1.25: a dot with no
 * readable fill share, for the mark that has to show one. A pure ratio failed
 * the other way, putting the ring 0.66px outside a rim of the same colour at
 * 16px, which is not a ring, it is a ragged edge.
 *
 * Which binds depends on the size. At the fixture's 56.2-unit node the ratio
 * wins and the ring sits at 61.9; at an 18px index swatch the floor wins and
 * holds 3 units of clear space around a disc of r=5.25.
 */
const ADRIFT_RING_GAP_RATIO = 0.1;
const ADRIFT_RING_MIN_GAP = 3;

function ringGap(discRadius: number): number {
  return Math.max(ADRIFT_RING_MIN_GAP, discRadius * ADRIFT_RING_GAP_RATIO);
}

/**
 * The disc radius whose ring lands exactly on `outer`.
 *
 * A legend swatch is a fixed box and a figure is not, so the two size the pair
 * from opposite ends. Both go through here rather than each subtracting its own
 * guess at a gap, which is how the export legend and the React swatch came to
 * draw two different rings for one meaning. The min is the exact inverse of
 * ringGap rather than an approximation of it: whichever constraint binds is the
 * smaller answer.
 */
function discRadiusForRing(outer: number): number {
  return Math.min(outer - ADRIFT_RING_MIN_GAP, outer / (1 + ADRIFT_RING_GAP_RATIO));
}

interface DiscAttrs {
  readonly fill: string;
  readonly fillOpacity: number;
  readonly stroke: string;
  readonly strokeWidth: number;
}

/**
 * `colour` is the page hue where there is a page and `currentColor` where the
 * surface is naming an origin in the abstract, which is how the intro's dark
 * ground and the trajectory's ink get the identical mark without a second
 * palette. Private: handing this record out is handing out the hue.
 */
function disc(origin: Origin, colour: string): DiscAttrs {
  const channel = CHANNEL[origin];
  return {
    fill: colour,
    fillOpacity: channel.fillOpacity,
    stroke: colour,
    strokeWidth: channel.strokeWidth,
  };
}

interface RingAttrs {
  readonly r: number;
  readonly fill: "none";
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly strokeDasharray: string;
}

/** The bar as elements, for React. Halo first, so the colour lands on top. */
function DoubtBar(props: { cx: number; cy: number; radius: number; colour: string }) {
  const b = bar(props.cx, props.cy, props.radius);
  return (
    <>
      <line
        x1={b.x1}
        y1={b.y1}
        x2={b.x2}
        y2={b.y2}
        stroke={COLOUR.paper}
        strokeWidth={b.halo}
        strokeLinecap="round"
      />
      <line
        x1={b.x1}
        y1={b.y1}
        x2={b.x2}
        y2={b.y2}
        stroke={props.colour}
        strokeWidth={b.weight}
        strokeLinecap="round"
      />
    </>
  );
}

/** The same bar as SVG text, for the export. Same arithmetic, same order. */
function doubtBarSvg(cx: number, cy: number, radius: number, colour: string): string {
  const b = bar(cx, cy, radius);
  const line = (stroke: string, width: number) =>
    `<line x1="${b.x1.toFixed(1)}" y1="${b.y1.toFixed(1)}" x2="${b.x2.toFixed(1)}" y2="${b.y2.toFixed(1)}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round"/>`;
  return [line(COLOUR.paper, b.halo), line(colour, b.weight)].join("\n");
}

function ring(radius: number, colour: string): RingAttrs {
  return {
    r: radius + ringGap(radius),
    fill: "none",
    stroke: colour,
    strokeWidth: ADRIFT_RING_WEIGHT,
    strokeDasharray: ADRIFT_DASH,
  };
}

/**
 * The disc radius that fits a box of `size`, with room for the rim and, when
 * there is one, the ring.
 *
 * The ring has to fit inside the same box, so the disc gives up what the ring
 * takes rather than the swatch growing and shifting the line of text it sits
 * in.
 */
function boxRadius(origin: Origin, size: number, adrift: boolean): number {
  const weight = Math.max(CHANNEL[origin].strokeWidth, adrift ? ADRIFT_RING_WEIGHT : 0);
  const outer = size / 2 - weight / 2;
  return adrift ? discRadiusForRing(outer) : outer;
}

// ── The page forms. Hue and origin, never one without the other ─────────────

/**
 * A page, at reading size, in a list or a row.
 *
 * The round-eight offender is what this replaces. The ontology index drew
 * `<span className="swatch" style={{background: PAGE_TYPE_COLOUR[page.type]}}/>`,
 * an 11.2px solid rounded square in the page hue carrying no origin at all, so
 * the model's page was a full chip in the list the researcher scans before they
 * look at the picture. Measured live at 1440, both rows computed opacity 1 and
 * border-width 0, 180px under a key stating that a solid mark is the
 * researcher's own prior.
 *
 * It is the node's disc now, one size down and out of the same call.
 *
 * The mark is aria-hidden and the row is expected to say the same two things in
 * its own words. An earlier cut gave the swatch a <title>, and the live read
 * showed what that costs: the button's accessible name became "yours; dashed
 * ring: nothing relates to this page yet…" before the title of the page, so
 * every row announced the encoding before it announced what it was.
 */
export function PageMark(props: {
  page: PageIdentity;
  /** Box edge in px. The disc is inset by its own rim so nothing clips. */
  size?: number;
  /** Draws the unattached ring around the disc, as the graph and export do. */
  adrift?: boolean;
  /** The ledger contradicts this page's origin stamp. See originAudit.ts. */
  doubted?: boolean;
}) {
  const size = props.size ?? 14;
  const adrift = props.adrift === true;
  const doubted = props.doubted === true;
  const colour = PAGE_TYPE_COLOUR[props.page.type];
  const r = boxRadius(props.page.origin, size, adrift);
  return (
    <svg
      className="origin-swatch"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      data-origin={props.page.origin}
      data-page-type={props.page.type}
      {...(adrift ? { "data-adrift": "true" } : {})}
      {...(doubted ? { "data-origin-doubted": "true" } : {})}
      aria-hidden="true"
      focusable="false"
    >
      {/* The ring is drawn before the disc so the disc sits on top of it, on
          every surface, which is what makes "the one without a dash" the disc
          for anything reading the output back. */}
      {adrift && <circle cx={size / 2} cy={size / 2} {...ring(r, colour)} />}
      <circle cx={size / 2} cy={size / 2} r={r} {...disc(props.page.origin, colour)} />
      {hasInnerRing(props.page.origin) && (
        <InnerRing cx={size / 2} cy={size / 2} radius={r} />
      )}
      {/* After the disc, because it is a qualification of the fill and has to
          sit on top of it. */}
      {doubted && <DoubtBar cx={size / 2} cy={size / 2} radius={r} colour={colour} />}
    </svg>
  );
}

/**
 * A page in a figure, at the radius the layout gave it.
 *
 * Returns the pair of circles rather than a wrapper, because the caller owns
 * the <g> that carries the transform, the selection class and the page id.
 * Selection overrides the disc rim here rather than at the call site: it is a
 * transient interaction state, it lasts as long as a click, and it never
 * reaches paper.
 */
export function PageDisc(props: {
  page: PageIdentity;
  radius: number;
  cx?: number;
  cy?: number;
  adrift?: boolean;
  selected?: boolean;
  /** The ledger contradicts this page's origin stamp. See originAudit.ts. */
  doubted?: boolean;
}) {
  const { radius } = props;
  const cx = props.cx ?? 0;
  const cy = props.cy ?? 0;
  const adrift = props.adrift === true;
  const selected = props.selected === true;
  const doubted = props.doubted === true;
  const colour = PAGE_TYPE_COLOUR[props.page.type];
  return (
    <>
      {adrift && !selected && (
        <circle className="node-adrift" cx={cx} cy={cy} {...ring(radius, colour)} />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        data-origin={props.page.origin}
        {...disc(props.page.origin, colour)}
        {...(selected ? { stroke: COLOUR["ink-strong"], strokeWidth: 3 } : {})}
      />
      {hasInnerRing(props.page.origin) && <InnerRing cx={cx} cy={cy} radius={radius} />}
      {/* Unlike selection, this is not a transient interaction state and it
          does reach paper: the same bar is in the exported figure. */}
      {doubted && <DoubtBar cx={cx} cy={cy} radius={radius} colour={colour} />}
    </>
  );
}

/**
 * The same page, as SVG text, for the export.
 *
 * The export renderer builds strings rather than elements, and giving it its
 * own formatter is exactly how it ended up with a third convention: paper fill,
 * a 2.5 rim and a dash of "4 2", on the artefact that leaves the tool and goes
 * into a paper. It calls this, so the export and the app cannot disagree.
 */
export function pageDiscSvg(args: {
  page: PageIdentity;
  cx: number;
  cy: number;
  radius: number;
  adrift?: boolean;
  /** The ledger contradicts this page's origin stamp. See originAudit.ts. */
  doubted?: boolean;
}): string {
  const colour = PAGE_TYPE_COLOUR[args.page.type];
  const cx = args.cx.toFixed(1);
  const cy = args.cy.toFixed(1);
  const out: string[] = [];
  if (args.adrift === true) {
    const a = ring(args.radius, colour);
    out.push(
      `<circle cx="${cx}" cy="${cy}" r="${a.r.toFixed(1)}" fill="none" stroke="${a.stroke}" stroke-width="${a.strokeWidth}" stroke-dasharray="${a.strokeDasharray}"/>`,
    );
  }
  const d = disc(args.page.origin, colour);
  out.push(
    `<circle cx="${cx}" cy="${cy}" r="${args.radius.toFixed(1)}" fill="${d.fill}" fill-opacity="${d.fillOpacity}" stroke="${d.stroke}" stroke-width="${d.strokeWidth}"/>`,
  );
  if (hasInnerRing(args.page.origin)) {
    out.push(innerRingSvg(args.cx, args.cy, args.radius));
  }
  // The figure that goes into the paper carries the caveat as a mark and not
  // only as a line of legend text, for the same reason the screen does: a
  // reader who only looks at the picture must not be told a model draft is the
  // researcher's own prior.
  if (args.doubted === true) out.push(doubtBarSvg(args.cx, args.cy, args.radius, colour));
  return out.join("\n");
}

// ── The legend forms. One channel at a time, and never given a page ─────────

/**
 * An origin named in the abstract, at reading size.
 *
 * Every legend that named origin used to draw its own swatch: the intro hero
 * painted three <span> backgrounds off an inverted ink ramp, the graph key
 * described "pale fill" in words with no mark beside it, and the trajectory
 * legend painted a flat square. None of the three was the disc the figure next
 * to it drew, which is how a legend stops being one.
 *
 * Takes an Origin and not a page, and takes its colour from `currentColor`,
 * which is what lets the same component sit on the intro's dark ground and on
 * white without either surface holding a palette.
 */
export function OriginMark(props: {
  origin: Origin;
  size?: number;
  adrift?: boolean;
  /** For the key row that defines the bar. A legend names one channel at a time. */
  doubted?: boolean;
}) {
  const size = props.size ?? 14;
  const adrift = props.adrift === true;
  const doubted = props.doubted === true;
  const r = boxRadius(props.origin, size, adrift);
  return (
    <svg
      className="origin-swatch"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      data-origin={props.origin}
      {...(adrift ? { "data-adrift": "true" } : {})}
      {...(doubted ? { "data-origin-doubted": "true" } : {})}
      aria-hidden="true"
      focusable="false"
    >
      {adrift && <circle cx={size / 2} cy={size / 2} {...ring(r, "currentColor")} />}
      <circle cx={size / 2} cy={size / 2} r={r} {...disc(props.origin, "currentColor")} />
      {hasInnerRing(props.origin) && <InnerRing cx={size / 2} cy={size / 2} radius={r} />}
      {doubted && <DoubtBar cx={size / 2} cy={size / 2} radius={r} colour="currentColor" />}
    </svg>
  );
}

/**
 * An origin in a figure that has no page hue: the intro hero and the ontology
 * trajectory, both of which draw one ink and let origin carry the difference.
 */
export function OriginDisc(props: {
  origin: Origin;
  cx: number;
  cy: number;
  radius: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ring = innerRing(props.radius);
  return (
    <>
      <circle
        cx={props.cx}
        cy={props.cy}
        r={props.radius}
        data-origin={props.origin}
        {...(props.className === undefined ? {} : { className: props.className })}
        {...(props.style === undefined ? {} : { style: props.style })}
        {...disc(props.origin, "currentColor")}
      >
        {props.children}
      </circle>
      {/* The caller's class and style go on the ring too, so the pair animates
          and fades as one mark rather than the ring arriving before the disc it
          sits inside. The class the ring adds is its own and comes second, so a
          surface that re-points the stroke still wins. */}
      {hasInnerRing(props.origin) && (
        <circle
          cx={props.cx}
          cy={props.cy}
          r={ring.r}
          fill="none"
          stroke={COLOUR.paper}
          strokeWidth={ring.strokeWidth}
          className={
            props.className === undefined
              ? INNER_RING_CLASS
              : `${props.className} ${INNER_RING_CLASS}`
          }
          {...(props.style === undefined ? {} : { style: props.style })}
        />
      )}
    </>
  );
}

/**
 * A page type named in a key, which is the one place a hue appears with no
 * origin beside it and the one place that is correct: there is no page here to
 * attribute, only the hue being defined.
 *
 * Typed against PageType rather than PageIdentity so the call site cannot hand
 * it a page, and tests/origin-boundary.test.ts fails if a file that renders
 * `data-page-id` renders one of these at all.
 */
export function PageTypeKeySwatch(props: { type: PageType }) {
  return (
    <span
      className="graphkey-swatch"
      style={{ background: PAGE_TYPE_COLOUR[props.type] }}
      data-page-type={props.type}
      aria-hidden="true"
    />
  );
}

/** The same three legend forms, as SVG text, for the export's own legend. */
export function pageTypeKeySwatchSvg(args: { type: PageType; cx: number; cy: number; radius: number }): string {
  return `<circle cx="${args.cx}" cy="${args.cy}" r="${args.radius}" fill="${PAGE_TYPE_COLOUR[args.type]}"/>`;
}

/**
 * A standalone SVG has no colour context to inherit, so the export's legend
 * marks take the ink the rest of its legend takes. The choice lives here rather
 * than at the call site for the same reason every other number does.
 */
export function originLegendSvg(args: { origin: Origin; cx: number; cy: number; radius: number }): string {
  const d = disc(args.origin, COLOUR["ink-strong"]);
  const out = [
    `<circle cx="${args.cx}" cy="${args.cy}" r="${args.radius}" fill="${d.fill}" fill-opacity="${d.fillOpacity}" stroke="${d.stroke}" stroke-width="${d.strokeWidth}"/>`,
  ];
  if (hasInnerRing(args.origin)) out.push(innerRingSvg(args.cx, args.cy, args.radius));
  return out.join("\n");
}

/**
 * The doubted mark in a legend row, for the exported figure.
 *
 * Drawn on a solid disc on purpose: solid is the fill share the fixture's
 * doubted page actually carries, and it is the case where the caveat matters
 * most, because solid is the one the key defines as the researcher's own prior.
 */
export function originDoubtLegendSvg(args: { cx: number; cy: number; radius: number }): string {
  const d = disc("author-prior", COLOUR["ink-strong"]);
  return [
    `<circle cx="${args.cx}" cy="${args.cy}" r="${args.radius}" fill="${d.fill}" fill-opacity="${d.fillOpacity}" stroke="${d.stroke}" stroke-width="${d.strokeWidth}"/>`,
    doubtBarSvg(args.cx, args.cy, args.radius, COLOUR["ink-strong"]),
  ].join("\n");
}

/**
 * The size channel in a legend row: the two radii the drawing is using, side by
 * side.
 *
 * The gap between them, and why the pair needs its own arithmetic at all. Every
 * other legend mark here fits the swatch box the row already reserves; this one
 * is two discs and is wider than that box, so the row's text has to start past
 * whatever the pair actually spends. `sizeContrastSpan` is that number, and it
 * lives here with the drawing rather than at the call site, because a caller
 * that computes its own indent is a caller whose text will one day sit on top
 * of the small disc.
 *
 * Both discs carry the same fill share on purpose. Origin is fill share and
 * nothing else, so varying it here would put two channels in a row that names
 * one; solid is the same choice `originDoubtLegendSvg` makes and for the same
 * reason. The only difference between the two marks is the one the row defines.
 */
const SIZE_PAIR_GAP = 4;

export function sizeContrastSpan(radius: number, ratio: number): number {
  return 2 * radius + SIZE_PAIR_GAP + 2 * radius * ratio;
}

/** Where the two discs sit, given the left edge of the pair. */
function sizePair(x: number, radius: number, ratio: number) {
  const small = radius * ratio;
  return {
    big: { cx: x + radius, r: radius },
    small: { cx: x + 2 * radius + SIZE_PAIR_GAP + small, r: small },
  };
}

export function sizeContrastLegendSvg(args: {
  /** The left edge of the pair, not the centre of a disc: it is two marks. */
  x: number;
  cy: number;
  radius: number;
  ratio: number;
}): string {
  const d = disc("author-prior", COLOUR["ink-strong"]);
  const pair = sizePair(args.x, args.radius, args.ratio);
  return [pair.big, pair.small]
    .map(
      (c) =>
        `<circle cx="${c.cx.toFixed(1)}" cy="${args.cy}" r="${c.r.toFixed(1)}" fill="${d.fill}" fill-opacity="${d.fillOpacity}" stroke="${d.stroke}" stroke-width="${d.strokeWidth}"/>`,
    )
    .join("\n");
}

/** The same pair on screen, so the key and the figure show one mark. */
export function SizeContrastKeySwatch(props: { ratio: number; size?: number }) {
  const size = props.size ?? 14;
  const radius = boxRadius("author-prior", size, false);
  const width = sizeContrastSpan(radius, props.ratio) + CHANNEL["author-prior"].strokeWidth;
  const pair = sizePair(CHANNEL["author-prior"].strokeWidth / 2, radius, props.ratio);
  return (
    <svg
      className="origin-swatch"
      width={width}
      height={size}
      viewBox={`0 0 ${width} ${size}`}
      data-size-contrast="true"
      aria-hidden="true"
      focusable="false"
    >
      {[pair.big, pair.small].map((c) => (
        <circle
          key={c.r}
          cx={c.cx}
          cy={size / 2}
          r={c.r}
          {...disc("author-prior", "currentColor")}
        />
      ))}
    </svg>
  );
}

/**
 * The unattached mark in a legend row: a fixed swatch box, so the disc is sized
 * back from the ring rather than the ring being guessed at half a gap outside
 * the disc. One arithmetic, shared with the React swatch.
 */
export function adriftLegendSvg(args: { cx: number; cy: number; radius: number }): string {
  const inner = discRadiusForRing(args.radius);
  const a = ring(inner, COLOUR["ink-strong"]);
  const d = disc("author-prior", COLOUR["ink-strong"]);
  return [
    `<circle cx="${args.cx}" cy="${args.cy}" r="${a.r.toFixed(1)}" fill="none" stroke="${a.stroke}" stroke-width="${a.strokeWidth}" stroke-dasharray="${a.strokeDasharray}"/>`,
    `<circle cx="${args.cx}" cy="${args.cy}" r="${inner}" fill="${d.fill}" fill-opacity="${d.fillOpacity}" stroke="${d.stroke}" stroke-width="${d.strokeWidth}"/>`,
  ].join("\n");
}
