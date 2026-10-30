/**
 * Whether a study's data section is open (M49, ISC-529).
 *
 * One rule, read by Material and by the Early data step, so the two cannot
 * disagree about whether this study is one with data.
 *
 * Two ways in, and the second is what keeps every study written before M49
 * opening the way it always did. The researcher pressed "I already have some
 * initial data", which is recorded on the project; or the study holds data
 * already, which is the case for the shipped example, for every bundle a
 * co-author sends with material in it, and for every study that had data before
 * the control existed.
 *
 * Data means data. `dataOnly` is the partition D5 made: the papers a researcher
 * is arguing with are not their material, and a study whose only uploads are
 * papers has no data, however many files it holds. That distinction is the one
 * D12 was reopened over on 2026-09-13, when a single uploaded paper made the
 * rail report Early data as answered.
 */

import { dataOnly, type Chunk, type StoredDocument } from "../state/chunks.ts";
import type { Project } from "../state/projects.ts";

/** Whether this study holds any document the researcher collected. */
export function hasData(documents: readonly StoredDocument[]): boolean {
  return dataOnly(documents).length > 0;
}

/**
 * Whether the data section shows.
 *
 * `project` may be undefined while a surface is still reading it, and an absent
 * project is treated as one that has said nothing: the section stays closed
 * until there is something to base it on, rather than flashing open and shut.
 */
export function dataSectionOpen(
  project: Project | undefined,
  documents: readonly StoredDocument[],
): boolean {
  return project?.dataDeclaredAt !== undefined || hasData(documents);
}

/**
 * What the Early data conversation considers (M96, ISC-790).
 *
 * The owner, 2026-10-30: "the early data discussion should consider all of the
 * data that has been uploaded as context." Every data file on Sources, in full
 * and named by file, with the papers left out (D5: a paper is evidence of what
 * someone expects, and the conversation here is about the researcher's own
 * material).
 *
 * A file goes in whole or not at all, oldest upload first, until the budget is
 * spent. The budget is generous (about 50,000 words) and exists so a very large
 * corpus cannot push the rest of the prompt out of the model's context; a file
 * that goes past it is named on screen and in the prompt, so the researcher
 * knows which files the conversation left out.
 */
export const EARLY_DATA_BUDGET_CHARS = 300_000;

export interface EarlyDataScope {
  /** The data files the conversation considers, oldest upload first. */
  readonly considered: readonly StoredDocument[];
  /** Data files past the budget, named so the researcher can see them. */
  readonly leftOut: readonly StoredDocument[];
  /** The passages of the considered files, in file then passage order. */
  readonly chunks: readonly Chunk[];
}

export function earlyDataScope(
  documents: readonly StoredDocument[],
  chunks: readonly Chunk[],
  budget: number = EARLY_DATA_BUDGET_CHARS,
): EarlyDataScope {
  const files = [...dataOnly(documents)].sort((a, b) => a.createdAt - b.createdAt || a.name.localeCompare(b.name));
  const byFile = new Map<string, Chunk[]>();
  for (const c of dataOnly(chunks)) {
    const list = byFile.get(c.documentId) ?? [];
    list.push(c);
    byFile.set(c.documentId, list);
  }
  const considered: StoredDocument[] = [];
  const leftOut: StoredDocument[] = [];
  const kept: Chunk[] = [];
  let spent = 0;
  for (const file of files) {
    const passages = (byFile.get(file.id) ?? []).sort((a, b) => a.index - b.index);
    const size = passages.reduce((n, c) => n + c.text.length, 0);
    if (spent + size > budget && considered.length > 0) {
      leftOut.push(file);
      continue;
    }
    spent += size;
    considered.push(file);
    kept.push(...passages);
  }
  return { considered, leftOut, chunks: kept };
}
