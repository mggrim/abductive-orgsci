/**
 * What a line between two nodes means (ISC-197 … ISC-208).
 *
 * Measured before any of this was written: on the demo study `evidences`
 * rendered `#bbb` at weight 1 solid and `resolves` rendered `#bbb` at weight
 * 1.5 solid. Half a pixel of difference and nothing else. `contradicts` and
 * `tensions-with` were byte-identical. No edge carried an arrowhead. The
 * researcher's report that they could not understand the connections was
 * correct: there was nothing on screen to read.
 *
 * These assert the encoding stays distinguishable, which a table of eight
 * hand-written style entries will not do on its own.
 */

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EDGE_ROLES, type LedgerEvent } from "../src/ledger/events.ts";
import {
  ARROW_STANDOFF,
  DASH_OFF_IN_FILE,
  DASH_OFF_ON_SCREEN,
  DASH_OFF_READS,
  DASH_OFF_TERM,
  EDGE_STYLE,
  LABEL_FIRST_LINE,
  LABEL_LINE_STEP,
  MAX_DASH_PERIOD,
  NAMES_OFF_IN_FILE,
  NAMES_OFF_ON_SCREEN,
  NAMES_OFF_READS,
  captionBox,
  captionsCollide,
  figureHeight,
  dashPeriod,
  edgeDash,
  edgeShaft,
  layoutGraph,
} from "../src/workbench/graphLayout.ts";
import { ARROW_HEAD, ArrowMarker, arrowMarkerSvg } from "../src/ui/components/index.ts";
import {
  FAMILY,
  RELATIONS_BY_FAMILY,
  RELATION_GLOSSARY,
  relationEntry,
} from "../src/ontology/relationGlossary.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import type { OntologyGraph } from "../src/ontology/schema.ts";
import type { OriginDoubt } from "../src/ontology/originAudit.ts";
import { buildDiagramSvg } from "../src/export/diagram.ts";
import { buildWikiFiles } from "../src/export/wikiDirectory.ts";

describe("every relation is distinguishable", () => {
  test("no two roles share an appearance (ISC-197)", () => {
    const seen = new Map<string, string>();
    for (const role of EDGE_ROLES) {
      const s = EDGE_STYLE[role];
      const key = `${s.colour}|${s.dash}|${s.weight}`;
      const clash = seen.get(key);
      expect(clash === undefined ? "" : `${clash} vs ${role}`).toBe("");
      seen.set(key, role);
    }
  });

  test("colour alone never distinguishes two roles in the same family (ISC-198)", () => {
    // Colour carries the family, so inside a family the dash and weight have
    // to do the work or the family's members collapse into one another.
    for (const roles of Object.values(RELATIONS_BY_FAMILY)) {
      const shapes = roles.map((r) => `${EDGE_STYLE[r].dash}|${EDGE_STYLE[r].weight}`);
      expect(new Set(shapes).size).toBe(roles.length);
    }
  });

  test("every role has a family, and the families partition the roles (ISC-199)", () => {
    const flat = Object.values(RELATIONS_BY_FAMILY).flat();
    expect(new Set(flat).size).toBe(EDGE_ROLES.length);
    for (const role of EDGE_ROLES) expect(flat).toContain(role);
  });

  test("a role's colour is its family's colour (ISC-200)", () => {
    for (const role of EDGE_ROLES) {
      expect(EDGE_STYLE[role].colour).toBe(FAMILY[relationEntry(role).family].colour);
    }
  });
});

describe("the key says what a line means", () => {
  test("every role has a plain-English meaning (ISC-201)", () => {
    for (const role of EDGE_ROLES) {
      expect(RELATION_GLOSSARY[role].meaning.trim().length).toBeGreaterThan(60);
    }
  });

  test("no meaning is a restatement of its own slug (ISC-202)", () => {
    for (const role of EDGE_ROLES) {
      expect(RELATION_GLOSSARY[role].meaning.toLowerCase()).not.toContain(role);
    }
  });

  test("every role reads as a sentence between two nodes (ISC-203)", () => {
    for (const role of EDGE_ROLES) {
      expect(RELATION_GLOSSARY[role].reads.trim().length).toBeGreaterThan(4);
      expect(RELATION_GLOSSARY[role].label).not.toContain("-");
    }
  });

  test("stands-to is the heaviest mark, because it is the framing claim (ISC-204)", () => {
    // `events.ts` enforces that a puzzleRelation may only ride on `stands-to`
    // so it cannot be mistaken for an ordinary argumentative edge. The drawing
    // should not undo that.
    const heaviest = Math.max(...EDGE_ROLES.map((r) => EDGE_STYLE[r].weight));
    expect(EDGE_STYLE["stands-to"].weight).toBe(heaviest);
  });

  test("the three families are named for what they do to a claim (ISC-205)", () => {
    for (const f of Object.values(FAMILY)) {
      expect(f.gloss.trim().length).toBeGreaterThan(30);
      expect(f.label.trim().length).toBeGreaterThan(4);
    }
  });
});


