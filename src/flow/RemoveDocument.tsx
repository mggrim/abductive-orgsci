/**
 * Taking a file back out of a study (M29c, item 5).
 *
 * Material could be added and never removed. A researcher who dropped the
 * wrong file, or a draft of a transcript they later cleaned up, had one way
 * out: delete the whole study. So every document row carries this, in both
 * sections, and it does the same thing in both.
 *
 * Two clicks, and the second one is the only one that says what happens. The
 * pattern is the study list's, for the same reason: one control that both asks
 * and destroys is a control that destroys on a mis-click.
 *
 * What it destroys is the file and its passages, in local storage. What it does
 * not destroy is the record. A claim that cited passage 3 of a file that is now
 * gone keeps that citation exactly as it was written, because the citation is a
 * statement about what the researcher was reading at the time, and that is
 * true whether or not the file is still on the machine. The passage resolver
 * falls back to "a removed passage of <name>" so the claim still says where it
 * came from, and the removal itself is a ledger event, so the study can account
 * for the gap rather than presenting it as something that never existed.
 */

import { useState } from "react";
import { useLedger } from "../state/ledgerContext.tsx";
import { deleteDocument } from "../state/projects.ts";
import type { DocumentRemovedEvent } from "../ledger/events.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";

/** The passages of one document, in reading order, as ids. */
export function passageIdsOf(
  chunks: readonly Chunk[],
  documentId: string,
): readonly string[] {
  return chunks
    .filter((chunk) => chunk.documentId === documentId)
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((chunk) => chunk.id);
}

/**
 * The sentence the second click reads.
 *
 * It states the loss and the thing that survives it, in that order, because the
 * researcher's question at this point is what they are about to break.
 */
export function removeConfirmText(documentName: string): string {
  return `Remove ${documentName}? The file's passages leave the project. Claims that cited those passages keep the citation in History.`;
}

export function RemoveDocument(props: {
  readonly projectId: string;
  readonly document: StoredDocument;
  readonly chunks: readonly Chunk[];
  readonly armed: boolean;
  readonly onArm: () => void;
  readonly onCancel: () => void;
  readonly onRemoved: () => void;
}) {
  const { projectId, document: doc, chunks, armed } = props;
  const { appendAll } = useLedger();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    /* Gathered before the delete, because after it there is nothing left to
     * count. The event carries the ids as well as the count so a later reader
     * can tell whether a citation points at this removal or at a passage that
     * was never here. */
    const passageIds = passageIdsOf(chunks, doc.id);
    try {
      await deleteDocument(doc.id);
      const event: DocumentRemovedEvent = {
        id: crypto.randomUUID(),
        ts: Date.now(),
        actor: "human",
        projectId,
        type: "document-removed",
        documentId: doc.id,
        documentName: doc.name,
        documentKind: doc.kind,
        passageCount: passageIds.length,
        passageIds,
      };
      await appendAll([event]);
      props.onCancel();
      props.onRemoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="doc-remove" data-testid={`remove-${doc.id}`}>
      <button
        type="button"
        className="btn-bare doc-remove-ask"
        aria-expanded={armed}
        onClick={armed ? props.onCancel : props.onArm}
      >
        Remove<span className="visually-hidden"> document {doc.name}</span>
      </button>
      {armed && (
        <div className="doc-remove-confirm" data-testid={`remove-confirm-${doc.id}`}>
          <p className="small">{removeConfirmText(doc.name)}</p>
          <div className="btnrow">
            <button
              type="button"
              className="btn-danger"
              data-testid={`remove-go-${doc.id}`}
              onClick={() => void remove()}
            >
              Remove document
            </button>
            <button type="button" className="btn-quiet" onClick={props.onCancel}>
              Cancel
            </button>
          </div>
          {error !== null && (
            <p className="error small" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
