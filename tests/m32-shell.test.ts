/**
 * M32: an application, not a website.
 *
 * The owner, verbatim: "The pages are visually unappealing. It looks like a
 * website with a bunch of rows and columns. It should look like an application
 * not a website. Also the front page needs more images created by the Art
 * skill."
 *
 * The critique behind the rulings named five causes, and this file holds the
 * shell half of the answer to each. They are source-text and pure-function
 * checks, in the shape this repo already uses for layout: eight of the nine
 * views mount a ledger context and an IndexedDB handle to render anything at
 * all, so a test that stubs those tests the stubs, and geometry cannot be
 * asserted from here at all. What can be asserted is the structure that
 * produces the geometry, and the words, which is where the risk actually is.
 *
 *   R1  the frame        a full-viewport grid, not a centred article column
 *   R2  the rail         the masthead, turned through ninety degrees
 *   R3  the study header sticky, with the route's own heading in it
 *   R4  the tokens       a hover surface, a selected surface, a micro step
 *   R5  the panels       prose stops sizing layout
 *   R6  the ledes        out of four page bodies, into popovers, verbatim
 *   R7  the buttons      one filled primary per surface
 *   R11 the next bar     sticky at the foot of the cell
 *   R12 the keyboard     the chord chip and the rail's hints
 *   R13 the front page   six image slots that render nothing when absent
 *
 * The copy bar is the thing most at risk in a visual pass, because moving a
 * sentence and shortening it look identical in a diff. So the six moved
 * sentences are counted rather than merely found: each has to appear exactly
 * once across the whole of `src/`, in its new home.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";

const SRC = new URL("../src/", import.meta.url).pathname;

/** A stylesheet, with comments gone so prose about a rule is never the rule. */
async function sheet(name: string): Promise<string> {
  const css = await Bun.file(`${SRC}ui/styles/${name}`).text();
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Source with comments stripped.
 *
 * Every file in this repo explains its own defects in comments that quote the
 * markup they replaced, so a naive substring match reads the reasoning as the
 * fix. landmarks.test.ts learned this the hard way: its first version did
 * exactly that and passed.
 */
async function code(rel: string): Promise<string> {
  const raw = await Bun.file(`${SRC}${rel}`).text();
  return raw
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Every .tsx under src/, comments stripped, with its path. */
async function markup(): Promise<readonly { path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  for await (const rel of new Glob("**/*.tsx").scan(SRC)) {
    out.push({ path: rel, text: await code(rel) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const MARKUP = await markup();
const SHELL_CSS = await sheet("shell.css");
const RAIL_CSS = await sheet("rail.css");
const PANELS_CSS = await sheet("panels.css");
const TOKENS_CSS = await sheet("tokens.css");
const APPSHELL = await code("ui/AppShell.tsx");
const INTRO = await code("ui/Introduction.tsx");

test("the scan found the files it is about to make claims about", () => {
  // Vacuity guard. Every assertion below reads one of these, and an empty
  // string satisfies a `not.toContain` for the wrong reason.
  expect(MARKUP.length).toBeGreaterThan(20);
  expect(SHELL_CSS.length).toBeGreaterThan(500);
  expect(RAIL_CSS.length).toBeGreaterThan(500);
  expect(PANELS_CSS.length).toBeGreaterThan(500);
  expect(APPSHELL.length).toBeGreaterThan(500);
  expect(INTRO.length).toBeGreaterThan(500);
});

// ---------------------------------------------------------------------------

describe("R1: the frame is the viewport, not a centred article column", () => {
  test(".shell is a two-column grid at the window's height, one row since the dock went (M53)", () => {
    // `max-width: var(--frame-max); margin: 0 auto` is what put a 1120px
    // article column in the middle of a 1440px window, left Material a 450px
    // prose strip with 650px of blank paper beside it, and ended /settings in a
    // hard horizontal edge with raw white below it.
    const rule = /\.shell \{[^}]*\}/.exec(SHELL_CSS)?.[0] ?? "";
    expect(rule).toContain("display: grid");
    expect(rule).toContain("grid-template-columns: var(--rail-w) minmax(0, 1fr)");
    expect(rule).toContain("height: 100dvh");
    expect(rule).toContain("overflow: hidden");
    expect(rule).not.toContain("max-width");
    expect(rule).not.toContain("margin: 0 auto");
    /* M41. Two rows as well as two columns, for the framing dock the owner asked
     * for: "a bar just like the menu bar at the left but as a footer bar that is
     * always present, expandable and collapsible."
     *
     * `minmax(0, 1fr) auto` and not `1fr auto`. The `0` floor is what makes an
     * expanded dock shrink the content cell rather than push itself off the bottom
     * of a window the frame is not allowed to grow past: a `1fr` track takes an
     * `auto` minimum, which is the workbench's whole content height. */
    /* M53, ISC-540. The dock is a tab now, so the second row went with it. The `0`
     * floor stays: it keeps the content cell from growing past the window. */
    expect(rule).toContain("grid-template-rows: minmax(0, 1fr);");
    // The rail is still the full-height left edge.
    expect(/\.navrail \{[^}]*\}/.exec(RAIL_CSS)?.[0] ?? "").toContain("grid-row: 1 / -1");
  });

  test("the content cell owns the scroll, which is what everything sticky needs", () => {
    // A sticky study header, a sticky panel sub-header and a sticky next-step
    // bar are all one property: exactly one box on this side of the app
    // scrolls, and each of them is alone at an edge of it.
    const rule = /\.shell-content \{[^}]*\}/.exec(SHELL_CSS)?.[0] ?? "";
    expect(rule).toContain("overflow-y: auto");
    expect(rule).toContain("min-width: 0");
  });

  test("the collapsed rail is one attribute, read in one place", () => {
    // The toggle and the breakpoint have to agree about the same fact, or the
    // rail folds itself back open when the window is resized under a
    // researcher who folded it.
    expect(SHELL_CSS).toContain('.shell[data-rail="collapsed"]');
    expect(SHELL_CSS).toContain("grid-template-columns: var(--rail-w-collapsed) minmax(0, 1fr)");
    expect(APPSHELL).toContain('data-rail={railCollapsed ? "collapsed" : "open"}');
  });

  test("--frame-max survives with a narrower job: reading, and nothing else", () => {
    // R1 keeps the token and re-scopes it. It is not deleted, because a run of
    // reading still does not want a 1440px line.
    expect(TOKENS_CSS).toContain("--frame-max:");
    expect(SHELL_CSS).toContain(".shell-body > .intro");
    expect(SHELL_CSS).toContain(".shell-body > .auth-panel");
  });
});

// ---------------------------------------------------------------------------

describe("R2: the rail", () => {
  test("it renders the masthead's three items and the two a rail adds", () => {
    expect(APPSHELL).toContain('className="navrail"');
    // The three that were the app bar.
    expect(APPSHELL).toContain("Abductive");
    expect(APPSHELL).toContain("Studies");
    expect(APPSHELL).toContain("Model access");
    /* The list of studies, which is also the switcher. M32c, fix 3: a
     * `<select>` labelled "Study" sat directly above a list of the same eight
     * studies, two controls doing one job, and the select was the worse of the
     * two: it clipped mid-word because `text-overflow` does not apply to a
     * `<select>`, and it could not carry the chip that is the only reason to
     * look at this list rather than at the tab bar. The full picker lives on
     * the studies table, which is what that screen is for. */
    expect(APPSHELL).toContain('className="navrail-studies"');
    expect(APPSHELL).not.toContain('className="navrail-pick"');
    expect(APPSHELL).not.toContain("<select");
    // With the state the studies table already shows, off the same projection.
    expect(APPSHELL).toContain("studyState({ project: s");
    expect(APPSHELL).toContain('<StatusChip label="Open question" tone="accent" />');
  });

  test("every string in the rail is one the app already rendered", async () => {
    // R2's constraint, and the whole reason no copy pass was needed for the
    // rail: each of these appears somewhere else in the product, so none of
    // them is new copy arriving under cover of a layout change. The fold
    // control is the exception and is checked on its own below.
    const elsewhere = MARKUP.filter((f) => f.path !== "ui/AppShell.tsx")
      .map((f) => f.text)
      .join("\n");
    for (const phrase of ["Abductive", "Projects", "Model access", "Open question"]) {
      expect({ phrase, found: elsewhere.includes(phrase) }).toEqual({ phrase, found: true });
    }
  });

  test("the fold control is the one new string, and it names what it does", () => {
    // The only copy this build adds. Three words, the reader's own verb first,
    // imperative, present tense, no nominalisation, no term of art: the copy
    // bar's C1 through C8 with nothing to argue about.
    expect(APPSHELL).toContain('aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}');
    expect(APPSHELL).toContain('className="navrail-toggle"');
    expect(APPSHELL).toContain("aria-expanded={!collapsed}");
  });

  test("it folds below 1180 and the folded state hides text rather than squeezing it", () => {
    expect(APPSHELL).toContain('"(max-width: 1179px)"');
    // 56px holds one 32px control and its padding. Anything that is a run of
    // text is unmounted from view rather than truncated, so a folded rail costs
    // no tab stops and reads nothing to a screen reader.
    for (const hidden of [
      ".navrail-name",
      ".navrail-head",
      ".navrail-settingsname",
    ]) {
      expect({ hidden, folds: RAIL_CSS.includes(`.shell[data-rail="collapsed"] ${hidden}`) }).toEqual(
        { hidden, folds: true },
      );
    }
    /* M32c, fix 3. The list is the exception: it survives the fold and its rows
     * become initials. It used to go with everything else, so a folded rail was
     * a wordmark, a settings link and nothing in between, with no way to see
     * which study was open or reach another without unfolding first. */
    expect(RAIL_CSS).toContain('.shell[data-rail="collapsed"] .navrail-studytitle');
    expect(RAIL_CSS).toContain('.shell[data-rail="collapsed"] .navrail-initial');
    expect(RAIL_CSS).not.toContain('.shell[data-rail="collapsed"] .navrail-studies');
    // Derived from the title rather than written down, so the letter and the
    // name beside it cannot disagree, and the full name is on the row.
    expect(APPSHELL).toContain('s.title.trim().slice(0, 1).toUpperCase()');
    expect(APPSHELL).toContain("title={s.title}");
  });

  test("the rail reads the hover and selected surfaces R4 added", () => {
    // The point of the two tokens: a row that does not change under the pointer
    // and a row that cannot look chosen are what make an interface read as
    // printed matter.
    expect(RAIL_CSS).toContain("background: var(--surface-hover)");
    expect(RAIL_CSS).toContain("background: var(--surface-selected)");
  });
});

// ---------------------------------------------------------------------------

describe("R3: the study header", () => {
  test("it is sticky at the top of the cell that scrolls", () => {
    const rule = /\.studybar \{[^}]*\}/.exec(SHELL_CSS)?.[0] ?? "";
    expect(rule).toContain("position: sticky");
    expect(rule).toContain("top: 0");
    // Opaque, or the page slides visibly under the bar's own text.
    expect(rule).toContain("background: var(--paper)");
  });

  test("the row is 56px and carries the name, the question and the actions", () => {
    const head = /\.studybar-head \{[^}]*\}/.exec(SHELL_CSS)?.[0] ?? "";
    expect(head).toContain("min-height: 56px");
    expect(APPSHELL).toContain('className="studybar-name"');
    expect(APPSHELL).toContain('className="studybar-rq"');
    expect(APPSHELL).toContain('className="studybar-actions"');
  });

  test("the route heading is rendered here, off the tab table", () => {
    // Stronger than the four typed strings it replaces: the heading cannot
    // drift from the label of the tab the reader just clicked, because it is
    // that label.
    expect(APPSHELL).toContain("<h1>{STUDY_TAB_LABEL[tab]}</h1>");
    const h1 = /\.studybar h1 \{[^}]*\}/.exec(SHELL_CSS)?.[0] ?? "";
    expect(h1).toContain("font-size: var(--text-title)");
    expect(h1).not.toContain("--text-head");
  });

  test("the five tabs are segmented controls, the starting point first (M53)", async () => {
    const { STUDY_TABS, STUDY_TAB_LABEL } = await import("../src/ui/routes.ts");
    expect([...STUDY_TABS]).toEqual(["motivation", "design", "material", "ontology", "exports"]);
    expect(STUDY_TABS.map((t) => STUDY_TAB_LABEL[t])).toEqual([
      "Starting point",
      "Design",
      "Sources",
      // M63, ISC-609: the owner's three words.
      "Emerging project ontology",
      "Export",
    ]);
    // A 32px track with a filled active cell, replacing a 2px underline: the
    // idiom of a switch rather than of a site's section nav.
    const tab = /\.studybar-tabs a \{[^}]*\}/.exec(SHELL_CSS)?.[0] ?? "";
    expect(tab).toContain("min-height: 32px");
    expect(tab).toContain("border-radius: var(--radius-control)");
    expect(tab).toContain("font-size: var(--text-small)");
    const current = /\.studybar-tabs a\[data-current="true"\] \{[^}]*\}/.exec(SHELL_CSS)?.[0] ?? "";
    expect(current).toContain("background: var(--accent)");
    expect(current).toContain("color: var(--ink-inverse)");
  });
});

