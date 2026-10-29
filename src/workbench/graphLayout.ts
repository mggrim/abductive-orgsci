/**
 * Force layout for the ontology graph (ISC-60).
 *
 * `d3-force` computes positions and nothing else — the marks are hand-written
 * SVG in the component. That split is deliberate: d3's own selection API would
 * take ownership of the DOM out of React's hands, and the graph has to stay
 * selection-linked to the page list in both directions, which is far easier
 * when React owns every node.
 *
 * The simulation is run to completion here rather than ticked on animation
 * frames. An ontology graph is tens of nodes, not thousands; settling it
 * synchronously costs a few milliseconds and avoids a whole class of bugs
 * where a node drifts out from under the cursor mid-click.
 */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force";
import { FAMILY } from "../ontology/relationGlossary.ts";
// The head is a mark and the module that draws it owns its size. The layout has
// to subtract it: an arrowhead covers the end of the line it terminates, so the
// stroke a reader sees is the line less the head, and for four rounds no file
// held both numbers at once.
import { ARROW_HEAD } from "../ui/components/RelationMark.tsx";
import type { EdgeRole, OntologyGraph, PageType } from "../ontology/schema.ts";
import { connectingEdges, livePages } from "../ontology/schema.ts";
import type { Origin } from "../ledger/events.ts";

export interface LaidOutNode {
  readonly id: string;
  readonly title: string;
  readonly type: PageType;
  readonly x: number;
  readonly y: number;
  /** Puzzle roots anchor the layout and are drawn larger. */
  readonly isRoot: boolean;
  /**
   * The mark's radius, in viewBox units. It lives here rather than in the
   * component because the collision force and the fit below both have to agree
   * with what gets drawn, and when the component held the two literals (22 and
   * 15) they could not. The survey measured the consequence: a 596x192 canvas,
   * 114,432 px2, holding two 44px dots for 3,041 px2 of mark, so 2.7% of the
   * view the product is named for was carrying information.
   */
  readonly radius: number;
  /**
   * The caption, already wrapped.
   *
   * It was the raw title, ellipsed at 26 characters by the component, so the
   * fixture's two pages rendered as "Communication-problem fra…" and
   * "Agreement about the hando…" while their full titles sat in a list below
   * the graph. Wrapping is a layout concern rather than a drawing one, because
   * the keep-out distances below have to know how wide and how tall the block
   * is before the simulation is fitted into the canvas.
   */
  readonly label: readonly string[];
  readonly origin: Origin;
  readonly status: string;
}

