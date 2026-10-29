/**
 * M60, ISC-581. An API turn records its provider (anthropic, openai, google,
 * openrouter, or another service's host) beside its model, and the replay
 * prints it where recorded: "(OpenAI, gpt-5)". Additive: events from before
 * M60, the shipped example among them, carry no such provider and print as
 * they always have.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { validateEvent } from "../src/ledger/events.ts";
import { buildSessionReplay } from "../src/export/sessionReplay.ts";
import { parseBundle } from "../src/export/bundle.ts";
import { AnthropicInferenceClient } from "../src/inference/anthropic.ts";
import { OpenAICompatibleClient } from "../src/inference/openaiCompatible.ts";

const turn = (extra: Record<string, unknown>) =>
  ({
    id: crypto.randomUUID(),
    ts: 1,
    actor: "persona:interviewer",
    projectId: "p",
    type: "response",
    text: "What did the nurse say?",
    ...extra,
  }) as LedgerEvent;
const replay = (events: LedgerEvent[]) =>
  buildSessionReplay({ project: { id: "p", title: "t" } as never, events, now: () => 0 });

describe("ISC-581: the envelope takes an API's provider", () => {
  test("each named provider and a service's host validate; a bare word that is none of them is refused", () => {
    for (const provider of ["anthropic", "openai", "google", "openrouter", "api.together.xyz", "llm.example.org:8443"]) {
      expect(validateEvent(turn({ provider, model: "m", modelVersion: "m" }) as never)).toEqual([]);
    }
    for (const provider of ["gemini", "", "UPPER.example.com", "a b.com", 7]) {
      expect(validateEvent(turn({ provider, model: "m", modelVersion: "m" }) as never).length).toBeGreaterThan(0);
    }
  });
});

describe("ISC-581: the clients say who ran the turn", () => {
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
    Object.defineProperty(globalThis, "sessionStorage", { value: memoryStorage(), configurable: true, writable: true });
  });

  test("Anthropic: provider anthropic", async () => {
    const client = new AnthropicInferenceClient({
      getToken: () => "sk-" + "ant-api03-abcdefghijklmnop",
      fetchImpl: (async () =>
        Response.json({ model: "claude-sonnet-4-6-20250929", content: [{ type: "text", text: "Hi." }] })) as unknown as typeof fetch,
    });
    expect(client.provider).toBe("anthropic");
    expect((await client.complete({ system: "", messages: [] })).provider).toBe("anthropic");
  });

  test("OpenAI, OpenRouter, and another service by its host", async () => {
    const reply = (async () => Response.json({ model: "x", choices: [{ message: { content: "ok" } }] })) as unknown as typeof fetch;
    for (const [choice, want] of [
      [{ provider: "openai", model: "gpt-5", route: "direct" }, "openai"],
      [{ provider: "google", model: "gemini-2.5-flash", route: "direct" }, "google"],
      [{ provider: "openrouter", model: "a/b", route: "direct" }, "openrouter"],
      [{ provider: "compatible", baseUrl: "https://api.together.xyz/v1", model: "m", route: "direct" }, "api.together.xyz"],
    ] as const) {
      const client = new OpenAICompatibleClient({ fetchImpl: reply, getChoice: () => choice, getKey: () => "k-12345678" });
      expect(client.provider).toBe(want);
      expect((await client.complete({ system: "", messages: [] })).provider).toBe(want);
    }
  });
});

describe("ISC-581: the replay prints the API beside the model", () => {
  test("(OpenAI, gpt-5), the version only when it differs", () => {
    expect(replay([turn({ provider: "openai", model: "gpt-5", modelVersion: "gpt-5" })])).toContain(
      "## Reply from Abductive (OpenAI, gpt-5)",
    );
    expect(replay([turn({ provider: "openai", model: "gpt-5", modelVersion: "gpt-5-2026-08-01" })])).toContain(
      "(OpenAI, gpt-5 gpt-5-2026-08-01)",
    );
  });

  test("each provider's name, and a service's host as itself", () => {
    const line = (provider: string) => replay([turn({ provider, model: "m", modelVersion: "m" })]);
    expect(line("anthropic")).toContain("(Anthropic, m)");
    expect(line("google")).toContain("(Google Gemini, m)");
    expect(line("openrouter")).toContain("(OpenRouter, m)");
    expect(line("api.together.xyz")).toContain("(api.together.xyz, m)");
  });

  /* M91 (2026-10-14): the example left the product and its bundle is the
   * fixture tests/fixtures/coldharbour.bundle.json, the same bytes. */
  test("an old bundle's replay is unchanged: no event in the Coldharbour fixture names a provider", () => {
    const bundle = parseBundle(
      readFileSync(new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname, "utf8"),
    ) as unknown as { events: LedgerEvent[] };
    expect(bundle.events.length).toBeGreaterThan(1000);
    expect(bundle.events.filter((e) => e.provider !== undefined)).toEqual([]);
    const md = replay(bundle.events);
    for (const name of ["(OpenAI,", "(Anthropic,", "(Local,", "(Google Gemini,", "(OpenRouter,"]) expect(md).not.toContain(name);
  });
});

