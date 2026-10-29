/**
 * M74b, ISC-665: the voice retry's rewrite pass, and quotation
 * (docs/walks/2026-10-02-phd-student-walk.md, "Abductive's prose against the
 * owner's rules").
 *
 * Abductive rewrote 27 of its 28 chat replies on the walk, and the retry often
 * fixed a wh-clause (L13) by turning it into a noun with a reduced relative, so
 * L18 breaks survived into the final text. The second ask now carries the
 * broken rule, the rule it must also keep, and the right shape; the result is
 * read against every rule; one more ask follows a rewrite that breaks a new
 * rule; and the final text is the draft with the fewest breaks.
 */

import { describe, expect, test } from "bun:test";
import { MockInferenceClient } from "../src/inference/mock.ts";
import type { CompleteRequest } from "../src/inference/types.ts";
import { reviseInVoice, rewriteRequest } from "../src/inference/voiceRetry.ts";
import { misquotedSpans, offendingSentences, sentenceBreaks } from "../src/copy/rules.ts";
import { OWNER_RULES } from "../src/personas/voice.ts";

/** The walk's table, one sentence a row, as Abductive's retry left it, with a fix in the owner's rules. */
const WALK: readonly { readonly final: string; readonly fixed: string }[] = [
  {
    final: "This first step is for getting the setting of your study on the table: the subject you're looking at, and the interest that pulled you toward it.",
    fixed: "This first step is for getting the setting of your study on the table: the subject that you're looking at, and the interest that pulled you toward it.",
  },
  {
    final: "It's fine that you can't yet name the reason it moved you.",
    fixed: "It's fine that you can't yet name the reason that it moved you.",
  },
  {
    final: "Which moment among everything you saw across the two Saturdays first made you think it was worth understanding?",
    fixed: "Which moment among everything that you saw across the two Saturdays first made you think it was worth understanding?",
  },
  {
    final: "In this step, you describe the setting of your project, so that someone new to your repair café can see the place you're asking about.",
    fixed: "In this step, you describe the setting of your project, so that someone new to your repair café can see the place that you're asking about.",
  },
  {
    final: "You also said you wanted to know the reason people bother, and you watched the owners you met across your two Saturdays.",
    fixed: "You also said you wanted to know the reason that people bother, and you watched the owners that you met across your two Saturdays.",
  },
  {
    final: "You've also named one limit of the place as a view: you'll see little of the use people make of their repaired things once they get them home.",
    fixed: "You've also named one limit of the place as a view: you'll see little of the use that people make of their repaired things once they get them home.",
  },
  {
    final: "This step is about the differences in outcome at the close of the repair, and the evidence you'd have to see or hear to say that the difference really happened.",
    fixed: "This step is about the differences in outcome at the close of the repair, and the evidence that you'd have to see or hear to say that the difference really happened.",
  },
  {
    final: "You've named two things there: whether a repair succeeds, and the feelings people have about it afterward.",
    fixed: "You've named two things there: whether a repair succeeds, and the feelings that people have about it afterward.",
  },
  {
    final: "That contrast is the gap I'm looking for in this step, so I'd like to hear it in your words.",
    fixed: "I'm looking for that contrast in this step, so I'd like to hear it in your words.",
  },
  {
    final: "You drew your question straight from the arguments you saw and heard at the café, and you've given this step the contrast it requires.",
    fixed: "You drew your question straight from the arguments that you saw and heard at the café, and you've given this step the contrast that it requires.",
  },
  {
    final: "This step is for finding the pull in two directions: the demands or accounts that the people you're studying can't settle, and the people feeling that pull.",
    fixed: "This step is for finding the pull in two directions: the demands or accounts that the people whom you're studying can't settle, and the people feeling that pull.",
  },
  {
    final: "Your guess came out as a claim about the volunteers' wants, and I'd like to anchor it in an event you saw or heard.",
    fixed: "Your guess came out as a claim about the volunteers' wants, and I'd like to anchor it in an event that you saw or heard.",
  },
  {
    final: "I'd like to know whether the difference goes beyond the two Saturdays you attended.",
    fixed: "I'd like to know whether the difference goes beyond the two Saturdays that you attended.",
  },
];

