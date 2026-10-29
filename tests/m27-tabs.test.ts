/**
 * The bar, the two renamed pages and the landing page (M27, decisions D1, D6,
 * D7, D8).
 *
 * What was measured on the running app before this wave, against the fixture
 * study:
 *
 *   THE BAR. Six items, three of them terms of art, rendered from a bare string
 *   map with no title, no description and no hover, and nothing on any screen
 *   saying when to open one of them. Material was behind all three analysis
 *   tabs, so the Early data station asked "what has your material already shown
 *   you" two tabs before the tab that holds the material.
 *
 *   THE MODEL PAGE. The drafts tray, the only block on the page waiting on a
 *   decision, was the last child of the left column: 1007px of that column's
 *   1412, under the drawing, the key, the authorship counts, the page table and
 *   a full read-only transcript.
 *
 *   THE CHECKS PAGE. Five of its eight checks return null and skip silently
 *   until the framing fields are set, and the page said nothing about it. Its
 *   sibling tab's empty state read "which tells you how far the work has got.
 *   It is not a clean bill of health", which tells a researcher on their second
 *   screen that they have not got far and gives them nothing to do about it.
 *
 *   THE LANDING PAGE. The second block was four cards about the tool's own
 *   mechanics, and the stations section opened by naming six tabs, one of which
 *   had been renamed, one of which had left the bar, and one of which it named
 *   twice.
 *
 * These are source censuses rather than renders, deliberately and for the
 * reason landmarks.test.ts gives: both views mount a ledger context and an
 * IndexedDB handle to say anything at all, and a test that stubs those tests
 * the stubs. What is pure is tested as a function: the route resolution, the
 * framing predicate, the spelled count.
 */

import { describe, expect, test } from "bun:test";
import {
  LITERATURE_SECTION_ID,
  STUDY_TABS,
  STUDY_TAB_LABEL,
  STUDY_TAB_TITLE,
  literaturePath,
  literatureRequested,
  parseHash,
  studyPath,
} from "../src/ui/routes.ts";
import { OBSTACLES_HEADING, spelled } from "../src/ui/Introduction.tsx";
import { DEFAULT_STATION, STATIONS } from "../src/flow/stations.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

/**
 * Source with comments stripped, so the tool's own voice is what is inspected.
 * Several of these files explain the defect in a comment that quotes the markup
 * it removed, and a naive substring match reads the explanation as the fix.
 */
