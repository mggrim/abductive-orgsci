/**
 * M60, ISC-578. The card offers "Use a local model" beside Claude Code and
 * Codex: the server the bridge found and its models in a list (the chosen model
 * kept beside the lane under its own key, no credential), an optional endpoint
 * for a server on another port, an optional key for a server that asks for one
 * (held for the browser session only, masked like the console key), the state
 * sentences with one line per known server on how to start it, and the line
 * that nothing leaves the Mac.
 */

import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;
const { AuthPanel } = await import(`${SRC}auth/AuthPanel.tsx`);
const steps = await import(`${SRC}auth/bridgeSteps.ts`);
const bridge = await import(`${SRC}inference/cliBridge.ts`);
const choice = await import(`${SRC}inference/providerChoice.ts`);
const auth = await import(`${SRC}auth/claudeAuth.ts`);
const { activeInferenceClient } = await import(`${SRC}ui/personaRun.ts`);

const CLAUDE_OK = { version: "2.1.283 (Claude Code)", signedIn: true };
const CODEX_NONE = { version: null, signedIn: null };
type Local = { reachable: boolean; endpoint: string | null; models: string[]; needsKey: boolean };
const health = (local?: Local) => ({
  ok: true,
  claude: CLAUDE_OK.version,
  signedIn: true,
  bun: "1.3.14",
  providers: { claude: CLAUDE_OK, codex: CODEX_NONE, ...(local === undefined ? {} : { local }) },
});
const OLLAMA: Local = { reachable: true, endpoint: "http://127.0.0.1:11434", models: ["llama3.2:1b", "qwen2.5:0.5b", "gemma3:1b"], needsKey: false };
const EMPTY: Local = { reachable: true, endpoint: "http://127.0.0.1:11434", models: [], needsKey: false };
const KEYED: Local = { reachable: true, endpoint: "http://127.0.0.1:8000", models: [], needsKey: true };
const NONE: Local = { reachable: false, endpoint: null, models: [], needsKey: false };

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
  bridge.resetBridgeDetection();
});

afterEach(() => bridge.resetBridgeDetection());

describe("ISC-578: the local lane's steps", () => {
  test("found with models is ready; no server, no models and a key asked are their own steps", () => {
    expect(steps.bridgeStep(health(OLLAMA), "local")).toBe("ready");
    expect(steps.bridgeStep(health(NONE), "local")).toBe("no-local");
    expect(steps.bridgeStep(health(EMPTY), "local")).toBe("local-no-models");
    expect(steps.bridgeStep(health(KEYED), "local")).toBe("local-needs-key");
  });

  test("a bridge from before M60 does not report the lane, and says to update it", () => {
    expect(steps.bridgeStep(health(), "local")).toBe("local-old-bridge");
    expect(steps.bridgeStep(health(), "claude")).toBe("ready");
  });

  test("no bridge and a taken port are shared by all three lanes", () => {
    expect(steps.bridgeStep({ ok: false, reason: "unreachable" }, "local")).toBe("no-bridge");
    expect(steps.bridgeStep({ ok: false, reason: "not-bridge" }, "local")).toBe("port-taken");
  });

  test("the server is named from its port", () => {
    expect(bridge.localServerName("http://127.0.0.1:11434")).toBe("Ollama");
    expect(bridge.localServerName("http://127.0.0.1:1234")).toBe("LM Studio");
    expect(bridge.localServerName("http://127.0.0.1:8080")).toBe("llama.cpp");
    expect(bridge.localServerName("http://127.0.0.1:8000")).toBe("port 8000");
  });

  test("the sentences, one per state, and one start line per known server", () => {
    expect(steps.STEP_SENTENCE["no-local"]).toBe(
      "The bridge is running, but none of the local model servers on this Mac answered. Start one with the line for your server below, and Abductive connects once it's running.",
    );
    expect(steps.LOCAL_START).toEqual([
      "Ollama: run ollama serve, then ollama pull <model>.",
      "LM Studio: run lms server start, then load a model in LM Studio.",
      "llama.cpp: run llama-server -m <model file>, which listens on port 8080.",
    ]);
    expect(steps.localSentence("local-no-models", EMPTY)).toBe(
      "Ollama is running on port 11434. Run ollama pull <model> in a terminal, and Abductive connects once the model is there.",
    );
    expect(steps.localSentence("local-no-models", { ...EMPTY, endpoint: "http://127.0.0.1:1234" })).toBe(
      "LM Studio is running on port 1234. Load a model in LM Studio, and Abductive connects once the model is there.",
    );
    expect(steps.localSentence("local-needs-key", KEYED)).toBe(
      "The server on port 8000 asks for a key. Type the server's key in the field below, and Abductive connects once the key works.",
    );
    expect(steps.localConnectedSentence("http://127.0.0.1:11434", "llama3.2:1b")).toBe(
      "You're connected to Ollama on port 11434, using llama3.2:1b.",
    );
    expect(steps.localConnectedSentence("http://127.0.0.1:8000", "gemma")).toBe(
      "You're connected to the server on port 8000, using gemma.",
    );
    expect(steps.LOCAL_STAYS).toBe("A local model runs on this Mac, and your data stays on this Mac.");
  });
});

