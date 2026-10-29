/**
 * Dates and times, written the way the rest of the app is written.
 *
 * The survey's phrasing was the point: this is an app whose every other
 * sentence is hand-written, and it rendered "Last run 05/08/2026, 17:19:01" on
 * /coherence and "created 05/08/2026" on /studies. Both came from
 * `toLocaleString()` with no format argument, which is the browser's default
 * and not a decision anybody made. Three things were wrong with it and all
 * three are things a reader hits before they hit the content:
 *
 *   05/08/2026 is the fifth of August to a British reader and the eighth of May
 *   to an American one, and the string carries nothing that says which. This is
 *   a tool for a record that gets exported and read by a supervisor who was not
 *   in the room, so an ambiguous date is not a small thing.
 *
 *   Seconds are precision nobody asked for. "17:19:01" implies the second
 *   matters. It does not, and the ledger holds the exact millisecond anyway for
 *   anyone who needs it.
 *
 *   Neither string said how long ago. "Last run 5 August 2026" is a fact the
 *   researcher has to subtract from today's date to use; "Last run today at
 *   17:19" is the same fact already read.
 *
 * Written by hand rather than through Intl for the same reason the intro draws
 * its own SVG: the output has to be the same string on every machine, because
 * it goes into an export that gets compared against another copy of itself.
 * Intl.DateTimeFormat resolves against the host locale, which is exactly the
 * behaviour that produced the ambiguous string in the first place.
 *
 * Local time throughout, because the researcher's question is always "when did
 * I do this", never "what was the UTC offset".
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Midnight local, as a day index, so "yesterday" survives a month boundary. */
function dayIndex(d: Date): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

/**
 * "5 August 2026", or "today" / "yesterday" when that is what a person would
 * say. The year is always present on an absolute date: a study created in
 * January and read in December should not need the reader to infer it.
 */
/** "2 October 2026", always the date, for a line that dates a span from its start (M74a). */
export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ""} ${d.getFullYear()}`;
}

export function formatDay(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const gap = dayIndex(new Date(now)) - dayIndex(d);
  if (gap === 0) return "today";
  if (gap === 1) return "yesterday";
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ""} ${d.getFullYear()}`;
}

/** "17:19". Twenty-four hour, no seconds. */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * The day and the clock together: "today at 17:19", "5 August 2026 at 17:19".
 * Used wherever the time of day is part of what the reader is checking, which
 * is anything that reads as an event rather than as a property.
 */
export function formatMoment(ts: number, now: number = Date.now()): string {
  return `${formatDay(ts, now)} at ${formatClock(ts)}`;
}

/**
 * The noun, agreeing with the count.
 *
 * "(s)" was on eight user-facing strings, including two the researcher meets
 * inside a finding and one inside the saturation advice. It is the same failure
 * as `toLocaleString()` above: not a decision anybody made, just the shape a
 * developer reaches for when the count is a variable. It costs the reader a
 * parse on every occurrence, it reads as unfinished, and the count is nearly
 * always 0 or 1 on a study that has just started, which is precisely when the
 * researcher is deciding whether this tool is careful.
 *
 * The irregular plural is a second argument rather than a rule, because there
 * are three irregular nouns in this app and no amount of morphology is cheaper
 * than typing them.
 */
export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/** The count and its noun together: "1 finding", "0 findings". */
export function countOf(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralise(count, singular, plural)}`;
}
