/**
 * M61 follow-up, ISC-596, the owner's named examples (2026-09-30): a wh-word
 * used as a noun is rewritten with the thing named. "where things live" becomes
 * "The parts of a project", "how Abductive helps" becomes "Abductive's help",
 * "what you found" becomes "your finding". ("who wrote what" left with ISC-595's
 * cards, which say "authorship".) The wider sweep waits on the lead's ruling.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OUTPUTS_HEADING, WALKTHROUGH_TITLES } from "../src/ui/Walkthrough.tsx";
import { OBSTACLES } from "../src/ui/Introduction.tsx";
import { STATIONS } from "../src/flow/stations.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const code = (f: string) =>
  readFileSync(join(SRC, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("ISC-596: the owner's named wh-phrases", () => {
  test("the walkthrough's third title names the thing", () => {
    // M68, ISC-637 (owner, 2026-10-02): "The parts of a project" became "The
    // outputs of a project"; it still names the thing rather than a wh-clause.
    // M83, ISC-699: the process heading names the act, and the outputs keep the
    // owner's label as their subhead.
    expect(WALKTHROUGH_TITLES[2]).toBe("Working with Abductive");
    expect(OUTPUTS_HEADING).toBe("The outputs of a project");
  });

  test("the problem cards' kicker is the one L13 exception, How Abductive might help", () => {
    // M85, ISC-709 (owner, 2026-10-14): the co-author's wording, recorded under L13.
    expect(code("ui/Introduction.tsx")).toContain(`export const HELP_LABEL = "How Abductive might help";`);
    expect(code("ui/Introduction.tsx")).toContain(`<p className="intro-card-label">{HELP_LABEL}</p>`);
    expect(code("ui/Introduction.tsx")).not.toContain("How Abductive helps");
  });

  test("your expectation and your finding, not what you expected and what you found", () => {
    // M84, ISC-702: before data there is no finding, so the card reads "observation".
    expect(OBSTACLES[0]?.body).toContain("Abductive inquires into your expectations and observations,");
    const puzzle = STATIONS.find((s) => s.id === "puzzle");
    expect(JSON.stringify(puzzle)).toContain("The surprise in your setting"); // M92, ISC-751
    for (const f of ["ui/Introduction.tsx", "flow/stations.ts", "ui/Walkthrough.tsx"]) {
      expect({ f, hit: /what you found|where things live|who wrote what|how abductive helps/i.test(code(f)) }).toEqual({ f, hit: false });
    }
  });
});

describe("L13: no wh-word stands in for a thing the sentence could name", () => {
  test("the shape fires on the owner's examples, and not on questions, relatives or conjunctions", async () => {
    const { whNounClauses } = await import("./copyBarScan.ts");
    for (const run of [
      "Abductive will not hide who wrote what.",
      "You say what you found.",
      "Open the tab to see where things live.",
      "The card says how Abductive helps.",
      "Abductive tells you what the reviewers expect.",
      // The lead's last fix: a wh-word after a coordinating and/or in the object.
      "Abductive records every change and who made it.",
      "You see the claims or what they rest on.",
    ]) {
      expect({ run, hit: whNounClauses(run).length }).toEqual({ run, hit: 1 });
    }
    for (const run of [
      "What can your project not yet explain?",
      "What are the people caught between, and who feels that pull?",
      "You get a tidier story from anyone who already knows the ending.",
      "Open the Sources tab, where you add transcripts.",
      "The project moves up when Claude Code does.",
    ]) {
      expect({ run, hit: whNounClauses(run).length }).toEqual({ run, hit: 0 });
    }
  });

  test("no rendered statement in scope breaks it, outside the listed runs", async () => {
    const { whNounClauseOffenders } = await import("./copyBarScan.ts");
    expect(whNounClauseOffenders()).toEqual([]);
  });
});
