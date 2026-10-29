/**
 * M78a, ISC-679: placed statements are counted where claims were, and a hedge
 * is not intuition as theory (the serendipity walk of 2026-10-03, findings 9
 * and 10).
 *
 * The walk read "Your first claim is still to come." beside 38 placed
 * statements and Export's CLAIMS 0, and a bias reading said "without a hedge"
 * over answers that hedged ("may", "can't yet tell").
 *
 * M89 (2026-10-14): the rest of this file tested Checks (the starting-point
 * line, the readiness report's Biases watched section and the semantic judge's
 * prompt). They left main with the tab.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import type { ProjectBrief } from "../src/state/projects.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { placedStatementCount, projectConcepts } from "../src/concepts/projection.ts";
import { claimSentence, type ArgumentBandModel } from "../src/views/argumentModel.ts";
import { exportPlan } from "../src/export/exportContains.ts";
import { isHedged } from "../src/matrix/signals.ts";

const WALK = (await Bun.file(new URL("./fixtures/m76-walk.json", import.meta.url)).json()) as {
  project: { id: string; title: string; stage: string; createdAt: number; brief: ProjectBrief };
  documents: never[];
  chunks: never[];
  events: LedgerEvent[];
};
const WP = WALK.project.id;
const graph = projectOntology(WALK.events, WP);
const concepts = projectConcepts(WALK.events, WP, graph);

describe("placed statements are counted where claims were", () => {
  test("the walk placed 38 statements", () => {
    expect(placedStatementCount(concepts)).toBe(38);
  });

  test("the read-back says the statements are placed instead of saying the first claim is to come", () => {
    const model = { claimCount: 0, placedStatements: 38, puzzle: null, theory: null, relation: null } as unknown as ArgumentBandModel;
    expect(claimSentence(model)).toBe("You have placed 38 statements.");
    expect(claimSentence({ ...model, placedStatements: 1 })).toBe("You have placed one statement.");
    expect(claimSentence({ ...model, placedStatements: 0 })).toBe("Your first claim is still to come.");
  });

  test("Export's claims count on the Report counts the walk's placed statements", () => {
    const plan = exportPlan({
      project: WALK.project as never,
      graph,
      events: WALK.events,
      chunks: WALK.chunks,
      documents: WALK.documents,
      now: () => 1_790_999_999_000,
    });
    expect(plan.contains.memo.find((c) => c.label === "claims")?.count).toBe(38);
  });
});

describe("a hedge is not intuition as theory", () => {
  test("the walk's hedges read as hedges, and the month of May does not", () => {
    expect(isHedged("So Dave may be getting credit for encounters that happened in the queue without him")).toBe(true);
    expect(isHedged("I can't yet tell those two readings apart.")).toBe(true);
    expect(isHedged("Things might have moved to Slack.")).toBe(true);
    expect(isHedged("Since May I count fewer encounters.")).toBe(false);
  });
});
