/**
 * M52-2, "Open the palette" comes off the rail's foot (ISC-538).
 *
 * The owner, on the live site: "Also get rid of 'open the palette'." The rail's
 * foot printed two chord hints, `?` for the sheet and `Mod+K` for the palette,
 * to a reader who in most cases had no study yet. A line advertising a chord for
 * a places-only overlay spends the first minute of attention on the app instead
 * of on the study.
 *
 * Two claims, and the second is the one that makes the first safe:
 *
 *   gone      the rail's foot renders no line saying "Open the palette".
 *   still there  `Mod+K` still resolves to the palette in the one table the one
 *                listener reads, and the sheet at `?` still lists it. Removing a
 *                hint must not remove the thing it hinted at, and there is no
 *                screenshot that can tell those two apart.
 *
 * Rendered rather than read out of the source for the first claim, because the
 * defect the owner reported was a line on screen. The chord is asserted against
 * `resolveStroke`, which is what the listener calls.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { AppShell } from "../src/ui/AppShell.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { BINDINGS, LISTENED, PREFIXES } from "../src/ui/keyboard/bindings.ts";
import { resolveStroke } from "../src/ui/keyboard/chords.ts";

let container: HTMLElement;
let root: Root;

beforeEach(async () => {
  window.location.hash = "";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(LedgerProvider, {
        store: new InMemoryLedgerStore(),
        children: React.createElement(AppShell),
      }),
    );
  });
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("M52-2: the rail's foot no longer says it (ISC-538)", () => {
  test("the foot renders one hint, and it is not the palette's", () => {
    const hints = [...container.querySelectorAll(".navrail-hint")];
    // Vacuity guard: the foot has to be on screen for its absence of a line to
    // mean anything. It printed two rows before M52.
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.map((h) => h.querySelector("span")?.textContent)).toEqual(["Open shortcuts"]);
  });

  test("no line anywhere in the rail says Open the palette", () => {
    const rail = container.querySelector("nav");
    expect(rail).not.toBeNull();
    expect(rail?.textContent ?? "").not.toContain("Open the palette");
  });
});

describe("M52-2: the palette stays reachable by its keys (ISC-538)", () => {
  test("Mod+K still resolves to the palette in the table the listener reads", () => {
    expect(resolveStroke(LISTENED, null, "Mod+K", PREFIXES).binding?.id).toBe("open-palette");
  });

  test("the sheet still lists it, so a reader can still find the chord", () => {
    const palette = BINDINGS.find((b) => b.id === "open-palette");
    expect(palette?.keys).toBe("Mod+K");
    expect(palette?.section).toBe("help");
    // And the row the rail still prints is the one that opens that sheet, so
    // the chord the hint was removed from is one keystroke away from the hint
    // that stayed.
    expect(BINDINGS.find((b) => b.id === "open-sheet")?.keys).toBe("?");
  });
});
