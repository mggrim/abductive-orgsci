/**
 * A page's identity has one renderer, and it is the only one (FND-04, rounds
 * seven, eight and nine).
 *
 * ── What kept going wrong ──────────────────────────────────────────────────
 *
 * Origin, who put a page in the ontology, is the product's central claim.
 * tokens.css declared a canonical channel for it and one component read it, so
 * the two figures a researcher actually looks at each invented their own: the
 * intro hero drew model-proposed as fill:none with a 2px dashed rim,
 * OntologyGraph drew it as the page hue at fill-opacity 0.45 with no dash and
 * spent its dash on "nothing joins this page yet", and export/diagram.ts drew a
 * third convention and did not draw unattachedness at all. Round seven unified
 * the three and wrote a census: a grep of the source for a hard-coded fill
 * share or a hard-coded node dash.
 *
 * Round eight found PagePanel painting every row of the ontology index as an
 * 11.2px solid chip in the page hue with no origin at all, 180px under a key
 * defining a solid mark as the researcher's own prior. The census matched
 * nothing, because omitting a channel is not a syntax. So round eight gave
 * omission a syntax (a file that indexes PAGE_TYPE_COLOUR or renders a
 * data-page-id and never reaches the origin module) and wrote a third rule for
 * the words.
 *
 * Round nine measured the same screen again. `OntologyGraph.tsx:275` printed
 * the raw slug in the node's own hover title, so the object the key defines as
 * "yours" named itself "author-prior" in the same 596px column;
 * `Instrumentation.tsx:263` did the same in the trajectory; `Timeline.tsx:77`
 * printed "(author-prior)" in the session log; `lint/structural.ts:107` printed
 * "(puzzle, author-prior)" in a finding addressed to the researcher; and
 * `export/agentGraph.ts:110` wrote out a fifth gloss of the same value in a
 * caveat. Not one of those is a table, a hue or a number, so all three census
 * rules matched nothing in all five. The critic had already named the pattern
 * exactly: the rule is written in a header, the named call sites are guarded,
 * and the violation lives in the one nobody globbed.
 *
 * A sixth was found only by sweeping the running app, and it is the one worth
 * keeping in mind. On /coherence and /design/tension a stored finding read
 * "The puzzle rests entirely on author-prior/model-proposed claims with zero
 * supporting chunks". No source file wrote that sentence. `lint/semantic.ts:56`
 * described the ontology to the model as "(origin: author-prior, 0 supporting
 * chunks)" and the model wrote back the vocabulary it was handed. A render
 * check cannot see that, because by the time it reaches the DOM it is model
 * prose; the boundary has to extend to what the tool says to the model.
 *
 * ── What this file checks now ──────────────────────────────────────────────
 *
 * Three kinds of assertion, in three registers, and only the first is a grep.
 *
 * 1. THE BOUNDARY, checked on the IDENTIFIER. `PAGE_TYPE_COLOUR` has exactly
 *    one reader in the whole of src, `ui/components/PageMark.tsx`, and that
 *    module exports no colour, no fill share, no rim weight and no attribute
 *    record: only rendered output, and every page form of it draws hue and
 *    origin in the same call. A caller cannot obtain the hue to misuse it.
 *    This is the difference between a census and a boundary. Importing the
 *    hue, re-exporting it and indexing it are three ways of saying one word,
 *    and a name has one spelling where a rendering has as many syntaxes as
 *    there are ways to draw a circle.
 *
 * 2. THE MARKS, checked by RENDERING. Every surface is rendered here and its
 *    discs are parsed back out and compared to what the boundary's own legend
 *    mark draws, and the boundary's numbers are held to tokens.css. Sheet to
 *    module to surface, with no table trusted in between.
 *
 * 3. THE WORDS, checked by RENDERING, on both sides of the model. No surface's
 *    rendered TEXT may contain a raw origin slug, no finding's reason may, no
 *    exported document's prose may, and no prompt the tool sends may either.
 *    That is the check the round-nine offenders needed and no grep could have
 *    been: it does not care whether the slug arrived through a table, a
 *    ternary, an interpolation, a hand-written sentence or a model repeating
 *    what it was told.
 *
 * ── The field beside it ────────────────────────────────────────────────────
 *
 * Rule 3 was written about origin and applied to origin, and three waves shipped
 * over `page.type` sitting inside the very same interpolations. The fixture
 * study is why: it holds `observation` and `puzzle`, two values whose slug and
 * whose English are the same string, so four different renderings of one value
 * agreed by coincidence on every screen anyone looked at. On a probe carrying
 * `analytic-residue` the graph key said "analytic residue", the index Kind cell
 * said "analytic residue", the detail card 30px under that row said
 * "analytic-residue", the tray at the foot of the same screen said "an
 * explanation you are entertaining", the finding on /coherence said
 * "(analytic-residue, yours)" and the exported SVG legend said
 * "analytic-residue".
 *
 * So `SLUGS` is now both fields, `PAGE_TYPE_SLUGS` carries a hyphenated value
 * the fixture never did, and every rule below that was written about the one
 * word runs over the other. Where the two fields genuinely differ they are
 * split and the difference is argued at the test, not assumed.
 */

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Glob } from "bun";
import type { LedgerEvent, Origin, PageType } from "../src/ledger/events.ts";
import { PAGE_TYPES } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages } from "../src/ontology/schema.ts";
import { censusShare, LIVE_PAGES, originCensus } from "../src/ontology/attribution.ts";
import {
  ADRIFT_READS,
  ORIGIN_ORDER,
  originLabel,
  originReads,
  originWritten,
} from "../src/ui/originVocabulary.ts";
import {
  PAGE_TYPE_ORDER,
  pageTypeGloss,
  pageTypeLabel,
  pageTypePhrase,
} from "../src/ui/pageTypeVocabulary.ts";
import {
  // M32 R10: the empty state's graphic, which must be a hue with no origin.
  EmptyState,
  OriginMark,
  PageMark,
  // M32 R8: the row primitive draws the mark for a row that is about a claim.
  Row,
  sizeContrastSpan,
} from "../src/ui/components/index.ts";
import { HeroGraph } from "../src/ui/Introduction.tsx";
// M30 (R10): the trajectory drawing moved to Your model as `ModelMovement`.
// M39, ISC-503. The seventh mark-drawing surface.
import { emptyBrief } from "../src/state/projects.ts";
import type { OriginDoubt } from "../src/ontology/originAudit.ts";
import { projectTrajectory } from "../src/views/trajectoryModel.ts";
import { buildDiagramSvg } from "../src/export/diagram.ts";
import { buildWikiFiles } from "../src/export/wikiDirectory.ts";
import { buildAgentGraph } from "../src/export/agentGraph.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { ProposalsTrayView } from "../src/workbench/ProposalsTrayView.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import type { Proposal, ProposalTray } from "../src/proposals/types.ts";
import { ontologyDigest } from "../src/interview/designDigest.ts";
import { compareToTwin } from "../src/twin/compare.ts";

const PROJECT = "proj-origin";
let clock = 2_300_000_000_000;

function page(
  targetId: string,
  pageType: PageType,
  title: string,
  origin: Origin,
): LedgerEvent {
  clock += 1000;
  return {
    id: crypto.randomUUID(),
    ts: clock,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "create",
    targetId,
    pageType,
    title,
    body: "",
    origin,
    supportingChunks: [],
  } as LedgerEvent;
}

function relate(from: string, to: string): LedgerEvent {
  clock += 1000;
  return {
    id: crypto.randomUUID(),
    ts: clock,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "relate",
    targetId: `${from}->${to}`,
    edge: { from, to, role: "evidences" },
    origin: "author-prior",
    supportingChunks: [],
  } as LedgerEvent;
}

/**
 * One graph carrying every case the encoding has to keep apart: all three
 * origins, an attached pair and an adrift page, so "dashed" and "model
 * proposed" cannot be confused for each other by coincidence the way they were
 * on the fixture.
 *
 * And, since this round, both hyphen shapes of a page type. `r1` is the page
 * this file was missing: the study fixture holds only `observation` and
 * `puzzle`, whose slug and whose English are the same string, which is exactly
 * why four renderings of one value agreed on every screen anyone measured for
 * three waves. `analytic-residue` takes "an" and `candidate-resolution` takes
 * "a", so the two article branches of the ledger's phrase are both drawn here
 * too.
 */