describe("ISC-578: what is kept, and where", () => {
  test("the lane is the literal local; the model is kept under its own key; nothing else persists", () => {
    choice.keepLane("local");
    choice.keepLocalModel("llama3.2:1b");
    expect(local.writes).toEqual([
      [choice.LANE_KEY, "local"],
      [choice.LOCAL_MODEL_KEY, "llama3.2:1b"],
    ]);
    expect(choice.keptLane()).toBe("local");
    expect(choice.keptLocalModel()).toBe("llama3.2:1b");
    expect(choice.LOCAL_MODEL_KEY).not.toBe(choice.LANE_KEY);
  });

  test("the local key and a named endpoint live in the session only, and the key is masked", () => {
    auth.setLocalKey("local-secret-key-1234");
    auth.setLocalEndpoint("http://127.0.0.1:9000");
    expect(local.writes).toEqual([]);
    expect(session.writes.map(([k]) => k)).toEqual([auth.LOCAL_KEY_SESSION_KEY, auth.LOCAL_ENDPOINT_SESSION_KEY]);
    expect(auth.getLocalKey()).toBe("local-secret-key-1234");
    expect(auth.maskToken("local-secret-key-1234")).not.toContain("secret");
    auth.clearLocalKey();
    expect(auth.getLocalKey()).toBeNull();
  });

  test("a stored model name with whitespace or a credential shape is not kept", () => {
    expect(() => choice.keepLocalModel("sk-" + "ant-api03-abc")).toThrow();
    expect(() => choice.keepLocalModel("two words")).toThrow();
    expect(local.writes).toEqual([]);
  });

  test("the endpoint field takes a port or a loopback address and nothing else", () => {
    expect(bridge.localEndpoint("9000")).toBe("http://127.0.0.1:9000");
    expect(bridge.localEndpoint("http://localhost:9000/v1")).toBe("http://127.0.0.1:9000");
    expect(bridge.localEndpoint("http://192.168.1.20:11434")).toBeNull();
    expect(bridge.localEndpoint("https://api.openai.com/v1")).toBeNull();
    expect(bridge.localEndpoint("8787")).toBeNull();
  });
});

describe("ISC-578: the client runs a local turn", () => {
  function recordingFetch(reply: Record<string, unknown>) {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json(reply);
    }) as unknown as typeof fetch;
    return { fetchImpl, bodies };
  }

  test("provider local, the kept model; the session's endpoint and key go with the request", async () => {
    choice.keepLane("local");
    choice.keepLocalModel("llama3.2:1b");
    auth.setLocalEndpoint("http://127.0.0.1:9000");
    auth.setLocalKey("k-123-abcdef");
    const f = recordingFetch({ text: "hi", model: "llama3.2:1b", modelVersion: "llama3.2:1b" });
    const client = new bridge.CliBridgeInferenceClient({ fetchImpl: f.fetchImpl });
    expect(client.requestedModel).toBe("llama3.2:1b");
    const result = await client.complete({ system: "s", messages: [{ role: "user", content: "q" }] });
    expect(f.bodies[0]).toMatchObject({
      provider: "local",
      model: "llama3.2:1b",
      endpoint: "http://127.0.0.1:9000",
      key: "k-123-abcdef",
    });
    expect(result.provider).toBe("local");
    // The request names the lane; the server's name is for the record only.
    expect(f.bodies[0]).not.toHaveProperty("server");
    // A turn stopped before its final frame is filed under the server too.
    expect(client.server).toBe("port 9000");
  });

  test("with no endpoint or key in the session, neither is sent", async () => {
    choice.keepLane("local");
    choice.keepLocalModel("llama3.2:1b");
    const f = recordingFetch({ text: "hi", model: "llama3.2:1b", modelVersion: "llama3.2:1b" });
    await new bridge.CliBridgeInferenceClient({ fetchImpl: f.fetchImpl }).complete({ system: "s", messages: [] });
    expect(Object.keys(f.bodies[0]!)).not.toContain("endpoint");
    expect(Object.keys(f.bodies[0]!)).not.toContain("key");
  });
});

