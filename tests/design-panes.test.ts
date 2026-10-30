/**
 * Two panes on Design, and the read-only rule that makes them legitimate
 * (M39, ISC-503).
 *
 * The criterion is a layout change on the most-used route in the product, and
 * it reopens a column three tests and two decisions closed at M26c. So the tests
 * here are mostly not about the layout. They are about the property that lets
 * the layout exist:
 *
 *  - the companion renders no control that accepts, declines, retires or
 *    withdraws, scanned over the rendered DOM rather than over the source
 *  - the drafts queue is not on this route at all
 *  - the companion is a sibling of `.station-pane`, so a station change
 *    reconciles it rather than remounting it, which is what ISC-94 has always
 *    protected
 *  - the left pane's reading order is M37's, unchanged
 *
 * The width and the choice are per browser, so the storage tests are about what
 * happens when the browser will not co-operate: a missing value, a malformed
 * one, and a `localStorage` that throws are all the default arrangement, because
 * none of them is a reason the page should fail to render.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useDom } from "./dom.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import {
  DEFAULT_PANE,
  PANE_MAX,
  PANE_MIN,
  paneKey,
  readPaneState,
  writePaneState,
} from "../src/workbench/paneState.ts";

useDom();

const { act } = await import("react-dom/test-utils");
const { createRoot } = await import("react-dom/client");
const { createElement } = await import("react");
type ReactNode = Parameters<typeof createElement>[1] extends never ? never : import("react").ReactNode;
const { Separator } = await import("../src/ui/components/Separator.tsx");

const ROOT = join(import.meta.dir, "..");
const PROJECT = "proj-panes";

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Comments explain the bans using the words they ban, so scans read code. */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, "");
}

let host: HTMLDivElement | null = null;
let root: { render: (node: unknown) => void; unmount: () => void } | null = null;

function mount(node: unknown): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  const created = createRoot(host);
  root = created as unknown as { render: (node: unknown) => void; unmount: () => void };
  act(() => {
    created.render(node as Parameters<typeof created.render>[0]);
  });
}

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  try {
    globalThis.localStorage?.clear();
  } catch {
    /* A store that will not clear is one no test wrote to. */
  }
});

/* M59, ISC-572. The companion went, and with it the tests that it read and
 * never adjudicated. `tests/m59-design.test.ts` holds its absence. */

// ---------------------------------------------------------------------------
// The divider
// ---------------------------------------------------------------------------

