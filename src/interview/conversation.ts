/**
 * The conversation at a place, as data (M37, ISC-482 … ISC-488).
 *
 * A station used to be a form with a chatbot beside it: the station's own
 * question was never asked in the conversation, and the conversation never
 * helped fill the station's box. A co-author read the hosted example and
 * asked whether each question could evolve as a chat instead, with follow-ups
 * that let a junior scholar ease into an answer they do not yet have.
 *
 * This module is the part of that with no React and no model in it: where a
 * conversation belongs, what the tool's reply is made of, and how a draft made
 * of the researcher's own words comes back. Kept apart from the prompt
 * assembly next door for the reason `designDigest` is kept apart from
 * `prompt.ts`: the parsing is what the record depends on, and the record has to
 * be testable without asking a model anything.
 *
 * Two rules are carried here rather than in the component, because a component
 * is where a rule goes to be forgotten:
 *
 *   - Every question the tool puts is on the record with the reason it was
 *     asked (ISC-45). When the model does not mark its two lines the reason
 *     falls back to a fixed sentence rather than to nothing, because a
 *     selection with no reason is refused by the ledger and would take the
 *     turn down with it.
 *   - The tool never writes an answer the researcher did not say. The draft
 *     parser below returns text and marks the places the model left open; it
 *     does not fill them, and nothing here invents a sentence.
 */

import { isStationId, stationById, type StationId } from "../flow/stations.ts";
import { FRAMING_SUBJECT } from "../flow/stationBrief.ts";

/**
 * Where a conversation happens. The seven stations plus the framing, which is
 * not a station (a station is a question the tool comes back to; the framing is
 * the setting for the whole study) but is a place the researcher works and so
 * is a place they can talk.
 */
export type ConversationPlace = StationId | "framing";

/** The framing's place id, spelled once. */
export const FRAMING_PLACE = "framing";

/** True for a string that names a place a conversation can happen at. */
export function isConversationPlace(value: string): value is ConversationPlace {
  return value === FRAMING_PLACE || isStationId(value);
}

/**
 * The topic a turn at this place is filed under.
 *
 * Station turns already use `station:<id>` everywhere, so refusals counted per
 * topic and coverage measured on topic keep working without a special case.
 * The framing gets its own key rather than borrowing a station's.
 */
export function topicForPlace(place: string): string {
  return place === FRAMING_PLACE ? FRAMING_PLACE : `station:${place}`;
}

/** The place in the words the rail uses for it. */
export function placeLabel(place: string): string {
  /* M50, ISC-531, string only: the name a reader meets. The id stays. */
  if (place === FRAMING_PLACE) return "your starting point";
  return isStationId(place) ? stationById(place).label : place;
}

/** The move id a conversation turn is recorded under. `n` counts from one. */
export function conversationMoveId(place: string, n: number): string {
  return `conversation:${place}@${n}`;
}

/** True for a move id written by the conversation rather than by an offered set. */
export function isConversationMove(moveId: string): boolean {
  return moveId.startsWith("conversation:");
}

/**
 * The reason recorded when the model did not say why it asked.
 *
 * Not an invention about the model's thinking: it says where the question came
 * from, which is the one thing the tool does know, and it reads as what it is.
 */
export const FOLLOW_UP_REASON = "Asked as a follow-up in the conversation here.";

export interface ConversationTurn {
  /** What the researcher sees. The marked lines are taken out of it. */
  readonly shown: string;
  /** The question this turn put, for the record. Empty when it asked none. */
  readonly question: string;
  /** Why it asked, for the record. Never empty. */
  readonly because: string;
  /** True when the turn marked its question as the step's waiting challenge (M78b, ISC-682). */
  readonly fromChallenge: boolean;
}

/** The last sentence ending in a question mark, or "" when there is none. */
export function lastQuestionSentence(text: string): string {
  const found = text.match(/[^.!?\n]*\?/g);
  if (found === null || found.length === 0) return "";
  return (found[found.length - 1] ?? "").trim();
}

