/**
 * Interview loop: turn discipline, divergence, refusal handling, saturation,
 * and the interrogation guarantee (ISC-43 … ISC-53, ISC-58).
 *
 * The loop's whole value rests on each recorded turn corresponding to a
 * question a person actually read and answered. Most of what follows is
 * checking that the record cannot say otherwise.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { MATRIX } from "../src/matrix/matrix.ts";
import { confidentAnswerStreak, refusalStreak, isHedged } from "../src/matrix/signals.ts";
import { projectInterview } from "../src/interview/state.ts";
import { divergenceErrors, generateMoves, wordingSimilarity } from "../src/interview/moves.ts";
import { assembleTurnPrompt, proposedAnswerViolations } from "../src/interview/prompt.ts";
import { checkSaturation } from "../src/interview/saturation.ts";
import {
  recordAnswer,
  recordRedirection,
  recordRefusal,
  resetInterviewInFlight,
  selectMove,
} from "../src/interview/orchestrator.ts";
import type { NextMove } from "../src/interview/types.ts";

const PROJECT = "proj-interview";
let clock = 1_900_000_000_000;
let seq = 0;

function env(actor: "human" | "system" = "system") {
  clock += 1000;
  seq += 1;
  return { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT };
}

function question(topic: string, mode: "interrogation" | "guidance" = "interrogation"): LedgerEvent {
  return {
    ...env("system"),
    type: "question-selection",
    moveId: `${topic}@${seq}`,
    topic,
    question: `What about ${topic}?`,
    alternatives: ["alt-a", "alt-b"],
    mode,
    reason: `probing ${topic}`,
  } as LedgerEvent;
}

function answer(inReplyTo: string, text: string): LedgerEvent {
  return { ...env("human"), type: "response", text, inReplyTo } as LedgerEvent;
}

function redirect(toTopic: string): LedgerEvent {
  return { ...env("human"), type: "redirection", toTopic } as LedgerEvent;
}

function refusal(
  questionEventId: string,
  kind: "dont-know" | "not-now" | "wont-answer" = "dont-know",
): LedgerEvent {
  return { ...env("human"), type: "refusal", questionEventId, kind } as LedgerEvent;
}

function mutation(targetId: string, pageType: PageType, title: string): LedgerEvent {
  return {
    ...env("human"),
    type: "ontology-mutation",
    op: "create",
    targetId,
    pageType,
    title,
    body: "",
    origin: "data-driven",
    supportingChunks: ["c1"],
  } as LedgerEvent;
}

/** In-memory ledger with a real read-through, so idempotency is actually exercised. */
function makeLedger(initial: LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      // Every appended event must be well-formed — the loop must not be able
      // to write something the ledger would reject on reload.
      for (const e of events) expect(validateEvent(e)).toEqual([]);
      store.push(...events);
    },
    readEvents: async () => [...store],
    now: () => (clock += 1000),
    newId: () => crypto.randomUUID(),
  };
}

const MOVE_A: NextMove = {
  id: "m-a",
  topic: "puzzle:root",
  mode: "interrogation",
  question: "What is happening in your field site that you cannot currently account for?",
  rationale: "no puzzle root exists yet",
  source: "matrix-gap",
};
const MOVE_B: NextMove = {
  id: "m-b",
  topic: "theory:expectation",
  mode: "guidance",
  question: "Shall I attach the career-stage literature as the expectation this troubles?",
  rationale: "a puzzle troubling nothing is not a puzzle",
  source: "unmet-obligation",
};

beforeEach(() => {
  resetInterviewInFlight();
});

// ---------------------------------------------------------------------------

