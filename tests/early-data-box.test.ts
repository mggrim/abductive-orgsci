/**
 * The box, rendered, at `/design/early-data` (ISC-489, D5).
 *
 * The unit half of this is in `early-data-field.test.ts`. This is the half the
 * walk actually reported: the step drew no textarea. `StationWorkspace` renders
 * one for any station whose field is not null and joins it to the step's own
 * question with `for`, so the box appears without a line changing in that
 * component — which is a claim worth holding to a rendered DOM rather than to a
 * reading of the source.
 *
 * The save goes through the real brief store and the real ledger, because what
 * the researcher is owed at this step is not a box that accepts text. It is a
 * `bound` event saying what they now think their material showed them, on the
 * record, beside the conversation that got them there.
 */

import "fake-indexeddb/auto";
import { openSummary } from "./openSummary.ts";
import { useDom, wait } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const { StationWorkspace } = await import(`${SRC}flow/StationWorkspace.tsx`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { projectOntology } = await import(`${SRC}ontology/projection.ts`);
const { stationById } = await import(`${SRC}flow/stations.ts`);
const { stationSubject } = await import(`${SRC}flow/stationBrief.ts`);
const projects = await import(`${SRC}state/projects.ts`);

const P = "early-data-box";
const SURPRISE =
  "The handover keeps being described as something that happens to them rather than something they decide, which is not what I went in expecting.";

/** The props React attached to a node, so its handler can be driven. */
function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined
    ? undefined
    : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}

describe("the Early data step, rendered", () => {
  test("it shows a textarea labelled by the step's own question, and Save writes it", async () => {
    await projects.saveProject({
      id: P,
      title: "night wards",
      stage: "pilot-data",
      createdAt: 1,
      brief: { ...projects.emptyBrief() },
    } as never);
    const store = new InMemoryLedgerStore();

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const project = await projects.getProject(P);
    await act(async () => {
      root.render(
        React.createElement(
          LedgerProvider as never,
          { store } as never,
          React.createElement(StationWorkspace as never, {
            project,
            station: "early-data",
            graph: projectOntology([], P),
            documents: [],
            chunks: [],
            onChanged: () => {},
          } as never),
        ),
      );
      await wait(5);
    });

    // The box is there once Edit summary opens it (M92), and the step's question is its label.
    await openSummary(host, "station-summary");
    const box = host.querySelector('[data-testid="station-input"]') as HTMLTextAreaElement | null;
    const label = host.querySelector('label[for="station-input"]');
    expect(box).not.toBeNull();
    expect(label?.textContent).toBe(stationById("early-data").prompt);
    // M96, ISC-792: the Data type menu left the step.
    expect(host.querySelector('[data-testid="station-datatype"]')).toBeNull();

    // Type, then save.
    await act(async () => {
      (box as HTMLTextAreaElement).value = SURPRISE;
      reactProps(box as Element)?.onChange?.({ target: box });
    });
    await act(async () => {
      reactProps(host.querySelector('[data-testid="save-station"]') as Element)?.onClick?.(
        undefined,
      );
      await wait(30);
    });

    // On the record, and in the store.
    const written = (await store.readAll()).filter((e: LedgerEvent) => e.type === "bound");
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      type: "bound",
      subject: stationSubject("early-data"),
      statement: SURPRISE,
    });
    expect((await projects.getProject(P))?.brief.earlySurprise).toBe(SURPRISE);
    root.unmount();
  });
});

/**
 * The kind of material is asked for, not assumed (D22, M43b).
 *
 * `station-datatype` opened on `interview`, and the walk of 2026-09-13 found an
 * ethnography declared as interview data by a control nobody had touched, sitting
 * above the read button in a spot a researcher has no reason to look at. The kind
 * is read by the coherence checks and by the bias personas' question set, so a
 * silent default is the tool answering a methods question on the researcher's
 * behalf and then reasoning from its own answer.
 *
 * The same shape the Material tab's kind picker already has: a placeholder option
 * with no value, and the control beside it held back until a kind is chosen.
 */
