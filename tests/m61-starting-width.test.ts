/**
 * M61 follow-up, ISC-589: Starting point uses the full width of the content
 * cell from 1100 to 1920 (owner, 2026-09-30). With the puzzle block gone the
 * right column held one "Open chat" button, and the answers stopped at the form
 * measure, so the page had an empty column. The conversation is now open on
 * arrival and fills its column, its composer at the column's foot, and the two
 * columns share the width the way Design's do.
 *
 * Geometry is measured in real Chrome at 1100, 1480 and 1920 (the walk's
 * screenshots); what a static render and the stylesheet can hold is held here.
 */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MotivationPage } from "../src/flow/FramingBand.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { emptyBrief, type Project } from "../src/state/projects.ts";

const CSS = await Bun.file(new URL("../src/ui/styles/design.css", import.meta.url).pathname).text();

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const at = CSS.indexOf(`\n${selector} {`);
  if (at < 0) return "";
  return CSS.slice(CSS.indexOf("{", at) + 1, CSS.indexOf("}", at));
}

const project: Project = {
  id: "58958958-9589-5895-8958-958958958958",
  title: "Night wards",
  stage: "design-brief",
  brief: emptyBrief(),
  createdAt: 1,
};

function page(): string {
  return renderToStaticMarkup(
    createElement(LedgerProvider, {
      store: new InMemoryLedgerStore(),
      children: createElement(MotivationPage, { project, onChanged: () => {} }),
    }),
  );
}

describe("ISC-589: no empty column on Starting point", () => {
  test("the conversation is open on arrival, so its column is never a lone button", () => {
    const html = page();
    expect(html).toContain('data-testid="dialogue"');
    expect(html).not.toContain('data-testid="framing-talk-open"');
    // M62, ISC-597: always open, so there is no open state to mark.
    expect(html).not.toContain("data-talking");
  });

  /* The owner's amendment to M62 (ISC-598): Summarise left the head of the
   * conversation for the foot of the Summaries column, so nothing sits above the
   * conversation and the composer is still the last thing in its column. */
  test("the composer is the last thing in the column, and nothing sits above the conversation", () => {
    const html = page();
    const aside = html.indexOf('data-testid="motivation-aside"');
    const answers = html.indexOf('data-testid="motivation-answers"');
    const column = html.slice(aside, answers);
    expect(column).not.toContain("framing-talk-actions");
    expect(column).toContain('data-testid="dialogue"');
  });

  test("the answers keep the fields' measure and the conversation takes the rest of the cell", () => {
    // Every text field stops at --measure-wide (base.css), so a wider left track
    // is blank space; the right track is 1fr and the conversation fills it.
    // ISC-592 put the conversation on the left: it takes the rest, the answers their measure.
    expect(rule(".motivation-frame")).toContain("minmax(0, 1fr) minmax(0, var(--measure-wide))");
    expect(rule(".motivation-aside .chat-composer")).toContain("max-width: none");
  });

  /* M62, ISC-597 (owner, 2026-09-30): no Hide chat, so no hidden state and no
   * one-column layout for it. tests/m62-summaries.test.ts holds the absence. */

  test("the conversation column holds the viewport under the study bar, and the composer sits at its foot", () => {
    const aside = rule(".motivation-aside");
    expect(aside).toContain("position: sticky");
    expect(aside).toContain("var(--study-chrome)");
    expect(CSS).toMatch(/\.motivation-aside \.chat-compose \{[^}]*margin-top: auto/);
  });
});

describe("ISC-589: two columns from 1100 up", () => {
  test("the page stacks only below 1100, and the stacked thread keeps its cap", () => {
    expect(CSS).not.toMatch(/@media \(max-width: 1100px\) \{\s*\.motivation-frame \{/);
    expect(CSS).toMatch(/@media \(max-width: 1099px\) \{\s*\.motivation-frame \{/);
    expect(CSS).toMatch(/\.motivation-frame \.motivation-aside \.chat-thread \{\s*max-height: min\(60vh, 36rem\)/);
  });
});

/* The lead's widening of 2026-09-30 for a hidden chat went with the hidden state
 * (M62, ISC-597). The open page keeps the fields at the measure. */
describe("ISC-589: the answers keep the measure", () => {
  test("the answers column stays at the fields' measure", () => {
    expect(rule(".motivation-answers")).toContain("max-width: var(--measure-wide)");
  });
});

describe("ISC-592: Starting point reads like a Design step (owner, 2026-09-30)", () => {
  test("the conversation comes first, on the left; the answers second, on the right", () => {
    const html = page();
    const aside = html.indexOf('data-testid="motivation-aside"');
    const answers = html.indexOf('data-testid="motivation-answers"');
    expect(aside).toBeGreaterThan(-1);
    expect(aside).toBeLessThan(answers);
    expect(rule(".motivation-frame")).toContain("minmax(0, 1fr) minmax(0, var(--measure-wide))");
  });

  /* M62, ISC-597: the heading reads Summaries now (tests/m62-summaries.test.ts). */
  test("the answers sit under their heading with the answered chip", () => {
    const html = page();
    const answers = html.slice(html.indexOf('data-testid="motivation-answers"'));
    expect(answers).toMatch(/<h2[^>]*>Your answers<\/h2>/);
    expect(answers).toContain('data-testid="framing-status"');
    expect(answers.indexOf("Your answers</h2>")).toBeLessThan(answers.indexOf('data-testid="framing-status"'));
  });
});

/* M62, ISC-600: the two sentences that tied the chat to the answers, and the
 * Learn more fold, left the page for Starting point's Help panel
 * (tests/m62-help.test.ts holds them there). */
describe("ISC-592's sentences moved into the Help panel (M62)", () => {
  test("neither sentence nor the fold is on the page", () => {
    const html = page();
    expect(html).not.toContain('data-testid="framing-talk-lede"');
    expect(html).not.toContain('data-testid="motivation-lede"');
    expect(html).not.toContain('data-testid="motivation-learn"');
  });
});
