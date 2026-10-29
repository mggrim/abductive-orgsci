/**
 * M69, ISC-644: the model's voice.
 *
 * Matthew, 2026-10-02: "For the chat and project ontology and checks, the model
 * seems to be writing in a way that violates my writing preferences. Would it be
 * inefficient to give the model those writing preferences for every time it
 * interacts with the user?" The lead: a compact block in the cached prefix is
 * cheap, and a check on the output makes it hold.
 *
 *   - One module, src/copy/rules.ts, carries the L13 to L20 detectors, and both
 *     tests/copyBarScan.ts and the runtime import it.
 *   - PROSE_CONTRACT carries the owner's rules in under 200 words, and every
 *     prompt whose output a researcher reads carries them.
 *   - A reply that breaks a rule goes back once for the offending sentences; a
 *     clean reply goes back zero times; the event records `voiceRetry: true`.
 */
import { describe, expect, test } from "bun:test";
import * as rules from "../src/copy/rules.ts";
import * as scan from "./copyBarScan.ts";
import { OWNER_RULES, PROSE_CONTRACT, VOICE_CONTRACT, INTERVIEW_CONTRACT } from "../src/personas/voice.ts";
import { completeInVoice, parseRewrites, rewriteRequest, REWRITE_SYSTEM, reviseInVoice } from "../src/inference/voiceRetry.ts";
import { voiceGateProvenance } from "../src/inference/voiceGate.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import type { CompleteRequest, CompleteResult, InferenceClient } from "../src/inference/types.ts";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { fitSystem, judgePaperFit, paperFitEvents, type PaperRef } from "../src/proposals/paperFit.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief } from "../src/state/projects.ts";
import { puzzlePrompt } from "../src/interview/puzzlePrompt.ts";

const read = (rel: string) => Bun.file(new URL(`../${rel}`, import.meta.url).pathname).text();
const REQ: CompleteRequest = { system: "s", messages: [{ role: "user", content: "u" }] };

describe("one set of detectors for the scan and the runtime", () => {
  test("the scan re-exports the module's own regexes rather than its own copies", () => {
    for (const name of [
      "WH_NOUN_CLAUSE",
      "NO_DENIAL",
      "HOLD_VERB",
      "MOVE_NOUN",
      "NON_ENTITY_ACT",
      "THING_WAITS",
      "PASSIVE_CLAUSE",
      "NEGATIVE_PRONOUN",
      "NEVER_WORD",
      "reducedRelatives",
      "agentlessPassives",
      "nonEntityActs",
      "whNounClauses",
      "sentencesOf",
    ] as const) {
      expect({ name, same: (scan as Record<string, unknown>)[name] === (rules as Record<string, unknown>)[name] }).toEqual({
        name,
        same: true,
      });
    }
  });

  test("the scan declares none of the detectors itself, and the runtime imports the module", async () => {
    const source = await read("tests/copyBarScan.ts");
    expect(source).toContain('from "../src/copy/rules.ts"');
    for (const decl of [
      "export const WH_NOUN_CLAUSE =",
      "export const NO_DENIAL =",
      "export const HOLD_VERB =",
      "export const MOVE_NOUN =",
      "export const NON_ENTITY_ACT =",
      "export const PASSIVE_CLAUSE =",
      "export const NEGATIVE_PRONOUN =",
      "export const NEVER_WORD =",
      "export function reducedRelatives",
      "export function agentlessPassives",
    ]) {
      expect({ decl, declared: source.includes(decl) }).toEqual({ decl, declared: false });
    }
    expect(await read("src/inference/voiceRetry.ts")).toContain('from "../copy/rules.ts"');
  });

  test("each rule catches its own case, and a clean sentence passes", () => {
    const cases: [rules.RuleId, string][] = [
      ["L13", "Abductive shows what you found at the ward."],
      ["L14", "No. Your puzzle is fine as it stands."],
      ["L15", "That claim holds across both wards."],
      ["L16", "Your next move is to ask the ward manager."],
      ["L17", "The claim says more than your data can carry."],
      ["L18", "Your answer was saved before the meeting."],
      ["L19", "Nothing in your notes speaks to the night shift."],
      ["L20", "You never said which ward you mean."],
    ];
    for (const [rule, sentence] of cases) {
      expect({ sentence, rules: rules.sentenceBreaks(sentence).map((b) => b.rule) }).toEqual({
        sentence,
        rules: expect.arrayContaining([rule]) as unknown as rules.RuleId[],
      });
    }
    expect(rules.sentenceBreaks("You've named the ward and the night shift.")).toEqual([]);
    expect(rules.offendingSentences("FIT: fits. It speaks to handovers.\nCITE: [[chunk:c1]]")).toEqual([]);
  });
});

