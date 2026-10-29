/**
 * M70, ISC-646 to ISC-648: the concepts tab reads in full before a decision,
 * with one section per kind.
 *
 * The owner, 2026-10-02: "there are a lot of ellipses that hide some of the
 * text that may be important for the user to see before they accept, refine,
 * reject the ideas", and "Underneath the suggested concepts and relations
 * subsections, there's also a concepts and relations subsection. Why?" Then,
 * after the brief: "The expanded view should be an overlay rather than
 * something that changes the page around."
 *
 * A card on the page is a preview (the name or the pair and the kind, the first
 * sentence, the count of what else it carries). "Read more" opens the whole
 * card in a dialog over the page, every passage and answer in full, with
 * Accept, Refine and Reject inside; the hash carries the open card. The tab has
 * two sections for the two kinds, suggestions first, and one section for every
 * statement awaiting a decision or a home (the lead's ruling).
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { dataOnly, type Chunk, type StoredDocument } from "../src/state/chunks.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { emptyBrief, saveChunks, saveDocument, saveProject } from "../src/state/projects.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages } from "../src/ontology/schema.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { acceptConceptEvents, addConceptEvents, addRelationEvents } from "../src/concepts/door.ts";
import { GAP_MARKER_NOTE } from "../src/interview/conversation.ts";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";
import { cardPath, cardRequested, claimRequested, parseHash, studyPath } from "../src/ui/routes.ts";
import {
  ConceptsPage,
  ConceptsView,
  PROPOSALS_SHOWN,
  countLine,
  firstSentence,
  readMoreId,
  readPath,
  readRequested,
  type ReadTarget,
} from "../src/ui/ConceptsView.tsx";

const BUNDLE = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname).json();
const EVENTS: readonly LedgerEvent[] = BUNDLE.events;
const DOCUMENTS: readonly StoredDocument[] = BUNDLE.documents;
const CHUNKS: readonly Chunk[] = BUNDLE.chunks;
const P: string = BUNDLE.project.id;
const CLAIMS = livePages(projectOntology([...EVENTS], P));

/** The longest passage of the example's own data: far past the 180 characters the old excerpt kept. */
const LONG = [...dataOnly(CHUNKS)].sort((a, b) => b.text.length - a.text.length)[0]!;
/** The researcher's saved answer at Context, as the latest save wrote it. */
const CONTEXT_ANSWER = (EVENTS.filter((e) => e.type === "bound" && e.subject === "context").at(-1) as { statement: string }).statement;
const cited = CLAIMS.find((p) => p.supportingChunks.length > 0)!;
const INSTRUMENTATION = await Bun.file(new URL("../src/workbench/Instrumentation.tsx", import.meta.url).pathname).text();

let n = 0;
const uid = () => `f0f0f0f0-7070-4070-8070-${String((n += 1)).padStart(12, "0")}`;
let t = 1_960_000_000_000;
const clock = { now: () => (t += 10), makeId: uid };

const DEFINITION = "The weekly time a mentor spends reading a founder's update. It runs from none to every update [...]. Mentors set it themselves.";

const envelope = () => ({ id: uid(), ts: (t += 10), actor: "persona:concepts", model: "claude", modelVersion: "test", projectId: P });

function conceptSuggested(conceptId: string, name: string, extra: Partial<Record<string, unknown>> = {}): LedgerEvent {
  return {
    ...envelope(),
    type: "concept-suggested",
    conceptId,
    name,
    definition: DEFINITION,
    properties: ["Reading frequency", "Reading depth", "Who reads"],
    relations: [],
    statementIds: [cited.id],
    statements: ["Mentors who read every update ask sharper questions."],
    source: { kind: "summary", station: "context" },
    ...extra,
  } as LedgerEvent;
}

function relationSuggested(relationId: string, from: string, to: string, extra: Partial<Record<string, unknown>> = {}): LedgerEvent {
  return {
    ...envelope(),
    type: "relation-suggested",
    relationId,
    from,
    to,
    relation: "leads-to",
    claim: "More reading leads to a sharper judgement of the founder. The effect fades after week six.",
    conditions: "When the mentor came through the board",
    statementIds: [],
    statements: [],
    source: { kind: "data", chunkIds: [LONG.id] },
    ...extra,
  } as LedgerEvent;
}