// ---------------------------------------------------------------------------

describe("R4: the three tokens the app had no name for", () => {
  test("they are declared, and in the token file, which is the only one allowed a value", () => {
    expect(TOKENS_CSS).toContain("--surface-hover: #f2f4f7");
    expect(TOKENS_CSS).toContain("--surface-selected: #e9edf3");
    expect(TOKENS_CSS).toContain("--text-micro: 0.6875rem");
    expect(TOKENS_CSS).toContain("--rail-w: 224px");
    expect(TOKENS_CSS).toContain("--rail-w-collapsed: 56px");
  });

  test("each of them is read by a rule, so none is a name with no consumer", async () => {
    const all = (
      await Promise.all(
        [
          "base.css",
          "biases.css",
          "components.css",
          "design.css",
          "exports.css",
          "instrumentation.css",
          "intro.css",
          "search.css",
          "material.css",
          "ontology.css",
          "panels.css",
          "rail.css",
          "shell.css",
        ].map(sheet),
      )
    ).join("\n");
    for (const token of ["--surface-hover", "--surface-selected", "--text-micro", "--rail-w"]) {
      expect({ token, read: all.includes(`var(${token})`) }).toEqual({ token, read: true });
    }
  });

  test("the micro step carries tracking, which is what makes it a register", () => {
    // 11px next to 13px is a small caption. 11px with 0.06em of tracking, upper
    // case, is a different thing on the page, which is the register the app had
    // no step for: a pane's name and a column's label.
    expect(PANELS_CSS).toMatch(/\.panel-title \{[^}]*font-size: var\(--text-micro\)/s);
    expect(PANELS_CSS).toMatch(/\.panel-title \{[^}]*letter-spacing: 0\.06em/s);
  });

  test("the seven page hues and the origin encoding are untouched", () => {
    // R4's other half. The achromatic chrome plus seven page hues is the one
    // thing in the app the critique calls a genuinely good system, and a visual
    // pass is exactly when a palette gets spent by accident.
    for (const hue of [
      "--page-puzzle",
      "--page-theory",
      "--page-observation",
      "--page-analytic-residue",
      "--page-candidate-resolution",
      "--page-rival",
      "--page-scope-condition",
    ]) {
      expect({ hue, kept: TOKENS_CSS.includes(`${hue}:`) }).toEqual({ hue, kept: true });
    }
    expect(TOKENS_CSS).toContain("--origin-fill-yours: 1");
    expect(TOKENS_CSS).toContain("--origin-fill-data: 0.45");
    expect(TOKENS_CSS).toContain("--origin-fill-model: 0");
  });
});

