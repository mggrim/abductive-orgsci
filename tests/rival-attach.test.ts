/**
 * A rival that competes with nothing (D34, M43c).
 *
 * What the walk of 2026-09-13 found. "It's the door, not the deck" was in the
 * model with `KIND: rival`, drafted by the material read, and the rivals panel
 * printed "You haven't put up anything that would compete with this" against all
 * four remaining explanations, two of which it plainly competed with. A rival
 * made through "Add a rival" carries `linkOnAccept` and lands attached; one read
 * out of the researcher's own documents carried nothing and landed loose. So the
 * panel was reporting the absence of a rival sitting in the same model.
 *
 * What is held here is the data reader, which names the explanation when the
 * model copies its title, the case where nobody is guessing: the reader read the
 * material and said so. (The rivals panel and its attach offer left with the
 * checks at M89.)
 */

import { describe, expect, test, beforeEach } from "bun:test";
import type { LedgerEvent, PageType } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { adjudicateProposal, resetAdjudicationInFlight } from "../src/proposals/adjudicate.ts";
import { extractProposals } from "../src/proposals/extract.ts";
import type { CompleteResult, InferenceClient } from "../src/inference/types.ts";
import type { Chunk } from "../src/state/chunks.ts";

const PROJECT = "77777777-4444-4444-8444-777777777777";
let seq = 0;

function page(id: string, type: PageType, title: string): LedgerEvent {
  seq += 1;
  return {
    id: `rv-page-${seq}`,
    ts: 1_700_000_000_000 + seq,
    actor: "human",
    projectId: PROJECT,
    type: "ontology-mutation",
    op: "create",
    targetId: id,
    pageType: type,
    origin: "model-proposed",
    title,
    body: "b",
    supportingChunks: [],
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

describe("the data reader names what its rival competes with (D34)", () => {
  function chunk(id: string): Chunk {
    return {
      id,
      projectId: PROJECT,
      documentId: `doc-${id}`,
      kind: "transcript",
      index: 0,
      text: `passage ${id}`,
    };
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

  const EXPLANATIONS = [
    { id: "cr1", title: "Programme's response to an emptied artefact, not tool bias" },
  ];

  async function read(block: readonly string[]) {
    return extractProposals(
      {
        projectId: PROJECT,
        chunks: [chunk("c1")],
        explanations: EXPLANATIONS,
        now: () => 1_700_000_000_000,
        makeId: () => crypto.randomUUID(),
      },
      client(block.join("\n")),
    );
  }

  test("a rival naming an explanation in the model arrives with the link staged", async () => {
    const result = await read([
      "TYPE: rival",
      "TITLE: It's the door, not the deck",
      "COMPETES: Programme's response to an emptied artefact, not tool bias",
      "BODY: Gabriel says the room was always the criterion. [[chunk:c1]]",
    ]);
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0]?.linkOnAccept).toEqual({ to: "cr1", role: "rivals" });
    // The body is not eaten by the new line above it, which is the shape the
    // BODY terminator had to learn.
    expect(result.proposals[0]?.body).toContain("Gabriel says the room");
    expect(result.proposals[0]?.sourceChunks).toEqual(["c1"]);
  });

  test("accepting it draws the rivals edge to the explanation", async () => {
    const drafted = await read([
      "TYPE: rival",
      "TITLE: It's the door, not the deck",
      "COMPETES: Programme's response to an emptied artefact, not tool bias",
      "BODY: Gabriel's own sentence. [[chunk:c1]]",
    ]);
    const ledger = makeLedger([page("cr1", "candidate-resolution", EXPLANATIONS[0]!.title)]);
    await ledger.appendAll(drafted.events);
    await adjudicateProposal(
      {
        projectId: PROJECT,
        proposalId: (drafted.proposals[0] as { proposalId: string }).proposalId,
        disposition: "accept",
      },
      ledger,
    );
    const graph = projectOntology(ledger.store, PROJECT);
    const rival = [...graph.pages.values()].find((p) => p.title === "It's the door, not the deck");
    expect(rival).toBeDefined();
    const edge = [...graph.edges.values()].find(
      (e) => e.role === "rivals" && e.retired !== true && e.from === rival?.id && e.to === "cr1",
    );
    expect(edge).toBeDefined();
  });

  test("a title matching nothing draws no link, and a non-rival never does", async () => {
    const unknown = await read([
      "TYPE: rival",
      "TITLE: A standing bias, not an emergent compensation",
      "COMPETES: An explanation that is not in this model",
      "BODY: Something else entirely. [[chunk:c1]]",
    ]);
    expect(unknown.proposals[0]?.linkOnAccept).toBeUndefined();

    const observation = await read([
      "TYPE: observation",
      "TITLE: Ravi runs office hours with the laptop closed",
      "COMPETES: Programme's response to an emptied artefact, not tool bias",
      "BODY: A printed list, one word per name. [[chunk:c1]]",
    ]);
    expect(observation.proposals[0]?.linkOnAccept).toBeUndefined();
  });

  test("a rival with no COMPETES line is still drafted, and lands loose", async () => {
    const result = await read([
      "TYPE: rival",
      "TITLE: A standing bias, not an emergent compensation",
      "BODY: The criterion was there all along. [[chunk:c1]]",
    ]);
    expect(result.proposals.length).toBe(1);
    expect(result.proposals[0]?.linkOnAccept).toBeUndefined();
  });
});
