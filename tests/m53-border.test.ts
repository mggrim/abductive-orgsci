/**
 * M53, ISC-544: no rule draws a border or outline wider than one pixel in the
 * strong ink; the current item's mark is the quiet one; the keyboard focus ring
 * stays visible.
 *
 * The owner: "the blackline border keeps showing up on the instruction slides as
 * well as in the tool. Get rid of that black border." Found in Chrome: every
 * route's <main> carries tabindex -1 for the skip link, so a pointer press on any
 * blank part of a page focused it, and `main:focus` drew a 2px near-black ring
 * round the whole slide. The rest were current-item and callout edges in the
 * accent at 2 to 4px.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dir, "../src/ui/styles");
const STRONG = /var\(--(accent|ink|ink-strong|focus-colour)\)/;

interface Decl {
  file: string;
  selector: string;
  prop: string;
  value: string;
}

function declarations(): Decl[] {
  const out: Decl[] = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".css"))) {
    const css = readFileSync(join(DIR, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = (m[1] ?? "").trim().replace(/\s+/g, " ");
      for (const d of (m[2] ?? "").split(";")) {
        const p = /^\s*(border[a-z-]*|outline[a-z-]*)\s*:\s*(.+?)\s*$/.exec(d);
        if (p) out.push({ file, selector, prop: p[1] ?? "", value: p[2] ?? "" });
      }
    }
  }
  return out;
}

/** A keyboard focus ring: the one place a 2px strong line is the point. */
const isFocusRing = (s: string) => /:focus-visible/.test(s);

/**
 * Strong-ink colour set on a longhand, where the width comes from the base rule.
 * Each is listed with the base width it was checked against; a new one fails
 * until someone checks it and adds it here.
 */
const LONGHANDS_AT_ONE_PIXEL = new Set([
  ".move:hover", // a .btn-shaped control, 1px
  ".studybar-tabs a[data-current=\"true\"]", // 1px transparent base, filled current tab
  ".study-gauge-cell[data-state=\"stated\"]", // 1px
  ".coh-chip[aria-current=\"true\"]", // 1px pill
  ".popbox[data-pinned=\"true\"]", // 1px
  ".cellpop[data-pinned=\"true\"]", // 1px
  ".btn-primary, button.primary", // 1px, filled
  ".btn-primary:hover, button.primary:hover", // 1px, filled
  ".tickbox:checked", // 1px checkbox
]);

/**
 * The one exception, and it is an encoding rather than a mark: the relation
 * legend's "settles" family draws its 3px key in the accent because the graph
 * draws that family's edges in it (ISC-197 to ISC-208). Flagged to the lead.
 */
const ENCODINGS = new Set(['.relkey-family[data-family="settles"]']);

describe("no thick line in the strong ink (ISC-544)", () => {
  test("every strong-ink border or outline is 1px, a focus ring, or a checked longhand", () => {
    const offenders = declarations()
      .filter((d) => STRONG.test(d.value))
      .filter((d) => !isFocusRing(d.selector))
      .filter((d) => !ENCODINGS.has(d.selector))
      .filter((d) => {
        if (/-color$/.test(d.prop)) return !LONGHANDS_AT_ONE_PIXEL.has(d.selector);
        const widths = [...d.value.matchAll(/(\d+(?:\.\d+)?)px|var\(--focus-width\)/g)].map((w) =>
          w[1] === undefined ? 2 : Number(w[1]),
        );
        return widths.some((w) => w > 1);
      })
      .map((d) => `${d.file}: ${d.selector} { ${d.prop}: ${d.value} }`);
    expect(offenders).toEqual([]);
  });

  test("Anti: the scan catches the shape that shipped", () => {
    const shipped = { selector: ".rail-item[data-current=\"true\"]", prop: "border-left", value: "2px solid var(--accent)" };
    expect(STRONG.test(shipped.value) && !isFocusRing(shipped.selector)).toBe(true);
  });

  test("<main> rings only for the keyboard, so a pointer press on a page draws nothing", () => {
    const all = declarations();
    expect(all.filter((d) => d.selector === "main:focus" && d.prop.startsWith("outline") && !/none/.test(d.value))).toEqual([]);
    const ring = all.find((d) => d.selector === "main:focus-visible" && d.prop === "outline");
    expect(ring?.value).toBe("var(--focus-width) solid var(--focus-colour)");
  });

  test("a field's face rings for the keyboard, not for every click into it", () => {
    const all = declarations();
    expect(all.some((d) => d.selector === ".field-row:focus-within > .field-face" && d.prop === "outline")).toBe(false);
    expect(all.some((d) => d.selector === ".field-row:has(:focus-visible) > .field-face" && d.prop === "outline")).toBe(true);
  });

  test("the current step on the rail is the selected surface, not a dark edge", () => {
    const css = readFileSync(join(DIR, "components.css"), "utf8");
    const rule = /\.rail-item\[data-current="true"\] \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("background: var(--surface-selected)");
    expect(rule).not.toMatch(STRONG);
  });

  test("the global focus ring is unchanged", () => {
    const ring = declarations().find(
      (d) => d.selector.startsWith(":where(a, button") && d.selector.endsWith(":focus-visible") && d.prop === "outline",
    );
    expect(ring?.value).toBe("var(--focus-width) solid var(--focus-colour)");
  });
});
