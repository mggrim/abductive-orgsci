/**
 * Inference adapter tests (mock determinism; Anthropic client wiring —
 * headers, token handling, model/version extraction). No network calls: the
 * Anthropic client takes an injected fetch.
 */

import { describe, expect, test } from "bun:test";
import {
  AnthropicInferenceClient,
  WrongCredentialShapeError,
  DEFAULT_MODEL,
  MissingTokenError,
  apiUrl,
} from "../src/inference/anthropic.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";

describe("MockInferenceClient", () => {
  test("is deterministic and consumes scripted responses in order", async () => {
    const client = new MockInferenceClient({ responses: ["one", "two"] });
    const req = { system: "s", messages: [{ role: "user" as const, content: "m" }] };
    expect((await client.complete(req)).text).toBe("one");
    expect((await client.complete(req)).text).toBe("two");
  });

  test("default responses cite a chunk id found in the request", async () => {
    const client = new MockInferenceClient();
    const result = await client.complete({
      system: "s",
      messages: [{ role: "user", content: "[chunk:abc-123] excerpt text" }],
    });
    expect(result.text).toContain("[[chunk:abc-123]]");
    expect(result.model).toBe("mock");
    expect(result.modelVersion.length).toBeGreaterThan(0);
  });
});

/**
 * Run something with no `window`, then put back whatever was there.
 *
 * `apiUrl` reads the global when a call is made, so this is enough to pin which
 * branch a test is asserting.
 */
async function withoutWindow<T>(run: () => Promise<T>): Promise<T> {
  const held = (globalThis as { window?: unknown }).window;
  delete (globalThis as { window?: unknown }).window;
  try {
    return await run();
  } finally {
    if (held !== undefined) (globalThis as { window?: unknown }).window = held;
  }
}

describe("AnthropicInferenceClient", () => {
  test("in a browser the call goes through the same-origin proxy", () => {
    /* Org settings block a direct browser call to api.anthropic.com, so the dev
     * server proxies it (vite.config.ts). Both sides of the branch are asserted
     * here because neither is reachable from the other's environment. */
    const held = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = held ?? {};
    try {
      expect(apiUrl()).toBe("/anthropic-proxy/v1/messages");
    } finally {
      if (held === undefined) delete (globalThis as { window?: unknown }).window;
    }
  });

  const okResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200 });

  test("throws MissingTokenError when no session token is present", async () => {
    const client = new AnthropicInferenceClient({ getToken: () => null });
    await expect(
      client.complete({ system: "s", messages: [{ role: "user", content: "m" }] }),
    ).rejects.toThrow(MissingTokenError);
  });

  test("sends x-api-key + direct-browser-access headers and returns model+version", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl: typeof fetch = ((url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return Promise.resolve(
        okResponse({
          model: "claude-sonnet-4-6-20260101",
          content: [{ type: "text", text: "hello from claude" }],
        }),
      );
    }) as typeof fetch;

    const client = new AnthropicInferenceClient({
      getToken: () => "sk-" + "ant-api03-tok-secret",
      fetchImpl,
    });
    /* Node, which is where this test runs and where the eval harness runs under
     * `--live`. It used to be implied by there being no DOM anywhere in the
     * suite, and the rendering tests register one; a branch on a global should
     * say which side of it it is asserting rather than depend on what another
     * file left behind. */
    const result = await withoutWindow(() =>
      client.complete({
        system: "be brief",
        messages: [{ role: "user", content: "hi" }],
        maxTokens: 99,
      }),
    );

    expect(result.text).toBe("hello from claude");
    expect(result.model).toBe(DEFAULT_MODEL);
    expect(result.modelVersion).toBe("claude-sonnet-4-6-20260101"); // ISC-5 provenance

    const req = captured as { url: string; init: RequestInit } | null;
    if (req === null) throw new Error("fetch was not called");
    expect(req.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = req.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-" + "ant-api03-tok-secret");
    // Anti: the bearer/OAuth branch is gone, so a subscription token can never
    // be sent from here even if one reaches the client.
    expect(headers["authorization"]).toBeUndefined();
    expect(headers["anthropic-beta"]).toBeUndefined();
    expect(headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(String(req.init.body)) as {
      model: string;
      max_tokens: number;
      system: string;
    };
    // ISC-591: the key-only default is the newest Sonnet.
    expect(body.model).toBe("claude-sonnet-5-5");
    expect(body.max_tokens).toBe(99);
    expect(body.system).toBe("be brief");
  });

  test("refuses a non-console credential before any request goes out", async () => {
    let called = false;
    const fetchImpl = (() => {
      called = true;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;
    const client = new AnthropicInferenceClient({
      getToken: () => "sk-" + "ant-oat01-subscription-shaped-token",
      fetchImpl,
    });
    await expect(
      client.complete({ system: "s", messages: [{ role: "user", content: "m" }] }),
    ).rejects.toThrow(WrongCredentialShapeError);
    expect(called).toBe(false);
  });

  test("surfaces API errors with status and body excerpt", async () => {
    const fetchImpl = (() =>
      Promise.resolve(new Response("overloaded", { status: 529 }))) as unknown as typeof fetch;
    const client = new AnthropicInferenceClient({
      getToken: () => "sk-" + "ant-api03-tok",
      fetchImpl,
    });
    await expect(
      client.complete({ system: "s", messages: [{ role: "user", content: "m" }] }),
    ).rejects.toThrow(/529/);
  });
});
