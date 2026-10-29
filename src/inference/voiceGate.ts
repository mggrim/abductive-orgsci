/**
 * The voice gate: the single place model text is normalised to the tool's
 * voice (FND-01).
 *
 * The house rule on dashes is absolute, and before this there was no
 * sanitizer anywhere in `src/`. `tests/prose-discipline.test.ts` policed
 * hand-written strings in four directories and nothing the model wrote, so
 * banned dashes reached the screen on four surfaces: the /design/tension
 * findings, the /coherence findings ("extensive fieldwork" joined to "dozens
 * of interviews" by an unspaced em dash, which also read as a typo), and two
 * /ontology draft bodies. The ontology cases were the worst of the four,
 * because a draft body is accepted into the researcher's own model and then
 * exported under their name.
 *
 * The gate lives at the inference boundary rather than in any renderer for one
 * reason: there are several parsers and a dozen render sites downstream, and
 * every one of them would have had to remember. There is exactly one way for
 * model text to enter this app, which is a `CompleteResult` returned by an
 * `InferenceClient`, so that is where the rule is enforced. A client added
 * later inherits nothing automatically, which is why
 * `tests/prose-discipline.test.ts` asserts the wiring per file.
 *
 * Two properties govern the implementation and they pull against each other.
 *
 * Rewrite, never delete. Stripping the character out of "fieldwork" joined to
 * "dozens" produces "fieldworkdozens". Every dash therefore becomes the
 * punctuation a careful writer would have used: a comma, a full stop, a colon,
 * or the word "to" in a range.
 *
 * Provenance stays exact. The ledger's claim is that it records what the model
 * actually said, and a gate that silently edited the record would break the
 * audit the whole product rests on. So the pre-normalised string is carried
 * back on `CompleteResult.rawText` whenever the gate changed anything, and
 * {@link voiceGateProvenance} hands it to an event author as a field bag that
 * validates against the ledger schema unchanged.
 *
 * Nothing is exempt, not even a fenced block or an inline code span. An
 * earlier draft masked those out, on the reasoning that a persona quoting a
 * literal owes nothing to the tool's voice. It was wrong for this product: the
 * bar is a grep of the rendered DOM across every route with zero permitted
 * occurrences, and a carve-out is a hole in exactly the place a critic looks.
 * The existing carve-out for the 29 matrix prompts survives because those are
 * hand-authored source strings rendered inside a `code` element that says what
 * they are, and model output carries no such marking and cannot earn one at
 * runtime. Where the rewrite touches a quotation, `rawText` keeps the
 * quotation exact and the chunk store still holds the source unaltered.
 *
 * The choice of replacement is a heuristic and is meant to be. It is tuned to
 * read correctly on the prose these personas actually produce, and the raw
 * string is kept precisely so a wrong call is recoverable rather than lossy.
 */

import type { CompleteResult, StreamDelta } from "./types.ts";

/**
 * Figure dash, en dash, em dash, horizontal bar. Written as escapes so this
 * file states the rule without containing the characters it bans.
 *
 * U+2212 MINUS SIGN is deliberately absent: it is arithmetic, not punctuation,
 * and rewriting it would corrupt a negative number. The ASCII double hyphen is
 * left alone too, because it is a command-line flag as often as it is a dash
 * surrogate.
 */
const DASH_CLASS = "\\u2012\\u2013\\u2014\\u2015";
const DASH = new RegExp(`[${DASH_CLASS}]`);

/** True when text carries a dash the house rule bans. */
export function containsBannedDash(text: string): boolean {
  return DASH.test(text);
}

/**
 * A dash opening a line is a bullet, not punctuation between clauses, so it
 * becomes a markdown bullet rather than being folded into the line above.
 */
const BULLET_LINE = new RegExp(`^([ \\t]*)[${DASH_CLASS}][ \\t]+`, "gm");

/**
 * Range operands: a number with an optional unit or ordinal tail, so "1990s"
 * and "12th" both count, plus months and weekdays. Both sides have to be
 * operands for the range rule to fire, which keeps "the 1990s" joined to "when
 * the field consolidated" out of it.
 */
const RANGE_OPERAND =
  "(?:\\d+[a-z]{0,2}|January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)";
const RANGE = new RegExp(
  `\\b(${RANGE_OPERAND})[ \\t]*[${DASH_CLASS}][ \\t]*(?=${RANGE_OPERAND}\\b)`,
  "gi",
);

/**
 * The material after the dash is an independent clause, so the dash was
 * joining two sentences and a full stop is what it meant. Bare subject
 * pronouns are enough on their own; the demonstratives need a finite verb
 * because "that" and "those" open appositives at least as often as clauses,
 * and turning an appositive into a sentence manufactures a fragment.
 */