// ---------------------------------------------------------------------------

describe("R5: prose stops sizing layout", () => {
  test("the three regions exist and each one scrolls on its own", () => {
    expect(PANELS_CSS).toContain(".panel-list");
    expect(PANELS_CSS).toContain(".panel-main");
    expect(PANELS_CSS).toContain(".panel-side");
    const body = /\.panel-body \{[^}]*\}/.exec(PANELS_CSS)?.[0] ?? "";
    expect(body).toContain("overflow-y: auto");
    // `min-height: 0` is the declaration that makes a flex child scroll instead
    // of pushing its pane past the frame, and the one nothing gets by default.
    expect(body).toContain("min-height: 0");
  });

  test("the widths are the grammar's, and no pane is sized by a measure", () => {
    expect(PANELS_CSS).toContain("minmax(320px, 360px) minmax(0, 1fr)");
    expect(PANELS_CSS).toContain("minmax(0, 1fr) 320px");
    // The inversion this ruling fixes: `--measure*` applies to text elements
    // only. A layout container reading one is what left 650px of blank paper
    // beside Material.
    const layout = /\.panel-(?:list|main|side|frame) \{[^}]*\}/g;
    for (const rule of PANELS_CSS.match(layout) ?? []) {
      expect({ rule: rule.slice(0, 24), measure: /var\(--measure/.test(rule) }).toEqual({
        rule: rule.slice(0, 24),
        measure: false,
      });
    }
  });

  test("the grammar is live at 1024 with the rail folded, and inert below that", () => {
    // The build was told the rail and the panes must work at 1024 wide with the
    // rail collapsed. A 1024 viewport folds the rail to 56px, which leaves a
    // 968px cell and 936px inside its gutters: a 320px list, a 16px gap and a
    // 600px main. Held at the app's usual 1100 the grammar would have been
    // inert at exactly that width, so this breakpoint is the one that differs,
    // on purpose, and the reason is written at the rule.
    expect(PANELS_CSS).toMatch(/@media \(min-width: 1000px\) \{[\s\S]*data-panels/);
    expect(PANELS_CSS).not.toContain("@media (min-width: 1100px)");
  });

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("all three study routes lay themselves out with it", async () => {
    const views = {
      "material and exports": await code("ui/StudyViews.tsx"),
      "your model": await code("ui/ConceptsView.tsx"),
      exports: await code("workbench/ExportBar.tsx"),
    };
    for (const [route, src] of Object.entries(views)) {
      expect({ route, framed: src.includes("panel-frame") }).toEqual({ route, framed: true });
    }
  });
});