/** The example with one concept suggested, one accepted, a second accepted, a relation suggested and one accepted. */
function built() {
  let events: LedgerEvent[] = [...EVENTS, conceptSuggested("c-dose", "Reading dose"), conceptSuggested("c-kept", "Kept concept")];
  events = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-kept" }, clock)];
  events = [...events, ...addConceptEvents(events, { projectId: P, name: "Judgement shift", definition: "Where a mentor's judgement of a founder moves. It moves late." }, clock)];
  const shift = projectConcepts(events, P, projectOntology(events, P)).accepted.find((c) => c.name === "Judgement shift")!;
  events = [...events, relationSuggested("r-wait", "c-kept", shift.id)];
  events = [
    ...events,
    ...addRelationEvents(
      events,
      { projectId: P, from: shift.id, to: "c-kept", relation: "varies-with", claim: "Judgement shifts vary with the kept concept. Not in week one.", source: { kind: "passage", chunkId: LONG.id } },
      clock,
    ),
  ];
  const accepted = projectConcepts(events, P, projectOntology(events, P)).acceptedRelations[0]!;
  return { events, shift, accepted };
}

const text = (markup: string) =>
  markup.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const flat = (s: string) => s.replace(/\s+/g, " ").trim();

function page(events: readonly LedgerEvent[], reading: ReadTarget | null = null, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(ConceptsPage, {
      projectId: P,
      view: projectConcepts(events, P, projectOntology(events, P)),
      chunks: CHUNKS,
      documents: DOCUMENTS,
      events,
      current: null,
      onCurrent: () => {},
      acts: null,
      reading,
      ...extra,
    } as never),
  );
}

/** The overlay's markup, or "" when none is open. */
function overlay(markup: string): string {
  const at = markup.indexOf("<dialog");
  return at < 0 ? "" : markup.slice(at, markup.indexOf("</dialog>", at) + 9);
}

/** The page without the overlay. */
const beneath = (markup: string) => markup.replace(overlay(markup), "");

/** One card's markup, from its opening tag to its matching close tag. */
function card(markup: string, testId: string): string {
  const at = markup.indexOf(`data-testid="${testId}"`);
  expect(at).toBeGreaterThan(-1);
  const open = markup.lastIndexOf("<", at);
  const tag = markup.slice(open + 1, markup.indexOf(" ", open));
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  re.lastIndex = open + 1;
  let depth = 1;
  for (let m = re.exec(markup); m !== null; m = re.exec(markup)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return markup.slice(open, m.index + m[0].length);
  }
  return markup.slice(open);
}