describe("the divider is operable without a pointer", () => {
  function separator(value: number, onChange: (n: number) => void) {
    return createElement(Separator, {
      value,
      min: PANE_MIN,
      max: PANE_MAX,
      onChange,
      label: "Chat width",
    });
  }

  const el = (): HTMLElement =>
    document.querySelector<HTMLElement>("[data-testid='pane-separator']") as HTMLElement;

  function press(key: string): void {
    act(() => {
      el().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  }

  test("it carries the separator contract a screen reader reads", () => {
    mount(separator(0.5, () => {}));
    const node = el();
    expect(node.getAttribute("role")).toBe("separator");
    expect(node.getAttribute("aria-orientation")).toBe("vertical");
    expect(node.getAttribute("aria-valuenow")).toBe("50");
    expect(node.getAttribute("aria-valuemin")).toBe(String(Math.round(PANE_MIN * 100)));
    expect(node.getAttribute("aria-valuemax")).toBe(String(Math.round(PANE_MAX * 100)));
    expect(node.getAttribute("tabindex")).toBe("0");
    expect(node.getAttribute("aria-label")).toBe("Chat width");
  });

  test("arrows move it a step, and Home and End go to the bounds", () => {
    const seen: number[] = [];
    mount(separator(0.5, (n) => seen.push(n)));
    press("ArrowLeft");
    press("ArrowRight");
    press("Home");
    press("End");
    expect(seen.length).toBe(4);
    expect(seen[0]).toBeLessThan(0.5);
    expect(seen[1] as number).toBeGreaterThan(0.5);
    expect(seen[2]).toBe(PANE_MIN);
    expect(seen[3]).toBe(PANE_MAX);
  });

  test("it cannot be driven outside its bounds", () => {
    const seen: number[] = [];
    mount(separator(PANE_MIN, (n) => seen.push(n)));
    press("ArrowLeft");
    expect(seen[0]).toBe(PANE_MIN);

    act(() => root?.unmount());
    host?.remove();
    root = null;
    const more: number[] = [];
    mount(separator(PANE_MAX, (n) => more.push(n)));
    press("ArrowRight");
    expect(more[0]).toBe(PANE_MAX);
  });

  test("a key it does not answer to passes through to the app", () => {
    // A separator that swallowed every keystroke while focused would take Tab
    // and the page's own keys with it.
    const seen: number[] = [];
    mount(separator(0.5, (n) => seen.push(n)));
    press("k");
    press("Tab");
    expect(seen).toEqual([]);
  });

  test("arrow keys here are the separator's own, as the ARIA pattern has them", () => {
    // They act only on the focused control, which is what `role="separator"`
    // promises. The app's shortcut table went at M96 (ISC-794), and the
    // separator never read it.
    expect(code("src/ui/components/Separator.tsx")).not.toContain("bindings.ts");
  });
});

// ---------------------------------------------------------------------------
// Per-browser state
// ---------------------------------------------------------------------------

describe("the width is this browser's, and never the record's", () => {
  test("a missing value is the default", () => {
    expect(readPaneState(PROJECT)).toEqual(DEFAULT_PANE);
  });

  test("what was written comes back", () => {
    writePaneState(PROJECT, { left: 0.42 });
    expect(readPaneState(PROJECT)).toEqual({ left: 0.42 });
  });

  test("a malformed value is the default rather than a crash", () => {
    for (const junk of ["", "{", "null", "[]", '{"left":"wide"}', '{"companion":"drafts"}']) {
      globalThis.localStorage?.setItem(paneKey(PROJECT), junk);
      const state = readPaneState(PROJECT);
      expect(Number.isFinite(state.left)).toBe(true);
    }
  });

  test("a stored width outside the bounds is clamped, not honoured", () => {
    globalThis.localStorage?.setItem(paneKey(PROJECT), JSON.stringify({ left: 9 }));
    expect(readPaneState(PROJECT).left).toBe(PANE_MAX);
    globalThis.localStorage?.setItem(paneKey(PROJECT), JSON.stringify({ left: -3 }));
    expect(readPaneState(PROJECT).left).toBe(PANE_MIN);
  });

  test("a localStorage that throws is the default, and writing to it is a no-op", () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("site data is blocked");
      },
    });
    try {
      expect(readPaneState(PROJECT)).toEqual(DEFAULT_PANE);
      expect(() => writePaneState(PROJECT, { left: 0.5 })).not.toThrow();
    } finally {
      if (real !== undefined) Object.defineProperty(globalThis, "localStorage", real);
    }
  });

  test("two studies do not share an arrangement", () => {
    writePaneState("study-a", { left: 0.4 });
    writePaneState("study-b", { left: 0.7 });
    expect(readPaneState("study-a").left).toBe(0.4);
    expect(readPaneState("study-b").left).toBe(0.7);
  });

  test("a companion stored before M59 is read past (ISC-572)", () => {
    for (const retired of ["papers", "model", "record", "motivation"]) {
      globalThis.localStorage?.setItem(paneKey(PROJECT), JSON.stringify({ left: 0.5, companion: retired }));
      expect(readPaneState(PROJECT)).toEqual({ left: 0.5 });
    }
  });

  test("nothing about the pane reaches the ledger", () => {
    const source = code("src/workbench/paneState.ts");
    for (const forbidden of ["appendAll", "LedgerEvent", "useLedger", "bound"]) {
      expect(source).not.toContain(forbidden);
    }
    // And the key is a pane key, not a credential. claudeAuth's rule is about
    // keys, and a pane width is not one; said here so the two are not confused.
    expect(paneKey(PROJECT)).toBe(`abductive:pane:${PROJECT}`);
  });
});

// ---------------------------------------------------------------------------
// The layout, and what it does not disturb
// ---------------------------------------------------------------------------

