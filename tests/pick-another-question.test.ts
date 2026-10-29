/**
 * Picking one of the alternatives while a question is open (D11, M43).
 *
 * "Ask about something else" held the questions the tool passed over (the menu
 * left the page at M59, ISC-570; `selectMove` and this rule stay), and its
 * three cards stay pressable while a question is waiting. On the walk of
 * 2026-09-13 the first press was refused with "A question is already waiting.
 * Answer it, skip it, or change the subject first." and nothing else happened,
 * so the click looked like it had worked and had not. The researcher pressed
 * "Not now" on the open question and the same pick then went through cleanly,
 * which is the two-step version of what the tool should have done itself.
 *
 * `guide()` already does it: one question is open at a time across the whole
 * study, so the tool closes its own before it asks another. Choosing a different
 * question is the researcher steering, and the offered set exists to be steered
 * with. What the record must not say is that they declined anything, which is
 * D9's field doing its work here (`setAsideFor: "another-question"`).
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
  recordRefusal,
  resetInterviewInFlight,
  selectMove,
} from "../src/interview/orchestrator.ts";
import { projectInterview } from "../src/interview/state.ts";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { buildTranscript } from "../src/workbench/Dialogue.tsx";
import { setAsideReasons } from "../src/views/setAside.ts";
import type { NextMove } from "../src/interview/types.ts";

const PROJECT = "d11-pick";
let clock = 1_900_000_000_000;

function makeLedger(initial: readonly LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      for (const e of events) expect(validateEvent(e)).toEqual([]);
      store.push(...events);
    },
    readEvents: async () => [...store],
    now: () => (clock += 1000),
    newId: () => crypto.randomUUID(),
  };
}

const OPEN: NextMove = {
  id: "m-open",
  topic: "station:process",
  mode: "interrogation",
  question: "Does the attention fade gradually, or drop at one specific update?",
  rationale: "the step needs the shape of the change",
  source: "matrix-gap",
};
const CHOSEN: NextMove = {
  id: "m-chosen",
  topic: "observation:seed",
  mode: "interrogation",
  question: "Which specific episode or passage in your material first made this feel unresolved?",
  rationale: "an observation anchors the puzzle",
  source: "matrix-gap",
};

beforeEach(() => {
  resetInterviewInFlight();
});

describe("the pick goes through, and the record says who closed the question", () => {
  test("without the set-aside the pick is refused, which is the defect", async () => {
    const ledger = makeLedger();
    await selectMove(
      { projectId: PROJECT, moves: [OPEN, CHOSEN], chosenId: "m-open", station: "process" },
      ledger,
    );
    resetInterviewInFlight();
    const blocked = await selectMove(
      { projectId: PROJECT, moves: [OPEN, CHOSEN], chosenId: "m-chosen", station: "process" },
      ledger,
    );
    expect(blocked.kind).toBe("blocked-outstanding");
    // And nothing was written, which is why the click looked like a no-op.
    expect(ledger.store.filter((e) => e.type === "question-selection")).toHaveLength(1);
  });

  test("the tool sets its own question aside and then asks the chosen one", async () => {
    const ledger = makeLedger();
    await selectMove(
      { projectId: PROJECT, moves: [OPEN, CHOSEN], chosenId: "m-open", station: "process" },
      ledger,
    );
    expect(projectInterview(ledger.store, PROJECT).outstanding?.topic).toBe("station:process");

    // What the press did, in the order it did it (the callback left Dialogue at M89).
    resetInterviewInFlight();
    await recordRefusal(
      { projectId: PROJECT, kind: "not-now", setAsideFor: "another-question" },
      ledger,
    );
    resetInterviewInFlight();
    const asked = await selectMove(
      { projectId: PROJECT, moves: [OPEN, CHOSEN], chosenId: "m-chosen", station: "process" },
      ledger,
    );

    expect(asked.kind).toBe("asked");
    expect(projectInterview(ledger.store, PROJECT).outstanding?.topic).toBe("observation:seed");
    expect(ledger.store.filter((e) => e.type === "question-selection")).toHaveLength(2);
  });

  test("the transcript reads it as the tool's act, not as a decline", async () => {
    const ledger = makeLedger();
    await selectMove(
      { projectId: PROJECT, moves: [OPEN, CHOSEN], chosenId: "m-open", station: "process" },
      ledger,
    );
    resetInterviewInFlight();
    await recordRefusal(
      { projectId: PROJECT, kind: "not-now", setAsideFor: "another-question" },
      ledger,
    );

    const refusal = ledger.store.find((e) => e.type === "refusal");
    expect(refusal).toBeDefined();
    expect(setAsideReasons(ledger.store).get(refusal?.id ?? "")).toBe("another-question");

    const card = buildTranscript(ledger.store).find((e) => e.kind === "refusal");
    expect(card?.label).toBe("set aside");
    expect(card?.text).toBe(
      "You picked another question at the Process step, so Abductive set its own question aside.",
    );
    expect(card?.text).not.toContain("Not now");
  });
});

/* M89 (2026-10-14): a describe stood here that read Dialogue's `ask` callback as
 * source: that it closed the open question before it asked (`setAsideFor:
 * "another-question"` ahead of `await selectMove(`), that a question open
 * elsewhere was a redirection, and that the refusal carried a reason. The
 * callback went from Dialogue with the invitation from Checks, the one path that
 * still put an offered question (the menu left the page at M59). `selectMove`,
 * `recordRefusal` and the record above stay tested. */
