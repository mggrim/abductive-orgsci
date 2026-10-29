/**
 * M55, ISC-552. One request set, the one tests/m54-bridge-*.test.ts holds the
 * TS bridge to, sent over the wire to a running bridge, with every answer
 * checked against the protocol of scripts/cli-bridge.ts. Given two ports, it
 * also checks that the two bridges answer every request in the same shape.
 *
 *   bun bridge-app/conformance.ts 8797            # one bridge
 *   bun bridge-app/conformance.ts 8797 8798       # and the same shapes as another
 *   bun bridge-app/conformance.ts 8787 --no-model # skip the two real claude calls
 *   bun bridge-app/conformance.ts 8787 --site     # and the site the app serves (M57)
 *   bun bridge-app/conformance.ts 8797 8798 --provider codex   # the Codex lane's cases (M56)
 *   bun bridge-app/conformance.ts 8797 8798 --provider local   # the local lane's cases (M60)
 *   bun bridge-app/conformance.ts 8797 8798 --provider relay   # the relay's cases (M60)
 *
 * The two model requests ask haiku for one word each, through the reader's own
 * Claude Code sign-in; with --provider codex they ask Codex's default model,
 * through the reader's own ChatGPT sign-in; with --provider local they ask the
 * first model of the local server the bridge finds (Ollama on 11434 on the
 * owner's Mac). Exit 0 when everything passes, 1 otherwise.
 */

const SITE = "https://abductive.pages.dev";
const USAGE = "cli-bridge: POST /complete, POST /stream, or GET /health";
const REFUSED = "cli-bridge: this origin may not use the bridge";

export const CORS_CASES: readonly [string, "allow" | "refuse"][] = [
  ["https://abductive.pages.dev", "allow"],
  ["https://abc123.abductive.pages.dev", "allow"],
  ["https://m54.abductive.pages.dev", "allow"],
  ["http://localhost:5173", "allow"],
  ["http://localhost:5194", "allow"],
  ["http://127.0.0.1:5173", "allow"],
  ["http://[::1]:5173", "allow"],
  ["http://app.localhost:5173", "allow"],
  ["http://abductive.pages.dev", "refuse"],
  ["https://abductive.pages.dev.evil.com", "refuse"],
  ["https://evilabductive.pages.dev", "refuse"],
  ["https://other.pages.dev", "refuse"],
  ["https://example.com", "refuse"],
  ["http://192.168.1.20:5173", "refuse"],
  ["http://localhost.evil.com", "refuse"],
  ["null", "refuse"],
  ["https://abductive.pages.dev:443", "refuse"],
  ["HTTPS://abductive.pages.dev", "refuse"],
];

const HEADERS = [
  "content-type",
  "access-control-allow-origin",
  "vary",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-max-age",
  "access-control-allow-private-network",
  "access-control-allow-local-network",
  "cache-control",
] as const;

type Shape = unknown;
interface Record_ {
  name: string;
  status: number;
  headers: Partial<Record<(typeof HEADERS)[number], string>>;
  body: Shape;
}

function typeOf(v: unknown): string {
  return v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
}

function jsonShape(text: string): Shape {
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    if (typeOf(v) !== "object") return { json: typeOf(v) };
    return { json: Object.fromEntries(Object.keys(v).map((k) => [k, typeOf(v[k])])) };
  } catch {
    return { text };
  }
}

/** An SSE body reduced to its opening comment, event names (runs collapsed) and data keys. */
function sseShape(text: string): Shape {
  const frames = text.split("\n\n").filter((f) => f !== "");
  const opening = frames[0] ?? "";
  const events: string[] = [];
  const data: Record<string, Record<string, string>> = {};
  for (const f of frames.slice(1)) {
    const name = /^event: (.*)$/m.exec(f)?.[1] ?? "message";
    const raw = /^data: (.*)$/m.exec(f)?.[1] ?? "null";
    if (events.at(-1) !== name) events.push(name);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    data[name] = Object.fromEntries(Object.keys(parsed).map((k) => [k, typeOf(parsed[k])]));
  }
  return { opening, events, data };
}

