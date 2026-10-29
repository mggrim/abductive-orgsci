/**
 * Standalone SVG diagram of the ontology (ISC-68).
 *
 * Reuses the workbench's layout and colour vocabulary, so the exported figure
 * is the thing the researcher was looking at rather than a second rendering
 * that drifts from it. Emits a self-contained SVG with an inline legend,
 * droppable into a slide deck or a paper appendix with no external stylesheet.
 *
 * "Reuses the vocabulary" was half true for three rounds and the wrong half.
 * The layout was shared and everything drawn on top of it was local: origin was
 * a third convention (paper fill, 2.5 rim, dash "4 2") that contradicted both
 * the app's figures, unattachedness was not drawn at all even though /ontology
 * calls the missing relation the finding, and the type was 9, 10, 11, 14 and
 * 16, four sizes the five-step scale does not contain, with r=22/15, x=20,
 * 210px legend columns and +13/+11 offsets to match. The artefact that leaves
 * the tool and goes into a paper was the one surface entirely outside the
 * foundations layer. Marks come from src/ui/components/PageMark.tsx, the words
 * from src/ui/originVocabulary.ts, and sizes from the
 * TYPE_PX and SPACE_PX mirrors now, and the legend sentences are the same
 * strings the app prints.
 *
 * And then the same defect was found a fourth time, in the last channel this
 * file still owned on its own: the relation grammar. It imported EDGE_STYLE and
 * used one field of it, so all 54 edges of the density probe were drawn in a
 * single grey while the screen coloured them by family; it emitted no marker,
 * no polygon and no path, so every directed relation left the tool without its
 * direction; and it compensated by stamping the raw slug at each midpoint, so
 * the file said "tensions-with" seven times while the key one tab away said
 * "tensions with" and the node title said "is in tension with". Three spellings
 * of one word, on the copy that goes in a paper, which is the failure
 * OntologyView's own docstring records as having cost the export voicing five
 * rounds. Colour, dash, weight and direction now all come out of
 * src/ontology/relationGlossary.ts, the midpoint slug is gone, and the figure
 * carries the same relation key the screen does.
 *
 * The other half of that round: past the caption ceiling the layout stops
 * carrying page names and /ontology says so and falls back to the index below
 * it. The figure had no index, so a 44-page export was 44 anonymous discs. It
 * numbers the discs and prints the names now, for the same reason the screen
 * does: a drawing that will not say what its marks are is a picture of an
 * ontology rather than the ontology.
 *
 * And a fifth time, in the last channel left: size. The layout draws a puzzle
 * root at 1.46 times the radius of every other page, 2.13 times the area, and
 * this file legended page type, origin, unattachedness and all seven relation
 * roles while saying nothing at all about the one difference a reader sees
 * first. The screen said it, one tab away, in a sentence typed into the key. So
 * the line at the top of this docstring, that the exported figure is the thing
 * the researcher was looking at rather than a second rendering that drifts from
 * it, was describing behaviour this file did not have, which is a defect in its
 * own right. The words and the condition are graphLayout's now, the layout
 * hands back `sizeContrast` rather than the figure guessing, and the row is
 * drawn as the pair of discs it defines.
 *
 * Pure: string in, string out.
 */

import type { OntologyGraph } from "../ontology/schema.ts";
import {
  EDGE_STYLE,
  LABEL_FIRST_LINE,
  LABEL_LINE_STEP,
  DASH_OFF_IN_FILE,
  DASH_OFF_READS,
  DASH_OFF_TERM,
  NAMES_OFF_IN_FILE,
  NAMES_OFF_READS,
  LEAF_RATIO,
  SIZE_CONTRAST_READS,
  SIZE_CONTRAST_TERM,
  arrowTip,
  edgeDash,
  figureHeight,
  edgeShaft,
  layoutGraph,
} from "../workbench/graphLayout.ts";
import { projectAnchoring } from "../views/anchoring.ts";
import { COLOUR, SPACE_PX, TYPE_PX } from "../ui/tokens.ts";
import { ADRIFT_READS, ORIGIN_ORDER, originLabel, originReads } from "../ui/originVocabulary.ts";
import { PAGE_TYPE_ORDER, pageTypeLabel } from "../ui/pageTypeVocabulary.ts";
// What a line means, out of the module that owns it. This file imported
// EDGE_STYLE from the layout and never imported the glossary beside it, which
// is how the figure came to draw seven roles as two stroke widths and three
// dash states in one grey with the internal slug printed over the top.
import {
  FAMILY,
  RELATIONS_BY_FAMILY,
  relationEntry,
  type RelationFamily,
} from "../ontology/relationGlossary.ts";
import type { EdgeRole } from "../ledger/events.ts";
// The string forms of the same marks the app renders, out of the same module.
// This file used to import PAGE_TYPE_COLOUR and compose the mark itself, which
// is how it came to hold a third convention (paper fill, a 2.5 rim and a dash
// of "4 2") on the one artefact that leaves the tool and goes into a paper.
import {
  adriftLegendSvg,
  arrowMarkerRef,
  arrowMarkerSvg,
  originDoubtLegendSvg,
  originLegendSvg,
  pageDiscSvg,
  pageTypeKeySwatchSvg,
  sizeContrastLegendSvg,
  sizeContrastSpan,
} from "../ui/components/index.ts";
// The caveat and the legend sentence, from the module that owns the finding.
// This file did not import it at all, which is how the figure came to repeat
// the screen's unqualified claim on the artefact that goes into a paper.
import { ORIGIN_DOUBT_READS, originDoubtCaveat } from "../ontology/originAudit.ts";

