/**
 * M60, ISC-580. Option B takes any API key: Anthropic (as before), OpenAI,
 * Google Gemini, OpenRouter, or another OpenAI-compatible service by its base
 * URL. The key stays in sessionStorage under the existing rule, masked on
 * screen, never in localStorage. Calls go browser-direct where the provider
 * accepts a browser origin (tested from the hosted origin on 2026-09-28: OpenAI,
 * Gemini and OpenRouter all do), and otherwise through the bridge on this
 * machine, which relays in memory. Model names come from the provider's list;
 * each provider has a billing sentence saying whose account is charged.
 */

import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;
const { AuthPanel } = await import(`${SRC}auth/AuthPanel.tsx`);
const api = await import(`${SRC}inference/apiProviders.ts`);
const compat = await import(`${SRC}inference/openaiCompatible.ts`);
const auth = await import(`${SRC}auth/claudeAuth.ts`);
const copy = await import(`${SRC}auth/apiSteps.ts`);
const bridge = await import(`${SRC}inference/cliBridge.ts`);
const { activeInferenceClient } = await import(`${SRC}ui/personaRun.ts`);
const { AnthropicInferenceClient } = await import(`${SRC}inference/anthropic.ts`);

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

const OPENAI_KEY = "sk-proj-abcdefghijklmnopqrstuvwxyz0123";
const GEMINI_KEY = "AIzaSyA1234567890abcdefghijklmnopqrstu";
const OPENROUTER_KEY = "sk-or-v1-0123456789abcdef0123456789abcdef";

describe("ISC-580: the providers", () => {
  test("five choices, in the card's order", () => {
    expect(api.API_PROVIDERS).toEqual(["anthropic", "openai", "google", "openrouter", "compatible"]);
  });

  test("each named provider's OpenAI-compatible root; another service takes its own https root", () => {
    expect(api.apiBase({ provider: "openai" })).toBe("https://api.openai.com/v1");
    expect(api.apiBase({ provider: "google" })).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(api.apiBase({ provider: "openrouter" })).toBe("https://openrouter.ai/api/v1");
    expect(api.apiBase({ provider: "compatible", baseUrl: "https://api.together.xyz/v1" })).toBe("https://api.together.xyz/v1");
    expect(api.compatibleBase("https://api.together.xyz/v1/")).toBe("https://api.together.xyz/v1");
    expect(api.compatibleBase("http://api.together.xyz/v1")).toBeNull();
    expect(api.compatibleBase("https://localhost:8000/v1")).toBeNull();
  });

  test("what the record says: the provider's word, or the service's host", () => {
    expect(api.recordedProvider({ provider: "anthropic" })).toBe("anthropic");
    expect(api.recordedProvider({ provider: "openai" })).toBe("openai");
    expect(api.recordedProvider({ provider: "google" })).toBe("google");
    expect(api.recordedProvider({ provider: "openrouter" })).toBe("openrouter");
    expect(api.recordedProvider({ provider: "compatible", baseUrl: "https://api.together.xyz/v1" })).toBe("api.together.xyz");
  });

  test("OpenAI's list is cut to the chat models; Gemini's model ids lose their models/ prefix", () => {
    expect(api.chatModels("openai", ["gpt-5", "text-embedding-3-large", "tts-1", "dall-e-3", "whisper-1", "gpt-4o-mini", "o3"])).toEqual([
      "gpt-5",
      "gpt-4o-mini",
      "o3",
    ]);
    expect(api.chatModels("google", ["models/gemini-2.5-flash", "models/embedding-001"])).toEqual(["gemini-2.5-flash"]);
    expect(api.chatModels("openrouter", ["a/b", "c/d"])).toEqual(["a/b", "c/d"]);
  });
});

