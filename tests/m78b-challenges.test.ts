/**
 * M78b, ISC-682 (the lead's addition, 2026-10-03): Abductive's design
 * challenges reach the researcher as the chat's question. On the serendipity
 * walk the persona engine wrote 13 challenges at step saves and the chat asked
 * none of them, because question selection never read a challenge event. An
 * unasked challenge for the current step is now a candidate for that step's
 * next question: ahead of the step's own question, behind an open follow-up on
 * the researcher's last reply, asked in the chat's own voice, and the
 * question-selection event carries `fromChallenge` (additive).
 */
import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { challengeStations, followUpOpen, nextChallenge, challengeBlock, CHALLENGE_CANDIDATE_FROM } from "../src/interview/challenges.ts";
import { parseConversationTurn } from "../src/interview/conversation.ts";

const P = "m78b-challenges";
let n = 0;
const uuid = (k: number) => `78b00000-0000-4000-8000-${String(k).padStart(12, "0")}`;
/* After the cutoff, as a challenge written now is. */
const T0 = Date.UTC(2026, 9, 3, 9, 0, 0);
const ev = (e: Record<string, unknown>) => ({ id: uuid((n += 1)), ts: T0 + n, projectId: P, ...e }) as unknown as LedgerEvent;
const CH_SITE = "78b0c4a1-0000-4000-8000-00000000517e";
const CH_CONTEXT = "78b0c4a1-0000-4000-8000-0000000c0e7e";

const SITE_CHALLENGE = "Which single dimension do your two periods differ on, if the founders you watched changed as well as the room?";
const CONTEXT_CHALLENGE = "What would the crib look like to a founder who never queued there?";

function planted(): LedgerEvent[] {
  n = 0;
  return [
    ev({ actor: "human", type: "bound", subject: "context", statement: "The crib is the one room in which founders meet without anyone arranging it." }),
    ev({ id: CH_CONTEXT, actor: "persona:eisenhardt-positivist", model: "m", modelVersion: "v", type: "challenge", text: CONTEXT_CHALLENGE, matrixCell: "confirmation:context" }),
    ev({ actor: "system", type: "bias-scan", station: "context", stage: "context", digest: "d1", firedCells: [] }),
    ev({ actor: "human", type: "bound", subject: "site", statement: "The incubator is the right place because the crib changed in May while the ventures stayed." }),
    ev({ id: CH_SITE, actor: "persona:eisenhardt-positivist", model: "m", modelVersion: "v", type: "challenge", text: SITE_CHALLENGE, matrixCell: "confirmation:site-sample" }),
    ev({ actor: "system", type: "bias-scan", station: "site", stage: "site-sample", digest: "d2", firedCells: [] }),
  ];
}

describe("which step a challenge belongs to (ISC-682)", () => {
  test("a challenge belongs to the step whose save's scan wrote it", () => {
    const at = challengeStations(planted(), P);
    expect(at.get(CH_SITE)).toBe("site");
    expect(at.get(CH_CONTEXT)).toBe("context");
  });

  test("the next challenge at Site is Site's, none waits at Process, and an asked one is not asked again", () => {
    const events = planted();
    expect(nextChallenge(events, P, "site")?.id).toBe(CH_SITE);
    expect(nextChallenge(events, P, "context")?.id).toBe(CH_CONTEXT);
    expect(nextChallenge(events, P, "process")).toBeUndefined();
    const asked = [...events, ev({ actor: "system", type: "question-selection", moveId: "conversation:site@1", topic: "station:site", question: "q?", alternatives: [], mode: "interrogation", reason: "r", station: "site", fromChallenge: CH_SITE })];
    expect(nextChallenge(asked, P, "site")).toBeUndefined();
  });

  test("a challenge from an earlier save of the step is not asked once the step is saved and read again", () => {
    const events = planted();
    const resaved = [
      ...events,
      ev({ actor: "human", type: "bound", subject: "site", statement: "The incubator, and the founders whom I can follow across May." }),
      ev({ actor: "system", type: "bias-scan", station: "site", stage: "site-sample", digest: "d3", firedCells: [] }),
    ];
    expect(nextChallenge(resaved, P, "site")).toBeUndefined();
    expect(nextChallenge(resaved, P, "context")?.id).toBe(CH_CONTEXT);
  });

  test("a challenge written before the cutoff is not asked, and one written after it is (the lead's ruling)", () => {
    expect(CHALLENGE_CANDIDATE_FROM).toBe(Date.parse("2026-10-02T23:14:12+02:00"));
    const before = planted().map((e) => (e.id === CH_SITE ? ({ ...e, ts: CHALLENGE_CANDIDATE_FROM - 60_000 } as LedgerEvent) : e));
    expect(nextChallenge(before, P, "site")).toBeUndefined();
    const after = planted().map((e) => (e.id === CH_SITE ? ({ ...e, ts: CHALLENGE_CANDIDATE_FROM + 60_000 } as LedgerEvent) : e));
    expect(nextChallenge(after, P, "site")?.id).toBe(CH_SITE);
  });

  test("a researcher's reply after Abductive's last question is an open follow-up", () => {
    const events = planted();
    expect(followUpOpen(events, P, "site")).toBe(false);
    const q = ev({ actor: "system", type: "question-selection", moveId: "conversation:site@1", topic: "station:site", question: "q?", alternatives: [], mode: "interrogation", reason: "r", station: "site" });
    const reply = ev({ actor: "human", type: "response", text: "The founders changed too: three left in June.", inReplyTo: q.id });
    expect(followUpOpen([...events, q], P, "site")).toBe(false);
    expect(followUpOpen([...events, q, reply], P, "site")).toBe(true);
  });

  test("the prompt block ranks the challenge behind an open follow-up and ahead of the step's question", () => {
    const open = challengeBlock({ text: SITE_CHALLENGE }, true).join("\n");
    expect(open).toContain(SITE_CHALLENGE);
    expect(open).toContain("follow it up");
    expect(open).toContain("CHALLENGE: yes");
    const free = challengeBlock({ text: SITE_CHALLENGE }, false).join("\n");
    expect(free).toContain("Ask about this question now");
    expect(free).toContain("ahead of the step's own question");
  });

  test("the marked line is read and kept off the screen", () => {
    const turn = parseConversationTurn("You named the room.\n\nWhich dimension do your two periods differ on?\n\nQUESTION: Which dimension do your two periods differ on?\nBECAUSE: Your comparison rests on it.\nCHALLENGE: yes");
    expect(turn.fromChallenge).toBe(true);
    expect(turn.shown).not.toContain("CHALLENGE");
    expect(parseConversationTurn("Which?\n\nQUESTION: Which?\nBECAUSE: b").fromChallenge).toBe(false);
  });
});

