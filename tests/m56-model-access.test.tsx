/**
 * M56, ISC-558. The card is "Model access". Option A names either
 * subscription, Claude through Claude Code and ChatGPT through Codex; the
 * reader picks the lane with two radio-style controls; each lane has its own
 * state sentences and its install and sign-in lines; the lane is kept beside
 * the "cli" choice as its literal name and nothing else; and the "No model is
 * connected" bar clears for whichever lane is connected.
 */

import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;
const { AuthPanel } = await import(`${SRC}auth/AuthPanel.tsx`);
const steps = await import(`${SRC}auth/bridgeSteps.ts`);
const bridge = await import(`${SRC}inference/cliBridge.ts`);
const choice = await import(`${SRC}inference/providerChoice.ts`);
const { activeInferenceClient } = await import(`${SRC}ui/personaRun.ts`);

const lane = (version: string | null, signedIn: boolean | null) => ({ version, signedIn });
const health = (claude: ReturnType<typeof lane>, codex: ReturnType<typeof lane>) => ({
  ok: true,
  claude: claude.version,
  signedIn: claude.signedIn,
  bun: "1.3.14",
  providers: { claude, codex },
});
const CLAUDE_OK = lane("2.1.283 (Claude Code)", true);
const CODEX_OK = lane("codex-cli 0.146.0", true);
const NONE = lane(null, null);

function memoryStorage(): Storage & { writes: [string, string][] } {
  const map = new Map<string, string>();
  const writes: [string, string][] = [];
  return {
    writes,
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => {
      writes.push([k, v]);
      map.set(k, String(v));
    },
  };
}

let local: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  local = memoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true, writable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: memoryStorage(), configurable: true, writable: true });
  bridge.resetBridgeDetection();
});

afterEach(() => bridge.resetBridgeDetection());

describe("ISC-558: the steps, per lane", () => {
  test("Codex: missing, signed out, ready; read from providers", () => {
    expect(steps.bridgeStep(health(CLAUDE_OK, NONE), "codex")).toBe("no-codex");
    expect(steps.bridgeStep(health(CLAUDE_OK, lane("codex-cli 0.146.0", false)), "codex")).toBe("codex-signed-out");
    expect(steps.bridgeStep(health(NONE, CODEX_OK), "codex")).toBe("ready");
    // The Claude lane does not care about Codex, and the reverse.
    expect(steps.bridgeStep(health(CLAUDE_OK, NONE), "claude")).toBe("ready");
    expect(steps.bridgeStep(health(NONE, CODEX_OK), "claude")).toBe("no-claude");
  });

  test("a bridge from before M56, with no providers: Claude reads the M54 fields, Codex is missing", () => {
    const old = { ok: true, claude: "2.1.283 (Claude Code)", signedIn: true, bun: "1.3.14" };
    expect(steps.bridgeStep(old, "claude")).toBe("ready");
    expect(steps.bridgeStep(old, "codex")).toBe("no-codex");
    expect(steps.bridgeStep(old)).toBe("ready");
  });

  test("no bridge and a taken port are shared by both lanes", () => {
    for (const l of ["claude", "codex"] as const) {
      expect(steps.bridgeStep({ ok: false, reason: "unreachable" }, l)).toBe("no-bridge");
      expect(steps.bridgeStep({ ok: false, reason: "not-bridge" }, l)).toBe("port-taken");
    }
  });

  test("Codex's sentences, its install line and its sign-in line", () => {
    expect(steps.STEP_SENTENCE["no-codex"]).toBe(
      "The bridge is running, but this machine doesn't have Codex yet. Install Codex with the line below, and Abductive connects once you've signed in.",
    );
    expect(steps.STEP_SENTENCE["codex-signed-out"]).toBe(
      "Codex is on this machine, and you haven't signed in to it yet. Run codex login in a terminal and sign in, and Abductive connects once you have.",
    );
    expect(steps.commandsFor("no-codex", "https://abductive.pages.dev", false).map((c: { command: string }) => c.command)).toEqual([
      "npm install -g @openai/codex",
    ]);
    expect(steps.commandsFor("codex-signed-out", "https://abductive.pages.dev", false).map((c: { command: string }) => c.command)).toEqual([
      "codex login",
    ]);
    expect(steps.WAITING["no-codex"]).toBe("Waiting for you to install Codex and sign in…");
    expect(steps.WAITING["codex-signed-out"]).toBe("Waiting for you to sign in to Codex…");
  });

  test("the connected sentence names the lane and its version number", () => {
    expect(steps.connectedSentence("2.1.283 (Claude Code)")).toBe("You're connected through Claude Code 2.1.283 on this machine.");
    expect(steps.connectedSentence("2.1.283 (Claude Code)", "claude")).toBe("You're connected through Claude Code 2.1.283 on this machine.");
    expect(steps.connectedSentence("codex-cli 0.146.0", "codex")).toBe("You're connected through Codex 0.146.0 on this machine.");
    expect(steps.connectedSentence(null, "codex")).toBe("You're connected through Codex on this machine.");
  });
});