const OPENS_CLAUSE = /^(?:i|we|you|he|she|it|they|there)\s+\S/i;
const OPENS_DEMONSTRATIVE_CLAUSE =
  /^(?:this|that|these|those)\s+(?:is|are|was|were|has|have|had|will|would|can|could|should|must|may|might|do|does|did)\s/i;

/**
 * An all-caps token at the start of a line is a label, and a dash after a
 * label is a colon. This is load-bearing rather than cosmetic: `parseVerdict`
 * in the semantic checks (`lint/semantic.ts`, on the branch `with-checks` since M89) reads the model's "CONCERN" first line and strips
 * a leading run of whitespace, colons and dashes off the reason that follows.
 * A comma there would have survived that strip and shipped every coherence
 * finding with a leading comma, so the gate has to produce the mark the parser
 * already expects.
 */
const LEADING_LABEL = /(?:^|\n)[ \t]*[A-Z][A-Z0-9 ]{1,29}$/;

/** A dash straight after a copula introduces what the copula promised. */
const COPULA_TAIL = /\b(?:is|are|was|were|means|amounts to|comes down to)$/i;

type Glue = ", " | ". " | ": ";

/**
 * Split into sentences, terminators and trailing spaces attached to the piece
 * they close, so `pieces.join("") === text`. Deliberately naive about "e.g.":
 * an over-eager split only narrows the window the paired-dash rule looks at,
 * which costs a comma instead of a comma, so the failure mode is nothing.
 */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\n") {
      out.push(text.slice(start, i + 1));
      start = i + 1;
      continue;
    }
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    let j = i + 1;
    while (j < text.length && ".!?\"')]".includes(text[j] ?? "")) j += 1;
    const next = text[j];
    if (next !== undefined && next !== " " && next !== "\t" && next !== "\n") continue;
    while (text[j] === " " || text[j] === "\t") j += 1;
    out.push(text.slice(start, j));
    start = j;
    i = j - 1;
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

function capitaliseFirst(s: string): string {
  const first = s[0];
  if (first === undefined) return s;
  return first.toUpperCase() + s.slice(1);
}

/** Replace the single dash at `at` with `glue`, tidying the seams. */
function applyGlue(sentence: string, at: number, glue: Glue): string {
  const left = sentence.slice(0, at).replace(/[ \t]+$/, "");
  const right = sentence.slice(at + 1).replace(/^[ \t]+/, "");

  // Nothing to join on the left: the dash was an opening interruption mark and
  // the sentence is simply what followed it.
  if (left === "" || /[\r\n]$/.test(left)) {
    return `${left}${capitaliseFirst(right)}`;
  }

  // Nothing to join on the right: the sentence ends here, so it ends properly.
  if (right === "" || /^[\r\n]/.test(right)) {
    return `${left}${/[.!?,;:]$/.test(left) ? "" : "."}${right}`;
  }

  // The left already carries a break. Stacking a second mark reads as the
  // typo this whole gate exists to prevent.
  if (/[,;:.!?]$/.test(left)) {
    return `${left} ${glue === ". " ? capitaliseFirst(right) : right}`;
  }

  return `${left}${glue}${glue === ". " ? capitaliseFirst(right) : right}`;
}

function chooseGlue(left: string, right: string): Glue {
  if (LEADING_LABEL.test(left)) return ": ";
  if (COPULA_TAIL.test(left)) return ": ";
  if (OPENS_CLAUSE.test(right) || OPENS_DEMONSTRATIVE_CLAUSE.test(right)) return ". ";
  return ", ";
}

function dashPositions(sentence: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < sentence.length; i += 1) {
    if (DASH.test(sentence[i] ?? "")) out.push(i);
  }
  return out;
}

function fixSentence(sentence: string): string {
  const positions = dashPositions(sentence);
  if (positions.length === 0) return sentence;

  // Two or more dashes in one sentence is a parenthetical pair far more often
  // than it is two clause joins, and commas are right for both readings.
  // A full stop inside a pair would split the sentence around its own aside
  // and leave a fragment, so the multi-dash case never reaches chooseGlue.
  if (positions.length > 1) {
    let out = sentence;
    for (let k = positions.length - 1; k >= 0; k -= 1) {
      out = applyGlue(out, positions[k] as number, ", ");
    }
    return out;
  }

  const at = positions[0] as number;
  const left = sentence.slice(0, at).replace(/[ \t]+$/, "");
  const right = sentence.slice(at + 1).replace(/^[ \t]+/, "");
  return applyGlue(sentence, at, chooseGlue(left, right));
}

/**
 * Rewrite every banned dash in model prose to the punctuation it stood for.
 *
 * Idempotent by construction: the output carries no banned dash, so a second
 * pass is the identity. That matters because a result can cross the gate twice
 * when a client both streams deltas and returns a final envelope.
 */
