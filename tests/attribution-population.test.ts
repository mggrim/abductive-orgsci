/**
 * One attribution, one population.
 *
 * The Ontology surface's round-two defect, and it survived four rounds because
 * every surface was individually self-consistent. Attribution was counted over
 * ledger events and printed under the words and the marks that mean pages, so
 * the tool's central claim carried two different numbers depending on which tab
 * you read it from, and nothing on either tab said what it was counting.
 *
 * Measured on the 44-page density probe, all four at once:
 *
 *   /ontology index      44 rows: 15 solid discs, 15 half filled, 14 hollow
 *   Design tab           "98 revisions, 33% model-originated" over a legend
 *                        reading "yours (33), from the data (33),
 *                        model-proposed (32)", drawn with the same three marks
 *   memo.md              "44 live pages across 98 recorded revisions: 33 the
 *                        researcher's prior, 33 forced by the data, 32 proposed
 *                        by a model", a colon offering the second three as a
 *                        breakdown of the first
 *   ontology.json        attribution.byOrigin 33/33/32 and modelShare 0.3265
 *                        beside a pages array of 44 giving 15/15/14 and 0.318,
 *                        with no denominator anywhere in the file
 *
 * And the 98 was not 98 revisions. It was 44 creates plus 54 relates plus zero
 * revises, so the word named the only op that had not fired and more than half
 * the population was relations rather than pages.
 *
 * What is asserted here is not a set of numbers. It is that a count of origins
 * cannot reach a reader without the unit and the denominator it was taken over,
 * on every surface, and that the two populations the tool legitimately has stay
 * named apart. The fixture is built so the two genuinely disagree on every
 * count and on the share: five live pages at 2 / 1 / 2, nine recorded mutations
 * at 3 / 2 / 4. A fixture where the two happen to agree is how this went unseen
 * on the study fixture for three waves.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { EdgeRole, LedgerEvent, Origin, PageType } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages } from "../src/ontology/schema.ts";
import {
  censusOf,
  censusShare,
  censusWritten,
  LIVE_PAGES,
  originCensus,
  RECORDED_MUTATIONS,
} from "../src/ontology/attribution.ts";
import { ORIGIN_ORDER, originLabel } from "../src/ui/originVocabulary.ts";
import { opsCounted } from "../src/ui/ontologyOpVocabulary.ts";
import { projectTrajectory } from "../src/views/trajectoryModel.ts";
// M30 (R10): the trajectory panel left the Design tab and became
// `ui/model/ModelMovement.tsx`, folded on Your model under the census line it
// used to duplicate. Same drawing, same two populations, one page.


import type { OriginDoubt } from "../src/ontology/originAudit.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { buildAgentGraph, AGENT_GRAPH_VERSION } from "../src/export/agentGraph.ts";

const PROJECT = "proj-attribution";
let clock = 2_400_000_000_000;

function page(id: string, type: PageType, title: string, origin: Origin): LedgerEvent {
  clock += 1000;
  return {
    id: `ev-${id}`,
    ts: clock,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    title,
    body: `${title}.`,
    origin,
    supportingChunks: ["c1"],
  } as LedgerEvent;
}

function relate(from: string, to: string, role: EdgeRole, origin: Origin): LedgerEvent {
  clock += 1000;
  return {
    id: `ev-${from}-${to}`,
    ts: clock,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "relate",
    targetId: `${from}->${to}`,
    edge: { from, to, role },
    origin,
    supportingChunks: [],
  } as LedgerEvent;
}

/** M29: a page the researcher took out again. The retirement is theirs. */
function retire(id: string): LedgerEvent {
  clock += 1000;
  return {
    id: `ev-retire-${id}`,
    ts: clock,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "retire",
    targetId: id,
    origin: "literature-derived",
    supportingChunks: [],
  } as LedgerEvent;
}

/* Five pages at 2 / 1 / 2 and four relations at 1 / 1 / 2, so the page census is
 * 2 / 1 / 2 out of five and the mutation census is 3 / 2 / 4 out of nine: every
 * origin's count differs between the two populations, and so does the share.
 * M29 adds two literature-derived theory pages and retires one, which keeps
 * that property true of the fourth origin as well: 1 live page, 2 mutations.
 * Nothing is revised, which is the state the probe was in when the trajectory
 * called all ninety-eight of its events revisions. */
