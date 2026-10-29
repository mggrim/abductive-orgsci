/**
 * The rendering nits from the walk.
 *
 * Small, and each is a sentence a researcher reads. They are together because
 * they share a cause: a frame and the thing it frames, each finishing the
 * sentence, or each counting the same population and disagreeing.
 */

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { endStop, obligationSentence } from "../src/views/argumentModel.ts";
import { checkObligation } from "../src/ontology/relations.ts";
import { projectOntology } from "../src/ontology/projection.ts";

import { ORIGIN_ORDER, originLabel } from "../src/ui/originVocabulary.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const P = "walk-nits";
let n = 0;
const uid = () => `dddddddd-4444-4444-8444-${String((n += 1)).padStart(12, "0")}`;

const create = (id: string, type: string, title: string, origin = "model-proposed"): LedgerEvent =>
  ({
    id: uid(),
    ts: (n += 1),
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    title,
    body: "a body",
    origin,
    supportingChunks: ["c1"],
  }) as LedgerEvent;

const retire = (id: string): LedgerEvent =>
  ({
    id: uid(),
    ts: (n += 1),
    actor: "human",
    projectId: P,
    type: "ontology-mutation",
    op: "retire",
    targetId: id,
    origin: "author-prior",
    reason: "wrong object",
  }) as LedgerEvent;

const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("one sentence, one full stop", () => {
  test("a detail that ends on an instruction is not given a second stop", () => {
    /* The silence obligation ends "Link one.", because it names the act that
     * would discharge it. The frame added its own stop and the screen read
     * "Link one..". */
    const graph = projectOntology(
      [
        create("pz", "puzzle", "Night wards refuse the handover", "data-driven"),
        create("th", "theory", "Handover is a coordination problem", "literature-derived"),
        create("r1", "analytic-residue", "The sister rewrote the form", "data-driven"),
        create("r2", "analytic-residue", "Two wards never used it", "data-driven"),
      ],
      P,
    );
    const owed = checkObligation(graph, "pz", "th", "silent");
    const said = obligationSentence(owed);
    expect(said).toEndWith("Link one.");
    expect(said).not.toContain("..");
  });

  test("a detail that ends on a clause still gets its stop", () => {
    const graph = projectOntology(
      [
        create("pz", "puzzle", "Night wards refuse the handover", "data-driven"),
        create("th", "theory", "Handover is a coordination problem", "literature-derived"),
      ],
      P,
    );
    const said = obligationSentence(checkObligation(graph, "pz", "th", "contradicts"));
    expect(said).toEndWith(".");
    expect(said).not.toContain("..");
  });

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("the helper is the rule, so a new detail cannot reintroduce it", () => {
    expect(endStop("Link one.")).toBe("Link one.");
    expect(endStop("Link one")).toBe("Link one.");
    expect(endStop("  so a single instance looks like an unusual case  ")).toBe(
      "so a single instance looks like an unusual case.",
    );
    expect(endStop("Is it?")).toBe("Is it?");
    expect(endStop("   ")).toBe("");
  });
});

// M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel left with it; superseded: describe("the census under the claims table", () => {