describe("the owner's rules in the prompt", () => {
  test("under 200 words, and every rule the owner listed is in it", () => {
    expect(OWNER_RULES.split(/\s+/).length).toBeLessThan(200);
    for (const said of [
      "who, what, when, where, why and how only to ask a question",
      'Do not open a sentence with "No." or "No,"',
      '"hold" or "holds"',
      '"move" as a noun',
      "Only an agent acts",
      "subject before its verb",
      "agent of every passive verb",
      "nothing, nobody, no one or nowhere",
      'the word "never"',
      "contractions",
      "em dashes",
      '"X, not Y" reframe',
    ]) {
      expect({ said, in: OWNER_RULES.includes(said) }).toEqual({ said, in: true });
    }
  });

  test("PROSE_CONTRACT carries it, so the chat, the personas and the suggesters do", () => {
    for (const contract of [PROSE_CONTRACT, VOICE_CONTRACT, INTERVIEW_CONTRACT]) expect(contract).toContain(OWNER_RULES);
    expect(fitSystem()).toContain(OWNER_RULES);
    expect(fitSystem({ bearing: true })).toContain(OWNER_RULES);
    expect(puzzlePrompt([])).toContain(OWNER_RULES);
  });

  /* Each prompt whose output a researcher reads: the contract or the block in
   * its system prompt, and its call through the retry. Summarise is left out on
   * purpose: its summary is the researcher's own words (docs/copy-standard.md
   * Part 4). */
  const SITES: readonly { file: string; carries: string }[] = [
    { file: "src/concepts/suggest.ts", carries: "PROSE_CONTRACT" },
    { file: "src/proposals/rival.ts", carries: "PROSE_CONTRACT" },
    { file: "src/personas/engine.ts", carries: "VOICE_CONTRACT" },
    { file: "src/proposals/paperFit.ts", carries: "OWNER_RULES" },
    { file: "src/proposals/extract.ts", carries: "OWNER_RULES" },
    { file: "src/twin/twin.ts", carries: "OWNER_RULES" },
  ];
  for (const { file, carries } of SITES) {
    test(`${file} carries ${carries} and calls through the retry`, async () => {
      const source = await read(file);
      expect(source).toContain(carries);
      expect(source).toContain("completeInVoice(client, {");
      expect(source).not.toContain("await client.complete(");
    });
  }

  test("the puzzle reading and the chat call through the retry too", async () => {
    expect(await read("src/flow/usePuzzleReading.ts")).toContain("completeInVoice(client, {");
    const chat = await read("src/workbench/Dialogue.tsx");
    // M74b, ISC-665: the call passes the researcher's words too, for the quotation check.
    // M89: the offered-move turn (`ask`) left Dialogue, so the conversation turn is the one call.
    expect(chat.split("reviseInVoice(client, result, controller.signal, { quotable")).toHaveLength(2);
    // The turn records the first reply and the retry.
    expect(chat.split("voiceGateProvenance(result)").length).toBeGreaterThanOrEqual(2);
  });
});

/** A client that returns scripted replies and counts its calls. */
function scripted(...replies: string[]): InferenceClient & { readonly requests: CompleteRequest[] } {
  return new MockInferenceClient({ responses: replies });
}

