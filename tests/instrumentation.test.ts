/**
 * Instrumentation models, graph layout, streaming, and the standing report
 * (ISC-61 … ISC-65).
 *
 * These are the pure halves of criteria whose live halves are Interceptor
 * probes. Keeping them separately testable is what makes the browser probe a
 * check on rendering rather than on arithmetic.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent, Origin, PageType } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { MATRIX } from "../src/matrix/matrix.ts";
import { CoverageMap } from "../src/views/CoverageMap.tsx";
import { projectSpine } from "../src/views/spineModel.ts";
import { projectTerritory } from "../src/views/territoryModel.ts";
import { projectTrajectory } from "../src/views/trajectoryModel.ts";
import {
  censusShare,
  LIVE_PAGES,
  originCensus,
  RECORDED_MUTATIONS,
} from "../src/ontology/attribution.ts";
import { opsCounted } from "../src/ui/ontologyOpVocabulary.ts";
import { livePages } from "../src/ontology/schema.ts";
import { layoutGraph, EDGE_STYLE } from "../src/workbench/graphLayout.ts";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PageMark } from "../src/ui/components/index.ts";
import { standingReport } from "../src/workbench/OutstandingBar.tsx";
import { buildTranscript } from "../src/workbench/Dialogue.tsx";
import { projectInterview } from "../src/interview/state.ts";
import { projectProposals } from "../src/proposals/projection.ts";
import { checkSaturation } from "../src/interview/saturation.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { streamOrComplete } from "../src/inference/types.ts";
import { parseSseFrame } from "../src/inference/cliBridge.ts";
import { parseStreamLine } from "../scripts/cli-bridge.ts";
import { EDGE_ROLES, PAGE_TYPES } from "../src/ledger/events.ts";

const PROJECT = "proj-instr";
let clock = 2_100_000_000_000;

function env(actor: "human" | "system" | `persona:${string}` = "system") {
  clock += 1000;
  const base = { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT };
  return actor.startsWith("persona:")
    ? { ...base, model: "claude-sonnet-5", modelVersion: "claude-sonnet-5" }
    : base;
}

function question(topic: string, matrixCell?: string, mode: "interrogation" | "guidance" = "interrogation"): LedgerEvent {
  return {
    ...env("system"),
    type: "question-selection",
    moveId: `${topic}@x`,
    topic,
    question: `What about ${topic}?`,
    alternatives: [],
    mode,
    ...(matrixCell === undefined ? {} : { matrixCell }),
    reason: "because",
  } as LedgerEvent;
}

const answer = (inReplyTo: string, text = "yes"): LedgerEvent =>
  ({ ...env("human"), type: "response", text, inReplyTo }) as LedgerEvent;

const agentTurn = (inReplyTo: string, text = "Here it is."): LedgerEvent =>
  ({ ...env("persona:interviewer"), type: "response", text, inReplyTo }) as LedgerEvent;

const refusal = (questionEventId: string, kind: "dont-know" | "not-now" = "dont-know"): LedgerEvent =>
  ({ ...env("human"), type: "refusal", questionEventId, kind }) as LedgerEvent;

const redirection = (toTopic: string): LedgerEvent =>
  ({ ...env("human"), type: "redirection", toTopic }) as LedgerEvent;

function create(
  targetId: string,
  pageType: PageType,
  title: string,
  origin: Origin = "author-prior",
): LedgerEvent {
  return {
    ...env("human"),
    type: "ontology-mutation",
    op: "create",
    targetId,
    pageType,
    title,
    body: "",
    origin,
    supportingChunks: ["c1"],
  } as LedgerEvent;
}

const retire = (targetId: string, origin: Origin = "data-driven"): LedgerEvent =>
  ({ ...env("human"), type: "ontology-mutation", op: "retire", targetId, origin }) as LedgerEvent;

function relate(from: string, to: string, role: string): LedgerEvent {
  return {
    ...env("human"),
    type: "ontology-mutation",
    op: "relate",
    targetId: `${from}->${to}`,
    edge: { from, to, role },
    origin: "author-prior",
    supportingChunks: [],
  } as LedgerEvent;
}

// ---------------------------------------------------------------------------

describe("guide as territory (ISC-63)", () => {
  test("an untouched matrix reports every cell untouched", () => {
    const t = projectTerritory([], MATRIX, PROJECT);
    expect(t.untouched).toBe(MATRIX.length);
    expect(t.engaged).toBe(0);
    expect(t.engagedShare).toBe(0);
  });

  test("a cell that fired but was never taken up reads 'raised', not covered", () => {
    const events: LedgerEvent[] = [
      { ...env("system"), type: "flag", matrixCell: "confirmation:design-brief", reason: "r" } as LedgerEvent,
    ];
    const cell = projectTerritory(events, MATRIX, PROJECT).cells.find(
      (c) => c.cellId === "confirmation:design-brief",
    );
    expect(cell?.coverage).toBe("raised");
  });

  test("a cell whose challenge was adjudicated reads engaged", () => {
    const flag = { ...env("system"), type: "flag", matrixCell: "confirmation:design-brief", reason: "r" } as LedgerEvent;
    const challenge = {
      ...env("persona:eisenhardt-positivist"),
      type: "challenge",
      text: "c",
      matrixCell: "confirmation:design-brief",
    } as LedgerEvent;
    const adj = { ...env("human"), type: "adjudication", verdict: "revise", challengeId: challenge.id } as LedgerEvent;
    const cell = projectTerritory([flag, challenge, adj], MATRIX, PROJECT).cells.find(
      (c) => c.cellId === "confirmation:design-brief",
    );
    expect(cell?.coverage).toBe("engaged");
    expect(cell?.adjudicatedCount).toBe(1);
  });

  test("topics the guide never named are surfaced, and steers are marked", () => {
    const q = question("informant:access");
    const events = [q, answer(q.id), redirection("funding:constraints")];
    const t = projectTerritory(events, MATRIX, PROJECT);
    const topics = t.unmappedTopics.map((x) => x.topic);
    expect(topics).toContain("informant:access");
    expect(topics).toContain("funding:constraints");
    expect(t.unmappedTopics.find((x) => x.topic === "funding:constraints")?.researcherInitiated).toBe(
      true,
    );
  });

  test("a turn attributed to a cell counts as engaging it", () => {
    const q = question("expectation", "modal-framing:ontology");
    const t = projectTerritory([q, answer(q.id)], MATRIX, PROJECT);
    const cell = t.cells.find((c) => c.cellId === "modal-framing:ontology");
    expect(cell?.coverage).toBe("engaged");
    expect(cell?.turnCount).toBe(1);
    expect(t.unmappedTopics.map((x) => x.topic)).not.toContain("expectation");
  });
});

describe("session spine (ISC-64)", () => {
  test("a straight session is one branch", () => {
    const q1 = question("a");
    const q2 = question("b");
    const spine = projectSpine([q1, answer(q1.id), q2, answer(q2.id)], PROJECT);
    expect(spine.turns).toHaveLength(2);
    expect(spine.branchCount).toBe(0);
    expect(spine.turns.every((t) => t.outcome === "answered")).toBe(true);
  });

  test("a redirection branches and marks the abandoned question", () => {
    const q1 = question("a");
    const q2 = question("b");
    const spine = projectSpine([q1, redirection("elsewhere"), q2, answer(q2.id)], PROJECT);
    expect(spine.branchCount).toBe(1);
    expect(spine.turns[0]?.outcome).toBe("abandoned");
    expect(spine.turns[1]?.branch).toBe(1);
    expect(spine.branches[0]?.fromTopic).toBe("a");
    expect(spine.branches[0]?.toTopic).toBe("elsewhere");
  });

  test("the agent's own delivery does not mark the turn answered", () => {
    const q = question("a");
    const spine = projectSpine([q, agentTurn(q.id)], PROJECT);
    expect(spine.turns[0]?.outcome).toBe("open");
    expect(projectInterview([q, agentTurn(q.id)], PROJECT).outstanding).not.toBeNull();
  });

  test("refusals are recorded on the turn with their kind", () => {
    const q = question("a");
    const spine = projectSpine([q, refusal(q.id, "not-now")], PROJECT);
    expect(spine.turns[0]?.outcome).toBe("refused");
    expect(spine.turns[0]?.refusalKind).toBe("not-now");
  });

  test("turns that changed nothing are counted", () => {
    const q1 = question("a");
    const q2 = question("b");
    const spine = projectSpine(
      [q1, answer(q1.id), create("p1", "puzzle", "P"), q2, answer(q2.id)],
      PROJECT,
    );
    expect(spine.turns[0]?.mutations).toBe(1);
    expect(spine.turns[1]?.mutations).toBe(0);
    expect(spine.barrenTurns).toBe(1);
  });
});

describe("ontology trajectory (ISC-65)", () => {
  // Restated from "revisions are attributed and counted by origin". Same
  // property, said about a named population: the summary's counts are over
  // changes and now leave the module carrying that unit.
  test("mutations are attributed and counted by origin, over a stated population", () => {
    const events = [
      create("p1", "puzzle", "P", "author-prior"),
      create("o1", "observation", "O", "data-driven"),
      create("t1", "theory", "T", "model-proposed"),
    ];
    const t = projectTrajectory(events, PROJECT);
    expect(t.points).toHaveLength(3);
    expect(t.mutations.byOrigin["author-prior"]).toBe(1);
    expect(t.mutations.byOrigin["model-proposed"]).toBe(1);
    expect(t.mutations.modelShare).toBeCloseTo(1 / 3, 5);
    expect(t.mutations.population).toBe(3);
    expect(t.mutations.unit).toBe(RECORDED_MUTATIONS);
  });

  test("an empty trajectory reports a null share rather than zero", () => {
    expect(projectTrajectory([], PROJECT).mutations.modelShare).toBeNull();
  });

  /* The four-round defect, pinned on the model that produced it.
   *
   * The summary counted every ontology-mutation event and handed the total out
   * as a bare `byOrigin` and a bare `modelShare`, which three surfaces printed
   * under the words and the marks that mean pages. Two pages and two relations
   * is the smallest ledger where the two populations differ, and it differs the
   * way the 44-page probe did: relations inflate the count and shift the share.
   *
   * What the fix has to keep true is not a number, it is that the number cannot
   * be read without its unit, and that the ops are counted apart so nothing has
   * to call a relation a revision. */
  test("the mutation census counts relations and says so, and never claims to be pages", () => {
    const events = [
      create("p1", "puzzle", "P", "author-prior"),
      create("p2", "theory", "T", "model-proposed"),
      relate("p1", "p2", "stands-to"),
      relate("p2", "p1", "evidences"),
    ];
    const t = projectTrajectory(events, PROJECT);
    // Four mutations behind two pages, and the census says which it counted.
    expect(t.mutations.population).toBe(4);
    expect(t.mutations.unit.many).toBe(// M28 r6: copy.
      "changes");
    expect(t.byOp).toEqual({
      create: 2,
      revise: 0,
      relate: 2,
      unrelate: 0,
      retire: 0,
      reinstate: 0,
      // M44: the seventh op, unused here.
      mark: 0,
    });
    // Nothing was revised, so the word must not appear in the composition.
    // R3: "claims" and "links".
    expect(opsCounted(t.byOp)).toBe("2 claims created, 2 links added");
    // And the two populations really do disagree, which is why the unit travels.
    const pages = originCensus(livePages(projectOntology(events, PROJECT)), LIVE_PAGES);
    expect(pages.population).toBe(2);
    expect(pages.modelShare).toBeCloseTo(0.5, 5);
    expect(t.mutations.modelShare).toBeCloseTo(0.25, 5);
    // R4, copy C6: "live pages" taught the old word three times in a row under
    // a lede that had just glossed page to claim.
    expect(censusShare(pages, "model-proposed")).toBe("1 of 2 claims");
    expect(censusShare(t.mutations, "model-proposed")).toBe("1 of 4 changes");
  });

  test("residue that rose and then only fell is flagged", () => {
    const events = [
      create("r1", "analytic-residue", "R1"),
      create("r2", "analytic-residue", "R2"),
      retire("r2"),
      retire("r1"),
    ];
    const t = projectTrajectory(events, PROJECT);
    expect(t.points.map((p) => p.residue)).toEqual([1, 2, 1, 0]);
    expect(t.residueMonotonicallyShrinking).toBe(true);
    expect(t.finalResidue).toBe(0);
  });

  test("residue that recovered after falling is not monotonic", () => {
    const events = [
      create("r1", "analytic-residue", "R1"),
      create("r2", "analytic-residue", "R2"),
      retire("r2"),
      create("r3", "analytic-residue", "R3"),
    ];
    expect(projectTrajectory(events, PROJECT).residueMonotonicallyShrinking).toBe(false);
  });

  test("a study with no residue at all is not 'shrinking'", () => {
    const t = projectTrajectory([create("p1", "puzzle", "P")], PROJECT);
    expect(t.residueMonotonicallyShrinking).toBe(false);
  });

  test("edge relates do not fabricate page versions", () => {
    const events = [
      create("p1", "puzzle", "P"),
      create("t1", "theory", "T"),
      relate("p1", "t1", "stands-to"),
    ];
    const t = projectTrajectory(events, PROJECT);
    expect(t.points).toHaveLength(3);
    expect(t.points[2]?.version).toBe(0);
  });
});

