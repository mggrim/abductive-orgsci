/**
 * Dates the app writes rather than the browser (round six, "no raw machine
 * strings in user-facing prose").
 *
 * The survey's framing was the argument: this is an app whose every other
 * sentence is hand-written, and it shipped "Last run 05/08/2026, 17:19:01" on
 * /coherence and "created 05/08/2026" on /studies. Both were bare
 * `toLocaleString()`, which is the browser's default rather than anybody's
 * decision, and it produced a day/month order nothing on the page
 * disambiguates, a seconds field nobody needs, and no sense of how long ago.
 *
 * Two properties get held here. The output is the same string on every machine,
 * because it goes into an export a supervisor reads on a different one. And no
 * source file reaches for the locale formatter again, which is the part a test
 * has to hold, because the next date to be rendered will be written by whoever
 * is building that surface and they will reach for the obvious thing.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { formatClock, formatDay, formatMoment } from "../src/ui/format.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

/** 5 August 2026, 17:19:01 local. */
const AUG5 = new Date(2026, 7, 5, 17, 19, 1).getTime();
const AUG6 = new Date(2026, 7, 6, 9, 5, 0).getTime();
const AUG7 = new Date(2026, 7, 7, 23, 59, 0).getTime();
const JAN1 = new Date(2026, 0, 1, 0, 7, 0).getTime();

describe("a date the researcher can read", () => {
  test("the month is named, so no reader has to guess the order", () => {
    // The whole defect in one assertion. 05/08/2026 is the fifth of August in
    // Cambridge and the eighth of May in Chicago, and the string carried
    // nothing that said which.
    expect(formatDay(AUG5, AUG7)).toBe("5 August 2026");
    expect(formatDay(JAN1, AUG7)).toBe("1 January 2026");
    expect(formatDay(AUG5, AUG7)).not.toMatch(/\d\/\d/);
  });

  test("today and yesterday are said the way a person says them", () => {
    expect(formatDay(AUG7, AUG7)).toBe("today");
    expect(formatDay(AUG6, AUG7)).toBe("yesterday");
    // And the day boundary is midnight, not 24 hours: 23:59 yesterday is
    // yesterday even though it is forty minutes ago.
    expect(formatDay(new Date(2026, 7, 6, 23, 59).getTime(), new Date(2026, 7, 7, 0, 39).getTime()))
      .toBe("yesterday");
  });

  test("the clock has no seconds", () => {
    // "17:19:01" implied the second mattered. It does not, and the ledger keeps
    // the exact millisecond for anyone auditing.
    expect(formatClock(AUG5)).toBe("17:19");
    expect(formatMoment(AUG5, AUG7)).toBe("5 August 2026 at 17:19");
    expect(formatMoment(AUG7, AUG7)).toBe("today at 23:59");
  });

  test("Anti: the check would have failed on the string that shipped", () => {
    // Vacuity guard for the assertions above: the shipped output is what they
    // are meant to reject, and it does not survive any of them.
    const shipped = new Date(AUG5).toLocaleString("en-GB");
    expect(shipped).toMatch(/\d\/\d/);
    expect(shipped).toMatch(/:\d\d:\d\d/);
    expect(formatMoment(AUG5, AUG7)).not.toBe(shipped);
  });
});

describe("nothing else formats a date", () => {
  test("no source file calls a locale formatter", async () => {
    // The regression guard. Every surface builder after this one will render a
    // timestamp at some point and toLocaleString is the obvious reach; the
    // helper exists so there is something obvious to reach for instead.
    const offenders: string[] = [];
    let scanned = 0;
    for await (const rel of new Glob("**/*.{ts,tsx}").scan(SRC)) {
      const text = (await Bun.file(`${SRC}${rel}`).text())
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      scanned++;
      if (/toLocale(Date|Time)?String\s*\(/.test(text)) offenders.push(rel);
    }
    // Vacuity guard: an empty scan would pass this while reading nothing.
    expect(scanned).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });

  test("Anti: the scan catches the three shapes that shipped", () => {
    const probe = /toLocale(Date|Time)?String\s*\(/;
    expect(probe.test('new Date(ts).toLocaleString()')).toBe(true);
    expect(probe.test('new Date(ts).toLocaleString("en-GB")')).toBe(true);
    expect(probe.test('new Date(p.createdAt).toLocaleDateString()')).toBe(true);
    expect(probe.test("formatMoment(ts)")).toBe(false);
  });
});
