/**
 * M56, ISC-575 (the printing half, by the lead's ruling of 2026-09-28). The
 * session replay prints the lane beside the model, only where an event records
 * one: "(Codex, gpt-5.6-sol as requested)", since Codex's JSONL does not echo
 * the model and the recorded name is the one the bridge asked for, and
 * "(Claude Code, claude-sonnet-5 20250514)", the version only when it differs
 * from the model. Events without a provider print exactly as before. The JSON
 * exports carry the field as recorded. No model line is added to the record
 * panel or the memo.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { buildSessionReplay } from "../src/export/sessionReplay.ts";
import { parseBundle } from "../src/export/bundle.ts";

const turn = (extra: Record<string, unknown>) =>
  ({
    id: crypto.randomUUID(),
    ts: 1_790_000_000_000,
    actor: "persona:interviewer",
    projectId: "p",
    type: "response",
    text: "What did the nurse say?",
    ...extra,
  }) as LedgerEvent;

const replay = (events: LedgerEvent[]) =>
  buildSessionReplay({ project: { id: "p", title: "t" } as never, events, now: () => 0 });

describe("ISC-575: the replay prints the lane where the record has one", () => {
  test("Codex: the lane, then the model as requested", () => {
    const md = replay([turn({ model: "gpt-5.6-sol", modelVersion: "gpt-5.6-sol", provider: "codex" })]);
    expect(md).toContain("## Reply from Abductive (Codex, gpt-5.6-sol as requested)");
  });

  test("Claude Code: the lane and the model, the version only when it differs", () => {
    expect(replay([turn({ model: "claude-sonnet-5", modelVersion: "20250514", provider: "claude" })])).toContain(
      "(Claude Code, claude-sonnet-5 20250514)",
    );
    const same = replay([turn({ model: "claude-sonnet-5", modelVersion: "claude-sonnet-5", provider: "claude" })]);
    expect(same).toContain("(Claude Code, claude-sonnet-5)");
    expect(same).not.toContain("claude-sonnet-5 claude-sonnet-5");
  });

  test("an event with no lane prints exactly as before", () => {
    const md = replay([turn({ model: "claude-sonnet-5", modelVersion: "claude-sonnet-5" })]);
    expect(md).toContain("## Reply from Abductive (claude-sonnet-5 claude-sonnet-5)");
    expect(md).not.toContain("Claude Code");
  });

  test("a study that switched lanes stays attributable turn by turn", () => {
    const md = replay([
      turn({ model: "gpt-5.6-sol", modelVersion: "gpt-5.6-sol", provider: "codex" }),
      turn({ model: "claude-sonnet-5", modelVersion: "claude-sonnet-5", provider: "claude", ts: 1_790_000_000_500 }),
    ]);
    expect(md.indexOf("(Codex, gpt-5.6-sol as requested)")).toBeLessThan(md.indexOf("(Claude Code, claude-sonnet-5)"));
  });

  test("the shipped example's replay has no lane in it", () => {
    const text = readFileSync(new URL("./fixtures/coldharbour.bundle.json", import.meta.url), "utf8");
    const bundle = parseBundle(text) as unknown as { events: LedgerEvent[] };
    const md = replay(bundle.events);
    expect(md).not.toContain("(Codex,");
    expect(md).not.toContain("(Claude Code,");
  });
});

describe("ISC-575: the JSON exports carry the lane as recorded", () => {
  test("the record export and a bundle keep provider on each turn, and add none where there was none", async () => {
    const { buildLedgerExport, serializeLedgerExport } = await import("../src/export/ledgerJson.ts");
    const { buildBundle, serializeBundle } = await import("../src/export/bundle.ts");
    const events = [
      turn({ model: "gpt-5.6-sol", modelVersion: "gpt-5.6-sol", provider: "codex" }),
      turn({ model: "claude-sonnet-5", modelVersion: "claude-sonnet-5", provider: "claude" }),
      turn({ model: "claude-sonnet-5", modelVersion: "claude-sonnet-5" }),
    ];
    const ledger = JSON.parse(serializeLedgerExport(buildLedgerExport("p", events, () => 0))) as { events: { provider?: string }[] };
    expect(ledger.events.map((e) => e.provider ?? null)).toEqual(["codex", "claude", null]);
    const bundle = parseBundle(
      serializeBundle(
        buildBundle({ project: { id: "p", title: "t" } as never, documents: [], chunks: [], anomalies: [], twin: null, events }),
      ),
    ) as unknown as { events: { provider?: string }[] };
    expect(bundle.events.map((e) => e.provider ?? null)).toEqual(["codex", "claude", null]);
  });
});