describe("graph layout (ISC-60)", () => {
  const events = [
    create("p1", "puzzle", "Directors decline named roles"),
    create("t1", "theory", "Career-stage accounts"),
    create("o1", "observation", "Refusal on the crew list"),
    relate("p1", "t1", "stands-to"),
    relate("o1", "p1", "evidences"),
  ];

  test("every live page gets a node and every valid edge a line", () => {
    const layout = layoutGraph(projectOntology(events, PROJECT));
    expect(layout.nodes).toHaveLength(3);
    expect(layout.edges).toHaveLength(2);
  });

  test("layout is deterministic — the same graph lays out identically", () => {
    const graph = projectOntology(events, PROJECT);
    expect(layoutGraph(graph)).toEqual(layoutGraph(graph));
  });

  test("nodes stay inside the viewport", () => {
    const layout = layoutGraph(projectOntology(events, PROJECT), { width: 400, height: 300 });
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(40);
      expect(node.x).toBeLessThanOrEqual(360);
      expect(node.y).toBeGreaterThanOrEqual(40);
      expect(node.y).toBeLessThanOrEqual(260);
    }
  });

  test("an empty ontology lays out without error", () => {
    const layout = layoutGraph(projectOntology([], PROJECT));
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
  });

  test("the visual vocabulary covers every page type and edge role", () => {
    // Unchanged in what it protects: every page type has a hue and every edge
    // role has a style, so neither table can gain a member and lose its mark.
    // It read PAGE_TYPE_COLOUR straight out of graphLayout, and round nine took
    // that re-export away: the hue now has exactly one reader in src, the mark
    // boundary, which hands out no colour. So the page-type half asks the
    // boundary to draw the mark and reads the hue back off what it drew, which
    // is a stronger question than the old one — a type could have had an entry
    // in the table that no rendered mark ever used.
    const fills = new Set<string>();
    for (const type of PAGE_TYPES) {
      const markup = renderToStaticMarkup(
        createElement(PageMark, { page: { type, origin: "author-prior" as const } }),
      );
      const fill = /<circle[^>]*\bfill="([^"]+)"/.exec(markup)?.[1] ?? "";
      expect({ type, fill: /^#[0-9a-f]{6}$/i.test(fill) }).toEqual({ type, fill: true });
      fills.add(fill);
    }
    expect(fills.size).toBe(PAGE_TYPES.length);
    for (const role of EDGE_ROLES) expect(EDGE_STYLE[role]).toBeDefined();
  });

  test("contradiction and tension edges are drawn heavier than supporting ones", () => {
    expect(EDGE_STYLE.contradicts.weight).toBeGreaterThan(EDGE_STYLE.evidences.weight);
    expect(EDGE_STYLE["tensions-with"].weight).toBeGreaterThan(EDGE_STYLE.bounds.weight);
  });
});

