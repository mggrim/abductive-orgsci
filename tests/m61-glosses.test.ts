import { describe, expect, test } from "bun:test";

/*
 * M61, section 3 (ISC-585). The terms with no industry twin keep their names
 * and are glossed once per page, in the reader's words, the way ATLAS.ti writes
 * "quotations (= selections from these documents)". After the first mention the
 * explanation sits behind Learn more, so a second gloss on the same page is a
 * failure as much as a missing one.
 */
const read = async (rel: string) =>
  (await Bun.file(new URL(`../src/${rel}`, import.meta.url).pathname).text()).replace(/\s+/g, " ");

const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("each term is glossed once, on the page where a reader first meets it", () => {
  const PAGES: readonly { page: string; file: string; gloss: string }[] = [
    /* ISC-587: the puzzle left Starting point, so a reader first meets it at the
     * Puzzle step on Design, which glosses it beside the bind. */
    /* M92, ISC-751: the owner's definition, 2026-10-15. */
    { page: "Design", file: "flow/stations.ts", gloss: "The puzzle is the surprise: what you see, or expect to see, that current accounts can't explain." },
    { page: "Sources", file: "flow/SeminalCorpus.tsx", gloss: "expectations (what the paper leads readers to expect)" },
    // M63, ISC-614: a claim is a statement in the ontology.
    { page: "Emerging project ontology", file: "workbench/ProposalsTrayView.tsx", gloss: "a claim (a statement in your ontology)" },
    { page: "Design", file: "flow/stations.ts", gloss: "A bind is the tension that the people in your setting feel." },
  ];
  for (const { page, file, gloss } of PAGES) {
    test(`${page}: once (${gloss.slice(0, 24)}…)`, async () => {
      expect({ page, n: count(await read(file), gloss) }).toEqual({ page, n: 1 });
    });
  }

  test("Starting point: the puzzle is not glossed there, because it is not there (ISC-587)", async () => {
    expect(count(await read("flow/FramingBand.tsx"), "what your project can't yet explain")).toBe(0);
  });

  test("the origin marks are defined by their legend, one sentence each", async () => {
    const { ORIGIN_ORDER, originReads } = await import("../src/ui/originVocabulary.ts");
    for (const origin of ORIGIN_ORDER) expect(originReads(origin)).toMatch(/claim/);
  });
});

describe("the front page carries one table of the terms (the survey's Part 3)", () => {
  test("five terms, in the order they build on each other, each with the reader's own words", async () => {
    const { TERMS } = await import("../src/ui/Introduction.tsx");
    // M89: the Flag row went with the checks.
    expect(TERMS.map((t) => t.term)).toEqual(["Expectation", "Puzzle", "Claim", "Bind", "Origin mark"]);
    for (const t of TERMS) {
      // M92: the owner's definition of the puzzle runs to fourteen words, his to have.
      const cap = t.term === "Puzzle" ? 14 : 12;
      expect({ term: t.term, meaning: t.meaning.endsWith(".") && t.meaning.split(" ").length <= cap }).toEqual({
        term: t.term,
        meaning: true,
      });
      expect(t.aka.length).toBeGreaterThan(0);
    }
  });

  test("the table is folded, so the page reads the same until a reader asks", async () => {
    const intro = await read("ui/Introduction.tsx");
    expect(intro).toContain('<Disclosure summary="Terms" testId="intro-terms-fold">');
  });

  test("Anti: the count would catch a second gloss", () => {
    expect(count("a claim (a statement in your model) and a claim (a statement in your model)", "a claim (a statement in your model)")).toBe(2);
  });
});