/** A client that answers each rewrite ask with the next scripted line, numbered as the parser reads it. */
function scripted(...rewrites: readonly string[]) {
  const asks: CompleteRequest[] = [];
  const client = new MockInferenceClient({ responses: rewrites.map((r) => `1. ${r}`) });
  const complete = client.complete.bind(client);
  client.complete = (req: CompleteRequest) => {
    asks.push(req);
    return complete(req);
  };
  return { client, asks };
}
const first = (text: string) => ({ text, model: "m", modelVersion: "m" });
const breaks = (text: string) => offendingSentences(text).flatMap((o) => o.breaks);

describe("the walk's thirteen sentences", () => {
  test("each breaks L18 as the retry left it, and each fix keeps every rule", () => {
    for (const row of WALK) {
      expect(sentenceBreaks(row.final).map((b) => b.rule)).toContain("L18");
      expect(sentenceBreaks(row.fixed)).toEqual([]);
    }
  });

  test("each ends with no break, through a rewrite that broke a new rule and the one more ask that follows", async () => {
    for (const row of WALK) {
      // The walk's own failure: the first rewrite swaps the reduced relative for a wh-clause (L13).
      const relapse = `${row.fixed.replace(/[.?]$/, "")}, and I'd like to know what you saw.`;
      expect(sentenceBreaks(relapse).map((b) => b.rule)).toContain("L13");
      const { client, asks } = scripted(relapse, row.fixed);
      const result = await reviseInVoice(client, first(row.final));
      expect(breaks(result.text)).toEqual([]);
      expect(asks.length).toBeLessThanOrEqual(2);
      expect(result.voiceRetry).toBe(true);
      expect(result.rawText).toBe(row.final);
    }
  });
});

describe("the second ask", () => {
  test("carries the broken rule, the rule it must also keep, and the right shape for L18", () => {
    const offending = offendingSentences(WALK[0]!.final);
    const ask = rewriteRequest(WALK[0]!.final, offending);
    expect(ask).toContain("State each clause's subject before its verb");
    expect(ask).toMatch(/Also keep: Use who, what, when, where, why and how only to ask a question/);
    expect(ask).toContain('"the subject you\'re looking at" becomes "the subject that you\'re looking at"');
    expect(ask).toMatch(/put the agent first/);
  });

  test("a rewrite that breaks a new rule gets one more ask, and two asks are the most", async () => {
    const sentence = WALK[1]!.final;
    const { client, asks } = scripted("It's fine that you can't yet say why it moved you.", "It's fine that you can't yet say why.", "never asked");
    const result = await reviseInVoice(client, first(sentence));
    expect(asks).toHaveLength(2);
    /* M78b, ISC-682: the first rewrite fixed L18 by breaking L13, so Abductive
     * refuses it, keeps the sentence, and the second ask names the sentence
     * again, with the rule it must also keep and the reason the rewrite went. */
    const second = asks[1]!.messages[0]!.content;
    expect(second).toContain(`1. ${sentence}`);
    expect(second).toContain("Use who, what, when, where, why and how only to ask a question");
    expect(second).toContain("Your last rewrite of this sentence broke another rule");
    expect(result.text).not.toContain("say why it moved you");
    expect(result.text).not.toBe("never asked");
  });

  test("the final text is the draft with the fewest breaks", async () => {
    const sentence = "You said you wanted to know the reason people bother, and nothing came of it.";
    // Two breaks in the first reply. The first rewrite fixes one, the second rewrite breaks three.
    const { client } = scripted(
      "You said you wanted to know the reason that people bother, and nothing came of it.",
      "You said you never knew why people bother, and nothing came of it.",
    );
    const result = await reviseInVoice(client, first(sentence));
    expect(result.text).toBe("You said you wanted to know the reason that people bother, and nothing came of it.");
  });
});

