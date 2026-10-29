/**
 * M61 follow-up, ISC-592 option (b): "Suggest starting point" drafts all three
 * Starting point answers from the conversation, under the draft rule the
 * interest already kept (lead's ruling, 2026-09-30):
 *
 *   - each answer is assembled from the researcher's own turns and nothing else;
 *   - where the conversation never said the thing, the model leaves the marked
 *     gap, so a venue or a literature never mentioned stays [...] and is never
 *     invented;
 *   - each draft lands unsaved and marked as a suggestion, enters the record only
 *     when the researcher presses Save answer (or edits it and leaves the field),
 *     and is re-hydrated from its brief-draft event on reload until then; a gap
 *     is never saved as an answer, and the chip counts saved answers only;
 *   - each save names its draft in provenance, as the interest's already did;
 *   - one brief-draft event per field drafted, written whether or not the text
 *     is kept.
 *
 * The conversation below names a venue and no literature.
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

const SRC = new URL("../src/", import.meta.url).pathname;

const INTEREST = "I keep watching night-shift nurses hand over patients in the corridor, not on the sheet.";
const VENUE = "Organization Science";
let reply = `INTEREST: ${INTEREST}\nPAPERS: [...]\nJOURNAL: ${VENUE}`;
const requests: CompleteRequest[] = [];
class ScriptedClient extends MockInferenceClient {
  override async complete(req: CompleteRequest): Promise<CompleteResult> {
    requests.push(req);
    return { text: reply, model: "scripted", modelVersion: "scripted-1" } as CompleteResult;
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

const { draftPrompt } = await import(`${SRC}interview/conversationPrompt.ts`);
const { parseFramingDraft } = await import(`${SRC}interview/conversation.ts`);
// The parts carry the page's own questions, so they live with the page.
const { MotivationPage, FRAMING_DRAFT_PARTS } = await import(`${SRC}flow/FramingBand.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { validateEvent } = await import(`${SRC}ledger/events.ts`);
const projects = await import(`${SRC}state/projects.ts`);

describe("the prompt and the parser", () => {
  test("one call asks for the three parts, each from their words, a gap where they said nothing", () => {
    const prompt: string = draftPrompt({
      question: "unused for parts",
      said: ["I want to publish in Organization Science."],
      parts: FRAMING_DRAFT_PARTS,
    });
    for (const part of FRAMING_DRAFT_PARTS) {
      expect(prompt).toContain(`${part.label}:`);
      expect(prompt).toContain(part.question);
    }
    expect(prompt).toContain("Use only what the researcher said");
    expect(prompt).toMatch(/did not mention.*\[\.\.\.\]/i);
    expect(prompt).toContain("Do not fill the gap.");
  });

  test("a labelled reply splits into the three; a missing part is a gap; an unlabelled reply is the interest", () => {
    expect(parseFramingDraft(`INTEREST: a\nPAPERS: [...]\nJOURNAL: b`)).toEqual({
      startingInterest: "a",
      seminalCorpus: "[...]",
      targetVenue: "b",
    });
    expect(parseFramingDraft(`INTEREST: a\nstill a\nJOURNAL: b`)).toEqual({
      startingInterest: "a\nstill a",
      seminalCorpus: "[...]",
      targetVenue: "b",
    });
    expect(parseFramingDraft("just some words")).toEqual({
      startingInterest: "just some words",
      seminalCorpus: "[...]",
      targetVenue: "[...]",
    });
  });
});

describe("Summarise (Suggest starting point until M62) on a conversation that names a venue and no literature", () => {
  test("drafted unsaved, saved by a press with their drafts named; papers a marked gap, never saved", async () => {
    const id = "m61-three-drafts";
    await projects.saveProject({
      id,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: projects.emptyBrief(),
    } as never);
    const project = await projects.getProject(id);
    const said: LedgerEvent[] = [
      {
        id: crypto.randomUUID(),
        ts: 1_700_000_000_001,
        actor: "human",
        projectId: id,
        type: "response",
        text: "I keep watching night-shift nurses hand over patients in the corridor, not on the sheet.",
        station: "framing",
      } as LedgerEvent,
      {
        id: crypto.randomUUID(),
        ts: 1_700_000_000_002,
        actor: "human",
        projectId: id,
        type: "response",
        text: "I'd like this to land in Organization Science.",
        station: "framing",
      } as LedgerEvent,
    ];
    const store = new InMemoryLedgerStore();
    for (const e of said) await store.append(e);

    const host = document.createElement("div");
    document.body.appendChild(host);
    let root = createRoot(host);
    const mountPage = async (p: unknown) => {
      root = createRoot(host);
      await act(async () => {
        root.render(
          React.createElement(LedgerProvider, {
            store,
            children: React.createElement(MotivationPage, { project: p, onChanged: () => undefined }),
          }),
        );
      });
      for (let i = 0; i < 10; i += 1) await act(async () => void (await wait(5)));
    };
    await mountPage(project);

    /* M92, ISC-752: each summary has its own Auto-generate summary from chat,
     * so the three drafts are three presses, one part each. */
    const generate = async (prefix: string, text: string) => {
      reply = text;
      const button = host.querySelector(`[data-testid="${prefix}-generate"]`) as HTMLElement;
      const key = Object.keys(button).find((k) => k.startsWith("__reactProps$"))!;
      await act(async () => {
        (button as unknown as Record<string, { onClick: () => void }>)[key]!.onClick();
      });
      for (let i = 0; i < 12; i += 1) await act(async () => void (await wait(5)));
    };
    requests.length = 0;
    await generate("framing-interest", `INTEREST: ${INTEREST}`);
    await generate("framing-literatures", "PAPERS: [...]");
    await generate("framing-journal", `JOURNAL: ${VENUE}`);

    // One draft call per press. (The save then asks for a puzzle reading, as
    // every Starting point save does; that call is not a draft.)
    expect(requests.filter((r) => r.system.includes("summarising the researcher's own answer"))).toHaveLength(3);
    // M92: each summary reads as text, marked, until a save.
    const field = (tid: string) => host.querySelector(`[data-testid="${tid}-text"]`) as HTMLElement;
    expect(field("framing-starting-interest").textContent).toBe(INTEREST);
    expect(field("framing-venue").textContent).toBe(VENUE);
    expect(field("framing-seminal-corpus").textContent).toBe("[...]");
    for (const tid of ["framing-starting-interest", "framing-seminal-corpus", "framing-venue"]) {
      expect({ tid, drafted: field(tid).getAttribute("data-drafted") }).toEqual({ tid, drafted: "true" });
    }
    // The gap is named on screen, beside the papers field.
    expect(host.querySelector('[data-testid="framing-draft-gap-seminalCorpus"]')).not.toBeNull();

    // Unsaved on arrival: nothing on the record as their answer, the stored brief
    // untouched, and the chip counting saved answers only.
    const beforeSave: readonly LedgerEvent[] = await store.readAll();
    expect(beforeSave.filter((e) => e.type === "bound")).toHaveLength(0);
    expect((await projects.getProject(id))?.brief.startingInterest ?? "").toBe("");
    expect(host.querySelector('[data-testid="framing-status"]')?.textContent).toBe("Not started"); // M84, ISC-705: a state, with no count
    // One Save answer per suggestion that has words in it; none under a gap.
    expect(host.querySelector('[data-testid="framing-save-startingInterest"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="framing-save-targetVenue"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="framing-save-seminalCorpus"]')).toBeNull();

    // A reload before any press: each suggestion comes back, marked, from its event.
    root.unmount();
    await mountPage(await projects.getProject(id));
    expect(field("framing-starting-interest").textContent).toBe(INTEREST);
    expect(field("framing-venue").textContent).toBe(VENUE);
    expect(field("framing-seminal-corpus").textContent).toBe("[...]");
    for (const tid of ["framing-starting-interest", "framing-seminal-corpus", "framing-venue"]) {
      expect({ tid, drafted: field(tid).getAttribute("data-drafted") }).toEqual({ tid, drafted: "true" });
    }

    // The presses.
    const pressSave = async (f: string) => {
      const button = host.querySelector(`[data-testid="framing-save-${f}"]`) as HTMLElement;
      const k = Object.keys(button).find((x) => x.startsWith("__reactProps$"))!;
      await act(async () => {
        (button as unknown as Record<string, { onClick: () => void }>)[k]!.onClick();
      });
      for (let i = 0; i < 8; i += 1) await act(async () => void (await wait(5)));
    };
    await pressSave("startingInterest");
    await pressSave("targetVenue");
    expect(host.querySelector('[data-testid="framing-status"]')?.textContent).toMatch(/^(Saved|In progress)$/); // M84, ISC-705

    const events: readonly LedgerEvent[] = await store.readAll();
    const drafts = events.filter((e) => e.type === "brief-draft");
    // One per field drafted, the gap included: written whether or not the text is kept.
    expect(drafts.map((d) => (d.type === "brief-draft" ? d.field : null)).sort()).toEqual([
      "seminalCorpus",
      "startingInterest",
      "targetVenue",
    ]);
    for (const d of drafts) {
      expect(validateEvent(d)).toEqual([]);
      if (d.type === "brief-draft") {
        expect(d.station).toBe("framing");
        expect(d.fromTurnIds).toEqual(said.map((s) => s.id));
      }
    }
    const draftOf = (f: string) => drafts.find((d) => d.type === "brief-draft" && d.field === f)?.id;
    const bound = events.filter((e) => e.type === "bound");
    const saved = (subject: string) => bound.find((b) => b.type === "bound" && b.subject === subject);
    const interestSave = saved("starting-interest");
    const venueSave = saved("target-journal");
    expect(interestSave?.type === "bound" && interestSave.draftedFrom).toBe(draftOf("startingInterest"));
    expect(venueSave?.type === "bound" && venueSave.draftedFrom).toBe(draftOf("targetVenue"));
    // A gap is not an answer: no papers save, and the stored brief keeps the field empty.
    expect(saved("papers")).toBeUndefined();
    const stored = await projects.getProject(id);
    expect(stored?.brief.startingInterest).toBe(INTEREST);
    expect(stored?.brief.targetVenue).toBe(VENUE);
    expect(stored?.brief.seminalCorpus ?? "").toBe("");

    // And after the saves, a reload shows the saved two as saved and the gap still a gap.
    root.unmount();
    await mountPage(stored);
    expect(field("framing-starting-interest").getAttribute("data-drafted")).toBeNull();
    expect(field("framing-venue").getAttribute("data-drafted")).toBeNull();
    expect(field("framing-seminal-corpus").textContent).toBe("[...]");
    expect(host.querySelector('[data-testid="framing-status"]')?.textContent).toBe("In progress"); // M84, ISC-705
    root.unmount();
    host.remove();
  });
});

describe("the chip counts answers, and a gap is not one", () => {
  test("a field holding only the gap marker is not answered", async () => {
    const { framingCount } = await import(`${SRC}flow/FramingBand.tsx`);
    const brief = { ...projects.emptyBrief(), startingInterest: "night shifts", seminalCorpus: "[...]", targetVenue: "Organization Science" };
    expect(framingCount(brief)).toBe(2);
  });
});

describe("History names the answer each Starting point draft was for", () => {
  test("papers, target journal, and the interest for a draft from before ISC-592", async () => {
    const { briefDraftSubject } = await import(`${SRC}workbench/Instrumentation.tsx`);
    expect(briefDraftSubject({ station: "framing", field: "seminalCorpus" })).toBe("papers");
    expect(briefDraftSubject({ station: "framing", field: "targetVenue" })).toBe("target-journal");
    expect(briefDraftSubject({ station: "framing" })).toBe("starting-interest");
    expect(briefDraftSubject({ station: "site" })).toBe("site");
  });
});
