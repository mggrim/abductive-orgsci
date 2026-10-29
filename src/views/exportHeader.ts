/**
 * How this was arrived at (M38, ISC-500).
 *
 * Exports is where a co-author picks the study up cold, and it was the one
 * surface in the tool with no path to "how did I get here". Every file it
 * offers is a reading of the record and none of them said how much record
 * there was, so a reader downloading a memo had no way to tell a study that
 * had been worked through from one filled in at speed.
 *
 * Four numbers, all of them projections over events the ledger already holds
 * (a fifth, the flags open at this moment, went with the checks at M89):
 *
 *  - **Turns**, summed over the eight places from `views/placeSummary.ts`, so
 *    the number here and the numbers on the rail are the same number added up
 *    rather than two counts of one thing.
 *  - **Answers drafted from a conversation, against answers typed.** A `bound`
 *    event carries `draftedFrom` when the answer came out of a conversation and
 *    not when the researcher typed it into the box. That distinction is the
 *    tool's own account of how much of the design it had a hand in, and it is
 *    the one a reviewer would ask about first.
 *  - **Claims by origin**, the census Exports and Your model already print.
 *
 * No sentence about what any of it means. The header says what happened and
 * links into the record, and the reading is the reader's.
 */

import type { LedgerEvent, LedgerEventType } from "../ledger/events.ts";
import type { ProjectBrief } from "../state/projects.ts";
import type { OriginCensus } from "../ontology/attribution.ts";
import { placeSummaries } from "./placeSummary.ts";
/* One projection per fact (M39, ISC-501 applied to a fact M38 introduced).
 *
 * This header counts answers drafted against typed across the study and
 * `views/provenance.ts` reads the same distinction one answer at a time, for the
 * popover on Design. Two spellings of one predicate is how the count on Exports
 * and the sentence on Design come to disagree, so there is one predicate and it
 * lives with the per-answer reading. */
import { cameFromConversation } from "./provenance.ts";
import { placedStatementCount, projectConcepts } from "../concepts/projection.ts";
import { projectOntology } from "../ontology/projection.ts";

export interface ExportHeaderView {
  /** Turns across all eight places, from the one projection per place. */
  readonly turns: number;
  /** Answers whose text came out of a conversation. */
  readonly draftedAnswers: number;
  /** Answers the researcher typed into the box themselves. */
  readonly typedAnswers: number;
  /** Claims by who put them there, with the denominator attached. */
  readonly claims: OriginCensus;
  /**
   * Statements placed under a concept or a relation (M78a, ISC-680). Since M75
   * these are the model's claims; the walk read "claims still to come" beside 38.
   */
  readonly placedStatements: number;
}

export interface ExportHeaderInput {
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
  readonly brief: ProjectBrief;
  readonly claims: OriginCensus;
  /**
   * Passages of the researcher's own data (D12, M43). Data only: the header's
   * turn count folds the eight place summaries, and Early data reads the corpus
   * when its box is empty, so a paper on the reading list used to read here as
   * an answer the researcher had given. `dataChunkCount` builds it.
   */
  readonly dataCorpusSize?: number;
}

export function exportHeader(input: ExportHeaderInput): ExportHeaderView {
  const { projectId, brief, claims } = input;
  const events = input.events.filter((e) => e.projectId === projectId);

  const places = placeSummaries({
    events,
    projectId,
    brief,
    ...(input.dataCorpusSize === undefined ? {} : { dataCorpusSize: input.dataCorpusSize }),
  });

  /* The last save per subject, because a subject can be saved many times and a
   * count of `bound` events would report edits as answers. What the header is
   * about is the design as it stands, and the design as it stands is the last
   * save at each place. */
  /* M78a, ISC-680: an edited summary is the researcher's. The serendipity walk's
   * student edited every summary before saving it and read "Answers that you
   * typed yourself 1 of 12". A save counts as suggested from chat only when its
   * text is the summary as Abductive wrote it; a save whose summary is not on
   * the record keeps the older reading. */
  const drafts = new Map<string, string>();
  for (const e of events) if (e.type === "brief-draft") drafts.set(e.id, e.text);
  const flat = (text: string) => text.replace(/\s+/g, " ").trim();
  const lastBySubject = new Map<string, boolean>();
  for (const e of events) {
    if (e.type !== "bound") continue;
    const draft = e.draftedFrom === undefined ? undefined : drafts.get(e.draftedFrom);
    lastBySubject.set(e.subject, cameFromConversation(e) && (draft === undefined || flat(draft) === flat(e.statement)));
  }
  let drafted = 0;
  let typed = 0;
  for (const fromConversation of lastBySubject.values()) {
    if (fromConversation) drafted += 1;
    else typed += 1;
  }

  return {
    turns: places.reduce((sum, p) => sum + p.turns, 0),
    draftedAnswers: drafted,
    typedAnswers: typed,
    claims,
    placedStatements: placedStatementCount(projectConcepts(events, projectId, projectOntology(events, projectId))),
  };
}

/**
 * Which kinds of entry each count on this header is counting (D51, M43d).
 *
 * The header's own sentence is "Press a count to open the record at the entries
 * it counts", and pressing one opened the record showing every row: `EVENTS 1447
 * · SHOWN 1447`. It opened the record; it did not open it at the entries.
 *
 * Written out rather than derived, and written here rather than in the component,
 * because the kinds behind a number are a fact about this header's arithmetic
 * rather than about the button that draws it. Turns are the conversation, an
 * answer is a save, and a claim is a change to the model and the drafts behind it.
 */
export const ARRIVED_KINDS: Readonly<Record<string, readonly LedgerEventType[]>> = {
  turns: ["response", "question-selection"],
  drafted: ["bound", "brief-draft"],
  typed: ["bound", "brief-draft"],
  claims: ["ontology-mutation", "proposal", "proposal-adjudication", "statement-attached", "relation-statement-attached"],
};
