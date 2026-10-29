/**
 * A question the tool closed is not a question the researcher declined (D9, M43).
 *
 * The walk of 2026-09-13 pressed "Suggest topics" at the Site step with
 * a question open. The transcript wrote:
 *
 *     declined · the Site step    Not now.
 *
 * and the model's next sentence was "Fair enough, that's yours to decline",
 * after which it offered the directions that had been asked for. The researcher
 * declined nothing and typed nothing. On a tool whose thesis is provenance, that
 * is a decision recorded in their name.
 *
 * Four things this file holds, which are the four halves of the fix:
 *
 *   a. The event can say the tool wrote it, and the ledger checks the word.
 *   b. The transcript renders it as the tool's own act, naming the step.
 *   c. The prompt shows the model the same fact, so it stops answering a
 *      refusal that never happened.
 *   d. Records written before the field existed read the same way, because the
 *      study walked on 2026-09-13 is the one the demo ships.
 */

import { describe, expect, test } from "bun:test";
import {
  SET_ASIDE_REASONS,
  validateEvent,
  type LedgerEvent,
  type QuestionSelectionEvent,
  type RefusalEvent,
} from "../src/ledger/events.ts";
import { recordRefusal, resetInterviewInFlight } from "../src/interview/orchestrator.ts";
import { buildTranscript } from "../src/workbench/Dialogue.tsx";
import { transcriptDigest } from "../src/interview/designDigest.ts";
import { setAsideLine, setAsideReasons } from "../src/views/setAside.ts";

const PROJECT = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-8888-4777-8666-555555555555";

let clock = 1_800_000_000_000;
const next = () => (clock += 1000);

function asked(
  overrides: Partial<QuestionSelectionEvent> = {},
): QuestionSelectionEvent {
  return {
    id: crypto.randomUUID(),
    ts: next(),
    actor: "system",
    projectId: PROJECT,
    type: "question-selection",
    moveId: "conversation:site@2",
    topic: "station:site",
    question: "Is there something within your existing access that would tell the two apart?",
    alternatives: [],
    mode: "interrogation",
    station: "site",
    reason: "You have named the gap and not yet what would close it.",
    ...overrides,
  };
}

function refused(question: QuestionSelectionEvent, overrides: Partial<RefusalEvent> = {}): RefusalEvent {
  return {
    id: crypto.randomUUID(),
    ts: next(),
    actor: "human",
    projectId: PROJECT,
    type: "refusal",
    questionEventId: question.id,
    kind: "not-now",
    ...overrides,
  };
}

/** In-memory ledger with a real read-through, so the choke point is exercised. */
function makeLedger(initial: readonly LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      for (const e of events) expect(validateEvent(e)).toEqual([]);
      store.push(...events);
    },
    readEvents: async () => [...store],
    now: next,
    newId: () => crypto.randomUUID(),
  };
}

// ── a. The record can say who closed the question ──────────────────────────

describe("the event carries the tool's own reason (D9a)", () => {
  test("the guidance path writes it and the decline controls do not", async () => {
    resetInterviewInFlight();
    const question = asked();
    const forDirections = makeLedger([question]);
    await recordRefusal(
      { projectId: PROJECT, kind: "not-now", setAsideFor: "directions" },
      forDirections,
    );
    const written = forDirections.store.at(-1);
    expect(written?.type).toBe("refusal");
    expect(written?.type === "refusal" ? written.setAsideFor : "missing").toBe("directions");

    resetInterviewInFlight();
    const pressed = makeLedger([asked()]);
    await recordRefusal({ projectId: PROJECT, kind: "not-now" }, pressed);
    const decline = pressed.store.at(-1);
    expect(decline?.type === "refusal" ? decline.setAsideFor : "absent").toBeUndefined();
  });

  test("the ledger takes the two reasons and refuses anything else", () => {
    const question = asked();
    expect(SET_ASIDE_REASONS).toEqual(["directions", "another-question"]);
    for (const reason of SET_ASIDE_REASONS) {
      expect(validateEvent(refused(question, { setAsideFor: reason }))).toEqual([]);
    }
    const wrong = validateEvent({
      ...refused(question),
      setAsideFor: "because-i-said-so",
    });
    expect(wrong.some((e) => e.includes("setAsideFor"))).toBe(true);
  });

  test("a reason on a decline the tool never writes is refused", () => {
    // The tool sets a question aside as "not now" and never as a thing the
    // researcher does not know, so the pair would be two accounts of one turn.
    const errors = validateEvent(
      refused(asked(), { kind: "dont-know", setAsideFor: "directions" }),
    );
    expect(errors.some((e) => e.includes("only written on a 'not-now' refusal"))).toBe(true);
  });
});

// ── b. What the transcript says ────────────────────────────────────────────

describe("the transcript reads it as the tool's act (D9b)", () => {
  test("the card names the step and says the researcher asked for directions", () => {
    const question = asked();
    const events = [question, refused(question, { setAsideFor: "directions" })];
    const card = buildTranscript(events).find((e) => e.kind === "refusal");
    expect(card?.label).toBe("set aside");
    expect(card?.text).toBe(
      "You asked for directions at the Site step, so Abductive set its own question aside.",
    );
    // Not the researcher's words and not a decline.
    expect(card?.text).not.toContain("Not now");
    expect(card?.label).not.toContain("declined");
    // And it stays at the step the question was asked at.
    expect(card?.station).toBe("site");
  });

  test("picking another question says that instead", () => {
    const question = asked();
    const events = [question, refused(question, { setAsideFor: "another-question" })];
    const card = buildTranscript(events).find((e) => e.kind === "refusal");
    expect(card?.text).toBe(
      "You picked another question at the Site step, so Abductive set its own question aside.",
    );
  });

  test("a decline the researcher pressed still reads as theirs", () => {
    const question = asked();
    const events = [question, refused(question)];
    const card = buildTranscript(events).find((e) => e.kind === "refusal");
    expect(card?.label).toBe("declined · the Site step");
    expect(card?.text).toBe("Not now.");
    expect(card?.setAsideFor).toBeUndefined();
  });

  test("the sentence works at the framing, which is the place with no step", () => {
    expect(setAsideLine("directions", "your starting point")).toBe(
      "You asked for directions at your starting point, so Abductive set its own question aside.",
    );
  });
});

