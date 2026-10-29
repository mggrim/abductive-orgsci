/**
 * The Ontology view, and stations as places (ISC-366 … ISC-371).
 *
 * Two changes that look like layout and are not. Moving the graph out of the
 * Design view touches the one property v2 was forked to create — that the
 * researcher's own ontology stays on screen while they answer questions about
 * it — so the tests here are about what remains on Design, not about where the
 * graph went. And scoping the conversation to a station only means anything if
 * a turn knows which station it was taken at, which it did not until now:
 * `topic` says `station:site-selection` for a station probe and says nothing
 * about a station for the lint, obligation and matrix moves that make up most
 * of a real session.
 */

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildTranscript, exchangeIds, turnsAtStation } from "../src/workbench/Dialogue.tsx";
import { validateEvent } from "../src/ledger/events.ts";
import { STUDY_TABS, STUDY_TAB_LABEL, parseHash, studyPath } from "../src/ui/routes.ts";
import type { LedgerEvent, PageType, QuestionSelectionEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { connectingEdges, liveEdges, livePages } from "../src/ontology/schema.ts";
import { projectAnchoring } from "../src/views/anchoring.ts";

import { buildDiagramSvg } from "../src/export/diagram.ts";
import {
  LEAF_RATIO,
  SIZE_CONTRAST_READS,
  SIZE_CONTRAST_TERM,
  drawsSizeContrast,
  layoutGraph,
} from "../src/workbench/graphLayout.ts";

const PROJECT = "study-1";
let seq = 0;
// The ledger requires real UUIDs, which is a guarantee worth not weakening
// for a test's convenience.
const id = () => crypto.randomUUID();

function ask(topic: string, question: string, station?: string): QuestionSelectionEvent {
  return {
    id: id(),
    ts: ++seq,
    actor: "system",
    projectId: PROJECT,
    type: "question-selection",
    moveId: `m-${seq}`,
    topic,
    question,
    alternatives: [],
    mode: "interrogation",
    reason: "because",
    ...(station === undefined ? {} : { station }),
  };
}

function delivered(q: QuestionSelectionEvent, text: string): LedgerEvent {
  return {
    id: id(),
    ts: ++seq,
    actor: "persona:interviewer",
    projectId: PROJECT,
    model: "m",
    modelVersion: "v",
    type: "response",
    text,
    inReplyTo: q.id,
  } as LedgerEvent;
}

function answered(q: QuestionSelectionEvent, text: string): LedgerEvent {
  return {
    id: id(),
    ts: ++seq,
    actor: "human",
    projectId: PROJECT,
    type: "response",
    text,
    inReplyTo: q.id,
  } as LedgerEvent;
}

function declined(q: QuestionSelectionEvent): LedgerEvent {
  return {
    id: id(),
    ts: ++seq,
    actor: "human",
    projectId: PROJECT,
    type: "refusal",
    kind: "not-now",
    questionEventId: q.id,
  } as LedgerEvent;
}

describe("the Your model tab has a route of its own (ISC-366)", () => {
  test("it is a study tab with a label", () => {
    // D1 (M27): the route id is still `ontology`, so a co-author's link
    // survives; the label is what a first-year can read. "Ontology" means one
    // thing in philosophy of science, another in Gioia-style methods writing
    // and a third in computer science, and the page had to gloss itself in its
    // own h1 to be understood.
    expect(STUDY_TABS).toContain("ontology");
    // M63, ISC-609: the owner renamed the tab "Emerging project ontology".
    expect(STUDY_TAB_LABEL.ontology).toBe("Emerging project ontology");
  });

  test("its path parses back to itself", () => {
    const route = parseHash(studyPath(PROJECT, "ontology"));
    expect(route).toMatchObject({ view: "study", projectId: PROJECT, tab: "ontology" });
  });

  test("Anti: it sits right after Material, not at the end", () => {
    // Material follows Design by decision (2026-09-08), and the model of the
    // phenomenon comes straight after what it is built on. Pushed to the end
    // it reads as a settings page.
    expect(STUDY_TABS.indexOf("material")).toBe(STUDY_TABS.indexOf("design") + 1);
    expect(STUDY_TABS.indexOf("ontology")).toBe(STUDY_TABS.indexOf("material") + 1);
  });
});

describe("a turn knows which station it was taken at (ISC-367)", () => {
  test("the station survives the ledger's validation", () => {
    expect(validateEvent(ask("lint:orphan-construct:p1", "Why?", "sample"))).toEqual([]);
  });

  test("Anti: a turn with no station is still a valid turn", () => {
    // Every study that existed before this field did. A ledger does not get to
    // rewrite its own history, so those turns belong to the study and to no
    // station rather than being back-filled with a guess.
    expect(validateEvent(ask("puzzle:root", "What is going on?"))).toEqual([]);
  });
});

describe("a station shows its own exchange (ISC-368)", () => {
  test("a whole exchange stays with the station its question was asked at", () => {
    const q = ask("lint:orphan-construct:p1", "What grounds it?", "sample");
    const entries = buildTranscript([q, delivered(q, "A reaction.\n\nWhat grounds it?"), answered(q, "This does.")]);
    expect(entries).toHaveLength(2);
    for (const e of entries) expect(e.station).toBe("sample");
    expect(turnsAtStation(entries, "sample")).toHaveLength(2);
  });

  test("a decline stays with the station too, rather than floating free", () => {
    const q = ask("station:context", "What is the setting?", "context");
    const entries = buildTranscript([q, delivered(q, "Reaction.\n\nWhat is the setting?"), declined(q)]);
    expect(turnsAtStation(entries, "context")).toHaveLength(2);
  });

  test("another station's turns do not appear here", () => {
    const a = ask("station:context", "Setting?", "context");
    const b = ask("station:sample", "Who?", "sample");
    const entries = buildTranscript([
      a,
      delivered(a, "R.\n\nSetting?"),
      answered(a, "A ward."),
      b,
      delivered(b, "R.\n\nWho?"),
    ]);
    expect(turnsAtStation(entries, "context")).toHaveLength(2);
    expect(turnsAtStation(entries, "sample")).toHaveLength(1);
  });

  test("Anti: turns predating the field belong to no station and are not guessed at", () => {
    const q = ask("puzzle:root", "What is going on?");
    const entries = buildTranscript([q, delivered(q, "R.\n\nWhat is going on?")]);
    expect(entries[0]?.station).toBeUndefined();
    expect(turnsAtStation(entries, "context")).toEqual([]);
  });

  test("a question outstanding elsewhere follows you here (ISC-369)", () => {
    // Caught in the browser, not by a test. Scoping alone put an answer box
    // under an empty conversation at every station except the one the question
    // was asked at, which is the M25 defect again: typing at a question you
    // cannot see. The answer box is available everywhere on purpose, so the
    // question it belongs to has to be too.
    const asked = ask("station:outcome", "What varies?", "outcome");
    const events = [asked, delivered(asked, "R.\n\nWhat varies?")];
    const entries = buildTranscript(events);
    expect(turnsAtStation(entries, "sample")).toEqual([]);
    const carried = turnsAtStation(entries, "sample", exchangeIds(events, asked.id));
    expect(carried).toHaveLength(1);
    expect(carried[0]?.question).toBe("What varies?");
  });

  test("Anti: carrying one exchange does not drag the rest of the study in", () => {
    const other = ask("station:context", "Setting?", "context");
    const asked = ask("station:outcome", "What varies?", "outcome");
    const events = [
      other,
      delivered(other, "R.\n\nSetting?"),
      answered(other, "A ward."),
      asked,
      delivered(asked, "R.\n\nWhat varies?"),
    ];
    const carried = turnsAtStation(buildTranscript(events), "sample", exchangeIds(events, asked.id));
    expect(carried).toHaveLength(1);
  });

  test("Anti: the whole conversation is still available unfiltered", () => {
    // The Ontology view renders the dialogue with no station, which is what
    // makes scoping the Design view safe: nothing is hidden, it is filed.
    const a = ask("station:context", "Setting?", "context");
    const b = ask("station:sample", "Who?", "sample");
    const events = [a, delivered(a, "R.\n\nSetting?"), b, delivered(b, "R.\n\nWho?")];
    expect(buildTranscript(events)).toHaveLength(2);
  });
});

test("Anti: the interviewer is sent the whole conversation, not one station's (ISC-375)", async () => {
  // Scoping the view is housekeeping. Scoping what the model is told would
  // make the interviewer forget the study every time the researcher moved
  // along the rail, and it would do it silently — every test here would still
  // pass, and the only symptom would be an interviewer that keeps
  // reintroducing itself. Substring checks rather than a regex: this file has
  // been bitten by a pattern that could not span an arrow function.
  const src = await Bun.file(new URL("../src/workbench/Dialogue.tsx", import.meta.url)).text();
  /* M89: the offered-move path (`ask`, with `promptTranscript`) left Dialogue
   * with the checks' invitation. The one prompt that remains is built from the
   * whole conversation read from the store: this step's turns as `here`, every
   * other step's as `earlier`. */
  expect(src).toContain("const fresh = buildTranscript(events);");
  expect(src).toContain("here: transcriptDigest(turnsAtStation(fresh, station), 12)");
  expect(src).toContain("fresh.filter((e) => e.station !== station)");
  expect(src).not.toContain("transcriptDigest(transcript.slice(0, -1))");
});

/**
 * The size channel, on the screen and in the file.
 *
 * These two tests used to read the source of OntologyGraph.tsx and graphLayout
 * for the literal `<dt>Larger disc</dt>`, the literal condition
 * `roots > 0 && roots < pages.length && liveEdges(graph).length > 0` and the
 * literal `const sizeChannelLive = edges.length > 0;`. They are restated here
 * against the property those literals stood in for, and not weakened: what they
 * protected was that the key names the fifth channel and names it only while
 * the drawing is making the distinction. Reading the source for one surface's
 * spelling could never see the defect that actually shipped, which was the
 * exported figure drawing the channel and saying nothing about it at all: on the
 * 44-page probe, 7 discs at r=10.5 against 37 at r=7.2, and zero occurrences of
 * "Larger disc", "hangs off" or "Size is relative" in the file. So the property
 * is now checked by rendering the key and by building the figure, both surfaces,
 * both directions, on graphs that do and do not spend the channel.
 */
// M63, the lead's rulings of 2026-09-30: the old model tab's GraphKey, OntologyView, keyOf left with it; superseded: describe("every channel the graph spends has a line in its own key", () => {
