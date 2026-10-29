/**
 * InferenceClient backed by the local Claude Code CLI bridge
 * (scripts/cli-bridge.ts). On the dev server the page reaches the bridge
 * same-origin through the Vite proxy; anywhere else it fetches
 * http://localhost:8787 directly, which browsers allow from an https page
 * because localhost counts as a trustworthy origin (M54). Uses the
 * researcher's Claude subscription through the sanctioned CLI — no API key.
 */

import type {
  CompleteRequest,
  CompleteResult,
  InferenceClient,
  StreamDelta,
} from "./types.ts";
import { applyVoiceGate, createStreamVoiceGate } from "./voiceGate.ts";
import { appOrigin, bridgePortForPage, devServerOrigin, safariBrowser } from "./origin.ts";
import { cliChoiceKept, dropCliChoice, keepCliChoice, keptCliModel, keptLane, keptLocalModel, type Lane } from "./providerChoice.ts";
import { getLocalEndpoint, getLocalKey } from "../auth/claudeAuth.ts";

// The kept choice lives in its own module, apart from every credential file
// (ISC-37 ruling, M54). Re-exported so callers keep one import.
export { CLI_PROVIDER_KEY } from "./providerChoice.ts";
const PROXY_BASE = "/cli-bridge";

/**
 * Where to look for the bridge from this origin, in order (M54, ISC-546).
 *
 * The dev server keeps its same-origin proxy, and the Mac app's origin answers
 * the same path (M57). Anywhere else the page goes to
 * the reader's own machine directly: `localhost` first, then `127.0.0.1` for a
 * machine whose `localhost` resolves somewhere the bridge is not listening.
 */
export function bridgeBases(hostname?: string): string[] {
  if (devServerOrigin(hostname) || appOrigin(hostname)) return [PROXY_BASE];
  const port = bridgePortForPage();
  return [`http://localhost:${port}`, `http://127.0.0.1:${port}`];
}

/** The address that last answered a health probe, used by the client. */
let answeredBase: string | null = null;
/** M60: the local server the last health reply found, so a local turn can name it on the record. */
let localEndpointSeen: string | null = null;

/** Where the client sends requests: the last address that answered, else the first to try. */
export function bridgeBase(): string {
  return answeredBase ?? bridgeBases()[0] ?? PROXY_BASE;
}

/**
 * What a failed bridge call says (ISC-591). The bridge answers a failure with
 * `{error}`, and that sentence is the CLI's own when the CLI refused ("The
 * 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT
 * account."), so it passes as it is. A body that is not `{error}` keeps the
 * status beside it, since nothing else says what went wrong.
 */
export function bridgeErrorSentence(status: number, body: string, lead: string): string {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error === "string" && parsed.error.trim() !== "") return parsed.error;
  } catch {
    // Not JSON; fall through.
  }
  return `${lead} ${status}: ${body.slice(0, 300)}`;
}

export class CliBridgeUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `Local Claude CLI bridge is not reachable (${detail}). ` +
        "Start it with: bun run bridge",
    );
    this.name = "CliBridgeUnavailableError";
  }
}

/**
 * A bridge call that failed twice on the network (M74b, ISC-664).
 *
 * The walk of 2026-10-02 met Safari's raw "Load failed" in the chat after about
 * fifty seconds, with no explanation and no way to try again, while the
 * bridge's health check stayed green: a connection dropped part way, and
 * nothing caught it. A network error now gets one retry after two seconds, and
 * a second one becomes this error, whose sentence the chat shows beside Try
 * again (L9: what failed, then what to do, with Abductive as the actor).
 */
export const MODEL_UNREACHABLE = "Abductive couldn't reach the model. Try again.";

export class ModelUnreachableError extends Error {
  constructor() {
    super(MODEL_UNREACHABLE);
    this.name = "ModelUnreachableError";
  }
}

/** How long Abductive waits before it asks the bridge again. */
export const BRIDGE_RETRY_MS = 2000;

