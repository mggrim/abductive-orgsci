/**
 * M62, ISC-599: the Starting point conversation reaches all three summaries.
 *
 * Until M62 the framing turn was steered to the interest only (FRAMING_HOLD_OFF:
 * ask what they plan to look at and what draws them to it), so a Summarise after any
 * conversation left the literatures and the journal as marked gaps. Now, once
 * the researcher has said what they are looking at, Abductive asks, one at a
 * time, which literatures they expect to draw on and where they want the project
 * to land, and the turn's instructions mark each part covered so it does not
 * re-ask. The hold-off on "what you expected and found" stays.
 *
 * Which part a question was about is read back from the record by replaying it
 * (`framingCoverage`): a question put while a part was first uncovered is about
 * that part, a reply or a decline to it covers the part, a saved answer covers
 * its part, and a reply nobody asked for covers the interest only. The same
 * replay marks each reply for the Summarise prompt, so the model reads which
 * question each reply answered.
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
import { CONVERSATION_MARKER, DRAFT_MARKER } from "../src/inference/promptMarkers.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

/**
 * A model that does what the prompts ask, and nothing a test has to trust: a
 * conversation turn asks about the part the prompt names, and a draft takes each
 * part from the reply marked as answering that part's question, leaving the gap
 * where no reply is marked. Every request is kept.
 */
const requests: CompleteRequest[] = [];
class FollowingClient extends MockInferenceClient {
  override async complete(req: CompleteRequest): Promise<CompleteResult> {
    requests.push(req);
    return { text: followPrompt(req.system), model: "following", modelVersion: "following-1" } as CompleteResult;
  }
}
function followPrompt(system: string): string {
  if (system.includes(DRAFT_MARKER)) {
    const labels = /in this order: ([A-Z:, ]+)/.exec(system)?.[1]?.split(",").map((l) => l.replace(":", "").trim()) ?? [];
    return labels
      .map((label) => {
        const reply = new RegExp(`\\(reply to the ${label} question\\) (.+)`).exec(system)?.[1];
        return `${label}: ${reply ?? "[...]"}`;
      })
      .join("\n");
  }
  if (system.includes(CONVERSATION_MARKER)) {
    const q = /Ask about this part now: [^.]+\. Its question: (.+)/.exec(system)?.[1] ?? "What struck you?";
    return `Thanks.\n\n${q}\n\nQUESTION: ${q}\nBECAUSE: The next part of your starting point.`;
  }
  return "NONE: nothing yet.";
}
const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: new FollowingClient(), live: true }),
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

