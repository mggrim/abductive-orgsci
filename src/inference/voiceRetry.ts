/**
 * One retry for the owner's rules (M69, ISC-644).
 *
 * The prompt carries the rules (`OWNER_RULES` in `personas/voice.ts`), and a
 * model still breaks one now and then. So after a call whose prose a researcher
 * reads, the detectors in `copy/rules.ts` read the reply sentence by sentence.
 * When a sentence breaks a rule, Abductive asks the model once to rewrite only
 * the offending sentences, each with the rule it broke, and splices the new
 * sentences into the reply in place. The result is accepted either way: a
 * second miss is kept rather than looped on, because a loop on a detector is a
 * loop on its false positives too.
 *
 * The record says it happened. `voiceRetry: true` rides on the result, and
 * `voiceGateProvenance` spreads it onto the event with `rawText`, which keeps
 * the reply as the model first wrote it. Both fields are additive.
 */

import {
  ALSO_KEEP,
  FIELD_LABEL,
  misquotedSpans,
  offendingSentences,
  quotedSpans,
  sentenceBreaks,
  RULE_SHAPE,
  RULE_TEXT,
  sentencesOf,
  type OffendingSentence,
  type RuleBreak,
  type RuleId,
} from "../copy/rules.ts";
import { OWNER_RULES } from "../personas/voice.ts";
import type { CompleteRequest, CompleteResult, InferenceClient } from "./types.ts";

/** The instruction for the rewrite call. */
export const REWRITE_SYSTEM = [
  "You rewrite single sentences so that each keeps the writing rules below, and you change nothing else.",
  "Keep each sentence's meaning, its facts, its names and its register. Keep any quotation exactly as it is, unless the sentence's rule says that it misquotes the researcher.",
  "A rewrite keeps every rule, the ones named beside the sentence and all of those below. Fixing one rule by breaking another is not a fix.",
  "If a sentence breaks a rule only inside a quotation, return the sentence unchanged.",
  "Reply with one line per sentence, in the order given, each line opening with the sentence's number and a full stop, and write only those lines.",
  "",
  OWNER_RULES,
].join("\n");

/** How many times Abductive asks for a rewrite at most (M74b, ISC-665). */
export const MAX_REWRITES = 2;

/**
 * The user turn for the rewrite call: the reply for context, then the numbered
 * sentences, each with the rule it broke, the rule that its rewrite must also
 * keep, and the right shape where a rewrite tends to miss it (M74b, ISC-665).
 */
export function rewriteRequest(
  reply: string,
  offending: readonly OffendingSentence[],
  refused: ReadonlySet<string> = new Set(),
): string {
  return [
    "# Your reply, for context",
    replyContext(reply, offending),
    "",
    "# Rewrite these sentences",
    ...offending.map((o, i) => {
      const rules = [...new Set(o.breaks.map((b) => b.rule))];
      const also = [...new Set(rules.flatMap((r) => ALSO_KEEP[r] ?? []))].filter((r) => !rules.includes(r));
      const shapes = rules.flatMap((r) => (RULE_SHAPE[r] === undefined ? [] : [RULE_SHAPE[r]]));
      return [
        `${i + 1}. ${o.sentence}`,
        `   Rule: ${rules.map((r) => RULE_TEXT[r]).join(" ")}${o.breaks.map((b) => (b.at === "" ? "" : ` (at "${b.at}")`)).join("")}`,
        ...(also.length === 0 ? [] : [`   Also keep: ${also.map((r) => RULE_TEXT[r]).join(" ")}`]),
        ...(shapes.length === 0 ? [] : [`   Shape: ${shapes.join(" ")}`]),
        ...(refused.has(o.sentence)
          ? ["   Your last rewrite of this sentence broke another rule or changed a word that someone said, so Abductive kept the sentence."]
          : []),
      ].join("\n");
    }),
  ].join("\n");
}

/** Past this length the context is the offending lines alone (M78b, ISC-682). */
export const CONTEXT_CHARS = 1200;

/**
 * The reply as the rewrite ask carries it (M78b, ISC-682). A chat turn goes
 * whole. A long structured reply goes as the lines that hold the sentences to
 * rewrite: on the serendipity walk's data read the suggester's 3,400-character
 * reply rode on each of two rewrite asks, and they took 11 and 7 seconds.
 */
