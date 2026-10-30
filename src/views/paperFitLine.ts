/**
 * The papers line on Starting point (M33, M51, ISC-533).
 *
 * These two functions lived in `views/findings.ts`, the projection of the
 * checks' flags, until the checks left main at M89 (the owner, 2026-10-14).
 * They read the paper judge's verdicts and the unanswered expectations, and
 * neither reads a flag, so they stayed when that file went.
 */

/**
 * How many papers the tool has read, for the line on Starting point (M51).
 *
 * It read "2 papers fit, 1 doesn't", which is the verdict in a count. What the
 * three numbers support without pronouncing on anybody's reading list is how
 * many papers have been read at all. Which papers are still waiting on the
 * researcher is on each paper's own row on Sources, where the question is.
 */
export function paperFitSummary(counts: {
  readonly fits: number;
  readonly unclear: number;
  readonly misfit: number;
}): string {
  const read = counts.fits + counts.unclear + counts.misfit;
  return read === 0 ? "" : `${read} paper${read === 1 ? "" : "s"} considered`;
}

/**
 * The same line, with what the papers are still waiting on (M33).
 *
 * The count of unanswered expectations goes on the end of the fit row rather
 * than beside it. A project whose papers expect nothing of it, or whose
 * expectations are all answered, gets the line it had.
 */
export function paperFitLine(
  counts: { readonly fits: number; readonly unclear: number; readonly misfit: number },
  unanswered: number,
): string {
  const fit = paperFitSummary(counts);
  if (unanswered <= 0) return fit;
  const things = `${unanswered} thing${unanswered === 1 ? "" : "s"} the papers expect`;
  return fit === "" ? `You haven't answered ${things}.` : `${fit}. You haven't answered ${things}.`;
}
