/**
 * M78b, ISC-681: "How does this paper relate to your setting?" for every paper
 * on Sources (the walker's note on the serendipity walk). Abductive asked it only
 * for a paper that it couldn't place, placed all six of the walk's papers, and so
 * asked it for none. The question is now an editable line under every paper,
 * prefilled with Abductive's placing when it has one.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { PaperBearing, PLACED_HINT, relateSaveReason } from "../src/flow/PaperBearing.tsx";
import { BEARING_QUESTION } from "../src/views/paperBearings.ts";

const render = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(LedgerProvider, {
      store: new InMemoryLedgerStore(),
      children: createElement(PaperBearing, { projectId: "p", paperKey: "k", paperName: "Dew 2009", onSaved: () => {}, testId: "t", ...props } as never),
    }),
  );

describe("the relate line under every paper (ISC-681)", () => {
  test("a paper Abductive placed carries the question, prefilled with the placing and the line to edit it", () => {
    const placing = "Dew treats serendipity as a resource that entrepreneurs prepare for, which bears on founders at the bench.";
    const html = render({ placing });
    expect(html).toContain(BEARING_QUESTION);
    expect(html).toContain(`>${placing}</textarea>`);
    expect(html).toContain(PLACED_HINT);
    expect(PLACED_HINT).toBe("Abductive placed this paper under your literatures; edit if that is wrong.");
  });

  test("an unplaced paper carries the question with an empty line", () => {
    const html = render({});
    expect(html).toContain(BEARING_QUESTION);
    expect(html).toContain('data-testid="bearing-input-t"');
    expect(html).not.toContain(PLACED_HINT);
  });

  test("an answered paper keeps its sentence in the line, editable", () => {
    const html = render({ bearing: { paperKey: "k", paperName: "Dew 2009", reason: "The bench is where founders prepare.", at: 1 } });
    expect(html).toContain(BEARING_QUESTION);
    expect(html).toContain(">The bench is where founders prepare.</textarea>");
  });

  test("Save goes live on an edit, so Abductive's placing is never saved as the researcher's words", () => {
    expect(relateSaveReason("A", "A")).not.toBeNull();
    expect(relateSaveReason("", "")).not.toBeNull();
    expect(relateSaveReason("B", "A")).toBeNull();
  });

  test("Sources draws the line on both kinds of row, whatever the paper's standing", async () => {
    const src = await Bun.file(new URL("../src/flow/SeminalCorpus.tsx", import.meta.url)).text();
    expect(src.split("<PaperBearing").length - 1).toBe(2);
    expect(src).not.toContain('l.standing === "asking" ? (');
    expect(src).not.toContain('standing === "asking" ? (');
  });
});