describe("ISC-580: the key, session-only, checked per provider", () => {
  test("each provider's key shape; a Claude token is never taken for another provider", () => {
    expect(auth.looksLikeKey("anthropic", "sk-" + "ant-api03-abcdefghijklmnop")).toBe(true);
    expect(auth.looksLikeKey("openai", OPENAI_KEY)).toBe(true);
    expect(auth.looksLikeKey("google", GEMINI_KEY)).toBe(true);
    expect(auth.looksLikeKey("openrouter", OPENROUTER_KEY)).toBe(true);
    expect(auth.looksLikeKey("compatible", "tgp_v1_abcdefghijkl")).toBe(true);
    expect(auth.looksLikeKey("openai", "sk-" + "ant-api03-abcdefghijklmnop")).toBe(false);
    expect(auth.looksLikeKey("compatible", "sk-" + "ant-oat01-abcdefghijklmnop")).toBe(false);
    expect(auth.looksLikeKey("openai", OPENROUTER_KEY)).toBe(false);
    expect(auth.looksLikeKey("google", "sk-abc")).toBe(false);
    expect(auth.looksLikeKey("compatible", "has space")).toBe(false);
  });

  test("the key and the choice go to the session and nowhere else; the choice holds no credential", () => {
    auth.setApiKey("openai", OPENAI_KEY);
    auth.setApiChoice({ provider: "openai", model: "gpt-5", route: "direct" });
    expect(local.writes).toEqual([]);
    expect(session.writes.map(([k]) => k)).toEqual(["bounds.auth.token", auth.API_CHOICE_SESSION_KEY]);
    const stored = session.getItem(auth.API_CHOICE_SESSION_KEY)!;
    expect(stored).not.toContain("sk-");
    expect(auth.getApiChoice()).toEqual({ provider: "openai", model: "gpt-5", route: "direct" });
  });

  test("no choice stored reads as Anthropic, as before M60", () => {
    expect(auth.getApiChoice()).toEqual({ provider: "anthropic" });
  });
});

