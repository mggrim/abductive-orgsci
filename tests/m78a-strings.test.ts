/**
 * M78a, ISC-680: the fixed strings that the walk read against the owner's rules,
 * and the lines under "What to look for in the field" (the serendipity walk of
 * 2026-10-03, findings 8 and 11).
 *
 * Export offered the bundle "rather than only read", and the field lines read
 * "which days they happen on?", "whose problem it came from?",
 * "how long do after the bench?", "where do the encounter took place?" and
 * "compare [...]". (The Checks sentences the walk also listed left with the
 * Checks tab in M89.)
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { asQuestion, gapLine, projectConcepts, propertyLine, residueLine } from "../src/concepts/projection.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { HISTORY_HELP, PAGE_HELP } from "../src/ui/pageHelp.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const src = (path: string) => Bun.file(`${SRC}${path}`).text();

const WALK = (await Bun.file(new URL("./fixtures/m76-walk.json", import.meta.url)).json()) as {
  project: { id: string };
  events: LedgerEvent[];
};

describe("the fixed strings the walk listed", () => {
  test("Export describes the bundle without setting one use against another", async () => {
    const bar = await src("workbench/ExportBar.tsx");
    expect(bar).not.toContain("rather than only read");
    expect(bar).toContain("The whole project, including your sources, for a co-author to open in Abductive.");
  });
});

describe("the field lines, one template each, pinned with a sample", () => {
  test("a wh-phrase with a noun before its subject turns into a question", () => {
    expect(asQuestion("which days they happen on")).toBe("which days do they happen on?");
    expect(asQuestion("whose problem it came from")).toBe("whose problem did it come from?");
  });

  test("an irregular past takes did and the base form", () => {
    expect(asQuestion("where the encounter took place")).toBe("where did the encounter take place?");
  });

  test("a wh-phrase with no verb stays a short question", () => {
    expect(asQuestion("how long after the bench")).toBe("how long after the bench?");
  });

  test("the forms the walk read correctly stay as they were", () => {
    expect(asQuestion("how often they happen")).toBe("how often do they happen?");
    expect(asQuestion("who picked it up")).toBe("who picked it up?");
    expect(asQuestion("what the story is about")).toBe("what is the story about?");
    expect(asQuestion("whose slot is next")).toBe("whose slot is next?");
    expect(asQuestion("what the founder leaves with")).toBe("what does the founder leave with?");
  });

  test("each template reads in full with a sample", () => {
    expect(propertyLine("which days they happen on", "Dave's introductions")).toBe(
      "In each case of Dave's introductions, which days do they happen on?",
    );
    expect(propertyLine("time at the bench", "Run")).toBe("Across your cases of Run, compare time at the bench.");
    expect(residueLine("Founders leave with the repair alone.")).toBe(
      "Find the explanation for Founders leave with the repair alone; an account of it in your ontology is still to come.",
    );
  });

  test("a property carrying a gap marker asks for the gap to be filled", () => {
    expect(propertyLine("[...]", "Online booking system")).toBe("Fill the gap in Online booking system first.");
    expect(propertyLine("whether the helper stays longer [...]", "Drive-by help")).toBe(
      "Fill the gap in Drive-by help first.",
    );
    expect(gapLine("Drive-by help")).toBe("Fill the gap in Drive-by help first.");
  });

  test("no field line on the walk's record renders a gap marker or an ungrammatical question", () => {
    const view = projectConcepts(WALK.events, WALK.project.id, projectOntology(WALK.events, WALK.project.id));
    const lines = view.lookFor.map((l) => l.text);
    expect(lines.length).toBeGreaterThan(50);
    for (const line of lines) {
      expect({ line, gap: line.includes("[...]") }).toEqual({ line, gap: false });
      expect({ line, bad: /\b(?:do|does) \w+ (?:took|came|went)\b|how long do after|which days they happen on\?|whose problem it came from\?/.test(line) }).toEqual({ line, bad: false });
    }
    expect(lines).toContain("Fill the gap in Online booking system first.");
    expect(lines).toContain("In each case of Credit to Dave, where did the encounter take place?");
  });
});

describe("the Help entries say what changed", () => {
  test("Sources says a named paper waits for its upload", () => {
    expect(JSON.stringify(PAGE_HELP.material)).toContain("Identified"); // M92, ISC-753
  });

  test("History says whose reply is whose", () => {
    expect(JSON.stringify(HISTORY_HELP)).toContain("Abductive's reply");
  });

  test("Export says an edited summary counts as yours", () => {
    expect(JSON.stringify(PAGE_HELP.exports)).toContain("edited");
  });

});

/* The lead's ruling (2026-10-03): the chip reads "Gap open" (L8, two words),
   and the chip scan reads a label held in a constant, which "Gap to fill"
   escaped. */
import { chipLabels } from "./copyBarScan.ts";
import { GAP_CHIP_LABEL } from "../src/ui/ConceptsView.tsx";

describe("the chip scan reaches a label held in a constant", () => {
  test("a constant named on a chip is read as its label", () => {
    const file = 'export const GAP_LABEL = "Gap to fill";\nfunction C() { return <StatusChip label={GAP_LABEL} tone="notice" />; }';
    expect(chipLabels(file)).toEqual(["Gap to fill"]);
  });

  test("the gap chip is two words", () => {
    expect(GAP_CHIP_LABEL).toBe("Gap open");
  });
});
