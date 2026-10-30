/**
 * M95: the help chat (ISC-771 .. ISC-781).
 *
 * The owner, 2026-10-30: a help chat that knows "both the details about the
 * tool but also anything about the user and their current project", so that
 * its help is actionable. His four answers the same day: build it now, read the
 * project plus an optional About you card, coach rather than write, and record
 * help as its own events in History.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { validateEvent, type HelpAnsweredEvent, type HelpAskedEvent, type LedgerEvent, type ResponseEvent } from "../src/ledger/events.ts";
import { replay, InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { emptyBrief, type Project } from "../src/state/projects.ts";
import { AUTO_SUMMARY_HELP, HELP_PAGES, PAGE_HELP } from "../src/ui/pageHelp.ts";
import { MAX_REWRITES, reviseInVoice, voiceBreaks } from "../src/inference/voiceRetry.ts";
import { RULE_TEXT } from "../src/copy/rules.ts";
import { MODEL_VOICE_RULES } from "../src/inference/promptMarkers.ts";
import { STATIONS } from "../src/flow/stations.ts";
import { STAGE_LINE } from "../src/ui/stageLine.ts";
import { WALKTHROUGH_TITLES } from "../src/ui/Walkthrough.tsx";
import {
  HELP_ACTOR,
  HELP_EXCHANGES,
  HELP_HISTORY_LINES,
  HELP_REWRITE_ASKS,
  helpExchanges,
  helpMessages,
  helpSystemPrompt,
  STUCK_REQUEST,
  toolGuide,
} from "../src/help/helpPrompt.ts";
import {
  ABOUT_YOU_KEY,
  aboutSnapshot,
  aboutYouFilled,
  cleanAboutYou,
  readAboutYou,
  resetAboutYouForTests,
  writeAboutYou,
} from "../src/help/aboutYou.ts";
import { kindLabel, kindMark, projectLedger } from "../src/workbench/Instrumentation.tsx";
import { buildTranscript } from "../src/workbench/Dialogue.tsx";
import { chatTurnsAt, unsurfacedTurns } from "../src/concepts/chat.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { studyContext, renderStudyContext } from "../src/interview/studyContext.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { HelpChat, HELP_OFFLINE_LINE, HELP_OUTSIDE_PROJECT_LINE, STUCK_WORDS } from "../src/ui/HelpChat.tsx";
import { HelpControl } from "../src/ui/HelpControl.tsx";
import type { CompleteRequest, CompleteResult, InferenceClient, StreamDelta } from "../src/inference/types.ts";

const P = "p-m95";
let n = 0;
const uid = () => `95959595-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`;
let t = 1_000_000;
const ai = { model: "claude-sonnet-5-5", modelVersion: "2026-10-01" };

const project: Project = {
  id: P,
  title: "TEST M95 help chat",
  stage: "design-brief",
  createdAt: 1,
  brief: { ...emptyBrief(), startingInterest: "How junior auditors learn judgement after automation", context: "Two mid-size audit firms" },
};

function asked(over: Partial<HelpAskedEvent> = {}): HelpAskedEvent {
  return { id: uid(), ts: (t += 10), actor: "human", projectId: P, type: "help-asked", page: "design", station: "process", text: "Which step should I do next?", ...over };
}
function answered(askedId: string, over: Partial<HelpAnsweredEvent> = {}): HelpAnsweredEvent {
  return { id: uid(), ts: (t += 10), actor: HELP_ACTOR, projectId: P, type: "help-answered", asked: askedId, text: "Go to Process and say which period you follow.", ...ai, ...over };
}
function reply(text: string): ResponseEvent {
  return { id: uid(), ts: (t += 10), actor: "human", projectId: P, type: "response", text, station: "context" };
}

describe("the events (ISC-774, ISC-775)", () => {
  test("a request and an answer validate, and replay counts them", () => {
    const a = asked({ stuck: true, text: STUCK_WORDS, about: { stage: "Postdoc", field: "sociology" } });
    const b = answered(a.id, { provider: "claude", answerLeaks: ["you could write"] });
    expect(validateEvent(a)).toEqual([]);
    expect(validateEvent(b)).toEqual([]);
    const state = replay([a, b]);
    expect(state.countsByType["help-asked"]).toBe(1);
    expect(state.countsByType["help-answered"]).toBe(1);
  });

  test("the validator turns down a bad request and a bad answer", () => {
    const base = asked();
    expect(validateEvent({ ...base, actor: "system" }).join()).toContain("researcher");
    expect(validateEvent({ ...base, text: "" }).join()).toContain("help-asked.text");
    expect(validateEvent({ ...base, page: "" }).join()).toContain("help-asked.page");
    expect(validateEvent({ ...base, stuck: false }).join()).toContain("stuck");
    expect(validateEvent({ ...base, about: {} }).join()).toContain("absent rather than empty");
    expect(validateEvent({ ...base, about: { mood: "tired" } }).join()).toContain("not a profile field");
    const ans = answered(base.id);
    expect(validateEvent({ ...ans, actor: "human" }).join()).toContain("Abductive's answer");
    expect(validateEvent({ ...ans, model: undefined }).join()).toContain("model");
    expect(validateEvent({ ...ans, asked: "" }).join()).toContain("help-answered.asked");
    expect(validateEvent({ ...ans, cutShort: false }).join()).toContain("cutShort");
    expect(validateEvent({ ...ans, answerLeaks: [""] }).join()).toContain("answerLeaks");
  });
});

describe("History reads help in plain words (ISC-778)", () => {
  test("a question, a press of I'm stuck and an answer each read as a sentence naming who acted", () => {
    const { station: _drop, ...noStep } = asked({ text: "Where do I add my interviews?", page: "material" });
    const q: HelpAskedEvent = noStep;
    const s = asked({ stuck: true, text: STUCK_WORDS });
    const a = answered(q.id);
    const cut = answered(s.id, { cutShort: true, text: "Start at Process." });
    const rows = projectLedger([q, s, a, cut]);
    expect(rows[0]!.happened).toBe("You asked for help on Sources: Where do I add my interviews?");
    expect(rows[1]!.happened).toBe("You pressed I'm stuck on Design, at Process");
    expect(rows[2]!.happened).toBe("Abductive answered your help request: Go to Process and say which period you follow.");
    expect(rows[2]!.who).toBe("Abductive");
    expect(rows[3]!.happened).toContain("You stopped Abductive partway through the answer to your help request");
    expect(rows.map((r) => r.family)).toEqual(["conversation", "conversation", "conversation", "conversation"]);
    /* Placed by the request's own step, never by the question open at the time. */
    expect(rows.map((r) => r.station)).toEqual([undefined, "process", undefined, "process"]);
    expect(kindMark("help-asked")).toBe("HLQ");
    expect(kindMark("help-answered")).toBe("HLA");
    expect(kindLabel("help-asked")).toBe("a help request that you made");
  });
});

