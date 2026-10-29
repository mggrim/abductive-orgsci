/**
 * Browser download helper — Blob + anchor, no server round-trip (all research
 * data stays local, ISC-41). Pure content builders live in their own modules;
 * this is the single DOM touchpoint for exports.
 */

export function downloadText(
  filename: string,
  text: string,
  mime = "application/octet-stream",
): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Filesystem-safe slug for export filenames.
 *
 * M74a, ISC-663 (the walk, finding 17): "Repair café" exported as
 * "repair-caf-…", because the slug kept ASCII letters only. Letters and digits
 * of any script stay, in NFC so an é typed as e plus a combining accent is one
 * letter; every other run of characters (spaces, punctuation, the characters a
 * filesystem refuses) becomes one hyphen.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .normalize("NFC");
  return slug === "" ? "project" : slug;
}