/**
 * Split one turn of the conversation into what is shown and what is recorded.
 *
 * The model is asked to end its reply on the question and then write two marked
 * lines, `QUESTION:` and `BECAUSE:`. Those lines are for the ledger and are
 * stripped from what reaches the screen, so the researcher reads a reply rather
 * than a reply with its own metadata printed underneath.
 *
 * Both fallbacks matter and they fail in different directions. A model that
 * skips the marked lines still asked something, so the question is read off the
 * reply and the reason says where it came from; a turn is not lost because the
 * model ignored a formatting instruction. A model that asked nothing at all
 * yields an empty question, and the caller records the reply without opening a
 * question, which leaves the researcher free to keep typing.
 */
export function parseConversationTurn(text: string): ConversationTurn {
  let question = "";
  let because = "";
  let fromChallenge = false;
  const kept: string[] = [];
  for (const line of text.split("\n")) {
    const q = /^\s*QUESTION:\s*(.*)$/.exec(line);
    if (q !== null && question === "") {
      question = (q[1] ?? "").trim();
      continue;
    }
    /* M78b, ISC-682: the third marked line, on a turn that asked the step's challenge. */
    if (/^\s*CHALLENGE:\s*yes\s*$/i.test(line)) {
      fromChallenge = true;
      continue;
    }
    const b = /^\s*BECAUSE:\s*(.*)$/.exec(line);
    if (b !== null && because === "") {
      because = (b[1] ?? "").trim();
      continue;
    }
    kept.push(line);
  }
  const shown = kept.join("\n").trim();
  return {
    shown,
    question: question === "" ? lastQuestionSentence(shown) : question,
    because: because === "" ? FOLLOW_UP_REASON : because,
    fromChallenge,
  };
}

/* The framing's two-part draft is gone (M40).
 *
 * `FramingDraft` and `parseFramingDraft` split a draft into an interest and a
 * puzzle, because the framing asked for both. The framing asks one question now:
 * the puzzle is the tool's reading of what the researcher saved, not a box they
 * fill, so the framing takes the ordinary one-part draft every station takes and
 * there is nothing left to split.
 *
 * `isGapOnly` below survives the removal and is load-bearing elsewhere: the
 * puzzle reading's parser uses it for the same reason this did, which is that a
 * model asked for something nobody has stated returns the gap marker alone and
 * "[...]" is not an answer.
 */

/**
 * The labels a three-part Starting point draft comes back under (ISC-592), one
 * per answer, in the order the page asks them. The questions stay with the page
 * (`FRAMING_QUESTION` in flow/FramingBand.tsx), which is where a reader reads them.
 */
export const FRAMING_DRAFT_LABELS = {
  startingInterest: "INTEREST",
  seminalCorpus: "PAPERS",
  targetVenue: "JOURNAL",
} as const;

export type FramingDraftField = keyof typeof FRAMING_DRAFT_LABELS;

/** The gap marker a missing part stands as: the prompt's own `[...]`. */
export const GAP_ONLY = "[...]";

/**
 * A labelled draft split into its parts (ISC-592).
 *
 * Each part runs from its label to the next label. A part the reply leaves out,
 * or leaves empty, is the gap marker, because the rule is that nothing the
 * researcher did not say is written for them. A reply with no labels at all is
 * read as the first part, the way a one-part draft always was.
 */
export function parseLabelledDraft<K extends string>(
  text: string,
  labels: Readonly<Record<K, string>>,
): Record<K, string> {
  const keys = Object.keys(labels) as K[];
  const byLabel = new Map<string, K>(keys.map((k) => [labels[k].toUpperCase(), k]));
  const found = new Map<K, string[]>();
  let current: K | null = null;
  for (const line of text.split("\n")) {
    const m = /^\s*([A-Za-z]+)\s*:\s*(.*)$/.exec(line);
    const key = m === null ? undefined : byLabel.get((m[1] ?? "").toUpperCase());
    if (m !== null && key !== undefined) {
      current = key;
      found.set(key, [m[2] ?? ""]);
    } else if (m !== null && /^[A-Z]{4,}$/.test(m[1] ?? "")) {
      /* M92, ISC-752: a label that this draft didn't ask for (a one-part draft
       * whose reply carries the other parts) ends the part before it. */
      current = null;
    } else if (current !== null) {
      found.get(current)!.push(line);
    }
  }
  const out = {} as Record<K, string>;
  if (found.size === 0) {
    keys.forEach((k, i) => (out[k] = i === 0 && text.trim() !== "" ? text.trim() : GAP_ONLY));
    return out;
  }
  for (const k of keys) {
    const part = (found.get(k) ?? []).join("\n").trim();
    out[k] = part === "" ? GAP_ONLY : part;
  }
  return out;
}

