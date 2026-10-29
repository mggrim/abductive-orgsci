/**
 * The receipt is on the record, and the record identifies the files it wrote.
 *
 * Three builders named these tests and none of them could write one, because
 * `tests/` sat outside every file partition in the wave. They are the tests for
 * the two halves of one defect.
 *
 * The receipt was `useState` in `ExportBar.tsx`. Reloading /exports emptied it,
 * so the single fact a researcher needs months later, that this file left this
 * study at this state of the design, was the only thing that happened in Abductive
 * that Abductive did not record. Measured on the fixture study before the fix:
 * download the memo, press refresh, and the list is empty with no trace in the
 * ledger, the exports, or anywhere else.
 *
 * And the stamp lived only on that panel, so a memo in a co-author's inbox was
 * unidentifiable. The one place that said which design it came from was a
 * separate markdown file the researcher had to remember to download and keep
 * beside it.
 *
 * The property that ties them together, and the one this file exists to protect:
 * an export must not move the stamp. If it did, the digest printed inside the
 * memo sent on Tuesday would match nothing by Wednesday, and the receipt's only
 * checkable claim would hold for nobody.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { designEvents, ledgerStamp, stampLine } from "../src/export/stamp.ts";
import {
  buildExportReceipt,
  exportEvent,
  exportTakes,
} from "../src/workbench/ExportBar.tsx";
import { projectOntology } from "../src/ontology/projection.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { buildSessionReplay } from "../src/export/sessionReplay.ts";
import { buildWikiFiles } from "../src/export/wikiDirectory.ts";
import { buildAgentGraph } from "../src/export/agentGraph.ts";
import { buildDiagramSvg } from "../src/export/diagram.ts";

const PROJECT_ID = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
let clock = 2_500_000_000_000;
function env(actor = "human") {
  clock += 1000;
  return { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT_ID };
}

const DESIGN = [
  {
    ...env(),
    type: "bound",
    subject: "site",
    statement: "One acute ward, six nurses.",
  },
  {
    ...env(),
    type: "ontology-mutation",
    op: "create",
    targetId: "pg-1",
    pageType: "puzzle",
    title: "Handoff agreement does not track patient agreement",
    body: "The nurses agree about the handoff and disagree about the patient.",
    origin: "author-prior",
    supportingChunks: [],
  },
] as unknown as readonly LedgerEvent[];

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

function take(artefact: string, events: readonly LedgerEvent[]): LedgerEvent {
  return exportEvent({
    projectId: PROJECT_ID,
    artefact,
    bytes: 1234,
    stamp: ledgerStamp(events),
    designEvents: designEvents(events).length,
    now: () => (clock += 1000),
  });
}

describe("an export is on the record (ISC-68, receipt half)", () => {
  test("the event validates, so the receipt can actually be appended", () => {
    // The panel writes this through `appendAll`, which validates. A shape the
    // store rejects would fail silently at the one moment the researcher is
    // being told the file was recorded.
    expect(validateEvent(take("memo.md", DESIGN))).toEqual([]);
  });

  test("a receipt read back off the ledger is the receipt that was written", () => {
    /* The reload case, stated as a property rather than as a click.
     *
     * `exportTakes` is the whole of what the panel renders, so a list that
     * survives this round trip is a list that survives a refresh: the component
     * holds nothing that this function cannot recompute from the events. */
    const first = take("study-memo.md", DESIGN);
    const second = take("study-ledger.json", [...DESIGN, first]);
    const ledger = [...DESIGN, first, second];

    const takes = exportTakes(ledger, PROJECT_ID);
    expect(takes.map((t) => t.name)).toEqual(["study-memo.md", "study-ledger.json"]);
    expect(takes.every((t) => t.bytes === 1234)).toBe(true);
    // Another study's exports are not this study's receipt.
    expect(exportTakes(ledger, "some-other-study")).toEqual([]);
  });

  test("taking a file out does not move the stamp", () => {
    /* The load-bearing one.
     *
     * An export is a reading of the study and does not change it, so the digest
     * of the study must not change either. If it did, the stamp printed inside
     * every artefact would be stale the moment the next file was downloaded and
     * the receipt could identify nothing. */
    const before = ledgerStamp(DESIGN);
    const after = ledgerStamp([...DESIGN, take("a.md", DESIGN), take("b.md", DESIGN)]);
    expect(after).toBe(before);
    // And the count beside it holds still for the same reason.
    expect(designEvents([...DESIGN, take("c.md", DESIGN)]).length).toBe(DESIGN.length);
  });

  test("the stamp still moves when the design does", () => {
    // The other half, so the test above cannot pass on a stamp that is constant.
    const moved = ledgerStamp([
      ...DESIGN,
      { ...env(), type: "response", text: "One ward." } as unknown as LedgerEvent,
    ]);
    expect(moved).not.toBe(ledgerStamp(DESIGN));
  });

  test("the receipt file names the exclusion rather than leaving it to be discovered", () => {
    // A reader recomputing the digest over an exported ledger will get a
    // different answer unless they know to drop the export rows. The file has to
    // say so, because the whole claim is that a reader without Abductive can check
    // it.
    const md = buildExportReceipt({
      title: PROJECT.title,
      stamp: ledgerStamp(DESIGN),
      events: designEvents(DESIGN).length,
      taken: exportTakes([...DESIGN, take("m.md", DESIGN)], PROJECT_ID),
      at: clock,
    });
    expect(md).toContain("leaving out");
    expect(md).toContain("`export` rows");
    expect(md).toContain("m.md");
  });
});

