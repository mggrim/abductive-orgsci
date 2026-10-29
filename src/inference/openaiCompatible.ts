/**
 * Option B for every provider but Anthropic (M60, ISC-580): OpenAI, Gemini
 * through Google's OpenAI endpoint, OpenRouter, and any other OpenAI-compatible
 * service by its https root. One client, because all four speak the same chat
 * API.
 *
 * The key is the reader's own, pasted on the card and held in sessionStorage
 * by claudeAuth.ts under the rule the console key has always had (ISC-37): read
 * at call time, sent to the provider and nowhere else, never written by this
 * module. The choice beside it (provider, root, model, route) holds no
 * credential.
 *
 * Two routes. Direct: the page calls the provider, which the three named
 * providers allow (checked from the hosted origin on 2026-09-28). Relay: a
 * service that refuses a web page is called through the bridge on this machine,
 * which passes the one request on with the key in its header and keeps nothing
 * (scripts/cli-bridge.ts, "The relay"). The route is found once, when the card
 * lists the models, and kept in the choice.
 */

import type { CompleteRequest, CompleteResult, InferenceClient, StreamDelta } from "./types.ts";
import { applyVoiceGate, createStreamVoiceGate } from "./voiceGate.ts";
import { apiBase, type ApiChoice, type ApiRoute, chatModels, recordedProvider } from "./apiProviders.ts";
import { bridgeBase, parseSseFrame } from "./cliBridge.ts";
import { listAnthropicModels } from "./anthropic.ts";
import { getApiChoice, getSessionToken } from "../auth/claudeAuth.ts";

export class MissingApiKeyError extends Error {
  constructor() {
    super("This browser session is missing an API key. Connect one on Model access.");
    this.name = "MissingApiKeyError";
  }
}

/** The provider's own words from an error body, whatever shape it came in. */
function providerMessage(body: unknown, status: number): string {
  const b = body as { error?: unknown } | Array<{ error?: unknown }> | null;
  const e = Array.isArray(b) ? b[0]?.error : b?.error;
  if (typeof e === "string") return e;
  const m = (e as { message?: unknown } | undefined)?.message;
  return typeof m === "string" ? m : `the provider answered ${status}`;
}

export interface OpenAICompatibleOptions {
  readonly fetchImpl?: typeof fetch;
  /** Injectable for tests; the session's choice and key otherwise, read at call time. */
  readonly getChoice?: () => ApiChoice;
  readonly getKey?: () => string | null;
}

export class OpenAICompatibleClient implements InferenceClient {
  readonly #fetch: typeof fetch;
  readonly #choice: () => ApiChoice;
  readonly #key: () => string | null;

  constructor(options: OpenAICompatibleOptions = {}) {
    this.#fetch = options.fetchImpl ?? fetch.bind(globalThis);
    this.#choice = options.getChoice ?? (() => getApiChoice());
    this.#key = options.getKey ?? (() => getSessionToken());
  }

  get requestedModel(): string {
    return this.#choice().model ?? "unnamed model";
  }

