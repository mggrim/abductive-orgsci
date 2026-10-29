/**
 * Chunking + ingestion tests (ISC-20).
 */

import { describe, expect, test } from "bun:test";
import {
  CHUNK_TARGET_CHARS,
  DOCUMENT_ADVISORY_COUNT,
  UnsupportedFileError,
  chunkText,
  documentCountNote,
  ingestFile,
  ingestText,
} from "../src/state/chunks.ts";

describe("chunkText", () => {
  test("packs paragraphs into ~1500-char chunks", () => {
    const paragraph = "x".repeat(700);
    const text = [paragraph, paragraph, paragraph, paragraph].join("\n\n");
    const chunks = chunkText(text);
    expect(chunks.length).toBe(2); // 700+700 fits (1402 ≤ 1500); third would overflow
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_TARGET_CHARS);
    }
  });

  test("splits an oversized single paragraph at the boundary", () => {
    const chunks = chunkText("y".repeat(3200));
    expect(chunks.length).toBe(3);
    expect(chunks[0]?.length).toBe(CHUNK_TARGET_CHARS);
  });

  test("drops whitespace-only paragraphs", () => {
    expect(chunkText("one\n\n   \n\ntwo")).toEqual(["one\n\ntwo"]);
  });
});

/*
 * Restated, not deleted.
 *
 * These three tests protected a real property: the corpus size the tool cares
 * about is stated to the researcher in a typed way rather than left implicit,
 * and the message reaches the UI intact. What they also protected, and should
 * not have, was the gate. `assertDocumentCapacity` threw at the twentieth file
 * and the message told the researcher they were blocked and instructed them to
 * remove documents on a surface with no remove control. Nothing in this tool
 * gates, so the cap is an advisory and the tests hold the same property against
 * the shape that replaced it: the count is still named, the note is still one
 * string the UI renders whole, and ingestion no longer refuses.
 */
describe("corpus size is stated, never enforced (ISC-20)", () => {
  test("the note is silent below the advisory count and speaks at it", () => {
    expect(documentCountNote(DOCUMENT_ADVISORY_COUNT - 1)).toBeNull();
    expect(documentCountNote(DOCUMENT_ADVISORY_COUNT)).toContain("20");
    expect(documentCountNote(DOCUMENT_ADVISORY_COUNT + 40)).toContain("60");
  });

  test("the note observes and never instructs or claims to block", () => {
    const note = documentCountNote(DOCUMENT_ADVISORY_COUNT) ?? "";
    // The exact words the old error used, and the reason it was a defect: it
    // told the researcher to take an action this tool has never had.
    for (const banned of ["limit reached", "allowed documents", "Remove", "consolidate", "cannot"]) {
      expect(note).not.toContain(banned);
    }
  });

  test("ingestText takes the twenty-first document", () => {
    const result = ingestText({
      projectId: "p1",
      name: "doc-21.txt",
      kind: "transcript",
      text: "some text",
      existingDocumentCount: 20,
    });
    expect(result.document.name).toBe("doc-21.txt");
    expect(result.chunks.length).toBe(1);
  });

  test("ingestFile takes it too, and reads the file rather than refusing first", async () => {
    const file = new File(["hello world"], "notes.txt", { type: "text/plain" });
    const result = await ingestFile({
      projectId: "p1",
      file,
      kind: "fieldnote",
      existingDocumentCount: 200,
    });
    expect(result.chunks[0]?.text).toBe("hello world");
  });
});

describe("ingestion", () => {
  test("ingestText produces a document and ordered, project-scoped chunks", () => {
    const long = Array.from({ length: 5 }, (_, i) => `Paragraph ${i} ` + "z".repeat(600)).join(
      "\n\n",
    );
    const result = ingestText({
      projectId: "p1",
      name: "interview-01.md",
      kind: "transcript",
      text: long,
      existingDocumentCount: 0,
    });

    expect(result.document.name).toBe("interview-01.md");
    expect(result.document.chunkCount).toBe(result.chunks.length);
    expect(result.chunks.length).toBeGreaterThan(1);
    result.chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
      expect(chunk.projectId).toBe("p1");
      expect(chunk.documentId).toBe(result.document.id);
      expect(chunk.kind).toBe("transcript");
      expect(chunk.text.length).toBeGreaterThan(0);
    });
  });

  test("ingestFile reads .txt and .md files", async () => {
    const file = new File(["First paragraph.\n\nSecond paragraph."], "memo.md");
    const result = await ingestFile({
      projectId: "p1",
      file,
      kind: "memo",
      existingDocumentCount: 3,
    });
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0]?.text).toContain("Second paragraph.");
  });

  test("unsupported extensions are rejected with a clear message", async () => {
    const file = new File(["binary"], "photo.png");
    await expect(
      ingestFile({ projectId: "p1", file, kind: "archival", existingDocumentCount: 0 }),
    ).rejects.toThrow(UnsupportedFileError);
  });

  test("pdf without an extractor is rejected with a clear message", async () => {
    const file = new File(["%PDF-1.4"], "scan.pdf");
    await expect(
      ingestFile({ projectId: "p1", file, kind: "archival", existingDocumentCount: 0 }),
    ).rejects.toThrow(/PDF support/);
  });

  test("pdf with an injected extractor uses the extracted text", async () => {
    const file = new File(["%PDF-1.4"], "report.pdf");
    const result = await ingestFile({
      projectId: "p1",
      file,
      kind: "archival",
      existingDocumentCount: 0,
      extractPdf: () => Promise.resolve("Extracted paragraph one.\n\nExtracted two."),
    });
    expect(result.chunks[0]?.text).toContain("Extracted paragraph one.");
  });

  test("empty files are rejected", () => {
    expect(() =>
      ingestText({
        projectId: "p1",
        name: "empty.txt",
        kind: "memo",
        text: "   \n  ",
        existingDocumentCount: 0,
      }),
    ).toThrow(UnsupportedFileError);
  });
});
