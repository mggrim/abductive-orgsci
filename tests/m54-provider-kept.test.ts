/**
 * M54, ISC-549. The choice of the local CLI is kept across tabs and visits
 * until the reader stops it, and a kept choice is still checked on load.
 *
 * The choice is one word, "cli", under one key. It is not a credential: the
 * subscription credential stays with the CLI, and the console key stays in
 * sessionStorage (ISC-37, `tests/auth.test.ts`, unchanged).
 */

import { useDom } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CLI_PROVIDER_KEY } from "../src/inference/providerChoice.ts";
import {
  bridgeBase,
  clearCliProvider,
  cliProviderSelected,
  detectBridge,
  resetBridgeDetection,
  selectCliProvider,
} from "../src/inference/cliBridge.ts";
import { activeInferenceClient } from "../src/ui/personaRun.ts";

function memoryStorage(): Storage & { writes: [string, string][] } {
  const map = new Map<string, string>();
  const writes: [string, string][] = [];
  return {
    writes,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => {
      writes.push([k, v]);
      map.set(k, String(v));
    },
  };
}

let local: ReturnType<typeof memoryStorage>;
let session: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  local = memoryStorage();
  session = memoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: session, configurable: true, writable: true });
  resetBridgeDetection();
});

afterEach(() => resetBridgeDetection());

function withHost<T>(hostname: string, run: () => Promise<T>): Promise<T> {
  const original = window.location.hostname;
  Object.defineProperty(window.location, "hostname", { value: hostname, configurable: true });
  return run().finally(() => {
    Object.defineProperty(window.location, "hostname", { value: original, configurable: true });
  });
}

const healthy = (async () =>
  Response.json({ ok: true, claude: "2.1.283", signedIn: true, bun: "1.3.14" })) as unknown as typeof fetch;
const dead = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;

describe("ISC-549: the choice is kept until the reader stops it", () => {
  test("selecting writes one word to localStorage, and a new tab reads it", () => {
    selectCliProvider();
    expect(local.writes).toEqual([[CLI_PROVIDER_KEY, "cli"]]);
    expect(session.writes).toEqual([]);
    // A second tab or tomorrow's visit: same store, nothing in memory.
    resetBridgeDetection();
    expect(cliProviderSelected()).toBe(true);
  });

  test("Disconnect clears the kept choice", () => {
    selectCliProvider();
    clearCliProvider();
    expect(local.getItem(CLI_PROVIDER_KEY)).toBeNull();
    expect(cliProviderSelected()).toBe(false);
  });

  test("a store that refuses does not break the choice for this page", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => undefined,
      },
      configurable: true,
      writable: true,
    });
    expect(() => selectCliProvider()).not.toThrow();
    expect(cliProviderSelected()).toBe(false);
  });

  test("providerChoice.ts writes the literal \"cli\" under its key and nothing else", () => {
    const code = (path: string) =>
      readFileSync(new URL(path, import.meta.url).pathname, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
    const module = code("../src/inference/providerChoice.ts");
    const writes = [...module.matchAll(/localStorage\.setItem\(([^)]*)\)/g)].map((m) => m[1]);
    // M56 added the lane beside it, written as one of two literal names.
    // M56 kept the lane beside it, M60 the local model: a lane word and a model name, never a credential.
    // ISC-591 the CLI lanes' models: a name on the lane's own list, checked before it is written.
    expect(writes).toEqual([
      'CLI_PROVIDER_KEY, "cli"',
      "LANE_KEY, laneThisPage",
      "LOCAL_MODEL_KEY, n",
      "CLI_MODEL_KEY[lane], model",
    ]);
    expect(module).not.toContain("sessionStorage");
    expect(module.toLowerCase()).not.toContain("indexeddb");
    // The one exception lives here and nowhere else in the inference code.
    expect(code("../src/inference/cliBridge.ts")).not.toContain("localStorage");
  });
});

describe("ISC-549: a kept choice is checked on load, on any origin", () => {
  test("hosted, with no kept choice: no request, as in M36", async () => {
    await withHost("abductive.pages.dev", async () => {
      let asked = 0;
      const counting = (async () => {
        asked += 1;
        return Response.json({ ok: true });
      }) as unknown as typeof fetch;
      expect(await detectBridge(counting)).toBe(false);
      expect(asked).toBe(0);
    });
  });

  test("hosted, with a kept choice: the probe runs and the client aims where it answered", async () => {
    await withHost("abductive.pages.dev", async () => {
      localStorage.setItem(CLI_PROVIDER_KEY, "cli"); // kept from an earlier visit
      expect(await detectBridge(healthy)).toBe(true);
      expect(bridgeBase()).toBe("http://localhost:8787");
      expect(activeInferenceClient().live).toBe(true);
    });
  });

  test("a load probe that failed stops counting once the card connects", async () => {
    await withHost("localhost", async () => {
      expect(await detectBridge(dead)).toBe(false);
      expect(activeInferenceClient().live).toBe(false);
      selectCliProvider();
      expect(activeInferenceClient().live).toBe(true);
    });
  });

  test("a kept choice whose bridge is not running today reads as no model, and stays kept", async () => {
    await withHost("abductive.pages.dev", async () => {
      localStorage.setItem(CLI_PROVIDER_KEY, "cli"); // kept from yesterday
      expect(await detectBridge(dead)).toBe(false);
      expect(activeInferenceClient().live).toBe(false);
      expect(cliProviderSelected()).toBe(true);
    });
  });
});
