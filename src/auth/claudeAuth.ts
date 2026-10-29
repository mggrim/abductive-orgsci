/**
 * Console API key acquisition (ISC-37).
 *
 * One path: the researcher pastes an Anthropic console key (sk-ant-api…),
 * held in sessionStorage under AUTH_TOKEN_SESSION_KEY (imported from the
 * inference client so the two modules can never drift apart).
 *
 * There is deliberately no subscription path through this module. Subscription
 * inference goes through the local Claude Code CLI bridge, where the CLI holds
 * the credential and the app never sees it. Pasting a subscription OAuth token
 * here was removed: Anthropic rejects those on raw /v1/messages outside
 * sanctioned apps, so the path billed as a subscription and behaved as a
 * console key, and it was the only place the browser ever held a live
 * credential of its own.
 *
 * HARD RULE (ISC-37): keys live in sessionStorage ONLY — never localStorage,
 * never IndexedDB, never any persistent store, never a server. The storage
 * seam below is injectable for tests, but the default is always the
 * session-scoped store.
 */

import { AUTH_TOKEN_SESSION_KEY } from "../inference/anthropic.ts";
import { API_PROVIDERS, type ApiChoice, type ApiProvider, type ApiRoute } from "../inference/apiProviders.ts";

// ---------------------------------------------------------------------------
// Session-only key storage (ISC-37)
// ---------------------------------------------------------------------------

/** Minimal Storage seam so tests can record exactly what gets written where. */
export interface TokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The ONLY default store is the session-scoped one. Never localStorage. */
function sessionStore(): TokenStorage {
  return globalThis.sessionStorage;
}

/**
 * Console keys only.
 *
 * The prefix check is the whole point rather than a formality: a subscription
 * OAuth token is a long opaque string that passes any length-and-no-whitespace
 * test, and accepting one here is what let the browser hold a credential the
 * CLI bridge exists to keep out of it.
 */
export function looksLikeToken(raw: string): boolean {
  const token = raw.trim();
  return token.startsWith("sk-ant-api") && token.length >= 20 && !/\s/.test(token);
}

export function setSessionToken(token: string, storage: TokenStorage = sessionStore()): void {
  const trimmed = token.trim();
  if (!looksLikeToken(trimmed)) {
    throw new Error(
      "That isn't an Anthropic console key (they start sk-ant-api). To use your subscription, choose \"Use Claude Code\".",
    );
  }
  storage.setItem(AUTH_TOKEN_SESSION_KEY, trimmed);
}

