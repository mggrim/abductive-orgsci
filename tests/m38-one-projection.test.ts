/**
 * One projection per place, as a scan (M38, ISC-501).
 *
 * FIN-02 was a rail dot and a tab count computed separately and disagreeing,
 * and the fix then was one selector every surface reads (`views/openFindings.ts`
 * for findings). M38 adds `views/placeSummary.ts` for places, and it adds it
 * before the second computation exists rather than after: the rail's line, the
 * study header's open-question pointer, the study list's chip and Your model's
 * grouping are four surfaces that would each have derived a title, a turn count
 * and the outstanding question for themselves.
 *
 * A comment saying so lasts until the next parallel wave. This is the check that
 * outlasts it, and it is deliberately narrow. It reads the two directories the
 * chrome and the flow live in, strips comments so the reasoning in a file is not
 * read as the code, and fails on the three shapes that are how a surface derives
 * one of those facts locally:
 *
 *   `.outstanding`               the interview's open question, read directly
 *   `turnsAtStation` / `buildTranscript`   a turn count, derived from the transcript
 *   `"question-selection"`       the event a surface would read to find the place
 *
 * All three are legitimate inside the projection itself and inside
 * `workbench/Dialogue.tsx`, which owns the transcript and exports the two
 * functions the projection calls. Neither directory is scanned, which is what
 * keeps this from being a rule nobody can satisfy.
 *
 * The positive half is the one that catches the subtler case: a file may render
 * a place indicator only if it imports the projection. A surface that computed a
 * title with its own `slice` would pass the three greps above and fail this.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

const SRC = new URL("../src/", import.meta.url).pathname;

/** The directories the chrome and the flow live in. */
const DIRS = ["ui", "flow"] as const;

async function sources(): Promise<readonly { path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  for (const dir of DIRS) {
    for await (const rel of new Glob("**/*.{ts,tsx}").scan(`${SRC}${dir}`)) {
      out.push({ path: `${dir}/${rel}`, text: await Bun.file(`${SRC}${dir}/${rel}`).text() });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Comments hold the reasoning, and the reasoning names the shapes it forbids. */
function code(text: string): string {
  return text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const FILES = await sources();

/** The three ways a surface derives a place's facts for itself. */
const LOCAL: readonly (readonly [RegExp, string])[] = [
  [/\.outstanding\b/, "reads the interview's open question directly"],
  [/\b(?:turnsAtStation|buildTranscript)\s*\(/, "counts turns off the transcript"],
  [/"question-selection"/, "reads the selection event to find where a question was asked"],
];

/**
 * The one surface allowed to touch the transcript builder, and why.
 *
 * Your model's grouped conversation (ISC-496) lists the turns themselves, and
 * the turns come from the one transcript builder or from nothing. What it may
 * not do is count them, and it does not: its headers take `turns` from the
 * projection's row, which tests/conversation-by-place.test.ts asserts field by
 * field. Found at the merge of the two M38 branches, where this scan met that
 * file for the first time.
 */
// M63, the lead's rulings: the grouped conversation left with the old model tab, so no surface lists turns.
const LISTS_TURNS: ReadonlySet<string> = new Set<string>();

describe("no surface recomputes a place's title, turn count or open question", () => {
  test("the scan sees the files, so nothing below passes on an empty glob", () => {
    expect(FILES.length).toBeGreaterThan(30);
    expect(FILES.map((f) => f.path)).toContain("ui/AppShell.tsx");
    expect(FILES.map((f) => f.path)).toContain("flow/StationRail.tsx");
  });

  test("none of the three local derivations appears in ui/ or flow/", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = code(file.text);
      for (const [shape, what] of LOCAL) {
        if (LISTS_TURNS.has(file.path) && what === "counts turns off the transcript") continue;
        if (shape.test(text)) offenders.push(`${file.path}: ${what}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  // M63, the lead's rulings of 2026-09-30: conversations by step left with the old model tab; superseded: "the listing exemption is narrow"

  test("a file that says something about a place reads the projection", () => {
    /* The indicators, by the fact each one carries. `questionOnTable` is the
       study list's chip, `rail-line` the rail's line under a cell, and
       `openQuestion` the flag a cell's mark now unions in. A file rendering one
       of these without importing the projection is deriving it. */
    const indicators = /questionOnTable:|rail-line|openQuestion\b|placeStateLine\(/;
    const reads = /from "\.\.?\/(?:\.\.\/)?views\/placeSummary\.ts"/;
    const offenders: string[] = [];
    for (const file of FILES) {
      const text = code(file.text);
      if (!indicators.test(text)) continue;
      if (!reads.test(text)) offenders.push(file.path);
    }
    expect(offenders.sort()).toEqual([]);
  });

  test("the scan catches what it is for", () => {
    /* Non-vacuity, proved on strings rather than by argument. Each of these is
       the shape the corresponding rule above exists to fail, and each was in the
       tree before M38: ProjectList computed the chip from `interview.outstanding`
       and Workbench reads the selection event for the NextBar's station. */
    const fake = [
      "questionOnTable: interview.outstanding !== null,",
      'const here = turnsAtStation(transcript, station);',
      'if (asked?.type !== "question-selection") return undefined;',
    ];
    for (const line of fake) {
      expect(LOCAL.some(([shape]) => shape.test(line))).toBe(true);
    }
    /* And the positive half: a rail line in a file with no import of the
       projection is what the third test fails on. */
    const indicators = /questionOnTable:|rail-line|openQuestion\b|placeStateLine\(/;
    expect(indicators.test('<span className="rail-line">{title}</span>')).toBe(true);
    expect(/from "\.\.?\/(?:\.\.\/)?views\/placeSummary\.ts"/.test('import { x } from "./other.ts"')).toBe(
      false,
    );
  });
});
