/**
 * The export card's receipt and the material surface's wording.
 *
 * The file began as the proof that the exports carried the researcher's
 * dismissals. The Checks tab and its findings left main in M89, so the dismissal
 * tests went with them; what stays is the receipt's bound and the material
 * surface's refusal to tell the researcher they are blocked.
 */

import { describe, expect, test } from "bun:test";
import { RECEIPT_ON_SCREEN } from "../src/workbench/ExportBar.tsx";
import { documentCountNote } from "../src/state/chunks.ts";

describe("the receipt on screen is bounded", () => {
  test("the cap is small enough that the aside cannot become the page", () => {
    // The measured failure was 123 rows in a 304px column, 7651px tall beside
    // 658px of exports, on a two-day-old fixture, growing by one every time a
    // button on the same page was pressed.
    expect(RECEIPT_ON_SCREEN).toBeGreaterThan(0);
    expect(RECEIPT_ON_SCREEN).toBeLessThanOrEqual(12);
  });

  test("the panel renders the cap and discloses the rest", async () => {
    const source = await Bun.file("src/workbench/ExportBar.tsx").text();
    expect(source).toContain("slice(0, RECEIPT_ON_SCREEN)");
    expect(source).toContain("slice(RECEIPT_ON_SCREEN)");
    expect(source).toContain("export-taken-more");
    // And the complete list is still obtainable, so nothing is hidden.
    expect(source).toContain("buildExportReceipt");
  });
});

describe("the material surface neither blocks nor names what it cannot do", () => {
  const SURFACES = [
    "src/flow/CorpusMaterial.tsx",
    "src/flow/SuggestFromData.tsx",
    "src/state/chunks.ts",
  ];

  test("no rendered string tells the researcher they are blocked", async () => {
    /* Rendered verbatim in .error before this pass: "Document limit reached:
     * this project already has 20 of 20 allowed documents. Remove or
     * consolidate documents before uploading more." Two rules broken at once.
     * Nothing in this tool gates, and the buttons on that screen were exactly
     * ["Close", "Skip to main content"]. */
    const banned = ["limit reached", "allowed documents", "before uploading more"];
    for (const path of SURFACES) {
      const source = await Bun.file(path).text();
      // The module notes name the old sentence in fragments deliberately, so
      // the check is on whole strings a user could read.
      for (const phrase of banned) {
        const inCode = source
          .split("\n")
          .filter((l) => !l.trimStart().startsWith("*") && !l.trimStart().startsWith("//"))
          .join("\n");
        expect(inCode).not.toContain(phrase);
      }
    }
  });

  test("the size note observes and the surface has the action it mentions", async () => {
    expect(documentCountNote(5)).toBeNull();
    const note = documentCountNote(40) ?? "";
    expect(note).toContain("40");
    expect(note).not.toContain("Remove");
    // Kind was write-once at upload. The row it labels can change it now.
    const source = await Bun.file("src/flow/CorpusMaterial.tsx").text();
    expect(source).toContain("corpus-doc-actions");
    expect(source).toContain("retag");
  });

  test("a batch that fails part way still shows what landed", async () => {
    /* 25 files dispatched, 19 committed, and one screenshot read "1 document",
     * "DOCUMENTS 1" and "1 of 20 documents so far" beside an error about 20,
     * because `onAdded()` sat after the loop. The refresh is inside it now. */
    const source = await Bun.file("src/flow/CorpusMaterial.tsx").text();
    const loop = source.slice(source.indexOf("for (const file of chosen)"));
    const body = loop.slice(0, loop.indexOf("} catch"));
    expect(body).toContain("onAdded()");
  });
});