export function getSessionToken(storage: TokenStorage = sessionStore()): string | null {
  try {
    return storage.getItem(AUTH_TOKEN_SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearSessionToken(storage: TokenStorage = sessionStore()): void {
  storage.removeItem(AUTH_TOKEN_SESSION_KEY);
}

/** "sk-ant-api03-…wxyz" — never render a full key. */
export function maskToken(token: string): string {
  const t = token.trim();
  if (t.length <= 12) return "…" + t.slice(-4);
  return `${t.slice(0, 10)}…${t.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// M60, ISC-578. The local lane's key and endpoint, session-only (ISC-37)
// ---------------------------------------------------------------------------

/**
 * A local model server that asks for a key (the owner's own OpenAI-compatible
 * server on port 8000 does) takes one the reader types on the card. The same
 * rule as the console key: this browser session only, never a persistent
 * store, masked on screen, and sent to the bridge with each request, which
 * relays it in memory to the server on this machine and writes it nowhere.
 */
export const LOCAL_KEY_SESSION_KEY = "bounds.auth.localKey";
/** A server on a port the bridge does not probe, as the reader named it. Not a credential; session-only too. */
export const LOCAL_ENDPOINT_SESSION_KEY = "bounds.local.endpoint";

export function setLocalKey(key: string, storage: TokenStorage = sessionStore()): void {
  const trimmed = key.trim();
  if (trimmed === "" || /\s/.test(trimmed)) {
    throw new Error("A server's key is one word, without spaces.");
  }
  storage.setItem(LOCAL_KEY_SESSION_KEY, trimmed);
}

export function getLocalKey(storage: TokenStorage = sessionStore()): string | null {
  try {
    return storage.getItem(LOCAL_KEY_SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearLocalKey(storage: TokenStorage = sessionStore()): void {
  storage.removeItem(LOCAL_KEY_SESSION_KEY);
}

export function setLocalEndpoint(endpoint: string, storage: TokenStorage = sessionStore()): void {
  storage.setItem(LOCAL_ENDPOINT_SESSION_KEY, endpoint);
}

export function getLocalEndpoint(storage: TokenStorage = sessionStore()): string | null {
  try {
    return storage.getItem(LOCAL_ENDPOINT_SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearLocalEndpoint(storage: TokenStorage = sessionStore()): void {
  storage.removeItem(LOCAL_ENDPOINT_SESSION_KEY);
}

// ---------------------------------------------------------------------------
// M60, ISC-580. Option B takes any API key, under the same rule (ISC-37)
// ---------------------------------------------------------------------------

/**
 * Whether a pasted string has the shape of a key for this provider. The shape
 * checks are loose on purpose, except for one refusal everywhere: a Claude
 * credential ("sk-ant-") is never taken as another provider's key, and a Claude
 * subscription token ("sk-ant-oat") is never taken at all, since the bridge is
 * the subscription door (see looksLikeToken).
 */
export function looksLikeKey(provider: ApiProvider, raw: string): boolean {
  const key = raw.trim();
  if (key === "" || /\s/.test(key)) return false;
  if (provider === "anthropic") return looksLikeToken(key);
  if (key.startsWith("sk-ant-")) return false;
  switch (provider) {
    case "openai":
      return key.startsWith("sk-") && !key.startsWith("sk-or-") && key.length >= 20;
    case "google":
      return key.startsWith("AIza") && key.length >= 30;
    case "openrouter":
      return key.startsWith("sk-or-") && key.length >= 20;
    case "compatible":
      return key.length >= 8;
  }
}

/** Hold a key for this browser session, under the one session key every provider shares. */
export function setApiKey(provider: ApiProvider, key: string, storage: TokenStorage = sessionStore()): void {
  if (!looksLikeKey(provider, key)) {
    throw new Error("That doesn't look like a key for the provider that you picked.");
  }
  storage.setItem(AUTH_TOKEN_SESSION_KEY, key.trim());
}

/** The provider, its root, the model and the route. Session-only, and never a credential. */
export const API_CHOICE_SESSION_KEY = "bounds.auth.api";

export function setApiChoice(choice: ApiChoice, storage: TokenStorage = sessionStore()): void {
  storage.setItem(
    API_CHOICE_SESSION_KEY,
    JSON.stringify({
      provider: choice.provider,
      ...(choice.baseUrl === undefined ? {} : { baseUrl: choice.baseUrl }),
      ...(choice.model === undefined ? {} : { model: choice.model }),
      ...(choice.route === undefined ? {} : { route: choice.route }),
    }),
  );
}

/** The choice for this session; Anthropic when none is stored, which is every session from before M60. */
export function getApiChoice(storage: TokenStorage = sessionStore()): ApiChoice {
  let raw: string | null = null;
  try {
    raw = storage.getItem(API_CHOICE_SESSION_KEY);
  } catch {
    return { provider: "anthropic" };
  }
  if (raw === null) return { provider: "anthropic" };
  try {
    const v = JSON.parse(raw) as { provider?: unknown; baseUrl?: unknown; model?: unknown; route?: unknown };
    const provider = API_PROVIDERS.includes(v.provider as ApiProvider) ? (v.provider as ApiProvider) : "anthropic";
    return {
      provider,
      ...(typeof v.baseUrl === "string" ? { baseUrl: v.baseUrl } : {}),
      ...(typeof v.model === "string" && v.model !== "" ? { model: v.model } : {}),
      ...(v.route === "direct" || v.route === "relay" ? { route: v.route as ApiRoute } : {}),
    };
  } catch {
    return { provider: "anthropic" };
  }
}

export function clearApiChoice(storage: TokenStorage = sessionStore()): void {
  storage.removeItem(API_CHOICE_SESSION_KEY);
}
