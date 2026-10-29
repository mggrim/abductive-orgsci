/**
 * Attaching an observation to the claim it is evidence for (D29, M44).
 *
 * The defect, open since the Gleanline walk and logged again on 2026-09-13 as the
 * leg C item the researcher minded most. Links arose from the expectation chooser
 * and from "Add a rival" and from nothing else, so thirty-six of forty-one claims
 * read LINKS: none, five of the seven map frames read "attached to nothing", and
 * the band at the top of Your model said "none of your 13 observations is attached
 * to this puzzle" with no control anywhere that would attach one.
 *
 * The control is narrow by the owner's decision: one role, `evidences`, and the two
 * kinds of claim an obligation counts evidence for. The reasoning is written at
 * `takesEvidence` in `ontology/relations.ts`, and the first test here pins it,
 * because the temptation next time will be to generalise a picker that works.
 *
 * The last block is the shipped example. It is what makes the price honest: the
 * sentence the band prints moves from naming the study's loose observations to
 * counting the ones the researcher attached and the documents behind them.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import {
  attachOffer,
  checkObligation,
  chunkDocuments,
  observationsOnOffer,
  takesEvidence,
} from "../src/ontology/relations.ts";
import { relatePages, resetAdjudicationInFlight } from "../src/proposals/adjudicate.ts";


const ROOT = new URL("../", import.meta.url).pathname;
const PROJECT = "55555555-4444-4444-8444-555555555555";
let seq = 0;

function create(
  id: string,
  type: PageType,
  title: string,
  chunks: readonly string[] = [],
): LedgerEvent {
  seq += 1;
  return {
    id: crypto.randomUUID(),
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    origin: type === "theory" ? "literature-derived" : "data-driven",
    title,
    body: "b",
    supportingChunks: chunks,
  } as LedgerEvent;
}

function relate(from: string, to: string, role: string, claim?: string): LedgerEvent {
  seq += 1;
  return {
    id: crypto.randomUUID(),
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "relate",
    targetId: crypto.randomUUID(),
    edge: { from, to, role },
    /* The framing edge carries which of the four claims it makes, which the
     * ledger requires on this role and the projection needs before the band has
     * an obligation to read. */
    ...(claim === undefined ? {} : { puzzleRelation: claim }),
    origin: "author-prior",
  } as LedgerEvent;
}

function makeLedger(initial: readonly LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      store.push(...events);
    },
    readEvents: async () => [...store],
  };
}

/** The walk's own shape: a framed puzzle and three loose observations. */
const MODEL = [
  create("pz", "puzzle", "Uniform pages stop mentors from reading them"),
  create("th", "theory", "Initial position compounds absent a structural change"),
  relate("pz", "th", "stands-to", "contradicts"),
  create("ob1", "observation", "Introduced founders get longer office-hours slots", [
    "c1",
    "c2",
    "c3",
  ]),
  create("ob2", "observation", "Ravi runs office hours with the laptop closed", ["c4"]),
  create("ob3", "observation", "Hannah Foster keeps two documents each week", []),
  create("cr1", "candidate-resolution", "Tool removed writing as a signal"),
];

const DOCS = chunkDocuments([
  { id: "c1", documentId: "slot-log" },
  { id: "c2", documentId: "fieldnote-w4" },
  { id: "c3", documentId: "slack" },
  { id: "c4", documentId: "fieldnote-w4" },
]);

const owes = (events: readonly LedgerEvent[]) =>
  checkObligation(projectOntology(events, PROJECT), "pz", "th", "contradicts", DOCS);

beforeEach(() => {
  resetAdjudicationInFlight();
});

describe("what the picker offers, and what it does not (D29)", () => {
  const graph = projectOntology(MODEL, PROJECT);

  test("only a puzzle or an explanation takes evidence", () => {
    expect(takesEvidence(graph.pages.get("pz")!)).toBe(true);
    expect(takesEvidence(graph.pages.get("cr1")!)).toBe(true);
    // The seven other roles carry no obligation, so no picker offers them.
    expect(takesEvidence(graph.pages.get("th")!)).toBe(false);
    expect(takesEvidence(graph.pages.get("ob1")!)).toBe(false);
  });

  test("the list is the observations not already attached to this claim", () => {
    expect(observationsOnOffer(graph, "pz").map((p) => p.id)).toEqual(["ob1", "ob2", "ob3"]);
    const after = projectOntology([...MODEL, relate("ob1", "pz", "evidences")], PROJECT);
    expect(observationsOnOffer(after, "pz").map((p) => p.id)).toEqual(["ob2", "ob3"]);
    // Attached to one claim is still on offer to another, because bearing on the
    // puzzle and bearing on the explanation are two judgements.
    expect(observationsOnOffer(after, "cr1").map((p) => p.id)).toEqual(["ob1", "ob2", "ob3"]);
  });

  test("each entry says how many passages the observation cites", () => {
    expect(attachOffer(graph.pages.get("ob1")!)).toBe(
      '"Introduced founders get longer office-hours slots" cites 3 passages',
    );
    expect(attachOffer(graph.pages.get("ob2")!)).toBe(
      '"Ravi runs office hours with the laptop closed" cites 1 passage',
    );
    expect(attachOffer(graph.pages.get("ob3")!)).toBe(
      `"Hannah Foster keeps two documents each week" doesn't cite a passage yet`,
    );
  });
});

