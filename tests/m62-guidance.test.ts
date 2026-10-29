/**
 * M62, ISC-604 (the owner, 2026-09-30): the guidance turn ("Suggest topics",
 * once "Give me some directions") must never hand the researcher a shortcut to
 * an answer. Its rules now allow only narrower questions, distinctions to
 * consider and examples of what an answer might attend to, never a candidate
 * answer, a draft sentence or a summary. The control reads "Ask me
 * differently". A detector reads the reply, as the interrogation guarantee's
 * does, and a turn that states an answer is recorded with the leak marked. The
 * turn is recorded as it always was.
 */
import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, mock, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MockInferenceClient } from "../src/inference/mock.ts";
import type { CompleteRequest, CompleteResult } from "../src/inference/types.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { CONVERSATION_MARKER } from "../src/inference/promptMarkers.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

let reply = "";
const requests: CompleteRequest[] = [];
class ScriptedClient extends MockInferenceClient {
  override async complete(req: CompleteRequest): Promise<CompleteResult> {
    requests.push(req);
    const text = req.system.includes(CONVERSATION_MARKER) ? reply : "NONE: nothing yet.";
    return { text, model: "scripted", modelVersion: "scripted-1" } as CompleteResult;
  }
}
const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: new ScriptedClient(), live: true }),
}));
afterAll(() => void mock.module(`${SRC}ui/personaRun.ts`, () => realPersonaRun));
const realPaperFit = { ...(await import(`${SRC}flow/usePaperFit.ts`)) };
await mock.module(`${SRC}flow/usePaperFit.ts`, () => ({
  ...realPaperFit,
  usePaperFit: () => async () => 0,
  useJudgeOnMount: () => undefined,
  openedCounts: () => new Map(),
}));
afterAll(() => void mock.module(`${SRC}flow/usePaperFit.ts`, () => realPaperFit));

const { GUIDANCE_ALWAYS, guidanceAnswerViolations } = await import(`${SRC}interview/prompt.ts`);
const { conversationPrompt } = await import(`${SRC}interview/conversationPrompt.ts`);
const { MotivationPage } = await import(`${SRC}flow/FramingBand.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { resetConversationOpeners } = await import(`${SRC}workbench/Dialogue.tsx`);
const { resetInterviewInFlight } = await import(`${SRC}interview/orchestrator.ts`);
const projects = await import(`${SRC}state/projects.ts`);

const base = {
  place: "context",
  placeLabel: "Context",
  purpose: "The world your project is set in.",
  stationQuestion: "What is going on in this setting?",
  mode: "guidance" as const,
  opener: false,
  nothingWrittenYet: false,
  stepAnswered: true,
  chunks: [],
  ontologySummary: "",
  here: [],
  earlier: [],
};

describe("the guidance rules allow only a different question", () => {
  test("narrower questions, distinctions and what an answer might attend to; never an answer, a draft or a summary", () => {
    const rules = GUIDANCE_ALWAYS.join("\n");
    expect(rules).toContain("offer only a narrower question, a distinction that they might consider, or examples of what an answer might attend to");
    expect(rules).toContain("Do not give a candidate answer, a draft sentence that they could adopt, or a summary of what they have said.");
    expect(rules).not.toMatch(/propose|proposal|construction/i);
  });

  test("the guidance turn's prompt carries them, and the old proposal rule is gone", () => {
    const prompt: string = conversationPrompt(base);
    expect(prompt).toContain("## Turn rules: guidance");
    for (const line of GUIDANCE_ALWAYS) expect(prompt).toContain(line);
    expect(prompt).not.toContain("concrete construction");
  });

  test("the offered guidance moves carry the same rules", async () => {
    const src = await Bun.file(`${SRC}interview/prompt.ts`).text();
    expect(src).toMatch(/const GUIDANCE_RULES = \[\n  GUIDANCE_HEAD,\n  \.\.\.GUIDANCE_ALWAYS,/);
  });
});

describe("the detector reads the reply", () => {
  const leaks = [
    "Your answer could be that the corridor is where trust lives.",
    'You might write something like: "I study how nurses hand over in corridors."',
    "In summary, you're looking at corridor handovers and trust.",
    "Here's a draft: corridor handovers carry what the sheet drops.",
    "One answer is that the charge nurse decides.",
    "Your puzzle is that the sheet is trusted less than the corridor.",
  ];
  for (const text of leaks) {
    test(`flags: ${text.slice(0, 48)}`, () => {
      expect(guidanceAnswerViolations(text).length).toBeGreaterThan(0);
    });
  }

  const fine = [
    "Could you narrow it to one shift you watched? An answer might name who was there, what was said, and what the sheet left out.",
    "There's a difference between what the nurses trust and what the ward records. Which of the two are you looking at?",
    "Think of one handover you saw last week. Who spoke first?",
  ];
  for (const text of fine) {
    test(`passes: ${text.slice(0, 48)}`, () => {
      expect(guidanceAnswerViolations(text)).toEqual([]);
    });
  }
});

describe("Ask me differently, on the page", () => {
  test("the control is named for the act, and a leaking reply is recorded with its leak", async () => {
    resetConversationOpeners();
    resetInterviewInFlight();
    const id = "m62-guide";
    await projects.saveProject({ id, title: "night wards", stage: "design-brief", createdAt: 1, brief: projects.emptyBrief() } as never);
    const store = new InMemoryLedgerStore();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        React.createElement(LedgerProvider, {
          store,
          children: React.createElement(MotivationPage, { project: await projects.getProject(id), onChanged: () => undefined }),
        }),
      );
    });
    for (let i = 0; i < 10; i += 1) await act(async () => void (await wait(5)));
    const button = host.querySelector('[data-testid="give-directions"]') as HTMLButtonElement;
    expect(button.textContent).toBe("Ask me differently");
    reply = [
      "Your answer could be that the corridor is where trust lives. Which shift did you watch?",
      "",
      "QUESTION: Which shift did you watch?",
      "BECAUSE: One shift is easier to describe than all of them.",
    ].join("\n");
    requests.length = 0;
    const key = Object.keys(button).find((k) => k.startsWith("__reactProps$"))!;
    await act(async () => (button as unknown as Record<string, { onClick: () => void }>)[key]!.onClick());
    for (let i = 0; i < 25; i += 1) await act(async () => void (await wait(5)));
    const turn = requests.find((r) => r.system.includes(CONVERSATION_MARKER))!;
    expect(turn.system).toContain("## Turn rules: guidance");
    const events: readonly LedgerEvent[] = await store.readAll();
    const selection = events.find((e) => e.type === "question-selection");
    expect(selection?.type === "question-selection" && selection.mode).toBe("guidance");
    const said = events.find((e) => e.type === "response" && e.actor !== "human");
    expect(said?.type === "response" && (said.answerLeaks ?? []).length).toBeGreaterThan(0);
    root.unmount();
    host.remove();
  });
});
