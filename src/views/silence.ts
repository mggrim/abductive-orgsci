/**
 * The silence claim, and what is attached to it (walk item 4).
 *
 * A puzzle can stand to an expectation in four ways, and one of them is that
 * the literature says nothing here. That claim owes the researcher something
 * specific: at least one thing their account cannot explain, which stays
 * unexplained *because* nobody has written about it. The obligation check in
 * `ontology/relations.ts` counts residues linked to the puzzle.
 *
 * Nothing in the product wrote that link. So a study with a full residue panel
 * read "Nothing here is left unexplained" on the same screen as "Your account
 * cannot explain 2 things", and there was no way to reconcile them, because
 * the act that would have reconciled them did not exist.
 *
 * These two selectors are what the surface needs to offer that act: which
 * puzzle is making the silence claim, and which residues are already attached
 * to it. Both are pure reads of the graph, so the panel that offers the control
 * and the check that counts the result cannot disagree about what counts.
 */

import type { OntologyGraph } from "../ontology/schema.ts";
import { edgesInto } from "../ontology/schema.ts";

/**
 * The live puzzle whose framing claim is that the papers are silent here, or
 * null.
 *
 * The first one, when a study somehow has two: the control it feeds is an
 * attachment, and attaching to an arbitrary one of two silence claims would be
 * the tool choosing which claim the researcher is making.
 */
export function silentPuzzleId(graph: OntologyGraph): string | null {
  const claim = graph.relations.find(
    (r) => r.relation === "silent" && graph.pages.get(r.puzzleId)?.retired === false,
  );
  return claim?.puzzleId ?? null;
}

/** The residues already attached to the silence claim, by page id. */
export function residuesOnSilence(graph: OntologyGraph): ReadonlySet<string> {
  const puzzleId = silentPuzzleId(graph);
  if (puzzleId === null) return new Set<string>();
  return new Set(
    edgesInto(graph, puzzleId)
      .filter((edge) => graph.pages.get(edge.from)?.type === "analytic-residue")
      .map((edge) => edge.from),
  );
}
