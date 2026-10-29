/**
 * M54, ISC-546. The hosted site reaches a bridge on the reader's own machine.
 *
 * Two halves. The client picks where the bridge is by origin: the dev server's
 * same-origin proxy on loopback, and `http://localhost:8787` then
 * `http://127.0.0.1:8787` anywhere else. The bridge answers CORS for the site's
 * own origins and loopback dev origins only, and refuses every other origin
 * before any work is done, so a page elsewhere cannot spend the reader's
 * subscription with a "simple" request whose answer it never reads.
 */

import { useDom } from "./dom.ts";
useDom();

import { afterEach, describe, expect, test } from "bun:test";
import {
  bridgeBase,
  bridgeBases,
  checkBridgeHealth,
  CliBridgeInferenceClient,
  resetBridgeDetection,
} from "../src/inference/cliBridge.ts";
import {
  BRIDGE_HOSTNAMES,
  bridgePort,
  corsDecision,
  createHandler,
} from "../scripts/cli-bridge.ts";

afterEach(() => resetBridgeDetection());

function withHost<T>(hostname: string, run: () => Promise<T> | T): Promise<T> {
  const original = window.location.hostname;
  Object.defineProperty(window.location, "hostname", { value: hostname, configurable: true });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      Object.defineProperty(window.location, "hostname", { value: original, configurable: true });
    });
}

const healthy = (): Response =>
  Response.json({ ok: true, claude: "2.1.283 (Claude Code)", signedIn: true, bun: "1.3.14" });

describe("ISC-546: the client picks the bridge's address by origin", () => {
  test("the dev origin keeps the same-origin proxy", () => {
    for (const host of ["localhost", "127.0.0.1", "app.localhost"]) {
      expect({ host, bases: bridgeBases(host) }).toEqual({ host, bases: ["/cli-bridge"] });
    }
  });

  test("a hosted origin goes to localhost first and 127.0.0.1 second", () => {
    for (const host of ["abductive.pages.dev", "abc123.abductive.pages.dev", "mac.tail28ec80.ts.net"]) {
      expect({ host, bases: bridgeBases(host) }).toEqual({
        host,
        bases: ["http://localhost:8787", "http://127.0.0.1:8787"],
      });
    }
  });

  test("on a hosted origin the probe falls back to 127.0.0.1 and the client then uses it", async () => {
    await withHost("abductive.pages.dev", async () => {
      const asked: string[] = [];
      const fetchImpl = (async (input: RequestInfo | URL) => {
        const url = String(input);
        asked.push(url);
        if (url.startsWith("http://localhost")) throw new TypeError("Failed to fetch");
        if (url.endsWith("/health")) return healthy();
        return Response.json({ text: "hello", model: "sonnet", modelVersion: "sonnet" });
      }) as typeof fetch;

      const health = await checkBridgeHealth(fetchImpl, 1000);
      expect(health.ok).toBe(true);
      expect(asked).toEqual(["http://localhost:8787/health", "http://127.0.0.1:8787/health"]);
      expect(bridgeBase()).toBe("http://127.0.0.1:8787");

      const client = new CliBridgeInferenceClient({ fetchImpl });
      await client.complete({ system: "", messages: [{ role: "user", content: "hi" }] } as never);
      expect(asked.at(-1)).toBe("http://127.0.0.1:8787/complete");
    });
  });

  test("through the dev proxy, a 5xx is the proxy failing to reach the bridge, not another program", async () => {
    await withHost("localhost", async () => {
      const proxyDown = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
      expect((await checkBridgeHealth(proxyDown, 1000)).reason).toBe("unreachable");
      const foreign = (async () => new Response("not found", { status: 404 })) as unknown as typeof fetch;
      expect((await checkBridgeHealth(foreign, 1000)).reason).toBe("not-bridge");
    });
  });

  test("the dev origin asks the proxy and nothing else", async () => {
    await withHost("localhost", async () => {
      const asked: string[] = [];
      const fetchImpl = (async (input: RequestInfo | URL) => {
        asked.push(String(input));
        return healthy();
      }) as typeof fetch;
      await checkBridgeHealth(fetchImpl, 1000);
      expect(asked).toEqual(["/cli-bridge/health"]);
    });
  });
});

