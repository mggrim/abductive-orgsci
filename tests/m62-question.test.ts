/**
 * M62, ISC-602 (owner, 2026-09-30): "The question, what is drawing you to this,
 * is unclear. It should say, what is drawing you to this particular research
 * inquiry?" Everywhere it is read: the help line over the Interest summary, the
 * provenance popover's name for it, the Summarise prompt and the framing turn's
 * instructions, which quote it. Identifiers stay (`startingInterest`,
 * `starting-interest`, the test ids).
 *
 * The brief's wording for the next-move bar, "Say what is drawing you to this
 * research inquiry.", breaks L13 (a wh-word standing in for a thing after
 * "say"); the lead ruled on 2026-09-30 that the bar reads "Name the interest
 * that draws you to this research inquiry."
 */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FRAMING_DRAFT_PARTS, FRAMING_QUESTION, MotivationPage } from "../src/flow/FramingBand.tsx";
import { FRAMING_PROBES } from "../src/interview/stationProbes.ts";
import { draftPrompt, framingPartsBlock } from "../src/interview/conversationPrompt.ts";
import { FRAMING_ASK } from "../src/workbench/NextBar.tsx";
import { BARE_REFERENCE_ALLOW, whNounClauses } from "./copyBarScan.ts";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { emptyBrief } from "../src/state/projects.ts";

const Q = "What is drawing you to this particular research inquiry?";
const OLD = "What is drawing you to this?";

describe("the interest's question, everywhere it is read", () => {
  test("the page's question and the conversation's probe", () => {
    expect(FRAMING_QUESTION.startingInterest).toBe(Q);
    // M92, ISC-747: the chat asks the same thing facing forward, in other words than the box.
    expect(FRAMING_PROBES.startingInterest).not.toBe(Q);
  });

  test("on the page, over the Interest summary, and in the popover's name for it", async () => {
    const html = renderToStaticMarkup(
      createElement(LedgerProvider, {
        store: new InMemoryLedgerStore(),
        children: createElement(MotivationPage, {
          project: { id: "p62", title: "t", stage: "design-brief", brief: emptyBrief(), createdAt: 1 },
          onChanged: () => {},
        }),
      }),
    );
    expect(html).toContain(`field-hint">${Q}</p>`);
    // The popover renders once an answer is saved; its name is set in the source.
    const band = await Bun.file(new URL("../src/flow/FramingBand.tsx", import.meta.url).pathname).text();
    expect(band).toContain('about="what is drawing you to this particular research inquiry"');
    expect(html).not.toContain(OLD);
  });

  test("in the Summarise prompt and the framing turn's instructions", () => {
    const draft = draftPrompt({ question: "unused", said: ["a"], parts: FRAMING_DRAFT_PARTS });
    expect(draft).toContain(`INTEREST: ${Q}`);
    const block = framingPartsBlock({
      covered: { startingInterest: false, seminalCorpus: false, targetVenue: false },
      next: "startingInterest",
    }).join("\n");
    // M92, ISC-747: the conversation asks the interest facing forward, in other words than the box.
    expect(block).toContain(`Its question: ${FRAMING_PROBES.startingInterest}`);
  });

  test("the old wording leaves the scan's allowlist, since the new one names its referent", () => {
    expect(BARE_REFERENCE_ALLOW).not.toContain(OLD);
    expect(BARE_REFERENCE_ALLOW).not.toContain("what is drawing you to this");
  });

  test("the bar's ask, by the lead's ruling, and the brief's wording would break L13", () => {
    expect(whNounClauses("Say what is drawing you to this research inquiry.")).toHaveLength(1);
    expect(FRAMING_ASK.startingInterest).toBe("Name the interest that draws you to this research inquiry.");
    expect(whNounClauses(FRAMING_ASK.startingInterest)).toHaveLength(0);
  });
});