const EVENTS: LedgerEvent[] = [
  page("p1", "puzzle", "Handoff agreement does not track patient agreement", "author-prior"),
  page("o1", "observation", "Refusal on the night ward list", "data-driven"),
  page("m1", "candidate-resolution", "Credit means different things per shift", "model-proposed"),
  page("d1", "rival", "The producer who kept the relationships", "author-prior"),
  page("r1", "analytic-residue", "The night list refusals nobody logged", "author-prior"),
  // M29: the fourth origin, on the only page type allowed to carry it, joined
  // so the adrift ring still picks out exactly one page.
  page("t1", "theory", "Handoffs fail when the receiver cannot question the sender", "literature-derived"),
  relate("o1", "p1"),
  // m1 is joined on purpose. Leaving the model's page adrift would reproduce
  // exactly the fixture coincidence that hid this defect for three rounds,
  // where "dashed" and "model-proposed" happened to pick out the same disc.
  relate("m1", "p1"),
  // r1 is joined for the matching reason one field to the left: d1 is the
  // designated adrift page and the assertions below depend on it being the
  // only one.
  relate("r1", "p1"),
  // M29: and t1 for the same reason again.
  relate("t1", "p1"),
];
const GRAPH = projectOntology(EVENTS, PROJECT);
/** Only the exports need one, and only for front matter and a title. */
const EXPORT_PROJECT = {
  id: PROJECT,
  title: "Handoffs on the night ward",
  createdAt: clock,
  brief: { researchQuestion: "How does credit travel across a shift?", dataType: "interviews" },
} as unknown as Parameters<typeof buildWikiFiles>[0]["project"];
/** d1 is the only page nothing joins, and it is author-prior, not the model's. */
const ADRIFT_ID = "d1";

/** The raw internal values, which are never a word for a person. */
// M29: the fourth slug, which must never reach a reader either.
const SLUGS: readonly string[] = [
  "author-prior",
  "data-driven",
  "model-proposed",
  "literature-derived",
];

interface Disc {
  readonly fillOpacity: number;
  readonly strokeWidth: number;
  readonly dash: string | null;
  readonly r: number;
  /* M29: the centre, so the circles belonging to one mark can be read as one
   * mark. Two origins draw the same disc now and are told apart by what is
   * drawn inside it, which is not a property of any single circle. */
  readonly cx: number;
  readonly cy: number;
}

/** Every <circle> in a chunk of SVG markup, as the channels origin uses. */
function discs(markup: string): Disc[] {
  const out: Disc[] = [];
  for (const m of markup.matchAll(/<circle\b[^>]*>/g)) {
    const tag = m[0];
    const attr = (name: string): string | null => {
      const hit = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
      return hit === null ? null : (hit[1] ?? null);
    };
    out.push({
      fillOpacity: Number(attr("fill-opacity") ?? "1"),
      strokeWidth: Number(attr("stroke-width") ?? "0"),
      dash: attr("stroke-dasharray"),
      r: Number(attr("r") ?? "0"),
      cx: Number(attr("cx") ?? "0"),
      cy: Number(attr("cy") ?? "0"),
    });
  }
  return out;
}

/**
 * How many rings the boundary draws inside the disc for one origin (M29).
 *
 * Read off the boundary's own legend mark, like everything else here, rather
 * than off a table naming which origin has one.
 */
function innerRings(origin: Origin): number {
  const drawn = discs(renderToStaticMarkup(createElement(OriginMark, { origin })));
  return drawn.filter((d) => d.dash === null).length - 1;
}

/** The whole mark for one origin: the disc's channels and what sits inside it. */
function signature(origin: Origin): string {
  const ref = reference(origin);
  return `${ref.fillOpacity}|${ref.strokeWidth}|${ref.dash}|${innerRings(origin)}`;
}

/** Every mark in a chunk of SVG, as that same signature, grouped by centre. */
function svgMarks(markup: string): Set<string> {
  const byCentre = new Map<string, Disc[]>();
  for (const c of discs(markup)) {
    const key = `${c.cx},${c.cy}`;
    byCentre.set(key, [...(byCentre.get(key) ?? []), c]);
  }
  const out = new Set<string>();
  for (const group of byCentre.values()) {
    const solid = [...group].filter((d) => d.dash === null).sort((a, b) => b.r - a.r);
    const disc = solid[0];
    if (disc === undefined) continue;
    out.add(`${disc.fillOpacity}|${disc.strokeWidth}|${disc.dash}|${solid.length - 1}`);
  }
  return out;
}

/** Channels only, so a disc drawn at one size can be compared with another. */
const channels = (d: Disc) => ({
  fillOpacity: d.fillOpacity,
  strokeWidth: d.strokeWidth,
  dash: d.dash,
});

/**
 * What the boundary itself draws for an origin, read back off its own legend
 * mark rather than off an exported table.
 *
 * This is the substantive change from round seven's version, which compared
 * every surface against `originDisc(origin, "#000")`. That was a table with
 * five readers, and a table with five readers is what all three rounds of this
 * defect were made of. The boundary exports no table at all now, so the
 * reference is a rendering: the mark the graph key puts beside the sentence
 * "solid: you put this page here out of your own prior thinking" IS the
 * standard, and everything else has to equal it.
 */
function reference(origin: Origin): ReturnType<typeof channels> {
  const markup = renderToStaticMarkup(createElement(OriginMark, { origin }));
  const drawn = discs(markup).find((d) => d.dash === null);
  if (drawn === undefined) throw new Error(`the boundary drew no disc for ${origin}`);
  return channels(drawn);
}

/** The disc and the ring a surface drew for one page, as the two channels. */
interface PageMarkDrawn {
  readonly disc: ReturnType<typeof channels>;
  readonly ring: boolean;
}

/**
 * Every page a chunk of markup draws, keyed by page id.
 *
 * Written once and pointed at two surfaces, because the round-eight defect was
 * a list and a figure of the same objects disagreeing, and a comparison needs
 * both sides read the same way. The ring is drawn before the disc so the disc
 * sits on top of it, on every surface, which is what makes "the one without a
 * dash" the disc.
 */
function marksIn(markup: string, pattern: RegExp): Map<string, PageMarkDrawn> {
  const out = new Map<string, PageMarkDrawn>();
  for (const m of markup.matchAll(pattern)) {
    const id = m[1] ?? "";
    const drawn = discs(m[0]);
    const disc = drawn.find((d) => d.dash === null);
    if (disc === undefined) continue;
    out.set(id, { disc: channels(disc), ring: drawn.some((d) => d.dash !== null) });
  }
  return out;
}

/** A node in the ontology figure. */
const nodeMarks = (markup: string): Map<string, PageMarkDrawn> =>
  marksIn(markup, /<g class="node"[^>]*data-page-id="([^"]+)"[\s\S]*?<\/g>/g);

/** A row in the ontology index. */
const rowMarks = (markup: string): Map<string, PageMarkDrawn> =>
  marksIn(markup, /<button[^>]*data-page-id="([^"]+)"[\s\S]*?<\/button>/g);

const originOf = (id: string): Origin => {
  const source = EVENTS.find((e) => "targetId" in e && e.targetId === id);
  return (source as { origin?: Origin } | undefined)?.origin as Origin;
};

// ── Rendered surfaces, built once ───────────────────────────────────────────

/*
 * This ledger holds no `proposal`, so `originDoubts` over it is empty and the
 * doubt channel is off on every surface below. That is deliberate: these tests
 * hold the four encodings this file was written for, and a bar drawn across a
 * disc would change the marks they parse back out. The doubt channel has its
 * own fixture and its own assertions in tests/origin-audit.test.ts.
 */
const NO_DOUBTS = new Map<string, OriginDoubt>();

const HERO = renderToStaticMarkup(createElement(HeroGraph));
/*
 * The census the trajectory prints its claim from, over the live pages of the
 * same graph every other surface here is rendered from. Passed in rather than
 * derived inside the panel, which is the fix: the panel used to count ledger
 * events and print the total under the three page marks, so this ledger's five
 * pages read as eight on the Design tab and five on /ontology.
 */
const PAGE_CENSUS = originCensus(livePages(GRAPH), LIVE_PAGES);
/*
 * `views/Timeline.tsx` used to be rendered here as "the session timeline" and
 * the file is gone. It was the seventeen-row session log the ledger panel in
 * `Instrumentation.tsx` replaced, and after that replacement nothing in `src/`
 * imported it: the only thing still mounting it was this line. A component
 * whose sole caller is the test that guards it is not covered, it is preserved,
 * and its round-nine offence ("(author-prior)" printed raw at Timeline.tsx:77)
 * is recorded in this file's header where it belongs. The surface it stood for
 * is still checked, because the ledger panel that took its place is rendered as
 * part of `TRAJECTORY` and is in the `SRC` sweep below by its own path.
 */

// ---------------------------------------------------------------------------

const TOKENS_CSS = await Bun.file(
  new URL("../src/ui/styles/tokens.css", import.meta.url).pathname,
).text();