async function send(
  port: number,
  name: string,
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<Record_ & { raw: string }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers, body: body ?? null });
  const raw = await res.text();
  const picked: Record_["headers"] = {};
  for (const h of HEADERS) {
    const v = res.headers.get(h);
    if (v !== null) picked[h] = v;
  }
  const ct = res.headers.get("content-type") ?? "";
  const shape = ct.startsWith("text/event-stream") ? sseShape(raw) : ct.includes("json") ? jsonShape(raw) : { text: raw };
  return { name, status: res.status, headers: picked, body: shape, raw };
}

interface Check {
  name: string;
  run: (port: number) => Promise<Record_ & { raw: string }>;
  expect: (r: Record_ & { raw: string }) => string | null;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const fail = (what: string, got: unknown) => `${what}; got ${JSON.stringify(got)}`;

// M56: `providers` beside the M54 fields, which keep their meaning.
const HEALTH_SHAPE = (b: any) =>
  b?.json?.ok === "boolean" &&
  ["string", "null"].includes(b?.json?.claude) &&
  ["boolean", "null"].includes(b?.json?.signedIn) &&
  b?.json?.bun === "string" &&
  b?.json?.providers === "object" &&
  eq(Object.keys(b.json), ["ok", "claude", "signedIn", "bun", "providers"]);

function checks(model: boolean): Check[] {
  const list: Check[] = [
    {
      name: "GET /health, no Origin: the four fields, no CORS headers",
      run: (p) => send(p, "health", "GET", "/health"),
      expect: (r) =>
        r.status !== 200 ? fail("status 200", r.status)
        : r.headers["content-type"] !== "application/json;charset=utf-8" ? fail("json content-type", r.headers)
        : !HEALTH_SHAPE(r.body) ? fail("{ok, claude, signedIn, bun, providers}", r.body)
        : r.headers["access-control-allow-origin"] !== undefined ? fail("no CORS", r.headers)
        : JSON.parse(r.raw).ok !== true ? fail("ok true", r.raw)
        : null,
    },
    {
      name: "GET /health from the site: origin echoed, Vary: Origin",
      run: (p) => send(p, "health-site", "GET", "/health", { origin: SITE }),
      expect: (r) =>
        r.status === 200 && r.headers["access-control-allow-origin"] === SITE && r.headers.vary === "Origin" && HEALTH_SHAPE(r.body)
          ? null
          : fail("200 with the site's CORS", r),
    },
  ];
  for (const path of ["/health", "/complete", "/stream"]) {
    list.push({
      name: `OPTIONS ${path} from the site, private-network preflight: 204 and a yes`,
      run: (p) =>
        send(p, `preflight${path}`, "OPTIONS", path, {
          origin: SITE,
          "access-control-request-method": path === "/health" ? "GET" : "POST",
          "access-control-request-headers": "content-type",
          "access-control-request-private-network": "true",
        }),
      expect: (r) =>
        r.status === 204 &&
        eq(r.headers, {
          "access-control-allow-origin": SITE,
          vary: "Origin",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "600",
          "access-control-allow-private-network": "true",
          "access-control-allow-local-network": "true",
        }) &&
        r.raw === ""
          ? null
          : fail("204 with the full preflight answer", r),
    });
  }
  list.push(
    {
      name: "OPTIONS /health from the site without the network header: no network yes",
      run: (p) => send(p, "preflight-plain", "OPTIONS", "/health", { origin: SITE }),
      expect: (r) =>
        r.status === 204 && r.headers["access-control-allow-private-network"] === undefined ? null : fail("204, no PNA", r),
    },
    {
      name: "OPTIONS /health asking for local network: both yeses",
      run: (p) =>
        send(p, "preflight-local", "OPTIONS", "/health", { origin: SITE, "access-control-request-local-network": "true" }),
      expect: (r) =>
        r.status === 204 && r.headers["access-control-allow-local-network"] === "true" && r.headers["access-control-allow-private-network"] === "true"
          ? null
          : fail("204 with both", r),
    },
    {
      name: "OPTIONS on any other path: 404, empty",
      run: (p) => send(p, "preflight-elsewhere", "OPTIONS", "/elsewhere", { origin: SITE }),
      expect: (r) => (r.status === 404 && r.raw === "" && Object.keys(r.headers).length === 0 ? null : fail("bare 404", r)),
    },
  );
  for (const [origin, want] of CORS_CASES) {
    for (const method of ["OPTIONS", "GET"]) {
      list.push({
        name: `${method} /health from ${origin}: ${want}`,
        run: (p) => send(p, `cors ${method} ${origin}`, method, "/health", { origin }),
        expect: (r) =>
          want === "allow"
            ? r.status === (method === "GET" ? 200 : 204) && r.headers["access-control-allow-origin"] === origin
              ? null
              : fail("allowed with the origin echoed", r)
            : r.status === 403 && r.raw === REFUSED && r.headers["access-control-allow-origin"] === undefined &&
                r.headers["content-type"] === "text/plain;charset=utf-8"
              ? null
              : fail("403 with the refusal and no CORS", r),
      });
    }
  }
  for (const path of ["/complete", "/stream"]) {
    list.push({
      name: `POST ${path} from a stranger as text/plain: 403 before any work`,
      run: (p) => send(p, `stranger ${path}`, "POST", path, { origin: "https://example.com", "content-type": "text/plain" }, "{}"),
      expect: (r) => (r.status === 403 && r.raw === REFUSED ? null : fail("403", r)),
    });
  }
  // M57: the app answers a GET for any other path with the Abductive site, so
  // the root is asked with PUT, which neither bridge serves.
  for (const [method, path] of [["GET", "/complete"], ["GET", "/stream"], ["PUT", "/"], ["POST", "/nothing"]] as const) {
    list.push({
      name: `${method} ${path}: 404 with the usage line and the site's CORS`,
      run: (p) => send(p, `404 ${method} ${path}`, method, path, { origin: SITE }),
      expect: (r) =>
        r.status === 404 && r.raw === USAGE && r.headers["access-control-allow-origin"] === SITE &&
        r.headers["content-type"] === "text/plain;charset=utf-8"
          ? null
          : fail("404 usage", r),
    });
  }
  list.push(
    {
      name: "POST /health: answered like GET",
      run: (p) => send(p, "health-post", "POST", "/health"),
      expect: (r) => (r.status === 200 && HEALTH_SHAPE(r.body) ? null : fail("200 health", r)),
    },
    {
      name: "POST /complete with a body that is not JSON: 500 {error}",
      run: (p) => send(p, "complete-bad", "POST", "/complete", { origin: SITE, "content-type": "application/json" }, "{nope"),
      expect: (r) =>
        r.status === 500 && eq(r.body, { json: { error: "string" } }) && r.headers["access-control-allow-origin"] === SITE
          ? null
          : fail("500 {error}", r),
    },
    {
      name: "POST /stream with a body that is not JSON: 500 {error}",
      run: (p) => send(p, "stream-bad", "POST", "/stream", { origin: SITE, "content-type": "application/json" }, "{nope"),
      expect: (r) => (r.status === 500 && eq(r.body, { json: { error: "string" } }) ? null : fail("500 {error}", r)),
    },
  );
  if (model) {
    const body = JSON.stringify({
      system: "You answer with exactly one word.",
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      model: "haiku",
    });
    list.push(
      {
        name: "POST /complete, a real haiku call: {text, model, modelVersion}",
        run: (p) => send(p, "complete", "POST", "/complete", { origin: SITE, "content-type": "application/json" }, body),
        expect: (r) => {
          if (r.status !== 200 || !eq(r.body, { json: { text: "string", model: "string", modelVersion: "string" } })) {
            return fail("200 {text, model, modelVersion}", r);
          }
          const j = JSON.parse(r.raw);
          return j.model === j.modelVersion && j.text.trim() !== "" && r.headers["access-control-allow-origin"] === SITE
            ? null
            : fail("a reply, model equal to modelVersion", j);
        },
      },
      {
        name: "POST /stream, a real haiku call: SSE opening, deltas, one final",
        run: (p) => send(p, "stream", "POST", "/stream", { origin: SITE, "content-type": "application/json" }, body),
        expect: (r) => {
          const want = {
            opening: ": open",
            events: ["delta", "final"],
            data: { delta: { text: "string" }, final: { text: "string", model: "string" } },
          };
          if (r.status !== 200 || r.headers["content-type"] !== "text/event-stream" || r.headers["cache-control"] !== "no-cache") {
            return fail("200 text/event-stream no-cache", r.headers);
          }
          return eq(r.body, want) && r.headers["access-control-allow-origin"] === SITE ? null : fail("the SSE shape", r.body);
        },
      },
    );
  }
  return list;
}

/**
 * M56, ISC-557. The Codex lane: /health names both providers with the same
 * fields, a request that names a lane the bridge lacks or a model Codex does
 * not offer is refused before anything runs, and a real Codex turn answers in
 * the wire shapes the Claude lane uses.
 */
function codexChecks(model: boolean): Check[] {
  const json = { origin: SITE, "content-type": "application/json" };
  const body = (extra: Record<string, unknown>) =>
    JSON.stringify({
      system: "You answer with exactly one word.",
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      ...extra,
    });
  const list: Check[] = [
    {
      name: "GET /health: providers names claude and codex, each {version, signedIn}",
      run: (p) => send(p, "codex health", "GET", "/health", { origin: SITE }),
      expect: (r) => {
        const j = JSON.parse(r.raw) as { claude?: unknown; signedIn?: unknown; providers?: Record<string, Record<string, unknown>> };
        const lane = (v: unknown) =>
          v !== null && typeof v === "object" && eq(Object.keys(v), ["version", "signedIn"]) &&
          ["string", "object"].includes(typeof (v as any).version) && ["boolean", "object"].includes(typeof (v as any).signedIn);
        return r.status === 200 && eq(Object.keys(j.providers ?? {}), ["claude", "codex", "local"]) &&
          lane(j.providers?.claude) && lane(j.providers?.codex) &&
          eq(j.providers?.claude, { version: j.claude, signedIn: j.signedIn })
          ? null
          : fail("providers {claude, codex, local}, claude matching the M54 fields", j);
      },
    },
  ];
  for (const path of ["/complete", "/stream"]) {
    list.push(
      {
        name: `POST ${path} naming a provider the bridge lacks: 400 {error}`,
        run: (p) => send(p, `codex unknown ${path}`, "POST", path, json, body({ provider: "gemini" })),
        expect: (r) =>
          r.status === 400 && eq(r.body, { json: { error: "string" } }) && r.headers["access-control-allow-origin"] === SITE
            ? null
            : fail("400 {error}", r),
      },
      {
        name: `POST ${path}, codex with a Claude model: 400 {error}`,
        run: (p) => send(p, `codex sonnet ${path}`, "POST", path, json, body({ provider: "codex", model: "sonnet" })),
        expect: (r) => (r.status === 400 && eq(r.body, { json: { error: "string" } }) ? null : fail("400 {error}", r)),
      },
    );
  }
  if (model) {
    list.push(
      {
        name: "POST /complete, a real Codex call: {text, model, modelVersion}, the default model",
        run: (p) => send(p, "codex complete", "POST", "/complete", json, body({ provider: "codex" })),
        expect: (r) => {
          if (r.status !== 200 || !eq(r.body, { json: { text: "string", model: "string", modelVersion: "string" } })) {
            return fail("200 {text, model, modelVersion}", r);
          }
          const j = JSON.parse(r.raw);
          return j.model === "gpt-5.6-sol" && j.modelVersion === j.model && j.text.trim() !== ""
            ? null
            : fail("a reply from gpt-5.6-sol", j);
        },
      },
      {
        name: "POST /stream, a real Codex call: SSE opening, a delta, one final",
        run: (p) => send(p, "codex stream", "POST", "/stream", json, body({ provider: "codex", model: "gpt-5.6-sol" })),
        expect: (r) => {
          const want = {
            opening: ": open",
            events: ["delta", "final"],
            data: { delta: { text: "string" }, final: { text: "string", model: "string" } },
          };
          return r.status === 200 && r.headers["content-type"] === "text/event-stream" && eq(r.body, want)
            ? null
            : fail("the SSE shape", r.body);
        },
      },
    );
  }
  return list;
}

/**
 * M60, ISC-577. The local lane: /health names it as {reachable, endpoint,
 * models, needsKey}; a POST /health may name an endpoint, and one off this
 * machine is never asked; a turn naming an endpoint off this machine, or the
 * bridge's own port, is refused before anything is sent; a named endpoint where
 * nothing listens is a 500; and a real turn on the server the bridge finds
 * answers in the wire shapes the other lanes use.
 */
function localChecks(model: boolean, port: number): Check[] {
  const json = { origin: SITE, "content-type": "application/json" };
  const turn = (extra: Record<string, unknown>) =>
    JSON.stringify({
      provider: "local",
      system: "You answer with exactly one word.",
      messages: [{ role: "user", content: "Reply with the single word: ready" }],
      ...extra,
    });
  const LOCAL = (v: any) =>
    v !== null && typeof v === "object" && eq(Object.keys(v), ["reachable", "endpoint", "models", "needsKey"]) &&
    typeof v.reachable === "boolean" && (v.endpoint === null || typeof v.endpoint === "string") &&
    Array.isArray(v.models) && v.models.every((m: unknown) => typeof m === "string") && typeof v.needsKey === "boolean";
  const list: Check[] = [
    {
      name: "GET /health: providers.local is {reachable, endpoint, models, needsKey}, the endpoint on loopback",
      run: (p) => send(p, "local health", "GET", "/health", { origin: SITE }),
      expect: (r) => {
        const local = JSON.parse(r.raw)?.providers?.local;
        return r.status === 200 && LOCAL(local) &&
          (local.endpoint === null || /^http:\/\/(127\.0\.0\.1|\[::1\]):\d+$/.test(local.endpoint))
          ? null
          : fail("the local lane's four fields", local);
      },
    },
    {
      name: "POST /health naming an endpoint off this machine: answered, and that endpoint never reported",
      run: (p) => send(p, "local health lan", "POST", "/health", json, JSON.stringify({ local: { endpoint: "http://192.168.1.20:11434" } })),
      expect: (r) => {
        const local = JSON.parse(r.raw)?.providers?.local;
        return r.status === 200 && LOCAL(local) && local.endpoint !== "http://192.168.1.20:11434" ? null : fail("not the LAN address", local);
      },
    },
    {
      name: "POST /health naming a silent loopback port: answered, the lane's four fields",
      run: (p) => send(p, "local health silent", "POST", "/health", json, JSON.stringify({ local: { endpoint: "9", key: "not-a-real-key" } })),
      expect: (r) => (r.status === 200 && LOCAL(JSON.parse(r.raw)?.providers?.local) ? null : fail("200 health", r)),
    },
  ];
  for (const path of ["/complete", "/stream"]) {
    for (const endpoint of ["http://192.168.1.20:11434", "https://api.openai.com/v1", "http://localhost.evil.com:11434", String(port)]) {
      list.push({
        name: `POST ${path}, local at ${endpoint}: 400 {error} before anything is sent`,
        run: (p) => send(p, `local refused ${path} ${endpoint === String(port) ? "own port" : endpoint}`, "POST", path, json, turn({ endpoint, model: "m" })),
        expect: (r) =>
          r.status === 400 && eq(r.body, { json: { error: "string" } }) && r.headers["access-control-allow-origin"] === SITE
            ? null
            : fail("400 {error}", r),
      });
    }
  }
  list.push({
    name: "POST /complete, local at a loopback port where nothing listens: 500 {error}",
    run: (p) => send(p, "local silent", "POST", "/complete", json, turn({ endpoint: "http://127.0.0.1:9", model: "m" })),
    expect: (r) => (r.status === 500 && eq(r.body, { json: { error: "string" } }) ? null : fail("500 {error}", r)),
  });
  if (model) {
    list.push(
      {
        name: "POST /complete, a real local turn: {text, model, modelVersion}, the server's first model",
        run: (p) => send(p, "local complete", "POST", "/complete", json, turn({})),
        expect: (r) => {
          if (r.status !== 200 || !eq(r.body, { json: { text: "string", model: "string", modelVersion: "string" } })) {
            return fail("200 {text, model, modelVersion}", r);
          }
          const j = JSON.parse(r.raw);
          console.log(`      local model ${j.model} said ${JSON.stringify(j.text)}`);
          return j.model === j.modelVersion && j.text.trim() !== "" ? null : fail("a reply", j);
        },
      },
      {
        name: "POST /stream, a real local turn: SSE opening, deltas, one final",
        run: (p) => send(p, "local stream", "POST", "/stream", json, turn({})),
        expect: (r) => {
          const want = {
            opening: ": open",
            events: ["delta", "final"],
            data: { delta: { text: "string" }, final: { text: "string", model: "string" } },
          };
          return r.status === 200 && r.headers["content-type"] === "text/event-stream" && eq(r.body, want)
            ? null
            : fail("the SSE shape", r.body);
        },
      },
    );
  }
  return list;
}

/**
 * M60, ISC-580. The relay: /models answers the preflight, refuses a stranger
 * and anything but an https root with a key before anything is sent, and passes
 * a real provider's refusal back as a 500 {error}; a relayed turn missing any of
 * its three parts is a 400.
 */
function relayChecks(): Check[] {
  const json = { origin: SITE, "content-type": "application/json" };
  const list: Check[] = [
    {
      name: "OPTIONS /models from the site: 204",
      run: (p) => send(p, "relay preflight", "OPTIONS", "/models", { origin: SITE, "access-control-request-method": "POST" }),
      expect: (r) => (r.status === 204 && r.headers["access-control-allow-origin"] === SITE ? null : fail("204", r)),
    },
    {
      name: "POST /models from a stranger as text/plain: 403 before any work",
      run: (p) => send(p, "relay stranger", "POST", "/models", { origin: "https://example.com", "content-type": "text/plain" }, "{}"),
      expect: (r) => (r.status === 403 && r.raw === REFUSED ? null : fail("403", r)),
    },
    {
      name: "POST /models with a real provider and an invalid key: 500 {error} carrying the provider's refusal",
      run: (p) =>
        send(p, "relay refused key", "POST", "/models", json, JSON.stringify({ baseUrl: "https://api.openai.com/v1", key: "invalid-conformance-key" })),
      expect: (r) =>
        r.status === 500 && eq(r.body, { json: { error: "string" } }) && /401/.test(JSON.parse(r.raw).error)
          ? null
          : fail("500 {error} naming 401", r),
    },
  ];
  for (const [label, body] of [
    ["an http root", { baseUrl: "http://api.openai.com/v1", key: "k" }],
    ["a loopback root", { baseUrl: "https://localhost/v1", key: "k" }],
    ["no key", { baseUrl: "https://api.openai.com/v1" }],
  ] as const) {
    list.push({
      name: `POST /models with ${label}: 400 {error}`,
      run: (p) => send(p, `relay models ${label}`, "POST", "/models", json, JSON.stringify(body)),
      expect: (r) => (r.status === 400 && eq(r.body, { json: { error: "string" } }) ? null : fail("400 {error}", r)),
    });
  }
  for (const path of ["/complete", "/stream"]) {
    for (const [label, extra] of [
      ["an http root", { baseUrl: "http://api.openai.com/v1", key: "k", model: "m" }],
      ["no key", { baseUrl: "https://api.openai.com/v1", model: "m" }],
      ["no model", { baseUrl: "https://api.openai.com/v1", key: "k" }],
    ] as const) {
      list.push({
        name: `POST ${path}, relay with ${label}: 400 {error}`,
        run: (p) =>
          send(p, `relay ${path} ${label}`, "POST", path, json, JSON.stringify({ provider: "relay", messages: [], ...extra })),
        expect: (r) => (r.status === 400 && eq(r.body, { json: { error: "string" } }) ? null : fail("400 {error}", r)),
      });
    }
  }
  return list;
}

/**
 * M57, ISC-559. The app serves the Abductive site beside the bridge: the index
 * at the root and on a route, each asset the index names and an image with its
 * type, a 404 for a file that is not there, and the bridge under /cli-bridge.
 */
async function siteChecks(port: number): Promise<number> {
  const base = `http://127.0.0.1:${port}`;
  const get = (path: string) => fetch(base + path);
  const index = await get("/").then((r) => r.text());
  const assets = [...index.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]!);
  const cases: [string, () => Promise<string | null>][] = [
    ["GET /: the index, as html", async () => {
      const r = await get("/");
      return r.status === 200 && r.headers.get("content-type")?.startsWith("text/html") && index.includes('<div id="root">') ? null : `got ${r.status}`;
    }],
    ["GET /study/x: a route gets the index", async () => ((await get("/study/x").then((r) => r.text())) === index ? null : "not the index")],
    ["the index names a script and a stylesheet", async () => (assets.length >= 2 ? null : `named ${JSON.stringify(assets)}`)],
    ...assets.map((a): [string, () => Promise<string | null>] => [`GET ${a}: 200 with its type`, async () => {
      const r = await get(a);
      const type = r.headers.get("content-type") ?? "";
      return r.status === 200 && (a.endsWith(".js") ? type.startsWith("text/javascript") : type.startsWith("text/css")) ? null : `got ${r.status} ${type}`;
    }]),
    ["GET /intro/hero.jpg: 200, image/jpeg", async () => {
      const r = await get("/intro/hero.jpg");
      return r.status === 200 && r.headers.get("content-type") === "image/jpeg" ? null : `got ${r.status} ${r.headers.get("content-type")}`;
    }],
    ["GET /assets/missing.js: 404", async () => ((await get("/assets/missing.js")).status === 404 ? null : "not 404")],
    ["GET /cli-bridge/health from the app's origin: the health reply", async () => {
      const r = await fetch(`${base}/cli-bridge/health`, { headers: { origin: `http://localhost:${port}` } });
      const body = (await r.json().catch(() => null)) as { ok?: boolean } | null;
      return r.status === 200 && body?.ok === true ? null : `got ${r.status}`;
    }],
  ];
  let failures = 0;
  console.log(`\n# the site on ${port}`);
  for (const [name, run] of cases) {
    const problem = await run().catch((e: unknown) => `request failed: ${String(e)}`);
    console.log(`${problem === null ? "PASS" : "FAIL"}  ${name}${problem === null ? "" : `\n      ${problem}`}`);
    if (problem !== null) failures += 1;
  }
  console.log(`# site: ${cases.length - failures}/${cases.length} pass on ${port}`);
  return failures;
}

