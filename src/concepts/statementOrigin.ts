/**
 * A statement's origin as the label a researcher reads (M75, ISC-669).
 *
 * The owner, 2026-10-03: "shouldn't they be labeled?" Every statement shows
 * where it came from wherever it appears: the step whose summary it came from
 * ("Context summary"), the document a read of the data drew it from, by kind and
 * number ("Fieldnote 2", or "Chat note" when the project has one chat note), the
 * papers, the rival writer, or the researcher's replies at a step ("Your replies
 * at Context").
 */

import type { StatementFrom } from "./projection.ts";
import type { StatementSuggestedEvent } from "../ledger/events.ts";
import type { Chunk, DocumentKind, StoredDocument } from "../state/chunks.ts";
import { resolveStationId, stationById } from "../flow/stations.ts";

/** A document kind as the head of a label. */
const KIND_HEAD: Readonly<Record<DocumentKind, string>> = {
  transcript: "Transcript",
  fieldnote: "Fieldnote",
  chatnote: "Chat note",
  archival: "Archival document",
  memo: "Memo",
  literature: "Paper",
};

export interface LabelContext {
  readonly chunks: readonly Chunk[];
  readonly documents: readonly StoredDocument[];
}

/** "Fieldnote 2": the document's kind, numbered in upload order when the project has more than one of that kind. */
export function documentLabel(documentId: string, documents: readonly StoredDocument[]): string | null {
  const doc = documents.find((d) => d.id === documentId);
  if (doc === undefined) return null;
  const same = documents.filter((d) => d.kind === doc.kind).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const head = KIND_HEAD[doc.kind];
  return same.length > 1 ? `${head} ${same.findIndex((d) => d.id === doc.id) + 1}` : head;
}

/** The label a statement carries, from its origin. */
export function statementLabel(from: StatementFrom, ctx: LabelContext): string {
  switch (from.kind) {
    case "summary": {
      const id = resolveStationId(from.station);
      return id === undefined ? "Starting point summary" : `${stationById(id).label} summary`;
    }
    case "data": {
      for (const chunkId of from.chunkIds) {
        const chunk = ctx.chunks.find((c) => c.id === chunkId);
        const label = chunk === undefined ? null : documentLabel(chunk.documentId, ctx.documents);
        if (label !== null) return label;
      }
      return "From your data";
    }
    case "papers":
      return "From the papers";
    case "rival":
      return "Rival from Abductive";
    case "conversation": {
      /* The lead's ruling B (2026-10-03): the researcher's replies at a step. */
      if (from.station === undefined) return "Your replies";
      if (from.station === "framing") return "Your replies at Starting point";
      const id = resolveStationId(from.station);
      return id === undefined ? "Your replies" : `Your replies at ${stationById(id).label}`;
    }
  }
}

/** A suggested statement's origin: the step whose summary, or the passage of data, it came from. */
export function suggestionFrom(s: StatementSuggestedEvent): StatementFrom {
  if (s.source.kind === "summary") return { kind: "summary", station: s.source.station };
  /* M93: a statement surfaced from a step's chat. */
  if (s.source.kind === "chat") return { kind: "conversation", station: s.source.station };
  if (s.chunkId !== undefined) return { kind: "data", chunkIds: [s.chunkId] };
  if (s.source.kind === "data") return { kind: "data", chunkIds: s.source.chunkIds };
  return { kind: "conversation" };
}