// ---------------------------------------------------------------------------

/**
 * The six sentences that left four page bodies (R6).
 *
 * Each one is checked twice over: that it still exists exactly once anywhere in
 * `src/`, so a move cannot quietly become a trim or a duplication, and that the
 * file it lives in now renders it inside a `RouteHelp`. The words are the
 * contract. This is a visual pass.
 */
describe("R6: the route ledes moved and none of them lost a word", () => {
  const LEDES: readonly { readonly file: string; readonly text: string }[] = [
    {
      file: "workbench/Workbench.tsx",
      text: "Your answers here shape every question Abductive asks you and every check it runs.",
    },
    {
      file: "ui/StudyViews.tsx",
      text: "Your data grounds the claims in your model. At the Early data step, Abductive reads your data to suggest more claims.",
    },
    {
      file: "ui/StudyViews.tsx",
      text: "Everything you're building this project on. You can see which passages you have opened and which you haven't.",
    },
    {
      file: "ui/StudyViews.tsx",
      text: "Export your project. Every file comes from History, so every file matches the screen.",
    },
    {
      file: "ui/ConceptsView.tsx",
      text: "Your answers and data build your model. Every check reads your model.",
    },
  ];

  /* M62, ISC-600: the popovers are gone. Each lede left its page again, into
   * that page's Help panel (ui/pageHelp.ts), where "here" and "this tab" name
   * the page; tests/m62-help.test.ts lists every sentence and its words there. */
  test("no lede is on its page any more", () => {
    const offenders = LEDES.filter(({ file, text }) =>
      (MARKUP.find((f) => f.path === file)?.text.replace(/\s+/g, " ") ?? "").includes(text),
    );
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  test("no study route body still opens with an h1 and a lede", async () => {
    // What the reader gets back is the top of the screen: four pages spent
    // their first 200px on explanatory prose.
    for (const file of [
      "workbench/Workbench.tsx",
      "ui/StudyViews.tsx",
      "ui/ConceptsView.tsx",
    ]) {
      const src = await code(file);
      expect({ file, h1: src.includes("<h1") }).toEqual({ file, h1: false });
      expect({ file, lede: src.includes('className="studyview-lede"') }).toEqual({
        file,
        lede: false,
      });
    }
  });

  /* M62, ISC-600: the "?" is one native button per page now, named for what it
   * opens (tests/m62-help.test.ts drives it by keyboard). */
  test("the page's Help control is a button a screen reader can name", async () => {
    const help = await code("ui/HelpControl.tsx");
    expect(help).toContain('aria-label="Help for this page"');
    expect(help).toContain('type="button"');
  });
});

// ---------------------------------------------------------------------------

describe("R7: one filled primary per surface", () => {
  test("Exports has exactly one, and the other six controls are the outlined default", async () => {
    // Five visually identical "Download" buttons is the same as no primary.
    const bar = await code("workbench/ExportBar.tsx");
    expect(bar.split("primary: true").length - 1).toBe(1);
    expect(bar).toContain('className={row.primary === true ? "primary" : undefined}');
  });

  test("an anchor wearing the primary role gets the whole role", async () => {
    // `.btn-primary` alone gives the fill and the inverse ink; the padding, the
    // radius and the border come from `button, .btn`, and an anchor is neither.
    // Two of the app's three primaries were anchors and both rendered as
    // underlined white text on a dark slab with no edges.
    for (const file of ["workbench/NextBar.tsx"]) {
      const src = await code(file);
      expect({ file, whole: src.includes('"btn btn-primary"') }).toEqual({ file, whole: true });
    }
    const base = await sheet("base.css");
    expect(base).toMatch(/button,\s*\.btn \{[^}]*text-decoration: none/s);
  });

  test("Design's three stacked links are one control and two status rows", async () => {
    // One action and two counts, all three drawn as underlined links, is the
    // defect the critique calls "actions are hyperlinks, not controls". Same
    // strings, same order, same destinations, three weights instead of one.
    const band = await code("flow/FramingBand.tsx");
    expect(band).toContain('<a className="btn" href={framingPapersHref(project.id)}');
    expect(band.split('className="small framing-papers-status"').length - 1).toBe(2);
    expect(band).not.toContain('className="small framing-papers-link"');
    const design = await sheet("design.css");
    expect(design).toMatch(/\.framing-papers-status a \{[^}]*text-decoration: none/s);
  });
});

// ---------------------------------------------------------------------------

describe("R11 and R12: the next step, and Search without a shortcut", () => {
  test("the next bar is a row in the standing header, and keeps its content", async () => {
    // M32 made the app's one persistent "what now" sticky at the foot, because
    // it had been an inline element at the foot of a 4,082px document. On
    // 2026-09-12 the owner gave the foot to the framing fold, so the bar is the
    // standing header's first row: the header already printed its sentence, and
    // now the control sits beside it. The header draws the box, so the bar
    // draws none, and it no longer sticks anywhere.
    const design = await sheet("design.css");
    const rule = /\.nextbar \{[^}]*\}/.exec(design)?.[0] ?? "";
    expect(rule).not.toContain("position: sticky");
    expect(rule).not.toContain("background:");
    expect(rule).toContain("display: flex");
    const standing = /\.standing \{[^}]*\}/.exec(design)?.[0] ?? "";
    expect(standing).toContain("background: var(--notice-fill)");
    const header = await code("workbench/OutstandingBar.tsx");
    expect(header).toContain("<NextBar projectId={projectId} step={step} />");
    // R11: the content, the strings and the order are untouched.
    const bar = await code("workbench/NextBar.tsx");
    expect(bar).toContain('className="nextbar"');
    expect(bar).toContain('<span data-testid="next-sentence">{step.sentence}</span>');
  });

  /* M96, ISC-794 (the owner, 2026-10-30): "the keyboard shortcuts should be
   * eliminated". The chip became a plain Search button that opens the search
   * dialog itself, and the rail's foot carries no key hints. */
  test("Search is a plain button, and the rail's foot prints no key hint", () => {
    expect(APPSHELL).toContain('className="studybar-search"');
    expect(APPSHELL).toContain("<StudySearch ");
    expect(APPSHELL).not.toContain("KeyboardEvent(");
    expect(APPSHELL).not.toContain("navrail-hint");
    expect(RAIL_CSS).not.toContain(".navrail-hint");
  });
});

