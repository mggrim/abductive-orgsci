/**
 * M54, ISC-547 … ISC-549. The "Use local Claude CLI" card gets the reader from
 * nothing to connected: it reads the machine on arrival, names the one step
 * left in one sentence, gives the command for that step with a Copy button,
 * waits for the step to be done and connects on its own.
 */

import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;
const { AuthPanel } = await import(`${SRC}auth/AuthPanel.tsx`);
const steps = await import(`${SRC}auth/bridgeSteps.ts`);
const bridge = await import(`${SRC}inference/cliBridge.ts`);

type Health = Record<string, unknown> | "down";

/** A fetch that answers /health from a script the test advances. */
function scriptedBridge(initial: Health) {
  let current: Health = initial;
  let calls = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.endsWith("/health")) throw new Error(`unexpected ${url}`);
    calls += 1;
    if (current === "down") throw new TypeError("Failed to fetch");
    return new Response(JSON.stringify(current), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return {
    fetchImpl,
    set: (h: Health) => {
      current = h;
    },
    calls: () => calls,
  };
}

const READY = { ok: true, claude: "2.1.283 (Claude Code)", signedIn: true, bun: "1.3.14" };
const NO_CLAUDE = { ok: true, claude: null, signedIn: null, bun: "1.3.14" };
const SIGNED_OUT = { ok: true, claude: "2.1.283 (Claude Code)", signedIn: false, bun: "1.3.14" };

let host: HTMLElement;
let root: Root;

async function mount(fetchImpl: typeof fetch, props: Record<string, unknown> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<AuthPanel fetchImpl={fetchImpl} pollMs={20} waitMs={400} {...props} />);
  });
  await settle();
}

async function settle(ms = 30) {
  await act(async () => {
    await wait(ms);
  });
}

const text = () => host.textContent ?? "";

/**
 * Fresh stores per test. `tests/auth.test.ts` deletes the global ones in its
 * own `afterEach`, and the process is shared, so this file cannot assume the
 * DOM's stores are still there.
 */
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
  for (const name of ["sessionStorage", "localStorage"]) {
    Object.defineProperty(globalThis, name, { value: memoryStorage(), configurable: true, writable: true });
  }
  bridge.clearCliProvider();
  bridge.resetBridgeDetection();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  bridge.clearCliProvider();
  bridge.resetBridgeDetection();
});

describe("ISC-548: one sentence per state, read on arrival", () => {
  test("no bridge: the start command, with the Bun line under it", async () => {
    const b = scriptedBridge("down");
    await mount(b.fetchImpl);
    // M83, ISC-701: this DOM is the dev server, whose steps name Claude Code.
    expect(text()).toContain(steps.stepSentence("no-bridge", "claude", true));
    const commands = [...host.querySelectorAll("[data-command]")].map((n) => n.getAttribute("data-command"));
    expect(commands).toEqual(["bun run bridge", steps.BUN_INSTALL]);
  });

  test("bridge but no claude: the Claude Code install line", async () => {
    const b = scriptedBridge(NO_CLAUDE);
    await mount(b.fetchImpl);
    expect(text()).toContain(steps.stepSentence("no-claude", "claude", true));
    const commands = [...host.querySelectorAll("[data-command]")].map((n) => n.getAttribute("data-command"));
    expect(commands).toEqual([steps.CLAUDE_INSTALL]);
  });

  test("claude but signed out: run claude once and sign in", async () => {
    const b = scriptedBridge(SIGNED_OUT);
    await mount(b.fetchImpl);
    expect(text()).toContain(steps.STEP_SENTENCE["signed-out"]);
    // The card keeps polling and the bridge asks about sign-in again each time,
    // so the sentence promises the connection rather than asking for a press.
    expect(steps.STEP_SENTENCE["signed-out"]).toBe(
      "Claude Code is on this machine, and you haven't signed in to it yet. Run claude once in a terminal and sign in, and Abductive connects once you have.",
    );
    expect(text()).not.toContain("press Use local Claude CLI again");
    const commands = [...host.querySelectorAll("[data-command]")].map((n) => n.getAttribute("data-command"));
    expect(commands).toEqual(["claude"]);
  });

  test("all present: connected on arrival, with the version", async () => {
    const b = scriptedBridge(READY);
    await mount(b.fetchImpl);
    expect(text()).toContain("You're connected through Claude Code 2.1.283 on this machine.");
    expect(host.querySelectorAll("[data-command]")).toHaveLength(0);
    expect(bridge.cliProviderSelected()).toBe(true);
  });

  test("the step follows the reply, as a pure function", () => {
    expect(steps.bridgeStep({ ok: false, reason: "unreachable" })).toBe("no-bridge");
    expect(steps.bridgeStep({ ok: false, reason: "not-bridge" })).toBe("port-taken");
    expect(steps.bridgeStep({ ok: false, reason: "timeout" })).toBe("port-taken");
    expect(steps.bridgeStep({ ok: true, claude: null })).toBe("no-claude");
    expect(steps.bridgeStep({ ok: true, claude: "2.1.283", signedIn: false })).toBe("signed-out");
    expect(steps.bridgeStep({ ok: true, claude: "2.1.283", signedIn: true })).toBe("ready");
    // A bridge from before M54 cannot say; the panel tries rather than blocks.
    expect(steps.bridgeStep({ ok: true, claude: "2.1.283", signedIn: null })).toBe("ready");
  });
});

