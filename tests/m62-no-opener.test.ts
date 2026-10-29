/**
 * M62, ISC-601 (owner, 2026-09-30): "Do not start a sentence with 'no.'" L14 in
 * Part 5 of the copy standard: no sentence in rendered copy opens with "No." or
 * "No," as a flat denial ("No. The tool…"); state the correct thing. A heading
 * or a state that opens on the determiner ("No open flags", "No projects yet.")
 * is a noun phrase and passes.
 */
import { describe, expect, test } from "bun:test";
import { NO_DENIAL, noDenialOffenders } from "./copyBarScan.ts";

describe("L14: no sentence opens on a flat No", () => {
  test("no rendered run in scope has one", () => {
    expect(noDenialOffenders()).toEqual([]);
  });

  test("Anti: the denial is caught at a run's start and after a sentence", () => {
    expect(NO_DENIAL.test("No. The tool reads your answers.")).toBe(true);
    expect(NO_DENIAL.test("No, Abductive doesn't send it.")).toBe(true);
    expect(NO_DENIAL.test("You asked. No, the file stays here.")).toBe(true);
  });

  test("Anti: a noun phrase opening on No passes", () => {
    expect(NO_DENIAL.test("No open flags")).toBe(false);
    expect(NO_DENIAL.test("No projects yet. Name one to start.")).toBe(false);
    expect(NO_DENIAL.test("Nothing has fired here yet.")).toBe(false);
    expect(NO_DENIAL.test("Say yes or no.")).toBe(false);
  });

  test("the rule is L14 in the copy standard", async () => {
    const standard = await Bun.file(new URL("../docs/copy-standard.md", import.meta.url).pathname).text();
    expect(standard).toContain("**L14.");
  });
});