const boxes = (markup: string) =>
  [...markup.matchAll(/<blockquote class="passage-text[^"]*"[^>]*>([\s\S]*?)<\/blockquote>/g)].map((m) => text(m[1] ?? ""));

describe("the helpers", () => {
  test("firstSentence keeps the first sentence whole, gap marker and all", () => {
    expect(firstSentence(DEFINITION)).toBe("The weekly time a mentor spends reading a founder's update.");
    expect(firstSentence("It runs from none to every update [...]. Then more.")).toBe("It runs from none to every update [...].");
    expect(firstSentence("One sentence only")).toBe("One sentence only");
    expect(firstSentence("")).toBe("");
  });

  test("countLine says each count with its noun, singular at one, and leaves out a zero", () => {
    expect(countLine([[3, "property", "properties"], [2, "statement", "statements"], [1, "passage", "passages"]])).toBe(
      "3 properties, 2 statements, 1 passage",
    );
    expect(countLine([[0, "property", "properties"], [1, "answer", "answers"]])).toBe("1 answer");
    expect(countLine([[0, "property", "properties"]])).toBe("");
  });

  test("the hash carries the open card, the tab still routes to the ontology, and a card link is not an overlay", () => {
    const target: ReadTarget = { kind: "relation", id: "r-1" };
    const hash = readPath(P, target);
    expect(hash).toBe(`#/study/${P}/ontology/read-relation-r-1`);
    expect(readRequested(hash)).toEqual(target);
    expect(readRequested(readPath(P, { kind: "statement", id: "s-9" }))).toEqual({ kind: "statement", id: "s-9" });
    expect(parseHash(hash)).toMatchObject({ view: "study", tab: "ontology" });
    // M67's link rings the card and opens no overlay; the two hashes read apart.
    expect(cardRequested(hash)).toBeNull();
    expect(claimRequested(hash)).toBeNull();
    expect(readRequested(cardPath(P, "relation", "r-1"))).toBeNull();
    expect(readRequested(studyPath(P, "ontology"))).toBeNull();
    expect(readMoreId(target)).toBe("read-more-relation-r-1");
  });
});

describe("a suggested concept previews on the page and opens whole in the overlay (ISC-646)", () => {
  test("the preview shows the name, the first sentence, the counts and the three decisions, and nothing after the first sentence", () => {
    const { events } = built();
    const c = card(page(events), "suggestion-c-dose");
    const body = text(c);
    expect(body).toContain("Reading dose");
    expect(body).toContain("Suggested");
    expect(body).toContain("The weekly time a mentor spends reading a founder's update.");
    expect(body).not.toContain("Mentors set it themselves.");
    expect(body).toMatch(/3 properties, 2 statements, \d+ passages?, 1 answer/);
    for (const a of ["accept", "refine", "reject"]) expect(c).toContain(`data-testid="concept-${a}-c-dose"`);
    expect(body).toContain("Read more");
    expect(c).toContain('aria-haspopup="dialog"');
    expect(c).toContain(`id="${readMoreId({ kind: "concept", id: "c-dose" })}"`);
    expect(body).not.toContain("Reading depth");
    expect(body).not.toContain("Show less");
  });

  test("with no card open the page draws no overlay", () => {
    const { events } = built();
    expect(overlay(page(events))).toBe("");
  });

  test("the overlay is a dialog named by the concept, holding everything in full and Accept, Refine and Reject", () => {
    const { events } = built();
    const markup = page(events, { kind: "concept", id: "c-dose" });
    const d = overlay(markup);
    expect(d).toContain('data-testid="card-overlay"');
    const labelled = /aria-labelledby="([^"]+)"/.exec(d)?.[1];
    expect(labelled).toBeDefined();
    expect(text(new RegExp(`<h2 id="${labelled}">([^<]*)</h2>`).exec(d)?.[1] ?? "")).toBe("Reading dose");
    const body = text(d);
    expect(body).toContain(flat(DEFINITION));
    for (const p of ["Reading frequency", "Reading depth", "Who reads"]) expect(body).toContain(p);
    expect(body).toContain(cited.title);
    expect(body).toContain("Mentors who read every update ask sharper questions.");
    for (const id of cited.supportingChunks) expect(body).toContain(flat(CHUNKS.find((x) => x.id === id)!.text));
    expect(body).toContain(flat(CONTEXT_ANSWER));
    for (const a of ["accept", "refine", "reject"]) expect(d).toContain(`data-testid="concept-${a}-c-dose"`);
    expect(body).toContain("Close");
    expect(body).toContain(GAP_MARKER_NOTE);
    // The overlay's own card carries no Read more.
    expect(body).not.toContain("Read more");
  });

  test("the page beneath an open overlay is the same page, so nothing beneath moves", () => {
    const { events } = built();
    expect(beneath(page(events, { kind: "concept", id: "c-dose" }))).toBe(page(events));
  });

  test("the gap marker's note stays on the preview and in the overlay", () => {
    const { events } = built();
    expect(text(card(page(events), "suggestion-c-dose"))).toContain(GAP_MARKER_NOTE);
    const d = text(overlay(page(events, { kind: "concept", id: "c-dose" })));
    expect(d).toContain(GAP_MARKER_NOTE);
    expect(d).toContain("It runs from none to every update [...].");
  });

  test("a target that names nothing on the page now opens no overlay", () => {
    const { events } = built();
    expect(overlay(page(events, { kind: "concept", id: "c-gone" }))).toBe("");
    expect(overlay(page(events, { kind: "statement", id: "s-gone" }))).toBe("");
  });
});

describe("a suggestion grouped from statements already in the project shows them (ISC-646)", () => {
  /* Found in the Safari walk on the example: the first-open pass suggests
   * concepts and relations "from the statements already in your project", and
   * the statements reach the suggestion only as homes Abductive proposed for
   * them. A card that left them out showed three properties and nothing behind
   * the suggestion. */
  function grouped() {
    const withChunk = CLAIMS.filter((p) => p.supportingChunks.length > 0).slice(0, 2);
    const g = conceptSuggested("c-grouped", "Grouped concept", { statementIds: [], statements: [], source: { kind: "grouping" } });
    const r = relationSuggested("r-grouped", "c-grouped", "c-dose", { source: { kind: "grouping" } });
    const homes = {
      ...envelope(),
      type: "homes-proposed",
      read: withChunk.map((p) => p.id),
      proposals: [
        { statementId: withChunk[0]!.id, home: { kind: "concept", id: "c-grouped" } },
        { statementId: withChunk[1]!.id, home: { kind: "relation", id: "r-grouped" } },
      ],
    } as LedgerEvent;
    return { events: [...EVENTS, conceptSuggested("c-dose", "Reading dose"), g, r, homes], withChunk };
  }

  test("the preview counts the statements whose proposed home is the suggestion, and their passages", () => {
    const { events } = grouped();
    expect(text(card(page(events), "suggestion-c-grouped"))).toMatch(/3 properties, 1 statement, \d+ passages?/);
    expect(text(card(page(events), "relation-suggestion-r-grouped"))).toMatch(/1 statement, \d+ passages?/);
  });

  test("the overlay lists those statements and every passage behind them in full", () => {
    const { events, withChunk } = grouped();
    const concept = text(overlay(page(events, { kind: "concept", id: "c-grouped" })));
    expect(concept).toContain(withChunk[0]!.title);
    for (const id of withChunk[0]!.supportingChunks) expect(concept).toContain(flat(CHUNKS.find((x) => x.id === id)!.text));
    const relation = text(overlay(page(events, { kind: "relation", id: "r-grouped" })));
    expect(relation).toContain(withChunk[1]!.title);
    for (const id of withChunk[1]!.supportingChunks) expect(relation).toContain(flat(CHUNKS.find((x) => x.id === id)!.text));
  });
});