const { framingCoverage } = await import(`${SRC}interview/conversation.ts`);
const { conversationPrompt } = await import(`${SRC}interview/conversationPrompt.ts`);
const { FRAMING_PROBES } = await import(`${SRC}interview/stationProbes.ts`);
const { MotivationPage, FRAMING_QUESTION } = await import(`${SRC}flow/FramingBand.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { resetConversationOpeners } = await import(`${SRC}workbench/Dialogue.tsx`);
const { resetInterviewInFlight } = await import(`${SRC}interview/orchestrator.ts`);
const projects = await import(`${SRC}state/projects.ts`);

let clock = 1_700_000_000_000;
const tick = () => (clock += 10);

/** A question Abductive put at Starting point, and the reply the researcher gave. */
function exchange(projectId: string, question: string, reply?: string): LedgerEvent[] {
  const sel = crypto.randomUUID();
  const out: LedgerEvent[] = [
    {
      id: sel,
      ts: tick(),
      actor: "system",
      projectId,
      type: "question-selection",
      moveId: `conversation:framing@${clock}`,
      topic: "framing",
      question,
      alternatives: [],
      mode: "interrogation",
      station: "framing",
      reason: "The next part of your starting point.",
    } as LedgerEvent,
    {
      id: crypto.randomUUID(),
      ts: tick(),
      actor: "persona:interviewer",
      projectId,
      model: "following",
      modelVersion: "following-1",
      type: "response",
      text: question,
      inReplyTo: sel,
    } as LedgerEvent,
  ];
  if (reply !== undefined) {
    out.push({
      id: crypto.randomUUID(),
      ts: tick(),
      actor: "human",
      projectId,
      type: "response",
      text: reply,
      inReplyTo: sel,
    } as LedgerEvent);
  }
  return out;
}

const INTEREST = "Night-shift nurses hand patients over in the corridor, not on the sheet.";
const LITERATURES = "Sensemaking, and the literature on coordination in hospitals.";
const JOURNAL = "Organization Science.";

describe("the replay reads which part each question was about", () => {
  test("a reply to the opener covers the interest, and the literatures come next", () => {
    const events = exchange("p", "What are you looking at?", INTEREST);
    const c = framingCoverage(events, "p", {});
    expect(c.covered).toEqual({ startingInterest: true, seminalCorpus: false, targetVenue: false });
    expect(c.next).toBe("seminalCorpus");
  });

  test("three exchanges cover the three, in order, and mark each reply with its part", () => {
    const events = [
      ...exchange("p", "What are you looking at?", INTEREST),
      ...exchange("p", "Which literatures?", LITERATURES),
      ...exchange("p", "Where should it land?", JOURNAL),
    ];
    const c = framingCoverage(events, "p", {});
    expect(c.next).toBeNull();
    const human = events.filter((e) => e.actor === "human");
    expect(human.map((e) => c.answered.get(e.id))).toEqual(["startingInterest", "seminalCorpus", "targetVenue"]);
  });

  test("a question nobody has replied to leaves its part open, and a decline covers it", () => {
    const open = [...exchange("p", "What are you looking at?", INTEREST), ...exchange("p", "Which literatures?")];
    expect(framingCoverage(open, "p", {}).next).toBe("seminalCorpus");
    const sel = open[3]!;
    const declined = [
      ...open,
      { id: "r", ts: tick(), actor: "human", projectId: "p", type: "refusal", questionEventId: sel.id, kind: "not-now" } as LedgerEvent,
    ];
    expect(framingCoverage(declined, "p", {}).next).toBe("targetVenue");
  });

  test("a reply that leaves a part up in the air covers it and marks it open", () => {
    const events = [
      ...exchange("p", "What are you looking at?", INTEREST),
      ...exchange("p", FRAMING_PROBES.seminalCorpus, "Honestly, that's still up in the air."),
    ];
    const c = framingCoverage(events, "p", {});
    expect(c.covered.seminalCorpus).toBe(true);
    expect([...c.open]).toEqual(["seminalCorpus"]);
    expect(c.next).toBe("targetVenue");
    for (const reply of ["I'm still working that out.", "Not sure yet.", "I haven't decided."]) {
      const e = [...exchange("p", "What are you looking at?", INTEREST), ...exchange("p", FRAMING_PROBES.seminalCorpus, reply)];
      expect({ reply, open: framingCoverage(e, "p", {}).open.has("seminalCorpus") }).toEqual({ reply, open: true });
    }
    const settled = [...exchange("p", "What are you looking at?", INTEREST), ...exchange("p", FRAMING_PROBES.seminalCorpus, LITERATURES)];
    expect(framingCoverage(settled, "p", {}).open.size).toBe(0);
  });

  test("a researcher's decline also leaves the part open; a saved answer settles it", () => {
    const open = [...exchange("p", "What are you looking at?", INTEREST), ...exchange("p", "Which literatures?")];
    const sel = open[3]!;
    const declined = [
      ...open,
      { id: "r", ts: tick(), actor: "human", projectId: "p", type: "refusal", questionEventId: sel.id, kind: "dont-know" } as LedgerEvent,
    ];
    expect(framingCoverage(declined, "p", {}).open.has("seminalCorpus")).toBe(true);
    const saved = [
      ...declined,
      { id: "b", ts: tick(), actor: "human", projectId: "p", type: "bound", subject: "papers", statement: "Weick 1995" } as LedgerEvent,
    ];
    expect(framingCoverage(saved, "p", {}).open.has("seminalCorpus")).toBe(false);
  });

  test("a saved or typed answer covers its part; a gap does not", () => {
    const events = exchange("p", "What are you looking at?", INTEREST);
    expect(framingCoverage(events, "p", { seminalCorpus: "Weick 1995" }).next).toBe("targetVenue");
    expect(framingCoverage(events, "p", { seminalCorpus: "[...]" }).next).toBe("seminalCorpus");
  });

  test("a reply nobody asked for covers the interest and nothing else", () => {
    const said: LedgerEvent[] = [
      { id: "h1", ts: tick(), actor: "human", projectId: "p", type: "response", text: INTEREST, station: "framing" } as LedgerEvent,
      { id: "h2", ts: tick(), actor: "human", projectId: "p", type: "response", text: JOURNAL, station: "framing" } as LedgerEvent,
    ];
    const c = framingCoverage(said, "p", {});
    expect(c.answered.get("h1")).toBe("startingInterest");
    expect(c.answered.has("h2")).toBe(false);
    expect(c.next).toBe("seminalCorpus");
  });

  test("another project's turns and another place's turns are not read", () => {
    const events = [
      ...exchange("q", "What are you looking at?", INTEREST),
      { id: "s", ts: tick(), actor: "human", projectId: "p", type: "response", text: INTEREST, station: "context" } as LedgerEvent,
    ];
    expect(framingCoverage(events, "p", {}).next).toBe("startingInterest");
  });
});

describe("the framing turn's instructions name the part to ask about", () => {
  const base = {
    place: "framing",
    placeLabel: "your starting point",
    purpose: "The setting.",
    stationQuestion: FRAMING_QUESTION.seminalCorpus,
    mode: "interrogation" as const,
    opener: false,
    nothingWrittenYet: false,
    stepAnswered: true,
    chunks: [],
    ontologySummary: "",
    here: [],
    earlier: [],
  };

  test("interest said: the turn asks about the literatures, marks the interest covered, keeps the hold-off", () => {
    const prompt: string = conversationPrompt({
      ...base,
      framing: { covered: { startingInterest: true, seminalCorpus: false, targetVenue: false }, next: "seminalCorpus" },
    });
    expect(prompt).toContain(`Ask about this part now: the literatures. Its question: ${FRAMING_PROBES.seminalCorpus}`);
    expect(prompt).toMatch(/The interest: covered/);
    expect(prompt).toMatch(/The literatures: not covered yet/);
    expect(prompt).toMatch(/The target journal: not covered yet/);
    expect(prompt).toContain("don't ask again about a part marked covered.");
    expect(prompt).toContain("Do not ask what they expect to find, and what the papers would lead them to expect instead");
  });

  test("all three covered: the turn follows the researcher and asks none of the three again", () => {
    const prompt: string = conversationPrompt({
      ...base,
      framing: { covered: { startingInterest: true, seminalCorpus: true, targetVenue: true }, next: null },
    });
    expect(prompt).not.toContain("Ask about this part now");
    expect(prompt).toContain("The conversation has covered all three parts.");
  });

  test("a step's turn carries no framing block", () => {
    const prompt: string = conversationPrompt({ ...base, place: "context", placeLabel: "Context" });
    expect(prompt).not.toContain("## The three parts of a starting point");
  });

  /* The owner's amendment (2026-09-30): the two later probes in his own words,
   * left open so "not yet" is an answer. The interest keeps the page's question. */
  test("the probes: the page's interest question, then the owner's two, word for word", () => {
    // M92, ISC-747: the chat asks the interest facing forward, in other words than the box.
    expect(FRAMING_PROBES.startingInterest).toBe("What do you want your research to explore, and what draws you to that inquiry?");
    expect(FRAMING_PROBES.startingInterest).not.toBe(FRAMING_QUESTION.startingInterest);
    expect(FRAMING_PROBES.seminalCorpus).toBe(
      "Have you thought about which literatures might be relevant to your exploration, or is that still up in the air?",
    );
    expect(FRAMING_PROBES.targetVenue).toBe(
      "Have you thought about where you want this project to land, in terms of particular journals, or are you still working that out?",
    );
    // The page's help lines are unchanged.
    expect(FRAMING_QUESTION.seminalCorpus).toBe("Which literatures might be relevant to your exploration?");
    expect(FRAMING_QUESTION.targetVenue).toBe("Where do you want this project to land?");
  });

  test("an open part is marked covered and open, and the next turn moves on", () => {
    const prompt: string = conversationPrompt({
      ...base,
      framing: {
        covered: { startingInterest: true, seminalCorpus: true, targetVenue: false },
        open: new Set(["seminalCorpus"]),
        next: "targetVenue",
      },
    });
    expect(prompt).toMatch(/The literatures: covered, still open by their own account/);
    expect(prompt).toContain(`Ask about this part now: the target journal. Its question: ${FRAMING_PROBES.targetVenue}`);
    expect(prompt).toContain("Ask it in these words, or as close to them as the conversation allows.");
  });
});

async function mount(id: string, events: readonly LedgerEvent[]) {
  await projects.saveProject({ id, title: "night wards", stage: "design-brief", createdAt: 1, brief: projects.emptyBrief() } as never);
  const store = new InMemoryLedgerStore();
  for (const e of events) await store.append(e);
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
  return { host, root, store };
}

type Props = { onClick?: (e: unknown) => void; onChange?: (e: unknown) => void };
function reactProps(el: Element | null): Props {
  const key = Object.keys(el ?? {}).find((k) => k.startsWith("__reactProps$"))!;
  return (el as unknown as Record<string, Props>)[key]!;
}
/* M92, ISC-752: one Auto-generate summary from chat per summary. */
async function generateAll(host: Element) {
  for (const prefix of ["framing-interest", "framing-literatures", "framing-journal"]) {
    await press(host.querySelector(`[data-testid="${prefix}-generate"]`));
  }
}

async function press(el: Element | null) {
  await act(async () => {
    reactProps(el).onClick?.({ preventDefault() {} });
  });
  for (let i = 0; i < 25; i += 1) await act(async () => void (await wait(5)));
}

describe("Summarise after the conversation", () => {
  test("a part left up in the air is a marked gap with the unsettled note, whatever the model returns", async () => {
    resetConversationOpeners();
    resetInterviewInFlight();
    const id = "m62-open-literatures";
    const { host, root, store } = await mount(id, [
      ...exchange(id, "What are you looking at?", INTEREST),
      ...exchange(id, FRAMING_PROBES.seminalCorpus, "That's still up in the air."),
      ...exchange(id, FRAMING_PROBES.targetVenue, JOURNAL),
    ]);
    requests.length = 0;
    await generateAll(host);
    const field = (tid: string) => (host.querySelector(`[data-testid="${tid}-text"]`) as HTMLElement).textContent;
    expect(field("framing-starting-interest")).toBe(INTEREST);
    expect(field("framing-venue")).toBe(JOURNAL);
    // The model was handed the reply, marked; the gap is the tool's, not the model's.
    expect(field("framing-seminal-corpus")).toBe("[...]");
    const draft = requests.filter((r) => r.system.includes(DRAFT_MARKER)).map((r) => r.system).join("\n");
    expect(draft).toContain("still open by their own account");
    expect(host.querySelector('[data-testid="framing-draft-unsettled-seminalCorpus"]')?.textContent).toBe(
      "You said the literatures are still up in the air, so Auto-generate summary from chat leaves the field for you to fill.",
    );
    expect(host.querySelector('[data-testid="framing-draft-gap-seminalCorpus"]')).toBeNull();
    const recorded = (await store.readAll()).find(
      (e: LedgerEvent) => e.type === "brief-draft" && e.field === "seminalCorpus",
    );
    expect(recorded?.type === "brief-draft" && recorded.text).toBe("[...]");
    root.unmount();
    host.remove();
  });

  test("a conversation that covered all three fills all three, with no marked gap", async () => {
    resetConversationOpeners();
    resetInterviewInFlight();
    const id = "m62-all-three";
    const { host, root } = await mount(id, [
      ...exchange(id, "What are you looking at?", INTEREST),
      ...exchange(id, "Which literatures do you expect to draw on?", LITERATURES),
      ...exchange(id, "Where do you want this project to land?", JOURNAL),
    ]);
    requests.length = 0;
    await generateAll(host);
    const field = (tid: string) => (host.querySelector(`[data-testid="${tid}-text"]`) as HTMLElement).textContent;
    expect(field("framing-starting-interest")).toBe(INTEREST);
    expect(field("framing-seminal-corpus")).toBe(LITERATURES);
    expect(field("framing-venue")).toBe(JOURNAL);
    expect(host.querySelectorAll('[data-testid^="framing-draft-gap"]')).toHaveLength(0);
    // The draft prompt read which question each reply answered.
    const draft = requests.filter((r) => r.system.includes(DRAFT_MARKER)).map((r) => r.system).join("\n");
    expect(draft).toContain(`(reply to the PAPERS question) ${LITERATURES}`);
    root.unmount();
    host.remove();
  });

  test("a conversation that covered the interest only leaves two gaps, and the next turn asks about literatures", async () => {
    resetConversationOpeners();
    resetInterviewInFlight();
    const id = "m62-interest-only";
    const events = exchange(id, "What are you looking at?", INTEREST);
    const { host, root } = await mount(id, events);
    requests.length = 0;
    await generateAll(host);
    expect(host.querySelector('[data-testid="framing-draft-gap-seminalCorpus"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="framing-draft-gap-targetVenue"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="framing-draft-gap"]')).toBeNull();
    root.unmount();
    host.remove();

    /* The next turn. The researcher's reply is on the record and the tool's turn
     * that follows it reads the replay, so it is put to the model with the
     * literatures as the part to ask about. */
    resetConversationOpeners();
    resetInterviewInFlight();
    const id2 = "m62-next-turn";
    const opener = exchange(id2, "What are you looking at?");
    const second = await mount(id2, opener);
    const box = second.host.querySelector('[data-testid="motivation-page"] [data-testid="answer-input"]') as HTMLTextAreaElement;
    await act(async () => {
      box.value = INTEREST;
      reactProps(box).onChange?.({ target: box });
    });
    requests.length = 0;
    await press(second.host.querySelector('[data-testid="motivation-page"] [data-testid="send-answer"]'));
    const turn = requests.find((r) => r.system.includes(CONVERSATION_MARKER));
    expect(turn?.system ?? "").toContain("Ask about this part now: the literatures.");
    const recorded = (await second.store.readAll()).filter((e: LedgerEvent) => e.type === "question-selection");
    expect(recorded.at(-1)?.type === "question-selection" && recorded.at(-1)?.question).toBe(FRAMING_PROBES.seminalCorpus);
    second.root.unmount();
    second.host.remove();
  });
});
