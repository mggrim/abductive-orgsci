/**
 * Anthropic Messages API client — BYO console key, billed per token.
 *
 * This is NOT the subscription path. Subscription inference goes through the
 * local Claude Code CLI bridge (see cliBridge.ts), where the CLI holds the
 * credential. This client exists for two cases the bridge cannot serve: a
 * researcher without Claude Code installed, and the Node eval harness
 * (`bun run eval --live`), which reads its key from ANTHROPIC_API_KEY.
 *
 * Auth: a console key (sk-ant-api…) is read from sessionStorage at CALL time
 * (key 'bounds.auth.token'; the auth UI is owned by another feature). The key
 * is never persisted by this module and never written anywhere (ISC-37).
 * Requests carry `anthropic-dangerous-direct-browser-access` so the API
 * accepts a browser origin.
 *
 * The bearer/OAuth branch that used to live here was removed along with the
 * token-paste path: Anthropic rejects subscription OAuth tokens on raw
 * /v1/messages outside sanctioned apps, so it never delivered subscription
 * billing and only served to put a live credential in the page.
 */

import type {
  CompleteRequest,
  CompleteResult,
  InferenceClient,
} from "./types.ts";
import { applyVoiceGate } from "./voiceGate.ts";
import { devServerOrigin } from "./origin.ts";

export const AUTH_TOKEN_SESSION_KEY = "bounds.auth.token";
export const DEFAULT_MODEL = "claude-sonnet-5-5";

/**
 * Where a call goes, decided when it is made.
 *
 * In the browser, calls go through the dev server's same-origin proxy
 * (vite.config.ts) because org settings block direct browser CORS calls to
 * api.anthropic.com. In Node, which is the eval harness under `--live`, fetch
 * goes direct.
 *
 * Read at call time rather than at module load. It was a module constant, so
 * whichever environment happened to be in place the first time anything
 * imported this file was baked in for the life of the process. That is only
 * visible under test, where one file can register a DOM and the next cannot
 * unregister it out of a constant already computed, but a value that depends on
 * import order is worth not having.
 *
 * M36 added the third case, which is a browser that is not the dev server.
 *
 * The proxy is declared in `vite.config.ts` and nothing but the dev server
 * answers it, so on a static host `/anthropic-proxy/v1/messages` reaches the
 * host rather than Anthropic. A hosted page therefore goes direct, with the
 * `anthropic-dangerous-direct-browser-access` header the client already sends,
 * which is Anthropic's own browser path.
 *
 * What that path depends on is the key holder's organisation, not this code:
 * an org that has turned direct browser access off blocks it at the CORS
 * layer, which is the setting the proxy was written for in the first place. A
 * hosted deployment whose readers hit that needs a forwarder of its own on the
 * origin serving the app. See `src/inference/origin.ts`.
 */
export function apiUrl(): string {
  return typeof window === "undefined" || !devServerOrigin()
    ? "https://api.anthropic.com/v1/messages"
    : "/anthropic-proxy/v1/messages";
}
const DEFAULT_MAX_TOKENS = 4096;

/** Anthropic's model list, by the same route a call takes (see apiUrl). */
export function modelsUrl(): string {
  return apiUrl().replace(/\/messages$/, "/models");
}

/**
 * The models a console key may use (M60, ISC-580), for the card's list. The
 * key is the one the reader just pasted, passed in and sent to Anthropic only.
 */
export async function listAnthropicModels(key: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const res = await fetchImpl(`${modelsUrl()}?limit=100`, {
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
  });
  const body = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown }>; error?: { message?: unknown } } | null;
  if (!res.ok) {
    throw new Error(typeof body?.error?.message === "string" ? body.error.message : `Anthropic answered ${res.status}`);
  }
  return (body?.data ?? []).flatMap((m) => (typeof m?.id === "string" ? [m.id] : []));
}

interface AnthropicTextBlock {
  readonly type: string;
  readonly text?: string;
}

interface AnthropicMessagesResponse {
  readonly model: string;
  readonly content: readonly AnthropicTextBlock[];
}

export class MissingTokenError extends Error {
  constructor() {
    super(
      "Abductive couldn't find an Anthropic console key in this session. Connect a key, or start the local Claude CLI bridge, before running personas.",
    );
    this.name = "MissingTokenError";
  }
}

/**
 * Refuse anything that is not a console key.
 *
 * Loud rather than silent: a subscription OAuth token sent here comes back as
 * a bare 401 from the API, which reads to the researcher as "my subscription
 * has a problem" rather than "this is the wrong door". The bridge is the
 * subscription door, and the message says so.
 */
export class WrongCredentialShapeError extends Error {
  constructor() {
    super(
      "That credential is not an Anthropic console key (sk-ant-api…). Subscription access goes through the local Claude CLI bridge, not this client.",
    );
    this.name = "WrongCredentialShapeError";
  }
}

/** True when a token is present for this browser session. */
export function hasSessionToken(): boolean {
  try {
    return Boolean(sessionStorage.getItem(AUTH_TOKEN_SESSION_KEY));
  } catch {
    return false; // non-browser environment
  }
}

export interface AnthropicClientOptions {
  readonly model?: string;
  /** Injectable for tests; defaults to reading sessionStorage. */
  readonly getToken?: () => string | null;
  /** Injectable fetch for tests. */
  readonly fetchImpl?: typeof fetch;
}

export class AnthropicInferenceClient implements InferenceClient {
  #model: string;
  #getToken: () => string | null;
  #fetch: typeof fetch;

  constructor(options: AnthropicClientOptions = {}) {
    this.#model = options.model ?? DEFAULT_MODEL;
    this.#getToken =
      options.getToken ?? (() => sessionStorage.getItem(AUTH_TOKEN_SESSION_KEY));
    this.#fetch = options.fetchImpl ?? fetch.bind(globalThis);
  }

  get requestedModel(): string {
    return this.#model;
  }

  /** M60, ISC-581: an Option B turn on Anthropic's API records the provider. */
  get provider(): "anthropic" {
    return "anthropic";
  }

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const token = this.#getToken();
    if (token === null || token.trim().length === 0) {
      throw new MissingTokenError();
    }

    // One credential shape only. See WrongCredentialShapeError.
    if (!token.trim().startsWith("sk-ant-api")) {
      throw new WrongCredentialShapeError();
    }

    const response = await this.#fetch(apiUrl(), {
      method: "POST",
      ...(req.signal === undefined ? {} : { signal: req.signal }),
      headers: {
        "content-type": "application/json",
        "x-api-key": token,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: this.#model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Anthropic API error ${response.status}: ${body.slice(0, 300)}`,
      );
    }

    const data = (await response.json()) as AnthropicMessagesResponse;
    const text = data.content
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n");

    // Gated here rather than at any render site: this is one of the three
    // doors model text uses to get into the app, and FND-01 was caused by
    // trusting the far side of those doors (see voiceGate.ts).
    return applyVoiceGate({
      text,
      model: this.#model,
      // The API echoes the concrete model string it served (ISC-5).
      modelVersion: data.model,
      provider: "anthropic",
    });
  }
}
