/**
 * Suggest concepts from the data, in the Data section on Sources (M96, ISC-792).
 *
 * The control lived on the Early data step as well until the owner took it off
 * (2026-10-30): "there should be no data type or suggest concepts button at the
 * bottom of the early data screen." The pass stays where the data is, on
 * Sources, and it produces suggestions and nothing else: a concept enters the
 * ontology only when the researcher accepts it.
 */

import { useCallback, useRef, useState } from "react";
import { dataOnly, type Chunk } from "../state/chunks.ts";
import type { Project } from "../state/projects.ts";
import type { LedgerEvent } from "../ledger/events.ts";
import type { InferenceClient } from "../inference/types.ts";
import { runSuggestionCounts, suggestedLine } from "../concepts/run.ts";
import { activeInferenceClient } from "../ui/personaRun.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { getProject } from "../state/projects.ts";
import { InertNote, inertAttrs } from "../ui/components/index.ts";

/** Consider the data and suggest concepts from it: the one pass behind the Sources control. */
export async function suggestFromData(input: {
  readonly project: Project;
  readonly chunks: readonly Chunk[];
  readonly readEvents: (projectId: string) => Promise<readonly LedgerEvent[]>;
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<unknown>;
  readonly client: InferenceClient;
}): Promise<string> {
  const count = await runSuggestionCounts(
    {
      projectId: input.project.id,
      brief: input.project.brief,
      source: { kind: "data", chunkIds: [] },
      chunks: dataOnly(input.chunks),
      readEvents: input.readEvents,
      appendAll: input.appendAll,
    },
    input.client,
  );
  return suggestedLine(count);
}

/**
 * The control (M74b, ISC-665; renamed at M96). Inert until there is data, with
 * the sentence saying so.
 */
export function SuggestFromDataControl(props: {
  readonly projectId: string;
  readonly chunks: readonly Chunk[];
  readonly onChanged: () => void;
}) {
  const { projectId, chunks, onChanged } = props;
  const { appendAll, readEvents } = useLedger();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const data = dataOnly(chunks);
  const reason = data.length === 0 ? "Add data above first." : null;
  const suggest = useCallback(async () => {
    if (inFlight.current || data.length === 0) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const project = await getProject(projectId);
      if (project === undefined) return;
      const { client } = activeInferenceClient();
      setDone(await suggestFromData({ project, chunks: data, readEvents, appendAll, client }));
      onChanged();
    } catch (err) {
      setError(`Abductive couldn't suggest concepts from the data: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }, [data, projectId, readEvents, appendAll, onChanged]);
  return (
    <div className="read-data" data-testid="read-data-control">
      <button
        type="button"
        className="btn-quiet"
        onClick={() => void suggest()}
        data-testid="read-data"
        {...(busy ? { disabled: true } : inertAttrs("read-data", reason))}
      >
        {busy ? "Considering your data…" : "Suggest concepts"}
      </button>
      {!busy && <InertNote control="read-data" reason={reason} />}
      <p className="small muted" data-testid="read-data-scope">
        Abductive considers your data files and excludes the papers. Abductive puts its concepts on the Emerging
        project ontology tab as suggestions, and a suggestion joins your ontology only when you accept it.
      </p>
      {error !== null && (
        <p className="error small" role="alert" data-testid="read-data-error">
          {error}
        </p>
      )}
      {done !== null && (
        <p className="small muted" role="status" data-testid="read-data-done">
          {done}
        </p>
      )}
    </div>
  );
}