describe("ISC-558: the lane is kept as its literal name and nothing else", () => {
  test("claude until the reader picks; the pick writes one word under its own key", () => {
    expect(choice.keptLane()).toBe("claude");
    choice.keepLane("codex");
    expect(local.writes).toEqual([[choice.LANE_KEY, "codex"]]);
    expect(choice.keptLane()).toBe("codex");
    expect(choice.LANE_KEY).not.toBe(choice.CLI_PROVIDER_KEY);
  });

  test("a stored value that is not a lane reads as claude", () => {
    local.setItem(choice.LANE_KEY, "sk-" + "ant-api03-whatever");
    expect(choice.keptLane()).toBe("claude");
  });

  // The static guarantee on the three credential files is tests/auth.test.ts's,
  // unchanged: the lane lives in providerChoice.ts with the "cli" choice.
});

describe("ISC-558: the client sends its lane and records it", () => {
  function recordingFetch(reply: Record<string, unknown>) {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json(reply);
    }) as unknown as typeof fetch;
    return { fetchImpl, bodies };
  }

  test("Codex: provider codex, Codex's default model, and the result says codex", async () => {
    choice.keepLane("codex");
    const f = recordingFetch({ text: "hi", model: "gpt-5.6-sol", modelVersion: "gpt-5.6-sol" });
    const client = new bridge.CliBridgeInferenceClient({ fetchImpl: f.fetchImpl });
    expect(client.requestedModel).toBe("gpt-5.6-sol");
    const result = await client.complete({ system: "s", messages: [{ role: "user", content: "q" }] });
    expect(f.bodies[0]).toMatchObject({ provider: "codex", model: "gpt-5.6-sol" });
    expect(result.provider).toBe("codex");
  });

  test("Claude: provider claude, sonnet as before", async () => {
    const f = recordingFetch({ text: "hi", model: "claude-sonnet-5", modelVersion: "claude-sonnet-5" });
    const client = new bridge.CliBridgeInferenceClient({ fetchImpl: f.fetchImpl });
    const result = await client.complete({ system: "s", messages: [] });
    expect(f.bodies[0]).toMatchObject({ provider: "claude", model: "sonnet" });
    expect(result.provider).toBe("claude");
  });
});

describe("ISC-558: the bar clears for whichever lane is connected", () => {
  const answering = (h: unknown) => (async () => Response.json(h)) as unknown as typeof fetch;

  test("Codex chosen and signed in, Claude missing: connected", async () => {
    bridge.selectCliProvider();
    choice.keepLane("codex");
    bridge.resetBridgeDetection();
    expect(await bridge.detectBridge(answering(health(NONE, CODEX_OK)))).toBe(true);
    expect(activeInferenceClient().live).toBe(true);
  });

  test("Codex chosen but signed out, Claude signed in: not connected", async () => {
    bridge.selectCliProvider();
    choice.keepLane("codex");
    bridge.resetBridgeDetection();
    expect(await bridge.detectBridge(answering(health(CLAUDE_OK, lane("codex-cli 0.146.0", false))))).toBe(false);
    expect(activeInferenceClient().live).toBe(false);
  });
});

