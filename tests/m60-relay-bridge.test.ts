/**
 * M60, ISC-580 (the bridge half). Option B takes any API key, and a provider
 * that refuses a browser origin is reached through the bridge on this machine,
 * which relays one request at a time and holds the key in memory for that
 * request only: it goes into the Authorization header of the one request
 * relayed and nowhere else. The relay is not storage.
 *
 * The relay takes an https base URL (the service's OpenAI-compatible root, such
 * as https://api.example.com/v1) and nothing else: no http, no credentials in
 * the URL, no query, and no loopback host, which is the local lane's business.
 * It answers /complete and /stream with provider "relay", in the wire shapes
 * the other lanes use, and POST /models with the service's model list.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createHandler, relayBase } from "../scripts/cli-bridge.ts";

describe("ISC-580: what the relay may reach", () => {
  test("an https root, canonical, with any trailing slash dropped", () => {
    expect(relayBase("https://api.together.xyz/v1")).toBe("https://api.together.xyz/v1");
    expect(relayBase("https://api.together.xyz/v1/")).toBe("https://api.together.xyz/v1");
    expect(relayBase("https://llm.example.org")).toBe("https://llm.example.org");
    expect(relayBase(" https://llm.example.org:8443/openai/v1 ")).toBe("https://llm.example.org:8443/openai/v1");
  });

  test("anything else is refused", () => {
    for (const bad of [
      "http://api.example.com/v1",
      "https://user:pw@api.example.com/v1",
      "https://api.example.com/v1?key=1",
      "https://api.example.com/v1#x",
      "https://localhost/v1",
      "https://127.0.0.1:8000/v1",
      "https://[::1]/v1",
      "ftp://api.example.com",
      "api.example.com",
      "",
      null,
      7,
    ]) {
      expect(relayBase(bad as never)).toBeNull();
    }
  });
});

/**
 * The relayed service, played by a real server. It cannot be https here, so
 * the handler is given a transport that rewrites the https root to this
 * server's http address and records what it forwarded, as a TLS-terminating
 * proxy in front of the service would.
 */
const NativeResponse = (await Bun.fetch("data:text/plain,x")).constructor as typeof Response;
const seen: { url: string; auth: string | null; body: any }[] = [];
/**
 * Bun's own Request, taken from the first request the service receives. A DOM
 * registered by another file in this process replaces the global one, and its
 * Request drops the Origin header, which is the header the bridge decides on.
 */
