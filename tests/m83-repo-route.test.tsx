/**
 * M83, ISC-701: the repository route stops naming the app.
 *
 * On `bun run dev` the page reaches Claude Code through scripts/cli-bridge.ts,
 * which the dev server starts, with no app involved. The Model access card
 * still offered "Download Abductive Bridge" there, because the dev server
 * serves public/AbductiveBridge.dmg too, and its steps spoke of "the bridge".
 * A co-author could not install the app, and their enterprise Claude seat gives
 * them no API key (2026-10-05). The lead's ruling (2026-10-06): on the
 * repository route the card offers no app and its steps name Claude Code.
 *
 * Held here: on a dev-server origin the card asks nothing about the DMG and
 * renders no download, and its no-bridge, port-taken and missing-CLI steps
 * name the CLI and no bridge; the hosted site's card is as it was; the local
 * lane keeps its sentences; and SETUP.md and README.md say what the banner
 * says and that a Claude Code sign-in needs no API key.
 */

import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = new URL("../", import.meta.url).pathname;
const { AuthPanel } = await import(`${SRC}auth/AuthPanel.tsx`);
const steps = await import(`${SRC}auth/bridgeSteps.ts`);
const bridge = await import(`${SRC}inference/cliBridge.ts`);
const { sentenceBreaks, sentencesOf } = await import(`${SRC}copy/rules.ts`);

const NO_CLAUDE = { ok: true, claude: null, signedIn: null, bun: "1.2.0" };
const SERVED = { status: 200, type: "application/x-apple-diskimage" };

function site(health: Record<string, unknown> | "down") {
  const heads: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/AbductiveBridge.dmg")) {
      heads.push(init?.method ?? "GET");
      return new Response(null, { status: SERVED.status, headers: { "content-type": SERVED.type } });
    }
    if (!url.endsWith("/health")) throw new Error(`unexpected ${url}`);
    if (health === "down") throw new TypeError("Failed to fetch");
    return Response.json(health);
  }) as typeof fetch;
  return { fetchImpl, heads };
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

/**
 * The subscription card's words (the first card on Model access, which carries
 * the CLI lanes' steps), with the command taken out, since `bun run bridge` is
 * a command's name. The API key card below it is a different route and keeps
 * its own sentences.
 */
const prose = () => (host.querySelector("section.card")?.textContent ?? "").replaceAll("bun run bridge", "");

beforeEach(() => {
  for (const name of ["sessionStorage", "localStorage"]) {
    Object.defineProperty(globalThis, name, { value: memoryStorage(), configurable: true, writable: true });
  }
  originalHost = window.location.hostname;
  bridge.clearCliProvider();
  bridge.resetBridgeDetection();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  setHost(originalHost);
  bridge.clearCliProvider();
  bridge.resetBridgeDetection();
});

describe("ISC-701: the dev server's card offers no app", () => {
  test("no request for the DMG, and no download, even though the dev server serves it", async () => {
    setHost("localhost");
    const s = site("down");
    await mount({ fetchImpl: s.fetchImpl, launchApp: () => {} });
    await settle(60);
    expect(s.heads).toEqual([]);
    expect(host.querySelector("[data-download-app]")).toBeNull();
    expect(host.textContent).not.toContain(steps.APP_DOWNLOAD_LABEL);
    expect(host.textContent).not.toContain("Abductive Bridge");
  });

  test("the hosted card still asks for the DMG and offers it", async () => {
    setHost("abductive.pages.dev");
    const s = site("down");
    await mount({ fetchImpl: s.fetchImpl, launchApp: () => {} });
    await settle(250);
    expect(s.heads).toContain("HEAD");
    expect(host.querySelector("a[data-download-app]")).not.toBeNull();
    expect(host.textContent).toContain(steps.STEP_SENTENCE["no-bridge"]);
  });
});

