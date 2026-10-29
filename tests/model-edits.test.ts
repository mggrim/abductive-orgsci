/**
 * Taking things back out of a model, and attaching the ones that are loose.
 *
 * Four findings from the live walk, and they share a shape: the tool could put
 * something into a study and could not take it out or move it. An accepted
 * claim could not be retired. A framing link could be made once and never
 * unmade. A residue could sit in the model attached to nothing while the check
 * that counts attached residues reported the study had nothing unexplained. And
 * the data reader drafted expectations out of the researcher's own transcript,
 * which the chooser then offered as the expectation their setting broke.
 */

import { describe, expect, test } from "bun:test";
import {
  relatePages,
  retirePage,
  withdrawRelation,
} from "../src/proposals/adjudicate.ts";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectArgument, residueClause } from "../src/views/argumentModel.ts";
import { livePages, pagesOfType } from "../src/ontology/schema.ts";
import { originCensus, LIVE_PAGES } from "../src/ontology/attribution.ts";
import { checkObligation, expectationsOnOffer } from "../src/ontology/relations.ts";
import { residuesOnSilence, silentPuzzleId } from "../src/views/silence.ts";
import { chooserOpens } from "../src/workbench/ExpectationChooser.tsx";
import { dataPageType } from "../src/proposals/extract.ts";
import { pageTypeGloss } from "../src/ui/pageTypeVocabulary.ts";

const P = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
let clock = 1_700_000_000_000;
let seq = 0;

function makeLedger(initial: readonly LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      for (const e of events) expect(validateEvent(e)).toEqual([]);
      store.push(...events);
    },
    readEvents: async () => [...store],
    now: () => (clock += 1000),
    newId: () => `aaaaaaaa-1111-4111-8111-${String((seq += 1)).padStart(12, "0")}`,
  };
}