describe("two panes above 1100, one column below", () => {
  test("one breakpoint, and it is the directory's prose breakpoint", () => {
    const workbench = read("src/workbench/Workbench.tsx");
    expect(workbench).toContain("(min-width: 1101px)");
    expect(read("src/ui/styles/design.css")).toContain("@media (min-width: 1101px)");
    // Not the rail's number and not panels.css's, and the file says which is
    // which, because three numbers in one directory is the confusion panels.css
    // already documents at length.
    expect(workbench).toContain("1180");
    expect(workbench).toContain("1000");
  });

  test("the share the separator reports is the share the grid gives", () => {
    /* Both tracks are written from the one fraction. With only the left track
     * set, `0.58fr` against a right track of `1fr` gives the left 37% of the
     * free space while `aria-valuenow` says 58, so a screen reader user is told
     * a number the layout does not honour. Caught by reading the two together
     * rather than by looking at either alone, which is why it is pinned. */
    const workbench = read("src/workbench/Workbench.tsx");
    expect(workbench).toContain('"--design-left": `${pane.left}fr`');
    expect(workbench).toContain('"--design-right": `${1 - pane.left}fr`');
    const css = read("src/ui/styles/design.css");
    expect(css).toContain("var(--design-left, 1fr)");
    expect(css).toContain("var(--design-right, 1fr)");
    // And the default pair in tokens.css sums to one, for the same reason.
    const tokens = read("src/ui/styles/tokens.css");
    const left = Number(/--design-left:\s*([\d.]+)fr/.exec(tokens)?.[1]);
    const right = Number(/--design-right:\s*([\d.]+)fr/.exec(tokens)?.[1]);
    expect(left + right).toBeCloseTo(1, 5);
    expect(left).toBeCloseTo(DEFAULT_PANE.left, 5);
  });

  test("the separator is not rendered at all below the breakpoint", () => {
    // Rendered-and-hidden would leave a role="separator" in the tab order that
    // moves nothing, which is worse than no separator.
    const workbench = read("src/workbench/Workbench.tsx");
    const twoPaneBranch = workbench.slice(workbench.indexOf("{twoPanes && ("));
    expect(twoPaneBranch).toContain("<Separator");
    expect(workbench.indexOf("<Separator")).toBeGreaterThan(workbench.indexOf("{twoPanes && ("));
  });

  test("no sheet: nothing on Design opens a companion below the breakpoint (M59)", () => {
    const workbench = read("src/workbench/Workbench.tsx");
    expect(workbench).toContain('className="workbench-body"');
    expect(workbench).toContain("station-pane");
    expect(workbench).not.toContain("<Sheet");
  });

  test("the dead arrangements went with the change", () => {
    const css = code("src/ui/styles/design.css");
    expect(css).not.toContain('[data-sparse="true"]');
    expect(css).not.toContain(".workbench-body.one-column");
    expect(code("src/workbench/Workbench.tsx")).not.toContain("one-column\"");
  });
});

describe("what M26c, M37 and ISC-94 protected is still protected", () => {
  const workbench = read("src/workbench/Workbench.tsx");

  test("the left pane is the thread, and the answer is the summary beside it (M59)", () => {
    // M37's act, split at M59 (ISC-573): the step's question and the
    // conversation stay in the left pane, and the answer editor is the summary,
    // drawn into the right pane above 1100px and under the thread below it.
    // `tests/m59-design.test.ts` reads the rendered order at both widths.
    const workspace = read("src/flow/StationWorkspace.tsx");
    const summary = workspace.slice(
      workspace.indexOf("const summary = ("),
      workspace.indexOf("if (closed !== undefined)"),
    );
    expect(summary).toContain('data-testid="station-answer"');
    // M92 polish: Save answer sits under the summary, beside Cancel.
    expect(summary).toContain("save={saveButton}");
    expect(summary.indexOf('data-testid="station-answer"')).toBeLessThan(summary.indexOf("save={saveButton}"));
    const render = workspace.slice(workspace.lastIndexOf("{conversation}"));
    expect(render).toContain("createPortal(summary, summaryHost)");
  });

  test("the modal baseline is not on this route", () => {
    // Its own copy warns that reading it early costs you the ability to tell
    // convergence from independence. M26c's third argument, untouched.
    expect(workbench).not.toContain("<TwinPanel");
  });
});
