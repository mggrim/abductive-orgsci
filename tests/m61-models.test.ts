/**
 * M61 follow-up, ISC-591: the model defaults and lists brought current
 * (owner, 2026-09-30; facts verified on this Mac by the lead the same day).
 *
 *   Option B      Anthropic: claude-sonnet-5-5 first, then claude-opus-5-5 and
 *                 claude-haiku-4-5. OpenAI: gpt-6.1-sol first (the API serves
 *                 it), then gpt-5.6-sol and gpt-5.5.
 *   Claude lane   keeps the alias "sonnet", which Claude Code resolves to the
 *                 newest Sonnet; the record shows the resolved id.
 *   Codex lane    keeps gpt-5.6-sol as default and offers gpt-6.1-sol. A ChatGPT
 *                 sign-in refuses gpt-6.1-sol, and both bridges and the page pass
 *                 the CLI's own sentence through unchanged. The fixture is the
 *                 real output of codex-cli 0.159.2 (the npm global on this Mac) on
 *                 2026-09-30; the lead saw the same refusal from 0.146.0.
 *   Local lane    unchanged.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preferredModel } from "../src/inference/apiProviders.ts";
import { DEFAULT_MODEL } from "../src/inference/anthropic.ts";
import { CliBridgeInferenceClient, DEFAULT_CODEX_MODEL as CLIENT_CODEX_DEFAULT } from "../src/inference/cliBridge.ts";
import {
  CODEX_MODELS,
  DEFAULT_CODEX_MODEL,
  codexModel,
  codexStreamReducer,
  createHandler,
  reduceCodexOutput,
} from "../scripts/cli-bridge.ts";

const FIXTURES = new URL("../bridge-app/BridgeCore/Tests/BridgeCoreTests/Fixtures/", import.meta.url).pathname;
const REFUSAL_FILE = join(FIXTURES, "codex-refused-gpt-6.1-sol.jsonl");
const REFUSED = "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.";

describe("ISC-591 (a): Option B's lists", () => {
  test("Anthropic: Sonnet 5.5, then Opus 5.5, then Haiku 4.5", () => {
    const listed = ["claude-haiku-4-5", "claude-opus-5-5", "claude-sonnet-5-5", "claude-sonnet-4-6"];
    expect(preferredModel("anthropic", listed)).toBe("claude-sonnet-5-5");
    expect(preferredModel("anthropic", ["claude-haiku-4-5", "claude-opus-5-5"])).toBe("claude-opus-5-5");
    expect(preferredModel("anthropic", ["claude-haiku-4-5", "claude-sonnet-4-6"])).toBe("claude-haiku-4-5");
    // The key-only default, used when the list cannot be read.
    expect(DEFAULT_MODEL).toBe("claude-sonnet-5-5");
  });

  test("OpenAI: gpt-6.1-sol, then gpt-5.6-sol, then gpt-5.5", () => {
    expect(preferredModel("openai", ["gpt-5", "gpt-5.5", "gpt-5.6-sol", "gpt-6.1-sol"])).toBe("gpt-6.1-sol");
    expect(preferredModel("openai", ["gpt-5", "gpt-5.5", "gpt-5.6-sol"])).toBe("gpt-5.6-sol");
    expect(preferredModel("openai", ["gpt-5", "gpt-5.5"])).toBe("gpt-5.5");
  });
});

describe("ISC-591 (c): the Codex lane", () => {
  test("gpt-5.6-sol stays the default, in the bridge and the page, and gpt-6.1-sol is offered", () => {
    expect(DEFAULT_CODEX_MODEL).toBe("gpt-5.6-sol");
    expect(CLIENT_CODEX_DEFAULT).toBe("gpt-5.6-sol");
    expect(CODEX_MODELS[0]).toBe("gpt-5.6-sol");
    expect(CODEX_MODELS).toContain("gpt-6.1-sol");
    expect(codexModel("gpt-6.1-sol")).toBe("gpt-6.1-sol");
  });

  test("the refusal reduces to the CLI's own sentence, whole and alone", () => {
    const out = reduceCodexOutput(readFileSync(REFUSAL_FILE, "utf8"), "gpt-6.1-sol");
    expect(out).toEqual({ error: REFUSED });
    const reducer = codexStreamReducer("gpt-6.1-sol");
    const events = readFileSync(REFUSAL_FILE, "utf8").split("\n").flatMap((l) => reducer.line(l));
    events.push(...reducer.end());
    expect(events).toEqual([{ kind: "error", message: REFUSED }]);
  });

  describe("through the local bridge, against a fake codex replaying the refusal", () => {
    let dir = "";
    const oldPath = process.env.PATH;
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "m61-refusing-codex-"));
      writeFileSync(join(dir, "codex"), `#!/bin/sh\ncat > /dev/null\ncat "${REFUSAL_FILE}"\nexit 1\n`);
      chmodSync(join(dir, "codex"), 0o755);
      process.env.PATH = `${dir}:${oldPath}`;
    });
    afterAll(() => {
      process.env.PATH = oldPath;
      rmSync(dir, { recursive: true, force: true });
    });
    const post = (path: string) =>
      createHandler({ claudeVersion: async () => null, signedIn: async () => null }).fetch(
        new Request(`http://localhost:8787${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: "codex", model: "gpt-6.1-sol", system: "s", messages: [{ role: "user", content: "q" }] }),
        }),
      );

    test("/complete answers {error} with the sentence unchanged", async () => {
      const res = await post("/complete");
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: REFUSED });
    });

    test("/stream sends one error event carrying the sentence unchanged", async () => {
      const text = await (await post("/stream")).text();
      expect([...text.matchAll(/^event: (\w+)$/gm)].map((m) => m[1])).toEqual(["error"]);
      expect(text).toContain(`data: ${JSON.stringify({ message: REFUSED })}`);
    });
  });

  test("the page throws the bridge's sentence as it is, from /complete and from /stream", async () => {
    const complete = new CliBridgeInferenceClient({
      lane: "codex",
      model: "gpt-6.1-sol",
      fetchImpl: (async () => Response.json({ error: REFUSED }, { status: 500 })) as unknown as typeof fetch,
    });
    expect(complete.complete({ system: "s", messages: [] })).rejects.toThrow(new Error(REFUSED));

    const sse = `: open\n\nevent: error\ndata: ${JSON.stringify({ message: REFUSED })}\n\n`;
    const stream = new CliBridgeInferenceClient({
      lane: "codex",
      model: "gpt-6.1-sol",
      fetchImpl: (async () =>
        new Response(sse, { headers: { "content-type": "text/event-stream" } })) as unknown as typeof fetch,
    });
    let message = "";
    try {
      await stream.completeStream({ system: "s", messages: [] }, () => {});
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toBe(REFUSED);
  });
});