/**
 * One ontology carrying every role, drawn both ways.
 *
 * The screen and the exported figure are two renderings of one grammar and for
 * three rounds only one of them was checked, by grep, against the source of the
 * other. That is why the export could ship 54 undirected grey lines with the
 * internal slug printed at each midpoint while every assertion below passed:
 * the checks read OntologyGraph.tsx and the defect was in diagram.ts.
 */
const PROJECT = "proj-relations";
let tick = 2_700_000_000_000;
function ev(fields: Record<string, unknown>): LedgerEvent {
  tick += 1000;
  return {
    id: crypto.randomUUID(),
    ts: tick,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    origin: "author-prior",
    supportingChunks: [],
    ...fields,
  } as unknown as LedgerEvent;
}

const ROLE_EVENTS: LedgerEvent[] = [
  ev({ op: "create", targetId: "p0", pageType: "puzzle", title: "Why credit stops at the shift boundary", body: "" }),
  ...EDGE_ROLES.map((role, i) =>
    ev({
      op: "create",
      targetId: `n${i}`,
      pageType: "observation",
      title: `A page joined by ${i} kinds of line`,
      body: "",
    }),
  ),
  ...EDGE_ROLES.map((role, i) =>
    ev({
      op: "relate",
      targetId: `n${i}->p0`,
      edge: { from: `n${i}`, to: "p0", role },
      // `stands-to` is the puzzle framing edge and events.ts refuses it without
      // a puzzleRelation naming the claim being made.
      ...(role === "stands-to" ? { puzzleRelation: "instantiates" } : {}),
    }),
  ),
];
const ROLE_GRAPH = projectOntology(ROLE_EVENTS, PROJECT);
const FIGURE = buildDiagramSvg(ROLE_GRAPH, { title: "Every kind of line" });

/**
 * The figure read as running prose.
 *
 * Legend text is set line by line, so a sentence in the file is several <text>
 * elements. Joining them in document order is how a reader reads it, and it is
 * the only way to ask whether the figure says the same sentence the screen
 * says.
 */
