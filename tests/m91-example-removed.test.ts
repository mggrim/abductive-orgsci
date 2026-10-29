/**
 * M91: the example project leaves the product (ISC-737 to ISC-741).
 *
 * Matthew, 2026-10-14: "Let's remove the example project". The example
 * (a fictional pre-seed programme, Coldharbour) was recorded before M90 and
 * showed the old bundled concept names. Rather than hide or re-record them, the
 * owner removed it.
 *
 * Four properties:
 *   - no surface offers the example and no rendered sentence points to it;
 *   - the app ships no example file, and the bundle survives byte for byte as
 *     the fixture tests/fixtures/coldharbour.bundle.json;
 *   - a copy already in a browser (`importedAs: "example"`, `exampleId`) is the
 *     researcher's data and lists, counts and opens as an ordinary project;
 *   - an ordinary bundle import is untouched.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { Glob } from "bun";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const ROOT = new URL("../", import.meta.url).pathname;
const SRC = `${ROOT}src/`;
const FIXTURE = `${ROOT}tests/fixtures/coldharbour.bundle.json`;

/** sha256 of `git show 635c148:public/examples/coldharbour.bundle.json`. */
const SHIPPED_SHA256 = "b9ab9f79c4419a02c003478c0d12a79892d077fe9c3d0581d404d34842462155";

/** Rendered prose only: comments are not shown to anyone. */
function stripComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

async function sourceFiles(): Promise<{ rel: string; text: string }[]> {
  const out: { rel: string; text: string }[] = [];
  for await (const rel of new Glob("**/*.{ts,tsx,css}").scan(SRC)) {
    out.push({ rel, text: await Bun.file(SRC + rel).text() });
  }
  return out;
}

describe("ISC-737: no surface offers the example", () => {
  test("no code path mounts, fetches or names the example door", async () => {
    const hits: string[] = [];
    const door = /OpenExample|open-example|bringin-example|example-what|ExampleUnavailable|EXAMPLE_BUNDLE_PATH|EXAMPLE_STUDY_ID|findExampleStudy|fetchExampleBundle|\/examples\//;
    for (const { rel, text } of await sourceFiles()) {
      for (const line of stripComments(text).split("\n")) {
        if (door.test(line)) hits.push(`${rel}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("no rendered sentence points to the example project", async () => {
    const hits: string[] = [];
    const pointer = /example project|the example\b|Open example|Open your copy|example study/i;
    for (const { rel, text } of await sourceFiles()) {
      if (rel.endsWith(".css")) continue;
      for (const line of stripComments(text).split("\n")) {
        if (pointer.test(line)) hits.push(`${rel}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("Anti: the pointer scan would catch the old control's words", () => {
    const pointer = /example project|the example\b|Open example|Open your copy|example study/i;
    expect(pointer.test(`{mine ? "Open your copy" : "Open example project"}`)).toBe(true);
    // The question cards' ordinary phrase is not the example project.
    expect(pointer.test("For example, a dozen interviews")).toBe(false);
  });

  test("the importer exports no example machinery", async () => {
    const mod = (await import(`${SRC}export/importStudy.ts`)) as Record<string, unknown>;
    for (const name of [
      "EXAMPLE_BUNDLE_PATH",
      "EXAMPLE_STUDY_ID",
      "EXAMPLE_UNAVAILABLE",
      "EXAMPLE_UNREADABLE",
      "ExampleUnavailableError",
      "fetchExampleBundle",
      "findExampleStudy",
      "exampleFailureMessage",
    ]) {
      expect({ name, present: name in mod }).toEqual({ name, present: false });
    }
    // Ordinary import stays.
    expect(typeof mod.importBundleJson).toBe("function");
    expect(typeof mod.importFailureMessage).toBe("function");
  });

  test("README and SETUP no longer point to it, and SETUP starts with creating a project", async () => {
    const readme = await Bun.file(`${ROOT}README.md`).text();
    const setup = await Bun.file(`${ROOT}SETUP.md`).text();
    for (const text of [readme, setup]) {
      expect(text).not.toMatch(/example project|Open example|public\/examples/i);
    }
    expect(setup).toContain("press **Create project** to start your project");
  });
});

describe("ISC-738: the app ships no example file, and the bundle survives as a fixture", () => {
  test("public/examples is gone", () => {
    expect(existsSync(`${ROOT}public/examples`)).toBe(false);
  });

  test("the fixture is the same bytes the app shipped at 635c148", () => {
    const hash = createHash("sha256").update(readFileSync(FIXTURE)).digest("hex");
    expect(hash).toBe(SHIPPED_SHA256);
  });

  test("no test reads the bundle from public/ any more", async () => {
    const hits: string[] = [];
    for await (const rel of new Glob("**/*.{ts,tsx}").scan(`${ROOT}tests`)) {
      if (rel === "m91-example-removed.test.ts") continue;
      const text = await Bun.file(`${ROOT}tests/${rel}`).text();
      if (text.includes("public/examples") || text.includes("public${")) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });

  test("the two images M89 left unreferenced are gone", () => {
    expect(existsSync(`${ROOT}public/intro/output-checks.jpg`)).toBe(false);
    expect(existsSync(`${ROOT}public/intro/commit-3.jpg`)).toBe(false);
  });
});

const projects = await import(`${SRC}state/projects.ts`);
const { hasOwnStudy } = await import(`${SRC}ui/Walkthrough.tsx`);
const { ProjectList } = await import(`${SRC}ui/ProjectList.tsx`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);

describe("ISC-739: a copy already in a browser is an ordinary project", () => {

  const COPY = {
    id: "91919191-0000-4000-8000-000000000001",
    title: "Pitchwright at Coldharbour Launch",
    stage: "design-brief",
    createdAt: 1_760_000_000_000,
    brief: projects.emptyBrief(),
    importedAs: "example",
    exampleId: "d291ea48-cb8a-4163-90cc-41f7175fb570",
  };

  test("it reads back with its fields, and the gate counts it", async () => {
    await projects.saveProject(COPY as never);
    const listed = (await projects.listProjects()) as { id: string; importedAs?: string; exampleId?: string }[];
    const held = listed.find((p) => p.id === COPY.id);
    expect(held?.importedAs).toBe("example");
    expect(held?.exampleId).toBe(COPY.exampleId);
    expect(hasOwnStudy(listed as never)).toBe(true);
  });

  test("the project list renders it as a row without crashing", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        React.createElement(
          LedgerProvider as never,
          { store: new InMemoryLedgerStore() } as never,
          React.createElement(ProjectList as never),
        ),
      );
    });
    await act(async () => {
      await wait(40);
    });
    expect(host.textContent ?? "").toContain(COPY.title);
    await act(async () => root.unmount());
    host.remove();
    await projects.deleteProject(COPY.id);
  });
});

describe("ISC-740: an ordinary import is untouched", () => {
  test("the Coldharbour bundle comes in through the file door as a bundle, with no example mark", async () => {
    const { importBundleJson } = await import(`${SRC}export/importStudy.ts`);
    const saved: { importedAs?: string; exampleId?: string }[] = [];
    const project = await importBundleJson(readFileSync(FIXTURE, "utf8"), "bundle", {
      saveProject: async (p: never) => void saved.push(p),
      saveDocument: async () => undefined,
      saveChunks: async () => undefined,
      saveAnomaly: async () => undefined,
      saveTwin: async () => undefined,
      appendEvents: async () => undefined,
    });
    expect(project.importedAs).toBe("bundle");
    expect(project.exampleId).toBeUndefined();
    expect(saved).toHaveLength(1);
  });
});
