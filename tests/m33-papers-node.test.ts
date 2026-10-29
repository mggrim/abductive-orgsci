/**
 * M33: one route to the papers.
 *
 * The papers node and its card went with "How the parts fit together" at M88
 * (the owner, 2026-10-14: "remove how the parts fit together section"). What
 * stays is the route: `papersPath` is the one function the framing band's
 * "Upload papers" calls, and two copies of a hash string is how a link starts
 * landing on the Design tab six months later.
 */

import { describe, expect, test } from "bun:test";

import { literaturePath, literatureRequested, papersPath } from "../src/ui/routes.ts";
import { framingPapersHref } from "../src/flow/FramingBand.tsx";

describe("M33: one route to the papers, not two", () => {
  test("the framing band calls papersPath", () => {
    expect(framingPapersHref("abc")).toBe(papersPath("abc"));
    expect(papersPath("abc")).toBe(literaturePath("abc"));
    expect(papersPath("abc")).toBe("#/study/abc/material/literature");
    // And it lands on the papers rather than the top of Material.
    expect(literatureRequested(papersPath("abc"))).toBe(true);
  });

  test("no study means the studies table, not a route with a hole in it", () => {
    expect(papersPath(undefined)).toBe("#/studies");
    expect(papersPath(undefined)).not.toContain("undefined");
  });
});
