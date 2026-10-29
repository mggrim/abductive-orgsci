/**
 * Six surfaces, one instrument (coherence round three).
 *
 * Wave 3 built the six study surfaces in parallel, each behind a file
 * partition, and every one of them is defensible on its own. What no single
 * builder could see is the seam: the same idea said in two words on two tabs a
 * click apart. This file holds the four seams that were closed, at the level
 * they were closed at, so the next parallel wave cannot reopen them quietly.
 *
 * None of these is a defect in one file. Each is an agreement between files,
 * which is why none of them belongs in any of the six surfaces' own suites.
 *
 * What was measured, on the running app at 992px against the fixture study:
 *
 *   IDENTITY. Five study tabs answered a click with an h1 repeating the tab's
 *   label. Biases answered with the eyebrow "What Abductive is watching for" over
 *   "Nine ways a study goes wrong", and the rendered page did not contain the
 *   word "bias" anywhere outside the nine row labels of the grid.
 *
 *   ONE WORD FOR ONE THING. Four sentences pointed across the app as "the
 *   Coherence tab", "the Biases tab", "the Ontology tab"; three said "view",
 *   for the same six objects, which the shell renders as role="tab" in a
 *   tablist. The intro taught the second word to a first-time reader.
 *
 *   WHERE A PAGE ENDS. `.shell` sets padding-bottom on every route, and
 *   `.studyview`, `.matrixpage` and `.intro` each set it again: 96px under four
 *   routes against 48px under /studies and /design. shell.css had already
 *   written that argument out in full for `.studies` and applied it to one
 *   route of the eight.
 *
 *   THE SECTION GAP. Head to first section was 16px on Coherence, 24 on
 *   Ontology, Material and Exports, and 32 on Biases. Three answers to the one
 *   relationship every page in the app has, against a token scale that names
 *   --space-xl "between sections".
 *
 * The counts case is elsewhere on purpose: `.badge` had two callers left and
 * both are StatusChips now, which is asserted here as an absence, and the
 * contrast pair it shared is asserted in styles-integrity.test.ts where the
 * palette lives.
 *
 * Proved non-vacuous by reintroducing the defects rather than by argument:
 * putting `<h1>Nine ways a study goes wrong</h1>` back in MatrixReview.tsx and
 * "the Ontology view" back in Dialogue.tsx failed exactly the two tests written
 * for them, 8 pass / 2 fail, and both went green again on restore.
 */

import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import { STUDY_TABS, STUDY_TAB_LABEL, type StudyTab } from "../src/ui/routes.ts";

const ROOT = `${import.meta.dir}/../src/`;

