/**
 * M60, ISC-577 (the TS bridge half). A local model lane beside Claude Code and
 * Codex: an OpenAI-compatible server on this machine (Ollama, LM Studio,
 * llama.cpp, or a port the reader names), found by probing the usual ports,
 * its models listed with GET /v1/models, a turn run with POST
 * /v1/chat/completions (streaming for /stream, whole for /complete), an
 * optional key relayed per request and never written, and loopback in both
 * directions: the bridge refuses any endpoint that is not on this machine.
 *
 * The reducers are held to real Ollama output captured on this Mac and
 * committed beside the Codex fixtures (the Swift tests read the same files).
 * Probing and routing run against a real OpenAI-compatible server on a
 * loopback port, started here, that writes down what it was sent.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chatModelIds,
  chatRequestBody,
  createHandler,
  LOCAL_PORTS,
  localCandidates,
  localServerName,
  loopbackEndpoint,
  modelIds,
  openAIStreamReducer,
  probeLocal,
  reduceChatCompletion,
  requestProvider,
} from "../scripts/cli-bridge.ts";

const FIXTURES = new URL("../bridge-app/BridgeCore/Tests/BridgeCoreTests/Fixtures/", import.meta.url).pathname;
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("ISC-577: where a local server may be", () => {
  test("the usual ports, in order: Ollama, LM Studio, llama.cpp, then 8000", () => {
    expect(LOCAL_PORTS).toEqual([11434, 1234, 8080, 8000]);
  });

  test("each known port has its server's name; any other port is named by number", () => {
    expect(localServerName("http://127.0.0.1:11434")).toBe("Ollama");
    expect(localServerName("http://127.0.0.1:1234")).toBe("LM Studio");
    expect(localServerName("http://127.0.0.1:8080")).toBe("llama.cpp");
    expect(localServerName("http://127.0.0.1:8000")).toBe("port 8000");
    expect(localServerName("http://127.0.0.1:9123")).toBe("port 9123");
  });

  test("a named endpoint is a port or a loopback URL, and comes out as one canonical base", () => {
    expect(loopbackEndpoint("9000")).toBe("http://127.0.0.1:9000");
    expect(loopbackEndpoint(9000)).toBe("http://127.0.0.1:9000");
    expect(loopbackEndpoint("http://localhost:9000")).toBe("http://127.0.0.1:9000");
    expect(loopbackEndpoint("http://127.0.0.1:9000/v1")).toBe("http://127.0.0.1:9000");
    expect(loopbackEndpoint("http://127.0.0.1:9000/v1/")).toBe("http://127.0.0.1:9000");
    expect(loopbackEndpoint("http://[::1]:9000")).toBe("http://[::1]:9000");
    expect(loopbackEndpoint("localhost:9000")).toBe("http://127.0.0.1:9000");
  });

  test("loopback only: any other host, scheme or shape is refused", () => {
    for (const bad of [
      "http://192.168.1.20:11434",
      "http://10.0.0.2:8000",
      "https://api.openai.com/v1",
      "http://localhost.evil.com:9000",
      "http://127.0.0.1.nip.io:9000",
      "http://user:pw@127.0.0.1:9000",
      "file:///etc/passwd",
      "ftp://127.0.0.1:21",
      "http://127.0.0.1:9000/other/path",
      "http://127.0.0.1:9000/v1?x=1",
      "0",
      "70000",
      "",
      "not a url",
      null,
      {},
    ]) {
      expect(loopbackEndpoint(bad as never)).toBeNull();
    }
  });

  test("the bridge's own port is refused, so a turn cannot loop back into the bridge", () => {
    expect(loopbackEndpoint("8787", 8787)).toBeNull();
    expect(loopbackEndpoint("http://localhost:8787", 8787)).toBeNull();
    expect(loopbackEndpoint("8787", 8797)).toBe("http://127.0.0.1:8787");
  });

  test("the named endpoint is tried first, then the usual ports, each once", () => {
    expect(localCandidates(null)).toEqual([
      "http://127.0.0.1:11434",
      "http://127.0.0.1:1234",
      "http://127.0.0.1:8080",
      "http://127.0.0.1:8000",
    ]);
    expect(localCandidates("http://127.0.0.1:9000")[0]).toBe("http://127.0.0.1:9000");
    expect(localCandidates("http://127.0.0.1:1234")).toEqual([
      "http://127.0.0.1:1234",
      "http://127.0.0.1:11434",
      "http://127.0.0.1:8080",
      "http://127.0.0.1:8000",
    ]);
  });
});

describe("ISC-577: the OpenAI-compatible wire, reduced (real Ollama fixtures)", () => {
  test("the model list is the ids, in the server's order; a null list (Ollama with no models) is empty", () => {
    expect(modelIds(JSON.parse(fixture("openai-models-ollama.json")))).toEqual(["llama3.2:1b"]);
    expect(modelIds({ object: "list", data: null })).toEqual([]);
    expect(modelIds({ data: [{ id: "a" }, { id: 7 }, { nope: 1 }, { id: "b" }] })).toEqual(["a", "b"]);
    expect(modelIds("garbage")).toEqual([]);
  });

  test("LM Studio's embedding models are left out of the local list", () => {
    expect(
      chatModelIds(["qwen3.6-35b-a3b", "gemma-4-31b-it", "text-embedding-nomic-embed-text-v1.5", "gpt-oss-120b"]),
    ).toEqual(["qwen3.6-35b-a3b", "gemma-4-31b-it", "gpt-oss-120b"]);
  });

  test("the request: the system prompt as the system message, the study's messages as the thread, the model named", () => {
    const body = chatRequestBody(
      "You are the tool.",
      [
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "second" },
      ],
      "llama3.2:1b",
      true,
      800,
    );
    expect(body).toEqual({
      model: "llama3.2:1b",
      stream: true,
      max_tokens: 800,
      messages: [
        { role: "system", content: "You are the tool." },
        { role: "user", content: "first" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "second" },
      ],
    });
    // No system message when the study sends none; no max_tokens when none is asked.
    const bare = chatRequestBody("  ", [{ role: "user", content: "x" }], "m", false);
    expect(bare).toEqual({ model: "m", stream: false, messages: [{ role: "user", content: "x" }] });
  });

  test("a whole reply: the message is the text, the server's model name is the model", () => {
    expect(reduceChatCompletion(JSON.parse(fixture("openai-complete-ollama.json")), "llama3.2:1b")).toEqual({
      text: "Yes.",
      model: "llama3.2:1b",
    });
  });

  test("an error reply is an error with the server's message", () => {
    expect(
      reduceChatCompletion({ error: { message: "model 'nope' not found", type: "not_found_error" } }, "nope"),
    ).toEqual({ error: "model 'nope' not found" });
    expect(reduceChatCompletion({ choices: [] }, "m")).toEqual({ error: "the server gave no reply" });
  });

  test("a stream: every content delta in order, then one final with the whole text and the model", () => {
    const reducer = openAIStreamReducer("llama3.2:1b");
    const events = fixture("openai-stream-ollama.txt").split("\n").flatMap((l) => reducer.line(l));
    const final = reducer.end();
    const deltas = events.filter((e) => e.kind === "delta").map((e) => (e as { text: string }).text);
    expect(deltas.length).toBeGreaterThan(3);
    expect(events.every((e) => e.kind === "delta")).toBe(true);
    expect(final).toEqual([{ kind: "final", text: deltas.join(""), model: "llama3.2:1b" }]);
    expect(deltas.join("")).toContain("Hello");
  });

  test("a stream that sends an error frame fails once, with the server's message, and gives no final", () => {
    const reducer = openAIStreamReducer("m");
    expect(reducer.line('data: {"error":{"message":"out of memory"}}')).toEqual([{ kind: "error", message: "out of memory" }]);
    expect(reducer.line('data: {"error":{"message":"again"}}')).toEqual([]);
    expect(reducer.failed).toBe(true);
    expect(reducer.end()).toEqual([]);
  });

  test("[DONE], comments and blank lines carry nothing", () => {
    const reducer = openAIStreamReducer("m");
    expect(reducer.line("data: [DONE]")).toEqual([]);
    expect(reducer.line(": keep-alive")).toEqual([]);
    expect(reducer.line("")).toEqual([]);
    expect(reducer.end()).toEqual([]);
  });
});

/**
 * Bun's own Response. Another file in this process may have registered a DOM,
 * whose Response `Bun.serve` refuses; a native fetch's answer is always Bun's.
 */
