/**
 * One projection per place (M38).
 *
 * The rail's line, the header's open-question pointer and Your model's
 * grouping all read `placeSummaries`; these tests pin what it says so no
 * surface has a reason to compute it again.
 */

import { describe, expect, test } from "bun:test";
import type {
  BoundEvent,
  BriefDraftEvent,
  LedgerEvent,
  QuestionSelectionEvent,
  ResponseEvent,
} from "../src/ledger/events.ts";
import { envelope } from "./helpers.ts";
import { normalizeBrief } from "../src/state/projects.ts";
import {
  FRAMING_PLACE_ID,
  openQuestionAt,
  placeOfTurnId,
  placeSummaries,
  placeTitle,
} from "../src/views/placeSummary.ts";

const PROJECT = "proj-test";

function ask(station: string, question = "What is going on here?"): QuestionSelectionEvent {
  return {
    ...envelope("system"),
    type: "question-selection",
    moveId: `conversation:${station}@1`,
    topic: `station:${station}`,
    question,
    alternatives: [],
    mode: "interrogation",
    reason: "Asked as a follow-up in the conversation here.",
    station,
  };
}

function delivered(q: QuestionSelectionEvent): ResponseEvent {
  return {
    ...envelope("persona:interviewer"),
    type: "response",
    text: `Tell me. ${q.question}`,
    inReplyTo: q.id,
  };
}

function answered(q: QuestionSelectionEvent, text: string): ResponseEvent {
  return { ...envelope("human"), type: "response", text, inReplyTo: q.id };
}

function free(station: string, text: string): ResponseEvent {
  return { ...envelope("human"), type: "response", text, station };
}

function draft(station: string, fromTurnIds: readonly string[]): BriefDraftEvent {
  return {
    ...envelope("persona:interviewer"),
    type: "brief-draft",
    station,
    text: "the drafted answer",
    fromTurnIds,
  };
}

function saved(subject: string): BoundEvent {
  return { ...envelope("human"), type: "bound", subject, statement: "what they wrote" };
}

const brief = normalizeBrief({});

describe("placeTitle keeps the researcher's words", () => {
  test("first sentence, cut at a word, nothing added", () => {
    expect(placeTitle("I've been going to the repair café. People bring toasters.")).toBe(
      "I've been going to the repair café.",
    );
    const long = "a ".repeat(30) + "word " + "b".repeat(80);
    const title = placeTitle(long) ?? "";
    expect(title.length).toBeLessThanOrEqual(72);
    expect(title.endsWith("…")).toBe(false);
    expect(placeTitle("   ")).toBeNull();
  });
});