/**
 * A browser's network error: Safari's "Load failed", Chrome's "Failed to fetch",
 * Firefox's "NetworkError when attempting to fetch resource.", and the dropped
 * connection a stream's reader throws. A stop (an AbortError) is not one.
 */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error) || err.name === "AbortError") return false;
  if (err instanceof ModelUnreachableError) return false;
  return (
    (err instanceof TypeError || err.name === "TypeError") &&
    /load failed|failed to fetch|networkerror|network connection was lost|network request failed|fetch failed|terminated/i.test(err.message)
  );
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new DOMException("You stopped the reply.", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("You stopped the reply.", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Fired on `window` when the reader picks or drops the local CLI, so the header's
 * "No model is connected" bar re-reads without a reload (M54, ISC-549). The
 * `storage` event covers other tabs; this covers the tab that made the change.
 */
export const PROVIDER_CHANGED_EVENT = "abductive:provider-changed";

/** True when the reader chose the local CLI, in this tab or any other. */
export function cliProviderSelected(): boolean {
  return cliChoiceKept();
}

function announce(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROVIDER_CHANGED_EVENT));
}

/**
 * Record the reader's choice of the local CLI. The one value ever written is
 * "cli". Called once a health check has just found a working bridge, so a
 * failed probe from page load no longer counts against it.
 */
export function selectCliProvider(): void {
  detected = true;
  probeFailed = false;
  keepCliChoice();
  announce();
}

/**
 * The card found the reader's lane not ready (M56): missing, signed out, or no
 * bridge. The page stops counting as connected, so the "No model is connected"
 * bar comes back, and the kept "cli" choice stays for when the lane is ready.
 */
export function laneNotReady(): void {
  detected = false;
  probeFailed = true;
  announce();
}

/** Drop the choice, and the probe with it, so "stop" actually stops. */
export function clearCliProvider(): void {
  dropCliChoice();
  forgetDetectedBridge();
  announce();
}

/**
 * Whether a bridge was found running on this machine at page load.
 *
 * In memory, for the life of the page, and deliberately not in any store.
 * ISC-37 bans persistent storage across the whole auth and inference surface,
 * and that ban is worth keeping blanket rather than carving an exception for a
 * boolean — a conditional guarantee is one a future token write can slip past.
 *
 * The problem it solves is real though. Provider choice lived in
 * `sessionStorage`, so opening a second tab dropped the app to the mock
 * client, which answers with fluent canned research prose. During M17 that
 * fooled the author of the tool for two turns; the tell was that both turns
 * were word-for-word identical, not anything the interface said.
 *
 * Detection rather than persistence is the better answer anyway. If the bridge
 * is up, it is up because the researcher started it, on their own machine, and
 * making them re-declare that per tab was never protecting anything. If it is
 * down, `OfflineBanner` says so on every screen.
 *
 * M54 added one kept value, and kept this file out of it. Detection needs the
 * dev server's proxy and the hosted page has none, so on the hosted site only
 * a kept choice brings a reader back connected. That choice, the word "cli",
 * lives in `providerChoice.ts`; this file holds no persistent store at all.
 */
let detected: boolean | null = null;
/** True when a probe on this page actually ran and found no working bridge. */
let probeFailed = false;

export function bridgeDetected(): boolean {
  return detected === true;
}

/**
 * True when the load probe ran and found nothing: a kept choice whose bridge is
 * not running today. The header then says no model is connected, rather than
 * every call failing under a page that claims one is.
 */
export function bridgeProbeFailed(): boolean {
  return probeFailed;
}

/** Forget the probe, so "stop using the bridge" actually stops. */
export function forgetDetectedBridge(): void {
  detected = false;
}

