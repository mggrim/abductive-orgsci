/**
 * Local CLI bridge: lets the browser app use the Claude Code CLI (subscription
 * billing, sanctioned app) as its inference backend — no API key needed.
 *
 * Two ways to run it. From a checkout, `bun run bridge` (or `bun run dev`,
 * which starts it alongside Vite); the dev page reaches it same-origin through
 * the Vite proxy (/cli-bridge → :8787). From the hosted site, the reader
 * downloads this same file (`public/bridge.ts` is generated from it at build
 * time) and runs `bun abductive-bridge.ts`; the hosted page then fetches
 * http://localhost:8787 directly, which is why the bridge answers CORS, and
 * why it answers it for the site's own origins and loopback dev origins only.
 *
 * The bridge holds no state and logs nothing; prompts go to the local `claude`
 * or `codex` binary and nowhere else. It listens on loopback only, never on the
 * wildcard, so nothing else on the network can reach it.
 *
 * Three lanes: Claude Code (`claude -p`), the default, OpenAI's Codex CLI
 * (`codex exec`, M56), and a local model (M60): an OpenAI-compatible server on
 * this machine, such as Ollama, LM Studio or llama.cpp, which the bridge finds by
 * probing and reaches on loopback only. A request names its lane in `provider`.
 *
 * POST /complete  {system, messages:[{role,content}], maxTokens?, model?, provider?,
 *                  endpoint?, key?}   (endpoint and key: the local lane only)
 *              →  {text, model, modelVersion}
 * POST /stream    same body, answered as Server-Sent Events
 * GET  /health   →  {ok, claude: <version> | null, signedIn: bool | null, bun,
 *                    providers: {claude: {version, signedIn}, codex: {version, signedIn},
 *                                local: {reachable, endpoint, models, needsKey}}}
 * POST /health    {local?: {endpoint?, key?}}, the same reply, the named endpoint
 *                 probed first and the key sent with the probe
 * POST /models    {baseUrl, key} → {models}: the relay's model list (M60)
 *
 * The relay (M60): provider "relay" with {baseUrl, key, model} forwards one
 * OpenAI-compatible chat call to an https API that will not take a call from a
 * web page. The key is used for that one request and kept nowhere.
 *
 * Environment: ABDUCTIVE_BRIDGE_PORT (default 8787) and ABDUCTIVE_BRIDGE_ORIGINS,
 * a comma-separated list of extra exact origins to allow (for testing a build
 * served from another origin; the site's own origins need nothing).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_BRIDGE_PORT = 8787;

/** The port to listen on: ABDUCTIVE_BRIDGE_PORT when it is a port, else 8787. */
export function bridgePort(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.ABDUCTIVE_BRIDGE_PORT);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : DEFAULT_BRIDGE_PORT;
}

/**
 * Loopback only, both families. Bun.serve with no hostname binds the wildcard,
 * which would put the reader's Claude subscription on their LAN; and a browser
 * resolving `localhost` may try either ::1 or 127.0.0.1 first.
 */
export const BRIDGE_HOSTNAMES = ["127.0.0.1", "::1"] as const;

/** The hosted site. Preview deployments are `<label>.abductive.pages.dev`. */
const SITE_HOST = "abductive.pages.dev";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether a browser origin may use the bridge.
 *
 * - `no-origin`: no Origin header, so not a cross-origin browser request (a
 *   terminal, curl, the dev proxy). Served, with no CORS headers.
 * - `allow`: https on the site or one of its preview subdomains; http or https
 *   on a loopback host or `*.localhost`, any port; or an exact extra origin.
 * - `refuse`: everything else, including the opaque origin "null".
 */
export function corsDecision(
  origin: string | null,
  extra: readonly string[] = [],
): "allow" | "refuse" | "no-origin" {
  if (origin === null) return "no-origin";
  if (extra.includes(origin)) return "allow";
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return "refuse";
  }
  // An origin has no path, query or credentials; anything else is not one.
  if (url.origin !== origin) return "refuse";
  const host = url.hostname;
  if (url.protocol === "https:") {
    if (host === SITE_HOST) return "allow";
    if (host.endsWith(`.${SITE_HOST}`) && /^[a-z0-9-]+$/.test(host.slice(0, -SITE_HOST.length - 1))) {
      return "allow";
    }
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    if (LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost")) return "allow";
  }
  return "refuse";
}

function extraOrigins(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ABDUCTIVE_BRIDGE_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/**
 * The claude CLI refuses to run nested inside a Claude Code session
 * (CLAUDECODE env). The bridge may have been launched from such a session,
 * so spawn with those markers removed — same pattern PAI's Inference.ts uses.
 */
function cleanedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE")) continue;
    env[k] = v;
  }
  return env;
}

