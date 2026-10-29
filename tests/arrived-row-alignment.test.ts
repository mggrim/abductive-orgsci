/**
 * The Exports header's label meets the line it labels (D50, M43d).
 *
 * Measured in real Chrome at innerWidth 1480 on the shipped example: four of the
 * five rows held a one-line value and every label sat level with it, while
 * "Claims, by who wrote them" wrapped to three lines, so its value ran y=331 to
 * 394 and its label sat at y=373. The one row a reader looks hardest at was the
 * one that read misaligned.
 *
 * The cause is that the value is a `<button>` and a button is inline-block, whose
 * baseline is the baseline of its LAST line box, so `align-items: baseline` put
 * the label beside the value's final line. After the fix every row measures
 * dtTop === ddTop, and the claims row reads 331 against 331.
 *
 * The check is about which rule the row uses, because the numbers belong to one
 * viewport and the defect does not.
 */

import { describe, expect, test } from "bun:test";

const CSS = await Bun.file(
  new URL("../src/ui/styles/exports.css", import.meta.url).pathname,
).text();

const BARE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

describe("the header's definition rows", () => {
  test("align to the top, never to a baseline the value's last line sets", () => {
    const row = /\.arrived-row\s*\{([^}]*)\}/.exec(BARE)?.[1] ?? "";
    expect(row).toContain("align-items: start");
    expect(row).not.toContain("align-items: baseline");
  });

  test("label and value share a line box, so the two first lines agree", () => {
    const dt = /\.arrived-row dt\s*\{([^}]*)\}/.exec(BARE)?.[1] ?? "";
    const dd = /\.arrived-row dd\s*\{([^}]*)\}/.exec(BARE)?.[1] ?? "";
    expect(dt).toContain("line-height: var(--leading-body)");
    expect(dd).toContain("line-height: var(--leading-body)");
  });

  test("a value that wraps reads left, not centred by the button it sits in", () => {
    const control = /\.arrived-row dd \.linkish\s*\{([^}]*)\}/.exec(BARE)?.[1] ?? "";
    expect(control).toContain("text-align: left");
  });
});
