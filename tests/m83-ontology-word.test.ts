/**
 * M83, ISC-700: "your model" becomes "your ontology"; "Add to model" becomes
 * "Add to ontology".
 *
 * A co-author (2026-10-05): "I am confused about what the 'add to model'
 * button means. Which model are we talking about here? Is it the Abductive
 * circular model which was introduced in the beginning? And what does saving it
 * to the model do?" Matthew's ruling (2026-10-06): rename everywhere a
 * researcher reads it. Part 5's rule stands: identifiers, event types, routes,
 * stored keys, the JSON exports' keys and the shipped example keep their names,
 * and "the model" stays the language model.
 *
 * Held here: the sweep finds no "your model" left in any source file outside a
 * comment (the one "your model provider", which is the language model's
 * provider, aside); the retired-words scan now carries the phrase, fires on it
 * and leaves "the model" alone; the control reads "Add to ontology"; and the
 * sentence that says where an added expectation goes renders once on Sources,
 * however many papers carry the control, and sits in the Sources Help too.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { beforeEach, describe, expect, test } from "bun:test";
import { Glob } from "bun";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { LedgerEvent } from "../src/ledger/events.ts";

import { ADD_LABEL, ADD_NOTE, ADDED_NOTE } from "../src/flow/PaperExpectations.tsx";
import { SeminalCorpus } from "../src/flow/SeminalCorpus.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import * as projects from "../src/state/projects.ts";
import { forgetDetectedBridge } from "../src/inference/cliBridge.ts";
import { PAGE_HELP } from "../src/ui/pageHelp.ts";
import { ONTOLOGY_TAB_LABEL } from "../src/concepts/vocabulary.ts";
import { RETIRED_TERMS, uncommented } from "./copyBarScan.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const STANDARD = await Bun.file(new URL("../docs/copy-standard.md", import.meta.url).pathname).text();

/** "your model" for the ontology; "your model provider" is the language model's. */
const YOUR_MODEL = /\byour\s+model\b(?!\s+provider)/gi;

describe("ISC-700: the sweep", () => {
  test("no source file says 'your model' outside a comment", async () => {
    const left: string[] = [];
    for await (const rel of new Glob("**/*.{ts,tsx}").scan(SRC)) {
      const body = uncommented(await Bun.file(SRC + rel).text());
      for (const m of body.matchAll(YOUR_MODEL)) {
        const at = body.lastIndexOf("\n", m.index ?? 0);
        left.push(`${rel}: ${body.slice(at + 1, body.indexOf("\n", m.index ?? 0)).trim().slice(0, 120)}`);
      }
    }
    expect(left).toEqual([]);
  });

  test("the retired-words scan carries the phrase, and fires on it alone", () => {
    const term = RETIRED_TERMS.find((t) => t.term === "your model");
    expect(term).toBeDefined();
    const fires = (run: string) => term?.pattern.test(run) ?? false;
    expect(fires("A claim in your model.")).toBe(true);
    expect(fires("Your model has three claims.")).toBe(true);
    expect(fires("Calls to the model go out through your own subscription.")).toBe(false);
    expect(fires("Most checks ask your model provider, so a run takes a few seconds.")).toBe(false);
    expect(fires("A claim in your ontology.")).toBe(false);
  });

  test("the copy standard's table carries the new row and the claim gloss, dated", () => {
    expect(STANDARD).toContain(
      "| The researcher's web of concepts, relations and claims | ontology, your ontology | model, your model |",
    );
    expect(STANDARD).toContain("| claim | a statement in your ontology |");
    expect(STANDARD).not.toContain("| claim | a statement in your model |");
    // Dated in L12's own paragraph, which introduces the table.
    const l12 = STANDARD.slice(STANDARD.indexOf("- **L12."), STANDARD.indexOf("| Object | Say | Never |"));
    expect(l12).toContain("2026-10-06, ISC-700");
  });
});

