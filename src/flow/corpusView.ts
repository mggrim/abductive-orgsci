/**
 * Finding something in the corpus (MAT-03).
 *
 * The gap this closes. /material listed documents in the order they were added
 * and offered no way to find one: no search, no sort, no filter, no grouping,
 * on the screen that is our answer to the two managers every incumbent builds
 * first. ATLAS.ti 25's Document Manager has an ID and a Name column, list and
 * treemap views, hierarchical folders, grouping by five keys and a filter
 * panel; NVivo 15 pairs a List View with a Detail View and a Find Bar under the
 * ribbon. Two documents is a demo. Forty interviews is a study, and at forty
 * the only way to reach the eleventh transcript was to scroll.
 *
 * What this is not. It is a view of the list and nothing else: no document is
 * removed, no passage is dropped from the study, nothing is written and nothing
 * is recorded. The surface says that in words beside the count, because a
 * researcher who filters to three documents and then reads a total of two has
 * to be able to tell a filtered list from a shrinking corpus.
 *
 * The facets are the ones this tool can offer and the incumbents cannot.
 * ATLAS.ti groups by document group, code and author; we group by whether the
 * study has opened a passage and whether the ontology cites one, which are
 * facts neither product tracks at all. "Not opened" is the filter the whole
 * surface argues for: what you never read is part of the record too, and until
 * now the researcher could see the number 3 in a chip and had no way to ask
 * which three.
 *
 * Pure, and separated from the component for the usual reason: the counts the
 * surface prints beside the list have to be the counts the list is built from,
 * and the only way to hold that is for one function to produce both. That is
 * the exact defect rounds one and two of this pair were sent back for, one tab
 * over, where a chip beside a Download button knew better than the file the
 * button wrote.
 */

import type { Chunk, DocumentKind, StoredDocument } from "../state/chunks.ts";
import { documentKindLabel } from "../ui/materialVocabulary.ts";

/** How the list is ordered. `added` is by when each document was added. */
export type CorpusSort = "added" | "name" | "kind" | "passages" | "words" | "opened";

/** Which passages the view is showing. `all` is every one of them. */
export type CorpusShow = "all" | "opened" | "unopened" | "cited" | "uncited";

export const CORPUS_SORTS: readonly { readonly id: CorpusSort; readonly label: string }[] = [
  { id: "added", label: "as added" },
  { id: "name", label: "by name" },
  { id: "kind", label: "by kind, then name" },
  { id: "passages", label: "most passages first" },
  { id: "words", label: "most words first" },
  { id: "opened", label: "most opened first" },
];

export const CORPUS_SHOWS: readonly { readonly id: CorpusShow; readonly label: string }[] = [
  { id: "all", label: "every passage" },
  { id: "opened", label: "passages you have opened" },
  { id: "unopened", label: "passages you haven't opened" },
  { id: "cited", label: "passages that your ontology cites" },
  { id: "uncited", label: "uncited passages" },
];

export interface CorpusRow {
  readonly doc: StoredDocument;
  /** The passages this view is showing, in document order. */
  readonly chunks: readonly Chunk[];
  /** Passages this document has that the view is not showing. Printed, not hidden. */
  readonly withheld: number;
  /** Facts about the whole document, never about the filtered subset. */
  readonly passages: number;
  readonly words: number;
  readonly opened: number;
  readonly cited: number;
  /**
   * The query matched the text of a passage rather than the name of the file,
   * so the fold opens on its own. A search that finds a phrase in a transcript
   * and then hides it behind two closed disclosures has not found anything.
   */
  readonly hitInText: boolean;
}

export interface CorpusView {
  readonly rows: readonly CorpusRow[];
  readonly documentsShown: number;
  readonly documentsTotal: number;
  readonly passagesShown: number;
  readonly passagesTotal: number;
  /** True when the view is showing less than the whole corpus. */
  readonly narrowed: boolean;
}

export interface CorpusQuery {
  readonly documents: readonly StoredDocument[];
  readonly chunks: readonly Chunk[];
  readonly opened: ReadonlySet<string>;
  readonly cited: ReadonlySet<string>;
  readonly query: string;
  readonly show: CorpusShow;
  readonly sort: CorpusSort;
  /** How a word count is taken, passed in so the surface and this agree on one. */
  readonly countWords: (text: string) => number;
}

function matchesShow(
  chunk: Chunk,
  show: CorpusShow,
  opened: ReadonlySet<string>,
  cited: ReadonlySet<string>,
): boolean {
  switch (show) {
    case "all":
      return true;
    case "opened":
      return opened.has(chunk.id);
    case "unopened":
      return !opened.has(chunk.id);
    case "cited":
      return cited.has(chunk.id);
    case "uncited":
      return !cited.has(chunk.id);
  }
}

/**
 * A document matches a query by its name or by its kind, and a passage matches
 * by its text. Kind is in there because the chips already print it: a
 * researcher who can see FIELDNOTE on a row will type it into a box that says
 * it searches the material, and a search that ignores a word printed on the
 * thing being searched is a search that looks broken.
 */
function documentMatches(doc: StoredDocument, needle: string): boolean {
  if (needle === "") return true;
  return (
    doc.name.toLowerCase().includes(needle) ||
    doc.kind.includes(needle) ||
    // The label, not only the stored kind (D5). Four of the five kinds are the
    // same string either way; `literature` prints as "paper", and a researcher
    // who can see PAPER on a row will type "paper" into the box that says it
    // searches the material. The stored word stays matchable too.
    documentKindLabel(doc.kind).includes(needle)
  );
}

