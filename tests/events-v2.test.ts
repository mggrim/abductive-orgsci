/**
 * Validation rules for the v2 ledger event types.
 *
 * These tests pin design commitments, not just shapes. Each block below
 * corresponds to a claim in spec-v2.md that would be silently lost if the
 * validation were relaxed:
 *
 *   - attribution is mandatory on every ontology mutation, because the
 *     colonization-vs-discovery measurement needs origin to be knowable
 *     for every element, forever;
 *   - question selection must carry a reason, because choosing what to ask
 *     is a bounding move and an unreasoned one is unauditable;
 *   - rejected proposals must carry a reason, because the rejection is the
 *     signal we are keeping them for;
 *   - puzzle collapse names what it superseded, because collapse is an
 *     event and not a deletion.
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { envelope } from "./helpers.ts";

function ok(candidate: unknown): void {
  expect(validateEvent(candidate)).toEqual([]);
}

function failsWith(candidate: unknown, fragment: string): void {
  const errors = validateEvent(candidate);
  expect(errors.length).toBeGreaterThan(0);
  expect(errors.some((e) => e.includes(fragment))).toBe(true);
}

describe("ontology-mutation", () => {
  const create = () => ({
    ...envelope("human"),
    type: "ontology-mutation",
    op: "create",
    targetId: crypto.randomUUID(),
    pageType: "puzzle",
    origin: "author-prior",
    title: "Directors describe contingent careers despite a formal ladder",
  });

  test("accepts a well-formed page creation", () => {
    ok(create());
  });

  test("rejects a mutation with no origin — attribution is never optional", () => {
    const { origin: _omitted, ...withoutOrigin } = create();
    failsWith(withoutOrigin, "origin must be one of");
  });

  test("rejects an unknown origin", () => {
    failsWith({ ...create(), origin: "vibes" }, "origin must be one of");
  });

  test("requires a page type and title on create", () => {
    const { pageType: _p, title: _t, ...bare } = create();
    const errors = validateEvent(bare);
    expect(errors.some((e) => e.includes("pageType"))).toBe(true);
    expect(errors.some((e) => e.includes("title is required on create"))).toBe(true);
  });

  test("requires a well-formed edge on relate", () => {
    const base = { ...create(), op: "relate", pageType: undefined, title: undefined };
    failsWith(base, "edge is required on relate");
    ok({
      ...base,
      edge: { from: crypto.randomUUID(), to: crypto.randomUUID(), role: "contradicts" },
    });
  });

  test("rejects an edge role outside the argumentative vocabulary", () => {
    failsWith(
      {
        ...create(),
        op: "relate",
        edge: { from: "a", to: "b", role: "related-to" },
      },
      "edge.role must be one of",
    );
  });

  test("accepts all four puzzle relations on a stands-to edge", () => {
    for (const relation of ["contradicts", "instantiates", "exposes", "silent"]) {
      ok({
        ...create(),
        op: "relate",
        pageType: undefined,
        title: undefined,
        edge: { from: crypto.randomUUID(), to: crypto.randomUUID(), role: "stands-to" },
        puzzleRelation: relation,
      });
    }
  });

  /**
   * The framing claim rides on its own edge role. Without this pairing the
   * four relation values get mistaken for argumentative roles — which is
   * exactly the confusion that surfaced while writing the obligation tests.
   */
  test("a puzzle relation on any other role is rejected", () => {
    failsWith(
      {
        ...create(),
        op: "relate",
        pageType: undefined,
        title: undefined,
        edge: { from: "a", to: "b", role: "contradicts" },
        puzzleRelation: "contradicts",
      },
      "requires edge.role 'stands-to'",
    );
  });

  test("a stands-to edge without a relation is rejected — which claim is being made?", () => {
    failsWith(
      {
        ...create(),
        op: "relate",
        pageType: undefined,
        title: undefined,
        edge: { from: "a", to: "b", role: "stands-to" },
      },
      "requires a puzzleRelation",
    );
  });

  test("rejects a puzzle relation attached to an op that cannot assert one", () => {
    failsWith(
      { ...create(), op: "retire", puzzleRelation: "exposes" },
      "puzzleRelation only applies to relate or revise",
    );
  });

  test("retire is a distinct op — there is no delete", () => {
    const ops = validateEvent({ ...create(), op: "delete", pageType: undefined, title: undefined });
    expect(ops.some((e) => e.includes("op must be one of"))).toBe(true);
  });
});