export interface LaidOutEdge {
  readonly id: string;
  readonly role: EdgeRole;
  readonly from: string;
  readonly to: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface GraphLayout {
  readonly nodes: readonly LaidOutNode[];
  readonly edges: readonly LaidOutEdge[];
  readonly width: number;
  readonly height: number;
  /**
   * Whether the drawing is carrying the page names, or whether they could not
   * be placed and the index below is where they are. Exposed rather than
   * inferred from an empty `label`, because a surface that has to guess at this
   * will say nothing and leave the reader with forty unnamed circles.
   *
   * Measured on the placement, not predicted from it. This was a comparison
   * between a sum of caption areas and four tenths of the canvas, taken before
   * the simulation ran, and on the twelve-page probe it was wrong in both
   * directions at once: true at 1024, where eleven of the twelve names were
   * drawn through another name, disc or badge, and false at 1150, where the
   * same twelve would have fitted on a canvas the layout could have asked for.
   */
  readonly captioned: boolean;
  /**
   * Whether this drawing put two radii on the canvas, so a reader has a size
   * difference in front of them that has to be decoded.
   *
   * Exposed for the same reason `captioned` is: the exported figure has no way
   * to ask the ledger a question the layout has already answered, and when it
   * guessed it did not guess at all. It drew the channel and legended every
   * other one. `drawsSizeContrast` is the single answer both readers get.
   */
  readonly sizeContrast: boolean;
  /**
   * Whether every dashed edge on this canvas has room for one full repeat of
   * its own pattern, and therefore whether dash is a channel here at all.
   *
   * Exposed for the same reason `captioned` and `sizeContrast` are, and against
   * the same failure. The key spends eight rows telling the reader that dash
   * separates the members inside each family. On the project's own 44-page
   * probe, 28 of the 38 dashed edges carried less than one repeat, so "2 3",
   * "6 3" and solid were one mark and the eight roles collapsed to their three
   * family colours: read off the running app, `evidences` and `predicts` were
   * byte-identical, as were `contradicts`, `rivals` and `tensions-with`. A key
   * that defines a distinction the drawing is not making teaches the reader to
   * stop reading the key, which is the rule every other row here already
   * follows. So the drawing stops varying dash when it cannot render it, and
   * both keys say which of the two they are looking at.
   */
  readonly dashChannel: boolean;
  /**
   * How many relations the canvas had no room to draw a shaft for.
   *
   * These are the edges whose two discs are close enough that the rim, the
   * standoff and the arrowhead consume the whole distance between them. They
   * are drawn as a head alone, so direction survives, and they are counted here
   * so the surface can say so rather than leaving a reader to wonder why a
   * relation the lede counted has no line under it. The alternative, which is
   * what shipped, is a stroke drawn underneath the source disc: present in the
   * DOM, absent from the picture, and unreachable by the pointer, so even the
   * `<title>` naming the role could not be opened.
   */
  readonly shaftless: number;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
  isRoot: boolean;
}

export interface LayoutOptions {
  readonly width?: number;
  readonly height?: number;
  /**
   * The widest canvas this drawing may lay out on, when the caller is not
   * fixing the width outright.
   *
   * The difference from `width` matters and it is the whole of the 1024 defect.
   * `width` is a promise about the finished figure and it switches the
   * horizontal trim off, because the export renderer and the viewport test both
   * need the box they asked for. This is a ceiling, so the trim still runs and
   * a two-page ontology still crops to the shape its two discs occupy. What it
   * buys is that a full ontology stops being laid out on a canvas nobody
   * measured: 720 units was the ceiling whatever the column was, so at 1024 the
   * graph was a 680px island in a 992px column and sixty-two marks were fitted
   * into 270,000 units of paper when 574,000 were available.
   */
  readonly maxWidth?: number;
  /**
   * Page ids the tool has an open question about, which are the ones that get
   * drawn with a badge.
   *
   * The layout reserved room for a badge against the frame and against nothing
   * else, so at sixty-two pages the discs came out clear of each other and the
   * badges were drawn through their neighbours: read off the running app, the
   * dense half of the drawing was a mesh of overlapping question marks. The
   * badge is a second mark on the same node and the separation below has to
   * know which nodes carry one. Optional, because the SVG export renders no
   * badges at all and must not be spaced as though it did.
   */
  readonly badged?: ReadonlySet<string>;
  /** Iterations to settle. Higher is steadier and still sub-frame at this size. */
  readonly iterations?: number;
}

/**
 * How much of the canvas the marks themselves are allowed to be.
 *
 * The graph drew every node at 22 or 15 units whatever the canvas held, so a
 * two-page ontology spent 2.7% of its area on ink and read as dust rather than
 * as a diagram. A share rather than a size: the fewer the pages the larger each
 * one is drawn, which is the behaviour a network view has and a scatter plot
 * does not. The ceiling stops two pages becoming two dinner plates and the
 * floor keeps a forty-page ontology legible.
 */
const NODE_AREA_SHARE = 0.12;
const RADIUS_MIN = 18;
/**
 * And a ceiling that is the size of a mark rather than the size of a region.
 *
 * 58 was measured in the browser at innerWidth 1440 and it was not 58 on
 * screen. The two fixture discs settled at radius 56.2 and 61.9 in a 363.7-unit
 * viewBox, the SVG rendered that viewBox into a 596px column, and the drawing
 * came back magnified 1.639 times: discs of 92 and 101px in radius, 202px of
 * ink across, under captions whose declared 13px rendered at 21.3px. That last
 * number is the one that matters. The type census counts font sizes in the DOM
 * and the DOM said 13, so the ontology tab was rendering a sixth size on the
 * one surface no stylesheet check could see it on.
 *
 * The magnification is fixed where it was caused, in the component: the figure
 * now renders at its own width and never stretches past it, so one layout unit
 * is one CSS pixel and --text-small is 13px on the canvas as it is everywhere
 * else. This ceiling is the other half. The area share is what a mark may take
 * on a crowded canvas; it was never meant to be what a mark grows to on an
 * empty one, and at two pages it was returning a dinner plate.
 */
const RADIUS_MAX = 30;
/**
 * The open-question badge, and where it is.
 *
 * These two lived in OntologyGraph.tsx and this file carried a flat
 * `BADGE_REACH = 14` beside them, which is the same two-literals-in-two-files
 * arrangement the node radius was pulled out of: the component drew 22 and 15
 * while the collide force believed 38. The badge is a mark with a size and a
 * place, the layout has to keep the frame off it and now has to keep other
 * nodes off it too, so it is described once, here, and the component imports
 * it.
 *
 * It sits on the upper-right diagonal, clear of the widest ring the mark
 * boundary can draw around a disc: the rim plus the larger of 3 units and a
 * tenth of the radius. 1.15 of the radius covers the ratio, `radius + 4` covers
 * the floor at small sizes, and the badge's own radius and a unit of air are
 * added on top.
 */
export const BADGE_RADIUS = 8;
export function badgeOrbit(radius: number): number {
  return Math.max(radius + 4, radius * 1.15) + BADGE_RADIUS + 1;
}
/**
 * How far past the rim the badge reaches along the axis it is placed on.
 *
 * This was the literal 14, which is right for a root disc of 30 and short for
 * a leaf of 8: the badge on an 8-unit disc reaches 22.8 units from the centre
 * and `radius + 14` reserved 22. Derived from the orbit now, so the frame
 * cannot clip a badge at any radius the area share happens to produce.
 */
function badgeSpan(radius: number): number {
  return badgeOrbit(radius) * Math.SQRT1_2 + BADGE_RADIUS - radius;
}
/** And the air between a badge and whatever it is next to. */
const BADGE_CLEARANCE = 3;
/** The widest gap the fit may leave between the closest pair of rims, in root radii. */
const GAP_CEILING = 1.5;
/**
 * How far short of the target's rim an edge stops, so the arrowhead lands on
 * the rim rather than under the disc.
 *
 * Shared, because the exported figure drew no arrowheads at all and the screen
 * did: direction was in the ledger, on the screen and absent from the one
 * artefact that goes into a paper. Now that both draw a head, both have to stop
 * the line in the same place, and the way two files agree about a number is
 * that one of them owns it.
 */
export const ARROW_STANDOFF = 4;
/**
 * And the narrowest, in units, so two rims never meet.
 *
 * This was a bare 8, and 8 is less than it costs to draw an edge. An edge stops
 * `ARROW_STANDOFF` short of the target rim, spends `ARROW_HEAD` on the
 * arrowhead, and only then begins to be a line; so a pair of discs separated by
 * the guaranteed minimum had 8 units to pay a 12-unit bill and the shaft came
 * out negative, which is to say the head was drawn on top of the source disc
 * and no line existed between the two pages at all. Measured on the project's
 * own 44-page probe at the width the app runs at: 23 of 54 relations were in
 * that state, the median surviving shaft across all 54 was 0.7 units, and 19
 * returned no `elementFromPoint` hit anywhere along their length, so even the
 * `<title>` naming the role could not be opened. The same study exported at
 * 900x700 was fine, so the screen and the file disagreed about whether the
 * relation channel was drawn at all.
 *
 * The number is derived from what the drawing actually spends, rather than
 * chosen. Two rims must be far enough apart to pay the standoff, pay the head,
 * and still leave one full repeat of the longest dash pattern, because dash is
 * the channel that separates the members inside a family and a shaft shorter
 * than one repeat renders "2 3", "6 3" and solid as the same mark. `+ 1` is
 * slack: at exactly one repeat the comparison sits on a floating-point boundary
 * and flipped the channel off on 7 of 38 edges that were geometrically fine.
 *
 * Measured with it in place, on the same probe and the same real ledger: the
 * shortest shaft on the 649x379 screen canvas goes from -5.0 to 14.0, every one
 * of the 54 relations is drawn, 0 of the 38 dashed edges are short, and the
 * dash channel is renderable on the screen and in the exported figure at every
 * canvas size tried. `MAX_DASH_PERIOD` is asserted against `EDGE_STYLE` in
 * tests/relations.test.ts, so adding a longer pattern to the table cannot
 * quietly leave this number behind.
 */
export const MAX_DASH_PERIOD = 9;
const RIM_CLEARANCE = ARROW_STANDOFF + ARROW_HEAD + MAX_DASH_PERIOD + 1;
/** How far the marks may be shrunk to stay apart before legibility wins. */
const RADIUS_FLOOR_SHARE = 0.45;
/** A leaf against a puzzle root, at the ratio the original 15/22 pair had. */
export const LEAF_RATIO = 15 / 22;

/**
 * What the size difference is called and what it means, wherever it is drawn.
 *
 * Here rather than in the surface that happened to say it first, for the reason
 * every other channel's words are in one place: the screen printed this
 * sentence and the exported figure printed nothing at all, so the artefact that
 * goes into a paper drew the loudest distinction on the canvas after colour and
 * refused to decode it. Measured in the generated files: the 44-page probe had
 * 7 discs at r=10.5 against 37 at r=7.2, 2.13 times the area, and contained
 * none of these words. Screen and file disagreeing about the same mark is the
 * failure OntologyView's own docstring records as having cost the export
 * voicing five rounds, and it was live in the fifth channel while the other
 * four were being fixed.
 *
 * Two registers on the same rule origin follows: the term names the mark, the
 * sentence defines it. The export prints "term, sentence" on one row, which is
 * exactly what it already does for origin.
 */
/**
 * What the key says when the canvas cannot carry the dash channel.
 *
 * Here rather than in whichever surface said it first, for the reason every
 * other channel's words are in this module: the size channel spent five rounds
 * being drawn on screen and legended nowhere else, and the fix was to put the
 * words where the decision is made. This is the same shape one channel over.
 * Both keys read these two strings, so a reader holding the exported figure
 * beside the screen cannot be told two different things about the same marks.
 *
 * It names where the role went, because a channel that switches off silently is
 * only a quieter version of a channel that renders as one mark. The role is
 * still on the record, still in the index, still in the shape a pointer or the
 * arrow keys can open, and the sentence says so.
 */
export const DASH_OFF_TERM = "Dash";
export const DASH_OFF_READS =
  "is not a channel on this drawing. This drawing holds too many claims for a dash pattern to read, so Abductive draws every link solid and colour carries the family.";
/**
 * And where the role went, which is not the same place on the two surfaces.
 *
 * Two registers rather than one string, because the recovery route genuinely
 * differs and a shared sentence would have to be false on one of them. A screen
 * can be pointed at and a file cannot: telling a reader holding a figure in a
 * paper appendix to select a page is the same class of defect as a key naming a
 * channel the drawing is not making. The explanation above is shared, so both
 * surfaces give the same reason; only the last clause is the surface's own.
 */
export const DASH_OFF_ON_SCREEN =
  "Select a claim to read the role of each link that touches it, in words.";
export const DASH_OFF_IN_FILE =
  "Abductive lists every link by role and direction under the drawing, so you can read the role of each link here even where a line no longer separates them.";

/**
 * And what both surfaces say when the drawing could not carry the names.
 *
 * Here, beside the dash words, for the reason they are here: the decision is
 * taken in this module and a surface that phrases it for itself will sooner or
 * later phrase it differently, or wrongly. Both of those had happened. The
 * screen said "Too many pages to name them here" and the exported figure said
 * "Too many pages to name them on the drawing", which are two sentences for one
 * fact, and on the twelve-page probe at innerWidth 1150 the fact was not the
 * page count at all: twelve pages is not too many, and the same twelve were
 * named at 1024 on a wider canvas. The cause is that the blocks did not fit,
 * which is what this says.
 *
 * Same two registers as the dash, for the same reason: a screen can be pointed
 * at and a file cannot, so the explanation is shared and only the last clause
 * belongs to the surface.
 */
export const NAMES_OFF_READS =
  "The claim names do not fit on this drawing without overlapping. The drawing shows how your claims join up, and the names are in the table.";
/*
 * This read "Pointing at a page, or moving to it with the arrow keys, names
 * it." and was off by the one keystroke that does the naming. `OntologyGraph`
 * moves the roving focus on an arrow and selects only on Enter or Space, which
 * its own comment says in as many words; arrowing between the discs names
 * nothing, opens nothing and changes no row in the index. A promise of a route
 * that does not exist is worse here than anywhere else in the tool, because
 * this sentence is shown at exactly the moment the drawing has withheld every
 * name it has.
 *
 * `tests/relations.test.ts` asserted only that this string contained the words
 * "arrow keys", so it pinned the wrong sentence into place rather than catching
 * it. Restated there against the keystroke the handler actually answers to.
 */
export const NAMES_OFF_ON_SCREEN =
  "Pointing at a claim names it. With the keyboard, arrow to a claim and press Enter.";
export const NAMES_OFF_IN_FILE =
  "Each disc carries a number and Abductive names every number below, so a reader holding only this figure can still say which claim is which.";

export const SIZE_CONTRAST_TERM = "Larger disc";
export const SIZE_CONTRAST_READS =
  "one of the claims the rest of your ontology hangs off. Disc size is relative to the other claims on this canvas, so disc size says nothing on its own.";

/**
 * The edges this layout will actually draw: live, and joining two pages that
 * are on the canvas.
 *
 * "On the canvas" was `graph.pages.has(...)`, and a retired page is still in
 * that map. The nodes come from `livePages`, which excludes it, so a study with
 * a retired page at one end of a relation handed `forceLink` a link to a node
 * the simulation had never been given and d3 threw `node not found: <id>`.
 * There is no error boundary above this, so the Ontology tab went blank, and
 * `buildDiagramSvg` calls the same function, so the figure could not be
 * exported either. The predicate is `connectingEdges` now, in the schema, which
 * is where `anchoring.ts` had already worked it out.
 */
function drawnEdges(graph: OntologyGraph) {
  return connectingEdges(graph);
}

/**
 * Whether the drawing is making the size distinction at all.
 *
 * One function, called by the layout (which sets `sizeContrast` on its result
 * for the exported figure) and by the graph key (which has no layout to hand
 * and must not run a force simulation to ask a question about the ledger). Both
 * conditions matter and neither is enough on its own: the channel is off until
 * a relation exists for size to be about, and a canvas that is all roots or no
 * roots draws one radius whatever the channel is doing. A legend row for a
 * distinction the drawing is not making teaches the reader to stop reading the
 * legend, which is the rule the other five rows already follow.
 */
export function drawsSizeContrast(graph: OntologyGraph): boolean {
  const pages = livePages(graph);
  const roots = pages.filter((p) => graph.puzzleRoots.includes(p.id)).length;
  return roots > 0 && roots < pages.length && drawnEdges(graph).length > 0;
}

/** Where the first caption line sits below the rim, and the step between lines. */
export const LABEL_FIRST_LINE = 18;
export const LABEL_LINE_STEP = 16;

/**
 * Where an edge's arrowhead lands, given the radius of the disc it points at.
 *
 * A function rather than a constant offset because the radius is a function of
 * how full the canvas is: a fixed standoff buries the head inside a large node
 * and floats it off a small one.
 */
export function arrowTip(
  edge: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number },
  targetRadius: number,
): { readonly x: number; readonly y: number } {
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const len = Math.hypot(dx, dy) || 1;
  const back = targetRadius + ARROW_STANDOFF;
  return { x: edge.x2 - (dx / len) * back, y: edge.y2 - (dy / len) * back };
}