describe("help is a side channel: the interview reads none of it (ISC-777)", () => {
  const base: LedgerEvent[] = [reply("The firms moved sampling to software in 2023.")];
  const q = asked({ text: "My answer at Context is The firms moved sampling to software." });
  const withHelp: LedgerEvent[] = [...base, q, answered(q.id)];

  test("the chat's transcript and the surfacing's turns are the same with and without help", () => {
    expect(buildTranscript(withHelp)).toEqual(buildTranscript(base));
    for (const place of ["context", "process", "framing"]) {
      expect(chatTurnsAt(withHelp, P, place)).toEqual(chatTurnsAt(base, P, place));
      expect(unsurfacedTurns(withHelp, P, place)).toEqual(unsurfacedTurns(base, P, place));
    }
  });

  test("the ontology, the concepts and the study context are the same", () => {
    const g1 = projectOntology(base, P);
    const g2 = projectOntology(withHelp, P);
    expect([...g2.pages.keys()]).toEqual([...g1.pages.keys()]);
    expect(projectConcepts(withHelp, P, g2).accepted).toEqual(projectConcepts(base, P, g1).accepted);
    expect(renderStudyContext(studyContext(project.brief, g2))).toBe(renderStudyContext(studyContext(project.brief, g1)));
  });

  /* The design stamp fingerprints every event id, help included, so that it
     matches an export of the full History; the Report's body leaves help out. */
  test("the Report leaves help out, apart from the stamp over every event", () => {
    const at = () => 5_000_000;
    const g = projectOntology(withHelp, P);
    const withMemo = buildOntologyMemo({ project, graph: g, events: withHelp, now: at });
    const withoutMemo = buildOntologyMemo({ project, graph: projectOntology(base, P), events: base, now: at });
    const body = (memo: string) => memo.split("\n").filter((l) => !l.startsWith("_Design stamp")).join("\n");
    expect(body(withMemo)).toBe(body(withoutMemo));
    expect(body(withMemo)).not.toContain("say which period you follow");
  });
});