/**
 * Probe once per page load. Returns whether a working bridge answered.
 * Safe to call repeatedly; only the first call reaches the network.
 *
 * On the dev origin and the Mac app's origin the probe always runs (the bridge
 * is there to ask, same-origin). On any other origin it runs only when the reader has chosen the local
 * CLI before (M54): the hosted page reaches the bridge at localhost, and Chrome
 * asks the reader's permission for that, so a visitor who never asked for the
 * bridge is never asked on their behalf. With no kept choice a hosted probe
 * answers without a request, as it has since M36.
 */
export async function detectBridge(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (detected !== null) return detected;
  if (!sameOriginBridge() && !cliProviderSelected()) {
    detected = false;
    return detected;
  }
  // Safari on the hosted site: a kept choice cannot be honoured, and asking
  // would only fail as mixed content, so the probe counts as failed unsent.
  if (loopbackBlocked()) {
    detected = false;
    probeFailed = true;
    return detected;
  }
  try {
    // M56: connected means the kept lane is there and ready, whichever it is.
    const lane = keptLane();
    const health = await checkBridgeHealth(fetchImpl, BRIDGE_HEALTH_TIMEOUT_MS, lane === "local" ? localAsk() : undefined);
    detected = laneReady(health, lane);
  } catch {
    detected = false;
  }
  probeFailed = !detected;
  return detected;
}

/** True when the bridge answers on this page's own origin: the dev server or the Mac app. */
export function sameOriginBridge(): boolean {
  return devServerOrigin() || appOrigin();
}

/**
 * True when this browser cannot reach a bridge on another origin at all:
 * Safari on the hosted site (M57, ISC-562). The card then points to the app's
 * own origin, and no probe is sent.
 */
export function loopbackBlocked(): boolean {
  return !sameOriginBridge() && safariBrowser();
}

/** Test seam: clear the memoised probe between cases. */
export function resetBridgeDetection(): void {
  detected = null;
  answeredBase = null;
  localEndpointSeen = null;
  probeFailed = false;
}

/**
 * How long a health probe waits before calling the bridge absent.
 *
 * Bounded because an unbounded probe hangs the panel on "Checking local
 * bridge…" for as long as whatever answered the port cares to hold the socket.
 * Observed 2026-09-08: a stale `wrangler dev --port 8787` from another project
 * had the port, accepted the connection, and never replied. The button did
 * nothing, and nothing said why.
 */
export const BRIDGE_HEALTH_TIMEOUT_MS = 5000;

export type BridgeFailure = "timeout" | "not-bridge" | "unreachable";

/** What the bridge's /health says about the machine (M54, ISC-548). */
export interface BridgeHealth {
  readonly ok: boolean;
  /** `claude --version`; null when the bridge found no `claude`, absent when it did not say. */
  readonly claude?: string | null;
  /** Whether the CLI is signed in; null when the bridge could not tell. */
  readonly signedIn?: boolean | null;
  readonly bun?: string;
  /** M56: each CLI lane's presence and sign-in; absent from a bridge older than M56. */
  readonly providers?: Readonly<Partial<Record<CliLane, LaneHealth>>> & {
    /** M60: the local lane; absent from a bridge older than M60. */
    readonly local?: LocalLaneHealth;
  };
  readonly reason?: BridgeFailure;
}

/** The two lanes that run a command-line tool. */
export type CliLane = Exclude<Lane, "local">;

/** What the bridge found for the local lane (M60, ISC-577). */
export interface LocalLaneHealth {
  readonly reachable: boolean;
  /** The server's base, http://127.0.0.1:<port>, or null when none answered. */
  readonly endpoint: string | null;
  readonly models: readonly string[];
  /** True when the server answered 401 or 403 to the listing: it asks for a key. */
  readonly needsKey: boolean;
}

/** Whether a lane can run a turn now, from the health reply. */
export function laneReady(health: BridgeHealth, lane: Lane): boolean {
  if (!health.ok) return false;
  if (lane === "local") {
    const local = health.providers?.local;
    return local !== undefined && local.reachable && !local.needsKey && local.models.length > 0;
  }
  const cli = laneHealth(health, lane);
  return cli.version !== null && cli.signedIn !== false;
}

