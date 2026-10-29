/**
 * What the claims table measures, and what fills the data bucket (D30, M43c).
 *
 * Two halves of one complaint from the walk of 2026-09-13, both about the
 * researcher's own material going unrecorded on the page that reads their model
 * back to them.
 *
 * The column. Every one of the forty-one claims read "ANCHORED: no", including
 * the ten drafted from the six documents, whose bodies cite those documents by
 * passage id. The five reading "yes" were exactly the five with a link, because
 * `views/anchoring.ts` counts neighbours and the column was named for evidence.
 * So the column is headed "Linked" now, in the same words the map's frames use
 * for the negative, and the fact the reader was looking for has a column of its
 * own beside it.
 *
 * The census. "41 claims: 0 yours, 5 from the papers, 0 from the data, 36 from
 * the language model", on a study of six documents, twelve passages and eleven
 * claims citing them. `data-driven` had no writer anywhere in `src`: every
 * extractor draft accepted into the model was stamped `model-proposed`, so the
 * one bucket a qualitative study exists to fill could not be reached. The data
 * reader's drafts carry the stamp now, on the same ground the paper reader's
 * carry `literature-derived`, and the gate is a cited passage.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LedgerEvent, PageType, ProposalEvent } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages } from "../src/ontology/schema.ts";
import { censusRead, LIVE_PAGES, originCensus } from "../src/ontology/attribution.ts";
import {
  adjudicateProposal,
  resetAdjudicationInFlight,
} from "../src/proposals/adjudicate.ts";
import { extractProposals } from "../src/proposals/extract.ts";
import type { CompleteResult, InferenceClient } from "../src/inference/types.ts";
import type { Chunk } from "../src/state/chunks.ts";

import type { OriginDoubt } from "../src/ontology/originAudit.ts";
import { projectAnchoring } from "../src/views/anchoring.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const PROJECT = "99999999-4444-4444-8444-999999999999";
let clock = 2_300_000_000_000;

function env(actor: "human" | `persona:${string}` = "human") {
  clock += 1000;
  const base = { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT };
  return actor.startsWith("persona:")
    ? { ...base, model: "claude-sonnet-5", modelVersion: "claude-sonnet-5" }
    : base;
}

function makeLedger(initial: LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      store.push(...events);
    },
    readEvents: async () => [...store],
  };
}

function chunk(id: string, kind: Chunk["kind"] = "transcript"): Chunk {
  return { id, projectId: PROJECT, documentId: `doc-${id}`, kind, index: 0, text: `passage ${id}` };
}

function client(text: string): InferenceClient {
  return {
    complete: async (): Promise<CompleteResult> => ({
      text,
      model: "claude-sonnet-5",
      modelVersion: "claude-sonnet-5",
    }),
  } as InferenceClient;
}

beforeEach(() => {
  resetAdjudicationInFlight();
});

describe("a claim the data reader drafted (D30)", () => {
  test("the draft says which origin its accept should stamp", async () => {
    const result = await extractProposals(
      {
        projectId: PROJECT,
        chunks: [chunk("c1"), chunk("c2")],
        now: () => clock,
        makeId: () => crypto.randomUUID(),
      },
      client(
        [
          "TYPE: observation",
          "TITLE: Introduced founders get longer office-hours slots",
          "BODY: Daniel Kim's log shows 21 minutes against 13. [[chunk:c1]]",
        ].join("\n"),
      ),
    );
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0]?.originOnAccept).toBe("data-driven");
    // And the event the tray will read is a valid one.
    expect(validateEvent(result.proposals[0] as ProposalEvent)).toEqual([]);
  });

  test("a draft that cites nothing carries no stamp, so it stays the model's", async () => {
    const result = await extractProposals(
      {
        projectId: PROJECT,
        chunks: [chunk("c1")],
        now: () => clock,
        makeId: () => crypto.randomUUID(),
      },
      client(
        [
          "TYPE: observation",
          "TITLE: Mentors substituted room performance",
          "BODY: No passage is named here at all.",
        ].join("\n"),
      ),
    );
    expect(result.proposals[0]?.sourceChunks).toEqual([]);
    expect(result.proposals[0]?.originOnAccept).toBeUndefined();
  });

  test("accepting it stamps the claim 'from the data', and the census says so", async () => {
    const drafted: LedgerEvent = {
      ...env("persona:extractor"),
      type: "proposal",
      proposalId: "p-data",
      pageType: "observation",
      title: "Uniform pages stop mentors from reading them",
      body: "Olivia, Ravi and Chloe's memo all say so. [[chunk:c1]]",
      sourceChunks: ["c1"],
      originOnAccept: "data-driven",
    } as LedgerEvent;
    const fromAnswer: LedgerEvent = {
      ...env("persona:drafter"),
      type: "proposal",
      proposalId: "p-answer",
      pageType: "observation",
      title: "Shift keyed to mentor's reading dose",
      body: "From what you said at Process.",
      sourceChunks: [],
    } as LedgerEvent;
    const ledger = makeLedger([drafted, fromAnswer]);
    await adjudicateProposal({ projectId: PROJECT, proposalId: "p-data", disposition: "accept" }, ledger);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "p-answer", disposition: "accept" },
      ledger,
    );

    const pages = livePages(projectOntology(ledger.store, PROJECT));
    const fromData = pages.find((p) => p.title.startsWith("Uniform pages"));
    const fromTalk = pages.find((p) => p.title.startsWith("Shift keyed"));
    expect(fromData?.origin).toBe("data-driven");
    // A claim the tool wrote out of the researcher's answer is still the model's:
    // an answer is a conversation, not material, and the census must not read a
    // study's talk as its evidence.
    expect(fromTalk?.origin).toBe("model-proposed");
    expect(censusRead(originCensus(pages, LIVE_PAGES))).toBe(
      "2 claims: 1 from the data, 1 AI-suggested",
    );
  });

  test("the ledger refuses the stamp on a draft that cites nothing, or on an expectation", () => {
    const base = {
      ...env("persona:extractor"),
      type: "proposal" as const,
      proposalId: "p-bad",
      title: "An expectation read out of my own transcript",
      body: "No.",
    };
    const uncited = validateEvent({
      ...base,
      pageType: "observation",
      sourceChunks: [],
      originOnAccept: "data-driven",
    } as ProposalEvent);
    expect(uncited.join(" ")).toContain("requires a cited passage");

    const expectation = validateEvent({
      ...base,
      pageType: "theory",
      sourceChunks: ["c1"],
      originOnAccept: "data-driven",
    } as ProposalEvent);
    expect(expectation.join(" ")).toContain("does not apply to a theory page");
  });
});

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel left with it; superseded: "the row says it is attached to nothing, and says what it cites"
  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel left with it; superseded: "a claim citing no passage says so rather than printing a nought"

describe("the shipped example's own census (D30)", () => {
  const fixture: {
    readonly projectId: string;
    readonly events: readonly LedgerEvent[];
  } = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/coldharbour-model.json"), "utf8"));

  test("the nine claims the data reader drafted are stamped data-driven on a replay", async () => {
    /* The fixture is the record as the walk wrote it, so its accepted extractor
     * drafts carry no `originOnAccept`: the field did not exist when they were
     * staged, and a ledger appends rather than rewrites. What is checked is that
     * the door now stamps them, by replaying those nine drafts through it. The
     * study on disk keeps the origins it was written with, which is what an
     * append-only record means and is why this reads the events rather than the
     * example's own claims. */
    const props = fixture.events.filter(
      (e) => e.type === "proposal" && e.actor === "persona:extractor",
    );
    const accepted = new Set(
      fixture.events
        .filter((e) => e.type === "proposal-adjudication" && e.disposition === "accept")
        .map((e) => (e as { proposalId: string }).proposalId),
    );
    const cited = props.filter(
      (e) =>
        accepted.has((e as { proposalId: string }).proposalId) &&
        (e as { sourceChunks: readonly string[] }).sourceChunks.length > 0,
    );
    expect(cited.length).toBe(9);

    const ledger = makeLedger(
      cited.map((e) => ({
        ...(e as object),
        projectId: PROJECT,
        originOnAccept: "data-driven",
      })) as LedgerEvent[],
    );
    for (const e of cited) {
      await adjudicateProposal(
        {
          projectId: PROJECT,
          proposalId: (e as { proposalId: string }).proposalId,
          disposition: "accept",
        },
        ledger,
      );
    }
    const pages = livePages(projectOntology(ledger.store, PROJECT));
    expect(pages.length).toBe(9);
    expect(new Set(pages.map((p) => p.origin))).toEqual(new Set(["data-driven"]));
    expect(censusRead(originCensus(pages, LIVE_PAGES))).toBe("9 claims: 9 from the data");
  });
});
