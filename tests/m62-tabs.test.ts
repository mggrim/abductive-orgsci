/**
 * M62, ISC-607 (the owner, 2026-09-30): the strip shows every tab from the
 * start. Starting point, Design and (since M85) Sources are open; Your model and
 * Export are greyed until earned, each with one line under the strip on hover
 * and focus, and on its page if reached by link, saying how to open it. M49's
 * hidden tabs, its arrival lines and its redirect to Design are superseded.
 * M89 (2026-10-14): the Checks tab was tabled, so two tabs are greyed, not three.
 *
 *   Your model  Abductive's first suggestion (M49)
 *   Export      the first claim accepted into the model (M49)
 *
 * A tab that already holds work never closes (the M58 rule for steps, applied
 * to tabs): papers or data already in Sources keep it open, and the shipped
 * example and every earlier project keep every tab open.
 */
import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ALWAYS_SHOWN, GATED_TABS, TAB_UNLOCK, closedTabs, openTabs } from "../src/views/earnedTabs.ts";
import { STUDY_TABS, STUDY_TAB_LABEL, studyPath } from "../src/ui/routes.ts";
import { AppShell } from "../src/ui/AppShell.tsx";
import { LedgerProvider, useLedger } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { deleteProject, emptyBrief, listProjects, saveProject, type Project } from "../src/state/projects.ts";
import { nonEntityActs } from "./copyBarScan.ts";

const PID = "m62-tabs";
let seq = 0;
const env = (projectId = PID) => ({ id: crypto.randomUUID(), ts: 1_700_000_000_000 + ++seq, projectId, actor: "human" as const });
const bound = (subject: string, statement = "said"): LedgerEvent => ({ ...env(), type: "bound", subject, statement }) as LedgerEvent;
const proposal = (): LedgerEvent =>
  ({ ...env(), type: "proposal", proposalId: `p${seq}`, pageType: "observation", title: "A claim", sourceChunks: [] }) as LedgerEvent;
const created = (): LedgerEvent =>
  ({ ...env(), type: "ontology-mutation", op: "create", pageId: `c${seq}`, pageType: "observation", title: "A claim", origin: "you" }) as unknown as LedgerEvent;

describe("the lines, in the owner's words", () => {
  test("one per greyed tab", () => {
    // M85, ISC-712: Sources left the gated tabs, and its line went with it.
    // M89: Checks left the gated tabs, and its line went with it.
    expect([...GATED_TABS]).toEqual(["ontology", "exports"]);
    expect(TAB_UNLOCK).toEqual({
      // M63, ISC-612: the tab and its unlock line in the owner's terms.
      ontology: "Emerging project ontology opens when Abductive suggests a first concept.",
      // M71, ISC-653: since M63 Export opens on an accepted concept or a placed
      // statement, and the line says so (tests/m71-tab-gate.test.ts).
      exports: "Export opens once your ontology has a concept or a placed statement.",
    });
    for (const line of Object.values(TAB_UNLOCK)) expect({ line, act: nonEntityActs(line) }).toEqual({ line, act: false });
  });

  test("Starting point, Design and Sources are always open", () => {
    expect([...ALWAYS_SHOWN]).toEqual(["motivation", "design", "material"]);
  });
});

describe("each earned moment", () => {
  test("a fresh project has the two closed, and Sources open", () => {
    expect(openTabs([], PID)).toEqual({ ontology: false, exports: false });
    expect(closedTabs([], PID).has("material")).toBe(false);
  });

  test("Your model at the first suggestion, Export at the first accepted claim", () => {
    expect(openTabs([proposal()], PID).ontology).toBe(true);
    expect(openTabs([created()], PID).exports).toBe(true);
    // M89: a saved answer opens nothing greyed now that Checks is gone.
    expect(openTabs([bound("site")], PID)).toEqual({ ontology: false, exports: false });
  });

  test("another project's record opens nothing here", () => {
    const other = { ...proposal(), projectId: "elsewhere" } as LedgerEvent;
    expect(openTabs([other], PID).ontology).toBe(false);
  });
});

describe("a tab that holds work never closes", () => {
  test("a suggestion that was later decided leaves Your model open", () => {
    expect(openTabs([proposal(), created()], PID).ontology).toBe(true);
  });

  test("the shipped example keeps every tab open", async () => {
    const bundle = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname).json();
    expect(openTabs(bundle.events, bundle.project.id)).toEqual({ ontology: true, exports: true });
  });
});

