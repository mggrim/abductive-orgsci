/**
 * Who said it, and where (D17, D23, D24b, M43b).
 *
 * The walk of 2026-09-13 read three faults off one line of the transcript.
 *
 *   D17  Every turn the tool took carried a label ("Abductive, asking about the
 *        Sample step") and every decline carried one ("declined · the Sample
 *        step"). The researcher's own typed turns carried none, so the only
 *        unattributed speech in the record was the human's, on a tool whose
 *        claim is that you can always see who said what.
 *   D23  Every turn at the seventh step was headed "Abductive, asking about the
 *        The bind step", because the template pasted an article in front of a
 *        label that already had one.
 *   D24b After a question picked out of the offered set the label stopped naming
 *        the step, where every other turn on the page names it.
 *
 * The labels are built in `interview/topicLabel.ts` and read by
 * `buildTranscript`, so the unit claims are made against the builder and the
 * rendered claims against the projection over a ledger.
 */

import { describe, expect, test } from "bun:test";
import type {
  LedgerEvent,
  QuestionSelectionEvent,
  ResponseEvent,
} from "../src/ledger/events.ts";
import {
  researcherTurnLabel,
  stepPhrase,
  toolReplyLabel,
  toolStreamingLabel,
  toolTurnLabel,
} from "../src/interview/topicLabel.ts";
import { buildTranscript } from "../src/workbench/Dialogue.tsx";
import { STATIONS } from "../src/flow/stations.ts";

const PROJECT = "22222222-3333-4444-8555-666666666666";

let clock = 1_800_000_000_000;
const next = () => (clock += 1000);

function asked(overrides: Partial<QuestionSelectionEvent> = {}): QuestionSelectionEvent {
  return {
    id: crypto.randomUUID(),
    ts: next(),
    actor: "system",
    projectId: PROJECT,
    type: "question-selection",
    moveId: "conversation:bind@1",
    topic: "station:bind",
    question: "What are the people you're studying caught between?",
    alternatives: [],
    mode: "interrogation",
    station: "bind",
    reason: "the step has no answer yet",
    ...overrides,
  };
}

function delivered(question: QuestionSelectionEvent): ResponseEvent {
  return {
    id: crypto.randomUUID(),
    ts: next(),
    actor: "persona:interviewer",
    projectId: PROJECT,
    model: "mock",
    modelVersion: "mock-1",
    type: "response",
    text: "Olivia comes closest to naming the pull she cannot resolve.",
    inReplyTo: question.id,
  };
}

function replied(question: QuestionSelectionEvent): ResponseEvent {
  return {
    id: crypto.randomUUID(),
    ts: next(),
    actor: "human",
    projectId: PROJECT,
    type: "response",
    text: "None of the three. The bind that should anchor the paper is Hannah Foster's.",
    inReplyTo: question.id,
  };
}

// ---------------------------------------------------------------------------
// D23: one article, not two
// ---------------------------------------------------------------------------

describe("a step named inside a sentence carries one article (D23)", () => {
  test("the bind's label loses its own article and keeps the template's", () => {
    expect(stepPhrase("The bind")).toBe("the bind step");
    expect(stepPhrase("Early data")).toBe("the Early data step");
    expect(stepPhrase("Context")).toBe("the Context step");
  });

  test("no station produces a doubled article, whatever its label says", () => {
    for (const station of STATIONS) {
      const phrase = stepPhrase(station.label);
      expect(phrase).not.toMatch(/^the (?:the|a|an) /i);
      expect(phrase.startsWith("the ")).toBe(true);
      expect(phrase.endsWith(" step")).toBe(true);
    }
  });

  test("the walk's own string, on the turn it was read from", () => {
    const q = asked();
    const entries = buildTranscript([q, delivered(q)]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.label).toBe("Abductive, asking about the Bind step");
    expect(entries[0]?.label).not.toContain("the The bind");
  });

  test("a decline at the bind names the step the same way", () => {
    const q = asked();
    const refusal: LedgerEvent = {
      id: crypto.randomUUID(),
      ts: next(),
      actor: "human",
      projectId: PROJECT,
      type: "refusal",
      questionEventId: q.id,
      kind: "not-now",
    } as LedgerEvent;
    const entries = buildTranscript([q, delivered(q), refusal]);
    expect(entries[1]?.label).toBe("declined · the Bind step");
  });
});

// ---------------------------------------------------------------------------
// D24b: a picked question still says where it was asked
// ---------------------------------------------------------------------------

