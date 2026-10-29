/**
 * Turning a move's topic into something a researcher can read (ISC-265 … ISC-268).
 *
 * `topic` is a routing key. It is how a move says what it is about so the
 * orchestrator can count coverage, dedupe, and decide what to raise next, and
 * for that job a slug is exactly right. It was also being printed straight at
 * the researcher: the bar above the workbench said "3 candidate questions, on
 * station:context, puzzle:root, theory:expectation", and every turn in the
 * transcript was headed "interrogation · puzzle:root".
 *
 * Nobody reading that learns anything. Worse, it teaches them that the tool
 * has an interior vocabulary they are not being let into, which is the
 * opposite of the claim the whole design rests on — that every move is on the
 * record with its reason, legible without reading any code.
 *
 * So the slug stays as the key and this is the only place that renders it.
 * Unknown shapes fall back to the slug rather than to a guess, because a raw
 * key is an honest sign of a gap and an invented English phrase is not.
 */

import { resolveStationId, STATIONS } from "../flow/stations.ts";
import { BIAS_GLOSSARY, CONTEXT_GLOSSARY } from "../matrix/glossary.ts";
import type { BiasId, ContextId } from "../matrix/schema.ts";

const FIXED: Readonly<Record<string, string>> = {
  "puzzle:root": "the thing that you can't account for",
  "theory:expectation": "whose expectation is at stake",
  "observation:seed": "something that you have actually seen",
  "scope:boundary": "where your ontology stops applying",
  "corpus:unread": "sources you haven't opened",
  "falsification:test": "what would show you were wrong",
  // M37. The framing is a place a conversation happens and so a topic turns can
  // be filed under, and it is the one place that is not a station. Without a
  // label the ledger panel printed the routing key at the researcher.
  /* M50, ISC-531. The key is the place id on the record; the label is what a
     reader meets. */
  framing: "your starting point",
};

/**
 * Keyed on the rule ids in `src/lint/`. A missing key falls through to the raw
 * slug, which is how the first version of this map advertised its own gaps:
 * two of the names here were invented from memory rather than read off the
 * source, and the bar duly printed
 * `lint:phenomenon-troubling-no-theory:b19b3f86-…` at the researcher.
 * Covered by a test that walks the real rule ids, so the next rule added
 * without a label fails the suite rather than reaching a page.
 */
const LINT_RULES: Readonly<Record<string, string>> = {
  // M28 r8: "construct" is retired vocabulary, and this gloss now renders in
  // two places rather than one since the grouped row started showing it.
  "orphan-construct": "a claim without support in your material",
  "uncited-chunk": "a passage of your material that none of your claims cites",
  "resolution-without-rival": "an explanation of your puzzle without a rival beside it",
  "unmet-relation-obligation": "a motivating claim that owes evidence",
  "monotonic-residue-shrink": "a list of unexplained things that only ever shrinks",
  "puzzle-without-referent": "a puzzle without an observation behind it",
  "phenomenon-troubling-no-theory": "an observation that leaves every expectation that you recorded standing",
  "mediation-without-trouble": "a chain of claims that leaves every expectation standing",
  "premature-resolution": "a contradiction closed down too early",
  "puzzle-without-sourced-theory": "a puzzle breaking an unpublished expectation",
  // Semantic family. Unlabelled until M19 because lintSemantic had no caller,
  // so these ids had never reached a screen to be read.
  "deviation-anecdotal": "a deviation that may be one case rather than a pattern",
  "defender-bar": "an explanation its defenders wouldn't recognise",
  "audience-acceptance": "a starting point that your readers may not take as a puzzle",
  "resolution-destroys-theory": "a resolution that buries the expectation rather than reworking it",
  "intuition-as-theory": "intuition standing in for a mechanism",
  // Coherence family: about the design rather than the graph.
  "data-cannot-answer": "data that can't reach the question",
  "variance-process-mismatch": "a variance question with a process design",
  "case-logic-mismatch": "cases chosen against the argument that they must carry",
  "venue-scale-mismatch": "evidence too thin for the venue that you identified",
  "access-unstated": "access the design assumes but doesn't claim",
  "horizon-mismatch": "a question about a longer span of time than your data reaches",
  "context-literature-misfit": "papers your setting can't speak to",
  "confirmation-not-theory-building": "a design set up to confirm what you already think",
  "paper-bearing-unstated": "a paper that you haven't related to your setting",
  "expectation-untested": "a paper's expectations that you haven't answered",
  "unit-mismatch": "answers at a different unit from the one that you identified",
};

