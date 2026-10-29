/**
 * A search of one study (M53, ISC-545).
 *
 * The owner, on the M52 build: "Turn cmdK into a search." The palette keeps
 * FND-02: it goes places and never acts. So this module does two things and
 * only these two. It folds what the study holds into entries, each carrying the
 * href of the place it lives, and it matches a query against them. Nothing here
 * reads or writes the record, calls a model or fetches anything; the caller hands
 * it projections it already holds, and what comes back is text and links.
 *
 * Four kinds, in the order the results list groups them: the claims in Your model,
 * the saved answers at the steps and in the theoretical motivation, the passages
 * of the material, and the papers. The flags the checks raised were a fifth until
 * the checks left main (M89, 2026-10-14). Places (tabs,
 * steps, routes) are the keyboard table's navigate rows and stay in the palette,
 * because their links depend on the route the reader is on.
 *
 * Matching is every word of the query, in any order, case and accents ignored,
 * over the entry's title and text. That is deliberately plain: a study holds a few
 * hundred entries, and a fuzzy match over prose mostly finds things the
 * researcher did not mean.
 */

import type { ProjectBrief } from "../state/projects.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import { STATIONS } from "../flow/stations.ts";
import { stationField } from "../flow/stationBrief.ts";
import { FRAMING_FIELDS, FRAMING_FIELD_ID, FRAMING_QUESTION } from "../flow/FramingBand.tsx";
import { STUDY_TAB_LABEL, literaturePath, motivationPath, passagePath, studyPath, claimPath } from "../ui/routes.ts";

export type SearchKind = "claim" | "answer" | "passage" | "paper";

export const SEARCH_KINDS: readonly SearchKind[] = ["claim", "answer", "passage", "paper"];

/** The heading each group of results is shown under. */
export const SEARCH_KIND_LABEL: Readonly<Record<SearchKind, string>> = {
  claim: "Claims",
  answer: "Your answers",
  passage: "Passages",
  paper: "Papers",
};

export interface SearchEntry {
  readonly kind: SearchKind;
  /** Unique within its kind. */
  readonly id: string;
  /** What the row says in bold: a claim's title, a step's name, a file name. */
  readonly title: string;
  /** The text matched beside the title, and cut for the row's second line. */
  readonly detail: string;
  /** Where choosing it goes. Always a route inside this study. */
  readonly href: string;
}

export interface SearchInput {
  readonly projectId: string;
  readonly brief: ProjectBrief;
  readonly pages: readonly { readonly id: string; readonly title: string; readonly body?: string }[];
  readonly chunks: readonly Chunk[];
  readonly documents: readonly StoredDocument[];
  readonly papers: readonly { readonly key: string; readonly name: string }[];
  /**
   * The suggested puzzle the Puzzle step shows: the latest reading when there is one,
   * else the brief's field (`puzzleState` in views/puzzleReading.ts). Passed in
   * so this module needs no projection of its own; the brief's field when absent.
   */
  readonly puzzle?: string;
}

export interface SearchResult {
  readonly entry: SearchEntry;
  /** The line under the title: the text round the first match. */
  readonly snippet: string;
}