describe("a suggested relation opens to its long passage in full (ISC-646, ISC-647)", () => {
  test("the preview shows the pair, the kind, the first sentence of the claim and the counts", () => {
    const { events } = built();
    const c = card(page(events), "relation-suggestion-r-wait");
    const body = text(c);
    expect(body).toContain("Kept concept");
    expect(body).toContain("leads to");
    expect(body).toContain("Judgement shift");
    expect(body).toContain("More reading leads to a sharper judgement of the founder.");
    expect(body).not.toContain("The effect fades after week six.");
    expect(body).toContain("1 passage");
    expect(body).not.toContain(flat(LONG.text).slice(-60));
    for (const a of ["accept", "refine", "reject"]) expect(c).toContain(`data-testid="relation-${a}-r-wait"`);
  });

  test("the overlay is named by the pair and holds the passage whole, in a box that scrolls, with no ellipsis", () => {
    const { events } = built();
    const d = overlay(page(events, { kind: "relation", id: "r-wait" }));
    expect(text(/<h2[^>]*>([^<]*)<\/h2>/.exec(d)?.[1] ?? "")).toBe("Kept concept leads to Judgement shift");
    const body = text(d);
    expect(LONG.text.length).toBeGreaterThan(600);
    expect(boxes(d)).toContain(flat(LONG.text));
    for (const b of boxes(d)) expect(b).not.toContain("…");
    expect(body).toContain("The effect fades after week six.");
    expect(body).toContain("When the mentor came through the board");
    for (const a of ["accept", "refine", "reject"]) expect(d).toContain(`data-testid="relation-${a}-r-wait"`);
  });

  test("a long passage's box can be reached from the keyboard, so it scrolls without a mouse", () => {
    const { events } = built();
    const box = overlay(page(events, { kind: "relation", id: "r-wait" })).match(/<blockquote class="passage-text"[^>]*>/)?.[0] ?? "";
    expect(box).toContain('tabindex="0"');
    expect(box).toMatch(/aria-label="[^"]+"/);
  });
});

describe("the 180-character excerpt is gone (ISC-647)", () => {
  test("the source keeps no excerpt, no slice of a passage, no 'more passages' cap and no remembered expanded state", async () => {
    const src = await Bun.file(new URL("../src/ui/ConceptsView.tsx", import.meta.url).pathname).text();
    expect(src).not.toContain("excerpt");
    expect(src).not.toMatch(/slice\(0, 179\)|> 180/);
    expect(src).not.toContain("more passages");
    // The addendum: a preview is the only in-page state.
    expect(src).not.toMatch(/sessionStorage|Show less|aria-expanded/);
  });

  test("in every overlay, every passage behind the card reads whole and none ends in an ellipsis", () => {
    const { events, accepted, shift } = built();
    const targets: ReadTarget[] = [
      { kind: "concept", id: "c-dose" },
      { kind: "concept", id: "c-kept" },
      { kind: "concept", id: shift.id },
      { kind: "relation", id: "r-wait" },
      { kind: "relation", id: accepted.id },
    ];
    const all = targets.flatMap((target) => boxes(overlay(page(events, target))));
    expect(all.length).toBeGreaterThan(4);
    for (const b of all) expect(b.endsWith("…")).toBe(false);
    expect(all).toContain(flat(LONG.text));
  });
});