export function replyContext(reply: string, offending: readonly OffendingSentence[]): string {
  if (reply.length <= CONTEXT_CHARS) return reply;
  const lines = reply.split(/\n/).filter((line) => offending.some((o) => line.includes(o.sentence)));
  return lines.length === 0 ? reply.slice(0, CONTEXT_CHARS) : [...new Set(lines)].join("\n");
}

/** The rewritten sentences by position, from the numbered lines of the reply. */
export function parseRewrites(text: string, count: number): readonly (string | undefined)[] {
  const out: (string | undefined)[] = Array.from({ length: count }, () => undefined);
  for (const line of text.split(/\n/)) {
    const m = line.trim().match(/^(\d+)[.)]\s+(.+)$/);
    if (m === null) continue;
    const at = Number(m[1]) - 1;
    const sentence = (m[2] ?? "").trim();
    if (at >= 0 && at < count && sentence !== "") out[at] = sentence;
  }
  return out;
}

/** What the retry reads beside the reply: the researcher's own words, for quotation (M74b). */
export interface VoiceCheck {
  /** Every turn the researcher wrote; a quoted span in the reply must appear in them. */
  readonly quotable?: readonly string[];
}

/**
 * The sentences of a reply that break a rule, with a misquotation read as a
 * break of the sentence that carries it (M74b, ISC-665).
 */
export function voiceBreaks(text: string, check: VoiceCheck = {}): readonly OffendingSentence[] {
  const out = offendingSentences(text).map((o) => ({ sentence: o.sentence, breaks: [...o.breaks] }));
  if (check.quotable === undefined) return out;
  for (const span of misquotedSpans(text, check.quotable)) {
    /* Read the way `offendingSentences` reads: a field label stays out of the
     * sentence, so the rewrite cannot drop the label that the turn's parser
     * reads (the M74b Safari walk lost a BECAUSE: label this way). */
    const sentence = text
      .split(/\n/)
      .flatMap((line) => sentencesOf(line.trim().replace(FIELD_LABEL, "")))
      .map((x) => x.trim())
      .find((x) => x.includes(span));
    if (sentence === undefined) continue;
    const quote: RuleBreak = { rule: "QUOTE" as RuleId, at: span };
    const had = out.find((o) => o.sentence === sentence);
    if (had === undefined) out.push({ sentence, breaks: [quote] });
    else had.breaks.push(quote);
  }
  return out;
}

/* Openers that are not names, for the attribution check below. */
const NOT_NAMES = new Set(
  (
    "The A An I I'd I'm I've I'll You You've You'd You're You'll Your Yours We We've We're It It's Its This That These Those There Their They They're " +
    "In On At For From To With By Of And But So Or If When While As After Before Since Because Although Though Once Here Now Then Thanks Thank Yes " +
    "My Our What Which Who Where Why How Do Does Did Is Are Was Were Has Have Had Can Could Would Should Will May Might Let One Two Three Each Every Some Any"
  ).split(" "),
);

const SPEECH = /^(?:calls?|called|calling|says?|said|told|tells|wrote|writes|thinks?|thought|describes?|described)$/;

/**
 * The names in a sentence: capitalised words after its first, and the first
 * word when it is a possessive or speaks ("Dave calls the crib …"), the
 * openers that aren't names left out.
 */
