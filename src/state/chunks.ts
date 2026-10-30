/**
 * Documents, chunks, and ingestion (ISC-20, ISC-21).
 *
 * Chunking is pure and paragraph-based (~1500 chars per chunk) so it is
 * fully unit-testable.
 *
 * The 20-document cap used to be a gate. `assertDocumentCapacity` threw
 * `DocumentLimitError` at the twentieth file and the UI rendered its message
 * verbatim: "Document limit reached: this project already has 20 of 20 allowed
 * documents. Remove or consolidate documents before uploading more."
 *
 * Two things wrong with that and the second is worse than the first. Nothing in
 * this tool gates, and that sentence told the researcher they were blocked. And
 * it instructed them to remove or consolidate documents on a surface with no
 * remove, no rename and no consolidate: the only buttons on the screen when it
 * fired were "Close" and "Skip to the main content". A tool that blocks you and
 * then names an action it does not have is worse than one that simply blocks.
 *
 * So 20 is an advisory now. Files past it are ingested like any other and the
 * surface says what the consequence is, which is a real one: the reading passes
 * hand the corpus to a model, and a corpus this size is where a pass stops
 * being quick and starts being worth batching. That is a fact about the study
 * the researcher can act on. It is not a door.
 */

/**
 * What a file in this study is (D5).
 *
 * `literature` is the fifth and it is not like the other four. The four are
 * your data: things you collected, that your claims will cite. Literature is
 * the papers you are arguing with, and the tool reads them to see which
 * conversation you are joining.
 *
 * The distinction is not a label, it is what the file is allowed to do. Before
 * this, `transcript` was the default kind on both upload controls, so a journal
 * editorial dropped on the Material tab was filed as fieldwork: the rendered
 * page showed `thorp.pdf TRANSCRIPT`, and `uncited-chunk` then nagged the
 * researcher for failing to cite an editorial as evidence. A tool whose central
 * promise is attribution had filed the literature as data.
 *
 * So a literature chunk is excluded from the grounding counts (`lint/structural.ts`),
 * from extraction into the staging tray (`proposals/extract.ts`) and from the
 * corpus the modal twin is told about (`twin/twin.ts`). It is still stored,
 * still searchable, still exported, and still reaches the interview prompt.
 */
/* M74b, ISC-665 (the lead's ruling): `chatnote`, an informal conversation
 * written up afterwards. The walk's student had exactly that, and a memo is the
 * researcher's own note by L12. */
export type DocumentKind = "transcript" | "fieldnote" | "chatnote" | "archival" | "memo" | "literature";

/** Every kind, including literature. What the retag control offers. */
export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  "transcript",
  "fieldnote",
  "chatnote",
  "archival",
  "memo",
  "literature",
];

/**
 * The four kinds that are your data. What the upload control on "Your data"
 * offers, and it offers no default: the select starts on a placeholder, because
 * a default kind is how the editorial became a transcript.
 */
export const DATA_DOCUMENT_KINDS: readonly DocumentKind[] = [
  "transcript",
  "fieldnote",
  "chatnote",
  "archival",
  "memo",
];

/** The papers, not the data. One predicate, so five surfaces cannot disagree. */
export function isLiterature(kind: DocumentKind): boolean {
  return kind === "literature";
}

/** Everything in `items` that is data. Works on a document or a chunk alike. */
export function dataOnly<T extends { readonly kind: DocumentKind }>(
  items: readonly T[],
): readonly T[] {
  return items.filter((item) => !isLiterature(item.kind));
}

/** Everything in `items` that is literature. The other half of `dataOnly`. */
export function literatureOnly<T extends { readonly kind: DocumentKind }>(
  items: readonly T[],
): readonly T[] {
  return items.filter((item) => isLiterature(item.kind));
}

/**
 * How many passages of the researcher's own data a study holds (D12, M43).
 *
 * The one number that may stand in for an answer at the Early data step, and
 * the reason it is a named function rather than a `.length` at each surface.
 * Four surfaces read the corpus to decide whether that step has been answered
 * — the rail, the step's own state, the Checks tab's count of answered steps
 * and the Exports header — and every one of them was handed `chunks.length`,
 * which counts the passages of a paper as readily as the passages of a
 * fieldnote. The walk of 2026-09-13 uploaded one PDF to the reading list and
 * the rail then told the researcher they had answered a step they had never
 * opened, while the step itself read "Nothing to save yet".
 *
 * Uploading the papers you are arguing with is not doing the Early data step.
 * `dataOnly` already draws that line for the grounding counts, the staging tray
 * and the modal twin; this puts the same line in front of the four surfaces
 * that decide what the researcher has said.
 */
export function dataChunkCount(items: readonly { readonly kind: DocumentKind }[]): number {
  return dataOnly(items).length;
}

/**
 * The ids of the literature passages, as a set, for the lint input that only
 * ever sees ids. `lint/structural.ts` is handed chunk ids rather than chunks,
 * so the one fact it cannot derive is which of them are papers.
 */
export function literatureChunkIds(
  chunks: readonly { readonly id: string; readonly kind: DocumentKind }[],
): readonly string[] {
  return literatureOnly(chunks).map((c) => c.id);
}

export interface StoredDocument {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly kind: DocumentKind;
  readonly createdAt: number;
  readonly chunkCount: number;
}