describe("the X-not-Y reframe and rather than (the walk's rules section)", () => {
  test("the runtime check reads both", () => {
    expect(sentenceBreaks("This step is for finding something that unfolds over time, so that you have a thing to follow rather than a state of affairs to describe.").map((b) => b.rule)).toContain("REFRAME");
    expect(sentenceBreaks("In this step, you name a puzzle so that your project has a question to answer rather than a topic to look at.").map((b) => b.rule)).toContain("REFRAME");
    expect(sentenceBreaks("Tell me whether the difference is a real pattern and not an accident of two Saturdays.").map((b) => b.rule)).toContain("REFRAME");
    expect(sentenceBreaks("It's an observation, not a diagnosis.").map((b) => b.rule)).toContain("REFRAME");
    expect(sentenceBreaks("Did you hear them argue, or not?")).toEqual([]);
  });

  test("the model's rules block names both", () => {
    expect(OWNER_RULES).toMatch(/"rather than"/);
    expect(OWNER_RULES).toMatch(/"X, not Y" reframe/);
    expect(OWNER_RULES.split(/\s+/).length).toBeLessThan(200);
  });
});

describe("quotation (the walk's rules section)", () => {
  const said = [
    "Why do they argue about whether a toaster is worth fixing, but not a bike? I think that's it, but it doesn't sound very clever.",
  ];

  test("a quoted span the researcher did not write is a misquotation", () => {
    expect(misquotedSpans('so I don\'t share a worry that you\'re "not very clever."', said)).toEqual(["not very clever."]);
    expect(misquotedSpans('You said it "doesn\'t sound very clever".', said)).toEqual([]);
    expect(misquotedSpans("You said it “doesn't sound very clever”.", said)).toEqual([]);
    expect(misquotedSpans("A reply with no quotation.", said)).toEqual([]);
  });

  test("a reply that misquotes goes back with the rule, and the quote comes back verbatim or as a paraphrase", async () => {
    const reply = 'You\'ve given this step the contrast that it requires, so I don\'t share a worry that you\'re "not very clever."';
    const { client, asks } = scripted("You've given this step the contrast that it requires, so I don't share your worry that the question doesn't sound clever enough.");
    const result = await reviseInVoice(client, first(reply), undefined, { quotable: said });
    expect(asks).toHaveLength(1);
    expect(asks[0]!.messages[0]!.content).toMatch(/Quote the researcher only word for word/);
    expect(misquotedSpans(result.text, said)).toEqual([]);
  });

  test("a misquotation on a marked line is rewritten after its label, and the label stays (the Safari walk)", async () => {
    const reply = [
      "Have you thought about where you want this project to land?",
      "",
      "QUESTION: Have you thought about where you want this project to land?",
      'BECAUSE: The target journal is the part we haven\'t covered, and your answer, even if it\'s "still working it out," completes the setting.',
    ].join("\n");
    const { client, asks } = scripted("The target journal is the part that we haven't covered, and your answer completes the setting.");
    const result = await reviseInVoice(client, first(reply), undefined, { quotable: ["I think there's stuff on volunteering?"] });
    expect(asks).toHaveLength(1);
    expect(asks[0]!.messages[0]!.content).toContain("\n1. The target journal is the part we haven't covered");
    expect(result.text).toContain("BECAUSE: The target journal is the part that we haven't covered, and your answer completes the setting.");
  });

  test("the conversation's prompt forbids it", async () => {
    const { conversationPrompt } = await import("../src/interview/conversationPrompt.ts");
    const prompt = conversationPrompt({
      place: "puzzle",
      placeLabel: "Puzzle",
      purpose: "p",
      stationQuestion: "q",
      mode: "interrogation",
      opener: false,
      nothingWrittenYet: false,
      stepAnswered: false,
      chunks: [],
      ontologySummary: "",
      here: [],
      earlier: [],
    });
    expect(prompt).toMatch(/Quote the researcher only word for word/);
  });
});