describe("ISC-578: connected means a local server with a model", () => {
  const answering = (h: unknown) => (async () => Response.json(h)) as unknown as typeof fetch;

  test("the local lane with models: connected", async () => {
    bridge.selectCliProvider();
    choice.keepLane("local");
    bridge.resetBridgeDetection();
    expect(await bridge.detectBridge(answering(health(OLLAMA)))).toBe(true);
    expect(activeInferenceClient().live).toBe(true);
  });

  test("no local server, or one asking for a key: not connected", async () => {
    bridge.selectCliProvider();
    choice.keepLane("local");
    for (const h of [health(NONE), health(KEYED), health(EMPTY)]) {
      bridge.resetBridgeDetection();
      expect(await bridge.detectBridge(answering(h))).toBe(false);
    }
  });

  test("a probe with a key or an endpoint in the session asks with POST and sends both", async () => {
    auth.setLocalKey("k-123-abcdef");
    auth.setLocalEndpoint("http://127.0.0.1:8000");
    const sent: RequestInit[] = [];
    const f = (async (_: RequestInfo | URL, init?: RequestInit) => {
      sent.push(init ?? {});
      return Response.json(health(OLLAMA));
    }) as unknown as typeof fetch;
    await bridge.checkBridgeHealth(f, 1000, bridge.localAsk());
    expect(sent[0]!.method).toBe("POST");
    expect(JSON.parse(String(sent[0]!.body))).toEqual({ local: { endpoint: "http://127.0.0.1:8000", key: "k-123-abcdef" } });
  });
});