describe("a picked question's turn carries its step (D24b)", () => {
  test("the topic says what it is about and the label also says where", () => {
    expect(
      toolTurnLabel({ mode: "interrogation", topic: "theory:expectation", station: "bind" }),
    ).toBe("Abductive, asking about whose expectation is at stake, at the Bind step");
  });

  test("a station's own question does not name the step twice", () => {
    expect(toolTurnLabel({ mode: "interrogation", topic: "station:sample", station: "sample" })).toBe(
      "Abductive, asking about the Sample step",
    );
  });

  test("a turn at the framing names the framing rather than a step", () => {
    expect(toolTurnLabel({ mode: "guidance", topic: "puzzle:root", station: "framing" })).toBe(
      // M74b, ISC-665: guidance reads as asking differently.
      "Abductive, asking differently about the thing that you can't account for, at your starting point",
    );
    expect(toolTurnLabel({ mode: "interrogation", topic: "framing", station: "framing" })).toBe(
      "Abductive, asking about your starting point",
    );
  });

  test("a turn from a study that files no place is labelled without one", () => {
    expect(toolTurnLabel({ mode: "interrogation", topic: "puzzle:root" })).toBe(
      "Abductive, asking about the thing that you can't account for",
    );
  });

  test("rendered, the picked question's turn names the step", () => {
    const picked = asked({
      topic: "theory:expectation",
      moveId: "m-theory",
      question: "Who currently holds an expectation about this setting?",
    });
    const entries = buildTranscript([picked, delivered(picked)]);
    expect(entries[0]?.label).toBe(
      "Abductive, asking about whose expectation is at stake, at the Bind step",
    );
  });

  test("a reply that asked nothing says the tool replied, and where", () => {
    expect(toolReplyLabel("sample")).toBe("Abductive, replying about the Sample step");
    expect(toolReplyLabel()).toBe("Abductive, replying");
    /* The fallback was the bare word "asking" on a turn that asked nothing. */
    expect(toolReplyLabel("bind")).not.toBe("asking");
  });

  /**
   * The card the walk actually read (D24b).
   *
   * "Abductive, asking…" with a trailing ellipsis exists in exactly one place in
   * the source, and it is the turn still streaming. It is the one label that
   * cannot name a topic, because the topic is parsed out of a reply that has not
   * finished; it can name the place, and it did not.
   */
  test("the turn still arriving names the place it is arriving at", () => {
    expect(toolStreamingLabel("bind")).toBe("Abductive, asking about the Bind step…");
    expect(toolStreamingLabel("sample")).toBe("Abductive, asking about the Sample step…");
    expect(toolStreamingLabel("framing")).toBe("Abductive, asking about your starting point…");
    expect(toolStreamingLabel()).toBe("Abductive, asking…");
  });

  test("rendered, a tool turn with no question of its own is not labelled 'asking'", () => {
    const free: ResponseEvent = {
      id: crypto.randomUUID(),
      ts: next(),
      actor: "persona:interviewer",
      projectId: PROJECT,
      model: "mock",
      modelVersion: "mock-1",
      type: "response",
      text: "Chloe writes one version to the mentors and another to everyone else.",
      station: "bind",
    };
    const entries = buildTranscript([free]);
    expect(entries[0]?.label).toBe("Abductive, replying about the Bind step");
  });
});

// ---------------------------------------------------------------------------
// D17: the researcher is named too
// ---------------------------------------------------------------------------

describe("the researcher's own turns are attributed (D17)", () => {
  test("the label names them and the step", () => {
    expect(researcherTurnLabel("sample")).toBe("You, at the Sample step");
    expect(researcherTurnLabel("bind")).toBe("You, at the Bind step");
    expect(researcherTurnLabel("framing")).toBe("You, at your starting point");
  });

  test("a turn with no place is still attributed, without inventing one", () => {
    expect(researcherTurnLabel()).toBe("You");
    expect(researcherTurnLabel("not-a-place")).toBe("You");
  });

  test("a retired station id resolves rather than losing its label", () => {
    /* `challenge` and `tension` were folded into `bind` at M27, and a study saved
     * before then carries turns filed under both. */
    expect(researcherTurnLabel("tension")).toBe("You, at the Bind step");
    expect(researcherTurnLabel("challenge")).toBe("You, at the Bind step");
  });

  test("rendered, the answer to a question inherits the question's step", () => {
    const q = asked();
    const entries = buildTranscript([q, delivered(q), replied(q)]);
    expect(entries[1]?.kind).toBe("human");
    expect(entries[1]?.label).toBe("You, at the Bind step");
  });

  test("rendered, a message sent with nothing outstanding carries its own place", () => {
    const free: ResponseEvent = {
      id: crypto.randomUUID(),
      ts: next(),
      actor: "human",
      projectId: PROJECT,
      type: "response",
      text: "I want to talk about the sample instead.",
      station: "sample",
    };
    const entries = buildTranscript([free]);
    expect(entries[0]?.label).toBe("You, at the Sample step");
  });

  /**
   * The claim the walk's finding reduces to (D17).
   *
   * Not "the human turn has a label" but "no turn in the record is
   * unattributed", which is the property the transcript is supposed to hold and
   * the one a future kind of turn could quietly break.
   */
  test("every rendered turn carries a label, over a whole exchange", () => {
    const q1 = asked();
    const q2 = asked({
      topic: "theory:expectation",
      moveId: "m-theory",
      question: "Who holds an expectation about this setting?",
    });
    const refusal: LedgerEvent = {
      id: crypto.randomUUID(),
      ts: next(),
      actor: "human",
      projectId: PROJECT,
      type: "refusal",
      questionEventId: q2.id,
      kind: "dont-know",
    } as LedgerEvent;
    const redirection: LedgerEvent = {
      id: crypto.randomUUID(),
      ts: next(),
      actor: "human",
      projectId: PROJECT,
      type: "redirection",
      toTopic: "station:sample",
    } as LedgerEvent;
    const entries = buildTranscript([q1, delivered(q1), replied(q1), q2, delivered(q2), refusal, redirection]);
    expect(entries.length).toBeGreaterThan(4);
    for (const entry of entries) {
      expect(entry.label).toBeDefined();
      expect((entry.label ?? "").trim()).not.toBe("");
    }
  });
});