describe("the kind of material has no default (D22)", () => {
  /* M49 (ISC-529): the step draws the reading control only once the study holds
   * data, and data is a property of the DOCUMENTS rather than of the passages
   * (D5, D12). Every case below is about the reading control, so each one hands
   * the step a data document; the cases that are about having no data say so by
   * handing it none. */
  const fieldnote = (id: string): unknown => ({
    id: `doc-${id}`,
    projectId: id,
    name: "night-ward.txt",
    kind: "fieldnote",
    addedAt: 1,
  });

  async function renderStep(
    id: string,
    over: Record<string, unknown> = {},
    chunks: unknown[] = [],
    documents: unknown[] = [],
  ) {
    await projects.saveProject({
      id,
      title: "night wards",
      stage: "pilot-data",
      createdAt: 1,
      brief: { ...projects.emptyBrief(), ...over },
    } as never);
    const store = new InMemoryLedgerStore();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const project = await projects.getProject(id);
    await act(async () => {
      root.render(
        React.createElement(
          LedgerProvider as never,
          { store } as never,
          React.createElement(StationWorkspace as never, {
            project,
            station: "early-data",
            graph: projectOntology([], id),
            documents,
            chunks,
            onChanged: () => {},
          } as never),
        ),
      );
      await wait(5);
    });
    return { host, root, store };
  }

  test("a fresh brief declares nothing", () => {
    expect(projects.emptyBrief().dataType).toBe("");
  });

  /* M96, ISC-791 and ISC-792 (the owner, 2026-10-30): "there should be no data
   * type or suggest concepts button at the bottom of the early data screen." The
   * step names the files that its conversation considers, and the kind of data
   * comes from the files on Sources. */
  test("the step carries no Data type menu and no Suggest concepts, and names the files it considers", async () => {
    const id = "early-data-m96-scope";
    const chunks = [{ id: "c1", projectId: id, documentId: `doc-${id}`, kind: "fieldnote", text: "a passage", index: 0 }];
    const { host, root } = await renderStep(id, {}, chunks, [fieldnote(id)]);
    expect(host.querySelector('[data-testid="station-datatype"]')).toBeNull();
    expect(host.querySelector('[data-testid="stage-proposals"]')).toBeNull();
    expect(host.textContent ?? "").not.toContain("Suggest concepts");
    expect(host.querySelector('[data-testid="early-data-scope"]')?.textContent ?? "").toContain(
      "This step considers your one data file on Sources, in full.",
    );
    root.unmount();
  });

  test("a study with no data file at all is offered the declaration instead", async () => {
    const { host, root } = await renderStep("early-data-kind-none");
    expect(host.textContent ?? "").toContain("I have early data");
    expect(host.querySelector('[data-testid="early-data-scope"]')).toBeNull();
    root.unmount();
  });

  test("saving the summary writes no data-type row", async () => {
    const id = "early-data-kind-save";
    const { host, root, store } = await renderStep(id);
    await openSummary(host, "station-summary");
    await act(async () => {
      reactProps(host.querySelector('[data-testid="save-station"]') as Element)?.onClick?.(undefined);
      await wait(30);
    });
    expect(
      (await store.readAll()).filter((e: LedgerEvent) => e.type === "bound" && e.subject === "data-type"),
    ).toHaveLength(0);
    root.unmount();
  });

  test("the data type comes from the kinds of the data files, and an older saved type stands without files", async () => {
    const id = "early-data-kind-files";
    await projects.saveProject({
      id,
      title: "files",
      stage: "pilot-data",
      createdAt: 1,
      brief: { ...projects.emptyBrief(), dataType: "archival", dataKind: "archival" },
    } as never);
    expect((await projects.getProject(id))?.brief.dataType).toBe("archival");
    const doc = (n: number, kind: string) => ({ id: `${id}-${n}`, projectId: id, name: `f${n}.txt`, kind, createdAt: n, chunkCount: 1 });
    await projects.saveDocument(doc(1, "transcript") as never);
    await projects.saveDocument(doc(2, "fieldnote") as never);
    await projects.saveDocument(doc(3, "chatnote") as never);
    await projects.saveDocument(doc(4, "literature") as never);
    const p = await projects.getProject(id);
    expect(p?.brief.dataType).toBe("interview");
    expect(["transcript", "chatnote"]).toContain(p?.brief.dataKind);
    expect((await projects.listProjects()).find((x: { id: string }) => x.id === id)?.brief.dataType).toBe("interview");
    expect(projects.dataTypeOfFiles([{ kind: "fieldnote" }, { kind: "transcript" }])?.dataType).toBe("ethnographic");
    expect(projects.dataTypeOfFiles([{ kind: "literature" }])).toBeUndefined();
  });
});