let NativeRequest: typeof Request | null = null;
const service = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(req) {
    NativeRequest ??= req.constructor as typeof Request;
    if (new URL(req.url).pathname === "/capture") return new NativeResponse("ok");
    const url = new URL(req.url);
    const auth = req.headers.get("authorization");
    const body = req.method === "POST" ? await req.json() : null;
    seen.push({ url: url.pathname, auth, body });
    const json = (v: unknown, status = 200) =>
      new NativeResponse(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
    if (auth !== "Bearer relay-key-123") return json({ error: { message: "Incorrect API key provided" } }, 401);
    if (url.pathname === "/v1/models") return json({ data: [{ id: "mistral-large" }, { id: "mixtral" }] });
    if (url.pathname === "/v1/chat/completions") {
      if (body.stream) {
        return new NativeResponse(
          `data: ${JSON.stringify({ model: body.model, choices: [{ delta: { content: "relayed" } }] })}\n\n` +
            `data: ${JSON.stringify({ model: body.model, choices: [{ delta: { content: " reply" } }] })}\n\ndata: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        );
      }
      return json({ model: body.model, choices: [{ message: { content: "relayed reply" } }] });
    }
    return json({ error: "no" }, 404);
  },
});
afterAll(() => service.stop(true));
await Bun.fetch(`http://127.0.0.1:${service.port}/capture`);
const Req = NativeRequest! as typeof Request;

const transport: typeof fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  Bun.fetch(String(input).replace("https://api.example.com", `http://127.0.0.1:${service.port}`), init)) as typeof fetch;

const handler = createHandler(
  { claudeVersion: async () => null, signedIn: async () => null },
  [],
  { port: 8787, relayFetch: transport },
);

const post = (path: string, body: unknown) =>
  handler.fetch(
    new Req(`http://localhost:8787${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://abductive.pages.dev" },
      body: JSON.stringify(body),
    }),
  );

describe("ISC-580: the relay answers in the wire shapes", () => {
  test("POST /models: the service's model ids", async () => {
    const res = await post("/models", { baseUrl: "https://api.example.com/v1", key: "relay-key-123" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ models: ["mistral-large", "mixtral"] });
    expect(seen.at(-1)).toMatchObject({ url: "/v1/models", auth: "Bearer relay-key-123" });
    expect(res.headers.get("access-control-allow-origin")).toBe("https://abductive.pages.dev");
  });

  test("/complete: the reply, the model the service names", async () => {
    const res = await post("/complete", {
      provider: "relay",
      baseUrl: "https://api.example.com/v1",
      key: "relay-key-123",
      model: "mistral-large",
      system: "You are the tool.",
      messages: [{ role: "user", content: "q" }],
    });
    expect(await res.json()).toEqual({ text: "relayed reply", model: "mistral-large", modelVersion: "mistral-large" });
    const sent = seen.at(-1)!;
    expect(sent.url).toBe("/v1/chat/completions");
    expect(sent.body.messages).toEqual([
      { role: "system", content: "You are the tool." },
      { role: "user", content: "q" },
    ]);
    // The key travels as the service's header and never in the forwarded body.
    expect(JSON.stringify(sent.body)).not.toContain("relay-key-123");
  });

  test("/stream: deltas and one final", async () => {
    const res = await post("/stream", {
      provider: "relay",
      baseUrl: "https://api.example.com/v1",
      key: "relay-key-123",
      model: "mistral-large",
      messages: [{ role: "user", content: "q" }],
    });
    const text = await res.text();
    expect(text.startsWith(": open\n\n")).toBe(true);
    expect(text).toContain('event: final\ndata: {"text":"relayed reply","model":"mistral-large"}');
  });

  test("a refused key: /models and /complete answer 500 with the service's message", async () => {
    const models = await post("/models", { baseUrl: "https://api.example.com/v1", key: "wrong" });
    expect(models.status).toBe(500);
    expect(((await models.json()) as { error: string }).error).toContain("Incorrect API key provided");
    const turn = await post("/complete", {
      provider: "relay",
      baseUrl: "https://api.example.com/v1",
      key: "wrong",
      model: "m",
      messages: [],
    });
    expect(turn.status).toBe(500);
  });

  test("a base that is not https, or no key, or no model: 400 before anything is sent", async () => {
    const before = seen.length;
    for (const body of [
      { provider: "relay", baseUrl: "http://api.example.com/v1", key: "k", model: "m", messages: [] },
      { provider: "relay", baseUrl: "https://localhost/v1", key: "k", model: "m", messages: [] },
      { provider: "relay", baseUrl: "https://api.example.com/v1", model: "m", messages: [] },
      { provider: "relay", baseUrl: "https://api.example.com/v1", key: "k", messages: [] },
    ]) {
      const res = await post("/complete", body);
      expect(res.status).toBe(400);
    }
    expect((await post("/models", { baseUrl: "http://api.example.com/v1", key: "k" })).status).toBe(400);
    expect(seen.length).toBe(before);
  });

  test("a stranger's origin is refused before the relay runs", async () => {
    const before = seen.length;
    const res = await handler.fetch(
      new Req("http://localhost:8787/models", {
        method: "POST",
        headers: { "content-type": "text/plain", origin: "https://example.com" },
        body: JSON.stringify({ baseUrl: "https://api.example.com/v1", key: "relay-key-123" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(seen.length).toBe(before);
  });

  test("OPTIONS /models from the site: the preflight answer", async () => {
    const res = await handler.fetch(
      new Req("http://localhost:8787/models", { method: "OPTIONS", headers: { origin: "https://abductive.pages.dev" } }),
    );
    expect(res.status).toBe(204);
  });

  test("the relay writes nothing: no file write or log on its path", () => {
    const source = readFileSync(new URL("../scripts/cli-bridge.ts", import.meta.url).pathname, "utf8");
    const relay = source.slice(source.indexOf("The relay (M60, ISC-580)"), source.indexOf("One lane's probes for the health reply"));
    expect(relay.length).toBeGreaterThan(300);
    expect(relay).not.toMatch(/writeFile|appendFile|mkdtemp|console\.(log|error)/);
  });
});
