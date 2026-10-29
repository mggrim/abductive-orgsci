/**
 * Inference adapter boundary (persona-engine feature).
 *
 * Every model call in the app goes through this interface so the persona
 * engine is testable with a deterministic mock (ISC-14) and swappable to the
 * user's own Claude subscription at runtime (BYO-inference constraint).
 */

export interface Msg {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface CompleteRequest {
  readonly system: string;
  readonly messages: readonly Msg[];
  readonly maxTokens?: number;
  /**
   * Ends the call early (M58, the chat's Stop). Never serialised: each client
   * hands it to its own fetch, and a stream stopped part way rejects with an
   * AbortError, leaving the caller to keep what the reader already saw.
   */
  readonly signal?: AbortSignal;
}

export interface CompleteResult {
  /** Model response text, after the voice gate (FND-01). */
  readonly text: string;
  /** Model family/alias, e.g. "claude-sonnet-4-6" or "mock". */
  readonly model: string;
  /** Concrete model version string as reported by the provider (ISC-5). */
  readonly modelVersion: string;
  /**
   * The lane that ran the model, "claude" (Claude Code), "codex" (M56) or
   * "local" (M60), when the call went through the local bridge. Absent
   * elsewhere, and read as Claude when absent.
   */
  readonly provider?: Provider;
  /**
   * M60: the local server that ran the turn, as the card names it ("Ollama",
   * "LM Studio", "llama.cpp", or "port 8000"). Present only beside provider
   * "local".
   */
  readonly server?: string;
  /**
   * Exactly what the provider sent, present only when the voice gate changed
   * it (FND-01).
   *
   * The gate rewrites banned dashes in model prose, and the ledger's claim is
   * that it records what the model actually said. Normalising in place would
   * have made that claim false, so the pre-normalised string rides back with
   * the result and `voiceGateProvenance` spreads it into the event the caller
   * appends. Optional rather than required because a clean response has no
   * second version worth storing, and because dozens of hand-rolled
   * `InferenceClient` stubs in the suite would otherwise have to restate it.
   */
  readonly rawText?: string;
  /**
   * The reply broke one of the owner's rules and Abductive asked the model once
   * to rewrite the offending sentences (M69, ISC-644, `inference/voiceRetry.ts`).
   * Absent when the first reply kept every rule.
   */
  readonly voiceRetry?: true;
}

/** Incremental text from a streaming completion. */
export interface StreamDelta {
  readonly text: string;
}

export interface InferenceClient {
  complete(req: CompleteRequest): Promise<CompleteResult>;
  /**
   * The model this client asks for (M58). A reply stopped before its final
   * frame never reports the model that wrote it, so a cut-short turn is filed
   * under the model that was asked.
   */
  readonly requestedModel?: string;
  /**
   * The lane this client runs on (M56), for a turn stopped before its final
   * frame, which is filed under the lane and the model that were asked.
   */
  readonly provider?: Provider;
  /** M60: the local server this client reaches, for a stopped local turn. */
  readonly server?: string | undefined;
  /**
   * Optional streaming variant (ISC-62). Optional rather than required
   * because the mock and any future adapter must stay implementable in a few
   * lines; `streamOrComplete` below gives every caller the streaming shape
   * regardless of what the client supports.
   */
  completeStream?(
    req: CompleteRequest,
    onDelta: (delta: StreamDelta) => void,
  ): Promise<CompleteResult>;
}

/**
 * Stream when the client can, and synthesise a single delta when it cannot.
 *
 * One-question-at-a-time turns depend on this: without visible token flow a
 * deliberate pause reads as a hung app, and the researcher's instinct is to
 * click again — which is how duplicate turns get manufactured. So the UI
 * always sees the streaming shape, and only the granularity varies.
 */
export async function streamOrComplete(
  client: InferenceClient,
  req: CompleteRequest,
  onDelta: (delta: StreamDelta) => void,
): Promise<CompleteResult> {
  if (client.completeStream !== undefined) {
    return client.completeStream(req, onDelta);
  }
  const result = await client.complete(req);
  onDelta({ text: result.text });
  return result;
}

/**
 * Who ran a turn. The local bridge's lanes: Claude Code, Codex (M56) or a local
 * model server (M60). Option B's APIs (M60, ISC-581): Anthropic, OpenAI, Google
 * Gemini, OpenRouter, or another OpenAI-compatible service, recorded by its host
 * (such as "api.together.xyz").
 */
export type Provider = "claude" | "codex" | "local" | "anthropic" | "openai" | "google" | "openrouter" | (string & {});

/** The words a recorded turn's `provider` may hold, beside a service's host. */
export const PROVIDERS: readonly string[] = ["claude", "codex", "local", "anthropic", "openai", "google", "openrouter"];

/** A service's host as the record holds it: lower-case labels with at least one dot, and a port if the root had one. */
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d{1,5})?$/;

/** Whether a value may stand as a recorded turn's provider. */
export function isProvider(value: unknown): boolean {
  return typeof value === "string" && (PROVIDERS.includes(value) || HOST.test(value));
}

/**
 * The lane, for spreading onto an event beside its model (ISC-575): present
 * only when the source knows one, so a turn from a console key, the mock or a
 * record from before M56 carries no field.
 */
export function providerField(source: {
  readonly provider?: Provider | undefined;
  readonly server?: string | undefined;
}): { provider?: Provider; server?: string } {
  if (source.provider === undefined) return {};
  // M60: the local server rides with the local lane and with nothing else.
  return source.provider === "local" && source.server !== undefined && source.server !== ""
    ? { provider: source.provider, server: source.server }
    : { provider: source.provider };
}

/** The lane a recorded turn ran on; Claude when the record does not say. */
export function providerOf(source: { readonly provider?: Provider | undefined }): Provider {
  return source.provider ?? "claude";
}