/** Strip block and line comments: only the tool's own voice is inspected. */
function rendered(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const SURFACE_DIRS = ["ui", "flow", "workbench", "views", "export", "auth"] as const;

async function surfaceSources(): Promise<readonly { path: string; text: string }[]> {
  const out: { path: string; text: string }[] = [];
  for (const dir of SURFACE_DIRS) {
    for await (const rel of new Glob("**/*.{ts,tsx}").scan(`${ROOT}${dir}`)) {
      out.push({ path: `${dir}/${rel}`, text: await Bun.file(`${ROOT}${dir}/${rel}`).text() });
    }
  }
  return out;
}

const SOURCES = await surfaceSources();

async function sheet(file: string): Promise<string> {
  return rendered(await Bun.file(`${ROOT}ui/styles/${file}`).text());
}

// ---------------------------------------------------------------------------

describe("a study tab names the page it opens", () => {
  /**
   * Which file renders which tab. Asserted to be exhaustive below, so a seventh
   * tab cannot be added without either giving it an h1 or deleting this test,
   * and deleting a test is louder than forgetting a heading.
   */
  // D1, D7 (M27): five tabs, not six. M89: the Checks tab left, so four.
  const OWNER: Readonly<Record<StudyTab, string>> = {
    // M53, ISC-540. The theoretical motivation's page lives beside its fields.
    motivation: "flow/FramingBand.tsx",
    design: "workbench/Workbench.tsx",
    ontology: "ui/ConceptsView.tsx",
    material: "ui/StudyViews.tsx",
    exports: "ui/StudyViews.tsx",
  };

  test("the map covers every tab the bar renders and nothing else", () => {
    // Vacuity guard. Without it the loop below could silently check five tabs.
    expect(Object.keys(OWNER).sort()).toEqual([...STUDY_TABS].sort());
  });

  test("every study tab's page carries an h1 that is the tab's own label", async () => {
    // Biases failed this and only this: it rendered "Nine ways a study goes
    // wrong" under an eyebrow, so the one word a researcher had just clicked
    // appeared nowhere on the page that answered the click.
    //
    // D1, D6, D7 (M27) closed the same seam from the other end. Two tabs were
    // passing this by making the page repeat a term of art the reader did not
    // have: /ontology opened "Ontology" and then glossed itself, /coherence
    // opened with a nominalisation. The labels are what the pages already meant,
    // so the h1s did not move and the bar came to them.
    //
    // M32, R3. The property is unchanged and the place it is checked moved.
    // Four `<h1>` elements said the name of the tab the reader had just
    // clicked, 46px under that tab, at 22px, over an otherwise empty page: a 22
    // pixel "Material" floating above a 450px prose column was the most
    // document-like thing on screen. The heading is rendered once, by the
    // sticky study header in AppShell, off `STUDY_TAB_LABEL[tab]` — which is
    // stronger than four hand-typed strings, because it cannot drift from the
    // tab's own label at all. So this asserts two things: the shell renders the
    // heading off the table, and no study route body still carries one of its
    // own, which is what would put two h1s on a page.
    const shell = rendered(SOURCES.find((f) => f.path === "ui/AppShell.tsx")?.text ?? "");
    expect(shell).toContain("<h1>{STUDY_TAB_LABEL[tab]}</h1>");

    const offenders: string[] = [];
    for (const tab of STUDY_TABS) {
      const path = OWNER[tab];
      const file = SOURCES.find((f) => f.path === path);
      expect({ tab, found: file !== undefined }).toEqual({ tab, found: true });
      if (file === undefined) continue;
      if (rendered(file.text).includes(`<h1>${STUDY_TAB_LABEL[tab]}</h1>`)) {
        offenders.push(`${tab} (${path}): still renders its own h1`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("Anti: the check would notice a page titled something other than its tab", () => {
    // D1 (M27): read off `coherence`, whose label moved this wave, rather than
    // off the tab that left the bar. M32: the shape it guards is now the shell
    // line, so the vacuity guard is that a hand-typed heading would not satisfy
    // it and the table-driven one does.
    expect("<h1>Checks</h1>".includes("<h1>{STUDY_TAB_LABEL[tab]}</h1>")).toBe(false);
    expect("<h1>{STUDY_TAB_LABEL[tab]}</h1>".includes("<h1>{STUDY_TAB_LABEL[tab]}</h1>")).toBe(
      true,
    );
  });

  test("every tab link carries the sentence that says when to come here (D1)", async () => {
    // The bar was six bare nouns, three of them terms of art, with no title, no
    // description and no hover, and nothing on any screen said when to open one
    // of them. The sentence rides on the control.
    const { STUDY_TAB_TITLE } = await import("../src/ui/routes.ts");
    expect(Object.keys(STUDY_TAB_TITLE).sort()).toEqual([...STUDY_TABS].sort());
    for (const tab of STUDY_TABS) {
      const title = STUDY_TAB_TITLE[tab];
      expect({ tab, said: title.trim().length > 20 }).toEqual({ tab, said: true });
      // The copy bar bans the em-dash outright, and these are new strings.
      expect({ tab, dash: title.includes("\u2014") }).toEqual({ tab, dash: false });
    }
    // And the bar actually spends it, on every tab rather than on one. M69,
    // ISC-640: as the line under the strip and the tab's description, never as
    // a native title, which drew a tooltip over that line.
    const shell = rendered(SOURCES.find((f) => f.path === "ui/AppShell.tsx")?.text ?? "");
    expect(shell).toContain("STUDY_TAB_TITLE[t]");
    expect(shell).toContain("aria-describedby={inertNoteId(`tab-${t}`)}");
    expect(shell).not.toContain("title={STUDY_TAB_TITLE[t]}");
  });

  test("Anti: the description check would notice a bar that dropped the attribute", () => {
    expect(rendered('<a data-label={X}>').includes("aria-describedby={inertNoteId(`tab-${t}`)}")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("the app has one word for the thing you click", () => {
  test("no surface's own prose calls a study tab a view", () => {
    // Comments are stripped: "the Ontology view" in a header is a note to
    // whoever maintains this and is not the tool speaking. What is checked is
    // what reaches the reader.
    const offenders: string[] = [];
    for (const { path, text } of SOURCES) {
      const prose = rendered(text);
      for (const tab of STUDY_TABS) {
        if (prose.includes(`${STUDY_TAB_LABEL[tab]} view`)) offenders.push(`${path}: ${tab}`);
      }
    }
    expect(offenders.sort()).toEqual([]);
  });

  test("and the scan is reading real prose, not an empty set", () => {
    // Vacuity guard: the pointer sentences the rule is about are still there,
    // in the word the rule settled on.
    const prose = SOURCES.map((f) => rendered(f.text)).join("\n");
    // D1 (M27): the Ontology, Coherence and Biases tabs are gone, under those
    // names, and M89 took the Checks tab. The two pointer sentences that survive
    // are the ones this scan needs to be reading something.
    for (const phrase of ["ontology tab", "Design tab"]) {
      expect({ phrase, present: prose.includes(phrase) }).toEqual({ phrase, present: true });
    }
  });
});

// ---------------------------------------------------------------------------

describe("every route agrees about where a page ends and where a section starts", () => {
  const SHEETS = ["base.css", "shell.css", "design.css", "intro.css", "biases.css",
    "ontology.css", "instrumentation.css", "material.css", "exports.css",
    "components.css", "keyboard.css", "tokens.css"] as const;

  /**
   * Every rule in a sheet as [selector, declarations]. Nested rules inside a
   * media query come out on their own, because `[^{}]` cannot cross a brace, so
   * a surface that hides the declaration behind a breakpoint is still seen.
   */
  function rules(css: string): readonly [string, string][] {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
      (m) => [(m[1] ?? "").trim(), m[2] ?? ""] as const,
    );
  }

  /** Every selector in the app that puts --space-3xl on a box's bottom edge. */
  async function pageBottomSetters(): Promise<readonly string[]> {
    const found: string[] = [];
    for (const file of SHEETS) {
      for (const [selector, body] of rules(await sheet(file))) {
        const longhand = /padding-bottom:\s*var\(--space-3xl\)/.test(body);
        // The shorthand counts too, or the rule comes back as
        // `padding: 0 0 var(--space-3xl)` and this check says nothing.
        const shorthand = /padding:[^;]*var\(--space-3xl\)[^;]*;/.test(body);
        if (longhand || shorthand) found.push(`${file}:${selector}`);
      }
    }
    return found.sort();
  }

  test("the page-bottom interval is declared in exactly one place", async () => {
    // `.shell` owns it. Four surfaces restated it on top, which is 96px under
    // the last line of /ontology, /biases, /material and /exports against 48px
    // under /studies and /design. The rule is the frame's, and the frame has it.
    //
    // `.intro-hero` is the one exemption and it is not a page bottom: it is the
    // padding inside the hero panel, which is the second job tokens.css names
    // for this step.
    //
    // M32, R1. `.shell` stopped being the box with an inside: it is a
    // full-viewport two-track grid at `height: 100dvh` with `overflow: hidden`,
    // and the cell that scrolls and holds the route is `.shell-body`. The
    // interval moved with the padding, and it is still declared exactly once.
    const setters = (await pageBottomSetters()).filter((s) => !s.endsWith(":.intro-hero"));
    expect(setters).toEqual(["shell.css:.shell-body"]);
  });

  test("Anti: the page-bottom check catches a surface restating it, in either form", () => {
    const longhand = rules(".matrixpage {\n  padding-bottom: var(--space-3xl);\n}");
    expect(longhand[0]?.[0]).toBe(".matrixpage");
    expect(/padding-bottom:\s*var\(--space-3xl\)/.test(longhand[0]?.[1] ?? "")).toBe(true);
    // And the form the longhand check alone would have missed, including one
    // parked behind a breakpoint.
    const nested = rules("@media (min-width: 1100px) {\n .intro {\n padding: 0 0 var(--space-3xl);\n }\n}");
    expect(nested.map((r) => r[0])).toContain(".intro");
    expect(nested.some((r) => /padding:[^;]*var\(--space-3xl\)[^;]*;/.test(r[1]))).toBe(true);
  });

  test("the page title's tracking is declared once, on the role", async () => {
    // `.studyview h1` and `.matrixpage h1` each set -0.01em, which covered five
    // study tabs; /studies and /design inherited `normal`, so two page titles
    // in the same 22px step were set 0.22px per character looser than the other
    // six. The element rule carries it now. `.intro-title` is the one override
    // and it is a different step: the hero's display title, at 28px.
    const setters: string[] = [];
    for (const file of SHEETS) {
      for (const [selector, body] of rules(await sheet(file))) {
        if (!/\bh1\b/.test(selector) && !/^\.intro-title$/.test(selector)) continue;
        if (/letter-spacing:/.test(body)) setters.push(`${file}:${selector}`);
      }
    }
    expect(setters.sort()).toEqual(["base.css:h1", "intro.css:.intro-title"]);
  });

  test("head to first section is --space-xl on every study tab that sets it", async () => {
    // Ontology, Material and Exports get theirs from the shared lede; the
    // biases block from its masthead's bottom margin; Checks from the grid gap
    // on its own main. Three rules, one interval, and it is the interval
    // tokens.css names "between sections".
    //
    // D7 (M27): the biases masthead is a section head inside Checks now rather
    // than a page head, and the interval it sets is the same one, which is why
    // this row did not move.
    const declarations: [string, string, RegExp][] = [
      ["shell.css", ".studyview-lede", /\.studyview-lede\s*\{[^}]*margin:[^;]*var\(--space-xl\)/],
      ["biases.css", ".matrixpage-head", /\.matrixpage-head\s*\{[^}]*margin:[^;]*var\(--space-xl\)/],
    ];
    const offenders: string[] = [];
    for (const [file, selector, pattern] of declarations) {
      const css = await sheet(file);
      // Non-vacuity per row: the selector has to exist before its value means
      // anything, and a renamed rule should fail loudly rather than pass.
      expect({ selector, present: css.includes(`${selector} {`) }).toEqual({
        selector,
        present: true,
      });
      if (!pattern.test(css)) offenders.push(`${file}: ${selector}`);
    }
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("a count is one object everywhere", () => {
  test("nothing draws a bare number in a `.badge` any more", async () => {
    // StatusChip's own header names the defect it was built for: "three
    // surfaces rendered a number in a badge beside a word in a pill, at two
    // sizes". One was converted when the component landed. The other two, the
    // queue heading on the Ontology tab and the flag rows in the ledger panel,
    // shipped for two more waves as filled --notice pills with inverse ink,
    // which made a count of drafts the loudest mark on its page.
    const callers = SOURCES.filter((f) => rendered(f.text).includes('className="badge"'));
    expect(callers.map((f) => f.path)).toEqual([]);
    const css = await sheet("base.css");
    expect(/^\.badge\s*\{/m.test(css)).toBe(false);
  });

  test("Anti: the caller check fires on the shape it is meant to catch", () => {
    expect(rendered('<span className="badge">{n}</span>').includes('className="badge"')).toBe(true);
    // And a comment mentioning the class is not a caller, which is the whole
    // reason the scan strips comments first.
    expect(rendered('/* `.badge` is gone; className="badge" */').includes('className="badge"')).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------

describe("the word 'model' means one thing at a time", () => {
  /**
   * Coherence round four settled this seam one way. D1 and D6 (M27) settle it
   * the other way, and the record of why is worth keeping in both directions.
   *
   * "the model" is the language model: it proposes pages, it writes drafts, it
   * costs a call, and Checks talks about "your model provider". "your model"
   * was also the tool's word for the researcher's ontology, in eight places. On
   * the Ontology tab those two sat in one column: the lede said "Your model of
   * the phenomenon", the tray under it was headed "Waiting to go into your
   * model", the paragraph inside the tray said "the model wrote these up from
   * what you said", and the census two hundred pixels up answered "Who wrote
   * them" with "from the model". Four readings of one word, one scroll.
   *
   * Round four resolved it by banning the possessive for the ontology: the
   * ontology was "your ontology", which is what the tab was called. M27 renamed
   * the tab, because "ontology" means one thing in philosophy of science,
   * another in Gioia-style methods writing and a third in computer science, and
   * the page had to gloss itself in its own h1 to be understood. When a heading
   * needs an apposition to be understood, the apposition is the heading. So the
   * tab is Your model, the ontology owns the possessive by decision, and the
   * ban that pointed the other way is void.
   *
   * What replaces it is a pin rather than a ban, and deliberately. A ban whose
   * exemption list has to hold every sanctioned use of the words is no longer
   * reading anything; naming the two objects, in the two places the reader meets
   * them, is a check that can still fail. The other half of round four's rule is
   * untouched and needs no scan: the language model is "the model" bare, or
   * "your model provider", and neither of those is what changed.
   */
  test("the ontology is called Your model, on the tab and on the page it opens", async () => {
    const { STUDY_TAB_LABEL: LABELS } = await import("../src/ui/routes.ts");
    // M63, ISC-609: the owner renamed the tab "Emerging project ontology", which
    // keeps "model" for the language model alone.
    expect(LABELS.ontology).toBe("Emerging project ontology");
    // M32, R3. The page heading moved to the sticky study header and is read
    // off this same table, so the tab and the page it opens cannot say
    // different things by construction rather than by two strings agreeing.
    // What is pinned on the page itself is the possessive in the surface's own
    // prose, which is the half the rename was about.
    const shell = SOURCES.find((f) => f.path === "ui/AppShell.tsx");
    expect(rendered(shell?.text ?? "")).toContain("<h1>{STUDY_TAB_LABEL[tab]}</h1>");
    // M62, ISC-600: the page's lede is in its Help panel now.
    const help = SOURCES.find((f) => f.path === "ui/pageHelp.ts");
    // M63, ISC-614: the page's purpose in the owner's terms.
    expect(rendered(help?.text ?? "")).toContain("The concepts that you define for this project");
  });

  test("and the methods word survives on the page, glossed once", () => {
    // The rename does not take the term away from the readers who came looking
    // for it. It stops the page having to explain its own heading.
    // M62, ISC-600: the gloss moved with the lede that carried it (M32 had
    // already put it behind the page's "?"), into Your model's Help panel.
    const help = SOURCES.find((f) => f.path === "ui/pageHelp.ts");
    expect(rendered(help?.text ?? "")).toContain("your ontology");
    const view = SOURCES.find((f) => f.path === "ui/ConceptsView.tsx");
    expect(rendered(view?.text ?? "")).not.toContain("<h1>Ontology</h1>");
  });

  test("the language model is still named as a vendor where it costs a call", () => {
    // Vacuity guard on the half of the rule that did not move: "your model
    // provider" is the one construction that says which of the two is meant.
    const prose = SOURCES.map((f) => rendered(f.text)).join("\n");
    expect(prose).toContain("a model provider");
  });

  test("Anti: the pins would notice either name going back to the term of art", () => {
    // M32: the heading is the table's, so the shape the pin reads is the shell
    // line rather than a typed h1. The `not.toContain("<h1>Ontology</h1>")`
    // above still catches a page that reintroduces the term of art as a
    // heading of its own.
    expect(rendered("<h1>Ontology</h1>").includes("<h1>{STUDY_TAB_LABEL[tab]}</h1>")).toBe(false);
    expect(rendered("<h1>{STUDY_TAB_LABEL[tab]}</h1>").includes("<h1>{STUDY_TAB_LABEL[tab]}</h1>")).toBe(
      true,
    );
  });

  test("and the invariant it replaced is stated in one form, not four", () => {
    /* "Nothing enters your ontology until you accept it" was four sentences:
     * /studies said it, the Design banner said "Nothing enters your model until
     * you decide", the station aside said "no page enters your model until you
     * accept it", and the tray said "Nothing goes in on its own". Same rule,
     * four grammars, and two of them named the wrong object.
     *
     * Kept through the M27 rename: the tab's name changed, the sentence about
     * what enters did not, because "your ontology" is what a finding has always
     * called the object and the tab now teaches the word rather than assuming
     * it. */
    const prose = SOURCES.map((f) => rendered(f.text)).join("\n");
    // M28: copy. The one form is "nothing joins your model until you accept
    // the draft". The rule is unchanged and so is its force: one grammar for one
    // invariant, on every surface that states it. M42 named the object the
    // sentence used to call "it", which could be read as the model itself.
    /* M64, L19: the form no longer opens on "Nothing". It says what is true of
     * a suggestion, which is the owner's own example of the rewrite. */
    const said = [...prose.replace(/\s+/g, " ").matchAll(/[Aa] suggestion (?:enters|joins) your [a-z]+ only when you accept it/g)].map(
      (m) => m[0].toLowerCase(),
    );
    expect(said.length).toBeGreaterThanOrEqual(3);
    // M63, ISC-614: the object is the ontology, in the owner's terms.
    expect([...new Set(said)]).toEqual(["a suggestion joins your ontology only when you accept it"]);
  });
});

// ---------------------------------------------------------------------------

describe("one verb per decision role, and no verb on a control that decides nothing", () => {
  /**
   * The second half of FND-06, which the first half left standing.
   *
   * decisions.ts ended five decline verbs on /design/context and its header
   * named the pair it did not end: "Not yet" on the station decision row and
   * "Not now" on the interview, three hundred pixels apart in the same column,
   * same role, and nothing on the screen saying which was which. The station
   * reads `DECISION_VERBS.defer.label` now.
   *
   * And a third, which is worse than a near miss. TwinPanel's confirm dialog
   * offered "Show it anyway" and "Not yet", where "Not yet" called
   * `setConfirming(false)` and wrote nothing at all. Everywhere else in the app
   * that word was a recorded declination: the station's defer appends a bound
   * event and redraws the rail inside a second, and DECISION_VERBS.defer's own
   * contract is "Records that you looked and set it aside for now". A control
   * that reads as a recorded declination and records nothing is the one thing
   * this tool cannot ship, and it is exactly the failure the `meaning` field in
   * decisions.ts was tightened to prevent one round earlier, in the same
   * vocabulary, on a different surface.
   */
  test("no surface invents a defer verb beside the shared one", async () => {
    const { DECISION_VERBS } = await import("../src/ui/components/decisions.ts");
    const offenders: string[] = [];
    for (const { path, text } of SOURCES) {
      const prose = rendered(text);
      // "Not yet" is the retired label. "Not now" is the interview's, and it is
      // allowed on exactly the file that owns the question being deferred.
      if (prose.includes("Not yet")) offenders.push(`${path}: Not yet`);
      // M62: the Help panel names the interview's moves to say what they do.
      if (prose.includes("Not now") && path !== "workbench/Dialogue.tsx" && path !== "ui/pageHelp.ts") {
        offenders.push(`${path}: Not now`);
      }
    }
    expect(offenders.sort()).toEqual([]);
    /* And the surface that still offers a defer takes defer's own word rather
     * than a fourth, which is what stops the pair re-forming.
     *
     * That surface was the station until M47, which dropped defer from the step:
     * a step nobody has answered already reads "nothing said here yet" on the
     * rail, so the press recorded a state the rail was showing anyway. The tray
     * is where a set-aside has somewhere to live, so the word is held there. */
    const tray = SOURCES.find((f) => f.path === "workbench/ProposalsTrayView.tsx");
    expect(rendered(tray?.text ?? "")).toContain(DECISION_VERBS.defer.label);
    const station = SOURCES.find((f) => f.path === "flow/StationWorkspace.tsx");
    expect(rendered(station?.text ?? "")).not.toContain(DECISION_VERBS.defer.label);
  });

  test("a control that writes nothing does not wear a decision verb", () => {
    /* TwinPanel's cancel says "Back" now, which is what DecisionGroup and
     * FindingRow already call leaving a panel without deciding. Held as a
     * property of the file rather than of a render, because what is wrong with
     * the old string is what the handler beside it does, and that pairing is
     * only visible in the source. */
    const twin = rendered(SOURCES.find((f) => f.path === "workbench/TwinPanel.tsx")?.text ?? "");
    expect(twin).toContain("setConfirming(false)");
    expect(twin).toContain("Back");
    for (const verb of ["Not yet", "Not now", "Decide later", "Decline"]) {
      expect({ verb, worn: twin.includes(verb) }).toEqual({ verb, worn: false });
    }
  });

  test("the reason panel names the role, not one surface's wording of it", async () => {
    // It said "Why you are turning it down", which is the /ontology tray's verb,
    // on the only surface that mounts this component and does not use it.
    const group = rendered(
      await Bun.file(`${ROOT}ui/components/DecisionGroup.tsx`).text(),
    );
    // M42: the label took the contraction the copy standard asks for; the role
    // it names is unchanged, which is what this test protects.
    expect(group).toContain("Why you're declining");
    expect(group).toContain("Reject");
    expect(group).not.toContain("Why you are turning it down");
  });
});
