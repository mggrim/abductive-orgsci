/**
 * Extracting an ontology from the modal twin, by the same procedure as the
 * researcher's (ISC-66).
 *
 * "Same procedure" is doing real work here. If the twin's ontology came from a
 * bespoke prompt tuned to produce a tidy conventional graph, the comparison
 * would measure the difference between two prompts rather than the difference
 * between two designs. So this feeds the twin's three facets through
 * `extractProposals` — the identical extractor, the identical parsing, the
 * identical page-type vocabulary the researcher's uploads go through.
 *
 * The one honest asymmetry: the twin's proposals are accepted automatically,
 * because there is no researcher to adjudicate a baseline. That is recorded in
 * the origin (`model-proposed` throughout) rather than hidden, and it is why
 * the comparison reads the twin graph as an artifact and never merges it into
 * the project's own ledger.
 */

import type { InferenceClient } from "../inference/types.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import { projectOntology } from "../ontology/projection.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { extractProposals } from "../proposals/extract.ts";
import type { Chunk } from "../state/chunks.ts";
import type { ModalTwin } from "./twin.ts";

/**
 * The twin's prose as pseudo-chunks, so the extractor sees the same shape of
 * input it sees for a real corpus. Ids are stable and prefixed so a twin chunk
 * can never be mistaken for a corpus chunk in any downstream citation.
 */
export function twinChunks(twin: ModalTwin): readonly Chunk[] {
  const facets: readonly [string, string][] = [
    ["research-question", twin.researchQuestionFraming],
    ["site-sample", twin.siteSampleLogic],
    ["expected-findings", twin.expectedFindings],
    // M29, A6. Undefined on a twin stored before the fourth facet existed, and
    // the empty-facet filter below already drops it, so an old baseline yields
    // the same three pseudo-chunks it always did.
    ["expected-contribution", twin.expectedContribution ?? ""],
  ];
  return facets
    .filter(([, text]) => text.trim() !== "")
    .map(([key, text], index) => ({
      id: `twin:${key}`,
      projectId: twin.projectId,
      documentId: `twin:${twin.id}`,
      kind: "memo" as const,
      text,
      index,
    }));
}

export interface TwinOntology {
  readonly twinId: string;
  readonly projectId: string;
  readonly graph: OntologyGraph;
  /** The synthetic events the graph was projected from. Never appended to the project ledger. */
  readonly events: readonly LedgerEvent[];
  readonly model: string;
}

export interface TwinOntologyOptions {
  readonly now?: () => number;
  readonly makeId?: () => string;
}

/**
 * Run the twin's prose through the researcher's extractor and project the
 * result. Returns an in-memory graph; nothing is persisted and nothing touches
 * the project's ledger.
 */
export async function extractTwinOntology(
  twin: ModalTwin,
  client: InferenceClient,
  options: TwinOntologyOptions = {},
): Promise<TwinOntology> {
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  // Namespaced so a twin graph can never collide with the project's ontology
  // if the two are ever held in one array by mistake.
  const twinProjectId = `twin:${twin.projectId}`;

  const extraction = await extractProposals(
    {
      projectId: twinProjectId,
      chunks: twinChunks(twin),
      now,
      makeId,
    },
    client,
  );

  const events: LedgerEvent[] = [...extraction.events];
  for (const proposal of extraction.proposals) {
    events.push({
      id: makeId(),
      ts: now(),
      actor: "system",
      projectId: twinProjectId,
      type: "ontology-mutation",
      op: "create",
      targetId: proposal.proposalId,
      ...(proposal.pageType === undefined ? {} : { pageType: proposal.pageType }),
      title: proposal.title,
      body: proposal.body ?? "",
      // No researcher took this in, so it stays model-proposed. The twin is a
      // machine artifact and the graph should say so on every page.
      origin: "model-proposed",
      supportingChunks: proposal.sourceChunks,
    });
  }

  return {
    twinId: twin.id,
    projectId: twin.projectId,
    graph: projectOntology(events, twinProjectId),
    events,
    model: twin.model,
  };
}