describe("one retry for a reply that breaks a rule", () => {
  const OFFENDING = "You named two wards at Site. Nothing in it says which shift you watch.";

  test("a planted offending reply triggers exactly one retry, and the rewrite lands in place", async () => {
    const client = scripted(OFFENDING, "1. You haven't said which shift you watch.");
    const result = await completeInVoice(client, REQ);
    expect(client.requests).toHaveLength(2);
    expect(client.requests[1]?.system).toBe(REWRITE_SYSTEM);
    // The retry carries the sentence and the rule it broke.
    const asked = client.requests[1]?.messages[0]?.content ?? "";
    expect(asked).toContain("1. Nothing in it says which shift you watch.");
    expect(asked).toContain(rules.RULE_TEXT.L19);
    expect(result.text).toBe("You named two wards at Site. You haven't said which shift you watch.");
    expect(result.voiceRetry).toBe(true);
    expect(result.rawText).toBe(OFFENDING);
  });

  test("a clean reply triggers none", async () => {
    const client = scripted("You named two wards and the night shift at Site.");
    const result = await completeInVoice(client, REQ);
    expect(client.requests).toHaveLength(1);
    expect(result.voiceRetry).toBeUndefined();
    expect(result.rawText).toBeUndefined();
  });

  /* M74b, ISC-665 supersedes the single ask: a rewrite that still breaks a rule
   * gets one more ask, two asks are the most, and the text kept is the draft
   * with the fewest breaks. */
  test("a second miss gets one more ask, and the third is never made", async () => {
    const client = scripted(OFFENDING, "1. Nothing in it names the shift.", "1. Nothing names the shift.", "1. You haven't said which shift you watch.");
    const result = await completeInVoice(client, REQ);
    expect(client.requests).toHaveLength(3);
    expect(result.voiceRetry).toBe(true);
    expect(result.text).toContain("Nothing");
  });

  test("a failed retry keeps the first reply", async () => {
    let calls = 0;
    const client: InferenceClient = {
      complete: async (): Promise<CompleteResult> => {
        calls += 1;
        if (calls > 1) throw new Error("the bridge went away");
        return { text: OFFENDING, model: "m", modelVersion: "v" };
      },
    };
    const result = await completeInVoice(client, REQ);
    expect(calls).toBe(2);
    expect(result.text).toBe(OFFENDING);
    expect(result.voiceRetry).toBe(true);
  });

  test("reviseInVoice on an already streamed reply asks once", async () => {
    const client = scripted("1. You haven't said which ward you mean.");
    const first: CompleteResult = { text: "You never said which ward you mean.", model: "m", modelVersion: "v" };
    const result = await reviseInVoice(client, first);
    expect(client.requests).toHaveLength(1);
    expect(result.text).toBe("You haven't said which ward you mean.");
  });

  test("the rewrite request and its parse", () => {
    const offending = rules.offendingSentences("You never said. Nothing changed.");
    expect(offending.map((o) => o.sentence)).toEqual(["You never said.", "Nothing changed."]);
    expect(rewriteRequest("x", offending)).toContain("2. Nothing changed.");
    expect(parseRewrites("1. You haven't said.\n2) Your notes are the same.\nsomething else", 2)).toEqual([
      "You haven't said.",
      "Your notes are the same.",
    ]);
  });
});

describe("the record says the retry happened", () => {
  const base = { id: "11111111-2222-4333-8444-555555555555", ts: 1, actor: "human", projectId: "p", type: "bound", subject: "site", statement: "Two wards." };

  test("voiceRetry is additive and true when present", () => {
    expect(validateEvent(base as LedgerEvent)).toEqual([]);
    expect(validateEvent({ ...base, voiceRetry: true } as LedgerEvent)).toEqual([]);
    expect(validateEvent({ ...base, voiceRetry: false } as unknown as LedgerEvent)).toContain("voiceRetry is true when present");
  });

  test("the provenance bag carries it beside rawText", () => {
    expect(voiceGateProvenance({ text: "t", model: "m", modelVersion: "v" })).toEqual({});
    expect(voiceGateProvenance({ text: "t", model: "m", modelVersion: "v", rawText: "r", voiceRetry: true })).toEqual({
      rawText: "r",
      voiceRetry: true,
    });
  });

  test("paper fit: a planted reason goes back once and the paper-fit event records the retry", async () => {
    const paper: PaperRef = {
      key: "d1",
      name: "bechky-2006.pdf",
      chunks: [{ id: "c1", projectId: "p", documentId: "d1", kind: "literature", text: "a passage", index: 0 }],
    };
    const brief = {
      ...emptyBrief(),
      startingInterest: "How night shifts hand patients over.",
      researchQuestion: "Why is the handover accepted without being understood?",
      context: "Two wards of a teaching hospital, across the night shift boundary.",
      seminalCorpus: "Bechky 2006, ASQ",
    };
    const client = scripted(
      ["FIT: fits. Nothing in it is about wards, but it speaks to handovers.", "EXPECTS: Handoffs fail when the receiver cannot question the sender.", "SCOPE: on night shifts", "CITE: [[chunk:c1]]"].join("\n"),
      // M75: the rewrite keeps L21 as well, so it is read once.
      "1. The paper speaks to handovers, though it studies a different setting.",
    );
    const verdict = await judgePaperFit({ paper, context: studyContext(brief), client });
    expect(client.requests).toHaveLength(2);
    expect(verdict?.voiceRetry).toBe(true);
    expect(verdict?.reason).toBe("The paper speaks to handovers, though it studies a different setting.");
    let n = 0;
    const events = paperFitEvents({
      projectId: "p",
      paper,
      verdict: verdict!,
      framingDigest: "d",
      makeId: () => `aaaaaaaa-1111-4111-8111-${String((n += 1)).padStart(12, "0")}`,
      now: () => 1_700_000_000_000 + n,
    });
    const fit = events.find((e) => e.type === "paper-fit");
    expect(fit?.voiceRetry).toBe(true);
    for (const e of events) expect(validateEvent(e)).toEqual([]);
  });
});