/** Every rule id the lint engine can emit. Kept honest by a test. */
export const LABELLED_LINT_RULES: readonly string[] = Object.keys(LINT_RULES);

/**
 * A step named inside a sentence, with one article and not two (D23, M43b).
 *
 * Six of the seven station labels are bare nouns and the seventh is not: the
 * bind's rail label is "The bind", because that is what it is called on the
 * rail, where it stands alone. The template pasted "the " in front of whatever
 * the label said, so every turn at that step was headed "The tool, asking about
 * the The bind step" on the walk of 2026-09-13.
 *
 * The label's own article is dropped rather than the template's, because the
 * template's is the one that has to be there: the phrase sits mid-sentence
 * ("asking about …", "declined · …"), where "The bind step" would read as a
 * proper noun and "the bind step" reads as English. Written here beside the one
 * caller that used to build the phrase by hand, so nothing else can build it a
 * second way.
 */
export function stepPhrase(label: string): string {
  return `the ${label.replace(/^(?:the|a|an)\s+/i, "")} step`;
}

/** The turn's mode, in the second person rather than as a type name. */
export function modeLabel(mode: string): string {
  /* M42. The label over a turn read "asking you about context", which named
   * neither who was asking nor which context. The tool is the one asking, and a
   * station topic says which step. */
  if (mode === "interrogation") return "Abductive, asking";
  /* M74b, ISC-665: the turn after "Ask me differently" asks differently. */
  if (mode === "guidance") return "Abductive, asking differently";
  return mode;
}

/**
 * The turn's mode as one plain word, for a middot list (M48).
 *
 * `modeLabel` above is a sentence opener ("The tool, asking"), which is right
 * over a card and wrong inside "your framing · X · answered". So the spine on
 * the record printed the raw mode instead, and "interrogation" reached the
 * screen: a nominalisation C3 bans outright, on the one page whose job is to be
 * readable at a glance.
 *
 * The copy bar did not catch it and could not. The scan reads string literals
 * and JSX text; this word arrived through an interpolation of `turn.mode`, and a
 * slug is one word, which the whitespace rule drops. A word that reaches a
 * reader only through a variable has to be mapped where the variable is read,
 * which is here, beside the other label this module owns.
 */
export function modeWord(mode: string): string {
  if (mode === "interrogation") return "a question";
  if (mode === "guidance") return "directions";
  return mode;
}

/**
 * Where a turn was said, in the words a reader meets, or null off the rail.
 *
 * `framing` is the one place that is not a station, and it is named the way
 * `FIXED.framing` above names it. A retired station id resolves rather than
 * dying, for the reason `resolveStationId` exists: a study saved before M27
 * carries turns filed under `challenge` and `tension`.
 */
function placeInTurn(place: string | undefined): string | null {
  if (place === undefined) return null;
  if (place === "framing") return "your starting point";
  const id = resolveStationId(place);
  if (id === undefined) return null;
  const station = STATIONS.find((s) => s.id === id);
  return station === undefined ? null : stepPhrase(station.label);
}

/**
 * The label over a turn the tool took (D24b, M43b).
 *
 * The topic usually names the place, because a station's own question is filed
 * under `station:<id>`. A question the researcher picked out of the offered set
 * is filed under the topic they picked, which is what it is about and not where
 * it was asked, so after a pick the label said what the tool was asking about
 * and stopped naming the step every other turn on the page names. The step is
 * appended when the topic does not already carry it.
 */
