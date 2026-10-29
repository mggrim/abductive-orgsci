/**
 * ISC-490: a study brought in carries its conversations and drafts intact.
 *
 * M37 puts a conversation at every station, and a conversation is references:
 * a reply points at the turn it answers, a draft points at the turns it was
 * made from, and a saved answer points at the draft it began as. Every one of
 * those is an event id, and an import gives every event a new one.
 *
 * D18 made `remapBundleIds` general rather than field-driven, so the fields
 * M37 adds are covered the day they are added and nothing has to be enumerated
 * again. That is the claim, and a claim about a field that does not exist yet
 * is worth nothing unless it is tested against the shapes that field will take.
 * So this builds a bundle holding all five — two place names that must survive
 * untouched, and three references that must move — and checks each one.
 *
 * The events are plain objects cast to the union. The `brief-draft` member and
 * the `draftedFrom` field land on the conversation branch; the remap does not
 * read the union to do its work, which is the whole point of it, so this can
 * be true before the types are.
 */

import { describe, expect, test } from "bun:test";
import {
  importBundle,
  parseBundle,
  remapBundleIds,
  serializeBundle,
  type BundleStores,
  type ProjectBundle,
} from "../src/export/bundle.ts";
import type { AnomalyCandidate, Chunk, StoredDocument } from "../src/state/chunks.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import type { Project } from "../src/state/projects.ts";
import type { ModalTwin } from "../src/twin/twin.ts";

const PROJECT = "9b1f4c2e-0000-4000-8000-000000000001";
const ASK = "9b1f4c2e-0000-4000-8000-000000000002";
const FIRST_REPLY = "9b1f4c2e-0000-4000-8000-000000000003";
const SECOND_REPLY = "9b1f4c2e-0000-4000-8000-000000000004";
const DRAFT = "9b1f4c2e-0000-4000-8000-000000000005";
const SAVE = "9b1f4c2e-0000-4000-8000-000000000006";

const envelope = (id: string, ts: number) => ({ id, ts, actor: "human", projectId: PROJECT });

/**
 * One conversation at one station, in five events.
 *
 * `station` is a place name on two of them and must come out the other side
 * unchanged: it is the step the turn belongs to, not a record, and a rewritten
 * one would file the conversation under a station that does not exist.
 */
const CONVERSATION: readonly LedgerEvent[] = [
  {
    ...envelope(ASK, 1),
    actor: "persona:eisenhardt-positivist",
    model: "claude",
    modelVersion: "test-1.0",
    type: "question-selection",
    moveId: "station:early-data:0",
    topic: "station:early-data",
    question: "What has your material already shown you that you didn't expect?",
    alternatives: [],
    mode: "interrogation",
    reason: "The step is open and nothing has been said at it.",
    station: "early-data",
  },
  {
    ...envelope(FIRST_REPLY, 2),
    type: "response",
    text: "They keep describing the handover as something that happens to them.",
    station: "early-data",
  },
  {
    ...envelope(SECOND_REPLY, 3),
    type: "response",
    text: "Which surprised me, because I went in expecting a decision.",
    inReplyTo: ASK,
    station: "early-data",
  },
  {
    ...envelope(DRAFT, 4),
    actor: "persona:eisenhardt-positivist",
    model: "claude",
    modelVersion: "test-1.0",
    type: "brief-draft",
    station: "early-data",
    text: "They describe the handover as something that happens to them, which I went in expecting to be a decision.",
    fromTurnIds: [FIRST_REPLY, SECOND_REPLY],
  },
  {
    ...envelope(SAVE, 5),
    type: "bound",
    subject: "early-data",
    statement: "They describe the handover as something that happens to them.",
    draftedFrom: DRAFT,
  },
] as unknown as readonly LedgerEvent[];

const BUNDLE: ProjectBundle = {
  format: "bounds-bundle",
  version: 1,
  project: {
    id: PROJECT,
    title: "night wards",
    stage: "pilot-data",
    createdAt: 1,
    brief: { earlySurprise: "" },
  } as unknown as Project,
  documents: [],
  chunks: [],
  anomalies: [],
  twin: null,
  events: CONVERSATION,
};

/** A deterministic remap, so a failure names the same ids twice running. */
function copy(bundle: ProjectBundle = BUNDLE): ProjectBundle {
  let n = 0;
  return remapBundleIds(bundle, () => `m37-fresh-${(n += 1)}`);
}

/** The event that came out of the one that went in at this position. */
function at(bundle: ProjectBundle, index: number): Record<string, unknown> {
  return bundle.events[index] as unknown as Record<string, unknown>;
}