  /** M60, ISC-581: the provider the record names, its word or the service's host. */
  get provider(): string {
    return recordedProvider(this.#choice());
  }

  #prepare(req: CompleteRequest, stream: boolean) {
    const choice = this.#choice();
    const key = this.#key();
    const base = apiBase(choice);
    if (key === null || key.trim() === "") throw new MissingApiKeyError();
    if (base === null || choice.model === undefined) throw new Error("Pick a provider and a model on Model access first.");
    const messages = [
      ...(req.system.trim() === "" ? [] : [{ role: "system", content: req.system }]),
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    // OpenAI's reasoning models refuse max_tokens and count their reasoning
    // against max_completion_tokens, so a short cap there can leave no answer;
    // the prompts ask for the length they want, and OpenAI gets no cap.
    const cap = req.maxTokens === undefined || choice.provider === "openai" ? {} : { max_tokens: req.maxTokens };
    const route: ApiRoute = choice.route ?? "direct";
    const signal = req.signal === undefined ? {} : { signal: req.signal };
    if (route === "relay") {
      return {
        choice,
        url: `${bridgeBase()}/${stream ? "stream" : "complete"}`,
        init: {
          method: "POST",
          ...signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "relay",
            baseUrl: base,
            key,
            model: choice.model,
            system: req.system,
            messages: req.messages,
            ...(req.maxTokens === undefined ? {} : { maxTokens: req.maxTokens }),
          }),
        },
        relay: true,
      };
    }
    return {
      choice,
      url: `${base}/chat/completions`,
      init: {
        method: "POST",
        ...signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: choice.model, stream, ...cap, messages }),
      },
      relay: false,
    };
  }

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const call = this.#prepare(req, false);
    const res = await this.#fetch(call.url, call.init);
    const body = (await res.json().catch(() => null)) as any;
    if (!res.ok) {
      const why = call.relay ? String(body?.error ?? res.status) : providerMessage(body, res.status);
      throw new Error(`API error ${res.status}: ${why.slice(0, 300)}`);
    }
    const model = call.choice.model!;
    if (call.relay) {
      return applyVoiceGate({ text: String(body.text ?? ""), model, modelVersion: String(body.modelVersion ?? model), provider: this.provider });
    }
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== "string") throw new Error("API error: the provider gave no reply");
    // The model asked for is the model; what the provider served is its version (ISC-5).
    return applyVoiceGate({
      text,
      model,
      modelVersion: typeof body.model === "string" && body.model !== "" ? body.model : model,
      provider: this.provider,
    });
  }

  async completeStream(req: CompleteRequest, onDelta: (delta: StreamDelta) => void): Promise<CompleteResult> {
    const call = this.#prepare(req, true);
    const res = await this.#fetch(call.url, call.init);
    if (!res.ok || res.body === null) {
      const body = (await res.json().catch(() => null)) as any;
      const why = call.relay ? String(body?.error ?? res.status) : providerMessage(body, res.status);
      throw new Error(`API error ${res.status}: ${why.slice(0, 300)}`);
    }
    const model = call.choice.model!;
    const gate = createStreamVoiceGate(onDelta);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let served = model;
    let failure: string | null = null;
    let finalText: string | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        if (call.relay) {
          // The bridge's own SSE, as the local lanes send it.
          const parsed = parseSseFrame(frame);
          if (parsed === null) continue;
          if (parsed.event === "delta" && typeof parsed.data.text === "string") {
            text += parsed.data.text;
            gate.push(parsed.data.text);
          } else if (parsed.event === "final") {
            finalText = typeof parsed.data.text === "string" ? parsed.data.text : text;
            if (typeof parsed.data.model === "string") served = parsed.data.model;
          } else if (parsed.event === "error") {
            failure = typeof parsed.data.message === "string" ? parsed.data.message : "stream failed";
          }
          continue;
        }
        // The provider's SSE: data lines of chat chunks, then [DONE].
        for (const line of frame.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          let chunk: any;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }
          if (chunk?.error !== undefined) {
            failure = providerMessage(chunk, 500);
            continue;
          }
          if (typeof chunk?.model === "string" && chunk.model !== "") served = chunk.model;
          const piece = chunk?.choices?.[0]?.delta?.content;
          if (typeof piece === "string" && piece !== "") {
            text += piece;
            gate.push(piece);
          }
        }
      }
    }
    if (failure !== null) throw new Error(`API stream: ${failure}`);
    gate.finish();
    const whole = finalText ?? text;
    if (whole === "") throw new Error("API stream ended without a reply");
    return applyVoiceGate({ text: whole, model, modelVersion: served, provider: this.provider });
  }
}

/** The card's model list, and how the page reaches the provider. */
export type ModelListing = { readonly route: ApiRoute; readonly models: string[] } | { readonly error: string };

/**
 * List a provider's models with the key the reader pasted, before anything is
 * kept. Direct first; a service that refuses the page (a network error, which
 * is how a refused CORS answer reaches a page) is asked again through the
 * bridge's relay, and the route says which worked.
 */
export async function listApiModels(choice: ApiChoice, key: string, fetchImpl: typeof fetch = fetch): Promise<ModelListing> {
  if (choice.provider === "anthropic") {
    try {
      return { route: "direct", models: await listAnthropicModels(key, fetchImpl) };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
  const base = apiBase(choice);
  if (base === null) return { error: "The service needs an https address." };
  let res: Response;
  try {
    res = await fetchImpl(`${base}/models`, { headers: { authorization: `Bearer ${key}` } });
  } catch {
    if (choice.provider !== "compatible") return { error: "Abductive couldn't reach the provider from this page." };
    return relayModels(base, key, fetchImpl);
  }
  const body = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown }> } | null;
  if (!res.ok) return { error: providerMessage(body, res.status) };
  const ids = (body?.data ?? []).flatMap((m) => (typeof m?.id === "string" ? [m.id] : []));
  return { route: "direct", models: chatModels(choice.provider, ids) };
}

async function relayModels(base: string, key: string, fetchImpl: typeof fetch): Promise<ModelListing> {
  try {
    const res = await fetchImpl(`${bridgeBase()}/models`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseUrl: base, key }),
    });
    const body = (await res.json().catch(() => null)) as { models?: unknown; error?: unknown } | null;
    if (!res.ok) return { error: String(body?.error ?? `the bridge answered ${res.status}`) };
    const models = Array.isArray(body?.models) ? body.models.filter((m): m is string => typeof m === "string") : [];
    return { route: "relay", models };
  } catch {
    return { error: "The service doesn't take calls from a web page, and the bridge on this machine didn't answer to pass them on." };
  }
}
