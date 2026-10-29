/**
 * Native view transitions, and the three of them there are (M39, ISC-504).
 *
 * The animation itself cannot be asserted here. happy-dom has no
 * `startViewTransition`, no compositor and no pseudo-elements, so a test that
 * claimed to see a transition run would be a test asserting its own stub. What
 * is asserted is everything around the animation, which is where every failure
 * mode of this feature actually lives:
 *
 *  - the change still happens in a browser without the API, which is the path
 *    happy-dom gives us and therefore the one this file exercises by default
 *  - the DOM change happens *inside* the callback, not before or after it
 *  - reduced motion does not reach the API at all
 *  - exactly one element carries each name, because two kills the transition
 *    with no error and no log
 *  - there are three names in `src/`, and a fourth cannot arrive quietly
 *
 * That the animation is visible is checked in real Chrome through Interceptor,
 * and that is the only honest instrument for it.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { useDom } from "./dom.ts";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  TRANSITION,
  armTransition,
  takeArmedTransition,
  transitionsAvailable,
  withTransition,
} from "../src/ui/transitions.ts";

useDom();

const ROOT = join(import.meta.dir, "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * The globals are the process's, not this file's.
 *
 * `tests/dom.ts` registers happy-dom once into the process globals and every
 * test file shares them, so a stub left behind here decides another file's
 * answer. Worse, so does a *deletion*: the first version of this file deleted
 * `window.matchMedia` in `afterEach` and took six assertions in three other
 * files down with it, because AppShell reads it on mount to fold the rail. What
 * was borrowed is put back, not removed.
 */
const REAL_MATCH_MEDIA = window.matchMedia;

/** The API this environment does not have, added as a property rather than a method. */
function setStartViewTransition(
  stub: ((callback: () => void) => { readonly finished: Promise<void> }) | undefined,
): void {
  if (stub === undefined) {
    delete (document as unknown as Record<string, unknown>).startViewTransition;
    return;
  }
  (document as unknown as Record<string, unknown>).startViewTransition = stub;
}

function startViewTransitionPresent(): boolean {
  return typeof (document as unknown as Record<string, unknown>).startViewTransition === "function";
}

afterEach(() => {
  setStartViewTransition(undefined);
  window.matchMedia = REAL_MATCH_MEDIA;
  document.body.innerHTML = "";
  takeArmedTransition();
});

function stubReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

describe("the change happens, with or without the API", () => {
  test("with no startViewTransition the change still runs, synchronously", () => {
    // The default path in this environment, and the one that matters: a browser
    // without the API must behave exactly as the app did before M39.
    expect(startViewTransitionPresent()).toBe(false);
    let ran = 0;
    withTransition(() => {
      ran += 1;
    });
    expect(ran).toBe(1);
  });

  test("with the API present the change happens inside the callback", () => {
    // The property `flushSync` exists to guarantee. If the change happened
    // before or after the callback, the browser would capture the same DOM twice
    // and animate nothing, silently.
    const order: string[] = [];
    /* Held on an object rather than in a `let`, because TypeScript narrows a
       variable only assigned inside a callback to `never` and then refuses the
       call. */
    const captured: { callback: (() => void) | null } = { callback: null };
    setStartViewTransition((callback: () => void) => {
      order.push("transition-started");
      captured.callback = callback;
      return { finished: Promise.resolve() };
    });
    withTransition(() => order.push("dom-changed"));
    expect(order).toEqual(["transition-started"]);
    captured.callback?.();
    expect(order).toEqual(["transition-started", "dom-changed"]);
  });

  test("a rejected matchMedia does not stop the change", () => {
    // A window whose matchMedia throws, which some embedded views genuinely
    // have. The change must still happen.
    window.matchMedia = (() => {
      throw new Error("no matchMedia here");
    }) as unknown as typeof window.matchMedia;
    let ran = 0;
    withTransition(() => {
      ran += 1;
    });
    expect(ran).toBe(1);
  });
});

