/**
 * Times in the files a researcher reads, in their own zone (M74a, ISC-663).
 *
 * The walk of 2026-10-02 (finding 17) exported a Report saying "Written
 * 2026-10-02 13:35" in UTC while the screen beside it said 15:35. The Markdown
 * exports print the reader's local time, and each file names the zone once,
 * near its top. The JSON exports keep ISO times in UTC: they are data for a
 * program, and a program reads the offset.
 */

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** "2026-10-02 15:35", in the zone this machine is set to. */
export function localStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "Europe/Paris (UTC+02:00)": the zone's name and its offset on that date. */
export function zoneName(ts: number): string {
  const offset = -new Date(ts).getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const utc = `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  let name = "";
  try {
    name = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    name = "";
  }
  return name === "" ? utc : `${name} (${utc})`;
}

/** The one sentence a file carries to name its zone. */
export function zoneLine(ts: number): string {
  return `Every time in this file is local time in ${zoneName(ts)}.`;
}