const NativeResponse = (await Bun.fetch("data:text/plain,x")).constructor as typeof Response;
const json = (value: unknown, init?: ResponseInit) =>
  new NativeResponse(JSON.stringify(value), { ...init, headers: { "content-type": "application/json" } });

/** A real OpenAI-compatible server on a loopback port, recording each request. */
function fakeServer(options: { key?: string; models?: string[]; reply?: string }) {
  const seen: { path: string; auth: string | null; body: any }[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const auth = req.headers.get("authorization");
      const body = req.method === "POST" ? await req.json() : null;
      seen.push({ path: url.pathname, auth, body });
      if (options.key !== undefined && auth !== `Bearer ${options.key}`) {
        return json({ error: { message: "missing or wrong key" } }, { status: 401 });
      }
      if (url.pathname === "/v1/models") {
        return json({ object: "list", data: (options.models ?? []).map((id) => ({ id, object: "model" })) });
      }
      if (url.pathname === "/v1/chat/completions") {
        const text = options.reply ?? "local reply";
        if (body.stream) {
          const frames = [...text.split(" ").map((w: string, i: number) => (i === 0 ? w : ` ${w}`))]
            .map((c) => `data: ${JSON.stringify({ model: body.model, choices: [{ delta: { content: c } }] })}\n\n`)
            .join("");
          return new NativeResponse(`${frames}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
        }
        return json({ model: body.model, choices: [{ message: { role: "assistant", content: text } }] });
      }
      return new NativeResponse("not found", { status: 404 });
    },
  });
  return { server, seen, endpoint: `http://127.0.0.1:${server.port}` };
}

describe("ISC-577: probing finds the first server that answers, and whether it asks for a key", () => {
  const open = fakeServer({ models: ["llama3.2:1b", "qwen2.5:0.5b"] });
  const keyed = fakeServer({ key: "local-secret", models: ["gemma"] });
  const dead = "http://127.0.0.1:9"; // discard port: nothing listens there
  afterAll(() => {
    open.server.stop(true);
    keyed.server.stop(true);
  });

  test("nothing answering: not reachable, no endpoint, no models", async () => {
    expect(await probeLocal([dead], null)).toEqual({ reachable: false, endpoint: null, models: [], needsKey: false });
  });

  test("the first answering candidate in order wins, with its models", async () => {
    expect(await probeLocal([dead, open.endpoint, keyed.endpoint], null)).toEqual({
      reachable: true,
      endpoint: open.endpoint,
      models: ["llama3.2:1b", "qwen2.5:0.5b"],
      needsKey: false,
    });
  });

  test("a server that answers 401 is reachable and asks for a key; with the key its models list", async () => {
    expect(await probeLocal([keyed.endpoint], null)).toEqual({
      reachable: true,
      endpoint: keyed.endpoint,
      models: [],
      needsKey: true,
    });
    expect(await probeLocal([keyed.endpoint], "local-secret")).toEqual({
      reachable: true,
      endpoint: keyed.endpoint,
      models: ["gemma"],
      needsKey: false,
    });
    // The key went as a bearer header and nowhere else.
    const last = keyed.seen.at(-1)!;
    expect(last.auth).toBe("Bearer local-secret");
    expect(last.path).toBe("/v1/models");
  });

  test("a probe is bounded: a server that never answers counts as absent", async () => {
    const hang = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Promise<Response>(() => {}) });
    const started = Date.now();
    const found = await probeLocal([`http://127.0.0.1:${hang.port}`], null, undefined, 300);
    expect(found.reachable).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    hang.stop(true);
  });
});

describe("ISC-577: the handler routes a local turn and reports the lane in health", () => {
  const server = fakeServer({ models: ["llama3.2:1b"], reply: "The loop is visible now." });
  const keyed = fakeServer({ key: "k-123", models: ["gemma"], reply: "keyed reply" });
  let handler: ReturnType<typeof createHandler>;
  beforeAll(() => {
    handler = createHandler(
      {
        claudeVersion: async () => "2.1.283 (Claude Code)",
        signedIn: async () => true,
        // The real order, with the fake server standing in for the usual ports.
        local: { candidates: (named) => [...(named === null ? [] : [named]), server.endpoint] },
      },
      [],
      { port: 8787 },
    );
  });
  afterAll(() => {
    server.server.stop(true);
    keyed.server.stop(true);
  });

  const post = (path: string, body: unknown) =>
    handler.fetch(
      new Request(`http://localhost:8787${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://abductive.pages.dev" },
        body: JSON.stringify(body),
      }),
    );

  test("a request may name the local lane", () => {
    expect(requestProvider({ provider: "local" })).toBe("local");
  });

  test("GET /health reports providers.local as {reachable, endpoint, models, needsKey}", async () => {
    const res = await handler.fetch(new Request("http://localhost:8787/health"));
    const body = (await res.json()) as any;
    expect(Object.keys(body.providers)).toEqual(["claude", "codex", "local"]);
    expect(body.providers.local).toEqual({
      reachable: true,
      endpoint: server.endpoint,
      models: ["llama3.2:1b"],
      needsKey: false,
    });
  });

  test("POST /health with a named endpoint and a key probes that endpoint with the key", async () => {
    const res = await post("/health", { local: { endpoint: keyed.endpoint, key: "k-123" } });
    const body = (await res.json()) as any;
    expect(body.providers.local).toEqual({ reachable: true, endpoint: keyed.endpoint, models: ["gemma"], needsKey: false });
    expect(keyed.seen.at(-1)!.auth).toBe("Bearer k-123");
  });

  test("/complete: a whole reply from the server, the model it names", async () => {
    const res = await post("/complete", {
      provider: "local",
      model: "llama3.2:1b",
      system: "You are the tool.",
      messages: [{ role: "user", content: "What is the loop?" }],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      text: "The loop is visible now.",
      model: "llama3.2:1b",
      modelVersion: "llama3.2:1b",
    });
    const sent = server.seen.at(-1)!;
    expect(sent.path).toBe("/v1/chat/completions");
    expect(sent.body.stream).toBe(false);
    expect(sent.body.messages[0]).toEqual({ role: "system", content: "You are the tool." });
    // The thread goes as the thread, with no CLI flattening or instruction appended.
    expect(sent.body.messages[1]).toEqual({ role: "user", content: "What is the loop?" });
    expect(sent.auth).toBeNull();
  });

  test("/stream: the SSE the page reads, deltas then one final", async () => {
    const res = await post("/stream", {
      provider: "local",
      model: "llama3.2:1b",
      messages: [{ role: "user", content: "Go." }],
    });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text.startsWith(": open\n\n")).toBe(true);
    expect(text).toContain("event: delta");
    expect(text).toContain('event: final\ndata: {"text":"The loop is visible now.","model":"llama3.2:1b"}');
    expect(server.seen.at(-1)!.body.stream).toBe(true);
  });

  test("a named endpoint and key are relayed per request", async () => {
    const res = await post("/complete", {
      provider: "local",
      endpoint: keyed.endpoint,
      key: "k-123",
      model: "gemma",
      messages: [{ role: "user", content: "x" }],
    });
    expect(((await res.json()) as any).text).toBe("keyed reply");
    expect(keyed.seen.at(-1)!.auth).toBe("Bearer k-123");
  });

  test("no model named: the server's first model", async () => {
    const res = await post("/complete", { provider: "local", messages: [{ role: "user", content: "x" }] });
    expect(((await res.json()) as any).model).toBe("llama3.2:1b");
  });

  test("an endpoint off this machine is refused with 400 before anything is sent", async () => {
    const before = server.seen.length;
    for (const endpoint of ["http://192.168.1.20:11434", "https://api.openai.com/v1", "8787"]) {
      const res = await post("/complete", { provider: "local", endpoint, messages: [{ role: "user", content: "x" }] });
      expect(res.status).toBe(400);
      expect(Object.keys((await res.json()) as object)).toEqual(["error"]);
    }
    expect(server.seen.length).toBe(before);
  });

  test("no local server answering: a 500 whose error names the ports tried", async () => {
    const none = createHandler(
      { claudeVersion: async () => null, signedIn: async () => null, local: { candidates: () => ["http://127.0.0.1:9"] } },
      [],
      { port: 8787 },
    );
    const res = await none.fetch(
      new Request("http://localhost:8787/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "local", messages: [{ role: "user", content: "x" }] }),
      }),
    );
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).error).toContain("no local model server");
  });

  test("the bridge writes nothing: the source holds no file write on the local path", () => {
    const source = readFileSync(new URL("../scripts/cli-bridge.ts", import.meta.url).pathname, "utf8");
    const local = source.slice(source.indexOf("The local lane (M60"), source.indexOf("One lane's probes for the health reply"));
    expect(local.length).toBeGreaterThan(500);
    expect(local).not.toMatch(/writeFile|appendFile|mkdtemp|console\.(log|error)/);
  });
});