describe("question-selection", () => {
  const select = () => ({
    ...envelope("system"),
    type: "question-selection",
    moveId: "probe-expectation",
    topic: "theory:expectation",
    question: "Who holds an expectation about this setting?",
    alternatives: ["probe-rival", "probe-scope"],
    mode: "interrogation",
    reason: "no theory page carries an expectation for the stated puzzle",
  });

  test("accepts a reasoned selection with alternatives", () => {
    ok(select());
  });

  test("rejects an unreasoned selection — selection is a bounding move", () => {
    failsWith({ ...select(), reason: "  " }, "reason must be non-empty");
  });

  test("mode must be interrogation or guidance, so the ratio stays measurable", () => {
    failsWith({ ...select(), mode: "chat" }, "mode must be");
  });
});

describe("proposal and adjudication", () => {
  const proposal = () => ({
    ...envelope("persona:tavory-timmermans-abduction"),
    type: "proposal",
    proposalId: crypto.randomUUID(),
    pageType: "observation",
    title: "Director frames trajectory as project-to-project",
    sourceChunks: ["chunk-1"],
  });

  test("accepts a model proposal carrying its sources", () => {
    ok(proposal());
  });

  test("a proposal must be either a page or an edge", () => {
    const { pageType: _p, ...neither } = proposal();
    failsWith(neither, "either a pageType or an edge");
  });

  test("rejection requires a reason — the rejection is why we keep it", () => {
    const base = {
      ...envelope("human"),
      type: "proposal-adjudication",
      proposalId: crypto.randomUUID(),
      disposition: "reject",
    };
    failsWith(base, "reason is required on reject and merge");
    ok({ ...base, reason: "conflates two constructs I want held apart" });
  });

  test("merge requires both a reason and a target", () => {
    const base = {
      ...envelope("human"),
      type: "proposal-adjudication",
      proposalId: crypto.randomUUID(),
      disposition: "merge",
      reason: "same construct, different wording",
    };
    failsWith(base, "mergedInto is required on merge");
    ok({ ...base, mergedInto: crypto.randomUUID() });
  });

  test("accept needs no reason", () => {
    ok({
      ...envelope("human"),
      type: "proposal-adjudication",
      proposalId: crypto.randomUUID(),
      disposition: "accept",
    });
  });
});

describe("refusal, redirection, saturation", () => {
  test("all three refusal kinds are legal, including 'I don't know'", () => {
    for (const kind of ["dont-know", "not-now", "wont-answer"]) {
      ok({
        ...envelope("human"),
        type: "refusal",
        questionEventId: crypto.randomUUID(),
        kind,
      });
    }
  });

  test("redirection records where the researcher steered", () => {
    ok({ ...envelope("human"), type: "redirection", toTopic: "the sampling logic instead" });
    failsWith({ ...envelope("human"), type: "redirection", toTopic: "" }, "toTopic must be non-empty");
  });

  test("saturation carries its window so the advisory can be audited", () => {
    ok({
      ...envelope("system"),
      type: "saturation-check",
      mutationsInWindow: 0,
      windowTurns: 8,
      reached: true,
    });
    failsWith(
      { ...envelope("system"), type: "saturation-check", mutationsInWindow: 0, windowTurns: 0, reached: false },
      "windowTurns must be a positive number",
    );
  });
});

describe("puzzle-collapse", () => {
  test("names both what was kept and what was superseded", () => {
    ok({
      ...envelope("human"),
      type: "puzzle-collapse",
      keptPuzzleIds: [crypto.randomUUID()],
      supersededPuzzleIds: [crypto.randomUUID()],
      reason: "the second puzzle turned out to be the same tension seen from the other side",
    });
  });

  test("a collapse that supersedes nothing is not a collapse", () => {
    failsWith(
      {
        ...envelope("human"),
        type: "puzzle-collapse",
        keptPuzzleIds: [crypto.randomUUID()],
        supersededPuzzleIds: [],
        reason: "tidying",
      },
      "supersededPuzzleIds must be a non-empty array",
    );
  });

  test("collapse requires a reason so premature closure can be reviewed", () => {
    failsWith(
      {
        ...envelope("human"),
        type: "puzzle-collapse",
        keptPuzzleIds: [crypto.randomUUID()],
        supersededPuzzleIds: [crypto.randomUUID()],
        reason: "",
      },
      "reason must be non-empty",
    );
  });
});