describe("the ordinary version, compared in the reader's words", () => {
  test("the paragraph carries none of the retired vocabulary, in any of its states", async () => {
    /* Walk item 1. It reached the screen as "0 constructs appear in both your
     * ontology and the modal baseline. 15 of yours have no counterpart there …
     * The baseline carries page types yours does not: rival." Six retired words
     * and two epigrams, on a paragraph no copy round had read.
     *
     * Every branch is generated rather than the source scanned, because what a
     * reader meets is the sentence and not the template. */
    const { compareToTwin } = await import("../src/twin/compare.ts");
    const empty = projectOntology([], P);
    const mine = projectOntology(
      [
        create("m1", "puzzle", "Agreement on the handover, disagreement on the patient", "data-driven"),
        create("m2", "observation", "The sister rewrote the form", "data-driven"),
        create("m3", "observation", "Two wards never used the form", "data-driven"),
        create("m4", "observation", "The night list was never read aloud", "data-driven"),
      ],
      P,
    );
    const ordinary = projectOntology(
      [
        create("t1", "puzzle", "Patient identity differently constructed across shifts"),
        create("t2", "rival", "Workload explains the divergence"),
      ],
      P,
    );
    const summaries = [
      compareToTwin(empty, ordinary).summary,
      compareToTwin(mine, empty).summary,
      compareToTwin(mine, ordinary).summary,
      compareToTwin(ordinary, ordinary).summary,
    ];
    expect(summaries.join(" ").length).toBeGreaterThan(300);
    for (const whole of summaries) {
      /* The researcher's own titles are quoted inside the paragraph, and they
       * are theirs: a claim called "Patient identity differently constructed
       * across shifts" must not fail the tool's vocabulary. Only the tool's
       * own words are scanned. */
      const said = whole.replace(/"[^"]*"/g, "");
      for (const word of [
        "construct",
        // M83, ISC-700: "your ontology" is the reader's word now; "your model" is retired.
        "your model",
        "modal",
        "baseline",
        "page type",
        "obligation",
        "counterpart",
      ]) {
        expect({ word, said, present: said.toLowerCase().includes(word) }).toEqual({
          word,
          said,
          present: false,
        });
      }
      // No epigram in final position, and no semicolon splicing one on.
      expect(said).not.toContain("; whether");
      expect(said).not.toContain("worth sitting with");
      expect(whole.trimEnd()).toEndWith(".");
    }
    // A comparison that ran ends on the rule it ran by.
    expect(summaries[2]?.trimEnd()).toEndWith("share most of their words.");
    expect(summaries[3]?.trimEnd()).toEndWith("share most of their words.");
    // And the kinds of claim are named the way the rest of the app names them.
    expect(compareToTwin(mine, ordinary).summary).toContain(
      "kinds of claim that your ontology doesn't: rival, an account that competes with yours.",
    );
  });

  test("it says what counts as the same claim, so a zero is readable", async () => {
    const { compareToTwin, MATCH_RULE } = await import("../src/twin/compare.ts");
    const mine = projectOntology(
      [create("m1", "puzzle", "Agreement on the handover, disagreement on the patient", "data-driven")],
      P,
    );
    const ordinary = projectOntology(
      [create("t1", "puzzle", "Patient identity differently constructed across shifts")],
      P,
    );
    const c = compareToTwin(mine, ordinary);
    expect(c.shared).toEqual([]);
    expect(c.summary).toContain("Each claim in your ontology differs from every claim in the ordinary version.");
    // The rule is on screen beside the count, so nobody has to guess whether
    // the tool looked and disagreed or never looked.
    expect(c.summary).toContain(MATCH_RULE);
    expect(MATCH_RULE).toContain("same kind");
    expect(MATCH_RULE).toContain("share most of their words");
  });

  test("a match is by words and kind, not by the exact title", async () => {
    const { compareToTwin } = await import("../src/twin/compare.ts");
    const mine = projectOntology(
      [create("m1", "puzzle", "Unmarked divergence in who the patient is", "data-driven")],
      P,
    );
    const ordinary = projectOntology(
      [create("t1", "puzzle", "Unmarked divergence in who the patient is now")],
      P,
    );
    const c = compareToTwin(mine, ordinary);
    expect(c.shared.length).toBe(1);
    expect(c.summary).toContain("1 claim says the same thing in both.");
  });

  test("Anti: the same words under a different kind of claim are not the same claim", async () => {
    const { compareToTwin } = await import("../src/twin/compare.ts");
    const title = "Unmarked divergence in who the patient is";
    const mine = projectOntology([create("m1", "puzzle", title, "data-driven")], P);
    const ordinary = projectOntology([create("t1", "observation", title)], P);
    expect(compareToTwin(mine, ordinary).shared).toEqual([]);
  });
});
