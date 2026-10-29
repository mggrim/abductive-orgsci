/**
 * M78b, ISC-681: Summarise on the serendipity walk (finding 1). At Starting
 * point the student named Organization Science and AMJ, and Summarise returned
 * "[...]" for the Target journal, because the reply also said "we haven't
 * settled it yet". Across nine summaries Abductive dropped the student's
 * relativizers ("the useful leads founders have told me about"), and four ran
 * to six or seven sentences.
 */
import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { framingCoverage, FRAMING_DRAFT_LABELS, humanTurnsAt } from "../src/interview/conversation.ts";
import { draftPrompt } from "../src/interview/conversationPrompt.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import {
  checkedSummary,
  cutToSentences,
  droppedRelatives,
  MAX_SUMMARY_SENTENCES,
  summarySentenceCount,
} from "../src/flow/useBriefDraft.ts";

const walk = (await Bun.file(new URL("./fixtures/m76-walk.json", import.meta.url)).json()) as {
  project: { id: string };
  events: LedgerEvent[];
};
const P = walk.project.id;
const before = walk.events.slice(0, walk.events.findIndex((e) => e.type === "brief-draft"));
const said = humanTurnsAt(before, P, "framing");
const coverage = framingCoverage(before, P, {});
const turnParts = new Map([...coverage.answered].map(([turn, field]) => [turn, FRAMING_DRAFT_LABELS[field]]));
const PARTS = [
  { field: "startingInterest", label: "INTEREST", question: "What is drawing you to this particular research inquiry?" },
  { field: "seminalCorpus", label: "PAPERS", question: "Which literatures might be relevant?" },
  { field: "targetVenue", label: "JOURNAL", question: "Where do you want this project to land?" },
] as const;
const JOURNAL_REPLY = said.find((t) => turnParts.get(t.id) === "JOURNAL")!.text;

describe("an answered part is never the gap (ISC-681)", () => {
  test("the walk's journal reply names two journals, so the part is answered and not open", () => {
    expect(JOURNAL_REPLY).toContain("Organization Science");
    expect(coverage.covered.targetVenue).toBe(true);
    expect([...coverage.open]).toEqual([]);
  });

  test("a reply that only says the part is up in the air still leaves it open", () => {
    for (const reply of ["Honestly, that's still up in the air.", "I haven't decided yet.", "Not sure yet."]) {
      const events = before.map((e) =>
        e.type === "response" && e.actor === "human" && (e as { text?: string }).text === JOURNAL_REPLY ? ({ ...e, text: reply } as LedgerEvent) : e,
      );
      expect({ reply, open: framingCoverage(events, P, {}).open.has("targetVenue") }).toEqual({ reply, open: true });
    }
  });

  test("the prompt lists the parts and the researcher's words for each", () => {
    const prompt = draftPrompt({
      question: "q",
      said: said.map((t) => t.text),
      parts: PARTS,
      partWords: { JOURNAL: [JOURNAL_REPLY] },
    });
    expect(prompt).toContain("## Their words for each part");
    expect(prompt).toContain(`JOURNAL:\n${JOURNAL_REPLY}`);
    expect(prompt).toContain("Summarise each part listed under \"Their words for each part\"");
  });

  test("a [...] where the words exist is asked again, and their own words fill a part the model leaves empty", async () => {
    const client = new MockInferenceClient({
      responses: [
        "INTEREST: I'm interested in serendipity at the tool crib.\nPAPERS: Dew 2009\nJOURNAL: [...]",
        "INTEREST: I'm interested in serendipity at the tool crib.\nPAPERS: Dew 2009\nJOURNAL: Organization Science is my first choice, and AMJ is my second.",
      ],
    });
    const out = await checkedSummary(client, { system: "s", messages: [{ role: "user", content: "go" }] }, {
      said: said.map((t) => ({ id: t.id, text: t.text })),
      parts: PARTS,
      turnParts,
    });
    expect(out.texts?.targetVenue).toBe("Organization Science is my first choice, and AMJ is my second.");
    expect(client.requests.length).toBe(2);
    expect(JSON.stringify(client.requests[1]!.messages)).toContain("JOURNAL");

    const stubborn = new MockInferenceClient({ responses: ["INTEREST: a\nPAPERS: b\nJOURNAL: [...]", "INTEREST: a\nPAPERS: b\nJOURNAL: [...]"] });
    const kept = await checkedSummary(stubborn, { system: "s", messages: [{ role: "user", content: "go" }] }, {
      said: said.map((t) => ({ id: t.id, text: t.text })),
      parts: PARTS,
      turnParts,
    });
    expect(kept.texts?.targetVenue).not.toBe("[...]");
    expect(kept.texts?.targetVenue).toContain("Organization Science is my first choice");
  });
});

