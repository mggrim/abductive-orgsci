/**
 * M60, ISC-579. A local turn records provider "local" with the server's name
 * (Ollama, LM Studio, llama.cpp, or "port N") and the model, and the replay
 * and the JSON exports print it where recorded: "(Local, Ollama, llama3.2:1b)".
 * Additive: older events carry neither field and print as they always have.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { buildSessionReplay } from "../src/export/sessionReplay.ts";
import { providerField } from "../src/inference/types.ts";
import { CliBridgeInferenceClient, resetBridgeDetection, checkBridgeHealth } from "../src/inference/cliBridge.ts";
import { keepLane, keepLocalModel } from "../src/inference/providerChoice.ts";

const challenge = (extra: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  ts: 1,
  actor: "persona:interviewer",
  projectId: "p",
  model: "llama3.2:1b",
  modelVersion: "llama3.2:1b",
  type: "response",
  text: "What did the nurse say?",
  ...extra,
});

const replay = (events: LedgerEvent[]) =>
  buildSessionReplay({ project: { id: "p", title: "t" } as never, events, now: () => 0 });

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

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: memoryStorage(), configurable: true, writable: true });
  resetBridgeDetection();
});

describe("ISC-579: the envelope carries the local server", () => {
  test("local with a server validates; a server without the local lane, or an empty one, is refused", () => {
    expect(validateEvent(challenge({ provider: "local", server: "Ollama" }) as never)).toEqual([]);
    expect(validateEvent(challenge({ provider: "local" }) as never)).toEqual([]);
    expect(validateEvent(challenge({ provider: "claude", server: "Ollama" }) as never)).toContain(
      'server is recorded only beside provider "local"',
    );
    expect(validateEvent(challenge({ provider: "local", server: "" }) as never)).toContain(
      "server must be a non-empty name of at most 40 characters",
    );
  });

  test("the fields spread together, and a server rides only with the local lane", () => {
    expect(providerField({ provider: "local", server: "Ollama" })).toEqual({ provider: "local", server: "Ollama" });
    expect(providerField({ provider: "claude", server: "Ollama" })).toEqual({ provider: "claude" });
    expect(providerField({})).toEqual({});
  });
});

describe("ISC-579: the client names the server it reached", () => {
  const reply = (async () =>
    Response.json({ text: "hi", model: "llama3.2:1b", modelVersion: "llama3.2:1b" })) as unknown as typeof fetch;

  test("the server the last health reply found: Ollama on 11434", async () => {
    keepLane("local");
    keepLocalModel("llama3.2:1b");
    await checkBridgeHealth(
      (async () =>
        Response.json({
          ok: true,
          claude: null,
          signedIn: null,
          providers: { local: { reachable: true, endpoint: "http://127.0.0.1:11434", models: ["llama3.2:1b"], needsKey: false } },
        })) as unknown as typeof fetch,
    );
    const result = await new CliBridgeInferenceClient({ fetchImpl: reply }).complete({ system: "s", messages: [] });
    expect(result.provider).toBe("local");
    expect(result.server).toBe("Ollama");
  });

  test("a named endpoint in the session wins: port 9000", async () => {
    keepLane("local");
    sessionStorage.setItem("bounds.local.endpoint", "http://127.0.0.1:9000");
    const result = await new CliBridgeInferenceClient({ fetchImpl: reply }).complete({ system: "s", messages: [] });
    expect(result.server).toBe("port 9000");
  });

  test("the CLI lanes name no server", async () => {
    keepLane("codex");
    const result = await new CliBridgeInferenceClient({ fetchImpl: reply }).complete({ system: "s", messages: [] });
    expect(result.server).toBeUndefined();
  });
});

describe("ISC-579: the replay prints the local lane where recorded", () => {
  test("(Local, Ollama, llama3.2:1b)", () => {
    const md = replay([challenge({ provider: "local", server: "Ollama" }) as LedgerEvent]);
    expect(md).toContain("## Reply from Abductive (Local, Ollama, llama3.2:1b)");
  });

  test("a local turn with no server recorded: (Local, llama3.2:1b); a differing version follows the model", () => {
    expect(replay([challenge({ provider: "local" }) as LedgerEvent])).toContain("(Local, llama3.2:1b)");
    expect(replay([challenge({ provider: "local", server: "port 8000", modelVersion: "q4" }) as LedgerEvent])).toContain(
      "(Local, port 8000, llama3.2:1b q4)",
    );
  });

  test("every writer spreads the server with the lane: none copies the provider by hand", () => {
    for (const file of ["twin/twin.ts"]) {
      const src = readFileSync(new URL(`../src/${file}`, import.meta.url).pathname, "utf8");
      expect(src).not.toMatch(/\{ provider: (event|result)\.provider \}|\{ provider \}/);
    }
  });
});
