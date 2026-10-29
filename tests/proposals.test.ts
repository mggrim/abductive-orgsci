/**
 * Proposals tray: staging, retained rejections, near-duplicate handling, and
 * the anti-criterion that nothing unadjudicated reaches the ontology
 * (ISC-54 … ISC-58).
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { livePages } from "../src/ontology/schema.ts";
import { projectProposals } from "../src/proposals/projection.ts";
import { findNearDuplicate, findNearDuplicates, titleSimilarity } from "../src/proposals/duplicates.ts";
import {
  adjudicateProposal,
  resetAdjudicationInFlight,
} from "../src/proposals/adjudicate.ts";
import { extractProposals, parseProposalBlocks } from "../src/proposals/extract.ts";
import type { InferenceClient, CompleteResult } from "../src/inference/types.ts";
import type { Chunk } from "../src/state/chunks.ts";

const PROJECT = "proj-proposals";
let clock = 2_000_000_000_000;

function env(actor: "human" | "system" | `persona:${string}` = "human") {
  clock += 1000;
  const base = { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT };
  return actor.startsWith("persona:")
    ? { ...base, model: "claude-sonnet-5", modelVersion: "claude-sonnet-5" }
    : base;
}

function proposal(
  proposalId: string,
  title: string,
  pageType: PageType = "observation",
  chunks: string[] = ["c1"],
): LedgerEvent {
  return {
    ...env("persona:extractor"),
    type: "proposal",
    proposalId,
    pageType,
    title,
    body: `A candidate: ${title}. [[chunk:${chunks[0]}]]`,
    sourceChunks: chunks,
  } as LedgerEvent;
}

function page(targetId: string, pageType: PageType, title: string): LedgerEvent {
  return {
    ...env("human"),
    type: "ontology-mutation",
    op: "create",
    targetId,
    pageType,
    title,
    body: "",
    origin: "author-prior",
    supportingChunks: ["c9"],
  } as LedgerEvent;
}

function makeLedger(initial: LedgerEvent[] = []) {
  const store: LedgerEvent[] = [...initial];
  return {
    store,
    appendAll: async (events: readonly LedgerEvent[]) => {
      for (const e of events) expect(validateEvent(e)).toEqual([]);
      store.push(...events);
    },
    readEvents: async () => [...store],
    now: () => (clock += 1000),
    newId: () => crypto.randomUUID(),
  };
}

class ScriptedClient implements InferenceClient {
  calls = 0;
  constructor(private readonly text: string) {}
  async complete(): Promise<CompleteResult> {
    this.calls += 1;
    return { text: this.text, model: "mock", modelVersion: "mock-1" };
  }
}

function chunk(id: string, text: string): Chunk {
  return { id, projectId: PROJECT, documentId: "doc-1", kind: "transcript", text, index: 0 };
}

beforeEach(() => {
  resetAdjudicationInFlight();
});

// ---------------------------------------------------------------------------

describe("extraction writes proposals, never ontology pages (ISC-54, ISC-57)", () => {
  const RESPONSE = [
    "TYPE: observation",
    "TITLE: Director declines a named role on the crew list",
    "BODY: The director describes refusing the credit outright. [[chunk:c1]]",
    "---",
    "TYPE: analytic-residue",
    "TITLE: Producer keeps the relationships across films",
    "BODY: Does not fit the project-as-firm reading. [[chunk:c2]]",
  ].join("\n");

  test("only proposal and attention events are produced", async () => {
    const client = new ScriptedClient(RESPONSE);
    const result = await extractProposals(
      { projectId: PROJECT, chunks: [chunk("c1", "one"), chunk("c2", "two")] },
      client,
    );
    expect(result.proposals).toHaveLength(2);
    const types = new Set(result.events.map((e) => e.type));
    expect(types).toEqual(new Set(["attention", "proposal"]));
    expect(types.has("ontology-mutation")).toBe(false);
  });

  test("extracted proposals are valid ledger events carrying their sources", async () => {
    const result = await extractProposals(
      { projectId: PROJECT, chunks: [chunk("c1", "one"), chunk("c2", "two")] },
      new ScriptedClient(RESPONSE),
    );
    for (const p of result.proposals) expect(validateEvent(p)).toEqual([]);
    expect(result.proposals[0]?.sourceChunks).toEqual(["c1"]);
    expect(result.proposals[1]?.pageType).toBe("analytic-residue");
  });

  test("a projected tray from extraction alone leaves the ontology empty", async () => {
    const result = await extractProposals(
      { projectId: PROJECT, chunks: [chunk("c1", "one"), chunk("c2", "two")] },
      new ScriptedClient(RESPONSE),
    );
    expect(livePages(projectOntology(result.events, PROJECT))).toHaveLength(0);
    expect(projectProposals(result.events, PROJECT).pending).toHaveLength(2);
  });

  test("malformed blocks are dropped rather than guessed at", () => {
    const parsed = parseProposalBlocks(
      [
        "TYPE: not-a-page-type",
        "TITLE: Nope",
        "BODY: Should be dropped.",
        "---",
        "TITLE: Missing its type",
        "BODY: Also dropped.",
        "---",
        "TYPE: puzzle",
        "TITLE: Kept",
        "BODY: Survives.",
      ].join("\n"),
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.title).toBe("Kept");
  });

  test("no inference call is made when there is nothing to read", async () => {
    const client = new ScriptedClient(RESPONSE);
    const result = await extractProposals({ projectId: PROJECT, chunks: [] }, client);
    expect(client.calls).toBe(0);
    expect(result.proposals).toHaveLength(0);
  });

  test("the extract module contains no ontology-mutation literal (grep probe, ISC-57)", () => {
    const dir = join(import.meta.dir, "..", "src", "proposals");
    const source = readFileSync(join(dir, "extract.ts"), "utf8");
    // Comments may discuss it; code must not construct it.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("ontology-mutation");
  });

  test("only adjudicate.ts may construct an ontology mutation in this directory", () => {
    const dir = join(import.meta.dir, "..", "src", "proposals");
    // Reading mutations is fine — the tray links an accept to the page it
    // produced. Constructing one is the door, and there is exactly one door.
    const constructs = /type:\s*"ontology-mutation"/;
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && f !== "adjudicate.ts")
      .filter((f) => {
        const code = readFileSync(join(dir, f), "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        return constructs.test(code);
      });
    expect(offenders).toEqual([]);
    // And the one door does exist, so the probe is not passing vacuously.
    expect(constructs.test(readFileSync(join(dir, "adjudicate.ts"), "utf8"))).toBe(true);
  });
});

describe("adjudication (ISC-55, ISC-57)", () => {
  test("accepting emits the adjudication and the mutation that realises it", async () => {
    const p = proposal("prop-1", "Director declines a named role");
    const ledger = makeLedger([p]);
    const out = await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "accept" },
      ledger,
    );
    expect(out.kind).toBe("recorded");
    const types = ledger.store.map((e) => e.type);
    expect(types).toContain("proposal-adjudication");
    expect(types).toContain("ontology-mutation");
    expect(livePages(projectOntology(ledger.store, PROJECT))).toHaveLength(1);
  });

  test("an accepted model suggestion stays marked model-proposed forever", async () => {
    const ledger = makeLedger([proposal("prop-1", "Producer holds the relationships")]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "accept" },
      ledger,
    );
    const created = livePages(projectOntology(ledger.store, PROJECT))[0];
    expect(created?.origin).toBe("model-proposed");
  });

  test("rejected proposals persist and are queryable with their reason", async () => {
    const ledger = makeLedger([proposal("prop-1", "Careers are boundaryless here")]);
    await adjudicateProposal(
      {
        projectId: PROJECT,
        proposalId: "prop-1",
        disposition: "reject",
        reason: "that is the literature's word, not the informants'",
      },
      ledger,
    );
    const tray = projectProposals(ledger.store, PROJECT);
    expect(tray.rejected).toHaveLength(1);
    expect(tray.rejected[0]?.reason).toContain("informants");
    expect(tray.pending).toHaveLength(0);
    // And nothing entered the ontology.
    expect(livePages(projectOntology(ledger.store, PROJECT))).toHaveLength(0);
  });

  test("a rejection cannot be quietly overturned by a second adjudication", async () => {
    const ledger = makeLedger([proposal("prop-1", "Careers are boundaryless here")]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "reject", reason: "no" },
      ledger,
    );
    resetAdjudicationInFlight();
    const second = await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "accept" },
      ledger,
    );
    expect(second.kind).toBe("already-adjudicated");
    expect(projectProposals(ledger.store, PROJECT).rejected).toHaveLength(1);
    expect(livePages(projectOntology(ledger.store, PROJECT))).toHaveLength(0);
  });

  test("reject and merge require a reason", async () => {
    const ledger = makeLedger([proposal("prop-1", "X")]);
    const out = await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "reject" },
      ledger,
    );
    expect(out.kind).toBe("rejected");
    expect(ledger.store).toHaveLength(1);
  });

  test("merge requires the page it merges into", async () => {
    const ledger = makeLedger([proposal("prop-1", "X")]);
    const out = await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "merge", reason: "same thing" },
      ledger,
    );
    expect(out.kind).toBe("rejected");
  });

  test("deferring keeps the proposal out of the live queue without deciding it", async () => {
    const ledger = makeLedger([proposal("prop-1", "X")]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "defer" },
      ledger,
    );
    const tray = projectProposals(ledger.store, PROJECT);
    expect(tray.deferred).toHaveLength(1);
    expect(tray.pending).toHaveLength(0);
    expect(tray.rejected).toHaveLength(0);
  });

  test("adjudicating an unknown proposal writes nothing", async () => {
    const ledger = makeLedger([]);
    const out = await adjudicateProposal(
      { projectId: PROJECT, proposalId: "ghost", disposition: "accept" },
      ledger,
    );
    expect(out.kind).toBe("unknown-proposal");
    expect(ledger.store).toHaveLength(0);
  });
});

describe("idempotency (ISC-58)", () => {
  test("two overlapping accepts create one page, not two", async () => {
    const ledger = makeLedger([proposal("prop-1", "Director declines a named role")]);
    const [a, b] = await Promise.all([
      adjudicateProposal({ projectId: PROJECT, proposalId: "prop-1", disposition: "accept" }, ledger),
      adjudicateProposal({ projectId: PROJECT, proposalId: "prop-1", disposition: "accept" }, ledger),
    ]);
    expect(a).toBe(b);
    expect(ledger.store.filter((e) => e.type === "ontology-mutation")).toHaveLength(1);
    expect(livePages(projectOntology(ledger.store, PROJECT))).toHaveLength(1);
  });

  test("a serial second accept is caught by the read-through, not just the in-flight map", async () => {
    const ledger = makeLedger([proposal("prop-1", "Director declines a named role")]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "accept" },
      ledger,
    );
    resetAdjudicationInFlight();
    const second = await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "accept" },
      ledger,
    );
    expect(second.kind).toBe("already-adjudicated");
    expect(ledger.store.filter((e) => e.type === "ontology-mutation")).toHaveLength(1);
  });

  test("distinct proposals are not serialised against each other", async () => {
    const ledger = makeLedger([proposal("prop-1", "One thing"), proposal("prop-2", "Another thing")]);
    await Promise.all([
      adjudicateProposal({ projectId: PROJECT, proposalId: "prop-1", disposition: "accept" }, ledger),
      adjudicateProposal({ projectId: PROJECT, proposalId: "prop-2", disposition: "accept" }, ledger),
    ]);
    expect(livePages(projectOntology(ledger.store, PROJECT))).toHaveLength(2);
  });
});

describe("near-duplicate handling (ISC-56)", () => {
  const existing = page("pg-1", "observation", "Director declines a named role on the crew list");

  test("a near-identical proposal surfaces the existing page for a merge-or-separate call", () => {
    const events = [existing, proposal("prop-1", "Director declines a named role on crew lists")];
    const tray = projectProposals(events, PROJECT);
    const graph = projectOntology(events, PROJECT);
    const dup = findNearDuplicate(tray.pending[0]!, graph);
    expect(dup).not.toBeNull();
    expect(dup?.existingPageId).toBe("pg-1");
    expect(dup?.prompt).toContain("one idea stated twice");
    expect(dup?.prompt).toContain("distinction worth keeping apart");
  });

  test("detection never merges — the graph is untouched by looking", () => {
    const events = [existing, proposal("prop-1", "Director declines a named role on crew lists")];
    const graph = projectOntology(events, PROJECT);
    const before = livePages(graph).length;
    findNearDuplicates(projectProposals(events, PROJECT).pending, graph);
    expect(livePages(projectOntology(events, PROJECT))).toHaveLength(before);
    expect(projectProposals(events, PROJECT).pending).toHaveLength(1);
  });

  test("same wording, different page type, is not a duplicate", () => {
    const events = [existing, proposal("prop-1", "Director declines a named role on the crew list", "rival")];
    const graph = projectOntology(events, PROJECT);
    expect(findNearDuplicate(projectProposals(events, PROJECT).pending[0]!, graph)).toBeNull();
  });

  test("an unrelated proposal produces no prompt", () => {
    const events = [existing, proposal("prop-1", "Financing arrives in discrete tranches")];
    const graph = projectOntology(events, PROJECT);
    expect(findNearDuplicate(projectProposals(events, PROJECT).pending[0]!, graph)).toBeNull();
  });

  test("merging records what it merged into and creates no new page", async () => {
    const ledger = makeLedger([existing, proposal("prop-1", "Director declines a named role on crew lists")]);
    await adjudicateProposal(
      {
        projectId: PROJECT,
        proposalId: "prop-1",
        disposition: "merge",
        reason: "same refusal, different wording",
        mergedInto: "pg-1",
      },
      ledger,
    );
    const tray = projectProposals(ledger.store, PROJECT);
    expect(tray.merged[0]?.mergedInto).toBe("pg-1");
    expect(livePages(projectOntology(ledger.store, PROJECT))).toHaveLength(1);
  });

  test("title similarity behaves on the boundary cases", () => {
    expect(titleSimilarity("Director declines a named role", "Director declines a named role")).toBe(1);
    expect(titleSimilarity("Director declines a role", "Financing arrives in tranches")).toBe(0);
  });
});

describe("tray projection purity", () => {
  test("replaying the same events twice yields deep-equal trays", () => {
    const events = [
      proposal("prop-1", "One"),
      proposal("prop-2", "Two"),
      {
        ...env("human"),
        type: "proposal-adjudication",
        proposalId: "prop-2",
        disposition: "reject",
        reason: "not what the informants said",
      } as LedgerEvent,
    ];
    expect(projectProposals(events, PROJECT)).toEqual(projectProposals(events, PROJECT));
  });

  test("a re-proposal of an adjudicated id does not resurrect it", () => {
    const events = [
      proposal("prop-1", "One"),
      {
        ...env("human"),
        type: "proposal-adjudication",
        proposalId: "prop-1",
        disposition: "reject",
        reason: "no",
      } as LedgerEvent,
      proposal("prop-1", "One, again"),
    ];
    const tray = projectProposals(events, PROJECT);
    expect(tray.pending).toHaveLength(0);
    expect(tray.rejected).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

/*
 * M29 (R3). The proposal door is the only door, so the two acts that are not
 * ratification have to be expressible on a proposal or they cannot happen at
 * all.
 *
 * Until now `mutationForAccept` hard-coded `model-proposed` on every accept and
 * dropped `puzzleRelation` on the floor, which is why no production path could
 * write a `stands-to` relation: the ledger requires the relation on that role
 * and the only thing allowed to construct a mutation could not carry it.
 */