function recording(reply: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init, body: init.body === undefined ? null : JSON.parse(String(init.body)) });
    return reply(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("ISC-580: the client", () => {
  test("OpenAI direct: the chat route, the bearer key, the chosen model, no length cap", async () => {
    auth.setApiKey("openai", OPENAI_KEY);
    auth.setApiChoice({ provider: "openai", model: "gpt-5", route: "direct" });
    const f = recording(() => Response.json({ model: "gpt-5-2026-08-01", choices: [{ message: { content: "Hello." } }] }));
    const client = new compat.OpenAICompatibleClient({ fetchImpl: f.fetchImpl });
    expect(client.requestedModel).toBe("gpt-5");
    const result = await client.complete({ system: "sys", messages: [{ role: "user", content: "q" }], maxTokens: 300 });
    expect(f.calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect((f.calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${OPENAI_KEY}`);
    expect(f.calls[0]!.body).toEqual({
      model: "gpt-5",
      stream: false,
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "q" },
      ],
    });
    expect(result).toMatchObject({ text: "Hello.", model: "gpt-5", modelVersion: "gpt-5-2026-08-01" });
  });

  test("Gemini and OpenRouter direct send the cap as max_tokens", async () => {
    auth.setApiKey("google", GEMINI_KEY);
    auth.setApiChoice({ provider: "google", model: "gemini-2.5-flash", route: "direct" });
    const f = recording(() => Response.json({ model: "gemini-2.5-flash", choices: [{ message: { content: "ok" } }] }));
    await new compat.OpenAICompatibleClient({ fetchImpl: f.fetchImpl }).complete({ system: "", messages: [], maxTokens: 300 });
    expect(f.calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(f.calls[0]!.body.max_tokens).toBe(300);
  });

  test("a stream: deltas painted in order, one result", async () => {
    auth.setApiKey("openrouter", OPENROUTER_KEY);
    auth.setApiChoice({ provider: "openrouter", model: "a/b", route: "direct" });
    const sse =
      `data: ${JSON.stringify({ model: "a/b", choices: [{ delta: { content: "Hel" } }] })}\n\n` +
      `data: ${JSON.stringify({ model: "a/b", choices: [{ delta: { content: "lo." } }] })}\n\ndata: [DONE]\n\n`;
    const f = recording(() => new Response(sse, { headers: { "content-type": "text/event-stream" } }));
    const painted: string[] = [];
    const result = await new compat.OpenAICompatibleClient({ fetchImpl: f.fetchImpl }).completeStream!(
      { system: "", messages: [] },
      (d: { text: string }) => painted.push(d.text),
    );
    expect(painted.join("")).toBe("Hello.");
    expect(result.text).toBe("Hello.");
    expect(f.calls[0]!.body.stream).toBe(true);
  });

  test("the relay route: the request goes to the bridge with the base, the key and the model", async () => {
    auth.setApiKey("compatible", "tgp_v1_abcdefghijkl");
    auth.setApiChoice({ provider: "compatible", baseUrl: "https://api.together.xyz/v1", model: "mixtral", route: "relay" });
    const f = recording(() => Response.json({ text: "relayed", model: "mixtral", modelVersion: "mixtral" }));
    const result = await new compat.OpenAICompatibleClient({ fetchImpl: f.fetchImpl }).complete({ system: "s", messages: [] });
    expect(f.calls[0]!.url.endsWith("/complete")).toBe(true);
    expect(f.calls[0]!.body).toMatchObject({
      provider: "relay",
      baseUrl: "https://api.together.xyz/v1",
      key: "tgp_v1_abcdefghijkl",
      model: "mixtral",
    });
    expect(result.text).toBe("relayed");
  });

  test("a refused call says the provider's message", async () => {
    auth.setApiKey("openai", OPENAI_KEY);
    auth.setApiChoice({ provider: "openai", model: "gpt-5", route: "direct" });
    const f = recording(() => Response.json({ error: { message: "Incorrect API key provided" } }, { status: 401 }));
    await expect(new compat.OpenAICompatibleClient({ fetchImpl: f.fetchImpl }).complete({ system: "", messages: [] })).rejects.toThrow(
      "Incorrect API key provided",
    );
  });

  test("the page picks the client from the choice: Anthropic stays Anthropic's", () => {
    auth.setApiKey("anthropic", "sk-" + "ant-api03-abcdefghijklmnop");
    expect(activeInferenceClient().client).toBeInstanceOf(AnthropicInferenceClient);
    auth.setApiKey("openai", OPENAI_KEY);
    auth.setApiChoice({ provider: "openai", model: "gpt-5", route: "direct" });
    expect(activeInferenceClient().client).toBeInstanceOf(compat.OpenAICompatibleClient);
  });
});

describe("ISC-580: the model list", () => {
  test("direct: the provider's list, cut to chat models", async () => {
    const f = recording(() => Response.json({ data: [{ id: "gpt-5" }, { id: "text-embedding-3-large" }] }));
    expect(await compat.listApiModels({ provider: "openai" }, OPENAI_KEY, f.fetchImpl)).toEqual({ route: "direct", models: ["gpt-5"] });
    expect(f.calls[0]!.url).toBe("https://api.openai.com/v1/models");
  });

  test("a service that refuses the page is asked through the bridge, and the route says so", async () => {
    const f = recording((url) => {
      if (url.includes("api.example.com")) throw new TypeError("Failed to fetch");
      return Response.json({ models: ["mixtral"] });
    });
    expect(
      await compat.listApiModels({ provider: "compatible", baseUrl: "https://api.example.com/v1" }, "tgp_v1_abcdefghijkl", f.fetchImpl),
    ).toEqual({ route: "relay", models: ["mixtral"] });
    expect(f.calls[1]!.url.endsWith("/models")).toBe(true);
    expect(f.calls[1]!.body).toEqual({ baseUrl: "https://api.example.com/v1", key: "tgp_v1_abcdefghijkl" });
  });

  test("a refused key is an error with the provider's words", async () => {
    const f = recording(() => Response.json({ error: { message: "API key not valid" } }, { status: 400 }));
    const r = await compat.listApiModels({ provider: "google" }, GEMINI_KEY, f.fetchImpl);
    expect(r).toEqual({ error: expect.stringContaining("API key not valid") });
  });
});

describe("ISC-580: the words", () => {
  test("one billing sentence per provider, each naming whose account is charged", () => {
    expect(copy.BILLING.anthropic).toBe(
      "Anthropic charges your console key per token, against your Anthropic console account rather than your Claude subscription.",
    );
    expect(copy.BILLING.openai).toBe(
      "OpenAI charges your API key per token, against your OpenAI API account rather than a ChatGPT subscription.",
    );
    expect(copy.BILLING.google).toBe(
      "Google charges your Gemini API key per token, against the Google Cloud project that the key belongs to, within any free tier that the project has.",
    );
    expect(copy.BILLING.openrouter).toBe("OpenRouter charges your key per token, against the credits on your OpenRouter account.");
    expect(copy.BILLING.compatible).toBe("The service at that address charges your key, against your account with that service.");
  });

  test("the relay sentence and the direct one", () => {
    expect(copy.ROUTE_SENTENCE.direct).toBe("Calls go from this page straight to the provider.");
    expect(copy.ROUTE_SENTENCE.relay).toBe(
      "This service doesn't take calls from a web page, so calls go through the bridge on this machine, which passes each one on without keeping a copy.",
    );
  });
});

describe("ISC-580: the card", () => {
  let host: HTMLElement;
  let root: Root;
  let routes: (url: string) => Response;

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/health")) return Response.json({ ok: true, claude: null, signedIn: null, providers: {} });
    if (url.endsWith("AbductiveBridge.dmg")) return new Response("", { status: 404 });
    return routes(url);
  }) as unknown as typeof fetch;

  async function mount() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<AuthPanel fetchImpl={fetchImpl} pollMs={20} waitMs={200} />));
    await act(async () => void (await wait(40)));
  }
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const text = () => host.textContent ?? "";
  const optionB = () => host.querySelector("[data-option-b]")!;
  const pick = async (label: string) => {
    const b = [...optionB().querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((x) => x.textContent === label)!;
    await act(async () => b.click());
  };
  const type = async (input: HTMLInputElement, value: string) => {
    const key = Object.keys(input).find((k) => k.startsWith("__reactProps$"))!;
    await act(async () => (input as any)[key].onChange({ target: { value } }));
  };

  test("Option B names any API key and offers five providers; Anthropic is first and chosen", async () => {
    routes = () => new Response("", { status: 404 });
    await mount();
    expect(text()).toContain("API key");
    const labels = [...optionB().querySelectorAll('[role="radio"]')].map((b) => b.textContent);
    expect(labels).toEqual(["Anthropic", "OpenAI", "Google Gemini", "OpenRouter", "Another OpenAI-compatible service"]);
    expect(text()).toContain(copy.BILLING.anthropic);
  });

  test("OpenAI: the key is taken, the models listed, one kept; the key shows masked and stays in the session", async () => {
    routes = (url) =>
      url === "https://api.openai.com/v1/models" ? Response.json({ data: [{ id: "gpt-5" }, { id: "gpt-5-mini" }] }) : new Response("", { status: 404 });
    await mount();
    await pick("OpenAI");
    expect(text()).toContain(copy.BILLING.openai);
    await type(optionB().querySelector<HTMLInputElement>('input[type="password"]')!, OPENAI_KEY);
    await act(async () => optionB().querySelector<HTMLButtonElement>("[data-api-connect]")!.click());
    await act(async () => void (await wait(40)));
    expect(text()).toContain("You're connected to OpenAI with key");
    expect(text()).toContain(auth.maskToken(OPENAI_KEY));
    expect(text()).not.toContain(OPENAI_KEY);
    expect(auth.getApiChoice()).toEqual({ provider: "openai", model: "gpt-5", route: "direct" });
    expect(local.writes).toEqual([]);
    expect(text()).toContain(copy.ROUTE_SENTENCE.direct);
    const select = optionB().querySelector<HTMLSelectElement>("select[data-api-model]")!;
    expect([...select.options].map((o) => o.value)).toEqual(["gpt-5", "gpt-5-mini"]);
  });

  test("another service: the base URL is asked for, and an http address is refused on the card", async () => {
    routes = () => new Response("", { status: 404 });
    await mount();
    await pick("Another OpenAI-compatible service");
    expect(text()).toContain(copy.BILLING.compatible);
    await type(optionB().querySelector<HTMLInputElement>("input[data-api-base]")!, "http://api.example.com/v1");
    await type(optionB().querySelector<HTMLInputElement>('input[type="password"]')!, "tgp_v1_abcdefghijkl");
    await act(async () => optionB().querySelector<HTMLButtonElement>("[data-api-connect]")!.click());
    expect(text()).toContain(copy.BASE_REFUSED);
    expect(session.getItem("bounds.auth.token")).toBeNull();
  });

  test("a key the provider refuses: nothing is kept, and the card says the provider's words", async () => {
    routes = () => Response.json({ error: { message: "Incorrect API key provided" } }, { status: 401 });
    await mount();
    await pick("OpenAI");
    await type(optionB().querySelector<HTMLInputElement>('input[type="password"]')!, OPENAI_KEY);
    await act(async () => optionB().querySelector<HTMLButtonElement>("[data-api-connect]")!.click());
    await act(async () => void (await wait(40)));
    expect(text()).toContain("Incorrect API key provided");
    expect(session.getItem("bounds.auth.token")).toBeNull();
  });
});

describe("ISC-580: the storage guarantee covers the new client", () => {
  test("openaiCompatible.ts and apiProviders.ts never name a persistent store in code", () => {
    const code = (f: string) =>
      readFileSync(`${SRC}${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const f of ["inference/openaiCompatible.ts", "inference/apiProviders.ts", "auth/apiSteps.ts"]) {
      expect(code(f)).not.toContain("localStorage");
      expect(code(f).toLowerCase()).not.toContain("indexeddb");
    }
  });
});