function create(
  targetId: string,
  pageType: string,
  title: string,
  origin = "model-proposed",
): LedgerEvent {
  return {
    id: `aaaaaaaa-1111-4111-8111-${String((seq += 1)).padStart(12, "0")}`,
    ts: (clock += 1000),
    actor: "human",
    projectId: P,
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

function relate(
  targetId: string,
  from: string,
  to: string,
  role: string,
  extra: Record<string, unknown> = {},
): LedgerEvent {
  return {
    id: `aaaaaaaa-1111-4111-8111-${String((seq += 1)).padStart(12, "0")}`,
    ts: (clock += 1000),
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "relate",
    targetId,
    edge: { from, to, role },
    origin: "author-prior",
    ...extra,
  } as LedgerEvent;
}

const STUDY: readonly LedgerEvent[] = [
  create("pz", "puzzle", "Night wards refuse the handover", "data-driven"),
  create("th", "theory", "Handover is a coordination problem", "literature-derived"),
  create("ob", "observation", "The ward sister rewrote the form", "data-driven"),
];

describe("retiring a claim", () => {
  test("writes the retirement with the reason on it", async () => {
    const ledger = makeLedger(STUDY);
    const out = await retirePage(
      { projectId: P, pageId: "ob", reason: "I was reading the form, not the ward" },
      ledger,
    );
    expect(out.kind).toBe("recorded");
    const written = out.kind === "recorded" ? out.events[0] : undefined;
    expect(written).toMatchObject({
      type: "ontology-mutation",
      op: "retire",
      targetId: "ob",
      actor: "human",
      reason: "I was reading the form, not the ward",
    });
    expect(validateEvent(written)).toEqual([]);
  });

  test("a claim cannot leave without a reason", async () => {
    // The reason is the point, not a formality: a study that quietly loses the
    // claims it abandoned cannot show anyone what it considered and dropped.
    const ledger = makeLedger(STUDY);
    const out = await retirePage({ projectId: P, pageId: "ob", reason: "   " }, ledger);
    expect(out).toEqual({ kind: "rejected", errors: ["retiring a claim requires a reason"] });
    expect(ledger.store.length).toBe(STUDY.length);
  });

  test("Anti: retiring twice writes once, and an unknown claim writes nothing", async () => {
    const ledger = makeLedger(STUDY);
    await retirePage({ projectId: P, pageId: "ob", reason: "wrong object" }, ledger);
    const again = await retirePage({ projectId: P, pageId: "ob", reason: "wrong object" }, ledger);
    expect(again).toEqual({ kind: "no-change", why: "already retired" });
    const missing = await retirePage({ projectId: P, pageId: "nope", reason: "x" }, ledger);
    expect(missing).toEqual({ kind: "no-change", why: "the claim is missing" });
    expect(ledger.store.length).toBe(STUDY.length + 1);
  });

  test("the retired claim leaves the live model and the census, and stays in the record", async () => {
    const ledger = makeLedger(STUDY);
    await retirePage({ projectId: P, pageId: "ob", reason: "wrong object" }, ledger);
    const graph = projectOntology(ledger.store, P);

    expect(livePages(graph).map((p) => p.id).sort()).toEqual(["pz", "th"]);
    expect(originCensus(livePages(graph), LIVE_PAGES).population).toBe(2);
    // Marked, never removed: the page is still there, and it says what happened.
    const page = graph.pages.get("ob");
    expect({ present: page !== undefined, retired: page?.retired, status: page?.status }).toEqual({
      present: true,
      retired: true,
      status: "retired",
    });
  });

  test("the band stops counting it too, so the page does not disagree with itself", async () => {
    /* The band reads the graph rather than the events, so a retirement the
     * census honoured and the argument line ignored would put two counts of one
     * model on one screen. */
    const ledger = makeLedger([
      ...STUDY,
      create("r1", "analytic-residue", "The sister rewrote the form", "data-driven"),
      create("r2", "analytic-residue", "Two wards never used it", "data-driven"),
    ]);
    const band = (events: readonly LedgerEvent[]) =>
      projectArgument({
        graph: projectOntology(events, P),
        trajectory: {
          mutations: { byOrigin: {}, population: 0, modelShare: 0 },
          points: [],
          byOp: {},
          finalResidue: 0,
          residueMonotonicallyShrinking: false,
        },
        tray: {
          projectId: P,
          all: [],
          pending: [],
          rejected: [],
          accepted: [],
          merged: [],
          deferred: [],
        },
        anchoring: { unanchored: [], components: [], stranded: [], pageCount: 0, edgeCount: 0 },
        moves: [],
      } as unknown as Parameters<typeof projectArgument>[0]);

    expect(band(ledger.store).residueCount).toBe(2);
    await retirePage({ projectId: P, pageId: "r2", reason: "it was the same thing twice" }, ledger);
    expect(band(ledger.store).residueCount).toBe(1);
    expect(residueClause(band(ledger.store))).toContain("1 finding sits outside what your ontology can explain");
  });
});

describe("withdrawing a link", () => {
  const LINKED: readonly LedgerEvent[] = [
    ...STUDY,
    relate("e1", "pz", "th", "stands-to", { puzzleRelation: "contradicts" }),
  ];

  test("writes the withdrawal against the edge it names", async () => {
    const ledger = makeLedger(LINKED);
    const out = await withdrawRelation({ projectId: P, from: "pz", to: "th", role: "stands-to" }, ledger);
    expect(out.kind).toBe("recorded");
    expect(out.kind === "recorded" ? out.events[0] : undefined).toMatchObject({
      op: "unrelate",
      edge: { from: "pz", to: "th", role: "stands-to" },
    });
  });

  test("the framing claim leaves the model, so the puzzle is unclaimed again", async () => {
    const ledger = makeLedger(LINKED);
    expect(projectOntology(ledger.store, P).relations.length).toBe(1);
    await withdrawRelation({ projectId: P, from: "pz", to: "th", role: "stands-to" }, ledger);
    const graph = projectOntology(ledger.store, P);
    expect(graph.relations.length).toBe(0);
    // And the door back in is open: the chooser asks again.
    expect(chooserOpens(graph)).toBe(true);
  });

  test("Anti: withdrawing twice writes once, and an absent link writes nothing", async () => {
    const ledger = makeLedger(LINKED);
    await withdrawRelation({ projectId: P, from: "pz", to: "th", role: "stands-to" }, ledger);
    expect(
      await withdrawRelation({ projectId: P, from: "pz", to: "th", role: "stands-to" }, ledger),
    ).toEqual({ kind: "no-change", why: "already withdrawn" });
    expect(
      await withdrawRelation({ projectId: P, from: "pz", to: "ob", role: "stands-to" }, ledger),
    ).toEqual({ kind: "no-change", why: "the link is missing" });
    expect(ledger.store.length).toBe(LINKED.length + 1);
  });
});

describe("an expectation comes from a paper or a prior, never from the data", () => {
  test("a theory block read out of the researcher's material is filed as a resolution", () => {
    // Two of these reached the walk's chooser: "Decaying authority of secondhand
    // description" and "Handover line as operational instruction, not
    // diagnosis". Both are readings of a ward transcript.
    expect(dataPageType("theory")).toBe("candidate-resolution");
  });

  test("Anti: every other page type the data reader proposes is untouched", () => {
    for (const type of [
      "puzzle",
      "observation",
      "analytic-residue",
      "candidate-resolution",
      "rival",
      "scope-condition",
    ] as const) {
      expect({ type, mapped: dataPageType(type) }).toEqual({ type, mapped: type });
    }
  });

  test("the prompt says so, so the model is not silently corrected", async () => {
    const code = await Bun.file(new URL("../src/proposals/extract.ts", import.meta.url).pathname).text();
    expect(code).toContain("Do not propose a theory page");
    expect(code).toContain("files anything that you send as theory as a candidate resolution");
  });

  test("the chooser offers only the expectations somebody held before the study looked", () => {
    const graph = projectOntology(
      [
        create("pz", "puzzle", "Night wards refuse the handover", "data-driven"),
        create("th-paper", "theory", "Handover is a coordination problem", "literature-derived"),
        create("th-mine", "theory", "I expected a decision point", "author-prior"),
        create("th-data", "theory", "Decaying authority of secondhand description"),
      ],
      P,
    );
    expect(pagesOfType(graph, "theory").length).toBe(3);
    expect(expectationsOnOffer(graph).map((p) => p.id).sort()).toEqual(["th-mine", "th-paper"]);
  });

  test("a study whose only theory pages came out of its own data is not asked the question", () => {
    const graph = projectOntology(
      [
        create("pz", "puzzle", "Night wards refuse the handover", "data-driven"),
        create("th-data", "theory", "Decaying authority of secondhand description"),
      ],
      P,
    );
    // Asking here would be the tool inviting the researcher to break their own
    // reading of their own transcript and call it a contribution.
    expect(chooserOpens(graph)).toBe(false);
  });

  test("the theory gloss stays, because after the fix it only lands on a paper's expectation", () => {
    expect(pageTypeGloss("theory")).toBe("what a paper expects here");
  });
});

describe("the silence claim and what it leaves unexplained", () => {
  const SILENT: readonly LedgerEvent[] = [
    create("pz", "puzzle", "Night wards refuse the handover", "data-driven"),
    create("th", "theory", "Handover is a coordination problem", "literature-derived"),
    create("r1", "analytic-residue", "The sister rewrote the form and nobody minded", "data-driven"),
    create("r2", "analytic-residue", "Two wards never used the form at all", "data-driven"),
    relate("e1", "pz", "th", "stands-to", { puzzleRelation: "silent" }),
  ];

  test("the detail names the actual gap rather than denying there is one", () => {
    /* The walk read "Nothing here is left unexplained, and a silence that
     * explains everything is not a reason to run a study" three inches under a
     * band saying "Your account cannot explain 2 things". The check counts
     * residues linked to the puzzle, and nothing linked them. */
    const graph = projectOntology(SILENT, P);
    const owed = checkObligation(graph, "pz", "th", "silent");
    expect(owed.discharged).toBe(false);
    expect(owed.detail).toBe(
      "Your ontology contains 2 unexplained things, but none is linked to this puzzle. Link one.",
    );
  });

  test("one loose residue is named in the singular, and asked for in the singular", () => {
    const graph = projectOntology(SILENT.filter((e) => (e as { targetId: string }).targetId !== "r2"), P);
    expect(checkObligation(graph, "pz", "th", "silent").detail).toBe(
      "Your ontology contains 1 unexplained thing, but it is not linked to this puzzle. Link it.",
    );
  });

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("Anti: a study with nothing unexplained keeps the sentence it had", () => {
    const graph = projectOntology(
      SILENT.filter((e) => !["r1", "r2"].includes((e as { targetId: string }).targetId)),
      P,
    );
    expect(checkObligation(graph, "pz", "th", "silent").detail).toBe(
      "Your ontology explains everything here, so the papers' silence leaves you without a reason to run the project",
    );
  });

  test("attaching one discharges the obligation, and the panel stops offering it", async () => {
    const ledger = makeLedger(SILENT);
    const before = projectOntology(ledger.store, P);
    expect(silentPuzzleId(before)).toBe("pz");
    expect(residuesOnSilence(before).size).toBe(0);

    const out = await relatePages(
      { projectId: P, from: "r1", to: "pz", role: "tensions-with" },
      ledger,
    );
    expect(out.kind).toBe("recorded");

    const after = projectOntology(ledger.store, P);
    expect([...residuesOnSilence(after)]).toEqual(["r1"]);
    const owed = checkObligation(after, "pz", "th", "silent");
    expect(owed.discharged).toBe(true);
    expect(owed.detail).toBe("You have 1 thing the papers leave unexplained");
  });

  test("Anti: the framing link is chosen, not asserted, so this writer refuses it", async () => {
    const ledger = makeLedger(SILENT);
    const out = await relatePages({ projectId: P, from: "pz", to: "th", role: "stands-to" }, ledger);
    expect(out.kind).toBe("rejected");
    expect(ledger.store.length).toBe(SILENT.length);
  });

  test("Anti: linking the same pair twice writes once, and a retired claim cannot be linked", async () => {
    const ledger = makeLedger(SILENT);
    await relatePages({ projectId: P, from: "r1", to: "pz", role: "tensions-with" }, ledger);
    expect(
      await relatePages({ projectId: P, from: "r1", to: "pz", role: "tensions-with" }, ledger),
    ).toEqual({ kind: "no-change", why: "already linked" });
    await retirePage({ projectId: P, pageId: "r2", reason: "it was the same thing twice" }, ledger);
    expect(
      await relatePages({ projectId: P, from: "r2", to: "pz", role: "tensions-with" }, ledger),
    ).toEqual({ kind: "no-change", why: "one end of the link is not a live claim" });
  });

  test("no silence claim, no control", () => {
    // The panel offers the attachment only where there is something to attach
    // to, so it is never a button with nothing to do.
    const graph = projectOntology(
      SILENT.map((e) =>
        (e as { op: string }).op === "relate"
          ? ({ ...e, puzzleRelation: "contradicts" } as LedgerEvent)
          : e,
      ),
      P,
    );
    expect(silentPuzzleId(graph)).toBeNull();
    expect(residuesOnSilence(graph).size).toBe(0);
  });
});
