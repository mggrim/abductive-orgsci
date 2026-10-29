/**
 * M61 follow-up, ISC-586: the owner's lede.
 *
 * The owner's opening paragraph, word for word, from one constant that the
 * front page and the walkthrough's first screen both render. The copy scan bans
 * "the tool" as the actor and admits this one run by name, with its reason.
 */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Introduction, PURPOSE_LINE } from "../src/ui/Introduction.tsx";
import { Walkthrough } from "../src/ui/Walkthrough.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { RETIRED_ALLOW, retiredTermOffenders } from "./copyBarScan.ts";

const OWNER_LEDE =
  "Abductive helps you design a qualitative project before you collect the data. The tool asks the questions that a careful colleague would ask, one at a time. Your answers then build a model of what you're studying, and Abductive keeps track of those changes.";

const SRC = new URL("../src/", import.meta.url).pathname;

/** Rendered text, with tags and attributes gone and entities put back. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

function inLedger(node: React.ReactElement): string {
  return renderToStaticMarkup(
    createElement(LedgerProvider, { store: new InMemoryLedgerStore(), children: node }),
  );
}

describe("ISC-586: the owner's lede", () => {
  test("the constant is the owner's sentence, word for word", () => {
    expect(PURPOSE_LINE).toBe(OWNER_LEDE);
  });

  test("the front page's first paragraph renders it", () => {
    const html = inLedger(createElement(Introduction));
    const lede = html.match(/data-testid="intro-one-liner"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
    expect(visibleText(lede).trim()).toBe(OWNER_LEDE);
  });

  test("the walkthrough's first screen renders the same constant", async () => {
    const html = inLedger(createElement(Walkthrough));
    expect(visibleText(html)).toContain(OWNER_LEDE);
    // One constant, read twice: only Introduction.tsx spells the sentence.
    for (const [file, want] of [["ui/Introduction.tsx", 1], ["ui/Walkthrough.tsx", 0]] as const) {
      const text = await Bun.file(SRC + file).text();
      const copies = text.split("The tool asks the questions that a careful colleague").length - 1;
      expect({ file, copies }).toEqual({ file, copies: want });
    }
  });

  test("the scan admits this one run by name, with the owner's reason", () => {
    const entry = RETIRED_ALLOW.find((a) => OWNER_LEDE.startsWith(a.run));
    expect(entry?.why).toBe("the owner's wording, 2026-09-30");
    // Narrow: the admitted run reaches past the owner's "The tool", so no other
    // sentence opening "Abductive helps you design" rides in on it.
    expect(entry?.run.includes("The tool asks")).toBe(true);
    expect(retiredTermOffenders().filter((line) => line.includes("careful colleague"))).toEqual([]);
  });
});