describe("standing report (ISC-61)", () => {
  const emptyReport = (events: LedgerEvent[] = []) =>
    standingReport({
      interview: projectInterview(events, PROJECT),
      saturation: checkSaturation(events, PROJECT),
    });

  /* R3 item 2. The next move left this report and this bar.
   *
   * `waitingOn`, `outstanding` and `next` are gone, and their assertions with
   * them, because the thing they described is now computed once in `Workbench`
   * and handed to both bars. What the assertions protected was that a reader is
   * told what to do without a raw routing key in it, and that is now pinned in
   * tests/design-page-m27.test.ts against `nextStep`, which is the one function
   * that decides it. The two tests below hold what is left: this bar says
   * nothing when there is nothing of its own to say. */
  test("with nothing to do it invents nothing", () => {
    const report = emptyReport();
    expect(report.silenced).toEqual([]);
  });

  test("an outstanding question is not restated here", () => {
    // The line that used to say it repeated the one directly above it, and
    // the foot bar names the same move with a control.
    const q = question("puzzle:root");
    const report = emptyReport([q]);
    expect(report.silenced).toEqual([]);
  });

  test("silenced topics are stated as not being raised", () => {
    const events: LedgerEvent[] = [];
    for (let i = 0; i < 3; i++) {
      const q = question("identity:role");
      events.push(q, refusal(q.id, "not-now"));
    }
    const report = emptyReport(events);
    // M28: copy. R3 item 2: it is the `silenced` list now, and it is one of the
    // two things this bar still computes for itself.
    expect(report.silenced.some((l: string) => l.includes("Abductive has stopped raising: identity:role"))).toBe(
      true,
    );
  });
});