let container: HTMLElement;
let root: Root;
let store: InMemoryLedgerStore;
let write: ((batch: readonly LedgerEvent[]) => Promise<void>) | null = null;
function Probe(): null {
  write = useLedger().appendAll;
  return null;
}
async function settle() {
  for (let i = 0; i < 6; i += 1) await act(async () => void (await Promise.resolve()));
}
async function mount() {
  await act(async () => {
    root.render(
      React.createElement(LedgerProvider, {
        store,
        children: [React.createElement(AppShell, { key: "shell" }), React.createElement(Probe, { key: "probe" })],
      }),
    );
  });
  await settle();
}
const tab = (t: string) => container.querySelector<HTMLElement>(`[data-testid="studytab-${t}"]`)!;
type Handlers = { onMouseEnter?: () => void; onFocus?: () => void; onBlur?: () => void; onClick?: (e: unknown) => void };
const handlers = (el: Element): Handlers => {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"))!;
  return (el as unknown as Record<string, Handlers>)[key]!;
};

beforeEach(async () => {
  for (const p of await listProjects()) await deleteProject(p.id);
  const project: Project = { id: PID, title: "M62 tabs", stage: "design-brief", brief: emptyBrief(), createdAt: Date.now() };
  await saveProject(project);
  store = new InMemoryLedgerStore();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.location.hash = studyPath(PID, "motivation");
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.location.hash = "";
  for (const p of await listProjects()) await deleteProject(p.id);
});

describe("the strip, in the shell", () => {
  test("a fresh project shows all five tabs, two of them greyed and not openable", async () => {
    await mount();
    const labels = [...container.querySelectorAll('[data-testid^="studytab-"]')].map((n) => n.textContent);
    expect(labels).toEqual(STUDY_TABS.map((t) => STUDY_TAB_LABEL[t]));
    for (const t of ["motivation", "design", "material"]) {
      expect({ t, closed: tab(t).getAttribute("aria-disabled") }).toEqual({ t, closed: null });
      expect(tab(t).getAttribute("href")).not.toBeNull();
    }
    for (const t of GATED_TABS) {
      expect({ t, closed: tab(t).getAttribute("aria-disabled") }).toEqual({ t, closed: "true" });
      expect(tab(t).getAttribute("href")).toBeNull();
      // Reachable by keyboard, and it reads its line.
      expect(tab(t).getAttribute("tabindex")).toBe("0");
      const described = container.querySelector(`#${tab(t).getAttribute("aria-describedby")}`);
      expect(described?.textContent).toBe(TAB_UNLOCK[t]);
    }
    expect(container.querySelector('[data-testid="studybar-notice"]')).toBeNull();
  });

  test("hover and focus show the line under the strip; leaving hides it", async () => {
    await mount();
    expect(container.querySelector('[data-testid="studybar-unlock"]')).toBeNull();
    await act(async () => handlers(tab("ontology")).onMouseEnter?.());
    expect(container.querySelector('[data-testid="studybar-unlock"]')?.textContent).toBe(TAB_UNLOCK.ontology);
    await act(async () => handlers(tab("exports")).onFocus?.());
    expect(container.querySelector('[data-testid="studybar-unlock"]')?.textContent).toBe(TAB_UNLOCK.exports);
    await act(async () => handlers(tab("exports")).onBlur?.());
    expect(container.querySelector('[data-testid="studybar-unlock"]')).toBeNull();
  });

  test("a saved Context answer opens no greyed tab, and no arrival line is written", async () => {
    await mount();
    // M85, ISC-712: Sources is open before any answer.
    expect(tab("material").getAttribute("aria-disabled")).toBeNull();
    expect(tab("material").getAttribute("href")).toBe(studyPath(PID, "material"));
    await act(async () => void (await write?.([bound("context")])));
    await settle();
    expect(tab("exports").getAttribute("aria-disabled")).toBe("true");
    expect(tab("ontology").getAttribute("aria-disabled")).toBe("true");
    expect(container.querySelector('[data-testid="studybar-notice"]')).toBeNull();
  });

  test("a link to a closed tab lands on its page, which says how to open it", async () => {
    window.location.hash = studyPath(PID, "exports");
    await mount();
    expect(window.location.hash).toBe(studyPath(PID, "exports"));
    expect(container.querySelector('[data-testid="closed-tab-line"]')?.textContent).toBe(TAB_UNLOCK.exports);
    expect(container.querySelector('[data-testid="export-bar"]')).toBeNull();
  });
});

describe("Design's pointer at Sources is live, since Sources is open from the start (M85, ISC-712)", () => {
  test("the early data control carries no closed reason", async () => {
    const controls = await Bun.file(new URL("../src/flow/SuggestFromData.tsx", import.meta.url).pathname).text();
    expect(controls).not.toContain("TAB_UNLOCK.material");
    expect(controls).not.toContain("closedReason=");
  });
});
