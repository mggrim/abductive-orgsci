/**
 * What the owes-check counts, said in the sentence that reports it (D33, M43c).
 *
 * What the walk of 2026-09-13 read at the top of Your model, with forty-one
 * claims in the model and thirteen of them observations:
 *
 *   That claim owes you a pattern rather than a single instance: at least two
 *   observations from two different documents of your data. You have no such
 *   observations yet, so a single instance looks like an unusual case.
 *
 * The nearest observation to hand, "Introduced founders get longer office-hours
 * slots", cited Daniel Kim's slot log, a week-four fieldnote and Ethan Brooks's
 * Slack line: three documents, not two, and the tool had drafted the card itself
 * out of the researcher's own material with the passage ids in it.
 *
 * The rule is right and does not move. `observationsFor` counts observations
 * joined to this puzzle by an `evidences` edge, and breadth of evidence *for this
 * puzzle* is what a `contradicts` claim owes; an observation sitting in the model
 * attached to nothing has not been offered as evidence of anything. What was
 * wrong is that the sentence reporting it said the researcher had nothing.
 *
 * So the checks below are about the sentence and about the rule staying put. The
 * first two pin the rule; the rest pin which of the three silences the sentence
 * names, and that it names the way out.
 *
 * M89 (2026-10-14): a describe that read the attach control's source (on the
 * Checks flag row and the claim band) went with those files; the sentence still
 * names the attach, and the rule has not moved.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { checkObligation, chunkDocuments } from "../src/ontology/relations.ts";
import { obligationSentence } from "../src/views/argumentModel.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const P = "66666666-4444-4444-8444-666666666666";
let seq = 0;

function create(
  id: string,
  type: PageType,
  title: string,
  chunks: readonly string[] = [],
): LedgerEvent {
  seq += 1;
  return {
    id: `owes-${seq}`,
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    origin: "data-driven",
    title,
    body: "b",
    supportingChunks: chunks,
  } as LedgerEvent;
}

function relate(from: string, to: string, role: string): LedgerEvent {
  seq += 1;
  return {
    id: `owes-edge-${seq}`,
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "relate",
    targetId: `owes-edge-target-${seq}`,
    edge: { from, to, role },
    origin: "author-prior",
  } as LedgerEvent;
}

const FRAMING = [
  create("pz", "puzzle", "Uniform pages stop mentors from reading them"),
  create("th", "theory", "Initial position compounds absent a structural change"),
  relate("pz", "th", "stands-to"),
];

/** The walk's own shape: observations in the model, none of them attached. */
const LOOSE_OBSERVATIONS = [
  ...FRAMING,
  create("ob1", "observation", "Introduced founders get longer office-hours slots", [
    "c1",
    "c2",
    "c3",
  ]),
  create("ob2", "observation", "Ravi runs office hours with the laptop closed", ["c4"]),
  create("ob3", "observation", "Selection Day grants went entirely to introduced founders", ["c5"]),
];

const DOCS = chunkDocuments([
  { id: "c1", documentId: "slot-log" },
  { id: "c2", documentId: "fieldnote-w4" },
  { id: "c3", documentId: "slack" },
  { id: "c4", documentId: "fieldnote-w4" },
  { id: "c5", documentId: "slot-log" },
]);

const owes = (events: readonly LedgerEvent[]) =>
  checkObligation(projectOntology(events, P), "pz", "th", "contradicts", DOCS);

describe("the rule does not move (D33)", () => {
  test("observations in the model, attached to nothing, do not discharge the claim", () => {
    expect(owes(LOOSE_OBSERVATIONS).discharged).toBe(false);
  });

  test("two attached observations from two documents discharge it", () => {
    const attached = [
      ...LOOSE_OBSERVATIONS,
      relate("ob1", "pz", "evidences"),
      relate("ob2", "pz", "evidences"),
    ];
    const result = owes(attached);
    expect(result.discharged).toBe(true);
    // Three documents, because the first observation is the walk's own card that
    // cites Daniel's slot log, the week-four fieldnote and Ethan's Slack line.
    expect(result.detail).toBe("You have 2 observations across 3 documents");
  });
});

describe("what the sentence says (D33)", () => {
  test("with observations in the model but none attached, it counts what is held", () => {
    const result = owes(LOOSE_OBSERVATIONS);
    /* M44: two ways out, and the sentence names both. Attaching one by hand is a
     * control now, on the band and on the claim's own card, so a sentence offering
     * only the question would send the researcher somewhere else to do a thing
     * they can do where they are standing. */
    expect(result.detail).toBe(
      "Your ontology has 3 observations, and you have attached none of those observations to this puzzle. Attach one of those observations to the puzzle yourself, with the control on this flag",
    );
    // And the whole band sentence reads as one thing, with one full stop per
    // clause and none doubled.
    expect(obligationSentence(result)).toBe(
      "That claim owes you a pattern rather than a single instance: at least two observations from two different documents of your data. Your ontology has 3 observations, and you have attached none of those observations to this puzzle. Attach one of those observations to the puzzle yourself, with the control on this flag.",
    );
    // The sentence the walk read is gone.
    expect(result.detail).not.toContain("You have no such observations yet");
  });

  test("with no observation in the model at all, it says that instead", () => {
    const result = owes(FRAMING);
    expect(result.detail).toBe(
      "Observations in your ontology are still to come, so a single instance looks like an unusual case",
    );
  });

  test("with one attached, it says one is attached rather than that one is held", () => {
    const result = owes([...LOOSE_OBSERVATIONS, relate("ob1", "pz", "evidences")]);
    expect(result.detail).toBe(
      "You have attached one observation to this puzzle, and one instance reads as an unusual case",
    );
  });

  test("the heaviest burden says it the same way one row down", () => {
    const result = checkObligation(
      projectOntology(LOOSE_OBSERVATIONS, P),
      "pz",
      "th",
      "exposes",
      DOCS,
    );
    expect(result.discharged).toBe(false);
    expect(result.detail).toContain(
      "you attached your 3 observations to other claims, not to this puzzle",
    );
  });
});

describe("the shipped example's own numbers (D33)", () => {
  const fixture: {
    readonly projectId: string;
    readonly events: readonly LedgerEvent[];
  } = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/coldharbour-model.json"), "utf8"));

  test("the study holds observations and the band would now count them", () => {
    const graph = projectOntology(fixture.events, fixture.projectId);
    const observations = [...graph.pages.values()].filter(
      (p) => !p.retired && p.type === "observation",
    );
    // The walk logged thirteen at the end of its Your model leg, and the example
    // gained more on the leg after it.
    expect(observations.length).toBeGreaterThanOrEqual(13);

    const claim = graph.relations[0];
    expect(claim).toBeDefined();
    const result = checkObligation(
      graph,
      claim!.puzzleId,
      claim!.theoryId,
      claim!.relation,
      chunkDocuments(
        (
          fixture as unknown as {
            chunks: readonly { id: string; documentId: string }[];
          }
        ).chunks,
      ),
    );
    // Whatever the example's state, the sentence never claims the researcher has
    // no observations while the model holds some.
    if (!result.discharged) {
      expect(result.detail).not.toContain("You have no such observations yet");
      expect(result.detail).not.toContain("holds no observations yet");
    }
  });
});