/* The lead's ruling, 2026-10-02: the chat keeps the check and the one retry,
 * which runs after the stream ends; the rewritten sentences replace their
 * originals in place with a short fade, so the reply settles rather than jumps. */
describe("the chat's rewritten sentences settle in place", () => {
  test("settledSentences names only the sentences the first reply did not contain", async () => {
    const { settledSentences } = await import("../src/workbench/Dialogue.tsx");
    const raw = "You named two wards. Nothing in it says which shift you watch.\n\nQUESTION: Which shift do you watch?";
    expect(settledSentences("You named two wards. You haven't said which shift you watch.", raw)).toEqual([
      "You haven't said which shift you watch.",
    ]);
    expect(settledSentences("You named two wards.", raw)).toEqual([]);
    expect(settledSentences("You named two wards.", undefined)).toEqual([]);
  });

  test("the transcript carries them on a retried tool turn, and the turn fades them in only while fresh", async () => {
    const React = (await import("react")).default;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { buildTranscript, Turn } = await import("../src/workbench/Dialogue.tsx");
    const now = Date.now();
    const turn = {
      id: "aaaaaaaa-1111-4111-8111-000000000001",
      ts: now,
      actor: "persona:interviewer",
      model: "m",
      modelVersion: "v",
      projectId: "p",
      type: "response",
      station: "context",
      text: "You named two wards. You haven't said which shift you watch.",
      rawText: "You named two wards. Nothing in it says which shift you watch.",
      voiceRetry: true,
    } as unknown as LedgerEvent;
    const [entry] = buildTranscript([turn]);
    expect(entry?.settled).toEqual(["You haven't said which shift you watch."]);
    const fresh = renderToStaticMarkup(React.createElement(Turn, { entry: entry! }));
    expect(fresh).toContain('<span class="chat-settle" data-testid="voice-settled">You haven&#x27;t said which shift you watch.</span>');
    expect(fresh).toContain("You named two wards. ");
    const later = renderToStaticMarkup(React.createElement(Turn, { entry: { ...entry!, ts: now - 60_000 } }));
    expect(later).not.toContain("chat-settle");
    // A turn that kept every rule carries nothing to settle.
    const [plain] = buildTranscript([{ ...turn, voiceRetry: undefined, rawText: undefined } as unknown as LedgerEvent]);
    expect(plain?.settled).toBeUndefined();
  });

  test("the fade is opacity only, on the motion tokens, and off under reduced motion", async () => {
    const css = await read("src/ui/styles/design.css");
    expect(css).toContain(".chat-settle {\n  animation: chat-settle var(--motion-move) var(--motion-ease);");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n  \.chat-settle \{\n    animation: none;/);
  });
});

/* Found on the Safari walk of 2026-10-02: a conversation turn's offending
 * sentence sat on its QUESTION line, and the sentence sent back carried the
 * "QUESTION:" label, so the rewrite did not land; a rewrite that dropped the
 * label would also have cost the turn its parsed question. The label stays out
 * of the sentence and in the reply. */
describe("a structured reply's field label stays out of the retry", () => {
  test("offendingSentences reads the prose after a field label, not the label", () => {
    const reply = [
      "You named the cafe.",
      "",
      "QUESTION: Can you tell me about one argument you saw at the cafe?",
      "BECAUSE: Nothing in your answer names a single argument.",
    ].join("\n");
    expect(rules.offendingSentences(reply).map((o) => o.sentence)).toEqual([
      "Can you tell me about one argument you saw at the cafe?",
      "Nothing in your answer names a single argument.",
    ]);
  });

  test("the rewrite lands after the label, and the label survives", async () => {
    const reply = "You named the cafe.\n\nQUESTION: Can you tell me about one argument you saw at the cafe?";
    const client = scripted(reply, "1. Can you tell me about one argument between the volunteers that you saw?");
    const result = await completeInVoice(client, REQ);
    expect(client.requests).toHaveLength(2);
    expect(result.text).toBe("You named the cafe.\n\nQUESTION: Can you tell me about one argument between the volunteers that you saw?");
  });
});