describe("placeSummaries", () => {
  test("nine places, Starting point first, then the eight steps in rail order (M58)", () => {
    const rows = placeSummaries({ events: [], projectId: PROJECT, brief });
    expect(rows.map((r) => r.place)).toEqual([
      FRAMING_PLACE_ID,
      "context",
      "process",
      "outcome",
      "site",
      "puzzle",
      "bind",
      "sample",
      "early-data",
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({ title: null, turns: 0, answer: "empty", draftWaiting: false, openQuestion: false, waiting: 0, lastTs: null });
    }
  });

  test("a conversation at a step gives it a title, a count and the open question", () => {
    const q = ask("context");
    const events: LedgerEvent[] = [q, delivered(q)];
    const rows = placeSummaries({ events, projectId: PROJECT, brief });
    const context = rows.find((r) => r.place === "context");
    expect(context).toMatchObject({ title: null, turns: 1, openQuestion: true });
    expect(rows.filter((r) => r.openQuestion)).toHaveLength(1);

    const a = answered(q, "It's a monthly repair café in a church hall. About a dozen fixers.");
    const after = placeSummaries({ events: [...events, a], projectId: PROJECT, brief });
    expect(after.find((r) => r.place === "context")).toMatchObject({
      title: "It's a monthly repair café in a church hall.",
      turns: 2,
      openQuestion: false,
      lastTs: a.ts,
    });
    expect(openQuestionAt([...events, a], PROJECT)).toBeNull();
    expect(openQuestionAt(events, PROJECT)).toMatchObject({ place: "context", question: q.question });
  });

  test("a free turn at the framing belongs to the framing", () => {
    const f = free("framing", "The talking in the queue is what I keep noticing.");
    const rows = placeSummaries({ events: [f], projectId: PROJECT, brief });
    expect(rows[0]).toMatchObject({
      place: FRAMING_PLACE_ID,
      title: "The talking in the queue is what I keep noticing.",
      turns: 1,
    });
    expect(rows.slice(1).every((r) => r.turns === 0)).toBe(true);
  });

  test("a draft waits until a save takes it up, per place", () => {
    const f = free("site", "The church hall, because it is the only one in the town.");
    const d = draft("site", [f.id]);
    const waiting = placeSummaries({ events: [f, d], projectId: PROJECT, brief });
    expect(waiting.find((r) => r.place === "site")?.draftWaiting).toBe(true);
    expect(waiting.find((r) => r.place === "context")?.draftWaiting).toBe(false);

    const taken = placeSummaries({ events: [f, d, saved("site")], projectId: PROJECT, brief });
    expect(taken.find((r) => r.place === "site")?.draftWaiting).toBe(false);

    const framingDraft = draft("framing", [f.id]);
    const fr = placeSummaries({ events: [framingDraft], projectId: PROJECT, brief });
    expect(fr[0]?.draftWaiting).toBe(true);
    const frSaved = placeSummaries({ events: [framingDraft, saved("starting-interest")], projectId: PROJECT, brief });
    expect(frSaved[0]?.draftWaiting).toBe(false);
  });

  test("the answer state reads the brief, the declination and the corpus", () => {
    const withContext = normalizeBrief({ context: "A repair café in Ely." });
    // `dataCorpusSize` since M43, D12: the corpus that stands in for an answer at
    // Early data counts the researcher's own data and not the papers beside it.
    const rows = placeSummaries({ events: [], projectId: PROJECT, brief: withContext, dataCorpusSize: 3 });
    expect(rows.find((r) => r.place === "context")?.answer).toBe("saved");
    expect(rows.find((r) => r.place === "early-data")?.answer).toBe("saved");
    expect(rows.find((r) => r.place === "site")?.answer).toBe("empty");
    const framed = placeSummaries({ events: [], projectId: PROJECT, brief: normalizeBrief({ startingInterest: "repair cafés" }) });
    expect(framed[0]?.answer).toBe("saved");
  });

  test("another study's events are not counted", () => {
    const q = { ...ask("context"), projectId: "other" };
    const rows = placeSummaries({ events: [q], projectId: PROJECT, brief });
    expect(rows.every((r) => r.turns === 0 && !r.openQuestion)).toBe(true);
  });
});

/**
 * The place of one turn (M39, ISC-502).
 *
 * The map's whole reason for reading this module: pressing a claim has to offer
 * the conversation the claim came from, and a claim knows a turn id and nothing
 * about places. It runs the derivation `placeSummaries` already runs rather than
 * a second one, which is ISC-501 applied to the one fact M39 adds.
 */
describe("placeOfTurnId", () => {
  test("a turn resolves to the place its question was asked at", () => {
    const q = ask("context");
    const a = answered(q, "A night ward where the handover keeps slipping.");
    expect(placeOfTurnId([q, a], PROJECT, a.id)).toBe("context");
  });

  test("a turn that replies to nothing resolves to the place it carries", () => {
    // M37's case: a message sent with no question outstanding has nowhere to
    // inherit from, so it carries its own place and this has to read it.
    const f = free(FRAMING_PLACE_ID, "I keep coming back to the handover.");
    expect(placeOfTurnId([f], PROJECT, f.id)).toBe(FRAMING_PLACE_ID);
  });

  test("an unknown id is null, not a default station", () => {
    /* Three states a caller has to be able to tell apart — an id that is not a
     * turn, a turn with no station, and a claim with no turn at all — and every
     * one of them means "there is no conversation to go to". A default would
     * send a reader to the first step to look for an answer that is not there. */
    const q = ask("context");
    const a = answered(q, "said something");
    expect(placeOfTurnId([q, a], PROJECT, "not-a-turn")).toBeNull();
  });

  test("a turn with no station anywhere to inherit from is null", () => {
    // Turns from studies that predate M26 have no place at all.
    const orphan: ResponseEvent = { ...envelope("human"), type: "response", text: "an old turn" };
    expect(placeOfTurnId([orphan], PROJECT, orphan.id)).toBeNull();
  });

  test("another study's turn does not resolve", () => {
    // Scoped before the transcript is built, so a turn id from a second study in
    // the same ledger is null rather than whatever place that study put it at.
    const q = ask("context");
    const a = { ...answered(q, "said something"), projectId: "other" };
    expect(placeOfTurnId([{ ...q, projectId: "other" }, a], PROJECT, a.id)).toBeNull();
  });

  test("it agrees with placeSummaries about where a turn was said", () => {
    // The point of the export. Two answers to one question is the defect this
    // module exists to prevent, so the two are checked against each other.
    const q = ask("bind");
    const a = answered(q, "The ward absorbs it.");
    const rows = placeSummaries({ events: [q, a], projectId: PROJECT, brief });
    expect(rows.find((r) => r.place === "bind")?.turns).toBe(1);
    expect(placeOfTurnId([q, a], PROJECT, a.id)).toBe("bind");
  });
});