describe("the prompt (ISC-776, ISC-779, ISC-780)", () => {
  test("the rules say coach, don't write, and keep the answer short", () => {
    const sys = helpSystemPrompt({ page: "design", station: "context" });
    expect(sys).toContain("Coach them; the writing is theirs.");
    expect(sys).toContain("Do not write their answers, their puzzle, their concepts, their relations");
    expect(sys).toContain("do not suggest wording");
    expect(sys).toContain("Do not say that you changed, saved or accepted anything.");
    expect(sys).toContain("under 150 words");
    expect(sys).toContain("Ask at most one question back.");
  });

  /* M95b: the page they're on in full, every other page as one line. */
  test("the guide carries the current page in full, word for word, and every other page as its title and first purpose sentence", () => {
    for (const page of HELP_PAGES) {
      const guide = toolGuide(page);
      const here = PAGE_HELP[page];
      for (const p of here.purpose) expect(guide).toContain(p);
      for (const part of here.parts) for (const s of part.says) expect(guide).toContain(s);
      for (const other of HELP_PAGES.filter((p) => p !== page)) {
        const help = PAGE_HELP[other];
        expect(guide).toContain(`- ${help.title}: ${help.purpose[0]}`);
        for (const p of help.purpose.slice(1)) if (!here.purpose.includes(p)) expect(guide).not.toContain(p);
        for (const part of help.parts) {
          if (here.parts.some((h) => h.name === part.name)) continue;
          for (const s of part.says) if (!here.parts.some((h) => h.says.includes(s))) expect(guide).not.toContain(s);
        }
      }
      for (const s of STATIONS) {
        expect(guide).toContain(page === "design" ? `- ${s.label}: ${s.blurb} ${s.feeds}` : `- ${s.label}: ${s.blurb}`);
      }
      for (const title of WALKTHROUGH_TITLES) expect(guide).toContain(title);
    }
    expect(toolGuide("design")).toContain(STAGE_LINE);
  });

  /* M95's prompt on Design, in the walk, was 31,788 characters. The Emerging
     project ontology page's own Help panel is the longest, at about 10,400. */
  test("the trimmed prompt stays under 15,000 characters on Design and 22,000 on every page", () => {
    expect(helpSystemPrompt({ page: "design", station: "process", project: { project, events: [] } }).length).toBeLessThan(15_000);
    for (const page of HELP_PAGES) expect(helpSystemPrompt({ page, project: { project, events: [] } }).length).toBeLessThan(22_000);
  });

  test("the prompt describes Auto-generate summary in the app's words and asks for paragraphs without lists", () => {
    const sys = helpSystemPrompt({ page: "design", station: "process" });
    expect(sys).toContain(AUTO_SUMMARY_HELP);
    expect(sys).toContain("do not say that Abductive keeps their chat words exactly as they wrote them");
    expect(sys).toContain("Do not use bullet points, numbered lists, headings or bold");
    expect(sys).not.toContain("bullet points when they ask");
  });

  test("History in the prompt stops at eight lines", () => {
    const many: LedgerEvent[] = Array.from({ length: 20 }, (_, i) => reply(`reply number ${i}`));
    const sys = helpSystemPrompt({ page: "design", project: { project, events: many } });
    const lines = sys.split("Their latest History, oldest first, in the app's words:")[1]!.split("\n").filter((l) => l.startsWith("- They: ") || l.startsWith("- Abductive: "));
    expect(HELP_HISTORY_LINES).toBe(8);
    expect(lines.length).toBe(8);
    expect(sys).toContain("reply number 19");
    expect(sys).not.toContain("reply number 11");
  });

  test("the help chat asks the model for one rewrite, and the step chat keeps two", async () => {
    let asks = 0;
    const stubborn: InferenceClient = {
      async complete() {
        asks += 1;
        return { text: "1. Nothing changed here.", ...ai };
      },
    };
    const first = { text: "Nothing needs to be settled yet.", ...ai };
    await reviseInVoice(stubborn, first, undefined, {}, HELP_REWRITE_ASKS);
    expect(asks).toBe(1);
    asks = 0;
    await reviseInVoice(stubborn, first);
    expect(asks).toBe(MAX_REWRITES);
    expect(MAX_REWRITES).toBe(2);
  });

  test("the researcher: the card's words when filled, an instruction to infer when empty", () => {
    const filled = helpSystemPrompt({ page: "studies", about: { stage: "PhD student in the first two years", experience: "New to qualitative research", wants: "a topic" } });
    expect(filled).toContain("Career stage: PhD student in the first two years");
    expect(filled).toContain("Experience with qualitative research: New to qualitative research");
    expect(filled).toContain("What they want from Abductive: a topic");
    const empty = helpSystemPrompt({ page: "studies" });
    expect(empty).toContain("They haven't told Abductive about themselves under About you. Infer their experience only from the way that they write");
  });

  test("where they are: the page, and on Design the step with its question", () => {
    const sys = helpSystemPrompt({ page: "design", station: "site" });
    expect(sys).toContain("Page: Design");
    expect(sys).toContain(`Step: Site. ${STATIONS.find((s) => s.id === "site")!.blurb}`);
    expect(sys).toContain(`The step's question: ${STATIONS.find((s) => s.id === "site")!.prompt}`);
    expect(helpSystemPrompt({ page: "material", station: "site" })).not.toContain("Step: Site");
  });

  test("their project: the study context, the steps, the open question, waiting suggestions and recent History", () => {
    const question = {
      id: uid(), ts: (t += 10), actor: "system", projectId: P, type: "question-selection",
      topic: "station:process", question: "Which period do you follow at the firms?", because: "b",
      station: "process", mode: "interrogation", alternatives: [], moveId: "conversation", reason: "the step's question",
    } as unknown as LedgerEvent;
    const events: LedgerEvent[] = [reply("The firms moved sampling to software in 2023."), question];
    expect(validateEvent(question)).toEqual([]);
    const sys = helpSystemPrompt({ page: "design", station: "process", project: { project, events } });
    expect(sys).toContain("## Their project: TEST M95 help chat");
    expect(sys).toContain(renderStudyContext(studyContext(project.brief, projectOntology(events, P))));
    expect(sys).toContain("- Context: answered");
    expect(sys).toContain("- Process: still open");
    expect(sys).toContain("Suggestions waiting for their decision: 0.");
    expect(sys).toContain("Their latest History, oldest first");
    expect(sys).toContain("- They: ");
    expect(sys).toContain("Abductive's open question for them, at Process: Which period do you follow at the firms?");
    const off = helpSystemPrompt({ page: "studies" });
    expect(off).toContain("outside a project");
  });

  test("History in the prompt leaves out the help exchanges themselves", () => {
    const q = asked({ text: "SECRET-HELP-TEXT" });
    const sys = helpSystemPrompt({ page: "design", project: { project, events: [reply("x"), q, answered(q.id)] } });
    expect(sys).not.toContain("SECRET-HELP-TEXT");
  });

  test("earlier exchanges go in as turns, the last four answered ones, and I'm stuck sends the stuck request", () => {
    const earlier = Array.from({ length: 8 }, (_, i) => ({ text: `q${i}`, answer: `a${i}` }));
    const msgs = helpMessages([...earlier, { text: "unanswered" }], { text: STUCK_WORDS, stuck: true });
    expect(HELP_EXCHANGES).toBe(4);
    expect(msgs.length).toBe(HELP_EXCHANGES * 2 + 1);
    expect(msgs[0]).toEqual({ role: "user", content: "q4" });
    expect(msgs.at(-1)).toEqual({ role: "user", content: STUCK_REQUEST });
    expect(msgs.some((m) => m.content === "unanswered")).toBe(false);
  });

  test("helpExchanges pairs each request with its first answer", () => {
    const a = asked();
    const b = asked();
    const x = helpExchanges([a, answered(a.id, { text: "first" }), answered(a.id, { text: "second" }), b], P);
    expect(x.map((e) => [e.asked.id, e.answer?.text])).toEqual([[a.id, "first"], [b.id, undefined]]);
  });
});

