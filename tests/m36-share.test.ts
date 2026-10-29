/**
 * M36: bringing a study in, and what happens off the dev server.
 *
 * Two properties (the example was a third until M91, 2026-10-14, when the
 * owner removed it from the product), and each has a way of going wrong that no screenshot and
 * no type would catch.
 *
 *   the import   a bundle has been readable since ISC-35 and there was no door
 *                to read one through. What is under test is the door: a real
 *                file, through the rendered control, onto the real stores, and
 *                the study is open on Design afterwards. The remap is what
 *                makes a second import possible at all, so the same bundle
 *                goes in twice and the two copies are held apart by their ids.
 *   the origin   `/cli-bridge` and `/anthropic-proxy` are dev-server proxies.
 *                Off the dev server the probe must cost nothing and the API
 *                call must not be aimed at a path that cannot answer it. The
 *                first is a unit test with a fetch that would throw if it were
 *                called; the second reads the URL the client builds.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { buildBundle, parseBundle, remapBundleIds, serializeBundle } from "../src/export/bundle.ts";
import {
  appBundleStores,
  importBundleJson,
  importFailureMessage,
} from "../src/export/importStudy.ts";
import { BringInStudy } from "../src/ui/BringInStudy.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { deleteProject, emptyBrief, listProjects, type Project } from "../src/state/projects.ts";
import { devServerOrigin } from "../src/inference/origin.ts";
import { detectBridge, resetBridgeDetection } from "../src/inference/cliBridge.ts";
import { apiUrl } from "../src/inference/anthropic.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import type { Chunk, StoredDocument } from "../src/state/chunks.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

// ---------------------------------------------------------------------------
// A bundle, built the way the Exports tab builds one.
// ---------------------------------------------------------------------------

const PID = "m36-source-project";

function ev(partial: Partial<LedgerEvent> & { type: LedgerEvent["type"] }): LedgerEvent {
  return {
    id: crypto.randomUUID(),
    ts: 1_760_000_000_000,
    actor: "human",
    projectId: PID,
    ...partial,
  } as LedgerEvent;
}

const SOURCE: Project = {
  id: PID,
  title: "Gleanline",
  stage: "pilot-data",
  brief: { ...emptyBrief(), researchQuestion: "How does a food rescue keep its promise?" },
  createdAt: 1_759_000_000_000,
};

const DOC: StoredDocument = {
  id: "m36-doc",
  projectId: PID,
  name: "driver-1.txt",
  kind: "transcript",
  createdAt: 1_759_000_000_001,
  chunkCount: 1,
};

const CHUNK: Chunk = {
  id: "m36-chunk",
  projectId: PID,
  documentId: DOC.id,
  kind: "transcript",
  index: 0,
  text: "We turn away food we cannot move the same day.",
};

const BUNDLE_JSON = serializeBundle(
  buildBundle({
    project: SOURCE,
    documents: [DOC],
    chunks: [CHUNK],
    anomalies: [],
    twin: null,
    events: [ev({ type: "bound", subject: "site", statement: "One depot." } as never)],
  }),
);

// ---------------------------------------------------------------------------
// Rendering, and driving a control React attached a handler to.
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;

function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined
    ? undefined
    : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}

function find(testId: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testId}"]`);
}

async function mount(element: React.ReactElement): Promise<void> {
  await act(async () => {
    root.render(
      React.createElement(LedgerProvider, {
        store: new InMemoryLedgerStore(),
        children: element,
      }),
    );
  });
}

/**
 * Let the handler finish.
 *
 * Every handler here is `() => void promise`, so React's `act` sees a
 * synchronous call and returns while the import is still in the air. Real
 * time rather than DOM time, for the reason dom.ts gives: the registered
 * timer belongs to the DOM's own queue and does not settle a promise chain.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await wait(20);
  });
}

/** What the browser hands the change handler, minus the parts it never reads. */
async function chooseFile(input: HTMLElement, text: string): Promise<void> {
  await act(async () => {
    reactProps(input)?.onChange?.({
      target: { files: [{ text: async () => text }], value: "x" },
    });
  });
  await settle();
}

/** Press a button whose handler is async, and wait for it. */
async function press(el: HTMLElement): Promise<void> {
  await act(async () => {
    reactProps(el)?.onClick?.({});
  });
  await settle();
}

async function clearStudies(): Promise<void> {
  for (const project of await listProjects()) await deleteProject(project.id);
}