/** A three-part Starting point draft, split (ISC-592). */
export function parseFramingDraft(text: string): Record<FramingDraftField, string> {
  return parseLabelledDraft(text, FRAMING_DRAFT_LABELS);
}

/**
 * A draft that is nothing but the gap marker.
 *
 * The draft prompt tells the model to leave `[…]` where the answer would need
 * something the researcher has not said. Asked for a puzzle nobody has stated,
 * the model does exactly that and returns the marker alone, which the first
 * live walk of M37 put into the puzzle field as the string "[...]", with the
 * "not yet said" note suppressed because the part was not empty. A part that
 * is only gaps has said nothing, and is read as nothing.
 */
export function isGapOnly(text: string): boolean {
  return text.replace(GAP_MARKER, "").replace(/[\s.,;:…]/g, "") === "";
}

/* The marker itself, written once. Two constants for one pattern, because a
 * global regex carries a `lastIndex` and `test` on a shared one answers
 * differently on the second call. The global is for stripping, the other for
 * asking. */
const GAP_MARKER = /\[\s*(?:…|\.{3})\s*\]/g;
const ONE_GAP_MARKER = /\[\s*(?:…|\.{3})\s*\]/;

/**
 * Whether a draft carries a gap the researcher has to fill (D1, M43b).
 *
 * `isGapOnly` answers the harder question, which is whether a draft said nothing
 * at all. This one answers the ordinary case: the draft is a real answer with a
 * marker somewhere inside it.
 */
export function hasGapMarker(text: string): boolean {
  return ONE_GAP_MARKER.test(text);
}

/**
 * What the marker is, said on screen (D1, M43b).
 *
 * The draft prompt tells the model to write `[...]` where the answer would need
 * something the researcher has not said, and to carry on rather than fill the gap.
 * That is the right instruction and the marker is the right mechanism. What was
 * missing is any sentence saying so: the walk of 2026-09-13 found the literal
 * `[...]` at the end of a framing draft and again in the middle of a station
 * draft's body, between two paragraphs, with nothing on the page naming it. A
 * marker inside a saved field reads as the researcher having elided something.
 *
 * Drawn only when a draft actually carries one, beside the line that says the
 * draft is made of the researcher's words, because the two facts belong together:
 * these are your words, and here is where they ran out.
 */
export const GAP_MARKER_NOTE =
  "Abductive wrote [...] where your answer is missing something that you haven't said yet. Replace each [...] with your own words, or delete the marker.";

/**
 * What the researcher wrote at one place, and only that.
 *
 * The draft is made of their words, so the prompt is handed their turns and
 * nothing the tool said. Passing the whole exchange would let the model draft
 * from its own questions, which is how a tool ends up writing an answer nobody
 * gave.
 *
 * A turn carries its place directly when it replies to nothing, and inherits it
 * from the question it answers when it does, which is how every turn recorded
 * before M37 got one. Both are read here so a conversation that began before a
 * chat box existed still belongs somewhere.
 */
export function humanTurnsAt(
  events: readonly {
    readonly id: string;
    readonly type: string;
    readonly projectId: string;
    readonly actor: string;
    readonly text?: string;
    readonly inReplyTo?: string;
    readonly station?: string;
  }[],
  projectId: string,
  place: string,
): readonly { readonly id: string; readonly text: string }[] {
  const placeOfQuestion = new Map<string, string>();
  const out: { id: string; text: string }[] = [];
  for (const event of events) {
    if (event.projectId !== projectId) continue;
    if (event.type === "question-selection") {
      if (event.station !== undefined) placeOfQuestion.set(event.id, event.station);
      continue;
    }
    if (event.type !== "response" || event.actor !== "human") continue;
    const at =
      event.station ??
      (event.inReplyTo === undefined ? undefined : placeOfQuestion.get(event.inReplyTo));
    const text = (event.text ?? "").trim();
    if (at === place && text !== "") out.push({ id: event.id, text });
  }
  return out;
}

