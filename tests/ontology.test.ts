/**
 * Ontology core: projection purity, multi-root topology, supersession, and
 * the puzzle→theory obligations (ISC-13 … ISC-24).
 *
 * The scenario used throughout is the demo study's real shape — creative
 * careers, musicians against film directors — because the defects these tests
 * guard against are the ones that study actually invites.
 */

import { describe, expect, test } from "bun:test";
import type { EdgeRole, LedgerEvent, Origin, PageType, PuzzleRelation } from "../src/ledger/events.ts";
import { EDGE_ROLES } from "../src/ledger/events.ts";
import { projectOntology, residueTrajectory, mutationsInWindow } from "../src/ontology/projection.ts";
import {
  OBLIGATIONS,
  RELATION_BURDEN,
  checkAllObligations,
  checkObligation,
  // M29: the corpus the `contradicts` burden counts over.
  chunkDocuments,
  hasExpectationFor,
} from "../src/ontology/relations.ts";
import { citedChunks, livePages, pagesOfType } from "../src/ontology/schema.ts";

const PROJECT = "proj-ontology";
let clock = 1_800_000_000_000;

function env(actor: "human" | "system" | `persona:${string}` = "human") {
  clock += 1000;
  const base = { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT };
  return actor.startsWith("persona:")
    ? { ...base, model: "claude-sonnet-5", modelVersion: "claude-sonnet-5" }
    : base;
}

