/**
 * Regression guard for the CLI bridge's prompt isolation.
 *
 * Defect 2026-07-30: personas ran through `claude -p` with the CLI's default
 * system prompt intact, so the Claude Code assistant identity survived
 * underneath the creed. A live challenge card opened with "this isn't a Claude
 * Code engineering session, so I don't have the appropriate skill loaded."
 *
 * The fix routes the creed through --system-prompt (which replaces rather
 * than appends) and disables everything that reintroduces the CLI's identity.
 * These tests pin both halves.
 */

import { describe, expect, test } from "bun:test";
import { assembleCliPrompt, resolveModel } from "../scripts/cli-bridge.ts";

const CREED = "You are a methods critic grounded in Tavory & Timmermans.";

describe("assembleCliPrompt", () => {
  test("does not embed the system prompt in the user turn", () => {
    const prompt = assembleCliPrompt([{ role: "user", content: "Critique this brief." }]);
    expect(prompt).not.toContain(CREED);
    expect(prompt).not.toContain("<instructions>");
  });

  test("preserves dialogue order and marks assistant turns", () => {
    const prompt = assembleCliPrompt([
      { role: "user", content: "First question." },
      { role: "assistant", content: "Earlier answer." },
      { role: "user", content: "Follow-up." },
    ]);
    expect(prompt.indexOf("First question.")).toBeLessThan(prompt.indexOf("Earlier answer."));
    expect(prompt.indexOf("Earlier answer.")).toBeLessThan(prompt.indexOf("Follow-up."));
    expect(prompt).toContain("[Assistant's prior turn]");
  });

  test("asks for bare content, no preamble", () => {
    const prompt = assembleCliPrompt([{ role: "user", content: "Go." }]);
    expect(prompt).toContain("Output ONLY the response content");
  });
});

describe("resolveModel", () => {
  /**
   * The CLI lists an auxiliary haiku entry FIRST in modelUsage even when
   * sonnet answered; the old Object.keys()[0] read logged haiku into the
   * ledger, corrupting ISC-5 provenance.
   */
  const BOTH = {
    modelUsage: {
      "claude-haiku-4-5-20251001": { outputTokens: 15 },
      "claude-sonnet-5": { outputTokens: 135 },
    },
  };

  test("picks the requested alias over the first-listed auxiliary model", () => {
    expect(resolveModel(BOTH, "sonnet")).toBe("claude-sonnet-5");
  });

  test("ties on output tokens do not flip the answer", () => {
    const tied = {
      modelUsage: {
        "claude-haiku-4-5-20251001": { outputTokens: 13 },
        "claude-sonnet-5": { outputTokens: 13 },
      },
    };
    expect(resolveModel(tied, "sonnet")).toBe("claude-sonnet-5");
  });

  test("falls back to the biggest producer when the alias does not match", () => {
    expect(resolveModel(BOTH, "opus")).toBe("claude-sonnet-5");
  });

  test("honours an explicit top-level model field", () => {
    expect(resolveModel({ model: "claude-opus-5", ...BOTH }, "sonnet")).toBe("claude-opus-5");
  });

  test("falls back to the requested name when usage is empty", () => {
    expect(resolveModel({}, "sonnet")).toBe("sonnet");
  });
});

describe("isolation flags", () => {
  /**
   * Read the flag list out of the source rather than importing it, so the
   * test fails loudly if someone removes a flag without updating this guard.
   */
  const source = Bun.file(new URL("../scripts/cli-bridge.ts", import.meta.url)).text();

  test("strips settings, tools, MCP, skills and chrome from the CLI session", async () => {
    const text = await source;
    for (const flag of [
      "--setting-sources",
      "--tools",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--no-chrome",
    ]) {
      expect(text).toContain(flag);
    }
  });

  test("passes the creed via --system-prompt, which replaces the default", async () => {
    const text = await source;
    expect(text).toContain('"--system-prompt"');
    // --append-system-prompt would layer the creed on top of Claude Code's
    // own prompt instead of replacing it — the original defect.
    expect(text).not.toContain("--append-system-prompt");
  });

  test("spawns in a neutral cwd so a stray CLAUDE.md is not read as memory", async () => {
    const text = await source;
    expect(text).toContain("cwd: tmpdir()");
  });
});
