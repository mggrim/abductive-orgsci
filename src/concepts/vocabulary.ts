/**
 * The words the emerging project ontology is read in (M63, ISC-608, ISC-609).
 *
 * One place for them, for the reason `views/provenance.ts` gives for its
 * sentences: the tab, History, the report and the exports all print a relation,
 * a criterion or a source, and a surface that could reword one would be a
 * second vocabulary for one fact. In scope for the copy scan.
 */

import type {
  ConceptEvidence,
  ConceptRelation,
  ConceptSource,
  LookForKind,
} from "../ledger/events.ts";
import { resolveStationId, stationById } from "../flow/stations.ts";

/** The owner's three words for the tab (2026-09-30), admitted in Part 5 as the owner's wording. */
export const ONTOLOGY_TAB_LABEL = "Emerging project ontology";

/**
 * The gloss, once per page (C6). The owner's wording: it names the concepts as
 * the researcher's and gives no agency to the ontology itself.
 */
export const ONTOLOGY_GLOSS =
  "The concepts that you define for this project, with their definitions, properties and relations.";

/** Each relation as it reads between two names, in its direction. */
export const RELATION_PHRASE: Readonly<Record<ConceptRelation, string>> = {
  "part-of": "is part of",
  "leads-to": "leads to",
  "varies-with": "varies with",
  "contrasts-with": "contrasts with",
  "condition-for": "is a condition for",
};

/** One relation, as a sentence between two concept names. */
export function relationSentence(from: string, relation: ConceptRelation, to: string): string {
  return `${from} ${RELATION_PHRASE[relation]} ${to}`;
}

/** Where a suggestion came from, as the end of a sentence. */
export function sourcePhrase(source: ConceptSource, stepName: (station: string) => string): string {
  switch (source.kind) {
    case "summary":
      return `your summary at ${stepName(source.station)}`;
    /* M74b, ISC-665: the walk's provenance marks, each naming where the words
     * came from: your summary at a step, the data, or the papers. */
    case "data":
      return "the data";
    case "grouping":
      return source.from === "papers" ? "the papers" : "the statements already in your project";
    /* M82, ISC-694: the Relate concepts pass. */
    case "relate":
      return "your accepted concepts";
    /* M93, ISC-756: Surface concepts and relationships, from a step's chat. */
    case "chat":
      return `the chat at ${stepName(source.station)}`;
  }
}

/**
 * Whose words a suggestion from the chat draws on (M93, ISC-757), worked out
 * from the turns it cites by `concepts/chat.ts` and never taken from the model.
 * A concept drawn from Abductive's own turns is the model's prior coming back,
 * so the card says so in plain words.
 */
export type ChatOrigin = "researcher" | "abductive" | "both";

export const CHAT_ORIGIN_LABEL: Readonly<Record<ChatOrigin, string>> = {
  researcher: "From your words",
  abductive: "From Abductive's questions",
  both: "From both",
};

/** The passage or answer behind a relation or a statement, as a short phrase. */
export function evidencePhrase(
  evidence: ConceptEvidence,
  names: { readonly step: (subject: string) => string; readonly passage: (chunkId: string) => string },
): string {
  return evidence.kind === "passage"
    ? `from ${names.passage(evidence.chunkId)}`
    : `from your answer at ${names.step(evidence.subject)}`;
}

/* M89: `CRITERION_LABEL` and `STATUS_LABEL`, the readiness report's row and
 * state names, went with the report. */

/** What each kind of line in the field list is about, for a heading or a filter. */
export const LOOK_FOR_KIND_LABEL: Readonly<Record<LookForKind, string>> = {
  property: "How a property varies",
  relation: "A relation to observe",
  evidence: "A concept without evidence",
  residue: "A part that your account can't explain yet",
};

/** Numbers as words up to twelve, for the verdict. */
export function numberWord(n: number): string {
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
  return words[n] ?? String(n);
}

function capitalised(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The report's one-line verdict (the owner's three forms, 2026-09-30):
 * "Ready to collect data", "Two things to fix first", "Not yet: three things
 * missing". Anything missing outranks anything to fix.
 */
export function verdictLine(missing: number, fixFirst: number): string {
  if (missing > 0) return `Not yet: ${numberWord(missing)} ${missing === 1 ? "thing" : "things"} missing`;
  if (fixFirst > 0) return `${capitalised(numberWord(fixFirst))} ${fixFirst === 1 ? "thing" : "things"} to fix first`;
  return "Ready to collect data";
}

/** A step named by its subject, as the page and History both print it. */
export function stepName(subject: string): string {
  /* M93: Starting point's chat is held under "framing". */
  if (subject === "framing") return "Starting point";
  const id = resolveStationId(subject.split(":")[0] ?? subject);
  return id === undefined ? subject.replace(/-/g, " ") : stationById(id).label;
}

/**
 * The tray's line for the concepts Abductive left out since your last decision
 * on the tab, and History's row for each one (M90, ISC-733): a concept whose
 * name joined more than one concept, which the model didn't split when
 * Abductive asked. Null when Abductive left out none (L5: "drop" is a retired verb, the lead's ruling of 2026-10-14).
 */
export function droppedLine(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  const quoted = names.map((n) => `"${n}"`);
  if (names.length === 1) {
    return `Abductive left out a suggestion, ${quoted[0]}, because its name joined more than one concept and the model didn't split it when Abductive asked.`;
  }
  const list = `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
  return `Abductive left out ${numberWord(names.length)} suggestions, ${list}, because each name joined more than one concept and the model didn't split them when Abductive asked.`;
}
