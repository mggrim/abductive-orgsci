/**
 * Taking a file back out of a study (M29c, item 5).
 *
 * Material was add-only. A researcher who dropped the wrong file had one way
 * out of it, and that was to delete the study. The control that fixes it has
 * to do two things that pull against each other: destroy the file and its
 * passages, and leave every claim that cited them exactly as it was written.
 * These tests hold both halves.
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type DocumentRemovedEvent } from "../src/ledger/events.ts";
import { passageIdsOf, removeConfirmText } from "../src/flow/RemoveDocument.tsx";
import type { Chunk } from "../src/state/chunks.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const P = "study-1";

function removal(over: Partial<DocumentRemovedEvent> = {}): DocumentRemovedEvent {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ts: 1,
    actor: "human",
    projectId: P,
    type: "document-removed",
    documentId: "d1",
    documentName: "ward.txt",
    documentKind: "transcript",
    passageCount: 2,
    passageIds: ["c1", "c2"],
    ...over,
  };
}

function chunk(id: string, documentId: string, index: number): Chunk {
  return { id, projectId: P, documentId, kind: "transcript", text: `t-${id}`, index };
}

describe("the deletion", () => {
  test("deleteDocument clears the document and every passage that pointed at it", async () => {
    const code = await Bun.file(`${SRC}state/projects.ts`).text();
    const body = code.slice(code.indexOf("export async function deleteDocument"));
    const fn = body.slice(0, body.indexOf("\n}\n") + 2);
    // Both stores, in one transaction, so a half-removed document cannot exist.
    expect(fn).toContain('transaction(["documents", "chunks"], "readwrite")');
    expect(fn).toContain('objectStore("documents").delete(documentId)');
    // Through the index, not a scan: the passages of one document are found the
    // same way every other reader of the corpus finds them.
    expect(fn).toContain('index("byDocument")');
    expect(fn).toContain('objectStore("chunks").delete(key)');
  });

  test("the control collects the passage ids before it deletes anything", async () => {
    const code = await Bun.file(`${SRC}flow/RemoveDocument.tsx`).text();
    const remove = code.slice(code.indexOf("async function remove()"));
    expect(remove.indexOf("passageIdsOf")).toBeLessThan(remove.indexOf("deleteDocument"));
  });

  test("the passages are this document's, in reading order", () => {
    const chunks = [
      chunk("c2", "d1", 1),
      chunk("x1", "d2", 0),
      chunk("c1", "d1", 0),
      chunk("c3", "d1", 2),
    ];
    expect(passageIdsOf(chunks, "d1")).toEqual(["c1", "c2", "c3"]);
    expect(passageIdsOf(chunks, "d9")).toEqual([]);
  });

  test("both material sections carry the control, and the confirmation says what is lost", async () => {
    for (const file of ["flow/SeminalCorpus.tsx", "flow/CorpusMaterial.tsx"]) {
      const code = await Bun.file(SRC + file).text();
      expect({ file, has: code.includes("<RemoveDocument") }).toEqual({ file, has: true });
      // One armed row at a time, as on the study list.
      expect({ file, armed: code.includes("armed={arming === doc.id}") }).toEqual({
        file,
        armed: true,
      });
    }
    expect(removeConfirmText("ward.txt")).toBe(
      // ProseCodex 2E: the string moved; the criterion did not.
      "Remove ward.txt? The file's passages leave the project. Claims that cited those passages keep the citation in History.",
    );
  });
});

describe("the event", () => {
  test("a removal validates and carries what the record needs to explain the gap", () => {
    expect(validateEvent(removal())).toEqual([]);
  });

  test("the count and the ids are one fact, so they cannot disagree", () => {
    const errs = validateEvent(removal({ passageCount: 3 })).join(" ");
    expect(errs).toContain("passageIds");
  });

  test("a reason is optional, and empty is not a reason", () => {
    expect(validateEvent(removal({ reason: "a draft I had already cleaned up" }))).toEqual([]);
    expect(validateEvent(removal({ reason: "" }))).not.toEqual([]);
  });
});
