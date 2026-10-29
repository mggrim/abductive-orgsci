/**
 * M56, ISC-575 (the recording half). Every tool turn that records its model
 * records its lane beside it: an additive optional `provider` on the event
 * envelope, "claude" or "codex", written whenever the call went through the
 * local bridge, and read as Claude when absent. Older records, the shipped
 * example among them, carry none and validate and import as before.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { validateEvent } from "../src/ledger/events.ts";
import { providerField, providerOf } from "../src/inference/types.ts";
import { runIntervention } from "../src/personas/engine.ts";
import type { InferenceClient } from "../src/inference/types.ts";
import type { MatrixCell } from "../src/matrix/schema.ts";
import { MATRIX } from "../src/matrix/matrix.ts";
import { CREEDS } from "../src/personas/creeds.ts";
import { testChunk, testProject } from "./persona-helpers.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

const challenge = (extra: Record<string, unknown>) => ({
  id: "3b241101-e2bb-4255-8caf-4136c566a962",
  ts: 1_790_000_000_000,
  actor: "persona:interviewer",
  projectId: "p",
  model: "gpt-5.6-sol",
  modelVersion: "gpt-5.6-sol",
  type: "challenge",
  text: "What would change your mind?",
  matrixCell: "x",
  ...extra,
});

describe("ISC-575: the envelope carries the lane", () => {
  test("claude and codex validate; absent validates; anything else is refused", () => {
    expect(validateEvent(challenge({ provider: "codex" }))).toEqual([]);
    expect(validateEvent(challenge({ provider: "claude" }))).toEqual([]);
    expect(validateEvent(challenge({}))).toEqual([]);
    // M60 widened the list (the local lane); the refusal names every value it takes.
    expect(validateEvent(challenge({ provider: "gemini" })).some((e: string) => e.startsWith("provider must be one of claude, codex, local"))).toBe(true);
  });

  test("the field is spread only when there is a lane, and read as Claude when absent", () => {
    expect(providerField({ provider: "codex" })).toEqual({ provider: "codex" });
    expect(providerField({})).toEqual({});
    expect(providerOf({ provider: "codex" })).toBe("codex");
    expect(providerOf({})).toBe("claude");
  });
});

describe("ISC-575: a persona turn records the lane its client ran on", () => {
  test("a Codex result gives Codex challenge events; a result with no lane gives none", async () => {
    const cell = MATRIX.find((c) => c.personas.length > 0) as MatrixCell;
    const client = (provider?: "codex"): InferenceClient => ({
      complete: async () => ({ text: "What would change your mind?", model: "gpt-5.6-sol", modelVersion: "gpt-5.6-sol", ...(provider ? { provider } : {}) }),
    });
    const ctx = { project: testProject(), chunks: [testChunk("c1")], creeds: CREEDS, priorEvents: [] };
    const codex = await runIntervention(cell, ctx as never, client("codex"));
    const challenges = codex.events.filter((e) => e.type === "challenge");
    expect(challenges.length).toBeGreaterThan(0);
    for (const e of challenges) expect(e.provider).toBe("codex");
    const plain = await runIntervention(cell, ctx as never, client());
    for (const e of plain.events.filter((e) => e.type === "challenge")) expect("provider" in e).toBe(false);
  });
});

describe("ISC-575: every writer that records a model records the lane", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });
  }

  test("each modelVersion taken from a result, a client or a turn's input has provider within a few lines", () => {
    const missing: string[] = [];
    for (const path of sources(SRC)) {
      const lines = readFileSync(path, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/^\s*modelVersion: (result|input|client|recorded|verdict|twin)\b/.test(line)) return;
        const near = lines.slice(Math.max(0, i - 8), i + 12).join("\n");
        if (!/provider/.test(near)) missing.push(`${path.slice(SRC.length)}:${i + 1}`);
      });
    }
    expect(missing).toEqual([]);
  });
});