describe("transcript", () => {
  test("agent, human, refusal, and redirection turns all render", () => {
    const q = question("a");
    const entries = buildTranscript([
      q,
      agentTurn(q.id, "Why that?"),
      answer(q.id, "Because."),
      redirection("somewhere else"),
    ]);
    // The selection and the turn that delivered it are one entry since
    // ISC-361. Two cards showed the researcher the same sentence twice, the
    // second time inside the paragraph that had just led up to it.
    expect(entries.map((e) => e.kind)).toEqual(["agent", "human", "redirection"]);
    // The question as put is still in the ledger, not reconstructed from the
    // model's delivery of it — so what is on screen is provably what was
    // selected, and the model paraphrasing cannot quietly change the question.
    expect(entries[0]?.question).toBe("What about a?");
    expect(entries[0]?.text).toBe("Why that?");
  });

  test("an undelivered question still gets a turn of its own (ISC-361)", () => {
    // The model call failed, or has not returned yet. Folding the selection
    // into its delivery must not mean a question with no delivery vanishes:
    // it is on the table and the researcher has to be able to read it.
    const q = question("a");
    const entries = buildTranscript([q]);
    expect(entries.map((e) => e.kind)).toEqual(["question"]);
    expect(entries[0]?.text).toBe("What about a?");
  });

  test("Anti: a turn replying to something that is not a question is left alone", () => {
    const q = question("a");
    const entries = buildTranscript([q, agentTurn(q.id, "Why that?"), agentTurn(q.id, "Again?")]);
    // Only one turn can be the delivery, and it is the first: attaching the
    // question to a later retry would move it down the page after the fact.
    expect(entries.filter((e) => e.question !== undefined)).toHaveLength(1);
    expect(entries[0]?.question).toBe("What about a?");
    expect(entries[1]?.question).toBeUndefined();
  });

  test("a refusal is labelled with the topic it declined", () => {
    const q = question("identity:role");
    const entries = buildTranscript([q, refusal(q.id)]);
    expect(entries[1]?.text).toBe("I don't know.");
    expect(entries[1]?.label).toContain("identity:role");
  });
});

