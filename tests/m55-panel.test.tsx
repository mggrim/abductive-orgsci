/**
 * M55, ISC-553. On the hosted site, when the card finds no bridge it first
 * asks the Mac app to start (abductive-bridge://start), waits three seconds
 * while polling, and only then shows the paths. Above the terminal path it
 * offers "Download Abductive Bridge", but only when the site really
 * serves the DMG: Cloudflare Pages answers a missing file with 200 and the
 * app's own index.html, so the gate reads the content type as well as the
 * status.
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

const READY = { ok: true, claude: "2.1.283 (Claude Code)", signedIn: true, bun: "app 1.0.0" };
const NO_CLAUDE = { ok: true, claude: null, signedIn: null, bun: "app 1.0.0" };

type Dmg = { status: number; type: string } | "error";
const SERVED: Dmg = { status: 200, type: "application/x-apple-diskimage" };
const SPA_FALLBACK: Dmg = { status: 200, type: "text/html; charset=utf-8" };

/** /health from a script the test advances, and HEAD /AbductiveBridge.dmg. */
function site(initial: Record<string, unknown> | "down", dmg: Dmg) {
  let current = initial;
  const heads: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/AbductiveBridge.dmg")) {
      heads.push(init?.method ?? "GET");
      if (dmg === "error") throw new TypeError("Failed to fetch");
      return new Response(null, { status: dmg.status, headers: { "content-type": dmg.type } });
    }
    if (!url.endsWith("/health")) throw new Error(`unexpected ${url}`);
    if (current === "down") throw new TypeError("Failed to fetch");
    return Response.json(current);
  }) as typeof fetch;
  return { fetchImpl, heads, set: (h: typeof current) => void (current = h) };
}

let host: HTMLElement;
let root: Root;
let originalHost: string;

function setHost(hostname: string) {
  Object.defineProperty(window.location, "hostname", { value: hostname, configurable: true });
}

async function settle(ms = 30) {
  await act(async () => {
    await wait(ms);
  });
}

async function mount(props: Record<string, unknown>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<AuthPanel pollMs={20} waitMs={2000} launchWaitMs={150} {...props} />);
  });
  await settle();
}

const text = () => host.textContent ?? "";
const commands = () => [...host.querySelectorAll("[data-command]")].map((n) => n.getAttribute("data-command"));

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
  originalHost = window.location.hostname;
  bridge.clearCliProvider();
  bridge.resetBridgeDetection();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setHost(originalHost);
  bridge.clearCliProvider();
  bridge.resetBridgeDetection();
});

describe("ISC-553: the hosted card asks the app first", () => {
  test("no bridge: the card launches the app, holds the paths back for the wait, then shows them", async () => {
    setHost("abductive.pages.dev");
    const s = site("down", SPA_FALLBACK);
    let launched = 0;
    await mount({ fetchImpl: s.fetchImpl, launchApp: () => void (launched += 1) });
    expect(launched).toBe(1);
    expect(text()).toContain("Looking for the bridge…");
    expect(text()).not.toContain(steps.STEP_SENTENCE["no-bridge"]);
    expect(commands()).toEqual([]);
    await settle(250);
    expect(text()).toContain(steps.STEP_SENTENCE["no-bridge"]);
    expect(commands()[0]).toContain("abductive-bridge.ts");
    expect(launched).toBe(1);
  });

  test("the app answers inside the wait: connected, and the paths never show", async () => {
    setHost("abductive.pages.dev");
    const s = site("down", SERVED);
    await mount({
      fetchImpl: s.fetchImpl,
      launchApp: () => setTimeout(() => s.set(READY), 40),
    });
    await settle(200);
    expect(text()).toContain("You're connected through Claude Code 2.1.283 on this machine.");
    expect(commands()).toEqual([]);
    expect(text()).not.toContain(steps.APP_DOWNLOAD_LABEL);
  });

  test("the dev origin never asks for the app: its bridge is `bun run bridge`", async () => {
    setHost("localhost");
    const s = site("down", SERVED);
    let launched = 0;
    await mount({ fetchImpl: s.fetchImpl, launchApp: () => void (launched += 1) });
    expect(launched).toBe(0);
    // M83, ISC-701: and its step names Claude Code.
    expect(text()).toContain(steps.stepSentence("no-bridge", "claude", true));
  });

  test("a bridge that is running but short of Claude Code is not a reason to launch the app", async () => {
    setHost("abductive.pages.dev");
    const s = site(NO_CLAUDE, SERVED);
    let launched = 0;
    await mount({ fetchImpl: s.fetchImpl, launchApp: () => void (launched += 1) });
    expect(launched).toBe(0);
    expect(text()).toContain(steps.STEP_SENTENCE["no-claude"]);
    expect(text()).not.toContain(steps.APP_DOWNLOAD_LABEL);
  });

  test("the launch goes through a hidden frame, so the page itself never navigates", () => {
    const before = window.location.href;
    const frame = steps.launchBridgeApp(document, 50);
    expect(frame.getAttribute("src")).toBe("abductive-bridge://start");
    expect(frame.hidden).toBe(true);
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.contains(frame)).toBe(true);
    expect(window.location.href).toBe(before);
  });
});

describe("ISC-553: the download is offered only when the DMG is there, above the terminal path", () => {
  async function hostedNoBridge(dmg: Dmg) {
    setHost("abductive.pages.dev");
    const s = site("down", dmg);
    await mount({ fetchImpl: s.fetchImpl, launchApp: () => {} });
    await settle(250);
    return s;
  }

  test("served: the link and its sentence sit above the start command", async () => {
    const s = await hostedNoBridge(SERVED);
    expect(s.heads).toContain("HEAD");
    const link = host.querySelector<HTMLAnchorElement>("a[data-download-app]");
    expect(link?.textContent).toBe("Download Abductive Bridge");
    expect(link?.getAttribute("href")).toBe("/AbductiveBridge.dmg");
    expect(text()).toContain(steps.APP_DOWNLOAD_GLOSS);
    const start = host.querySelector("[data-command]");
    expect(start).not.toBeNull();
    // DOCUMENT_POSITION_FOLLOWING: the command comes after the link.
    expect(link!.compareDocumentPosition(start!) & 4).toBe(4);
  });

  for (const [label, dmg] of [
    ["the site's page in place of a missing file (200, text/html)", SPA_FALLBACK],
    ["a 404", { status: 404, type: "text/plain" }],
    ["a failed request", "error"],
  ] as const) {
    test(`not offered on ${label}`, async () => {
      await hostedNoBridge(dmg);
      expect(host.querySelector("a[data-download-app]")).toBeNull();
      expect(text()).not.toContain(steps.APP_DOWNLOAD_GLOSS);
      expect(text()).toContain(steps.STEP_SENTENCE["no-bridge"]);
    });
  }

  test("the gate itself", async () => {
    const answer = (status: number, type: string) =>
      (async () => new Response(null, { status, headers: { "content-type": type } })) as unknown as typeof fetch;
    expect(await steps.appDownloadAvailable(answer(200, "application/x-apple-diskimage"))).toBe(true);
    expect(await steps.appDownloadAvailable(answer(200, "application/octet-stream"))).toBe(true);
    expect(await steps.appDownloadAvailable(answer(200, "text/html; charset=utf-8"))).toBe(false);
    expect(await steps.appDownloadAvailable(answer(404, "application/octet-stream"))).toBe(false);
    const throwing = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await steps.appDownloadAvailable(throwing)).toBe(false);
  });
});