export function normaliseModelProse(text: string): string {
  if (!DASH.test(text)) return text;
  let out = text.replace(BULLET_LINE, "$1- ");
  out = out.replace(RANGE, "$1 to ");
  return splitSentences(out).map(fixSentence).join("");
}

/**
 * Normalise a completion and keep the original.
 *
 * `rawText` is set only when the gate changed something, so the ledger does
 * not carry a duplicate of every clean response. When a result crosses the
 * gate twice the first raw string wins, because the audit question is what the
 * model said and not what an intermediate pass produced.
 */
export function applyVoiceGate(result: CompleteResult): CompleteResult {
  const text = normaliseModelProse(result.text);
  if (text === result.text) return result;
  return { ...result, text, rawText: result.rawText ?? result.text };
}

/**
 * The provenance field bag for an event author.
 *
 * Spread into any ledger event built from a gated completion. It is additive
 * rather than a new event type because the pre-normalised string is a property
 * of a response that already gets recorded, not a separate thing that
 * happened, and `validateEvent` accepts it on every variant unchanged.
 * `exactOptionalPropertyTypes` is why this returns an empty object rather than
 * `{ rawText: undefined }`.
 */
export function voiceGateProvenance(result: CompleteResult): { rawText?: string; voiceRetry?: true } {
  /* M69, ISC-644: the retry for the owner's rules rides in the same bag, so
     every event built from a gated completion records it without a second spread. */
  return {
    ...(result.rawText === undefined ? {} : { rawText: result.rawText }),
    ...(result.voiceRetry === true ? { voiceRetry: true as const } : {}),
  };
}

/** Index of the start of the last sentence in a partial stream. */
function lastSentenceStart(raw: string): number {
  for (let i = raw.length - 1; i >= 0; i -= 1) {
    const ch = raw[i] ?? "";
    if (ch === "\n") return i + 1;
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const next = raw[i + 1];
    if (next === " " || next === "\t" || next === "\n") return i + 1;
  }
  return 0;
}

/**
 * The portion of a partial stream whose normalisation can no longer change.
 *
 * Cut at the first dash of the sentence still being written, and drop the
 * trailing spaces. Both halves of that matter. Text before that dash is
 * settled because every rule in the gate only ever rewrites the dash site
 * itself and what follows it, never the words in front. The trailing spaces
 * come off because `applyGlue` right-trims the left side, so a space emitted
 * before a dash arrived would be a space the finished text does not contain,
 * and emitted characters cannot be recalled. An earlier version cut at the
 * whole sentence instead and re-sent it once the dash landed, which duplicated
 * the sentence on screen.
 */
function settledPrefix(raw: string): string {
  let cut = raw.length;
  for (let i = lastSentenceStart(raw); i < raw.length; i += 1) {
    if (DASH.test(raw[i] ?? "")) {
      cut = i;
      break;
    }
  }
  return raw.slice(0, cut).replace(/[ \t]+$/, "");
}

export interface StreamVoiceGate {
  /** Feed one raw delta from the provider. */
  push(text: string): void;
  /** Flush the tail. Returns the fully normalised text. */
  finish(): string;
  /** Everything the provider actually sent, unmodified. */
  raw(): string;
}

/**
 * Gate a streaming completion delta by delta.
 *
 * Without this a dash appeared on screen while the answer streamed and then
 * changed under the researcher when the final envelope landed, which is worse
 * than either state alone. The gate holds back from the dash it is not yet
 * sure about and releases once the sentence closes, so at streaming speed the
 * pause is a fraction of a second and no banned character is ever painted.
 */
export function createStreamVoiceGate(
  onDelta: (delta: StreamDelta) => void,
): StreamVoiceGate {
  let raw = "";
  let emitted = "";

  const flush = (upTo: string): void => {
    const normalised = normaliseModelProse(upTo);
    // Shorter than what is already on screen means this call is a hold-back,
    // not a correction. Re-sending later would print the held text twice.
    if (normalised.length < emitted.length) return;
    if (!normalised.startsWith(emitted)) {
      // Unreachable given settledPrefix, and kept because the alternative to
      // resynchronising silently is duplicating text the researcher is
      // reading. The CompleteResult stays the source of truth for anything
      // persisted, so a stream that diverges costs a gap and never a wrong
      // record.
      emitted = normalised;
      return;
    }
    const delta = normalised.slice(emitted.length);
    if (delta === "") return;
    emitted = normalised;
    onDelta({ text: delta });
  };

  return {
    push(text: string): void {
      raw += text;
      flush(settledPrefix(raw));
    },
    finish(): string {
      flush(raw);
      return normaliseModelProse(raw);
    },
    raw: () => raw,
  };
}