/** Fold the study into entries. Empty answers and empty passages are not entries. */
export function buildSearchIndex(input: SearchInput): SearchEntry[] {
  const { projectId, brief } = input;
  const entries: SearchEntry[] = [];

  for (const page of input.pages) {
    entries.push({
      kind: "claim",
      id: page.id,
      title: page.title,
      detail: page.body ?? "",
      href: claimPath(projectId, page.id),
    });
  }

  for (const field of FRAMING_FIELDS) {
    const text = brief[field]?.trim() ?? "";
    if (text === "") continue;
    entries.push({
      kind: "answer",
      id: field,
      title: `${STUDY_TAB_LABEL.motivation}: ${FRAMING_QUESTION[field]}`,
      detail: text,
      href: motivationPath(projectId, FRAMING_FIELD_ID[field]),
    });
  }
  /* The suggested puzzle. The tool's words rather than the researcher's, and
   * still where the study stands, so it is found and it goes to the place that
   * shows it: the Puzzle step on Design since ISC-587 took it off Starting
   * point. Its own id, because the step's saved answer is also an answer with
   * the id `puzzle`, and the palette keys a row by kind and id. */
  const puzzle = (input.puzzle ?? brief.researchQuestion ?? "").trim();
  if (puzzle !== "") {
    entries.push({
      kind: "answer",
      id: "puzzle-reading",
      title: `${STUDY_TAB_LABEL.design}: suggested puzzle`,
      detail: puzzle,
      href: studyPath(projectId, "design", "puzzle"),
    });
  }
  for (const station of STATIONS) {
    const field = stationField(station.id);
    const value = field === null ? undefined : brief[field];
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "") continue;
    entries.push({
      kind: "answer",
      id: station.id,
      title: station.label,
      detail: text,
      href: studyPath(projectId, "design", station.id),
    });
  }

  const names = new Map(input.documents.map((d) => [d.id, d.name]));
  for (const chunk of input.chunks) {
    if (chunk.text.trim() === "") continue;
    entries.push({
      kind: "passage",
      id: chunk.id,
      title: names.get(chunk.documentId) ?? "A passage",
      detail: chunk.text,
      href: passagePath(projectId, chunk.id),
    });
  }

  for (const paper of input.papers) {
    entries.push({
      kind: "paper",
      id: paper.key,
      title: paper.name,
      detail: "",
      href: literaturePath(projectId),
    });
  }

  return entries;
}

/** Lower case, accents stripped, runs of space collapsed. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const SNIPPET = 120;

/**
 * The text round the first match, cut at word edges and marked where it was cut.
 *
 * Folding strips combining marks and so can shorten a string, which would move
 * every index after an accented letter; the offsets are therefore found in a
 * folded copy built one character at a time, which keeps the two aligned.
 */
function snippetOf(text: string, words: readonly string[]): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= SNIPPET) return clean;
  const folded = [...clean].map((ch) => fold(ch).slice(0, 1) || " ").join("");
  const at = Math.min(...words.map((w) => folded.indexOf(w)).filter((i) => i >= 0), folded.length);
  let start = Math.max(0, at - 40);
  let end = Math.min(clean.length, start + SNIPPET - 2);
  start = Math.max(0, end - (SNIPPET - 2));
  if (start > 0) {
    const space = clean.indexOf(" ", start);
    if (space > 0 && space < at) start = space + 1;
  }
  if (end < clean.length) {
    const space = clean.lastIndexOf(" ", end);
    if (space > at) end = space;
  }
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

/**
 * Every entry holding every word of the query, best first.
 *
 * Best is: more of the words in the title, then the kind order above, then the
 * order the study holds them in. At most `perKind` of any one kind, so a common
 * word does not bury the other groups under one. An empty query finds nothing,
 * so the palette shows its places.
 */
export function searchStudy(entries: readonly SearchEntry[], query: string, perKind = 8): SearchResult[] {
  const words = fold(query).split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return [];
  const scored: { entry: SearchEntry; titleHits: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const title = fold(entry.title);
    const all = `${title} ${fold(entry.detail)}`;
    if (!words.every((w) => all.includes(w))) return;
    scored.push({ entry, titleHits: words.filter((w) => title.includes(w)).length, order });
  });
  scored.sort(
    (a, b) =>
      b.titleHits - a.titleHits ||
      SEARCH_KINDS.indexOf(a.entry.kind) - SEARCH_KINDS.indexOf(b.entry.kind) ||
      a.order - b.order,
  );
  const taken = new Map<SearchKind, number>();
  const kept = scored.filter(({ entry }) => {
    const n = taken.get(entry.kind) ?? 0;
    taken.set(entry.kind, n + 1);
    return n < perKind;
  });
  return kept.map(({ entry }) => ({
    entry,
    snippet: entry.detail === "" ? "" : snippetOf(entry.detail, words),
  }));
}