describe("About you (ISC-773)", () => {
  afterEach(() => resetAboutYouForTests());

  test("only known fields survive, trimmed", () => {
    expect(cleanAboutYou({ stage: "phd-early", field: "  sociology ", experience: "loads", wants: "", extra: 1 })).toEqual({ stage: "phd-early", field: "sociology" });
    expect(aboutYouFilled({})).toBe(false);
    expect(aboutSnapshot({})).toBeUndefined();
    expect(aboutSnapshot({ stage: "faculty", experience: "a-lot" })).toEqual({ stage: "Faculty", experience: "A lot" });
  });

  test("a storage that throws leaves the card working for the page's life", () => {
    const broken = {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    } as unknown as Storage;
    expect(readAboutYou(broken)).toEqual({});
    expect(writeAboutYou({ field: "history" }, broken)).toBe(false);
    expect(readAboutYou(broken)).toEqual({ field: "history" });
    expect(readAboutYou(undefined)).toEqual({ field: "history" });
  });

  test("a working storage keeps the card under one key, and an empty card removes it", () => {
    const map = new Map<string, string>();
    const store = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    } as unknown as Storage;
    expect(writeAboutYou({ stage: "postdoc" }, store)).toBe(true);
    expect(JSON.parse(map.get(ABOUT_YOU_KEY)!)).toEqual({ stage: "postdoc" });
    resetAboutYouForTests();
    expect(readAboutYou(store)).toEqual({ stage: "postdoc" });
    writeAboutYou({}, store);
    expect(map.has(ABOUT_YOU_KEY)).toBe(false);
  });
});