/** The figure's own gutter, and the step between legend rows. */
const GUTTER = SPACE_PX.xl;
const ROW = SPACE_PX.xl;
/** A legend swatch is the same disc at reading size. */
const SWATCH_R = SPACE_PX.sm;
/** How many page types fit across the figure before the row wraps. */
const LEGEND_COLUMNS = 3;
/**
 * The step between two lines of set prose, as against two legend rows.
 *
 * A legend row is a swatch and a line; a wrapped sentence is neither, and
 * spending a whole ROW on each of its lines put a hole through every paragraph
 * in the key. The caveat block was already set at this step and the relation
 * key and the index now share it.
 */
const LINE = TYPE_PX.small + SPACE_PX.xs;
/** How long a line swatch is in the relation key, and where the text starts. */
const SWATCH_LINE = SPACE_PX.xl;
const RELATION_INDENT = SWATCH_LINE + SPACE_PX.md;
/**
 * How many columns the page index runs in when the drawing has dropped names.
 *
 * Three rather than two, measured on the 44-page probe: the same 88 wrapped
 * lines cost 44 rows in two columns and 30 in three, which is 300 units off a
 * figure that a reader has to scroll or shrink. It is the same budget the page
 * type legend runs at, and the index carries a disc and a number in front of
 * the name, so a narrow column still reads as a list rather than as prose.
 */
const INDEX_COLUMNS = 3;
/** And the step between index lines, which carry a disc rather than only words. */
const INDEX_LINE = TYPE_PX.small + SPACE_PX.sm;

/**
 * The average glyph width at the small step, for wrapping set prose.
 *
 * Half the em, which is the usual figure for system-ui running text and the
 * same order as graphLayout's own caption estimate. Derived rather than
 * declared, so a caller that hands this builder a different width gets prose
 * wrapped to that width instead of to a number typed in here once.
 */
const GLYPH = TYPE_PX.small / 2;

/**
 * The one weight this figure sets, for a heading against the text under it.
 *
 * Declared rather than typed at each call site, because there are four of them
 * now and a file with four copies of a number is a file that will one day have
 * three of one number and one of another.
 */
const HEAD_WEIGHT = 600;
/**
 * The halo under a numeral drawn on a disc, matching `.graph-node-label` in
 * src/ui/styles/ontology.css, which does the same job for the on-screen
 * caption. A stylesheet cannot reach a standalone file, so it is set here.
 */
const HALO = 3;

/** How many characters fit between two x positions at the small step. */
function measure(from: number, to: number): number {
  return Math.max(8, Math.floor((to - from) / GLYPH));
}

/** Wrap a sentence to the figure's measure. No cap and no ellipsis: a caveat
 * that stops halfway is worse than no caveat, and a page name the index will
 * not finish saying is the defect the index exists to fix. */
