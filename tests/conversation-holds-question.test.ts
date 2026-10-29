/**
 * The conversation holds its open question while data is in the study
 * (M51, ISC-534).
 *
 * A co-author uploaded their transcripts before answering anything, and the
 * design conversation stopped asking them open questions. The cause is in the
 * prompt: `materialBlock` put every passage in front of the model on every turn,
 * so a turn at a step they had not answered could compose the answer out of their
 * own material instead of asking them for it. The owner's decision of 2026-09-26:
 * data can be added at any time, and until a step has a saved answer that step's
 * conversation asks its open question and does not answer from the material.
 *
 * The mechanism is omission rather than instruction, and the first half of this
 * file is why that is testable at all: a prompt that does not hold the passages
 * cannot answer from them, and a test can read the prompt and say so. An
 * instruction not to draw on material sitting in the context could only be
 * checked by reading what the model happened to write.
 *
 * The second half is the rendered step, because "the turn the tool actually
 * sends" is a claim about what the component computes rather than about what the
 * prompt function does with an argument.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MockInferenceClient } from "../src/inference/mock.ts";
import type { CompleteRequest } from "../src/inference/types.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import {
  conversationPrompt,
  HOLD_THE_QUESTION,
  type ConversationPromptInput,
} from "../src/interview/conversationPrompt.ts";
import { parseConversationTurn } from "../src/interview/conversation.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

const PASSAGE = "The charge nurse read the sheet aloud and nobody looked up.";

const base: ConversationPromptInput = {
  place: "context",
  placeLabel: "Context",
  purpose: "The setting as it stands, and what is going on in it.",
  stationQuestion: "What is going on in the setting you are looking at?",
  mode: "interrogation",
  opener: false,
  nothingWrittenYet: false,
  stepAnswered: true,
  chunks: [
    { id: "c1", projectId: "p", documentId: "d1", kind: "transcript", text: PASSAGE, index: 0 },
  ] as never,
  ontologySummary: "",
  here: [],
  earlier: [],
};

describe("the prompt at a step with data and no saved answer", () => {
  test("the passages are not in it, and nothing asks the model to cite one", () => {
    const prompt = conversationPrompt({ ...base, stepAnswered: false });
    expect(prompt).not.toContain(PASSAGE);
    expect(prompt).not.toContain("Material in context");
    expect(prompt).not.toContain("[[chunk:");
    // The rule that says what this turn is for, in the tool's own half.
    expect(prompt).toContain(HOLD_THE_QUESTION);
    // And the step's question is still what the turn is about.
    expect(prompt).toContain("What is going on in the setting you are looking at?");
  });

  test("the same study with the step answered gets its material back", () => {
    const prompt = conversationPrompt(base);
    expect(prompt).toContain(PASSAGE);
    expect(prompt).toContain("Material in context");
    expect(prompt).not.toContain(HOLD_THE_QUESTION);
  });

  test("the rule holds at the framing too, and holds in guidance mode", () => {
    const framing = conversationPrompt({
      ...base,
      place: "framing",
      stepAnswered: false,
    });
    expect(framing).not.toContain(PASSAGE);
    const guiding = conversationPrompt({ ...base, mode: "guidance", stepAnswered: false });
    expect(guiding).not.toContain(PASSAGE);
    expect(guiding).toContain(HOLD_THE_QUESTION);
  });

  test("Anti: an empty study without data is unchanged by the rule", () => {
    const withoutData = { ...base, chunks: [] as never };
    expect(conversationPrompt({ ...withoutData, stepAnswered: false })).toContain(
      HOLD_THE_QUESTION,
    );
    expect(conversationPrompt(withoutData)).not.toContain(HOLD_THE_QUESTION);
  });
});

// ---------------------------------------------------------------------------

/* The rendered step. Same shape as `m37-station-chat.test.ts`: the real
 * component over the real store, with the inference client swapped for one that
 * counts what it was sent. */

let live = true;
const requests: CompleteRequest[] = [];
class CountingClient extends MockInferenceClient {
  override complete(req: CompleteRequest) {
    requests.push(req);
    return super.complete(req);
  }
}
const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: new CountingClient(), live }),
}));
afterAll(() => {
  void mock.module(`${SRC}ui/personaRun.ts`, () => realPersonaRun);
});

const realPaperFit = { ...(await import(`${SRC}flow/usePaperFit.ts`)) };
await mock.module(`${SRC}flow/usePaperFit.ts`, () => ({
  ...realPaperFit,
  usePaperFit: () => async () => 0,
  useJudgeOnMount: () => undefined,
  openedCounts: () => new Map(),
}));
afterAll(() => {
  void mock.module(`${SRC}flow/usePaperFit.ts`, () => realPaperFit);
});

