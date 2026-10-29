/**
 * What the interviewer is allowed to know about the study (ISC-281 … ISC-286).
 *
 * A pure function from the brief and the graph to the two orientation blocks
 * the turn prompt carries. It exists as its own module because two callers
 * need exactly the same view: the interview, which must not ask for something
 * already written down, and the coherence lint, which judges whether the
 * pieces fit and cannot do that without seeing all of them.
 *
 * The ontology summary used to be page-type counts — "2 puzzle, 1 observation"
 * — which tells a model the shape of the graph and nothing about the study.
 * Titles are what let it react.
 */

import { STATIONS } from "../flow/stations.ts";
import { stationValue } from "../flow/stationBrief.ts";
import type { ProjectBrief } from "../state/projects.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { livePages } from "../ontology/schema.ts";
import type { DesignDigest } from "./prompt.ts";
import { pageTypeLabel } from "../ui/pageTypeVocabulary.ts";

export function designDigest(brief: ProjectBrief): DesignDigest {
  /* The puzzle step travels as its own field with its own label (M58), so a
   * reader of the digest can tell the researcher's words from the reading. */
  const stations = STATIONS.filter((s) => s.id !== "puzzle")
    .map((s) => ({ label: s.label, text: stationValue(brief, s.id) }))
    .filter((s) => s.text.trim() !== "");
  const answer = stationValue(brief, "puzzle");
  return {
    ...(brief.researchQuestion.trim() === "" ? {} : { researchQuestion: brief.researchQuestion }),
    ...(answer.trim() === "" ? {} : { puzzleAnswer: answer }),
    stations,
    ...(brief.targetVenue === undefined || brief.targetVenue.trim() === ""
      ? {}
      : { targetVenue: brief.targetVenue }),
    ...(brief.seminalCorpus === undefined || brief.seminalCorpus.trim() === ""
      ? {}
      : { corpus: brief.seminalCorpus }),
    /* M84, ISC-707: the level every prompt asks at. */
    ...(brief.unit === undefined ? {} : { unit: brief.unit }),
    /* M92, ISC-749: the typed unit, when the unit is Other. */
    ...(brief.unit === "other" && brief.unitOther !== undefined ? { unitOther: brief.unitOther } : {}),
    ...(brief.dataType === "" ? {} : { dataType: brief.dataType }),
  };
}

/** True when the researcher has written nothing at all. */
export function digestIsEmpty(d: DesignDigest): boolean {
  return (
    d.researchQuestion === undefined &&
    d.puzzleAnswer === undefined &&
    d.stations.length === 0 &&
    d.targetVenue === undefined &&
    d.corpus === undefined
  );
}

/**
 * The ontology in named terms rather than as a census.
 *
 * Puzzle roots come first and are marked, because everything else in the graph
 * hangs off them and a model that cannot see which page is the root will treat
 * the list as unordered.
 */
export function ontologyDigest(graph: OntologyGraph): string {
  const pages = livePages(graph);
  if (pages.length === 0) return "";
  const roots = new Set(graph.puzzleRoots);
  const lines = pages.map((p) => {
    const mark = roots.has(p.id) ? ", the puzzle at the root" : "";
    // Named terms, and the type was not one: this line handed the interviewer
    // model "analytic-residue" and the model asks the researcher questions in
    // the words it was given. Same reason `lint/semantic.ts` stopped handing it
    // the origin slug.
    return `- ${p.title} (${pageTypeLabel(p.type)}${mark})`;
  });
  return [`${pages.length} page${pages.length === 1 ? "" : "s"} so far:`, ...lines].join("\n");
}

/**
 * The last few exchanges, oldest first.
 *
 * Bounded deliberately. The whole transcript would crowd out the material and
 * the design, and the ledger is the record anyway — this is working memory for
 * one turn, not an archive.
 */
export function transcriptDigest(
  entries: readonly {
    readonly kind: string;
    readonly text: string;
    /** Set when this turn delivered a selected question. See TranscriptEntry. */
    readonly question?: string;
    /** Set when the tool closed its own question. See TranscriptEntry (D9). */
    readonly setAsideFor?: "directions" | "another-question";
  }[],
  keep = 6,
): readonly string[] {
  const recent = entries.slice(Math.max(0, entries.length - keep));
  return recent.map((e) => {
    if (e.kind === "refusal") return refusalDigestLine(e);
    const who = e.kind === "human" ? "They said" : e.kind === "question" ? "You asked" : "You said";
    // A delivered question is folded into the turn that delivered it, so the
    // digest has to carry it too or the model loses sight of what it asked.
    const body = e.question === undefined ? e.text : `${e.text} ${e.question}`;
    return `${who}: ${body.replace(/\s+/g, " ").trim()}`;
  });
}

/**
 * A closed question, told to the model as what it was (D9, M43).
 *
 * Model input, so the words here are not the words on the card: the digest
 * addresses the model as "you" and the researcher as "they", and the card
 * addresses the researcher. What the two have to agree on is whose decision the
 * turn was.
 *
 * The walk of 2026-09-13 found both halves wrong. A researcher's own "Not now."
 * reached the model under "You said", so the tool was shown its own transcript
 * saying the thing the researcher had said. And a question the tool closed on the
 * way to a guidance turn reached it the same way, on which the model opened its
 * reply "Fair enough, that's yours to decline" and then answered a refusal that
 * had never happened. Both are named here, and the second says in as many words
 * that nothing was declined, because that is the sentence the model got wrong.
 */
function refusalDigestLine(entry: {
  readonly text: string;
  readonly setAsideFor?: "directions" | "another-question";
}): string {
  if (entry.setAsideFor === "directions") {
    return "You set your own question aside because they asked for directions. They did not decline it.";
  }
  if (entry.setAsideFor === "another-question") {
    return "You set your own question aside because they picked a different question. They did not decline it.";
  }
  return `They declined, saying: ${entry.text.replace(/\s+/g, " ").trim()}`;
}
