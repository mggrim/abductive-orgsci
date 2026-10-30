/**
 * Passage codes in model text, as labels (M96b, ISC-796).
 *
 * The owner, 2026-10-30, on the raw `[[chunk:…]]` code that a reply showed at
 * Early data: "Yes, show it as a label". The model cites a passage by its code,
 * and the stored text and History keep the code, so provenance stays checkable.
 * Everything that shows model text to a researcher, and every export, swaps the
 * code for the file's name and the passage's number as Sources shows it.
 */

import type { Chunk, StoredDocument } from "../state/chunks.ts";

/** One passage code: `[[chunk:<id>]]`. */
export const CHUNK_CODE = /\[\[chunk:([^\]\s]+)\]\]/g;

/** Each passage by its id: the file it came from and its number on Sources. */
export type PassageLookup = ReadonlyMap<string, { readonly file: string; readonly index: number }>;

export function passageLookup(
  chunks: readonly Pick<Chunk, "id" | "documentId" | "index">[],
  documents: readonly Pick<StoredDocument, "id" | "name">[],
): PassageLookup {
  const names = new Map(documents.map((d) => [d.id, d.name] as const));
  const out = new Map<string, { file: string; index: number }>();
  for (const c of chunks) {
    const file = names.get(c.documentId);
    if (file !== undefined) out.set(c.id, { file, index: c.index });
  }
  return out;
}

/** The label for a passage whose file has gone from Sources. */
export const REMOVED_PASSAGE_LABEL = "a passage from a file that you removed";

/** The label while the project's passages are still loading. */
export const PENDING_PASSAGE_LABEL = "a passage on Sources";

/** "ward-notes.txt, passage 4", numbered as Sources numbers it. */
export function citationLabel(id: string, lookup: PassageLookup | undefined): string {
  if (lookup === undefined) return PENDING_PASSAGE_LABEL;
  const found = lookup.get(id);
  return found === undefined ? REMOVED_PASSAGE_LABEL : `${found.file}, passage ${found.index + 1}`;
}

export type CitationSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "cite"; readonly id: string; readonly label: string; readonly known: boolean };

/** The text cut into plain runs and passage labels, in order. */
export function citationSegments(text: string, lookup: PassageLookup | undefined): readonly CitationSegment[] {
  const out: CitationSegment[] = [];
  let at = 0;
  for (const m of text.matchAll(CHUNK_CODE)) {
    const start = m.index ?? 0;
    if (start > at) out.push({ kind: "text", text: text.slice(at, start) });
    const id = m[1] ?? "";
    out.push({ kind: "cite", id, label: citationLabel(id, lookup), known: lookup?.has(id) === true });
    at = start + m[0].length;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}

/** The text with every passage code swapped for its label, for the exports. */
export function withCitationLabels(text: string, lookup: PassageLookup | undefined): string {
  return text.replace(CHUNK_CODE, (_all, id: string) => citationLabel(id, lookup));
}