export function toolTurnLabel(input: {
  readonly mode: string;
  readonly topic: string;
  readonly station?: string;
}): string {
  const head = `${modeLabel(input.mode)} about ${topicLabel(input.topic)}`;
  const where = placeInTurn(input.station);
  /* Said once. A station topic and the framing topic both resolve to the same
   * words `placeInTurn` returns, so the guard is the phrase rather than the
   * shape of the topic key, and a new topic that happens to name a place cannot
   * reintroduce "asking about the Sample step, at the Sample step". */
  if (where === null || head.includes(where)) return head;
  return `${head}, at ${where}`;
}

/**
 * The label over a turn the tool took that asked nothing (D24b, M43b).
 *
 * A reply with no question has no selection to take a label from, and the
 * fallback in `buildTranscript` was the bare word "asking", which is wrong about
 * a turn that asked nothing and names nobody. The tool still said it, and it
 * still said it somewhere.
 */
export function toolReplyLabel(station?: string): string {
  const where = placeInTurn(station);
  return where === null ? "Abductive, replying" : `Abductive, replying about ${where}`;
}

/**
 * The label over the turn still arriving (D24b, M43b).
 *
 * The one label on this page that cannot name a topic, because the topic is
 * parsed out of the reply and the reply has not finished. It can name the place,
 * and the walk of 2026-09-13 read this card at the seventh step as "The tool,
 * asking…" beside seven other turns that all named their step.
 */
export function toolStreamingLabel(station?: string): string {
  const where = placeInTurn(station);
  return where === null ? "Abductive, asking…" : `${modeLabel("interrogation")} about ${where}…`;
}

/**
 * The label over a turn the researcher took (D17, M43b).
 *
 * Every tool turn carried a label and every decline carried one; the
 * researcher's own typed turns carried none, so on a tool whose claim is that
 * the record says who said what, the human was the only unattributed speaker on
 * the page. "You", and the step when the turn has one: a turn from a study that
 * predates M26 belongs to the study rather than to a place, and naming a place
 * for it would be inventing record.
 */
export function researcherTurnLabel(station?: string): string {
  const where = placeInTurn(station);
  return where === null ? "You" : `You, at ${where}`;
}

export function topicLabel(topic: string): string {
  const fixed = FIXED[topic];
  if (fixed !== undefined) return fixed;

  const [head, ...rest] = topic.split(":");
  const tail = rest.join(":");

  if (head === "station") {
    const station = STATIONS.find((s) => s.id === tail);
    /* "the Context step", not "context": the label sits inside a sentence about
     * a question, and a reader who has met seven steps by name can place it. */
    return station === undefined ? topic : stepPhrase(station.label);
  }
  if (head === "lint") {
    // `lint:<rule>:<targetId>` — the id is noise to a reader.
    const rule = rest[0] ?? "";
    return LINT_RULES[rule] ?? topic;
  }
  if (head === "cell") {
    // `cell:<bias>:<context>` — both halves have plain-English names already.
    const bias = BIAS_GLOSSARY[rest[0] as BiasId];
    const context = CONTEXT_GLOSSARY[rest[1] as ContextId];
    if (bias === undefined || context === undefined) return topic;
    return `${bias.name.toLowerCase()} at the ${context.name.toLowerCase()}`;
  }
  /* M33. `literature:baseline:<id>` carries a baseline id, which is a paper key
   * and a number and is noise to a reader. The other three `literature:` topics
   * are left as they were: relabelling them would change what the bar above the
   * workbench already says about them. */
  if (head === "literature" && rest[0] === "baseline") return "what one of your papers expects";
  if (head === "obligation") return "what your motivating claim owes";
  if (head === "residue") return "data your ontology doesn't absorb";

  return topic;
}

/** Several topics in a row, as a sentence rather than a comma-joined list of keys. */
export function topicList(topics: readonly string[]): string {
  const labels = topics.map(topicLabel);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Said under a tool turn the researcher stopped (M58), in the thread and the record. */
export const CUT_SHORT_LINE = "You stopped this reply here.";
