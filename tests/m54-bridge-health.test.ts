/**
 * M54, ISC-548. The bridge's /health says what is missing on this machine:
 * `{ok, claude: version | null, signedIn: true | false | null, bun}`.
 */

import { describe, expect, test } from "bun:test";
import { createHandler } from "../scripts/cli-bridge.ts";

async function health(probes: Parameters<typeof createHandler>[0]) {
  const handler = createHandler(probes);
  const res = await handler.fetch({
    url: "http://localhost:8787/health",
    method: "GET",
    headers: { get: () => null },
  } as unknown as Request);
  return (await res.json()) as Record<string, unknown>;
}

describe("ISC-548: the health reply names what is missing", () => {
  test("no claude on the PATH: claude null, and sign-in is not asked", async () => {
    let asked = false;
    const body = await health({
      claudeVersion: async () => null,
      signedIn: async () => {
        asked = true;
        return true;
      },
    });
    // M56 added `providers` beside the M54 fields, which keep their meaning.
    expect(body).toEqual({
      ok: true,
      claude: null,
      signedIn: null,
      bun: Bun.version,
      providers: {
        claude: { version: null, signedIn: null },
        codex: { version: null, signedIn: null },
        // M60: a bridge with no local probes reports no local server.
        local: { reachable: false, endpoint: null, models: [], needsKey: false },
      },
    });
    expect(asked).toBe(false);
  });

  test("claude present but signed out", async () => {
    const body = await health({ claudeVersion: async () => "2.1.283 (Claude Code)", signedIn: async () => false });
    expect(body).toEqual({
      ok: true,
      claude: "2.1.283 (Claude Code)",
      signedIn: false,
      bun: Bun.version,
      providers: {
        claude: { version: "2.1.283 (Claude Code)", signedIn: false },
        codex: { version: null, signedIn: null },
        local: { reachable: false, endpoint: null, models: [], needsKey: false },
      },
    });
  });

  test("claude present and signed in", async () => {
    const body = await health({ claudeVersion: async () => "2.1.283 (Claude Code)", signedIn: async () => true });
    expect(body.signedIn).toBe(true);
    expect(typeof body.bun).toBe("string");
  });

  test("the real probes ask `claude auth status` first and bound every call", async () => {
    const src = await Bun.file(new URL("../scripts/cli-bridge.ts", import.meta.url).pathname).text();
    expect(src).toContain('["claude", "auth", "status"]');
    expect(src).toContain('["claude", "--version"]');
    // Every short probe runs under a 10 s kill.
    expect(src.match(/,\s*10_000,?\s*\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
