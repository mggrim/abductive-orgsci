/**
 * M56, ISC-557 (the TS bridge half). Codex as a second lane beside Claude Code.
 *
 * A request names its provider ("claude" by default); a Codex turn runs
 * `codex exec` once, non-interactively, in an empty temp directory, with the
 * study's system prompt as Codex's model instructions (`model_instructions_file`,
 * settled by the M56 probe), everything that could bring the CLI's own agent
 * back switched off, and the JSONL reduced to the wire shapes the Claude lane
 * already answers with. /health reports both providers.
 *
 * The reducers are held to real `codex exec --json` output, captured once on
 * this Mac and committed under bridge-app/BridgeCore/Tests/BridgeCoreTests/Fixtures
 * (the Swift tests read the same files). Routing is exercised against a fake
 * `codex` on PATH that replays a fixture and writes down what it was given.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  codexArguments,
  codexEnvironment,
  codexModel,
  codexSignedIn,
  CODEX_MODELS,
  createHandler,
  DEFAULT_CODEX_MODEL,
  reduceCodexOutput,
  codexStreamReducer,
  requestProvider,
} from "../scripts/cli-bridge.ts";

const FIXTURES = new URL("../bridge-app/BridgeCore/Tests/BridgeCoreTests/Fixtures/", import.meta.url).pathname;
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("ISC-557: a request names its lane", () => {
  test("absent is claude; claude and codex are themselves; anything else is refused", () => {
    expect(requestProvider({})).toBe("claude");
    expect(requestProvider({ provider: "claude" })).toBe("claude");
    expect(requestProvider({ provider: "codex" })).toBe("codex");
    expect(requestProvider({ provider: "gemini" })).toBeNull();
    expect(requestProvider({ provider: 7 })).toBeNull();
  });

  test("Codex models: the CLI's listed models; none named is the default; a Claude alias or a stranger is refused", () => {
    // ISC-591: gpt-6.1-sol is offered after the default; a ChatGPT sign-in refuses it.
    expect(CODEX_MODELS).toEqual(["gpt-5.6-sol", "gpt-6.1-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"]);
    expect(DEFAULT_CODEX_MODEL).toBe("gpt-5.6-sol");
    expect(codexModel(undefined)).toBe("gpt-5.6-sol");
    for (const m of CODEX_MODELS) expect(codexModel(m)).toBe(m);
    expect(codexModel("sonnet")).toBeNull();
    expect(codexModel("nonsense-model")).toBeNull();
  });
});

describe("ISC-557: the codex exec invocation", () => {
  const args = codexArguments("gpt-5.6-sol", "/tmp/x/instructions.md", "/tmp/x/work");

  test("exec, JSON, the model, read-only, ephemeral, no user config or rules, the empty directory, prompt on stdin", () => {
    expect(args.slice(0, 4)).toEqual(["exec", "--json", "-m", "gpt-5.6-sol"]);
    for (const pair of [["-s", "read-only"], ["-C", "/tmp/x/work"]]) {
      const i = args.indexOf(pair[0]!);
      expect(args[i + 1]).toBe(pair[1]!);
    }
    for (const flag of ["--ephemeral", "--ignore-user-config", "--ignore-rules", "--skip-git-repo-check"]) {
      expect(args).toContain(flag);
    }
    expect(args.at(-1)).toBe("-");
  });

  test("the system prompt replaces Codex's own instructions through model_instructions_file", () => {
    expect(args).toContain('model_instructions_file="/tmp/x/instructions.md"');
    expect(args[args.indexOf('model_instructions_file="/tmp/x/instructions.md"') - 1]).toBe("-c");
    // The fallback the brief allowed, the prompt's head, is not what shipped.
    expect(codexArguments("gpt-5.6-sol", null, "/w")).not.toContain("model_instructions_file");
  });

  test("everything that would bring Codex's own agent back is off (the probe's prompt-input render)", () => {
    for (const kv of [
      "include_permissions_instructions=false",
      "include_apps_instructions=false",
      "include_environment_context=false",
      "include_collaboration_mode_instructions=false",
      "skills.include_instructions=false",
      "skills.bundled.enabled=false",
      'web_search="disabled"',
    ]) {
      expect(args[args.indexOf(kv) - 1]).toBe("-c");
    }
    for (const feature of [
      "plugins", "multi_agent", "multi_agent_v2", "apps", "hooks", "shell_tool", "unified_exec",
      "code_mode_host", "browser_use", "computer_use", "image_generation", "tool_suggest",
      "in_app_browser", "goals", "memories",
    ]) {
      expect(args[args.indexOf(feature) - 1]).toBe("--disable");
    }
  });

  test("the environment drops the nesting markers and API keys, and keeps CODEX_HOME for the sign-in", () => {
    const env = codexEnvironment({
      PATH: "/usr/bin",
      HOME: "/Users/r",
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CODEX_SANDBOX: "seatbelt",
      CODEX_THREAD_ID: "t",
      CODEX_HOME: "/Users/r/.codex",
      OPENAI_API_KEY: "sk-x",
      CODEX_API_KEY: "sk-y",
    });
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/Users/r", CODEX_HOME: "/Users/r/.codex" });
  });
});

describe("ISC-557: Codex's JSONL reduced to the wire shapes (real fixtures)", () => {
  test("a reply: the agent message is the text, the model is the one asked for", () => {
    const r = reduceCodexOutput(fixture("codex-reply.jsonl"), "gpt-5.6-sol");
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.model).toBe("gpt-5.6-sol");
    expect(r.text.length).toBe(620);
    expect(r.text.startsWith("Abductive reasoning")).toBe(true);
  });

  test("the probe: each turn's three words", () => {
    const text = fixture("codex-three-words.jsonl");
    const turns = text.split(/(?<=\"turn\.completed\"[^\n]*\n)/);
    const replies = turns.map((t) => reduceCodexOutput(t, "gpt-5.6-sol")).filter((r) => !("error" in r));
    expect(replies.map((r) => ("text" in r ? r.text : ""))).toEqual(["AI assistant, helping.", "Plants convert sunlight."]);
  });

  test("a failed turn is an error with Codex's own message; notices and retries are not", () => {
    const bad = reduceCodexOutput(fixture("codex-bad-model.jsonl"), "gpt-5.6-sol");
    expect("error" in bad && bad.error).toContain("not supported when using Codex with a ChatGPT account");
    const out = reduceCodexOutput(fixture("codex-signed-out.jsonl"), "gpt-5.6-sol");
    expect("error" in out && out.error).toContain("401 Unauthorized");
  });

  test("streaming: the message as a delta, then one final with the whole text and the model", () => {
    const reducer = codexStreamReducer("gpt-5.6-sol");
    const events = fixture("codex-reply.jsonl").split("\n").flatMap((l) => reducer.line(l));
    events.push(...reducer.end());
    expect(events.map((e) => e.kind)).toEqual(["delta", "final"]);
    const final = events[1]!;
    expect(final.kind === "final" && final.model).toBe("gpt-5.6-sol");
    expect(final.kind === "final" && final.text).toBe(events[0]!.kind === "delta" ? events[0]!.text : "x");
  });

  test("streaming a failed turn: one error, no final", () => {
    const reducer = codexStreamReducer("gpt-5.6-sol");
    const events = fixture("codex-signed-out.jsonl").split("\n").flatMap((l) => reducer.line(l));
    events.push(...reducer.end());
    expect(events.map((e) => e.kind)).toEqual(["error"]);
  });

  test("sign-in: `codex login status` says so in words and exit code", () => {
    expect(codexSignedIn("Logged in using ChatGPT", 0)).toBe(true);
    expect(codexSignedIn("Not logged in", 1)).toBe(false);
    expect(codexSignedIn("", 2)).toBeNull();
  });
});

describe("ISC-557: /health reports each provider", () => {
  async function health(probes: Parameters<typeof createHandler>[0]) {
    const res = await createHandler(probes).fetch({
      url: "http://localhost:8787/health",
      method: "GET",
      headers: { get: () => null },
    } as unknown as Request);
    return (await res.json()) as Record<string, unknown>;
  }

  test("both lanes, with the M54 fields unchanged beside them", async () => {
    const body = await health({
      claudeVersion: async () => "2.1.283 (Claude Code)",
      signedIn: async () => true,
      codex: { version: async () => "codex-cli 0.146.0", signedIn: async () => false },
    });
    expect(body).toEqual({
      ok: true,
      claude: "2.1.283 (Claude Code)",
      signedIn: true,
      bun: Bun.version,
      providers: {
        claude: { version: "2.1.283 (Claude Code)", signedIn: true },
        codex: { version: "codex-cli 0.146.0", signedIn: false },
        local: { reachable: false, endpoint: null, models: [], needsKey: false },
      },
    });
  });

  test("no codex: version null and sign-in not asked", async () => {
    let asked = false;
    const body = await health({
      claudeVersion: async () => null,
      signedIn: async () => true,
      codex: { version: async () => null, signedIn: async () => ((asked = true), true) },
    });
    expect(body.providers).toEqual({
      claude: { version: null, signedIn: null },
      codex: { version: null, signedIn: null },
      local: { reachable: false, endpoint: null, models: [], needsKey: false },
    });
    expect(asked).toBe(false);
  });
});

describe("ISC-557: a Codex turn through the handler, against a fake codex on PATH", () => {
  let dir = "";
  const oldPath = process.env.PATH;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "m56-fake-codex-"));
    // Writes its argv, its working directory, the instructions file it was
    // pointed at, its stdin and its environment, then replays a fixture.
    writeFileSync(
      join(dir, "codex"),
      `#!/bin/sh
printf '%s\\n' "$@" > "${dir}/argv"
pwd > "${dir}/cwd"
ls -A "$(pwd)" > "${dir}/cwd-listing"
cat > "${dir}/stdin"
env > "${dir}/env"
for a in "$@"; do case "$a" in model_instructions_file=*) f="\${a#model_instructions_file=}"; f="\${f%\\"}"; f="\${f#\\"}"; cp "$f" "${dir}/instructions"; esac; done
cat "${FIXTURES}codex-reply.jsonl"
`,
    );
    chmodSync(join(dir, "codex"), 0o755);
    process.env.PATH = `${dir}:${oldPath}`;
  });

  afterAll(() => {
    process.env.PATH = oldPath;
    rmSync(dir, { recursive: true, force: true });
  });

  const post = (path: string, body: unknown) =>
    createHandler({ claudeVersion: async () => null, signedIn: async () => null }).fetch(
      new Request(`http://localhost:8787${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  test("/complete with provider codex: {text, model, modelVersion}, the creed as the instructions, the prompt on stdin", async () => {
    process.env.CLAUDECODE = "1";
    process.env.OPENAI_API_KEY = "sk-should-not-pass";
    const res = await post("/complete", {
      provider: "codex",
      system: "You are the study's creed.",
      messages: [{ role: "user", content: "What is the puzzle?" }],
    });
    delete process.env.CLAUDECODE;
    delete process.env.OPENAI_API_KEY;
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, string>;
    expect(Object.keys(body)).toEqual(["text", "model", "modelVersion"]);
    expect(body.model).toBe("gpt-5.6-sol");
    expect(body.modelVersion).toBe("gpt-5.6-sol");
    expect(body.text!.startsWith("Abductive reasoning")).toBe(true);
    expect(readFileSync(join(dir, "instructions"), "utf8")).toBe("You are the study's creed.");
    expect(readFileSync(join(dir, "stdin"), "utf8")).toContain("What is the puzzle?");
    expect(readFileSync(join(dir, "stdin"), "utf8")).not.toContain("creed");
    // Ran in an empty directory, which is gone afterwards with the instructions.
    expect(readFileSync(join(dir, "cwd-listing"), "utf8")).toBe("");
    const cwd = readFileSync(join(dir, "cwd"), "utf8").trim();
    expect(existsSync(cwd)).toBe(false);
    const env = readFileSync(join(dir, "env"), "utf8");
    expect(env).not.toMatch(/^CLAUDECODE=/m);
    expect(env).not.toMatch(/^OPENAI_API_KEY=/m);
  });

  test("/stream with provider codex: the opening comment, a delta, one final naming the model", async () => {
    const res = await post("/stream", { provider: "codex", system: "s", messages: [{ role: "user", content: "q" }], model: "gpt-5.5" });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const text = await res.text();
    expect(text.startsWith(": open\n\n")).toBe(true);
    const events = [...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1]);
    expect(events).toEqual(["delta", "final"]);
    expect(text).toContain('"model":"gpt-5.5"');
    expect(readFileSync(join(dir, "argv"), "utf8").split("\n").slice(0, 4)).toEqual(["exec", "--json", "-m", "gpt-5.5"]);
  });

  test("an unknown provider or a model Codex does not offer: 400 {error}, and codex never runs", async () => {
    rmSync(join(dir, "argv"), { force: true });
    for (const body of [{ provider: "gemini" }, { provider: "codex", model: "sonnet" }]) {
      const res = await post("/complete", { ...body, messages: [] });
      expect(res.status).toBe(400);
      expect(Object.keys((await res.json()) as object)).toEqual(["error"]);
    }
    expect(readdirSync(dir)).not.toContain("argv");
  });
});