/* The chat itself: a planted challenge at Site becomes Site's next question. */
const SRC = new URL("../src/", import.meta.url).pathname;
const client = new MockInferenceClient({
  responses: [
    "You've said the crib changed in May while the ventures stayed the same. Did the founders you watched before May still come to the bench after it?\n\nQUESTION: Did the founders you watched before May still come to the bench after it?\nBECAUSE: Your before and after comparison holds the founders constant only if they stayed.\nCHALLENGE: yes",
  ],
});
const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({ ...realPersonaRun, activeInferenceClient: () => ({ client, live: true }) }));
afterAll(() => void mock.module(`${SRC}ui/personaRun.ts`, () => realPersonaRun));
const realPaperFit = { ...(await import(`${SRC}flow/usePaperFit.ts`)) };
await mock.module(`${SRC}flow/usePaperFit.ts`, () => ({ ...realPaperFit, usePaperFit: () => async () => 0, useJudgeOnMount: () => undefined, openedCounts: () => new Map() }));
afterAll(() => void mock.module(`${SRC}flow/usePaperFit.ts`, () => realPaperFit));

const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { Workbench } = await import(`${SRC}workbench/Workbench.tsx`);
const dialogue = await import(`${SRC}workbench/Dialogue.tsx`);
const { resetInterviewInFlight } = await import(`${SRC}interview/orchestrator.ts`);
const projects = await import(`${SRC}state/projects.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);

function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined ? undefined : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
const find = (host: Element, id: string) => host.querySelector(`[data-testid="${id}"]`);
async function settle(times = 40) {
  for (let i = 0; i < times; i += 1) await act(async () => void (await wait(5)));
}

describe("the chat asks Site's challenge at Site (ISC-682)", () => {
  test("the turn's prompt carries Site's challenge and not Context's, and the selection names it", async () => {
    dialogue.resetConversationOpeners();
    resetInterviewInFlight();
    await projects.saveProject({
      id: P,
      title: "tool crib",
      stage: "design-brief",
      createdAt: 1,
      brief: { ...projects.emptyBrief(), startingInterest: "Serendipity.", context: "The crib.", siteRationale: "The incubator, before and after May." },
    } as never);
    const store = new InMemoryLedgerStore();
    for (const e of planted()) await store.append(e);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(StrictMode, null, React.createElement(LedgerProvider, { store }, React.createElement(Workbench, { projectId: P, station: "site" }))));
    });
    await settle();
    client.requests.length = 0;
    const box = find(host, "answer-input") as HTMLTextAreaElement;
    await act(async () => {
      box.value = "I think the before and after comparison is the strongest thing about the site.";
      reactProps(box)?.onChange?.({ target: box });
    });
    await act(async () => reactProps(find(host, "send-answer") as Element)?.onClick?.({}));
    await settle(80);
    const turn = client.requests.find((r) => (r.system ?? "").includes("## The step: Site"));
    expect(turn?.system).toContain(SITE_CHALLENGE);
    expect(turn?.system).not.toContain(CONTEXT_CHALLENGE);
    const asked = (await store.readAll(P)).filter((e: LedgerEvent) => e.type === "question-selection" && e.station === "site");
    const last = asked.at(-1) as { fromChallenge?: string; question: string } | undefined;
    expect(last?.fromChallenge).toBe(CH_SITE);
    expect(last?.question).toBe("Did the founders you watched before May still come to the bench after it?");
    expect(validateEvent(asked.at(-1)!)).toEqual([]);
    root.unmount();
    host.remove();
  });
});
