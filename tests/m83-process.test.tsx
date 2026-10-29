/**
 * M83, ISC-699: screen 3 of Getting started puts the process before the outputs.
 * M86, ISC-720 (the owner, 2026-10-14): the process points are removed again;
 * the screen opens on the outputs under its title. Their checks went with them.
 *
 * A co-author (2026-10-05): "I am wondering whether the focus here should be
 * more on the process than on the outputs"; "I do not understand which exact
 * concepts and relationships which Abductive suggestions"; "I do not
 * understand what 'read the lines to look for in the field' means"; and the
 * History line and the authorship card said one thing twice.
 *
 * Matthew's ruling (2026-10-06): process points above the outputs, which stay
 * with their photos. The lead's ruling: a process point is a claim the code
 * makes good, and Abductive searches no literature, so the paper point is
 * about the papers that the researcher brings.
 */

import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Walkthrough, WALKTHROUGH_OUTPUTS, WALKTHROUGH_TITLES } from "../src/ui/Walkthrough.tsx";
import { COMMITMENTS } from "../src/ui/Introduction.tsx";
import { STUDY_TAB_TITLE } from "../src/ui/routes.ts";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { sentenceBreaks, sentencesOf } from "../src/copy/rules.ts";

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function screenThree(): Promise<void> {
  await act(async () => {
    root.render(
      React.createElement(LedgerProvider, {
        store: new InMemoryLedgerStore(),
        children: React.createElement(Walkthrough, { start: 2 }),
      }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

const q = (id: string): HTMLElement | null => container.querySelector(`[data-testid="${id}"]`);
const undertheRules = (s: string) => ({ s, breaks: sentenceBreaks(s).map((b) => b.rule), short: s.split(/\s+/).length <= 25 });

describe("ISC-699 and ISC-720: the process points are gone", () => {
  test("the authorship point is left to the governance card, which says it", () => {
    expect(COMMITMENTS[0]?.body).toContain("the mark is permanent");
  });
});

describe("ISC-699: screen 3's order", () => {
  test("the process heading is the screen's title, the outputs follow under their own subhead", () => {
    expect(WALKTHROUGH_TITLES[2]).toBe("Working with Abductive");
  });

  test("title, the outputs' subhead and the three outputs, then governance; no process points (ISC-720)", async () => {
    await screenThree();
    const title = q("walk-title") as HTMLElement;
    expect(title.tagName).toBe("H1");
    expect(title.textContent).toBe("Working with Abductive");
    expect(q("walk-process")).toBeNull();
    // M86, ISC-723: "What you bring to the table" (ISC-721) is gone too.
    expect(q("walk-bring")).toBeNull();
    const sub = q("walk-outputs-head") as HTMLElement;
    expect(sub.tagName).toBe("H3");
    expect(sub.textContent).toBe("The outputs of a project");
    const places = q("walk-places") as HTMLElement;
    expect(places.getAttribute("aria-labelledby")).toBe(sub.id);
    const commitments = q("walk-commitments") as HTMLElement;
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(title, sub)).toBe(true);
    expect(follows(sub, places)).toBe(true);
    expect(follows(places, commitments)).toBe(true);
    // M89: the Checks output went, so three outputs, each with its photo.
    expect(WALKTHROUGH_OUTPUTS).toHaveLength(3);
    for (let i = 1; i <= 3; i++) expect(q(`walk-output-image-${i}`)).not.toBeNull();
    expect(q("walk-output-image-4")).toBeNull();
  });
});

describe("ISC-699: the output lines", () => {
  test("the ontology line says what Abductive suggests and from what, and names the field list plainly", () => {
    const line = STUDY_TAB_TITLE.ontology;
    expect(line).toContain("Abductive suggests concepts and the relations between them from your answers, your papers and your data.");
    expect(line).toContain("Abductive writes a list of things to look for in the field.");
    expect(line).not.toContain("read the lines to look for");
    for (const s of sentencesOf(line)) expect(undertheRules(s)).toEqual({ s, breaks: [], short: true });
  });

  test("History's line is about change over time, and says something the authorship card does not", () => {
    const history = WALKTHROUGH_OUTPUTS.find((o) => o.name === "History")?.line ?? "";
    expect(history).toBe("Abductive keeps every change in order, so you can follow the project back to its start.");
    expect(history).not.toMatch(/author|who|mark/i);
    expect(undertheRules(history)).toEqual({ s: history, breaks: [], short: true });
    const card = COMMITMENTS[0];
    expect(card?.title).toContain("authorship");
    expect(card?.body).not.toContain("every change");
  });
});
