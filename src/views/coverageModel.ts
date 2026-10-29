/**
 * Coverage-map projection (ISC-25) — pure function over ledger events plus
 * the chunk/document store reads. No state, no DOM: the CoverageMap view
 * renders exactly what this returns.
 */

import type { AttentionLayer, LedgerEvent } from "../ledger/events.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";

export interface ChunkCoverage {
  readonly chunkId: string;
  readonly documentId: string;
  readonly index: number;
  /** Whether the chunk was touched at each attention layer. */
  readonly layers: Readonly<Record<AttentionLayer, boolean>>;
  /** True when NO layer has touched the chunk (visually distinct in the map). */
  readonly unattended: boolean;
  /** First ~80 chars of the chunk, for tooltips. */
  readonly preview: string;
}

export interface DocumentCoverage {
  readonly documentId: string;
  readonly documentName: string;
  readonly chunks: readonly ChunkCoverage[];
}

export interface CoverageSummary {
  readonly documents: readonly DocumentCoverage[];
  readonly totalChunks: number;
  readonly unattendedChunks: number;
  /** Distinct chunks touched per layer (of chunks that exist in the store). */
  readonly touchedByLayer: Readonly<Record<AttentionLayer, number>>;
}

/**
 * Derive per-document, per-chunk coverage across the three attention layers.
 * `events` may be the full ledger; only `attention` events are read.
 */
export function projectCoverage(
  events: readonly LedgerEvent[],
  chunks: readonly Chunk[],
  documents: readonly StoredDocument[],
): CoverageSummary {
  const byLayer: Record<AttentionLayer, Set<string>> = {
    retrieval: new Set<string>(),
    citation: new Set<string>(),
    human: new Set<string>(),
  };
  for (const event of events) {
    if (event.type === "attention") byLayer[event.layer].add(event.chunkId);
  }

  const chunksByDocument = new Map<string, Chunk[]>();
  for (const chunk of chunks) {
    const list = chunksByDocument.get(chunk.documentId) ?? [];
    list.push(chunk);
    chunksByDocument.set(chunk.documentId, list);
  }

  const nameByDocument = new Map(documents.map((d) => [d.id, d.name]));
  const documentIds = [
    ...new Set([...documents.map((d) => d.id), ...chunksByDocument.keys()]),
  ];

  let unattendedChunks = 0;
  const touched: Record<AttentionLayer, number> = { retrieval: 0, citation: 0, human: 0 };

  const documentCoverage: DocumentCoverage[] = documentIds.map((documentId) => {
    const docChunks = (chunksByDocument.get(documentId) ?? [])
      .slice()
      .sort((a, b) => a.index - b.index);
    return {
      documentId,
      documentName: nameByDocument.get(documentId) ?? documentId,
      chunks: docChunks.map((chunk) => {
        const layers: Record<AttentionLayer, boolean> = {
          retrieval: byLayer.retrieval.has(chunk.id),
          citation: byLayer.citation.has(chunk.id),
          human: byLayer.human.has(chunk.id),
        };
        if (layers.retrieval) touched.retrieval += 1;
        if (layers.citation) touched.citation += 1;
        if (layers.human) touched.human += 1;
        const unattended = !layers.retrieval && !layers.citation && !layers.human;
        if (unattended) unattendedChunks += 1;
        return {
          chunkId: chunk.id,
          documentId,
          index: chunk.index,
          layers,
          unattended,
          preview: chunk.text.slice(0, 80),
        };
      }),
    };
  });

  return {
    documents: documentCoverage,
    totalChunks: chunks.length,
    unattendedChunks,
    touchedByLayer: touched,
  };
}
