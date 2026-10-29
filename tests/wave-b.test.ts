/**
 * Wave-B tests (attention/coverage, divergence, memo report, bundle round-trip,
 * twin gating) — written by the coordinating session after the wave-B agent
 * hit its session limit before authoring its test files.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import type { Chunk, StoredDocument, AnomalyCandidate } from "../src/state/chunks.ts";
import { emptyBrief, type Project } from "../src/state/projects.ts";
import { projectCoverage } from "../src/views/coverageModel.ts";
import { computeDivergence } from "../src/views/divergenceModel.ts";
import { buildBundle, parseBundle, serializeBundle } from "../src/export/bundle.ts";
import { canRevealDirectly, makeRevealEvent } from "../src/twin/twin.ts";

const PID = "p1";

function ev(partial: Partial<LedgerEvent> & { type: LedgerEvent["type"] }): LedgerEvent {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    actor: "human",
    projectId: PID,
    ...partial,
  } as LedgerEvent;
}

const project: Project = {
  id: PID,
  title: "Test project",
  stage: "pilot-data",
  brief: {
    ...emptyBrief(),
    researchQuestion: "How do handoffs work?",
    siteRationale: "One ward",
    sampleRationale: "All shifts",
    dataType: "interview",
  },
  createdAt: Date.now(),
};

const documents: StoredDocument[] = [
  { id: "d1", projectId: PID, kind: "transcript", name: "int1.txt", createdAt: Date.now(), chunkCount: 3 },
];

const chunks: Chunk[] = [
  { id: "c1", projectId: PID, documentId: "d1", kind: "transcript", text: "alpha", index: 0 },
  { id: "c2", projectId: PID, documentId: "d1", kind: "transcript", text: "beta", index: 1 },
  { id: "c3", projectId: PID, documentId: "d1", kind: "transcript", text: "gamma", index: 2 },
];

describe("coverage model (ISC-25)", () => {
  test("three layers tracked separately; unattended chunks identified", () => {
    const events: LedgerEvent[] = [
      ev({ type: "attention", layer: "retrieval", chunkId: "c1", actor: "system" } as never),
      ev({ type: "attention", layer: "retrieval", chunkId: "c2", actor: "system" } as never),
      ev({
        type: "attention", layer: "citation", chunkId: "c1",
        actor: "persona:eisenhardt-positivist", model: "m", modelVersion: "v",
      } as never),
      ev({ type: "attention", layer: "human", chunkId: "c2" } as never),
    ];
    const cov = projectCoverage(events, chunks, documents);
    const byId = new Map(
      cov.documents.flatMap((d) => d.chunks.map((c) => [c.chunkId, c] as const)),
    );
    expect(byId.get("c1")?.layers.retrieval).toBe(true);
    expect(byId.get("c1")?.layers.citation).toBe(true);
    expect(byId.get("c1")?.layers.human).toBe(false);
    expect(byId.get("c2")?.layers.human).toBe(true);
    expect(byId.get("c3")?.layers.retrieval).toBe(false);
    expect(byId.get("c3")?.layers.citation).toBe(false);
    expect(byId.get("c3")?.layers.human).toBe(false);
  });
});

describe("divergence model (ISC-28)", () => {
  test("rejected challenge = researcher disagreement; surviving dissent surfaced", () => {
    const ch = ev({
      type: "challenge", matrixCell: "confirmation:site-sample",
      actor: "persona:eisenhardt-positivist", model: "m", modelVersion: "v",
      text: "Your comparative logic is inverted.",
    } as never);
    const rejection = ev({
      type: "adjudication", verdict: "reject", challengeId: ch.id,
      reason: "I disagree — the cases share sampling frames.",
    } as never);
    const report = computeDivergence([ch, rejection]);
    expect(report.personaVsResearcher.length).toBe(1);
    expect(report.survivingDissent.some((s) => s.status === "rejected")).toBe(true);
  });
});

describe("memo report (ISC-33)", () => {
});

describe("bundle round-trip (ISC-35)", () => {
  test("export → serialize → parse yields deep-equal bundle", () => {
    const events: LedgerEvent[] = [
      ev({ type: "bound", subject: "site", statement: "one ward" } as never),
    ];
    const bundle = buildBundle({
      project, documents, chunks,
      anomalies: [], twin: null, events,
    });
    const restored = parseBundle(serializeBundle(bundle));
    expect(restored).toEqual(bundle);
  });
});

describe("twin gating (ISC-30/31/42)", () => {
  test("direct reveal only at anomaly stage; reveal event well-formed", () => {
    expect(canRevealDirectly("anomaly")).toBe(true);
    expect(canRevealDirectly("design-brief")).toBe(false);
    expect(canRevealDirectly("pilot-data")).toBe(false);
    const reveal = makeRevealEvent(PID, "stage-gate");
    expect(reveal.type).toBe("reveal");
    expect(reveal.projectId).toBe(PID);
  });
});