interface Msg {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/**
 * Flags that strip the CLI's own agent identity from the session.
 *
 * Without these, `claude -p` runs as Claude Code: it loads the machine's
 * CLAUDE.md, its tool schema, and its assistant persona, and the creed
 * persona ends up layered on top rather than replacing it. Observed
 * verbatim in a persona challenge on 2026-07-30: "this isn't a Claude Code
 * engineering session, so I don't have the appropriate skill loaded."
 *
 * The creed goes through --system-prompt (which REPLACES the default rather
 * than appending), and everything that could reintroduce the CLI's identity
 * is disabled. Side benefit: cache_creation_input_tokens drops from ~14k to
 * 0 per call, since the whole Claude Code preamble is gone.
 */
const ISOLATION_FLAGS = [
  "--setting-sources", "",        // no user/project settings, no CLAUDE.md
  "--tools", "",                  // no tool schema in context
  "--strict-mcp-config",          // no MCP servers
  "--disable-slash-commands",     // no skills
  "--no-chrome",
] as const;

/**
 * Flatten the dialogue for `claude -p`. The system prompt is NOT included —
 * it travels via --system-prompt so it replaces the CLI's own.
 */
export function assembleCliPrompt(messages: readonly Msg[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    parts.push(m.role === "user" ? m.content : `[Assistant's prior turn]\n${m.content}`);
  }
  parts.push("\nOutput ONLY the response content — no preamble.");
  return parts.join("\n\n");
}

async function runClaude(
  system: string,
  prompt: string,
  model: string,
): Promise<{ text: string; model: string }> {
  const systemFlags = system.trim() === "" ? [] : ["--system-prompt", system];
  const proc = Bun.spawn(
    ["claude", "-p", "--output-format", "json", "--model", model, ...systemFlags, ...ISOLATION_FLAGS],
    {
      stdin: new TextEncoder().encode(prompt),
      env: cleanedEnv(),
      // Neutral cwd: a CLAUDE.md in the launch directory would otherwise be
      // read as project memory even with --setting-sources cleared.
      cwd: tmpdir(),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`claude CLI exited ${code}: ${err.slice(0, 400)}`);
  }
  try {
    const parsed = JSON.parse(out) as {
      result?: string;
      model?: string;
      modelUsage?: Record<string, { outputTokens?: number }>;
    };
    return { text: parsed.result ?? out, model: resolveModel(parsed, model) };
  } catch {
    return { text: out, model };
  }
}

/**
 * Identify which model actually answered.
 *
 * The CLI emits no top-level `model`, and `modelUsage` routinely contains an
 * auxiliary entry (haiku, used for internal bookkeeping) alongside the real
 * responder — with the auxiliary one listed FIRST. Taking `Object.keys()[0]`
 * therefore recorded "claude-haiku-4-5" in the ledger for a sonnet answer,
 * corrupting the provenance the dashboard and exports depend on (ISC-5).
 *
 * Requested alias wins when present, since that is what we asked for and got;
 * otherwise the entry that produced the most output is the responder.
 */
export function resolveModel(
  parsed: { model?: string; modelUsage?: Record<string, { outputTokens?: number }> },
  requested: string,
): string {
  if (parsed.model !== undefined) return parsed.model;

  const usage = Object.entries(parsed.modelUsage ?? {});
  if (usage.length === 0) return requested;

  const alias = requested.toLowerCase();
  const matched = usage.find(([name]) => name.toLowerCase().includes(alias));
  if (matched !== undefined) return matched[0];

  return usage.reduce((best, cur) =>
    (cur[1].outputTokens ?? 0) > (best[1].outputTokens ?? 0) ? cur : best,
  )[0];
}

/**
 * One NDJSON line from `claude --output-format stream-json`, reduced to what
 * the browser needs. Exported for tests; the CLI's envelope is wide and mostly
 * irrelevant here.
 */
export function parseStreamLine(
  line: string,
): { kind: "delta"; text: string } | { kind: "final"; text: string; model: string } | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  // Partial assistant text arrives as a nested Anthropic stream event.
  if (parsed?.type === "stream_event") {
    const inner = parsed.event;
    if (inner?.type === "content_block_delta" && typeof inner?.delta?.text === "string") {
      return { kind: "delta", text: inner.delta.text };
    }
    return null;
  }

  if (parsed?.type === "result") {
    return {
      kind: "final",
      text: typeof parsed.result === "string" ? parsed.result : "",
      model: resolveModel(parsed, "sonnet"),
    };
  }
  return null;
}

/**
 * Stream the CLI's output to the browser as Server-Sent Events.
 *
 * SSE rather than a raw chunked body because the browser's EventSource
 * framing gives us message boundaries for free, and the CLI's NDJSON lines
 * do not survive arbitrary chunk splits otherwise — a delta cut in half is
 * unparseable JSON, and dropping it silently loses text mid-sentence. Lines
 * are reassembled here across chunk boundaries for the same reason.
 */
