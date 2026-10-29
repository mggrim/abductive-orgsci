/**
 * Where each concept sits on the concept map (M63, ISC-609, ISC-613).
 *
 * One layout for the map on the tab and the figure in the export, so the file a
 * co-author opens is the drawing the researcher saw. Positions come from the
 * claims map's force layout (`layoutGraph`), fed the concepts as nodes and the
 * relations as links, then stretched to fill the drawing with room at the sides
 * for a label.
 */

import type { OntologyEdge, OntologyGraph, OntologyPage } from "../ontology/schema.ts";
import { layoutGraph } from "../workbench/graphLayout.ts";
import type { ConceptCard, ConceptLink } from "./projection.ts";

export const MAP_WIDTH = 300;
/* M77b: the least width the tab draws at; a narrower panel scrolls sideways. */
export const MAP_MIN_WIDTH = 240;
export const MAP_HEIGHT = 240;

/* M77, ISC-677. The walk's map drew twenty concepts in 300 by 240, and the
   concept labels left no clear spot for a relation label. The drawing grows
   taller with the concepts it draws, 24 units each, so the text keeps its size
   on screen and the map takes more of the panel's height instead. */
export const MAP_HEIGHT_PER_CONCEPT = 24;

/** The tab map's height for `concepts` concepts: 240 at least. */
export function mapHeight(concepts: number): number {
  return Math.max(MAP_HEIGHT, concepts * MAP_HEIGHT_PER_CONCEPT);
}

function asGraph(projectId: string, concepts: readonly ConceptCard[], links: readonly ConceptLink[]): OntologyGraph {
  const pages = new Map<string, OntologyPage>();
  for (const c of concepts) {
    pages.set(c.id, {
      id: c.id,
      projectId,
      type: "observation",
      title: c.name,
      body: "",
      origin: c.origin ?? "model-proposed",
      status: "conjecture",
      supportingChunks: [],
      version: 1,
      history: [],
      supersededBy: null,
      retired: false,
      createdAt: c.suggestedAt,
      updatedAt: c.decidedAt ?? c.suggestedAt,
    });
  }
  const edges = new Map<string, OntologyEdge>();
  for (const l of links) {
    edges.set(l.id, { id: l.id, projectId, from: l.from, to: l.to, role: "evidences", origin: "author-prior", supportingChunks: [], retired: false, createdAt: 0 });
  }
  return { projectId, pages, edges, relations: [], collapses: [], puzzleRoots: [], supersededPuzzles: [] };
}

export function conceptMapLayout(
  projectId: string,
  concepts: readonly ConceptCard[],
  links: readonly ConceptLink[],
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
  /* M77b, ISC-677: the labels as drawn, so the layout keeps them apart. */
  labels: ConceptLabels = { lines: tabLabelLines, type: TAB_TYPE },
): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  return conceptMapLayoutChecked(projectId, concepts, links, width, height, labels).at;
}

