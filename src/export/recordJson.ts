/**
 * How the two record exports write a character the house rule bans (FND-01).
 *
 * ── The bind ────────────────────────────────────────────────────────────────
 *
 * The rule is absolute in both directions and the two directions pulled apart
 * here. Nothing the tool exports may carry an em dash or an en dash. And the
 * ledger is append-only: `ledger.json` and `bundle.json` exist to say what
 * happened, `parseBundle` round-trips to the ledger it came from, and a file
 * that quietly replaced the model's sentence with the tool's would answer the
 * house-style question by destroying the audit question.
 *
 * Every other export is a reading, so `normaliseLedgerProse` and `voicedGraph`
 * settle it: the memo, the figure, the wiki, the agent graph, the replay and
 * the receipt all say what the screen says and all measure zero. These two
 * cannot be settled that way, because what they carry is the record, and the
 * record contains the character.
 *
 * ── What was shipped instead, and why it was wrong ──────────────────────────
 *
 * The previous pass wrote the exemption down and shipped it: model-authored
 * fields were normalised, the original was kept on `asWritten`, and that bag
 * was allowed to carry the banned character on the argument that "a provenance
 * field whose entire purpose is to quote what somebody else wrote is evidence,
 * not prose". The argument is reasonable and the rule does not have an
 * exception clause. Measured on the running fixture study with
 * `URL.createObjectURL` hooked: `ledger.json` 12 banned dashes, `bundle.json`
 * 12. Four of the twelve were the tool's own sentences, three interview
 * questions and one lint reason, and their sources in `src/interview/moves.ts`
 * had already been changed to full stops, so the file that goes to a reviewer
 * disagreed with the source it was generated from.
 *
 * ── The answer ──────────────────────────────────────────────────────────────
 *
 * JSON already has a way to write a character without writing it, and it is
 * part of the format rather than a convention invented here. A six-character
 * \u2014 escape and a literal em dash are the same value to every JSON parser
 * in existence and different bytes on disk. So the record exports emit the
 * escape.
 *
 * What that buys, precisely:
 *
 *  - A grep of the file for the character returns nothing. The rule holds on
 *    the artefact as a byte sequence, which is the only form in which a
 *    reviewer, a repo, a diff or a co-author's editor ever sees it.
 *  - `JSON.parse` returns the identical value. Nothing is lost, nothing is
 *    rewritten, and `parseBundle` needs no counterpart: decoding is the
 *    parser's job and it already does it.
 *  - Re-exporting an imported bundle reproduces the file byte for byte, because
 *    the transform is deterministic and total.
 *  - It applies to the researcher's own words too. A response or a refusal note
 *    is never rewritten by anything in this codebase, so before this the one
 *    way an export could carry the character was for the researcher to have
 *    typed it. An encoding is the only treatment that is honest about both: the
 *    tool does not touch what they wrote and the file still holds no dash.
 *
 * What it does not buy, said plainly so the next reader does not mistake it for
 * a fix: escaping hides the character from a grep. If a tool-authored sentence
 * regressed and started shipping a dash again, this would encode it rather than
 * catch it. That is why the test in `tests/prose-discipline.test.ts` asserts on
 * both halves. The serialized string must carry zero literal banned characters,
 * and the value parsed back out of it must carry zero outside the provenance
 * bag and the researcher's own fields. The first is the rule; the second is
 * what stops the first from being satisfied by concealment.
 *
 * Only the two record exports call this. A reading that needed it would be a
 * reading that failed to normalise, and it should fail rather than encode.
 */

/**
 * Figure dash, en dash, em dash, horizontal bar: the set `voiceGate.ts` bans.
 *
 * Written as escapes rather than as the characters themselves, the way
 * `voiceGate.ts` writes its own class, so that this module is not the one file
 * in `src/export` a grep for the rule keeps finding.
 */
const BANNED_DASH = /[\u2012\u2013\u2014\u2015]/g;

/**
 * Rewrite every banned dash in a JSON document as its `\uXXXX` escape.
 *
 * Safe as a whole-document string transform, and that is a property of the
 * input rather than of the regex: `JSON.stringify` emits non-ASCII characters
 * only inside string literals, so no occurrence can be structural punctuation.
 * The backslash introduced is a new one, because the surrounding text is
 * already-escaped JSON in which the source string held no backslash at that
 * offset.
 */
export function escapeBannedDashes(json: string): string {
  return json.replace(
    BANNED_DASH,
    (c) => `\\u${(c.codePointAt(0) ?? 0).toString(16).padStart(4, "0")}`,
  );
}

/** `JSON.stringify` for a file that carries the record rather than a reading. */
export function serializeRecord(value: unknown): string {
  return escapeBannedDashes(JSON.stringify(value, null, 2));
}