describe("accepted cards preview and open the same way (ISC-647)", () => {
  test("an accepted concept previews as its name, first sentence and counts, and opens to all of it", () => {
    const { events, shift } = built();
    const preview = text(card(page(events), `concept-card-${shift.id}`));
    expect(preview).toContain("Judgement shift");
    expect(preview).toContain("Where a mentor's judgement of a founder moves.");
    expect(preview).not.toContain("It moves late.");
    expect(preview).toMatch(/1 relation\b/);
    expect(preview).not.toContain("Add property");
    const full = text(overlay(page(events, { kind: "concept", id: shift.id })));
    expect(full).toContain("It moves late.");
    expect(full).toContain("Add property");
    expect(full).toContain(flat(LONG.text));
  });

  test("an accepted relation previews as its pair, first sentence and counts, and opens to all of it", () => {
    const { events, accepted } = built();
    const preview = text(card(page(events), `relation-card-${accepted.id}`));
    expect(preview).toContain("Judgement shifts vary with the kept concept.");
    expect(preview).not.toContain("Not in week one.");
    expect(preview).toContain("1 passage");
    const full = text(overlay(page(events, { kind: "relation", id: accepted.id })));
    expect(full).toContain("Not in week one.");
    expect(full).toContain(flat(LONG.text));
    expect(full).toContain("Remove relation");
  });

  test("the overlay carries no second copy of the card's id, so a link still lands on the card beneath", () => {
    const { events, shift } = built();
    const markup = page(events, { kind: "concept", id: shift.id });
    expect(markup.split(`id="concept-${shift.id}"`).length - 1).toBe(1);
    expect(overlay(markup)).not.toContain(`id="concept-${shift.id}"`);
  });
});

