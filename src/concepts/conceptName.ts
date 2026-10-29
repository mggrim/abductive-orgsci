/**
 * A concept is one noun or gerund (M90, ISC-730 to ISC-733).
 *
 * The owner, 2026-10-14: "for the emerging project ontology, the concepts
 * appear as concept bundles. The tool should really be surfacing nouns and
 * gerunds I think. Rather than 'Introduced founders' longer slots' these should
 * be different concepts like introductions, founders, office hour slot time".
 * His ruling the same day: split into concepts and relations.
 *
 * The contract the suggestion pass sends, the guard that reads every name the
 * model writes before a suggestion reaches the tray, the request that sends a
 * bundle back once to be split, and the drops the tray names. Model input, so
 * this file is out of the copy scan's rendered scope; the tray's sentence is in
 * `vocabulary.ts`.
 */

import type { LedgerEvent } from "../ledger/events.ts";

/**
 * The most words a concept's name may carry: four, so that the owner's own
 * example "office hour slot time" passes (the lead's ruling, 2026-10-14).
 */
export const MAX_NAME_WORDS = 4;

const NUMBER_WORD = ["zero", "one", "two", "three", "four", "five", "six"];
const maxWords = NUMBER_WORD[MAX_NAME_WORDS] ?? String(MAX_NAME_WORDS);

/** What NAME asks for, in the output format. */
export const NAME_LINE = `NAME: <one noun or one gerund, or a noun phrase of at most ${maxWords} words, naming one thing>`;

/** The contract on a concept's name, in the draft rules of the suggestion pass. */
export const NAME_CONTRACT = [
  `A concept's name is one noun or one gerund, or a noun phrase of at most ${maxWords} words, that names a single thing: a person or role, an object, an act, a state or a place. Take it from their words, or use one they would recognise as theirs.`,
  "A name is not a clause. It does not open on a verb, and it does not join two things with and, or, a comma or a slash.",
  "Where their words carry a compound, such as \"Introduced founders' longer slots\", write the separate concepts (introductions, founders, office hour slot time) and write the relations that joined them, in their words, such as introductions leads-to office hour slot time with the claim \"Introduced founders got longer slots.\" Give each of those relations its WHY line.",
].join(" ");

const CONJUNCTION = /\b(and|or|but|nor|plus|versus|vs)\b|[,;/&+]/i;
const DETERMINER = new Set(["the", "a", "an", "their", "his", "her", "its", "our", "my", "your", "this", "that", "these", "those", "them", "him"]);
const COMPARING = new Set(["more", "less", "fewer", "longer", "shorter", "larger", "smaller", "bigger", "higher", "lower", "greater", "better", "worse"]);
const possessive = (word: string) => /['’]s?$/.test(word) && word.length > 2;

/**
 * Why a name is a bundle rather than one concept, or null when it names one
 * thing. A developer's reason, for the drop event and the tests; the tray's
 * sentence says it in the researcher's terms.
 */
export function bundleReason(name: string): string | null {
  const words = name.trim().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return null;
  if (words.length > MAX_NAME_WORDS) return `more than ${maxWords} words`;
  if (CONJUNCTION.test(name)) return "joins two things";
  if (words.length === 1) return null;
  const first = (words[0] ?? "").toLowerCase();
  const second = (words[1] ?? "").toLowerCase();
  /* A first word in -ed is a verb only when a possessive or a comparing word
     follows it: "Introduced founders' longer slots", "Delayed doctors' rounds",
     "Introduced longer slots". On its own it is a modifier and the name passes:
     "Shared office space", "Limited partners", "Introduced founder" (the lead's
     ruling, 2026-10-14). "Seed funding" and "need" end in -eed and are nouns. */
  if (first.length > 4 && /[^e]ed$/.test(first) && (possessive(second) || COMPARING.has(second))) return "opens on a past-tense verb";
  /* A first word in -ing is a gerund that names the act ("pitching", "funding
     rounds") until an object follows it: "Introducing the founders". */
  if (/ing$/.test(first) && (DETERMINER.has(second) || possessive(second))) return "opens on a verb with its object";
  return null;
}

export function isBundle(name: string): boolean {
  return bundleReason(name) !== null;
}

/** The request that sends the bundles of one reply back once, to be split. */
export function splitRequest(bundles: readonly string[]): string {
  const listed = bundles.map((b) => `- ${b}`).join("\n");
  return [
    `Your reply named ${bundles.length === 1 ? "a concept" : `${NUMBER_WORD[bundles.length] ?? bundles.length} concepts`} with more than one thing in the name:`,
    listed,
    `Split ${bundles.length === 1 ? "it" : "each"} into separate concepts, each named with one noun or one gerund, or a noun phrase of at most ${maxWords} words, and write the relations that joined them, in their words, each with its WHY line.`,
    "Answer in the same format, with a block only for the new concepts and relations, within the limits in your instructions.",
  ].join("\n\n");
}

/** Every act of the researcher's on the ontology tab: a decision on a card, a line or a statement. */
const DECISION = /^(concept|relation|statement|why|property)-/;

/**
 * The names Abductive left out since the researcher's last decision on the tab,
 * oldest first: the tray names them until the researcher decides a card.
 * History keeps every drop.
 */
export function recentDrops(events: readonly LedgerEvent[], projectId: string): readonly string[] {
  let names: string[] = [];
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    /* M93: a chat suggestion left out is in History with its own reason. */
    if (e.type === "suggestion-dropped" && e.source.kind !== "chat") names.push(e.name);
    else if (e.actor === "human" && DECISION.test(e.type)) names = [];
  }
  return names;
}
