/**
 * Stylesheet integrity (ISC-151, ISC-152, FND-04 … FND-11).
 *
 * Not fussiness. Deleting a neighbouring block by line range once severed a
 * comment's opening `/*`, and the resulting unterminated rule silently
 * swallowed the declaration below it: a fix that had already shipped stopped
 * applying, with no error anywhere and every test still green. It was found by
 * reading a screenshot. Once is a mistake; a test is what stops the second
 * time.
 *
 * Widened at the foundations wave. There is no longer one stylesheet, there are
 * eleven, and six builders hold them separately, so every check globs the
 * directory and every failure names the file it came from. The four original
 * assertions are unchanged in what they protect; they just run per file now.
 *
 * Widened again after the first foundations pass was sent back. The gate was
 * green while four of the nine bar checks failed, because every check in this
 * file globbed `src/ui/styles/*.css` and the defects were outside that window:
 * forty live hex literals in TypeScript, two font sizes set as SVG attributes,
 * a type scale of eight steps rendering nine sizes across two screens, and
 * three measure tokens stated in the wrong unit. The last four describes below
 * are that window widened to where the defects were.
 *
 * The assertions below are each a defect a survey found that no test could
 * have caught:
 *
 *   FND-07  a hex outside tokens.css. 79 literals, 17 of them doing secondary
 *           text, six differing from a neighbour by under 3% luminance.
 *   FND-08  a var(--x) that nothing declares. `background: var(--bg)` sat on
 *           the two proposal fields the researcher is told to edit, resolved to
 *           nothing, and looked correct because the card behind it was white.
 *           Two lines of regex would have caught it the day it was written.
 *   FND-05  a bare font size outside tokens.css. 31 of them, with 0.85rem and
 *           0.82rem maintained separately at 13.6px and 13.1px.
 *   FND-10  a selector declared twice in one file, or an !important. Eleven
 *           duplicates and four plasters, three of which existed only because
 *           of a duplicate 150 lines above.
 *   split   a .css file that index.ts does not import, so a new surface cannot
 *           be added and silently orphaned.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { chroma, contrast, deltaE, luminance } from "./colour.ts";

const DIR = new URL("../src/ui/styles/", import.meta.url).pathname;

async function sheets(): Promise<readonly { file: string; css: string }[]> {
  const out: { file: string; css: string }[] = [];
  for await (const rel of new Glob("*.css").scan(DIR)) {
    out.push({ file: rel, css: await Bun.file(`${DIR}${rel}`).text() });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

const SHEETS = await sheets();
const INDEX = await Bun.file(`${DIR}index.ts`).text();

/** Comments hold the reasoning, and none of these checks are about prose. */
function strip(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every `--name: value` in tokens.css, values verbatim. */
function tokenDeclarations(): ReadonlyMap<string, string> {
  const css = strip(SHEETS.find((s) => s.file === "tokens.css")?.css ?? "");
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    out.set(m[1] ?? "", (m[2] ?? "").trim());
  }
  return out;
}

/**
 * The same map, restricted to the tokens that name a colour and with aliases
 * followed to the hex they land on. --notice is var(--ink-muted) and the three
 * --origin-* are var(--ink-*), because a token that says in its own value what
 * ramp it belongs to cannot drift off that ramp the way three loose hexes did.
 */
function tokenColours(): ReadonlyMap<string, string> {
  const raw = tokenDeclarations();
  const resolve = (value: string, depth = 0): string | null => {
    if (depth > 4) return null;
    const hex = /^#[0-9a-fA-F]{3,8}$/.exec(value.trim());
    if (hex !== null) return hex[0].toLowerCase();
    const alias = /^var\(\s*(--[a-z0-9-]+)\s*\)$/.exec(value.trim());
    if (alias === null) return null;
    const next = raw.get(alias[1] ?? "");
    return next === undefined ? null : resolve(next, depth + 1);
  };
  const out = new Map<string, string>();
  for (const [name, value] of raw) {
    const hex = resolve(value);
    if (hex !== null) out.set(name, hex);
  }
  return out;
}

test("the split produced the files it said it would", () => {
  // Guards every other assertion here against passing vacuously on an empty
  // glob, which is what would happen if the directory were renamed.
  //
  // Eleven at the split, twelve once the shared primitives were built out,
  // thirteen with the keyboard model. components.css is not a surface: it is
  // the second half of the primitive layer, and the assertion it needs is that
  // no selector appears in both it and base.css, which lives in
  // tests/primitives.test.ts beside the components it protects. keyboard.css is
  // not a surface either: it dresses the sheet, the palette and the chord chip,
  // which render over whichever surface is up (FND-02).
  //
  // The list stays exhaustive rather than becoming a length check. Naming every
  // file is what makes this a guard against an empty glob, which is the vacuity
  // it was written to catch.
  //
  // M32: fifteen. panels.css is the three-part panel grammar every study route
  // lays itself out with (R5) and rail.css is the navigation rail that replaced
  // the masthead (R2). Neither is a surface in the route sense; both are
  // structure that more than one route reads, which is why they are files of
  // their own rather than rules inside four surfaces that would then disagree.
  expect(SHEETS.map((s) => s.file)).toEqual([
    "base.css",
    "biases.css",
    // M89: coherence.css, the Checks tab's sheet, went with the tab.
    "components.css",
    // M63, ISC-609: the Emerging project ontology tab's cards, field list and map.
    "concepts.css",
    "design.css",
    "exports.css",
    "instrumentation.css",
    "intro.css",
    "keyboard.css",
    "material.css",
    "ontology.css",
    "panels.css",
    "rail.css",
    // M32 R8: rows.css, the second half of the primitive layer beside
    // components.css, not a sixteenth surface.
    "rows.css",
    "shell.css",
    "tokens.css",
  ]);
});

