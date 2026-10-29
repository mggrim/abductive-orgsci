/**
 * The render boundary for the direction of a relation.
 *
 * The arrowhead is the only mark in the app that has to exist twice, once as a
 * React element for the screen and once as a string for the exported figure,
 * and for three rounds it existed once: OntologyGraph.tsx declared a marker per
 * family and src/export/diagram.ts declared none at all. So the ledger held a
 * direction for every edge, the screen drew it, and the artefact that goes into
 * a paper left the building with 54 undirected line segments. ATLAS.ti network
 * views and NVivo concept maps both put direction in the picture; ours put it
 * on the glass only.
 *
 * The obvious repair is to paste the marker into the export, which is how this
 * codebase acquired three conventions for a page disc and four spellings of a
 * page type. So the glyph is declared here once, in both forms, off the same
 * three numbers. A caller picks an id and a colour; it cannot pick a shape.
 *
 * The colour is passed rather than read, because a marker is also used for the
 * transient selected state, which is ink and belongs to no family.
 */

/** The marker's own coordinate box. The glyph is a triangle filling it. */
const BOX = 10;
/**
 * How long the head is, in the units of the drawing that references it.
 *
 * Declared and exported, because the layout has to subtract it. An arrowhead
 * sits on the end of a line and covers that much of it, so the stroke a reader
 * can actually see is the line less the head, and until the layout knew this
 * number it could not tell the difference between an edge and an edge that is
 * entirely arrowhead.
 */
export const ARROW_HEAD = 8;
/** The tip sits just inside the box, so the point lands on the line's end. */
const TIP = BOX - 1;

const PATH = `M 0 0 L ${BOX} ${BOX / 2} L 0 ${BOX} z`;

/** The attributes both forms set, so neither can drift from the other. */
const MARKER = {
  viewBox: `0 0 ${BOX} ${BOX}`,
  refX: String(TIP),
  refY: String(BOX / 2),
  markerWidth: String(ARROW_HEAD),
  markerHeight: String(ARROW_HEAD),
  /**
   * The head is a length, not a multiple of the pen that drew the line.
   *
   * `markerUnits` defaults to `strokeWidth`, so `markerWidth` was being read as
   * eight stroke-widths and the head came out a different size on every role:
   * measured on the 44-page probe, 7 units on an `evidences` edge at weight
   * 1.4, 9 on `contradicts` at 1.8 and 15 on `stands-to` at 3. The graph's
   * longest edge on that canvas is 29 units, so the framing edge, which
   * relationGlossary calls the most consequential in the graph and draws
   * heaviest on purpose, was the one most likely to be nothing but its own
   * arrowhead. Weight is a channel for the role; it is not a statement about
   * how much of the line the head is entitled to eat.
   */
  markerUnits: "userSpaceOnUse",
  /** So an edge drawn from either end still points the way the ledger says. */
  orient: "auto-start-reverse",
} as const;

/** How a marker is referenced, so the id is built in one place. */
export function arrowMarkerRef(id: string): string {
  return `url(#${arrowMarkerId(id)})`;
}

export function arrowMarkerId(id: string): string {
  return `arrow-${id}`;
}

/** The arrowhead as a React element, for the screen. */
export function ArrowMarker(props: { id: string; colour: string }) {
  return (
    <marker id={arrowMarkerId(props.id)} {...MARKER}>
      <path d={PATH} fill={props.colour} />
    </marker>
  );
}

/** The same arrowhead as a string, for the standalone file. */
export function arrowMarkerSvg(args: { id: string; colour: string }): string {
  const attrs = Object.entries(MARKER)
    .map(([k, v]) => `${k}="${v}"`)
    .join(" ");
  return `<marker id="${arrowMarkerId(args.id)}" ${attrs}><path d="${PATH}" fill="${args.colour}"/></marker>`;
}