// ---------------------------------------------------------------------------

/**
 * The six fixes from the owner's live look at 1449 (M32b).
 *
 * Every one of these is a defect that only exists once two correct pieces are
 * put together, which is why none of them was caught by the build that made
 * each piece. They are held here as properties rather than as instances, so the
 * next thing added beside them cannot bring the same shape back.
 */
describe("M32b: what the live look at 1449 found", () => {
  test("fix 1: the next step's control cannot be broken by the sentence beside it", async () => {
    // An anchor is an inline box and fragments across lines like the words
    // around it, which is exactly why the inline controls in this app are
    // anchors. Once this one wore `btn btn-primary` it fragmented with its own
    // background: "Open Export" broke after "your" and the second half
    // rendered as a separate dark slab under the sentence, overlapping it.
    const design = await sheet("design.css");
    const bar = /\.nextbar \{[^}]*\}/.exec(design)?.[0] ?? "";
    expect(bar).toContain("display: flex");
    const line = /\.nextbar-line \{[^}]*\}/.exec(design)?.[0] ?? "";
    expect(line).toContain("flex: 1 1 auto");
    // `min-width: 0`, or a flex item's automatic minimum is its longest word
    // run and the row pushes the control off the end instead of wrapping.
    expect(line).toContain("min-width: 0");
    const action = /\.nextbar-action \{[^}]*\}/.exec(design)?.[0] ?? "";
    expect(action).toContain("flex: none");
    expect(action).toContain("white-space: nowrap");
    // And the control is a sibling of the sentence rather than a word inside
    // it, which is the half no amount of CSS on the old markup could reach.
    const src = await code("workbench/NextBar.tsx");
    const sentence = src.indexOf('<span data-testid="next-sentence">{step.sentence}</span>');
    const closes = src.indexOf("</p>", sentence);
    const control = src.indexOf('data-testid="next-action"');
    expect(sentence).toBeGreaterThan(0);
    expect(control).toBeGreaterThan(closes);
  });

  test("fix 2: no pane carries a bar that exists only to hold the help chip", async () => {
    // A sunken 32px band holding one 20px control and a spacer reads as a strip
    // of empty chrome above the content, on three of the four panes that carry
    // a route lede. The chip is anchored to the pane's own corner now.
    const panels = await sheet("panels.css");
    // M62, ISC-600: the pane chip is gone, so no pane carries one, and no pane
    // needs a bar to hold it.
    expect(panels).not.toContain(".panel-help {");
    // The pane, not the body: the body is the scroll container, so a popover
    // opened from inside it would be clipped by its own overflow.
    expect(panels).toMatch(/\.panel-list,\s*\.panel-main,\s*\.panel-side \{[^}]*position: relative/s);
    expect(panels).not.toContain(".panel-headspacer");
    // The heading, not the whole section: each helped pane opens with one
    // section that is all of its content, so padding that would spend 32px down
    // the full height of a 320px pane.
    expect(panels).not.toContain(".panel-body-helped");
    for (const [surface, file] of [
      ["material", "ui/StudyViews.tsx"],
      ["your model", "ui/ConceptsView.tsx"],
      ["exports", "workbench/ExportBar.tsx"],
    ] as const) {
      const src = await code(file);
      expect({ surface, chip: src.includes('className="panel-help"') }).toEqual({
        surface,
        chip: false,
      });
      expect({ surface, spacer: src.includes("panel-headspacer") }).toEqual({
        surface,
        spacer: false,
      });
      // The chip is out of the flow, so the heading it sits beside leaves room
      // for it rather than running underneath.
      expect({ surface, room: src.includes("panel-body-helped") }).toEqual({
        surface,
        room: false,
      });
    }
    // The one head that survives is the one with something in it.
    const bar = await code("workbench/ExportBar.tsx");
    expect(bar).toContain('<h2 className="export-receipt-title panel-title">Export receipt</h2>');
  });

  test("fix 3: the origin legend carries its own ground over the photograph", async () => {
    // It reads --hero-ink-faint, written for the hero's flat gradient slab. R13
    // put a photograph behind the hero and the copy's scrim covers only the
    // left 40%, because the right is where the picture is visible, which is
    // where this legend sits. It is the one thing on the front page that
    // teaches the origin encoding, so it has to hold against any image.
    const intro = await sheet("intro.css");
    const legend = /\.hero-legend \{[^}]*\}/.exec(intro)?.[0] ?? "";
    expect(legend).toContain("background: var(--hero-ground-top)");
    // The same value the copy's scrim uses, so the two treatments are one
    // decision rather than two greys.
    expect(intro).toMatch(/\.intro-scrim \{[^}]*var\(--hero-ground-top\)/s);
  });

  test("fix 4: a study name in the rail gets two lines, not twenty characters", async () => {
    // 224px minus padding is about twenty characters at 13px, so every row read
    // "Night handovers on an acut…" and the list could not do the one thing it
    // exists for. Studies here are named in sentences.
    const rail = await sheet("rail.css");
    const title = /\.navrail-studytitle \{[^}]*\}/.exec(rail)?.[0] ?? "";
    expect(title).toContain("-webkit-line-clamp: 2");
    expect(title).not.toContain("white-space: nowrap");
    // Clamped rather than free: a rail whose rows are one, four and two lines
    // tall stops scanning as a list.
    expect(title).toContain("overflow: hidden");
  });

  test("Anti: these read the rules they name, and would notice them going", async () => {
    // Vacuity guard for the four above: every one of them extracts a rule by
    // regex and an empty string satisfies a `not.toContain`.
    const design = await sheet("design.css");
    const panels = await sheet("panels.css");
    const rail = await sheet("rail.css");
    for (const [name, rule] of [
      [".nextbar", /\.nextbar \{[^}]*\}/.exec(design)?.[0] ?? ""],
      [".nextbar-action", /\.nextbar-action \{[^}]*\}/.exec(design)?.[0] ?? ""],
      [".page-help-panel", /\.page-help-panel \{[^}]*\}/.exec(panels)?.[0] ?? ""],
      [".navrail-studytitle", /\.navrail-studytitle \{[^}]*\}/.exec(rail)?.[0] ?? ""],
    ] as const) {
      expect({ name, found: rule.length > 0 }).toEqual({ name, found: true });
    }
  });
});