describe("the origin mark mirrors the sheet that declares it", () => {
  const token = (name: string): string => {
    const hit = new RegExp(`--${name}:\\s*([^;]+);`).exec(TOKENS_CSS);
    return (hit?.[1] ?? "").trim();
  };

  test("every fill share and rim weight is the value tokens.css declares", () => {
    // Unchanged in what it protects and stronger in how. It used to compare the
    // exported ORIGIN_MARK table against tokens.css, which is a table agreeing
    // with a sheet — satisfied exactly while three surfaces ignored the table,
    // which is precisely what shipped. There is no table to read now, so it
    // renders the mark and holds what was DRAWN to the sheet.
    const drift: string[] = [];
    const pairs: [Origin, string][] = [
      ["author-prior", "yours"],
      ["data-driven", "data"],
      ["model-proposed", "model"],
      // M29: the fourth pair, so the sheet and the fourth mark cannot drift apart.
      ["literature-derived", "literature"],
    ];
    for (const [origin, slug] of pairs) {
      const drawn = reference(origin);
      if (token(`origin-fill-${slug}`) !== String(drawn.fillOpacity)) {
        drift.push(
          `--origin-fill-${slug}: css ${token(`origin-fill-${slug}`)} vs drawn ${drawn.fillOpacity}`,
        );
      }
      if (token(`origin-rim-${slug}`) !== String(drawn.strokeWidth)) {
        drift.push(
          `--origin-rim-${slug}: css ${token(`origin-rim-${slug}`)} vs drawn ${drawn.strokeWidth}`,
        );
      }
    }
    // The dash, read off the one mark that draws it rather than off a constant.
    const adriftMarkup = renderToStaticMarkup(
      createElement(OriginMark, { origin: "author-prior", adrift: true }),
    );
    const drawnDash = discs(adriftMarkup).find((d) => d.dash !== null)?.dash ?? "";
    if (token("adrift-dash") !== drawnDash) {
      drift.push(`--adrift-dash: css ${token("adrift-dash")} vs drawn ${drawnDash}`);
    }
    expect(drift).toEqual([]);
  });

  test("Anti: the mirror would notice a drift", () => {
    // If the sheet stops declaring these the check above passes vacuously,
    // which is exactly how the ORIGIN_COLOUR mirror stayed green while three
    // surfaces ignored it.
    expect(token("origin-fill-model")).not.toBe("");
    expect(token("adrift-dash")).not.toBe("");
    // And the four references have to be four different marks, or "every
    // surface agrees" is a claim about one value.
    //
    // M29: over the whole mark rather than over the disc. "Yours" and "from the
    // papers" draw the same disc on purpose, because fill share is spent after
    // three values and a fourth step lands between two existing ones. What
    // separates them is the ring inside, so a distinctness check reading only
    // the disc would pass while the two marks a researcher has to tell apart
    // were identical.
    const seen = new Set(ORIGIN_ORDER.map((o) => signature(o)));
    expect(seen.size).toBe(ORIGIN_ORDER.length);
    expect(ORIGIN_ORDER.length).toBe(4);
  });
});

