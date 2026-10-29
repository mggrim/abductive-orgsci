/**
 * Twin comparison and the five exports (ISC-66 … ISC-69).
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { LedgerEvent, Origin, PageType } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages } from "../src/ontology/schema.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import type { ModalTwin } from "../src/twin/twin.ts";
import { extractTwinOntology, twinChunks } from "../src/twin/twinOntology.ts";
import { compareToTwin } from "../src/twin/compare.ts";
import { originLabel, originReads } from "../src/ui/originVocabulary.ts";
import { TYPE_PX } from "../src/ui/tokens.ts";
import { buildAgentGraph, serializeAgentGraph, AGENT_GRAPH_FORMAT } from "../src/export/agentGraph.ts";
import { buildWikiFiles, pageFilenames } from "../src/export/wikiDirectory.ts";
import { buildDiagramSvg } from "../src/export/diagram.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { buildBundle, parseBundle, serializeBundle } from "../src/export/bundle.ts";
import { emptyBrief, type Project } from "../src/state/projects.ts";

const PROJECT_ID = "proj-export";
let clock = 2_200_000_000_000;

function env(actor: "human" | "system" = "human") {
  clock += 1000;
  return { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT_ID };
}

function page(
  targetId: string,
  pageType: PageType,
  title: string,
  opts: { origin?: Origin; chunks?: string[]; body?: string } = {},
): LedgerEvent {
  return {
    ...env(),
    type: "ontology-mutation",
    op: "create",
    targetId,
    pageType,
    title,
    body: opts.body ?? "",
    origin: opts.origin ?? "author-prior",
    supportingChunks: opts.chunks ?? [],
  } as LedgerEvent;
}

function relate(from: string, to: string, role: string, relation?: string): LedgerEvent {
  return {
    ...env(),
    type: "ontology-mutation",
    op: "relate",
    targetId: `${from}->${to}`,
    edge: { from, to, role },
    ...(relation === undefined ? {} : { puzzleRelation: relation }),
    origin: "author-prior",
    supportingChunks: [],
  } as LedgerEvent;
}

const PROJECT: Project = {
  id: PROJECT_ID,
  title: "Creative careers",
  stage: "design-brief",
  brief: {
    ...emptyBrief(),
    researchQuestion: "Why do directors decline credited roles?",
    siteRationale: "One production company.",
    sampleRationale: "Twelve directors.",
    dataType: "interview",
  },
  createdAt: 1,
};

const EVENTS: LedgerEvent[] = [
  page("p1", "puzzle", "Directors decline credited roles", { chunks: ["c1"] }),
  page("t1", "theory", "Portfolio-career accounts", { chunks: ["c2"] }),
  page("o1", "observation", "Refusal of the AD credit", { chunks: ["c1"] }),
  page("r1", "analytic-residue", "The producer who kept the relationships", {
    origin: "data-driven",
    chunks: ["c3"],
  }),
  page("m1", "candidate-resolution", "Credit means different things per field", {
    origin: "model-proposed",
  }),
  relate("o1", "p1", "evidences"),
  relate("p1", "t1", "stands-to", "contradicts"),
];

const GRAPH = projectOntology(EVENTS, PROJECT_ID);

const TWIN: ModalTwin = {
  id: "twin-1",
  projectId: PROJECT_ID,
  researchQuestionFraming: "How do creative workers construct careers across fields?",
  siteSampleLogic: "Interview a matched sample in two contrasting fields.",
  expectedFindings: "Field structure shapes how careers are narrated.",
  // M29: the fourth facet, from A6.
  expectedContribution: "A process model of how field structure conditions career narration.",
  model: "mock",
  modelVersion: "mock-1",
  createdAt: 1,
};

// ---------------------------------------------------------------------------

describe("twin ontology by the same procedure (ISC-66)", () => {
  const RESPONSE = [
    "TYPE: puzzle",
    "TITLE: Careers differ across creative fields",
    "BODY: The modal framing. [[chunk:twin:research-question]]",
    "---",
    "TYPE: theory",
    "TITLE: Portfolio-career accounts",
    "BODY: The standard literature. [[chunk:twin:expected-findings]]",
  ].join("\n");

  test("the twin's prose becomes chunks the ordinary extractor can read", () => {
    const chunks = twinChunks(TWIN);
    // M29: four facets, since `expectedContribution` joined them (A6).
    expect(chunks).toHaveLength(4);
    expect(chunks.map((c) => c.id)).toEqual([
      "twin:research-question",
      "twin:site-sample",
      "twin:expected-findings",
      "twin:expected-contribution",
    ]);
  });

  test("empty facets are dropped rather than sent as blank chunks", () => {
    expect(twinChunks({ ...TWIN, siteSampleLogic: "  " })).toHaveLength(3);
  });

  test("M29: a twin stored before the fourth facet yields the three it has", () => {
    // The baseline is a snapshot of the first lock and is never regenerated, so
    // an old twin reaching this code has no `expectedContribution` at all. It
    // must read as three facets rather than as four with one blank.
    const { expectedContribution: _dropped, ...old } = TWIN;
    expect(twinChunks(old)).toHaveLength(3);
    expect(twinChunks(old).map((c) => c.id)).not.toContain("twin:expected-contribution");
  });

  test("extraction goes through the same extractor and yields a projected graph", async () => {
    const client = new MockInferenceClient({ responses: [RESPONSE] });
    const result = await extractTwinOntology(TWIN, client);
    expect(livePages(result.graph)).toHaveLength(2);
    // Same prompt contract as the researcher's uploads — the extractor's own
    // system prompt, not a bespoke one.
    expect(client.requests[0]?.system).toContain("staging tray the researcher adjudicates");
  });

  test("every twin page stays marked model-proposed", async () => {
    const result = await extractTwinOntology(TWIN, new MockInferenceClient({ responses: [RESPONSE] }));
    for (const p of livePages(result.graph)) expect(p.origin).toBe("model-proposed");
  });

  test("the twin graph is namespaced and never lands in the project's ledger", async () => {
    const result = await extractTwinOntology(TWIN, new MockInferenceClient({ responses: [RESPONSE] }));
    expect(result.graph.projectId).toBe(`twin:${PROJECT_ID}`);
    for (const e of result.events) expect(e.projectId).not.toBe(PROJECT_ID);
  });
});

describe("graph comparison, not embedding distance (ISC-67)", () => {
  const twinEvents = [
    { ...page("tp1", "puzzle", "Directors decline credited roles"), projectId: "twin" },
    { ...page("tt1", "theory", "Portfolio-career accounts"), projectId: "twin" },
    { ...page("tx1", "candidate-resolution", "Field structure shapes narration"), projectId: "twin" },
  ] as LedgerEvent[];
  const twinGraph = projectOntology(twinEvents, "twin");

  test("shared constructs are matched by title within type", () => {
    const c = compareToTwin(GRAPH, twinGraph);
    expect(c.shared.map((s) => s.type).sort()).toEqual(["puzzle", "theory"]);
  });

  test("departures and omissions are reported separately", () => {
    const c = compareToTwin(GRAPH, twinGraph);
    expect(c.researcherOnly.map((x) => x.title)).toContain("The producer who kept the relationships");
    expect(c.twinOnly.map((x) => x.title)).toContain("Field structure shapes narration");
  });

  test("a page is never matched to two counterparts", () => {
    const twoTwins = projectOntology(
      [
        { ...page("a", "theory", "Portfolio-career accounts"), projectId: "twin" },
        { ...page("b", "theory", "Portfolio career accounts of work"), projectId: "twin" },
      ] as LedgerEvent[],
      "twin",
    );
    const c = compareToTwin(GRAPH, twoTwins);
    const twinIds = c.shared.map((s) => s.twinPageId);
    expect(new Set(twinIds).size).toBe(twinIds.length);
  });

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("departure share is reported but never framed as a score", () => {
    const c = compareToTwin(GRAPH, twinGraph);
    expect(c.departureShare).toBeGreaterThan(0);
    /* Walk item 1: the sentence is not the score, and it is no longer an
     * epigram about the modal path either. It names the departures and points
     * at the tab that says what each one owes, which is the criterion this test
     * was written for: a share is reported, and nothing frames it as good or
     * bad. */
    expect(c.summary).toContain("without a match in the ordinary version");
    // M89: the sentence sending the reader to the Checks tab went with the tab.
    expect(c.summary).not.toContain("Checks");
    expect(c.summary).not.toMatch(/score|novelty|better|worse/i);
  });

  test("a design identical to the baseline is told so plainly", () => {
    const c = compareToTwin(twinGraph, twinGraph);
    expect(c.researcherOnly).toEqual([]);
    // Walk item 1: same claim, in the words the rest of the app uses.
    expect(c.summary).toContain("Every claim in your ontology has a match in the ordinary version.");
    expect(c.summary).toContain("your design is the ordinary one");
  });

  test("an empty twin says the comparison is meaningless rather than reporting 100% novel", () => {
    const c = compareToTwin(GRAPH, projectOntology([], "twin"));
    expect(c.summary).toContain("is empty");
  });

  test("no embedding or vector-distance call exists anywhere in src", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const root = join(import.meta.dir, "..");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.tsx?$/.test(name) ? [full] : [];
      });

    // Comments may explain WHY the metric was rejected — that reasoning is
    // worth keeping. Only executable code is probed.
    const offenders = [...walk(join(root, "src")), ...walk(join(root, "scripts"))].filter((file) => {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      return /embedding|cosineSimilarity|text-embedding|vectorDistance/i.test(code);
    });
    expect(offenders).toEqual([]);
  });
});