/**
 * The part of an edge a reader can actually see, which is not the part that was
 * being drawn.
 *
 * `LaidOutEdge` joins two centres. Both drawings stopped the far end on the
 * target's rim, with `arrowTip`, and neither did anything at all about the near
 * end: the line was drawn from the source's centre, so its first `sourceRadius`
 * units ran underneath the source disc, and then the arrowhead covered
 * `ARROW_HEAD` more of what was left. What survived is this shaft, and nothing
 * in the codebase computed it, so nothing could notice when it went to zero.
 *
 * Measured on the project's own 44-page probe at the width the app runs at:
 * across 54 relations the median surviving shaft was 0.7 units and 23 of the 54
 * were negative, which is to say the head was drawn over the source disc and no
 * line existed between the two pages at all. The same figure exported from the
 * same button row had a median of 12.1, so the screen and the file disagreed
 * about whether the relation channel was drawn. That disagreement is the
 * failure OntologyView's docstring records as having cost the export voicing
 * five rounds.
 *
 * `length` may be zero. Two discs can be close enough that there is no room
 * between their rims for a shaft, and a caller that pretends otherwise draws a
 * line running backwards. Zero is the honest answer and both drawings render
 * the head alone at it, so direction survives where the shaft cannot.
 */
export function edgeShaft(
  edge: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number },
  sourceRadius: number,
  targetRadius: number,
): {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly length: number;
} {
  const dx = edge.x2 - edge.x1;
  const dy = edge.y2 - edge.y1;
  const span = Math.hypot(dx, dy) || 1;
  const ux = dx / span;
  const uy = dy / span;
  const tip = arrowTip(edge, targetRadius);
  const from = { x: edge.x1 + ux * sourceRadius, y: edge.y1 + uy * sourceRadius };
  // The head is measured back from the tip, because that is where it is drawn.
  const reach = Math.hypot(tip.x - from.x, tip.y - from.y);
  const length = Math.max(0, reach - ARROW_HEAD);
  return { x1: from.x, y1: from.y, x2: tip.x - ux * ARROW_HEAD, y2: tip.y - uy * ARROW_HEAD, length };
}

/**
 * How long one repeat of a role's dash is, in the units the graph is drawn in.
 *
 * A dash pattern says nothing until the line is long enough to hold one full
 * repeat of it. "2 3" is a five-unit repeat and "6 3" is a nine-unit repeat; on
 * a shaft of four units both of them, and solid, are one continuous mark. That
 * is not a subtle degradation. It is the whole of the channel that separates
 * the members inside a family, so `evidences` and `predicts` become the same
 * green line and `contradicts`, `rivals` and `tensions-with` become the same
 * rust one, which is the exact condition relationGlossary's docstring records
 * as the reason a researcher reported they could not understand the
 * connections.
 */
export function dashPeriod(role: EdgeRole): number {
  const dash = EDGE_STYLE[role].dash;
  if (dash === "") return 0;
  return dash
    .split(/[\s,]+/)
    .filter((n) => n !== "")
    .reduce((total, n) => total + Number(n), 0);
}

/**
 * The dash a role is drawn with on a canvas, which is not always its own.
 *
 * One function, called by both drawings and by both keys, because the defect
 * this closes is a key that defines a channel the drawing beside it is not
 * rendering. When `channel` is false nothing dashes, the key says so in
 * `DASH_OFF_READS`, and the eight roles reach the reader as three colours, two
 * weights, a head and the words in the index. That is less than the grammar can
 * say and it is what the canvas can carry; drawing eight patterns that all
 * render as one mark says the same thing while claiming otherwise.
 */
export function edgeDash(role: EdgeRole, channel: boolean): string {
  return channel ? EDGE_STYLE[role].dash : "";
}
/** The widest a caption line is allowed to get before it wraps. */
const LABEL_WRAP = 24;
/** And how many lines a caption may spend before the rest is dropped. */
const LABEL_LINES = 3;
/**
 * The share of the paper this layout can actually spend on name footprints.
 *
 * This asks for paper. It does not decide whether the names get drawn: that is
 * decided by `captionsCollide` at the bottom of the pass, on the finished
 * placement, and this number appears nowhere in that decision.
 *
 * The distinction is the whole of round four. What stood here was
 * `CAPTION_AREA_CEILING = 0.4`, summing caption rectangles and comparing them
 * against four tenths of the canvas, and its own docstring stated the claim the
 * app contradicted: "twelve pages want 29% and are laid out cleanly". Measured
 * in the running app on the project's own twelve-page probe at innerWidth 1024,
 * the twelve captions wanted 21.8% of a 949.79x554.05 canvas, passed the
 * ceiling, and eleven of the twelve were drawn through another page's name,
 * disc or badge. A sum of areas is not a packing: it cannot see that a caption
 * is 165 units wide and 53 tall while the disc it belongs to is 60 across, so
 * the blocks tile in rows and a force simulation does not settle in rows.
 *
 * 0.5 is measured rather than chosen. Binary-searching the shortest canvas the
 * pass can actually place a probe on, at the widths the app renders at, the
 * footprints occupy between 0.55 and 0.65 of the paper at the point where the
 * placement stops succeeding: 0.553 at eight pages in a 657 column, 0.647 at
 * twelve, 0.540 at sixteen in an 813 one. Asking for half the paper therefore
 * leaves between eight and eighteen per cent more room than the tightest
 * placement found, which is the margin between a drawing that comfortably names
 * its pages and one that only just does.
 */
const CAPTION_PACKING = 0.5;
/**
 * And the share past which no placement has ever succeeded, which is the only
 * thing this pass is allowed to refuse on.
 *
 * The request above is what the drawing asks for and the canvas ceiling is what
 * it can have, so on a narrow column the two disagree and the drawing gets less
 * paper than it asked for. That is not a reason to withhold the names: the
 * request carries eight to eighteen per cent of slack and the placement is
 * measured afterwards either way. Refusing on the request would make the names
 * turn on and off at whichever page count happened to land on the ceiling,
 * which is the same class of arbitrary threshold this round removed.
 *
 * 0.66 is the tightest packing seen anywhere in the calibration, rounded up
 * from 0.647. Past it the attempt has never come back placeable, so skipping it
 * costs nothing and saves a simulation on every large ontology. Below it the
 * pass tries, and `captionsCollide` has the last word.
 */
const CAPTION_PACKING_MAX = 0.66;
/**
 * The air between a caption and whatever it is next to.
 *
 * A caption that stops exactly on the neighbour's rim is not overprinted and is
 * still unreadable, in the same way an edge that is geometrically present under
 * a disc is not a line. Small, because this is spent on every pair.
 */
const CAPTION_CLEARANCE = 4;
/**
 * How far a caption line reaches above and below its own baseline.
 *
 * `labelSpace` is the room reserved under a rim and it is measured from the rim
 * down, so it says nothing about where the ink starts. The first line's ink
 * starts above its baseline, which is `LABEL_FIRST_LINE` below the rim, and
 * that is the part of the block that runs into a neighbour's disc.
 *
 * Measured in the running app at --text-small on the twelve-page probe: a
 * caption line's client rect ran from 12.54 units above its baseline to 2.46
 * below. 13 and 3, which is that with the slack a keep-out distance carries.
 */
export const CAPTION_ASCENT = 13;
/**
 * The width of one caption character, in layout units.
 *
 * Measured on the running app: a 26-character caption renders 148px wide inside
 * a canvas scaled 594/720, which is 6.9 units per character at --text-small;
 * 7.5 is that with the slack a keep-out distance should carry. The first
 * attempt used the 6 that the measure tokens' 0.459em average advance implies,
 * and it clipped both captions by six and eight pixels, which is what a text
 * metric estimated from the wrong average looks like.
 */
export const CHAR_UNITS = 7.5;

/**
 * Wrap a page title for a caption under its disc.
 *
 * Shared with the SVG export, which had its own copy of this and its own
 * character budget. The graph did not wrap at all: it ellipsed at 26, which is
 * how the view the product is named for came to show two pages whose names it
 * would not say.
 */