/** The layout and whether every concept's dot and label came out clear of every other's. */
function conceptMapLayoutChecked(
  projectId: string,
  concepts: readonly ConceptCard[],
  links: readonly ConceptLink[],
  width: number,
  height: number,
  labels: ConceptLabels,
): { readonly at: ReadonlyMap<string, { readonly x: number; readonly y: number }>; readonly clear: boolean } {
  if (concepts.length === 0) return { at: new Map(), clear: true };
  const layout = layoutGraph(asGraph(projectId, concepts, links), { width, height, iterations: 200 });
  const xs = layout.nodes.map((n) => n.x);
  const ys = layout.nodes.map((n) => n.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const fit = (v: number, lo: number, hi: number, from: number, to: number) =>
    hi - lo < 1 ? (from + to) / 2 : from + ((v - lo) / (hi - lo)) * (to - from);
  const side = Math.min(62, width * 0.2);
  const fitted = new Map(
    layout.nodes.map((n) => [n.id, { x: fit(n.x, x0, x1, side, width - side), y: fit(n.y, y0, y1, 30, height - 40) }] as const),
  );
  return separateLabels(concepts, fitted, width, height, labels);
}

/**
 * The tab's whole drawing (M77b, the lead's ruling B; M82, ISC-693): the
 * height, the concept positions, the label sides, the routed lines and the
 * relation labels. The height starts at `mapHeight` for the concepts drawn and
 * grows 24 units at a time while any two concept labels or dots meet, a line
 * finds no clear route, or a relation label finds no clear spot, so every label
 * on the map clears every other label, every line and every dot at the size
 * drawn. The exported figure draws through the same function at its own sizes.
 */
export function conceptMapDrawing(input: {
  readonly projectId: string;
  readonly concepts: readonly ConceptCard[];
  readonly links: readonly ConceptLink[];
  readonly relations: readonly MapRelation[];
  readonly width: number;
  readonly labels?: ConceptLabels;
  /* M79: the expanded map starts at the dialog's free height rather than
     `mapHeight`, so a large map reads at the viewport's size. */
  readonly minHeight?: number;
}): { readonly height: number; readonly at: ReadonlyMap<string, Pt> } & RoutedDrawing {
  const labels = input.labels ?? { lines: tabLabelLines, type: TAB_TYPE };
  const start = Math.max(mapHeight(input.concepts.length), Math.floor(input.minHeight ?? 0));
  let last: ({ height: number; at: ReadonlyMap<string, Pt> } & RoutedDrawing) | undefined;
  for (let height = start; height <= start + MAP_HEIGHT_PER_CONCEPT * 40; height += MAP_HEIGHT_PER_CONCEPT) {
    const { at, clear } = conceptMapLayoutChecked(input.projectId, input.concepts, input.links, input.width, height, labels);
    const routed = routeDrawing({
      at,
      concepts: input.concepts.map((c) => ({ id: c.id, lines: labels.lines(c) })),
      relations: input.relations,
      width: input.width,
      height,
      type: labels.type,
    });
    last = { height, at, ...routed };
    if (clear && routed.clear) return last;
  }
  return last ?? { height: start, at: new Map(), sides: new Map(), routes: new Map(), placed: new Map(), clear: false };
}

/** How a drawing labels its concepts: the lines under each dot, and the type sizes. */
export interface ConceptLabels {
  readonly lines: (concept: ConceptCard) => readonly string[];
  readonly type: MapType;
}

/* M77b, ISC-677 (the lead's ruling B, 2026-10-03): concept labels repel each
   other. Each concept takes the box of its dot and its label together; two boxes
   that meet are pushed apart along the axis where they overlap least, half each,
   and kept inside the drawing, until no two meet or the passes run out. */
const LABEL_GAP = 3;
const DRAWING_MARGIN = 2;

function separateLabels(
  concepts: readonly ConceptCard[],
  fitted: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
  width: number,
  height: number,
  labels: ConceptLabels,
): { readonly at: ReadonlyMap<string, { readonly x: number; readonly y: number }>; readonly clear: boolean } {
  const { type } = labels;
  const items = concepts.flatMap((c) => {
    const at = fitted.get(c.id);
    if (at === undefined) return [];
    const label = textBox(0, type.conceptFirst, labels.lines(c), type.concept, type.conceptLine);
    return [
      {
        id: c.id,
        x: at.x,
        y: at.y,
        left: Math.min(label.x, -type.dot),
        right: Math.max(label.x + label.width, type.dot),
        top: -type.dot,
        bottom: label.y + label.height,
      },
    ];
  });
  const clamp = (it: (typeof items)[number]) => {
    it.x = Math.min(Math.max(it.x, DRAWING_MARGIN - it.left), Math.max(DRAWING_MARGIN - it.left, width - DRAWING_MARGIN - it.right));
    it.y = Math.min(Math.max(it.y, DRAWING_MARGIN - it.top), Math.max(DRAWING_MARGIN - it.top, height - DRAWING_MARGIN - it.bottom));
  };
  items.forEach(clamp);
  let moved = true;
  for (let pass = 0; pass < 800 && moved; pass += 1) {
    moved = false;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        if (a === undefined || b === undefined) continue;
        const ox = Math.min(a.x + a.right, b.x + b.right) - Math.max(a.x + a.left, b.x + b.left) + LABEL_GAP;
        const oy = Math.min(a.y + a.bottom, b.y + b.bottom) - Math.max(a.y + a.top, b.y + b.top) + LABEL_GAP;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const pushX = () => {
          const dir = a.x + (a.left + a.right) / 2 <= b.x + (b.left + b.right) / 2 ? -1 : 1;
          a.x += (dir * ox) / 2;
          b.x -= (dir * ox) / 2;
        };
        const pushY = () => {
          const dir = a.y + (a.top + a.bottom) / 2 <= b.y + (b.top + b.bottom) / 2 ? -1 : 1;
          a.y += (dir * oy) / 2;
          b.y -= (dir * oy) / 2;
        };
        const [ax, ay, bx, by] = [a.x, a.y, b.x, b.y];
        (ox < oy ? pushX : pushY)();
        clamp(a);
        clamp(b);
        /* A wall stopped the push on that axis, so push along the other. */
        if (Math.abs(a.x - ax) + Math.abs(a.y - ay) + Math.abs(b.x - bx) + Math.abs(b.y - by) < 0.5) {
          (ox < oy ? pushY : pushX)();
          clamp(a);
          clamp(b);
        }
      }
    }
  }
  /* Clear means no two boxes overlap; the gap is what the passes aim for, not the test. */
  const clear = items.every((a, i) =>
    items.slice(i + 1).every(
      (b) =>
        Math.min(a.x + a.right, b.x + b.right) <= Math.max(a.x + a.left, b.x + b.left) ||
        Math.min(a.y + a.bottom, b.y + b.bottom) <= Math.max(a.y + a.top, b.y + b.top),
    ),
  );
  return { at: new Map(items.map((it) => [it.id, { x: it.x, y: it.y }] as const)), clear };
}