describe("agent-facing graph export (ISC-68)", () => {
  const built = buildAgentGraph({
    project: PROJECT,
    graph: GRAPH,
    events: EVENTS,
    chunks: [
      { id: "c1", projectId: PROJECT_ID, documentId: "d", kind: "transcript", text: "", index: 0 },
      { id: "c4", projectId: PROJECT_ID, documentId: "d", kind: "transcript", text: "", index: 1 },
    ],
  });

  test("carries provenance on every page", () => {
    expect(built.pages.every((p) => p.origin !== undefined)).toBe(true);
    expect(built.pages.find((p) => p.id === "m1")?.origin).toBe("model-proposed");
  });

  test("carries residue as its own section", () => {
    expect(built.residue.map((r) => r.title)).toEqual(["The producer who kept the relationships"]);
  });

  test("carries rejected paths even when empty, so the key is never absent", () => {
    expect(built.rejectedPaths.proposals).toEqual([]);
    expect(built.rejectedPaths.declinedTopics).toEqual([]);
  });

  test("states the obligation status of every framing claim", () => {
    const claim = built.relations.find((r) => r.puzzleId === "p1");
    expect(claim?.relation).toBe("contradicts");
    expect(typeof claim?.discharged).toBe("boolean");
  });

  test("marks which corpus chunks the ontology has actually met", () => {
    expect(built.corpus).toEqual([
      { chunkId: "c1", cited: true },
      { chunkId: "c4", cited: false },
    ]);
  });

  test("the caveats warn against the three things a summariser would do", () => {
    const text = built.caveats.join(" ");
    expect(text).toContain("Do not resolve them");
    expect(text).toContain("not independent evidence");
    expect(text).toContain("first thing that a summariser will drop");
  });

  test("serialises to parseable JSON with a format tag", () => {
    const parsed = JSON.parse(serializeAgentGraph(built));
    expect(parsed.format).toBe(AGENT_GRAPH_FORMAT);
  });
});

