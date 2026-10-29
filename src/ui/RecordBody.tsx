/**
 * The record's body, wherever the record is being shown (M39, ISC-503).
 *
 * `RecordPanel` opened the record as a dialog from the study header at M38 and
 * computed four projections to feed `Instrumentation` with. ISC-503 puts the
 * same record in the Design companion, and a second component computing the same
 * four projections would be two surfaces claiming to be one record, which is the
 * thing `RecordPanel`'s own header and `Workbench.tsx`'s closing comment both
 * warn against.
 *
 * So the body is here and both mount it. The dialog is a frame around this; the
 * pane is a different frame around the same thing. There is one record.
 *
 * Every value is a replay of the ledger, so showing it costs no model call and
 * writes nothing. The projections are computed here rather than through
 * `useWorkbench` because that hook also generates interview moves, which neither
 * frame has any use for.
 *
 * `active` is what stops a study route paying for a surface nobody asked for.
 * The material is read when the record is actually being shown, which for the
 * dialog means opened and for the pane means chosen.
 */

import { useEffect, useMemo, useState } from "react";
import type { LedgerEventType } from "../ledger/events.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { listChunks, listDocuments } from "../state/projects.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import { projectOntology } from "../ontology/projection.ts";
import { livePages } from "../ontology/schema.ts";
import { LIVE_PAGES, originCensus } from "../ontology/attribution.ts";
import { projectSpine } from "../views/spineModel.ts";
import { projectTerritory } from "../views/territoryModel.ts";
import { projectTrajectory } from "../views/trajectoryModel.ts";
import { MATRIX } from "../matrix/matrix.ts";
import { Instrumentation } from "../workbench/Instrumentation.tsx";

export function RecordBody(props: {
  readonly projectId: string;
  readonly active: boolean;
  /** The kinds the timeline starts filtered to, when a count opened it (D51). */
  readonly kinds?: readonly LedgerEventType[];
}) {
  const { projectId, active, kinds } = props;
  const { events: allEvents } = useLedger();
  const [chunks, setChunks] = useState<readonly Chunk[]>([]);
  const [documents, setDocuments] = useState<readonly StoredDocument[]>([]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void Promise.all([listChunks(projectId), listDocuments(projectId)]).then(([c, d]) => {
      if (cancelled) return;
      setChunks(c);
      setDocuments(d);
    });
    return () => {
      cancelled = true;
    };
  }, [active, projectId, allEvents.length]);

  const events = useMemo(
    () => allEvents.filter((e) => e.projectId === projectId),
    [allEvents, projectId],
  );
  const graph = useMemo(() => projectOntology(events, projectId), [events, projectId]);
  const attribution = useMemo(() => originCensus(livePages(graph), LIVE_PAGES), [graph]);
  const spine = useMemo(() => projectSpine(events, projectId), [events, projectId]);
  const territory = useMemo(
    () => projectTerritory(events, MATRIX, projectId),
    [events, projectId],
  );
  const trajectory = useMemo(() => projectTrajectory(events, projectId), [events, projectId]);

  if (!active) return null;

  return (
    <Instrumentation
      hosted
      territory={territory}
      spine={spine}
      trajectory={trajectory}
      attribution={attribution}
      events={events}
      chunks={chunks}
      documents={documents}
      {...(kinds === undefined ? {} : { kinds })}
    />
  );
}
