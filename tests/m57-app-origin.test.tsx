/**
 * M57, ISC-561. Abductive Bridge serves the site on the bridge's own origin,
 * http://localhost:8787. The page there knows it: the bridge is same-origin
 * under /cli-bridge (which the app answers, like the dev server's proxy), the
 * probe runs without a kept choice, the "No model is connected" bar never shows
 * while the app answers signed in, and the Claude access card reads connected.
 * The console-key route goes to Anthropic directly, since the app has no
 * /anthropic-proxy and never forwards a credential.
 */

import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;
const origin = await import(`${SRC}inference/origin.ts`);
const bridge = await import(`${SRC}inference/cliBridge.ts`);
const { apiUrl } = await import(`${SRC}inference/anthropic.ts`);
const { activeInferenceClient } = await import(`${SRC}ui/personaRun.ts`);
const { OfflineBanner } = await import(`${SRC}ui/OfflineBanner.tsx`);
const { AuthPanel } = await import(`${SRC}auth/AuthPanel.tsx`);

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

/** Run with the page's location at host:port. */
async function at<T>(hostname: string, port: string, run: () => Promise<T> | T): Promise<T> {
  const was = { hostname: window.location.hostname, port: window.location.port };
  Object.defineProperty(window.location, "hostname", { value: hostname, configurable: true });
  Object.defineProperty(window.location, "port", { value: port, configurable: true });
  try {
    return await run();
  } finally {
    Object.defineProperty(window.location, "hostname", { value: was.hostname, configurable: true });
    Object.defineProperty(window.location, "port", { value: was.port, configurable: true });
  }
}

const healthy = () => Response.json({ ok: true, claude: "2.1.283 (Claude Code)", signedIn: true, bun: "app 1.1.0" });

let host: HTMLElement;
let root: Root;
const realFetch = globalThis.fetch;

beforeEach(() => {
  for (const name of ["sessionStorage", "localStorage"]) {
    Object.defineProperty(globalThis, name, { value: memoryStorage(), configurable: true, writable: true });
  }
  bridge.resetBridgeDetection();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  globalThis.fetch = realFetch;
  bridge.resetBridgeDetection();
});

describe("ISC-561: the page recognises the app's origin", () => {
  test("loopback on the bridge's port is the app; any other port is the dev server; elsewhere is hosted", () => {
    for (const h of ["localhost", "127.0.0.1", "[::1]"]) {
      expect({ h, app: origin.appOrigin(h, "8787"), dev: origin.devServerOrigin(h, "8787") }).toEqual({ h, app: true, dev: false });
      expect({ h, app: origin.appOrigin(h, "5173"), dev: origin.devServerOrigin(h, "5173") }).toEqual({ h, app: false, dev: true });
    }
    expect(origin.appOrigin("abductive.pages.dev", "8787")).toBe(false);
    expect(origin.appOrigin("localhost", "")).toBe(false);
    // A hostname alone, as older callers pass it, is never the app.
    expect(origin.devServerOrigin("localhost")).toBe(true);
  });

  test("on the app's origin the bridge is same-origin, under /cli-bridge", async () => {
    await at("localhost", "8787", () => {
      expect(bridge.bridgeBases()).toEqual(["/cli-bridge"]);
    });
  });

  test("on the app's origin a console key goes to Anthropic directly, since the app has no proxy", async () => {
    await at("localhost", "8787", () => {
      expect(apiUrl()).toBe("https://api.anthropic.com/v1/messages");
    });
    await at("localhost", "5173", () => {
      expect(apiUrl()).toBe("/anthropic-proxy/v1/messages");
    });
  });

  test("the probe runs with no kept choice and picks the bridge without a press", async () => {
    await at("localhost", "8787", async () => {
      const asked: string[] = [];
      const found = await bridge.detectBridge((async (url: RequestInfo | URL) => {
        asked.push(String(url));
        return healthy();
      }) as typeof fetch);
      expect(found).toBe(true);
      expect(asked).toEqual(["/cli-bridge/health"]);
      expect(activeInferenceClient().live).toBe(true);
    });
  });

  test("the bar never shows while the app answers signed in, not even before the probe returns", async () => {
    await at("localhost", "8787", async () => {
      let answer: (r: Response) => void = () => {};
      globalThis.fetch = (() => new Promise<Response>((r) => (answer = r))) as unknown as typeof fetch;
      await act(async () => root.render(<OfflineBanner />));
      expect(host.querySelector("[data-testid=offline-banner]")).toBeNull();
      await act(async () => {
        answer(healthy());
        await wait(20);
      });
      expect(host.querySelector("[data-testid=offline-banner]")).toBeNull();
    });
  });

  test("the bar shows on the app's origin when Claude Code is signed out", async () => {
    await at("localhost", "8787", async () => {
      globalThis.fetch = (async () =>
        Response.json({ ok: true, claude: "2.1.283 (Claude Code)", signedIn: false, bun: "app 1.1.0" })) as unknown as typeof fetch;
      await act(async () => root.render(<OfflineBanner />));
      await act(async () => {
        await wait(20);
      });
      expect(host.querySelector("[data-testid=offline-banner]")).not.toBeNull();
    });
  });

  test("the Claude access card reads connected on arrival", async () => {
    await at("localhost", "8787", async () => {
      const fetchImpl = (async (url: RequestInfo | URL) =>
        String(url).endsWith("/health") ? healthy() : new Response("<html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
      await act(async () => root.render(<AuthPanel fetchImpl={fetchImpl} launchApp={() => {}} />));
      await act(async () => {
        await wait(20);
      });
      expect(host.textContent).toContain("You're connected through Claude Code 2.1.283 on this machine.");
      expect(host.querySelector("[data-download-app]")).toBeNull();
    });
  });
});