describe("wiki directory export (ISC-69)", () => {
  const files = buildWikiFiles({ project: PROJECT, graph: GRAPH, events: EVENTS });
  const byPath = new Map(files.map((f) => [f.path, f.content]));

  test("emits README, index, log, and one page per live construct", () => {
    expect(byPath.has("README.md")).toBe(true);
    expect(byPath.has("index.md")).toBe(true);
    expect(byPath.has("log.md")).toBe(true);
    expect(files.filter((f) => f.path.startsWith("pages/"))).toHaveLength(livePages(GRAPH).length);
  });

  test("pages carry typed frontmatter and wiki links", () => {
    const puzzle = [...byPath.entries()].find(([p]) => p.includes("directors-decline"))?.[1] ?? "";
    expect(puzzle).toContain("type: puzzle");
    expect(puzzle).toContain("origin: author-prior");
    expect(puzzle).toMatch(/\[\[[^\]]+\|[^\]]+\]\]/);
  });

  test("the index lists puzzle roots and what the starting point claims owe", () => {
    const index = byPath.get("index.md") ?? "";
    expect(index).toContain("## Puzzle roots");
    expect(index).toContain("What your starting point claims owe");
    expect(index).toContain("## What the account cannot absorb");
  });

  test("the log is the ontology mutation history in order", () => {
    const log = byPath.get("log.md") ?? "";
    expect(log).toContain("1. **create** Directors decline credited roles");
    expect(log).toContain("**relate**");
  });

  test("the README tells a stranger not to tidy the contradictions", () => {
    const readme = byPath.get("README.md") ?? "";
    expect(readme).toContain("Do not resolve the contradictions");
    expect(readme).toContain("Do not drop the residue");
  });

  test("filename collisions are disambiguated rather than overwriting", () => {
    const graph = projectOntology(
      [page("x1", "puzzle", "Same Title"), page("x2", "puzzle", "Same Title")],
      PROJECT_ID,
    );
    const names = [...pageFilenames(livePages(graph)).values()];
    expect(new Set(names).size).toBe(2);
  });

  test("an empty ontology still produces a readable index", () => {
    const empty = buildWikiFiles({
      project: PROJECT,
      graph: projectOntology([], PROJECT_ID),
      events: [],
    });
    const index = empty.find((f) => f.path === "index.md")?.content ?? "";
    expect(index).toContain("0 live pages");
  });
});

