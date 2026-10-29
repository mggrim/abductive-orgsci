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

import { dataOnly, type StoredDocument } from "../state/chunks.ts";
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
