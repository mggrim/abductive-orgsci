/**
 * A draft set aside stays on the record and stays decidable (D36, M43c).
 *
 * What the walk of 2026-09-13 found. The researcher pressed "Decide later" on
 * two of the sixty-eight drafts in the tray. Both left the queue and arrived
 * nowhere: they were in no list on the page, their titles were absent from the
 * whole page text, and a full reload did not bring them back. The twenty-six
 * drafts they turned down were all still there, struck through, each with the
 * reason they had typed. So declining kept the draft and deferring lost it,
 * which is the wrong way round for a tool whose claim is that it keeps what you
 * refused.
 *
 * The projection had always kept them. `projectProposals` has carried a
 * `deferred` array since ISC-54 and the tray rendered `pending` and `rejected`.
 * So the fix is two lines of rule and one section of markup, and the checks
 * below are about the rule rather than the markup: a deferred draft survives a
 * replay, and it can still be accepted or turned down afterwards.
 *
 * The two set-aside drafts in the shipped example are the case, read from the
 * real ledger rather than from a hand-built one, because the walk's own record
 * is what the defect was seen on.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";
import { projectProposals } from "../src/proposals/projection.ts";
import {
  adjudicateProposal,
  resetAdjudicationInFlight,
} from "../src/proposals/adjudicate.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const PROJECT = "proj-set-aside";
let clock = 2_100_000_000_000;

function env(actor: "human" | `persona:${string}` = "human") {
  clock += 1000;
  const base = { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT };
  return actor.startsWith("persona:")
    ? { ...base, model: "claude-sonnet-5", modelVersion: "claude-sonnet-5" }
    : base;
}

function proposal(proposalId: string, title: string, pageType: PageType = "observation"): LedgerEvent {
  return {
    ...env("persona:extractor"),
    type: "proposal",
    proposalId,
    pageType,
    title,
    body: `${title}. [[chunk:c1]]`,
    sourceChunks: ["c1"],
  } as LedgerEvent;
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

beforeEach(() => {
  resetAdjudicationInFlight();
});

describe("a draft you set aside (D36)", () => {
  test("is still in the tray's own list after the projection is replayed", async () => {
    const ledger = makeLedger([proposal("p-1", "Uniform pages stop mentors from reading them")]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "p-1", disposition: "defer" },
      ledger,
    );

    const tray = projectProposals(ledger.store, PROJECT);
    expect(tray.pending.map((p) => p.id)).toEqual([]);
    expect(tray.deferred.map((p) => p.id)).toEqual(["p-1"]);
    // And a second replay of the same events answers the same way, which is the
    // half a reload exercises.
    expect(projectProposals([...ledger.store], PROJECT).deferred.length).toBe(1);
  });

  test("can be accepted afterwards, and the claim it becomes carries its title", async () => {
    const ledger = makeLedger([proposal("p-2", "Ravi runs office hours with the laptop closed")]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "p-2", disposition: "defer" },
      ledger,
    );
    const outcome = await adjudicateProposal(
      { projectId: PROJECT, proposalId: "p-2", disposition: "accept" },
      ledger,
    );

    expect(outcome.kind).toBe("recorded");
    const tray = projectProposals(ledger.store, PROJECT);
    expect(tray.deferred.length).toBe(0);
    expect(tray.accepted.map((p) => p.title)).toEqual([
      "Ravi runs office hours with the laptop closed",
    ]);
    // The defer is still on the record in front of the accept. Append-only means
    // the first decision stays readable, not that it cannot be followed.
    const dispositions = ledger.store
      .filter((e) => e.type === "proposal-adjudication")
      .map((e) => (e as { disposition: string }).disposition);
    expect(dispositions).toEqual(["defer", "accept"]);
  });

  test("can be turned down afterwards, with the reason the researcher typed", async () => {
    const ledger = makeLedger([proposal("p-3", "The room as what's left after the tool")]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "p-3", disposition: "defer" },
      ledger,
    );
    await adjudicateProposal(
      {
        projectId: PROJECT,
        proposalId: "p-3",
        disposition: "reject",
        reason: "Ravi-only version of a card I kept",
      },
      ledger,
    );

    const tray = projectProposals(ledger.store, PROJECT);
    expect(tray.deferred.length).toBe(0);
    expect(tray.rejected.map((p) => p.reason)).toEqual([
      "Ravi-only version of a card I kept",
    ]);
  });

  test("an accepted or turned-down draft is still final", async () => {
    const ledger = makeLedger([
      proposal("p-4", "Hannah Foster keeps two documents each week"),
      proposal("p-5", "Mentors stopped reading founder updates within three weeks"),
    ]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "p-4", disposition: "accept" },
      ledger,
    );
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "p-5", disposition: "reject", reason: "duplicate" },
      ledger,
    );

    expect(
      (await adjudicateProposal(
        { projectId: PROJECT, proposalId: "p-4", disposition: "reject", reason: "changed my mind" },
        ledger,
      )).kind,
    ).toBe("already-adjudicated");
    expect(
      (await adjudicateProposal(
        { projectId: PROJECT, proposalId: "p-5", disposition: "accept" },
        ledger,
      )).kind,
    ).toBe("already-adjudicated");
    const tray = projectProposals(ledger.store, PROJECT);
    expect(tray.accepted.length).toBe(1);
    expect(tray.rejected.length).toBe(1);
  });

  test("a second 'Decide later' on the same draft writes nothing", async () => {
    const ledger = makeLedger([proposal("p-6", "Stopping rate noticed, not measured")]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "p-6", disposition: "defer" },
      ledger,
    );
    const again = await adjudicateProposal(
      { projectId: PROJECT, proposalId: "p-6", disposition: "defer" },
      ledger,
    );
    expect(again.kind).toBe("already-adjudicated");
    expect(ledger.store.filter((e) => e.type === "proposal-adjudication").length).toBe(1);
  });
});

describe("the tray renders the set-aside drafts (D36)", () => {
  const source = readFileSync(join(ROOT, "src/workbench/ProposalsTrayView.tsx"), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

  test("the deferred list is drawn, with the same card the queue uses", () => {
    expect(code).toContain("tray.deferred.map((p) => card(p, true))");
    expect(code).toContain("tray.pending.map((p) => card(p, false))");
    expect(code).toContain('data-testid="set-aside-proposals"');
  });

  test("a card already set aside offers no second 'Decide later'", () => {
    expect(code).toContain("{!setAside && (");
  });
});

describe("the shipped example's own two set-aside drafts (D36)", () => {
  const fixture: {
    readonly projectId: string;
    readonly events: readonly LedgerEvent[];
  } = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/coldharbour-model.json"), "utf8"));

  test("both are in the tray's deferred list, by the titles the walk logged", () => {
    const tray = projectProposals(fixture.events, fixture.projectId);
    expect(tray.deferred.map((p) => p.title).sort()).toEqual([
      "Chloe's week-five defense: uniform pages mean the tool is working",
      "Coldharbour Launch is the site, not Pitchwright",
    ]);
    // The walk's own counts, so a fixture that drifts fails here rather than
    // quietly weakening every assertion above it.
    expect(tray.accepted.length).toBe(47);
    expect(tray.rejected.length).toBe(27);
  });
});
