/**
 * M49-3, Material is the papers until there is data (ISC-529).
 *
 * Three properties.
 *
 *   the rule      one function, read by Material and by the Early data step, so
 *                 the two cannot disagree about whether this study is one with
 *                 data. Its edge is the D5 partition: a study whose only uploads
 *                 are papers has no data, however many files it holds, and that
 *                 is the distinction D12 was reopened over on 2026-09-13.
 *   the record    the press is written to the project and survives a reload, so
 *                 the section is open on every later visit rather than on this
 *                 one. Idempotent, because what is recorded is when they said
 *                 so.
 *   the screen    a study with no data shows no data rows, no counts and no
 *                 empty-state card for data. Asserted on the rendered tab,
 *                 because the absence of five chips is exactly what a source
 *                 census cannot see.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { dataSectionOpen, hasData } from "../src/flow/earlyData.ts";
import { DECLARE_DATA_LABEL } from "../src/flow/DeclareEarlyData.tsx";
import { StudyMaterial } from "../src/ui/StudyViews.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import type { StoredDocument } from "../src/state/chunks.ts";
import {
  declareEarlyData,
  deleteProject,
  emptyBrief,
  getProject,
  listProjects,
  saveChunks,
  saveDocument,
  saveProject,
  type Project,
} from "../src/state/projects.ts";

const PID = "m49-material";

function project(over: Partial<Project> = {}): Project {
  return {
    id: PID,
    title: "M49 walk: material",
    stage: "design-brief",
    brief: emptyBrief(),
    createdAt: 1,
    ...over,
  };
}

function doc(id: string, kind: StoredDocument["kind"]): StoredDocument {
  return {
    id,
    projectId: PID,
    name: `${id}.txt`,
    kind,
    createdAt: 1,
    chunkCount: 1,
  };
}

describe("M49-3: the rule both surfaces read", () => {
  test("no documents is no data", () => {
    expect(hasData([])).toBe(false);
    expect(dataSectionOpen(project(), [])).toBe(false);
  });

  test("a paper is not data, however many of them there are", () => {
    // The D5 partition, and the defect D12 was reopened over: one uploaded paper
    // made the rail report Early data as answered.
    const papers = [doc("p1", "literature"), doc("p2", "literature")];
    expect(hasData(papers)).toBe(false);
    expect(dataSectionOpen(project(), papers)).toBe(false);
  });

  test("a transcript, a fieldnote, a memo or an archive is data", () => {
    for (const kind of ["transcript", "fieldnote", "memo", "archival"] as const) {
      expect({ kind, data: hasData([doc("d1", kind)]) }).toEqual({ kind, data: true });
    }
  });

  test("the declaration opens the section on a study with no files at all", () => {
    expect(dataSectionOpen(project({ dataDeclaredAt: 123 }), [])).toBe(true);
  });

  test("a study that holds data opens the section without ever having declared", () => {
    // The shipped example, every bundle sent with material in it, and every
    // study that had data before the control existed.
    expect(dataSectionOpen(project(), [doc("d1", "fieldnote")])).toBe(true);
  });

  test("a project still being read keeps the section shut rather than flashing it", () => {
    expect(dataSectionOpen(undefined, [])).toBe(false);
  });
});

describe("M49-3: the press is on the record", () => {
  beforeEach(async () => {
    for (const p of await listProjects()) await deleteProject(p.id);
    await saveProject(project());
  });

  test("it is written to the study and survives a re-read", async () => {
    expect((await getProject(PID))?.dataDeclaredAt).toBeUndefined();
    await declareEarlyData(PID, 4242);
    expect((await getProject(PID))?.dataDeclaredAt).toBe(4242);
  });

  test("a second press keeps the first time, because what is recorded is when they said so", async () => {
    await declareEarlyData(PID, 4242);
    await declareEarlyData(PID, 9999);
    expect((await getProject(PID))?.dataDeclaredAt).toBe(4242);
  });

  test("a study that is not there is not created by declaring on it", async () => {
    expect(await declareEarlyData("no-such-study")).toBeUndefined();
    expect((await listProjects()).map((p) => p.id)).toEqual([PID]);
  });
});

// ---------------------------------------------------------------------------

let container: HTMLElement;
let root: Root;

async function mountMaterial(): Promise<void> {
  await act(async () => {
    root.render(
      React.createElement(LedgerProvider, {
        store: new InMemoryLedgerStore(),
        children: React.createElement(StudyMaterial, { projectId: PID }),
      }),
    );
    await wait(10);
  });
}

function text(): string {
  return container.textContent ?? "";
}

function shows(testId: string): boolean {
  return container.querySelector(`[data-testid="${testId}"]`) !== null;
}

describe("M49-3: Material, rendered", () => {
  beforeEach(async () => {
    for (const p of await listProjects()) await deleteProject(p.id);
    await saveProject(project());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    for (const p of await listProjects()) await deleteProject(p.id);
  });

  test("a study with no data shows the papers and one control", async () => {
    await mountMaterial();
    expect(shows("material-panels")).toBe(true);
    expect(text()).toContain(DECLARE_DATA_LABEL);
    expect(shows("declare-data")).toBe(true);
  });

  test("and shows no data rows, no counts and no empty-state card for data", async () => {
    await mountMaterial();
    expect(shows("corpus-material")).toBe(false);
    expect(shows("corpus-docs")).toBe(false);
    expect(shows("material-empty")).toBe(false);
    expect(shows("corpus-find")).toBe(false);
    expect(shows("material-add")).toBe(false);
    /* The five chips the data head carried. Asserted on the block rather than on
     * the words, because "passages" is also a count the papers section prints
     * and M49-4 is what takes that one off. */
    expect(container.querySelector(".material-counts")).toBeNull();
  });

  test("the frame is one pane while the data section is shut", async () => {
    await mountMaterial();
    expect(
      container.querySelector('[data-testid="material-panels"]')?.getAttribute("data-panels"),
    ).toBe("main");
  });

  test("a study that holds data opens on the data section, with no control", async () => {
    await saveDocument(doc("d1", "fieldnote"));
    await saveChunks([
      { id: "c1", projectId: PID, documentId: "d1", kind: "fieldnote", text: "a passage", index: 0 },
    ]);
    await mountMaterial();
    expect(shows("corpus-material")).toBe(true);
    expect(shows("declare-data")).toBe(false);
    expect(
      container.querySelector('[data-testid="material-panels"]')?.getAttribute("data-panels"),
    ).toBe("list-main");
  });

  test("a study holding only papers still shows the control", async () => {
    await saveDocument(doc("p1", "literature"));
    await mountMaterial();
    expect(shows("declare-data")).toBe(true);
    expect(shows("corpus-material")).toBe(false);
  });

  test("pressing the control opens the data section and records the press", async () => {
    await mountMaterial();
    const button = container.querySelector<HTMLElement>('[data-testid="declare-data-button"]');
    expect(button?.textContent).toBe(DECLARE_DATA_LABEL);
    await act(async () => {
      button?.click();
      await wait(60);
    });
    await act(async () => {
      await wait(20);
    });
    expect((await getProject(PID))?.dataDeclaredAt).toBeGreaterThan(0);
    expect(shows("corpus-material")).toBe(true);
    expect(shows("declare-data")).toBe(false);
  });

  test("a study that declared and uploaded nothing opens the section on every visit", async () => {
    await declareEarlyData(PID, 4242);
    await mountMaterial();
    expect(shows("corpus-material")).toBe(true);
    expect(shows("material-empty")).toBe(true);
  });
});
