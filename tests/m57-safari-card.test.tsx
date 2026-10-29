/**
 * M57, ISC-562. Safari treats an http loopback request from the https site as
 * mixed content and blocks it (WebKit bugs 171934 and 218627), and the failure
 * looks the same as a bridge that is not running. So on the hosted origin in
 * Safari the card does not probe at all: it says why the page can't reach the
 * bridge, offers to open Abductive from the app, offers the download beneath,
 * and says studies live per address. Chrome and Firefox keep the M54/M55 flow,
 * and on the app's own origin Safari is connected like any other browser.
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
const origin = await import(`${SRC}inference/origin.ts`);
const { activeInferenceClient } = await import(`${SRC}ui/personaRun.ts`);

const UA = {
  safari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  chrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  edge:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0",
};

const READY = { ok: true, claude: "2.1.283 (Claude Code)", signedIn: true, bun: "app 1.1.0" };

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

/** Every request the card makes, and a DMG the site serves. */
function site(health: Record<string, unknown> | "down") {
  const asked: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    if (url.endsWith("/AbductiveBridge.dmg")) {
      return new Response(null, { status: 200, headers: { "content-type": "application/x-apple-diskimage" } });
    }
    if (health === "down") throw new TypeError("Load failed");
    return Response.json(health);
  }) as typeof fetch;
  return { fetchImpl, asked, health: () => asked.filter((u) => u.endsWith("/health")) };
}

let host: HTMLElement;
let root: Root;
const was = { ua: navigator.userAgent, hostname: window.location.hostname, port: window.location.port };

function place(ua: string, hostname: string, port = "") {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.location, "hostname", { value: hostname, configurable: true });
  Object.defineProperty(window.location, "port", { value: port, configurable: true });
}

async function mount(props: Record<string, unknown>) {
  await act(async () => {
    root.render(<AuthPanel pollMs={20} waitMs={500} launchWaitMs={100} {...props} />);
  });
  await act(async () => {
    await wait(60);
  });
}

const text = () => host.textContent ?? "";

beforeEach(() => {
  for (const name of ["sessionStorage", "localStorage"]) {
    Object.defineProperty(globalThis, name, { value: memoryStorage(), configurable: true, writable: true });
  }
  bridge.clearCliProvider();
  bridge.resetBridgeDetection();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  place(was.ua, was.hostname, was.port);
  bridge.clearCliProvider();
  bridge.resetBridgeDetection();
});

describe("ISC-562: which browsers get the Safari card", () => {
  test("WebKit without Chrome is Safari; Chrome, Edge and Firefox are not", () => {
    expect(origin.safariBrowser(UA.safari)).toBe(true);
    expect(origin.safariBrowser(UA.chrome)).toBe(false);
    expect(origin.safariBrowser(UA.edge)).toBe(false);
    expect(origin.safariBrowser(UA.firefox)).toBe(false);
    // WebKit without Safari's token (an embedded web view, or the test DOM) is not Safari.
    expect(origin.safariBrowser("Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko)")).toBe(false);
  });

  test("the copy is the brief's, word for word", () => {
    expect(steps.SAFARI_SENTENCE).toBe(
      "Safari doesn't let a website talk to a program on your Mac, so Abductive can't reach the bridge. Open Abductive from the Abductive Bridge menu instead, or use Chrome or Firefox for this site.",
    );
    expect(steps.SAFARI_OPEN_LABEL).toBe("Open Abductive from the app");
  });
});

describe("ISC-560: the Safari control fires open, and the card's other launch fires start", () => {
  test("two verbs: start takes the port and shows the menu, open also opens the app's page", () => {
    expect(steps.APP_SCHEME_URL).toBe("abductive-bridge://start");
    expect(steps.APP_OPEN_URL).toBe("abductive-bridge://open");
    const frame = steps.launchBridgeApp(document, 50, steps.APP_OPEN_URL);
    expect(frame.getAttribute("src")).toBe("abductive-bridge://open");
    frame.remove();
  });
});

describe("ISC-562: the hosted card in Safari", () => {
  test("says why, offers the app, the download beneath and the studies sentence, and never probes", async () => {
    place(UA.safari, "abductive.pages.dev");
    const s = site(READY);
    let launched = 0;
    let opened = 0;
    await mount({ fetchImpl: s.fetchImpl, launchApp: () => void (launched += 1), openApp: () => void (opened += 1) });

    expect(text()).toContain(steps.SAFARI_SENTENCE);
    expect(text()).toContain(steps.SAFARI_STUDIES);
    // M56: nor do the lane controls, which can only fail here.
    expect(text()).not.toContain("Use Claude Code");
    expect(text()).not.toContain("Use Codex");
    expect(text()).not.toContain(steps.STEP_SENTENCE["no-bridge"]);
    expect(s.health()).toEqual([]);
    expect(launched).toBe(0);

    const card = host.querySelector("[data-step=safari]")!;
    const order = [...card.querySelectorAll("[data-safari-open], [data-download-app], [data-safari-studies]")].map(
      (n) => [...n.attributes].find((a) => a.name.startsWith("data-"))!.name,
    );
    expect(order).toEqual(["data-safari-open", "data-download-app", "data-safari-studies"]);

    const open = host.querySelector<HTMLButtonElement>("[data-safari-open]")!;
    expect(open.textContent).toBe("Open Abductive from the app");
    await act(async () => open.click());
    expect(opened).toBe(1);
    expect(launched).toBe(0);
    expect(s.health()).toEqual([]);
  });

  test("a choice kept from Chrome does not make Safari claim a model, and still sends no probe", async () => {
    place(UA.safari, "abductive.pages.dev");
    localStorage.setItem(bridge.CLI_PROVIDER_KEY, "cli");
    const asked: string[] = [];
    const found = await bridge.detectBridge((async (u: RequestInfo | URL) => {
      asked.push(String(u));
      return Response.json(READY);
    }) as typeof fetch);
    expect(found).toBe(false);
    expect(asked).toEqual([]);
    expect(activeInferenceClient().live).toBe(false);
  });

  test("on the app's own origin Safari connects like any browser", async () => {
    place(UA.safari, "localhost", "8787");
    const s = site(READY);
    await mount({ fetchImpl: s.fetchImpl, launchApp: () => {} });
    expect(text()).not.toContain(steps.SAFARI_SENTENCE);
    expect(text()).toContain("You're connected through Claude Code 2.1.283 on this machine.");
    expect(s.health()).toEqual(["/cli-bridge/health"]);
  });
});

describe("ISC-562: Chrome and Firefox keep the current flow", () => {
  for (const name of ["chrome", "firefox"] as const) {
    test(`${name}: no Safari sentence; the card probes localhost, tries the app, then shows the paths`, async () => {
      place(UA[name], "abductive.pages.dev");
      const s = site("down");
      let launched = 0;
      await mount({ fetchImpl: s.fetchImpl, launchApp: () => void (launched += 1) });
      await act(async () => {
        await wait(200);
      });
      expect(text()).not.toContain(steps.SAFARI_SENTENCE);
      expect(text()).not.toContain(steps.SAFARI_STUDIES);
      expect(s.health()[0]).toBe("http://localhost:8787/health");
      expect(launched).toBe(1);
      expect(text()).toContain(steps.STEP_SENTENCE["no-bridge"]);
    });
  }
});