function streamClaude(system: string, prompt: string, model: string): Response {
  const systemFlags = system.trim() === "" ? [] : ["--system-prompt", system];
  const proc = Bun.spawn(
    [
      "claude",
      "-p",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--model",
      model,
      ...systemFlags,
      ...ISOLATION_FLAGS,
    ],
    {
      stdin: new TextEncoder().encode(prompt),
      env: cleanedEnv(),
      cwd: tmpdir(),
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      // Open the stream immediately with an SSE comment. Belt and braces
      // alongside idleTimeout: it also stops any intermediary (the Vite proxy)
      // treating a slow first token as a dead connection.
      controller.enqueue(encoder.encode(": open\n\n"));
      let buffer = "";
      const decoder = new TextDecoder();
      const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const parsed = parseStreamLine(line);
            if (parsed === null) continue;
            if (parsed.kind === "delta") send("delta", { text: parsed.text });
            else send("final", { text: parsed.text, model: parsed.model });
          }
        }
        const trailing = parseStreamLine(buffer);
        if (trailing !== null) {
          if (trailing.kind === "delta") send("delta", { text: trailing.text });
          else send("final", { text: trailing.text, model: trailing.model });
        }
        const code = await proc.exited;
        if (code !== 0) {
          const err = await new Response(proc.stderr).text();
          send("error", { message: `claude CLI exited ${code}: ${err.slice(0, 400)}` });
        }
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

/* ------------------------------------------------------------------------ *
 * The Codex lane (M56, ISC-557).
 *
 * `codex exec` runs one prompt non-interactively. The study's system prompt
 * replaces Codex's own instructions through the `model_instructions_file`
 * config key, settled by a probe on 2026-09-28: with instructions "Answer in
 * exactly three words." Codex answered "AI assistant, helping." and "Plants
 * convert sunlight." to prompts that asked for more. The prompt goes on stdin.
 *
 * The whole isolation argv, as `codexArguments` builds it:
 *
 *   codex exec --json -m <model> -s read-only --ephemeral --ignore-user-config
 *     --ignore-rules --skip-git-repo-check -C <empty temp dir>
 *     -c model_instructions_file="<temp file>"
 *     -c include_permissions_instructions=false -c include_apps_instructions=false
 *     -c include_environment_context=false -c include_collaboration_mode_instructions=false
 *     -c skills.include_instructions=false -c skills.bundled.enabled=false
 *     -c web_search="disabled"
 *     --disable plugins --disable multi_agent --disable multi_agent_v2 --disable apps
 *     --disable hooks --disable shell_tool --disable unified_exec --disable code_mode_host
 *     --disable browser_use --disable computer_use --disable image_generation
 *     --disable tool_suggest --disable in_app_browser --disable goals --disable memories -
 *
 * `--ignore-user-config` alone still let the reader's skills, plugins and
 * hooks into the turn: `codex debug prompt-input` rendered them, and the probe
 * turn cost 14,552 input tokens. With the switches above it costs about 4,890,
 * and a request to run a command gets "NO TOOLS.".
 *
 * One developer message stays, and no config key removes it: Codex's model
 * catalog adds a note on sub-agents whose first sentence is "You are `/root`,
 * the primary agent in a team of agents collaborating to fulfill the user's
 * goals." It sits beside the study's instructions rather than replacing them;
 * every sub-agent tool is off, and the probe shows the instructions win (lead's
 * ruling, 2026-09-28: not a blocker).
 *
 * Codex's JSONL never names the model it ran. The bridge always passes -m and
 * reports that name as `model` and `modelVersion`, so a Codex turn's recorded
 * model is the model as requested, and the replay says so.
 * ------------------------------------------------------------------------ */

export type Provider = "claude" | "codex" | "local" | "relay";

/** The lane a request names; "claude" when it names none, null when it names something else. */
export function requestProvider(body: { provider?: unknown }): Provider | null {
  if (body.provider === undefined) return "claude";
  return body.provider === "claude" || body.provider === "codex" || body.provider === "local" || body.provider === "relay"
    ? body.provider
    : null;
}

/**
 * The models the Codex lane offers. The four codex-cli 0.146.0 lists for a
 * ChatGPT sign-in (`codex debug models`), the default first, and gpt-6.1-sol
 * (ISC-591), which the OpenAI API serves and a ChatGPT sign-in refuses; the
 * refusal reaches the page as Codex's own sentence (`codexFailureSentence`).
 * Keep in step with `codexModels` in bridge-app/BridgeCore/Provider.swift.
 */
export const CODEX_MODELS = ["gpt-5.6-sol", "gpt-6.1-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"] as const;
/** The CLI's own default. Always passed with -m, since Codex's JSONL never names the model. */
export const DEFAULT_CODEX_MODEL = "gpt-5.6-sol";

/** The model a Codex turn runs on: the one named if Codex offers it, the default if none; else null. */
export function codexModel(requested: string | undefined): string | null {
  if (requested === undefined) return DEFAULT_CODEX_MODEL;
  return (CODEX_MODELS as readonly string[]).includes(requested) ? requested : null;
}

/** Config keys that keep Codex's own context (skills, permissions, environment) out of the turn. */
const CODEX_CONFIG = [
  "include_permissions_instructions=false",
  "include_apps_instructions=false",
  "include_environment_context=false",
  "include_collaboration_mode_instructions=false",
  "skills.include_instructions=false",
  "skills.bundled.enabled=false",
  'web_search="disabled"',
] as const;

/** Features that would give the turn tools, sub-agents, hooks or memory. */
const CODEX_DISABLED = [
  "plugins", "multi_agent", "multi_agent_v2", "apps", "hooks", "shell_tool", "unified_exec",
  "code_mode_host", "browser_use", "computer_use", "image_generation", "tool_suggest",
  "in_app_browser", "goals", "memories",
] as const;

/** argv after `codex`: one non-interactive run in `workDir`, the prompt read from stdin. */
export function codexArguments(model: string, instructionsFile: string | null, workDir: string): string[] {
  return [
    "exec", "--json", "-m", model,
    "-s", "read-only",
    "--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check",
    "-C", workDir,
    ...(instructionsFile === null ? [] : ["-c", `model_instructions_file=${JSON.stringify(instructionsFile)}`]),
    ...CODEX_CONFIG.flatMap((kv) => ["-c", kv]),
    ...CODEX_DISABLED.flatMap((f) => ["--disable", f]),
    "-",
  ];
}

/**
 * The environment Codex runs in: without the Claude Code nesting markers,
 * without the CODEX_* variables a Codex session sets for its children (one
 * launched from inside Codex would otherwise run as a nested sandbox), and
 * without API keys, so the turn bills the reader's ChatGPT sign-in. CODEX_HOME
 * stays: it is where that sign-in lives.
 */
export function codexEnvironment(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE")) continue;
    if (k.startsWith("CODEX_") && k !== "CODEX_HOME") continue;
    if (k === "OPENAI_API_KEY") continue;
    out[k] = v;
  }
  return out;
}

/** `codex login status`: exit 0 and "Logged in…" is yes, exit 1 or "Not logged in" is no. */
export function codexSignedIn(output: string, code: number): boolean | null {
  if (code === 0 && /Logged in/.test(output)) return true;
  if (/Not logged in/.test(output) || code === 1) return false;
  return null;
}

function codexEvents(out: string): any[] {
  const events: any[] = [];
  for (const line of out.split("\n")) {
    if (line.trim() === "") continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Not a JSONL event; Codex prints nothing else on stdout under --json.
    }
  }
  return events;
}

/** The agent's text, or null for any other event. Item errors are notices, not failures. */
function agentText(event: any): string | null {
  return event?.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string"
    ? event.item.text
    : null;
}

function failureMessage(event: any): string | null {
  return event?.type === "turn.failed" ? codexFailureSentence(String(event.error?.message ?? "the turn failed")) : null;
}

/**
 * The CLI's own sentence out of a failed turn's message (ISC-591). Codex puts
 * the API's error body in `turn.failed` as a JSON string, so the sentence the
 * reader should see is `error.message` inside it: "The 'gpt-6.1-sol' model is
 * not supported when using Codex with a ChatGPT account." A message that is not
 * such a body is Codex's sentence already and passes as it is.
 */