describe("what an accept is allowed to stamp (M29, R3)", () => {
  function theoryFromPaper(proposalId: string, title: string): LedgerEvent {
    return {
      ...env("persona:reader"),
      type: "proposal",
      proposalId,
      pageType: "theory",
      title,
      body: `What the paper expects. [[chunk:p1]]`,
      sourceChunks: ["p1"],
      originOnAccept: "literature-derived",
    } as LedgerEvent;
  }

  function standsTo(
    proposalId: string,
    relation: "contradicts" | "instantiates" | "exposes" | "silent",
    chosen: boolean,
  ): LedgerEvent {
    return {
      ...env("persona:extractor"),
      type: "proposal",
      proposalId,
      edge: { from: "pz-1", to: "th-1", role: "stands-to" },
      puzzleRelation: relation,
      title: "The expectation your setting broke",
      body: "",
      sourceChunks: [],
      ...(chosen ? { originOnAccept: "author-prior" } : {}),
    } as LedgerEvent;
  }

  test("an ordinary accept is still the model's, which is the rule that did not move", async () => {
    const ledger = makeLedger([proposal("prop-1", "Credit travels with the shift")]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "accept" },
      ledger,
    );
    expect(livePages(projectOntology(ledger.store, PROJECT))[0]?.origin).toBe("model-proposed");
  });

  test("accepting an expectation drawn from a paper stamps it from the papers", async () => {
    const ledger = makeLedger([
      theoryFromPaper("prop-1", "Handoffs fail when the receiver cannot question the sender"),
    ]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "accept" },
      ledger,
    );
    const created = livePages(projectOntology(ledger.store, PROJECT))[0];
    expect(created?.origin).toBe("literature-derived");
    expect(created?.type).toBe("theory");
    // The passage the claim came from travels with it.
    expect(created?.supportingChunks).toEqual(["p1"]);
  });

  test("editing the wording does not relabel it, in either direction", async () => {
    // The rule the door was built on. Editing a draft is evidence the frame
    // came from elsewhere, so it never promotes a page to the researcher's own,
    // and it never demotes one that came out of a paper either.
    const ledger = makeLedger([theoryFromPaper("prop-1", "Proximity builds trust")]);
    await adjudicateProposal(
      {
        projectId: PROJECT,
        proposalId: "prop-1",
        disposition: "accept",
        edit: { title: "Trust is built by being in the room", body: "Reworded by the researcher." },
      },
      ledger,
    );
    const created = livePages(projectOntology(ledger.store, PROJECT))[0];
    expect(created?.origin).toBe("literature-derived");
    expect(created?.title).toBe("Trust is built by being in the room");
    const adjudication = ledger.store.find((e) => e.type === "proposal-adjudication");
    expect((adjudication as { edited?: boolean }).edited).toBe(true);
  });

  test("a relation the researcher chose among four is theirs, and carries the claim it makes", async () => {
    const ledger = makeLedger([standsTo("prop-1", "contradicts", true)]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "accept" },
      ledger,
    );
    const mutation = ledger.store.find(
      (e) => e.type === "ontology-mutation" && e.op === "relate",
    ) as { origin: string; puzzleRelation?: string } | undefined;
    expect(mutation?.origin).toBe("author-prior");
    expect(mutation?.puzzleRelation).toBe("contradicts");
    // And the projection reads it back as the motivating claim it is.
    expect(projectOntology(ledger.store, PROJECT).relations[0]?.relation).toBe("contradicts");
  });

  test("a relation the tool recommended is the model's, and still carries the claim", async () => {
    const ledger = makeLedger([standsTo("prop-1", "silent", false)]);
    await adjudicateProposal(
      { projectId: PROJECT, proposalId: "prop-1", disposition: "accept" },
      ledger,
    );
    const mutation = ledger.store.find(
      (e) => e.type === "ontology-mutation" && e.op === "relate",
    ) as { origin: string; puzzleRelation?: string } | undefined;
    expect(mutation?.origin).toBe("model-proposed");
    expect(mutation?.puzzleRelation).toBe("silent");
  });

  test("Anti: an expectation stamp on anything but a theory page is refused", () => {
    // The boundary, one step before the tray. A draft that could not become a
    // valid mutation must not be offered as a button the researcher can press.
    const bad = {
      ...env("persona:reader"),
      type: "proposal",
      proposalId: "prop-bad",
      pageType: "observation",
      title: "Refusals go unlogged",
      body: "From a paper.",
      sourceChunks: ["p1"],
      originOnAccept: "literature-derived",
    };
    expect(validateEvent(bad)).toContain(
      "proposal.originOnAccept 'literature-derived' is only for theory pages",
    );
    // The same page type without the stamp is fine, so the refusal is about the
    // stamp and not about the draft.
    const { originOnAccept: _dropped, ...fine } = bad;
    expect(validateEvent(fine)).toEqual([]);
  });

  test("Anti: a framing edge with no claim on it is refused, and so is a claim on any other role", () => {
    const noRelation = {
      ...env("persona:extractor"),
      type: "proposal",
      proposalId: "prop-x",
      edge: { from: "pz-1", to: "th-1", role: "stands-to" },
      title: "Stands to",
      sourceChunks: [],
    };
    expect(validateEvent(noRelation)).toContain(
      "edge.role 'stands-to' requires a puzzleRelation naming which claim is made",
    );
    const wrongRole = {
      ...env("persona:extractor"),
      type: "proposal",
      proposalId: "prop-y",
      edge: { from: "ob-1", to: "pz-1", role: "evidences" },
      puzzleRelation: "contradicts",
      title: "Evidences",
      sourceChunks: [],
    };
    expect(validateEvent(wrongRole)).toContain(
      "proposal.puzzleRelation requires edge.role 'stands-to'",
    );
  });
});