describe("ISC-490: the conversation's references follow the import", () => {
  const fresh = copy();
  const ids = fresh.events.map((e) => e.id);

  test("every event is given a fresh id, in order", () => {
    expect(ids).toEqual(["m37-fresh-2", "m37-fresh-3", "m37-fresh-4", "m37-fresh-5", "m37-fresh-6"]);
    expect(fresh.project.id).toBe("m37-fresh-1");
  });

  test("a station is a place, not a record, and is not rewritten", () => {
    expect(at(fresh, 0).station).toBe("early-data");
    expect(at(fresh, 0).topic).toBe("station:early-data");
    expect(at(fresh, 1).station).toBe("early-data");
    expect(at(fresh, 2).station).toBe("early-data");
    expect(at(fresh, 3).station).toBe("early-data");
    // Nor is a bound event's subject, which names the station the save was
    // made at rather than a record.
    expect(at(fresh, 4).subject).toBe("early-data");
  });

  test("a reply still points at the turn it answers", () => {
    expect(at(fresh, 2).inReplyTo).toBe(ids[0]);
  });

  test("a draft still points at the turns it was made from", () => {
    expect(at(fresh, 3).fromTurnIds).toEqual([ids[1], ids[2]]);
  });

  test("a saved answer still points at the draft it began as", () => {
    expect(at(fresh, 4).draftedFrom).toBe(ids[3]);
  });

  test("no id the remap replaced survives anywhere in the copy", () => {
    const replaced = [PROJECT, ASK, FIRST_REPLY, SECOND_REPLY, DRAFT, SAVE];
    const text = serializeBundle(fresh);
    expect(replaced.filter((id) => text.includes(id))).toEqual([]);
  });

  test("Anti: the same reads catch a remap that moved only the envelope", () => {
    // The pre-D18 shape, in the one respect that matters: fresh ids on the
    // events and every reference between them left pointing at the old ones.
    const halfDone: ProjectBundle = {
      ...BUNDLE,
      events: BUNDLE.events.map((e, i) => ({ ...e, id: `half-${i}` })),
    };
    expect(at(halfDone, 2).inReplyTo).toBe(ASK);
    expect(at(halfDone, 3).fromTurnIds).toEqual([FIRST_REPLY, SECOND_REPLY]);
    expect(at(halfDone, 4).draftedFrom).toBe(DRAFT);
    expect(serializeBundle(halfDone)).toContain(DRAFT);
  });
});

// ---------------------------------------------------------------------------

/**
 * And the study a co-author actually opens.
 *
 * The Coldharbour bundle is 357 KB and is the only fixture carrying every
 * shape at once. It is read from disk rather than reconstructed, because what
 * is being checked is that a file a researcher holds still opens. It shipped as
 * the example until M91 (2026-10-14) and is the same bytes in tests/fixtures.
 */
describe("ISC-490: the Coldharbour bundle still imports", () => {
  const SHIPPED = new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname;

  test("it parses, remaps and writes every record through the stores", async () => {
    const source = parseBundle(await Bun.file(SHIPPED).text());
    expect(source.events.length).toBeGreaterThan(100);

    const written = {
      projects: [] as Project[],
      documents: [] as StoredDocument[],
      chunks: [] as Chunk[],
      anomalies: [] as AnomalyCandidate[],
      twins: [] as ModalTwin[],
      events: [] as LedgerEvent[],
    };
    const stores: BundleStores = {
      saveProject: async (p) => void written.projects.push(p),
      saveDocument: async (d) => void written.documents.push(d),
      saveChunks: async (c) => void written.chunks.push(...c),
      saveAnomaly: async (a) => void written.anomalies.push(a),
      saveTwin: async (t) => void written.twins.push(t),
      appendEvents: async (e) => void written.events.push(...e),
    };

    let n = 0;
    const imported = await importBundle(
      remapBundleIds(source, () => `m37-example-${(n += 1)}`),
      stores,
    );

    expect(imported.id).not.toBe(source.project.id);
    expect(imported.title).toBe(source.project.title);
    expect({
      projects: written.projects.length,
      documents: written.documents.length,
      chunks: written.chunks.length,
      anomalies: written.anomalies.length,
      events: written.events.length,
    }).toEqual({
      projects: 1,
      documents: source.documents.length,
      chunks: source.chunks.length,
      anomalies: source.anomalies.length,
      events: source.events.length,
    });
    // Every record scoped to the study that was just written, not the one it
    // came from: an event under the wrong project is invisible rather than
    // wrong, which is the hardest kind of defect to see.
    for (const event of written.events) expect(event.projectId).toBe(imported.id);
    for (const chunk of written.chunks) expect(chunk.projectId).toBe(imported.id);
  });
});
