/**
 * M74b, ISC-665: the chips (the walk's finding 11).
 *
 * Abductive recorded both "I don't know" and "Ask me differently" as type
 * "refusal", listed them in History as "a question that you declined", turned
 * "Ask me differently" into "You asked for directions at the Process step, so
 * Abductive set its own question aside." and labelled the next turn "Abductive,
 * offering about the Process step".
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { projectInterview } from "../src/interview/state.ts";
import {
  recordAskDifferently,
  recordDontKnow,
  resetInterviewInFlight,
} from "../src/interview/orchestrator.ts";
import { buildTranscript, turnSide } from "../src/workbench/Dialogue.tsx";
import { framingCoverage } from "../src/interview/conversation.ts";
import { confidentAnswerStreak, refusalStreak } from "../src/matrix/signals.ts";

const P = "proj-chips";
let n = 0;
const id = () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`;

function ledgerOf(events: LedgerEvent[]) {
  return {
    store: events,
    readEvents: async () => events,
    appendAll: async (more: readonly LedgerEvent[]) => {
      for (const e of more) {
        expect(validateEvent(e)).toEqual([]);
        events.push(e);
      }
    },
    now: () => 1000 + (n += 1),
    newId: id,
  };
}

function asked(station: string, question = "What happened next?", mode: "interrogation" | "guidance" = "interrogation"): LedgerEvent {
  return {
    id: id(),
    ts: 1000 + n,
    actor: "system",
    projectId: P,
    type: "question-selection",
    moveId: `conversation:${station}@${n}`,
    topic: station === "framing" ? "framing" : `station:${station}`,
    question,
    alternatives: [],
    mode,
    station,
    reason: "Asked as a follow-up in the conversation here.",
  } as LedgerEvent;
}

describe("the chips write events of their own", () => {
  test("I don't know writes dont-know, closes the question, and counts as a decline", async () => {
    resetInterviewInFlight();
    const q = asked("process");
    const events: LedgerEvent[] = [q];
    await recordDontKnow({ projectId: P }, ledgerOf(events));
    const written = events[events.length - 1]!;
    expect(written.type).toBe("dont-know");
    expect(written.type === "dont-know" && written.questionEventId).toBe(q.id);
    const state = projectInterview(events, P);
    expect(state.outstanding).toBeNull();
    expect(state.refusalsByTopic.get("station:process")).toBe(1);
  });

  test("Ask me differently writes ask-differently at its step, and closes the open question without declining it", async () => {
    resetInterviewInFlight();
    const q = asked("process");
    const events: LedgerEvent[] = [q];
    await recordAskDifferently({ projectId: P, station: "process" }, ledgerOf(events));
    const written = events[events.length - 1]!;
    expect(written.type).toBe("ask-differently");
    expect(written.type === "ask-differently" && written.questionEventId).toBe(q.id);
    expect(written.type === "ask-differently" && written.station).toBe("process");
    const state = projectInterview(events, P);
    expect(state.outstanding).toBeNull();
    expect(state.refusalsByTopic.get("station:process") ?? 0).toBe(0);
  });

  test("with no question open, Ask me differently still records the press at its step", async () => {
    resetInterviewInFlight();
    const events: LedgerEvent[] = [];
    await recordAskDifferently({ projectId: P, station: "context" }, ledgerOf(events));
    expect(events.map((e) => e.type)).toEqual(["ask-differently"]);
  });
});

describe("the chat says what happened", () => {
  test("I don't know is the researcher's own line", () => {
    const q = asked("process");
    const events: LedgerEvent[] = [
      q,
      { id: id(), ts: 2, actor: "human", projectId: P, type: "dont-know", questionEventId: q.id } as LedgerEvent,
    ];
    const entry = buildTranscript(events).find((e) => e.id === events[1]!.id)!;
    expect(entry.text).toBe("I don't know.");
    expect(turnSide(entry)).toBe("you");
    expect(entry.station).toBe("process");
  });

  test("Ask me differently reads as a different question asked for, and the next turn is asking differently", () => {
    const q = asked("process");
    const press: LedgerEvent = { id: id(), ts: 3, actor: "human", projectId: P, type: "ask-differently", questionEventId: q.id, station: "process" } as LedgerEvent;
    const guided = asked("process", "What did he do first?", "guidance");
    const reply: LedgerEvent = {
      id: id(),
      ts: 4,
      actor: "persona:interviewer",
      projectId: P,
      model: "m",
      modelVersion: "m",
      type: "response",
      text: "Let me try a narrower question. What did he do first?",
      inReplyTo: guided.id,
    } as LedgerEvent;
    const transcript = buildTranscript([q, press, guided, reply]);
    const line = transcript.find((e) => e.id === press.id)!;
    expect(line.text).toBe("You asked for a different question at the Process step.");
    expect(turnSide(line)).toBe("system");
    expect(transcript.find((e) => e.id === reply.id)?.label).toBe("Abductive, asking differently about the Process step");
  });

  test("a refusal written before M74b still reads as it did", () => {
    const q = asked("process");
    const old: LedgerEvent = { id: id(), ts: 5, actor: "human", projectId: P, type: "refusal", questionEventId: q.id, kind: "dont-know" } as LedgerEvent;
    expect(buildTranscript([q, old]).find((e) => e.id === old.id)?.text).toBe("I don't know.");
  });
});

describe("the readers that counted refusals count the chips the same way", () => {
  test("Starting point counts I don't know as covered and open, and Ask me differently as neither", () => {
    const first = asked("framing", "What is drawing you to this particular research inquiry?");
    const dk: LedgerEvent = { id: id(), ts: 6, actor: "human", projectId: P, type: "dont-know", questionEventId: first.id } as LedgerEvent;
    const covered = framingCoverage([first, dk], P, {});
    expect(covered.covered.startingInterest).toBe(true);
    expect(covered.open.has("startingInterest")).toBe(true);
    const second = asked("framing", "What is drawing you to this particular research inquiry?");
    const ad: LedgerEvent = { id: id(), ts: 7, actor: "human", projectId: P, type: "ask-differently", questionEventId: second.id, station: "framing" } as LedgerEvent;
    expect(framingCoverage([second, ad], P, {}).covered.startingInterest).toBe(false);
  });

  test("I don't know breaks a confident run and counts toward a topic's refusals", () => {
    const events: LedgerEvent[] = [];
    for (let i = 0; i < 4; i += 1) {
      const q = asked("site", `Q${i}?`);
      events.push(q, { id: id(), ts: 10 + i, actor: "human", projectId: P, type: "response", text: "It is the night ward.", inReplyTo: q.id } as LedgerEvent);
    }
    const last = asked("site", "Q5?");
    events.push(last, { id: id(), ts: 20, actor: "human", projectId: P, type: "dont-know", questionEventId: last.id } as LedgerEvent);
    expect(confidentAnswerStreak(events).fired).toBe(false);
    const three: LedgerEvent[] = [];
    for (let i = 0; i < 3; i += 1) {
      const q = asked("site", `Again ${i}?`);
      three.push(q, { id: id(), ts: 30 + i, actor: "human", projectId: P, type: "dont-know", questionEventId: q.id } as LedgerEvent);
    }
    expect(refusalStreak(three).fired).toBe(true);
  });
});