/**
 * Which of the Starting point's three parts the conversation has covered
 * (M62, ISC-599).
 *
 * Until M62 the framing turn was steered to the interest alone, so a Summarise
 * after any conversation left the literatures and the journal as gaps. The turn
 * now asks about them one at a time, in the page's order, and this replay is
 * how the next turn knows where the conversation has got to without asking the
 * model to keep count. The record is read in order:
 *
 *   - a question Abductive put at the framing is about the first part not yet
 *     covered when it was put, which is the part the turn was told to ask about;
 *   - a reply to that question covers its part, and so does a decline the
 *     researcher pressed (a skip is not a failure, and asking again is what the
 *     conversation rules forbid); a question Abductive set aside covers nothing;
 *   - a reply nobody asked for covers the interest when the interest is still
 *     open, and nothing else, because a guess at which part it was about would
 *     put words in the wrong box;
 *   - a saved answer covers its part from the moment it was saved.
 *
 * `present` is the brief as the caller has it, typed or saved, and covers a
 * part it holds for the next turn, without changing which question the replay
 * read as being about which part. A field holding only the gap marker holds
 * nothing. `answered` maps each reply to the part it answered, which the
 * Summarise prompt prints beside the reply.
 */
export interface FramingCoverage {
  readonly covered: Readonly<Record<FramingDraftField, boolean>>;
  /**
   * Parts covered but still open by the researcher's own account (the owner's
   * amendment to M62): a reply that leaves the part "up in the air" or "still
   * being worked out", or a decline they pressed. Not asked again; Summarise
   * leaves the field a marked gap and says why. A saved answer settles it.
   */
  readonly open: ReadonlySet<FramingDraftField>;
  readonly answered: ReadonlyMap<string, FramingDraftField>;
  /** The first part not covered, in the page's order; null when all three are. */
  readonly next: FramingDraftField | null;
}

const FRAMING_ORDER = Object.keys(FRAMING_DRAFT_LABELS) as FramingDraftField[];

/**
 * A reply that says the part is not settled yet: the owner's two phrasings and
 * the plain ways of saying the same. Read on the researcher's own words, never
 * the model's, so the record decides and not a second call.
 */
export const UNSETTLED_REPLY =
  /\b(?:up in the air|(?:still )?(?:working|figuring) (?:it|that|this) out|still (?:deciding|thinking about (?:it|that)|open|unsure)|not sure yet|(?:haven\W?t|have not) (?:thought about (?:it|that)|decided|settled|worked (?:it|that) out)(?: yet)?|not (?:decided|settled) yet|undecided|don\W?t know yet|no idea yet)\b/i;

/**
 * Whether a reply leaves its part open (M78b, ISC-681): it says the part isn't
 * settled and names nothing for it. On the serendipity walk the student named
 * Organization Science and AMJ and added "we haven't settled it yet", and
 * Summarise returned the gap for a part the student had answered. A reply that
 * names a journal, a paper or anything with a capital or a year, or that runs
 * past a short sentence, has answered the part, hedges and all.
 */
