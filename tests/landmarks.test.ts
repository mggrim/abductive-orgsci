/**
 * Every route exposes a main landmark and a page heading (FND-03).
 *
 * The survey probed all ten routes: eight rendered one `<main>` and one `<h1>`,
 * and /design/context and /design/tension rendered zero of each. Those are the
 * two routes a researcher spends the most time on, and the landmarks they did
 * offer were NAV.appbar, HEADER.workbench-head, ASIDE.standing, NAV.rail and
 * HEADER.station-head, which is a lot of structure and no way in. No route had
 * a skip link at all, so the first tab from the address bar walked three levels
 * of navigation before reaching anything the researcher came for.
 *
 * This is a source census rather than a render, because eight of the nine views
 * mount a ledger context and an IndexedDB handle to say anything at all, and a
 * test that stubs those tests the stubs. It reads the route table out of
 * AppShell and holds every component in it to the same two elements, so a
 * surface builder adding a route inherits the check.
 */

import { describe, expect, test } from "bun:test";

const SRC = new URL("../src/", import.meta.url).pathname;
/**
 * Source with comments stripped. Two of these files explain the defect in a
 * comment that quotes the markup, so a naive substring match reads the prose as
 * the fix. The first version of this file did exactly that and passed.
 */
async function read(rel: string): Promise<string> {
  const raw = await Bun.file(`${SRC}${rel}`).text();
  return raw
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Every component AppShell mounts as a route body, and where it lives. */
const ROUTE_VIEWS: readonly [string, string][] = [
  ["intro", "ui/Introduction.tsx"],
  /* M49, ISC-527. The intro route is one of two surfaces: `FrontPage` mounts the
     walkthrough before a researcher has a study of their own and the long page
     once they have one, so both files have to carry the landmark and exactly one
     of them is on screen at a time. */
  ["intro walkthrough", "ui/Walkthrough.tsx"],
  ["studies", "ui/ProjectList.tsx"],
  ["settings", "auth/AuthPanel.tsx"],
  ["design", "workbench/Workbench.tsx"],
  ["ontology", "ui/ConceptsView.tsx"],
  ["material and exports", "ui/StudyViews.tsx"],
];

/**
 * The five study routes stopped rendering their own `<h1>` at M32 (R3).
 *
 * The heading is not gone and the property is not weakened: it is rendered once
 * by the sticky study header in AppShell, off `STUDY_TAB_LABEL[tab]`, so every
 * study route still has exactly one page heading and it is now impossible for
 * that heading to disagree with the tab the reader clicked. What moved is where
 * the census looks for it. The three app-level routes still carry their own,
 * because there is no study header above them.
 *
 * Four route bodies had it before this and they were the reason to move it: a
 * 22px "Material" over an otherwise empty page, 46px under an underlined
 * "Material" tab, is the most document-like thing the M32 critique measured.
 */
const APP_ROUTE_VIEWS: readonly [string, string][] = [
  ["intro", "ui/Introduction.tsx"],
  ["intro walkthrough", "ui/Walkthrough.tsx"],
  ["studies", "ui/ProjectList.tsx"],
  ["settings", "auth/AuthPanel.tsx"],
];

describe("every route body is a main landmark with a heading", () => {
  test("each one renders <main> and carries the landmark id", async () => {
    const missing: string[] = [];
    for (const [route, file] of ROUTE_VIEWS) {
      const src = await read(file);
      if (!src.includes("<main")) missing.push(`${route} (${file}): no <main>`);
      if (!src.includes("id={MAIN_LANDMARK_ID}")) missing.push(`${route} (${file}): no landmark id`);
    }
    expect(missing).toEqual([]);
  });

  test("every route still has exactly one page heading, wherever it is rendered", async () => {
    // The three app routes carry their own. The five study routes take theirs
    // from the shell's study header, which reads the tab table, and none of
    // them may also render one or the page would have two.
    const missing: string[] = [];
    for (const [route, file] of APP_ROUTE_VIEWS) {
      if (!(await read(file)).includes("<h1")) missing.push(`${route} (${file}): no <h1>`);
    }
    expect(missing).toEqual([]);

    const shell = await read("ui/AppShell.tsx");
    expect(shell).toContain("<h1>{STUDY_TAB_LABEL[tab]}</h1>");

    const doubled: string[] = [];
    for (const [route, file] of ROUTE_VIEWS) {
      if (APP_ROUTE_VIEWS.some(([, f]) => f === file)) continue;
      if ((await read(file)).includes("<h1")) doubled.push(`${route} (${file}): a second <h1>`);
    }
    expect(doubled).toEqual([]);
  });

  test("the landmark is focusable, or the skip link lands nowhere", async () => {
    const offenders: string[] = [];
    for (const [route, file] of ROUTE_VIEWS) {
      const src = await read(file);
      for (const m of src.matchAll(/<main[\s\S]*?>/g)) {
        if (!m[0].includes("tabIndex={-1}")) offenders.push(`${route} (${file}): ${m[0].slice(0, 40)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("Anti: the census would notice a view that dropped its main", async () => {
    // The guard on the guard. If ROUTE_VIEWS ever stops naming the file that
    // had the defect, this file passes while saying nothing.
    expect(ROUTE_VIEWS.map(([, f]) => f)).toContain("workbench/Workbench.tsx");
    expect((await read("workbench/Workbench.tsx")).includes("<main")).toBe(true);
  });
});

describe("the skip link exists and cannot navigate the router", () => {
  test("the shell renders it as the first control, before the rail", async () => {
    // M32, R2: `.appbar` became `.navrail`. Same property, same reason: the
    // first tab from the address bar must reach the page's content before it
    // walks three levels of navigation.
    const shell = await read("ui/AppShell.tsx");
    const skip = shell.indexOf('className="skip-link"');
    const rail = shell.indexOf('className="navrail"');
    expect(skip).toBeGreaterThan(-1);
    expect(rail).toBeGreaterThan(-1);
    expect(skip).toBeLessThan(rail);
  });

  test("it is a button and not an anchor, because the router reads the hash", async () => {
    // An <a href="#main-landmark"> would be parsed by parseHash as a route and
    // would navigate the app away from the page it was meant to skip into. The
    // fix is a focus move, so the control has to be a button.
    const shell = await read("ui/AppShell.tsx");
    expect(shell).toContain('<button type="button" className="skip-link"');
    expect(shell).not.toContain('href="#main');
  });

  test("the stylesheet keeps it out of the way until it is focused", async () => {
    const css = await Bun.file(`${SRC}ui/styles/base.css`).text();
    expect(css).toContain(".skip-link {");
    expect(css).toContain(".skip-link:focus {");
    // And the landing target rings on :focus-visible since M53 (ISC-544). Plain
    // :focus also rang on a pointer press anywhere blank on a page, which was the
    // owner's black border round every slide. Measured in Chrome: after Enter on
    // the skip link, <main> matches :focus-visible and draws the 2px ring.
    expect(css).toContain("main:focus-visible {");
    expect(css).not.toContain("main:focus {");
  });
});
