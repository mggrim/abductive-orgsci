/**
 * M78a, ISC-679: the card's preview shows the gap before the researcher accepts
 * (the lead's ruling (c), 2026-10-03).
 *
 * On the walk the card's preview showed only the first sentence of "Occasions
 * when the technician, Dave, walks founders over to each other, such as the
 * introduction of a robotics founder to a materials founder. [...]" and so hid
 * the marker.
 *
 * M89 (2026-10-14): the readiness report's concepts row, which named the gap in
 * words, left with the checks. The chip on the card stays.
 */

import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GAP_CHIP_LABEL, GapChip } from "../src/ui/ConceptsView.tsx";

describe("the card's preview shows the gap before Accept", () => {
  test("a definition with a marker draws the chip, and one without draws none", () => {
    const withGap = renderToStaticMarkup(
      React.createElement(GapChip, { id: "c1", definition: "Occasions when Dave walks founders over. [...]" }),
    );
    expect(withGap).toContain(GAP_CHIP_LABEL);
    expect(withGap).toContain('data-testid="gap-chip-c1"');
    expect(renderToStaticMarkup(React.createElement(GapChip, { id: "c2", definition: "Occasions when Dave walks founders over." }))).toBe("");
  });

  test("both the suggestion's card and the accepted card carry it in their header", async () => {
    const src = await Bun.file(new URL("../src/ui/ConceptsView.tsx", import.meta.url)).text();
    expect(src.match(/<GapChip id=\{card\.id\} definition=\{card\.definition\} \/>/g)?.length).toBe(2);
  });
});