export function wrapLabel(
  title: string,
  max: number = LABEL_WRAP,
  maxLines: number = LABEL_LINES,
): readonly string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of title.split(/\s+/).filter((w) => w !== "")) {
    if (line === "") line = word;
    else if (`${line} ${word}`.length <= max) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  if (lines.length === 0) return [""];
  if (lines.length <= maxLines) return lines;
  // Dropping the tail silently would put the ellipsis back one level up, so the
  // last line the reader gets says that there is more.
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] ?? "";
  return [...kept.slice(0, maxLines - 1), `${last.slice(0, Math.max(1, max - 1))}…`];
}

/** Half the width of the widest line in a wrapped caption. */
function labelHalf(lines: readonly string[]): number {
  return (Math.max(...lines.map((l) => l.length), 0) * CHAR_UNITS) / 2;
}

/** Room under a mark for its caption block, and none at all when there is none. */
function labelSpace(lines: readonly string[]): number {
  if (lines.length === 0) return 0;
  return LABEL_FIRST_LINE + (lines.length - 1) * LABEL_LINE_STEP + LABEL_LINE_STEP / 2;
}

/**
 * The box a caption occupies, in units, relative to the centre of its disc.
 *
 * The one description of where those words are. It had none: the component drew
 * the lines from `radius + LABEL_FIRST_LINE`, the layout reserved room with
 * `labelSpace`, the collide force approximated the whole thing as a circle, and
 * nothing in the codebase could answer "do these two names touch". So nothing
 * noticed when eleven of twelve did.
 *
 * `bottom` is `labelSpace` rather than the last line's descender, because
 * `labelSpace` is what every margin and clamp in this file already reserves and
 * the two must not disagree; it is five units more generous, which is slack in
 * the safe direction.
 */
export function captionBox(
  radius: number,
  lines: readonly string[],
): { readonly halfWidth: number; readonly top: number; readonly bottom: number } | null {
  if (lines.length === 0) return null;
  return {
    halfWidth: labelHalf(lines),
    top: radius + LABEL_FIRST_LINE - CAPTION_ASCENT,
    bottom: radius + labelSpace(lines),
  };
}

/**
 * The paper a named page wants: its badge, its disc and its caption, with the
 * air that has to go round them.
 *
 * A footprint rather than a caption area, because the thing that has to be
 * packed is the whole mark. The old sum counted the caption rectangles alone
 * and then the layout had to fit discs and badges in the same box, which is one
 * of the two reasons twelve captions that "wanted 29%" could not be placed.
 */
function nameFootprint(lines: readonly string[], radius: number): number {
  const box = captionBox(radius, lines);
  if (box === null) return 0;
  const across = 2 * Math.max(box.halfWidth, radius + badgeSpan(radius)) + CAPTION_CLEARANCE;
  const down = radius + badgeSpan(radius) + box.bottom + CAPTION_CLEARANCE;
  return across * down;
}

/**
 * The shortest move that takes two boxes apart, and nothing when they already
 * are.
 *
 * `dx` and `dy` are the second box's centre from the first's, and the two
 * halves are the sums of the halves plus whatever air is wanted between them.
 * The answer is the move to apply to the second box.
 *
 * Out through the near side rather than along the line between the centres,
 * because the line between the centres is the wrong way out of a rectangle: a
 * caption is 165 units wide and 53 tall, so two of them side by side are 4
 * units into each other vertically and 160 horizontally, and pushing along the
 * centre line would spend 160 units of canvas to buy 4.
 */
function boxEscape(
  dx: number,
  dy: number,
  halfWidth: number,
  halfHeight: number,
): { readonly x: number; readonly y: number } | null {
  const ox = halfWidth - Math.abs(dx);
  const oy = halfHeight - Math.abs(dy);
  if (ox <= 0 || oy <= 0) return null;
  // Ties go down, deterministically, because a caption block is wider than it
  // is tall and down is where a force layout has paper.
  if (oy <= ox) return { x: 0, y: dy >= 0 ? oy : -oy };
  return { x: dx >= 0 ? ox : -ox, y: 0 };
}

/**
 * And the same for a disc against a box, which is the case a caption drawn over
 * a neighbour's disc actually is.
 *
 * Returns the move to apply to the circle. Off the nearest point of the box,
 * which for a disc sitting beside a caption is sideways and for one sitting
 * under it is down, so the drawing opens along the axis that was actually
 * blocked.
 */
function circleEscape(
  cx: number,
  cy: number,
  radius: number,
  bx: number,
  by: number,
  halfWidth: number,
  halfHeight: number,
): { readonly x: number; readonly y: number } | null {
  const need = radius + CAPTION_CLEARANCE;
  const px = Math.max(bx - halfWidth, Math.min(bx + halfWidth, cx));
  const py = Math.max(by - halfHeight, Math.min(by + halfHeight, cy));
  const dx = cx - px;
  const dy = cy - py;
  const away = Math.hypot(dx, dy);
  if (away >= need) return null;
  if (away > 0.001) {
    const push = need - away;
    return { x: (dx / away) * push, y: (dy / away) * push };
  }
  // The centre is inside the box, so there is no direction to read off it and
  // the shortest way out of the grown box is the answer.
  return boxEscape(cx - bx, cy - by, halfWidth + need, halfHeight + need);
}

/**
 * Whether any name on this drawing is written through anything.
 *
 * The test the ceiling was standing in for, run on the finished placement
 * rather than guessed from an area. Exported because the assertion in
 * tests/relations.test.ts has to ask the same question with the same geometry:
 * a check that re-derives where a caption is would be a second opinion about
 * the drawing, and two opinions about the drawing is the defect this file has
 * now been through four times.
 */