/*
 * M60. The local server as the card and the record name it, and the endpoint
 * field's rule, the page's copies of the bridge's own (scripts/cli-bridge.ts
 * `localServerName`, `loopbackEndpoint`). The bridge enforces loopback; the
 * page checks first so a refused address is explained, never sent.
 */

const LOCAL_NAMES: Record<number, string> = { 11434: "Ollama", 1234: "LM Studio", 8080: "llama.cpp" };

/** Ollama, LM Studio, llama.cpp, or "port N" for any other port. */
export function localServerName(endpoint: string): string {
  const port = Number(/:(\d+)$/.exec(endpoint)?.[1]);
  return LOCAL_NAMES[port] ?? `port ${port}`;
}

/** A port or a loopback address as the bridge's canonical base, or null when it is not a port on this machine. */
export function localEndpoint(raw: string): string | null {
  // Joined rather than templated: every address here is loopback, and the
  // host scan (ISC-106) reads a templated URL as a host it cannot check.
  const scheme = "http://";
  let text = raw.trim();
  if (/^\d+$/.test(text)) text = scheme + "127.0.0.1:" + text;
  else if (/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(text)) text = scheme + text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return null;
  if (!["", "/", "/v1", "/v1/"].includes(url.pathname)) return null;
  const host = url.hostname === "localhost" ? "127.0.0.1" : url.hostname;
  if (host !== "127.0.0.1" && host !== "[::1]") return null;
  const port = Number(url.port);
  if (!Number.isInteger(port) || port <= 0 || port >= 65536 || port === bridgePortForPage()) return null;
  return scheme + host + ":" + String(port);
}

/** What a probe for the local lane names: the session's endpoint and key, each only when set. */
export interface LocalAsk {
  readonly endpoint?: string;
  readonly key?: string;
}

/** The session's local endpoint and key, for a probe or a turn. */
export function localAsk(): LocalAsk {
  const endpoint = getLocalEndpoint();
  const key = getLocalKey();
  return {
    ...(endpoint === null || endpoint === "" ? {} : { endpoint }),
    ...(key === null || key === "" ? {} : { key }),
  };
}

/** One lane's part of the health reply. */
export interface LaneHealth {
  /** The CLI's `--version`; null when the bridge found no binary, absent when it did not say. */
  readonly version?: string | null;
  readonly signedIn: boolean | null;
}

/**
 * One lane, read from the health reply (M56). A bridge from before M56 reports
 * only the Claude fields, so Claude falls back to them and Codex reads as
 * missing there.
 */
export function laneHealth(health: BridgeHealth, lane: CliLane): LaneHealth {
  const reported = health.providers?.[lane];
  if (reported !== undefined) return reported;
  if (lane === "codex") return { version: null, signedIn: null };
  return {
    ...(health.claude === undefined ? {} : { version: health.claude }),
    signedIn: health.signedIn ?? null,
  };
}

/**
 * The local lane's model before the reader has picked one: none is sent, and
 * the bridge takes the server's first. The card keeps a model when it
 * connects, so a real turn rarely goes unnamed.
 */
const LOCAL_MODEL_UNNAMED = "local model";

/** Codex's model when the study names none: the CLI's own default (the bridge's DEFAULT_CODEX_MODEL). */
export const DEFAULT_CODEX_MODEL = "gpt-5.6-sol";

function laneReply(value: unknown): LaneHealth | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const v = value as { version?: unknown; signedIn?: unknown };
  return {
    ...(typeof v.version === "string" && v.version !== "" ? { version: v.version } : v.version === null ? { version: null } : {}),
    signedIn: typeof v.signedIn === "boolean" ? v.signedIn : null,
  };
}