/** A client that streams one fixed answer, and records each request it was sent. */
function fakeClient(answer: string, seen: CompleteRequest[]): InferenceClient {
  const result: CompleteResult = { text: answer, ...ai };
  return {
    requestedModel: ai.model,
    async complete(req) {
      seen.push(req);
      return result;
    },
    async completeStream(req, onDelta: (d: StreamDelta) => void) {
      seen.push(req);
      onDelta({ text: answer });
      return result;
    },
  };
}

type Props = { onClick?: (e: unknown) => void; onChange?: (e: unknown) => void };
function props(el: Element | null): Props {
  const key = Object.keys(el ?? {}).find((k) => k.startsWith("__reactProps$"))!;
  return (el as unknown as Record<string, Props>)[key]!;
}

async function mount(element: React.ReactElement, store = new InMemoryLedgerStore()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(LedgerProvider, { store, children: element }));
  });
  await act(async () => wait(20));
  return { host, root, store };
}

describe("the panel (ISC-771, ISC-772, ISC-781)", () => {
  test("without a live model the chat says so and offers Model access, with no composer", async () => {
    const offline = () => ({ client: fakeClient("x", []), live: false });
    const { host, root } = await mount(React.createElement(HelpChat, { page: "design", station: "context", project, inference: offline }));
    expect(host.querySelector('[data-testid="help-chat-offline"]')?.textContent).toContain(HELP_OFFLINE_LINE);
    expect(host.querySelector('[data-testid="help-chat-connect"]')?.getAttribute("href")).toBe("#/settings");
    expect(host.querySelector('[data-testid="help-chat-input"]')).toBeNull();
    expect(host.querySelector('[data-testid="help-chat-stuck"]')).toBeNull();
    root.unmount();
    host.remove();
  });

  test("on a study page, I'm stuck writes the request and the answer to the project's History", async () => {
    const seen: CompleteRequest[] = [];
    const live = () => ({ client: fakeClient("Go to Process and say which period you follow.", seen), live: true });
    const { host, root, store } = await mount(React.createElement(HelpChat, { page: "design", station: "process", project, inference: live }));
    await act(async () => props(host.querySelector('[data-testid="help-chat-stuck"]')).onClick?.({}));
    await act(async () => wait(30));
    const events = await store.readAll(P);
    const types = events.map((e) => e.type);
    expect(types).toEqual(["help-asked", "help-answered"]);
    const [a, b] = events as [HelpAskedEvent, HelpAnsweredEvent];
    expect(a.stuck).toBe(true);
    expect(a.text).toBe(STUCK_WORDS);
    expect(a.station).toBe("process");
    expect(b.asked).toBe(a.id);
    expect(b.actor).toBe(HELP_ACTOR);
    expect(b.model).toBe(ai.model);
    expect(seen[0]!.system).toContain("## Their project: TEST M95 help chat");
    expect(seen[0]!.messages.at(-1)!.content).toBe(STUCK_REQUEST);
    expect(host.querySelector('[data-testid="help-chat-answer"]')?.textContent).toContain("Go to Process");
    root.unmount();
    host.remove();
  });

  test("off a project, the chat answers and writes nothing to any ledger", async () => {
    const seen: CompleteRequest[] = [];
    const live = () => ({ client: fakeClient("Press New project to start.", seen), live: true });
    const { host, root, store } = await mount(React.createElement(HelpChat, { page: "studies", inference: live }));
    expect(host.querySelector('[data-testid="help-chat-outside"]')?.textContent).toBe(HELP_OUTSIDE_PROJECT_LINE);
    await act(async () => props(host.querySelector('[data-testid="help-chat-stuck"]')).onClick?.({}));
    await act(async () => wait(30));
    expect(await store.readAll()).toEqual([]);
    expect(seen[0]!.system).toContain("outside a project");
    expect(host.querySelector('[data-testid="help-chat-answer"]')?.textContent).toContain("Press New project");
    root.unmount();
    host.remove();
  });
});