async function runAll(port: number, model: boolean, provider: "claude" | "codex" | "local" | "relay") {
  const results: { name: string; problem: string | null; record: Record_ }[] = [];
  const list =
    provider === "codex" ? codexChecks(model)
    : provider === "local" ? localChecks(model, port)
    : provider === "relay" ? relayChecks()
    : checks(model);
  for (const c of list) {
    let problem: string | null;
    let record: Record_ = { name: c.name, status: 0, headers: {}, body: null };
    try {
      const r = await c.run(port);
      record = { name: r.name, status: r.status, headers: r.headers, body: r.body };
      problem = c.expect(r);
    } catch (err) {
      problem = `request failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    results.push({ name: c.name, problem, record });
  }
  return results;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const model = !args.includes("--no-model");
  const providerAt = args.indexOf("--provider");
  const provider = providerAt === -1 ? "claude" : args[providerAt + 1];
  const ports = args.filter((a) => /^\d+$/.test(a)).map(Number);
  if (ports.length === 0 || ports.length > 2 || (provider !== "claude" && provider !== "codex" && provider !== "local" && provider !== "relay")) {
    console.error("usage: bun bridge-app/conformance.ts <port> [<second port>] [--no-model] [--site] [--provider claude|codex|local|relay]");
    process.exit(2);
  }
  let failures = 0;
  const all: Awaited<ReturnType<typeof runAll>>[] = [];
  for (const port of ports) {
    const health = await fetch(`http://127.0.0.1:${port}/health`).then((r) => r.text()).catch(() => "(no answer)");
    console.log(`\n# bridge on ${port}: ${health}`);
    const results = await runAll(port, model, provider);
    all.push(results);
    for (const r of results) {
      console.log(`${r.problem === null ? "PASS" : "FAIL"}  ${r.name}${r.problem === null ? "" : `\n      ${r.problem}`}`);
      if (r.problem !== null) failures += 1;
    }
    console.log(`# ${results.filter((r) => r.problem === null).length}/${results.length} pass on ${port}`);
  }
  if (args.includes("--site")) failures += await siteChecks(ports[0]!);
  if (all.length === 2) {
    const [a, b] = all as [Awaited<ReturnType<typeof runAll>>, Awaited<ReturnType<typeof runAll>>];
    let same = 0;
    console.log(`\n# same shapes, ${ports[0]} against ${ports[1]}`);
    for (let i = 0; i < a.length; i++) {
      const ra = a[i]!.record;
      const rb = b[i]!.record;
      if (eq({ ...ra, name: "" }, { ...rb, name: "" })) same += 1;
      else {
        failures += 1;
        console.log(`DIFF  ${a[i]!.name}\n      ${ports[0]}: ${JSON.stringify(ra)}\n      ${ports[1]}: ${JSON.stringify(rb)}`);
      }
    }
    console.log(`# ${same}/${a.length} identical`);
  }
  console.log(failures === 0 ? "\nconformance: pass" : `\nconformance: ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}
