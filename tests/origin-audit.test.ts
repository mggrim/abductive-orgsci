/**
 * The provenance column says how far it can be trusted.
 *
 * The defect, and it is on the shipped fixture. `adjudicate.ts` once flipped a
 * page's origin to `author-prior` when the researcher edited a draft before
 * accepting it. The flip was removed and the argument against it is written out
 * in `mutationForAccept`, but removing the code did nothing to the pages already
 * stamped by it, and the ledger is append-only so no migration could. The
 * fixture study therefore holds a page labelled as the researcher's own prior
 * whose body is, character for character, a drafter proposal a few events
 * earlier in the same ledger, and nothing on any screen or in any export said
 * so. Origin is the product's central claim, the memo prints a model share
 * computed from it, and the error runs in the direction that flatters the
 * researcher.
 *
 * What is asserted here is the decision, not just the detector: the tool neither
 * trusts these rows nor silently reclassifies them nor hides them. It says which
 * ones they are, wherever the origin column is read.
 */

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent } from "../src/ledger/events.ts";
import {
  ORIGIN_DOUBT_CLAUSE,
  ORIGIN_DOUBT_FLAG,
  ORIGIN_DOUBT_READS,
  originDoubtCaveat,
  originDoubts,
} from "../src/ontology/originAudit.ts";
import { originLabel } from "../src/ui/originVocabulary.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages } from "../src/ontology/schema.ts";


import {
  censusWritten,
  LIVE_PAGES,
  originCensus,
} from "../src/ontology/attribution.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { buildAgentGraph } from "../src/export/agentGraph.ts";
import { buildDiagramSvg } from "../src/export/diagram.ts";
import { buildWikiFiles } from "../src/export/wikiDirectory.ts";

/** Rendered text with the markup taken out, which is what a reader gets. */
function text(markup: string): string {
  return markup.replace(/<[^>]*>/g, " ");
}

const PROJECT_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
let clock = 2_600_000_000_000;
function env(actor = "human") {
  clock += 1000;
  const base = { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT_ID };
  return actor.startsWith("persona:")
    ? { ...base, model: "claude", modelVersion: "test-1.0" }
    : base;
}

const DRAFTED_BODY =
  "The two nurses agreed about the handoff itself and disagreed about the patient.";

const EVENTS = [
  // The model drafts a page.
  {
    ...env("persona:drafter"),
    type: "proposal",
    proposalId: "pr-1",
    title: "Agreement about the handoff, disagreement about the patient",
    body: DRAFTED_BODY,
    pageType: "observation",
    sourceChunks: [],
  },
  // And the ontology holds a page with that body stamped as the researcher's
  // own prior. This is the shape the removed flip produced.
  {
    ...env(),
    type: "ontology-mutation",
    op: "create",
    targetId: "pg-doubted",
    pageType: "observation",
    title: "Agreement about the handoff, disagreement about the patient",
    // Reflowed, because `wasEdited` treats whitespace as not authorship and the
    // detector has to agree with it. A rule that missed a rewrapped paragraph
    // would miss most of the population it exists for.
    body: `The two nurses agreed about the handoff itself\n  and disagreed about the patient.`,
    origin: "author-prior",
    supportingChunks: [],
  },
  // A genuinely model-proposed page. Nothing to doubt: the label is already the
  // honest one.
  {
    ...env(),
    type: "ontology-mutation",
    op: "create",
    targetId: "pg-model",
    pageType: "puzzle",
    title: "Communication-problem framing may be watching the wrong object",
    body: "A different sentence entirely, drafted and accepted as a draft.",
    origin: "model-proposed",
    supportingChunks: [],
  },
  // And a page the researcher really did write, which must stay unmarked. This
  // is the case that makes the detector worth having rather than a blanket
  // warning on every author-prior row.
  {
    ...env(),
    type: "ontology-mutation",
    op: "create",
    targetId: "pg-mine",
    pageType: "theory",
    title: "Handoff as information transfer",
    body: "An account I brought with me from the literature and typed myself.",
    origin: "author-prior",
    supportingChunks: [],
  },
] as unknown as readonly LedgerEvent[];

const GRAPH = projectOntology(EVENTS, PROJECT_ID);

const PROJECT = {
  id: PROJECT_ID,
  title: "Handoffs on the night ward",
  createdAt: clock,
  brief: {
    researchQuestion: "How do patient stories change across the handoff?",
    context: "An acute ward.",
    site: "One hospital.",
    siteRationale: "Access.",
    sampleRationale: "Six nurses.",
    process: "The handover.",
    outcome: "",
    dataType: "ethnographic",
    targetVenue: "A top management journal",
  },
} as unknown as Parameters<typeof buildOntologyMemo>[0]["project"];

