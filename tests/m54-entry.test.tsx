/**
 * M54, ISC-549 and ISC-550. The two ways in ("Connect one" on the no-model bar
 * and "Claude access" on the rail) land on the Claude access card, which reads
 * the machine on arrival; the bar leaves the moment the card connects; and the
 * README describes the hosted route in the card's own words.
 */

import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = new URL("../", import.meta.url).pathname;
const { OfflineBanner } = await import(`${SRC}ui/OfflineBanner.tsx`);
const { parseHash } = await import(`${SRC}ui/routes.ts`);
const bridge = await import(`${SRC}inference/cliBridge.ts`);
const steps = await import(`${SRC}auth/bridgeSteps.ts`);

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
}

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  for (const name of ["sessionStorage", "localStorage"]) {
    Object.defineProperty(globalThis, name, { value: memoryStorage(), configurable: true, writable: true });
  }
  bridge.resetBridgeDetection();
  bridge.forgetDetectedBridge();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  bridge.resetBridgeDetection();
});

describe("ISC-550: both ways in land on the Claude access card", () => {
  test("Connect one and Claude access both go to #/settings, which is the card", () => {
    const banner = readFileSync(`${SRC}ui/OfflineBanner.tsx`, "utf8");
    const shell = readFileSync(`${SRC}ui/AppShell.tsx`, "utf8");
    expect(banner).toMatch(/href="#\/settings"[\s\S]{0,200}Connect a model/);
    expect(shell).toMatch(/href="#\/settings"[\s\S]{0,200}Model access/);
    expect(shell).toContain('route.view === "settings" && <AuthPanel />');
    expect(parseHash("#/settings")).toEqual({ view: "settings" });
  });

  test("the card reads the machine on arrival, with no press", () => {
    const panel = readFileSync(`${SRC}auth/AuthPanel.tsx`, "utf8");
    // The mount effect starts the same check the button does.
    expect(panel).toMatch(/useEffect\(\(\) => \{[\s\S]{0,200}if \(!cliProviderSelected\(\)\) void useCliBridge\(\);/);
  });
});

describe("ISC-549: the no-model bar leaves without a reload", () => {
  test("choosing the CLI in this tab takes the bar away", async () => {
    await act(async () => root.render(<OfflineBanner />));
    await act(async () => {
      await wait(20);
    });
    expect(host.querySelector("[data-testid=offline-banner]")).not.toBeNull();
    await act(async () => bridge.selectCliProvider());
    expect(host.querySelector("[data-testid=offline-banner]")).toBeNull();
    await act(async () => bridge.clearCliProvider());
    expect(host.querySelector("[data-testid=offline-banner]")).not.toBeNull();
  });
});

/* The public research copy (abductive-orgsci) documents the local route only: the hosted
 * site is off, so the README no longer carries the hosted-route or Mac-app sections this
 * block checked. */
