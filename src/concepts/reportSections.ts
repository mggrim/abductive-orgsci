/**
 * The project as a written section reads it (M80, ISC-685 to ISC-688; trimmed
 * at M89).
 *
 * This module wrote the readiness report's sections on Checks: What a reviewer
 * would ask, Rival explanations, Your argument, read back, and Biases flagged.
 * Those left main with the checks on 2026-10-14, on the owner's instruction:
 * "I think we should table the Checks tab." The branch `with-checks` keeps
 * them. What stays is the reading of the project that "Why it matters" and the
 * argument so far share (`concepts/why.ts`): the puzzle, the setting and the
 * accepted cards, and the parser for a one-paragraph reply.
 */

import type { DeclaredDataType, ProjectBrief } from "../state/projects.ts";
import type { UnitOfAnalysis } from "../interview/unitOfAnalysis.ts";
import { stationValue } from "../flow/stationBrief.ts";
import { hasGapMarker } from "../interview/conversation.ts";
import type { ProjectOntologyView } from "./projection.ts";
import { relationSentence } from "./vocabulary.ts";

const said = (value: string | undefined) => (value ?? "").trim() !== "" && !hasGapMarker(value ?? "");

/* ── What the sections read ──────────────────────────────────────────────── */

export interface SectionConcept {
  readonly handle: string;
  readonly id: string;
  readonly name: string;
  readonly definition: string;
}

export interface SectionRelation {
  readonly handle: string;
  readonly id: string;
  /** "Booked slot leads to Drive-by help". */
  readonly sentence: string;
  readonly claim: string;
  readonly conditions: string;
  readonly from: SectionConcept | undefined;
  readonly to: SectionConcept | undefined;
}

/** The project as a written section reads it: the puzzle, the setting and the accepted cards. */
export interface SectionContext {
  readonly venue: string | undefined;
  readonly puzzle: string;
  readonly setting: string;
  readonly sample: string;
  readonly outcome: string;
  /** M84, ISC-707: the unit of analysis and the declared data kind. */
  readonly unit?: UnitOfAnalysis | undefined;
  readonly unitOther?: string | undefined;
  readonly dataType?: DeclaredDataType;
  readonly concepts: readonly SectionConcept[];
  readonly relations: readonly SectionRelation[];
}

/** The puzzle in the researcher's words: the question they framed and their Puzzle answer. */
function puzzleOf(brief: ProjectBrief): string {
  return [brief.researchQuestion, stationValue(brief, "puzzle")].filter((v) => said(v)).map((v) => (v ?? "").trim()).join("\n\n");
}

export function sectionContext(brief: ProjectBrief, view: ProjectOntologyView): SectionContext {
  const concepts: SectionConcept[] = view.accepted.map((c, i) => ({ handle: `C${i + 1}`, id: c.id, name: c.name, definition: c.definition }));
  const byId = new Map(concepts.map((c) => [c.id, c] as const));
  const nameOf = (id: string) => view.concepts.get(id)?.name ?? "a concept";
  const relations: SectionRelation[] = view.acceptedRelations.map((r, i) => ({
    handle: `R${i + 1}`,
    id: r.id,
    sentence: relationSentence(nameOf(r.from), r.relation, nameOf(r.to)),
    claim: r.claim,
    conditions: r.conditions,
    from: byId.get(r.from),
    to: byId.get(r.to),
  }));
  const venue = said(brief.targetVenue) ? (brief.targetVenue ?? "").trim() : undefined;
  return {
    venue,
    puzzle: puzzleOf(brief),
    setting: [stationValue(brief, "context"), stationValue(brief, "site")].filter((v) => said(v)).join("\n\n"),
    sample: said(stationValue(brief, "sample")) ? (stationValue(brief, "sample") ?? "").trim() : "",
    outcome: said(stationValue(brief, "outcome")) ? (stationValue(brief, "outcome") ?? "").trim() : "",
    unit: brief.unit,
    unitOther: brief.unitOther,
    dataType: brief.dataType,
    concepts,
    relations,
  };
}

/** The reply as one paragraph, or null when it is empty. */
export function parseReadBack(text: string): string | null {
  const paragraph = text
    .replace(/^\s*(?:#+[^\n]*|PARAGRAPH:)\s*/i, "")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join(" ")
    .trim();
  return paragraph === "" ? null : paragraph;
}
