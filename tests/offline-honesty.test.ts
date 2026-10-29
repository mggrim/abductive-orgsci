/**
 * The tool must not serve fixtures as findings (ISC-290 … ISC-294).
 *
 * With no provider selected the app falls back to `MockInferenceClient`, which
 * returns fluent, confident, canned research prose. Nothing on screen said so.
 * During M17 it fooled the author of this tool through two full interview
 * turns; the tell was that both turns came back word-for-word identical, not
 * anything the interface did.
 *
 * The trigger was mundane — provider choice lives in `sessionStorage`, a new
 * tab was opened, the choice went with the old one — but the consequence is
 * the exact failure Abductive exists to prevent: a researcher taking a model's
 * fluency for their own finding, except with no model in the loop at all.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { MockInferenceClient } from "../src/inference/mock.ts";
import {
  bridgeDetected,
  detectBridge,
  forgetDetectedBridge,
  resetBridgeDetection,
} from "../src/inference/cliBridge.ts";

afterEach(() => resetBridgeDetection());

describe("the mock is identifiable from the record alone (ISC-290)", () => {
  test("every mock result is stamped with a model nobody could mistake for real", async () => {
    const client = new MockInferenceClient();
    const result = await client.complete({ system: "s", messages: [{ role: "user", content: "q" }] });
    expect(result.model).toBe("mock");
    expect(result.modelVersion).toContain("mock");
  });

  test("Anti: the canned answer is the same whatever you ask, which is how it was caught", async () => {
    const client = new MockInferenceClient();
    const a = await client.complete({ system: "s", messages: [{ role: "user", content: "one question" }] });
    const b = await client.complete({ system: "s", messages: [{ role: "user", content: "a wholly different question" }] });
    expect(a.text).toBe(b.text);
  });
});

describe("a running bridge is detected rather than re-declared (ISC-291)", () => {
  const okFetch = (async () =>
    new Response(JSON.stringify({ ok: true, claude: "2.1.222" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;

  const deadFetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;

  test("a healthy bridge is found", async () => {
    resetBridgeDetection();
    expect(await detectBridge(okFetch)).toBe(true);
    expect(bridgeDetected()).toBe(true);
  });

  test("a dead bridge leaves the app honest rather than throwing (ISC-292)", async () => {
    resetBridgeDetection();
    expect(await detectBridge(deadFetch)).toBe(false);
    expect(bridgeDetected()).toBe(false);
  });

  test("the probe runs once per page load (ISC-293)", async () => {
    resetBridgeDetection();
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    await detectBridge(counting);
    await detectBridge(counting);
    await detectBridge(counting);
    expect(calls).toBe(1);
  });

  test("turning the bridge off actually turns it off (ISC-294)", async () => {
    resetBridgeDetection();
    await detectBridge(okFetch);
    expect(bridgeDetected()).toBe(true);
    forgetDetectedBridge();
    expect(bridgeDetected()).toBe(false);
  });
});

describe("the banner exists and cannot be dismissed (ISC-290)", () => {
  const SRC = new URL("../src/ui/OfflineBanner.tsx", import.meta.url).pathname;

  test("it renders only when the client is not live", async () => {
    const text = await Bun.file(SRC).text();
    expect(text).toContain("if (live) return null;");
    expect(text).toContain('role="alert"');
  });

  test("Anti: there is no dismiss control", async () => {
    const text = await Bun.file(SRC).text();
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/dismiss|setHidden|onClose/i);
  });

  test("it is mounted on every route, not inside one view", async () => {
    const shell = await Bun.file(new URL("../src/ui/AppShell.tsx", import.meta.url).pathname).text();
    expect(shell).toContain("<OfflineBanner />");
  });
});
