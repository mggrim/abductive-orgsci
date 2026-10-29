/**
 * The station as a conversation (M37, ISC-482 … ISC-488, ISC-491).
 *
 * A co-author, reading the hosted example: the framing asks "What are you
 * thinking about exploring?" as one static field, and "What did you expect to
 * find here, and what did you find instead?" comes straight after it, which
 * presumes the researcher already holds an expectation, a finding and the
 * conflict between them. They asked whether each question could evolve as a chat
 * instead, with follow-ups that let a junior scholar ease into an answer they do
 * not yet have.
 *
 * What that costs is the property the interview loop was built on: until M37
 * the question text came from a deterministic move and the model only delivered
 * it, so what was asked was auditable independently of what the model felt like
 * saying. A follow-up cannot work that way. So the audit moves rather than
 * disappearing, and these are the tests of where it moved to. The question and
 * the reason for it are parsed out of the reply and written to the record. The
 * reply is scanned on the way out for language that supplies an answer. The
 * append goes through the orchestrator's choke point, so one outstanding
 * question at a time still holds. And the draft that fills a step's box is made
 * of the researcher's own turns and nothing else.
 */

import { describe, expect, test } from "bun:test";
import {
  conversationMoveId,
  FOLLOW_UP_REASON,
  humanTurnsAt,
  isConversationMove,
  isConversationPlace,
  GAP_MARKER_NOTE,
  hasGapMarker,
  isGapOnly,
  parseConversationTurn,
  placeLabel,
  topicForPlace,
} from "../src/interview/conversation.ts";
import {
  conversationPrompt,
  draftPrompt,
} from "../src/interview/conversationPrompt.ts";
import { proposedAnswerViolations } from "../src/interview/prompt.ts";
import {
  recordAnswer,
  recordConversationTurn,
  recordFreeTurn,
  resetInterviewInFlight,
} from "../src/interview/orchestrator.ts";
import { projectInterview } from "../src/interview/state.ts";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { buildTranscript, turnsAtStation } from "../src/workbench/Dialogue.tsx";
import { askingSummary } from "../src/workbench/Instrumentation.tsx";
import { MockInferenceClient } from "../src/inference/mock.ts";
import {
  CONVERSATION_MARKER,
  DRAFT_MARKER,
  PUZZLE_READING_MARKER,
} from "../src/inference/promptMarkers.ts";
import { parsePuzzleReading } from "../src/interview/puzzlePrompt.ts";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;

const PROJECT = "proj-m37";
let clock = 1_800_000_000_000;

/** In-memory ledger with a real read-through, so the choke point is exercised. */
function makeLedger(initial: LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      // Nothing the conversation writes may be something the ledger would
      // refuse on reload.
      for (const e of events) expect(validateEvent(e)).toEqual([]);
      store.push(...events);
    },
    readEvents: async () => [...store],
    now: () => (clock += 1000),
    newId: () => crypto.randomUUID(),
  };
}