/** The label lines the tab draws under a concept: its name in two lines, and "suggested" under a suggestion. */
export function tabLabelLines(concept: Pick<ConceptCard, "name" | "status">): readonly string[] {
  return [...labelLines(concept.name), ...(concept.status === "suggested" ? ["suggested"] : [])];
}

/** A name in at most two lines of about sixteen characters, so a label stays inside the drawing. */
export function labelLines(name: string, width = 16): readonly string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of name.split(/\s+/)) {
    if (line === "" || `${line} ${word}`.length <= width) line = line === "" ? word : `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  if (lines.length <= 2) return lines;
  const second = lines.slice(1).join(" ");
  return [lines[0] ?? "", second.length > width ? `${second.slice(0, width - 1)}…` : second];
}

/* ── Labels clear of lines and dots (M77, ISC-677; M82, ISC-693) ────────────
 *
 * The M75 walk found "contrasts with", drawn at its line's midpoint, over the
 * concept label "Money argument", and M77 placed each relation label clear of
 * the labels and dots. The owner, 2026-10-04: "Ensure that the text is not
 * overlapping the nodes or arrows in the concept map." So the drawing is laid
 * out in three passes after the concepts are placed:
 *
 *   1. Each concept's label hangs below its dot, or above it, or beside it on
 *      the right or the left, on the side that the lines leaving the dot cross
 *      least, where the side is clear of every other dot and label.
 *   2. Each relation line runs straight from dot to dot when the straight line
 *      meets no label and no other dot, and otherwise bends once, at the
 *      nearest elbow from which both legs run clear.
 *   3. Each relation label sits beside a clear stretch of its own line, from
 *      the middle outwards; or at the nearest clear spot with a thin leader back
 *      to the line, the leader clear of every label and dot too.
 *
 * A spot is clear when the label's box meets no concept label, no dot, no
 * relation label, no line and no leader, and stays inside the drawing. The
 * boxes are estimates of the text, generous on purpose (0.6 of the font size
 * per character), because the layout runs without a renderer.
 */

/** A box in the drawing's units, by its top-left corner. */
export interface LabelBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The type sizes of one drawing: the tab's map or the exported figure. */
export interface MapType {
  /** Relation label size. */
  readonly relation: number;
  /** Concept label size, the gap between its lines, and its first baseline below the dot's centre. */
  readonly concept: number;
  readonly conceptLine: number;
  readonly conceptFirst: number;
  /** The dot's radius, ring included. */
  readonly dot: number;
  /** Where a line starts and ends, from the centre of its dots (the end leaves room for the arrowhead). */
  readonly trimStart: number;
  readonly trimEnd: number;
}

/** The tab's map: 11px labels (`--text-micro`), a dot of 7 with a ring of 11. */
export const TAB_TYPE: MapType = { relation: 11, concept: 11, conceptLine: 12, conceptFirst: 20, dot: 11, trimStart: 9, trimEnd: 11 };
/** The exported figure: 12px relation labels, 13px concept labels, a dot of 9. */
export const FIGURE_TYPE: MapType = { relation: 12, concept: 13, conceptLine: 15, conceptFirst: 25, dot: 9, trimStart: 11, trimEnd: 14 };

const CHAR_EM = 0.6;
const ASCENT = 0.8;
const DESCENT = 0.25;
const PAD = 1;
/* Room kept between a line and a label, so a line never grazes the text. */
const LINE_CLEARANCE = 1.5;

/** The box of centred text: lines at `baseline`, `baseline + line`, and so on. */
export function textBox(cx: number, baseline: number, lines: readonly string[], size: number, line = size): LabelBox {
  const width = Math.max(0, ...lines.map((l) => l.length)) * size * CHAR_EM + 2 * PAD;
  const top = baseline - size * ASCENT - PAD;
  const bottom = baseline + (Math.max(1, lines.length) - 1) * line + size * DESCENT + PAD;
  return { x: cx - width / 2, y: top, width, height: bottom - top };
}

export function boxesMeet(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Where a concept's label sits against its dot (M82). */
export type LabelSide = "below" | "above" | "right" | "left";

const SIDES: readonly LabelSide[] = ["below", "above", "right", "left"];

/** How a label on `side` is drawn: its anchor, its offset across from the dot's centre, and its first baseline. */
export interface LabelPlace {
  readonly anchor: "middle" | "start" | "end";
  readonly dx: number;
  readonly first: number;
}

/**
 * The label's place against the dot (M82): below by `conceptFirst`; above, with
 * the last line's descent clear of the dot by three units; or beside the dot,
 * clear of it by four units, its lines centred on the dot's height.
 */
export function labelPlace(type: MapType, lines: number, side: LabelSide): LabelPlace {
  const n = Math.max(1, lines);
  switch (side) {
    case "below":
      return { anchor: "middle", dx: 0, first: type.conceptFirst };
    case "above":
      return { anchor: "middle", dx: 0, first: -(type.dot + 3 + type.concept * DESCENT + PAD) - (n - 1) * type.conceptLine };
    case "right":
    case "left": {
      const first = -((n - 1) * type.conceptLine) / 2 + type.concept * 0.35;
      return { anchor: side === "right" ? "start" : "end", dx: (side === "right" ? 1 : -1) * (type.dot + 4), first };
    }
  }
}

/** A concept's label box at `at`, on `side`. */
export function conceptLabelBox(at: { readonly x: number; readonly y: number }, lines: readonly string[], type: MapType, side: LabelSide): LabelBox {
  const place = labelPlace(type, lines.length, side);
  const centred = textBox(at.x + place.dx, at.y + place.first, lines, type.concept, type.conceptLine);
  if (place.anchor === "middle") return centred;
  return { ...centred, x: place.anchor === "start" ? at.x + place.dx : at.x + place.dx - centred.width };
}

const dotBox = (at: { readonly x: number; readonly y: number }, type: MapType): LabelBox => ({
  x: at.x - type.dot,
  y: at.y - type.dot,
  width: 2 * type.dot,
  height: 2 * type.dot,
});

/** A point in the drawing. */
export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Whether the segment p→q passes through the inside of `b` grown by `grow` (Liang-Barsky). */
export function segmentCrosses(p: Pt, q: Pt, b: LabelBox, grow = 0): boolean {
  const [x0, x1, y0, y1] = [b.x - grow, b.x + b.width + grow, b.y - grow, b.y + b.height + grow];
  const [dx, dy] = [q.x - p.x, q.y - p.y];
  let t0 = 0;
  let t1 = 1;
  for (const [pp, qq] of [
    [-dx, p.x - x0],
    [dx, x1 - p.x],
    [-dy, p.y - y0],
    [dy, y1 - p.y],
  ] as const) {
    if (Math.abs(pp) < 1e-9) {
      if (qq <= 0) return false;
      continue;
    }
    const r = qq / pp;
    if (pp < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 >= t1) return false;
  }
  return true;
}

/** Where one relation label goes: its baseline centre, its box, and a leader when it left the line. */
export interface PlacedLabel {
  readonly x: number;
  readonly y: number;
  readonly box: LabelBox;
  readonly leader: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } | null;
  /** Whether the spot meets nothing; false when the drawing had no clear spot left. */
  readonly clear: boolean;
}

/** The nearest point of a box to a point, for the leader's far end. */
function nearestOn(box: LabelBox, px: number, py: number): Pt {
  return { x: Math.min(Math.max(px, box.x), box.x + box.width), y: Math.min(Math.max(py, box.y), box.y + box.height) };
}

/** A relation as the drawing needs it: its ends and the words on its label. */
export interface MapRelation {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly text: string;
}

/** The drawing past the concept positions: label sides, routed lines and relation labels. */
export interface RoutedDrawing {
  /** The side of its dot that each concept's label sits on; below when absent. */
  readonly sides: ReadonlyMap<string, LabelSide>;
  /** Each relation's line as drawn: its trimmed start, an elbow when it bends, its trimmed end. */
  readonly routes: ReadonlyMap<string, readonly Pt[]>;
  readonly placed: ReadonlyMap<string, PlacedLabel>;
  /** Whether every label, line and leader came out clear. */
  readonly clear: boolean;
}

/** A line from dot centre `a` through `via` to dot centre `b`, trimmed at both dots. */
function trimmed(a: Pt, via: readonly Pt[], b: Pt, type: MapType): readonly Pt[] {
  const all = [a, ...via, b];
  const first = all[1]!;
  const last = all[all.length - 2]!;
  const away = (from: Pt, to: Pt, by: number): Pt => {
    const len = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y));
    return { x: from.x + ((to.x - from.x) / len) * by, y: from.y + ((to.y - from.y) / len) * by };
  };
  return [away(a, first, type.trimStart), ...via, away(b, last, type.trimEnd)];
}

const legs = (points: readonly Pt[]) => points.slice(1).map((q, i) => [points[i]!, q] as const);

export function routeDrawing(input: {
  readonly at: ReadonlyMap<string, Pt>;
  readonly concepts: readonly { readonly id: string; readonly lines: readonly string[] }[];
  readonly relations: readonly MapRelation[];
  readonly width: number;
  readonly height: number;
  readonly type: MapType;
}): RoutedDrawing {
  const { at, type, width, height } = input;
  const concepts = input.concepts.filter((c) => at.has(c.id));
  const relations = input.relations.filter((r) => at.has(r.from) && at.has(r.to) && r.from !== r.to);
  const inside = (b: LabelBox) => b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height;

  /* 1. Label sides. Each label takes the side that the straight lines from
     every relation cross least, below first on a tie, where the box is inside
     the drawing and meets no other concept's dot or label. */
  const sides = new Map<string, LabelSide>();
  const sideOf = (id: string) => sides.get(id) ?? "below";
  const linesOf = new Map(concepts.map((c) => [c.id, c.lines] as const));
  const labelOf = (id: string) => conceptLabelBox(at.get(id)!, linesOf.get(id)!, type, sideOf(id));
  const straight = relations.map((r) => trimmed(at.get(r.from)!, [], at.get(r.to)!, type));
  const crossings = (box: LabelBox) => straight.reduce((n, pts) => n + (segmentCrosses(pts[0]!, pts[1]!, box, LINE_CLEARANCE) ? 1 : 0), 0);
  for (let pass = 0; pass < 3; pass += 1) {
    for (const c of concepts) {
      const p = at.get(c.id)!;
      const options = SIDES.map((side, rank) => ({ side, rank, box: conceptLabelBox(p, c.lines, type, side) })).filter(
        (o) =>
          o.side === sideOf(c.id) ||
          (inside(o.box) && concepts.every((d) => d.id === c.id || (!boxesMeet(o.box, labelOf(d.id)) && !boxesMeet(o.box, dotBox(at.get(d.id)!, type))))),
      );
      const best = options.reduce((x, y) => {
        const [cx, cy] = [crossings(x.box), crossings(y.box)];
        return cy < cx || (cy === cx && y.rank < x.rank && y.side !== sideOf(c.id) && cx > 0) ? y : x;
      });
      if (best.side === "below") sides.delete(c.id);
      else sides.set(c.id, best.side);
    }
  }
  const labels = new Map(concepts.map((c) => [c.id, labelOf(c.id)] as const));
  const dots = new Map(concepts.map((c) => [c.id, dotBox(at.get(c.id)!, type)] as const));

  /* 2. Routes. A leg is clear when it meets no concept label (the two ends'
     included) and no dot but the two ends'. */
  const legClear = (p: Pt, q: Pt, ends: readonly string[]) =>
    [...labels.values()].every((b) => !segmentCrosses(p, q, b, LINE_CLEARANCE)) &&
    [...dots].every(([id, b]) => ends.includes(id) || !segmentCrosses(p, q, b, LINE_CLEARANCE));
  const routeClear = (pts: readonly Pt[], ends: readonly string[]) => legs(pts).every(([p, q]) => legClear(p, q, ends));
  const routes = new Map<string, readonly Pt[]>();
  let clear = true;
  for (const r of relations) {
    const a = at.get(r.from)!;
    const b = at.get(r.to)!;
    const ends = [r.from, r.to];
    const direct = trimmed(a, [], b, type);
    if (routeClear(direct, ends)) {
      routes.set(r.id, direct);
      continue;
    }
    const [dx, dy] = [b.x - a.x, b.y - a.y];
    const len = Math.max(1, Math.hypot(dx, dy));
    const [nx, ny] = [-dy / len, dx / len];
    const elbows: Pt[] = [{ x: a.x, y: b.y }, { x: b.x, y: a.y }];
    /* Elbows fanned out from each end too, so a line can leave a crowded dot
       sideways, clear of its label, before it turns for the other end. */
    for (const end of [a, b]) {
      for (let k = 0; k < 16; k += 1) {
        const angle = (k / 16) * 2 * Math.PI;
        for (const d of [18, 28, 40, 56, 76, 100]) elbows.push({ x: end.x + Math.cos(angle) * d, y: end.y + Math.sin(angle) * d });
      }
    }
    for (const t of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      for (const d of [8, 14, 20, 28, 38, 50, 64, 80, 100, 124, 150]) {
        for (const side of [1, -1]) elbows.push({ x: a.x + dx * t + nx * d * side, y: a.y + dy * t + ny * d * side });
      }
    }
    const length = (e: Pt) => Math.hypot(e.x - a.x, e.y - a.y) + Math.hypot(b.x - e.x, b.y - e.y);
    const found = elbows
      .filter((e) => e.x >= 2 && e.y >= 2 && e.x <= width - 2 && e.y <= height - 2)
      .sort((p, q) => length(p) - length(q))
      .map((e) => trimmed(a, [e], b, type))
      .find((pts) => routeClear(pts, ends));
    if (found === undefined) clear = false;
    routes.set(r.id, found ?? direct);
  }

  /* 3. Relation labels. */
  const taken: LabelBox[] = [...labels.values(), ...dots.values()];
  const lines = [...routes.values()].flatMap(legs);
  const leaders: (readonly [Pt, Pt])[] = [];
  const free = (box: LabelBox) =>
    inside(box) &&
    taken.every((o) => !boxesMeet(box, o)) &&
    lines.every(([p, q]) => !segmentCrosses(p, q, box, LINE_CLEARANCE)) &&
    leaders.every(([p, q]) => !segmentCrosses(p, q, box, LINE_CLEARANCE));
  const leaderFree = (p: Pt, q: Pt) => taken.every((o) => !segmentCrosses(p, q, o, LINE_CLEARANCE));
  const overlap = (b: LabelBox) =>
    taken.reduce((sum, o) => {
      const w = Math.min(b.x + b.width, o.x + o.width) - Math.max(b.x, o.x);
      const h = Math.min(b.y + b.height, o.y + o.height) - Math.max(b.y, o.y);
      return sum + (w > 0 && h > 0 ? w * h : 0);
    }, 0);
  const placed = new Map<string, PlacedLabel>();
  for (const r of relations) {
    const route = routes.get(r.id)!;
    const size = type.relation;
    /* The middle of the line as drawn: the middle of its longer leg. */
    const longest = legs(route).reduce((best, l) =>
      Math.hypot(l[1].x - l[0].x, l[1].y - l[0].y) > Math.hypot(best[1].x - best[0].x, best[1].y - best[0].y) ? l : best,
    );
    const mid = { x: (longest[0].x + longest[1].x) / 2, y: (longest[0].y + longest[1].y) / 2 };
    /* A label's centre, as a spot: the baseline sits a third of the size below it. */
    const spot = (cx: number, cy: number, leader: boolean): PlacedLabel => {
      const box = textBox(cx, cy + size * 0.3, [r.text], size);
      const end = nearestOn(box, mid.x, mid.y);
      return { x: cx, y: cy + size * 0.3, box, leader: leader ? { x1: mid.x, y1: mid.y, x2: end.x, y2: end.y } : null, clear: false };
    };
    const ok = (c: PlacedLabel) =>
      free(c.box) && (c.leader === null || leaderFree({ x: c.leader.x1, y: c.leader.y1 }, { x: c.leader.x2, y: c.leader.y2 }));
    const candidates: PlacedLabel[] = [];
    for (const [p, q] of [longest, ...legs(route).filter((l) => l !== longest)]) {
      const [dx, dy] = [q.x - p.x, q.y - p.y];
      const len = Math.max(1, Math.hypot(dx, dy));
      const [nx, ny] = [-dy / len, dx / len];
      for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]) {
        for (const lift of [0.85, 1.3]) {
          for (const side of [1, -1]) candidates.push(spot(p.x + dx * t + nx * lift * size * side, p.y + dy * t + ny * lift * size * side, false));
        }
      }
    }
    for (const radius of [16, 24, 32, 42, 54, 68, 84, 102, 124]) {
      for (let k = 0; k < 24; k += 1) {
        const angle = (k / 24) * 2 * Math.PI;
        candidates.push(spot(mid.x + Math.cos(angle) * radius * 1.6, mid.y + Math.sin(angle) * radius, true));
      }
    }
    let found = candidates.find(ok);
    /* Last, any clear spot in the drawing, the nearest to the line's middle first,
       so the leader is as short as the drawing allows. */
    if (found === undefined) {
      const grid: { cx: number; cy: number; d: number }[] = [];
      for (let cy = size; cy <= height - size; cy += 4) {
        for (let cx = 0; cx <= width; cx += 4) grid.push({ cx, cy, d: Math.hypot(cx - mid.x, cy - mid.y) });
      }
      for (const g of grid.sort((p, q) => p.d - q.d)) {
        const c = spot(g.cx, g.cy, true);
        if (ok(c)) {
          found = c;
          break;
        }
      }
    }
    /* A label with no clear spot anywhere takes the spot that overlaps least, so it is drawn rather than dropped. */
    const chosen =
      found ??
      candidates.filter((c) => inside(c.box)).reduce<PlacedLabel | undefined>((best, c) => (best === undefined || overlap(c.box) < overlap(best.box) ? c : best), undefined) ??
      spot(mid.x, mid.y - size * 0.4, false);
    if (found === undefined) clear = false;
    placed.set(r.id, found === undefined ? chosen : { ...found, clear: true });
    taken.push(chosen.box);
    if (chosen.leader !== null) leaders.push([{ x: chosen.leader.x1, y: chosen.leader.y1 }, { x: chosen.leader.x2, y: chosen.leader.y2 }]);
  }
  return { sides, routes, placed, clear };
}
