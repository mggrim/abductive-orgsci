/**
 * Option B's providers (M60, ISC-580): which API a pasted key belongs to, where
 * that API lives, and what the record calls it.
 *
 * Anthropic keeps its own client (`anthropic.ts`, the Messages API with the
 * browser-access header). Every other provider is reached through the one
 * surface they share, the OpenAI-compatible chat API, by
 * `openaiCompatible.ts`: OpenAI itself, Gemini through Google's OpenAI
 * endpoint, OpenRouter, and any other service by its https root.
 *
 * Browser origins, checked from https://abductive.pages.dev on 2026-09-28 with
 * a preflight and a real request each: OpenAI, Gemini's OpenAI endpoint and
 * OpenRouter all answer with Access-Control-Allow-Origin, so the page calls them
 * directly. A service that does not is reached through the bridge's relay.
 *
 * Nothing here holds or reads a credential; the key is claudeAuth.ts's.
 */

export type ApiProvider = "anthropic" | "openai" | "google" | "openrouter" | "compatible";

/** The card's order. */
export const API_PROVIDERS: readonly ApiProvider[] = ["anthropic", "openai", "google", "openrouter", "compatible"];

/** How a call reaches the provider: from the page, or through the bridge on this machine. */
export type ApiRoute = "direct" | "relay";

/** The reader's Option B choice. Session-only, and never a credential. */
export interface ApiChoice {
  readonly provider: ApiProvider;
  /** "Another OpenAI-compatible service" only: its https root, e.g. https://api.together.xyz/v1. */
  readonly baseUrl?: string;
  readonly model?: string;
  readonly route?: ApiRoute;
}

const ROOTS: Record<"openai" | "google" | "openrouter", string> = {
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  openrouter: "https://openrouter.ai/api/v1",
};

/**
 * An https root for another service, canonical, without a trailing slash; null
 * for http, credentials, a query, or a loopback host (a server on this machine
 * is the local lane's). The bridge's relay applies the same rule (`relayBase`).
 */
export function compatibleBase(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    return null;
  }
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || host.startsWith("127.")) return null;
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/** The OpenAI-compatible root a choice calls; null for Anthropic, or a service with no valid root. */
export function apiBase(choice: ApiChoice): string | null {
  if (choice.provider === "anthropic") return null;
  if (choice.provider === "compatible") return choice.baseUrl === undefined ? null : compatibleBase(choice.baseUrl);
  return ROOTS[choice.provider];
}

/** What the record calls the provider (ISC-581): its word, or another service's host. */
export function recordedProvider(choice: ApiChoice): string {
  if (choice.provider !== "compatible") return choice.provider;
  const base = apiBase(choice);
  return base === null ? "compatible" : new URL(base).host;
}

/** OpenAI lists every model it serves; these are the ones that are not chat models. */
const NOT_CHAT = /embed|tts|whisper|dall-e|image|audio|realtime|moderation|transcribe|search|davinci|babbage|sora/;

/**
 * The list the card offers. OpenAI's is cut to chat models; Gemini's ids arrive
 * as "models/gemini-2.5-flash" and are used without the prefix.
 */
export function chatModels(provider: ApiProvider, ids: readonly string[]): string[] {
  if (provider === "openai") return ids.filter((id) => !NOT_CHAT.test(id));
  if (provider === "google") return ids.map((id) => id.replace(/^models\//, "")).filter((id) => !/embed|aqa|imagen/.test(id));
  return [...ids];
}

/**
 * The model the card picks first from a list: a current general model where the
 * provider lists one, else the first the provider lists. The reader changes it
 * in the list.
 */
/* ISC-591 (owner, 2026-09-30): current models first. Anthropic's newest Sonnet,
 * then Opus and Haiku; OpenAI's gpt-6.1-sol, which the API serves, then
 * gpt-5.6-sol and gpt-5.5. Gemini's order is unchanged: its ids were not
 * checked against the live list this round. */
const PREFERRED: Record<ApiProvider, readonly string[]> = {
  anthropic: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5"],
  openai: ["gpt-6.1-sol", "gpt-5.6-sol", "gpt-5.5"],
  google: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  openrouter: [],
  compatible: [],
};

export function preferredModel(provider: ApiProvider, models: readonly string[]): string {
  return PREFERRED[provider].find((m) => models.includes(m)) ?? models[0]!;
}