describe("one section for every statement awaiting a decision or a home (the lead's ruling)", () => {
  /** A statement suggested at a step save, and a claim already in the project with a proposed home. */
  function statements() {
    let events: LedgerEvent[] = [...EVENTS];
    events = [...events, ...addConceptEvents(events, { projectId: P, name: "Office-hours slot", definition: "The time a mentor gives a founder." }, clock)];
    const slot = projectConcepts(events, P, projectOntology(events, P)).accepted[0]!;
    events = [
      ...events,
      { ...envelope(), type: "homes-proposed", read: [cited.id], proposals: [{ statementId: cited.id, home: { kind: "concept", id: slot.id } }] } as LedgerEvent,
      {
        ...envelope(),
        type: "statement-suggested",
        statementId: "s-new",
        text: "Shift leads decide who gets the Saturday pantry slots. They decide on the Friday.",
        home: { kind: "concept", id: slot.id },
        source: { kind: "data", chunkIds: [LONG.id] },
        chunkId: LONG.id,
      } as LedgerEvent,
    ];
    return { events, slot };
  }

  test("Suggested statements is no section of its own: the suggestions sit first under Statements to place", () => {
    const { events } = statements();
    const markup = page(events);
    const h2 = [...markup.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(h2).not.toContain("Suggested statements");
    expect(markup).not.toContain('data-testid="suggested-statements"');
    const section = card(markup, "statements-to-place");
    const suggestion = section.indexOf('data-testid="statement-suggestion-s-new"');
    const toPlace = section.indexOf(`data-testid="to-place-${cited.id}"`);
    expect(suggestion).toBeGreaterThan(-1);
    expect(suggestion).toBeLessThan(toPlace);
  });

  test("a suggested statement previews with its first sentence, the Suggested chip, its home and the decisions, and opens whole", () => {
    const { events } = statements();
    const preview = card(page(events), "statement-suggestion-s-new");
    expect(text(preview)).toContain("Shift leads decide who gets the Saturday pantry slots.");
    expect(text(preview)).not.toContain("They decide on the Friday.");
    expect(text(preview)).toContain("Suggested");
    expect(text(preview)).toContain("1 passage");
    expect(preview).toContain('data-testid="statement-suggestion-s-new-accept"');
    expect(preview).toContain('data-testid="statement-suggestion-s-new-reject"');
    const d = overlay(page(events, { kind: "statement", id: "s-new" }));
    expect(text(d)).toContain("They decide on the Friday.");
    // The title carries the statement in full, once; the card does not repeat it (seen in the Safari walk).
    expect(text(d).split("They decide on the Friday.").length - 1).toBe(1);
    expect(text(/<h2[^>]*>([^<]*)<\/h2>/.exec(d)?.[1] ?? "")).toBe("Shift leads decide who gets the Saturday pantry slots. They decide on the Friday.");
    expect(boxes(d)).toContain(flat(LONG.text));
    expect(d).toContain('data-testid="statement-suggestion-s-new-accept"');
  });

  test("a statement to place previews with its home and Accept, and opens to its passages in full", () => {
    const { events } = statements();
    const preview = card(page(events), `to-place-${cited.id}`);
    expect(text(preview)).toContain(firstSentence(cited.title));
    expect(preview).toContain(`data-testid="to-place-${cited.id}-accept"`);
    expect(text(preview)).toMatch(/\d+ passages?/);
    const chunk = CHUNKS.find((x) => x.id === cited.supportingChunks[0])!;
    expect(text(preview)).not.toContain(flat(chunk.text).slice(-60));
    const d = overlay(page(events, { kind: "statement", id: cited.id }));
    expect(d).toContain(`data-testid="to-place-${cited.id}-accept"`);
    expect(boxes(d)).toContain(flat(chunk.text));
    expect(PROPOSALS_SHOWN).toBe(3);
  });
});

describe("one section per kind (ISC-648)", () => {
  test("two headings, Concepts and Relations, and no Suggested concepts or Suggested relations", () => {
    const { events } = built();
    const markup = page(events);
    const h2 = [...markup.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(h2).not.toContain("Suggested concepts");
    expect(h2).not.toContain("Suggested relations");
    expect(h2.filter((h) => h === "Concepts").length).toBe(1);
    expect(h2.filter((h) => h === "Relations").length).toBe(1);
  });

  test("within each section the suggestions come first, marked Suggested, and the accepted cards follow", () => {
    const { events, shift, accepted } = built();
    const markup = page(events);
    const concepts = markup.slice(markup.indexOf('data-testid="concepts"'), markup.indexOf('data-testid="relations"'));
    expect(concepts.indexOf('data-testid="suggestion-c-dose"')).toBeGreaterThan(-1);
    expect(concepts.indexOf('data-testid="suggestion-c-dose"')).toBeLessThan(concepts.indexOf(`data-testid="concept-card-${shift.id}"`));
    expect(concepts.indexOf('data-testid="suggestion-c-dose"')).toBeLessThan(concepts.indexOf('data-testid="concept-card-c-kept"'));
    const relations = markup.slice(markup.indexOf('data-testid="relations"'));
    expect(relations.indexOf('data-testid="relation-suggestion-r-wait"')).toBeGreaterThan(-1);
    expect(relations.indexOf('data-testid="relation-suggestion-r-wait"')).toBeLessThan(relations.indexOf(`data-testid="relation-card-${accepted.id}"`));
    expect(card(markup, "suggestion-c-dose")).toContain('data-testid="suggested-chip-c-dose"');
    expect(text(card(markup, "relation-suggestion-r-wait"))).toContain("Suggested");
  });

  test("each section has its own empty state, saying what belongs there and offering the action", () => {
    const fresh = page(EVENTS);
    expect(text(fresh)).toContain(
      "Save a summary at a step on Design, or read your data, and Abductive suggests concepts from your words.",
    );
    expect(fresh).toContain('data-testid="concept-add"');
    expect(text(fresh)).toContain("A relation joins two concepts, so accept or add a second concept first.");
    let events: LedgerEvent[] = [...EVENTS];
    for (const name of ["One", "Two"]) events = [...events, ...addConceptEvents(events, { projectId: P, name, definition: `${name}.` }, clock)];
    const two = page(events);
    expect(text(two)).toContain("Add a relation between two of your concepts.");
    expect(two).toContain('data-testid="relation-add"');
    expect(page(built().events)).not.toContain('data-testid="concepts-empty"');
  });
});

describe("History names the places that exist (the lead's ruling)", () => {
  test("a suggested or rejected concept lands under Concepts, a relation under Relations, a statement under Statements to place", () => {
    const { events } = built();
    const rejected = [
      ...events,
      { ...envelope(), actor: "human", type: "concept-rejected", conceptId: "c-dose", reason: "Too close." },
      { ...envelope(), actor: "human", type: "relation-rejected", relationId: "r-wait", reason: "Too close." },
      { ...envelope(), type: "statement-suggested", statementId: "s-h", text: "A statement.", home: { kind: "concept", id: "c-kept" }, source: { kind: "grouping" } },
      { ...envelope(), actor: "human", type: "statement-rejected", statementId: "s-h", reason: "Too close." },
    ] as LedgerEvent[];
    const rows = projectLedger(rejected);
    const place = (kind: string) => [...new Set(rows.filter((r) => r.kind === kind).map((r) => r.changed))];
    expect(place("concept-suggested")).toEqual(["Concepts"]);
    expect(place("concept-rejected")).toEqual(["Concepts"]);
    expect(place("relation-suggested")).toEqual(["Relations"]);
    expect(place("relation-rejected")).toEqual(["Relations"]);
    expect(place("statement-suggested")).toEqual(["Statements to place"]);
    expect(place("statement-rejected")).toEqual(["Statements to place"]);
    for (const gone of ['changed: "Suggested concepts"', 'changed: "Suggested relations"', 'changed: "Suggested statements"']) expect(INSTRUMENTATION).not.toContain(gone);
  });
});

describe("live: the overlay opens from Read more, follows the hash, and closes four ways", () => {
  async function mount(events: readonly LedgerEvent[], hash: string) {
    await saveProject({ id: P, title: "the example project", stage: "design-brief", createdAt: 1, brief: emptyBrief() } as never);
    for (const doc of DOCUMENTS) await saveDocument(doc);
    await saveChunks(CHUNKS);
    const store = new InMemoryLedgerStore();
    for (const event of events) await store.append(event);
    window.location.hash = hash;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(LedgerProvider, { store, children: React.createElement(ConceptsView, { projectId: P }) }));
    });
    const find = async (selector: string) => {
      for (let i = 0; i < 60 && host.querySelector(selector) === null; i += 1) {
        await act(async () => {
          await wait(5);
        });
      }
      return host.querySelector(selector) as HTMLElement | null;
    };
    const settle = async () => {
      await act(async () => {
        await wait(20);
      });
    };
    const done = async () => {
      await act(async () => root.unmount());
      host.remove();
    };
    return { host, store, find, settle, done };
  }
  const dialog = (host: HTMLElement) => host.querySelector('[data-testid="card-overlay"]') as HTMLDialogElement | null;

  test("Read more opens a modal dialog and puts the card in the hash; the Close control closes it and focus returns to Read more", async () => {
    const { events } = built();
    const { host, find, settle, done } = await mount(events, studyPath(P, "ontology"));
    const more = await find('[data-testid="card-read-c-dose"]');
    expect(more).not.toBeNull();
    expect(dialog(host)).toBeNull();
    await act(async () => more!.click());
    await settle();
    expect(window.location.hash).toBe(readPath(P, { kind: "concept", id: "c-dose" }));
    expect(dialog(host)?.open).toBe(true);
    expect(dialog(host)?.textContent).toContain("Reading depth");
    // The card beneath is still a preview.
    expect(host.querySelector('[data-testid="suggestion-c-dose"]')?.textContent).not.toContain("Reading depth");
    await act(async () => (host.querySelector('[data-testid="card-overlay-close"]') as HTMLButtonElement).click());
    await settle();
    expect(dialog(host)).toBeNull();
    expect(readRequested(window.location.hash)).toBeNull();
    expect(document.activeElement?.id).toBe(readMoreId({ kind: "concept", id: "c-dose" }));
    await done();
  });

  test("a reload on the overlay's hash reopens it, Escape closes it, and a press outside it closes it", async () => {
    const { events } = built();
    const { host, find, settle, done } = await mount(events, readPath(P, { kind: "relation", id: "r-wait" }));
    const d = await find('[data-testid="card-overlay"]');
    expect(d).not.toBeNull();
    expect((d as HTMLDialogElement).open).toBe(true);
    // The project's passages load after its events; the box fills in once they arrive.
    for (let i = 0; i < 60 && !flat(d!.textContent ?? "").includes(flat(LONG.text).slice(0, 80)); i += 1) await settle();
    expect(flat(d!.textContent ?? "")).toContain(flat(LONG.text).slice(0, 80));
    // Escape: the platform closes the dialog and fires its close event.
    await act(async () => (d as HTMLDialogElement).close());
    await settle();
    expect(dialog(host)).toBeNull();
    // Open again and press the backdrop, which lands on the dialog itself.
    await act(async () => (host.querySelector('[data-testid="card-read-r-wait"]') as HTMLButtonElement).click());
    await settle();
    const again = dialog(host)!;
    expect(again.open).toBe(true);
    await act(async () => again.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    expect(dialog(host)).toBeNull();
    // A press inside the panel does not close it.
    await act(async () => (host.querySelector('[data-testid="card-read-r-wait"]') as HTMLButtonElement).click());
    await settle();
    await act(async () => (dialog(host)!.querySelector(".sheet-body") as HTMLElement).click());
    await settle();
    expect(dialog(host)?.open).toBe(true);
    await done();
  });

  test("a decision taken in the overlay closes it and applies to the card beneath", async () => {
    const { events } = built();
    const { host, store, settle, done } = await mount(events, readPath(P, { kind: "concept", id: "c-dose" }));
    await settle();
    const accept = dialog(host)!.querySelector('[data-testid="concept-accept-c-dose"]') as HTMLButtonElement;
    await act(async () => accept.click());
    for (let i = 0; i < 20 && host.querySelector('[data-testid="concept-card-c-dose"]') === null; i += 1) await settle();
    expect(dialog(host)).toBeNull();
    expect(host.querySelector('[data-testid="suggestion-c-dose"]')).toBeNull();
    expect(host.querySelector('[data-testid="concept-card-c-dose"]')).not.toBeNull();
    // Focus follows the redraw to the accepted card's Read more (found in the Safari walk).
    await settle();
    expect(document.activeElement?.id).toBe(readMoreId({ kind: "concept", id: "c-dose" }));
    expect(host.querySelector('[data-testid="concept-card-c-dose"]')?.contains(document.activeElement)).toBe(true);
    const written = await store.readAll();
    expect(written.some((e) => e.type === "concept-accepted" && e.conceptId === "c-dose")).toBe(true);
    await done();
  });

  test("a card link still scrolls to a card and rings it, and opens no overlay", async () => {
    const { events, accepted } = built();
    const { host, find, settle, done } = await mount(events, studyPath(P, "ontology"));
    const link = await find(`[data-testid="relation-from-link-${accepted.id}"]`);
    await act(async () => link!.click());
    await settle();
    expect(window.location.hash).toBe(cardPath(P, "concept", accepted.from));
    expect(dialog(host)).toBeNull();
    expect((await find(`[data-testid="concept-card-${accepted.from}"][data-focus="true"]`)) !== null).toBe(true);
    await done();
  });
});

