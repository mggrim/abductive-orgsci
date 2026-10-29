/**
 * M61 follow-up, ISC-591 (b) and (c): the CLI lanes' model lists on the card.
 *
 * Claude: sonnet, opus and haiku, Claude Code's own names, each of which it
 * resolves to Anthropic's newest model of that kind; one sentence says so, and
 * the record shows the resolved id. Codex: gpt-5.6-sol by default, gpt-6.1-sol
 * offered. A pick is kept like the local model's. Picking a Codex model checks
 * it through the bridge once, and a refusal shows Codex's own sentence on the
 * card while the pick stays chosen and kept, so the reader can change it (the
 * lead's ruling, 2026-09-30).
 */
import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CODEX_MODELS as BRIDGE_CODEX_MODELS } from "../scripts/cli-bridge.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const { AuthPanel } = await import(`${SRC}auth/AuthPanel.tsx`);
const steps = await import(`${SRC}auth/bridgeSteps.ts`);
const bridge = await import(`${SRC}inference/cliBridge.ts`);
const choice = await import(`${SRC}inference/providerChoice.ts`);

const REFUSED = "The 'gpt-6.1-sol' model is not supported when using Codex with a ChatGPT account.";
const health = {
  ok: true,
  claude: "2.1.285 (Claude Code)",
  signedIn: true,
  bun: "1.3.13",
  providers: {
    claude: { version: "2.1.285 (Claude Code)", signedIn: true },
    codex: { version: "codex-cli 0.146.0", signedIn: true },
  },
};

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage(), configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: memoryStorage(), configurable: true, writable: true });
  bridge.resetBridgeDetection();
});
afterEach(() => bridge.resetBridgeDetection());

describe("ISC-591: the lists and the kept pick", () => {
  test("Claude offers its three aliases; Codex offers the bridge's list, the default first", () => {
    expect(choice.CLI_MODEL_CHOICES.claude).toEqual(["sonnet", "opus", "haiku"]);
    expect(choice.CLI_MODEL_CHOICES.codex).toEqual([...BRIDGE_CODEX_MODELS]);
    expect(choice.CLI_MODEL_CHOICES.codex[0]).toBe(bridge.DEFAULT_CODEX_MODEL);
  });

  test("a pick is kept per lane, and anything off the list is refused and never stored", () => {
    expect(choice.keptCliModel("claude")).toBeNull();
    choice.keepCliModel("claude", "opus");
    choice.keepCliModel("codex", "gpt-6.1-sol");
    expect(choice.keptCliModel("claude")).toBe("opus");
    expect(choice.keptCliModel("codex")).toBe("gpt-6.1-sol");
    expect(() => choice.keepCliModel("claude", "sk-ant-secret")).toThrow();
    localStorage.setItem(choice.CLI_MODEL_KEY.codex, "sonnet");
    expect(choice.keptCliModel("codex")).toBeNull();
  });

  test("the client asks for the kept model, and the lane's default when none is kept", () => {
    expect(new bridge.CliBridgeInferenceClient({ lane: "claude" }).requestedModel).toBe("sonnet");
    expect(new bridge.CliBridgeInferenceClient({ lane: "codex" }).requestedModel).toBe("gpt-5.6-sol");
    choice.keepCliModel("claude", "haiku");
    choice.keepCliModel("codex", "gpt-5.5");
    expect(new bridge.CliBridgeInferenceClient({ lane: "claude" }).requestedModel).toBe("haiku");
    expect(new bridge.CliBridgeInferenceClient({ lane: "codex" }).requestedModel).toBe("gpt-5.5");
  });
});

describe("ISC-591: the card", () => {
  let host: HTMLElement;
  let root: Root;
  let completes: { model: unknown }[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/health")) return Response.json(health);
    if (url.endsWith("/complete")) {
      const body = JSON.parse(String(init?.body));
      completes.push({ model: body.model });
      return body.model === "gpt-6.1-sol"
        ? Response.json({ error: REFUSED }, { status: 500 })
        : Response.json({ text: "OK", model: body.model, modelVersion: body.model });
    }
    throw new Error(`unexpected ${url}`);
  }) as unknown as typeof fetch;

  async function mount() {
    completes = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<AuthPanel fetchImpl={fetchImpl} pollMs={20} waitMs={400} />);
    });
    await act(async () => void (await wait(40)));
  }
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    bridge.clearCliProvider();
  });

  const text = () => host.textContent ?? "";
  const radio = (label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent === label)!;
  const press = async (label: string) => {
    await act(async () => radio(label).click());
    await act(async () => void (await wait(80)));
  };
  const models = () => [...host.querySelectorAll("[data-cli-model]")].map((b) => b.getAttribute("data-cli-model"));
  const checked = () => host.querySelector('[data-cli-model][aria-checked="true"]')?.getAttribute("data-cli-model");

  test("Claude: sonnet, opus, haiku, sonnet in use, and the one sentence about the aliases", async () => {
    await mount();
    await press("Use Claude Code");
    expect(models()).toEqual(["sonnet", "opus", "haiku"]);
    expect(checked()).toBe("sonnet");
    expect(text()).toContain(steps.CLAUDE_ALIAS_SENTENCE);
    await press("opus");
    expect(choice.keptCliModel("claude")).toBe("opus");
    expect(checked()).toBe("opus");
    // Claude's aliases are Claude Code's own; picking one runs nothing.
    expect(completes).toEqual([]);
  });

  test("Codex: gpt-5.6-sol in use; gpt-6.1-sol refused shows Codex's sentence, and the pick stays", async () => {
    await mount();
    await press("Use Codex");
    expect(models()).toEqual([...BRIDGE_CODEX_MODELS]);
    expect(checked()).toBe("gpt-5.6-sol");
    expect(text()).not.toContain(steps.CLAUDE_ALIAS_SENTENCE);
    await press("gpt-6.1-sol");
    expect(completes).toEqual([{ model: "gpt-6.1-sol" }]);
    expect(host.querySelector("[data-cli-model-note]")?.textContent).toBe(REFUSED);
    // Kept and shown as chosen, so the reader sees what was refused and picks again.
    expect(checked()).toBe("gpt-6.1-sol");
    expect(choice.keptCliModel("codex")).toBe("gpt-6.1-sol");
  });

  test("Codex: a model it runs is kept, and the note clears", async () => {
    await mount();
    await press("Use Codex");
    await press("gpt-6.1-sol");
    await press("gpt-5.5");
    expect(choice.keptCliModel("codex")).toBe("gpt-5.5");
    expect(checked()).toBe("gpt-5.5");
    expect(host.querySelector("[data-cli-model-note]")).toBeNull();
  });
});