function localReply(value: unknown): LocalLaneHealth | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const v = value as { reachable?: unknown; endpoint?: unknown; models?: unknown; needsKey?: unknown };
  return {
    reachable: v.reachable === true,
    endpoint: typeof v.endpoint === "string" && v.endpoint !== "" ? v.endpoint : null,
    models: Array.isArray(v.models) ? v.models.filter((m): m is string => typeof m === "string" && m !== "") : [],
    needsKey: v.needsKey === true,
  };
}

async function probeOne(
  base: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  ask?: LocalAsk,
): Promise<BridgeHealth> {
  try {
    // M60: a named local endpoint or key goes in a POST body, never in the URL.
    const named = ask !== undefined && (ask.endpoint !== undefined || ask.key !== undefined);
    const res = await fetchImpl(`${base}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
      ...(named
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ local: ask }) }
        : {}),
    });
    if (!res.ok) {
      // Through the dev server, a 5xx is Vite's proxy saying it could not reach
      // the bridge at all (observed: a bare 500 with the bridge stopped), which
      // is "not running", not "another program holds the port".
      const proxyError = base === PROXY_BASE && res.status >= 500;
      return { ok: false, reason: proxyError ? "unreachable" : "not-bridge" };
    }
    const body = (await res.json()) as {
      ok?: unknown;
      claude?: unknown;
      signedIn?: unknown;
      bun?: unknown;
      providers?: { claude?: unknown; codex?: unknown; local?: unknown };
    };
    // Something answered, but not the bridge: a health body without the
    // field the bridge writes means another server holds the port.
    if (body.ok !== true) return { ok: false, reason: "not-bridge" };
    return {
      ok: true,
      // Absent is a bridge that did not say (undefined); null is a bridge that
      // looked and found no `claude` on the PATH.
      ...(typeof body.claude === "string" && body.claude !== ""
        ? { claude: body.claude }
        : body.claude === null || body.claude === ""
          ? { claude: null }
          : {}),
      // A bridge from before M54 does not report sign-in; null, not false.
      signedIn: typeof body.signedIn === "boolean" ? body.signedIn : null,
      ...(typeof body.bun === "string" ? { bun: body.bun } : {}),
      ...(body.providers !== null && typeof body.providers === "object"
        ? (() => {
            const claude = laneReply(body.providers.claude);
            const codex = laneReply(body.providers.codex);
            const local = localReply(body.providers.local);
            return {
              providers: {
                ...(claude === undefined ? {} : { claude }),
                ...(codex === undefined ? {} : { codex }),
                ...(local === undefined ? {} : { local }),
              },
            };
          })()
        : {}),
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return { ok: false, reason: timedOut ? "timeout" : "unreachable" };
  }
}

/**
 * Ask each address in turn; the first bridge to answer wins and becomes the
 * address the client uses. When none answers, the most telling failure is
 * returned: something holding the port says more than nothing answering.
 */
export async function checkBridgeHealth(
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = BRIDGE_HEALTH_TIMEOUT_MS,
  ask?: LocalAsk,
): Promise<BridgeHealth> {
  const failures: BridgeHealth[] = [];
  for (const base of bridgeBases()) {
    const health = await probeOne(base, fetchImpl, timeoutMs, ask);
    if (health.ok) {
      answeredBase = base;
      localEndpointSeen = health.providers?.local?.endpoint ?? localEndpointSeen;
      return health;
    }
    failures.push(health);
  }
  return (
    failures.find((f) => f.reason === "not-bridge") ??
    failures.find((f) => f.reason === "timeout") ??
    failures[0] ?? { ok: false, reason: "unreachable" }
  );
}

export class CliBridgeInferenceClient implements InferenceClient {
  readonly #fetch: typeof fetch;
  readonly #model: string;
  /** M56: the lane every request names, and every result records. */
  readonly #lane: Lane;
  /** The pause before the one retry (M74b); a test passes its own. */
  readonly #wait: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(options?: {
    fetchImpl?: typeof fetch;
    model?: string;
    lane?: Lane;
    wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  }) {
    this.#fetch = options?.fetchImpl ?? fetch.bind(globalThis);
    this.#wait = options?.wait ?? pause;
    this.#lane = options?.lane ?? keptLane();
    this.#model =
      options?.model ??
      (this.#lane === "codex"
        ? (keptCliModel("codex") ?? DEFAULT_CODEX_MODEL)
        : this.#lane === "local"
          ? (keptLocalModel() ?? LOCAL_MODEL_UNNAMED)
          : (keptCliModel("claude") ?? "sonnet"));
  }

  /**
   * The body every request sends: the turn, the lane and the model, and for the
   * local lane the session's endpoint and key (M60), read at call time so a key
   * typed after the page loaded is used, and each sent only when set.
   */
  #body(req: CompleteRequest): string {
    const local = this.#lane === "local" ? localAsk() : {};
    return JSON.stringify({
      system: req.system,
      messages: req.messages,
      ...(this.#model === LOCAL_MODEL_UNNAMED ? {} : { model: this.#model }),
      provider: this.#lane,
      ...(req.maxTokens === undefined || this.#lane !== "local" ? {} : { maxTokens: req.maxTokens }),
      ...local,
    });
  }

  get lane(): Lane {
    return this.#lane;
  }

  /** The lane, under the name every InferenceClient uses (ISC-575). */
  get provider(): Lane {
    return this.#lane;
  }

  get requestedModel(): string {
    return this.#model;
  }

  /**
   * The lane for the record, and for the local lane the server's name (M60,
   * ISC-579): the endpoint the reader named this session, else the one the last
   * health reply found, else none.
   */
  /** The local server's name, for a turn stopped before its final frame (ISC-579). */
  get server(): string | undefined {
    return this.#lanePart.server;
  }

  get #lanePart(): { provider: Lane; server?: string } {
    if (this.#lane !== "local") return { provider: this.#lane };
    const endpoint = localAsk().endpoint ?? localEndpointSeen;
    return endpoint === null || endpoint === undefined ? { provider: "local" } : { provider: "local", server: localServerName(endpoint) };
  }

  /**
   * One call, and one more after two seconds when the first fails on the
   * network (M74b, ISC-664). A stop is never retried, and a second network
   * failure becomes `ModelUnreachableError`.
   */
  async #again<T>(req: CompleteRequest, once: (attempt: number) => Promise<T>): Promise<T> {
    const stopped = (): boolean => req.signal?.aborted === true;
    try {
      return await once(1);
    } catch (err) {
      if (stopped() || !isNetworkError(err)) throw err;
    }
    await this.#wait(BRIDGE_RETRY_MS, req.signal);
    try {
      return await once(2);
    } catch (err) {
      if (stopped() || !isNetworkError(err)) throw err;
      throw new ModelUnreachableError();
    }
  }

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    return this.#again(req, () => this.#completeOnce(req));
  }

  async #completeOnce(req: CompleteRequest): Promise<CompleteResult> {
    let res: Response;
    try {
      res = await this.#fetch(`${bridgeBase()}/complete`, {
        method: "POST",
        ...(req.signal === undefined ? {} : { signal: req.signal }),
        headers: { "content-type": "application/json" },
        body: this.#body(req),
      });
    } catch (err) {
      if (req.signal?.aborted === true || isNetworkError(err)) throw err;
      throw new CliBridgeUnavailableError(err instanceof Error ? err.message : "fetch failed");
    }
    if (!res.ok) throw new Error(bridgeErrorSentence(res.status, await res.text(), "CLI bridge error"));
    const data = (await res.json()) as {
      text: string;
      model: string;
      modelVersion: string;
    };
    // Third of the three doors model text uses to get in (see voiceGate.ts).
    return applyVoiceGate({
      text: data.text,
      model: data.model,
      modelVersion: data.modelVersion,
      ...this.#lanePart,
    });
  }

  /**
   * Streaming via SSE from the bridge's /stream endpoint (ISC-62).
   *
   * `fetch` + a manual reader rather than `EventSource`, because EventSource
   * cannot issue a POST and the prompt has to go in a body — it is far past
   * any sane URL length.
   */
  async completeStream(
    req: CompleteRequest,
    onDelta: (delta: StreamDelta) => void,
  ): Promise<CompleteResult> {
    /* The retry streams again from the start, and the reader has seen the first
     * attempt's opening already, so the second attempt paints only past what
     * was painted. The result is the second attempt's whole text either way. */
    let painted = 0;
    return this.#again(req, (attempt) => {
      let seen = 0;
      return this.#streamOnce(req, (delta) => {
        if (attempt === 1) {
          painted += delta.text.length;
          onDelta(delta);
          return;
        }
        const from = Math.max(0, painted - seen);
        seen += delta.text.length;
        if (from < delta.text.length) onDelta({ ...delta, text: delta.text.slice(from) });
      });
    });
  }

  async #streamOnce(
    req: CompleteRequest,
    onDelta: (delta: StreamDelta) => void,
  ): Promise<CompleteResult> {
    let res: Response;
    try {
      res = await this.#fetch(`${bridgeBase()}/stream`, {
        method: "POST",
        ...(req.signal === undefined ? {} : { signal: req.signal }),
        headers: { "content-type": "application/json" },
        body: this.#body(req),
      });
    } catch (err) {
      if (req.signal?.aborted === true || isNetworkError(err)) throw err;
      throw new CliBridgeUnavailableError(err instanceof Error ? err.message : "fetch failed");
    }
    if (!res.ok || res.body === null) {
      const detail = res.body === null ? "empty body" : await res.text();
      throw new Error(bridgeErrorSentence(res.status, detail, "CLI bridge stream error"));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    // Deltas are painted the moment they arrive, so gating only the final
    // envelope would have shown a banned dash on screen and then swapped it
    // out under the researcher. The gate buffers the sentence it is unsure
    // about and releases it when the sentence closes.
    const gate = createStreamVoiceGate(onDelta);
    let buffer = "";
    let streamed = "";
    let final: CompleteResult | null = null;
    let failure: string | null = null;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line; anything after the last one
      // is a partial frame and must wait for more bytes.
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const parsed = parseSseFrame(frame);
        if (parsed === null) continue;
        if (parsed.event === "delta" && typeof parsed.data.text === "string") {
          streamed += parsed.data.text;
          gate.push(parsed.data.text);
        } else if (parsed.event === "final") {
          const model = typeof parsed.data.model === "string" ? parsed.data.model : this.#model;
          final = {
            text: typeof parsed.data.text === "string" ? parsed.data.text : streamed,
            model,
            modelVersion: model,
            ...this.#lanePart,
          };
        } else if (parsed.event === "error") {
          failure = typeof parsed.data.message === "string" ? parsed.data.message : "stream failed";
        }
      }
    }

    // The bridge's sentence as it sent it: a CLI's refusal reads as the CLI wrote it (ISC-591).
    if (failure !== null) throw new Error(failure);
    // Release whatever the last sentence was still holding back, or the tail
    // of every streamed answer that ended on a dashed sentence would never be
    // painted.
    gate.finish();
    // A stream that produced text but no result envelope still answered; the
    // accumulated deltas are the answer, and discarding them would throw away
    // a complete response over a missing footer.
    if (final === null) {
      if (streamed === "") throw new Error("CLI bridge stream ended without a result");
      return applyVoiceGate({
        text: streamed,
        model: this.#model,
        modelVersion: this.#model,
        ...this.#lanePart,
      });
    }
    return applyVoiceGate(final);
  }
}

/** Parse one `event: X\ndata: {...}` frame. Exported for tests. */
export function parseSseFrame(
  frame: string,
): { event: string; data: Record<string, unknown> } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) as Record<string, unknown> };
  } catch {
    return null;
  }
}