// ── c. What the model is shown ─────────────────────────────────────────────

describe("the prompt shows the model whose act it was (D9c)", () => {
  test("a set-aside reaches the model as the tool's, and says nothing was declined", () => {
    const question = asked();
    const entries = buildTranscript([question, refused(question, { setAsideFor: "directions" })]);
    const lines = transcriptDigest(entries, 12);
    const line = lines.find((l) => l.includes("set your own question aside"));
    expect(line).toBe(
      "You set your own question aside because they asked for directions. They did not decline it.",
    );
    // The line the model read before this fix, and answered as a refusal.
    expect(lines.some((l) => l.startsWith("You said: Not now"))).toBe(false);
  });

  test("a decline the researcher pressed reaches the model as theirs", () => {
    const question = asked();
    const entries = buildTranscript([question, refused(question)]);
    const lines = transcriptDigest(entries, 12);
    expect(lines).toContain("They declined, saying: Not now.");
    // It was "You said: Not now.", which showed the tool its own transcript
    // saying the thing the researcher had said.
    expect(lines.some((l) => l.startsWith("You said:"))).toBe(false);
  });
});

// ── d. Records written before the field existed ────────────────────────────

describe("a study walked before M43 reads the same way (D9d)", () => {
  /** The pair `guide()` wrote: a not-now, then a guidance turn at the same place. */
  function legacyPair(): readonly LedgerEvent[] {
    const question = asked();
    const refusal = refused(question);
    const guidance = asked({
      moveId: "conversation:site@3",
      mode: "guidance",
      question: "What is the one sentence you would write into the site section?",
      reason: "You asked for directions, so this is where I would go next.",
    });
    return [question, refusal, guidance];
  }

  test("the pair reads as the tool asking for the floor", () => {
    const events = legacyPair();
    const refusal = events[1] as RefusalEvent;
    expect(refusal.setAsideFor).toBeUndefined();
    expect(setAsideReasons(events).get(refusal.id)).toBe("directions");
    const card = buildTranscript(events).find((e) => e.kind === "refusal");
    expect(card?.label).toBe("set aside");
    expect(card?.text).toContain("You asked for directions at the Site step");
  });

  test("Anti: anything between the two leaves the decline the researcher's", () => {
    const [question, refusal, guidance] = legacyPair() as [
      QuestionSelectionEvent,
      RefusalEvent,
      QuestionSelectionEvent,
    ];
    const between: LedgerEvent = {
      id: crypto.randomUUID(),
      ts: next(),
      actor: "human",
      projectId: PROJECT,
      type: "response",
      text: "Actually, let me come back to that one.",
      station: "site",
    };
    expect(setAsideReasons([question, refusal, between, guidance]).has(refusal.id)).toBe(false);
  });

  test("Anti: a guidance turn at another place is another conversation", () => {
    const [question, refusal] = legacyPair() as [QuestionSelectionEvent, RefusalEvent];
    const elsewhere = asked({ mode: "guidance", station: "process", topic: "station:process" });
    expect(setAsideReasons([question, refusal, elsewhere]).has(refusal.id)).toBe(false);
  });

  test("Anti: the next question being an ordinary one is an ordinary decline", () => {
    const [question, refusal] = legacyPair() as [QuestionSelectionEvent, RefusalEvent];
    const following = asked({ moveId: "conversation:site@3" });
    expect(setAsideReasons([question, refusal, following]).has(refusal.id)).toBe(false);
    const card = buildTranscript([question, refusal, following]).find((e) => e.kind === "refusal");
    expect(card?.label).toBe("declined · the Site step");
  });

  test("Anti: adjacency is within one study, not across the store", () => {
    // Two studies' events interleave in the store, so a guidance turn in another
    // study must not read as this study's set-aside.
    const [question, refusal] = legacyPair() as [QuestionSelectionEvent, RefusalEvent];
    const otherStudy = asked({ projectId: OTHER, mode: "guidance" });
    const following = asked({ moveId: "conversation:site@3" });
    expect(setAsideReasons([question, refusal, otherStudy, following]).has(refusal.id)).toBe(false);
  });

  test("Anti: an explicit reason on the event outranks the shape of what follows", () => {
    const question = asked();
    const refusal = refused(question, { setAsideFor: "another-question" });
    const guidance = asked({ mode: "guidance" });
    expect(setAsideReasons([question, refusal, guidance]).get(refusal.id)).toBe("another-question");
  });

  test("Anti: an 'I don't know' before a guidance turn is still an 'I don't know'", () => {
    const question = asked();
    const refusal = refused(question, { kind: "dont-know" });
    const guidance = asked({ mode: "guidance" });
    expect(setAsideReasons([question, refusal, guidance]).has(refusal.id)).toBe(false);
    const card = buildTranscript([question, refusal, guidance]).find((e) => e.kind === "refusal");
    expect(card?.text).toBe("I don't know.");
  });
});
