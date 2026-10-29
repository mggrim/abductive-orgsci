/**
 * M84, ISC-703 and ISC-708: the stage said plainly, and Help to match.
 *
 * A co-author (2026-10-07): "we need to be clear about whether this tool
 * should be used before data is collected or after." The owner: before.
 *
 * ISC-703: the front page, Starting point and Design's Help say that Abductive
 * is for the design stage, before data collection.
 * ISC-708: Design's and Starting point's Help say the stage, the unit of
 * analysis and where to name it, that the first questions at a step ask for the
 * big picture and later ones for detail, and that you may answer the steps in
 * any order and leave a question open.
 */

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { STAGE_LINE } from "../src/ui/stageLine.ts";
import { PAGE_HELP } from "../src/ui/pageHelp.ts";
import { OBSTACLES_LEDE, PURPOSE_LINE } from "../src/ui/Introduction.tsx";
import { MotivationPage } from "../src/flow/FramingBand.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { emptyBrief } from "../src/state/projects.ts";

const helpOf = (page: "design" | "motivation") =>
  [...PAGE_HELP[page].purpose, ...PAGE_HELP[page].parts.flatMap((p) => [p.name, ...p.says])].join("\n");

describe("ISC-703: the stage, said plainly", () => {
  test("the sentence", () => {
    expect(STAGE_LINE).toBe("Abductive is for the design stage, before you collect data. Bring data only at Early data, as a first look.");
  });

  test("the front page says it beside the purpose line and in the nine questions' lede", () => {
    expect(PURPOSE_LINE).toContain("before you collect the data");
    expect(OBSTACLES_LEDE).toContain("before you collect anything");
  });

  test("Starting point says it at the head of the page", () => {
    const html = renderToStaticMarkup(
      createElement(LedgerProvider, {
        store: new InMemoryLedgerStore(),
        children: createElement(MotivationPage, {
          project: { id: "m84-help", title: "Help", stage: "design-brief", createdAt: 1, brief: emptyBrief() },
          onChanged: () => {},
        }),
      }),
    );
    expect(html).toContain('data-testid="design-stage"');
    expect(html).toContain(STAGE_LINE);
    expect(html.indexOf(STAGE_LINE)).toBeLessThan(html.indexOf('data-testid="motivation-frame"'));
  });

  test("Design's Help and Starting point's Help say it", () => {
    expect(helpOf("design")).toContain(STAGE_LINE);
    expect(helpOf("motivation")).toContain(STAGE_LINE);
  });
});

describe("ISC-708: Help says the unit, the order of the questions, and the free movement", () => {
  for (const page of ["design", "motivation"] as const) {
    test(`${page}: the unit of analysis, and that you identify it at Context`, () => {
      const help = helpOf(page);
      expect(help).toMatch(/unit of analysis/);
      expect(help).toMatch(/at Context/);
      // M92, ISC-749: and another unit, typed under Other.
      expect(help).toMatch(/a person, a team, an organisation, a community, a field, or another unit that you type under Other/);
    });

    test(`${page}: the big picture first, and detail once you've saved an answer`, () => {
      const help = helpOf(page);
      expect(help).toMatch(/big picture/);
      expect(help).toMatch(/detail once you've saved an answer/);
    });

    test(`${page}: any order, and a question left open`, () => {
      const help = helpOf(page);
      expect(help).toMatch(/in any order/);
      expect(help).toMatch(/leave a question open/);
    });
  }

  test("Design's Help keeps its existing structure: the parts it had, in order, with the new part after Steps", () => {
    const names = PAGE_HELP.design.parts.map((p) => p.name);
    expect(names).toEqual(["Steps", "How Abductive asks", "Chat", "Summary", "History"]);
    expect(PAGE_HELP.motivation.parts.map((p) => p.name)).toEqual(["How Abductive asks", "Chat", "Your answers", "History"]);
  });
});
