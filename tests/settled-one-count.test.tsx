/**
 * A visit that is a visit (D18, M43d).
 *
 * The strip read `CHANGES 52`, the tab was reloaded, and it read `CHANGES 0` at
 * the exact moment a returning researcher reads it. The mark is written when the
 * researcher leaves, and it records the moment the visit began, so a reload
 * keeps that visit's work in view.
 *
 * This file began as "one count of settled findings" (D55): the four surfaces
 * that disagreed about that quantity went with the checks at M89, and the
 * visit half is what remains.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useDom } from "./dom.ts";
import { lastSeenKey } from "../src/views/sinceLastVisit.ts";
import { useLastSeen } from "../src/flow/SinceLastHere.tsx";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { sinceLastVisit } from "../src/views/sinceLastVisit.ts";

const PROJECT_ID = "proj-d55";
let clock = 2_700_000_000_000;
const tick = () => (clock += 1000);

/** An answer saved at a step: one of the things the strip counts. */
function saved(subject: string): LedgerEvent {
  return {
    id: crypto.randomUUID(),
    ts: tick(),
    actor: "human",
    projectId: PROJECT_ID,
    type: "bound",
    subject,
    statement: "what they wrote",
  } as LedgerEvent;
}

describe("the mark is written on leaving, and it is the visit's start", () => {
  useDom();
  const map = new Map<string, string>();
  let real: PropertyDescriptor | undefined;

  beforeEach(() => {
    map.clear();
    real = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => void map.set(k, v),
        removeItem: (k: string) => void map.delete(k),
      },
    });
  });

  afterEach(() => {
    if (real === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else Object.defineProperty(globalThis, "localStorage", real);
  });

  function Probe() {
    useLastSeen("study-1");
    return null;
  }

  test("a hash change inside the study writes nothing, because it is not leaving", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<Probe />));
    act(() => void window.dispatchEvent(new Event("hashchange")));
    expect(map.get(lastSeenKey("study-1"))).toBeUndefined();
    act(() => root.unmount());
  });

  test("leaving stamps the moment the visit began, not the moment of leaving", () => {
    const host = document.createElement("div");
    const root = createRoot(host);
    const before = Date.now();
    act(() => root.render(<Probe />));
    const after = Date.now();
    act(() => root.unmount());
    const stored = Number(map.get(lastSeenKey("study-1")));
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(after);
  });
});

describe("the visit mark", () => {
  test("counting from the start of the last visit keeps that visit's work in view", () => {
    /* The reload case, as arithmetic over the projection. A mark written at the
     * moment of leaving sits after everything the session did, so the window is
     * empty; a mark written as the moment the visit began keeps the session in
     * view, which is what a returning researcher opened the strip to read. */
    const visitStart = clock + 500;
    const events: LedgerEvent[] = [saved("context"), saved("site")];
    const leavingMoment = clock + 1;

    const fromVisitStart = sinceLastVisit({ events, projectId: PROJECT_ID, since: visitStart });
    const fromLeaving = sinceLastVisit({ events, projectId: PROJECT_ID, since: leavingMoment });
    expect(fromVisitStart.total).toBeGreaterThan(0);
    expect(fromLeaving.total).toBe(0);
  });

  test("no mark at all is a first visit rather than a study that stood still", () => {
    const view = sinceLastVisit({ events: [], projectId: PROJECT_ID, since: null });
    expect(view.kind).toBe("first-visit");
  });
});
