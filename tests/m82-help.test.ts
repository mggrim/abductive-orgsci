/**
 * M82, ISC-696: the concepts tab's Help explains how relations are proposed
 * across the whole ontology and what a concept standing alone is, what
 * "Why it matters" is for, and what "The argument so far" is. M89: the Checks
 * Help and the sentences that named a flag or the Checks read-back left with
 * the Checks tab.
 */

import { describe, expect, test } from "bun:test";
import { PAGE_HELP } from "../src/ui/pageHelp.ts";
import { sentenceBreaks } from "../src/copy/rules.ts";

const part = (page: keyof typeof PAGE_HELP, name: string) => PAGE_HELP[page].parts.find((p) => p.name === name);
const says = (page: keyof typeof PAGE_HELP, name: string) => (part(page, name)?.says ?? []).join(" ");

describe("M82: the concepts tab's Help (ISC-696)", () => {
  test("The argument so far has its own part, first", () => {
    expect(PAGE_HELP.ontology.parts[0]?.name).toBe("The argument so far");
    const text = says("ontology", "The argument so far");
    expect(text).toContain("two to four sentences");
    expect(text).toContain("accept or refine");
  });

  test("Why it matters is explained on Concepts and on Relations", () => {
    expect(says("ontology", "Concepts")).toContain("Why it matters");
    expect(says("ontology", "Concepts")).toContain("the gap that your design would have without it");
    expect(says("ontology", "Concepts")).toContain("Suggested");
    expect(says("ontology", "Relations")).toContain("Why it matters");
  });

  test("Relations says how Abductive proposes relations across the ontology, and what a concept standing alone is", () => {
    const text = says("ontology", "Relations");
    expect(text).toContain("Suggest relations");
    expect(text).toContain("up to three relations");
    expect(text).toContain("rests on");
    expect(text).toContain("three or more");
    expect(text).toContain("stands alone");
  });

  test("the field list and the map say what M82 added", () => {
    expect(says("ontology", "What to look for in the field")).toContain("that you settle with the line");
    expect(says("ontology", "Concept map")).toContain("stand alone");
    expect(says("ontology", "Concept map")).toContain("bends once");
  });

  test("every new sentence keeps the copy rules", () => {
    for (const name of ["The argument so far", "Concepts", "Relations", "What to look for in the field", "Concept map"]) {
      for (const s of part("ontology", name)?.says ?? []) expect({ s, breaks: sentenceBreaks(s) }).toEqual({ s, breaks: [] });
    }
  });
});