/* M95c (Matthew, 2026-10-30, "Same panel, chat first"). */
describe("the Help panel opens on the chat (ISC-787)", () => {
  async function openPanel(live: boolean, page: "design" | "studies" = "design") {
    const choose = () => ({ client: fakeClient("x", []), live });
    const { host, root } = await mount(
      React.createElement(HelpControl, { page, ...(page === "design" ? { station: "process", project } : {}), inference: choose }),
    );
    const trigger = host.querySelector('[data-testid="page-help-open"]') as HTMLButtonElement;
    await act(async () => props(trigger).onClick?.({}));
    return { host, root, panel: host.querySelector('[data-testid="page-help-panel"]') as HTMLElement };
  }

  test("I'm stuck and the question box come first, the box takes focus, and About this page and About you fold below, closed", async () => {
    const { host, root, panel } = await openPanel(true);
    const order = ["help-chat-stuck", "help-chat-input", "help-chat-send", "page-help-about", "help-about"].map(
      (id) => panel.querySelector(`[data-testid="${id}"]`) as HTMLElement,
    );
    for (const el of order) expect(el).not.toBeNull();
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(document.activeElement).toBe(panel.querySelector('[data-testid="help-chat-input"]'));
    expect((panel.querySelector('[data-testid="page-help-about"]') as HTMLDetailsElement).open).toBe(false);
    expect((panel.querySelector('[data-testid="help-about"]') as HTMLDetailsElement).open).toBe(false);
    expect(panel.querySelector('[data-testid="page-help-jump"]')).toBeNull();
    root.unmount();
    host.remove();
  });

  test("with no model, the connect line takes the chat's place at the top, and About this page is still there", async () => {
    const { host, root, panel } = await openPanel(false, "studies");
    const offline = panel.querySelector('[data-testid="help-chat-offline"]') as HTMLElement;
    const fold = panel.querySelector('[data-testid="page-help-about"]') as HTMLElement;
    expect(offline.textContent).toContain(HELP_OFFLINE_LINE);
    expect(panel.querySelector('[data-testid="help-chat-input"]')).toBeNull();
    expect(offline.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fold.textContent).toContain(PAGE_HELP.studies.purpose[0]!);
    expect(panel.contains(document.activeElement)).toBe(true);
    root.unmount();
    host.remove();
  });

  test("the newest exchange sits first under the box", async () => {
    const store = new InMemoryLedgerStore();
    const first = asked({ text: "First question" });
    const second = asked({ text: "Second question" });
    for (const e of [first, answered(first.id), second, answered(second.id)]) await store.append(e);
    const live = () => ({ client: fakeClient("x", []), live: true });
    const { host, root } = await mount(React.createElement(HelpChat, { page: "design", station: "process", project, inference: live }), store);
    const turns = [...host.querySelectorAll('[data-who="you"]')].map((e) => e.textContent);
    expect(turns).toEqual(["YouSecond question", "YouFirst question"]);
    root.unmount();
    host.remove();
  });
});

/* M95c: the owner, 2026-10-30, "don't use the word 'card' to refer to stuff in the tool". */
describe("the word card (L22, ISC-789)", () => {
  test("the voice gate reads card in model output as L22, so the existing retry rewrites the sentence", () => {
    expect(voiceBreaks("Open the concept card to read the claim.").flatMap((o) => o.breaks.map((b) => b.rule))).toContain("L22");
    expect(voiceBreaks("Your accepted cards add up.").flatMap((o) => o.breaks.map((b) => b.rule))).toContain("L22");
    expect(voiceBreaks("Open the concept to read the claim.").length).toBe(0);
    expect(RULE_TEXT.L22).toContain('Do not use the word "card"');
  });

  test("every prompt that carries the model's voice rules tells the model not to say card", () => {
    expect(MODEL_VOICE_RULES).toContain('Do not use the word "card" for anything in Abductive');
    expect(helpSystemPrompt({ page: "design" })).toContain('Do not use the word "card" for anything in Abductive');
  });
});