describe("origins the ledger contradicts", () => {
  test("it finds the relabelled page and only that one", () => {
    const doubts = originDoubts(EVENTS, PROJECT_ID);
    expect([...doubts.keys()]).toEqual(["pg-doubted"]);
    expect(doubts.get("pg-doubted")?.claimed).toBe("author-prior");
    expect(doubts.get("pg-doubted")?.evidence).toContain("body");
  });

  test("a page the researcher really wrote is left alone", () => {
    // The false positive that would make this feature worse than nothing: a
    // blanket caveat on every author-prior row tells the researcher their own
    // writing might not be theirs, which is both wrong and insulting.
    expect(originDoubts(EVENTS, PROJECT_ID).has("pg-mine")).toBe(false);
  });

  test("a model-proposed page is never doubted, because its label is already honest", () => {
    expect(originDoubts(EVENTS, PROJECT_ID).has("pg-model")).toBe(false);
  });

  test("a study with no proposals has nothing to compare against and reports nothing", () => {
    // The intended end state. Every study created after the flip was removed
    // should produce an empty map, so this is a reader for historical data and
    // not a permanent feature of the model.
    const clean = EVENTS.filter((e) => e.type !== "proposal");
    expect(originDoubts(clean, PROJECT_ID).size).toBe(0);
  });

  test("another study's drafts are not evidence about this one", () => {
    const scoped = originDoubts(
      EVENTS.map((e) => (e.type === "proposal" ? { ...e, projectId: "elsewhere" } : e)),
      PROJECT_ID,
    );
    expect(scoped.size).toBe(0);
  });
});

const DOUBTS = originDoubts(EVENTS, PROJECT_ID);
const DOUBTED_IDS = new Set(DOUBTS.keys());


/**
 * React escapes an apostrophe in rendered markup, and M42 put one in the caveat
 * ("cannot vouch" became "can't vouch"). The assertions below are about the
 * words a reader meets, so they read the markup with that one entity decoded
 * rather than matching the entity, which no reader sees.
 */
const readable = (html: string): string => html.replaceAll("&#x27;", "'");

// M63, the lead's rulings of 2026-09-30: the old model tab's OntologyGraphView, GraphKey, panel left with it; superseded: describe("the doubt is stated wherever the origin is read", () => {

// ---------------------------------------------------------------------------

/*
 * M29. The premise this module was written on is now false in two places, on
 * purpose, and the reader had to learn about it.
 *
 * Its header said: "accepting one always writes `model-proposed`, so there is
 * no legitimate path by which a page stamped anything else ends up with a body
 * identical to a proposal in the same ledger." R3 opened two. An expectation
 * drawn out of a named paper accepts as `literature-derived`; a framing
 * relation chosen among four shown side by side accepts as `author-prior`.
 * Both are drafts by construction, both are honestly labelled, and doubting
 * them would have drawn the unvouched bar across every claim a researcher took
 * from a paper.
 */
describe("a draft that declared its own stamp is not doubted (M29)", () => {
  const BODY = "It expects the receiving clinician to be able to question the sender.";
  const TITLE = "Handoffs fail when the receiver cannot question the sender";

  function ledger(origin: string, declared: string | undefined): readonly LedgerEvent[] {
    return [
      {
        ...env("persona:reader"),
        type: "proposal",
        proposalId: "pr-lit",
        pageType: "theory",
        title: TITLE,
        body: BODY,
        sourceChunks: ["p1"],
        ...(declared === undefined ? {} : { originOnAccept: declared }),
      },
      {
        ...env(),
        type: "ontology-mutation",
        op: "create",
        targetId: "pg-lit",
        pageType: "theory",
        title: TITLE,
        body: BODY,
        origin,
        supportingChunks: ["p1"],
      },
    ] as unknown as readonly LedgerEvent[];
  }

  test("an expectation from a paper carries no doubt", () => {
    const doubts = originDoubts(ledger("literature-derived", "literature-derived"), PROJECT_ID);
    expect([...doubts.keys()]).toEqual([]);
  });

  test("Anti: the same page stamped as the researcher's own still is doubted", () => {
    // The draft declared "from the papers" and the page claims "yours", so the
    // ledger contradicts the stamp exactly as it always did.
    const doubts = originDoubts(ledger("author-prior", "literature-derived"), PROJECT_ID);
    expect([...doubts.keys()]).toEqual(["pg-lit"]);
    expect(doubts.get("pg-lit")?.claimed).toBe("author-prior");
  });

  test("Anti: a stamp no draft declared is doubted, which is the historical defect", () => {
    const doubts = originDoubts(ledger("literature-derived", undefined), PROJECT_ID);
    expect([...doubts.keys()]).toEqual(["pg-lit"]);
  });

  test("and the ordinary case is untouched", () => {
    // The fixture at the top of this file, which is the shape the removed flip
    // produced. Nothing about M29 may make that row go quiet.
    expect(DOUBTED_IDS.has("pg-doubted")).toBe(true);
    expect(DOUBTED_IDS.has("pg-mine")).toBe(false);
    expect(DOUBTED_IDS.has("pg-model")).toBe(false);
  });
});