describe("ISC-578: the card", () => {
  let host: HTMLElement;
  let root: Root;
  let current: unknown;
  let asked: { method: string; body: unknown }[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).endsWith("/health")) throw new Error(`unexpected ${String(input)}`);
    asked.push({ method: init?.method ?? "GET", body: init?.body === undefined ? null : JSON.parse(String(init.body)) });
    return Response.json(current);
  }) as unknown as typeof fetch;

  async function mount() {
    asked = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<AuthPanel fetchImpl={fetchImpl} pollMs={20} waitMs={400} />);
    });
    await act(async () => void (await wait(40)));
  }

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    bridge.clearCliProvider();
  });

  const text = () => host.textContent ?? "";
  const radio = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent === label)!;
  const press = async (label: string) => {
    await act(async () => radio(label).click());
    await act(async () => void (await wait(60)));
  };
  /** React's own onChange for the field, as the suite's other forms are driven (a DOM input event does not reach it here). */
  const type = async (input: HTMLInputElement, value: string) => {
    const key = Object.keys(input).find((k) => k.startsWith("__reactProps$"))!;
    const props = (input as unknown as Record<string, { onChange: (e: unknown) => void }>)[key]!;
    await act(async () => props.onChange({ target: { value } }));
  };

  test("three lanes; Option A names the local model; the local lane shows the server, its models and the line", async () => {
    current = health(OLLAMA);
    await mount();
    expect(text()).toContain("Subscription or local model");
    const group = host.querySelector('[aria-label="Which CLI this page uses"]')!;
    expect([...group.querySelectorAll('[role="radio"]')].map((b) => b.textContent)).toEqual([
      "Use Claude Code",
      "Use Codex",
      "Use a local model",
    ]);
    await press("Use a local model");
    expect(choice.keptLane()).toBe("local");
    expect(text()).toContain("You're connected to Ollama on port 11434, using llama3.2:1b.");
    expect(text()).toContain("A local model runs on this Mac, and your data stays on this Mac.");
    const models = [...host.querySelectorAll('[data-local-model]')].map((b) => b.getAttribute("data-local-model"));
    expect(models).toEqual(["llama3.2:1b", "qwen2.5:0.5b", "gemma3:1b"]);
    // The first model is kept when the reader has not picked one.
    expect(choice.keptLocalModel()).toBe("llama3.2:1b");
  });

  test("picking another model keeps it, and the connected sentence follows", async () => {
    current = health(OLLAMA);
    await mount();
    await press("Use a local model");
    await act(async () => host.querySelector<HTMLButtonElement>('[data-local-model="qwen2.5:0.5b"]')!.click());
    expect(choice.keptLocalModel()).toBe("qwen2.5:0.5b");
    expect(text()).toContain("You're connected to Ollama on port 11434, using qwen2.5:0.5b.");
  });

  test("no local server: the sentence and one start line per known server; the line still shows", async () => {
    current = health(NONE);
    await mount();
    await press("Use a local model");
    expect(text()).toContain(steps.STEP_SENTENCE["no-local"]);
    for (const line of steps.LOCAL_START) expect(text()).toContain(line);
    expect(text()).toContain("A local model runs on this Mac, and your data stays on this Mac.");
    expect(text()).not.toContain("You're connected");
  });

  test("a server with no models: its own sentence", async () => {
    current = health(EMPTY);
    await mount();
    await press("Use a local model");
    expect(text()).toContain(steps.localSentence("local-no-models", EMPTY));
  });

  test("a server asking for a key: the key goes in the session, masked, and the probe carries it", async () => {
    current = health(KEYED);
    await mount();
    await press("Use a local model");
    expect(text()).toContain(steps.localSentence("local-needs-key", KEYED));
    const key = host.querySelector<HTMLInputElement>('input[data-local-key]')!;
    expect(key.type).toBe("password");
    await type(key, "omlx-key-0123456789");
    current = health({ ...KEYED, models: ["gemma"], needsKey: false });
    await act(async () => host.querySelector<HTMLButtonElement>("[data-local-check]")!.click());
    await act(async () => void (await wait(80)));
    expect(auth.getLocalKey()).toBe("omlx-key-0123456789");
    expect(local.writes.some(([, v]) => v.includes("omlx-key"))).toBe(false);
    expect(asked.at(-1)).toEqual({ method: "POST", body: { local: { key: "omlx-key-0123456789" } } });
    expect(text()).toContain("You're connected to the server on port 8000, using gemma.");
    expect(text()).not.toContain("omlx-key-0123456789");
    expect(text()).toContain(auth.maskToken("omlx-key-0123456789"));
  });

  test("a server on another port: the field takes the port and the probe names it", async () => {
    current = health(NONE);
    await mount();
    await press("Use a local model");
    const field = host.querySelector<HTMLInputElement>("input[data-local-endpoint]")!;
    await type(field, "9000");
    current = health({ reachable: true, endpoint: "http://127.0.0.1:9000", models: ["phi"], needsKey: false });
    await act(async () => host.querySelector<HTMLButtonElement>("[data-local-check]")!.click());
    await act(async () => void (await wait(80)));
    expect(auth.getLocalEndpoint()).toBe("http://127.0.0.1:9000");
    expect(asked.at(-1)).toEqual({ method: "POST", body: { local: { endpoint: "http://127.0.0.1:9000" } } });
    expect(text()).toContain("You're connected to the server on port 9000, using phi.");
  });

  test("an address off this Mac is not sent, and the card says why", async () => {
    current = health(NONE);
    await mount();
    await press("Use a local model");
    await type(host.querySelector<HTMLInputElement>("input[data-local-endpoint]")!, "http://192.168.1.20:11434");
    await act(async () => host.querySelector<HTMLButtonElement>("[data-local-check]")!.click());
    await act(async () => void (await wait(40)));
    // The card keeps polling the usual ports while it waits; the LAN address is never among what it sends.
    expect(JSON.stringify(asked)).not.toContain("192.168.1.20");
    expect(auth.getLocalEndpoint()).toBeNull();
    expect(text()).toContain(steps.LOCAL_ENDPOINT_REFUSED);
  });

  test("the bridge is too old for the lane: the card says so", async () => {
    current = health();
    await mount();
    await press("Use a local model");
    expect(text()).toContain(steps.STEP_SENTENCE["local-old-bridge"]);
  });
});

describe("ISC-578: the static guarantee holds with the new fields", () => {
  test("the credential files still never mention localStorage, and the local key is sessionStorage only", () => {
    // Code, not comments: the files' own comments state the rule by naming the store.
    const code = (f: string) =>
      readFileSync(`${SRC}${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const file of ["auth/AuthPanel.tsx", "auth/claudeAuth.ts", "inference/anthropic.ts"]) {
      expect(code(file)).not.toContain("localStorage");
    }
    const authSrc = readFileSync(`${SRC}auth/claudeAuth.ts`, "utf8");
    expect(authSrc).toContain("LOCAL_KEY_SESSION_KEY");
  });
});