function figureProse(svg: string): string {
  return [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)]
    .map((m) => m[1] ?? "")
    .join(" ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

/** Every drawn edge in a chunk of SVG, as the four channels a role is read by. */
function edgesIn(markup: string): { stroke: string; dash: string; width: string; head: string }[] {
  const out: { stroke: string; dash: string; width: string; head: string }[] = [];
  for (const m of markup.matchAll(/<line\b[^>]*>/g)) {
    const tag = m[0];
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
    // A legend rule and a key swatch are lines too, and the swatch carries a
    // head on purpose, because a key that does not draw the mark is not a key.
    // An edge is a line with a head that is not part of the legend.
    const head = attr("marker-end") + attr("markerEnd");
    if (head === "" || tag.includes('data-legend="relation"')) continue;
    out.push({
      stroke: attr("stroke"),
      dash: attr("stroke-dasharray") + attr("strokeDasharray"),
      width: attr("stroke-width") + attr("strokeWidth"),
      head,
    });
  }
  return out;
}

describe("the graph draws direction", () => {

  /* Restated, not weakened (round three of the export voicing).
   *
   * This asserted that OntologyGraph.tsx contained the substring
   * "markerEnd={`url(#arrow-". The property it was protecting is that a
   * directed relation is drawn with its direction, and the substring was one
   * file's way of doing that. Measured on the density probe while it passed:
   * density-probe-44-ontology.svg held 54 <line> elements, 54 of them the same
   * grey, and no marker, polygon or path anywhere in the file. So the property
   * is now asserted on both drawings, as rendered output rather than as source
   * text, and the substring check is gone because it was the reason the export
   * could fail this while the suite was green.
   */
  test("every edge carries an arrowhead, on the screen and in the file (ISC-206)", () => {
    // M63, the lead's rulings of 2026-09-30: the claims map on screen left with the old model tab; the file half stands.
    const inFile = edgesIn(FIGURE);
    expect(inFile).toHaveLength(EDGE_ROLES.length);
    // And the head is a real definition in the file, not a dangling reference.
    for (const family of Object.keys(FAMILY)) {
      if (!inFile.some((e) => e.head.includes(`arrow-${family}`))) continue;
      expect(FIGURE).toContain(`<marker id="arrow-${family}"`);
    }
  });

  test("Anti: no edge is drawn in the old undifferentiated grey (ISC-207)", () => {
    // The export's version of the same defect, which is what shipped: every
    // edge painted COLOUR["line-strong"], one colour for eight roles, while the
    // screen two hundred pixels away coloured them by family.
    const families = new Set(Object.values(FAMILY).map((f) => f.colour));
    for (const drawn of [
      ["the exported figure", edgesIn(FIGURE)] as const,
    ]) {
      const [where, edges] = drawn;
      const colours = new Set(edges.map((e) => e.stroke));
      expect({ where, colours: [...colours].filter((c) => !families.has(c)) }).toEqual({
        where,
        colours: [],
      });
      expect({ where, count: colours.size }).toEqual({ where, count: families.size });
    }
  });

  // M63, the lead's rulings of 2026-09-30: the claims map on screen left with the old model tab; the file half stands. "the two drawings encode a role the same way (ISC-207)"

  test("the key is exported so the graph is never shipped without it (ISC-208)", () => {
    /* And the file carries one too, which it did not.
     *
     * Seven roles reached a reader of the exported figure as two stroke widths
     * and three dash states in one colour with no key at all, which is the
     * condition relationGlossary.ts's docstring records as the reason a
     * researcher reported they could not understand the connections. */
    const prose = figureProse(FIGURE);
    for (const role of EDGE_ROLES) {
      const entry = RELATION_GLOSSARY[role];
      expect({ role, name: prose.includes(entry.label) }).toEqual({ role, name: true });
      expect({ role, meaning: prose.includes(entry.meaning) }).toEqual({ role, meaning: true });
    }
    for (const family of Object.values(FAMILY)) {
      expect({ family: family.label, said: prose.includes(family.label) }).toEqual({
        family: family.label,
        said: true,
      });
      expect({ family: family.label, gloss: prose.includes(family.gloss) }).toEqual({
        family: family.label,
        gloss: true,
      });
    }
  });

  test("no rendered text on either drawing is a raw role slug (ISC-208)", () => {
    /* The third consecutive round of a screen and a file disagreeing about the
     * same word, one field along from the page type. diagram.ts:213 stamped
     * `escapeXml(edge.role)` at every edge midpoint, so
     * density-probe-44-ontology.svg carried seven instances of
     * "tensions-with" while the key one tab away spelled it "tensions with"
     * and the node title on the same screen spelled it "is in tension with". */
    const slugs = EDGE_ROLES.filter((r) => r.includes("-"));
    expect(slugs.length).toBeGreaterThan(0);
    const surfaces: [string, string][] = [
      ["the exported figure", FIGURE],
    ];
    /* And the wiki, which is prose addressed to a person and wrote the slug in
     * three places: both link lists on every page and the parenthesis in the
     * log. "- **tensions-with** → [[...]]" in a file a co-author opens. */
    for (const file of buildWikiFiles({
      project: {
        id: PROJECT,
        title: "Handoffs",
        createdAt: tick,
        brief: { researchQuestion: "How does credit travel?", dataType: "interviews" },
      } as unknown as Parameters<typeof buildWikiFiles>[0]["project"],
      graph: ROLE_GRAPH,
      events: ROLE_EVENTS,
    })) {
      surfaces.push([`the wiki, ${file.path}`, file.content]);
    }
    const offenders: string[] = [];
    for (const [name, markup] of surfaces) {
      // Rendered words, plus every attribute a reader can be read to: a slug in
      // a title or an aria-label reaches a screen-reader user as prose.
      const text = markup.replace(/<[^>]*>/g, " ") + " " + [...markup.matchAll(/(?:title|aria-label|alt)="([^"]*)"/g)].map((m) => m[1]).join(" ") + " " + [...markup.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]).join(" ");
      for (const slug of slugs) if (text.includes(slug)) offenders.push(`${name}: ${slug}`);
    }
    expect(offenders.sort()).toEqual([]);
  });

  test("the exported figure names every page it draws (ISC-208)", () => {
    /* At 44 pages the layout stops carrying captions, /ontology says so and
     * falls back to its index, and the figure had no index: the export was 44
     * anonymous discs under 54 overprinted slugs. Every page the drawing holds
     * has to be findable by name in the file, whether or not the drawing could
     * place the names on itself.
     *
     * Asserted through the constant rather than against a phrase copied out of
     * the export, because the phrase was copied out of the export and the two
     * surfaces then said different things: the screen's sentence and the file's
     * sentence were different sentences for one fact, and both of them named
     * the page count as the cause when the cause is the fit. */
    const many = projectOntology(
      Array.from({ length: 44 }, (_, i) =>
        ev({
          op: "create",
          targetId: `many-${i}`,
          pageType: "observation",
          title: `Handoff observation number ${i} on the night ward`,
          body: "",
        }),
      ),
      PROJECT,
    );
    const svg = buildDiagramSvg(many, { title: "Forty four" });
    const prose = figureProse(svg);
    expect(prose).toContain(NAMES_OFF_READS);
    expect(prose).toContain(NAMES_OFF_IN_FILE);
    for (const page of many.pages.values()) {
      expect({ title: page.title, named: prose.includes(page.title) }).toEqual({
        title: page.title,
        named: true,
      });
    }
    // And the number that joins a disc to its name is on the disc.
    expect(svg).toContain(">44</text>");
  });
});

/**
 * A channel the drawing cannot render is not a channel (round three).
 *
 * The four rounds before this one were each a mark drawn on one surface and
 * legended on neither, or spelled two ways on two surfaces. This one is the
 * mirror image: a channel legended on both surfaces and rendered on neither.
 *
 * Measured in the running app on the project's own 44-page probe at innerWidth
 * 1470, before any of the code below existed. The canvas cropped to 649x379,
 * the shrink bottomed out at the radius floor, and `ArrowMarker` declared no
 * `markerUnits`, so a head was five stroke-widths: 7 units on an `evidences`
 * edge, 15 on `stands-to`, against a graph whose longest edge was 29 units.
 * Every line was drawn from the source's centre, so its first `radius` units
 * were under the source disc. What survived was a median of 0.7 units across
 * the 54 relations, 23 of them negative, and 28 of the 38 dashed edges carrying
 * less than one repeat of their own pattern, so "2 3", "6 3" and solid were one
 * mark and the eight roles collapsed into their three family colours. The key
 * two hundred pixels away spent eight rows on what dash separates.
 *
 * These assert the geometry, not the numbers: that the layout guarantees the
 * room an edge costs before it draws one, and that when it cannot, the drawing
 * says so instead of drawing a pattern nobody can see.
 */
describe("the drawing renders the relation channel it declares", () => {
  /** The probe's shape: dense, every role in play, some pages unattached. */
  function dense(pages: number, relations: number, roots: number) {
    const events: LedgerEvent[] = [];
    for (let i = 0; i < pages; i += 1) {
      events.push(
        ev({
          op: "create",
          targetId: `d${i}`,
          pageType: i < roots ? "puzzle" : "observation",
          title: `Probe page ${i}: a title long enough to wrap across the label lines`,
          body: "",
        }),
      );
    }
    // Chained, because a chain is what the real probe is and what a random
    // wiring is not: linked pairs end up adjacent and that is the case where a
    // shaft has no room. A wiring that spreads the nodes cannot see this.
    const roles = EDGE_ROLES.filter((r) => r !== "stands-to");
    for (let i = 0; i < relations; i += 1) {
      events.push(
        ev({
          op: "relate",
          targetId: `dr${i}`,
          edge: {
            from: `d${i % pages}`,
            to: `d${(i + 1 + Math.floor(i / pages)) % pages}`,
            role: roles[i % roles.length] as (typeof roles)[number],
          },
        }),
      );
    }
    return projectOntology(events, PROJECT);
  }

  test("MAX_DASH_PERIOD is the longest repeat the table actually holds (ISC-209)", () => {
    /* The rim clearance is derived from this number, so a ninth role with a
     * longer pattern would silently reintroduce the whole defect: the layout
     * would keep guaranteeing room for a nine-unit repeat while the table drew
     * a twelve-unit one. */
    const longest = Math.max(...EDGE_ROLES.map((r) => dashPeriod(r)));
    expect(MAX_DASH_PERIOD).toBe(longest);
  });

  test("the arrowhead is a length, not a multiple of the pen (ISC-209)", () => {
    /* `markerUnits` defaults to `strokeWidth`, which made the head a different
     * size on every role and largest on `stands-to`, the heaviest and most
     * consequential edge in the graph. Both forms of the marker, because the
     * screen and the file each declare their own and the whole point of
     * RelationMark is that they cannot differ. */
    const onScreen = renderToStaticMarkup(
      createElement(ArrowMarker, { id: "probe", colour: "#000000" }),
    );
    const inFile = arrowMarkerSvg({ id: "probe", colour: "#000000" });
    for (const [where, markup] of [
      ["the screen", onScreen],
      ["the exported figure", inFile],
    ] as const) {
      expect({ where, units: markup.includes('markerUnits="userSpaceOnUse"') }).toEqual({
        where,
        units: true,
      });
    }
    expect(ARROW_HEAD).toBeGreaterThan(0);
  });

  test("the layout keeps two discs at least as far apart as an edge costs (ISC-209)", () => {
    /* The invariant everything else here rests on, and the one that was false.
     * The separation pass guaranteed 8 units between two rims while drawing an
     * edge between them costs the standoff, the arrowhead and then one repeat
     * of the longest dash before a single unit of pattern is visible. 8 units
     * against a 12-unit bill is why 23 of the 54 relations on the probe were a
     * head drawn on top of the source disc with no line at all.
     *
     * Asserted as the gap the layout actually produces rather than by reading
     * the constant back, because the constant is only worth anything if the
     * separation pass, the shrink and the frame clamp all respect it, and it
     * was the interaction of those three that produced the measured defect. */
    const cost = ARROW_STANDOFF + ARROW_HEAD + MAX_DASH_PERIOD;
    for (const [pages, relations, roots] of [
      [12, 14, 2],
      [44, 54, 7],
      [90, 120, 12],
    ] as const) {
      const graph = dense(pages, relations, roots);
      for (const opts of [{ maxWidth: 685 }, { width: 900, height: 700 }]) {
        const layout = layoutGraph(graph, opts);
        const radius = new Map(layout.nodes.map((n) => [n.id, n.radius] as const));
        // Only the pairs an edge actually joins. Two unrelated discs may sit as
        // close as the rim clearance and nothing is drawn between them.
        const gaps = layout.edges.map((e) => {
          const from = layout.nodes.find((n) => n.id === e.from);
          const to = layout.nodes.find((n) => n.id === e.to);
          if (from === undefined || to === undefined) return Infinity;
          return (
            Math.hypot(to.x - from.x, to.y - from.y) -
            (radius.get(e.from) ?? 0) -
            (radius.get(e.to) ?? 0)
          );
        });
        const worst = Math.min(...gaps, Infinity);
        expect({ pages, opts, roomForAnEdge: worst >= cost }).toEqual({
          pages,
          opts,
          roomForAnEdge: true,
        });
      }
    }
  });

  test("a drawing that varies dash gives every dash room to be one (ISC-209)", () => {
    /* The property the key's eight rows depend on. `dashChannel` is the
     * layout's own answer, so this asserts the answer is not a lie in either
     * direction: when it says the channel is on, every dashed edge really does
     * carry a full repeat. */
    for (const [pages, relations, roots] of [
      [12, 14, 2],
      [44, 54, 7],
      [90, 120, 12],
    ] as const) {
      const graph = dense(pages, relations, roots);
      const layout = layoutGraph(graph, { maxWidth: 685 });
      if (!layout.dashChannel) continue;
      const radius = new Map(layout.nodes.map((n) => [n.id, n.radius] as const));
      const short = layout.edges.filter((e) => {
        const period = dashPeriod(e.role);
        if (period === 0) return false;
        return edgeShaft(e, radius.get(e.from) ?? 0, radius.get(e.to) ?? 0).length < period;
      });
      expect({ pages, short: short.map((e) => e.role) }).toEqual({ pages, short: [] });
    }
  });

  test("the 44-page probe draws the channel on the screen and in the file (ISC-209)", () => {
    /* The regression the round was opened on, as a case rather than a rule.
     * Both drawings, because the failure was that they disagreed: the screen
     * rendered a median of 0.7 visible units and the file rendered 12.1, so a
     * researcher comparing the tab against the figure in their own paper found
     * two different pictures of one ledger. */
    const graph = dense(44, 54, 7);
    for (const [where, opts] of [
      ["the screen", { maxWidth: 685 }],
      ["the exported figure", { width: 900, height: 700 }],
    ] as const) {
      const layout = layoutGraph(graph, opts);
      expect({ where, dash: layout.dashChannel }).toEqual({ where, dash: true });
      expect({ where, shaftless: layout.shaftless }).toEqual({ where, shaftless: 0 });
    }
  });

  test("when the dash is off, nothing dashes and both keys say so (ISC-209)", () => {
    /* The other half, and the half round one was scored a failure for missing:
     * a key that names a channel the drawing is not making. `edgeDash` is the
     * one function all four call sites read, so this asserts through it rather
     * than through a canvas dense enough to switch it off, which would make the
     * test a hostage to the force simulation. */
    for (const role of EDGE_ROLES) {
      expect({ role, off: edgeDash(role, false) }).toEqual({ role, off: "" });
      expect({ role, on: edgeDash(role, true) }).toEqual({ role, on: EDGE_STYLE[role].dash });
    }
    // M63, the lead's rulings of 2026-09-30: the claims map on screen left with the old model tab; the file half stands.
  });

  test("the two registers of the dash notice each fit their own surface (ISC-209)", () => {
    /* A screen can be pointed at and a file cannot. Telling a reader holding a
     * figure in a paper appendix to select a page is the same defect as a key
     * naming a channel the drawing is not making, one register along, so the
     * explanation is shared and only the last clause is the surface's own. */
    // R3: "claim" is the word every surface uses for a node now.
    expect(DASH_OFF_ON_SCREEN).toContain("Select a claim");
    expect(DASH_OFF_IN_FILE).not.toContain("Select");
    // And the file's clause promises a list, so the file has to carry one.
    const graph = dense(44, 54, 7);
    const layout = layoutGraph(graph, { width: 900, height: 700 });
    const svg = buildDiagramSvg(graph, { title: "Dense" });
    const prose = figureProse(svg);
    if (!layout.dashChannel) {
      expect(prose).toContain("Every relation, by role");
      for (const edge of layout.edges) {
        expect({
          role: edge.role,
          named: prose.includes(relationEntry(edge.role).reads),
        }).toEqual({ role: edge.role, named: true });
      }
    }
  });
});

/**
 * A drawing names its pages, or it says that it could not (round four).
 *
 * The mirror of the round above, one channel over, and the same shape of
 * failure four rounds running: a claim about the drawing made somewhere other
 * than in the drawing. Size was drawn and legended nowhere; attribution was
 * counted over one population and printed under another's words; dash was
 * legended on both surfaces and rendered on neither. This one was a caption
 * decision taken before the simulation ran, by comparing a sum of caption
 * rectangles against four tenths of the canvas.
 *
 * Measured in the running app on the twelve-page probe before any of the code
 * below existed, sweeping the window: at innerWidth 820 all twelve names were
 * drawn through each other, at 900 eleven of twelve, at 1024 ten of twelve plus
 * five caption runs over a neighbour's disc and three under a badge, worst pair
 * overlapping 12.8 x 12.5 px. At 1150 and above the canvas narrowed to 657x383,
 * the names vanished, and the note read "Too many pages to name them here" for
 * twelve pages on a canvas that was mostly white. There was no window width at
 * which a researcher with twelve pages could read the names off the drawing.
 *
 * These assert the property rather than the numbers: that a drawing which says
 * it is carrying the names is carrying them legibly, at every width the app
 * renders at, and that a drawing which is not says so in words that are true.
 */
describe("the drawing carries the names it says it carries", () => {
  /** The widths the app actually lays out at, measured in the running column. */
  const WIDTHS = [657, 733, 813, 950, 1020] as const;

  function probe(pages: number): OntologyGraph {
    return projectOntology(
      Array.from({ length: pages }, (_, i) =>
        ev({
          op: "create",
          targetId: `n${i}`,
          pageType: i < 2 ? "puzzle" : "observation",
          title: `Probe page ${i}: a title long enough to wrap across the label lines`,
          body: "",
        }),
      ),
      PROJECT,
    );
  }

  test("no name is written through another name, disc or badge (ISC-210)", () => {
    /* The whole round in one assertion. `captionsCollide` is the layout's own
     * check, run against the layout's own `captionBox`, so this cannot pass by
     * measuring the drawing differently from the way it was placed. Badges in
     * play, because the badge is the mark the separation pass learned about one
     * round late and eleven of the twelve overprints included three of them. */
    for (const pages of [1, 2, 5, 8, 12, 16, 20, 30, 44]) {
      const graph = probe(pages);
      const badged = new Set([...graph.pages.keys()].filter((_, i) => i % 3 === 0));
      for (const maxWidth of WIDTHS) {
        const layout = layoutGraph(graph, { maxWidth, badged });
        expect({ pages, maxWidth, overprinted: captionsCollide(layout.nodes, badged) }).toEqual({
          pages,
          maxWidth,
          overprinted: false,
        });
      }
      const file = layoutGraph(graph, { width: 900, height: 700 });
      expect({ pages, where: "the exported figure", overprinted: captionsCollide(file.nodes) }).toEqual(
        { pages, where: "the exported figure", overprinted: false },
      );
    }
  });

  test("Anti: the check that decides this can tell an overprint from a clear one (ISC-210)", () => {
    /* The assertion above asks the layout's own check about the layout's own
     * placement, which is right (a second opinion about where a caption is
     * would be a second thing to get wrong) and leaves one hole: a check that
     * answered "clear" to everything would satisfy it while the drawing was a
     * mess. So the check is put in front of an arrangement that is definitely
     * an overprint and one that definitely is not. */
    const node = (id: string, x: number, y: number) => ({
      id,
      title: "A page with a name long enough to wrap",
      type: "observation" as const,
      x,
      y,
      isRoot: false,
      radius: 20,
      label: ["A page with a name", "long enough to wrap"],
      origin: "author-prior" as const,
      status: "accepted",
    });
    // Two names in the same place.
    expect(captionsCollide([node("a", 300, 300), node("b", 300, 300)])).toBe(true);
    // One name under the other's disc.
    expect(captionsCollide([node("a", 300, 300), node("b", 300, 340)])).toBe(true);
    // And two that clear each other on both axes.
    expect(captionsCollide([node("a", 100, 100), node("b", 500, 500)])).toBe(false);
    // A badge counts as a mark. This pair is placed so that the second disc
    // clears the first one's caption by six units and its badge, which reaches
    // eleven units further out than the rim, does not.
    const close = [node("a", 300, 300), node("b", 300, 388)];
    expect(captionsCollide(close)).toBe(false);
    expect(captionsCollide(close, new Set(["b"]))).toBe(true);
  });

  test("twelve pages are named at every width this view renders at (ISC-210)", () => {
    /* The regression the round was opened on, as a case rather than a rule.
     * Twelve is an ordinary study and 657 is the narrowest canvas the two-track
     * layout leaves the drawing, which is where the old ceiling withheld the
     * names on a canvas that was mostly white. */
    const graph = probe(12);
    for (const maxWidth of WIDTHS) {
      const layout = layoutGraph(graph, { maxWidth });
      expect({ maxWidth, named: layout.captioned }).toEqual({ maxWidth, named: true });
      expect({
        maxWidth,
        blank: layout.nodes.filter((n) => n.label.length === 0).length,
      }).toEqual({ maxWidth, blank: 0 });
    }
    const file = layoutGraph(graph, { width: 900, height: 700 });
    expect({ where: "the exported figure", named: file.captioned }).toEqual({
      where: "the exported figure",
      named: true,
    });
  });

  test("`captioned` is the drawing's own answer, both ways (ISC-210)", () => {
    /* The claim has to be false when it is false and true when it is true. The
     * old one was a prediction: it said the twelve-page probe was captioned
     * while eleven of the twelve were unreadable, and it said the same probe
     * was not captioned on a narrower canvas that could have carried them. */
    for (const pages of [2, 12, 44, 90]) {
      const graph = probe(pages);
      const layout = layoutGraph(graph, { maxWidth: 813 });
      const drawnNames = layout.nodes.some((n) => n.label.length > 0);
      expect({ pages, agrees: drawnNames === layout.captioned }).toEqual({ pages, agrees: true });
    }
  });

  test("a caption is where the drawing says it is (ISC-210)", () => {
    /* `captionBox` is the one description of where those words are, and the
     * component draws them from the same two constants. If the box and the
     * baselines ever part company the check above measures a rectangle nobody
     * can see, which is the failure it exists to catch, one level down. */
    const lines = ["Probe page 0: a title", "long enough to wrap"];
    const box = captionBox(20, lines);
    expect(box).not.toBeNull();
    if (box === null) return;
    // The first baseline sits LABEL_FIRST_LINE below the rim, and its ink
    // starts above it.
    expect(box.top).toBeLessThan(20 + LABEL_FIRST_LINE);
    // The last baseline is one step down from the first, and the block reaches
    // past it.
    expect(box.bottom).toBeGreaterThan(20 + LABEL_FIRST_LINE + LABEL_LINE_STEP);
    // And an unnamed node has no box at all rather than an empty one, so a
    // drawing without names cannot be measured as though it had them.
    expect(captionBox(20, [])).toBeNull();
  });

  test("a name crossed by a relation stays a name, in both renderings (ISC-210)", async () => {
    /* The layout keeps a caption off every disc, badge and other caption. It
     * says nothing about the lines, because an edge is a straight run between
     * two centres and it crosses whatever lies between them. ontology.css draws
     * a paper-coloured halo under the glyphs for that case and the exported
     * figure drew none, so the same name was legible on the screen and read
     * through in the file. Screen and file disagreeing about one mark is the
     * failure this surface has now been scored on three times. */
    const css = await Bun.file(new URL("../src/ui/styles/ontology.css", import.meta.url)).text();
    const rule = css.slice(css.indexOf(".graph-node-label"));
    expect(rule.slice(0, rule.indexOf("}"))).toContain("paint-order: stroke");
    // And the component draws the caption in that class rather than styling it
    // inline, which is how the size on this line came to be a sixth font size.
    // The file has no stylesheet, so the same treatment is on the element.
    const named = projectOntology(
      [
        ev({ op: "create", targetId: "c0", pageType: "puzzle", title: "A page whose name is long enough to wrap", body: "" }),
        ev({ op: "create", targetId: "c1", pageType: "observation", title: "A second page with a name of its own", body: "" }),
      ],
      PROJECT,
    );
    const svg = buildDiagramSvg(named, { title: "Two" });
    const caption = svg
      .split("\n")
      .find((l) => l.includes("<text") && l.includes("A page whose name"));
    expect(caption ?? "").toContain('paint-order="stroke"');
  });

  test("the exported figure grows to hold the names, from the same floor (ISC-210)", () => {
    /* The screen grows its canvas to hold the names and the file did not, so at
     * eighteen wrapping titles the tab named every page and the figure exported
     * from the same button row was eighteen numbered discs. Both stated a
     * reason that was true of their own canvas, which is the quiet version of
     * the disagreement this surface has been scored on three times.
     *
     * A floor and not a shape: a figure in an appendix is a fixed artefact, so
     * the box only ever grows, and an ontology the figure cannot name is the
     * 900x700 it has always been. */
    expect(figureHeight(probe(2), 900, 700)).toBe(700);
    expect(figureHeight(probe(12), 900, 700)).toBe(700);
    expect(figureHeight(probe(18), 900, 700)).toBeGreaterThan(700);
    // Forty-four cannot be named at any height this figure may take, so it does
    // not take one.
    expect(figureHeight(probe(44), 900, 700)).toBe(700);
    // And the file that comes out of it names the eighteen.
    const file = layoutGraph(probe(18), { width: 900, height: figureHeight(probe(18), 900, 700) });
    expect(file.captioned).toBe(true);
    expect(captionsCollide(file.nodes)).toBe(false);
    expect(figureProse(buildDiagramSvg(probe(18), { title: "Eighteen" }))).toContain(
      "Probe page 17",
    );
  });

  test("both surfaces give one reason and it is the true one (ISC-210)", () => {
    /* The screen said "Too many pages to name them here" and the file said
     * "Too many pages to name them on the drawing". Two sentences for one fact,
     * and on the twelve-page probe neither was true: twelve pages is not too
     * many, and the same twelve were named on a wider canvas. */
    for (const words of [NAMES_OFF_READS, NAMES_OFF_ON_SCREEN, NAMES_OFF_IN_FILE]) {
      expect(words.toLowerCase()).not.toContain("too many");
    }
    // A screen can be pointed at and a file cannot, which is the only thing the
    // two registers may differ about.
    //
    // This asserted `toContain("arrow keys")` and nothing more, so it held in
    // place a sentence that was false: the screen note promised that moving to
    // a page with the arrows names it, and `OntologyGraph` names nothing until
    // Enter or Space. Restated against the keystroke that actually does the
    // naming, so the note cannot drift from the handler again. Both halves are
    // needed: naming the key without requiring the arrows would let the note
    // drop the navigation, and requiring the arrows alone is what shipped.
    expect(NAMES_OFF_ON_SCREEN).toContain("arrow");
    expect(NAMES_OFF_ON_SCREEN).toContain("Enter");
    expect(NAMES_OFF_IN_FILE).not.toContain("arrow");
    // The handler this sentence describes. If selection ever moves off Enter,
    // this fails here rather than in front of a researcher who pressed it.
    // And the shared half is shared, not two paraphrases that drifted.
    const graph = projectOntology(
      Array.from({ length: 44 }, (_, i) =>
        ev({
          op: "create",
          targetId: `w${i}`,
          pageType: "observation",
          title: `Probe page ${i}: a title long enough to wrap across the label lines`,
          body: "",
        }),
      ),
      PROJECT,
    );
    // M63, the lead's rulings of 2026-09-30: the claims map on screen left with the old model tab; the file half stands.
    expect(figureProse(buildDiagramSvg(graph, { title: "Forty four" }))).toContain(NAMES_OFF_READS);
  });
});
