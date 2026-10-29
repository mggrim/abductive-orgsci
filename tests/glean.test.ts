/**
 * Drafting from an interview answer (ISC-247 … ISC-259, ISC-265 … ISC-268).
 *
 * The walk that produced these tests is the point. A study was created through
 * the UI, one station was filled, one question was picked and answered with a
 * clear statement of a phenomenon, and the ontology stayed empty — while the
 * page that sold the tool said it builds your model of the phenomenon as you
 * answer. Nothing in 528 passing tests had anything to say about that, because
 * the copy and the wiring were each tested and never tested against each other.
 */

import { describe, expect, test } from "bun:test";
import { isDeclined } from "../src/interview/glean.ts";
import { adjudicateProposal, resetAdjudicationInFlight } from "../src/proposals/adjudicate.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages } from "../src/ontology/schema.ts";
import { topicLabel, topicList, modeLabel } from "../src/interview/topicLabel.ts";
import type { InferenceClient } from "../src/inference/types.ts";
import type { LedgerEvent, ProposalEvent } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";

const P = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const TURN = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const PROP = "dddddddd-4444-4444-8444-dddddddddddd";

const ANSWER =
  "The outgoing nurse and the incoming nurse both think the handoff went fine, and twelve hours later the chart tells a story neither would recognise. Nobody experiences a moment of disagreement.";

function clientReturning(text: string): InferenceClient {
  return {
    complete: async () => ({ text, model: "test", modelVersion: "1" }),
  } as unknown as InferenceClient;
}

const ONE_PAGE = [
  "TYPE: puzzle",
  "TITLE: Drift nobody notices happening",
  "BODY: Accounts of the same patient diverge across a handoff without either party registering a disagreement. What is unaccounted for is the absence of the moment of conflict, not the divergence itself.",
].join("\n");

describe("what counts as an answer", () => {
  test("Anti: the decline check does not swallow a real answer", () => {
    expect(isDeclined("I don't know")).toBe(true);
    expect(isDeclined("I don't know why the accounts diverge, and that is the puzzle")).toBe(false);
  });
});

describe("editing is authoring, approving is ratifying", () => {
  function ledgerOver(seed: LedgerEvent[]) {
    const store = [...seed];
    return {
      store,
      appendAll: async (evts: readonly LedgerEvent[]) => {
        store.push(...evts);
      },
      readEvents: async () => store,
    };
  }

  const proposal: ProposalEvent = {
    id: "cccccccc-3333-4333-8333-cccccccccccc",
    ts: 1,
    actor: "persona:drafter",
    projectId: P,
    model: "m",
    modelVersion: "1",
    type: "proposal",
    proposalId: PROP,
    pageType: "puzzle",
    title: "Drift nobody notices happening",
    body: "The model's wording.",
    sourceChunks: [],
    sourceTurn: TURN,
  };

  test("accepting as written leaves the page the model's (ISC-256)", async () => {
    resetAdjudicationInFlight();
    const l = ledgerOver([proposal]);
    await adjudicateProposal({ projectId: P, proposalId: PROP, disposition: "accept" }, l);
    const graph = projectOntology(l.store, P);
    expect(livePages(graph)[0]?.origin).toBe("model-proposed");
  });

  test("rewriting it keeps the page the model's, and records the edit (ISC-256)", async () => {
    resetAdjudicationInFlight();
    const l = ledgerOver([proposal]);
    await adjudicateProposal(
      {
        projectId: P,
        proposalId: PROP,
        disposition: "accept",
        edit: { title: "Handoffs that no one experiences as disputed", body: "My own wording, hedged." },
      },
      l,
    );
    const graph = projectOntology(l.store, P);
    // Not author-prior. Editing a draft is not evidence that you held the idea
    // first, and crediting it as such would turn an anchoring artifact into a
    // number someone could put in a methods section.
    expect(livePages(graph)[0]?.origin).toBe("model-proposed");
    expect(livePages(graph)[0]?.title).toBe("Handoffs that no one experiences as disputed");
    const adj = l.store.find((e) => e.type === "proposal-adjudication");
    expect(adj !== undefined && "edited" in adj && adj.edited).toBe(true);
  });

  test("Anti: reflowing whitespace is not recorded as an edit", async () => {
    resetAdjudicationInFlight();
    const l = ledgerOver([proposal]);
    await adjudicateProposal(
      {
        projectId: P,
        proposalId: PROP,
        disposition: "accept",
        edit: { title: "  Drift nobody   notices happening ", body: "The model's\n wording." },
      },
      l,
    );
    const adj = l.store.find((e) => e.type === "proposal-adjudication");
    expect(adj !== undefined && "edited" in adj && adj.edited === true).toBe(false);
  });

  test("the page carries the turn forward, so the page can say where it rests (ISC-251)", async () => {
    resetAdjudicationInFlight();
    const l = ledgerOver([{ ...proposal, pageType: "observation" as const }]);
    await adjudicateProposal({ projectId: P, proposalId: PROP, disposition: "accept" }, l);
    const graph = projectOntology(l.store, P);
    expect(livePages(graph)[0]?.supportingTurn).toBe(TURN);
  });
});

describe("no slug reaches the researcher (ISC-265 … ISC-268)", () => {
  test("station, puzzle and theory topics all read as English", () => {
    // M42: a station topic says which step, because "asking you about context"
    // named neither the step nor the reader's own word for it.
    expect(topicLabel("station:context")).toBe("the Context step");
    expect(topicLabel("puzzle:root")).toBe("the thing that you can't account for");
    expect(topicLabel("theory:expectation")).toBe("whose expectation is at stake");
  });

  test("compound topics lose their ids", () => {
    expect(topicLabel("lint:orphan-construct:page-9")).toBe(// M28 r8: copy. "Construct" is retired vocabulary.
      "a claim without support in your material");
    expect(topicLabel("residue:page-4")).toBe("data your ontology doesn't absorb");
    expect(topicLabel("cell:confirmation:design-brief")).toContain("confirmation");
    expect(topicLabel("cell:confirmation:design-brief")).not.toContain(":");
  });

  test("a list of topics reads as a sentence", () => {
    expect(topicList(["station:context", "puzzle:root"])).toBe(
      "the Context step and the thing that you can't account for",
    );
  });

  test("the turn mode names who is asking", () => {
    // M42: "asking you about context" left the asker unnamed on the one label
    // that sits over the tool's own words.
    expect(modeLabel("interrogation")).toBe("Abductive, asking");
    // M74b, ISC-665: the turn after "Ask me differently" asks differently.
    expect(modeLabel("guidance")).toBe("Abductive, asking differently");
  });

  test("every place a topic is rendered runs it through topicLabel (ISC-295)", async () => {
    // The question turn was translated at M16 and the refusal turn was not, so
    // declining printed `lint:orphan-construct:f3130d8a-…` at the researcher.
    // Found in a screenshot, not by a test, which is the recurring shape.
    const src = await Bun.file(new URL("../src/workbench/Dialogue.tsx", import.meta.url).pathname).text();
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const m of code.matchAll(/label: `([^`]*)`/g)) {
      const label = m[1] ?? "";
      if (!label.includes("topicByEvent") && !label.includes("event.topic")) continue;
      expect(label).toContain("topicLabel(");
    }
  });

  test("Anti: an unknown topic falls back to the slug rather than to a guess", () => {
    expect(topicLabel("something:nobody:mapped")).toBe("something:nobody:mapped");
  });
});