describe("every written artefact says which design it came from", () => {
  const graph = projectOntology(DESIGN, PROJECT_ID);
  const stamp = ledgerStamp(DESIGN);

  test("the stamp line states the digest, the count and what to do with it", () => {
    const line = stampLine(DESIGN);
    expect(line).toContain(stamp);
    expect(line).toContain(`${designEvents(DESIGN).length} recorded events`);
    // A reader without Abductive has to be able to act on it.
    expect(line).toContain("recompute");
  });

  test("the memo, the replay and the wiki index each carry it", () => {
    /* Named one by one rather than looped, because the failure this guards
     * against is a writer being added and nobody remembering, and a loop over a
     * list I also maintain would not notice. `ledger.json` and `bundle.json` are
     * absent on purpose: both serialise the whole event array, so the stamp is
     * recomputable from the file itself and printing it would be a second copy
     * of a number the file already determines. */
    const memo = buildOntologyMemo({ project: PROJECT, graph, events: DESIGN });
    expect(memo).toContain(stamp);

    const replay = buildSessionReplay({ project: PROJECT, events: DESIGN });
    expect(replay).toContain(stamp);

    const wiki = buildWikiFiles({ project: PROJECT, graph, events: DESIGN });
    const index = wiki.find((f) => f.path === "index.md");
    expect(index?.content).toContain(stamp);
  });

  test("the agent graph carries it as a field, because an agent has no receipt", () => {
    const agent = buildAgentGraph({
      project: PROJECT,
      graph,
      events: DESIGN,
      chunks: [],
    });
    expect(agent.takenAt.stamp).toBe(stamp);
    expect(agent.takenAt.designEvents).toBe(designEvents(DESIGN).length);
  });

  test("the figure carries it in desc, where it is readable and not drawn", () => {
    // A digest painted on a figure that goes into a paper is noise to every
    // reader but one. `desc` reaches assistive technology, a text editor, and
    // the co-author asking which version this is.
    const svg = buildDiagramSvg(graph, { title: PROJECT.title, stamp });
    expect(svg).toContain(`<desc>`);
    expect(svg).toContain(stamp);
    // Optional, so a caller with no ledger still gets a figure.
    expect(buildDiagramSvg(graph, { title: PROJECT.title })).not.toContain("<desc>");
  });
});
