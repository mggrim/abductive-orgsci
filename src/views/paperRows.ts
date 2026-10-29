/**
 * The papers, with each one's verdict and what it expects (M38 ISC-499, lifted
 * at M39 ISC-503).
 *
 * Written as a `useMemo` inside `FramingBand.tsx` when the papers first became
 * readable beside the framing. ISC-503 puts the same list in the Design
 * companion, and two surfaces folding the same three sources into the same rows
 * is FIN-02 with a different noun, so the fold is here and both read it.
 *
 * It carries no prose. The three sentences a reader meets about a paper — not
 * judged, nothing expected, and the verdict chip's own words — stay in the
 * components that draw them, because they are already written once each and
 * already in the copy bar's scope.
 *
 * Live papers only, keyed the way a verdict is keyed. A typed line the
 * researcher has edited stops being a paper the moment the line goes, and its
 * verdict is about a line that no longer exists.
 */

import type { LedgerEvent, PaperBaseline } from "../ledger/events.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import { paperRefs } from "../proposals/theory.ts";
import { paperVerdicts } from "../proposals/paperFit.ts";
import type { PaperFit } from "../proposals/fitVerdict.ts";

export interface PaperRow {
  readonly key: string;
  readonly name: string;
  /** Absent when nobody has asked this paper what it expects. */
  readonly verdict?: PaperFit;
  /**
   * Absent and empty are different states.
   *
   * Undefined is a paper nobody has asked what it expects; empty is the question
   * put and the answer none. A surface that renders them the same way tells the
   * researcher a paper expects nothing when nothing has been asked of it.
   */
  readonly expectations: readonly PaperBaseline[] | undefined;
}

export interface PaperRowsInput {
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
  readonly documents: readonly StoredDocument[];
  readonly chunks: readonly Chunk[];
  /** The typed paper list from the brief, when there is one. */
  readonly typedList?: string;
}

export function paperRows(input: PaperRowsInput): readonly PaperRow[] {
  const refs = paperRefs({
    documents: input.documents,
    chunks: input.chunks,
    ...(input.typedList === undefined ? {} : { typedList: input.typedList }),
  });
  const verdicts = paperVerdicts(input.events, input.projectId, new Set(refs.map((r) => r.key)));
  return refs.map((paper) => {
    const verdict = verdicts.get(paper.key);
    return {
      key: paper.key,
      name: paper.name,
      ...(verdict === undefined ? {} : { verdict: verdict.verdict }),
      expectations: verdict?.baselines,
    };
  });
}