describe("ISC-547: the commands, one per line, each with its own Copy", () => {
  test("hosted: the download-and-run command names this site", () => {
    expect(steps.startCommand("https://abductive.pages.dev", false)).toBe(
      "curl -fsSL https://abductive.pages.dev/bridge.ts -o abductive-bridge.ts && bun abductive-bridge.ts",
    );
    expect(steps.startCommand("http://localhost:5173", true)).toBe("bun run bridge");
    expect(steps.BUN_INSTALL).toBe("curl -fsSL https://bun.sh/install | bash");
    expect(steps.CLAUDE_INSTALL).toBe("npm install -g @anthropic-ai/claude-code");
  });

  test("every command line has a Copy button and a gloss, and nothing runs from the page", async () => {
    const b = scriptedBridge("down");
    await mount(b.fetchImpl);
    for (const line of host.querySelectorAll("[data-command]")) {
      const button = line.querySelector("button");
      expect(button?.textContent).toBe("Copy");
      expect(line.querySelector("code")?.textContent).toBe(line.getAttribute("data-command") ?? undefined);
      expect((line.querySelector("[data-gloss]")?.textContent ?? "").length).toBeGreaterThan(20);
    }
  });

  test("Copy puts the command on the clipboard and says so", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (s: string) => void written.push(s) },
      configurable: true,
    });
    const b = scriptedBridge("down");
    await mount(b.fetchImpl);
    const first = host.querySelector("[data-command] button") as HTMLButtonElement;
    await act(async () => first.click());
    await settle();
    expect(written).toEqual(["bun run bridge"]);
    expect(first.textContent).toBe("Copied");
  });
});

describe("ISC-549: the panel waits, and connects on its own", () => {
  test("waits after showing a command, then connects when the bridge is ready", async () => {
    const b = scriptedBridge("down");
    await mount(b.fetchImpl);
    // M83, ISC-701: the dev server's waiting line names Claude Code.
    expect(text()).toContain("Waiting for Abductive to reach Claude Code…");
    b.set(NO_CLAUDE);
    await settle(60);
    expect(text()).toContain(steps.stepSentence("no-claude", "claude", true));
    b.set(READY);
    await settle(60);
    expect(text()).toContain("You're connected through Claude Code 2.1.283 on this machine.");
    expect(bridge.cliProviderSelected()).toBe(true);
    const after = b.calls();
    await settle(80);
    expect(b.calls()).toBe(after); // no polling once connected
  });

  test("the connection is announced, so the header's bar can leave without a reload", async () => {
    let heard = 0;
    const listen = () => void (heard += 1);
    window.addEventListener(bridge.PROVIDER_CHANGED_EVENT, listen);
    try {
      const b = scriptedBridge(READY);
      await mount(b.fetchImpl);
      expect(heard).toBeGreaterThan(0);
    } finally {
      window.removeEventListener(bridge.PROVIDER_CHANGED_EVENT, listen);
    }
  });

  test("Stop waiting stops the polling", async () => {
    const b = scriptedBridge("down");
    await mount(b.fetchImpl);
    const stop = [...host.querySelectorAll("button")].find((x) => x.textContent === "Stop waiting");
    expect(stop).toBeDefined();
    await act(async () => stop!.click());
    const n = b.calls();
    await settle(80);
    expect(b.calls()).toBe(n);
    expect(text()).not.toContain("Waiting for Abductive to reach Claude Code…");
  });

  test("gives up after the wait and says how to check again", async () => {
    const b = scriptedBridge("down");
    await mount(b.fetchImpl, { waitMs: 60 });
    await settle(150);
    expect(text()).toContain(steps.GAVE_UP);
    const n = b.calls();
    await settle(60);
    expect(b.calls()).toBe(n);
  });

  test("Disconnect clears the choice and does not reconnect", async () => {
    const b = scriptedBridge(READY);
    await mount(b.fetchImpl);
    const off = [...host.querySelectorAll("button")].find((x) => x.textContent === "Disconnect");
    await act(async () => off!.click());
    await settle(60);
    expect(bridge.cliProviderSelected()).toBe(false);
    // M56: the two lane controls stay, to connect again.
    expect(text()).toContain("Use Claude Code");
    expect(text()).not.toContain("You're connected through");
  });
});
