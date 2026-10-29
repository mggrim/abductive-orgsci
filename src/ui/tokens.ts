/**
 * The palettes, for the layers that cannot read a custom property (FND-04).
 *
 * SVG fills, strokes and the export renderer take a colour as an attribute
 * value, so they need the literals rather than a var(). This file mirrors
 * styles/tokens.css and is the only place in TypeScript allowed a hex. If the
 * two ever disagree, tokens.css wins and this is the file to correct.
 *
 * That claim used to be made and not kept. The header said "the only place in
 * TypeScript allowed a hex" while 29 more lived in four other files, because
 * the only test that looked for hexes globbed `*.css` and no test looked at
 * TypeScript at all: eleven in Introduction.tsx, eleven in export/diagram.ts,
 * seven in Instrumentation.tsx, six in OntologyGraph.tsx and three in
 * relationGlossary.ts. The COLOUR record below is what those five now read,
 * tests/styles-integrity.test.ts fails on a hex anywhere under src/ except
 * this file, and a second assertion holds every entry here to the value
 * tokens.css declares, so the mirror cannot drift in silence either.
 *
 * The defect this closes: PAGE_TYPE_COLOUR in graphLayout.ts and ORIGIN_COLOUR
 * in Instrumentation.tsx were two independent literals sharing three of their
 * values, so #274c77 meant "theory" in the page list and "your prior" in the
 * trajectory legend, and the same #a4452b was simultaneously the puzzle page
 * type, the station open-question dot, the "Open here" finding rule, the queue
 * count badge and the Delete link on /studies. Attribution is the product's
 * central claim, so the one legend that must not be ambiguous was.
 *
 * The fix is not two better-chosen sets of hues. It is that the two dimensions
 * stop competing for the same channel. Hue is spent entirely on page type,
 * which has seven values and nothing else to encode with. Origin gets no
 * colour at all: it is fill share, solid then half then hollow, and it lives in
 * src/ui/components/PageMark.tsx because it is a mark and not a palette, and
 * PAGE_TYPE_COLOUR below now has that one reader and no other. ORIGIN_COLOUR
 * stood here for two rounds as an ink ramp with one consumer while the two
 * figures a researcher reads each drew origin their own way; see that file for
 * what the three definitions were and why the ramp went with them.
 *
 * That fix held for origin and then failed one layer out. The chrome kept the
 * hues: accent was byte-identical to page-theory, warn to page-puzzle, ok to
 * page-observation, notice 3/255 of green from page-analytic-residue, and
 * /biases painted 131 properties in the exact navy that means "theory". So the
 * chrome went achromatic. Everything in COLOUR below is ink, paper or line
 * except warn and ok, which are the two conventions a researcher arrives
 * already holding and which no page type comes within ΔE2000 20 of. The seven
 * page hues moved off the four the chrome had been wearing, and rival moved off
 * analytic-residue, which it had been sitting 10.5 ΔE from.
 */

import type { PageType } from "../ledger/events.ts";

/**
 * The non-encoding half of the sheet: ink, line, surface and the semantic
 * triads, keyed by the custom property they mirror without the leading dashes.
 *
 * Only what a TypeScript layer actually draws with is here. The point is a
 * shared vocabulary rather than a second copy of the stylesheet, and every key
 * is checked against tokens.css by test, so an unused key is a liability and a
 * missing one is a compile error at the call site.
 */
export const COLOUR = {
  paper: "#fafaf8",
  surface: "#ffffff",
  ink: "#1c1c1c",
  "ink-strong": "#17212e",
  "ink-muted": "#55606d",
  "ink-faint": "#6b7480",
  "ink-ghost": "#b3bcc7",
  line: "#dddddd",
  "line-strong": "#c3ccd6",
  accent: "#282d31",
  warn: "#a4452b",
  ok: "#2c6e49",
  notice: "#55606d",
} as const satisfies Readonly<Record<string, string>>;

/**
 * Hue, and the only dimension that gets it. Mirrors --page-* in tokens.css.
 *
 * Mutually ≥ 21 ΔE2000, ≥ 22 from warn and ok, and every one chroma ≥ 27
 * against a chrome that never exceeds 10. The previous seven failed all three:
 * four of them were the chrome's own values and rival sat 10.5 from
 * analytic-residue.
 */
export const PAGE_TYPE_COLOUR: Readonly<Record<PageType, string>> = {
  puzzle: "#85306b",
  theory: "#25477b",
  observation: "#197e8d",
  "analytic-residue": "#6a4f12",
  "candidate-resolution": "#7c73bd",
  rival: "#bd7083",
  "scope-condition": "#83872f",
};

/**
 * The type scale, in pixels, for the one layer that cannot read a class.
 *
 * Mirrors --text-* in tokens.css. The SVG export writes `font-size` as an
 * attribute into a standalone file with no stylesheet attached, and it was
 * spending 9, 10, 11, 14 and 16 there: four sizes that exist nowhere in the
 * five-step scale, on the artefact that leaves the tool and goes into a paper.
 * The figure a reader sees in the appendix was the one surface entirely outside
 * the foundations layer.
 */
export const TYPE_PX = {
  small: 13,
  body: 14,
  title: 18,
  head: 22,
  display: 28,
} as const satisfies Readonly<Record<string, number>>;

/**
 * The space scale, in pixels, for the same layer and the same reason.
 *
 * Mirrors --space-* in tokens.css. The export held r=22/15, x=20, 210px legend
 * columns and +13/+11 label offsets, none of which came from anywhere.
 */
export const SPACE_PX = {
  hair: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
} as const satisfies Readonly<Record<string, number>>;
