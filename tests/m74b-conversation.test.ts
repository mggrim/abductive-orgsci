/**
 * M74b, ISC-664: the conversation side of the student walk of 2026-10-02
 * (docs/walks/2026-10-02-phd-student-walk.md, findings 2 to 8 and 10).
 *
 * The pure halves: what a turn shows, what the opener is told, the name a
 * place goes by, the summary check, the stall warning, the banner's next step
 * and the rail's line. The rendered halves are in m74b-chat-render.test.ts.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import {
  buildTranscript,
  placeName,
  turnDisplay,
} from "../src/workbench/Dialogue.tsx";
import {
  summaryRestatesReplies,
  withoutTrailingQuestion,
} from "../src/interview/conversation.ts";
import {
  CONVERSATION_INSTRUCTION,
  conversationPrompt,
  draftPrompt,
  OPENER_LEAD_IN,
} from "../src/interview/conversationPrompt.ts";
import { checkSaturation } from "../src/interview/saturation.ts";
import { nextStep } from "../src/workbench/NextBar.tsx";
import { placeSummaries } from "../src/views/placeSummary.ts";
import { emptyBrief } from "../src/state/projects.ts";
import { STATIONS, type StationId } from "../src/flow/stations.ts";
import type { StationState } from "../src/flow/stationBrief.ts";
import { RETIRED_TERMS } from "./copyBarScan.ts";

const P = "proj-m74b";
let n = 0;
const id = () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`;

function selection(over: Record<string, unknown>): LedgerEvent {
  return {
    id: id(),
    ts: 1000 + n,
    actor: "system",
    projectId: P,
    type: "question-selection",
    moveId: "conversation:context@1",
    topic: "station:context",
    question: "What is the setting?",
    alternatives: [],
    mode: "interrogation",
    station: "context",
    reason: "Asked as a follow-up in the conversation here.",
    ...over,
  } as LedgerEvent;
}

function reply(inReplyTo: string, text: string): LedgerEvent {
  return {
    id: id(),
    ts: 1000 + n,
    actor: "persona:interviewer",
    projectId: P,
    model: "m",
    modelVersion: "m",
    type: "response",
    text,
    inReplyTo,
  } as LedgerEvent;
}

function human(text: string, station = "context"): LedgerEvent {
  return { id: id(), ts: 1000 + n, actor: "human", projectId: P, type: "response", text, station } as LedgerEvent;
}

describe("finding 3: the opener states the step's question once", () => {
  test("the opener's prose drops a closing question, the bubble above carries it", () => {
    const text =
      "This step is for the setting of your project.\n\nAcross your two Saturdays, what is going on at the café?";
    expect(withoutTrailingQuestion(text)).toBe("This step is for the setting of your project.");
    // A question inside the last paragraph goes too, and the sentences before it stay.
    expect(withoutTrailingQuestion("You've told me about the toaster. What made you stay?")).toBe(
      "You've told me about the toaster.",
    );
    expect(withoutTrailingQuestion("A reply with no question.")).toBe("A reply with no question.");
  });

  test("an opener turn shows its lead-in and no question line", () => {
    const sel = selection({ opener: true, question: "What is the setting?" });
    const events = [sel, reply(sel.id, "This step is for the setting of your project.")];
    const [entry] = buildTranscript(events);
    expect(entry?.opener).toBe(true);
    const shown = turnDisplay(entry!);
    expect(shown.body).toBe("This step is for the setting of your project.");
    expect(shown.asked).toBeUndefined();
  });

  test("an opener written before M74b, which ended on the question, shows it once", () => {
    const sel = selection({ question: "What is drawing you to this particular research inquiry?" });
    const events = [
      sel,
      reply(sel.id, "This first step is for getting the setting on the table. What is drawing you to this particular research inquiry?"),
    ];
    const [entry] = buildTranscript(events);
    expect(entry?.opener).toBe(true);
    expect(turnDisplay(entry!)).toEqual({ body: "This first step is for getting the setting on the table." });
  });

  test("a later reply ends on its own question once, in the model's words", () => {
    const opener = selection({ opener: true });
    const later = selection({
      moveId: "conversation:context@2",
      question: "What did the volunteer do first?",
    });
    const text =
      "That's a usable start. Think of the moment the owner put the lamp down: what did the volunteer do or say first, before he picked up any tool?";
    const events = [opener, reply(opener.id, "This step is for the setting."), human("The lamp."), later, reply(later.id, text)];
    const entry = buildTranscript(events).find((e) => e.text === text);
    expect(entry?.opener).toBeUndefined();
    const shown = turnDisplay(entry!);
    expect(shown.body).toBe(text);
    // One question on screen, and it is the one the record keeps.
    expect(shown.asked).toBeUndefined();
    expect((shown.body.match(/\?/g) ?? []).length).toBe(1);
  });

  test("a reply that asks its question before a closing aside shows no second question line", () => {
    const opener = selection({ opener: true });
    const later = selection({ moveId: "conversation:context@2", question: "What did you see when he found the wire?" });
    const text = "I'll make the question smaller. What did you see or hear when he found the frayed wire? You could attend to his hands or his voice.";
    const events = [opener, reply(opener.id, "Lead-in."), human("I don't know."), later, reply(later.id, text)];
    const entry = buildTranscript(events).find((e) => e.text === text);
    expect(turnDisplay(entry!)).toEqual({ body: text });
  });

  test("a reply that asked nothing in its prose shows the recorded question under it", () => {
    const opener = selection({ opener: true });
    const later = selection({ moveId: "conversation:context@2", question: "What happened next?" });
    const events = [opener, reply(opener.id, "Lead-in."), human("He plugged it in."), later, reply(later.id, "That's a usable start.")];
    const entry = buildTranscript(events).find((e) => e.text === "That's a usable start.");
    expect(turnDisplay(entry!)).toEqual({ body: "That's a usable start.", asked: "What happened next?" });
  });

  test("the opener's prompt asks for a lead-in that ends without a question", () => {
    const base = {
      place: "context",
      placeLabel: "Context",
      purpose: "The setting.",
      stationQuestion: "What is the setting?",
      mode: "interrogation" as const,
      nothingWrittenYet: false,
      stepAnswered: false,
      chunks: [],
      ontologySummary: "",
      here: [],
      earlier: [],
    };
    const opener = conversationPrompt({ ...base, opener: true });
    expect(opener).toContain(OPENER_LEAD_IN);
    expect(opener).not.toContain("- End the reply on the question");
    const later = conversationPrompt({ ...base, opener: false });
    expect(later).toContain("- End the reply on the question");
    expect(later).not.toContain(OPENER_LEAD_IN);
    expect(CONVERSATION_INSTRUCTION(true)).not.toMatch(/question/i);
  });
});

describe("finding 4: framing is gone from what the page says", () => {
  test("a question open at Starting point is named for the place", () => {
    expect(placeName("framing")).toBe("Starting point");
    expect(placeName("context")).toBe("Context");
  });

  test("the retired-word scan reads framing", () => {
    expect(RETIRED_TERMS.map((t) => t.term)).toContain("framing");
    const framing = RETIRED_TERMS.find((t) => t.term === "framing")!;
    expect(framing.pattern.test("A question is open for you at framing.")).toBe(true);
    // A class name or an id is not copy.
    expect(framing.pattern.test("framing-talk")).toBe(false);
  });
});

describe("finding 6: Summarise writes a summary", () => {
  const said = [
    "It's a repair café in a church hall, once a month on a Saturday. People bring broken lamps and toasters and clothes, and volunteers fix them for free. I suppose I wanted to know why people bother.",
    "The volunteers, I think. They give up a whole Saturday, and some of them are quite old. One man spent about an hour on a lamp and then told the owner it wasn't safe to keep, so he didn't fix it in the end. He seemed fine with that.",
  ];

  test("the prompt asks for the step's answer at summary length, their phrasing, without their questions and asides", () => {
    const prompt = draftPrompt({ question: "What is the setting?", said });
    expect(prompt).toContain("two to five sentences");
    expect(prompt).toMatch(/keep their phrasing where it stands on its own/i);
    expect(prompt).toMatch(/leave out their questions and asides/i);
    expect(prompt).toMatch(/do not join their replies end to end/i);
  });

  test("a reply that is the turns joined end to end fails", () => {
    expect(summaryRestatesReplies(said.join(" "), said)).toBe(true);
    expect(summaryRestatesReplies(said.join("\n\n"), said)).toBe(true);
    // As long as the replies, or longer, fails too.
    expect(summaryRestatesReplies(`${said.join(" ")} And more.`, said)).toBe(true);
    const summary =
      "It's a repair café in a church hall, once a month on a Saturday, where volunteers fix broken things for free. I wanted to know why the volunteers bother: they give up a whole Saturday. One man spent an hour on a lamp and then told the owner it wasn't safe to keep, and he seemed fine with that.";
    expect(summary.length).toBeLessThan(said.join(" ").length);
    expect(summaryRestatesReplies(summary, said)).toBe(false);
  });

  test("one short reply is its own summary", () => {
    expect(summaryRestatesReplies("Whatever my supervisor says.", ["Whatever my supervisor says."])).toBe(false);
  });
});

describe("finding 7: the stall warning", () => {
  const turns = (k: number) =>
    Array.from({ length: k }, (_, i) => selection({ moveId: `conversation:context@${i + 1}` }));
  const accepted = (): LedgerEvent =>
    ({
      id: id(),
      ts: 1,
      actor: "human",
      projectId: P,
      type: "concept-accepted",
      conceptId: "c1",
      name: "Money argument",
      definition: "d",
      origin: "author-prior",
    }) as LedgerEvent;

  test("it waits until the model holds a concept", () => {
    const reading = checkSaturation(turns(12), P);
    expect(reading.windowComplete).toBe(true);
    expect(reading.reached).toBe(false);
  });

  test("when it fires it reads in the owner's rules", () => {
    const reading = checkSaturation([accepted(), ...turns(9)], P);
    expect(reading.reached).toBe(true);
    expect(reading.advice).toBe(
      "Your last eight answers left your concepts unchanged. You can carry on, narrow the question, or add data.",
    );
  });

  test("a concept accepted inside the window counts as a change", () => {
    const reading = checkSaturation([...turns(4), accepted(), accepted(), ...turns(5)], P);
    expect(reading.reached).toBe(false);
  });
});

describe("finding 8: the banner, the gate and the rail agree", () => {
  const states = (over: Partial<Record<StationId, StationState>>) =>
    new Map(STATIONS.map((s) => [s.id, over[s.id] ?? "empty"] as const));

  test("Next for you names the first empty loop step", () => {
    const brief = { ...emptyBrief(), startingInterest: "x", seminalCorpus: "y", targetVenue: "z" };
    const step = nextStep({
      station: "context",
      pendingDrafts: 0,
      brief,
      states: states({}),
    });
    expect(step.sentence).toBe("the Context step."); // M78b, ISC-681: "Next for you: the Context step."
  });

  test("the rail line for a step with a saved summary is the summary, not the first chat reply", () => {
    const events = [human("I'm not sure it is the right place, it's just the one near me.", "site")];
    const brief = { ...emptyBrief(), siteRationale: "It's the repair café near me, in a church hall." } as never;
    const site = placeSummaries({ events, projectId: P, brief }).find((s) => s.place === "site");
    expect(site?.title).toBe("It's the repair café near me, in a church hall.");
    const none = placeSummaries({ events, projectId: P, brief: emptyBrief() }).find((s) => s.place === "site");
    expect(none?.title).toBe("I'm not sure it is the right place, it's just the one near me.");
  });
});