const EVENTS: LedgerEvent[] = [
  page("p1", "puzzle", "Handoff agreement does not track patient agreement", "author-prior"),
  page("p2", "rival", "The producer who kept the relationships", "author-prior"),
  page("p3", "observation", "Refusal on the night ward list", "data-driven"),
  page("p4", "theory", "Credit means different things per shift", "model-proposed"),
  page("p5", "candidate-resolution", "Shift boundaries carry the credit", "model-proposed"),
  relate("p3", "p1", "evidences", "author-prior"),
  relate("p4", "p1", "stands-to", "data-driven"),
  relate("p5", "p2", "rivals", "model-proposed"),
  relate("p4", "p2", "tensions-with", "model-proposed"),
  // M29: the fourth origin, on the two page types it is allowed on, and
  // retired once, so its live count is 1 against 2 recorded mutations and the
  // property this fixture exists for still holds for every origin.
  page("p6", "theory", "Handoffs fail when the receiver cannot question the sender", "literature-derived"),
  page("p7", "theory", "Proximity is what builds trust between shifts", "literature-derived"),
  page("p8", "theory", "Shared training is what makes a handoff legible", "literature-derived"),
  retire("p7"),
];

const GRAPH = projectOntology(EVENTS, PROJECT);
const PAGES = livePages(GRAPH);
const PAGE_CENSUS = originCensus(PAGES, LIVE_PAGES);
const TRAJECTORY = projectTrajectory(EVENTS, PROJECT);

const EXPORT_PROJECT = {
  id: PROJECT,
  title: "Handoffs on the night ward",
  createdAt: clock,
  brief: { researchQuestion: "How does credit travel across a shift?", dataType: "interviews" },
} as unknown as Parameters<typeof buildOntologyMemo>[0]["project"];

const NO_DOUBTS = new Map<string, OriginDoubt>();

// M63, the lead's rulings: the claims table and the movement fold left with the old model tab.
const MEMO = buildOntologyMemo({
  project: EXPORT_PROJECT,
  graph: GRAPH,
  events: EVENTS,
});
const JSON_EXPORT = buildAgentGraph({
  project: EXPORT_PROJECT,
  graph: GRAPH,
  events: EVENTS,
  chunks: [],
});

/** Rendered markup as a reader reads it: no tags, entities resolved. */
function text(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe("the two populations are real and they disagree", () => {
  test("the fixture is one where a bare count would be wrong on some surface", () => {
    // M29: seven live pages of eight created, thirteen mutations.
    expect(PAGE_CENSUS.population).toBe(7);
    expect(TRAJECTORY.mutations.population).toBe(13);
    expect(PAGE_CENSUS.modelShare).toBeCloseTo(2 / 7, 5);
    expect(TRAJECTORY.mutations.modelShare).toBeCloseTo(4 / 13, 5);
    // Every origin's count differs between the two, so no surface can pass this
    // file by coincidence.
    for (const origin of ORIGIN_ORDER) {
      expect({
        origin,
        same: PAGE_CENSUS.byOrigin[origin] === TRAJECTORY.mutations.byOrigin[origin],
      }).toEqual({ origin, same: false });
    }
  });
});

// M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel, INDEX, MOVEMENT left with it; superseded: describe("every surface that prints an origin count prints its denominator", () => {

// M63, the lead's rulings of 2026-09-30: the old model tab's MOVEMENT left with it; superseded: describe("a relation is not a revision", () => {

describe("Anti: nothing hands out a count of origins without its unit", () => {
  /*
   * The source guard, in the shape this repo's other boundaries use. The four
   * rounds of this defect all had one syntax in common: a `byOrigin` reaching a
   * caller with no population beside it. `OriginCensus` makes that unobtainable
   * through the type, and this fails the moment a module reintroduces the loose
   * pair by hand.
   */
  const SRC = new Map<string, string>();
  for (const file of new Glob("src/**/*.{ts,tsx}").scanSync(".")) {
    SRC.set(file.replace(/^src\//, ""), require("node:fs").readFileSync(file, "utf8"));
  }

  test("every module naming byOrigin also carries the population it is over", () => {
    const OWNER = "ontology/attribution.ts";
    const offenders: string[] = [];
    for (const [rel, source] of SRC) {
      if (rel === OWNER) continue;
      if (!/\bbyOrigin\b/.test(source)) continue;
      if (!/\bpopulation\b|censusShare|censusWritten|censusOf/.test(source)) offenders.push(rel);
    }
    expect(offenders.sort()).toEqual([]);
  });

  test("the trajectory summary exposes no loose share for a surface to misprint", () => {
    // `modelShare` sat at the top level of `TrajectorySummary` and three
    // surfaces read it as the ontology's. It is inside a census now, and a
    // census cannot be read without its unit.
    const summary = TRAJECTORY as unknown as Record<string, unknown>;
    expect("modelShare" in summary).toBe(false);
    expect("byOrigin" in summary).toBe(false);
    expect(TRAJECTORY.mutations.unit).toBe(RECORDED_MUTATIONS);
  });
});
