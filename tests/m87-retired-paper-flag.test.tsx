/**
 * M87, ISC-722: the flag on a paper "that you aren't arguing with" is gone.
 *
 * The owner, 2026-10-14, verbatim: "remove any reference or functionality to
 * 'flags any paper that you aren't arguing with'". That flag was the coherence
 * rule `paper-never-engaged` (M29), with a free half that read the uploads and
 * a model half that read the typed list.
 *
 * The id is retired rather than deleted from the record. The shipped example
 * carries three of its events and one dismissal of one, and it stays byte for
 * byte as shipped, so every reader of History has to read past an event whose
 * rule is no longer in the table: no crash, and the dismissal is still a
 * dismissal event in the ledger. (The rule tables, the findings projections
 * and the Checks tab this file used to test went with the checks at M89.)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";

const SRC = new URL("../src/", import.meta.url).pathname;
const RETIRED = "paper-never-engaged";

const { buildOntologyMemo } = await import(`${SRC}export/ontologyMemo.ts`);
const { projectOntology } = await import(`${SRC}ontology/projection.ts`);

const BUNDLE_PATH = new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname;
const BUNDLE = await Bun.file(BUNDLE_PATH).json();
const EVENTS: readonly LedgerEvent[] = BUNDLE.events;
const PID: string = BUNDLE.project.id;

/**
 * The sentences the three retired events and their one dismissal carry, by a
 * fragment of each. The dismissal is the researcher's answer to the retired
 * flag, so it goes with the flag it answers.
 */
const RETIRED_SENTENCES = [
  /aren't arguing with it/,
  /not arguing with/,
  /as literature you're arguing with, but/,
  /can't find an expectation drawn from it/,
  /carries the AI half of this study/,
];

function sentencesIn(text: string): string[] {
  return RETIRED_SENTENCES.filter((re) => re.test(text)).map(String);
}

describe("the front page", () => {
  test("no rendered line on the front page says the clause (M88 removed the fit section with its papers line)", () => {
    const intro = readFileSync(join(import.meta.dir, "..", "src", "ui", "Introduction.tsx"), "utf8");
    expect(intro).not.toMatch(/arguing with/);
    expect(intro).not.toContain("FIT_MOVES");
  });
});

describe("the shipped example, which keeps the retired rule's events", () => {
  test("still carries the three flags and the one dismissal in its History", () => {
    const raised = EVENTS.filter((e) => e.type === "lint-finding" && (e as { rule: string }).rule === RETIRED);
    expect(raised).toHaveLength(3);
    const ids = new Set(raised.map((e) => e.id));
    const dismissals = EVENTS.filter(
      (e) => e.type === "finding-disposition" && ids.has((e as { findingId: string }).findingId),
    );
    expect(dismissals).toHaveLength(1);
    expect((dismissals[0] as { disposition: string }).disposition).toBe("not-applicable");
  });

  test("History reads past them: each is a row, filed against the study as a whole", () => {
    const raised = new Set(
      EVENTS.filter((e) => e.type === "lint-finding" && (e as { rule: string }).rule === RETIRED).map((e) => e.id),
    );
    const rows = projectLedger([...EVENTS]);
    const flags = rows.filter((r) => raised.has(r.id));
    expect(flags).toHaveLength(3);
    for (const row of flags) {
      expect(row.kind).toBe("lint-finding");
      expect(row.station).toBeUndefined();
    }
    const dismissed = EVENTS.filter(
      (e) => e.type === "finding-disposition" && raised.has((e as { findingId: string }).findingId),
    ).map((e) => e.id);
    expect(rows.filter((r) => dismissed.includes(r.id)).map((r) => r.kind)).toEqual(["finding-disposition"]);
  });

  test("the Report carries no sentence about it", () => {
    const graph = projectOntology(EVENTS, PID);
    const md: string = buildOntologyMemo({
      project: BUNDLE.project,
      graph,
      events: EVENTS,
      labels: { chunks: BUNDLE.chunks, documents: BUNDLE.documents },
      now: () => 1_790_974_000_000,
    } as never);
    expect(md.length).toBeGreaterThan(0);
    expect(sentencesIn(md)).toEqual([]);
  });
});