const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { Workbench } = await import(`${SRC}workbench/Workbench.tsx`);
const { resetConversationOpeners } = await import(`${SRC}workbench/Dialogue.tsx`);
const { resetInterviewInFlight } = await import(`${SRC}interview/orchestrator.ts`);
const projects = await import(`${SRC}state/projects.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);

async function seed(id: string, brief: Record<string, unknown>) {
  await projects.saveProject({
    id,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...projects.emptyBrief(), startingInterest: "handovers on the night ward", ...brief },
  } as never);
  await projects.saveDocument({
    id: `${id}-d1`,
    projectId: id,
    name: "interview-charge-nurse.txt",
    kind: "transcript",
    createdAt: 1,
    chunkCount: 1,
  } as never);
  await projects.saveChunks([
    {
      id: `${id}-c1`,
      projectId: id,
      documentId: `${id}-d1`,
      kind: "transcript",
      text: PASSAGE,
      index: 0,
    },
  ] as never);
}

function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined
    ? undefined
    : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
function focus(el: Element | null) {
  reactProps(el as Element)?.onFocus?.({});
}
function find<T extends Element>(host: Element, id: string): T | null {
  return host.querySelector(`[data-testid="${id}"]`) as T | null;
}
async function settle(times = 25) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
}

async function render(id: string, station = "context") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const store = new InMemoryLedgerStore();
  await act(async () => {
    root.render(
      React.createElement(
        StrictMode,
        null,
        React.createElement(
          LedgerProvider,
          { store },
          React.createElement(Workbench, { projectId: id, station }),
        ),
      ),
    );
  });
  return { host, root, store };
}

describe("the turn the step actually sends, with data uploaded first", () => {
  test("nothing saved at Context: the turn holds the question and carries no passage", async () => {
    live = true;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    await seed("m51-unanswered", {});
    const { host, root } = await render("m51-unanswered");
    await settle();
    focus(find(host, "answer-input"));
    await settle();

    const sent = requests.find((r) => (r.system ?? "").includes("Context"));
    expect(sent).toBeDefined();
    expect(sent?.system ?? "").toContain(HOLD_THE_QUESTION);
    expect(sent?.system ?? "").not.toContain(PASSAGE);
    root.unmount();
  });

  test("the reply is a question, and the record keeps it as one", async () => {
    live = true;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    await seed("m51-unanswered-shape", {});
    const { host, root, store } = await render("m51-unanswered-shape");
    await settle();
    focus(find(host, "answer-input"));
    await settle();

    /* The shape of the reply, which is the half a prompt test cannot make. The
     * turn ends on a question, the question is on the record as the tool's, and
     * the marked lines the model writes never reach the screen. */
    const record: readonly LedgerEvent[] = await store.readAll("m51-unanswered-shape");
    const asked = record.filter((e) => e.type === "question-selection");
    expect(asked.length).toBeGreaterThan(0);
    const spoken = record.filter((e) => e.type === "response");
    expect(spoken.length).toBeGreaterThan(0);
    const shown = (spoken[0] as { text: string }).text;
    expect(parseConversationTurn(shown).shown).not.toContain("QUESTION:");
    expect(shown).not.toContain(PASSAGE);
    root.unmount();
  });

  /* Early data is the one step a study can answer without typing (D5), and D12
   * settled what counts: passages of the researcher's own data, never a paper.
   * The rule reads `stationStated`, so uploading data answers that step and its
   * conversation may read the material, which is what the step is for. A second
   * definition of "answered" here is how the rail and the conversation would come
   * to disagree about the same step. */
  test("uploading data answers Early data, so its own conversation reads the material", async () => {
    live = true;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    /* M58: Early data waits outside the loops until each of the six loop steps
     * has an answer or was set aside, so the six are answered here first. */
    await seed("m51-early-data", {
      context: "Two wards of a teaching hospital, on nights.",
      processOfInterest: "The handover, from the spoken round to the typed sheet.",
      outcomeOfInterest: "Whether the next shift acts on what was handed over.",
      siteRationale: "I work on one of the wards.",
      puzzleAnswer: "Why does a complete sheet go unread?",
      bind: "Night nurses are caught between the sheet and the bedside.",
    });
    const { host, root } = await render("m51-early-data", "early-data");
    await settle();
    focus(find(host, "answer-input"));
    await settle();

    const sent = requests.find((r) => (r.system ?? "").includes("Early data"));
    expect(sent).toBeDefined();
    expect(sent?.system ?? "").toContain(PASSAGE);
    expect(sent?.system ?? "").not.toContain(HOLD_THE_QUESTION);
    root.unmount();
  });

  test("an answered Context sends the material, which is the other half of the rule", async () => {
    live = true;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    await seed("m51-answered", { context: "Two wards of a teaching hospital, on nights." });
    const { host, root } = await render("m51-answered");
    await settle();
    focus(find(host, "answer-input"));
    await settle();

    const sent = requests.find((r) => (r.system ?? "").includes("Context"));
    expect(sent).toBeDefined();
    expect(sent?.system ?? "").toContain(PASSAGE);
    expect(sent?.system ?? "").not.toContain(HOLD_THE_QUESTION);
    root.unmount();
  });
});