export function codexFailureSentence(message: string): string {
  try {
    const body = JSON.parse(message);
    const inner = body?.error?.message ?? body?.message;
    if (typeof inner === "string" && inner.trim() !== "") return inner;
  } catch {
    // Not JSON: the sentence as Codex wrote it.
  }
  return message;
}

/** A whole `codex exec --json` run, reduced to the /complete reply or Codex's own failure. */
export function reduceCodexOutput(out: string, model: string): { text: string; model: string } | { error: string } {
  const texts: string[] = [];
  let failure: string | null = null;
  for (const event of codexEvents(out)) {
    const text = agentText(event);
    if (text !== null) texts.push(text);
    failure = failureMessage(event) ?? failure;
  }
  if (failure !== null) return { error: failure };
  if (texts.length === 0) return { error: "codex gave no reply" };
  return { text: texts.join("\n\n"), model };
}

type CodexStreamEvent =
  | { kind: "delta"; text: string }
  | { kind: "final"; text: string; model: string }
  | { kind: "error"; message: string };

/**
 * Codex's JSONL, line by line, to the SSE events the page reads. `codex exec`
 * sends each message whole rather than token by token, so a message is one
 * delta; the final, once the run ends, carries the whole text and the model.
 */
export function codexStreamReducer(model: string) {
  const texts: string[] = [];
  let failed = false;
  return {
    line(line: string): CodexStreamEvent[] {
      const [event] = codexEvents(line);
      const text = agentText(event);
      if (text !== null) {
        const delta = texts.length === 0 ? text : `\n\n${text}`;
        texts.push(text);
        return [{ kind: "delta", text: delta }];
      }
      const failure = failureMessage(event);
      if (failure !== null && !failed) {
        failed = true;
        return [{ kind: "error", message: failure }];
      }
      return [];
    },
    end(): CodexStreamEvent[] {
      return failed || texts.length === 0 ? [] : [{ kind: "final", text: texts.join("\n\n"), model }];
    },
    get failed() {
      return failed;
    },
  };
}

/**
 * An empty directory for the run, and the instructions file beside it (not in
 * it). Removed when the run ends, so nothing the study said stays on disk.
 */
function codexWorkspace(system: string): { root: string; work: string; instructions: string | null } {
  const root = mkdtempSync(join(tmpdir(), "abductive-codex-"));
  const work = join(root, "work");
  mkdirSync(work);
  if (system.trim() === "") return { root, work, instructions: null };
  const instructions = join(root, "instructions.md");
  writeFileSync(instructions, system);
  return { root, work, instructions };
}

function spawnCodex(system: string, prompt: string, model: string) {
  const ws = codexWorkspace(system);
  const proc = Bun.spawn(["codex", ...codexArguments(model, ws.instructions, ws.work)], {
    stdin: new TextEncoder().encode(prompt),
    env: codexEnvironment(process.env),
    cwd: ws.work,
    stdout: "pipe",
    stderr: "pipe",
  });
  void proc.exited.finally(() => rmSync(ws.root, { recursive: true, force: true }));
  return proc;
}

async function runCodex(system: string, prompt: string, model: string): Promise<{ text: string; model: string }> {
  let proc: ReturnType<typeof spawnCodex>;
  try {
    proc = spawnCodex(system, prompt, model);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : String(err));
  }
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  // Codex writes a failed turn's reason into the JSONL, not stderr, and that
  // reason is the CLI's own sentence, passed on unchanged (ISC-591).
  const reduced = reduceCodexOutput(out, model);
  if ("error" in reduced) throw new Error(reduced.error);
  if (code !== 0) throw new Error(`codex CLI exited ${code}: ${err.slice(0, 400)}`);
  return reduced;
}

