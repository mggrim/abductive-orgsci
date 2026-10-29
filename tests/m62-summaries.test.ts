/**
 * M62, ISC-597 (owner, 2026-09-30): Starting point has no Hide chat, and its
 * right column is "Summaries", the three fields drawn from the conversation on
 * the left. "The section on the left should not have a hide chat button", and
 * "those three answers are really summaries again ... being drawn from the
 * conversation on the left-hand side ... these should be listed as summaries."
 *
 * The chat is always open, so the hidden state and the widening M61 gave it
 * (ISC-589, lead, 2026-09-30) go with the control. The field labels are short
 * nouns (L11), each with its question as the help line. Record identifiers
 * (the field keys, the test ids, the `framing` place) stay.
 */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FRAMING_FIELDS, FRAMING_LABEL, FRAMING_QUESTION, MotivationPage } from "../src/flow/FramingBand.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { emptyBrief, type Project } from "../src/state/projects.ts";

const CSS = await Bun.file(new URL("../src/ui/styles/design.css", import.meta.url).pathname).text();
const SRC = await Bun.file(new URL("../src/flow/FramingBand.tsx", import.meta.url).pathname).text();

const project: Project = {
  id: "62062062-0620-6206-2062-062062062062",
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

describe("ISC-597: the chat on Starting point is always open", () => {
  test("no Hide chat and no Open chat, on the page or in the source", () => {
    const html = page();
    expect(html).toContain('data-testid="dialogue"');
    expect(html).not.toContain("Hide chat");
    expect(html).not.toContain("Open chat");
    expect(html).not.toContain('data-testid="framing-talk-close"');
    expect(html).not.toContain('data-testid="framing-talk-open"');
    expect(SRC).not.toContain("setTalking");
  });

  test("the hidden state and its widening are gone", () => {
    expect(page()).not.toContain("data-talking");
    expect(CSS).not.toContain("data-talking");
  });
});

describe("ISC-597: the right column is Summaries (Your answers since M92)", () => {
  test("headed Summaries, with the chip beside the heading", () => {
    const html = page();
    const answers = html.slice(html.indexOf('data-testid="motivation-answers"'));
    expect(answers).toMatch(/<h2[^>]*>Your answers<\/h2>/);
    expect(answers).not.toMatch(/<h2[^>]*>Starting point<\/h2>/);
    expect(answers.indexOf("Your answers</h2>")).toBeLessThan(answers.indexOf('data-testid="framing-status"'));
  });

  test("the three field labels are Interest, Literatures and Target journal", () => {
    expect(FRAMING_FIELDS.map((f) => FRAMING_LABEL[f])).toEqual(["Interest", "Literatures", "Target journal"]);
  });

  test("each label is followed by its question as the help line, in the page's order", () => {
    const html = page().replace(/&#x27;/g, "'");
    let from = html.indexOf('data-testid="motivation-answers"');
    for (const field of FRAMING_FIELDS) {
      const label = html.indexOf(`>${FRAMING_LABEL[field]}</label>`, from);
      expect({ field, label: label > from }).toEqual({ field, label: true });
      const hint = html.indexOf(`field-hint">${FRAMING_QUESTION[field]}</p>`, label);
      expect({ field, hint: hint > label }).toEqual({ field, hint: true });
      from = hint;
    }
  });
});
