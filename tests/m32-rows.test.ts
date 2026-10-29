/**
 * M32 R8 and R10: the row, and the empty state it leaves behind.
 *
 * The owner's complaint was that the pages read as a website, and the audit's
 * seventh-ranked change is the half this file holds: "replace `.card` stacks
 * with a row primitive … it removes ~60% of the current border count and is
 * what kills the rows-and-columns feel — paradoxically by making rows *more*
 * row-like and less card-like."
 *
 *   R8   the row       44px, one hairline, a hover surface, a selected surface,
 *                      the claim's mark at the left, actions revealed on hover
 *                      AND on keyboard focus
 *   R10  the empty     centred in its panel, the page-type mark at 48px and 40%,
 *                      a title line, a small explanation, at most one primary
 *
 * Source-text and pure-function checks, in the shape this repo already uses for
 * layout and for the same reason m32-shell.test.ts gives: the four surfaces
 * that draw a row mount a ledger context and an IndexedDB handle to render
 * anything at all, so a test that stubs those tests the stubs, and geometry
 * cannot be asserted from here. What can be asserted is the structure that
 * produces the geometry — which is where every one of the defects behind R8
 * actually lived.
 *
 * Two properties are worth more than the rest and both have an Anti case. The
 * reveal must never be hover alone, because a control that only a pointer can
 * find is a control half the app's users do not have; and the row's mark must
 * appear only where the row is about a claim, because a disc asserts an origin
 * and asserting one about a paper or a passage is the round-eight defect
 * pointed at an object that does not exist.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { ROW_MARK_SIZE, ROW_MIN_HEIGHT, rowClass } from "../src/ui/components/Row.tsx";
import { EMPTY_STATE_MARK_SIZE } from "../src/ui/components/EmptyState.tsx";

const SRC = new URL("../src/", import.meta.url).pathname;

/** A stylesheet with comments gone, so prose about a rule is never the rule. */
async function sheet(name: string): Promise<string> {
  const css = await Bun.file(`${SRC}ui/styles/${name}`).text();
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Source with comments stripped, for the reason every probe in this suite
 * strips them: each file here explains its own defect by quoting the markup it
 * replaced, so a naive substring match reads the reasoning as the fix.
 */
async function code(rel: string): Promise<string> {
  const raw = await Bun.file(`${SRC}${rel}`).text();
  return raw
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const ROWS = await sheet("rows.css");
const BASE = await sheet("base.css");
const INDEX = await Bun.file(`${SRC}ui/styles/index.ts`).text();

/** The rule body for one selector, or "" when the sheet does not declare it. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
}

/** Every selector list that shares one declaration block. */
function selectorGroups(css: string): readonly string[] {
  return [...css.matchAll(/(?:^|\})([^{}@]+)\{/g)].map((m) => (m[1] ?? "").trim());
}

describe("the row is one object with four states (R8)", () => {
  test("rows.css is loaded, and as a primitive rather than as a surface", async () => {
    // A stylesheet nothing imports is invisible: the rows render unstyled and
    // every check in styles-integrity still passes, because the file is there
    // and well formed. It has to load after base.css, so the surfaces it draws
    // over can still be overridden, and before the four surfaces that consume
    // it, because three of them deliberately override its padding.
    const order = [...INDEX.matchAll(/import\s+"\.\/([\w-]+\.css)"/g)].map((m) => m[1]);
    expect(order).toContain("rows.css");
    const at = order.indexOf("rows.css");
    expect(at).toBeGreaterThan(order.indexOf("base.css"));
    expect(at).toBeGreaterThan(order.indexOf("components.css"));
    for (const surface of ["material.css", "ontology.css"]) {
      expect({ surface, after: order.indexOf(surface) > at }).toEqual({ surface, after: true });
    }
  });

  test("the hairline is --line-faint and it is a bottom border, not a box", () => {
    // "1px --line-faint bottom border" (R8). A box around each row is the card
    // stack the ruling exists to end, so what the row declares is the rule
    // between it and its neighbour and nothing else. --line-faint is the token
    // base.css names as the inside of a grid, which is what this is.
    const row = rule(ROWS, ".row");
    expect(row).toContain("border-bottom: 1px solid var(--line-faint)");
    expect(row).not.toMatch(/border(-top|-left|-right)?:/);
    expect(row).not.toContain("border-radius");
  });

  test("hover and selected are the two tokens R4 added, and nothing else", () => {
    // The audit's fourth-ranked change: "add --surface-hover and
    // --surface-selected and wire them to every row, card and tab. The app has
    // no hover or selection surface at all today, which is a large part of why
    // nothing feels interactive." Three lists were using three different
    // colours for one gesture before this: --surface-sunken on the claims
    // table, --accent-fill for its selection, and nothing at all on findings.
    expect(rule(ROWS, ".row:hover")).toContain("background: var(--surface-hover)");
    expect(rule(ROWS, '.row[data-selected="true"]')).toContain(
      "background: var(--surface-selected)",
    );
    expect(ROWS).not.toContain("--surface-sunken");
    expect(ROWS).not.toContain("--accent-fill");
  });

  test("the box carries the 44px minimum and the state class carries no height", () => {
    // The split is load-bearing rather than tidy. Three of the elements that
    // have to read as a row are elements whose box is decided by semantics: a
    // <tr>, a <summary>, and the finding article that holds four stacked
    // paragraphs. `display: flex` on a <tr> does not lay a table row out, it
    // takes the table apart, so `.row` declares no display and no height and
    // an element that brings its own box takes it alone.
    const line = rule(ROWS, ".row-line");
    expect(line).toContain(`min-height: ${ROW_MIN_HEIGHT}px`);
    expect(line).toContain("display: flex");
    const state = rule(ROWS, ".row");
    expect(state).not.toContain("display:");
    expect(state).not.toContain("min-height");
  });

  test("the three parts of the box are the mark, the body and the actions", () => {
    // "the 8px page-type mark at the left where a row is a claim, content in
    // the middle, actions revealed on hover at the right" (R8).
    expect(rule(ROWS, ".row-mark")).toContain("flex: 0 0 auto");
    expect(rule(ROWS, ".row-body")).toContain("flex: 1 1 auto");
    // min-width: 0 or the body refuses to shrink and pushes the actions off the
    // right edge, which is the flexbox default nobody expects.
    expect(rule(ROWS, ".row-body")).toContain("min-width: 0");
    expect(rule(ROWS, ".row-actions")).toContain("margin-left: auto");
    expect(ROW_MARK_SIZE).toBe(8);
  });

  test("a row that brings its own box still takes the states", () => {
    // `rowClass` is the whole of what a <tr> and a <summary> take. It composes
    // rather than replaces, so the surface's own class still reaches its rules.
    expect(rowClass()).toBe("row");
    expect(rowClass("index-row")).toBe("row index-row");
    expect(rowClass("row-line", "corpus-doc")).toBe("row row-line corpus-doc");
    // A falsy branch drops out rather than rendering "false" into the class.
    expect(rowClass(undefined, false, "")).toBe("row");
  });
});

describe("the reveal is never hover alone (R8)", () => {
  const revealed = selectorGroups(ROWS).filter((g) => g.includes(".row-actions") && g.includes(","));

  test("keyboard focus anywhere in the row paints the actions", () => {
    // R8's last sentence: "Reveal-on-hover must also be reachable by keyboard
    // focus." Without :focus-within a keyboard user tabs into a control that
    // is invisible while it holds the focus ring, which is worse than no
    // control at all.
    const group = revealed.join(" ");
    expect(group).toContain(".row:focus-within .row-actions");
    expect(group).toContain(".row:hover .row-actions");
  });

  test("the selected row and a live flow both hold the actions open", () => {
    const group = revealed.join(" ");
    expect(group).toContain('.row[data-selected="true"] .row-actions');
    // The hold is what stops a two-press gesture eating its own control: the
    // reason field mounts under the row and the pointer leaves the row to reach
    // it. Without it the Dismiss button disappears mid-dismissal, which is
    // exactly how the grouped row's control came to be reported as dead.
    expect(group).toContain('.row-actions[data-held="true"]');
  });

  test("a pointer that cannot hover gets the actions outright", () => {
    // Nothing hovers on a touch screen, so a hover-gated reveal there is a
    // permanent hide.
    expect(ROWS).toMatch(/@media \(hover: none\) \{\s*\.row-actions \{\s*opacity: 1;/);
  });

  test("the control stays focusable and audible while it waits", () => {
    // Opacity rather than `visibility: hidden` or `display: none`, and this is
    // the assertion that keeps the rule self-consistent: a hidden element
    // cannot take focus, so a row that hid its actions could never satisfy its
    // own focus-within half. The control is in the tab order and in the
    // accessibility tree throughout; only the paint waits.
    const actions = rule(ROWS, ".row-actions");
    expect(actions).toContain("opacity: 0");
    expect(actions).not.toContain("visibility:");
    expect(actions).not.toContain("display: none");
  });

  test("Anti: the reveal would fail if it were written hover-only", () => {
    // Vacuity guard on the four checks above: the probe has to be able to tell
    // the shipped rule from the one R8 forbids.
    const hoverOnly = ".row:hover .row-actions { opacity: 1; }";
    expect(hoverOnly.includes(".row:focus-within .row-actions")).toBe(false);
    expect(ROWS.includes(".row:focus-within .row-actions")).toBe(true);
  });

  test("no surface reimplements the reveal", async () => {
    // The point of a primitive. Coherence.css held four rules putting the
    // Dismiss button in a grid column of its own, and papers on Material had
    // the same problem with no answer to it at all.
    const offenders: string[] = [];
    for await (const rel of new Glob("*.css").scan(`${SRC}ui/styles/`)) {
      if (rel === "rows.css") continue;
      const css = (await Bun.file(`${SRC}ui/styles/${rel}`).text()).replace(
        /\/\*[\s\S]*?\*\//g,
        "",
      );
      if (/\.row-actions|\.finding-actions/.test(css)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe("every list that was a card stack is a row list now (R8)", () => {
  test("a paper is a Row and its Remove control is in the reveal", async () => {
    const corpus = await code("flow/SeminalCorpus.tsx");
    expect(corpus).toContain("<Row");
    expect(corpus).toMatch(/actions=\{[\s\S]*?<RemoveDocument/);
    // Held while the confirmation is armed, or the control that asked the
    // question vanishes while the question is on screen.
    expect(corpus).toContain("actionsHeld={arming === doc.id}");
    // The verdict sentence stays on the file's row, which is the owner's own
    // report: both this row and the typed line key on the same document, so
    // printing it in both places read as the paper having been judged twice.
    expect(corpus).toMatch(/literature-verdict-\$\{doc\.id\}/);
    expect(corpus).toMatch(/typed-upload-\$\{l\.index\}/);
  });

  test("a data document is a row on its summary, and keeps its fold", async () => {
    const material = await code("flow/CorpusMaterial.tsx");
    // The summary IS the row. `Row` cannot own a <summary>: a summary that
    // takes a display value from anywhere but its own surface is how this page
    // lost its disclosure markers once already (MAT-04).
    expect(material).toContain("className={rowClass()}");
    expect(material).toContain("<details");
    expect(rule(ROWS, "summary.row")).toContain(`min-height: ${ROW_MIN_HEIGHT}px`);
    // And the list is one box with hairlines rather than a stack of bordered
    // boxes with gaps between them. M32b: that box is `.row-list`, so what is
    // left on this surface's own class is the one thing that is this list's and
    // not every list's.
    expect(material).toContain('className="corpus-docs row-list"');
    const mat = await sheet("material.css");
    expect(rule(mat, ".corpus-docs")).toContain("margin-top");
    expect(rule(mat, ".corpus-docs")).not.toContain("border:");
    expect(rule(mat, ".corpus-docs")).not.toContain("gap:");
    // Same vacuity guard: the positive says the rule is still there, the
    // negative says the card treatment is not.
    expect(rule(mat, ".corpus-doc")).toContain("background: var(--surface)");
    expect(rule(mat, ".corpus-doc")).not.toContain("border:");
    expect(rule(mat, ".corpus-doc")).not.toContain("border-radius");
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel, workbench/PagePanel.tsx left with it; superseded: "the claims table takes the states and keeps its table"

  test("no surface still paints its own hover or selection on a row", async () => {
    // What the two tokens were added to end. Before this the claims table said
    // --surface-sunken and --accent-fill, the rail says --surface-hover, and
    // the finding rows said nothing: one gesture, three answers, three lists.
    const offenders: string[] = [];
    for (const [file, selectors] of [
      ["ontology.css", [".index-row:hover", ".index-row.selected"]],
      ["material.css", [".corpus-doc:hover"]],
    ] as const) {
      const css = await sheet(file);
      for (const sel of selectors) if (css.includes(sel)) offenders.push(`${file}: ${sel}`);
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * M32b item 1, and it is the one defect in this pass that made the product
 * unreadable rather than unattractive.
 *
 * Every multi-line finding row on Checks showed its first line and had its
 * second sliced through the middle of the glyphs. Measured in real Chrome: one
 * `.finding-row` exactly 44 CSS px against content needing about 58, and nine
 * rows in a block 402px tall, which is 9 × 44 to the pixel. Every track had
 * been pinned at the row's `min-height` floor, and the `overflow: hidden` that
 * rounds the list's corners cut the rest away with no scrollbar, no error and
 * no symptom any test in this suite could see.
 *
 * The fix is to name the track sizing rather than trust the intrinsic path, and
 * the guard is that it can only be named once. Three lists had each copied the
 * same box and none of them carried the declaration, so a fourth would have
 * copied it too. The box is `.row-list` now, and these checks hold every file
 * that renders a list of rows to using it.
 */
describe("no row container pins a track height (M32b item 1)", () => {
  test("the list box names its track sizing, and names it min-content", () => {
    const list = rule(ROWS, ".row-list");
    expect(list).toContain("display: grid");
    expect(list).toContain("grid-auto-rows: min-content");
    // A length here is the defect written down. `min-content` is the item's
    // wrapped height at the track's inline size and never grows to absorb
    // slack, so five rows in a tall pane stay five rows rather than five rows
    // stretched down it.
    expect(list).not.toMatch(/grid-auto-rows:[^;]*\d\s*(px|rem|em|%)/);
    expect(list).not.toContain("grid-template-rows");
    expect(list).not.toContain("height:");
  });

  test("the clip that hid the defect is still there, and is why the guard is", () => {
    // `overflow: hidden` stays: it is what clips the first and last rows to the
    // container's radius, and it is doing that under the pointer on every
    // hover. Keeping it is exactly why the track sizing has to be asserted
    // rather than left to be noticed, because it is the declaration that turns
    // a sizing bug into silently unreadable text.
    expect(rule(ROWS, ".row-list")).toContain("overflow: hidden");
  });

  test("no surface declares a list box of its own any more", async () => {
    // Three copies of six declarations, none of them carrying the seventh. The
    // copies are what made the defect survivable in one place and invisible in
    // the other two, so the surfaces keep only what is theirs: a margin, a
    // list-style, a type step.
    const offenders: string[] = [];
    for (const [file, selector] of [
      ["material.css", ".corpus-docs"],
      ["ontology.css", ".tray-rejected-rows"],
    ] as const) {
      const body = rule(await sheet(file), selector);
      // Vacuity guard: the rule still exists and still holds what is its own.
      expect({ selector, found: body !== "" }).toEqual({ selector, found: true });
      for (const copied of ["display: grid", "overflow: hidden", "border-radius", "border: 1px"]) {
        if (body.includes(copied)) offenders.push(`${file} ${selector}: ${copied}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("every file that renders a list of rows puts them in the one box", async () => {
    // The completeness half, derived rather than listed, so a fifth list cannot
    // arrive without the declaration that keeps its rows legible. Three files
    // are exempt and each is a different reason.
    const EXEMPT = new Map([
      // The two definers. They draw a row; they do not list them.
      ["ui/components/Row.tsx", "defines the row"],
      // The claims table, whose rows are `<tr>` in a real `<table>`. A grid box
      // round a table is not a list box, and the density argument for keeping
      // the table is in PagePanel.tsx's own header.
    ]);
    // The discriminator is the import, not the identifier, and it has to be:
    // ui/keyboard/ShortcutSheet.tsx declares a local `Row` for a key binding,
    // which renders `<Row binding=…>` and has nothing to do with this
    // primitive. Matching on the tag alone read that file as a row list.
    const usesPrimitive = (text: string): boolean => {
      const imports = [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]*)"/g)]
        .filter((m) => (m[2] ?? "").endsWith("components/index.ts"))
        .map((m) => m[1] ?? "")
        .join(",");
      return /\b(Row|rowClass)\b/.test(imports);
    };
    const seen: string[] = [];
    const missing: string[] = [];
    for await (const rel of new Glob("**/*.tsx").scan(SRC)) {
      const text = await code(rel);
      const defines = rel.startsWith("ui/components/");
      if (!defines && !usesPrimitive(text)) continue;
      if (defines && !/<Row\b|rowClass\(/.test(text)) continue;
      seen.push(rel);
      if (EXEMPT.has(rel)) continue;
      if (!text.includes("row-list")) missing.push(rel);
    }
    expect(missing).toEqual([]);
    // Vacuity guard on the scan, and on the exemptions: an empty glob or a
    // stale exemption would make the assertion above pass for the wrong reason.
    expect(seen.length).toBeGreaterThan(3);
    expect([...EXEMPT.keys()].filter((f) => !seen.includes(f))).toEqual([]);
  });

  test("Anti: the probes fire on the box that shipped", () => {
    // Vacuity guard on the rule reader. The shipped box is these six
    // declarations with the seventh missing, which is what sliced the rows.
    const shipped =
      ".coh-rows { display: grid; border: 1px solid var(--line); border-radius: var(--radius-container); background: var(--surface); overflow: hidden; }";
    expect(shipped.includes("grid-auto-rows")).toBe(false);
    expect(rule(ROWS, ".row-list").includes("grid-auto-rows")).toBe(true);
    // And a track pinned to a length would be caught rather than passed.
    expect(/grid-auto-rows:[^;]*\d\s*(px|rem|em|%)/.test("grid-auto-rows: 44px;")).toBe(true);
    expect(/grid-auto-rows:[^;]*\d\s*(px|rem|em|%)/.test("grid-auto-rows: min-content;")).toBe(
      false,
    );
  });
});

describe("the row's mark is drawn only where the row is a claim (R8)", () => {
  test("the primitive takes a page identity and hands it straight to the boundary", async () => {
    // Nothing about the encoding is expressible here. The row names no hue, no
    // fill share and no attribute record: it hands over a PageIdentity and gets
    // rendered output, which is the boundary round nine made structural.
    const row = await code("ui/components/Row.tsx");
    expect(row).toContain("PageMark");
    expect(row).not.toContain("PAGE_TYPE_COLOUR");
    expect(row).not.toContain("fillOpacity");
    expect(row).toMatch(/size=\{ROW_MARK_SIZE\}/);
  });

  test("Anti: the rows that are not claims pass no page at all", async () => {
    // A paper and a data document are rows and neither is a claim. A disc
    // beside one would assert an origin for an object that has none, which is
    // the round-eight defect pointed at nothing.
    for (const rel of ["flow/SeminalCorpus.tsx"]) {
      const text = await code(rel);
      for (const m of text.matchAll(/<Row\b[\s\S]{0,600}?>/g)) {
        expect({ rel, passesPage: /\bpage=/.test(m[0]) }).toEqual({ rel, passesPage: false });
      }
    }
  });
});

describe("an empty panel says what is true, teaches one thing, offers one path (R10)", () => {
  test("it is centred in its panel rather than parked in the corner", () => {
    // It was a left-aligned dashed box capped at --measure. Dropped into a 1fr
    // panel that put it in the top-left corner with the rest of the pane blank
    // beside it, and the panel then read as broken rather than as empty.
    const empty = rule(BASE, ".empty-state");
    expect(empty).toContain("justify-items: center");
    expect(empty).toContain("align-content: center");
    expect(empty).toContain("margin-inline: auto");
  });

  test("it is a box on the pane, and not the dashed one it used to be", () => {
    // M32b item 3. R10 took the border off on the argument that the panel
    // around it already had one. That holds only where the empty state IS the
    // pane's whole content, and two are not: "No suggestions to review." sits under a
    // heading on Your model and "No exports yet." under a paragraph and
    // a definition list on Exports. With no border and --surface on a --surface
    // pane, both rendered as bare centred sentences floating in the middle of a
    // pane, which the confirmation pass read as the most website-shaped thing
    // left on those two routes.
    const empty = rule(BASE, ".empty-state");
    expect(empty).toContain("border: 1px solid var(--line)");
    // Sunken, so the box reads on a white pane without the border doing all the
    // work. --surface on --surface is what made it invisible.
    expect(empty).toContain("background: var(--surface-sunken)");
    // And not the edge that was removed: dashed said "placeholder", which is
    // why .graph-empty wore it. Solid on sunken says this region is empty.
    expect(empty).not.toContain("dashed");
  });

  test("where the empty state IS the pane, the container drops its own edge", async () => {
    // One box either way, which is what R10 was reaching for. Material's list
    // gives up its border when it is holding an empty state.
    const mat = await sheet("material.css");
    expect(rule(mat, ".corpus-docs:has(> .empty-state)")).toContain("border: 0");
  });

  test("the two sentences the confirmation pass caught are in the box", async () => {
    // Both were already routed through EmptyState; what they had lost was a
    // visible container. The check is that they are still routed and still
    // carry their own words, because the fix was a stylesheet away from being
    // "rewrite the markup" and that would have been a copy change.
    const tray = await code("workbench/ProposalsTrayView.tsx");
    // D36 (M43c) made the status a choice of two rather than one literal: with
    // drafts still set aside below, "No suggestions to review." was the page contradicting
    // itself, so the queue is named instead. Both sentences are still this file's
    // own words, which is what this check is for.
    expect(tray).toMatch(/<EmptyState[\s\S]{0,300}status=\{[\s\S]{0,200}"You have decided on every suggestion\."/);
    expect(tray).toContain('"You have decided on every new suggestion."');
    const exports_ = await code("workbench/ExportBar.tsx");
    expect(exports_).toMatch(/<EmptyState[\s\S]{0,200}status="You haven't exported a file yet\."/);
    // No mark on either, and it is not an oversight. A draft in the tray can be
    // any page type, so naming one would assert a family the tray does not
    // have; a downloaded file is not a page at all.
    for (const text of [tray, exports_]) expect(text).not.toContain("mark=");
    // And no button on either. R10's "one primary" is a ceiling: the tray's own
    // teaching line already names the Design tab, and the receipt's path out is
    // the file list directly above it.
    expect(tray).not.toMatch(/status="You have decided on every suggestion\."[\s\S]{0,300}action=/);
    expect(exports_).not.toMatch(/status="You haven't exported a file yet\."[\s\S]{0,300}action=/);
  });

  test("the turned-down drafts are rows, not a bulleted list (M32b item 4)", async () => {
    // The last `<ul>` with markers on a route made of rows. One row per draft:
    // the title struck through as it already was, and the reason on the row's
    // second line rather than spliced onto the first after a colon.
    const tray = await code("workbench/ProposalsTrayView.tsx");
    expect(tray).toContain('className="tray-rejected-rows row-list"');
    expect(tray).toMatch(/<Row as="li"[\s\S]{0,200}<s>\{p\.title\}<\/s>/);
    expect(tray).toContain('<span className="tray-rejected-why">{p.reason}</span>');
    // No actions and no mark. There is nothing to do to a turned-down draft —
    // the ledger has no event that withdraws a disposition, the same reason a
    // dismissed finding carries no control — and a draft is not a claim in the
    // model, so a disc would assert an identity for a page never made.
    expect(tray).not.toMatch(/<Row as="li"[\s\S]{0,300}(actions=|page=)/);
    const ont = await sheet("ontology.css");
    expect(rule(ont, ".tray-rejected-rows")).toContain("list-style: none");
    // The heading above it keeps its words, count and all.
    expect(tray).toMatch(/Rejected \(\{tray\.rejected\.length\}\)\. Kept in History/);
  });

  test("the graphic is the page-type mark, at 48px and 40%", () => {
    // R10, exactly. A page-TYPE mark and not a page mark: an empty panel holds
    // no page, so a disc here carrying a fill share would claim an origin for
    // an object that does not exist. PageMark.tsx names the key swatch as the
    // one mark in the app that carries a hue with no origin beside it.
    expect(rule(BASE, ".empty-state-mark")).toContain("opacity: 0.4");
    const sized = rule(BASE, ".empty-state-mark > .graphkey-swatch");
    expect(sized).toContain(`width: ${EMPTY_STATE_MARK_SIZE}px`);
    expect(sized).toContain(`height: ${EMPTY_STATE_MARK_SIZE}px`);
  });

  test("the status is the title step and the explanation is small and tight", () => {
    // "a --text-title line, a --text-small explanation at --measure-tight".
    // The status was --text-body at 600, which reads as a bolded sentence
    // rather than as the line that names the state.
    expect(rule(BASE, ".empty-state-status")).toContain("font-size: var(--text-title)");
    const teach = rule(BASE, ".empty-state-teach");
    expect(teach).toContain("font-size: var(--text-small)");
    expect(teach).toContain("max-width: var(--measure-tight)");
  });

  test("at most one control, and where there is one it is the primary", async () => {
    // R10's "one primary button" is a ceiling rather than a floor, and
    // EmptyState's own header says why: some regions are empty for a reason the
    // researcher cannot act on yet, and /material's own comment records that
    // the path out of its empty state is a picker permanently mounted 40px
    // above it. Where there is a path, it wears the filled role rather than
    // `.linkish`, which base.css reserves for genuinely inline text.
    // The component takes one node, not a row of them, and hides it while a
    // call is in flight rather than grimacing at a disabled control.
    const empty = await code("ui/components/EmptyState.tsx");
    expect(empty).toContain("action?: ReactNode");
    expect(empty).toContain("action !== undefined && !model.busy");
  });

  test("every empty state that names a family names it with a type, never a page", async () => {
    // The prop takes a PageType. A PageIdentity here would let a caller assert
    // who wrote a page that does not exist.
    const state = await code("ui/components/EmptyState.tsx");
    expect(state).toContain("mark?: PageType");
    expect(state).not.toContain("PageIdentity");
    expect(state).toContain("PageTypeKeySwatch");
    for (const rel of ["flow/CorpusMaterial.tsx"]) {
      const text = await code(rel);
      expect({ rel, marked: text.includes('mark="observation"') }).toEqual({ rel, marked: true });
    }
  });

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("the teaching line survived the move, word for word", async () => {
    // The copy bar: a visual pass moves sentences and never edits them, and a
    // moved sentence and a shortened one look identical in a diff. Each of
    // these appears exactly once in the whole of src/, in the empty state it
    // now belongs to.
    const sentences = [
      "Add a file above to start.",
    ];
    const all: string[] = [];
    for await (const rel of new Glob("**/*.{ts,tsx}").scan(SRC)) {
      all.push(await code(rel));
    }
    const joined = all.join("\n");
    for (const sentence of sentences) {
      const count = joined.split(sentence).length - 1;
      expect({ sentence, count }).toEqual({ sentence, count: 1 });
    }
  });
});
