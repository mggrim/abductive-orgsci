/**
 * M61 follow-up, ISC-588: the third Starting point question, in the owner's
 * words (2026-09-30), everywhere a researcher reads it. The record keeps its
 * identifiers: the field is still `seminalCorpus`, its input still
 * `framing-seminal-corpus`.
 */
import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { FRAMING_FIELD_ID, FRAMING_QUESTION } from "../src/flow/FramingBand.tsx";
import { buildSearchIndex } from "../src/search/studySearch.ts";
import { emptyBrief } from "../src/state/projects.ts";

const OWNER_QUESTION = "Which literatures might be relevant to your exploration?";
const OLD_QUESTION = "Which papers are you arguing with?";
const SRC = new URL("../src/", import.meta.url).pathname;

describe("ISC-588: the literatures question", () => {
  test("the question is the owner's sentence, and the record's names stay", () => {
    expect(FRAMING_QUESTION.seminalCorpus).toBe(OWNER_QUESTION);
    expect(FRAMING_FIELD_ID.seminalCorpus).toBe("framing-seminal-corpus");
  });

  test("the old question is gone from every source file", async () => {
    const hits: string[] = [];
    for await (const rel of new Glob("**/*.{ts,tsx}").scan(SRC)) {
      if ((await Bun.file(SRC + rel).text()).includes(OLD_QUESTION)) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });

  test("search finds the field under the new question", () => {
    const index = buildSearchIndex({
      projectId: "p-588",
      brief: { ...emptyBrief(), seminalCorpus: "Bechky 2006" },
      pages: [],
      documents: [],
      chunks: [],
      papers: [],
    });
    const titles = index.map((entry: { title: string }) => entry.title);
    expect(titles).toContain(`Starting point: ${OWNER_QUESTION}`);
  });
});

describe("ISC-588: the concept follows the question (lead, 2026-09-30)", () => {
  test("no rendered source still says papers you're arguing with", async () => {
    const hits: string[] = [];
    const glob = new Glob("{ui,flow,workbench,views}/**/*.{ts,tsx}");
    for await (const rel of glob.scan(SRC)) {
      const code = (await Bun.file(SRC + rel).text()).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/papers you(?:'re| are) arguing with/.test(code)) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });

  test("the next-move bar asks for the field in one sentence", async () => {
    const { FRAMING_ASK } = await import("../src/workbench/NextBar.tsx");
    expect(FRAMING_ASK.seminalCorpus).toBe("Name the bodies of work you expect to draw on.");
  });
});