/**
 * The confirmation pass (M32c).
 *
 * Eight of ten changes were made and two were partly made, and the two partials
 * are the interesting ones: both were a rule that was written correctly and
 * then did nothing, which is the failure mode a source test catches and a
 * screenshot does not.
 */
describe("M32c: what the confirmation pass found", () => {
  test("fix 1: the frame's row can be shorter than its content, or the cap is inert", async () => {
    /* The critic measured it in real Chrome. `.panel-frame` capped at 581 CSS
     * px exactly as intended, and `.panel-main` rendered 2097 on Material, blew
     * through it and painted out of the bottom of the viewport. Three of the
     * four routes were still one long scroll with borders drawn on it.
     *
     * A grid with no `grid-template-rows` gets an `auto` track, and an `auto`
     * track is at least as tall as its content whatever the container's
     * max-height says. `min-height: 0` on the frame does not reach it: that is
     * about the frame as an item, not about the track inside it. */
    const panels = await sheet("panels.css");
    const media = /@media \(min-width: 1000px\) \{[\s\S]*?\n\}/.exec(panels)?.[0] ?? "";
    expect(media).toContain("max-height: calc(100dvh - 11rem)");
    expect(media).toContain("grid-template-rows: minmax(0, 1fr)");
  });

  test("fix 1: and every pane on every route has something that scrolls", async () => {
    /* The cap only pays if each pane bottoms out in a box with its own
     * overflow. Every pane is the standard shape, a flex column holding a
     * `.panel-body`, which needs `min-height: 0`, the declaration that lets a
     * flex or grid child be shorter than its content and the one nothing gets
     * by default. */
    const panels = await sheet("panels.css");
    expect(panels).toMatch(/\.panel-list,\s*\.panel-main,\s*\.panel-side \{[^}]*min-height: 0/s);
    const body = /\.panel-body \{[^}]*\}/.exec(panels)?.[0] ?? "";
    expect(body).toContain("flex: 1 1 auto");
    expect(body).toContain("min-height: 0");
    expect(body).toContain("overflow-y: auto");

    for (const [route, file, panes] of [
      ["material", "ui/StudyViews.tsx", 2],
      ["your model", "ui/ConceptsView.tsx", 2],
      ["exports", "workbench/ExportBar.tsx", 2],
    ] as const) {
      const src = await code(file);
      expect({ route, bodies: src.split('className="panel-body').length - 1 }).toEqual({
        route,
        bodies: panes,
      });
    }
  });

  test("fix 2: a hint inside a pane is not capped for a page it is no longer on", async () => {
    /* Change 5 half-landed: the layout stopped being sized by prose and the
     * prose went on being sized for a layout that no longer exists.
     * `.field-hint` is --measure-tight and `.studyview-lede` is --measure, both
     * written when a surface was one column down the middle of a 1120px frame,
     * so inside a pane two to three times that width every hint was a two-line
     * rag with a hard right void beside it.
     *
     * Widened to --measure-wide and stopped there: a hint running the full
     * width of a 700px pane is 95 characters to the line and the 80-character
     * bar is what the whole measure family exists to hold. */
    const panels = await sheet("panels.css");
    expect(panels).toContain(".panel-body .field-hint");
    expect(panels).toContain(".panel-body .studyview-lede");
    expect(panels).toContain("max-width: min(var(--measure-wide), 100%)");
    // It has to beat two rules that are two classes each, so it is written as
    // two class selectors rather than with `:where()`, which contributes no
    // specificity, and wins the tie on source order.
    expect(panels).not.toMatch(/\.panel-body p:where\(/);
    const base = await sheet("base.css");
    expect(base).toMatch(/\.field-row > \.field-hint \{[^}]*max-width: var\(--measure-tight\)/s);
  });

  test("fix 4: the file picker's face is its own label, pointed at its own input", async () => {
    /* The control was never raw: base.css has styled `input[type="file"]` since
     * 68fd466, well before the capture this pass was taken from, and the blob
     * at that commit carries the border, the radius, the tokens and a
     * `::file-selector-button` drawn to match the default button role. What was
     * in the browser's voice was two strings the browser owns, "Choose Files"
     * and "No file chosen", which no CSS reaches.
     *
     * So the native control is clipped and the label does the job. It could
     * always do it: `Field` has always rendered `<label htmlFor>`, so clicking
     * "Add your data" has always opened the picker. This is the assertion the
     * whole fix rests on, and it is why no string was added. */
    const field = await code("ui/components/Field.tsx");
    // Matched with whitespace collapsed the way a browser collapses it, so
    // the assertion is about the label pointing at the control rather than
    // about how the JSX happens to be wrapped.
    const collapsed = field.replace(/\s+/g, " ");
    expect(collapsed).toContain(
      '<label className={labelIsControl === true ? "field-label field-face" : "field-label"} htmlFor={htmlFor}',
    );

    const material = await code("flow/CorpusMaterial.tsx");
    // The label points at the input, by the same id, in the same file.
    expect(material).toContain('htmlFor="material-upload"');
    expect(material).toContain('id="material-upload"');
    expect(material).toContain("labelIsControl");
    // Clipped, not removed: `display: none` or `opacity: 0` on a stacked box
    // would take the picker out of the tab order, and a researcher has to be
    // able to reach it with a keyboard.
    expect(material).toMatch(/className="visually-hidden"[\s\S]{0,80}type="file"/);
    const base = await sheet("base.css");
    expect(base).toMatch(/\.visually-hidden \{[^}]*clip-path: inset\(50%\)/s);
    // And the ring the clipped control can no longer show belongs to the face.
    // M53, ISC-544: for the keyboard only, so a click into the field draws no ring.
    expect(base).toContain(".field-row:has(:focus-visible) > .field-face");
  });

  test("fix 4: the face reads inert while the control refuses, and every other field is untouched", async () => {
    // The picker is `aria-disabled` rather than `disabled`, deliberately: that
    // keeps it in the tab order and lets `onUpload` own the stop. Without the
    // face mirroring it, the face would go on looking pressable while the
    // control behind it refused.
    const material = await code("flow/CorpusMaterial.tsx");
    expect(material).toContain("labelInert={uploadReason !== null}");
    expect(material).toContain('inertAttrs("material-upload", uploadReason)');
    const base = await sheet("base.css");
    expect(base).toMatch(/\.field-row > \.field-face\[data-inert="true"\] \{[^}]*var\(--inert-fill\)/s);

    /* And the opt-in half. Both props are read nowhere else, so a field that
     * does not ask for a face renders the same three elements with the same
     * class strings it always did. The list of callers is what holds that: a
     * caller that is not on it is a decision nobody made.
     *
     * M36 added the second, and it is the same decision for the same reason.
     * `ui/BringInStudy.tsx` is the other `<input type="file">` in the app, and
     * an unfaced one there would put "Choose File / No file chosen" beside
     * Create study on the first screen a co-author sees. */
    const field = await code("ui/components/Field.tsx");
    expect(field).toContain("labelIsControl?: boolean");
    expect(field).toContain("labelInert?: boolean");
    // Counted as files rather than as occurrences: what matters is that one
    // surface asks for a face, not how many times Field mentions the prop
    // while implementing it.
    const callers = MARKUP.filter(
      (f) => f.path !== "ui/components/Field.tsx" && f.text.includes("labelIsControl"),
    ).map((f) => f.path);
    expect(callers.sort()).toEqual(["flow/CorpusMaterial.tsx", "ui/BringInStudy.tsx"]);
  });

  test("fix 5: the pane body keeps the padding the chip once lined up with", async () => {
    // M62, ISC-600: the chip is gone; the body's padding it was measured
    // against stays.
    const panels = await sheet("panels.css");
    expect(panels).not.toContain(".panel-help {");
    const body = /\.panel-body \{[^}]*\}/.exec(panels)?.[0] ?? "";
    expect(body).toContain("padding: var(--space-lg)");
  });
});