// Literature sorts last, which is where it sits on the page: this order is only
// ever applied to one list at a time now (D5 stacks the papers above the data),
// and a total order over every kind keeps the type exhaustive either way.
const KIND_ORDER: Readonly<Record<DocumentKind, number>> = {
  transcript: 0,
  fieldnote: 1,
  chatnote: 2,
  archival: 3,
  memo: 4,
  literature: 5,
};

function order(a: CorpusRow, b: CorpusRow, sort: CorpusSort): number {
  switch (sort) {
    /* By when the document was added, not by the order storage hands them back
     * (D18, M43b).
     *
     * This returned 0, which left the rows in the order `listDocuments` produced,
     * which is IndexedDB key order, which is the document id. The walk of
     * 2026-09-13 added six files in one order and the list drew them in another,
     * matching neither the order they were added nor its reverse: "as added" was
     * sorting by internal id.
     *
     * `createdAt` is stamped by `ingestFile` when the document is made, so it is
     * the fact the label names. Oldest first, because "as added" is the order the
     * researcher built the corpus in and reading it back that way is how they
     * recognise it. Ties break on the name, so two files stamped in the same
     * millisecond have a stable order rather than one that depends on the sort's
     * own stability. */
    case "added":
      return a.doc.createdAt - b.doc.createdAt || a.doc.name.localeCompare(b.doc.name);
    case "name":
      return a.doc.name.localeCompare(b.doc.name);
    case "kind": {
      const byKind = KIND_ORDER[a.doc.kind] - KIND_ORDER[b.doc.kind];
      return byKind !== 0 ? byKind : a.doc.name.localeCompare(b.doc.name);
    }
    case "passages":
      return b.passages - a.passages || a.doc.name.localeCompare(b.doc.name);
    case "words":
      return b.words - a.words || a.doc.name.localeCompare(b.doc.name);
    case "opened":
      return b.opened - a.opened || a.doc.name.localeCompare(b.doc.name);
  }
}

/**
 * The list the surface renders and the counts it prints beside it, from one
 * pass over the corpus.
 *
 * A document survives if it matches the query itself, or if one of its
 * passages does. A passage survives if it passes the show filter, and, when
 * the document did not match by name, if it also matches the query. So
 * searching "handover" inside a filter of "not opened" answers the question
 * the two controls together ask, which is where in the material I have not
 * read is that word.
 */
export function corpusView(q: CorpusQuery): CorpusView {
  const needle = q.query.trim().toLowerCase();
  const rows: CorpusRow[] = [];
  for (const doc of q.documents) {
    const all = q.chunks.filter((c) => c.documentId === doc.id).sort((a, b) => a.index - b.index);
    const byName = documentMatches(doc, needle);
    let hitInText = false;
    const chunks = all.filter((chunk) => {
      if (!matchesShow(chunk, q.show, q.opened, q.cited)) return false;
      if (needle === "" || byName) return true;
      const hit = chunk.text.toLowerCase().includes(needle);
      if (hit) hitInText = true;
      return hit;
    });
    // A document whose own name matched still tells the truth about which of
    // its passages carry the word, so the fold opens for that too.
    if (byName && needle !== "" && all.some((c) => c.text.toLowerCase().includes(needle))) {
      hitInText = true;
    }
    const keep = needle === "" && q.show === "all" ? true : chunks.length > 0 || (byName && all.length === 0);
    if (!keep) continue;
    rows.push({
      doc,
      chunks,
      withheld: all.length - chunks.length,
      passages: all.length,
      words: all.reduce((sum, c) => sum + q.countWords(c.text), 0),
      opened: all.filter((c) => q.opened.has(c.id)).length,
      cited: all.filter((c) => q.cited.has(c.id)).length,
      hitInText,
    });
  }
  /* Every order sorts, `added` included (D18, M43b). It was the one that did not:
   * the rows were handed back in the order `listDocuments` produced, which is
   * IndexedDB key order, which is the document id. */
  const sorted = [...rows].sort((a, b) => order(a, b, q.sort));
  const passagesShown = sorted.reduce((n, row) => n + row.chunks.length, 0);
  return {
    rows: sorted,
    documentsShown: sorted.length,
    documentsTotal: q.documents.length,
    passagesShown,
    passagesTotal: q.chunks.length,
    narrowed: sorted.length < q.documents.length || passagesShown < q.chunks.length,
  };
}

/**
 * What the surface prints under the controls. One sentence, always present, so
 * the line does not appear and disappear as the researcher types, and it states
 * the whole corpus even when it is showing all of it.
 *
 * No blocking vocabulary anywhere in here on purpose. A filter that says
 * something is "hidden" or "excluded" reads as the tool withholding material;
 * what is true is that the researcher is looking at part of their own corpus
 * and everything is still there.
 */
export function corpusViewNote(view: CorpusView): string {
  const docs = `${view.documentsShown} of ${view.documentsTotal} document${view.documentsTotal === 1 ? "" : "s"}`;
  const passages = `${view.passagesShown} of ${view.passagesTotal} passage${view.passagesTotal === 1 ? "" : "s"}`;
  const head = `Showing ${docs} and ${passages}.`;
  return view.narrowed ? `${head} You see a view of the list. Everything is still in the project.` : head;
}