beforeEach(async () => {
  window.location.hash = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await clearStudies();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

// ---------------------------------------------------------------------------

describe("M36: a bundle comes in through the control and opens", () => {
  test("a valid bundle lands as a new study, on Design", async () => {
    await mount(React.createElement(BringInStudy));
    const input = find("bringin-input");
    expect(input).not.toBeNull();

    await chooseFile(input as HTMLElement, BUNDLE_JSON);

    const studies = await listProjects();
    expect(studies).toHaveLength(1);
    const landed = studies[0] as Project;
    expect(landed.title).toBe("Gleanline");
    // The mark says which door it came through.
    expect(landed.importedAs).toBe("bundle");
    // And a study a colleague sent is not a copy of anything the app ships.
    expect(landed.exampleId).toBeUndefined();
    // Fresh id, or the ledger's unique event-id index would refuse the events.
    expect(landed.id).not.toBe(PID);
    // Open, on Design, at the station a study opens on.
    expect(window.location.hash).toBe(`#/study/${landed.id}/design/context`);
    // Nothing on screen is claiming a failure.
    expect(find("bringin-error")).toBeNull();
  });

  test("a file that is not a bundle says so, and writes nothing", async () => {
    await mount(React.createElement(BringInStudy));
    await chooseFile(find("bringin-input") as HTMLElement, "hello, this is not JSON");

    expect(await listProjects()).toHaveLength(0);
    expect(window.location.hash).toBe("");
    const shown = find("bringin-error")?.textContent ?? "";
    expect(shown).toBe("That file isn't a project export. Choose the JSON file from the Export tab.");
  });

  test("a bundle of another version says which problem it is", () => {
    let thrown: unknown;
    try {
      parseBundle(JSON.stringify({ format: "bounds-bundle", version: 2, project: SOURCE }));
    } catch (err) {
      thrown = err;
    }
    expect(importFailureMessage(thrown)).toBe(
      "That export came from a different version of Abductive. Ask for a fresh export.",
    );
  });

  test("the same bundle twice makes two studies that share no id", async () => {
    await mount(React.createElement(BringInStudy));
    const input = find("bringin-input") as HTMLElement;
    await chooseFile(input, BUNDLE_JSON);
    await chooseFile(input, BUNDLE_JSON);

    const studies = await listProjects();
    expect(studies).toHaveLength(2);
    const [a, b] = studies as [Project, Project];
    expect(a.id).not.toBe(b.id);
    expect(a.title).toBe(b.title);
  });
});

/* M91 (2026-10-14): "the example, once per browser" and "M43d, D56: a copy of
 * an older example is a study of its own" went with the example door. The
 * owner removed the example from the product; copies already in a browser open
 * as ordinary projects (tests/m91-example-removed.test.ts). */

describe("M36: an old bundle is one this build can read", () => {
  /* The Coldharbour bundle, the example until M91 and the same bytes now in
   * tests/fixtures: a file a researcher may still hold. */
  const ON_DISK = new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname;

  test("the Coldharbour file parses, and remapping it leaves a study that hangs together", async () => {
    const bundle = parseBundle(await Bun.file(ON_DISK).text());
    // Vacuity guard: an empty bundle would satisfy every claim below.
    expect(bundle.project.title.trim()).not.toBe("");
    expect(bundle.events.length).toBeGreaterThan(0);
    expect(bundle.chunks.length).toBeGreaterThan(0);

    const fresh = remapBundleIds(bundle);
    expect(fresh.project.id).not.toBe(bundle.project.id);
    // Every id regenerated, and every cross-reference following it. A remap
    // that missed one would import a study whose passages point at documents
    // that are not there, which no parser would refuse.
    expect(fresh.events.every((e) => e.projectId === fresh.project.id)).toBe(true);
    expect(new Set(fresh.events.map((e) => e.id)).size).toBe(fresh.events.length);
    expect(
      fresh.chunks.every((c) => fresh.documents.some((d) => d.id === c.documentId)),
    ).toBe(true);
  });
});

describe("M36: the picker is mounted where a newcomer meets it", () => {
  test("the front page and the studies list offer the picker", async () => {
    const intro = await Bun.file(`${SRC}ui/Introduction.tsx`).text();
    const list = await Bun.file(`${SRC}ui/ProjectList.tsx`).text();
    expect(intro).toContain("<BringInStudy />");
    expect(list).toContain("<BringInStudy />");
  });
});

describe("M36: off the dev server, the proxies are not asked", () => {
  test("loopback is the dev server and a real host is not", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "[::1]", "app.localhost"]) {
      expect({ host, dev: devServerOrigin(host) }).toEqual({ host, dev: true });
    }
    for (const host of ["abductive.pages.dev", "example.com", "192.168.1.20", "mini.local"]) {
      expect({ host, dev: devServerOrigin(host) }).toEqual({ host, dev: false });
    }
  });

  test("the bridge probe on a hosted origin costs no request and no wait", async () => {
    const started = Date.now();
    const hostname = window.location.hostname;
    Object.defineProperty(window.location, "hostname", {
      value: "abductive.pages.dev",
      configurable: true,
    });
    try {
      resetBridgeDetection();
      // A fetch that would hang for longer than the probe's own timeout. If
      // the short-circuit ever goes, this test stops passing on time rather
      // than on a mock nobody notices was never called.
      const never = (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;
      expect(await detectBridge(never)).toBe(false);
      expect(Date.now() - started).toBeLessThan(1000);
    } finally {
      Object.defineProperty(window.location, "hostname", {
        value: hostname,
        configurable: true,
      });
      resetBridgeDetection();
    }
  });

  test("a hosted page aims the API call at Anthropic, not at the dev proxy", () => {
    const hostname = window.location.hostname;
    Object.defineProperty(window.location, "hostname", {
      value: "abductive.pages.dev",
      configurable: true,
    });
    try {
      expect(apiUrl()).toBe("https://api.anthropic.com/v1/messages");
    } finally {
      Object.defineProperty(window.location, "hostname", {
        value: hostname,
        configurable: true,
      });
    }
    // And the dev server still goes through its own proxy, which is what the
    // org-level CORS block on direct browser calls was worked around with.
    expect(apiUrl()).toBe("/anthropic-proxy/v1/messages");
  });

  test("the build serves from the root, so a hash route survives a hard reload", async () => {
    const config = await Bun.file(new URL("../vite.config.ts", import.meta.url).pathname).text();
    // No `base`, so Vite's own default of "/" applies and every asset in
    // dist/index.html is requested from the origin root. A hard reload on
    // `#/study/x/checks` asks the host for "/" and nothing else, because the
    // route is in the fragment, which is why no rewrite rule is needed.
    expect(config).not.toMatch(/^\s*base\s*:/m);
  });
});