describe("ISC-701: the dev server's steps name Claude Code", () => {
  test("no bridge answering: the sentence names Claude Code, and the card says bridge nowhere but the command", async () => {
    setHost("localhost");
    const s = site("down");
    await mount({ fetchImpl: s.fetchImpl, launchApp: () => {} });
    const sentence = steps.stepSentence("no-bridge", "claude", true);
    expect(sentence).toBe(
      "Abductive can't reach Claude Code on this machine yet. Run bun run bridge in a second terminal from the abductive folder, and Abductive connects to Claude Code once the command is running.",
    );
    expect(host.textContent).toContain(sentence);
    expect(prose()).not.toMatch(/\bbridge\b/i);
    expect(prose()).toContain("Claude Code");
  });

  test("a bridge short of Claude Code: the sentence names no bridge either", async () => {
    setHost("localhost");
    const s = site(NO_CLAUDE);
    await mount({ fetchImpl: s.fetchImpl, launchApp: () => {} });
    expect(host.textContent).toContain(steps.stepSentence("no-claude", "claude", true));
    expect(prose()).not.toMatch(/\bbridge\b/i);
  });

  test("every dev sentence for the two CLI lanes names its CLI, names no bridge, and passes the copy rules", () => {
    for (const lane of ["claude", "codex"] as const) {
      for (const step of ["no-bridge", "port-taken", lane === "claude" ? "no-claude" : "no-codex"] as const) {
        const said = steps.stepSentence(step, lane, true).replaceAll("bun run bridge", "");
        expect({ lane, step, names: said.includes(steps.LANE_NAME[lane]), bridge: /\bbridge\b/i.test(said) }).toEqual({
          lane,
          step,
          names: true,
          bridge: false,
        });
        for (const s of sentencesOf(steps.stepSentence(step, lane, true))) {
          expect({ s, breaks: sentenceBreaks(s).map((b: { rule: string }) => b.rule) }).toEqual({ s, breaks: [] });
        }
        expect(steps.waitingLine(step, lane, true)).not.toMatch(/\bbridge\b/i);
        for (const line of steps.commandsFor(step, "http://localhost:5173", true, lane)) {
          expect(line.gloss).not.toMatch(/\bbridge\b/i);
        }
      }
    }
  });

  test("the hosted sentences and the local lane's are as they were", () => {
    for (const step of ["no-bridge", "port-taken", "no-claude"] as const) {
      expect(steps.stepSentence(step, "claude", false)).toBe(steps.STEP_SENTENCE[step]);
    }
    for (const step of ["no-bridge", "no-local", "local-old-bridge"] as const) {
      expect(steps.stepSentence(step, "local", true)).toBe(steps.STEP_SENTENCE[step]);
    }
  });
});

describe("ISC-701: SETUP.md and README.md", () => {
  const SETUP = Bun.file(`${ROOT}SETUP.md`).text();
  const README = Bun.file(`${ROOT}README.md`).text();

  test("SETUP.md quotes the banner's own words", async () => {
    const setup = await SETUP;
    expect(setup).toContain("**Abductive is running without a model.**");
    expect(setup).not.toContain("No model connected");
    expect(setup).not.toMatch(/no model connected/i);
  });

  test("SETUP.md's Before you start says a Claude Code sign-in needs no API key, a Team or Enterprise seat included", async () => {
    const setup = await SETUP;
    const before = setup.slice(setup.indexOf("## Before you start"), setup.indexOf("## The one message to paste"));
    expect(before).toMatch(/API key/);
    expect(before).toMatch(/Team or Enterprise/);
    expect(before).toMatch(/Claude Code/);
  });

  test("README.md's Running it on your own machine says the same in one sentence", async () => {
    const readme = await README;
    const section = readme.slice(readme.indexOf("## Running it on your own machine"), readme.indexOf("## What is in the repository"));
    const sentence = sentencesOf(section.replace(/\n/g, " ")).find((s: string) => /Team or Enterprise/.test(s)) ?? "";
    expect(sentence).toMatch(/API key/);
    expect(sentence).toMatch(/Claude Code/);
  });
});