function namesIn(sentence: string): readonly string[] {
  const out = new Set<string>();
  const words = sentence.replace(/[\u2018\u2019]/g, "'").split(/\s+/).filter((w) => w !== "");
  words.forEach((raw, i) => {
    const possessive = /'s[)"'\u201d.,;:!?]*$/.test(raw);
    const w = raw.replace(/^[("'\u201c]+/, "").replace(/[)"'\u201d.,;:!?]+$/, "").replace(/'s$/, "");
    if (!/^[A-Z][a-z]+$/.test(w) || NOT_NAMES.has(w)) return;
    const opens = i === 0 || /[.!?:]["'\u201d)]?$/.test(words[i - 1] ?? "");
    if (!opens || possessive || SPEECH.test((words[i + 1] ?? "").toLowerCase())) out.add(w);
  });
  return [...out];
}

/**
 * Whether a rewrite of one sentence may replace it (M78b, ISC-682). It breaks
 * no rule that the sentence didn't break, it misquotes nobody, and it keeps the
 * sentence's attributed words: every quotation verbatim, inside its marks, and
 * every name. On the serendipity walk a rewrite kept "calmer" and moved it from
 * Dave's crib to "the booking system that people call", and another fixed L13
 * with a stranded preposition that L18 now names.
 */
export function acceptedRewrite(original: string, rewrite: string, check: VoiceCheck = {}): boolean {
  const before = new Set(sentenceBreaks(original).map((b) => b.rule));
  if (sentenceBreaks(rewrite).some((b) => !before.has(b.rule))) return false;
  const misquoted = new Set(check.quotable === undefined ? [] : misquotedSpans(original, check.quotable));
  if (check.quotable !== undefined && misquotedSpans(rewrite, check.quotable).length > 0 && misquoted.size === 0) return false;
  const quoted = new Set(quotedSpans(rewrite));
  for (const span of quotedSpans(original)) {
    if (!misquoted.has(span) && !quoted.has(span)) return false;
  }
  const kept = new Set(namesIn(rewrite));
  return namesIn(original).every((name) => kept.has(name));
}

const breakCount = (text: string, check: VoiceCheck) =>
  voiceBreaks(text, check).reduce((n, o) => n + o.breaks.length, 0);

/**
 * Read a finished reply against the rules and, when a sentence breaks one, ask
 * for the offending sentences again (M69, ISC-644; M74b, ISC-665).
 *
 * Every rewrite is read against every rule. A rewrite that leaves a break, or
 * makes a new one, gets one more ask, and two asks are the most. The text kept
 * is the draft with the fewest breaks, the first reply included, so a retry
 * that makes things worse costs nothing. `signal` is the first call's, so the
 * chat's Stop reaches the retry too.
 */
export async function reviseInVoice(
  client: InferenceClient,
  first: CompleteResult,
  signal?: AbortSignal,
  check: VoiceCheck = {},
): Promise<CompleteResult> {
  if (voiceBreaks(first.text, check).length === 0) return first;
  let text = first.text;
  let best = first.text;
  let fewest = breakCount(first.text, check);
  let refused = new Set<string>();
  for (let ask = 0; ask < MAX_REWRITES; ask += 1) {
    const offending = voiceBreaks(text, check);
    if (offending.length === 0) break;
    let reply: CompleteResult;
    try {
      reply = await client.complete({
        system: REWRITE_SYSTEM,
        messages: [{ role: "user", content: rewriteRequest(text, offending, refused) }],
        ...(signal === undefined ? {} : { signal }),
      });
    } catch {
      /* A failed or stopped retry keeps the best text so far, which the reader
         has already seen in the chat: the retry is a second chance, and losing
         the reply to it would cost the researcher more than the rule. */
      break;
    }
    const rewrites = parseRewrites(reply.text, offending.length);
    let next = text;
    const refusedNow = new Set<string>();
    offending.forEach((o, i) => {
      const sentence = rewrites[i];
      if (sentence === undefined || sentence === o.sentence) return;
      /* M78b, ISC-682: a rewrite that adds a break or moves an attributed word
         is refused, and the sentence goes back with the reason on the next ask. */
      if (!acceptedRewrite(o.sentence, sentence, check)) {
        refusedNow.add(o.sentence);
        return;
      }
      next = next.split(o.sentence).join(sentence);
    });
    refused = refusedNow;
    if (next === text && refusedNow.size === 0) break;
    text = next;
    const count = breakCount(text, check);
    if (count < fewest) {
      fewest = count;
      best = text;
    }
  }
  return best === first.text
    ? { ...first, voiceRetry: true }
    : { ...first, text: best, rawText: first.rawText ?? first.text, voiceRetry: true };
}

/** `client.complete`, then the retry. The call every prose prompt a researcher reads goes through. */
export async function completeInVoice(client: InferenceClient, request: CompleteRequest): Promise<CompleteResult> {
  return reviseInVoice(client, await client.complete(request), request.signal);
}

/** The additive field for an event built from a result, present only when the retry ran. */
export function voiceRetryField(result: { readonly voiceRetry?: true }): { voiceRetry?: true } {
  return result.voiceRetry === true ? { voiceRetry: true } : {};
}