describe("persona provenance still applies to v2 events", () => {
  test("a model-originated proposal without model metadata is invalid", () => {
    const { model: _m, modelVersion: _v, ...noProvenance } = envelope(
      "persona:tavory-timmermans-abduction",
    ) as Record<string, unknown>;
    failsWith(
      {
        ...noProvenance,
        type: "proposal",
        proposalId: crypto.randomUUID(),
        pageType: "observation",
        title: "x",
        sourceChunks: [],
      },
      "require a non-empty 'model'",
    );
  });
});

describe("replay tolerates the extended union", () => {
  test("every new event type round-trips through validation as a LedgerEvent", () => {
    const events: LedgerEvent[] = [
      {
        ...envelope("human"),
        type: "ontology-mutation",
        op: "create",
        targetId: crypto.randomUUID(),
        pageType: "puzzle",
        origin: "author-prior",
        title: "p",
      } as LedgerEvent,
    ];
    for (const e of events) expect(validateEvent(e)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/*
 * M29 (R1). The fourth origin, and the one rule that keeps it meaningful.
 *
 * "From the papers" is a claim about a theory page. A paper holds an
 * expectation, an expectation is what a theory page is, and an expectation is
 * the only thing a puzzle can break. An observation stamped from the papers is
 * somebody else's argument wearing the clothes of evidence, which is the D5
 * defect one field over; a relation stamped from the papers says a paper chose
 * the researcher's framing for them.
 *
 * The rule is in the validator rather than in a header because a header is what
 * the last four rounds of this codebase's origin defects were written in.
 */
describe("literature-derived is a claim about a theory page (M29)", () => {
  const page = (pageType: string, origin: string) => ({
    ...envelope("human"),
    type: "ontology-mutation",
    op: "create",
    targetId: crypto.randomUUID(),
    pageType,
    origin,
    title: "Handoffs fail when the receiver cannot question the sender",
  });

  test("a theory page may carry it", () => {
    expect(validateEvent(page("theory", "literature-derived"))).toEqual([]);
  });

  test("Anti: no other page type may", () => {
    for (const type of [
      "puzzle",
      "observation",
      "analytic-residue",
      "candidate-resolution",
      "rival",
      "scope-condition",
    ]) {
      expect({
        type,
        errors: validateEvent(page(type, "literature-derived")),
      }).toEqual({
        type,
        errors: ["ontology-mutation.origin 'literature-derived' is only for theory pages"],
      });
      // And the same page with any other origin is fine, so the refusal is
      // about the stamp and not about the page.
      expect({ type, errors: validateEvent(page(type, "author-prior")) }).toEqual({
        type,
        errors: [],
      });
    }
  });

  test("Anti: a relation may not carry it either", () => {
    const relate = {
      ...envelope("human"),
      type: "ontology-mutation",
      op: "relate",
      targetId: crypto.randomUUID(),
      edge: { from: "pz-1", to: "th-1", role: "stands-to" },
      puzzleRelation: "contradicts",
      origin: "literature-derived",
    };
    expect(validateEvent(relate)).toContain(
      "ontology-mutation.origin 'literature-derived' is only for theory pages",
    );
    expect(validateEvent({ ...relate, origin: "author-prior" })).toEqual([]);
  });

  test("a create with no page type at all is refused before the origin rule bites", () => {
    // Vacuity guard. If `pageType` were simply absent the origin rule would
    // pass silently, so the create branch has to be the thing that stops it.
    const { pageType: _dropped, ...bare } = page("theory", "literature-derived");
    const errors = validateEvent(bare);
    expect(errors.some((e) => e.includes("pageType"))).toBe(true);
    expect(errors).toContain(
      "ontology-mutation.origin 'literature-derived' is only for theory pages",
    );
  });
});