test("every comment is opened and closed (ISC-151)", () => {
  for (const { file, css } of SHEETS) {
    const opens = (css.match(/\/\*/g) ?? []).length;
    const closes = (css.match(/\*\//g) ?? []).length;
    expect(`${file}: ${opens} open, ${closes} closed`).toBe(`${file}: ${opens} open, ${opens} closed`);
  }
});

/**
 * A line beginning `* ` is a comment continuation everywhere except the
 * universal selector, which always carries a brace. Walk the file tracking
 * comment depth and flag any continuation sitting outside one.
 */
function danglingContinuations(css: string): readonly string[] {
  let inComment = false;
  const offenders: string[] = [];
  for (const raw of css.split("\n")) {
    const line = raw.trim();
    if (!inComment && /^\*\s/.test(line) && !line.includes("{")) {
      offenders.push(line.slice(0, 60));
    }
    const opens = (raw.match(/\/\*/g) ?? []).length;
    const closes = (raw.match(/\*\//g) ?? []).length;
    if (opens > closes) inComment = true;
    else if (closes > opens) inComment = false;
  }
  return offenders;
}

test("no dangling comment continuation sits outside a comment (ISC-152)", () => {
  const offenders = SHEETS.flatMap(({ file, css }) =>
    danglingContinuations(css).map((line) => `${file}: ${line}`),
  );
  expect(offenders).toEqual([]);
});

test("Anti: the check is not vacuous, it catches a severed comment opener", () => {
  // Exactly the shape the sed line-range delete produced.
  const severed = ` * width because each item is a flex row.\n */\n.a strong { white-space: nowrap; }\n`;
  expect(danglingContinuations(severed).length).toBe(1);
  expect(danglingContinuations("* { box-sizing: border-box; }\n")).toEqual([]);
});

test("braces balance (ISC-152)", () => {
  for (const { file, css } of SHEETS) {
    const s = strip(css);
    const open = (s.match(/\{/g) ?? []).length;
    const close = (s.match(/\}/g) ?? []).length;
    expect(`${file}: ${open}/${close}`).toBe(`${file}: ${open}/${open}`);
  }
});

/**
 * Every rule in a sheet, keyed by the at-rule it sits inside, so a media-query
 * override of a selector declared at top level is not read as a duplicate of
 * it. Commas inside `:where(...)` and `:not(...)` are not selector separators.
 */
function rules(css: string): readonly { scope: string; selector: string }[] {
  const s = strip(css);
  const out: { scope: string; selector: string }[] = [];
  const stack: string[] = [];
  let buf = "";
  for (const ch of s) {
    if (ch === "{") {
      const prelude = buf.trim().replace(/\s+/g, " ");
      buf = "";
      if (prelude.startsWith("@")) {
        stack.push(prelude);
        continue;
      }
      const scope = stack.join(" > ");
      // Split on top-level commas only.
      let depth = 0;
      let part = "";
      const parts: string[] = [];
      for (const c of prelude) {
        if (c === "(") depth++;
        else if (c === ")") depth--;
        if (c === "," && depth === 0) {
          parts.push(part);
          part = "";
        } else part += c;
      }
      parts.push(part);
      for (const p of parts) {
        const sel = p.trim().replace(/\s+/g, " ");
        if (sel !== "") out.push({ scope, selector: sel });
      }
      stack.push(`{rule}${prelude}`);
    } else if (ch === "}") {
      stack.pop();
      buf = "";
    } else buf += ch;
  }
  return out.filter((r) => !r.scope.includes("{rule}"));
}

describe("one selector, one site, per file (FND-10)", () => {
  test("no selector is declared twice in the same file and scope", () => {
    const offenders: string[] = [];
    for (const { file, css } of SHEETS) {
      const seen = new Map<string, number>();
      for (const { scope, selector } of rules(css)) {
        const key = `${scope}|${selector}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
      for (const [key, n] of seen) if (n > 1) offenders.push(`${file}: ${key} (${n} sites)`);
    }
    expect(offenders).toEqual([]);
  });

  test("Anti: the parser finds the rules it is meant to find", () => {
    // Vacuity guard. The old file had 351 selector sites; eleven files should
    // be in the same order of magnitude, and a parser returning nothing would
    // make the assertion above pass for the wrong reason.
    const total = SHEETS.reduce((n, s) => n + rules(s.css).length, 0);
    expect(total).toBeGreaterThan(250);
    // And it must actually see a repeat.
    expect(rules(".a { color: red } .a { color: blue }")).toHaveLength(2);
    // A media override of a top-level selector is not a duplicate.
    const scoped = rules(".a { color: red } @media (min-width: 1px) { .a { color: blue } }");
    expect(new Set(scoped.map((r) => `${r.scope}|${r.selector}`)).size).toBe(2);
    // A comma inside :where() is not a selector separator.
    expect(rules(":where(.a, .b) { color: red }")).toHaveLength(1);
  });

  test("no !important anywhere (FND-10)", () => {
    // There were four. Three existed only because an earlier declaration of the
    // same selector sat 150 lines above, and the fourth was replaced by raising
    // the selector's specificity to say what the plaster was saying. There is
    // no allowlist: a plaster in a split sheet is a cascade the split got
    // wrong, and the fix is the selector rather than the shout.
    const offenders = SHEETS.filter((s) => strip(s.css).includes("!important")).map((s) => s.file);
    expect(offenders).toEqual([]);
  });
});

describe("tokens.css is the only file with raw values", () => {
  test("no hex colour outside tokens.css (FND-07)", () => {
    const offenders: string[] = [];
    for (const { file, css } of SHEETS) {
      if (file === "tokens.css") continue;
      for (const m of strip(css).matchAll(/#[0-9a-fA-F]{3,8}\b/g)) offenders.push(`${file}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  test("no bare font size outside tokens.css (FND-05)", () => {
    // 31 distinct sizes went in and eight steps came out. Every font-size
    // outside the token file reads one of them, so a nineteenth value of
    // 0.85rem cannot be introduced without touching the scale on purpose.
    const offenders: string[] = [];
    for (const { file, css } of SHEETS) {
      if (file === "tokens.css") continue;
      for (const m of strip(css).matchAll(/font-size:\s*([^;}]+)/g)) {
        const value = (m[1] ?? "").trim();
        if (!value.startsWith("var(--")) offenders.push(`${file}: font-size: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * Space (FND-13, round four).
   *
   * The gap this closes, and it is the same gap the type assertions above close
   * one axis over. tokens.css tokenised type, ink, line, surface, semantic,
   * encoding, radius, container padding, measure, focus and frame, and then
   * wrote in its own header that gaps were "incidental geometry" that could
   * stay literal. Measured on the shipped sheet: 367 margin, gap and padding
   * declarations across twelve stylesheets, 23 of them reading a var() and 344
   * of them literals, spending 39 distinct values, against 105 font-size
   * declarations of which 105 read one of five steps. design.css alone spent 22
   * distinct rem values over 76 declarations, on the primary screen.
   *
   * The clusters were the exact pathology the type comment diagnoses: 0.3 /
   * 0.35 / 0.4 / 0.42 / 0.45rem is 4.8 to 7.2px over 75 uses and 0.5 / 0.55 /
   * 0.6 / 0.62 / 0.65rem is 8 to 10.4px over 78, each 2.4px end to end. Live at
   * innerWidth 1467 the gap between stacked siblings took 15 distinct values on
   * /design/context and 25 across six routes.
   *
   * Nothing failed. This file ran 900 lines and the words gap, margin and space
   * appeared in it only inside comments and one white-space fixture, which is
   * why 817 tests passed over 39 values. These four are that hole closed, in
   * the same shape as the font-size pair above: no literal outside the token
   * file, and the scale itself held to a property rather than to a count.
   */
  test("no bare margin, gap or padding outside tokens.css (FND-13)", () => {
    const PROPS =
      /(?:^|[;{\s])(margin|padding|gap|row-gap|column-gap|scroll-margin|scroll-padding)(-top|-bottom|-left|-right|-block|-inline)?:\s*([^;}]+)/g;
    const offenders: string[] = [];
    for (const { file, css } of SHEETS) {
      if (file === "tokens.css") continue;
      for (const m of strip(css).matchAll(PROPS)) {
        for (const token of (m[3] ?? "").trim().split(/\s+/)) {
          // 0, auto, a percentage, a var() and a calc() are all fine. So is a
          // negative length: nothing in a rhythm is negative, and the only one
          // in the directory is the `margin: -1px` of the .visually-hidden clip
          // idiom, which is a value the pattern requires rather than a distance
          // anyone chose. Viewport units are out of scope for the same reason:
          // `.kbd-palette { margin-top: 12vh }` is where a floating panel sits
          // in the window, not an interval between two blocks, and no step of
          // any scale could express it.
          if (/^-?[\d.]+(rem|em|px|ch)$/.test(token) && !token.startsWith("-")) {
            offenders.push(`${file}: ${m[1]}${m[2] ?? ""}: ${token}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the space scale is eight steps and no two are closer than 1.33 (FND-13)", () => {
    // Held by property rather than by count, which is the difference between
    // this and the first type scale. Eight type steps passed a count and still
    // rendered nine sizes, because four of them were 1px apart. A step nobody
    // can see is not a step: the ladder below is geometric, so 2 against 4 is a
    // doubling where 12 against 13 would have been 8%.
    const root =
      /:root \{[\s\S]*?\n\}/.exec(strip(SHEETS.find((s) => s.file === "tokens.css")?.css ?? ""))?.[0] ??
      "";
    const steps = [...root.matchAll(/--space-[a-z0-9]+:\s*([\d.]+)rem;/g)].map(
      (m) => Number(m[1]) * 16,
    );
    expect(steps).toEqual([2, 4, 8, 12, 16, 24, 32, 48]);
    for (let i = 1; i < steps.length; i++) {
      const ratio = (steps[i] ?? 0) / (steps[i - 1] ?? 1);
      expect(`${steps[i - 1]}->${steps[i]}: ${ratio.toFixed(2)}`).toBe(
        `${steps[i - 1]}->${steps[i]}: ${Math.max(ratio, 1.33).toFixed(2)}`,
      );
    }
    // And the container paddings read the ladder rather than holding numbers of
    // their own, which is what makes --column-read arithmetic: --measure-wide at
    // the body step, 448px, plus --pad-roomy on both sides.
    const raw = tokenDeclarations();
    for (const name of ["--pad-tight", "--pad", "--pad-roomy", "--shell-gutter"]) {
      expect(`${name}: ${raw.get(name)}`).toMatch(/var\(--space-/);
    }
  });

  test("leading is a token too, and every step is a whole number of pixels (FND-13)", () => {
    // The half of the space axis that hides. Ten ratios ran across 35
    // declarations with 1.45, 1.5, 1.55 and 1.6 all doing running prose, and
    // 1.55 on the body step is 21.7px, so every text block had a fractional
    // height and every element under one sat on a fractional y. A declared 12px
    // gap then measured 12.5 and rounded to 13, which is how /settings rendered
    // a 13 after all 367 spacing declarations were already on the scale.
    const offenders: string[] = [];
    for (const { file, css } of SHEETS) {
      if (file === "tokens.css") continue;
      for (const m of strip(css).matchAll(/line-height:\s*([^;}]+)/g)) {
        const value = (m[1] ?? "").trim();
        if (!value.startsWith("var(--leading")) offenders.push(`${file}: line-height: ${value}`);
      }
    }
    expect(offenders).toEqual([]);

    const raw = tokenDeclarations();
    const leading = [...raw].filter(([n]) => n.startsWith("--leading-"));
    expect(leading.length).toBeGreaterThan(4);
    for (const [name, value] of leading) {
      // --leading-flush is the unitless 1: a box that is exactly its type. Every
      // other role is a whole pixel, because a fraction anywhere in the leading
      // puts a fraction into every gap below it.
      if (name === "--leading-flush") {
        expect(value).toBe("1");
        continue;
      }
      expect(`${name}: ${value}`).toMatch(/^--leading-[a-z]+: \d+px$/);
    }
  });

  test("Anti: the space checks fire on the shapes they are meant to catch", () => {
    // Vacuity guards. Each of the three above passes on the current sheet, and
    // what a reader needs to know is that it would have failed on the one this
    // wave replaced.
    const probe = ".a { padding: 0.42rem 0.55rem; gap: 0.15rem; margin: 0 auto; }";
    const found: string[] = [];
    for (const m of probe.matchAll(
      /(?:^|[;{\s])(margin|padding|gap)(-top|-bottom)?:\s*([^;}]+)/g,
    )) {
      for (const t of (m[3] ?? "").trim().split(/\s+/)) {
        if (/^-?[\d.]+(rem|em|px)$/.test(t) && !t.startsWith("-")) found.push(t);
      }
    }
    expect(found).toEqual(["0.42rem", "0.55rem", "0.15rem"]);
    // `0` and `auto` are not offenders, or the check would be unusable.
    expect(found).not.toContain("auto");
    // And the directory really is being read: 367 declarations went in, so the
    // scan should still see a spacing declaration in most of the files.
    const withSpacing = SHEETS.filter((s) => /\n\s*(margin|padding|gap)[a-z-]*:/.test(strip(s.css)));
    expect(withSpacing.length).toBeGreaterThan(8);
  });

  test("the type scale is five steps, so no two screens can render six (FND-05)", () => {
    // The bar is at most five distinct rendered font sizes across any two
    // screens. Counting rendered sizes per route is a browser measurement and
    // cannot run here, so the property is held by construction instead: the
    // whole app renders at most as many sizes as the scale has steps, because
    // every font-size in the directory reads one of them and the assertion
    // above forbids a bare value. Eight steps rendered nine sizes across the
    // intro and the ontology tab, with four consecutive 1px steps at 11, 12,
    // 13 and 14 that nothing on screen distinguished.
    const root = /:root \{[\s\S]*?\n\}/.exec(strip(SHEETS.find((s) => s.file === "tokens.css")?.css ?? ""))?.[0] ?? "";
    // M32: six, and the count is the only thing that moved. R4 added
    // --text-micro for the register the app had no step for, the panel
    // sub-header and the column label, and it is not a seventh 1px neighbour of
    // the four the scale folded away: 11px against 13px is a 15% drop carrying
    // 0.06em of tracking. The property this test holds is unchanged and is not
    // the number six. It is that the scale is a closed, named set, that no two
    // steps resolve to the same pixel, and that the assertion above forbids a
    // bare value anywhere else in the directory, so the app can never render a
    // size the ladder does not have.
    const steps = [...root.matchAll(/(--text-[a-z]+):\s*([^;]+);/g)].map((m) => `${m[1]}: ${m[2]}`);
    expect(steps).toEqual([
      "--text-micro: 0.6875rem",
      "--text-small: 0.8125rem",
      "--text-body: 0.875rem",
      "--text-title: 1.125rem",
      "--text-head: 1.375rem",
      "--text-display: 1.75rem",
    ]);
    // No two steps may resolve to the same pixel value, which is the other way
    // a scale stops being one.
    const values = steps.map((s) => s.split(": ")[1]);
    expect(new Set(values).size).toBe(values.length);
  });

  test("the top step belongs to the intro alone (FND-05)", () => {
    // The five-step scale only bounds a pair of screens at five if the widest
    // pair actually is intro-plus-study. --text-display is what makes that
    // true: the study tabs top out at --text-head, so any two of them render
    // four, and the intro adds exactly one.
    const users = SHEETS.filter((s) => strip(s.css).includes("var(--text-display)")).map((s) => s.file);
    expect(users).toEqual(["intro.css"]);
  });

  test("Anti: those two checks fire on the shapes they are meant to catch", () => {
    expect(/#[0-9a-fA-F]{3,8}\b/.test("color: #97a1ad;")).toBe(true);
    expect(/#[0-9a-fA-F]{3,8}\b/.test("color: var(--ink-faint);")).toBe(false);
    const size = /font-size:\s*([^;}]+)/.exec("font-size: 0.85rem;")?.[1]?.trim() ?? "";
    expect(size.startsWith("var(--")).toBe(false);
  });
});

/**
 * The half of FND-07 that had no test.
 *
 * Every hex inside the thirteen stylesheets was already gone, and the header of
 * `src/ui/tokens.ts` already claimed to be "the only place in TypeScript
 * allowed a hex". Forty live literals said otherwise: eleven in
 * Introduction.tsx, eleven in export/diagram.ts, seven in Instrumentation.tsx,
 * six in OntologyGraph.tsx and three in relationGlossary.ts. The rule held
 * exactly where a test looked, and the glob was `*.css`.
 *
 * The worst of them was not a duplicate grey. Introduction.tsx drew the hero
 * figure in a fourth page-type palette and printed an origin legend in the
 * three page-TYPE hues, so the first screen in the product taught that green
 * means "from the data" and the ontology tab five minutes later showed green
 * meaning "observation".
 */
const SRC = new URL("../src/", import.meta.url).pathname;

async function tsSources(): Promise<readonly { file: string; code: string }[]> {
  const out: { file: string; code: string }[] = [];
  for await (const rel of new Glob("**/*.{ts,tsx}").scan(SRC)) {
    out.push({ file: rel, code: await Bun.file(`${SRC}${rel}`).text() });
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

const TS = await tsSources();

/** Comments hold the reasoning, including quoting the hexes that were removed. */
function stripTs(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("tokens.ts is the only TypeScript with a hex (FND-07)", () => {
  test("the scan sees the whole of src/", () => {
    // Vacuity guard, the same one the stylesheet glob has.
    expect(TS.length).toBeGreaterThan(60);
    expect(TS.some((f) => f.file === "ui/tokens.ts")).toBe(true);
  });

  test("no hex colour outside src/ui/tokens.ts", () => {
    const offenders: string[] = [];
    for (const { file, code } of TS) {
      if (file === "ui/tokens.ts") continue;
      for (const m of stripTs(code).matchAll(/#[0-9a-fA-F]{3,8}\b/g)) offenders.push(`${file}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });

  test("no font size is set as a JSX attribute (FND-05)", () => {
    // The other place a size can hide from every stylesheet check. `fontSize={11}`
    // on an SVG <text> in OntologyGraph.tsx and another in Instrumentation.tsx
    // were the sixth and seventh rendered sizes on the ontology tab, invisible
    // to the "no bare font-size" assertion because they are not CSS. Both read
    // the scale off a class now.
    const offenders: string[] = [];
    for (const { file, code } of TS) {
      for (const m of stripTs(code).matchAll(/fontSize[=:]\s*\{?\s*["']?[\d.]/g)) {
        offenders.push(`${file}: ${m[0].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every colour in tokens.ts is the value tokens.css declares", async () => {
    // The mirror existed and nothing held it to the sheet, which is how a
    // mirror stops being one. tokens.css wins; this fails when they disagree.
    //
    // Reading the sheet now resolves aliases. The check used to match only
    // `--x: #hex;` and would have reported --origin-yours as "absent" the
    // moment the sheet started writing it as var(--ink-strong), which is how
    // the ink ramp claim became something the file can be held to rather than
    // three loose hexes that happened to look like ink.
    //
    // The three --origin-* entries this list used to carry are gone because the
    // tokens are: origin stopped being a colour at round seven and became fill
    // share. The property they protected, that no origin value drifts away from
    // what the sheet declares, did not go anywhere; it moved to the mirror
    // assertion in tests/origin-boundary.test.ts, which holds ORIGIN_MARK to
    // --origin-fill-*, --origin-rim-* and --adrift-dash and additionally holds
    // every rendered mark to ORIGIN_MARK, which this check never did.
    const declared = tokenColours();
    expect(declared.size).toBeGreaterThan(20);

    const { COLOUR, PAGE_TYPE_COLOUR } = await import("../src/ui/tokens.ts");
    const expected: [string, string][] = [
      ...Object.entries(COLOUR).map(([k, v]) => [`--${k}`, v] as [string, string]),
      ...Object.entries(PAGE_TYPE_COLOUR).map(([k, v]) => [`--page-${k}`, v] as [string, string]),
    ];
    const drift = expected
      .filter(([name, value]) => declared.get(name) !== value.toLowerCase())
      .map(([name, value]) => `${name}: css ${declared.get(name) ?? "absent"} vs ts ${value}`);
    expect(drift).toEqual([]);
  });

  test("Anti: the parity check would notice a drift", async () => {
    const { COLOUR } = await import("../src/ui/tokens.ts");
    // If this ever passes, the record has stopped mirroring anything.
    expect(Object.keys(COLOUR).length).toBeGreaterThan(8);
    expect(COLOUR.accent).not.toBe(COLOUR.warn);
  });
});

/**
 * Colour means one thing (FND-04, round three).
 *
 * The gap this closes. tokens.css shipped two palettes it described as
 * "orthogonal on purpose" and made four of them the same colour: --accent was
 * byte-identical to --page-theory at #274c77, --warn to --page-puzzle, --ok to
 * --page-observation, and --notice sat 3/255 of green from
 * --page-analytic-residue, which is under one ΔE and invisible. Measured on the
 * running app, /biases painted 131 properties in rgb(39, 76, 119) including all
 * 63 grid marks, the brand, every tab, every focus ring and the primary button,
 * and /studies painted the Delete link in the puzzle hue. OntologyGraph drew
 * the flagged ring in --warn, so a green observation node wore a rust ring that
 * read as "puzzle" and a rust puzzle node wore a rust ring on a rust fill and
 * the flag disappeared.
 *
 * Nothing failed. tests/styles-integrity.test.ts asserted that tokens.ts
 * mirrored tokens.css, which both halves of the collision satisfied exactly,
 * and no test in the suite mentioned page-puzzle, page-theory or
 * page-observation at all. 810 passed over it.
 *
 * Two kinds of confusion, two assertions, because they fail differently.
 *
 * Between two coloured things the question is perceptual distance, so the bar
 * is ΔE2000 20: page types against each other, and page types against the two
 * hues the chrome is allowed to keep. Between a coloured thing and a grey one
 * the question is not distance at all, it is whether the mark has colour, and
 * ΔE understates it badly: graphite against the theory navy is only 13 apart by
 * ΔE and nobody has ever confused grey with blue. So that half is held by
 * register, a chroma ceiling on the chrome and a chroma floor on the encoding
 * with a gap between them no eye reads as one family.
 */
describe("colour means page type and nothing else (FND-04)", () => {
  const COLOURS = tokenColours();
  const RAW = tokenDeclarations();
  const named = (prefix: string) => [...COLOURS].filter(([n]) => n.startsWith(prefix));

  /** The encoding: seven hues, and the only saturated colour in the app. */
  const PAGE = named("--page-");
  /**
   * The two conventions the researcher walked in with. Ink, line and fill for
   * each, because a pale tint of a reserved hue is still that hue.
   */
  const RESERVED_NAMES = [
    "--warn",
    "--warn-line",
    "--warn-fill",
    "--ok",
    "--ok-line",
    "--ok-fill",
  ];
  const RESERVED = [...COLOURS].filter(([n]) => RESERVED_NAMES.includes(n));
  /** Everything else the interface paints itself with. */
  const QUIET = [...COLOURS].filter(
    ([n]) => !n.startsWith("--page-") && !RESERVED_NAMES.includes(n),
  );

  test("the palettes were found, and they are the size the file says", () => {
    // Vacuity guard. Every assertion below iterates these three lists, so an
    // empty one passes for the wrong reason, which is exactly the failure mode
    // this whole describe exists to end.
    expect(PAGE).toHaveLength(7);
    expect(RESERVED).toHaveLength(6);
    expect(QUIET.length).toBeGreaterThan(20);
    expect(COLOURS.get("--accent")).toBeDefined();
  });

  test("no two page types are closer than 20 ΔE", () => {
    // rival at #b07d2b and analytic-residue at #8a6d1f were 10.5 apart, which
    // is two nodes on one graph a researcher is asked to tell apart.
    const close: string[] = [];
    for (let i = 0; i < PAGE.length; i++) {
      for (let j = i + 1; j < PAGE.length; j++) {
        const [an, av] = PAGE[i] as [string, string];
        const [bn, bv] = PAGE[j] as [string, string];
        const d = deltaE(av, bv);
        if (d < 20) close.push(`${an} ${av} / ${bn} ${bv}: ΔE ${d.toFixed(1)}`);
      }
    }
    expect(close).toEqual([]);
  });

  test("no page type comes within 20 ΔE of a hue the chrome kept", () => {
    // --warn and --ok are the whole exception list. Green for a thing that
    // holds and red for a thing that destroys are conventions rather than
    // anything this tool invented, and they are the reason the encoding palette
    // moved off rust and green rather than the other way round.
    const close: string[] = [];
    for (const [pn, pv] of PAGE) {
      for (const [rn, rv] of RESERVED) {
        const d = deltaE(pv, rv);
        if (d < 20) close.push(`${pn} ${pv} / ${rn} ${rv}: ΔE ${d.toFixed(1)}`);
      }
    }
    expect(close).toEqual([]);
  });

  test("the chrome is achromatic and the encoding is not", () => {
    // The structural half. A ceiling on the furniture and a floor on the data,
    // with 17 chroma between them, so a coloured mark cannot be chrome and a
    // grey mark cannot be a page type. This is what makes the sentence in
    // tokens.css true rather than aspirational, and it is the assertion the
    // navy-everywhere build would have failed at --accent, chroma 29.
    const loud = QUIET.filter(([, v]) => chroma(v) > 12).map(
      ([n, v]) => `${n} ${v}: chroma ${chroma(v).toFixed(1)}`,
    );
    expect(loud).toEqual([]);
    const dull = PAGE.filter(([, v]) => chroma(v) < 26).map(
      ([n, v]) => `${n} ${v}: chroma ${chroma(v).toFixed(1)}`,
    );
    expect(dull).toEqual([]);
    // The tints of the two reserved hues live under the same ceiling as the
    // rest of the chrome. Only --warn and --ok themselves are exempt, because
    // they are the exception; their lines and fills are furniture like any
    // other. --ok-line shipped at chroma 14.0 for three rounds, the one value
    // in the file that broke the sentence the file was making.
    const loudTint = RESERVED.filter(([n]) => n !== "--warn" && n !== "--ok")
      .filter(([, v]) => chroma(v) > 12)
      .map(([n, v]) => `${n} ${v}: chroma ${chroma(v).toFixed(1)}`);
    expect(loudTint).toEqual([]);
  });

  test("origin spends no colour at all, and is still ordered", () => {
    // Restated, not dropped. This asserted that --origin-yours / --origin-data
    // / --origin-model were written as var(--ink-*) rather than as three loose
    // hexes, and the property it was protecting is that origin never competes
    // with page type for a channel. At round seven origin stopped being a
    // colour: the ink ramp had exactly one consumer while the intro hero, the
    // ontology graph and the SVG export each drew origin their own way, so a
    // dashed rim meant "the model proposed this" on the screen that teaches the
    // encoding and "nothing joins this page yet" on the screen that uses it.
    //
    // So the same property is now checked one step harder. No origin colour
    // token may exist at all, which is what makes it impossible for the channel
    // to come back by accident, and the fill-share scale that replaced it has
    // to be ordered the way the ramp was: the researcher's own reads strongest,
    // the model's faintest.
    const colourTokens = [...COLOURS.keys()].filter((n) => n.startsWith("--origin-"));
    expect(colourTokens).toEqual([]);

    const share = ["--origin-fill-yours", "--origin-fill-data", "--origin-fill-model"].map((n) =>
      Number(RAW.get(n)),
    );
    expect(share.every((v) => Number.isFinite(v))).toBe(true);
    expect(share[0]).toBeGreaterThan(share[1] ?? 1);
    expect(share[1]).toBeGreaterThan(share[2] ?? 1);
    // Hollow, so the last step is an absence of fill and not a pale one. A pale
    // fill is what the graph had and what nothing else agreed with.
    expect(share[2]).toBe(0);
    // And the luminance ordering the ink ramp used to carry still has a home,
    // on the ink the ramp was cut from, so this file keeps a reason to import
    // `luminance` and the ordering claim keeps a check.
    const ink = ["--ink-strong", "--ink-faint", "--ink-ghost"].map((n) =>
      luminance(COLOURS.get(n) ?? "#000000"),
    );
    expect(ink[0]).toBeLessThan(ink[1] ?? 0);
    expect(ink[1]).toBeLessThan(ink[2] ?? 0);
  });

  test("the two hues the chrome kept still carry white type and a border", () => {
    // Restating what the semantic triads were for rather than dropping it.
    // `.cg-fired`, the count on a bias-grid square, sets --notice as a
    // background under --ink-inverse, and the danger button sets --warn as a
    // border and as text on white. (It said "the badge" until coherence round
    // three: `.badge` was the other filled --notice pill and it is gone with
    // its last two callers, so the sentence named a rule the sheet no longer
    // has. The assertion is unchanged and still has a live subject.)
    expect(contrast(COLOURS.get("--notice") ?? "", "#ffffff")).toBeGreaterThan(4.5);
    expect(contrast(COLOURS.get("--warn") ?? "", "#ffffff")).toBeGreaterThan(4.5);
    expect(contrast(COLOURS.get("--ok") ?? "", "#ffffff")).toBeGreaterThan(4.5);
    expect(contrast(COLOURS.get("--accent") ?? "", "#ffffff")).toBeGreaterThan(4.5);
  });

  test("Anti: the checks fail on the palette that shipped", () => {
    // The guard that matters most here. Every assertion above passes on the
    // current file, and the question a reader should be able to answer is
    // whether it would have said anything about the previous one. These are the
    // values as shipped in round two.
    expect(deltaE("#274c77", "#274c77")).toBe(0);
    expect(deltaE("#8a6a1f", "#8a6d1f")).toBeLessThan(2.3);
    expect(deltaE("#b07d2b", "#8a6d1f")).toBeLessThan(20);
    expect(chroma("#274c77")).toBeGreaterThan(12);
    // And that it is not passing now by measuring nothing: two colours a person
    // would call clearly different have to clear the bar it enforces.
    expect(deltaE("#85306b", "#197e8d")).toBeGreaterThan(20);
    expect(chroma("#282d31")).toBeLessThan(12);
  });
});

describe("every custom property resolves (FND-08)", () => {
  const declared = new Set<string>();
  const tokens = SHEETS.find((s) => s.file === "tokens.css");
  for (const m of strip(tokens?.css ?? "").matchAll(/(--[a-z0-9-]+)\s*:/g)) declared.add(m[1] ?? "");

  test("tokens.css declares a scale rather than a handful", () => {
    // Vacuity guard: if the parse returned nothing, every var() below would
    // resolve against an empty set and the real assertion would never fire.
    expect(declared.size).toBeGreaterThan(50);
    expect(declared.has("--text-body")).toBe(true);
  });

  test("no var(--x) anywhere reads a property tokens.css does not declare", () => {
    // `background: var(--bg)` sat on .tray-item .tray-title and .tray-body and
    // resolved to nothing. It looked right because the card behind those two
    // fields is white, which is exactly why it survived. Fallbacks are read
    // too: var(--a, var(--b)) checks both.
    const offenders: string[] = [];
    for (const { file, css } of SHEETS) {
      for (const m of strip(css).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        const name = m[1] ?? "";
        if (!declared.has(name)) offenders.push(`${file}: var(${name})`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("Anti: the check catches exactly the --bg shape", () => {
    const used = [...".tray { background: var(--bg); }".matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map(
      (m) => m[1],
    );
    expect(used).toEqual(["--bg"]);
    expect(declared.has("--bg")).toBe(false);
  });
});

/**
 * A className with no rule (FND-13, round four).
 *
 * The survey counted 31 of them and three rounds later 21 were still there,
 * including `.rail-cell` itself and four of the eight `.rail-cell-*` stations
 * while the other four were styled. A class that reaches no rule is worse than
 * no class: it reads in the markup as a decision that was taken, and it renders
 * as whatever the element would have done anyway. `.turn-agent` was the most
 * common card in the transcript and its appearance was an accident of what the
 * other three turn kinds did not claim.
 *
 * Static, and it has to be: counting them in the browser is what found them,
 * but a browser is not available here and the ones a route does not render on
 * load are exactly the ones that survive a visual pass. `.page-body` needs a
 * page selected and twelve more sit behind the instrumentation toggle.
 *
 * Interpolated names are skipped rather than guessed. `rail-cell-${id}` cannot
 * be resolved from the source, so the eight it expands to are covered by the
 * eight rules the file declares and by the browser check, not by this.
 */
const INTERPOLATED = "\u0000";

describe("every className in the markup reaches a rule", () => {
  const SELECTOR_CLASSES = new Set(
    [...SHEETS.flatMap(({ css }) => [...strip(css).matchAll(/\.(-?[_a-z][\w-]*)/gi)])].map(
      (m) => m[1] ?? "",
    ),
  );

  test("the scan found both halves of what it compares", () => {
    // Vacuity guard: an empty selector set or an empty markup set makes the
    // assertion below pass for the wrong reason, which is the failure mode of
    // every check in this file.
    expect(SELECTOR_CLASSES.size).toBeGreaterThan(200);
    expect(SELECTOR_CLASSES.has("rail-cell")).toBe(true);
  });

  test("no className written in a .tsx file is missing from the directory", async () => {
    const markup: { file: string; code: string }[] = [];
    for await (const rel of new Glob("**/*.tsx").scan(SRC)) {
      markup.push({ file: rel, code: await Bun.file(`${SRC}${rel}`).text() });
    }
    expect(markup.length).toBeGreaterThan(20);

    const offenders: string[] = [];
    const seen = new Set<string>();
    for (const { file, code } of markup) {
      const source = stripTs(code);
      for (const m of source.matchAll(
        /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{[^}]*?\?\s*"([^"]*)"\s*:\s*"([^"]*)"[^}]*\})/g,
      )) {
        // `${...}` becomes a sentinel so an interpolated token can be dropped
        // whole rather than shattering into fragments like `id` or `rail-cell-`.
        const raw = [m[1], m[2], m[3], m[4]]
          .filter((s) => s !== undefined)
          .join(" ")
          .replace(/\$\{[^}]*\}/g, INTERPOLATED);
        for (const token of raw.split(/\s+/)) {
          if (token === "" || token.includes(INTERPOLATED)) continue;
          seen.add(token);
          if (!SELECTOR_CLASSES.has(token)) offenders.push(`${file}: .${token}`);
        }
      }
    }
    // The other half of the vacuity guard. If the extraction regex ever stops
    // matching, `offenders` is empty and nothing else notices. 304 distinct
    // names were written in the markup when this was added.
    expect(seen.size).toBeGreaterThan(250);
    expect([...new Set(offenders)].sort()).toEqual([]);
  });
});

describe("the cascade order is declared once and covers everything", () => {
  test("index.ts imports every .css in the directory", () => {
    // A surface file that nothing imports is invisible: the surface renders
    // unstyled and every test in this file still passes, because the file is
    // there and well formed. Six builders are about to add rules to eleven
    // files, and a twelfth arriving without an import is the failure mode.
    const missing = SHEETS.filter((s) => !INDEX.includes(`"./${s.file}"`)).map((s) => s.file);
    expect(missing).toEqual([]);
  });

  test("index.ts imports nothing that is not there", () => {
    const imported = [...INDEX.matchAll(/import\s+"\.\/([\w-]+\.css)"/g)].map((m) => m[1]);
    const present = new Set(SHEETS.map((s) => s.file));
    expect(imported.filter((f) => f !== undefined && !present.has(f))).toEqual([]);
    expect(imported).toHaveLength(SHEETS.length);
  });

  test("tokens loads first and base second", () => {
    // Nothing can read a custom property declared after it, and base.css holds
    // roles that every surface file overrides, so it has to lose on source
    // order at equal specificity.
    const order = [...INDEX.matchAll(/import\s+"\.\/([\w-]+\.css)"/g)].map((m) => m[1]);
    expect(order[0]).toBe("tokens.css");
    expect(order[1]).toBe("base.css");
  });

  test("AppShell is the only importer of a stylesheet", () => {
    // One import in the app, and it is the index. A component importing a
    // surface file directly would reintroduce the ordering ambiguity the index
    // exists to remove.
    expect(INDEX).toContain('import "./tokens.css"');
  });
});

describe("the roles the surfaces are built on exist", () => {
  const base = SHEETS.find((s) => s.file === "base.css")?.css ?? "";

  test("one global focus ring covers every focusable element (FND-03)", () => {
    // Four scoped :focus-visible rules and no global one meant the send button,
    // every decline, every rail station, every page chip and every export
    // button fell back to the UA outline, and the intro Start button on its
    // dark gradient had no focus style at all. WCAG 2.4.7.
    expect(base).toContain(
      ":where(a, button, input, select, textarea, summary, [tabindex]):focus-visible",
    );
    expect(base).toContain(".intro-hero :where(");
    expect(base).toContain(".offline-banner :where(");
  });

  test("one rule dresses every form control (FND-03)", () => {
    // The /coherence reason inputs and the /settings credential field computed
    // to border "2px inset rgb(118,118,118)" at "13.3333px Arial" because all
    // five textarea treatments were scoped to a parent those pages are not
    // inside. Checkbox, radio and file keep their native rendering on purpose.
    expect(base).toMatch(/:where\(\s*input:not\(\[type="checkbox"\]\)[\s\S]{0,140}select\s*\) \{/);
  });

  test("body carries the type anchor, and :root does not (FND-05)", () => {
    const tokens = SHEETS.find((s) => s.file === "tokens.css")?.css ?? "";
    const root = /:root \{[\s\S]*?\n\}/.exec(strip(tokens))?.[0] ?? "";
    expect(root).toContain("--text-body");
    expect(root).not.toMatch(/\n\s*font-size:/);
    expect(strip(base)).toMatch(/body \{[^}]*font-size: var\(--text-body\)/);
    expect(strip(base)).toMatch(/body \{[^}]*line-height:/);
  });

  test(".muted sets colour only and .small sets size only (FND-05)", () => {
    // The same secondary-text role rendered at two sizes depending on which
    // class an element happened to carry.
    const muted = /\.muted \{[^}]*\}/.exec(strip(base))?.[0] ?? "";
    const small = /\.small \{[^}]*\}/.exec(strip(base))?.[0] ?? "";
    expect(muted).toContain("color:");
    expect(muted).not.toContain("font-size");
    expect(small).toContain("font-size");
    expect(small).not.toContain("color:");
  });

  test("the link idiom is worn only by controls that navigate (FND-11)", () => {
    // One idiom per control kind. /studies Delete was a <button type="submit">
    // with text-decoration underline and a 1px rust border: a link idiom worn
    // by a button, sitting one grid column from the row's real link, and the
    // only underlined control label on any of the ten routes. It is the
    // btn-danger modifier now, which is what every other destructive control in
    // the app already wore.
    //
    // .linkish stays, because four controls genuinely navigate and are buttons
    // for want of a URL. What cannot come back is the pairing: a control that
    // destroys is not a control that goes somewhere.
    // strip(): this rule names the retired pairing in its own comment above,
    // and a check that reads comments would fail on the file explaining itself.
    const code = strip(base);
    expect(code).not.toContain(".linkish.danger");
    expect(code).not.toContain(".danger.linkish");
    // And it is still the only button role in base.css that underlines, or the
    // reservation above means nothing.
    //
    // Restated in round eight against the property rather than the literal
    // selector text, which is what it was always protecting. `:where(.linkish)`
    // carried the bare role's chrome reset at zero specificity and lost every
    // declaration of it to the `button` element rule, so every button.linkish
    // in the app rendered as an outlined chip; the reset moved onto the class
    // and the underline moved onto `a.linkish, button.linkish` so that one
    // selector still gets one site in the file. The rule being held is that
    // every underline in base.css belongs to the link role and to nothing else,
    // so the check is now on each selector in the list rather than on one
    // spelling of it.
    const underliners = [...code.matchAll(/([^{}]+)\{[^}]*text-decoration:\s*underline[^}]*\}/g)]
      .flatMap((m) => (m[1] ?? "").split(",").map((s) => s.trim()))
      .filter((s) => s !== "");
    expect(underliners.length).toBeGreaterThan(0);
    expect(underliners.filter((s) => !/\.linkish$/.test(s))).toEqual([]);
  });

  test("no markup pairs the link idiom with the destructive modifier", async () => {
    // The stylesheet half is above; this is the half that would have caught the
    // defect as written, because the rule that dressed Delete lived in base.css
    // and the decision to use it lived in ProjectList.tsx.
    const dir = new URL("../src/", import.meta.url).pathname;
    const offenders: string[] = [];
    let scanned = 0;
    for await (const rel of new Glob("**/*.tsx").scan(dir)) {
      const text = await Bun.file(`${dir}${rel}`).text();
      scanned++;
      for (const m of text.matchAll(/className="([^"]*)"/g)) {
        const cls = (m[1] ?? "").split(/\s+/);
        if (cls.includes("linkish") && cls.some((c) => c === "danger" || c === "btn-danger")) {
          offenders.push(`${rel}: ${m[1]}`);
        }
      }
    }
    expect(scanned).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  /* M89: "advisory findings do not borrow the destructive red (FND-04)" read
   * `.station-findings`, the step's flag panel, which went with the checks.
   * The same reservation is asserted across the directory in the describe
   * below, for every advisory state that remains. */
});

/**
 * The reserved hue means what the token file reserves it for (FND-04).
 *
 * The rule was true in prose and enforced on one selector. This is the same
 * rule enforced on every declaration in the directory, and the reason it needs
 * a list rather than a regex over selector names is that naming is the thing a
 * regex can be defeated by: a rule called `.rail-dot.flagged` reads as neutral
 * and was the worst offender in the app.
 *
 * The list is the audit. Adding a selector to it is a decision a reader can
 * see and argue with; adding `background: var(--warn)` to a stylesheet without
 * touching this file is a failing test. Every entry says what destroys, fails
 * or is refused, because that is the whole of what the hue is for.
 */
describe("the destructive red is spent on destruction and nothing else (FND-04)", () => {
  /** Innermost declaration blocks, selector by selector, at-rules unwrapped. */
  function blocks(css: string): readonly { selector: string; body: string }[] {
    const out: { selector: string; body: string }[] = [];
    for (const m of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = m[2] ?? "";
      for (const sel of (m[1] ?? "").split(",")) {
        const s = sel.trim().replace(/\s+/g, " ");
        if (s !== "" && !s.startsWith("@")) out.push({ selector: s, body });
      }
    }
    return out;
  }

  /**
   * Every selector allowed to read --warn, --warn-line or --warn-fill, and the
   * reason. Grouped the way tokens.css groups them so the two cannot drift.
   */
  const DESTRUCTIVE = new Map<string, string>([
    // A control that destroys something.
    [".btn-danger", "the delete control"],
    ["button.danger", "the delete control"],
    // `.linkish.danger` was here and is gone with the rule. It dressed /studies
    // Delete, the one control in the app that wore the link idiom without
    // navigating, and the list shrinks rather than keeping a dead entry: the
    // Anti test below treats an unused key as staleness, which is what makes
    // this list an audit rather than a permission slip.
    // A failure of the tool itself.
    [".offline-banner", "the app is serving fixtures as interview turns"],
    [".twinwarn", "reading this can damage the study, and cannot be undone"],
    // Input the field cannot accept.
    [".error", "what was typed, not what the tool will allow"],
    [".warn", "the same, as a utility class"],
    [".field-row > .field-error", "the error line under a control"],
    // M36. The same error line, on the one block in the app that sits on a
    // dark ground. --warn measures under 2:1 there, so the hero restates it in
    // --warn-line, which is the same hue family at about 9.8:1.
    [".intro-alt .error", "the error line, in the ink the hero's ground allows"],
    [
      '.field-row[data-invalid="true"] > input',
      "the control the error line belongs to",
    ],
    [
      '.field-row[data-invalid="true"] > textarea',
      "the control the error line belongs to",
    ],
    [
      '.field-row[data-invalid="true"] > select',
      "the control the error line belongs to",
    ],
    // The one severity the check layer classes as blocking, spelled out in a
    // chip beside it so the hue is never the only carrier.
    ['.finding-row[data-severity="blocking"]', "blocking severity, also spelled"],
    ['.status-chip[data-tone="warn"]', "the chip that spells it"],
    // The relation family that means opposition. Contradicting, rivalling and
    // tensioning-with are the three relations that take a claim down, which is
    // the one encoding use the convention actually covers.
    ['.relkey-family[data-family="opposes"]', "the relations that take a claim down"],
  ]);

  const offenders = SHEETS.filter((s) => s.file !== "tokens.css").flatMap(({ file, css }) =>
    blocks(css)
      .filter((b) => /var\(--warn(-line|-fill)?\)/.test(b.body))
      .filter((b) => !DESTRUCTIVE.has(b.selector))
      .map((b) => `${file}: ${b.selector}`),
  );

  test("no selector outside the destructive list paints itself --warn", () => {
    // What this would have caught, in the four rounds it did not exist:
    // design.css `.rail-dot.flagged`, five of eight station dots meaning "the
    // tool has an open question about this"; instrumentation.css `.unattended`,
    // a chunk no attention layer read; design.css `.turn-redirection`, a move
    // the tool made in the transcript; base.css `.card.challenge`, a persona
    // objection on the record.
    expect(offenders).toEqual([]);
  });

  test("Anti: the scan reads the sheets and the list is not stale", () => {
    // Vacuity guard on both halves. A parser returning nothing, or a list that
    // has outlived the rules it names, would make the assertion above pass for
    // the wrong reason.
    const seen = SHEETS.flatMap(({ css }) =>
      blocks(css)
        .filter((b) => /var\(--warn(-line|-fill)?\)/.test(b.body))
        .map((b) => b.selector),
    );
    expect(seen.length).toBeGreaterThan(8);
    const unused = [...DESTRUCTIVE.keys()].filter((k) => !seen.includes(k));
    expect(unused).toEqual([]);
    // And the parser sees a declaration inside a media query.
    expect(
      blocks("@media (min-width: 1px) { .a { color: var(--warn); } }").map((b) => b.selector),
    ).toEqual([".a"]);
  });

  test("the advisory states read --notice, by name, wherever they are drawn", () => {
    // The states the survey found in the destroy hue, asserted positively so a
    // future edit that merely deletes the --warn does not pass by leaving the
    // mark unstyled. Each of these means "the tool has something to say about
    // this", and none of them is anything the researcher has to clear.
    const advisory: readonly [string, string][] = [
      ["design.css", ".rail-dot.flagged"],
      ["ontology.css", ".page-findings"],
      ["ontology.css", ".graphkey-question"],
      ["instrumentation.css", ".unattended"],
    ];
    for (const [file, selector] of advisory) {
      const css = SHEETS.find((s) => s.file === file)?.css ?? "";
      const block = blocks(css).find((b) => b.selector === selector);
      expect(`${file} ${selector}: ${block?.body ?? "MISSING"}`).toContain("var(--notice");
    }
  });

  test("the TypeScript that draws SVG does not reach for it either", async () => {
    // The ontology's flagged marker was `stroke={COLOUR.warn}` in a component,
    // which is outside every stylesheet check in this file and is where the
    // ring survived the round that fixed the palette. Two files draw with the
    // mirror; only the relation glossary is entitled to the reserved hue, for
    // the opposition family.
    const drawn = ["src/ui/concepts/ConceptMap.tsx", "src/workbench/Instrumentation.tsx"];
    for (const rel of drawn) {
      const src = await Bun.file(new URL(`../${rel}`, import.meta.url).pathname).text();
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
      expect(`${rel}: ${code.includes("COLOUR.warn") ? "reaches for warn" : "clean"}`).toBe(
        `${rel}: clean`,
      );
    }
  });

  test("the station mark is a shape before it is a colour", () => {
    // The other half of the same defect. The four rail states were 7px pills at
    // L* 41.5, 41.7, 40.2 and one light grey: a 1.5 L* spread end to end and
    // 0.24 between "you have said something here" and "the tool has a question
    // about this", so greyscale, a photocopy and the commonest colour blindness
    // each collapsed three of the four states of the app's primary progress
    // indicator into one identical dot. tokens.css already forbids exactly this
    // on the bias grid, in its own words, "because the page gets printed and
    // checked on paper".
    const rail = Bun.file(new URL("../src/flow/StationRail.tsx", import.meta.url).pathname);
    return rail.text().then((src) => {
      const marks = /const STATE_MARK[\s\S]*?\};/.exec(src)?.[0] ?? "";
      const glyphs = [...marks.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
      // M69, ISC-641: three states since the set-aside left the rail, each its own glyph.
      expect(glyphs).toHaveLength(3);
      expect(new Set(glyphs).size).toBe(3);
      // And every one of them is defined somewhere the researcher can read it.
      expect(src).toContain('className="rail-legend"');
    });
  });

  test("the two encodings the marks share have a legend on the page that draws them", () => {
    // /biases painted two column families in two near-whites and legended the
    // four glyphs directly below them and not the grounds behind them; the
    // ontology drew hue, fill depth, a dashed rim and the question mark onto
    // its circles and legended only the lines, and only once an edge existed,
    // which on a fresh study is never.
    const biases = SHEETS.find((s) => s.file === "biases.css")?.css ?? "";
    expect(biases).toContain(".cg-legendtint");
    const ontology = SHEETS.find((s) => s.file === "ontology.css")?.css ?? "";
    expect(ontology).toContain(".graphkey");
  });
});

describe("responsive behaviour exists above 1100px", () => {
  test("something changes between 1024 and 1440 (DSN-04)", () => {
    // There was no media query above 1100px anywhere in 989 lines, so
    // scrollHeight was byte-identical at 1024 and 1440 and the workbench left
    // 435px of dead gutter while its textareas ran 130 characters per line.
    const wide = SHEETS.flatMap(({ file, css }) =>
      [...strip(css).matchAll(/@media\s*\(min-width:\s*(\d+)px\)/g)].map((m) => ({
        file,
        px: Number(m[1]),
      })),
    ).filter((q) => q.px > 1100);
    expect(wide.length).toBeGreaterThan(0);
  });

  test("prose is capped by a measure token, not by the viewport", () => {
    // The cap is what makes the extra width safe: it goes to the interface
    // rather than to longer lines.
    const uses = SHEETS.flatMap(({ css }) => [
      ...strip(css).matchAll(/max-width:\s*var\(--measure/g),
    ]);
    expect(uses.length).toBeGreaterThan(15);
  });

  test("the measure caps prose and releases containers (FND-13)", () => {
    // Restating what `p, li, dd { max-width: var(--measure-wide) }` protected
    // rather than dropping it. It protected that a run of prose has a cap
    // without a surface having to remember one, and it still does; the check
    // above counts the caps and this one keeps the element rule in place.
    //
    // What changed is the specificity, and the reason is a defect the cap
    // caused rather than prevented. At 0-0-1 it reached list items that are
    // cards, so measured at innerWidth 1467 the /ontology tracks were 596px and
    // every painted child stopped at 448: four right edges in one view and a
    // 148px dead strip beside each card. On /design/context the three two-track
    // rail cells stopped at 448 inside 605, which put Context, the hub and
    // Outcome on an axis 79px left of the one Site and Process establish.
    const base = strip(SHEETS.find((s) => s.file === "base.css")?.css ?? "");
    expect(base).toMatch(/:where\(p, li, dd\) \{[^}]*max-width: var\(--measure-wide\)/s);
    // And the container role takes its track back, once, where the alias list
    // already lives. Without this the release is 21 scattered opt-outs.
    const surface = /\.surface,[\s\S]*?\n\}/.exec(base)?.[0] ?? "";
    expect(surface).toContain(".tray-item");
    expect(surface).toContain("max-width: none");
  });

  test("the measures are stated in a unit that means characters (DSN-05)", () => {
    // Restated, not weakened. The assertion used to pin the three tokens to
    // 60ch, 68ch and 78ch, which protected that the caps exist and are the
    // numbers the comment claims. It protects the same thing, against the
    // defect that made those exact numbers wrong: `ch` is the advance of the
    // digit zero, about 1.37 times the average advance of English prose in
    // system-ui, so 78ch rendered 107 characters and every "capped" block on
    // /settings, /biases and /coherence sat between 106 and 110. Measured in
    // em, an English character averages 0.459em on this app's own prose, so
    // the bound below is what keeps the widest measure under the 80-character
    // bar with room for text whose letters run narrower than average.
    const root = /:root \{[\s\S]*?\n\}/.exec(strip(SHEETS.find((s) => s.file === "tokens.css")?.css ?? ""))?.[0] ?? "";
    const measures = [...root.matchAll(/--measure(?:-tight|-wide)?:\s*([\d.]+)(\w+);/g)];
    expect(measures).toHaveLength(3);
    for (const [, size, unit] of measures) {
      expect(unit).toBe("em");
      // 0.459em per character, measured; 80 characters is the bar.
      expect(Number(size) / 0.459).toBeLessThan(80);
    }
  });
});

/**
 * The frame (FND-12).
 *
 * The token layer named ink and type and never named a frame, so the persistent
 * chrome moved with the content. .shell had four max-widths, three of them
 * selected by :has() on whatever the view below happened to be, and the app bar
 * and the study tab strip are children of .shell. Measured at innerWidth 1467
 * before this: the brand and the six study tabs at x=32 on Design, x=226 on
 * Ontology, Biases, Material and Exports, x=398 on Coherence, x=196 on the
 * intro, and the settings link at 1347 / 1153 / 981 / 1183. Design to Coherence
 * slid the whole navigation 366px right.
 *
 * Measured after: shell [94,1280], app bar [126,1216], tab strip [126,1216],
 * brand x=126 w=67, Studies x=217 w=51, settings x=1250 w=92, and the six tabs
 * at 126 / 187 / 262 / 321 / 408 / 477, identical on all nine routes.
 *
 * Geometry cannot be asserted from here, so what is asserted is the structure
 * that produced it: one width authority, unreachable from inside.
 */
describe("the frame does not move (FND-12)", () => {
  const all = SHEETS.map((s) => strip(s.css)).join("\n");
  const tokens = strip(SHEETS.find((s) => s.file === "tokens.css")?.css ?? "");
  /** Every rule in the directory as {selector, body}, at-rules flattened. */
  const declarations = SHEETS.flatMap(({ file, css }) =>
    [...strip(css).matchAll(/([^{}]*)\{([^}]*)\}/g)].map((m) => ({
      file,
      selector: (m[1] ?? "").trim().replace(/\s+/g, " ").replace(/^.*\{/s, "").trim(),
      body: m[2] ?? "",
    })),
  );

  test("the frame is one token and the retired authorities are gone", () => {
    // Six width tokens with no rule about which wrapped which. Three levels
    // now, and the outer one is named once.
    expect(tokens).toContain("--frame-max:");
    const retiredNames = [
      "--shell-max",
      "--shell-max-wide",
      "--shell-max-read",
      "--column-max",
      "--rail-max",
    ];
    const survivors = retiredNames.filter(
      (name) => all.includes(name + ":") || all.includes("var(" + name + ")"),
    );
    expect(survivors).toEqual([]);
  });

  test("nothing sets a width on the frame, and --frame-max reaches only reading", () => {
    // M32, R1. Restated, and the restatement is stronger than what it replaces.
    //
    // This used to require exactly one rule setting `.shell`'s width, reading
    // `var(--frame-max)`. The defect it was written against was that four rules
    // had an opinion about the frame and three of them read the content below,
    // which slid the whole navigation 366px right between two tabs. Pinning the
    // width to one rule fixed that and left the frame a centred 1120px article
    // column on a 1440px window, which is the silhouette the M32 critique
    // measured as the single largest cause of the app reading as a website.
    //
    // The frame is the viewport now: `.shell` is a two-track grid at 100dvh and
    // sets no width at all. So the property is the same one, one level further
    // on. Nothing may give the frame a width, and --frame-max survives with a
    // narrowed job, capping the two surfaces that are genuinely a run of
    // reading. A route class, a :has() variant or a media-query override on
    // `.shell` still fails here, and so does a surface helping itself to the
    // frame token.
    // `\.shell\b` would match `.shell-content` and `.shell-body`, because a
    // hyphen is a word boundary, and `width:` would match their `min-width: 0`.
    // Neither is a width on the frame: one is the scroll box's shrink guard and
    // the other is the cell it wraps. The frame is `.shell` exactly.
    const framed = declarations.filter(
      (r) =>
        /(^|[\s,>+~])\.shell(?![\w-])/.test(r.selector) &&
        /(?:^|[^-])\b(?:max-width|width):/.test(r.body),
    );
    expect(framed.map((r) => r.file + ": " + r.selector)).toEqual([]);

    // The rail's two widths are read by the grid template and by nothing else,
    // for the reason the frame token exists: the chrome must not be able to
    // decide the frame from inside it.
    const shell = strip(SHEETS.find((s) => s.file === "shell.css")?.css ?? "");
    expect(shell).toMatch(/\.shell \{[^}]*grid-template-columns: var\(--rail-w\)/s);
    expect(shell).toMatch(/\.shell \{[^}]*height: 100dvh/s);
    const railWidthSetters = declarations
      .filter((r) => /var\(--rail-w/.test(r.body))
      .map((r) => r.file + ": " + r.selector);
    expect(railWidthSetters).toEqual(["shell.css: .shell", 'shell.css: .shell[data-rail="collapsed"]']);

    // And the reading cap: every rule that reads --frame-max, named, so a third
    // surface helping itself to it is a line in a diff rather than a silent
    // return of the centred column.
    const readers = declarations
      .filter((r) => r.body.includes("var(--frame-max)"))
      .map((r) => r.file + ": " + r.selector);
    expect(readers).toEqual(["shell.css: .shell-body > .intro, .shell-body > .auth-panel"]);
  });

  test("no bar can set its own width, because they are all children of it", () => {
    // The chrome is inside .shell, so a width on any bar is the same defect
    // one level down. Inner elements are not covered and should not be: the
    // research question truncates at a measure on purpose.
    // M32: `.appbar` became `.navrail`, and the rule it is held to is the same
    // one. The rail's width is the grid template's, in `.shell`, checked above.
    // M41: `.framing` joins them. It is the third piece of persistent chrome — the
    // footer dock the owner asked for, "a bar just like the menu bar at the left but
    // as a footer bar" — so it is held to the rail's rule for the rail's reason: its
    // width is the grid track's and it may not decide the frame from inside it. Its
    // height it does decide, and only as a ceiling: `max-height` caps how much of
    // the window an open framing may take, and the content below that is what sets
    // the row.
    /* M53: ".framing" left this list with the dock (ISC-540). The page that replaced
     * it is ".motivation", a route body and not a bar, checked below. */
    const BARS = [".navrail", ".studybar", ".studybar-tabs", ".studybar-head"];
    /* The same pattern the frame's own check uses two tests up, and for the reason
     * written there: `min-width: 0` is a shrink guard and not a width, so a bare
     * `width:` would match it. It had never mattered, because none of the four bars
     * this list held needed one; the dock does, for the same reason
     * `.shell-content` does. */
    const setsWidth = (body: string) => /(?:^|[^-])\b(?:max-width|width):/.test(body);
    const offenders = declarations
      .filter((r) => BARS.includes(r.selector) && setsWidth(r.body))
      .map((r) => r.file + ": " + r.selector);
    expect(offenders).toEqual([]);
    /* The theoretical motivation is the content cell's body since M53, so it may
     * not set its own width either: FND-12 says the frame is the cell. */
    const page = declarations.find((r) => r.selector === ".motivation");
    expect(page).not.toBeUndefined();
    expect(setsWidth(page?.body ?? "")).toBe(false);
  });

  test("the dock's rules and properties went with the dock (M53, ISC-540)", () => {
    // M45 held the dock's height to one property read by two ceilings. The dock is
    // a tab now, so the property, the two ceilings and the bar are all gone, and a
    // leftover would be a rule for an element nothing renders.
    const tokens = tokenDeclarations();
    expect(tokens.get("--framing-height")).toBeUndefined();
    expect(tokens.get("--framing-bar-h")).toBeUndefined();
    for (const gone of [".framing", ".framing-body", ".framing > summary", ".framing-dock-preview"]) {
      expect({ gone, found: declarations.some((r) => r.selector.split(",").map((x) => x.trim()).includes(gone)) })
        .toEqual({ gone, found: false });
    }
    // And no framing rule sizes itself against the window.
    const offenders = declarations
      .filter((r) => r.selector.includes("framing") && /\d(?:dvh|vh)\b/.test(r.body))
      .map((r) => `${r.file}: ${r.selector}`);
    expect(offenders).toEqual([]);
  });

  test("Anti: the parser sees both rules when a second one is added", () => {
    // Vacuity guard for the two assertions above: an expression that matched
    // one rule and stopped would pass them for the wrong reason.
    const probe = ".shell { max-width: var(--frame-max); } .shell:has(.x) { max-width: 46rem; }";
    const found = [...probe.matchAll(/([^{}]*)\{([^}]*)\}/g)].map((m) => (m[1] ?? "").trim());
    expect(found).toEqual([".shell", ".shell:has(.x)"]);
    expect(declarations.length).toBeGreaterThan(250);
  });
  test("the current-page weight cannot move the bar", () => {
    // The residual once the frame was pinned: weight 600 makes a link 2 to 4px
    // wider than its resting state, which shifted every item to its right.
    // Ontology sat at x=187 with Design current and x=185 with Coherence
    // current. Each item reserves its own bold width off data-label.
    // M32: one caller, not two. The app bar became a vertical rail, where each
    // item is a row of its own and a weight change moves nothing to its right,
    // so the reservation is not needed there and is not carried there. The five
    // study tabs are still a horizontal strip and still take it.
    const shell = strip(SHEETS.find((s) => s.file === "shell.css")?.css ?? "");
    expect(shell).toContain("content: attr(data-label)");
    expect(shell).toMatch(/\.studybar-tabs a\b[^{]*\{[^}]*display: inline-grid/s);
    const rail = strip(SHEETS.find((s) => s.file === "rail.css")?.css ?? "");
    expect(rail).not.toContain("attr(data-label)");
  });
});

/**
 * A sticky bar is the top layer of the box it is stuck to (D4, M43).
 *
 * The study bar and the round `?` anchored to a pane's top-right corner were
 * both at z-index 2. A tie goes to whatever paints last, which is the chip,
 * and the chip sits in a pane that scrolls up under the bar. The walk of
 * 2026-09-13 read the result off the Material tab: at 120px of the content
 * cell's scroll the chip sat at (579, 18) over an h1 at (581, 16), so the page
 * heading rendered "M(?)terial" and `elementFromPoint` at the chip's centre
 * returned the chip rather than the title.
 *
 * Two numbers in two files, neither wrong on its own, which is the shape a
 * source scan catches and a rendered test cannot: happy-dom lays nothing out
 * and paints nothing, so the only mechanical hold on this is the pair.
 */
describe("what scrolls under a sticky bar paints under it (D4)", () => {
  /** The z-index declared on one selector in one sheet. */
  function layerOf(file: string, selector: string): number {
    const css = strip(SHEETS.find((s) => s.file === file)?.css ?? "");
    const rule = new RegExp(`\\${selector} \\{[^}]*\\}`, "s").exec(css)?.[0] ?? "";
    expect({ selector, found: rule !== "" }).toEqual({ selector, found: true });
    const z = /z-index:\s*(-?\d+)/.exec(rule)?.[1];
    expect({ selector, declares: z !== undefined }).toEqual({ selector, declares: true });
    return Number(z);
  }

  /* M62, ISC-600: the pane help chip is gone; the page's Help control sits in
   * the study bar itself, so nothing of it scrolls under the bar. */
  test("the study bar holds the page's Help control rather than a chip under it", () => {
    const panels = SHEETS.find((s) => s.file === "panels.css")?.css ?? "";
    expect(panels).not.toContain(".panel-help {");
    expect(panels).toContain(".page-help-panel {");
  });

  test("the study bar still sits under the dialogs and the palette", () => {
    // One step above the pane chrome, not a new ceiling. Everything genuinely
    // over this bar is a dialog, a popover or the palette.
    const bar = layerOf("shell.css", ".studybar");
    expect(bar).toBeLessThan(30);
  });

  test("the bar is opaque, so what passes under it is hidden rather than mixed", () => {
    const shell = strip(SHEETS.find((s) => s.file === "shell.css")?.css ?? "");
    const rule = /\.studybar \{[^}]*\}/s.exec(shell)?.[0] ?? "";
    expect(rule).toContain("background: var(--paper)");
    expect(rule).toContain("position: sticky");
  });
});

/**
 * The answer boxes take the track, and stop at a measure (D13, M43).
 *
 * M39 refused to stretch the station's textarea to its card because that would
 * have put 89 characters on a line the measure tokens hold at 70, and gave the
 * width to a second column instead. That decision stands. What the walk of
 * 2026-09-13 measured is what the 448px cap costs a long answer: at innerWidth
 * 1600 a 4,000-character answer rendered 448 by 1341 inside a 708px pane, a
 * ribbon down the left of a mostly empty window.
 *
 * 36em is 504px at the control's 14px, which is 75 characters in the app's own
 * font: inside the 80-character bar tokens.css states, and short of the 89 M39
 * refused. The unit is the load-bearing part and is what this pins. A rem is
 * 16px, so 36rem would be 576px and 86 characters, over the bar; every measure
 * in this app is stated in em so the cap follows the control's own size.
 */
describe("the answer boxes are capped in em, not rem (D13)", () => {
  const design = strip(SHEETS.find((s) => s.file === "design.css")?.css ?? "");
  const rule = /\.answer-box textarea,\s*\.station-answer textarea \{[^}]*\}/s.exec(design)?.[0] ?? "";

  test("one rule caps both boxes in the column", () => {
    // base.css: "a card holding an input above a textarea had two right edges by
    // construction". The chat box and the saved answer sit one above the other.
    expect(rule).not.toBe("");
    expect(rule).toContain("max-width: 36em");
  });

  test("the cap is em, so it follows the control's own size", () => {
    expect(rule).not.toContain("rem");
    expect(/max-width:\s*36em\s*;/.test(rule)).toBe(true);
  });

  test("36em on a 14px control is inside the 80-character bar", () => {
    /* The arithmetic tokens.css states: the app's average advance at 14px is
     * 0.459em, so a cap in em is its own em value divided by that. Written out
     * rather than asserted as a pixel width, because the pixels change with the
     * control's font and the character count is what the bar is about. */
    const perChar = 0.459;
    expect(Math.round(36 / perChar)).toBeLessThanOrEqual(80);
    // And what the other unit would have given, which is why the unit is pinned.
    const asRem = (36 * 16) / 14;
    expect(Math.round(asRem / perChar)).toBeGreaterThan(80);
  });

  test("nothing caps the height, so a long answer is never cut", () => {
    expect(rule).not.toContain("max-height");
    expect(rule).not.toContain("overflow");
  });
});

describe("sticky is only safe alone in a column", () => {
  const all = SHEETS.map((s) => strip(s.css)).join("\n");

  test("the station is not sticky, because the dialogue sits below it (ISC-233)", () => {
    // It was sticky from M8, when the station was the only thing in its column.
    // The dialogue moved in below it at M14 and the transcript then scrolled
    // underneath an opaque panel. Reported as "the text is scrolling underneath
    // the items", and invisible to every test in the suite.
    //
    // The rule moved to design.css at the split and its background, border and
    // radius moved to the .surface role in base.css, so the original probe for
    // "border-radius" no longer proves the regex matched. It probes the padding
    // the rule still declares, which is the same guard against a vacuous pass.
    const rule = /\.station \{[^}]*\}/s.exec(all)?.[0] ?? "";
    expect(rule).toContain("padding");
    expect(rule).not.toContain("position: sticky");
  });

  test("the step sits alone in its pane, and nothing lands by accident (D4, M37, M89)", () => {
    /* The CSS half of the sibling move asserted in flow-discipline.test.ts.
     *
     * Rewritten at M37, and the two layouts it has pinned are worth keeping in
     * view. D4 replaced a three-column pane whose reading order was what you
     * commit, what you commit again, a 17rem column of prose about the tool,
     * and only then what the tool found. What replaced it was two columns: the
     * step on the left, the conversation and the findings stacked on the right.
     *
     * M37 collapses that to one column, because the conversation moved inside
     * the step's card. The step's question, the conversation about it, the box
     * you type in and the answer as it stands are one act read top to bottom,
     * and splitting them across two columns puts the box you type in beside the
     * box the answer lands in.
     *
     * The property being pinned has not moved: a grid child with no area lands
     * wherever the auto-placer reaches first, which put "Nothing open at this
     * station" in the first 392px of a 1216px row once. So both areas are named
     * and the findings come after the step.
     */
    const design = SHEETS.find((s) => s.file === "design.css")?.css ?? "";
    const templates = [...strip(design).matchAll(/grid-template-areas:([^;]*);/g)].map((m) =>
      (m[1] ?? "").replace(/\s+/g, " ").trim(),
    );
    /* M89: the findings area went with the step's flag panel and the checks, so
     * the pane names the step alone and no template names a findings track. */
    const paneTemplates = templates.filter((t) => t === '"station"');
    expect(paneTemplates).toHaveLength(1);
    expect(templates.filter((t) => t.includes("findings"))).toEqual([]);
    // The dialogue is inside the step now, so a grid area naming it would be a
    // track nothing can ever land in.
    expect(strip(design)).not.toContain("grid-area: dialogue");
    // The 17rem third column is gone outright rather than left declared and
    // unreferenced, which is how a retired layout comes back.
    expect(strip(design)).not.toContain("17rem");
    // The aside's own selectors go outright rather than being left declared
    // and unreferenced, which is how a retired layout comes back. Its one
    // paragraph kept a rule and was renamed with it.
    expect(strip(design)).not.toContain(".station-aside ");
    expect(strip(design)).not.toContain(".station-aside{");
    expect(strip(design)).not.toContain(".station-aside-head");
    expect(strip(design)).not.toContain(".station-framing");
  });

  test("a rule id never breaks inside itself (round ten)", () => {
    /* coherence.css says in writing that "half an id is no use" to a researcher
     * quoting the check they want to argue with, and on /design/tension at 1440
     * "phenomenon-troubling-no-theory" wrapped at its own hyphen to
     * "phenomenon-troubling-no-" / "theory". A hyphen is a break opportunity by
     * default, so the Coherence tab's `flex: none` did not help: the item was
     * not being squeezed, the text was being allowed to break inside itself.
     * This is a property of the identifier, so it is on the primitive. */
    const base = strip(SHEETS.find((s) => s.file === "base.css")?.css ?? "");
    const rule = /\.finding-rule \{[^}]*\}/.exec(base)?.[0] ?? "";
    expect(rule).toContain("white-space: nowrap");
  });

  test("nothing inside the station column is sticky or fixed (ISC-234)", () => {
    // The general form of the same defect: a sticky element only behaves while
    // nothing shares its scroll container.
    let found = 0;
    for (const selector of [".station", ".station-pane", ".dialogue", ".transcript"]) {
      const rule = new RegExp(`\\${selector} \\{[^}]*\\}`, "s").exec(all)?.[0] ?? "";
      expect(rule).not.toMatch(/position:\s*(sticky|fixed)/);
      found += rule === "" ? 0 : 1;
    }
    expect(found).toBeGreaterThan(0);
  });
});

/**
 * A container role written as a <p> keeps a measure cap.
 *
 * The defect, and why it has now been reported twice. `.surface` and its alias
 * list take `max-width: none`, because a box is not a sentence: eleven of those
 * roles render as list items and the prose cap was stopping them at 448px
 * inside tracks of 596. Two of the roles are written as `<p>`, so for those two
 * the alias list took the cap off the only run of text they hold and there was
 * no inner element left to put it back on. Measured on /design/tension at 1440,
 * `p.open-elsewhere.small` ran 566px of 13px text, 94 characters to the line
 * against a bar of 80, and it was the one prose measure violation in the app.
 *
 * The fix was a rule, `p:where(.open-elsewhere, …) { max-width: var(--measure-wide) }`,
 * and a rule is exactly what came back: the next role added to the alias list
 * and rendered as a `<p>` reopens it, silently, and the only way anyone finds
 * out is by measuring the running app again. So the two lists are held against
 * each other and against the markup: a class in the box list that any component
 * renders on a `<p>` must be in the measure list.
 */
describe("a container role written as a <p> keeps its measure (FND-11)", () => {
  const base = strip(SHEETS.find((s) => s.file === "base.css")?.css ?? "");

  /** The alias list inside `.surface, :where( … ) { … max-width: none }`. */
  const boxRoles = (): Set<string> => {
    const block = /\.surface,\s*:where\(([\s\S]*?)\)\s*\{/.exec(base)?.[1] ?? "";
    return new Set([...block.matchAll(/\.([a-z0-9-]+)/g)].map((m) => m[1] ?? ""));
  };

  /** The classes the `p:where( … )` rule puts a measure back on. */
  const cappedRoles = (): Set<string> => {
    const block = /p:where\(([^)]*)\)\s*\{[^}]*max-width/.exec(base)?.[1] ?? "";
    return new Set([...block.matchAll(/\.([a-z0-9-]+)/g)].map((m) => m[1] ?? ""));
  };

  /** Every class any component renders directly on a `<p>` element. */
  const paragraphClasses = async (): Promise<Set<string>> => {
    const root = new URL("../src/", import.meta.url).pathname;
    const out = new Set<string>();
    for await (const rel of new Glob("**/*.tsx").scan(root)) {
      const source = await Bun.file(`${root}${rel}`).text();
      for (const m of source.matchAll(/<p\b[^>]*className="([^"]+)"/g)) {
        for (const cls of (m[1] ?? "").split(/\s+/)) if (cls !== "") out.add(cls);
      }
    }
    return out;
  };

  test("every box role rendered as a paragraph is in the measure list", async () => {
    const boxes = boxRoles();
    const capped = cappedRoles();
    const paragraphs = await paragraphClasses();
    const uncapped = [...boxes].filter((cls) => paragraphs.has(cls) && !capped.has(cls)).sort();
    expect(uncapped).toEqual([]);
  });

  test("Anti: all three readers found something to read", () => {
    // Every one of these checks passes vacuously if a regex stops matching, and
    // a silently vacuous measure check is exactly what let 94 characters to the
    // line ship. The numbers are floors, not counts, so adding a role does not
    // fail this.
    const boxes = boxRoles();
    const capped = cappedRoles();
    expect(boxes.size).toBeGreaterThan(10);
    // M84, ISC-706: the open-elsewhere line went; `commitment` is a box role written as a <p> too.
    expect(boxes).toContain("commitment");
    expect(capped.size).toBeGreaterThan(2);
    expect(capped).toContain("commitment");
  });

  test("the markup reader finds the paragraph the defect was measured on", async () => {
    const paragraphs = await paragraphClasses();
    expect(paragraphs.size).toBeGreaterThan(10);
    // M84, ISC-706: the paragraph the defect was measured on went with the line it
    // carried; the rule above still holds the measure for any role that comes back as a <p>.
    expect(paragraphs).not.toContain("open-elsewhere");
  });
});

/**
 * A fold looks like a fold (MAT-04).
 *
 * The defect, measured in Chrome on /material: five <details>, every summary
 * computing `display: flex` because every one of them lays a row out, and
 * `list-style-type: disclosure-closed` on all five with nothing painting it. A
 * summary that takes a display value of its own drops its ::marker in Chrome,
 * and no rule in the directory put one back, so a document row was a filename
 * and five chips and the three passages of the study sat behind two folds
 * neither of which was marked. The single <details> on /exports computes
 * `display: list-item` and painted its triangle, so one pair of screens carried
 * two answers to the same question.
 *
 * Nothing failed. Every check in this file was about tokens, duplicates, hexes
 * and measures, and none of them could see a control that had quietly stopped
 * having an affordance.
 *
 * Held by construction rather than by counting rendered markers, for the same
 * reason the type scale is: the marker is declared once for `details > summary`
 * at element level, so a surface gets it whether its author thought about it or
 * not, and the assertions below are the four things that would each silently
 * remove it again.
 */
describe("every fold in the app carries a mark that says it opens (MAT-04)", () => {
  const BASE = strip(SHEETS.find((s) => s.file === "base.css")?.css ?? "");

  test("the marker is drawn by the app, at element level, for every summary", () => {
    // Not `.disclosure > summary`, not `.corpus-doc > summary`. A class-scoped
    // marker is a marker the next surface forgets.
    expect(BASE).toMatch(/details > summary::before \{[^}]*content: "";/);
    expect(BASE).toMatch(/details > summary::before \{[^}]*mask: var\(--marker-chevron\)/);
    // currentColor, so a fold on any surface gets the ink of its own summary.
    expect(BASE).toMatch(/details > summary::before \{[^}]*background-color: currentColor;/);
  });

  test("the native marker is switched off wherever ours would double it", () => {
    expect(BASE).toMatch(/details > summary \{[^}]*list-style: none;/);
    expect(BASE).toContain("details > summary::-webkit-details-marker");
  });

  test("open and closed are different marks, and the row answers a pointer", () => {
    expect(BASE).toMatch(/details\[open\] > summary::before \{[^}]*transform: rotate\(90deg\);/);
    expect(BASE).toMatch(/details > summary:hover \{[^}]*background: var\(--surface-sunken\);/);
    expect(BASE).toMatch(/details > summary:hover::before \{[^}]*background-color: var\(--accent\);/);
    expect(BASE).toMatch(/details > summary \{[^}]*cursor: pointer;/);
  });

  test("no stylesheet takes the mark away again", () => {
    // The four shapes that would. `content: none` and `display: none` on the
    // pseudo-element, and `mask: none`, are how a surface would blank it; a
    // summary that re-declares `list-style` to something visible would put the
    // native triangle back beside ours.
    const offenders: string[] = [];
    for (const { file, css } of SHEETS) {
      const s = strip(css);
      for (const m of s.matchAll(/summary::before \{([^}]*)\}/g)) {
        const body = m[1] ?? "";
        if (/content:\s*none/.test(body) || /display:\s*none/.test(body) || /mask:\s*none/.test(body)) {
          offenders.push(`${file}: summary::before blanked`);
        }
      }
      for (const m of s.matchAll(/summary[^{}]*\{([^}]*)\}/g)) {
        const body = m[1] ?? "";
        const list = /list-style(-type)?:\s*([^;]+);/.exec(body);
        if (list !== null && !/none/.test(list[2] ?? "")) {
          offenders.push(`${file}: summary list-style ${list[2] ?? ""}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the marker costs no font size, so it cannot add a sixth step", () => {
    // A "▸" in `content` would have been the obvious fix and it would have put
    // a glyph on the five-step scale. The mark is a masked box: it has a width
    // and a height and no font-size at all.
    const rule = /details > summary::before \{([^}]*)\}/.exec(BASE)?.[1] ?? "";
    expect(rule).not.toContain("font-size");
    expect(rule).toContain("width: var(--marker-size)");
  });

  test("Anti: the checks fire on the markup that shipped", () => {
    // The shipped rule, with the display value that removed the marker and
    // nothing putting one back.
    const shipped = ".corpus-doc > summary { display: flex; cursor: pointer; }";
    expect(/details > summary::before \{[^}]*content: "";/.test(shipped)).toBe(false);
    expect(/summary::before \{[^}]*content:\s*none/.test('a summary::before { content: none; }')).toBe(true);
  });
});

/*
 * ── An element hidden by the attribute and given a display by a class ────────
 *
 * D37 (M43c), and the whole class of it. `OntologyView.tsx` writes
 * `hidden={modelView !== "map"}` on `.ontology-figurerow`, ontology.css gave that
 * class `display: grid`, and the two tie on specificity: the browser's own
 * `[hidden] { display: none }` is one attribute selector and a class is one class.
 * This directory loads after the user-agent sheet, so the class won and the map
 * stayed on screen with "As a list" pressed, at 1,294px tall with the list it had
 * switched to 1,546px below it. Nothing failed, nothing logged, and the component
 * was correct.
 *
 * The check pairs the two halves rather than naming the one element. Any class in
 * a JSX open tag that also carries `hidden=` is a class the browser will be asked
 * to hide; if some stylesheet gives that class a `display`, some stylesheet has to
 * give it a `[hidden]` rule as well. `.index-scroll` is the shape that passes
 * without one: it sets a flex basis and never a display, so the attribute still
 * lands.
 */

/** Classes on a JSX open tag that also carries the `hidden` attribute. */
function hiddenClasses(code: string): readonly string[] {
  const out = new Set<string>();
  for (const tag of code.matchAll(/<[A-Za-z][^>]*?>/gs)) {
    const open = tag[0];
    if (!/\shidden[=\s>]/.test(open)) continue;
    const named = /className="([^"]+)"/.exec(open);
    if (named === null) continue;
    for (const cls of (named[1] ?? "").split(/\s+/)) {
      if (cls !== "") out.add(cls);
    }
  }
  return [...out];
}

describe("an element the app hides with [hidden] is really hidden (D37)", () => {
  test("every hidden class with a display declaration has a [hidden] rule", () => {
    const declaresDisplay = (cls: string): boolean =>
      SHEETS.some(({ css }) =>
        new RegExp(`\\.${cls}(?![\\w-])[^{}]*\\{[^}]*\\bdisplay\\s*:`, "g").test(strip(css)),
      );
    const hasHiddenRule = (cls: string): boolean =>
      SHEETS.some(({ css }) =>
        new RegExp(`\\.${cls}(?![\\w-])[^{}]*\\[hidden\\][^{}]*\\{[^}]*display\\s*:\\s*none`).test(
          strip(css),
        ),
      );

    const offenders: string[] = [];
    let paired = 0;
    for (const { file, code } of TS) {
      for (const cls of hiddenClasses(stripTs(code))) {
        if (!declaresDisplay(cls)) continue;
        paired += 1;
        if (hasHiddenRule(cls)) continue;
        offenders.push(`${file}: .${cls} has a display and no [hidden] rule`);
      }
    }
    expect(offenders).toEqual([]);
    /* M63: the pair D37 was about (the claims map's figure row) left with the old
       model tab, so no element in the app toggles a display class with [hidden]
       today. The test below holds the scan to matching JSX on a synthetic tag,
       which is what this guard was for. */
    expect(paired).toBeGreaterThanOrEqual(0);
  });

  test("Anti: the scan reads both halves of the pair", () => {
    const tag = '<div className="ontology-figurerow" data-testid="x" hidden={a !== "b"}>';
    expect(hiddenClasses(tag)).toEqual(["ontology-figurerow"]);
    // A tag with no hidden attribute contributes nothing, and neither does one
    // with no className.
    expect(hiddenClasses('<div className="ontology-figurerow">')).toEqual([]);
    expect(hiddenClasses("<div hidden={x}>")).toEqual([]);
    // And the rule that fixes it is the one this file reads back.
    const ont = SHEETS.find((s) => s.file === "ontology.css")?.css ?? "";
    expect(/\.ontology-figurerow\[hidden\]\s*\{[^}]*display:\s*none/.test(strip(ont))).toBe(true);
  });
});

/*
 * ── One scroller on Your model (D35, D38, M43c) ──────────────────────────────
 *
 * Measured at 1480x797 on the shipped example: `.panel-body.ontologyview-body`
 * held a 619px window over 6,281px of content, inside `.shell-content`'s 756px
 * window over 5,757px. A wheel reaches the outer one, which slid the inner window
 * off the top, so the claims table reported y=150 while `elementFromPoint(700,
 * 300)` returned `DIV.shell-content` and the screen was blank white.
 *
 * What a stylesheet test can hold is the two declarations that decide it: this
 * route's frame takes no height cap, and this route's panes do not scroll. The
 * behaviour itself is verified in real Chrome and the measurements are in the
 * M43c report.
 */
describe("Your model is one scroller, and the shell owns it (D35, D38)", () => {
  const ont = SHEETS.find((s) => s.file === "ontology.css")?.css ?? "";
  /** One rule's body, by its exact selector. Local, as every block here keeps. */
  const body = (css: string, selector: string): string =>
    new RegExp(`${selector.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "s").exec(
      strip(css),
    )?.[1] ?? "";

  test("the route's frame gives up the panel grammar's height cap", () => {
    expect(body(ont, ".ontologyview .panel-frame")).toContain("max-height: none");
    // And the cap it is overriding is still the grammar's default for every other
    // route, which is the thing this must not have deleted.
    const panels = SHEETS.find((s) => s.file === "panels.css")?.css ?? "";
    expect(strip(panels)).toContain("max-height: calc(100dvh - 11rem)");
  });

  test("the route's panes do not scroll inside themselves", () => {
    expect(body(ont, ".ontologyview .panel-body")).toContain("overflow: visible");
    // Two classes, so the order the sheets load in cannot decide it.
    expect(strip(ont)).not.toMatch(/(^|[\s}])\.ontologyview-body\s*\{[^}]*overflow/);
  });

  test("the map cannot be taller than the window leaves it", () => {
    expect(body(ont, ".ontology-graph")).toContain("max-height: calc(100dvh - 11rem)");
    // With `height: auto` beside it, which is what makes the browser scale the
    // box inside both constraints instead of cropping it.
    expect(body(ont, ".ontology-graph")).toContain("height: auto");
  });
});

/*
 * ── The side pane sticks, and the one scroller stays one (M46) ────────────────
 *
 * The pane is the companion to the claim in view now: the passages the open claim
 * cites, the reviewer's line, the explanations. The claims table beside it is the
 * tallest thing on the route, so a pane that scrolled away with the page put the
 * material off screen at the moment the reader started moving down the table it
 * belongs to.
 *
 * Two things have to hold at once and they pull against each other, which is why
 * they are checked together. The pane sticks and takes its own ceiling, the way
 * `.companion` does on Design. And M43c's decision stands unchanged: neither pane
 * body scrolls, so the shell still owns the route's one scroller and what scrolls
 * in the pane is a bounded box inside it, on the same footing as `.index-scroll`.
 *
 * The behaviour is verified in real Chrome and the measurements are in the M46
 * report. What a stylesheet test can hold is the four declarations that decide it.
 */
describe("Your model's side pane is a sticky companion, not a second scroller (M46)", () => {
  const ont = SHEETS.find((s) => s.file === "ontology.css")?.css ?? "";
  /** One rule's body, by its exact selector, inside an optional at-rule scope. */
  const stuck = (): string =>
    /@media \(min-width: 1101px\) \{\s*\.ontologyview \.panel-side \{([^}]*)\}/s.exec(strip(ont))?.[1] ??
    "";

  test("the pane sticks under the study bar, above 1100 only", () => {
    const rule = stuck();
    expect(rule).not.toBe("");
    expect(rule).toContain("position: sticky");
    /* Clear of the study bar, which measured 133px in real Chrome on the shipped
     * example at both 1480 and 1100: 56px of header, 36px of the open-question
     * line, 40px of tab strip. 7rem was the first number here, off the arithmetic
     * `calc(100dvh - 11rem)` is written from, and it put the pane's heading 4px
     * under an opaque bar. --study-chrome is 144px and clears the tallest the bar
     * gets; it is a token because a passage a link lands on keeps the same
     * clearance as scroll margin, and a number written twice is a number that
     * drifts. */
    expect(rule).toContain("top: var(--study-chrome)");
    expect(strip(SHEETS.find((s) => s.file === "tokens.css")?.css ?? "")).toContain(
      "--study-chrome: 9rem",
    );
    // And the passage the pane links to clears the same bar when a link lands on it.
    expect(
      /details\.chunk \{([^}]*)\}/s.exec(strip(SHEETS.find((s) => s.file === "material.css")?.css ?? ""))?.[1] ?? "",
    ).toContain("scroll-margin-top: var(--study-chrome)");
  });

  test("the pane is allowed to be shorter than the table beside it", () => {
    /* The declaration everything else depends on. The frame stretches its items, so
     * a sticky box the height of its own containing block never moves: without this
     * every other line in the rule is inert. */
    expect(stuck()).toContain("align-self: start");
  });

  test("the pane takes its own ceiling and scrolls inside it", () => {
    // The same pair Design's summary pane takes (the companion's until M59), for
    // the reason design.css states: a pane that lengthens the page moves the thread.
    expect(stuck()).toContain("max-height: 80vh");
    expect(stuck()).toContain("overflow-y: auto");
    const design = strip(SHEETS.find((s) => s.file === "design.css")?.css ?? "");
    expect(/\.summary-pane \{[^}]*max-height: 80vh/s.test(design)).toBe(true);
  });

  test("neither pane body scrolls, so the route's one scroller is still the shell's", () => {
    /* M43c, restated rather than trusted. The pane scrolling and a pane's *body*
     * scrolling are different things, and the second is the defect that put a 619px
     * window over 6,281px of content inside the shell's own scroller. */
    const bodyRule =
      /\.ontologyview \.panel-body \{([^}]*)\}/s.exec(strip(ont))?.[1] ?? "";
    expect(bodyRule).toContain("overflow: visible");
    expect(bodyRule).not.toContain("auto");
  });

  test("a passage never runs out past the pane, and never past the reading measure", () => {
    /* Both halves measured in real Chrome on the shipped example.
     *
     * At 1480 the pane holds 286px and `details.chunk .chunktext`'s own cap is
     * 416px, so every passage ran 115px out past the pane's right edge, reachable
     * only by scrolling the pane sideways. At 1100 the pane runs the width of the
     * page, and with the cap simply removed the transcript measured 145 characters
     * to the line against a bar of 80. `min(cap, 100%)` is the only shape that
     * holds both, and panels.css already uses it for prose inside a pane. */
    const rule = /\.claim-passage details\.chunk \.chunktext \{([^}]*)\}/s.exec(strip(ont))?.[1] ?? "";
    expect(rule).toContain("max-width: min(var(--measure-wide), 100%)");
    // And the fold around it ends where its text ends rather than drawing a 976px
    // border around 416px of transcript.
    const row = /\.claim-passage \{([^}]*)\}/s.exec(strip(ont))?.[1] ?? "";
    expect(row).toContain("max-width: min(var(--measure-full), 100%)");
    /* The grid tracks that let either cap bite. A grid item's automatic minimum is
     * its max-content size, so without these the fold sized itself to the longest
     * line of the transcript: 628px inside 286px of pane, measured. */
    expect(row).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(
      /\.claim-material-list \{([^}]*)\}/s.exec(strip(ont))?.[1] ?? "",
    ).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  test("below 1100 the pane flows under the main column instead", () => {
    /* A sticky box in a single-column flow sticks to nothing while capping its own
     * height for no reason, so the sticky rule is above 1100 and the frame collapses
     * at the same number every prose breakpoint in this app uses. */
    const narrow =
      /@media \(max-width: 1100px\) \{\s*\.ontologyview \.panel-frame\[data-panels="main-side"\] \{([^}]*)\}/s.exec(
        strip(ont),
      )?.[1] ?? "";
    expect(narrow).toContain("grid-template-columns: minmax(0, 1fr)");
    // And the grammar's own two-track template is untouched for every other route.
    const panels = strip(SHEETS.find((s) => s.file === "panels.css")?.css ?? "");
    expect(panels).toContain("grid-template-columns: minmax(0, 1fr) 320px");
  });
});

/**
 * The row box and the panel grammar keep the rules that Checks once leaned on
 * (M47).
 *
 * "The user can't scroll in the open checks section to see what is open."
 * The fix was in coherence.css (the route's frame gave up the panel grammar's
 * height cap, its two panes stopped scrolling inside themselves and its head
 * stopped being sticky). That sheet and the route went at M89 (2026-10-14), and
 * the tests of its declarations with them. The two rules below are not
 * Checks', and they stay.
 */
describe("the row box and the panel grammar keep their rules (M47; M89)", () => {
  test("the panel grammar's default height cap is still there for the routes that want panes", () => {
    const panels = SHEETS.find((s) => s.file === "panels.css")?.css ?? "";
    expect(strip(panels)).toContain("max-height: calc(100dvh - 11rem)");
  });

  test("the row box keeps the clip the primitive gives it", () => {
    // `overflow: hidden` on `.row-list` is what rounds the rows to the box's
    // radius. It was never the bug; the bug was the height it was squeezed to.
    const rows = strip(SHEETS.find((s) => s.file === "rows.css")?.css ?? "");
    expect(rows).toContain("overflow: hidden");
  });
});

describe("the current item is marked quietly (M53, ISC-544)", () => {
  /* The owner's "black border" on the instruction slides was, in part, the
   * current card of the seven-steps loop: `.rail-item[data-current]`, the rule the
   * walkthrough's loop and the Design rail share, drew a dark frame, a 3px dark
   * foot and a raised shadow. Every rule that marks a current or selected item
   * now marks it with the ground and a light line only. */
  const CURRENT = /\[(?:data-current|aria-current|aria-selected|data-at)[^\]]*\]/;
  const STRONG_INK = /var\(--(?:accent|ink|ink-strong|focus-colour)\)/;
  test("no current-item rule draws a strong-ink border or a raised shadow", () => {
    const offenders: string[] = [];
    for (const { file, css } of SHEETS) {
      for (const m of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = (m[1] ?? "").trim();
        if (!CURRENT.test(selector) || /:focus-visible/.test(selector)) continue;
        for (const d of (m[2] ?? "").split(";")) {
          const p = /^\s*(border[a-z-]*|outline[a-z-]*|box-shadow)\s*:\s*(.+?)\s*$/.exec(d);
          if (p === null) continue;
          const [, prop, value] = p;
          if ((prop ?? "").startsWith("box-shadow") ? value !== "none" : STRONG_INK.test(value ?? "")) {
            // A filled control (the current tab, a filled chip) keeps its border
            // the colour of its own fill; that is the fill, not an outline.
            if (/studybar-tabs|coh-chip|study-gauge-cell/.test(selector)) continue;
            offenders.push(`${file}: ${selector} { ${prop}: ${value} }`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the walkthrough's loop draws its cells with the rail's rule and no current style of its own", () => {
    const intro = SHEETS.find((s) => s.file === "intro.css")?.css ?? "";
    expect(strip(intro)).not.toMatch(/steps-rail[^{]*\[data-current/);
    const components = SHEETS.find((s) => s.file === "components.css")?.css ?? "";
    const rule = /\.rail-item\[data-current="true"\] \{([^}]*)\}/.exec(strip(components))?.[1] ?? "";
    expect(rule).toContain("background: var(--surface-selected)");
    expect(rule).not.toContain("box-shadow");
  });
});