describe("R13: six front-page images, and the page without them", () => {
  const SLOTS = [
    "/intro/hero.jpg",
    "/intro/obstacles.jpg",
    "/intro/steps.jpg",
  ] as const;

  test("the three named slots and the three numbered ones are all wired", () => {
    for (const src of SLOTS) {
      expect({ src, wired: INTRO.includes(`src="${src}"`) }).toEqual({ src, wired: true });
    }
    // The commitments take theirs off the card's index, so a picture and the
    // refusal it illustrates cannot drift apart.
    expect(INTRO).toContain("src={`/intro/commit-${i + 1}.jpg`}");
    // Four call sites rendering six images, because the three commitment cards
    // share one. Six is the ceiling and there is no seventh: the fit diagram
    // stays a diagram, and "Privacy" gets nothing, because a
    // claim about locality illustrated with stock art undercuts itself.
    expect(INTRO.split("<IntroImage").length - 1).toBe(4);
    expect(INTRO).not.toContain('src="/intro/fit');
    expect(INTRO).not.toContain('src="/intro/close');
  });

  test("a missing file renders nothing at all, rather than a broken-image glyph", () => {
    // The build ships before the files do, and a section with no image has to
    // be a section with no image.
    expect(INTRO).toContain("const [missing, setMissing] = useState(false);");
    expect(INTRO).toContain("if (missing) return null;");
    expect(INTRO).toContain("onError={() => setMissing(true)}");
  });

  test("every one of them is decoration, and says so", () => {
    // Each sits beside a heading and a paragraph that already say what the
    // section is, and none carries information the prose does not.
    expect(INTRO).toContain('alt="" aria-hidden="true"');
  });

  test("the hero keeps its ground and its copy stays legible over the photograph", async () => {
    // The gradient is the ground when there is no file, which is the state the
    // build ships in, and it is what the scrim composites over at the left.
    const intro = await sheet("intro.css");
    expect(intro).toMatch(/\.intro-hero \{[^}]*background: linear-gradient/s);
    expect(intro).toMatch(/\.intro-hero \{[^}]*position: relative/s);
    expect(intro).toMatch(/\.intro-scrim \{[^}]*var\(--hero-ground-top\) 40%/s);
    // Cropped rather than letterboxed, at the ratios the ruling names.
    expect(intro).toContain("aspect-ratio: 3 / 1");
    expect(intro).toContain("aspect-ratio: 1 / 1");
    expect(intro).toContain("object-fit: cover");
  });
});
