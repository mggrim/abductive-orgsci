/**
 * M89, ISC-725 onward: the checks are tabled.
 *
 * The owner, 2026-10-14: "I think we should table the Checks tab. This seems
 * like something aspirational that we can describe in the proposal. I think we
 * should fork and remove it from the main version of the prototype." His ruling
 * on scope the same day: everything that checks leaves main. The tab, the
 * readiness report, the per-step flags, the findings in the Report and the
 * exports, the flag counts and the save-time bias scan all go. History keeps
 * past events, the interview keeps its questions, and the shipped example stays
 * byte-for-byte unchanged and opens on every remaining tab. The branch
 * `with-checks` is the record of the feature.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const ROOT = new URL("../", import.meta.url).pathname;
const SRC = `${ROOT}src/`;

const realPaperFit = { ...(await import(`${SRC}flow/usePaperFit.ts`)) };
await mock.module(`${SRC}flow/usePaperFit.ts`, () => ({
  ...realPaperFit,
  usePaperFit: () => async () => 0,
  useJudgeOnMount: () => undefined,
  openedCounts: () => new Map(),
}));
afterAll(() => {
  void mock.module(`${SRC}flow/usePaperFit.ts`, () => realPaperFit);
});

const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { AppShell } = await import(`${SRC}ui/AppShell.tsx`);
const { appBundleStores, importBundleJson } = await import(`${SRC}export/importStudy.ts`);
const { openRecord, STUDY_TABS, STUDY_TAB_LABEL } = await import(`${SRC}ui/routes.ts`);
const { buildOntologyMemo } = await import(`${SRC}export/ontologyMemo.ts`);
const { projectOntology } = await import(`${SRC}ontology/projection.ts`);

const BUNDLE_PATH = `${ROOT}tests/fixtures/coldharbour.bundle.json`;
const BUNDLE_JSON = readFileSync(BUNDLE_PATH, "utf8");

describe("ISC-725: the Checks tab leaves the tab strip and the router", () => {
  test("the tabs are Starting point, Design, Sources, the ontology tab and Export", () => {
    expect([...STUDY_TABS]).toEqual(["motivation", "design", "material", "ontology", "exports"]);
    expect(Object.values(STUDY_TAB_LABEL)).not.toContain("Checks");
  });

  test("the modules that produced or rendered a flag are gone", () => {
    for (const path of [
      "src/lint",
      "src/ui/CoherenceView.tsx",
      "src/ui/ReadinessReport.tsx",
      "src/ui/styles/coherence.css",
      "src/concepts/readiness.ts",
      "src/concepts/biasFirings.ts",
      "src/flow/stationLint.ts",
      "src/flow/biasScan.ts",
      "src/flow/machineBiasScan.ts",
      "src/flow/MachineBiasWatch.tsx",
      "src/flow/scanDigest.ts",
      "src/views/abductiveWords.ts",
      "src/views/findings.ts",
      "src/views/openFindings.ts",
      "src/views/misfitExpectations.ts",
      "src/ui/components/FindingRow.tsx",
      "src/export/exportFindings.ts",
      "src/ui/model/RivalsPanel.tsx",
      "content/cases",
    ]) {
      expect({ path, exists: existsSync(`${ROOT}${path}`) }).toEqual({ path, exists: false });
    }
  });
});

describe("ISC-726: a copy of the old example (the Coldharbour fixture since M91) imports and opens on every remaining tab", () => {
  async function mountExample() {
    const store = new InMemoryLedgerStore();
    const project = await importBundleJson(
      BUNDLE_JSON,
      "example",
      appBundleStores(async (events: readonly unknown[]) => {
        for (const e of events) await store.append(e as never);
      }),
    );
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    window.location.hash = `#/study/${project.id}/design/context`;
    await act(async () =>
      root.render(React.createElement(LedgerProvider, { store }, React.createElement(AppShell))),
    );
    for (let i = 0; i < 20; i += 1) await act(async () => void (await wait(5)));
    return { host, root, project, store };
  }

  async function go(hash: string) {
    await act(async () => {
      window.location.hash = hash;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    for (let i = 0; i < 20; i += 1) await act(async () => void (await wait(5)));
  }

  test("Design, Sources, the ontology tab, History and Export each render, and Checks is not offered", async () => {
    const { host, root, project } = await mountExample();
    const id = project.id;

    expect(host.querySelector('[data-testid="station-rail"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="studytab-coherence"]')).toBeNull();
    for (const t of ["motivation", "design", "material", "ontology", "exports"]) {
      expect({ t, tab: host.querySelector(`[data-testid="studytab-${t}"]`) !== null }).toEqual({ t, tab: true });
    }
    // The rail carries no flag counts.
    expect(host.querySelector('[data-testid="station-rail"]')?.textContent ?? "").not.toMatch(/\bflags?\b/i);

    await go(`#/study/${id}/material`);
    expect(host.querySelector('[data-testid="study-material"]')).not.toBeNull();

    await go(`#/study/${id}/ontology`);
    expect(host.querySelector('[data-testid="closed-tab"]')).toBeNull();
    expect(host.querySelector("main")).not.toBeNull();
    expect(host.querySelector('[data-testid^="concept-flags-"]')).toBeNull();

    await go(`#/study/${id}/exports`);
    expect(host.querySelector('[data-testid="study-exports"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="export-bar"]')).not.toBeNull();

    await act(async () => openRecord());
    for (let i = 0; i < 20; i += 1) await act(async () => void (await wait(5)));
    const panel = host.querySelector('[data-testid="record-panel"]');
    expect(panel).not.toBeNull();
    // History still reads the example's past flags as events.
    expect(host.querySelector('[data-testid="ledger-panel"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="flag-panel"]')).toBeNull();

    // A link to the old Checks route lands on Design rather than failing.
    await go(`#/study/${id}/coherence`);
    expect(host.querySelector('[data-testid="station-rail"]')).not.toBeNull();
    root.unmount();
  });

  test("the example's Report carries the ontology and none of the checks' sections", async () => {
    const bundle = JSON.parse(BUNDLE_JSON);
    // The example still records lint findings: History keeps them.
    expect(bundle.events.some((e: { type: string }) => e.type === "lint-finding")).toBe(true);
    const graph = projectOntology(bundle.events, bundle.project.id);
    const report: string = buildOntologyMemo({ project: bundle.project, graph, events: bundle.events, now: () => 1_790_000_000_000 });
    expect(report).toContain("# ");
    for (const gone of ["## Readiness report", "Biases flagged", "Check readiness", "Checks tab", "## Flags", "Rival explanations"]) {
      expect({ gone, present: report.includes(gone) }).toEqual({ gone, present: false });
    }
  });
});