describe("diagram and memo (ISC-68)", () => {
  test("the SVG is self-contained and legends its own attribution convention", () => {
    const svg = buildDiagramSvg(GRAPH, { title: "Creative careers" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("http://localhost");
    // Restated, not weakened. This asserted the literal string "proposed by a
    // model", which the export satisfied while drawing origin under a third
    // convention that contradicted both of the app's figures. The property it
    // was protecting is that the exported figure explains its own attribution
    // convention, so it now asserts the sentence the app itself prints, out of
    // the one module every surface reads. tests/origin-boundary.test.ts holds
    // the mark to match the words.
    expect(svg).toContain(originReads("model-proposed"));
    expect(svg).toContain(originLabel("model-proposed"));
  });

  test("the exported figure obeys the type scale", () => {
    // The artefact that leaves the tool and goes into a paper was the one
    // surface entirely outside the foundations layer. It emitted font-size 9,
    // 10, 11, 14 and 16: four sizes the five-step scale does not contain, and
    // it never used 13 or 18. A stylesheet check could not see any of it,
    // because the export writes attributes into a standalone file with no
    // stylesheet attached.
    const svg = buildDiagramSvg(GRAPH, { title: "Creative careers" });
    const sizes = [...svg.matchAll(/font-size="(\d+(?:\.\d+)?)"/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(3);
    const scale = new Set<number>(Object.values(TYPE_PX));
    expect([...new Set(sizes)].filter((s) => !scale.has(s))).toEqual([]);
  });

  test("the exported figure spends no geometry the scale does not name", async () => {
    // r=22/15, x=20, 210px legend columns and +13/+11 label offsets, none of
    // which came from anywhere. Radii are the layout's now and every fixed
    // offset is a --space step, so the only free numbers left in the output are
    // the coordinates the layout computed.
    const src = Bun.file(new URL("../src/export/diagram.ts", import.meta.url).pathname);
    const code = (await src.text())
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    // What is left: the default canvas (900 x 700), which the caller overrides,
    // the SVG namespace year, and the one font-weight. Every radius, offset, column and size is a
    // token or a value the layout computed.
    const bare = [...code.matchAll(/(?<![\w$.[])\b\d{2,}\b/g)].map((m) => m[0]);
    expect(bare.sort()).toEqual(["2000", "600", "700", "900"]);
  });

  test("XML-unsafe titles are escaped", () => {
    const graph = projectOntology([page("q1", "puzzle", 'Ampersand & "quotes" <tag>')], PROJECT_ID);
    const svg = buildDiagramSvg(graph);
    expect(svg).toContain("&amp;");
    expect(svg).not.toMatch(/<tag>/);
  });

  test("an empty ontology renders a diagram that says so", () => {
    expect(buildDiagramSvg(projectOntology([], PROJECT_ID))).toContain("The ontology is empty");
  });

  test("the memo names the puzzle, the obligation, and the residue", () => {
    const memo = buildOntologyMemo({
      project: PROJECT,
      graph: GRAPH,
      events: EVENTS,
        now: () => 1_700_000_000_000,
    });
    expect(memo).toContain("## The puzzle");
    expect(memo).toContain("Directors decline credited roles");
    expect(memo).toContain("## What your starting point claims, and what it owes");
    expect(memo).toContain("The producer who kept the relationships");
  });

  test("the memo says plainly when no rival is on the record", () => {
    const memo = buildOntologyMemo({ project: PROJECT, graph: GRAPH, events: EVENTS });
    expect(memo).toContain("A resolution without a competitor is still untested.");
  });

  test("a majority-model ontology gets called out, not tabulated", () => {
    const modelHeavy = projectOntology(
      [
        page("a", "puzzle", "A", { origin: "model-proposed" }),
        page("b", "theory", "B", { origin: "model-proposed" }),
        page("c", "observation", "C", { origin: "author-prior" }),
      ],
      PROJECT_ID,
    );
    const events = [
      page("a", "puzzle", "A", { origin: "model-proposed" }),
      page("b", "theory", "B", { origin: "model-proposed" }),
      page("c", "observation", "C", { origin: "author-prior" }),
    ];
    const memo = buildOntologyMemo({
      project: PROJECT,
      graph: modelHeavy,
      events,
    });
    expect(memo).toContain("of this ontology originated with the model");
    expect(memo).toContain("Which of these claims would you have arrived at independently?");
  });

  test("all renderings derive from the same ledger and agree on page count", () => {
    const agent = buildAgentGraph({ project: PROJECT, graph: GRAPH, events: EVENTS, chunks: [] });
    const wiki = buildWikiFiles({ project: PROJECT, graph: GRAPH, events: EVENTS });
    expect(agent.pages).toHaveLength(livePages(GRAPH).length);
    expect(wiki.filter((f) => f.path.startsWith("pages/"))).toHaveLength(livePages(GRAPH).length);
  });
});

describe("bundle round-trip (ISC-68)", () => {
  test("a bundle serialises and parses back deep-equal", () => {
    const bundle = buildBundle({
      project: PROJECT,
      documents: [],
      chunks: [],
      anomalies: [],
      twin: TWIN,
      events: EVENTS,
    });
    expect(parseBundle(serializeBundle(bundle))).toEqual(bundle);
  });

  test("v2 event types survive the round-trip intact", () => {
    const withV2: LedgerEvent[] = [
      ...EVENTS,
      {
        ...env("system"),
        type: "question-selection",
        moveId: "m1",
        topic: "puzzle:root",
        question: "What cannot you account for?",
        alternatives: ["m2"],
        mode: "interrogation",
        reason: "no puzzle root",
      } as LedgerEvent,
    ];
    const bundle = buildBundle({
      project: PROJECT,
      documents: [],
      chunks: [],
      anomalies: [],
      twin: null,
      events: withV2,
    });
    const back = parseBundle(serializeBundle(bundle));
    const q = back.events.find((e) => e.type === "question-selection");
    expect(q).toBeDefined();
    if (q?.type !== "question-selection") throw new Error("lost the selection event");
    expect(q.question).toBe("What cannot you account for?");
  });
});