async function prose(rel: string): Promise<string> {
  const raw = await Bun.file(`${SRC}${rel}`).text();
  return raw
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const ONTOLOGY = await prose("ui/ConceptsView.tsx");
const HELP = (await Bun.file(new URL("../src/ui/pageHelp.ts", import.meta.url).pathname).text()).replace(/\s+/g, " ");
const INTRO = await prose("ui/Introduction.tsx");
const SHELL = await prose("ui/AppShell.tsx");

/** Where a substring first appears, asserted to be found before it is compared. */
function at(haystack: string, needle: string): number {
  const i = haystack.indexOf(needle);
  expect({ needle, found: i !== -1 }).toEqual({ needle, found: true });
  return i;
}

// ---------------------------------------------------------------------------

describe("the bar is five tabs in the order the work happens (D1, M53; M89)", () => {
  // M53, ISC-540: the theoretical motivation is the first tab, before Design.
  // M89 (2026-10-14): Checks was tabled, so the bar has five tabs.
  test("the order is motivation, design, material, your model, exports", () => {
    expect([...STUDY_TABS]).toEqual(["motivation", "design", "material", "ontology", "exports"]);
  });

  test("the labels are the words, not the terms of art", () => {
    expect(STUDY_TABS.map((t) => STUDY_TAB_LABEL[t])).toEqual([
      "Starting point",
      "Design",
      "Sources",
      // M63, ISC-609: the owner's three words.
      "Emerging project ontology",
      "Export",
    ]);
  });

  test("Biases is not a tab, and no label is a term of art it retired", () => {
    // The grid is a reference map of where the tool watches. It is not a place
    // a first-year works, and its own empty state said so.
    expect(STUDY_TABS as readonly string[]).not.toContain("biases");
    const labels = Object.values(STUDY_TAB_LABEL);
    expect(labels).not.toContain("Ontology");
    expect(labels).not.toContain("Coherence");
    expect(labels).not.toContain("Biases");
  });

  test("every tab carries the sentence that says when you come here", () => {
    expect(Object.keys(STUDY_TAB_TITLE).sort()).toEqual([...STUDY_TABS].sort());
    for (const tab of STUDY_TABS) {
      const title = STUDY_TAB_TITLE[tab];
      // A sentence, not a label repeated: it has to say something the label
      // does not, and it has to end.
      expect({ tab, words: title.split(/\s+/).length >= 8 }).toEqual({ tab, words: true });
      expect({ tab, ends: title.trim().endsWith(".") }).toEqual({ tab, ends: true });
      expect({ tab, echoes: title === STUDY_TAB_LABEL[tab] }).toEqual({ tab, echoes: false });
    }
  });

  /* M69, ISC-640 (Matthew, 2026-10-02: "When you hover over the tabs, the hover
   * text appears over top of the text that shows right below"): the sentence
   * leaves the native title and shows in the one line under the strip for the
   * tab under the pointer or the focus, and describes the tab for a screen
   * reader. */
  test("and the bar spends it on the tab rather than on a legend somewhere", () => {
    expect(SHELL).not.toContain("title={STUDY_TAB_TITLE[t]}");
    expect(SHELL).toContain(": STUDY_TAB_TITLE[t])");
    /* Inside the tablist, so it reaches every tab rather than one.
     *
     * M49 (ISC-528): the strip maps `tabs`, the earned subset, rather than
     * `STUDY_TABS` itself. The subset is filtered out of `STUDY_TABS` in
     * `views/earnedTabs.ts`, so the order and the membership are still that one
     * declaration; what this line anchors on is the map that renders the link. */
    // M62, ISC-607: the map renders a greyed tab or a link; M69: each one is described by its line.
    expect(at(SHELL, "{tabs.map((t) =>")).toBeLessThan(at(SHELL, "aria-describedby={inertNoteId(`tab-${t}`)}"));
  });

  test("Anti: the census would notice a bar that dropped the description", () => {
    expect('<a data-label={L} data-testid={T}>'.includes("aria-describedby={inertNoteId(`tab-${t}`)}")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("the retired Biases and Checks links resolve rather than 404 (D1, D7; M89)", () => {
  /* M89 (2026-10-14): the Checks tab and the bias grid on it were tabled, so a
   * per-study link to either falls through to Design and the global ones open
   * the project list. Nothing 404s. */
  test("a per-study biases or coherence link lands on Design", () => {
    for (const slot of ["biases", "coherence"]) {
      expect(parseHash(`#/study/abc/${slot}`)).toEqual({
        view: "study",
        projectId: "abc",
        tab: "design",
        station: DEFAULT_STATION,
      });
    }
  });

  test("the retired /project spelling of it lands there too", () => {
    // A co-author may be holding either, and a link that dies is worse than one
    // that lands a little to the left of where it used to.
    expect(parseHash("#/project/abc/biases")).toMatchObject({
      view: "study",
      projectId: "abc",
      tab: "design",
    });
  });

  test("the global #/biases and #/matrix open the project list", () => {
    expect(parseHash("#/biases")).toEqual({ view: "studies" });
    expect(parseHash("#/matrix")).toEqual({ view: "studies" });
  });

  test("Anti: a live tab's path is unaffected by the resolution", () => {
    for (const tab of STUDY_TABS) {
      expect(parseHash(studyPath("abc", tab))).toMatchObject({ projectId: "abc", tab });
    }
  });
});

// ---------------------------------------------------------------------------

describe("the papers are a path segment, not a fragment (D5)", () => {
  /**
   * The defect this closes, measured on the router rather than argued.
   *
   * D2 writes the link out of the Framing band as
   * `#/study/:id/material#literature`, which is how a link to a section is
   * written on a site that does not route on the hash. This one does, so
   * `parseHash` reads the tab slot as "material#literature", finds it is
   * neither a station nor a tab, and falls through the catch-all onto the
   * DESIGN tab. Nothing throws and nothing is logged: the researcher presses
   * "Upload papers" and lands back where they started.
   */
  test("Anti: the fragment spelling opens the Design tab, which is the bug", () => {
    expect(parseHash("#/study/abc/material#literature")).toMatchObject({
      view: "study",
      projectId: "abc",
      tab: "design",
    });
  });

  test("the path spelling opens Material", () => {
    expect(literaturePath("abc")).toBe("#/study/abc/material/literature");
    expect(parseHash(literaturePath("abc"))).toEqual({
      view: "study",
      projectId: "abc",
      tab: "material",
      station: DEFAULT_STATION,
    });
  });

  test("and it resolves without a branch of its own, on a property worth pinning", () => {
    // `material` fills the tab slot and `literature` fills the station slot,
    // where anything that is not a station falls back to DEFAULT_STATION. That
    // is why routes.ts needed no parseHash edit for this pair, and it holds
    // only while no station is called literature.
    expect(STATIONS.map((s) => s.id)).not.toContain(LITERATURE_SECTION_ID);
    expect(parseHash("#/project/abc/material/literature")).toMatchObject({
      view: "study",
      tab: "material",
    });
  });

  test("literatureRequested reads that path and nothing else", () => {
    expect(literatureRequested(literaturePath("abc"))).toBe(true);
    expect(literatureRequested("#/study/abc/material/literature/")).toBe(true);
    expect(literatureRequested("#/project/abc/material/literature")).toBe(true);
    expect(literatureRequested("#/study/abc/material")).toBe(false);
    expect(literatureRequested("#/study/abc/design/context")).toBe(false);
    expect(literatureRequested("#/study/abc/biases")).toBe(false);
    // The fragment spelling is not accepted, deliberately: it never reaches the
    // Material tab, so recognising it here would report a landing that the
    // router had already sent somewhere else.
    expect(literatureRequested("#/study/abc/material#literature")).toBe(false);
  });

  test("the two landings are one instrument in the shell", () => {
    expect(LITERATURE_SECTION_ID).toBe("literature");
    expect(SHELL).toContain(
      '{ tab: "material", id: LITERATURE_SECTION_ID, asked: literatureRequested }',
    );
    // Optional lookup, because the section belongs to the Material view and is
    // not landed yet: a build without it must scroll nowhere, not throw.
    expect(SHELL).toContain("document.getElementById(landing.id)?.scrollIntoView");
  });

});

// ---------------------------------------------------------------------------

describe("the Your model page puts the decision first (D6)", () => {
  /* M63, ISC-609 and the lead's rulings: the page is the ontology, in the
   * owner's order. The decision still comes first (the suggestions), the
   * concepts follow, then the statements no concept takes, and the flat list of
   * every statement is last and folded, where the transcript fold used to be. */
  // M67, ISC-634: "Statements to place" replaces the unplaced statements, after the concepts and the relations.
  // M70, ISC-648: one section per kind; inside each grid the suggestions are drawn before the accepted cards.
  test("the suggestions come before the concepts, and the concepts before the statements to place", () => {
    const grid = at(ONTOLOGY, 'data-testid="concept-grid"');
    // M70: the overlay draws the same cards earlier in the file, so the page is read from its grid onward.
    const page = ONTOLOGY.slice(grid);
    const suggested = grid + at(page, "<SuggestionCard key=");
    const accepted = grid + at(page, "<ConceptCardView");
    const unplaced = grid + at(page, "<StatementsToPlace");
    expect(grid).toBeLessThan(suggested);
    expect(suggested).toBeLessThan(accepted);
    expect(accepted).toBeLessThan(unplaced);
  });

  test("All statements is last, and folded", () => {
    const unplaced = at(ONTOLOGY, "<StatementsToPlace");
    const all = at(ONTOLOGY, "<AllStatements view={view}");
    expect(unplaced).toBeLessThan(all);
    const fold = at(ONTOLOGY, '<Disclosure summary="All statements"');
    expect(ONTOLOGY.slice(fold, fold + 200)).not.toContain("defaultOpen");
  });

  test("R3 item 7: the heading is the tab's name and the methods word is glossed in the lede", () => {
    /* The kicker read "your ontology" above the H1, so the first text on the
     * tab was the term of art the rename exists to stop leading with. The
     * methods word is still on the page for the readers who came looking for
     * it, in parentheses on first use inside the lede, which is how every
     * other term of art in the product is introduced. */
    /* M32, R3 and R6. The heading is rendered by the sticky study header off
     * `STUDY_TAB_LABEL`, and the lede is in the `?` popover on the main pane's
     * sub-header. Both facts about the copy are unchanged and both are still
     * checked: the methods word is still on the page, still in parentheses on
     * first use, and still after the opener rather than above it. What can no
     * longer be checked from this file is the h1, because it is not in this
     * file; one-instrument.test.ts holds the shell to rendering it off the
     * table, which is stronger than a typed string. */
    expect(ONTOLOGY).not.toContain("<h1>Your model</h1>");
    expect(ONTOLOGY).not.toContain('data-testid="ontology-kicker"');
    // M62, ISC-600: the lede, gloss and all, is in the page's Help panel.
    // M63, ISC-614: the page is the ontology now, named and glossed in the
    // owner's words, the gloss before anything else on the page.
    expect(HELP).toContain("The concepts that you define for this project, with their definitions, properties and relations.");
  });

  // ProseCodex batch 2: the string moved; the criterion did not.
  test("both ledes are the ones D6 wrote", () => {
    /* M28: copy. Same two ledes, saying "claim" where they said "page".
     * R3 item 4: both now open on when to come here, which existed only in the
     * tab's hover title and so was never on screen. */
    // M62, ISC-600: both ledes left the page for its Help panel, and "here"
    // became the page's name there.
    expect(HELP).toContain(
      // M29b: copy. Claims come out of the papers too, so the lede names both
      // ways in rather than the one it was written for.
      // M63, ISC-614: when to come, in the owner's terms.
      "Abductive suggests concepts after you save a summary at a step or read your data, and you accept, refine or reject each one.",
    );
    // M70, ISC-648: the section empty state now says how concepts arrive, since "a suggestion above" has no section above it.
    expect(ONTOLOGY).toContain("Save a summary at a step on Design, or read your data, and Abductive suggests concepts from your words.");
    // ProseCodex batch 2: the string moved; the criterion did not.
    // M63, ISC-614.
    expect(HELP).toContain("Each concept and each statement carries its authorship mark");
  });

  test("the empty lede no longer sends the researcher to a queue at the foot of the page", () => {
    // It said "none of them enters without you accepting it in the queue at the
    // foot of this page". The queue is the first thing on the page now.
    expect(ONTOLOGY).not.toContain("at the foot of this page");
    expect(ONTOLOGY).not.toContain("Nothing here yet.");
  });

  test("the tray heading asks for the decision rather than naming the destination", async () => {
    const tray = await prose("workbench/ProposalsTrayView.tsx");
    expect(tray).toContain("Suggestions to review");
    expect(tray).not.toContain("Waiting to go into your ontology");
  });

  test("Anti: the order check reads positions, so it would fail on the shipped order", () => {
    const shipped = "<PagePanel /> ... <section className=\"tray-pane\"";
    expect(shipped.indexOf('<section className="tray-pane"')).toBeGreaterThan(
      shipped.indexOf("<PagePanel"),
    );
  });
});

// ---------------------------------------------------------------------------

describe("the introduction leads with what goes wrong, not with how it runs (D8)", () => {
  /* R3: two headings were rewritten, and the claim in each is unchanged.
   *
   * The methods critic owns which nine obstacles these are and what each one
   * claims; it does not own the grammar. Seven headings address the reader in
   * the second person; these two did not. "Familiarity is standing in where a
   * mechanism should be" led on a nominalisation with no reader in it, and
   * "Your early data gets absorbed…" was a get-passive running three clauses.
   * Both now say the same thing about the same obstacle, to somebody. */
  const HEADINGS: readonly string[] = [
    // M83, ISC-697: a co-author's nine questions (2026-10-05), in their order.
    "Have you identified a puzzle or a topic?",
    "Which conversation are you joining?",
    "What drew you to this site over another?",
    "Can your data answer your question?",
    "Is your sample a theoretical or a convenience sample?",
    "Does your data live up to the expectations of the journal that you're aiming at?",
    // M84, ISC-702.
    "Are you moving beyond your informants' statements when you explain the puzzle?",
    "Are you reading your data with an open mind, or through the ideas that you already have?",
    "Do you know where each of your ideas came from?",
  ];

  test("R3: every obstacle heading addresses the reader", () => {
    // Seven of nine already did. The two that did not were the two the copy
    // critic failed, and the rule is what keeps a tenth from arriving in the
    // grammar of a methods paper.
    for (const heading of HEADINGS) {
      expect({ heading, addressed: /\b[Yy]our?\b/.test(heading) }).toEqual({
        heading,
        addressed: true,
      });
    }
  });

  test("the section is there and 'How it runs' is not", () => {
    // M42: the heading opened on "What goes", so it names the nine. The section
    // it heads, and its place above "How to use the tool", are unchanged.
    //
    // M49: the sentence moved out of the JSX into `OBSTACLES_HEADING`, because
    // the walkthrough's third screen carries the same heading and a second copy
    // of it is how the two surfaces come apart. Both halves are asserted, so the
    // check still fails if the heading changes OR if the section stops rendering
    // it.
    expect(OBSTACLES_HEADING).toBe(
      "Abductive helps you answer nine early, critical questions about your research.",
    );
    expect(INTRO).toContain("<h2>{OBSTACLES_HEADING}</h2>");
    expect(INTRO).not.toContain("<h2>How it runs</h2>");
    expect(INTRO).not.toContain("intro-loop");
  });

  test("all nine obstacles are there, in the order a researcher meets them", () => {
    let last = -1;
    for (const heading of HEADINGS) {
      const i = at(INTRO, heading);
      expect({ heading, inOrder: i > last }).toEqual({ heading, inOrder: true });
      last = i;
    }
    expect(HEADINGS.length).toBe(9);
  });

  // M34: the nine became a slider and each card gained a glyph and two labels;
  // the number, the heading and the body are unchanged and still pinned here.
  test("each one is a numbered card carrying a heading and a body", () => {
    expect(INTRO).toContain('listClass="obstacle-cards"');
    // M88: this matched the moves' card, which counted with the map's own `i`;
    // the nine have read their index off a prop since M52 (ObstacleCardBody).
    expect(INTRO).toContain('<span className="obstacle-n">{props.index + 1}</span>');
    expect(INTRO).toContain("<h3>{o.title}</h3>");
    expect(INTRO).toContain("<p>{o.body}</p>");
  });

  test("the verdict lines the critic bracketed are not copy and are not here", () => {
    for (const verdict of ["Weakly addressed", "Well addressed", "badly delivered", "*Weak.*"]) {
      expect({ verdict, present: INTRO.includes(verdict) }).toEqual({ verdict, present: false });
    }
  });

  test("the steps section counts the stations rather than claiming a number", () => {
    // The heading said "The eight stations" while the array behind it was about
    // to hold seven. A landing page that teaches the wrong map costs the reader
    // the first minute of every session.
    // M58: the heading is "The two loops"; the count is read off STATIONS in
    // the sentence that says which tab holds the steps.
    expect(INTRO).toContain("<h2>{STEPS_HEADING}</h2>");
    expect(INTRO).toContain("You answer all ${spelled(STATIONS.length)} steps on the Design tab.");
    expect(INTRO).not.toContain("The eight stations");
    // M28: copy. The lede under the heading no longer repeats the count, which
    // the heading directly above it already reads off STATIONS.
    expect(INTRO).not.toMatch(/\b(eight|seven|six) steps? are open\b/);
  });

  test("spelled writes a small count as a word and gives up above twelve", () => {
    expect(spelled(7)).toBe("seven");
    expect(spelled(8)).toBe("eight");
    expect(spelled(13)).toBe("13");
    // Whatever the station array holds this week, the heading reads as English
    // rather than as a numeral in a sentence.
    expect(spelled(STATIONS.length)).toMatch(/^[a-z]+$/);
  });

  test("the sentence that listed the tab names is gone", () => {
    // It named six tabs of which one had been renamed and one had left the bar,
    // and it said Material twice. The bar renders the names and each link now
    // says when to open it.
    expect(INTRO).not.toContain("A study opens with six tabs");
    expect(INTRO).not.toContain("Design, Material, Ontology, Biases, Coherence");
    // Which tab holds them is still said, because that is the map.
    expect(INTRO).toContain("on the Design tab");
  });

  test("the landing page no longer points at the Checks tab", () => {
    // M89: the sentence that sent the reader to the bias grid went with Checks.
    expect(INTRO).not.toContain('href="#/biases"');
  });

  test("Anti: the nine are read from the rendered page, not from a comment", async () => {
    // The whole point of stripping comments first. The file explains the cut in
    // a comment that names the section it removed, so an unstripped scan would
    // fail the "How it runs is gone" check above for the wrong reason, or pass a
    // future one for the wrong reason.
    const raw = await Bun.file(`${SRC}ui/Introduction.tsx`).text();
    expect(raw).toContain("How it runs");
    expect(INTRO).not.toContain("How it runs");
    expect(INTRO).not.toContain("/*");
  });
});