export function captionsCollide(
  nodes: readonly LaidOutNode[],
  badged: ReadonlySet<string> = new Set<string>(),
): boolean {
  const boxes = nodes.map((n) => {
    const box = captionBox(n.radius, n.label);
    return box === null
      ? null
      : {
          left: n.x - box.halfWidth,
          right: n.x + box.halfWidth,
          top: n.y + box.top,
          bottom: n.y + box.bottom,
        };
  });
  const hits = (
    box: { left: number; right: number; top: number; bottom: number },
    cx: number,
    cy: number,
    radius: number,
  ) => {
    const px = Math.max(box.left, Math.min(box.right, cx));
    const py = Math.max(box.top, Math.min(box.bottom, cy));
    return Math.hypot(cx - px, cy - py) < radius;
  };
  for (let i = 0; i < nodes.length; i += 1) {
    const box = boxes[i];
    const self = nodes[i];
    if (box === undefined || box === null || self === undefined) continue;
    for (let j = 0; j < nodes.length; j += 1) {
      if (i === j) continue;
      const other = nodes[j];
      if (other === undefined) continue;
      const otherBox = boxes[j];
      if (
        otherBox !== undefined &&
        otherBox !== null &&
        j > i &&
        box.left < otherBox.right &&
        otherBox.left < box.right &&
        box.top < otherBox.bottom &&
        otherBox.top < box.bottom
      ) {
        return true;
      }
      if (hits(box, other.x, other.y, other.radius)) return true;
      if (badged.has(other.id)) {
        const orbit = badgeOrbit(other.radius);
        if (
          hits(
            box,
            other.x + orbit * Math.SQRT1_2,
            other.y - orbit * Math.SQRT1_2,
            BADGE_RADIUS,
          )
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function rootRadius(count: number, width: number, height: number): number {
  const perNode = (width * height * NODE_AREA_SHARE) / Math.max(count, 1);
  return Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, Math.sqrt(perNode / Math.PI)));
}

/**
 * The widest and shortest the canvas is allowed to be, as a ratio.
 *
 * 720x420 is the box this view has always been capped to. The cap is expressed
 * as an aspect rather than as two numbers now, because the width is the
 * column's and only the height is ours to choose: a canvas that grows taller
 * than width/CANVAS_ASPECT renders as a portrait box in a landscape column and
 * the aspect floor at the bottom of this file would have to fight it.
 */
const CANVAS_ASPECT = 720 / 420;
/**
 * And the widest canvas at all, however wide the column is.
 *
 * A drawing is a figure and not a wall. Past about this the marks stop being
 * comparable at a glance, which is the only thing the picture is for once the
 * index below is carrying the names.
 */
const CANVAS_WIDTH_MAX = 1080;
/**
 * And the tallest, as an aspect, when the drawing is carrying the names.
 *
 * A caption is a wide, short block hung under a small disc, so a named page
 * needs about 169 units across and 131 down where the disc alone needs 68 of
 * each. Twelve of those want 265,000 units and CANVAS_ASPECT offers a column of
 * 657 exactly 383 of height, which is 251,000 before a single disc is drawn.
 * That is the arithmetic behind the note a reader of the twelve-page probe met
 * at every window width from 1150 up: "Too many pages to name them here", on a
 * canvas with acres of white, for twelve pages.
 *
 * Height is the axis names need and it is the axis this view has to give, since
 * the width belongs to the column. Square is the whole of the licence: a named
 * canvas may be as tall as it is wide and never taller, so twelve pages get the
 * 657x657 they need in the narrowest column this view has, and the sixty short
 * titles that would want 950x1012 do not get a wall. They go to the index,
 * which is where they went at every width before this round.
 *
 * The crop at the foot of the pass hands back every unit the drawing did not
 * use, so a sparse ontology still renders as the wide short figure it always
 * did: two pages come out 352x127 here, unchanged. CANVAS_ASPECT still governs
 * the unnamed drawing, which is discs and lines and genuinely wants to be wide.
 */
const CANVAS_ASPECT_NAMED = 1;

/**
 * What canvas this drawing gets, and whether it is going to try for the names.
 *
 * Split out of the pass because `layoutGraph` runs the pass twice at most and
 * must not pay for a simulation it can already prove is pointless: an ontology
 * whose footprints do not fit the largest canvas available has no captioned
 * layout to measure, so it goes straight to the unnamed one.
 */
function canvasFor(
  graph: OntologyGraph,
  options: LayoutOptions,
  wantNames: boolean,
): {
  readonly width: number;
  readonly height: number;
  readonly names: boolean;
  readonly wrapped: ReadonlyMap<string, readonly string[]>;
} {
  const width =
    options.width ?? Math.min(CANVAS_WIDTH_MAX, Math.max(360, options.maxWidth ?? 720));
  const pages = livePages(graph);
  const wrapped = new Map(pages.map((p) => [p.id, wrapLabel(p.title)] as const));
  /* Against the largest disc this page could be drawn at, because the radius is
   * a function of the canvas and the canvas is what is being decided. The area
   * share saturates at RADIUS_MAX on any canvas roomy enough to be carrying
   * names, so a root is estimated exactly and a leaf at the ratio the drawing
   * will use if the size channel is live. Both are upper bounds: a smaller
   * canvas draws smaller discs and wants less paper than this asks for. */
  const leaves = drawnEdges(graph).length > 0;
  let footprint = 0;
  if (wantNames) {
    for (const page of pages) {
      const radius =
        leaves && !graph.puzzleRoots.includes(page.id)
          ? Math.max(10, RADIUS_MAX * LEAF_RATIO)
          : RADIUS_MAX;
      footprint += nameFootprint(wrapped.get(page.id) ?? [], radius);
    }
  }
  // The canvas grows with the ontology instead of always reserving the space a
  // full one would need (ISC-359). The SVG renders at `width: 100%` with the
  // viewBox setting the aspect ratio, so a fixed 720×420 meant a two-page
  // ontology got a 420px-tall box with two dots in opposite corners, and the
  // staged proposals — one of the two things the page says you are being
  // waited on for — were pushed below the fold behind it. Capped at the old
  // value so nothing regresses once the graph is actually full.
  //
  // The ceiling was the literal 420 and it saturated at seven pages, so every
  // ontology from seven upwards was laid out on the same 720x420 box. Measured
  // in the browser on 62 pages: 680x397, 4,355 units of paper per page, radii
  // shrunk to the 0.45 floor at 5.5 and 11.1 units, and eight pairs of discs
  // overlapping at a closest approach of -1.5. The ceiling is the column's own
  // width over the aspect now, so a wide column buys height as well as width
  // and the same sixty-two pages get 992x578.
  //
  // And the third term is the names. A drawing that is going to write twelve
  // titles has to be given the paper to write them on before the simulation
  // runs, because nothing downstream can add paper: the fit can only shrink the
  // shape into the box it was handed.
  const wanted = Math.max(
    200,
    140 + pages.length * 45,
    footprint / Math.max(width * CAPTION_PACKING, 1),
  );
  const tallest = width / (footprint > 0 ? CANVAS_ASPECT_NAMED : CANVAS_ASPECT);
  const height = options.height ?? Math.min(tallest, wanted);
  return {
    width,
    height,
    names: wantNames && footprint > 0 && footprint <= width * height * CAPTION_PACKING_MAX,
    wrapped,
  };
}

/**
 * How tall a figure of this ontology has to be, at a width the caller has
 * already fixed, if it is going to name its pages.
 *
 * For the exported figure, which states its own box: 900x700 has been the file
 * for several rounds and it is a floor rather than a shape, because a figure in
 * a paper appendix is a fixed artefact and shrinking it under the reader would
 * be a worse surprise than a taller one.
 *
 * Here rather than in the export, because the height a name needs is this
 * module's arithmetic and the export asking it a second way is how two surfaces
 * come to disagree. That is the failure this file has been scored on three
 * rounds running, and it was live in this channel: measured on eighteen pages
 * with wrapping titles, the screen at 813 units named them and the same study
 * exported from the same button row came out as eighteen numbered discs, with
 * each surface stating a reason that was true of its own canvas and neither
 * saying why the two canvases were different.
 *
 * The floor is returned unchanged when the names are not going to be placed at
 * all, so a forty-page figure is the box it has always been.
 */
export function figureHeight(graph: OntologyGraph, width: number, floor: number): number {
  const canvas = canvasFor(graph, { width }, true);
  return canvas.names ? Math.max(floor, canvas.height) : floor;
}

/**
 * The drawing, and then the same drawing without the names if the names could
 * not be placed.
 *
 * Two passes rather than one, and the second one is rare: `canvasFor` refuses
 * the attempt outright on any ontology whose footprints do not fit the paper,
 * so the retry only runs where the drawing genuinely tried and the placement
 * came back overprinted. That is the arrangement this surface has arrived at
 * for every channel where a guess was tried first. The dash channel is decided
 * by measuring the shafts the pass actually produced; size is decided by a
 * predicate on the ledger that both the drawing and the key read; the names are
 * decided by measuring whether the blocks the pass actually placed touch.
 */
export function layoutGraph(graph: OntologyGraph, options: LayoutOptions = {}): GraphLayout {
  const named = canvasFor(graph, options, true);
  if (named.names) {
    const drawn = layoutOnce(graph, options, named);
    if (drawn.captioned) return drawn;
  }
  return layoutOnce(graph, options, canvasFor(graph, options, false));
}

function layoutOnce(
  graph: OntologyGraph,
  options: LayoutOptions,
  canvas: ReturnType<typeof canvasFor>,
): GraphLayout {
  const { width, height, wrapped } = canvas;
  const iterations = options.iterations ?? 300;

  const pages = livePages(graph);
  const edges = drawnEdges(graph);

  const nodes: SimNode[] = pages.map((p, i) => ({
    id: p.id,
    isRoot: graph.puzzleRoots.includes(p.id),
    // Seeded deterministically on a circle rather than at random: d3 would
    // otherwise use Math.random and the same ontology would lay out
    // differently on every render, which makes the graph unreadable as a
    // thing that changes over a session.
    x: width / 2 + Math.cos((2 * Math.PI * i) / Math.max(pages.length, 1)) * width * 0.3,
    y: height / 2 + Math.sin((2 * Math.PI * i) / Math.max(pages.length, 1)) * height * 0.3,
  }));

  const NO_LABEL: readonly string[] = [];
  const labelOf = (id: string) => (canvas.names ? (wrapped.get(id) ?? [""]) : NO_LABEL);

  const rRoot = rootRadius(pages.length, width, height);
  const rLeaf = Math.max(10, rRoot * LEAF_RATIO);
  /* Size only says something when there is something to hang off.
   *
   * The graph drew puzzle roots at 1.47 times the radius of everything else,
   * 2.15 times the area, and the key called that "one of the pages the rest of
   * this ontology hangs off". On the fixture the graph has zero edges, so
   * nothing hangs off anything and the loudest difference on the canvas was
   * saying something untrue about a relation that does not exist. Worse, size
   * happened to co-vary with colour there, so the drawing taught "big means
   * puzzle" and would have broken on the first non-root puzzle page. The
   * channel switches on with the first relation; GraphKey lists it on the same
   * condition. */
  const sizeChannelLive = edges.length > 0;
  const radiusOf = (isRoot: boolean) => (isRoot && sizeChannelLive ? rRoot : sizeChannelLive ? rLeaf : rRoot);

  if (nodes.length > 0) {
    const links = edges.map((e) => ({ source: e.from, target: e.to }));
    const sim = forceSimulation(nodes)
      .force(
        "link",
        forceLink(links)
          .id((d) => (d as SimNode).id)
          .distance(110)
          .strength(0.35),
      )
      .force("charge", forceManyBody().strength(-320))
      .force("center", forceCenter(width / 2, height / 2))
      // Collision has to know what is actually drawn, and what is drawn is the
      // disc plus its caption. It was a flat 38 while the component drew 22 and
      // 15, which was survivable only because both literals were smaller than
      // it; then the caption started wrapping to three lines and the discs
      // separated correctly while the words ran through each other. Half a
      // caption is a rough circle around a rectangle, which is the right kind
      // of rough for a force constant, taken as the larger of the caption's
      // half-width and the disc plus the caption's height: a caption that wraps
      // to three lines reaches further below the disc than beside it, and the
      // export was running one page's words through the next page's disc.
      .force(
        "collide",
        forceCollide((d) => {
          const n = d as SimNode;
          const r = radiusOf(n.isRoot);
          return Math.max(r + 12, labelHalf(labelOf(n.id)), r + labelSpace(labelOf(n.id)));
        }),
      )
      .stop();
    sim.tick(iterations);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));

  /* Fit what the simulation settled on into the canvas it is drawn in.
   *
   * The old code clamped each coordinate into [40, max - 40] and stopped
   * there, which keeps a node on screen and says nothing about the rest of the
   * box. Measured on the fixture at innerWidth 1467: two pages in a 594x190
   * rendering, 1.4% of it ink, the drawing occupying a band across the middle
   * with the whole lower half empty, on the view the product is named for.
   *
   * A force layout produces a shape, and the shape is the information; where
   * that shape happens to sit and how large d3's charge and distance constants
   * happen to make it are not. So the bounding box of the settled centres is
   * mapped onto the canvas minus a margin, which preserves every relative
   * position and spends the whole box. Scaling up never introduces an overlap,
   * and the cap stops a two-node layout that settled 3 units apart being blown
   * across the frame. */
  // Two margins, not one. A caption hangs below its disc and nothing hangs
  // above it, so a single margin of rRoot + three caption lines charged the top
  // of the canvas for space only the bottom needs: on a five-page export that
  // was 232 of 560 units reserved, the usable band collapsed to 328, and the
  // fit had to shrink the whole drawing to reach it, which is how five discs
  // ended up overlapping in the middle of an empty figure.
  const captionSpace = canvas.names
    ? Math.max(...pages.map((p) => labelSpace(labelOf(p.id))), LABEL_FIRST_LINE)
    : 0;
  // The badge hangs above and to the right of the disc, so the top margin
  // carries it and the bottom margin does not.
  const marginTop = rRoot + badgeSpan(rRoot);
  const marginBottom = rRoot + captionSpace;
  const centres = [...byId.values()];
  const xs = centres.map((n) => n.x ?? width / 2);
  const ys = centres.map((n) => n.y ?? height / 2);
  const minX = Math.min(...xs, Infinity);
  const maxX = Math.max(...xs, -Infinity);
  const minY = Math.min(...ys, Infinity);
  const maxY = Math.max(...ys, -Infinity);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const room = (extent: number, taken: number, span: number) =>
    span < 1 ? Infinity : Math.max(extent - taken, 1) / span;

  /* How far apart the fit is allowed to push two marks.
   *
   * Mapping the settled bounding box onto the whole canvas is right for a
   * dozen pages and wrong for two: measured on the fixture, it pinned one disc
   * at 13.5% of the width and the other at 86.5%, leaving 430 of 720 units, 60%
   * of the canvas, empty between their rims, on the view the product is named
   * for. A network diagram whose two nodes sit in opposite corners is not
   * saying that they are far apart, because there is no distance scale on a
   * force layout; it is saying nothing, loudly.
   *
   * The scale is still uniform, so the shape the simulation found is still the
   * shape drawn. It is bounded on both sides instead of only above. The ceiling
   * keeps the closest pair of rims within a root radius and a half of each
   * other; the floor asks for enough scale that two captions clear each other,
   * since a caption is wider than the disc it belongs to. */
  const settled = centres.map((n) => ({
    x: n.x ?? width / 2,
    y: n.y ?? height / 2,
    r: radiusOf(n.isRoot),
  }));
  /* The closest pair, found by sweeping a list sorted on x rather than by
   * comparing all of them.
   *
   * This was one of three unfiltered O(n^2) passes in this function, and the
   * blind comparison put a number on what they cost: an ordinary ATLAS.ti
   * project is two hundred codes, and at two hundred pages `layoutGraph`
   * measured 112ms on this machine, against 17ms at forty-four. That is a
   * visible hitch on a surface whose whole claim is that the ontology stays on
   * screen while you answer questions about it.
   *
   * The sweep is exact, not an approximation. Sorted on x, any pair whose x
   * gap already exceeds the best distance found so far cannot beat it, because
   * the distance between two points is at least the gap along either axis. So
   * the inner scan stops there and the answer is the same closest pair the
   * full comparison returned, to the bit. */
  let nearest = Infinity;
  const byX = [...settled].sort((a, b) => a.x - b.x);
  for (let i = 0; i < byX.length; i += 1) {
    const a = byX[i];
    if (a === undefined) continue;
    for (let j = i + 1; j < byX.length; j += 1) {
      const b = byX[j];
      if (b === undefined) continue;
      if (b.x - a.x >= nearest) break;
      nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  const widestHalf = Math.max(...pages.map((p) => labelHalf(labelOf(p.id))), rRoot);
  const ceilingFit = nearest > 1 ? ((2 + GAP_CEILING) * rRoot) / nearest : Infinity;
  /* Two captions, not one.
   *
   * The floor was two radii plus one caption half, which is what it takes to
   * keep one page's words off the next page's disc and not what it takes to
   * keep two pages' words off each other. Read back at scale 1 on the fixture:
   * the discs were 150 units apart and each caption was 180 wide, so
   * "framing may be watching" ended six pixels before "handoff, disagreement"
   * began and the two titles read as one paragraph under two circles. Both
   * halves plus the rim clearance, and the disc form kept beside it because it
   * is the larger of the two whenever the titles are short. */
  const floorFit =
    nearest > 1
      ? Math.max(2 * rRoot + widestHalf, 2 * widestHalf + RIM_CLEARANCE) / nearest
      : 0;

  /* And the canvas is a limit where the floor is a request.
   *
   * These four numbers used to sit in one `Math.min`, under a comment saying
   * "where the two disagree the floor wins", and the floor was the fourth
   * argument of the min: whichever room term was smaller silently overrode it,
   * which on the twelve-page probe at 1024 is the width term. A comment
   * describing behaviour the code does not have is a defect on its own, and
   * this one was covering the case the whole round is about.
   *
   * The resolution is not to let the floor out of the min, because a fit above
   * the room the canvas has does not create room: `place` clamps every centre
   * back inside the frame, so the excess would come back as marks stacked
   * against the edges. It is to stop pretending the fit is what protects the
   * captions. The rooms are what the paper has, the floor is what the names
   * want, and where the paper cannot pay, the separation pass below moves the
   * pairs that are actually touching and the caption check after it measures
   * whether that worked. */
  const bounded = Math.min(
    3,
    room(width, 2 * widestHalf, spanX),
    room(height, marginTop + marginBottom, spanY),
  );
  const fit = Math.min(bounded, Math.max(ceilingFit, floorFit));

  /* And then the marks shrink until none of them touch.
   *
   * d3's collide force guarantees separation at scale 1 and says nothing about
   * any other scale, so the moment the fit was allowed to shrink the drawing,
   * the guarantee went with it. Measured on a five-page export: one page sat
   * far from the cluster, the fit came out below 1 to bring it inside the box,
   * and the other four were scaled into each other, 78 units apart at a
   * combined radius of 98. Overlapping discs on a figure whose whole subject is
   * which pages join which is worse than any amount of white paper.
   *
   * Scaling the radii rather than pushing the fit back up, because the fit is
   * already at whatever the canvas can hold: raising it would only move the
   * overlap to the clamp at the frame edge, which is where the first attempt at
   * this put it. Uniform, so the relative sizes the size channel encodes are
   * preserved, and floored so a forty-page ontology does not vanish. */
  let shrink = 1;
  /* How far apart two centres can be and still hold this factor down.
   *
   * `shrink` starts at 1 and only ever falls, so a pair whose ratio is at or
   * above 1 cannot change it. No radius here exceeds `rRoot`, so a ratio below
   * 1 needs `dist * fit - RIM_CLEARANCE < 2 * rRoot`, which is a distance and
   * therefore a filter: the two axis gaps are each a lower bound on the
   * distance, so a pair failing either of them is skipped without a square
   * root. Same second unfiltered O(n^2) pass, same 112ms at two hundred pages,
   * and the same identical answer. Infinite `fit` is left to the full loop
   * because the bound is not a distance then. */
  const shrinkReach = Number.isFinite(fit) && fit > 0 ? (2 * rRoot + RIM_CLEARANCE) / fit : Infinity;
  for (let i = 0; i < settled.length; i += 1) {
    for (let j = i + 1; j < settled.length; j += 1) {
      const a = settled[i];
      const b = settled[j];
      if (a === undefined || b === undefined) continue;
      if (Math.abs(a.x - b.x) > shrinkReach || Math.abs(a.y - b.y) > shrinkReach) continue;
      const apart = Math.hypot(a.x - b.x, a.y - b.y) * fit - RIM_CLEARANCE;
      if (apart <= 0) continue;
      shrink = Math.min(shrink, apart / (a.r + b.r));
    }
  }
  shrink = Math.max(RADIUS_FLOOR_SHARE, Math.min(1, shrink));
  const drawnRadius = (isRoot: boolean) => radiusOf(isRoot) * shrink;
  const place = (
    v: number | undefined,
    min: number,
    span: number,
    extent: number,
    edge: number,
  ) => {
    const centred = extent / 2;
    if (v === undefined || !Number.isFinite(fit)) return centred;
    const scaled = centred + (v - (min + span / 2)) * fit;
    return Math.max(edge, Math.min(extent - edge, scaled));
  };
  const placeY = (v: number | undefined, radius: number, caption: number) => {
    const centred = height / 2;
    if (v === undefined || !Number.isFinite(fit)) return centred;
    const scaled = centred + (v - (minY + spanY / 2)) * fit;
    return Math.max(radius + badgeSpan(radius), Math.min(height - radius - caption, scaled));
  };

  const placed = pages.map((page) => {
    const sim = byId.get(page.id);
    const isRoot = graph.puzzleRoots.includes(page.id);
    // The horizontal keep-out is the label, not the mark. A title is centred
    // under its circle and runs wider than it, so fitting to the radius alone
    // pushed a node to the edge and let the SVG clip its own caption: the
    // first live check of the fit read back "ommunication-problem fra…" and
    // "Agreement about the hando" with both ends cut off by the frame. Half
    // the widest line the component will draw, at this app's own average
    // advance, is what has to stay inside.
    // The badge reaches further sideways than the rim does, so it joins the
    // caption in deciding how much room the node needs beside it.
    const keepOut = Math.max(
      labelHalf(labelOf(page.id)),
      drawnRadius(isRoot) + badgeSpan(drawnRadius(isRoot)),
    );
    return {
      page,
      isRoot,
      keepOut,
      x: place(sim?.x, minX, spanX, width, keepOut),
      // The vertical keep-out is asymmetric for the same reason the margins
      // are: the disc needs room above it, the disc and its caption need room
      // below.
      y: placeY(sim?.y, drawnRadius(isRoot), labelSpace(labelOf(page.id))),
    };
  });

  /* And then, where the shrink above could not keep two rims apart, move them.
   *
   * The shrink loop is a global scale factor with two escapes, and on a full
   * ontology both fire. It `continue`s past any pair whose scaled centres are
   * closer than RIM_CLEARANCE, because no radius separates those two, and it is
   * floored at RADIUS_FLOOR_SHARE so a forty-page drawing does not vanish. Both
   * are right on their own terms and together they mean the separation is not
   * guaranteed: measured in the browser on 62 pages and 48 relations, eight
   * pairs of discs overlapped, closest approach -1.5 units. Overlapping discs
   * on a figure whose whole subject is which page joins which is the one thing
   * this drawing may not do, and the key two hundred pixels away is at that
   * moment explaining that a rim means a page.
   *
   * Pairwise relaxation rather than another global factor, because the defect
   * is local: eight pairs out of 1,891 were touching and shrinking everything
   * to fix them would spend the whole canvas on eight. Each round pushes only
   * the pairs that are actually overlapping, half the overlap each, then clamps
   * every node back inside the frame it has to stay in. The shape the
   * simulation found survives everywhere it was already readable. Deterministic
   * throughout: the tie-break for two coincident centres is their indices, not
   * a random jitter, because the same ontology has to draw the same way twice.
   *
   * Four constraints and not one, because a flagged page carries two marks. The
   * first live read of this pass came back with zero overlapping discs and a
   * mesh of question marks drawn through each other and through their
   * neighbours' rims, which is the same defect one mark along: the badge orbits
   * clear of its own disc and nothing was keeping it clear of anyone else's.
   * The deficit taken is the worst of the four, and the push is along the
   * centre line, which moves both badges with their discs because both sit at
   * the same bearing.
   *
   * And then seven, because a named page carries three marks and the third one
   * is the page's name. The pass kept discs off discs and badges off everything
   * while the words, which are wider than any disc on the canvas, were kept off
   * nothing at all: measured on the twelve-page probe at innerWidth 1024, no
   * two discs touched and eleven of the twelve names were drawn through another
   * name, another disc or another badge. A caption is a rectangle and it is
   * resolved as one; pushing it along the centre line the way a disc is pushed
   * would send two side-by-side captions the long way round, when the cheap way
   * out of a 165x53 block is almost always down.
   */
  const badged = options.badged ?? new Set<string>();
  const mark = placed.map((n) => {
    const r = drawnRadius(n.isRoot);
    const box = captionBox(r, labelOf(n.page.id));
    return {
      r,
      badge: badged.has(n.page.id) ? badgeOrbit(r) : null,
      // Held as a half-height and an offset from the centre, because that is
      // what every test below wants and the node is what moves.
      caption:
        box === null
          ? null
          : {
              halfWidth: box.halfWidth,
              halfHeight: (box.bottom - box.top) / 2,
              midY: (box.bottom + box.top) / 2,
            },
    };
  });
  const separationRounds = 80;
  /* The widest gap at which any of the constraints below can still bite.
   *
   * The third and worst of the unfiltered O(n^2) passes: eighty rounds of every
   * pair, so two hundred pages was 1.6 million pair evaluations with a square
   * root in each, and `layoutGraph` measured 112ms against 17ms at forty-four.
   * The blind comparison named two hundred as an ordinary project size.
   *
   * The bound is the largest of the deficits taken below, each read as the
   * centre distance at which it reaches zero: rim to rim, a badge against the
   * other disc (its own orbit plus that disc plus the two clearances), and
   * badge against badge, and then the three caption tests in the paragraph
   * after this one. Both badges sit at the same bearing, so the gap
   * between them is at least the centre gap less the difference of their
   * orbits, which the orbit itself bounds. Beyond this every deficit is
   * negative and the pair is skipped, so the pairs that actually move are the
   * same pairs, in the same order, by the same amounts. */
  const markMax = Math.max(...mark.map((m) => m.r), 0);
  const orbitMax = badgeOrbit(markMax);
  /* And the same bound for the three caption constraints, which reach further
   * than any of the marks do: a caption is 165 units across where the widest
   * disc is 60, and it hangs its own height below the centre that carries it,
   * so the vertical bound has to allow for two of those offsets. Zero when the
   * drawing is not carrying names, which is every canvas the earlier rounds
   * measured, so their layouts come out of this pass unchanged to the bit. */
  const capWidest = Math.max(...mark.map((m) => m.caption?.halfWidth ?? 0), 0);
  const capTallest = Math.max(...mark.map((m) => m.caption?.halfHeight ?? 0), 0);
  const capLowest = Math.max(...mark.map((m) => m.caption?.midY ?? 0), 0);
  const captionReach =
    capWidest === 0
      ? 0
      : Math.max(
          2 * capWidest + CAPTION_CLEARANCE,
          2 * capTallest + 2 * capLowest + CAPTION_CLEARANCE,
          capWidest + markMax + CAPTION_CLEARANCE,
          capTallest + capLowest + orbitMax + BADGE_RADIUS + CAPTION_CLEARANCE,
        );
  const separationReach = Math.max(
    2 * markMax + RIM_CLEARANCE,
    orbitMax + BADGE_RADIUS + markMax + BADGE_CLEARANCE,
    orbitMax + 2 * BADGE_RADIUS + BADGE_CLEARANCE,
    captionReach,
  );
  for (let round = 0; round < separationRounds; round += 1) {
    let moved = false;
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i];
        const b = placed[j];
        const ma = mark[i];
        const mb = mark[j];
        if (a === undefined || b === undefined || ma === undefined || mb === undefined) continue;
        if (
          Math.abs(b.x - a.x) > separationReach ||
          Math.abs(b.y - a.y) > separationReach
        ) {
          continue;
        }
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let apart = Math.hypot(dx, dy);
        if (apart < 0.001) {
          dx = (i + j) % 2 === 0 ? 1 : -1;
          dy = 1;
          apart = Math.hypot(dx, dy);
        }
        // The badge sits at this bearing from its own centre, so a badge's
        // position is the node's position plus a fixed offset.
        const ox = Math.SQRT1_2;
        const oy = -Math.SQRT1_2;
        const gap = (
          ax: number,
          ay: number,
          ar: number,
          bx: number,
          by: number,
          br: number,
          clearance: number,
        ) => ar + br + clearance - Math.hypot(bx - ax, by - ay);
        let deficit = ma.r + mb.r + RIM_CLEARANCE - apart;
        if (ma.badge !== null) {
          deficit = Math.max(
            deficit,
            gap(a.x + ma.badge * ox, a.y + ma.badge * oy, BADGE_RADIUS, b.x, b.y, mb.r, BADGE_CLEARANCE),
          );
        }
        if (mb.badge !== null) {
          deficit = Math.max(
            deficit,
            gap(b.x + mb.badge * ox, b.y + mb.badge * oy, BADGE_RADIUS, a.x, a.y, ma.r, BADGE_CLEARANCE),
          );
        }
        if (ma.badge !== null && mb.badge !== null) {
          deficit = Math.max(
            deficit,
            gap(
              a.x + ma.badge * ox,
              a.y + ma.badge * oy,
              BADGE_RADIUS,
              b.x + mb.badge * ox,
              b.y + mb.badge * oy,
              BADGE_RADIUS,
              BADGE_CLEARANCE,
            ),
          );
        }
        // Half the deficit each, along the centre line, which is what the four
        // circular constraints above have always taken.
        let mx = 0;
        let my = 0;
        if (deficit > 0) {
          mx = (dx / apart) * (deficit / 2);
          my = (dy / apart) * (deficit / 2);
        }
        /* And then the name, which is a rectangle and gets out the near side.
         *
         * Five tests: a's caption against b's disc and b's badge, b's caption
         * against a's two marks, and the two captions against each other. The
         * largest move wins the round, the same way the four circular
         * constraints above take the worst of themselves rather than the sum;
         * a constraint deferred this round is taken on the next, because the
         * loop runs until nothing moves. Summing them would apply two
         * corrections for one violation wherever two of them point the same
         * way, and a relaxation that over-corrects does not settle. */
        let best = Math.hypot(mx, my);
        const take = (escape: { x: number; y: number } | null, forB: boolean) => {
          if (escape === null) return;
          const size = Math.hypot(escape.x, escape.y) / 2;
          if (size <= best) return;
          best = size;
          mx = (forB ? escape.x : -escape.x) / 2;
          my = (forB ? escape.y : -escape.y) / 2;
        };
        if (ma.caption !== null && mb.caption !== null) {
          take(
            boxEscape(
              b.x - a.x,
              b.y + mb.caption.midY - (a.y + ma.caption.midY),
              ma.caption.halfWidth + mb.caption.halfWidth + CAPTION_CLEARANCE,
              ma.caption.halfHeight + mb.caption.halfHeight + CAPTION_CLEARANCE,
            ),
            true,
          );
        }
        // A caption against the other page's disc, and against its badge. The
        // caption belongs to one node and the mark to the other, so the escape
        // is the mark's and the node it belongs to is the one that carries it.
        const against = (
          box: (typeof mark)[number]["caption"],
          boxAt: { x: number; y: number },
          other: (typeof mark)[number],
          otherAt: { x: number; y: number },
          forB: boolean,
        ) => {
          if (box === null) return;
          const bx = boxAt.x;
          const by = boxAt.y + box.midY;
          take(circleEscape(otherAt.x, otherAt.y, other.r, bx, by, box.halfWidth, box.halfHeight), forB);
          if (other.badge !== null) {
            take(
              circleEscape(
                otherAt.x + other.badge * ox,
                otherAt.y + other.badge * oy,
                BADGE_RADIUS,
                bx,
                by,
                box.halfWidth,
                box.halfHeight,
              ),
              forB,
            );
          }
        };
        against(ma.caption, a, mb, b, true);
        against(mb.caption, b, ma, a, false);
        if (mx === 0 && my === 0) continue;
        a.x -= mx;
        a.y -= my;
        b.x += mx;
        b.y += my;
        moved = true;
      }
    }
    if (!moved) break;
    for (const n of placed) {
      const r = drawnRadius(n.isRoot);
      n.x = Math.max(n.keepOut, Math.min(width - n.keepOut, n.x));
      n.y = Math.max(
        r + badgeSpan(r),
        Math.min(height - r - labelSpace(labelOf(n.page.id)), n.y),
      );
    }
  }

  /* And then take back the height the drawing did not use.
   *
   * The fit above preserves the shape the simulation found, which means it
   * scales both axes by the same factor and a layout that settled wide and flat
   * stays wide and flat. That is right for the picture and it leaves a band of
   * paper above and below it: measured after the fit, the two fixture nodes and
   * their labels occupied 111px of a 192px box, so 42% of the drawing was still
   * white. Distorting the layout to fill it would have been the wrong fix,
   * since the shape is the information. Cropping the box is the right one.
   *
   * Only when the caller did not name a height. The export renderer and the
   * viewport test both pass one, and this must not move under them. */
  const usedTop = Math.min(
    ...placed.map((n) => n.y - drawnRadius(n.isRoot) - badgeSpan(drawnRadius(n.isRoot))),
    Infinity,
  );
  const usedBottom = Math.max(
    ...placed.map((n) => n.y + drawnRadius(n.isRoot) + labelSpace(labelOf(n.page.id))),
    -Infinity,
  );
  const canTrim = options.height === undefined && placed.length > 0 && Number.isFinite(usedTop);
  const trim = canTrim ? Math.max(0, usedTop) : 0;
  const finalHeight = canTrim
    ? Math.max(marginTop + marginBottom, Math.min(height, usedBottom - usedTop))
    : height;

  /* And the same on the other axis, which is where the empty 60% was.
   *
   * Height was cropped and width was not, so a bounded fit would have parked
   * the drawing in the middle of a 720-unit box and left the slack at the sides
   * instead of between the rims. The SVG renders at width:100% with the viewBox
   * setting the aspect ratio, so cropping width is what turns the letterbox
   * into a shape the marks fill: measured on the fixture the rendering went
   * from 596x134 holding 2.7% ink to a box the two discs and their captions
   * actually occupy. Same guard as the height: only when the caller did not
   * name a width, because the export and the viewport test both pass one. */
  const usedLeft = Math.min(...placed.map((n) => n.x - n.keepOut), Infinity);
  const usedRight = Math.max(...placed.map((n) => n.x + n.keepOut), -Infinity);
  const canTrimX = options.width === undefined && placed.length > 0 && Number.isFinite(usedLeft);
  // With a floor on the aspect, because the viewBox is the aspect: the SVG
  // renders at width:100% and height:auto, so the rendered height is the
  // container's width times height/width. Cropping width alone would have made
  // a five-page ontology 791px tall in a 596px column, which is a worse defect
  // than the letterbox it was fixing. CANVAS_ASPECT is the box the canvas has
  // always been capped to, so a drawing is spread to that shape before it is
  // allowed to be narrow, and then bounded by the canvas it was laid out on: a
  // named drawing that took the taller canvas CANVAS_ASPECT_NAMED allows keeps
  // the full width of its column rather than being cropped to a strip.
  const usedWidth = usedRight - usedLeft;
  const finalWidth = canTrimX
    ? Math.min(width, Math.max(usedWidth, finalHeight * CANVAS_ASPECT))
    : width;
  // Centred in whatever slack the aspect floor leaves, rather than pushed left.
  const trimX = canTrimX ? usedLeft - (finalWidth - usedWidth) / 2 : 0;

  const laidOutNodes: LaidOutNode[] = placed.map((n) => ({
    id: n.page.id,
    title: n.page.title,
    type: n.page.type,
    x: n.x - trimX,
    y: n.y - trim,
    isRoot: n.isRoot,
    radius: drawnRadius(n.isRoot),
    label: labelOf(n.page.id),
    origin: n.page.origin,
    status: n.page.status,
  }));

  const positions = new Map(laidOutNodes.map((n) => [n.id, n]));
  const laidOutEdges: LaidOutEdge[] = edges.flatMap((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (from === undefined || to === undefined) return [];
    return [
      {
        id: edge.id,
        role: edge.role,
        from: edge.from,
        to: edge.to,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      },
    ];
  });

  /* And then ask what the relation channel actually came out as.
   *
   * After the fit, the shrink and the separation pass, not before. Every number
   * this depends on is decided by those passes: the radii the shrink settled
   * on, the distances the separation left, and the crop. A rule written up
   * front would be a guess about the drawing, and the whole of this round is
   * that a guess about the drawing was what the key was printing. */
  let dashChannel = true;
  let shaftless = 0;
  for (const edge of laidOutEdges) {
    const shaft = edgeShaft(
      edge,
      positions.get(edge.from)?.radius ?? 0,
      positions.get(edge.to)?.radius ?? 0,
    );
    if (shaft.length <= 0) shaftless += 1;
    const period = dashPeriod(edge.role);
    if (period > 0 && shaft.length < period) dashChannel = false;
  }

  /* And the same question of the names, in the same place, for the same reason.
   *
   * `captioned` was decided four hundred lines above this, before the
   * simulation ran, by comparing a sum of caption areas against four tenths of
   * the canvas. It was therefore a prediction about a drawing that did not
   * exist yet, and on the twelve-page probe the prediction was wrong at every
   * width the app renders at: the sum said 21.8% and eleven of twelve names
   * were drawn through something. This is the drawing that exists, measured
   * with the same `captionBox` the pass placed them with, and `layoutGraph`
   * lays the ontology out again without names when it comes back false.
   *
   * Every pair, not a sample, and the marks as well as the words: a name over a
   * neighbour's disc or under its badge is as unreadable as a name over another
   * name, and the badge is the mark this pass learned about last time. */
  const captioned = canvas.names && !captionsCollide(laidOutNodes, options.badged);

  return {
    nodes: laidOutNodes,
    edges: laidOutEdges,
    width: finalWidth,
    height: finalHeight,
    captioned,
    dashChannel,
    shaftless,
    // The same predicate the graph key reads, so the drawing, the key and the
    // exported legend cannot come to three different answers about whether this
    // canvas is spending size.
    sizeContrast: drawsSizeContrast(graph),
  };
}

/**
 * PAGE_TYPE_COLOUR used to be re-exported from here, and the re-export is the
 * defect in miniature (round nine).
 *
 * The seven literals moved to src/ui/tokens.ts at FND-04 because they shared
 * three values with Instrumentation's ORIGIN_COLOUR, and this module kept a
 * pass-through "so the four call sites that already read it from this module
 * keep working". That pass-through is what made the page hue ambient: four
 * files could paint a page in its own colour with nothing obliging them to say
 * who wrote it, and round eight's defect was one of them doing exactly that.
 *
 * The hue now has exactly one reader in the whole of src,
 * src/ui/components/PageMark.tsx, which cannot hand it out because it exports
 * no colour, only rendered marks. tests/origin-boundary.test.ts fails on any
 * other import of it, and an import has one syntax where a rendering has many.
 */

/**
 * Contradiction and tension edges are drawn solid and heavier than the rest.
 * The lint layer refuses to resolve them, so the graph should refuse to make
 * them look incidental.
 */
/**
 * Colour carries the family, dash separates members inside it, and the
 * arrowhead carries direction. The previous table gave `evidences` and
 * `resolves` the same colour and a half-pixel of stroke difference, and made
 * `contradicts` and `tensions-with` byte-identical; three of the eight were
 * therefore unreadable. Every (colour, dash) pair below is distinct, and
 * `tests/relations.test.ts` asserts it stays that way.
 */
export const EDGE_STYLE: Readonly<
  Record<EdgeRole, { dash: string; weight: number; colour: string }>
> = {
  evidences: { dash: "2 3", weight: 1.4, colour: FAMILY.supports.colour },
  predicts: { dash: "6 3", weight: 1.4, colour: FAMILY.supports.colour },
  "stands-to": { dash: "", weight: 3, colour: FAMILY.supports.colour },
  contradicts: { dash: "", weight: 1.8, colour: FAMILY.opposes.colour },
  rivals: { dash: "6 3", weight: 1.8, colour: FAMILY.opposes.colour },
  "tensions-with": { dash: "2 3", weight: 1.8, colour: FAMILY.opposes.colour },
  resolves: { dash: "", weight: 1.8, colour: FAMILY.settles.colour },
  bounds: { dash: "2 3", weight: 1.4, colour: FAMILY.settles.colour },
};