describe("streaming (ISC-62)", () => {
  test("the mock streams in pieces and returns the whole", async () => {
    const client = new MockInferenceClient({ responses: ["one two three four"] });
    const deltas: string[] = [];
    const result = await streamOrComplete(
      client,
      { system: "s", messages: [{ role: "user", content: "q" }] },
      (d) => deltas.push(d.text),
    );
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join("")).toBe("one two three four");
    expect(result.text).toBe("one two three four");
  });

  test("a non-streaming client still delivers the streaming shape", async () => {
    const plain = {
      complete: async () => ({ text: "whole answer", model: "m", modelVersion: "v" }),
    };
    const deltas: string[] = [];
    const result = await streamOrComplete(
      plain,
      { system: "s", messages: [] },
      (d) => deltas.push(d.text),
    );
    expect(deltas).toEqual(["whole answer"]);
    expect(result.text).toBe("whole answer");
  });

  test("SSE frames parse, and a partial frame yields nothing rather than garbage", () => {
    expect(parseSseFrame('event: delta\ndata: {"text":"hi"}')).toEqual({
      event: "delta",
      data: { text: "hi" },
    });
    expect(parseSseFrame('event: delta\ndata: {"text":')).toBeNull();
    expect(parseSseFrame("event: delta")).toBeNull();
  });

  test("CLI stream lines reduce to deltas and a final result", () => {
    const delta = JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { text: "part" } },
    });
    expect(parseStreamLine(delta)).toEqual({ kind: "delta", text: "part" });

    const final = JSON.stringify({
      type: "result",
      result: "all of it",
      modelUsage: { "claude-sonnet-5": { outputTokens: 100 } },
    });
    expect(parseStreamLine(final)).toEqual({
      kind: "final",
      text: "all of it",
      model: "claude-sonnet-5",
    });

    expect(parseStreamLine("")).toBeNull();
    expect(parseStreamLine("not json")).toBeNull();
    expect(parseStreamLine(JSON.stringify({ type: "system" }))).toBeNull();
  });
});