describe("ISC-558: the card", () => {
  let host: HTMLElement;
  let root: Root;
  let current: unknown;

  const fetchImpl = (async (input: RequestInfo | URL) => {
    if (!String(input).endsWith("/health")) throw new Error(`unexpected ${String(input)}`);
    if (current === "down") throw new TypeError("Failed to fetch");
    return Response.json(current);
  }) as unknown as typeof fetch;

  async function mount() {
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
    await act(async () => void (await wait(60)));
  };

  test("titled Model access; Option A names both subscriptions; two lane controls in a group", async () => {
    current = health(CLAUDE_OK, CODEX_OK);
    await mount();
    expect(host.querySelector("h1")?.textContent).toBe("Model access");
    // M60 added the local model to Option A's heading and a third lane.
    expect(text()).toContain("Subscription or local model");
    expect(text()).toContain("Claude through Claude Code");
    expect(text()).toContain("ChatGPT through Codex");
    const group = host.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect([...group!.querySelectorAll('[role="radio"]')].map((b) => b.textContent)).toEqual([
      "Use Claude Code",
      "Use Codex",
      "Use a local model",
    ]);
    expect(radio("Use Claude Code").getAttribute("aria-checked")).toBe("true");
    expect(radio("Use Codex").getAttribute("aria-checked")).toBe("false");
    expect(text()).toContain("You're connected through Claude Code 2.1.283 on this machine.");
    // Option B took any API key in M60.
    expect(text()).toContain("API key");
  });

  test("a lane that is not installed can be chosen and shows its install line", async () => {
    current = health(CLAUDE_OK, NONE);
    await mount();
    await press("Use Codex");
    expect(choice.keptLane()).toBe("codex");
    expect(radio("Use Codex").getAttribute("aria-checked")).toBe("true");
    // M83, ISC-701: on the dev server the step names Codex and no bridge.
    expect(text()).toContain(steps.stepSentence("no-codex", "codex", true));
    const commands = [...host.querySelectorAll("[data-command]")].map((n) => n.getAttribute("data-command"));
    expect(commands).toEqual(["npm install -g @openai/codex"]);
    expect(text()).not.toContain("You're connected through");
  });

  test("switching lanes while connected: Codex connects, then Claude again", async () => {
    current = health(CLAUDE_OK, CODEX_OK);
    await mount();
    await press("Use Codex");
    expect(text()).toContain("You're connected through Codex 0.146.0 on this machine.");
    await press("Use Claude Code");
    expect(choice.keptLane()).toBe("claude");
    expect(text()).toContain("You're connected through Claude Code 2.1.283 on this machine.");
  });

  test("Codex signed out: run codex login", async () => {
    current = health(CLAUDE_OK, lane("codex-cli 0.146.0", false));
    await mount();
    await press("Use Codex");
    expect(text()).toContain(steps.STEP_SENTENCE["codex-signed-out"]);
    expect([...host.querySelectorAll("[data-command]")].map((n) => n.getAttribute("data-command"))).toEqual(["codex login"]);
  });
});

describe("ISC-558: the card is Model access wherever it is named", () => {
  test("the rail item and the walkthrough's link", () => {
    const shell = readFileSync(`${SRC}ui/AppShell.tsx`, "utf8");
    expect(shell).toMatch(/href="#\/settings"[\s\S]{0,200}Model access/);
    expect(shell).not.toContain(">Claude access<");
    const intro = readFileSync(`${SRC}ui/Introduction.tsx`, "utf8");
    expect(intro).toContain('<a href="#/settings">Model access</a>');
  });
});
