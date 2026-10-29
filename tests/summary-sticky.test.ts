/**
 * The pane beside the step sticks under the study bar (M47; the summary since
 * M59, ISC-573, when the companion that first held it went).
 *
 * The owner, on the demo of 2026-09-13: "you need to use more of the available
 * space. look at the unutilized space in the different stations." Measured on
 * main at 1480x853 on the shipped example, the right track held one 682px
 * companion beside a 2,798px station pane, so 2,116px of the right half of the
 * window was blank from the moment the reader scrolled past the companion's end,
 * which is where the step's own answer box sits.
 *
 * M37 is not reopened. The conversation stays inside the step's card and
 * `tests/design-panes.test.ts` still holds that order. What changes is the pane
 * beside it: it sticks under the study bar and takes the rest of the scroller's
 * visible height, so the track is full wherever the step is.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { useDom } from "./dom.ts";


useDom();

const PROJECT = "study-m47";
const ROOT = `${import.meta.dir}/../src/`;
const read = async (path: string) => await Bun.file(`${ROOT}${path}`).text();

/**
 * This file's own store, rather than the process's.
 *
 * The process is shared by every test file and `localStorage` is a global, so by
 * the time this file runs another file has replaced it with a recording stub
 * (tests/auth.test.ts) or with a getter that throws (tests/design-panes.test.ts),
 * neither of which is put back. Both are right about what they are testing and
 * neither is this file's business, so this file installs a working store of its
 * own before every test and asserts against that. It is the same shape the
 * browser gives and it is the only global these tests touch.
 */
function inMemoryStorage(): Storage {
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
  } as Storage;
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: inMemoryStorage(),
  });
});

describe("the pane sticks beside the step", () => {
  test("the rule is in the two-pane branch and nowhere else (M59: the summary pane)", async () => {
    const css = await read("ui/styles/design.css");
    const rule =
      /@media \(min-width: 1101px\) \{\s*\.workbench-body\[data-panes="two"\] \.summary-pane \{[^}]*\}/s.exec(
        css,
      )?.[0] ?? "";
    expect(rule).toContain("position: sticky");
    expect(rule).toContain("top: var(--summary-top, 0px)");
    expect(rule).toContain("max-height: var(--summary-h, 80vh)");
    // Below 1100px the summary sits under the thread, and a sticky block in a
    // single column would pin the step's own content off screen.
    expect(/\n\.summary-pane \{[^}]*position: sticky/s.test(css)).toBe(false);
    expect(/\n\.summary-pane \{[^}]*overflow-y: auto/s.test(css)).toBe(true);
  });

  test("a long summary scrolls in its box, so the save row stays beside the thread", async () => {
    // Measured on the shipped example at 1480x898 (M59): uncapped, the box grew
    // to 795px and put "Save answer" 300px under the pane's fold.
    const css = await read("ui/styles/design.css");
    const rule =
      /\.workbench-body\[data-panes="two"\] \.summary-pane \.station-answer textarea \{[^}]*\}/s.exec(css)?.[0] ?? "";
    expect(rule).toContain("max-height: 50vh");
    expect(rule).toContain("overflow-y: auto");
  });

  test("both numbers are measured rather than declared", async () => {
    /* The framing dock's height is written inline on the dock element by
     * FramingBand, so no rule on this pane can read it, and a literal would be
     * wrong the moment the dock opens, is dragged or closes. The study bar is
     * the same story one row up: it gains a row when a question is outstanding.
     * `.shell-content` already has the dock subtracted, because the dock is the
     * shell grid's second row and the scroller is the first. */
    const src = await read("workbench/Workbench.tsx");
    expect(src).toContain('"--summary-top": `${chrome.top}px`');
    expect(src).toContain('"--summary-h": `${chrome.height}px`');
    expect(src).toContain('body.closest(".shell-content")');
    expect(src).toContain('scroller.querySelector(".studybar")');
    expect(src).toContain("scroller.clientHeight - top");
  });

  test("one watcher since the dock went (M53), and it is taken down with the effect", async () => {
    /* The MutationObserver on the framing dock existed because the dock changed
     * this scroller's height by attribute rather than by resize. The dock is a tab
     * now (ISC-540), so nothing outside the scroller moves its height while the
     * reader looks at it, and the observer went with it. */
    const src = await read("workbench/Workbench.tsx");
    expect(src).not.toContain("new MutationObserver(measure)");
    expect(src).not.toContain('.querySelector(".framing")');
    // And the resize path stays, for the window and the rail.
    expect(src).toContain("new ResizeObserver(measure)");
    expect(src).toContain('window.addEventListener("resize", measure)');
    // Every watcher is taken down with the effect.
    expect(src).toContain("sizes.disconnect();");
    expect(src).toContain('window.removeEventListener("resize", measure)');
  });

  test("M37 is not reopened: the conversation is still the step's", async () => {
    // The pressure this change was under is the one design-panes.test.ts names,
    // and nothing here moves the conversation across the divider.
    const src = await read("workbench/Workbench.tsx");
    expect(src).toContain("<Dialogue");
    const station = src.indexOf("<StationWorkspace");
    const dialogue = src.indexOf("<Dialogue");
    expect(station).toBeLessThan(dialogue);
    // M59, ISC-572: the companion went, so nothing is drawn beside the step.
    expect(src).not.toContain("<DesignCompanion");
  });
});