function turn(overrides: Partial<Parameters<typeof recordConversationTurn>[0]> = {}) {
  return {
    projectId: PROJECT,
    place: "site",
    topic: "station:site",
    question: "What did you see that made you say it?",
    because: "You have named the thing but not yet what it looked like.",
    shown: "That is the part I want to stay with.\n\nWhat did you see that made you say it?",
    mode: "interrogation" as const,
    model: "mock",
    modelVersion: "mock-2026-01",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe("one turn of the conversation, read apart (ISC-483)", () => {
  test("the marked lines are parsed and never reach the screen", () => {
    const parsed = parseConversationTurn(
      [
        "That drift is the part I want to stay with.",
        "",
        "Who else was on the ward that night?",
        "",
        "QUESTION: Who else was on the ward that night?",
        "BECAUSE: You have said what happened and not yet who saw it.",
      ].join("\n"),
    );
    expect(parsed.question).toBe("Who else was on the ward that night?");
    expect(parsed.because).toBe("You have said what happened and not yet who saw it.");
    expect(parsed.shown).not.toContain("QUESTION:");
    expect(parsed.shown).not.toContain("BECAUSE:");
    // The reply still ends on the question, which is what the researcher reads.
    expect(parsed.shown.endsWith("Who else was on the ward that night?")).toBe(true);
  });

  test("a model that skips the marked lines still lands a question and a reason", () => {
    // The turn is not lost because a formatting instruction was ignored. The
    // question is read off the reply and the reason says where it came from,
    // which is the one thing the tool does know about it.
    const parsed = parseConversationTurn(
      "That is worth staying with. What did the charge nurse say about it?",
    );
    expect(parsed.question).toBe("What did the charge nurse say about it?");
    expect(parsed.because).toBe(FOLLOW_UP_REASON);
    expect(parsed.shown).toContain("What did the charge nurse say about it?");
  });

  test("a turn that asks nothing yields no question at all", () => {
    const parsed = parseConversationTurn("Recorded. I will leave that there.");
    expect(parsed.question).toBe("");
    expect(parsed.shown).toBe("Recorded. I will leave that there.");
  });

  test("Anti: the fallback takes the last question, not the first", () => {
    const parsed = parseConversationTurn(
      "Was that the whole shift? Which handover was it?",
    );
    expect(parsed.question).toBe("Which handover was it?");
  });
});

describe("a place is a station or the framing (ISC-482)", () => {
  test("the seven stations and the framing are places, and nothing else is", () => {
    expect(isConversationPlace("site")).toBe(true);
    expect(isConversationPlace("framing")).toBe(true);
    expect(isConversationPlace("nowhere")).toBe(false);
  });

  test("a station's turns are filed under the topic they always were", () => {
    // Refusals are counted per topic and coverage is measured on it, so a
    // conversation turn that invented a new key for a station would split both.
    expect(topicForPlace("site")).toBe("station:site");
    expect(topicForPlace("framing")).toBe("framing");
  });

  test("a place is named in the rail's own words", () => {
    expect(placeLabel("site")).toBe("Site");
    expect(placeLabel("framing")).toBe("your starting point");
  });

  test("the move id says the turn came from the conversation", () => {
    expect(conversationMoveId("site", 3)).toBe("conversation:site@3");
    expect(isConversationMove(conversationMoveId("framing", 1))).toBe(true);
    expect(isConversationMove("station-probe:site:empty")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("every turn of the conversation is on the record (ISC-483, ISC-45)", () => {
  test("a turn appends the question and its delivery, with the reason on the selection", async () => {
    resetInterviewInFlight();
    const ledger = makeLedger();
    const outcome = await recordConversationTurn(turn(), ledger);
    expect(outcome.kind).toBe("recorded");
    if (outcome.kind !== "recorded") return;

    const selection = outcome.selection;
    expect(selection).toBeDefined();
    if (selection === undefined) return;
    expect(selection.station).toBe("site");
    expect(selection.topic).toBe("station:site");
    expect(selection.reason).toBe("You have named the thing but not yet what it looked like.");
    expect(selection.mode).toBe("interrogation");
    // The source is the move id's prefix. A conversation chooses out of what
    // was just said rather than out of an offered set, so there are no
    // alternatives to log and recording some would be a fiction.
    expect(isConversationMove(selection.moveId)).toBe(true);
    expect(selection.moveId).toBe("conversation:site@1");
    expect(selection.alternatives).toEqual([]);

    // The delivery is the model's, threaded to the selection, and carries the
    // provenance the ledger requires of a persona actor.
    expect(outcome.delivered.actor).toBe("persona:interviewer");
    expect(outcome.delivered.inReplyTo).toBe(selection.id);
    expect(outcome.delivered.model).toBe("mock");

    const state = projectInterview(ledger.store, PROJECT);
    expect(state.outstanding?.question).toBe("What did you see that made you say it?");
  });

  test("the turns at a place are numbered, so the record can be read in order", async () => {
    resetInterviewInFlight();
    const ledger = makeLedger();
    await recordConversationTurn(turn(), ledger);
    resetInterviewInFlight();
    await recordAnswer({ projectId: PROJECT, text: "The handover sheet was blank." }, ledger);
    resetInterviewInFlight();
    const second = await recordConversationTurn(turn({ question: "Blank how?" }), ledger);
    expect(second.kind === "recorded" && second.selection?.moveId).toBe("conversation:site@2");
  });

  test("a turn is refused while a question is open somewhere else (ISC-43)", async () => {
    resetInterviewInFlight();
    const ledger = makeLedger();
    // Opened at another step, through the conversation there, which is the
    // shape a researcher actually reaches this state in.
    await recordConversationTurn(
      turn({
        place: "context",
        topic: "station:context",
        question: "What made this worth your time?",
      }),
      ledger,
    );
    resetInterviewInFlight();

    const before = ledger.store.length;
    const outcome = await recordConversationTurn(turn(), ledger);
    expect(outcome.kind).toBe("blocked-outstanding");
    expect(outcome.kind === "blocked-outstanding" && outcome.at).toBe("context");
    // Refused means not appended. A turn written anyway would leave two
    // questions on the table with nothing saying which one is live.
    expect(ledger.store).toHaveLength(before);
  });

  test("the turn that answers the open question is the one exception", async () => {
    resetInterviewInFlight();
    const ledger = makeLedger();
    await recordConversationTurn(turn(), ledger);
    const open = projectInterview(ledger.store, PROJECT).outstanding;
    expect(open).not.toBeNull();
    resetInterviewInFlight();
    const outcome = await recordConversationTurn(
      turn({ answering: open?.eventId ?? "none", question: "Blank how?" }),
      ledger,
    );
    expect(outcome.kind).toBe("recorded");
  });

  test("asking for directions is recorded as guidance (ISC-485)", async () => {
    resetInterviewInFlight();
    const ledger = makeLedger();
    const outcome = await recordConversationTurn(turn({ mode: "guidance" }), ledger);
    expect(outcome.kind === "recorded" && outcome.selection?.mode).toBe("guidance");
    // And it counts as guidance in the split, which is the point: help is
    // available and the record shows how often it was taken.
    const state = projectInterview(ledger.store, PROJECT);
    expect(state.guidanceTurns).toBe(1);
    expect(state.interrogationTurns).toBe(0);
  });

  test("a turn that asks nothing is recorded, and opens no question", async () => {
    resetInterviewInFlight();
    const ledger = makeLedger();
    const outcome = await recordConversationTurn(
      turn({ question: "", shown: "Recorded. I will leave that there." }),
      ledger,
    );
    expect(outcome.kind).toBe("recorded");
    expect(outcome.kind === "recorded" && outcome.selection).toBeUndefined();
    // It still belongs somewhere, or the transcript could not show it.
    expect(outcome.kind === "recorded" && outcome.delivered.station).toBe("site");
    expect(projectInterview(ledger.store, PROJECT).outstanding).toBeNull();
  });

  test("the opener speaks once, and a place already holding a conversation never re-opens (ISC-482)", async () => {
    resetInterviewInFlight();
    const ledger = makeLedger();
    const first = await recordConversationTurn(turn({ onlyIfPlaceEmpty: true }), ledger);
    expect(first.kind).toBe("recorded");
    resetInterviewInFlight();
    const again = await recordConversationTurn(turn({ onlyIfPlaceEmpty: true }), ledger);
    expect(again.kind).toBe("already-open");
  });
});

describe("the researcher speaks with nothing outstanding (ISC-483)", () => {
  test("a free message lands as a human turn carrying its own place", async () => {
    const ledger = makeLedger();
    const event = await recordFreeTurn(
      { projectId: PROJECT, place: "site", text: "One more thing about the ward." },
      ledger,
    );
    expect(event).not.toBeNull();
    expect(event?.actor).toBe("human");
    expect(event?.station).toBe("site");
    // Replying to nothing is the whole point: a chat box that only works while
    // a question is open is a form with a cursor in it.
    expect(event?.inReplyTo).toBeUndefined();
  });

  test("and it shows at that place and at no other", async () => {
    const ledger = makeLedger();
    await recordFreeTurn(
      { projectId: PROJECT, place: "site", text: "One more thing about the ward." },
      ledger,
    );
    const entries = buildTranscript(ledger.store);
    expect(turnsAtStation(entries, "site").map((e) => e.text)).toEqual([
      "One more thing about the ward.",
    ]);
    expect(turnsAtStation(entries, "context")).toHaveLength(0);
  });

  test("Anti: an empty message is not a turn", async () => {
    const ledger = makeLedger();
    expect(await recordFreeTurn({ projectId: PROJECT, place: "site", text: "   " }, ledger)).toBeNull();
    expect(ledger.store).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe("what the model is told, and what it may not do (ISC-484)", () => {
  const base = {
    place: "site",
    placeLabel: "Site",
    purpose: "Where you are looking, and why there rather than somewhere else.",
    stationQuestion: "Why is this the right place to see the thing you care about?",
    mode: "interrogation" as const,
    opener: false,
    nothingWrittenYet: false,
    // M51, ISC-534: this step already holds a saved answer, which is what lets
    // the material into the prompt at all.
    stepAnswered: true,
    chunks: [],
    ontologySummary: "",
    here: ["They said: the handover sheet was blank."],
    earlier: ["They said: I work nights on a ward."],
  };

  test("a thin reply gets a narrower question, never the same one again", () => {
    const prompt = conversationPrompt(base);
    expect(prompt).toContain("narrower question");
    /* M84, ISC-703: before data, the narrower question asks for something that
     * they know of the setting; an instance from data waits for Early data. */
    expect(prompt).toContain("one place, one practice, one kind of document that they expect to find there");
    expect(prompt).not.toContain("one instance, one person, one thing that they saw");
    expect(prompt).toContain("Do not ask the same question again in other words");
  });

  test("reflecting their words is allowed and supplying content is not", () => {
    expect(conversationPrompt(base)).toContain(
      "You may reflect their own words back to sharpen them. Do not supply content that they have not said.",
    );
  });

  test("the expectation question is held back at the framing and nowhere else", () => {
    const atFraming = conversationPrompt({ ...base, place: "framing", placeLabel: "your starting point" });
    expect(atFraming).toContain("Do not ask what they expect to find, and what the papers would lead them to expect instead");
    // At a station the rule would be noise: the station's own question is not
    // the one that presumes an expectation and a finding.
    expect(conversationPrompt(base)).not.toContain("Do not ask what they expect to find, and what the papers");
  });

  test("the exchange here and the rest of the study both reach the model", () => {
    const prompt = conversationPrompt(base);
    expect(prompt).toContain("The conversation here, oldest first");
    expect(prompt).toContain("the handover sheet was blank");
    expect(prompt).toContain("Earlier in this study, at other steps");
    expect(prompt).toContain("I work nights on a ward");
  });

  test("the opener asks the easier question when nothing is written anywhere", () => {
    const cold = conversationPrompt({ ...base, opener: true, nothingWrittenYet: true });
    expect(cold).toContain("what they plan to look at, what draws them to it, what they want to explore");
    /* M74b, ISC-664: an opener leads into the bubble's question, so a warm
     * opener points to the place to start; an opener that asks a question of
     * its own (the bubble shows another) still puts it in their setting. */
    const warm = conversationPrompt({ ...base, opener: true, nothingWrittenYet: false });
    expect(warm).toContain("point them to the place in their own setting where an answer could start");
    const asking = conversationPrompt({ ...base, opener: true, openerAsks: true, nothingWrittenYet: false });
    expect(asking).toContain("put the step's question to them in their own setting");
  });

  test("the leak guard passes on the tool's own half of the prompt (ISC-486)", () => {
    // The same guarantee `assembleTurnPrompt` has held since ISC-46: a prompt
    // that arrives carrying its own answer is refused at assembly time, where
    // the failure is recoverable, rather than in the ledger, where it is not.
    const prompt = conversationPrompt(base);
    const authored = prompt.slice(0, prompt.indexOf("## The step:"));
    expect(proposedAnswerViolations(authored)).toEqual([]);
  });

  test("Anti: the guard would refuse a prompt that supplied the answer", () => {
    expect(
      proposedAnswerViolations("Ask them about the ward. For example, the researcher could say it was quiet."),
    ).not.toEqual([]);
  });

  test("the marker the mock reads is really in the prompt", () => {
    expect(conversationPrompt(base)).toContain(CONVERSATION_MARKER);
  });
});

// ---------------------------------------------------------------------------

describe("the outgoing scan (ISC-486)", () => {
  test("a turn that supplies an answer is recorded as one, and not blocked", async () => {
    resetInterviewInFlight();
    const ledger = makeLedger();
    const shown = "You should describe the ward as understaffed. What did you see?";
    const outcome = await recordConversationTurn(
      {
        ...turn(),
        shown,
        answerLeaks: proposedAnswerViolations(shown).map((l) => l.phrase),
      },
      ledger,
    );
    expect(outcome.kind).toBe("recorded");
    expect(outcome.kind === "recorded" && (outcome.delivered.answerLeaks ?? []).length).toBe(1);
    // Not blocked. Hiding a turn the model already produced would remove the
    // evidence rather than record it, and the scan is blunt on purpose.
    expect(outcome.kind === "recorded" && outcome.delivered.text).toBe(shown);
  });

  test("the instrumentation row counts it against the turns the tool spoke", async () => {
    resetInterviewInFlight();
    const ledger = makeLedger();
    const shown = "You should describe the ward as understaffed. What did you see?";
    await recordConversationTurn(
      { ...turn(), shown, answerLeaks: proposedAnswerViolations(shown).map((l) => l.phrase) },
      ledger,
    );
    resetInterviewInFlight();
    await recordAnswer({ projectId: PROJECT, text: "It was two staff short." }, ledger);
    resetInterviewInFlight();
    await recordConversationTurn(turn({ question: "Short on what shift?" }), ledger);

    const summary = askingSummary(ledger.store);
    expect(summary.turns).toBe(2);
    expect(summary.leaked).toBe(1);
    expect(summary.asked).toBe(2);
    expect(summary.offered).toBe(0);
  });

  test("a clean session reports none, rather than reporting nothing", async () => {
    resetInterviewInFlight();
    const ledger = makeLedger();
    await recordConversationTurn(turn(), ledger);
    expect(askingSummary(ledger.store).leaked).toBe(0);
    expect(askingSummary(ledger.store).turns).toBe(1);
  });

  test("Anti: a leak list on the researcher's own turn is refused", () => {
    // The scan is of the tool's outgoing prose. Marking a human turn with it
    // would be the tool flagging the researcher's own words.
    const errors = validateEvent({
      id: crypto.randomUUID(),
      ts: 1,
      actor: "human",
      projectId: PROJECT,
      type: "response",
      text: "You should have been there.",
      answerLeaks: ["You should"],
    });
    expect(errors).not.toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("a draft made of the researcher's own words (ISC-487)", () => {
  const said = [
    { id: "t1", text: "I keep finding the handover sheet blank on nights." },
    { id: "t2", text: "The charge nurse said it had been like that for months." },
  ];

  test("the prompt carries their turns and nothing the tool said", () => {
    const prompt = draftPrompt({ question: "What is going on in this setting?", said: said.map((t) => t.text) });
    for (const t of said) expect(prompt).toContain(t.text);
    // Not one of the tool's own questions. Drafting from those is how a tool
    // ends up writing an answer nobody gave.
    expect(prompt).not.toContain("What did you see that made you say it?");
    expect(prompt).toContain(DRAFT_MARKER);
  });

  test("it is told to leave a gap rather than fill one", () => {
    const prompt = draftPrompt({ question: "q", said: ["something"] });
    expect(prompt).toContain("write [...] and carry on. Do not fill the gap");
    expect(prompt).toContain("Add only facts that they gave");
  });

  test("one part everywhere, the framing included (M40, ISC-508)", () => {
    /* The framing asked for two marked parts, INTEREST and PUZZLE, and let the
     * second come back empty: that was M37's answer to a question a researcher on
     * day one cannot answer. M40's answer is not to ask. The puzzle is the tool's
     * reading of the saved answers, so a draft of the framing is a draft of the one
     * field the framing still holds and takes the same shape every station's does.
     *
     * The markers are gone with it, and asserted gone: two shapes of draft where one
     * is needed is two prompts that can drift, and the mock branches on the marker,
     * so a leftover would send a two-part fixture to a one-part caller. */
    const prompt = draftPrompt({ question: "What is drawing you to this particular research inquiry?", said: ["a"] });
    expect(prompt).toContain(DRAFT_MARKER);
    expect(prompt).toContain("Return only the answer.");
    expect(prompt).not.toContain("INTEREST:");
    expect(prompt).not.toContain("Leave PUZZLE empty");
    const markers = readFileSync(join(ROOT, "src/inference/promptMarkers.ts"), "utf8");
    expect(markers).not.toContain("FRAMING_DRAFT_MARKER");
  });

  test("the turns handed over are the researcher's own, at that place only", () => {
    const events: LedgerEvent[] = [
      {
        id: "q1",
        ts: 1,
        actor: "system",
        projectId: PROJECT,
        type: "question-selection",
        moveId: "conversation:site@1",
        topic: "station:site",
        question: "What did you see?",
        alternatives: [],
        mode: "interrogation",
        station: "site",
        reason: "because",
      },
      { id: "a1", ts: 2, actor: "human", projectId: PROJECT, type: "response", text: "Blank sheets.", inReplyTo: "q1" },
      { id: "f1", ts: 3, actor: "human", projectId: PROJECT, type: "response", text: "At the framing.", station: "framing" },
      {
        id: "m1",
        ts: 4,
        actor: "persona:interviewer",
        projectId: PROJECT,
        model: "mock",
        modelVersion: "mock-1",
        type: "response",
        text: "The tool's own turn.",
        station: "site",
      },
    ];
    expect(humanTurnsAt(events, PROJECT, "site").map((t) => t.text)).toEqual(["Blank sheets."]);
    expect(humanTurnsAt(events, PROJECT, "framing").map((t) => t.text)).toEqual(["At the framing."]);
  });

  test("the event validates, names the turns it came from, and refuses to be unsourced", () => {
    const draft = {
      id: crypto.randomUUID(),
      ts: 1_800_000_000_000,
      actor: "persona:interviewer",
      projectId: PROJECT,
      model: "mock",
      modelVersion: "mock-1",
      type: "brief-draft",
      station: "site",
      text: "I keep finding the handover sheet blank on nights, and [...].",
      fromTurnIds: ["t1", "t2"],
    };
    expect(validateEvent(draft)).toEqual([]);
    // Unsourced is refused, because the turns it names are what make "only your
    // words" a claim anyone can check.
    expect(validateEvent({ ...draft, fromTurnIds: [] })).not.toEqual([]);
  });

  test("a saved answer records the draft it began as, and is fine without one", () => {
    const bound = {
      id: crypto.randomUUID(),
      ts: 1_800_000_000_000,
      actor: "human",
      projectId: PROJECT,
      type: "bound",
      subject: "site",
      statement: "The ward, because the handover is where the gap shows.",
    };
    expect(validateEvent(bound)).toEqual([]);
    expect(validateEvent({ ...bound, draftedFrom: crypto.randomUUID() })).toEqual([]);
    // Present and empty would be a writer claiming a provenance it cannot name.
    expect(validateEvent({ ...bound, draftedFrom: "" })).not.toEqual([]);
  });

  test("a part that is only gaps has said nothing, and still is (M37, kept at M40)", () => {
    /* `parseFramingDraft` is gone with the two-part draft, and the rule it was built
     * around is not: the first live walk of M37 asked for a puzzle nobody had stated,
     * the model returned the gap marker alone as it was told to, and the literal
     * string "[...]" landed in the researcher's own field with the "not yet said"
     * note suppressed because the part was not empty by string comparison.
     *
     * `isGapOnly` is that rule and it is load-bearing in a second place now: the
     * puzzle reading's parser reads a `PUZZLE:` holding nothing but gaps as a `none`,
     * for exactly this reason. So the cases the old parser covered are asserted
     * against the helper directly, which is where they belonged. */
    for (const gap of ["[…]", "[...]", "[ ... ]", "[…].", "", "  ", "[...] [...]"]) {
      expect({ gap, only: isGapOnly(gap) }).toEqual({ gap, only: true });
    }
    for (const said of [
      "I expected a decision point and found a drift.",
      "I expected [...] and found a drift.",
    ]) {
      expect({ said, only: isGapOnly(said) }).toEqual({ said, only: false });
    }
  });

  /**
   * The marker, named on screen (D1, M43b).
   *
   * The prompt tells the model to write `[...]` where the answer would need
   * something the researcher has not said, and to carry on rather than fill the
   * gap. The instruction and the marker both stand; what was missing is any
   * sentence saying what the marker is. The walk of 2026-09-13 found the literal
   * string at the end of a framing draft and again mid-body in a station draft,
   * between two paragraphs, where it reads as the researcher having elided
   * something of their own.
   */
  test("a draft carrying a gap is told apart from one that is nothing but gaps", () => {
    for (const text of ["a [...] b", "[...]", "ends with [...]", "[…]", "a [ ... ] b"]) {
      expect({ text, gap: hasGapMarker(text) }).toEqual({ text, gap: true });
    }
    for (const text of ["", "I expected a decision point and found a drift.", "a [ b ] c"]) {
      expect({ text, gap: hasGapMarker(text) }).toEqual({ text, gap: false });
    }
    /* Asked twice, because the pattern is a module-level regex and a global one
     * carries a `lastIndex` that makes the second answer differ from the first. */
    expect(hasGapMarker("a [...] b")).toBe(hasGapMarker("a [...] b"));
  });

  test("the note names the marker and says what to do with it", () => {
    expect(GAP_MARKER_NOTE).toContain("[...]");
    expect(GAP_MARKER_NOTE).toContain("Replace each [...] with your own words");
    // C2 and C9: second person, and it names what wrote the marker.
    expect(GAP_MARKER_NOTE.startsWith("Abductive wrote")).toBe(true);
    expect(GAP_MARKER_NOTE).not.toMatch(/[—–]/);
    for (const sentence of GAP_MARKER_NOTE.split(". ")) {
      expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(25);
    }
  });
});

// ---------------------------------------------------------------------------

describe("the mock answers a conversation with a conversation", () => {
  test("it returns a valid turn, marked lines and all", async () => {
    const client = new MockInferenceClient();
    const result = await client.complete({
      system: `# Role\n${CONVERSATION_MARKER}\n- follow the researcher`,
      messages: [{ role: "user", content: "Reply now." }],
    });
    const parsed = parseConversationTurn(result.text);
    expect(parsed.question).not.toBe("");
    expect(parsed.because).not.toBe(FOLLOW_UP_REASON);
    expect(parsed.shown).not.toContain("QUESTION:");
  });

  test("a draft prompt gets a draft, and a reading prompt gets a marked line", async () => {
    const client = new MockInferenceClient();
    const one = await client.complete({
      system: DRAFT_MARKER,
      messages: [{ role: "user", content: "Write it." }],
    });
    expect(one.text).not.toContain("QUESTION:");
    /* The framing's two-part fixture is replaced by the reading's, which is the
     * marker the framing's prompt no longer has a use for. It is a `NONE:` and made
     * of nothing, for the reason the draft fixture is: the mock must never put a
     * sentence about the researcher's own study in front of them. */
    const read = await client.complete({
      system: PUZZLE_READING_MARKER,
      messages: [{ role: "user", content: "Read it." }],
    });
    const parsed = parsePuzzleReading(read.text);
    expect("none" in parsed).toBe(true);
    expect("puzzle" in parsed).toBe(false);
  });

  test("Anti: every other prompt still gets the fixture the old tests pin", async () => {
    const client = new MockInferenceClient();
    const result = await client.complete({
      system: "# Role\nYou are conducting a design interview.",
      messages: [{ role: "user", content: "Ask the question." }],
    });
    expect(result.text).toContain("bounds its answer before the field has spoken");
  });
});
