/**
 * M74b, ISC-664: "Load failed" (the walk's finding 10).
 *
 * At Early data the student's reply failed after about fifty seconds with
 * Safari's raw "Load failed", while the bridge's health check stayed green. A
 * network error now gets one retry after two seconds; a second one becomes
 * "Abductive couldn't reach the model. Try again." for the chat to show.
 */

import { describe, expect, test } from "bun:test";
import {
  BRIDGE_RETRY_MS,
  CliBridgeInferenceClient,
  isNetworkError,
  MODEL_UNREACHABLE,
  ModelUnreachableError,
} from "../src/inference/cliBridge.ts";

const ok = () =>
  new Response(JSON.stringify({ text: "Fine.", model: "sonnet", modelVersion: "sonnet" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function sse(frames: readonly string[], failAfter?: number): Response {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (failAfter !== undefined && i === failAfter) {
        controller.error(new TypeError("Load failed"));
        return;
      }
      const frame = frames[i];
      i += 1;
      if (frame === undefined) controller.close();
      else controller.enqueue(new TextEncoder().encode(frame));
    },
  });
  return new Response(body, { status: 200 });
}

const delta = (text: string) => `event: delta\ndata: ${JSON.stringify({ text })}\n\n`;
const final = (text: string) => `event: final\ndata: ${JSON.stringify({ text, model: "sonnet" })}\n\n`;

describe("a bridge call that fails with a network error", () => {
  test("Safari's, Chrome's and Firefox's network errors read as one, and an abort does not", () => {
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isNetworkError(new DOMException("aborted", "AbortError"))).toBe(false);
    expect(isNetworkError(new Error("CLI bridge error 500: boom"))).toBe(false);
  });

  test("waits two seconds and tries once more", async () => {
    expect(BRIDGE_RETRY_MS).toBe(2000);
    const waits: number[] = [];
    let calls = 0;
    const client = new CliBridgeInferenceClient({
      fetchImpl: (async () => {
        calls += 1;
        if (calls === 1) throw new TypeError("Load failed");
        return ok();
      }) as unknown as typeof fetch,
      wait: async (ms) => void waits.push(ms),
    });
    const result = await client.complete({ system: "s", messages: [] });
    expect(result.text).toBe("Fine.");
    expect(calls).toBe(2);
    expect(waits).toEqual([2000]);
  });

  test("a second failure says what failed and what to do, with Abductive as the actor", async () => {
    let calls = 0;
    const client = new CliBridgeInferenceClient({
      fetchImpl: (async () => {
        calls += 1;
        throw new TypeError("Load failed");
      }) as unknown as typeof fetch,
      wait: async () => undefined,
    });
    const err = await client.complete({ system: "s", messages: [] }).catch((e: unknown) => e);
    expect(calls).toBe(2);
    expect(err).toBeInstanceOf(ModelUnreachableError);
    expect((err as Error).message).toBe("Abductive couldn't reach the model. Try again.");
    expect(MODEL_UNREACHABLE).toBe("Abductive couldn't reach the model. Try again.");
  });

  test("a stream that drops part way is asked again once, and its answer comes back", async () => {
    let calls = 0;
    const painted: string[] = [];
    const client = new CliBridgeInferenceClient({
      fetchImpl: (async () => {
        calls += 1;
        return calls === 1 ? sse([delta("That message ")], 1) : sse([delta("That message came through."), final("That message came through.")]);
      }) as unknown as typeof fetch,
      wait: async () => undefined,
    });
    const result = await client.completeStream({ system: "s", messages: [] }, (d) => painted.push(d.text));
    expect(calls).toBe(2);
    expect(result.text).toBe("That message came through.");
  });

  test("a stop is not retried", async () => {
    let calls = 0;
    const controller = new AbortController();
    const client = new CliBridgeInferenceClient({
      fetchImpl: (async () => {
        calls += 1;
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      }) as unknown as typeof fetch,
      wait: async () => undefined,
    });
    await client.complete({ system: "s", messages: [], signal: controller.signal }).catch(() => undefined);
    expect(calls).toBe(1);
  });
});
