/**
 * The material behind the claim in view (M46).
 *
 * The owner's ask, 2026-09-13: "free up that space and let's see how it looks to
 * bring the reviewer's line and rival panel there. I'm actually interested in
 * potentially using that space also mainly for when the user is viewing 'Your
 * claims and what joins them' to be able to more easily see the relevant material
 * which is currently below the model."
 *
 * Everything here reads the shipped example at `tests/fixtures/coldharbour.bundle.json`,
 * because the defect is about what a real study's claim cites and a hand-built
 * two-page fixture cannot see it: the claim the brief names, "Uniform pages stop
 * mentors from reading them", cites three passages from three different documents,
 * and the pane has to name all three files and draw all three texts.
 *
 * The last block presses a node on the map with a real ledger behind it, because
 * "selecting a claim on the map selects it for the pane" is a claim about a press
 * and cannot be read off a string.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { emptyBrief, saveChunks, saveDocument, saveProject } from "../src/state/projects.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages, type OntologyGraph, type OntologyPage } from "../src/ontology/schema.ts";


import {
  literaturePath,
  literatureRequested,
  passageElementId,
  passagePath,
  passageRequested,
} from "../src/ui/routes.ts";

const BUNDLE = await Bun.file(
  new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname,
).json();

const EVENTS: readonly LedgerEvent[] = BUNDLE.events;
const DOCUMENTS: readonly StoredDocument[] = BUNDLE.documents;
const CHUNKS: readonly Chunk[] = BUNDLE.chunks;
const PROJECT: string = BUNDLE.project.id;
const GRAPH: OntologyGraph = projectOntology([...EVENTS], PROJECT);

/** The claim the brief names, off the example rather than written here. */
const CITING = livePages(GRAPH).find(
  (p) => p.title === "Uniform pages stop mentors from reading them",
);

/** Comments are notes to whoever maintains this, not the page speaking. */
function read(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}


  // M63, the lead's rulings of 2026-09-30: the old model tab's citedPassages left with it; superseded: "it cites three passages, from Olivia Ward, the fieldnote and the memo"

// M63, the lead's rulings of 2026-09-30: the old model tab's citedPassages, pane left with it; superseded: describe("the pane draws the passages the open claim cites", () => {

// M63, the lead's rulings of 2026-09-30: the old model tab's ClaimMaterial, pane left with it; superseded: describe("a claim that cites nothing says so", () => {

// M63, the lead's rulings of 2026-09-30: the old model tab's pane left with it; superseded: describe("no claim open says how to open one", () => {

  // M63, the lead's rulings of 2026-09-30: the old model tab's ClaimMaterial left with it; superseded: "a bundle imported without its material shows no uuid"
  // M63, the lead's rulings of 2026-09-30: the old model tab's passageSourceLine left with it; superseded: "a passage whose document is gone still says what it is"

describe("a passage is somewhere a link can land", () => {
  test("the route carries the chunk id and the element id is the same string", () => {
    const chunkId = CITING?.supportingChunks[0] ?? "";
    expect(passagePath("abc", chunkId)).toBe(`#/study/abc/material/passage-${chunkId}`);
    expect(passageRequested(passagePath("abc", chunkId))).toBe(chunkId);
    // The shell scrolls to an element by id, so a second spelling would be a link
    // that resolves and lands nowhere.
    expect(passagePath("abc", chunkId)).toEndWith(passageElementId(chunkId));
  });

  test("Anti: the predicates do not answer for each other's landing", () => {
    expect(passageRequested("#/study/abc/material")).toBeNull();
    expect(passageRequested(literaturePath("abc"))).toBeNull();
    expect(literatureRequested(passagePath("abc", "c1"))).toBe(false);
  });

  test("the Material tab writes the id the route names, and opens what it asks for", async () => {
    const source = await Bun.file(
      new URL("../src/flow/Passage.tsx", import.meta.url).pathname,
    ).text();
    expect(source).toContain("id={passageElementId(chunk.id)}");
    const corpus = await Bun.file(
      new URL("../src/flow/CorpusMaterial.tsx", import.meta.url).pathname,
    ).text();
    // The document fold and the passage both, because a passage behind two closed
    // folds is not a passage the researcher can see.
    expect(corpus).toContain("doc.id === askedDocument");
    expect(corpus).toContain("chunk.id === askedPassage ? { startOpen: true }");
    /* And the scroll, owned here rather than by the shell's landing table: a
     * passage exists only after the corpus comes back from storage and the fold
     * holding it opens, which is two async steps after the shell's one frame. */
    expect(corpus).toContain("passageElementId(askedPassage))?.scrollIntoView");
    const shell = await Bun.file(
      new URL("../src/ui/AppShell.tsx", import.meta.url).pathname,
    ).text();
    expect(shell).not.toContain("passageRequested");
  });
});

// ── The one thing a string cannot answer ────────────────────────────────────

  // M63, the lead's rulings of 2026-09-30: the old model tab's OntologyView left with it; superseded: "pressing a node on the map puts that claim"