describe("ISC-546: the bridge's CORS decision, over the Origin header", () => {
  const CASES: readonly [string | null, "allow" | "refuse" | "no-origin"][] = [
    // The site and its preview deployments.
    ["https://abductive.pages.dev", "allow"],
    ["https://abc123.abductive.pages.dev", "allow"],
    ["https://m54.abductive.pages.dev", "allow"],
    // Loopback dev origins, any port.
    ["http://localhost:5173", "allow"],
    ["http://localhost:5194", "allow"],
    ["http://127.0.0.1:5173", "allow"],
    ["http://[::1]:5173", "allow"],
    ["http://app.localhost:5173", "allow"],
    // Not the site: lookalikes, the wrong scheme, and everyone else.
    ["http://abductive.pages.dev", "refuse"],
    ["https://abductive.pages.dev.evil.com", "refuse"],
    ["https://evilabductive.pages.dev", "refuse"],
    ["https://other.pages.dev", "refuse"],
    ["https://example.com", "refuse"],
    ["http://192.168.1.20:5173", "refuse"],
    ["http://localhost.evil.com", "refuse"],
    ["null", "refuse"],
    // No Origin header: a terminal, curl, or the dev proxy with no browser
    // origin to forward. Nothing cross-origin to answer.
    [null, "no-origin"],
  ];

  for (const [origin, want] of CASES) {
    test(`${origin ?? "(no Origin)"} → ${want}`, () => {
      expect(corsDecision(origin)).toBe(want);
    });
  }

  test("an extra origin named at launch is allowed exactly, and nothing near it", () => {
    const extra = ["https://mac.tail28ec80.ts.net:8443"];
    expect(corsDecision("https://mac.tail28ec80.ts.net:8443", extra)).toBe("allow");
    expect(corsDecision("https://mac.tail28ec80.ts.net", extra)).toBe("refuse");
  });
});

/**
 * A request as the bridge sees it. Happy DOM's `Request` (registered for the
 * whole process) drops `Origin` as a forbidden header, which is right for a
 * page and wrong for a server under test, so the handler gets a plain object
 * with the three things it reads.
 */
function req(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Request {
  const headers = Object.fromEntries(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    url,
    method: init.method ?? "GET",
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => JSON.parse(init.body ?? "{}"),
  } as unknown as Request;
}

describe("ISC-546: the bridge's handler applies the decision", () => {
  const handler = createHandler({
    claudeVersion: async () => "2.1.283 (Claude Code)",
    signedIn: async () => true,
  });

  for (const path of ["/health", "/complete", "/stream"]) {
    test(`preflight for ${path} from the site is answered`, async () => {
      const res = await handler.fetch(
        req(`http://localhost:8787${path}`, {
          method: "OPTIONS",
          headers: {
            origin: "https://abductive.pages.dev",
            "access-control-request-method": path === "/health" ? "GET" : "POST",
            "access-control-request-headers": "content-type",
            "access-control-request-private-network": "true",
          },
        }),
      );
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("https://abductive.pages.dev");
      expect(res.headers.get("access-control-allow-headers")).toContain("content-type");
      expect(res.headers.get("access-control-allow-private-network")).toBe("true");
      expect(res.headers.get("vary")).toContain("Origin");
    });
  }

  test("health from the site carries the origin back", async () => {
    const res = await handler.fetch(
      req("http://localhost:8787/health", { headers: { origin: "https://abductive.pages.dev" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://abductive.pages.dev");
  });

  test("any other origin is refused with no CORS headers, before any work", async () => {
    let ran = false;
    const guarded = createHandler({
      claudeVersion: async () => {
        ran = true;
        return "x";
      },
      signedIn: async () => true,
    });
    for (const method of ["OPTIONS", "GET"]) {
      const res = await guarded.fetch(
        req("http://localhost:8787/health", { method, headers: { origin: "https://example.com" } }),
      );
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
    const post = await guarded.fetch(
      req("http://localhost:8787/complete", {
        method: "POST",
        headers: { origin: "https://example.com", "content-type": "text/plain" },
        body: "{}",
      }),
    );
    expect(post.status).toBe(403);
    expect(ran).toBe(false);
  });

  test("a request with no Origin works and gets no CORS headers", async () => {
    const res = await handler.fetch(req("http://localhost:8787/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("preflight for any other path is not answered", async () => {
    const res = await handler.fetch(
      req("http://localhost:8787/elsewhere", {
        method: "OPTIONS",
        headers: { origin: "https://abductive.pages.dev" },
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe("ISC-546: the bridge binds to loopback only", () => {
  test("the listen addresses are loopback and never the wildcard", () => {
    expect([...BRIDGE_HOSTNAMES]).toEqual(["127.0.0.1", "::1"]);
    const src = require("node:fs").readFileSync(
      new URL("../scripts/cli-bridge.ts", import.meta.url).pathname,
      "utf8",
    ) as string;
    expect(src).not.toContain('"0.0.0.0"');
    expect(src).toContain("hostname");
  });

  test("the port is 8787 unless the launch names another", () => {
    expect(bridgePort({})).toBe(8787);
    expect(bridgePort({ ABDUCTIVE_BRIDGE_PORT: "8797" })).toBe(8797);
    expect(bridgePort({ ABDUCTIVE_BRIDGE_PORT: "nonsense" })).toBe(8787);
  });
});
