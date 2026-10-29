/** Auth tests (ISC-37): console-key storage discipline, and the closed door. */

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearSessionToken,
  getSessionToken,
  looksLikeToken,
  maskToken,
  setSessionToken,
  type TokenStorage,
} from "../src/auth/claudeAuth.ts";
import { AUTH_TOKEN_SESSION_KEY } from "../src/inference/anthropic.ts";

/** Recording fake Storage: captures every call for assertion. */
function recordingStorage() {
  const map = new Map<string, string>();
  const calls: { op: string; key: string; value?: string }[] = [];
  const storage: TokenStorage = {
    getItem(key) {
      calls.push({ op: "get", key });
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      calls.push({ op: "set", key, value });
      map.set(key, value);
    },
    removeItem(key) {
      calls.push({ op: "remove", key });
      map.delete(key);
    },
  };
  return { storage, calls, map };
}

describe("session-only key storage (ISC-37)", () => {
  const TOKEN = "sk-" + "ant-api03-test-token-0123456789";

  afterEach(() => {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  test("set/get/clear round-trip under the shared session key", () => {
    const { storage } = recordingStorage();
    setSessionToken(TOKEN, storage);
    expect(getSessionToken(storage)).toBe(TOKEN);
    clearSessionToken(storage);
    expect(getSessionToken(storage)).toBeNull();
  });

  test("writes go ONLY to the injected session store, under AUTH_TOKEN_SESSION_KEY", () => {
    const { storage, calls } = recordingStorage();
    setSessionToken(TOKEN, storage);
    const writes = calls.filter((c) => c.op === "set");
    expect(writes).toEqual([{ op: "set", key: AUTH_TOKEN_SESSION_KEY, value: TOKEN }]);
  });

  test("default path uses globalThis.sessionStorage and never touches localStorage", () => {
    const session = recordingStorage();
    const local = recordingStorage();
    (globalThis as { sessionStorage?: unknown }).sessionStorage = session.storage;
    (globalThis as { localStorage?: unknown }).localStorage = local.storage;

    setSessionToken(TOKEN);
    expect(getSessionToken()).toBe(TOKEN);
    clearSessionToken();

    expect(session.calls.length).toBeGreaterThan(0);
    expect(local.calls).toHaveLength(0); // localStorage untouched, ever
  });

  test("static guarantee: auth + inference CODE never references persistent stores", () => {
    const root = join(import.meta.dir, "..", "src");
    for (const file of [
      join(root, "auth", "claudeAuth.ts"),
      join(root, "auth", "AuthPanel.tsx"),
      join(root, "inference", "anthropic.ts"),
    ]) {
      // Strip comments — the ISC-37 rule is allowed to NAME the forbidden
      // stores in prose; the code may not TOUCH them.
      //
      // M54: the one persistent value in the auth and inference surface, the
      // kept choice of the local CLI, lives in `inference/providerChoice.ts`,
      // outside these three files on purpose. It stores the literal "cli" and
      // nothing else (`tests/m54-provider-kept.test.ts`), and AuthPanel reaches
      // it only through that module's named functions, so this ban still holds
      // by text rather than by exception.
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code).not.toContain("localStorage");
      expect(code.toLowerCase()).not.toContain("indexeddb");
      expect(code).not.toContain("openDB");
    }
  });

  test("rejects strings that do not look like console keys", () => {
    const { storage, calls } = recordingStorage();
    expect(() => setSessionToken("", storage)).toThrow();
    expect(() => setSessionToken("short", storage)).toThrow();
    expect(calls.filter((c) => c.op === "set")).toHaveLength(0);
    expect(looksLikeToken("sk-" + "ant-api03-valid-looking-token")).toBe(true);
    expect(looksLikeToken("has whitespace inside this string")).toBe(false);
  });

  test("maskToken never reveals the middle of a key", () => {
    const masked = maskToken(TOKEN);
    expect(masked).toContain("…");
    expect(masked.length).toBeLessThan(TOKEN.length);
    expect(masked).not.toContain("test-token");
  });
});

describe("Anti: the subscription credential cannot enter the browser", () => {
  // A subscription OAuth access token is a long opaque string with no
  // whitespace, which is exactly what the old looksLikeToken accepted. These
  // are the shapes that used to get in.
  const OAUTH_SHAPED = [
    "sk-" + "ant-oat01-abcdefghijklmnopqrstuvwxyz",
    "oauth-access-token-abcdefghijklmnop",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnop",
  ];

  test("looksLikeToken refuses every OAuth-shaped credential", () => {
    for (const candidate of OAUTH_SHAPED) {
      expect(looksLikeToken(candidate)).toBe(false);
    }
  });

  test("setSessionToken writes nothing when handed one", () => {
    for (const candidate of OAUTH_SHAPED) {
      const { storage, calls } = recordingStorage();
      expect(() => setSessionToken(candidate, storage)).toThrow(/console key/);
      expect(calls.filter((c) => c.op === "set")).toHaveLength(0);
    }
  });

  test("Anti: no PKCE or OAuth machinery survives in the auth module", () => {
    const source = readFileSync(
      join(import.meta.dir, "..", "src", "auth", "claudeAuth.ts"),
      "utf8",
    );
    // Comments may explain why the flow is gone; the code may not implement it.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const banned of [
      "code_challenge",
      "generatePkce",
      "buildAuthorizeUrl",
      "exchangeCodeForToken",
      "oauth/authorize",
      "CLAUDE_OAUTH_CLIENT_ID",
    ]) {
      expect(code).not.toContain(banned);
    }
  });

  test("Anti: the token-extraction script is gone from the repo", () => {
    const path = join(import.meta.dir, "..", "scripts", "copy-token.sh");
    expect(() => readFileSync(path, "utf8")).toThrow();
  });
});