describe("the attach, and what the record says about it (D29)", () => {
  test("one evidences edge, written as the researcher's act", async () => {
    const ledger = makeLedger(MODEL);
    const outcome = await relatePages(
      { projectId: PROJECT, from: "ob1", to: "pz", role: "evidences" },
      ledger,
    );
    expect(outcome.kind).toBe("recorded");
    const written = ledger.store.at(-1) as {
      op: string;
      actor: string;
      origin: string;
      edge: { from: string; to: string; role: string };
    };
    expect(written.op).toBe("relate");
    expect(written.actor).toBe("human");
    expect(written.origin).toBe("author-prior");
    expect(written.edge).toEqual({ from: "ob1", to: "pz", role: "evidences" });
    expect(validateEvent(written)).toEqual([]);
    // Twice is once: the second press finds the link already there.
    expect(
      (await relatePages({ projectId: PROJECT, from: "ob1", to: "pz", role: "evidences" }, ledger))
        .kind,
    ).toBe("no-change");
    expect(ledger.store.filter((e) => e.type === "ontology-mutation" && e.op === "relate").length)
      .toBe(2);
  });

  test("the framing link still refuses to come through this door", async () => {
    const ledger = makeLedger(MODEL);
    const refused = await relatePages(
      { projectId: PROJECT, from: "pz", to: "th", role: "stands-to" },
      ledger,
    );
    expect(refused.kind).toBe("rejected");
  });

  test("the owes-check counts the attachment and the documents behind it", async () => {
    const ledger = makeLedger(MODEL);
    expect(owes(ledger.store).detail).toContain(
      "Your ontology has 3 observations, and you have attached none of those observations to this puzzle",
    );
    await relatePages({ projectId: PROJECT, from: "ob1", to: "pz", role: "evidences" }, ledger);
    expect(owes(ledger.store).detail).toBe(
      "You have attached one observation to this puzzle, and one instance reads as an unusual case",
    );
    await relatePages({ projectId: PROJECT, from: "ob2", to: "pz", role: "evidences" }, ledger);
    const full = owes(ledger.store);
    // Three documents, because the first observation cites the slot log, the
    // week-four fieldnote and the Slack line.
    expect(full.detail).toBe("You have 2 observations across 3 documents");
    expect(full.discharged).toBe(true);
  });
});

describe("the shipped example's own sentence moves (D29)", () => {
  const fixture: {
    readonly projectId: string;
    readonly events: readonly LedgerEvent[];
    readonly chunks: readonly { readonly id: string; readonly documentId: string }[];
  } = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/coldharbour-model.json"), "utf8"));

  test("attaching two of the study's observations discharges what the claim owes", async () => {
    const ledger = makeLedger(fixture.events);
    const graph = projectOntology(ledger.store, fixture.projectId);
    const docs = chunkDocuments(fixture.chunks);
    const claim = graph.relations[0];
    expect(claim).toBeDefined();
    const puzzleId = claim!.puzzleId;

    const before = checkObligation(graph, puzzleId, claim!.theoryId, claim!.relation, docs);
    expect(before.discharged).toBe(false);
    expect(before.detail).toContain("you have attached none of those observations to this puzzle");

    /* The two the picker offers first, and the passages they cite are what the
     * documents clause counts. Attached one at a time, through the door, the way a
     * researcher presses them. */
    const offered = observationsOnOffer(graph, puzzleId);
    expect(offered.length).toBeGreaterThanOrEqual(2);
    const cited = offered.filter((p) => p.supportingChunks.length > 0).slice(0, 2);
    expect(cited.length).toBe(2);
    for (const page of cited) {
      const outcome = await relatePages(
        { projectId: fixture.projectId, from: page.id, to: puzzleId, role: "evidences" },
        ledger,
      );
      expect(outcome.kind).toBe("recorded");
    }

    const after = checkObligation(
      projectOntology(ledger.store, fixture.projectId),
      puzzleId,
      claim!.theoryId,
      claim!.relation,
      docs,
    );
    expect(after.detail).toContain("You have 2 observations");
    expect(after.detail).not.toContain("none of them is attached");
    // And the picker stops offering the two that are now attached.
    const left = observationsOnOffer(
      projectOntology(ledger.store, fixture.projectId),
      puzzleId,
    ).map((p) => p.id);
    for (const page of cited) expect(left).not.toContain(page.id);
  });
});