/**
 * The coverage legend's own markup (round-one critic finding).
 *
 * `.covkey` is display:flex with a 4px gap, and the key rendered the layer name
 * as a bare text node followed by `<em>, went into the model's context</em>`.
 * Two text nodes are two flex items, so the gap opened between the word and the
 * comma that belongs to it and all three keys read "Retrieval , went into the
 * model's context". Nothing in the source contained that space, which is why a
 * source grep found nothing and only a render shows it.
 */
describe("the coverage legend", () => {
  test("each key's name and gloss are one element, not two flex items", () => {
    const html = renderToStaticMarkup(
      createElement(CoverageMap, { events: [], chunks: [], documents: [] }),
    );
    expect((html.match(/class="covkey-name"/g) ?? []).length).toBe(3);
    // The name and the comma are inside the same element, with no element
    // boundary between the word and its punctuation.
    // M42: the three keys say what happened to the passage. "Retrieval" and
    // "Citation" were the tool's names for the layers, and both are on the copy
    // bar's banned list; the layer ids behind them are unchanged.
    expect(html).toContain('<span class="covkey-name">Abductive read the passage<em class="muted">,');
    expect(html).toContain('<span class="covkey-name">A check quoted the passage<em class="muted">,');
    expect(html).toContain('<span class="covkey-name">You read the passage<em class="muted">,');
  });

  test("every checkbox in the legend carries the class this surface styles", () => {
    // The three coverage boxes are three of the twenty that rendered as the UA
    // control, accent-color auto, system blue on a three-ink screen.
    const html = renderToStaticMarkup(
      createElement(CoverageMap, { events: [], chunks: [], documents: [] }),
    );
    const boxes = (html.match(/type="checkbox"/g) ?? []).length;
    expect(boxes).toBe(3);
    expect((html.match(/class="tickbox"/g) ?? []).length).toBe(boxes);
  });
});