function streamCodex(system: string, prompt: string, model: string): Response {
  const proc = spawnCodex(system, prompt, model);
  const reducer = codexStreamReducer(model);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: CodexStreamEvent) => {
        const { kind, ...data } = e;
        controller.enqueue(encoder.encode(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      controller.enqueue(encoder.encode(": open\n\n"));
      let buffer = "";
      const decoder = new TextDecoder();
      const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) reducer.line(line).forEach(send);
        }
        reducer.line(buffer).forEach(send);
        reducer.end().forEach(send);
        const code = await proc.exited;
        if (code !== 0 && !reducer.failed) {
          const err = await new Response(proc.stderr).text();
          send({ kind: "error", message: `codex CLI exited ${code}: ${err.slice(0, 400)}` });
        }
      } catch (err) {
        send({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}

/* ------------------------------------------------------------------------ *
 * The local lane (M60, ISC-577).
 *
 * Ollama, LM Studio, llama.cpp's server and the rest all speak one surface, the
 * OpenAI-compatible chat API, so the lane is built against that and nothing
 * else: GET /v1/models lists the models, POST /v1/chat/completions runs a turn,
 * with `stream` on for /stream and off for /complete. The study's system prompt
 * is the system message and its messages are the thread as sent, with none of
 * the flattening the CLIs need.
 *
 * Loopback in both directions. The bridge listens on loopback only, and it
 * sends a local turn only to 127.0.0.1 or ::1: an endpoint the reader names is
 * refused unless it is a port on this machine, and never the bridge's own port,
 * so nothing a study says leaves the machine on this lane.
 *
 * A server that asks for a key (the probe gets a 401) takes one the reader
 * types on the card, held in their browser session and sent with each request.
 * The bridge puts it in the Authorization header of the one request it relays
 * and holds it nowhere else: no file, no log, no variable that outlives the call.
 * ------------------------------------------------------------------------ */

/** Where local servers listen by default, in the order the bridge asks. */
export const LOCAL_PORTS = [11434, 1234, 8080, 8000] as const;

const LOCAL_NAMES: Record<number, string> = { 11434: "Ollama", 1234: "LM Studio", 8080: "llama.cpp" };

/**
 * Bun's own fetch. The bridge only runs under Bun, and the global can be
 * replaced by whatever else shares the process (under test, a registered DOM
 * whose fetch enforces CORS on the bridge's own requests).
 */
const serverFetch: typeof fetch = Bun.fetch;

/** How long one probe of one port may take before that port counts as silent. */
export const LOCAL_PROBE_TIMEOUT_MS = 1500;

/** The server's name for the card and the record: Ollama, LM Studio, llama.cpp, or "port N". */
export function localServerName(endpoint: string): string {
  const port = Number(/:(\d+)$/.exec(endpoint)?.[1]);
  return LOCAL_NAMES[port] ?? `port ${port}`;
}

/**
 * A named endpoint as one canonical base, `http://127.0.0.1:<port>` or
 * `http://[::1]:<port>`, or null when it is not a port on this machine. Takes a
 * bare port, `host:port`, or an http URL on localhost, 127.0.0.1 or [::1] whose
 * path is empty or /v1. `ownPort` is refused, so a turn cannot loop back into
 * the bridge.
 */
export function loopbackEndpoint(raw: unknown, ownPort?: number): string | null {
  let text: string;
  if (typeof raw === "number") text = String(raw);
  else if (typeof raw === "string") text = raw.trim();
  else return null;
  if (/^\d+$/.test(text)) text = `http://127.0.0.1:${text}`;
  else if (/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(text)) text = `http://${text}`;
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
  if (!Number.isInteger(port) || port <= 0 || port >= 65536 || port === ownPort) return null;
  return `http://${host}:${port}`;
}

/** The endpoints to ask, in order: the named one first, then the usual ports, each once. */
export function localCandidates(named: string | null): string[] {
  const all = [...(named === null ? [] : [named]), ...LOCAL_PORTS.map((p) => `http://127.0.0.1:${p}`)];
  return [...new Set(all)];
}

/** What /health says about the local lane. */
export interface LocalHealth {
  readonly reachable: boolean;
  readonly endpoint: string | null;
  readonly models: string[];
  readonly needsKey: boolean;
}

const NO_LOCAL: LocalHealth = { reachable: false, endpoint: null, models: [], needsKey: false };

/** The ids in a /v1/models reply, in the server's order; a missing or null list is empty. */
export function modelIds(reply: unknown): string[] {
  const data = (reply as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((m) => (typeof m?.id === "string" && m.id !== "" ? [m.id] : []));
}

/**
 * The models a chat turn can run on. LM Studio lists its embedding models
 * beside its chat models (text-embedding-nomic-embed-text-v1.5 on the owner's
 * Mac), and a chat call to one fails, so the local list leaves them out.
 */
export function chatModelIds(ids: readonly string[]): string[] {
  return ids.filter((id) => !/embed/i.test(id));
}

function bearer(key: string | null): Record<string, string> {
  return key === null || key === "" ? {} : { authorization: `Bearer ${key}` };
}

/** One endpoint's answer, or null when it is silent past the bound, refuses, or is not such a server. */
function probeEndpoint(
  endpoint: string,
  key: string | null,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<LocalHealth | null> {
  // Raced against Bun's own clock as well as aborted, so the bound holds even
  // where the global timers belong to something else sharing the process.
  return Promise.race([askEndpoint(endpoint, key, fetchImpl, timeoutMs), Bun.sleep(timeoutMs + 50).then(() => null)]);
}

async function askEndpoint(
  endpoint: string,
  key: string | null,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<LocalHealth | null> {
  try {
    const res = await fetchImpl(`${endpoint}/v1/models`, {
      headers: bearer(key),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 401 || res.status === 403) {
      await res.body?.cancel();
      return { reachable: true, endpoint, models: [], needsKey: true };
    }
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    return { reachable: true, endpoint, models: chatModelIds(modelIds(await res.json())), needsKey: false };
  } catch {
    return null;
  }
}

/**
 * Ask every candidate at once and take the first, in order, that answers. At
 * once rather than in turn because a port whose holder never replies would
 * otherwise cost its whole timeout before the next was asked, and the page gives
 * a health probe five seconds in all.
 */
export async function probeLocal(
  candidates: readonly string[],
  key: string | null,
  fetchImpl: typeof fetch = serverFetch,
  timeoutMs: number = LOCAL_PROBE_TIMEOUT_MS,
): Promise<LocalHealth> {
  const answers = await Promise.all(candidates.map((c) => probeEndpoint(c, key, fetchImpl, timeoutMs)));
  return answers.find((a) => a !== null) ?? NO_LOCAL;
}

/** The chat request, the OpenAI-compatible shape every local server reads. */
export function chatRequestBody(
  system: string,
  messages: readonly Msg[],
  model: string,
  stream: boolean,
  maxTokens?: number,
): Record<string, unknown> {
  return {
    model,
    stream,
    ...(maxTokens === undefined ? {} : { max_tokens: maxTokens }),
    messages: [
      ...(system.trim() === "" ? [] : [{ role: "system", content: system }]),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };
}

function serverError(reply: any): string | null {
  const e = reply?.error;
  if (e === undefined || e === null) return null;
  return typeof e === "string" ? e : String(e.message ?? "the server reported an error");
}

/** A whole /v1/chat/completions reply, reduced to the /complete reply or the server's error. */
export function reduceChatCompletion(reply: any, requested: string): { text: string; model: string } | { error: string } {
  const failure = serverError(reply);
  if (failure !== null) return { error: failure };
  const text = reply?.choices?.[0]?.message?.content;
  if (typeof text !== "string") return { error: "the server gave no reply" };
  return { text, model: typeof reply.model === "string" && reply.model !== "" ? reply.model : requested };
}

type ChatStreamEvent =
  | { kind: "delta"; text: string }
  | { kind: "final"; text: string; model: string }
  | { kind: "error"; message: string };

/** The server's SSE, line by line, to the SSE the page reads: each content piece a delta, then one final. */
export function openAIStreamReducer(requested: string) {
  let text = "";
  let model = requested;
  let failed = false;
  let any = false;
  return {
    line(line: string): ChatStreamEvent[] {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return [];
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return [];
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        return [];
      }
      const failure = serverError(chunk);
      if (failure !== null) {
        if (failed) return [];
        failed = true;
        return [{ kind: "error", message: failure }];
      }
      if (typeof chunk?.model === "string" && chunk.model !== "") model = chunk.model;
      const piece = chunk?.choices?.[0]?.delta?.content;
      if (typeof piece !== "string" || piece === "") return [];
      any = true;
      text += piece;
      return [{ kind: "delta", text: piece }];
    },
    end(): ChatStreamEvent[] {
      return failed || !any ? [] : [{ kind: "final", text, model }];
    },
    get failed() {
      return failed;
    },
  };
}

/**
 * One chat turn's target: the chat URL, the model, the key if there is one, the
 * name errors use, and the fetch that reaches it. The local lane and the relay
 * both build one.
 */
interface ChatTarget {
  readonly chatUrl: string;
  readonly model: string;
  readonly key: string | null;
  readonly label: string;
  readonly fetchImpl: typeof fetch;
}

/** A local turn's target: the server's chat route on loopback. */
function localTarget(endpoint: string, model: string, key: string | null): ChatTarget {
  return { chatUrl: `${endpoint}/v1/chat/completions`, model, key, label: localServerName(endpoint), fetchImpl: serverFetch };
}

async function chatFetch(turn: ChatTarget, system: string, messages: readonly Msg[], stream: boolean, maxTokens: number | undefined, signal: AbortSignal) {
  return turn.fetchImpl(turn.chatUrl, {
    method: "POST",
    headers: { "content-type": "application/json", ...bearer(turn.key) },
    body: JSON.stringify(chatRequestBody(system, messages, turn.model, stream, maxTokens)),
    signal,
  });
}

async function runLocal(turn: ChatTarget, system: string, messages: readonly Msg[], maxTokens: number | undefined, signal: AbortSignal) {
  const res = await chatFetch(turn, system, messages, false, maxTokens, signal);
  const reply = await res.json().catch(() => null);
  const reduced = reduceChatCompletion(reply, turn.model);
  if ("error" in reduced) throw new Error(`${turn.label} answered ${res.status}: ${reduced.error.slice(0, 400)}`);
  return reduced;
}

function streamLocal(turn: ChatTarget, system: string, messages: readonly Msg[], maxTokens: number | undefined, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) => {
        const { kind, ...data } = e;
        controller.enqueue(encoder.encode(`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      controller.enqueue(encoder.encode(": open\n\n"));
      const reducer = openAIStreamReducer(turn.model);
      try {
        const res = await chatFetch(turn, system, messages, true, maxTokens, signal);
        if (!res.ok || res.body === null) {
          const reply = await res.json().catch(() => null);
          send({ kind: "error", message: `${turn.label} answered ${res.status}: ${(serverError(reply) ?? "no reply").slice(0, 400)}` });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) reducer.line(line).forEach(send);
        }
        reducer.line(buffer).forEach(send);
        reducer.end().forEach(send);
      } catch (err) {
        if (!signal.aborted) send({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}


/* ------------------------------------------------------------------------ *
 * The relay (M60, ISC-580).
 *
 * Option B takes any API key. Where the provider accepts a browser origin the
 * page calls it directly; where it does not, the page asks this bridge to relay
 * the call. The relay is not storage: the key arrives in the request body, goes
 * into the Authorization header of the one request relayed, and is held nowhere
 * else. No file, no log, no variable that outlives the call.
 *
 * It reaches an https root and nothing else (relayBase), speaks the same
 * OpenAI-compatible chat API as the local lane, and lists the service's models
 * on POST /models. The bridge's CORS rule decides who may ask: the site and
 * loopback dev origins, as for every other route.
 * ------------------------------------------------------------------------ */

/** An https API root the relay may reach, canonical and without a trailing slash; null for anything else. */
export function relayBase(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
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
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** A relayed turn's target: the service's chat route. */
function relayTarget(base: string, model: string, key: string, fetchImpl: typeof fetch): ChatTarget {
  return { chatUrl: `${base}/chat/completions`, model, key, label: new URL(base).host, fetchImpl };
}

/** The service's models, or its refusal. */
async function relayModels(base: string, key: string, fetchImpl: typeof fetch): Promise<string[]> {
  const res = await fetchImpl(`${base}/models`, { headers: bearer(key), signal: AbortSignal.timeout(15_000) });
  const reply = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${new URL(base).host} answered ${res.status}: ${(serverError(reply) ?? "no reply").slice(0, 400)}`);
  return modelIds(reply);
}

/** The local lane's probe, injected so the handler can be tested without a server on the usual ports. */
export interface LocalProbes {
  /** The endpoints to ask, the named one first. */
  candidates(named: string | null): string[];
}

/** One lane's probes for the health reply. */
export interface ProviderProbes {
  /** `<cli> --version`, or null when the binary is not on the PATH. */
  version(): Promise<string | null>;
  /** Whether the CLI is signed in; null when the probe could not tell. */
  signedIn(): Promise<boolean | null>;
}

/**
 * What the health reply needs from the machine. Injected so the handler can be
 * tested without a `claude` binary. The Claude lane keeps its M54 names; the
 * Codex lane is `codex`, and a bridge built without it reports Codex absent.
 */
export interface HealthProbes {
  /** `claude --version`, or null when there is no `claude` on the PATH. */
  claudeVersion(): Promise<string | null>;
  /** Whether the CLI is signed in; null when the probe could not tell. */
  signedIn(): Promise<boolean | null>;
  /** The Codex lane (M56). */
  codex?: ProviderProbes;
  /** The local lane (M60); a bridge built without it reports no local server. */
  local?: LocalProbes;
}

/** The body of POST /health: a named endpoint for the local lane, and its key. */
function localAsk(body: unknown, ownPort: number): { named: string | null; key: string | null } {
  const local = (body as { local?: { endpoint?: unknown; key?: unknown } } | null)?.local;
  const named = local?.endpoint === undefined ? null : loopbackEndpoint(local.endpoint, ownPort);
  return { named, key: typeof local?.key === "string" && local.key !== "" ? local.key : null };
}

const ROUTES = new Set(["/health", "/complete", "/stream", "/models"]);

/** Build the request handler. Exported so tests can drive it without a port. */
export function createHandler(
  probes: HealthProbes,
  extra: readonly string[] = [],
  options: { port?: number; relayFetch?: typeof fetch } = {},
) {
  const ownPort = options.port ?? bridgePort();
  // The relay's transport; tests put a TLS-terminating stand-in here.
  const relayFetch = options.relayFetch ?? serverFetch;
  const candidates = (named: string | null) =>
    (probes.local?.candidates(named) ?? []).filter((c) => loopbackEndpoint(c, ownPort) !== null);
  return {
    /**
     * Bun.serve idles out at 10 seconds by default, which silently kills a
     * streaming response before the model's first token arrives on any prompt
     * of real length — a short curl test passes and the actual interview prompt
     * fails with a bare 500. 255 is Bun's maximum.
     */
    idleTimeout: 255,
    async fetch(req: Request): Promise<Response> {
      const origin = req.headers.get("origin");
      const decision = corsDecision(origin, extra);
      // Refused before any work: a text/plain POST is a "simple" request that
      // skips preflight, and the page never reading the answer would not stop
      // the CLI from running and spending the reader's subscription.
      if (decision === "refuse") {
        return new Response("cli-bridge: this origin may not use the bridge", { status: 403 });
      }
      const cors: Record<string, string> =
        decision === "allow" && origin !== null
          ? { "access-control-allow-origin": origin, vary: "Origin" }
          : {};
      const url = new URL(req.url);

      if (req.method === "OPTIONS") {
        if (!ROUTES.has(url.pathname)) return new Response(null, { status: 404 });
        const headers: Record<string, string> = {
          ...cors,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
          "access-control-max-age": "600",
        };
        // Chrome's private/local network access preflight: an https page
        // asking for a loopback address says so, and wants a yes.
        if (
          req.headers.get("access-control-request-private-network") === "true" ||
          req.headers.get("access-control-request-local-network") === "true"
        ) {
          headers["access-control-allow-private-network"] = "true";
          headers["access-control-allow-local-network"] = "true";
        }
        return new Response(null, { status: 204, headers });
      }

      const respond = (res: Response): Response => {
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
        return res;
      };

      if (url.pathname === "/health") {
        // POST /health may name a local endpoint and its key (M60); GET asks the usual ports.
        const ask = req.method === "POST" ? localAsk(await req.json().catch(() => null), ownPort) : { named: null, key: null };
        const [claude, codex, local] = await Promise.all([
          probes.claudeVersion(),
          probes.codex === undefined ? null : probes.codex.version(),
          probes.local === undefined ? NO_LOCAL : probeLocal(candidates(ask.named), ask.key),
        ]);
        const signedIn = claude === null ? null : await probes.signedIn();
        const codexSigned = codex === null ? null : await probes.codex!.signedIn();
        return respond(
          Response.json({
            ok: true,
            claude,
            signedIn,
            bun: Bun.version,
            providers: {
              claude: { version: claude, signedIn },
              codex: { version: codex, signedIn: codexSigned },
              local,
            },
          }),
        );
      }
      if (url.pathname === "/models" && req.method === "POST") {
        const body = (await req.json().catch(() => null)) as { baseUrl?: unknown; key?: unknown } | null;
        const base = relayBase(body?.baseUrl);
        if (base === null || typeof body?.key !== "string" || body.key === "") {
          return respond(Response.json({ error: "cli-bridge: /models needs an https baseUrl and a key" }, { status: 400 }));
        }
        try {
          return respond(Response.json({ models: await relayModels(base, body.key, relayFetch) }));
        } catch (err) {
          return respond(Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }));
        }
      }
      if ((url.pathname === "/complete" || url.pathname === "/stream") && req.method === "POST") {
        const streaming = url.pathname === "/stream";
        try {
          const body = (await req.json()) as {
            system?: string;
            messages?: Msg[];
            model?: string;
            maxTokens?: number;
            provider?: unknown;
            endpoint?: unknown;
            key?: unknown;
            baseUrl?: unknown;
          };
          const system = body.system ?? "";
          const prompt = assembleCliPrompt(body.messages ?? []);
          const provider = requestProvider(body);
          if (provider === null || (provider === "local" && probes.local === undefined)) {
            return respond(
              Response.json({ error: 'cli-bridge: provider must be "claude", "codex", "local" or "relay"' }, { status: 400 }),
            );
          }
          if (provider === "relay") {
            // Refused before anything is sent: an https root, a key and a model, or no call.
            const base = relayBase(body.baseUrl);
            if (base === null || typeof body.key !== "string" || body.key === "" || typeof body.model !== "string" || body.model === "") {
              return respond(
                Response.json({ error: "cli-bridge: a relayed turn needs an https baseUrl, a key and a model" }, { status: 400 }),
              );
            }
            const turn = relayTarget(base, body.model, body.key, relayFetch);
            const messages = body.messages ?? [];
            if (streaming) return respond(streamLocal(turn, system, messages, body.maxTokens, req.signal));
            const result = await runLocal(turn, system, messages, body.maxTokens, req.signal);
            return respond(Response.json({ text: result.text, model: result.model, modelVersion: result.model }));
          }
          if (provider === "local") {
            // Loopback only: a named endpoint off this machine is refused before anything is sent.
            const named = body.endpoint === undefined ? null : loopbackEndpoint(body.endpoint, ownPort);
            if (body.endpoint !== undefined && named === null) {
              return respond(
                Response.json(
                  { error: "cli-bridge: a local model server must be a port on this machine (127.0.0.1 or ::1), not the bridge's own" },
                  { status: 400 },
                ),
              );
            }
            const key = typeof body.key === "string" && body.key !== "" ? body.key : null;
            let turn: ChatTarget;
            if (named !== null && typeof body.model === "string" && body.model !== "") {
              turn = localTarget(named, body.model, key);
            } else {
              const found = await probeLocal(candidates(named), key);
              if (!found.reachable || found.endpoint === null) {
                throw new Error(`no local model server answered on ports ${LOCAL_PORTS.join(", ")}${named === null ? "" : ` or at ${named}`}`);
              }
              const model = typeof body.model === "string" && body.model !== "" ? body.model : found.models[0];
              if (model === undefined) {
                throw new Error(`${localServerName(found.endpoint)} is running but has no models`);
              }
              turn = localTarget(found.endpoint, model, key);
            }
            const messages = body.messages ?? [];
            if (streaming) return respond(streamLocal(turn, system, messages, body.maxTokens, req.signal));
            const result = await runLocal(turn, system, messages, body.maxTokens, req.signal);
            return respond(Response.json({ text: result.text, model: result.model, modelVersion: result.model }));
          }
          if (provider === "codex") {
            const model = codexModel(body.model);
            if (model === null) {
              return respond(
                Response.json(
                  { error: `cli-bridge: codex offers ${CODEX_MODELS.join(", ")}, not ${String(body.model)}` },
                  { status: 400 },
                ),
              );
            }
            if (streaming) return respond(streamCodex(system, prompt, model));
            const result = await runCodex(system, prompt, model);
            return respond(Response.json({ text: result.text, model: result.model, modelVersion: result.model }));
          }
          const model = body.model ?? "sonnet";
          if (streaming) return respond(streamClaude(system, prompt, model));
          const result = await runClaude(system, prompt, model);
          return respond(
            Response.json({ text: result.text, model: result.model, modelVersion: result.model }),
          );
        } catch (err) {
          return respond(
            Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 }),
          );
        }
      }
      return respond(
        new Response("cli-bridge: POST /complete, POST /stream, or GET /health", { status: 404 }),
      );
    },
  };
}

/** Run a short command and return its trimmed stdout, or null if it cannot run. */
async function runShort(
  argv: string[],
  timeoutMs: number,
  env: Record<string, string> = cleanedEnv(),
): Promise<{ code: number; out: string; err: string } | null> {
  try {
    const proc = Bun.spawn(argv, {
      env,
      cwd: tmpdir(),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    return { code, out: out.trim(), err: err.trim() };
  } catch {
    // ENOENT: no such binary on the PATH.
    return null;
  }
}

/**
 * The real probes. A yes is cached for the bridge's life, because nothing the
 * reader does in the browser un-installs Claude Code or signs it out; a no is
 * asked again each time, because the panel is waiting for the reader to fix it.
 */
export function machineProbes(): HealthProbes {
  let version: string | null = null;
  let signed = false;
  return {
    async claudeVersion() {
      if (version !== null) return version;
      const res = await runShort(["claude", "--version"], 10_000);
      if (res === null || res.code !== 0 || res.out === "") return null;
      version = res.out;
      return version;
    },
    async signedIn() {
      if (signed) return true;
      // `claude auth status` prints {"loggedIn": bool, ...} in 2.1.x.
      const status = await runShort(["claude", "auth", "status"], 10_000);
      if (status !== null) {
        try {
          const parsed = JSON.parse(status.out) as { loggedIn?: unknown };
          if (typeof parsed.loggedIn === "boolean") {
            signed = parsed.loggedIn;
            return parsed.loggedIn;
          }
        } catch {
          // An older CLI without `auth status`; fall through to a real call.
        }
      }
      // Fallback: one bounded call. A signed-out CLI exits non-zero.
      const call = await runShort(
        ["claude", "-p", "Reply with OK.", "--model", "haiku", ...ISOLATION_FLAGS],
        10_000,
      );
      if (call === null) return null;
      signed = call.code === 0;
      return signed;
    },
    codex: codexProbes(),
    local: { candidates: localCandidates },
  };
}

/** The Codex lane's probes, cached the same way: a yes for good, a no asked again. */
function codexProbes(): ProviderProbes {
  const env = () => codexEnvironment(process.env);
  let version: string | null = null;
  let signed = false;
  return {
    async version() {
      if (version !== null) return version;
      const res = await runShort(["codex", "--version"], 10_000, env());
      if (res === null || res.code !== 0 || res.out === "") return null;
      version = res.out;
      return version;
    },
    async signedIn() {
      if (signed) return true;
      // `codex login status` writes its answer to stderr.
      const status = await runShort(["codex", "login", "status"], 10_000, env());
      if (status === null) return null;
      const answer = codexSignedIn(`${status.out}\n${status.err}`, status.code);
      signed = answer === true;
      return answer;
    },
  };
}

// Only listen when run as a script. Importing this module (tests do, for
// assembleCliPrompt) must not bind the port.
if (import.meta.main) {
  const port = bridgePort();
  const handler = createHandler(machineProbes(), extraOrigins(), { port });
  const bound: string[] = [];
  for (const hostname of BRIDGE_HOSTNAMES) {
    try {
      Bun.serve({ ...handler, port, hostname });
      bound.push(hostname);
    } catch (err) {
      // A machine with IPv6 off has no ::1 to bind; one family is enough.
      // The port being taken on 127.0.0.1 is not enough, and is fatal below.
      if (hostname === "127.0.0.1") {
        console.error(
          `cli-bridge: port ${port} is already in use on this machine (${err instanceof Error ? err.message : err}). Quit the program holding it and run this again.`,
        );
        process.exit(1);
      }
    }
  }
  console.log(
    `cli-bridge listening on http://localhost:${port} (${bound.join(", ")}), Claude Code, Codex and a local model server. Leave this terminal open; closing it stops the bridge.`,
  );
}