function wrap(text: string, max: number): readonly string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((w) => w !== "")) {
    if (line === "") line = word;
    else if (`${line} ${word}`.length <= max) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDiagramSvg(
  graph: OntologyGraph,
  options: {
    readonly title?: string;
    readonly width?: number;
    readonly height?: number;
    /**
     * The design stamp, from `stamp.ts`.
     *
     * Written into the figure's `<desc>` rather than drawn, because this file
     * goes into a slide or a paper and a digest painted on the canvas is noise
     * to every reader but one. `<desc>` is read by assistive technology, by
     * anyone who opens the SVG in a text editor, and by the co-author asking
     * which version of the model the figure shows. Optional, so a caller that
     * has no ledger to hand still gets a figure.
     */
    readonly stamp?: string;
    /**
     * Page ids whose recorded origin the ledger contradicts.
     *
     * The figure had no idea this existed. `originDoubtCaveat` reached memo.md
     * and ontology.json and this file did not import originAudit at all, so two
     * artefacts generated from the same button row disagreed about who wrote
     * the same page: the memo opened its attribution section with "1 page
     * carries an origin this tool cannot vouch for" while this file drew that
     * page as a solid disc beside a legend reading "yours, solid: you put this
     * page here out of your own prior thinking". This is the artefact that goes
     * into a slide or a paper, so it is the one where the claim being wrong
     * costs the most.
     *
     * A set of ids rather than the ledger, because this module is pure and the
     * caller already holds the reading. Optional, so a caller with no ledger to
     * hand still gets a figure, and empty means the figure says nothing about
     * doubt, which is the correct thing for a study that has none.
     */
    readonly doubted?: ReadonlySet<string>;
  } = {},
): string {
  const width = options.width ?? 900;
  // 560 was the height before captions wrapped. With three-line captions the
  // settled layout no longer fit inside it, so the fit compressed the drawing
  // and one page's caption came to sit on the next page's rim; 700 is the
  // height at which a five-page figure settles at scale 1 and stops doing that.
  //
  // A floor rather than the height, since round four. The screen grows its
  // canvas to hold the names and this box did not, so at eighteen wrapping
  // titles the tab named every page and the figure exported from the same
  // button row was eighteen numbered discs. The rule is graphLayout's, asked
  // once, so the two cannot answer it differently; below twelve pages it
  // returns this floor and the file is the box it has always been.
  const height = options.height ?? figureHeight(graph, width, 700);
  const layout = layoutGraph(graph, { width, height });
  // Unattachedness travels with the figure now. It was projected on /ontology
  // and dropped here, so the export lost the one structural observation the
  // view's own prose calls the finding, on the copy that goes into the paper.
  const adrift = new Set(projectAnchoring(graph).unanchored.map((p) => p.id));
  // Only the doubts that fall on pages actually drawn here, so the count in the
  // caveat is a count of discs a reader can go and find in the picture.
  const doubtedHere = layout.nodes.filter((n) => options.doubted?.has(n.id) === true).length;

  /* The figure is assembled body first and headed afterwards.
   *
   * The height of the legend used to be arithmetic done up front, because the
   * <svg> element needs the total before anything is drawn. That worked while
   * the legend was a fixed number of fixed-height rows and stopped working the
   * moment it carried wrapped prose, a relation key that is only as tall as the
   * roles in use, and an index that only exists when the drawing dropped the
   * names. A cursor is the honest form: every block advances it by what it
   * actually spent, and the header is written once the answer is known. */
  const body: string[] = [];
  /** The baseline the next line of the legend is set on. */
  let cursor = 0;

  const finish = (total: number): string =>
    [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${total}" width="${width}" height="${total}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">`,
      `<rect width="${width}" height="${total}" fill="${COLOUR.paper}"/>`,
      ...body,
      "</svg>",
    ].join("\n");

  if (options.stamp !== undefined) {
    body.push(
      `<desc>Ontology figure exported from Abductive at design stamp ${escapeXml(options.stamp)}. The stamp is a digest of every History event id in order, so it identifies the state of the design that Abductive drew this figure from.</desc>`,
    );
  }

  if (options.title !== undefined) {
    body.push(
      `<text x="${GUTTER}" y="${GUTTER + TYPE_PX.title}" font-size="${TYPE_PX.title}" font-weight="${HEAD_WEIGHT}" fill="${COLOUR.ink}">${escapeXml(options.title)}</text>`,
    );
  }

  if (layout.nodes.length === 0) {
    body.push(
      `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="${TYPE_PX.body}" fill="${COLOUR["ink-muted"]}">The ontology is empty.</text>`,
    );
    return finish(height);
  }

  /* Which relations this drawing actually makes, in the order the key reads.
   *
   * Same rule the graph key follows on screen: a key that names eight roles
   * when three are in play teaches the reader to stop reading it. The screen
   * puts the other five behind a disclosure, which a flat file has no way to
   * do, so here they are simply absent. */
  const rolesUsed: readonly EdgeRole[] = (
    Object.keys(RELATIONS_BY_FAMILY) as RelationFamily[]
  ).flatMap((f) => RELATIONS_BY_FAMILY[f].filter((r) => layout.edges.some((e) => e.role === r)));
  const familiesUsed = (Object.keys(FAMILY) as RelationFamily[]).filter((f) =>
    rolesUsed.some((r) => relationEntry(r).family === f),
  );

  /* One arrowhead per family, which is how direction gets into the file.
   *
   * The figure contained no marker, no polygon and no path: 54 edges of the
   * density probe left the tool as 54 undirected line segments while the ledger
   * held a direction for every one of them and the screen drew it. ATLAS.ti
   * network views and NVivo concept maps both put direction in the picture, so
   * a reviewer holding our figure beside theirs read ours as the less careful
   * tool, inverting what the two screens say. */
  if (familiesUsed.length > 0) {
    body.push(
      `<defs>${familiesUsed
        .map((f) => arrowMarkerSvg({ id: f, colour: FAMILY[f].colour }))
        .join("")}</defs>`,
    );
  }

  const radiusOf = new Map(layout.nodes.map((n) => [n.id, n.radius] as const));
  for (const edge of layout.edges) {
    const style = EDGE_STYLE[edge.role];
    const entry = relationEntry(edge.role);
    /* The dash is the canvas's answer, not the role's.
     *
     * Both drawings ask `edgeDash` and both keys ask it too, so a figure that
     * cannot render a pattern does not legend one. It was `style.dash`
     * unconditionally, which is right whenever the shafts are long enough and
     * silently wrong when they are not: on the 44-page probe the same eight
     * roles rendered as three colours while the key beside them spent eight
     * rows on what dash separates. */
    const drawn = edgeDash(edge.role, layout.dashChannel);
    const dash = drawn === "" ? "" : ` stroke-dasharray="${drawn}"`;
    // Rim to rim, less the head, so what is written into the file is the stroke
    // a reader can see rather than a line whose near end is under a disc.
    const shaft = edgeShaft(edge, radiusOf.get(edge.from) ?? 0, radiusOf.get(edge.to) ?? 0);
    const tip = arrowTip(edge, radiusOf.get(edge.to) ?? 0);
    if (shaft.length <= 0) {
      // The head alone, for the same reason the screen draws it: direction is
      // in the ledger and the two discs being too close is not a reason to drop
      // it. Counted below so the figure can say how many are in this state.
      body.push(
        `<line data-role="${edge.role}" data-family="${entry.family}" data-shaftless="true" x1="${shaft.x2.toFixed(1)}" y1="${shaft.y2.toFixed(1)}" x2="${tip.x.toFixed(1)}" y2="${tip.y.toFixed(1)}" stroke="${style.colour}" stroke-width="${style.weight}" marker-end="${arrowMarkerRef(entry.family)}" opacity="0.9"><title>${escapeXml(`${entry.reads}. ${entry.meaning}`)}</title></line>`,
      );
      continue;
    }
    /* The role reaches the reader as colour, dash, weight and a head, and the
     * words for it are in the key below.
     *
     * It used to reach them as `escapeXml(edge.role)` at the midpoint: the raw
     * slug, printed 54 times on the probe, overprinting the captions at twelve
     * pages and overprinting each other at forty-four, where the rendered file
     * read "tepnesiolvidosgtsh". A midpoint label cannot be laid out on a force
     * graph and the screen has never tried; it puts the vocabulary in a key and
     * the sentence in a hover title, and both of those are here now. */
    body.push(
      `<line data-role="${edge.role}" data-family="${entry.family}" x1="${shaft.x1.toFixed(1)}" y1="${shaft.y1.toFixed(1)}" x2="${tip.x.toFixed(1)}" y2="${tip.y.toFixed(1)}" stroke="${style.colour}" stroke-width="${style.weight}"${dash} marker-end="${arrowMarkerRef(entry.family)}" opacity="0.9"><title>${escapeXml(`${entry.reads}. ${entry.meaning}`)}</title></line>`,
    );
  }

  /* Past the caption ceiling the drawing carries numbers and the index carries
   * the names, which is the division of labour /ontology already announces in
   * its own words. The figure used to carry neither. */
  const numberOf = new Map(layout.nodes.map((n, i) => [n.id, i + 1] as const));
  for (const node of layout.nodes) {
    const r = node.radius;
    body.push(
      pageDiscSvg({
        page: node,
        cx: node.x,
        cy: node.y,
        radius: r,
        adrift: adrift.has(node.id),
        doubted: options.doubted?.has(node.id) === true,
      }),
    );
    // The caption is the layout's, wrapped by the layout, so the figure in the
    // paper says what the figure on the screen says. It had its own wrapper and
    // its own budget here, and the screen had no wrapper at all.
    // With the halo the screen gives it, which the file did not. The layout
    // keeps every caption clear of every disc, badge and other caption, and it
    // says nothing about the lines: an edge is a straight run between two
    // centres and it crosses whatever lies between them. ontology.css draws a
    // paper-coloured stroke under the glyphs for exactly that, and this text
    // had none, so a name crossed by a relation was legible on screen and read
    // through in the file. Same treatment as the numeral below, which is the
    // one mark in this figure that already had it.
    node.label.forEach((line, i) => {
      body.push(
        `<text x="${node.x.toFixed(1)}" y="${(node.y + r + LABEL_FIRST_LINE + i * LABEL_LINE_STEP).toFixed(1)}" text-anchor="middle" font-size="${TYPE_PX.small}" paint-order="stroke" stroke="${COLOUR.paper}" stroke-width="${HALO}" stroke-linejoin="round" fill="${COLOUR.ink}">${escapeXml(line)}</text>`,
      );
    });
    if (!layout.captioned) {
      // Inside the disc, because outside it there is no room: the layout only
      // reserves caption space when it is carrying captions, so a numeral hung
      // under the rim would land on the neighbour. A paper-coloured halo under
      // the glyph is the same treatment ontology.css gives the on-screen
      // caption, and it is what keeps the numeral legible on a solid fill.
      body.push(
        `<text x="${node.x.toFixed(1)}" y="${(node.y + SPACE_PX.xs).toFixed(1)}" text-anchor="middle" font-size="${TYPE_PX.small}" font-weight="${HEAD_WEIGHT}" paint-order="stroke" stroke="${COLOUR.paper}" stroke-width="${HALO}" stroke-linejoin="round" fill="${COLOUR.ink}">${numberOf.get(node.id) ?? 0}</text>`,
      );
    }
  }

  body.push(
    `<line x1="${GUTTER}" y1="${height + SPACE_PX.xs}" x2="${width - GUTTER}" y2="${height + SPACE_PX.xs}" stroke="${COLOUR.line}"/>`,
  );
  cursor = height + GUTTER;

  // Was insertion order off the layout, which meant the legend of a figure
  // going into a paper was ordered by wherever the force simulation happened to
  // put the nodes, and the key on screen was ordered alphabetically by slug.
  // Two legends for the same drawing in two different orders. One order, owned
  // by the module that owns the words, and now the file is deterministic for
  // the same ledger state as well.
  const types = PAGE_TYPE_ORDER.filter((t) => layout.nodes.some((n) => n.type === t));
  const origins = ORIGIN_ORDER.filter((o) => layout.nodes.some((n) => n.origin === o));
  // Three columns, not four. At --text-small a page-type name like
  // "candidate resolution" is wider than a quarter of a 900-unit figure, so the
  // fourth column ran off the right edge of the exported file. The budget is
  // unchanged by the move onto the vocabulary module: the longest label is the
  // same twenty characters it was as a slug, with the hyphen spent as a space.
  const typeColumn = (width - 2 * GUTTER) / LEGEND_COLUMNS;
  types.forEach((type, i) => {
    const x = GUTTER + (i % LEGEND_COLUMNS) * typeColumn;
    const y = cursor + Math.floor(i / LEGEND_COLUMNS) * ROW;
    // The word beside the swatch is the one the graph key uses, and until now
    // it was `escapeXml(type)`: the file that goes into a slide spelled it
    // "analytic-residue" while the key one tab away spelled it "analytic
    // residue". Screen and file disagreeing about the same word is the failure
    // OntologyView's own docstring records as having cost the export voicing
    // five rounds, and it was live again in the legend of the figure that
    // leaves the building.
    body.push(
      pageTypeKeySwatchSvg({ type, cx: x + SWATCH_R, cy: y - SPACE_PX.xs, radius: SWATCH_R }),
      `<text x="${x + 2 * SWATCH_R + SPACE_PX.sm}" y="${y}" font-size="${TYPE_PX.small}" fill="${COLOUR.ink}">${escapeXml(pageTypeLabel(type))}</text>`,
    );
  });
  cursor += Math.ceil(types.length / LEGEND_COLUMNS) * ROW;

  /* Size, the fifth channel, which this file drew and would not define.
   *
   * Measured in the generated files rather than read off the source: the
   * 44-page probe held 7 discs at r=10.5 against 37 at r=7.2, the 12-page probe
   * 2 at r=30.0 against 10 at r=20.5, the 200-page probe 29 at r=8.1 against
   * 171 at r=5.5. That is 2.13 times the area, the loudest mark on the canvas
   * after colour, and none of the three files contained the words for it while
   * all three legended page type, origin, unattachedness and every relation
   * role in play. The screen printed the sentence one tab away, which made this
   * the round-one defect in its fifth channel: screen and file disagreeing
   * about the same mark, on the artefact whose own card reads "The ontology as
   * one picture, for a slide or a figure in the paper".
   *
   * Drawn on the layout's own answer rather than on a condition recomputed
   * here, and set in the same "term, sentence" shape the origin rows use. The
   * pair of discs is wider than a one-disc swatch box, so the text starts past
   * what the pair actually spends and the arithmetic for that comes out of the
   * mark module with the mark. */
  if (layout.sizeContrast) {
    body.push(
      sizeContrastLegendSvg({
        x: GUTTER,
        cy: cursor - SPACE_PX.xs,
        radius: SWATCH_R,
        ratio: LEAF_RATIO,
      }),
    );
    const textLeft = GUTTER + sizeContrastSpan(SWATCH_R, LEAF_RATIO) + SPACE_PX.sm;
    for (const line of wrap(
      `${SIZE_CONTRAST_TERM}, ${SIZE_CONTRAST_READS}`,
      measure(textLeft, width - GUTTER),
    )) {
      body.push(
        `<text x="${textLeft.toFixed(1)}" y="${cursor}" font-size="${TYPE_PX.small}" fill="${COLOUR["ink-muted"]}">${escapeXml(line)}</text>`,
      );
      cursor += LINE;
    }
    // Back onto the legend's own rhythm, so the origin row below sits a full
    // row under the last line of this one rather than a line under it.
    cursor += ROW - LINE;
  }

  // Origin and unattachedness, each drawn as the mark itself rather than
  // described in a sentence about a treatment. The old note read "Hollow,
  // dashed outline = proposed by a model and accepted by the researcher", which
  // named two channels for one dimension and was the sentence /ontology's key
  // contradicted.
  for (const origin of origins) {
    body.push(
      originLegendSvg({ origin, cx: GUTTER + SWATCH_R, cy: cursor - SPACE_PX.xs, radius: SWATCH_R }),
      `<text x="${GUTTER + 2 * SWATCH_R + SPACE_PX.sm}" y="${cursor}" font-size="${TYPE_PX.small}" fill="${COLOUR["ink-muted"]}">${escapeXml(`${originLabel(origin)}, ${originReads(origin)}`)}</text>`,
    );
    cursor += ROW;
  }
  // Directly under the origin rows, because it qualifies them and nothing else.
  if (doubtedHere > 0) {
    body.push(
      originDoubtLegendSvg({ cx: GUTTER + SWATCH_R, cy: cursor - SPACE_PX.xs, radius: SWATCH_R }),
      `<text x="${GUTTER + 2 * SWATCH_R + SPACE_PX.sm}" y="${cursor}" font-size="${TYPE_PX.small}" fill="${COLOUR["ink-muted"]}">${escapeXml(ORIGIN_DOUBT_READS)}</text>`,
    );
    cursor += ROW;
  }
  if (adrift.size > 0) {
    // The legend row is a fixed swatch box, so the disc is sized back from the
    // ring rather than the ring being guessed at half a gap outside the disc.
    // That arithmetic used to be done here, out of two exported helpers; it is
    // inside adriftLegendSvg now, shared with the React swatch by construction
    // rather than by both call sites remembering to call the same function.
    body.push(
      adriftLegendSvg({ cx: GUTTER + SWATCH_R, cy: cursor - SPACE_PX.xs, radius: SWATCH_R }),
      `<text x="${GUTTER + 2 * SWATCH_R + SPACE_PX.sm}" y="${cursor}" font-size="${TYPE_PX.small}" fill="${COLOUR["ink-muted"]}">${escapeXml(ADRIFT_READS)}</text>`,
    );
    cursor += ROW;
  }

  /* The caveat itself, in the file rather than only in the tool.
   *
   * A legend row says what the bar means; this says how much of the figure it
   * covers and why the attribution channel has errors in it at all. Both are
   * needed and neither substitutes for the other: a reader holding this file
   * next to memo.md has to find the same sentence in both, and until now the
   * memo carried it and the figure carried a legend asserting the opposite.
   * Drawn rather than put in <desc>, because a slide is looked at and a <desc>
   * is not. */
  if (doubtedHere > 0) {
    cursor += GUTTER;
    for (const line of wrap(
      originDoubtCaveat(doubtedHere),
      measure(GUTTER, width - GUTTER),
    )) {
      body.push(
        `<text x="${GUTTER}" y="${cursor}" font-size="${TYPE_PX.small}" fill="${COLOUR["ink-muted"]}">${escapeXml(line)}</text>`,
      );
      cursor += LINE;
    }
  }

  /* What a line means, which the figure did not say at all.
   *
   * Seven roles reached the reader as two stroke widths and three dash states
   * in a single colour with no key, which is the exact condition
   * relationGlossary.ts's docstring records as the reason a researcher reported
   * they could not understand the connections. Families first and one
   * actionable sentence per role, which is what the screen's RelationKey gives
   * and what the blind comparison scored us above ATLAS.ti and NVivo for. Only
   * the roles this drawing uses, on the same rule the rest of this legend
   * follows. */
  if (rolesUsed.length > 0) {
    cursor += GUTTER;
    body.push(
      `<text x="${GUTTER}" y="${cursor}" font-size="${TYPE_PX.body}" font-weight="${HEAD_WEIGHT}" fill="${COLOUR.ink}">What a line means</text>`,
    );
    cursor += ROW;
    /* And, before the eight rows, whether this figure is varying dash at all.
     *
     * Same sentence the screen prints, out of the same module, above the same
     * swatches. A reader holding the file beside the tab must not be told two
     * different things about the same marks, which is the failure this file's
     * docstring records four times over, once per channel. */
    if (!layout.dashChannel) {
      for (const line of wrap(
        `${DASH_OFF_TERM} ${DASH_OFF_READS} ${DASH_OFF_IN_FILE}`,
        measure(GUTTER, width - GUTTER),
      )) {
        body.push(
          `<text x="${GUTTER}" y="${cursor}" font-size="${TYPE_PX.small}" fill="${COLOUR["ink-muted"]}">${escapeXml(line)}</text>`,
        );
        cursor += LINE;
      }
      cursor += SPACE_PX.sm;
    }
    for (const family of familiesUsed) {
      for (const line of wrap(
        `${FAMILY[family].label}. ${FAMILY[family].gloss}`,
        measure(GUTTER, width - GUTTER),
      )) {
        body.push(
          `<text x="${GUTTER}" y="${cursor}" font-size="${TYPE_PX.small}" font-weight="${HEAD_WEIGHT}" fill="${FAMILY[family].colour}">${escapeXml(line)}</text>`,
        );
        cursor += LINE;
      }
      for (const role of RELATIONS_BY_FAMILY[family].filter((r) => rolesUsed.includes(r))) {
        const entry = relationEntry(role);
        const style = EDGE_STYLE[role];
        const swatch = edgeDash(role, layout.dashChannel);
        const dash = swatch === "" ? "" : ` stroke-dasharray="${swatch}"`;
        // The same three channels the edge above is drawn with, plus the head,
        // so the swatch is the mark and not a description of it.
        body.push(
          `<line data-legend="relation" data-role="${role}" x1="${GUTTER}" y1="${cursor - SPACE_PX.xs}" x2="${GUTTER + SWATCH_LINE}" y2="${cursor - SPACE_PX.xs}" stroke="${style.colour}" stroke-width="${style.weight}"${dash} marker-end="${arrowMarkerRef(family)}"/>`,
        );
        const lines = wrap(
          `${entry.label}: ${entry.meaning}`,
          measure(GUTTER + RELATION_INDENT, width - GUTTER),
        );
        for (const line of lines) {
          body.push(
            `<text x="${GUTTER + RELATION_INDENT}" y="${cursor}" font-size="${TYPE_PX.small}" fill="${COLOUR.ink}">${escapeXml(line)}</text>`,
          );
          cursor += LINE;
        }
      }
      cursor += SPACE_PX.sm;
    }
  }

  /* Every relation in words, when the lines have stopped saying which is which.
   *
   * The screen's answer to a canvas that cannot carry the dash is that you
   * select a page and the card names the roles that touch it. A figure in a
   * paper appendix cannot be selected, so the same sentence would be a
   * direction a reader of this file cannot follow, and `DASH_OFF_IN_FILE`
   * promises this list instead. A promise in a legend that the file does not
   * keep is the defect this whole layer exists to stop, one register along.
   *
   * Only when the dash is off. With the dash on, the line itself says the role
   * and 54 rows restating that is the kind of legend that teaches a reader to
   * stop reading legends, which is the rule every other block here follows. */
  if (!layout.dashChannel && layout.edges.length > 0) {
    cursor += GUTTER;
    body.push(
      `<text x="${GUTTER}" y="${cursor}" font-size="${TYPE_PX.body}" font-weight="${HEAD_WEIGHT}" fill="${COLOUR.ink}">Every relation, by role</text>`,
    );
    cursor += ROW;
    // Against the disc's number where the drawing carries numbers, and against
    // its name where it carries names, so a row can always be found in the
    // picture above it.
    const nameOf = (id: string): string =>
      layout.captioned
        ? (layout.nodes.find((n) => n.id === id)?.title ?? "")
        : String(numberOf.get(id) ?? 0);
    const relColumn = (width - 2 * GUTTER) / INDEX_COLUMNS;
    const rows = layout.edges.map((edge) =>
      wrap(
        `${nameOf(edge.from)} ${relationEntry(edge.role).reads} ${nameOf(edge.to)}`,
        measure(0, relColumn - SPACE_PX.md),
      ),
    );
    const totalLines = rows.reduce((n, r) => n + r.length, 0);
    const perColumn = Math.ceil(totalLines / INDEX_COLUMNS);
    let column = 0;
    let spent = 0;
    let tallest = 0;
    let y = cursor;
    rows.forEach((lines) => {
      if (spent > 0 && spent + lines.length > perColumn && column < INDEX_COLUMNS - 1) {
        tallest = Math.max(tallest, y - cursor);
        column += 1;
        spent = 0;
        y = cursor;
      }
      const x = GUTTER + column * relColumn;
      for (const line of lines) {
        body.push(
          `<text x="${x}" y="${y}" font-size="${TYPE_PX.small}" fill="${COLOUR.ink}">${escapeXml(line)}</text>`,
        );
        y += INDEX_LINE;
      }
      spent += lines.length;
    });
    cursor += Math.max(tallest, y - cursor);
  }

  /* And the names, when the drawing could not carry them.
   *
   * `layout.captioned` is the layout's own answer, measured on the blocks it
   * placed, and on screen /ontology says so in the same words and the index
   * below it holds the names. The figure said nothing and held nothing: the 44-page
   * probe exported as 44 anonymous discs. Every disc carries its number now and
   * every number is named here, with the same disc beside it, so a reader who
   * has only the file can still say which page is which and who wrote it. */
  if (!layout.captioned) {
    cursor += GUTTER;
    for (const line of wrap(
      `${NAMES_OFF_READS} ${NAMES_OFF_IN_FILE}`,
      measure(GUTTER, width - GUTTER),
    )) {
      body.push(
        `<text x="${GUTTER}" y="${cursor}" font-size="${TYPE_PX.small}" fill="${COLOUR["ink-muted"]}">${escapeXml(line)}</text>`,
      );
      cursor += LINE;
    }
    cursor += SPACE_PX.sm;
    const indexColumn = (width - 2 * GUTTER) / INDEX_COLUMNS;
    const textLeft = 2 * SWATCH_R + SPACE_PX.sm;
    const entries = layout.nodes.map((node) => ({
      node,
      lines: wrap(
        `${numberOf.get(node.id) ?? 0}. ${node.title}`,
        measure(0, indexColumn - textLeft - SPACE_PX.md),
      ),
    }));
    // Balanced by line count rather than by entry count, because a two-line
    // title in the first half would otherwise push the second column short.
    // No entry is split across a column break: a name broken over a fold is the
    // defect this block exists to fix.
    const totalLines = entries.reduce((n, e) => n + e.lines.length, 0);
    const perColumn = Math.ceil(totalLines / INDEX_COLUMNS);
    let column = 0;
    let spent = 0;
    let tallest = 0;
    let y = cursor;
    for (const entry of entries) {
      if (spent > 0 && spent + entry.lines.length > perColumn && column < INDEX_COLUMNS - 1) {
        tallest = Math.max(tallest, y - cursor);
        column += 1;
        spent = 0;
        y = cursor;
      }
      const x = GUTTER + column * indexColumn;
      body.push(
        pageDiscSvg({
          page: entry.node,
          cx: x + SWATCH_R,
          cy: y - SPACE_PX.xs,
          radius: SWATCH_R,
          // The bar and not the ring. The bar is the attribution caveat and it
          // has to travel with the name wherever the name is asserted, which is
          // the whole of round one; unattachedness is a fact about the drawing
          // and the drawing is where it is drawn.
          doubted: options.doubted?.has(entry.node.id) === true,
        }),
      );
      for (const line of entry.lines) {
        body.push(
          `<text x="${x + textLeft}" y="${y}" font-size="${TYPE_PX.small}" fill="${COLOUR.ink}">${escapeXml(line)}</text>`,
        );
        y += INDEX_LINE;
      }
      spent += entry.lines.length;
    }
    cursor += Math.max(tallest, y - cursor);
  }

  return finish(cursor + GUTTER);
}