describe("reduced motion is answered before the API is touched", () => {
  test("under reduce, startViewTransition is never called", () => {
    stubReducedMotion(true);
    let started = 0;
    setStartViewTransition((callback: () => void) => {
      started += 1;
      callback();
      return { finished: Promise.resolve() };
    });
    let ran = 0;
    withTransition(() => {
      ran += 1;
    });
    expect({ started, ran }).toEqual({ started: 0, ran: 1 });
    expect(transitionsAvailable()).toBe(false);
  });

  test("with no preference and the API present, a transition is available", () => {
    stubReducedMotion(false);
    setStartViewTransition((callback: () => void) => {
      callback();
      return { finished: Promise.resolve() };
    });
    expect(transitionsAvailable()).toBe(true);
  });

  test("the CSS guard covers all three pseudo-elements, and shouts at none of them", () => {
    // Comments stripped first, and read from the last such query: base.css has
    // an older reduced-motion block for the fold marker, and the paragraph above
    // this one explains the ban using the word it forbids.
    const base = read("src/ui/styles/base.css").replace(/\/\*[\s\S]*?\*\//g, " ");
    const block = base.slice(base.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const pseudo of ["::view-transition-group(*)", "::view-transition-old(*)", "::view-transition-new(*)"]) {
      expect(block).toContain(pseudo);
    }
    expect(block).toContain("animation: none");
    // FND-10's ban holds here, and it holds because a UA-origin animation loses
    // to an author rule without any help.
    expect(block).not.toContain("!important");
  });
});

describe("the arming slot has one writer and one reader", () => {
  test("a name armed is read once and the slot is then empty", () => {
    armTransition(TRANSITION.step);
    expect(takeArmedTransition()).toBe(TRANSITION.step);
    expect(takeArmedTransition()).toBeNull();
  });

  test("an unarmed change reads null, so it cannot inherit a name", () => {
    expect(takeArmedTransition()).toBeNull();
  });

  test("the router clears the slot on every hash change, armed or not", () => {
    // The property in words: `takeArmedTransition` is called unconditionally in
    // the listener, before the branch. Asserted on the source because the
    // alternative is a test that drives the browser's own event ordering.
    const routes = read("src/ui/routes.ts");
    const listener = routes.slice(routes.indexOf("const onChange = () => {"));
    const take = listener.indexOf("takeArmedTransition()");
    const branch = listener.indexOf("if (armed === null)");
    expect(take).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(take);
  });
});

describe("one element per name, per frame", () => {
  /* M89: "marking an origin clears the name off anything else wearing it" went
   * with `markTransitionOrigin`, whose one caller was the flag row on Checks. */
  test("the record's name moves between the control and the panel, never sits on both", () => {
    // Asserted on the source, because the two elements live in two files and the
    // failure is that both render the name at once. Each side is conditional on
    // the same one boolean, in opposite directions.
    const shell = read("src/ui/AppShell.tsx");
    const panel = read("src/ui/RecordPanel.tsx");
    expect(shell).toContain("style={recordOpen ? undefined : { viewTransitionName: TRANSITION.record }}");
    expect(panel).toContain("style={open ? { viewTransitionName: TRANSITION.record } : undefined}");
  });

  test("the step's name is on one selector, which renders once per route", () => {
    const design = read("src/ui/styles/design.css");
    const rules = design.split("}").filter((r) => r.includes("view-transition-name"));
    expect(rules.length).toBe(1);
    expect(rules[0]).toContain(".station {");
    expect(rules[0]).toContain(`view-transition-name: ${TRANSITION.step}`);
  });
});

describe("nothing decorative (ISC-504)", () => {
  test("two names, and the table is the only place they are spelled", () => {
    // M89: three until the flag row's `finding` went with the checks.
    expect(Object.values(TRANSITION).length).toBe(2);
    expect(new Set(Object.values(TRANSITION)).size).toBe(2);
  });

  test("every element that wears a name reads it from the table, except the one CSS rule", () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      const rel = file.replace(`${ROOT}/`, "");
      if (rel === "src/ui/transitions.ts") continue;
      const body = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
      for (const name of Object.values(TRANSITION)) {
        // The literal string, rather than the constant, anywhere but the one
        // stylesheet rule that declares the step card's name.
        if (!body.includes(`"${name}"`) && !body.includes(`'${name}'`)) continue;
        offenders.push(`${rel}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("exactly three surfaces carry a view-transition-name", () => {
    // The count is the guard against a fourth transition arriving as a nice
    // touch. Two in TypeScript through `viewTransitionName`, one in CSS.
    const carriers: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      const rel = file.replace(`${ROOT}/`, "");
      if (rel === "src/ui/transitions.ts") continue;
      const body = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
      const count =
        (body.match(/viewTransitionName/g)?.length ?? 0) +
        (body.match(/view-transition-name:/g)?.length ?? 0);
      for (let i = 0; i < count; i += 1) carriers.push(rel);
    }
    expect(carriers.sort()).toEqual([
      "src/ui/AppShell.tsx",
      "src/ui/RecordPanel.tsx",
      "src/ui/styles/design.css",
      // M89: Dialogue.tsx wore `TRANSITION.finding` on the invitation card a
      // finding was taken to; the card went with the Checks tab.
    ]);
  });

  test("the transition helper takes a synchronous change, so nothing can be awaited inside one", () => {
    // A transition follows something that already happened. The signature is
    // what stops a model call, a request or an append being put inside one.
    const source = read("src/ui/transitions.ts");
    expect(source).toContain("export function withTransition(change: () => void): void");
    // Comments stripped, because the paragraph above the function explains the
    // rule using the word it forbids.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("async ");
    expect(code).not.toContain("await ");
  });

  test("the motion tokens are declared and the app reads them by name", () => {
    const tokens = read("src/ui/styles/tokens.css");
    for (const token of ["--motion-fast:", "--motion-move:", "--motion-ease:"]) {
      expect(tokens).toContain(token);
    }
    expect(read("src/ui/styles/base.css")).toContain("var(--motion-move)");
    expect(read("src/ui/styles/base.css")).toContain("var(--motion-ease)");
  });
});