export function leavesPartOpen(text: string): boolean {
  if (!UNSETTLED_REPLY.test(text)) return false;
  const words = text.trim().split(/\s+/).filter((w) => /\w/.test(w));
  if (words.length > 14) return false;
  if (/\b(?:1[5-9]|20)\d\d\b/.test(text)) return false;
  const named = words.some((w, i) => {
    const b = w.replace(/^[("'\u201c\u2018]+/, "");
    const opens = i === 0 || /[.!?]["'\u201d\u2019)]?$/.test(words[i - 1] ?? "");
    return /^[A-Z]/.test(b) && !opens && !/^I(?:'|\u2019|$)/.test(b);
  });
  return !named;
}

export function framingCoverage(
  events: readonly {
    readonly id: string;
    readonly type: string;
    readonly projectId: string;
    readonly actor: string;
    readonly text?: string;
    readonly inReplyTo?: string;
    readonly station?: string;
    readonly questionEventId?: string;
    readonly setAsideFor?: string;
    readonly subject?: string;
    readonly statement?: string;
  }[],
  projectId: string,
  present: Readonly<Partial<Record<FramingDraftField, string>>>,
): FramingCoverage {
  const covered: Record<FramingDraftField, boolean> = { startingInterest: false, seminalCorpus: false, targetVenue: false };
  const answered = new Map<string, FramingDraftField>();
  const open = new Set<FramingDraftField>();
  const about = new Map<string, FramingDraftField | null>();
  const firstOpen = (c: Readonly<Record<FramingDraftField, boolean>>) => FRAMING_ORDER.find((f) => !c[f]) ?? null;
  for (const event of events) {
    if (event.projectId !== projectId) continue;
    if (event.type === "question-selection") {
      if (event.station === FRAMING_PLACE) about.set(event.id, firstOpen(covered));
      continue;
    }
    if (event.type === "bound") {
      const field = FRAMING_ORDER.find((f) => FRAMING_SUBJECT[f] === event.subject);
      if (field !== undefined && (event.statement ?? "").trim() !== "" && !isGapOnly(event.statement ?? "")) {
        covered[field] = true;
        open.delete(field);
      }
      continue;
    }
    if (event.type === "refusal" || event.type === "dont-know") {
      const part = event.questionEventId === undefined ? undefined : about.get(event.questionEventId);
      if (part != null && event.setAsideFor === undefined) {
        covered[part] = true;
        open.add(part);
      }
      continue;
    }
    if (event.type !== "response" || event.actor !== "human" || (event.text ?? "").trim() === "") continue;
    const asked = event.inReplyTo === undefined ? undefined : about.get(event.inReplyTo);
    if (asked === undefined && event.station !== FRAMING_PLACE) continue;
    const part = asked ?? (covered.startingInterest ? null : "startingInterest");
    if (part === null) continue;
    covered[part] = true;
    answered.set(event.id, part);
    if (leavesPartOpen(event.text ?? "")) open.add(part);
    else open.delete(part);
  }
  const now = { ...covered };
  for (const field of FRAMING_ORDER) {
    const value = present[field] ?? "";
    if (value.trim() !== "" && !isGapOnly(value)) {
      now[field] = true;
      open.delete(field);
    }
  }
  return { covered: now, open, answered, next: firstOpen(now) };
}

/**
 * A turn's prose with its closing question taken off (M74b, ISC-664).
 *
 * The walk of 2026-10-02 read the step's question three times in a row at
 * Starting point: in the bubble that opens the step, at the end of Abductive's
 * opening turn, and again on its own line. The bubble carries the question, so
 * the opener's prose ends on what comes before it. The last sentence goes when
 * it ends in a question mark, whether it sits in its own paragraph or closes the
 * last one; everything before it stays as the model wrote it.
 */
export function withoutTrailingQuestion(text: string): string {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith("?")) return trimmed;
  const cut = trimmed.search(/(?:^|[.!?]["'”’)]?\s+|\n)[^.!?\n]*\?$/);
  if (cut <= 0) return trimmed;
  const kept = trimmed.slice(0, cut + 1).trimEnd();
  return /[.!?]["'”’)]?$/.test(kept) ? kept : trimmed.slice(0, cut).trimEnd();
}

/** Text compared for content: lower case, words only, single spaces. */
function wordsOnly(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Whether a Summarise result is the researcher's replies joined end to end
 * (M74b, ISC-664).
 *
 * Both presses of Summarise on the walk returned the student's replies word for
 * word, one after another. A summary is shorter than what it summarises, so a
 * result as long as the joined replies, or equal to them, fails. One reply short
 * enough to be its own summary passes: there is nothing to shorten.
 */
export function summaryRestatesReplies(summary: string, said: readonly string[]): boolean {
  const joined = wordsOnly(said.join(" "));
  const got = wordsOnly(summary);
  if (got === "") return false;
  if (said.length <= 1 && joined.split(" ").length <= 40) return false;
  return got === joined || got.length >= joined.length;
}