function create(
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

function revise(targetId: string, title: string, opts: { origin?: Origin; chunks?: string[] } = {}): LedgerEvent {
  return {
    ...env(),
    type: "ontology-mutation",
    op: "revise",
    targetId,
    title,
    origin: opts.origin ?? "data-driven",
    ...(opts.chunks !== undefined ? { supportingChunks: opts.chunks } : {}),
  } as LedgerEvent;
}

function relate(
  from: string,
  to: string,
  role: EdgeRole,
  opts: { relation?: PuzzleRelation; chunks?: string[]; origin?: Origin } = {},
): LedgerEvent {
  return {
    ...env(),
    type: "ontology-mutation",
    op: "relate",
    targetId: `${from}->${to}`,
    edge: { from, to, role },
    origin: opts.origin ?? "author-prior",
    supportingChunks: opts.chunks ?? [],
    ...(opts.relation !== undefined ? { puzzleRelation: opts.relation } : {}),
  } as LedgerEvent;
}

function op(o: "retire" | "reinstate" | "unrelate", targetId: string, edge?: { from: string; to: string; role: EdgeRole }): LedgerEvent {
  return {
    ...env(),
    type: "ontology-mutation",
    op: o,
    targetId,
    origin: "author-prior",
    ...(edge !== undefined ? { edge } : {}),
  } as LedgerEvent;
}

function collapse(kept: string[], superseded: string[], reason: string): LedgerEvent {
  return {
    ...env(),
    type: "puzzle-collapse",
    keptPuzzleIds: kept,
    supersededPuzzleIds: superseded,
    reason,
  } as LedgerEvent;
}

// ---------------------------------------------------------------------------

describe("projection purity and determinism (ISC-14)", () => {
  const events = [
    create("pz-1", "puzzle", "Directors narrate contingency despite a formal ladder"),
    create("th-1", "theory", "Boundaryless careers"),
    relate("pz-1", "th-1", "stands-to", { relation: "contradicts" }),
  ];

  test("replaying the same events twice yields a deep-equal graph", () => {
    const a = projectOntology(events, PROJECT);
    const b = projectOntology(events, PROJECT);
    expect(JSON.parse(JSON.stringify([...b.pages]))).toEqual(JSON.parse(JSON.stringify([...a.pages])));
    expect(b.relations).toEqual(a.relations);
    expect(b.puzzleRoots).toEqual(a.puzzleRoots);
  });

  test("projection does not mutate the input array", () => {
    const snapshot = JSON.parse(JSON.stringify(events));
    projectOntology(events, PROJECT);
    expect(JSON.parse(JSON.stringify(events))).toEqual(snapshot);
  });

  test("events for other projects are excluded", () => {
    const foreign = { ...create("pz-x", "puzzle", "Other study"), projectId: "other" } as LedgerEvent;
    const graph = projectOntology([...events, foreign], PROJECT);
    expect(graph.pages.has("pz-x")).toBe(false);
  });
});

describe("multi-root topology (ISC-15, ISC-16, ISC-17)", () => {
  const base = [
    create("pz-1", "puzzle", "Ladder narrated as contingent"),
    create("pz-2", "puzzle", "Portfolio narrated as gatekept"),
    create("pz-3", "puzzle", "Both fields defer to the same intermediaries"),
  ];

  test("holds several puzzle roots at once", () => {
    const graph = projectOntology(base, PROJECT);
    expect(graph.puzzleRoots.length).toBe(3);
  });

  test("collapse supersedes without deleting", () => {
    const graph = projectOntology(
      [...base, collapse(["pz-3"], ["pz-1", "pz-2"], "both are the same tension seen from either side")],
      PROJECT,
    );
    expect(graph.puzzleRoots).toEqual(["pz-3"]);
    expect([...graph.supersededPuzzles].sort()).toEqual(["pz-1", "pz-2"]);
    // Still present and readable — the collapse may have been premature.
    expect(graph.pages.get("pz-1")?.title).toBe("Ladder narrated as contingent");
    expect(graph.collapses).toHaveLength(1);
    expect(graph.collapses[0]?.reason).toContain("same tension");
  });

  test("a superseded puzzle can be reinstated", () => {
    const graph = projectOntology(
      [
        ...base,
        collapse(["pz-3"], ["pz-1", "pz-2"], "narrowing"),
        op("reinstate", "pz-1"),
      ],
      PROJECT,
    );
    expect([...graph.puzzleRoots].sort()).toEqual(["pz-1", "pz-3"]);
    expect(graph.supersededPuzzles).toEqual(["pz-2"]);
  });

  test("retire marks rather than removes, and reinstate reverses it", () => {
    const retired = projectOntology([...base, op("retire", "pz-2")], PROJECT);
    expect(retired.pages.has("pz-2")).toBe(true);
    expect(retired.pages.get("pz-2")?.retired).toBe(true);
    expect(retired.puzzleRoots).not.toContain("pz-2");

    const back = projectOntology([...base, op("retire", "pz-2"), op("reinstate", "pz-2")], PROJECT);
    expect(back.puzzleRoots).toContain("pz-2");
  });
});

describe("versioning and attribution (ISC-18, ISC-19)", () => {
  const events = [
    create("pz-1", "puzzle", "First framing", { origin: "author-prior" }),
    revise("pz-1", "Second framing", { origin: "data-driven", chunks: ["c1"] }),
    revise("pz-1", "Third framing", { origin: "model-proposed" }),
  ];

  test("revise increments the version", () => {
    const graph = projectOntology(events, PROJECT);
    expect(graph.pages.get("pz-1")?.version).toBe(3);
    expect(graph.pages.get("pz-1")?.title).toBe("Third framing");
  });

  test("history preserves every prior version with its own origin", () => {
    const page = projectOntology(events, PROJECT).pages.get("pz-1");
    expect(page?.history.map((h) => h.version)).toEqual([1, 2, 3]);
    expect(page?.history.map((h) => h.origin)).toEqual([
      "author-prior",
      "data-driven",
      "model-proposed",
    ]);
    expect(page?.history[0]?.title).toBe("First framing");
  });

  test("every version links back to the ledger event that produced it", () => {
    const page = projectOntology(events, PROJECT).pages.get("pz-1");
    for (const version of page?.history ?? []) {
      expect(events.some((e) => e.id === version.eventId)).toBe(true);
    }
  });

  test("revise without chunks inherits the previous supporting chunks", () => {
    const page = projectOntology(events, PROJECT).pages.get("pz-1");
    expect(page?.supportingChunks).toEqual(["c1"]);
  });
});

describe("page and edge vocabulary (ISC-22, ISC-23)", () => {
  test("analytic-residue and puzzle are distinct types with distinct lifecycles", () => {
    const graph = projectOntology(
      [
        create("pz-1", "puzzle", "The tension actors navigate"),
        create("res-1", "analytic-residue", "What my account cannot absorb"),
      ],
      PROJECT,
    );
    expect(pagesOfType(graph, "puzzle").map((p) => p.id)).toEqual(["pz-1"]);
    expect(pagesOfType(graph, "analytic-residue").map((p) => p.id)).toEqual(["res-1"]);
    // Residue is not a root; only puzzles are.
    expect(graph.puzzleRoots).toEqual(["pz-1"]);
  });

  test("no generic association role exists in the edge vocabulary", () => {
    for (const banned of ["related-to", "relates", "associated-with", "see-also", "link"]) {
      expect(EDGE_ROLES).not.toContain(banned as EdgeRole);
    }
    expect(EDGE_ROLES.every((r) => r.length > 0)).toBe(true);
  });

  test("unrelate retires an edge without erasing it", () => {
    const events = [
      create("pz-1", "puzzle", "P"),
      create("th-1", "theory", "T"),
      relate("pz-1", "th-1", "contradicts"),
      op("unrelate", "pz-1->th-1", { from: "pz-1", to: "th-1", role: "contradicts" }),
    ];
    const graph = projectOntology(events, PROJECT);
    expect(graph.edges.size).toBe(1);
    expect([...graph.edges.values()][0]?.retired).toBe(true);
  });

  test("citedChunks gathers from pages and edges, ignoring retired ones", () => {
    const graph = projectOntology(
      [
        create("ob-1", "observation", "O1", { chunks: ["c1", "c2"] }),
        create("ob-2", "observation", "O2", { chunks: ["c3"] }),
        op("retire", "ob-2"),
      ],
      PROJECT,
    );
    expect([...citedChunks(graph)].sort()).toEqual(["c1", "c2"]);
  });
});

// ---------------------------------------------------------------------------
// Obligations
// ---------------------------------------------------------------------------

describe("relation obligations (ISC-20, ISC-21)", () => {
  test("each of the four relations declares a distinct requirement", () => {
    const requirements = Object.values(OBLIGATIONS).map((o) => o.requirement);
    expect(new Set(requirements).size).toBe(4);
    for (const r of requirements) expect(r.length).toBeGreaterThan(20);
  });

  test("exposes carries a strictly heavier burden than every other relation", () => {
    const others = (["contradicts", "instantiates", "silent"] as PuzzleRelation[]).map(
      (r) => RELATION_BURDEN[r],
    );
    for (const burden of others) {
      expect(RELATION_BURDEN.exposes).toBeGreaterThan(burden);
    }
  });

  test("burdens are totally ordered — no two relations tie", () => {
    const values = Object.values(RELATION_BURDEN);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("contradicts obligation", () => {
  const scaffold = [
    create("pz-1", "puzzle", "Directors narrate contingency"),
    create("th-1", "theory", "Guild ladder"),
    relate("pz-1", "th-1", "stands-to", { relation: "contradicts" }),
  ];

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("one observation is a weird case, not a systematic deviation", () => {
    const events = [
      ...scaffold,
      create("ob-1", "observation", "Director A", { chunks: ["c1"] }),
      relate("ob-1", "pz-1", "evidences"),
    ];
    const result = checkObligation(projectOntology(events, PROJECT), "pz-1", "th-1", "contradicts");
    expect(result.discharged).toBe(false);
    // M28 r6: copy. It printed "only 1 observation(s) evidence this puzzle",
    // a parenthesised plural with a verb that does not agree. Two states now,
    // and this is the one-observation one; the "weird case" reading moved to
    // the state it is true of, which is having none.
    // D33 (M43c): the sentence names the attachment, because the count is of
    // observations attached to this puzzle and the old wording read as a count of
    // what the model held.
    expect(result.detail).toBe(
      "You have attached one observation to this puzzle, and one instance counts as an unusual case",
    );
  });

  test("two observations resting on one chunk still fail — one source is not breadth", () => {
    const events = [
      ...scaffold,
      create("ob-1", "observation", "Director A", { chunks: ["c1"] }),
      create("ob-2", "observation", "Director B", { chunks: ["c1"] }),
      relate("ob-1", "pz-1", "evidences"),
      relate("ob-2", "pz-1", "evidences"),
    ];
    const result = checkObligation(projectOntology(events, PROJECT), "pz-1", "th-1", "contradicts");
    expect(result.discharged).toBe(false);
    expect(result.detail).toContain("one source");
  });

  test("two observations across two chunks discharge it", () => {
    const events = [
      ...scaffold,
      create("ob-1", "observation", "Director A", { chunks: ["c1"] }),
      create("ob-2", "observation", "Director B", { chunks: ["c2"] }),
      relate("ob-1", "pz-1", "evidences"),
      relate("ob-2", "pz-1", "evidences"),
    ];
    const result = checkObligation(projectOntology(events, PROJECT), "pz-1", "th-1", "contradicts");
    expect(result.discharged).toBe(true);
  });

  /*
   * M29 (E3). The requirement promises "more than one source document" and the
   * check counted chunk ids, so two quotes out of one interview satisfied a
   * sentence about breadth that they do not satisfy. Both halves are asserted
   * here, over the same two observations, with only the corpus changing.
   */
  const twoObservations = [
    ...scaffold,
    create("ob-1", "observation", "Director A", { chunks: ["c1"] }),
    create("ob-2", "observation", "Director B", { chunks: ["c2"] }),
    relate("ob-1", "pz-1", "evidences"),
    relate("ob-2", "pz-1", "evidences"),
  ];

  test("two passages of one document do not discharge it", () => {
    const documents = chunkDocuments([
      { id: "c1", documentId: "interview-with-a" },
      { id: "c2", documentId: "interview-with-a" },
    ]);
    const result = checkObligation(
      projectOntology(twoObservations, PROJECT),
      "pz-1",
      "th-1",
      "contradicts",
      documents,
    );
    expect(result.discharged).toBe(false);
    expect(result.detail).toContain("one source");
    // And it says what it counted, in the word the requirement above it uses.
    expect(result.detail).toContain("1 document");
  });

  test("two passages of two documents do discharge it", () => {
    const documents = chunkDocuments([
      { id: "c1", documentId: "interview-with-a" },
      { id: "c2", documentId: "interview-with-b" },
    ]);
    const result = checkObligation(
      projectOntology(twoObservations, PROJECT),
      "pz-1",
      "th-1",
      "contradicts",
      documents,
    );
    expect(result.discharged).toBe(true);
    expect(result.detail).toContain("2 documents");
  });

  test("Anti: the promise and the count are about the same object", () => {
    // The defect was that they were not, and no assertion in this file could
    // see it: the requirement said "source document" and the detail said
    // "passage", eighteen pixels apart on the same row.
    const said = OBLIGATIONS.contradicts.requirement;
    // M42: "more than one source document" became "two different documents of
    // your material", which is the same object in the words the rest of the tool
    // uses. The property is unchanged: the promise counts documents and so does
    // the detail.
    expect(said).toContain("documents of your data");
    const documents = chunkDocuments([
      { id: "c1", documentId: "one" },
      { id: "c2", documentId: "one" },
    ]);
    const detail = checkObligation(
      projectOntology(twoObservations, PROJECT),
      "pz-1",
      "th-1",
      "contradicts",
      documents,
    ).detail;
    expect(/passage/i.test(detail)).toBe(false);
  });
});

describe("instantiates obligation", () => {
  const scaffold = [
    create("pz-1", "puzzle", "Both fields defer to intermediaries"),
    create("th-1", "theory", "Portfolio vs ladder"),
    relate("pz-1", "th-1", "stands-to", { relation: "instantiates" }),
  ];

  test("an instance with no mechanism is not a contribution", () => {
    const result = checkObligation(projectOntology(scaffold, PROJECT), "pz-1", "th-1", "instantiates");
    expect(result.discharged).toBe(false);
    // M28 r6: copy. These render on the argument band, so they address the
    // reader and carry no "(s)" plurals.
    expect(result.detail).toContain("You have not proposed how anyone navigates the tension");
  });

  test("an ungrounded mechanism still fails", () => {
    const events = [
      ...scaffold,
      create("cr-1", "candidate-resolution", "Gatekeeper dependence"),
      relate("cr-1", "pz-1", "resolves"),
    ];
    const result = checkObligation(projectOntology(events, PROJECT), "pz-1", "th-1", "instantiates");
    expect(result.discharged).toBe(false);
    // M28 r6: copy.
    expect(result.detail).toContain("none of those resolutions cites your data");
  });

  test("a corpus-grounded mechanism discharges it", () => {
    const events = [
      ...scaffold,
      create("cr-1", "candidate-resolution", "Gatekeeper dependence", { chunks: ["c9"] }),
      relate("cr-1", "pz-1", "resolves"),
    ];
    const result = checkObligation(projectOntology(events, PROJECT), "pz-1", "th-1", "instantiates");
    expect(result.discharged).toBe(true);
  });
});

describe("exposes obligation — the hardest to claim", () => {
  const scaffold = [
    create("pz-1", "puzzle", "Actors run aground on a conflation in the theory"),
    create("th-1", "theory", "Career structure as field logic"),
    create("th-2", "theory", "Career structure as narrated legitimation"),
    relate("pz-1", "th-1", "stands-to", { relation: "exposes" }),
  ];

  test("an asserted conceptual conflict with nothing behind it fails on all three counts", () => {
    const result = checkObligation(projectOntology(scaffold, PROJECT), "pz-1", "th-1", "exposes");
    expect(result.discharged).toBe(false);
    // M28 r6: copy. The joined clauses open the sentence now, so the first is
    // capitalised.
    expect(result.detail).toContain("You have not linked the two expectations");
    // M28 r6: copy. The missing observations are named as what the reader has
    // not shown rather than as a count with a parenthesised plural.
    expect(result.detail).toContain("you have not shown anyone running aground on that expectation");
    // M28 r6: copy.
    expect(result.detail).toContain("exposure's consequence is still to come");
  });

  test("representing the theory tension alone is not enough", () => {
    const events = [...scaffold, relate("th-1", "th-2", "tensions-with")];
    const result = checkObligation(projectOntology(events, PROJECT), "pz-1", "th-1", "exposes");
    expect(result.discharged).toBe(false);
    expect(result.detail).not.toContain("asserted, not represented");
  });

  test("evidence without consequence still fails — a shrug is not a contribution", () => {
    const events = [
      ...scaffold,
      relate("th-1", "th-2", "tensions-with"),
      create("ob-1", "observation", "Director A", { chunks: ["c1"] }),
      create("ob-2", "observation", "Musician B", { chunks: ["c2"] }),
      relate("ob-1", "pz-1", "evidences"),
      relate("ob-2", "pz-1", "evidences"),
    ];
    const result = checkObligation(projectOntology(events, PROJECT), "pz-1", "th-1", "exposes");
    expect(result.discharged).toBe(false);
    /* M28 r6: copy. The clause is capitalised when it opens the sentence and
     * lower-case when it follows another, so the assertion matches the part
     * that does not move. */
    expect(result.detail).toContain("exposure's consequence is still to come");
  });

  test("all three parts together discharge it", () => {
    const events = [
      ...scaffold,
      relate("th-1", "th-2", "tensions-with"),
      create("ob-1", "observation", "Director A", { chunks: ["c1"] }),
      create("ob-2", "observation", "Musician B", { chunks: ["c2"] }),
      relate("ob-1", "pz-1", "evidences"),
      relate("ob-2", "pz-1", "evidences"),
      create("sc-1", "scope-condition", "Holds where intermediaries are few"),
      relate("sc-1", "pz-1", "bounds"),
    ];
    const result = checkObligation(projectOntology(events, PROJECT), "pz-1", "th-1", "exposes");
    expect(result.discharged).toBe(true);
  });

  test("the same evidence that discharges contradicts does not discharge exposes", () => {
    const events = [
      create("pz-1", "puzzle", "P"),
      create("th-1", "theory", "T"),
      create("ob-1", "observation", "A", { chunks: ["c1"] }),
      create("ob-2", "observation", "B", { chunks: ["c2"] }),
      relate("ob-1", "pz-1", "evidences"),
      relate("ob-2", "pz-1", "evidences"),
    ];
    const graph = projectOntology(events, PROJECT);
    expect(checkObligation(graph, "pz-1", "th-1", "contradicts").discharged).toBe(true);
    expect(checkObligation(graph, "pz-1", "th-1", "exposes").discharged).toBe(false);
  });
});

describe("silent obligation", () => {
  test("silence with nothing left unexplained is not a warrant", () => {
    const events = [
      create("pz-1", "puzzle", "P"),
      create("th-1", "theory", "T"),
      relate("pz-1", "th-1", "stands-to", { relation: "silent" }),
    ];
    const result = checkObligation(projectOntology(events, PROJECT), "pz-1", "th-1", "silent");
    expect(result.discharged).toBe(false);
    // M28 r6: copy.
    expect(result.detail).toContain("leaves you without a reason to run the project");
  });

  test("an attached residue discharges it", () => {
    const events = [
      create("pz-1", "puzzle", "P"),
      create("th-1", "theory", "T"),
      create("res-1", "analytic-residue", "Nothing accounts for the sequencing"),
      relate("res-1", "pz-1", "evidences"),
    ];
    const result = checkObligation(projectOntology(events, PROJECT), "pz-1", "th-1", "silent");
    expect(result.discharged).toBe(true);
  });
});

describe("obligation ordering across the whole graph", () => {
  test("unmet obligations sort before met ones, heaviest burden first", () => {
    const events = [
      create("pz-1", "puzzle", "P1"),
      create("pz-2", "puzzle", "P2"),
      create("th-1", "theory", "T1"),
      create("res-1", "analytic-residue", "R"),
      relate("res-1", "pz-2", "evidences"),
      relate("pz-2", "th-1", "stands-to", { relation: "silent" }), // discharged
      relate("pz-1", "th-1", "stands-to", { relation: "exposes" }), // unmet, heaviest
    ];
    const results = checkAllObligations(projectOntology(events, PROJECT));
    expect(results[0]?.relation).toBe("exposes");
    expect(results[0]?.discharged).toBe(false);
    expect(results[results.length - 1]?.discharged).toBe(true);
  });
});

describe("expectation presence", () => {
  test("a puzzle with no theory attached has no expectation", () => {
    const graph = projectOntology([create("pz-1", "puzzle", "P")], PROJECT);
    expect(hasExpectationFor(graph, "pz-1")).toBe(false);
  });

  test("a declared relation counts as an expectation", () => {
    const graph = projectOntology(
      [
        create("pz-1", "puzzle", "P"),
        create("th-1", "theory", "T"),
        relate("pz-1", "th-1", "stands-to", { relation: "contradicts" }),
      ],
      PROJECT,
    );
    expect(hasExpectationFor(graph, "pz-1")).toBe(true);
  });

  test("a plain edge to a theory page also counts", () => {
    const graph = projectOntology(
      [
        create("pz-1", "puzzle", "P"),
        create("th-1", "theory", "T"),
        relate("th-1", "pz-1", "predicts"),
      ],
      PROJECT,
    );
    expect(hasExpectationFor(graph, "pz-1")).toBe(true);
  });
});

describe("trajectory readers", () => {
  test("residue trajectory records the count as residues appear and retire", () => {
    const events = [
      create("r1", "analytic-residue", "R1"),
      create("r2", "analytic-residue", "R2"),
      op("retire", "r1"),
      create("r3", "analytic-residue", "R3"),
    ];
    expect(residueTrajectory(events, PROJECT)).toEqual([1, 2, 1, 2]);
  });

  test("monotonic decline is visible as a non-increasing series", () => {
    const events = [
      create("r1", "analytic-residue", "R1"),
      create("r2", "analytic-residue", "R2"),
      op("retire", "r2"),
      op("retire", "r1"),
    ];
    const series = residueTrajectory(events, PROJECT);
    const tail = series.slice(1);
    expect(tail).toEqual([2, 1, 0]);
  });

  test("mutationsInWindow counts only ontology mutations in the trailing window", () => {
    const events: LedgerEvent[] = [
      create("p1", "puzzle", "P"),
      { ...env("human"), type: "response", text: "thinking" } as LedgerEvent,
      { ...env("human"), type: "response", text: "still thinking" } as LedgerEvent,
      { ...env("human"), type: "response", text: "nothing new" } as LedgerEvent,
    ];
    expect(mutationsInWindow(events, 3)).toBe(0);
    expect(mutationsInWindow(events, 4)).toBe(1);
  });
});

describe("live page readers", () => {
  test("livePages excludes retired and superseded pages", () => {
    const events = [
      create("pz-1", "puzzle", "Kept"),
      create("pz-2", "puzzle", "Superseded"),
      create("ob-1", "observation", "Retired"),
      collapse(["pz-1"], ["pz-2"], "narrowing"),
      op("retire", "ob-1"),
    ];
    const graph = projectOntology(events, PROJECT);
    expect(livePages(graph).map((p) => p.id)).toEqual(["pz-1"]);
    expect(graph.pages.size).toBe(3);
  });
});
