/**
 * The instrumentation panel on a study that has just started.
 *
 * Divergence is one of the first things a researcher opening the ledger section
 * sees, and it is empty by definition on day one. It once printed "(s)" counts
 * and bare sentences in no container. (The bias flag panel that sat beside it
 * left with the checks, M89, 2026-10-14.)
 */

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Divergence } from "../src/views/Divergence.tsx";
import { countOf, pluralise } from "../src/ui/format.ts";

/** Every "(s)" the panels printed, so a reintroduction fails by name. */
const BANNED_PLURALS = ["firing(s)", "cell(s)", "rejection(s)", "time(s)", "residue(s)"];

function textOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

describe("the divergence panel when nothing has diverged", () => {
  const empty = renderToStaticMarkup(createElement(Divergence, { events: [] }));

  test("all three sections answer empty in a container rather than a bare line", () => {
    for (const id of [
      "divergence-persona-empty",
      "divergence-researcher-empty",
      "divergence-dissent-empty",
    ]) {
      expect(empty).toContain(`data-testid="${id}"`);
    }
    expect((empty.match(/empty-state-teach/g) ?? []).length).toBe(3);
  });

  test("the surviving-dissent section says empty is a state and not a gap", () => {
    // The one section whose empty case reads as nothing rather than as the
    // absence of something, because "surviving dissent" is a term of art.
    // M28 r6: copy. Same claim, and the reader meets a verb sooner.
    // ProseCodex 2D: the string moved; the criterion did not. "not a gap" went
    // with it, on the owner's call: it was the second antithesis in one string.
    // ProseCodex 2E: the string moved; the criterion did not.
    expect(textOf(empty)).toContain("so an empty list is normal.");
  });
});

describe("counts agree with their nouns", () => {
  test("the panel prints no parenthesised plural any more", () => {
    const markup = renderToStaticMarkup(createElement(Divergence, { events: [] }));
    expect(BANNED_PLURALS.filter((p) => markup.includes(p))).toEqual([]);
  });

  test("no user-facing source string in src reaches for it either", async () => {
    /* A source scan, because the four in these two panels were not the only
     * ones: the same shape was in the saturation advice and in two finding
     * reasons, which is prose the researcher reads inside a finding rather than
     * in a panel they may never open.
     *
     * Scoped to the directories `prose-discipline.test.ts` treats as the tool's
     * voice, and comments are stripped for the same reason it strips them: a
     * comment quoting the defect is how the defect gets written down.
     *
     * `twin/` and `eval/` are out of scope here on the same grounds
     * `prose-discipline.test.ts` exempts them: `twin/twin.ts` is a prompt handed
     * to a model rather than a sentence shown to anyone, and `eval/` writes a
     * developer's scoring report. Both still say "(s)"; neither is read by a
     * researcher. */
    const { Glob } = await import("bun");
    const root = new URL("../src/", import.meta.url).pathname;
    const dirs = ["ui", "flow", "workbench", "views", "interview", "export"];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for await (const rel of new Glob("**/*.{ts,tsx}").scan(`${root}${dir}`)) {
        const text = await Bun.file(`${root}${dir}/${rel}`).text();
        const bare = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        /* The whole file rather than only its string literals, and that choice
         * was made by measuring.
         *
         * A first version read string and template literals only, on the
         * reasoning that prose lives in strings. It passed on a build where
         * `<h2>Bias flag(s)</h2>` had been put back, because the four originals
         * were JSX text and JSX text is not a literal. A guard that cannot see
         * the case it was written for is worse than none.
         *
         * So the whole file, with one exclusion: a `(s)` immediately followed by
         * a closing paren, which is `used.has(s))` in `views/coverageGrid.ts` and
         * is a variable named s rather than a plural nobody resolved. In prose
         * the parenthesised s is always followed by a space or a stop, never by
         * another bracket, and the arrow form `filter((s) =>` never matches at
         * all because the character before the bracket is not a letter. */
        if (/[a-z]\(s\)(?!\))/.test(bare)) offenders.push(`${dir}/${rel}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  test("the helper the fixes went through agrees with itself", () => {
    expect(countOf(0, "finding")).toBe("0 findings");
    expect(countOf(1, "finding")).toBe("1 finding");
    expect(countOf(2, "finding")).toBe("2 findings");
    // The irregular is an argument rather than a rule, because there are three
    // irregular nouns in this app and no morphology is cheaper than typing them.
    expect(pluralise(2, "analysis", "analyses")).toBe("analyses");
    expect(pluralise(1, "analysis", "analyses")).toBe("analysis");
  });
});