describe("turn discipline (ISC-43)", () => {
  test("exactly one question is outstanding after a selection", async () => {
    const ledger = makeLedger();
    const out = await selectMove(
      { projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-a" },
      ledger,
    );
    expect(out.kind).toBe("asked");
    const state = projectInterview(ledger.store, PROJECT);
    expect(state.outstanding?.topic).toBe("puzzle:root");
    expect(state.turns).toBe(1);
  });

  test("a second selection is refused while a question is outstanding", async () => {
    const ledger = makeLedger();
    await selectMove({ projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-a" }, ledger);
    resetInterviewInFlight();
    const second = await selectMove(
      { projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-b" },
      ledger,
    );
    expect(second.kind).toBe("blocked-outstanding");
    expect(ledger.store.filter((e) => e.type === "question-selection")).toHaveLength(1);
  });

  test("answering clears the question and the next one may be asked", async () => {
    const ledger = makeLedger();
    await selectMove({ projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-a" }, ledger);
    await recordAnswer({ projectId: PROJECT, text: "Directors keep refusing named roles." }, ledger);
    expect(projectInterview(ledger.store, PROJECT).outstanding).toBeNull();
    resetInterviewInFlight();
    const second = await selectMove(
      { projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-b" },
      ledger,
    );
    expect(second.kind).toBe("asked");
  });

  test("an unrelated response does not clear the outstanding question", async () => {
    const ledger = makeLedger();
    await selectMove({ projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-a" }, ledger);
    ledger.store.push({ ...env("human"), type: "response", text: "aside" } as LedgerEvent);
    expect(projectInterview(ledger.store, PROJECT).outstanding).not.toBeNull();
  });
});

describe("concurrency (ISC-58)", () => {
  test("two overlapping selections produce one question, not two", async () => {
    const ledger = makeLedger();
    const [a, b] = await Promise.all([
      selectMove({ projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-a" }, ledger),
      selectMove({ projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-a" }, ledger),
    ]);
    expect(a).toBe(b);
    expect(ledger.store.filter((e) => e.type === "question-selection")).toHaveLength(1);
  });

  test("two overlapping answers produce one response", async () => {
    const ledger = makeLedger();
    await selectMove({ projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-a" }, ledger);
    await Promise.all([
      recordAnswer({ projectId: PROJECT, text: "same answer" }, ledger),
      recordAnswer({ projectId: PROJECT, text: "same answer" }, ledger),
    ]);
    expect(ledger.store.filter((e) => e.type === "response")).toHaveLength(1);
  });

  test("a serial second answer with nothing outstanding writes nothing", async () => {
    const ledger = makeLedger();
    await selectMove({ projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-a" }, ledger);
    await recordAnswer({ projectId: PROJECT, text: "first" }, ledger);
    resetInterviewInFlight();
    await recordAnswer({ projectId: PROJECT, text: "second" }, ledger);
    expect(ledger.store.filter((e) => e.type === "response")).toHaveLength(1);
  });
});

describe("selection logging (ISC-45)", () => {
  test("the event carries mode, alternatives, and the reason", async () => {
    const ledger = makeLedger();
    await selectMove({ projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-b" }, ledger);
    const event = ledger.store.find((e) => e.type === "question-selection");
    expect(event).toBeDefined();
    if (event?.type !== "question-selection") throw new Error("no selection event");
    expect(event.mode).toBe("guidance");
    expect(event.alternatives).toEqual(["m-a"]);
    expect(event.reason).toBe("a puzzle troubling nothing is not a puzzle");
    expect(event.topic).toBe("theory:expectation");
  });

  test("a move set that is not divergent is rejected before anything is written", async () => {
    const ledger = makeLedger();
    const twin: NextMove = { ...MOVE_A, id: "m-a2" };
    const out = await selectMove(
      { projectId: PROJECT, moves: [MOVE_A, twin], chosenId: "m-a" },
      ledger,
    );
    expect(out.kind).toBe("rejected");
    expect(ledger.store).toHaveLength(0);
  });

  test("the interrogation/guidance ratio is derivable from the ledger (ISC-53)", () => {
    const q1 = question("a", "interrogation");
    const q2 = question("b", "guidance");
    const q3 = question("c", "interrogation");
    const state = projectInterview(
      [q1, answer(q1.id, "x"), q2, answer(q2.id, "y"), q3, answer(q3.id, "z")],
      PROJECT,
    );
    expect(state.turns).toBe(3);
    expect(state.interrogationTurns).toBe(2);
    expect(state.guidanceTurns).toBe(1);
    expect(state.interrogationRatio).toBeCloseTo(2 / 3, 5);
  });

  test("a fresh session has a null ratio, not zero", () => {
    expect(projectInterview([], PROJECT).interrogationRatio).toBeNull();
  });
});

describe("divergence (ISC-44)", () => {
  test("two moves on the same target are not a choice", () => {
    const errors = divergenceErrors([MOVE_A, { ...MOVE_B, topic: "puzzle:root" }]);
    expect(errors.some((e) => e.includes("share topic"))).toBe(true);
  });

  test("a rephrasing of the same question is caught even with a different topic", () => {
    const rephrased: NextMove = {
      ...MOVE_B,
      topic: "other:topic",
      question: "What is happening in your field site that you cannot presently account for?",
    };
    const errors = divergenceErrors([MOVE_A, rephrased]);
    expect(errors.some((e) => e.includes("same question"))).toBe(true);
  });

  test("a move asking two questions is rejected", () => {
    const doubled: NextMove = { ...MOVE_B, question: "What happened? And why?" };
    expect(divergenceErrors([MOVE_A, doubled]).some((e) => e.includes("exactly one question"))).toBe(
      true,
    );
  });

  test("generated cold-start moves are divergent and 2–3 in number", () => {
    const graph = projectOntology([], PROJECT);
    const moves = generateMoves({
      graph,
      state: projectInterview([], PROJECT),
      coveredCells: [],
      matrix: MATRIX,
      turnIndex: 0,
    });
    expect(moves.length).toBeGreaterThanOrEqual(2);
    expect(moves.length).toBeLessThanOrEqual(3);
    expect(divergenceErrors(moves)).toEqual([]);
  });

  test("generated moves target different things, not just different words", () => {
    const events = [mutation("p1", "puzzle", "Directors decline named roles")];
    const graph = projectOntology(events, PROJECT);
    const moves = generateMoves({
      graph,
      state: projectInterview(events, PROJECT),
      coveredCells: [],
      matrix: MATRIX,
      turnIndex: 3,
    });
    expect(divergenceErrors(moves)).toEqual([]);
    const targets = new Set(moves.map((m) => m.targetId ?? m.topic));
    expect(targets.size).toBe(moves.length);
    for (let i = 0; i < moves.length; i++) {
      for (let j = i + 1; j < moves.length; j++) {
        expect(wordingSimilarity(moves[i]!.question, moves[j]!.question)).toBeLessThan(0.7);
      }
    }
  });

  test("generation is pure — same context, same moves", () => {
    const graph = projectOntology([], PROJECT);
    const ctx = {
      graph,
      state: projectInterview([], PROJECT),
      coveredCells: [],
      matrix: MATRIX,
      turnIndex: 7,
    };
    expect(generateMoves(ctx)).toEqual(generateMoves(ctx));
  });
});

describe("the interrogation guarantee (ISC-46)", () => {
  test("an assembled interrogation prompt supplies no answer", () => {
    const prompt = assembleTurnPrompt({
      move: MOVE_A,
      chunks: [],
      ontologySummary: "1 puzzle, 0 theories.",
      lastResponse: "I've been circling this for months.",
    });
    expect(proposedAnswerViolations(prompt)).toEqual([]);
    expect(prompt).toContain("Do NOT supply, hint at, or illustrate an answer");
    expect(prompt).toContain(MOVE_A.question);
  });

  test("every generated interrogation move assembles a clean prompt", () => {
    const graph = projectOntology([], PROJECT);
    const moves = generateMoves({
      graph,
      state: projectInterview([], PROJECT),
      coveredCells: [],
      matrix: MATRIX,
      turnIndex: 0,
    });
    for (const move of moves.filter((m) => m.mode === "interrogation")) {
      const prompt = assembleTurnPrompt({ move, chunks: [], ontologySummary: "" });
      expect(proposedAnswerViolations(prompt)).toEqual([]);
    }
  });

  test("the detector catches answer-supplying language", () => {
    expect(proposedAnswerViolations("Perhaps because the field is crowded.")).not.toEqual([]);
    expect(proposedAnswerViolations("For example, you could say the role is temporary.")).not.toEqual(
      [],
    );
    expect(proposedAnswerViolations("What did you observe?")).toEqual([]);
  });

  test("assembly refuses a move that asks two questions", () => {
    expect(() =>
      assembleTurnPrompt({
        move: { ...MOVE_A, question: "What happened? Why?" },
        chunks: [],
        ontologySummary: "",
      }),
    ).toThrow(/exactly one question/);
  });

  /* M62, ISC-604 (the owner, 2026-09-30): guidance no longer proposes. It asks
   * differently and never hands the researcher an answer, a draft or a summary. */
  test("guidance prompts ask differently and never propose an answer", () => {
    const prompt = assembleTurnPrompt({ move: MOVE_B, chunks: [], ontologySummary: "" });
    expect(prompt).not.toContain("declinable");
    expect(prompt).toContain("Do not give a candidate answer, a draft sentence that they could adopt, or a summary");
  });
});

describe("redirection and refusal (ISC-47, ISC-48, ISC-50)", () => {
  test("a redirection is accepted with a question outstanding and is logged", async () => {
    const ledger = makeLedger();
    await selectMove({ projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-a" }, ledger);
    const state = await recordRedirection(
      { projectId: PROJECT, toTopic: "sampling:second-site" },
      ledger,
    );
    expect(state.outstanding).toBeNull();
    expect(state.redirections).toEqual(["sampling:second-site"]);
    const event = ledger.store.find((e) => e.type === "redirection");
    if (event?.type !== "redirection") throw new Error("no redirection event");
    expect(event.fromMoveId).toBe("m-a");
  });

  test("'I don't know' is recorded and penalised nowhere", async () => {
    const ledger = makeLedger();
    await selectMove({ projectId: PROJECT, moves: [MOVE_A, MOVE_B], chosenId: "m-a" }, ledger);
    await recordRefusal({ projectId: PROJECT, kind: "dont-know" }, ledger);
    const state = projectInterview(ledger.store, PROJECT);
    expect(state.outstanding).toBeNull();
    expect(state.refusalsByTopic.get("puzzle:root")).toBe(1);
    // No signal reads it as disengagement, and it does not feed the
    // confidence streak it would otherwise interrupt.
    expect(confidentAnswerStreak(ledger.store).fired).toBe(false);
    expect(refusalStreak(ledger.store).fired).toBe(false);
    expect(state.silencedTopics).toEqual([]);
  });

  test("three refusals on one topic silence it and surface the pattern", () => {
    const events: LedgerEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const q = question("identity:role");
      events.push(q, refusal(q.id, "not-now"));
    }
    const state = projectInterview(events, PROJECT);
    expect(state.refusalsByTopic.get("identity:role")).toBe(3);
    expect(state.silencedTopics).toEqual(["identity:role"]);
    expect(refusalStreak(events).fired).toBe(true);
  });

  test("a silenced topic is dropped from move generation — the agent stops pressing", () => {
    const events: LedgerEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const q = question("puzzle:root");
      events.push(q, refusal(q.id, "wont-answer"));
    }
    const moves = generateMoves({
      graph: projectOntology([], PROJECT),
      state: projectInterview(events, PROJECT),
      coveredCells: [],
      matrix: MATRIX,
      turnIndex: 4,
    });
    expect(moves.map((m) => m.topic)).not.toContain("puzzle:root");
    expect(moves.length).toBeGreaterThanOrEqual(2);
  });

  test("refusals on three different topics are not a streak", () => {
    const events: LedgerEvent[] = [];
    for (const topic of ["a", "b", "c"]) {
      const q = question(topic);
      events.push(q, refusal(q.id));
    }
    expect(refusalStreak(events).fired).toBe(false);
    expect(projectInterview(events, PROJECT).silencedTopics).toEqual([]);
  });
});

describe("confident-answer streak (ISC-49)", () => {
  function run(texts: string[]): LedgerEvent[] {
    const events: LedgerEvent[] = [];
    texts.forEach((text, i) => {
      const q = question(`t${i}`);
      events.push(q, answer(q.id, text));
    });
    return events;
  }

  test("four unhedged answers fire the suspicion signal", () => {
    const events = run([
      "The directors treat each film as a discrete firm.",
      "Named roles carry liability, so they avoid them.",
      "Producers hold the relationships and the directors know it.",
      "The financing structure makes the crew a temporary entity.",
    ]);
    const result = confidentAnswerStreak(events);
    expect(result.fired).toBe(true);
    expect(result.reason.toLowerCase()).toContain("fluency");
    expect(result.stateKey).toBe("confident-run:4");
  });

  test("a single hedge breaks the streak", () => {
    const events = run([
      "The directors treat each film as a discrete firm.",
      "I'm not sure, possibly liability.",
      "Producers hold the relationships.",
      "The financing structure makes the crew temporary.",
    ]);
    expect(confidentAnswerStreak(events).fired).toBe(false);
  });

  test("a refusal breaks the streak rather than counting toward it", () => {
    const events = run([
      "One.",
      "Two.",
      "Three.",
      "Four.",
    ]);
    const q = question("t4");
    events.push(q, refusal(q.id, "dont-know"));
    expect(confidentAnswerStreak(events).fired).toBe(false);
  });

  test("hedge detection covers the common forms", () => {
    expect(isHedged("I think it's the financing")).toBe(true);
    expect(isHedged("Hard to say")).toBe(true);
    expect(isHedged("The financing structure does it")).toBe(false);
  });

});

describe("saturation (ISC-51, ISC-52)", () => {
  function session(turns: number, mutationsPerTurn: number): LedgerEvent[] {
    const events: LedgerEvent[] = [];
    for (let i = 0; i < turns; i++) {
      const q = question(`t${i}`);
      events.push(q, answer(q.id, `answer ${i}`));
      for (let m = 0; m < mutationsPerTurn; m++) {
        events.push(mutation(`p-${i}-${m}`, "observation", `obs ${i}-${m}`));
      }
    }
    return events;
  }

  /* M74b, ISC-664: the reading waits until the model holds a concept, so the
   * sessions below that should read as saturated hold one from before the
   * window. */
  const held = (events: LedgerEvent[]): LedgerEvent[] => [mutation("p-held", "observation", "held"), ...events];

  test("a short session is never saturated", () => {
    const reading = checkSaturation(session(3, 0), PROJECT, { windowTurns: 8 });
    expect(reading.windowComplete).toBe(false);
    expect(reading.reached).toBe(false);
  });

  test("saturation is reached when the window stops changing the ontology", () => {
    const reading = checkSaturation(held(session(10, 0)), PROJECT, { windowTurns: 8 });
    expect(reading.windowComplete).toBe(true);
    expect(reading.reached).toBe(true);
    expect(reading.mutationsInWindow).toBe(0);
  });

  test("a productive window is not saturated", () => {
    const reading = checkSaturation(session(10, 2), PROJECT, { windowTurns: 8 });
    expect(reading.reached).toBe(false);
    expect(reading.mutationsInWindow).toBeGreaterThan(1);
  });

  test("saturation never blocks, and continuing past it is logged", async () => {
    const ledger = makeLedger(held(session(10, 0)));
    const out = await selectMove(
      {
        projectId: PROJECT,
        moves: [MOVE_A, MOVE_B],
        chosenId: "m-a",
        saturation: { windowTurns: 8 },
      },
      ledger,
    );
    expect(out.kind).toBe("asked");
    if (out.kind !== "asked") throw new Error("blocked at saturation");
    // R4: "asked past saturation", and the count says "changes to your model"
    // rather than "ontology changes". The property is unchanged: continuing is
    // never blocked and is always recorded as a decision.
    expect(out.event.reason).toContain("asked past saturation");
    const check = ledger.store.find((e) => e.type === "saturation-check");
    if (check?.type !== "saturation-check") throw new Error("no saturation event");
    expect(check.reached).toBe(true);
  });

  test("the advice never instructs the researcher to stop", () => {
    const reading = checkSaturation(held(session(10, 0)), PROJECT, { windowTurns: 8 });
    // M74b: the owner's wording, which offers carrying on first.
    expect(reading.advice).toContain("You can carry on");
    expect(reading.advice).not.toMatch(/\byou (must|should) stop\b/i);
  });

  /**
   * Drafts waiting, and what the Why block says about them (D15, M43b).
   *
   * A mutation is a draft the researcher accepted, so a study whose drafts are
   * all undecided reads as saturated whatever the questions produced. The walk of
   * 2026-09-13 read "The last 8 turns changed your model 0 times. Questions have
   * stopped moving it." with sixty-eight drafts in the tray after four answered
   * steps. Both sentences were true of the measure and the second was false about
   * the questions.
   */
  describe("saturation with drafts waiting for a decision (D15)", () => {
    /** A draft in the tray, undecided, which is what `pending` counts. */
    function drafted(id: string): LedgerEvent {
      return {
        ...env("system"),
        actor: "persona:extractor",
        type: "proposal",
        proposalId: id,
        pageType: "observation",
        title: `a claim from a turn, ${id}`,
        body: "the researcher's own words",
        model: "mock",
        modelVersion: "mock-1",
        sourceChunks: [],
      } as LedgerEvent;
    }

    test("the block names the waiting drafts instead of saying the questions stopped", () => {
      const events = [...held(session(10, 0)), drafted("d1"), drafted("d2"), drafted("d3")];
      const reading = checkSaturation(events, PROJECT, { windowTurns: 8 });
      expect(reading.reached).toBe(true);
      expect(reading.draftsWaiting).toBe(3);
      // M74b, ISC-664: the same facts in the owner's rules (L17: answers and
      // suggestions are in states, and the researcher acts).
      expect(reading.advice).toContain("Your last eight answers left your concepts unchanged");
      expect(reading.advice).toContain("3 suggestions are open for your decision");
      expect(reading.advice).toContain("Accept or reject a suggestion to change your concepts.");
      // The sentence the walk read, gone, because it is the one that was wrong.
      expect(reading.advice).not.toContain("Questions have stopped moving");
    });

    test("one waiting draft reads as one, in the singular", () => {
      const reading = checkSaturation([...held(session(10, 0)), drafted("d1")], PROJECT, {
        windowTurns: 8,
      });
      expect(reading.advice).toContain("1 suggestion is open for your decision");
    });

    test("with nothing waiting the block says the answers left the concepts unchanged", () => {
      const reading = checkSaturation(held(session(10, 0)), PROJECT, { windowTurns: 8 });
      expect(reading.draftsWaiting).toBe(0);
      // M74b, ISC-664: the owner's wording of the walk's finding 7.
      expect(reading.advice).toBe(
        "Your last eight answers left your concepts unchanged. You can carry on, narrow the question, or add data.",
      );
      /* C9. The sentence named nothing: "Questions have stopped moving it" left
       * the reader to work out what "it" was on a panel naming four things. */
      expect(reading.advice).not.toContain("stopped moving it");
    });

    test("a draft the researcher has decided is not waiting", () => {
      const decided: LedgerEvent = {
        ...env("human"),
        type: "proposal-adjudication",
        proposalId: "d1",
        disposition: "reject",
        reason: "not about this setting",
      } as LedgerEvent;
      const reading = checkSaturation(
        [...held(session(10, 0)), drafted("d1"), decided],
        PROJECT,
        { windowTurns: 8 },
      );
      expect(reading.draftsWaiting).toBe(0);
      expect(reading.advice).toContain("You can carry on, narrow the question, or add data.");
    });

    test("a productive window says so, whatever is waiting", () => {
      const reading = checkSaturation([...session(10, 2), drafted("d1")], PROJECT, {
        windowTurns: 8,
      });
      expect(reading.reached).toBe(false);
      expect(reading.advice).toContain("changed your concepts");
    });
  });
});

describe("projection purity", () => {
  test("replaying the same events twice yields deep-equal state", () => {
    const q = question("a");
    const events = [q, answer(q.id, "x"), mutation("p1", "puzzle", "P")];
    expect(projectInterview(events, PROJECT)).toEqual(projectInterview(events, PROJECT));
  });
});

describe("the loop does not circle (M5 live probe finding)", () => {
  test("the topic just asked is not re-offered after it is answered", () => {
    const q = question("puzzle:root");
    const events = [q, answer(q.id, "Directors refuse named roles.")];
    const state = projectInterview(events, PROJECT);
    expect(state.outstanding).toBeNull();
    expect(state.lastAskedTopic).toBe("puzzle:root");

    const moves = generateMoves({
      graph: projectOntology(events, PROJECT),
      state,
      coveredCells: [],
      matrix: MATRIX,
      turnIndex: state.turns,
    });
    expect(moves.map((m) => m.topic)).not.toContain("puzzle:root");
    expect(moves.length).toBeGreaterThanOrEqual(2);
  });

  test("a redirection also leaves the asked topic excluded", () => {
    const q = question("puzzle:root");
    const events = [q, redirect("elsewhere")];
    expect(projectInterview(events, PROJECT).lastAskedTopic).toBe("puzzle:root");
  });
});