describe("the styles", () => {
  test("a passage box scrolls inside itself, the overlay is bounded and scrolls, and the page chips keep their clamp", async () => {
    const css = await Bun.file(new URL("../src/ui/styles/concepts.css", import.meta.url).pathname).text();
    const rule = (sel: string) => css.slice(css.indexOf(`${sel} {`), css.indexOf("}", css.indexOf(`${sel} {`)));
    expect(rule(".passage-text")).toContain("overflow-y: auto");
    expect(rule(".passage-text")).toContain("max-height");
    expect(rule(".passage-text")).toContain("white-space: pre-wrap");
    expect(rule(".card-overlay")).toContain("width: min(");
    // The title and Close stay in view while the card scrolls beneath them (seen in the Safari walk).
    expect(rule(".card-overlay .sheet-head")).toContain("position: sticky");
    expect(css).not.toMatch(/line-clamp|text-overflow:\s*ellipsis/);
    // A statement to place is a card, and the list row rule must not take its side padding (seen in the Safari walk).
    expect(rule(".unplaced-list > li.concept-card")).toContain("padding: var(--space-md)");
    const sheet = await Bun.file(new URL("../src/ui/styles/components.css", import.meta.url).pathname).text();
    expect(sheet).toMatch(/\.sheet-body \{[^}]*overflow-y: auto/);
    const ontology = await Bun.file(new URL("../src/ui/styles/ontology.css", import.meta.url).pathname).text();
    expect(ontology).toContain("-webkit-line-clamp: 2;");
  });
});

describe("the Help (ISC-648)", () => {
  test("the parts name Concepts, Relations and Statements to place once each, with suggestions first and Read more opening the card over the page", async () => {
    const { PAGE_HELP } = await import("../src/ui/pageHelp.ts");
    const parts = PAGE_HELP.ontology.parts.map((p: { name: string }) => p.name);
    for (const gone of ["Suggested concepts", "Suggested relations", "Suggested statements"]) expect(parts).not.toContain(gone);
    for (const name of ["Concepts", "Relations", "Statements to place"]) expect(parts.filter((p: string) => p === name).length).toBe(1);
    const said = (name: string) => PAGE_HELP.ontology.parts.find((p: { name: string }) => p.name === name)!.says.join(" ");
    expect(said("Concepts")).toContain("Suggested");
    expect(said("Concepts")).toContain("Read more");
    expect(said("Concepts")).toMatch(/over the page/);
    expect(said("Concepts")).not.toMatch(/Show less|stays open for this session/);
    expect(said("Relations")).toContain("Suggested");
    expect(said("Statements to place")).toMatch(/suggested at a step|Abductive suggests statements/);
  });
});