describe("ISC-700: Add to ontology", () => {
  test("the control reads Add to ontology, and Added stays", () => {
    expect(ADD_LABEL).toBe("Add to ontology");
    expect(ADDED_NOTE).toBe("Added");
  });

  test("the sentence names the control, Abductive as the actor, and where the expectation goes", () => {
    expect(ADD_NOTE).toBe(
      `Press Add to ontology, and Abductive sends the expectation to ${ONTOLOGY_TAB_LABEL} as a suggestion, where you accept or reject it.`,
    );
  });

  test("Sources' Help carries the sentence under Papers", () => {
    const papers = PAGE_HELP.material.parts.find((p) => p.name === "Papers");
    expect(papers?.says).toContain(ADD_NOTE);
  });
});

/* ── The sentence on the page, once (C6) ─────────────────────────────────── */

beforeEach(() => {
  forgetDetectedBridge();
  try {
    globalThis.sessionStorage?.clear();
  } catch {
    // No storage, which reads as nobody signed in.
  }
});

let seq = 0;
const uid = () => `eeeeeeee-4444-4444-8444-${String((seq += 1)).padStart(12, "0")}`;
const doc = (id: string, name: string) => ({ id, projectId: "", name, kind: "literature", createdAt: 1, chunkCount: 1 });
const chunk = (id: string, documentId: string) => ({
  id,
  projectId: "",
  documentId,
  kind: "literature",
  text: "a passage",
  index: 0,
});

function fitEvent(projectId: string, paperKey: string, paperName: string, baselines: readonly unknown[]): LedgerEvent {
  return {
    id: uid(),
    ts: 1,
    actor: "system",
    projectId,
    model: "m",
    modelVersion: "v",
    type: "paper-fit",
    paperKey,
    paperName,
    verdict: "fits",
    reason: "It speaks to handovers.",
    framingDigest: "",
    baselines,
  } as LedgerEvent;
}

async function sources(projectId: string, events: readonly LedgerEvent[]): Promise<{ host: HTMLElement; done: () => void }> {
  await projects.saveProject({
    id: projectId,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...projects.emptyBrief(), researchQuestion: "expected a shared picture, found a shared form", seminalCorpus: "" },
  } as never);
  const store = new InMemoryLedgerStore();
  for (const event of events) await store.append(event as never);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(LedgerProvider as never, { store } as never,
        React.createElement(SeminalCorpus as never, {
          projectId,
          documents: [doc("d1", "bechky-2006.pdf"), doc("d2", "ozcan-2015.pdf")],
          chunks: [chunk("c1", "d1"), chunk("c2", "d2")],
          onAdded: () => {},
        } as never),
      ) as never,
    );
  });
  for (let i = 0; i < 40; i += 1) {
    await act(async () => {
      await wait(5);
    });
    if (host.querySelectorAll('[data-testid^="expects-"]').length >= 2) break;
  }
  return {
    host,
    done: () => {
      root.unmount();
      host.remove();
    },
  };
}

describe("ISC-700: the sentence renders once on Sources", () => {
  test("two papers with the control, one sentence, above the papers", async () => {
    const P = "m83-add-note";
    const { host, done } = await sources(P, [
      fitEvent(P, "d1", "bechky-2006.pdf", [{ id: "d1#0", expectation: "Handoffs fail without questions.", scope: "on wards", chunkId: "c1" }]),
      fitEvent(P, "d2", "ozcan-2015.pdf", [{ id: "d2#0", expectation: "Status shapes who speaks.", scope: "in clinics", chunkId: "c2" }]),
    ]);
    expect(host.querySelectorAll('[data-testid^="expects-add-"]')).toHaveLength(2);
    const notes = host.querySelectorAll('[data-testid="add-to-ontology-note"]');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toBe(ADD_NOTE);
    const list = host.querySelector('[data-testid="literature-docs"]') as HTMLElement;
    expect(Boolean((notes[0] as Node).compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(host.textContent).not.toMatch(/Add to model|your model/i);
    done();
  });

  test("with no expectation to add, the sentence is absent", async () => {
    const P = "m83-add-note-none";
    const { host, done } = await sources(P, [fitEvent(P, "d1", "bechky-2006.pdf", []), fitEvent(P, "d2", "ozcan-2015.pdf", [])]);
    expect(host.querySelector('[data-testid="add-to-ontology-note"]')).toBeNull();
    done();
  });
});