export interface Chunk {
  readonly id: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly kind: DocumentKind;
  readonly text: string;
  /** 0-based position within the document. */
  readonly index: number;
}

/**
 * The corpus size past which a reading pass stops being quick (ISC-20).
 *
 * An advisory, not a cap. Nothing checks it before writing and nothing refuses
 * a file because of it. See the module note for what it used to be.
 */
export const DOCUMENT_ADVISORY_COUNT = 20;

/**
 * What to say about a corpus of this size, or nothing.
 *
 * Returns a plain observation and never an instruction, for the same reason a
 * lint finding is an observation: the researcher decides what a large corpus
 * means for their study, and the tool has no standing to tell them to remove
 * material they chose to load.
 */
export function documentCountNote(documentCount: number): string | null {
  if (documentCount < DOCUMENT_ADVISORY_COUNT) return null;
  return (
    `${documentCount} documents loaded. Past about ${DOCUMENT_ADVISORY_COUNT} a pass over your data ` +
    `takes noticeably longer, because Abductive hands all of your data to the model in one go. ` +
    `Abductive still cites, exports and searches everything here as normal.`
  );
}

export class UnsupportedFileError extends Error {
  constructor(fileName: string, detail: string) {
    super(`Cannot ingest '${fileName}': ${detail}`);
    this.name = "UnsupportedFileError";
  }
}

/** Target chunk size in characters (paragraph-based packing). */
export const CHUNK_TARGET_CHARS = 1500;

/**
 * Paragraph-based chunking: split on blank lines, pack paragraphs greedily
 * into ~1500-char chunks. A single paragraph longer than the target is split
 * at the character boundary rather than dropped.
 */
export function chunkText(
  text: string,
  target: number = CHUNK_TARGET_CHARS,
): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > target) {
      flush();
      for (let i = 0; i < paragraph.length; i += target) {
        chunks.push(paragraph.slice(i, i + target));
      }
      continue;
    }
    const candidate = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`;
    if (candidate.length > target) {
      flush();
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  flush();
  return chunks;
}

export interface IngestResult {
  readonly document: StoredDocument;
  readonly chunks: readonly Chunk[];
}

/**
 * Build a document + chunk records from raw text. Pure; persistence is the
 * caller's job (state/projects.ts stores, ledger for attention events).
 *
 * `existingDocumentCount` is still taken because callers count anyway and the
 * signature is stable, but nothing here refuses on it.
 */
export function ingestText(params: {
  projectId: string;
  name: string;
  kind: DocumentKind;
  text: string;
  existingDocumentCount?: number;
  now?: number;
  makeId?: () => string;
}): IngestResult {
  const makeId = params.makeId ?? (() => crypto.randomUUID());
  const now = params.now ?? Date.now();

  const trimmed = params.text.trim();
  if (trimmed.length === 0) {
    throw new UnsupportedFileError(params.name, "the file's text is empty");
  }

  const documentId = makeId();
  const pieces = chunkText(trimmed);
  const chunks: Chunk[] = pieces.map((text, index) => ({
    id: makeId(),
    projectId: params.projectId,
    documentId,
    kind: params.kind,
    text,
    index,
  }));

  return {
    document: {
      id: documentId,
      projectId: params.projectId,
      name: params.name,
      kind: params.kind,
      createdAt: now,
      chunkCount: chunks.length,
    },
    chunks,
  };
}

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown"];

export function isTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isPdfFile(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

/**
 * Ingest a File object (.txt/.md directly; .pdf via the pdf.ts boundary).
 * Throws UnsupportedFileError, with a user-facing message, for a file this
 * build cannot read. Nothing else here refuses a file.
 */
export async function ingestFile(params: {
  projectId: string;
  file: File;
  kind: DocumentKind;
  existingDocumentCount?: number;
  /** Injected pdf extractor (see state/pdf.ts); optional so txt/md never load pdf.js. */
  extractPdf?: (file: File) => Promise<string>;
}): Promise<IngestResult> {
  const { file } = params;

  let text: string;
  if (isTextFile(file.name)) {
    text = await file.text();
  } else if (isPdfFile(file.name)) {
    if (params.extractPdf === undefined) {
      throw new UnsupportedFileError(
        file.name,
        "PDF support is unavailable in this build. Upload .txt or .md instead.",
      );
    }
    text = await params.extractPdf(file);
  } else {
    throw new UnsupportedFileError(
      file.name,
      "Abductive opens only .txt, .md and .pdf files",
    );
  }

  return ingestText({
    projectId: params.projectId,
    name: file.name,
    kind: params.kind,
    text,
    ...(params.existingDocumentCount === undefined
      ? {}
      : { existingDocumentCount: params.existingDocumentCount }),
  });
}

// ---------------------------------------------------------------------------
// Anomaly candidates (ISC-21)
// ---------------------------------------------------------------------------

export interface AnomalyCandidate {
  readonly id: string;
  readonly projectId: string;
  readonly statement: string;
  /** Chunk ids whose content supports the candidate. */
  readonly supportingChunks: readonly string[];
  /** Challenge ids (dissent) that were NOT resolved away and travel with the candidate. */
  readonly survivingDissent: readonly string[];
  readonly createdAt: number;
}