describe("every surface draws the same disc", () => {
  // M63, the lead's rulings of 2026-09-30: the old model tab's FIGURE left with it; superseded: "the ontology graph draws origin as fill share, and unattached as a ring"

  test("the intro hero draws the same three discs", () => {
    // The screen that teaches the encoding. It taught a dashed rim as the
    // model's mark, which is what the graph calls unattached.
    for (const origin of ORIGIN_ORDER) {
      const hit = HERO.match(new RegExp(`<circle[^>]*data-origin="${origin}"[^>]*>`));
      expect({ origin, found: hit !== null }).toEqual({ origin, found: true });
      const disc = discs(hit?.[0] ?? "")[0];
      expect({ origin, disc: disc === undefined ? null : channels(disc) }).toEqual({
        origin,
        disc: reference(origin),
      });
    }
    // And no dash anywhere on the hero, because nothing on it is unattached.
    expect(HERO).not.toContain("stroke-dasharray");
  });

  test("the SVG export draws the same three discs, and draws unattachedness", () => {
    const svg = buildDiagramSvg(GRAPH, { title: "Handoffs", width: 900, height: 560 });
    // The node discs are the first N circles; the legend's are drawn after the
    // separating line, so slice on it rather than on a count.
    const body = svg.slice(0, svg.indexOf('<line x1="24"'));
    const drawn = discs(body);
    // One disc per live page and one ring, for the one page nothing joins.
    // The literal was 5 when the fixture held four pages; it is derived from
    // the fixture now, so adding `r1` to give this file a hyphenated page type
    // could not silently weaken the count it protects.
    // M29: one disc per live page, one ring for the page nothing joins, and one
    // ring inside each mark whose origin draws one. Derived from the fixture and
    // from the boundary's own answer, so neither number is a literal here.
    const withRing = livePages(GRAPH).filter((p) => innerRings(p.origin) === 1).length;
    expect(drawn).toHaveLength(GRAPH.pages.size + 1 + withRing);
    const dashed = drawn.filter((d) => d.dash !== null);
    expect(dashed).toHaveLength(1);
    for (const origin of ORIGIN_ORDER) {
      // M29: the whole mark, not its disc. Two origins now draw the same disc
      // and are told apart by what is drawn inside it, so a `some` over the
      // disc's two channels would report "from the papers" as present on a
      // figure that only ever drew "yours".
      expect({ origin, drawn: svgMarks(body).has(signature(origin)) }).toEqual({
        origin,
        drawn: true,
      });
    }
  });

  test("a dashed rim means unattached and never means model-proposed", () => {
    // The headline, stated as one property across every surface. On the fixture
    // both ontology discs were dashed because both were unattached, one
    // model-proposed and one author-prior, so a researcher who had read the
    // intro legend two clicks earlier read their own prior claim as the
    // model's.
    //
    // No origin puts a dash anywhere. The dash exists on exactly one mark, the
    // ring, a separate element sized against the disc it surrounds: the first
    // version of this fix put it on the disc's own rim and the live check
    // showed it vanishing into a solid fill of the same hue.
    for (const origin of ORIGIN_ORDER) {
      expect({ origin, dash: reference(origin).dash }).toEqual({ origin, dash: null });
    }
    const adriftMarkup = renderToStaticMarkup(
      createElement(OriginMark, { origin: "author-prior", adrift: true }),
    );
    const drawn = discs(adriftMarkup);
    const ring = drawn.find((d) => d.dash !== null);
    const disc = drawn.find((d) => d.dash === null);
    expect(ring?.dash).not.toBeUndefined();
    expect((ring?.r ?? 0) > (disc?.r ?? 0)).toBe(true);
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's PANEL left with it; superseded: "the ontology index draws the same disc as the graph beside it"

  // M63, the lead's rulings of 2026-09-30: the old model tab's PANEL, FIGURE left with it; superseded: "the index and the figure on one screen say the same thing about each page"

  // M63, the lead's rulings of 2026-09-30: the old model tab's PANEL left with it; superseded: "a finding names a page with the same disc the index and the figure draw"

  // M63, the lead's rulings of 2026-09-30: the old model tab's PANEL left with it; superseded: "the row primitive draws the same disc every other surface draws"

  /* "the Design companion draws the same disc" was here (M39). The companion's
   * Your model choice went at M53 on the owner's word (ISC-541), so the Design
   * route draws no claim mark and the test has nothing to render. */

  test("an empty panel's graphic asserts nothing about an object", () => {
    /* M32 R10. "40% opacity page-type mark at 48px as the graphic." A page-type
     * mark and not a page mark, and the difference is the whole point: an empty
     * panel holds no page, so a disc here carrying a fill share would be
     * claiming an origin for an object that does not exist. What it draws is
     * the key swatch, which PageMark.tsx names as the one mark in the app that
     * carries a hue with no origin beside it. */
    const markup = renderToStaticMarkup(
      createElement(EmptyState, {
        status: "No checks run yet.",
        teach: "Press Check design to run the nine checks.",
        mark: "observation",
      }),
    );
    expect(markup).toContain('class="graphkey-swatch"');
    expect(markup).toContain('data-page-type="observation"');
    // No disc, so no fill share, so no origin claimed. And hidden, because it
    // is decoration and the two lines under it carry everything to be read.
    expect(discs(markup)).toEqual([]);
    expect(markup).not.toContain("data-origin");
    expect(markup).toContain('aria-hidden="true"');
    // And a state with no mark asked for draws none at all.
    const bare_ = renderToStaticMarkup(
      createElement(EmptyState, { status: "No data yet.", teach: "Say what your file is." }),
    );
    expect(bare_).not.toContain("graphkey-swatch");
  });

  test("Anti: a row that is not about a claim draws no mark and claims no origin", () => {
    // The other half, and it is the half that keeps the mark meaning something.
    // A paper, a data document and a rule that fired on eight passages are all
    // rows and none of them is a claim, so none of them draws a disc.
    const markup = renderToStaticMarkup(
      createElement(Row, { children: "A paper you are arguing with" }),
    );
    expect(discs(markup)).toEqual([]);
    for (const slug of SLUGS) {
      expect({ slug, said: markup.includes(slug) }).toEqual({ slug, said: false });
    }
    expect(markup).toContain("A paper you are arguing with");
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's TRAJECTORY left with it; superseded: "the trajectory draws the same three discs"

  // M63, the lead's rulings of 2026-09-30: the old model tab's FIGURE left with it; superseded: "the ring clears the rim at every size the app draws it"

  test("the rim is the mark's own colour, so a hollow disc is still a page of its type", () => {
    // It was --surface, a white ring, which works under a filled disc and
    // erases a hollow one. Read off the render, because the hue is no longer a
    // value any test outside the boundary can import.
    const markup = renderToStaticMarkup(
      createElement(PageMark, { page: { type: "puzzle", origin: "model-proposed" } }),
    );
    const tag = /<circle\b[^>]*>/.exec(markup)?.[0] ?? "";
    const fill = /\bfill="([^"]+)"/.exec(tag)?.[1] ?? "";
    const stroke = /\bstroke="([^"]+)"/.exec(tag)?.[1] ?? "";
    expect(stroke).toBe(fill);
    expect(/^#[0-9a-f]{6}$/i.test(stroke)).toBe(true);
    expect(/\bfill-opacity="0"/.test(tag)).toBe(true);
  });
});

  // M63, the lead's rulings of 2026-09-30: the old model tab's KEY left with it; superseded: "the graph key, the hero legend and the export legend read the same strings"
  // M63, the lead's rulings of 2026-09-30: the old model tab's GraphKey left with it; superseded: "the key names an origin only while that origin is on the canvas"

// ---------------------------------------------------------------------------
// The words, checked by rendering.
//
// The five round-nine offenders are here. Every one of them put the raw slug in
// front of a person and not one of them was a shape a census could name: a
// hover title, a chart tooltip, a session-log line, a lint finding's reason and
// a hand-written caveat. The property has one statement and it needs no
// syntax — what a surface RENDERS as text may not contain a slug.

/** Tags out, entities back, so an attribute value is not read as text. */
function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Markdown minus the parts addressed to a machine: fenced blocks, inline code
 * and YAML front matter.
 *
 * `origin: model-proposed` in a page's front matter is the field a reader
 * greps, not a word addressed to them, and the same is true of the backticked
 * mentions in the wiki README and the agent-graph caveats. Stripping them is
 * what keeps this rule about vocabulary rather than about serialisation.
 */
function proseOnly(markdown: string): string {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n/gm, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ");
}

describe("no surface says an origin in its own words", () => {
  const surfaces: [string, string][] = [
    ["the intro hero", HERO],
  ];

  test("no rendered text on any surface contains a raw origin slug", () => {
    // OntologyGraph.tsx:275 printed "puzzle · author-prior · draft" in the
    // node's own title, on the screen whose key defines that value as "yours".
    // Instrumentation.tsx:263 did it in the trajectory tooltip and
    // Timeline.tsx:77 in the session log. All three are interpolations, so the
    // round-eight rule (an origin literal used as the key of a string) matched
    // none of them, and 880 tests passed straight over all three.
    const offenders: string[] = [];
    for (const [name, markup] of surfaces) {
      const text = visibleText(markup);
      for (const slug of SLUGS) {
        /* No skip. There used to be one here and in three other loops in this
         * file, all four of the form `if (slug === originLabel(
         * "model-proposed")) continue;`, because the label for that origin WAS
         * the slug and no assertion could tell a leak from the legend. So the
         * one origin the tool most needs to render honestly, on the one screen
         * where a model-written check names a model-written page, was the one
         * origin this check could not see. Its label is "from the model" now,
         * and all three slugs are held to the same rule. */
        if (text.includes(slug)) offenders.push(`${name}: ${slug}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  test("no exported document glosses an origin in its own words", () => {
    // export/agentGraph.ts:110 wrote "were suggested by a language model and
    // accepted by the researcher", a fifth phrasing of a value with one name,
    // in the file whose whole purpose is to carry attribution to whoever picks
    // the study up cold. It draws nothing and holds no table, so no census
    // could ever have seen it.
    const wiki = buildWikiFiles({ project: EXPORT_PROJECT, graph: GRAPH, events: EVENTS })
      .map((f) => proseOnly(f.content))
      .join("\n");
    const memo = proseOnly(
      buildOntologyMemo({ project: EXPORT_PROJECT, graph: GRAPH, events: EVENTS }),
    );
    const caveats = proseOnly(
      buildAgentGraph({
        project: EXPORT_PROJECT,
        graph: GRAPH,
        events: EVENTS,
        chunks: [],
      }).caveats.join("\n"),
    );
    const offenders: string[] = [];
    for (const [name, text] of [["wiki", wiki], ["memo", memo], ["agent-graph", caveats]] as const) {
      for (const slug of SLUGS) {
          if (text.includes(slug)) offenders.push(`${name}: ${slug}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
    // And the register those documents use is the module's third person, not a
    // fourth table in export/wikiDirectory.ts.
    for (const origin of ORIGIN_ORDER) {
      expect({ origin, written: wiki.includes(originWritten(origin)) }).toEqual({
        origin,
        written: true,
      });
    }
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's PANEL_SELECTED left with it; superseded: "one origin, one name, on every surface that says it out loud"

  test("Anti: the render check would catch a slug put back", () => {
    // Vacuity guard, and the reason it is needed: every round of this defect
    // shipped a green check that had quietly stopped matching. A surface that
    // does print the slug has to fail, so one is fabricated and run through the
    // same reader the surfaces are.
    const fabricated = `<p class="muted small">puzzle · author-prior · draft</p>`;
    const text = visibleText(fabricated);
    expect(SLUGS.some((s) => text.includes(s))).toBe(true);
    // And the surfaces really were read: they are not empty strings.
    for (const [name, markup] of surfaces) {
      expect({ name, long: markup.length > 200 }).toEqual({ name, long: true });
    }
    // The stripper must not swallow real prose along with the code spans.
    expect(proseOnly("a `origin: author-prior` b").trim()).toBe("a   b");
    expect(proseOnly("plain author-prior text")).toContain("author-prior");
  });
});

// ---------------------------------------------------------------------------
// The same property, one field to the left.
//
// Everything above was written about origin, and page type sat inside the same
// interpolations, on the same screens, in the same exported files, through
// three waves. Not because anyone argued it was different: because the study
// fixture holds `observation` and `puzzle`, and for those two the slug and the
// English are the same string, so every rendering agreed by accident and no
// measurement of the running app could tell them apart.
//
// The rules below are the rules above with the field swapped, plus the two
// differences that are real and are argued where they are made.

/**
 * The three page types whose slug is not their name.
 *
 * Four of the seven are ordinary English already, so for those a render check
 * is vacuous: "rival" reaching the screen as "rival" is correct. That is the
 * same collision `model-proposed` has with its own label above, and it is
 * handled the same way. It is derived rather than listed because two separate
 * comments in src claimed "the two hyphenated" types while PAGE_TYPES held
 * three, and both were used to justify a partial fix.
 */
const PAGE_TYPE_SLUGS: readonly PageType[] = PAGE_TYPES.filter((t) => t.includes("-"));

/** A tray holding one proposal per page type, so no branch of the register hides. */
const TRAY_PROPOSALS: readonly Proposal[] = PAGE_TYPES.map((t, i) => ({
  id: `prop-${i}`,
  projectId: PROJECT,
  title: `A draft the researcher has not decided about yet (${i})`,
  body: "",
  pageType: t,
  sourceChunks: [],
  status: "pending",
  proposedAt: clock + i,
}));

const TRAY = renderToStaticMarkup(
  createElement(
    LedgerProvider,
    null,
    createElement(ProposalsTrayView, {
      projectId: PROJECT,
      tray: {
        projectId: PROJECT,
        all: TRAY_PROPOSALS,
        pending: TRAY_PROPOSALS,
        rejected: [],
        accepted: [],
        merged: [],
        deferred: [],
      } as ProposalTray,
      duplicates: [],
    }),
  ),
);

/** The exported figure, read as text the way a surface is. */
const DIAGRAM = buildDiagramSvg(GRAPH, { title: "Handoffs", width: 900, height: 700 });

describe("no surface says a page type in its own words", () => {
  const surfaces: [string, string][] = [
    // The tray was not in the origin list because it does not draw a mark. It
    // is here because it was the fourth vocabulary: the researcher accepted a
    // page under one name at the foot of this screen and found it indexed
    // under another at the top.
    ["the proposals tray", TRAY],
    // Neither was the exported figure, which was checked above only for its
    // discs. Its legend printed "analytic-residue" while the key one tab away
    // printed "analytic residue", which is a screen and a file disagreeing
    // about the same word in the copy that goes into a paper.
    ["the exported figure", DIAGRAM],
  ];

  test("the vocabulary is total over the enum and no name of a page type is its slug", () => {
    // The defect the tray's private table had was not that its three glosses
    // were wrong, it was that four of the seven types had no entry and fell
    // through `?? type` to the slug the comment above claimed had been fixed.
    // A partial table is a leak with a lid on it.
    expect([...PAGE_TYPE_ORDER].sort()).toEqual([...PAGE_TYPES].sort());
    for (const type of PAGE_TYPES) {
      expect({
        type,
        label: pageTypeLabel(type).includes("-"),
        gloss: pageTypeGloss(type).includes("-"),
        phrase: pageTypePhrase(type, "a").includes("-"),
      }).toEqual({ type, label: false, gloss: false, phrase: false });
    }
    // And the standing-bar failure that let three waves past: two comments in
    // src said "the two hyphenated" types, and one said "five of the seven are
    // ordinary English already", while PAGE_TYPES holds three hyphenated and
    // four plain. A comment describing behaviour the code does not have is a
    // defect, so the count is asserted rather than described.
    expect(PAGE_TYPE_SLUGS.length).toBe(3);
    expect(PAGE_TYPES.length - PAGE_TYPE_SLUGS.length).toBe(4);
    // Distinct, or two types share a name and the index cannot be read.
    expect(new Set(PAGE_TYPES.map(pageTypeLabel)).size).toBe(PAGE_TYPES.length);
    expect(new Set(PAGE_TYPES.map(pageTypeGloss)).size).toBe(PAGE_TYPES.length);
  });

  test("no rendered text on any surface contains a raw page-type slug", () => {
    // PagePanel.tsx:344 printed "analytic-residue · conjecture · yours" 30px
    // under an index row printing "analytic residue", and the comment directly
    // above that line was the one recording the fix of the origin half of the
    // same interpolation. OntologyGraph.tsx:476 did the same in the node's own
    // <title>, under the same kind of comment. Neither is a table, so the
    // census rules had no syntax for either.
    const offenders: string[] = [];
    for (const [name, markup] of surfaces) {
      const text = visibleText(markup);
      for (const slug of PAGE_TYPE_SLUGS) {
        if (text.includes(slug)) offenders.push(`${name}: ${slug}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  test("no prompt hands the model a raw page-type slug", () => {
    // The origin version of this test exists because a model writes back the
    // vocabulary it is given. The digest the interviewer model reads before it
    // asks the researcher its next question is handed the page types in the
    // module's words, not as slugs. (The two lint prompts that were checked
    // beside it went with the checks at M89.)
    const seen: [string, string][] = [];
    // Not a client at all, just the digest the interviewer is handed.
    seen.push(["the interviewer's digest", ontologyDigest(GRAPH)]);

    expect(seen.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const [name, prompt] of seen) {
      for (const slug of PAGE_TYPE_SLUGS) {
        if (prompt.includes(slug)) offenders.push(`${name}: ${slug}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
    // Vacuity guard: the digest really does describe the pages, so a green pass
    // is not a prompt that named none of them.
    for (const name of ["the interviewer's digest"]) {
      const said = seen.some(
        ([n, p]) => n === name && p.includes(pageTypeLabel("analytic-residue")),
      );
      expect({ name, said }).toEqual({ name, said: true });
    }
    // The extraction and gleaning prompts are deliberately not here. They hand
    // the model the slug as the value it must emit in a typed field, which is
    // the same carve-out `origin: model-proposed` gets in front matter above:
    // a key addressed to a machine, not a word addressed to a person. What
    // stops that becoming an excuse is that everything the model is asked to
    // say back in prose is checked.
  });

  test("no exported document glosses a page type in its own words", () => {
    // export/wikiDirectory.ts printed "## analytic-residue" as a section
    // heading in the catalogue a cold reader is told to start at, and named
    // "the analytic-residue pages" in the README's own prose. The memo carried
    // the lint reasons verbatim.
    const wiki = buildWikiFiles({ project: EXPORT_PROJECT, graph: GRAPH, events: EVENTS })
      .map((f) => proseOnly(f.content))
      .join("\n");
    const memo = proseOnly(
      buildOntologyMemo({ project: EXPORT_PROJECT, graph: GRAPH, events: EVENTS }),
    );
    const caveats = proseOnly(
      buildAgentGraph({
        project: EXPORT_PROJECT,
        graph: GRAPH,
        events: EVENTS,
        chunks: [],
      }).caveats.join("\n"),
    );
    const offenders: string[] = [];
    for (const [name, text] of [["wiki", wiki], ["memo", memo], ["agent-graph", caveats]] as const) {
      for (const slug of PAGE_TYPE_SLUGS) {
        if (text.includes(slug)) offenders.push(`${name}: ${slug}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
    // And the words really are the module's, in the document that carries the
    // catalogue, rather than a fourth table in the export layer. Only the
    // types this fixture actually holds: asserting the other four would be
    // asserting that a catalogue lists pages that do not exist.
    const drawn = [...new Set([...GRAPH.pages.values()].map((p) => p.type))].filter((t) =>
      t.includes("-"),
    );
    expect(drawn.length).toBeGreaterThan(0);
    for (const type of drawn) {
      expect({ type, named: wiki.toLowerCase().includes(pageTypeLabel(type)) }).toEqual({
        type,
        named: true,
      });
    }
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's KEY left with it; superseded: "the screen and the file it generates spell a page type the same way"

  test("one page type, one name, on every surface that says it out loud", () => {
    // The four renderings of one value, all on /ontology at once: the key and
    // the index cell said "analytic residue", the detail card said
    // "analytic-residue", the finding in the card's own list said
    // "analytic-residue" again and the tray at the foot said "something your
    // account does not absorb" off a private table.
    //
    // Two registers survive that and they are not interchangeable: the tray is
    // where the researcher decides whether a page is that kind of thing, so it
    // gets the definition; everywhere a page is being named gets the name.
    const named = [DIAGRAM];
    for (const markup of named) {
      expect(visibleText(markup)).toContain(pageTypeLabel("candidate-resolution"));
    }
    expect(visibleText(TRAY)).toContain(pageTypeGloss("candidate-resolution"));
    // Every type in the tray, so the four that used to fall through to the
    // slug are covered by name.
    for (const type of PAGE_TYPES) {
      expect({ type, glossed: visibleText(TRAY).includes(pageTypeGloss(type)) }).toEqual({
        type,
        glossed: true,
      });
    }
  });

  test("the ledger's sentence is the index's word with an article, not a sixth table", () => {
    // Instrumentation.tsx held seven noun phrases of its own ("an analytic
    // residue page"), which read correctly and was still a fifth vocabulary
    // for one value: nothing tied it to the word the index used, so the two
    // could drift and nothing would notice. It is derived now, and the
    // derivation is asserted rather than assumed.
    // M28: copy. The noun is "claim" on every surface now. The derivation this
    // test exists for is unchanged: the phrase is the index's word with an
    // article in front of it, and never a table of its own.
    for (const type of PAGE_TYPES) {
      const label = pageTypeLabel(type);
      expect({ type, a: pageTypePhrase(type, "a").endsWith(`${label} claim`) }).toEqual({
        type,
        a: true,
      });
      expect({ type, the: pageTypePhrase(type, "the") }).toEqual({
        type,
        the: `the ${label} claim`,
      });
    }
    // The grammar the phrase exists to get right. "Drafted a observation"
    // shipped once, off an article hard-coded beside an interpolated slug.
    expect(pageTypePhrase("observation", "a")).toBe("an observation claim");
    expect(pageTypePhrase("analytic-residue", "a")).toBe("an analytic residue claim");
    expect(pageTypePhrase("candidate-resolution", "a")).toBe("a candidate resolution claim");
  });

  test("the twin comparison names a page type the way the index does", () => {
    // compare.ts joined the raw slugs into the summary sentence: "The baseline
    // carries page types yours does not: analytic-residue, scope-condition",
    // on a panel whose whole job is to put two accounts of one study side by
    // side. Two lists that name the same kind of page two ways cannot be
    // compared.
    const twinEvents: LedgerEvent[] = [
      page("t1", "puzzle", "Handoff agreement does not track patient agreement", "author-prior"),
      page("t2", "scope-condition", "Holds only where shifts overlap", "author-prior"),
    ];
    const summary = compareToTwin(GRAPH, projectOntology(twinEvents, PROJECT)).summary;
    for (const slug of PAGE_TYPE_SLUGS) {
      expect({ slug, leaked: summary.includes(slug) }).toEqual({ slug, leaked: false });
    }
    expect(summary).toContain(pageTypeLabel("scope-condition"));
  });

  test("Anti: the render check would catch a page-type slug put back", () => {
    // Vacuity guard, and the reason it is needed is this defect's own history:
    // three waves of green checks measured a fixture holding only `puzzle` and
    // `observation`, for which every rendering agrees whether or not anything
    // is wrong. So the guard is two claims, not one.
    //
    // First, a surface that does print the slug fails.
    const fabricated = `<p class="muted small">analytic-residue · conjecture · yours</p>`;
    expect(PAGE_TYPE_SLUGS.some((s) => visibleText(fabricated).includes(s))).toBe(true);
    // Second, and this is the one that was missing: the fixture these surfaces
    // are built from actually contains a type whose slug differs from its
    // name. Without this line every check in this describe passes on a graph
    // where they cannot fail.
    const drawn = [...new Set([...GRAPH.pages.values()].map((p) => p.type))];
    expect(drawn.filter((t) => t.includes("-")).sort()).toEqual([
      "analytic-residue",
      "candidate-resolution",
    ]);
    for (const [name, markup] of surfaces) {
      expect({ name, long: markup.length > 200 }).toEqual({ name, long: true });
    }
  });
});

// ---------------------------------------------------------------------------
// The boundary, checked on imports.
//
// This is the part that is not a census. Round seven greps for a hard-coded
// fill share, round eight greps for a page hue painted with no origin beside
// it, and both are checks on RENDERING, which has as many syntaxes as there are
// ways to draw a circle. An import has one syntax. So the hue is given exactly
// one reader and the check asks who reads it.
//
// What makes the single reader sufficient rather than merely tidy:
// ui/components/PageMark.tsx exports no colour, no fill share, no rim weight
// and no attribute record. Everything that leaves it is rendered output, and
// every page form of it takes a PageIdentity — the type and the origin
// together, with no variant carrying one without the other. A caller cannot
// obtain a page hue at all, so it cannot draw one without saying who wrote the
// page. That is the difference between "nobody has done the wrong thing yet"
// and "the wrong thing is not expressible".

interface Offence {
  readonly rel: string;
  readonly rule: string;
  readonly hit: string;
}

/** Comments out, so a file that explains a defect is not read as committing it. */
function bare(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The boundary module, and the barrel that re-exports its public face. */
const BOUNDARY = "ui/components/PageMark.tsx";
const BARREL = "ui/components/index.ts";
/** Where the hexes live, and the only file the boundary may take the hue from. */
const PALETTE = "ui/tokens.ts";

/**
 * Names that describe HOW a mark is drawn. None of them is exported any more,
 * so a call site referring to one is a compile error; the rule is stated anyway
 * because the compile error tells you a name is missing and this tells you why
 * it is missing and what to use instead.
 */
const PRIVATE_NAMES = [
  "PAGE_TYPE_COLOUR",
  "ORIGIN_MARK",
  "originDisc",
  "adriftRing",
  "discRadiusForRing",
  "ADRIFT_DASH",
];

/**
 * The file cut into its top-level function declarations, so a rule about one
 * rendered surface is applied to one rendered surface.
 *
 * OntologyGraph.tsx is why: it holds the figure and the key the figure needs,
 * and the key is the one place a hue may legitimately be drawn with no origin
 * beside it. A file-level rule would have to carve that file out by name, which
 * is the exact habit — guard the sites someone thought of — this whole round
 * exists to break. Anything not inside a top-level function counts as one block
 * so a fragment handed to the matcher by an anti-test is still read.
 */
function topLevelBlocks(code: string): [string, string][] {
  const starts = [...code.matchAll(/^(?:export\s+)?function\s+(\w+)/gm)];
  if (starts.length === 0) return [["<module>", code]];
  const out: [string, string][] = [];
  const head = code.slice(0, starts[0]?.index ?? 0);
  if (head.trim() !== "") out.push(["<module>", head]);
  starts.forEach((m, i) => {
    const from = m.index ?? 0;
    const to = starts[i + 1]?.index ?? code.length;
    out.push([m[1] ?? "<anonymous>", code.slice(from, to)]);
  });
  return out;
}

function boundaryOffences(rel: string, source: string): Offence[] {
  const out: Offence[] = [];
  const code = bare(source);
  const add = (rule: string, hit: string) => out.push({ rel, rule, hit });

  // 1. The hue has one reader, and the check is on the identifier: importing
  //    it, re-exporting it and indexing it are all the same offence and all
  //    have the same one syntax, which a rendering does not.
  //
  //    The re-export half is not hypothetical. graphLayout.ts held
  //    `export { PAGE_TYPE_COLOUR } from "../ui/tokens.ts"` for two rounds,
  //    "so the four call sites that already read it from this module keep
  //    working", and that pass-through is what made the hue ambient enough for
  //    four files to paint a page with and one of them to forget the origin.
  if (rel !== BOUNDARY && rel !== PALETTE) {
    for (const line of code.split("\n")) {
      if (/\bPAGE_TYPE_COLOUR\b/.test(line)) add("reads the page hue", line.trim().slice(0, 72));
    }
  }

  // 2. Nothing outside the boundary names the private encoding.
  if (rel !== BOUNDARY) {
    for (const name of PRIVATE_NAMES) {
      if (name === "PAGE_TYPE_COLOUR") continue; // covered above, with its own message
      if (new RegExp(`\\b${name}\\b`).test(code)) add("names a private encoding", name);
    }
  }

  // 3. Commission, round seven. A surface deciding a fill share or a node dash
  //    for itself. Kept because it fails by name at the offending line, where
  //    the import rule would only fail once the file also reached for the hue.
  if (rel !== BOUNDARY) {
    for (const m of code.matchAll(/fillOpacity[=:]\s*\{?\s*[\d.]/g)) {
      add("hard-coded fill share", m[0].trim());
    }
    // Edge dashes are a different channel with its own table in graphLayout.ts
    // (EDGE_STYLE), and relkey draws that table's swatches, so those two are
    // the carve-out and everything else is a node.
    if (rel !== "workbench/graphLayout.ts") {
      for (const m of code.matchAll(/strokeDasharray[=:]\s*\{?\s*["'][\d ]/g)) {
        add("hard-coded node dash", m[0].trim());
      }
      for (const m of code.matchAll(/stroke-dasharray="[\d ]/g)) {
        add("hard-coded node dash", m[0].trim());
      }
    }
  }

  // 4. Omission, round eight. Drawing a page and leaving origin off it. The
  //    boundary makes this unrepresentable through its own API, but a file can
  //    still hand-roll a `<circle>` inside a node group, so the rule stays.
  if (rel !== BOUNDARY && rel !== BARREL) {
    const readsBoundary = /PageMark|PageDisc|pageDiscSvg|OriginMark|OriginDisc/.test(code);
    if (!readsBoundary && /data-page-id/.test(code)) {
      add("renders a page with no origin channel", "data-page-id");
    }
  }

  // 5. The legend carve-out, fenced. PageTypeKeySwatch is the one form that
  //    draws a hue with no origin, and it is correct exactly once: a key
  //    defining what the hue means. A surface that renders page rows is not a
  //    key, so passing it `page.type` — the round-eight defect, in the one
  //    shape the new API still permits — fails here.
  //
  //    Per component rather than per file, because OntologyGraph.tsx holds both
  //    the figure and its key and a file-level rule fails on that legitimately.
  //    The unit the rule is actually about is one rendered surface.
  if (rel !== BOUNDARY) {
    for (const [name, block] of topLevelBlocks(code)) {
      if (/PageTypeKeySwatch/.test(block) && /data-page-id/.test(block)) {
        add("draws a key swatch on a surface that renders pages", name);
      }
    }
  }

  // 6. The words. A private table mapping an origin to prose is how one value
  //    came to have three names on one screen. The render checks above catch a
  //    slug reaching a reader; this catches a second vocabulary being built,
  //    which is the same defect one step earlier.
  if (rel !== "ui/originVocabulary.ts") {
    for (const m of code.matchAll(
      /["'](author-prior|data-driven|model-proposed)["']\s*:\s*["'`]/g,
    )) {
      add("private origin vocabulary", m[0].trim());
    }
    // The ternary form, which the table rule never saw:
    // `origin === "model-proposed" ? "the model wrote this" : …`
    for (const m of code.matchAll(
      /["'](author-prior|data-driven|model-proposed)["'][^\n]{0,30}\?\s*["'`][^"'`\n]*\s[^"'`\n]*["'`]/g,
    )) {
      add("private origin vocabulary", m[0].replace(/\s+/g, " ").trim().slice(0, 60));
    }
  }

  // 7. The same rule for the field beside it, and it had five tables to find:
  //    ProposalsTrayView's three glosses, Instrumentation's seven noun phrases
  //    and two inline de-hyphenations in each of PagePanel and OntologyGraph.
  //    Rule 6 was in place the whole time and matched none of them, because it
  //    was written about one field.
  //
  //    Keyed on the VALUE being a word rather than on the file being allowed
  //    one. tokens.ts maps the same three slugs to hexes and that is the hue
  //    table rule 1 already governs; excluding it by name would be the habit
  //    this file exists to break, so the rule asks what the table holds: a
  //    value that starts with a letter, or an object of them, is a vocabulary.
  if (rel !== "ui/pageTypeVocabulary.ts") {
    for (const m of code.matchAll(
      /["'](analytic-residue|candidate-resolution|scope-condition)["']\s*:\s*(?:["'`][A-Za-z]|\{)/g,
    )) {
      add("private page-type vocabulary", m[0].trim());
    }
  }

  // 8. The transform that hides the table. `type.replace(/-/g, " ")` is not a
  //    table and rule 7 cannot see it, and it was written out three times in
  //    two files while a fourth surface 30px away printed the slug. It is the
  //    same defect as a private table and it is worse, because it looks like a
  //    fix.
  if (rel !== "ui/pageTypeVocabulary.ts") {
    for (const m of code.matchAll(/\btype\b[\w.]*\.replace\(\s*\/-\/g/g)) {
      add("de-hyphenates a page type inline", m[0].trim());
    }
  }

  // 9. A page type rendered into JSX as the field itself. Not a template
  //    interpolation, which has legitimate uses (the frontmatter key in a wiki
  //    page file, a developer error naming an unknown value) and would need
  //    carve-outs; JSX has none, because everything in it is addressed to a
  //    person. This is what PagePanel's detail card and TwinPanel's two lists
  //    were.
  if (rel.endsWith(".tsx")) {
    for (const m of code.matchAll(/(?<![=$])\{\s*[a-zA-Z_$][\w$]*\.type\s*\}/g)) {
      add("renders a page type as the raw field", m[0].trim());
    }
  }
  return out;
}

async function scanSrc(): Promise<Map<string, string>> {
  const root = new URL("../src/", import.meta.url).pathname;
  const out = new Map<string, string>();
  for await (const rel of new Glob("**/*.{ts,tsx}").scan(root)) {
    out.set(rel, await Bun.file(`${root}${rel}`).text());
  }
  return out;
}

const SRC = await scanSrc();

/**
 * Every surface that draws a mark, derived from the source rather than listed.
 * Round seven's anti-test named its four files by hand and so could not notice
 * a fifth, which is the whole of how PagePanel got past it.
 */
function markDrawers(): string[] {
  const out: string[] = [];
  for (const [rel, source] of SRC) {
    if (rel === BOUNDARY || rel === BARREL) continue;
    if (/PageMark|PageDisc|pageDiscSvg|OriginMark|OriginDisc/.test(bare(source))) out.push(rel);
  }
  return out.sort();
}

describe("one module renders a page's identity, and it is the only one", () => {
  test("exactly one file in src reads the page hue", () => {
    const readers: string[] = [];
    for (const [rel, source] of SRC) {
      if (rel === PALETTE) continue;
      if (/\bPAGE_TYPE_COLOUR\b/.test(bare(source))) readers.push(rel);
    }
    expect(readers).toEqual([BOUNDARY]);
  });

  test("the boundary hands out no colour, no fill share and no attribute record", () => {
    // The single reader is only worth anything if it cannot pass the hue on.
    // Everything exported from here is either a component, a function returning
    // SVG text, or the PageIdentity type. An exported const or an exported
    // function whose name says "attrs" is the shape that would reopen it.
    const source = SRC.get(BOUNDARY) ?? "";
    expect(source).not.toBe("");
    const exported = [...bare(source).matchAll(/^export\s+(?:const|function|interface|type)\s+(\w+)/gm)]
      .map((m) => m[1] ?? "")
      .sort();
    expect(exported).toEqual([
      "OriginDisc",
      "OriginMark",
      "PageDisc",
      "PageIdentity",
      "PageMark",
      "PageTypeKeySwatch",
      // The size channel's legend pair, on screen and in the exported figure.
      // Same rule as every other legend form: it takes no page, so it cannot
      // draw a hue, and what leaves the module is rendered output.
      "SizeContrastKeySwatch",
      "adriftLegendSvg",
      // The legend form for a page whose recorded origin the ledger
      // contradicts. Added with the doubt channel: the bar is drawn inside this
      // module like every other mark, and the key and the exported figure get
      // rendered output rather than the weights that draw it.
      "originDoubtLegendSvg",
      "originLegendSvg",
      "pageDiscSvg",
      "pageTypeKeySwatchSvg",
      "sizeContrastLegendSvg",
      // The one export that is not a renderer, and the property it is held to
      // instead. It returns how wide the two-disc size swatch is, computed from
      // a radius and a ratio the caller passed in, so nothing private to this
      // module leaves through it: no hue, no fill share, no rim weight, no
      // attribute record. It exists because the size row is the one legend row
      // whose mark is wider than the swatch box, and a call site that guesses
      // its own indent is a call site whose text lands on the small disc.
      "sizeContrastSpan",
    ]);
    // No exported value is a plain record of numbers or colours: every one of
    // the thirteen above is a renderer, the span of a renderer's output, or the
    // type its renderers take.
    expect(bare(source)).not.toMatch(/^export\s+const\s+\w+\s*[:=]\s*\{/m);
    // And the restatement that keeps the sentence above true: the only export
    // that is not a component or an SVG-text function returns a number derived
    // from its own arguments, and that number is the width of the pair it
    // describes. Checked by calling it, because a name check would pass on a
    // function that handed back the rim weight.
    expect(sizeContrastSpan(10, 0.5)).toBeGreaterThanOrEqual(2 * 10 + 2 * 5);
    expect(sizeContrastSpan(10, 1)).toBeGreaterThan(sizeContrastSpan(10, 0.5));
  });

  test("every page form takes the type and the origin together", () => {
    // The structural half of the claim. There is no variant of the API that
    // accepts a page type on its own, so round eight's defect — hue drawn,
    // origin omitted — cannot be written down. Checked by rendering: hand each
    // page form a page and read both channels back out.
    for (const type of PAGE_TYPES) {
      for (const origin of ORIGIN_ORDER) {
        const markup = renderToStaticMarkup(createElement(PageMark, { page: { type, origin } }));
        const tag = /<circle\b[^>]*>/.exec(markup)?.[0] ?? "";
        const fill = /\bfill="([^"]+)"/.exec(tag)?.[1] ?? "";
        const drawn = discs(markup)[0];
        expect({ type, origin, hue: /^#[0-9a-f]{6}$/i.test(fill) }).toEqual({
          type,
          origin,
          hue: true,
        });
        expect({ type, origin, channel: drawn === undefined ? null : channels(drawn) }).toEqual({
          type,
          origin,
          channel: reference(origin),
        });
      }
    }
  });

  test("nothing in src reaches around the boundary", () => {
    const offenders: string[] = [];
    for (const [rel, source] of SRC) {
      for (const o of boundaryOffences(rel, source)) offenders.push(`${o.rel}: ${o.rule}: ${o.hit}`);
    }
    expect(offenders.sort()).toEqual([]);
  });

  test("nothing in src draws a page without drawing who wrote it", () => {
    // Stated separately because it is the round-eight defect and it deserves to
    // fail by name. PagePanel matched nothing in the round-seven census: it
    // hard-coded no number and invented no dash, it simply left the channel
    // out.
    const offenders: string[] = [];
    for (const [rel, source] of SRC) {
      for (const o of boundaryOffences(rel, source)) {
        if (o.rule.includes("no origin channel") || o.rule.startsWith("draws a key swatch")) {
          offenders.push(`${o.rel}: ${o.rule}`);
        }
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  test("Anti: the boundary check catches each shape it exists for", () => {
    // Fed a fabricated file of each shape. Every round of this defect shipped a
    // green check that had stopped matching the thing it was named for, so the
    // matcher is exercised rather than trusted.
    const shapes: [string, string][] = [
      [
        "reads the page hue",
        `import { PAGE_TYPE_COLOUR } from "../ui/tokens.ts";\nconst c = PAGE_TYPE_COLOUR[page.type];`,
      ],
      // The re-export, which is an import wearing a different hat and is the
      // shape graphLayout.ts held for two rounds.
      ["reads the page hue", `export { PAGE_TYPE_COLOUR } from "../ui/tokens.ts";`],
      ["names a private encoding", `const a = originDisc(page.origin, "#000");`],
      ["hard-coded fill share", `<circle fillOpacity={0.45} r={8} />`],
      ["hard-coded node dash", `<circle strokeDasharray="2 3" r={8} />`],
      // The literal round-eight offender, as it stood at PagePanel.tsx:59.
      [
        "renders a page with no origin channel",
        `<button data-page-id={page.id}>{page.title}</button>`,
      ],
      // Round eight's defect in the one shape the new API still permits.
      [
        "draws a key swatch on a surface that renders pages",
        `<button data-page-id={page.id}><PageTypeKeySwatch type={page.type} /></button>`,
      ],
      ["private origin vocabulary", `const ORIGIN_LABEL = { "author-prior": "your prior" };`],
      [
        "private origin vocabulary",
        `const w = o === "model-proposed" ? "the model wrote this" : "you did";`,
      ],
      // The five page-type shapes, each of them a thing that was actually in
      // src when this round started.
      [
        "private page-type vocabulary",
        `const PAGE_TYPE_LABEL = { "analytic-residue": "something your model doesn't absorb" };`,
      ],
      [
        "private page-type vocabulary",
        `const PAGE_PHRASE = { "analytic-residue": { a: "an analytic residue page" } };`,
      ],
      ["de-hyphenates a page type inline", `<td>{page.type.replace(/-/g, " ")}</td>`],
      ["de-hyphenates a page type inline", `const k = \`\${node.type.replace(/-/g, " ")}\`;`],
      ["renders a page type as the raw field", `<p className="muted small">{page.type}</p>`],
      [
        "renders a page type as the raw field",
        `<span className="muted">({c.type})</span>`,
      ],
    ];
    for (const [rule, source] of shapes) {
      const rules = boundaryOffences("workbench/Fabricated.tsx", source).map((o) => o.rule);
      expect({ rule, caught: rules.includes(rule) }).toEqual({ rule, caught: true });
    }
  });

  test("Anti: the check reads every source file, and a comment cannot trip it", () => {
    // Vacuity guard on the scan itself and on the comment strip: this file's
    // own subjects explain their defects in prose that names the retired
    // treatments, so a check reading comments would fail on the explanations.
    expect(SRC.size).toBeGreaterThan(60);
    expect([...SRC.keys()]).toContain("ui/components/Row.tsx");
    expect([...SRC.keys()]).toContain(BOUNDARY);
    expect(boundaryOffences("workbench/Fabricated.tsx", `/* fillOpacity: 0.45 */`)).toEqual([]);
    expect(
      boundaryOffences("workbench/Fabricated.tsx", `// "author-prior": "your prior"`),
    ).toEqual([]);
    // The boundary itself must still be reading the hue, or the whole rule is
    // satisfied by an app that draws no page at all.
    expect(bare(SRC.get(BOUNDARY) ?? "")).toContain("PAGE_TYPE_COLOUR");
  });

  test("Anti: every surface that draws a mark is rendered by this file", () => {
    // The list of surfaces the render tests above cover, held against the list
    // the source actually contains. This fails the moment a seventh surface
    // starts drawing a mark and has not been rendered here.
    expect(markDrawers()).toEqual([
      "export/diagram.ts",
      "ui/Introduction.tsx",
      // M32 R10, and it is here for its import path rather than for a mark it
      // draws: the empty state's graphic is a key swatch, which carries a hue
      // and no origin, and it reaches that swatch through PageMark.tsx because
      // that module is the boundary everything page-shaped comes out of. Held
      // to exactly that in "an empty panel's graphic asserts nothing about an
      // object" below, which is the assertion the list is asking for.
      "ui/components/EmptyState.tsx",
      // M32 R8. The row primitive draws the mark at the left of a row that is
      // about a claim, which is how the finding row above gets its second one.
      // Rendered and checked against the encoding in "the row primitive draws
      // the same disc every other surface draws" below, on the same terms as
      // every other drawer here: a mark is an assertion about an object, so a
      // new file drawing one is a new file this suite has to see.
      "ui/components/Row.tsx",
      // M30 (R10). The trajectory drawing, on Your model. It is rendered above
      // as `TRAJECTORY`, which is the same markup under a new module name: the
      // panel moved off the Design tab and left its live-page census behind,
      // because `PagePanel` prints that census one line above it now.
      // workbench/DesignCompanion.tsx drew the claims beside the step from M39 to
      // M52; its Your model choice went at M53 (ISC-541), and it draws no mark now.
      "workbench/Instrumentation.tsx",
    ]);
  });

  test("Anti: every surface that says an origin out loud is rendered by this file", () => {
    // The same guard for the words, which had no guard at all and needed one:
    // three of the five round-nine offenders were files nobody thought of as
    // origin surfaces because they draw nothing.
    const speakers: string[] = [];
    for (const [rel, source] of SRC) {
      if (rel === "ui/originVocabulary.ts") continue;
      /* M74a: the refined-by-you mark and line are this file's too. */
      if (/originLabel|originReads|originWritten|conceptMarkLabel|conceptWrittenLine/.test(bare(source))) speakers.push(rel);
    }
    expect(speakers.sort()).toEqual([
      "export/agentGraph.ts",
      // M63, ISC-613. The Report says who wrote each concept, in the export
      // register, out of `originWritten`.
      "export/conceptsExport.ts",
      "export/diagram.ts",
      "export/wikiDirectory.ts",
      // The census module writes the attribution sentence every export prints,
      // so it is a speaker and ontologyMemo.ts stopped being one: the memo used
      // to assemble "33 the researcher's prior, 33 forced by the data, …" from
      // ORIGIN_ORDER itself, over a population it did not name. The sentence and
      // its denominator are one call now. See src/ontology/attribution.ts.
      "ontology/attribution.ts",
      // The doubt sentences name the origin they qualify, so this module is a
      // speaker now. It is here rather than exempt precisely because it was the
      // last offender: `originDoubtNote` interpolated the raw stamp into
      // "Recorded as author-prior, and Abductive can't vouch for that" and put
      // it on a card two hundred pixels under a row reading "yours".
      "ontology/originAudit.ts",
      // M44. The chooser's list now holds two kinds of expectation, one from a
      // paper and one held by people in the setting, so each option says where it
      // came from. The phrase is written beside the offer it belongs to, out of
      // `originLabel`, rather than in the panel that draws the radio buttons.
      "ontology/relations.ts",
      // M63, ISC-608. A concept card says who wrote the concept (the owner's
      // "you, your data, the model") and a statement line says whose claim it
      // is, in the label register, out of `originLabel`. It draws no mark.
      "ui/ConceptsView.tsx",
      "ui/Introduction.tsx",
      // M30 (R10). The trajectory legend, on Your model rather than on Design.
      // M39, ISC-505. The provenance popover asks whose a claim is and the
      // projection answers it, so the sentence is written here rather than in
      // the component that draws it — the same split `views/anchoring.ts` and
      // `ontology/originAudit.ts` make. It is a speaker of the label register
      // and of no other, and the boundary test above proves the slug does not
      // reach the box.
      "views/provenance.ts",
      // `views/Timeline.tsx` was here and the file has been deleted. It was
      // unmounted when the ledger panel replaced it and stayed in the tree with
      // this test as its only caller.
      // workbench/DesignCompanion.tsx printed origins beside its claims until M53.
      "workbench/Instrumentation.tsx",
    ]);
  });

  test("Anti: every surface that says a page type out loud is rendered by this file", () => {
    // The same guard for the field beside it, and the reason it is worth its
    // maintenance cost is that the origin version of this list would have
    // caught this whole round on the day it was written, if it had been about
    // both words. Three of the speakers below draw nothing and are not files
    // anyone thinks of as ontology surfaces.
    const speakers: string[] = [];
    for (const [rel, source] of SRC) {
      if (rel === "ui/pageTypeVocabulary.ts") continue;
      if (/pageTypeLabel|pageTypeGloss|pageTypePhrase|untypedPagePhrase/.test(bare(source))) {
        speakers.push(rel);
      }
    }
    expect(speakers.sort()).toEqual([
      // The interviewer's digest. A model writes back the vocabulary it is
      // given, so a prompt is a surface.
      "export/diagram.ts",
      "export/wikiDirectory.ts",
      "interview/designDigest.ts",
      // M29b. The study block the paper reader is given, so it can say whether
      // a paper predicts anything about a setting like this one. A prompt is a
      // surface, and this one names every live claim by kind.
      "interview/studyContext.ts",
      // Not an ontology screen and it says the word anyway: the summary that
      // puts the researcher's account beside the modal one.
      "twin/compare.ts",
      // workbench/DesignCompanion.tsx named claim kinds until M53.
      "workbench/Instrumentation.tsx",
      "workbench/ProposalsTrayView.tsx",
      "workbench/TwinPanel.tsx",
      // M39. The map's frames are groups of one kind of claim, so the heading
      // that names a frame says the kind out loud. It comes out of this module
      // like every other speaker here: the layout writes the heading because the
      // layout is what sized the box around it, and a renderer that spelled the
      // kind itself would be the eleventh round of this defect.
    ]);
  });
});
