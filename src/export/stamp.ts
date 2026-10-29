/**
 * The design stamp: one digest that says which state of the study a file came
 * from.
 *
 * It lived in `ExportBar.tsx` and only the receipt aside could reach it, which
 * is why every artefact the tool wrote was unidentifiable once it left the
 * browser. A memo in a co-author's inbox was a memo; nothing in it said which
 * version of the design it was a memo of, and the one place that said so was a
 * separate markdown file the researcher had to remember to download and keep
 * beside it. Moving the function here lets every writer stamp its own output
 * from the same events it is already given, so the stamp in the file and the
 * stamp on the receipt are the same pure function of the same array rather than
 * two values that agree by care.
 *
 * FNV-1a over the event ids, which is not a security hash and is not pretending
 * to be one. The property wanted is that two people holding the same ledger
 * compute the same eight characters, and that appending one event changes them.
 * SubtleCrypto would give a stronger digest and is async, which would put an
 * await between pressing a button and the file arriving for no gain a
 * researcher can use.
 *
 * Order matters, so a reordered ledger is a different stamp. That is correct:
 * the ledger is append-only and a reordering is a different history.
 */

import type { LedgerEvent } from "../ledger/events.ts";

/**
 * Which events the stamp digests, and the exclusion is the interesting half.
 *
 * `export` rows are skipped. Once an export is recorded on the ledger, digesting
 * it would mean every download changed the stamp, so the stamp printed inside
 * the memo you sent on Tuesday would not match the ledger by Wednesday and the
 * receipt's one checkable claim, recompute this over the ledger and you get the
 * same eight characters, would hold for nobody. An export reads the study and
 * does not move it, so the digest of the study does not move either. The row is
 * still on the record, still in the ledger export, and still in the panel; it
 * simply is not part of what the design digests to.
 */
export function isDesignEvent(event: LedgerEvent): boolean {
  return event.type !== "export";
}

/** The events a stamp is computed over, in ledger order. */
export function designEvents(events: readonly LedgerEvent[]): readonly LedgerEvent[] {
  return events.filter(isDesignEvent);
}

/** A short digest of the design, in order. */
export function ledgerStamp(events: readonly LedgerEvent[]): string {
  let hash = 0x811c9dc5;
  for (const event of events) {
    if (!isDesignEvent(event)) continue;
    for (let i = 0; i < event.id.length; i += 1) {
      hash ^= event.id.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    // The separator keeps two adjacent ids from hashing the same as their
    // concatenation, which is the one collision this construction invites.
    hash ^= 0x2f;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * The line every written artefact carries, so the file identifies itself.
 *
 * One sentence, and it has to survive being read by somebody who has never
 * opened Abductive, in an email, six months later. So it says what the string is,
 * what it is a digest of, and what to do with it, and it does not assume the
 * receipt is in the same folder.
 */
export function stampLine(events: readonly LedgerEvent[]): string {
  const design = designEvents(events).length;
  return (
    `Design stamp \`${ledgerStamp(events)}\`, over ${design} recorded event${
      design === 1 ? "" : "s"
    }. ` +
    /* M74a, ISC-663 (the walk, finding 17): what the stamp is for comes first,
       in plain words, and the technical name follows in a parenthesis. */
    "The stamp is a fingerprint of this file, so that you can match a copy back to this project " +
    "(an FNV-1a digest of every event id in order, leaving out the exports). " +
    "To check a copy, export the full history from the same project and recompute the stamp."
  );
}