describe("the summary keeps the researcher's voice and five sentences (ISC-681)", () => {
  test("the walk's dropped relativizers are found", () => {
    const theirs = [
      "a surprising number of the useful leads that founders have told me about started at that bench",
      "consent from the founders that I've interviewed",
    ];
    expect(droppedRelatives("A surprising number of the useful leads founders have told me about started there.", theirs)).toEqual([
      "leads that founders",
    ]);
    expect(droppedRelatives("I have consent from the founders that I've interviewed.", theirs)).toEqual([]);
    expect(droppedRelatives("I said the crib changed.", ["I said that the crib changed."])).toEqual([]);
  });

  test("the prompt asks for their relativizers, their active voice and at most five sentences, under the owner's rules", () => {
    const prompt = draftPrompt({ question: "What is going on in this setting?", said: ["x"] });
    expect(prompt).toContain('keep "that"');
    expect(prompt).toContain("active voice");
    expect(prompt).toContain("at most five sentences");
    expect(prompt).toContain("## The owner's rules for every sentence");
  });

  test("the four walk summaries past five sentences count past five, and the cut keeps five", () => {
    const long = walk.events.filter((e) => e.type === "brief-draft").map((e) => (e as { text: string }).text);
    const over = long.filter((t) => summarySentenceCount(t) > MAX_SUMMARY_SENTENCES);
    expect(over.length).toBe(4);
    for (const t of over) expect(summarySentenceCount(cutToSentences(t, MAX_SUMMARY_SENTENCES))).toBe(5);
    // A citation line is not a sentence.
    expect(summarySentenceCount("I draw on the serendipity literature.\nMerton and Barber 2004\nDew 2009")).toBe(1);
  });

  test("one rewrite ask carries the rule breaks, the dropped relativizer and the length, and a summary still past five is cut", async () => {
    const seven = "One. Two. Three. Four. Five. Six. Seven.";
    const client = new MockInferenceClient({
      responses: [`The useful leads founders have told me about started at the bench. ${seven}`, `The useful leads founders have told me about started at the bench. ${seven}`],
    });
    const out = await checkedSummary(client, { system: "s", messages: [{ role: "user", content: "go" }] }, {
      said: [{ id: "t1", text: "The useful leads that founders have told me about started at that bench." }],
      parts: [],
    });
    expect(client.requests.length).toBe(2);
    const ask = JSON.stringify(client.requests[1]!.messages);
    expect(ask).toContain("leads that founders");
    expect(ask).toContain("five sentences");
    expect(summarySentenceCount(out.result.text)).toBe(5);
  });

  test("a summary that keeps every rule costs one call", async () => {
    const client = new MockInferenceClient({ responses: ["The useful leads that founders have told me about started at the bench."] });
    await checkedSummary(client, { system: "s", messages: [{ role: "user", content: "go" }] }, {
      said: [{ id: "t1", text: "The useful leads that founders have told me about started at that bench." }],
      parts: [],
    });
    expect(client.requests.length).toBe(1);
  });
});
