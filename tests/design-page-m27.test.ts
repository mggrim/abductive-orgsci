/**
 * The Design page after M27 (decisions D2, D3 and D4).
 *
 * Three changes that look like layout and are not.
 *
 * The Framing band (D2) is the fix for two of the flow critic's findings at
 * once. The four things that frame a whole study were split across two tabs:
 * three behind a `<details>` at the bottom of one station's card, under that
 * station's save row, and the fourth in a 26rem side card on Material. The rail
 * drew a box at the centre of its ring naming two of them, and that box was
 * `aria-hidden` and could not be clicked, so the one element on screen that
 * named the framing was the one element that could not reach it.
 *
 * The step page (D4) is the fix for the third. On a fresh station the only two
 * controls were "Doesn't apply to this study" and "Decide later": the save was omitted
 * outright until the researcher typed, so the first screen of the product
 * offered two ways of not doing the thing and no way of doing it.
 *
 * The NextBar (D4) is the fix for the first: a first-time user could not say
 * what to do next, and the standing bar named three tabs in prose with nothing
 * to click. These are content and order tests, like the station prompts, because
 * the order of the priority rules is the whole claim the bar makes.
 */

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MotivationPage,
  framingCount,
  framingPapersHref,
} from "../src/flow/FramingBand.tsx";
import {
  FRAMING_ASK,
  answeredCount,
  firstUnanswered,
  nextStep,
  nextStepHref,
  type NextStepInput,
} from "../src/workbench/NextBar.tsx";
import { LedgerProvider } from "../src/state/ledgerContext.tsx";
import { InMemoryLedgerStore } from "../src/ledger/ledger.ts";
import { STATIONS, type StationId } from "../src/flow/stations.ts";
import { stationField, stationStates } from "../src/flow/stationBrief.ts";
import { emptyBrief, type Project, type ProjectBrief } from "../src/state/projects.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const read = async (rel: string) => await Bun.file(SRC + rel).text();

/* Read once, at module load. Several of the assertions below are source facts
 * rather than render facts: whether the primary is rendered in both states, and
 * whether a retired component is gone, are both questions about the file. */
const BAND_SRC = await read("flow/FramingBand.tsx");
const STATION_SRC = await read("flow/StationWorkspace.tsx");
const WORKBENCH_SRC = await read("workbench/Workbench.tsx");
/* M41. The band's mount moved out of the Workbench and into the shell, so the
 * question "where is it rendered" is a question about this file now. */
const APPSHELL_SRC = await read("ui/AppShell.tsx");
const RAIL_SRC = await read("flow/StationRail.tsx");
const BAR_SRC = await read("workbench/OutstandingBar.tsx");
const CSS_SRC = await read("ui/styles/design.css");

/** Strip comments, so a probe cannot be answered by prose explaining itself. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const PROJECT_ID = "44444444-4444-4444-4444-444444444444";

function project(brief: Partial<ProjectBrief> = {}): Project {
  return {
    id: PROJECT_ID,
    title: "Handoffs on the night ward",
    stage: "design-brief",
    brief: { ...emptyBrief(), ...brief },
    createdAt: 1,
  };
}

function renderBand(brief: Partial<ProjectBrief> = {}): string {
  return renderToStaticMarkup(
    createElement(LedgerProvider, {
      store: new InMemoryLedgerStore(),
      children: createElement(MotivationPage, { project: project(brief), onChanged: () => {} }),
    }),
  );
}

// ---------------------------------------------------------------------------

describe("the Framing band (D2, reversed at M40)", () => {
  /* Three fields, not four (M40, ISC-508).
   *
   * The puzzle was the second row of this table and it is not a field any more:
   * the tool reads it out of the saved answers and the band shows the reading
   * read-only. The three that are left are unchanged in id, label and stored
   * field, which is the half of this block that was always the criterion. */
  const FIELDS: readonly (readonly [string, keyof ProjectBrief, string])[] = [
    ["framing-starting-interest", "startingInterest", "What is drawing you to this particular research inquiry?"],
    ["framing-seminal-corpus", "seminalCorpus", "Which literatures might be relevant to your exploration?"],
    ["framing-venue", "targetVenue", "Where do you want this project to land?"],
  ];

  test("three fields, each carrying the value of the brief field it writes", () => {
    // The point of the band is that these three are one place. A field that
    // renders someone else's value, or none, is the split this replaced.
    const html = renderBand({
      startingInterest: "night shifts",
      seminalCorpus: "Bechky 2006",
      targetVenue: "US management journals",
    });
    // M92, ISC-752: each field reads as text, under its own test id, until Edit summary.
    for (const [testId, , label] of FIELDS) {
      expect({ testId, present: html.includes(`data-testid="${testId}-text"`) }).toEqual({
        testId,
        present: true,
      });
      expect(html).toContain(label);
    }
    for (const value of ["night shifts", "Bechky 2006", "US management journals"]) {
      expect(html).toContain(value);
    }
  });

  test("and the puzzle is neither asked nor shown here (M40, ISC-508; ISC-587)", () => {
    /* M40 took the question away and put the tool's reading in its place; the M61
     * follow-up (owner, 2026-09-30: "it's already part of the design") took the
     * reading away too. The reading is offered at the Puzzle step, and nothing on
     * this page asks for the puzzle, shows it, or points at it. */
    const html = renderBand({ startingInterest: "night shifts", researchQuestion: "a reading" });
    expect(html).not.toContain("What did you expect to find here, and what did you find instead?");
    expect(html).not.toContain('data-testid="framing-research-question"');
    expect(html).not.toContain('data-testid="framing-puzzle');
    expect(html).not.toContain("Suggested puzzle");
    expect(html).not.toContain("a reading");
  });

  test("each field is bound to its own label, never to a heading above it", () => {
    // ISC-261's criterion, restated for the band. A visible label per field,
    // joined by `for`, because the defect it was written for was a big heading
    // that appeared to name the box under it and named a different one.
    const source = code(BAND_SRC);
    /* Walk fix: two of the three ids are exported constants now, because the
     * NextBar has to put the caret in whichever field is empty and a string
     * repeated in two files is a caret that lands in the wrong box. The
     * criterion is unchanged, the literal it looks for is not. */
    const CONSTANT: Readonly<Record<string, string>> = {
      "framing-seminal-corpus": "{FRAMING_PAPERS_FIELD}",
      "framing-venue": "{FRAMING_VENUE_FIELD}",
    };
    for (const [testId] of FIELDS) {
      const id = CONSTANT[testId] ?? `"${testId}"`;
      expect({ testId, bound: source.includes(`htmlFor=${id}`) }).toEqual({ testId, bound: true });
    }
  });

  test("each field writes its own brief field and no other", () => {
    // Three `onChange` handlers, three distinct keys. Two fields writing one key
    // is how a band like this quietly becomes one field wearing three labels.
    const source = code(BAND_SRC);
    for (const [, briefField] of FIELDS) {
      expect({ briefField, written: source.includes(`{ ${briefField}: e.target.value }`) }).toEqual({
        briefField,
        written: true,
      });
    }
  });

  test("Anti: the band writes no station field, and no station writes framing", () => {
    // The band and the stations are different kinds of thing: a station is a
    // question the tool comes back to, and these are settings for the study.
    const source = code(BAND_SRC);
    for (const station of STATIONS) {
      const field = stationField(station.id);
      if (field === null) continue;
      expect({ field, written: source.includes(`{ ${field}: e.target.value }`) }).toEqual({
        field,
        written: false,
      });
    }
  });

  test("the papers link points at the Material tab's literature section", () => {
    // The judgment the flow critic left open, resolved: the names of the papers
    // are typed while framing, the files live on Material, and the two share one
    // stored field. The link says so rather than making the reader guess.
    expect(framingPapersHref(PROJECT_ID)).toBe(`#/study/${PROJECT_ID}/material/literature`);
    expect(renderBand()).toContain(`href="#/study/${PROJECT_ID}/material/literature"`);
  });

  test("the papers link is an anchor with a real href, not a button in a sentence", () => {
    const html = renderBand();
    expect(html).toContain('data-testid="framing-papers-link"');
    // A <button> is an atomic inline-level box: it cannot fragment across a
    // line break, so a control worn as a word mid-sentence renders as an
    // unbreakable box. base.css says so at `a.linkish, button.linkish`.
    expect(html).not.toContain('<button type="button" data-testid="framing-papers-link"');
  });

  test("the motivation is one page, gathered, mounted as the first tab's body (M53, ISC-540)", () => {
    /* D2 said never folded, M40 folded it, M41 made the fold the app's footer dock,
     * and on 2026-09-26 the owner moved it to a tab of its own: "Move Theoretical
     * Motivation to its own tab in front of Design." What D2 was protecting is still
     * protected: the framing is gathered in one place, reachable from every link
     * that names it, and never split across tabs.
     *
     * So the claims are now: one page, a landmark, every field in it, no fold at its
     * root, and the papers disclosure the deepest level. Mounted by the shell as the
     * body of the `motivation` route and nowhere else. */
    const html = renderBand();
    expect(html).toContain('data-testid="motivation-page"');
    expect(html).toMatch(/^<main[^>]*class="motivation"/);
    expect(html).not.toContain('<details class="framing"');
    expect(html).not.toContain('data-testid="framing-summary"');
    // The papers disclosure is the only fold, one level deep.
    expect(html.split("<details").length - 1).toBeLessThanOrEqual(1);
    for (const [testId] of FIELDS) expect(html).toContain(`data-testid="${testId}-text"`);
    // Not in the Workbench: a second mount would be two surfaces writing one brief.
    const workbench = code(WORKBENCH_SRC);
    expect(workbench).not.toContain("<MotivationPage");
    // (It may import the field count; since M53 the companion default reads it.)
    // Mounted by the shell, once, as a route body inside the content cell.
    const shell = code(APPSHELL_SRC);
    expect(shell.split("<MotivationPage").length - 1).toBe(1);
    expect(shell).not.toContain("<FramingBand");
    expect(shell).toContain('route.tab === "motivation"');
    expect(shell.indexOf("<MotivationPage")).toBeGreaterThan(shell.indexOf('className="shell-content"'));
    expect(shell.indexOf("<MotivationPage")).toBeLessThan(shell.indexOf("<StudyExports"));
  });

  test("the chip says the state, once (ISC-507, M53; M84, ISC-705)", () => {
    const html = renderBand();
    // M84, ISC-705: the chip says the state, with no count.
    expect(html).toContain("Not started");
    expect(html).not.toContain("of 3 answered");
    expect(html).not.toContain('class="framing-decide"');
    expect(html.split('data-testid="framing-status"').length - 1).toBe(1);
  });

  /* M78b, ISC-681 renamed it: each field saves on its own Save answer now (the serendipity walk, finding 2). */
  test("R3 item 1: the band has no save button of its own, and each field saves on its Save answer", () => {
    /* It had one, and it was the second dead primary on the Design page: two
     * identically shaped buttons, both inert on arrival, each with a sentence
     * underneath explaining that it did nothing. One primary per screen is the
     * bar, and the step's save is the one that has to be it.
     *
     * What replaces it is a blur handler on each of the four fields and the
     * completion chip as the only feedback. The chip is asserted rather than
     * the handler alone, because a blur that saved nothing visible would be a
     * silent write. */
    const html = renderBand();
    expect(html).not.toContain('data-testid="save-framing"');
    expect(html).not.toContain("Save your starting point");
    expect(html).not.toContain("goes live once you change one of these four");
    expect(html).toContain('data-testid="framing-status"');
    expect(html).toContain("Not started"); // M84, ISC-705
    const source = code(BAND_SRC);
    // M78b, ISC-681: a field saves on its own Save answer, not on leaving it,
    // so no field carries a blur save; each of the three carries a FieldSave.
    expect(source.split("onBlur={() => void save()}").length - 1).toBe(0);
    // M92 polish: once per field, under unsaved text beside Cancel.
    expect(source.split("<FieldSave").length - 1).toBe(3);
    // The write is still guarded on a real change, so tabbing through four
    // untouched fields appends nothing to the record. Walk fix: the guard moved
    // into the write and now compares against what is on disk rather than
    // against the render's snapshot of it. The intent is the criterion, and it
    // is unchanged; the in-flight boolean it used to share a line with is gone,
    // because that boolean was dropping saves.
    /* Walk fix, round two: the comparison moved into `updateBrief`, which does
     * the read and the write in one transaction so two writers of one brief
     * cannot interleave. `changed` is that comparison's answer. */
    expect(source).toContain("if (written === undefined || !written.changed) return false;");
    // The lead's ruling on ISC-592: a waiting suggestion is left out of the write,
    // and gets its own Save answer under it (none for the band as a whole).
    // M78b: the write now carries only the fields whose Save answer was pressed,
    // filtered out of the same patch, so a waiting suggestion is still left out.
    expect(source).toContain("const all = framingFields(band, pendingRef.current);");
    expect(source).toContain("updateBrief(project.id, patch)");
  });

  test("the count reports how many of the three are answered", () => {
    expect(framingCount(emptyBrief())).toBe(0);
    expect(framingCount({ ...emptyBrief(), startingInterest: "an itch" })).toBe(1);
    expect(
      framingCount({ ...emptyBrief(), startingInterest: "a", seminalCorpus: "c", targetVenue: "d" }),
    ).toBe(3);
    // Whitespace is not an answer.
    expect(framingCount({ ...emptyBrief(), startingInterest: "   " })).toBe(0);
    /* And the puzzle counts for nothing here (M40). It is the tool's reading, so a
     * study whose only filled field is the one the tool wrote must read as a
     * framing nobody has answered rather than as one in three. */
    expect(framingCount({ ...emptyBrief(), researchQuestion: "a puzzle that Abductive read" })).toBe(0);
  });

  test("the rail's inert hub is gone, and both things it named are in the band", () => {
    // The F3 fix. It sat at the geometric centre of a ring of four buttons, in
    // the same visual vocabulary, unclickable and hidden from screen readers.
    const rail = code(RAIL_SRC);
    expect(rail).not.toContain("rail-hub");
    expect(rail).not.toContain("The literature you are contributing to");
    const html = renderBand();
    expect(html).toContain("Which literatures might be relevant to your exploration?");
    expect(html).not.toContain("Which papers are you arguing with?");
    expect(html).toContain("Where do you want this project to land?");
  });
});

// ---------------------------------------------------------------------------

describe("the step page (D4)", () => {
  test("the primary is rendered on every station and its label never changes", () => {
    // It was `omit={dirty ? OMIT_NOTHING : OMIT_ACCEPT}`, so the save did not
    // exist until the researcher typed, and when it appeared it was labelled
    // "Save, and log what changed", which leads with bookkeeping.
    const source = code(STATION_SRC);
    expect(source).toContain("Save answer");
    expect(source).not.toContain("Save, and log what changed");
    expect(source).not.toContain("OMIT_NOTHING");
    // M59, ISC-571: the decision group left the step with "Doesn't apply to
    // this study", so there is no group to omit roles from.
    expect(source).not.toContain("<DecisionGroup");
    expect(source).not.toContain("OMIT_ACCEPT");
  });

  test("R3 item 1: the primary is live in every state, and a press with nothing to save says so", () => {
    /* It was inert until the box changed, with a sentence under it saying so,
     * and the framing band above carried a second inert primary with a second
     * such sentence. No comparable product explains a greyed button twice on
     * one screen.
     *
     * The control is always pressable now. The guard moved inside the handler,
     * where a press with nothing to write is a no-op that reports itself in the
     * chip rather than a paragraph the reader meets before trying. */
    const source = code(STATION_SRC);
    expect(source).not.toContain("inertAttrs");
    expect(source).not.toContain("InertNote");
    expect(source).not.toContain("goes live once you change what is in the box");
    // Never `disabled` either: that would take the one primary on the page out
    // of the tab order, which is the failure the inert pair existed to avoid.
    expect(source).not.toContain("disabled={!dirty}");
    // The no-op path, and the fact that it reports itself. M73 (ISC-658, the
    // lead's ruling): nothing to save means unchanged on disk and already on
    // the record, so an answer on disk with no bound row is saved, not a no-op.
    expect(source).toContain("if (!dirty && !unrecorded) {");
    expect(source).toContain("setNothing(true);");
    expect(source).toContain('"Unchanged"');
  });

  /* M47 made the pair one control, "Doesn't apply to this study". M59 (ISC-571)
   * removed it at Matthew's word and, by the lead's ruling of 2026-09-27, put
   * back a step-level set-aside, because without one the M58 gate would treat a
   * skip as a failure. M69 (ISC-641) took the set-aside out at Matthew's word
   * ("They can just move on"), and the gate reads saved answers only. */
  test("the step offers neither a set-aside nor 'doesn't apply'", () => {
    const source = code(STATION_SRC);
    expect(source).not.toContain("Doesn't apply to this study");
    expect(source).not.toContain('"not-applicable", reason');
    expect(source).not.toContain("Set step aside");
    expect(source).not.toContain("declineStationEvent(");
    const css = code(CSS_SRC);
    expect(css).not.toContain(".station-decide .decision-actions");
    expect(css).not.toContain('content: "·"');
  });

  test("one hint under the box, and the aside's prose is behind a fold", async () => {
    const source = code(STATION_SRC);
    // M28: copy. R3: the reader's tool is the subject rather than their words,
    // and R3 item 8 removed the second copy of it from the framing band.
    // M62, ISC-600: the summary's lede and the step's fold are in Design's
    // Help panel; the step keeps no fold of its own.
    expect(source).not.toContain('summary="Learn more"');
    const help = await Bun.file(new URL("../src/ui/pageHelp.ts", import.meta.url).pathname).text();
    expect(help).toContain("Abductive saves your words exactly as you wrote them.");
    // The 47-word note under the decline row is down to one sentence: its
    // second sentence justified a design decision the researcher is not making.
    expect(source).not.toContain("an outcome variable is the wrong question for plenty of studies");
  });

  test("StationAside is gone, component and stylesheet together", () => {
    // A caption does not get a column. It was a 17rem track holding explanatory
    // prose, third in the reading order between the two things the researcher
    // acts on and the findings the tool produced.
    const source = STATION_SRC;
    expect(source).not.toContain("export function StationAside");
    expect(code(WORKBENCH_SRC)).not.toContain("<StationAside");
    const css = code(CSS_SRC);
    expect(css).not.toContain(".station-aside-head");
    expect(css).not.toContain("17rem");
  });

  // M34 round three: the sentence is built by `stepKicker` in StationLoop.tsx,
  // because the front page's step panel says the same thing about the same
  // seven. Same words, one declaration; the assertion moved from the JSX to the
  // rendered string, which is what it was always about.
  test("the kicker names the step and its loop (M58; M84, ISC-705)", async () => {
    const source = code(STATION_SRC);
    expect(source).toContain("{stepKicker(stationId)}");
    expect(source).not.toContain("Station: {station.label}");
    const { stepKicker } = await import("../src/flow/StationLoop.tsx");
    // M84, ISC-705: the step's loop, with no count.
    expect(stepKicker("process")).toBe("Outer loop · Process");
    expect(stepKicker("bind")).toBe("Inner loop · Bind");
    expect(stepKicker("early-data")).toBe("Outside the loops · Early data");
  });

  test("the standing bar drops the ratio and stops naming a tab", () => {
    // "8 turns · 100% interrogation" was a number with no referent anywhere on
    // the page, and naming a destination in prose with nothing to click is a
    // dead end. The NextBar is the one surface that names a destination now.
    const bar = code(BAR_SRC);
    expect(bar).not.toContain("interrogation`");
    expect(bar).not.toContain('data-testid="mode-ratio"');
    expect(bar).not.toContain("on the Ontology tab");
  });
});

// ---------------------------------------------------------------------------

describe("the NextBar's priority (D4)", () => {
  const states = (answered: readonly StationId[]) => {
    const brief: ProjectBrief = { ...emptyBrief() };
    const filled = answered.reduce<ProjectBrief>((acc, id) => {
      const field = stationField(id);
      return field === null ? acc : { ...acc, [field]: "said something here" };
    }, brief);
    return stationStates(filled, answered.includes("early-data") ? 3 : 0);
  };

  /** The settled study: framing done, every station answered.
   *
   * Walk fix: "framing done" is all four of the band's fields now, not the
   * puzzle alone. The bar's framing rule used to fire on an empty puzzle and
   * send everyone to field one whatever they had written; it fires on the first
   * of the four with nothing in it, so a fixture standing for a study past its
   * framing has to have got past all four. */
  const FRAMED: ProjectBrief = {
    ...emptyBrief(),
    startingInterest: "night shifts on a ward",
    researchQuestion: "expected a decision point, found a drift",
    seminalCorpus: "Bechky 2006",
    targetVenue: "US management journals",
  };

  const SETTLED: NextStepInput = {
    station: "context",
    pendingDrafts: 0,
    brief: FRAMED,
    states: states(STATIONS.map((s) => s.id)),
  };

  /* M84, ISC-706: the open question at another step no longer outranks
   * everything, or appears at all. A co-author (2026-10-07) wanted to move
   * between steps "without Abductive wanting the user to jump back". The rule's
   * three tests went with it; tests/m84-no-pullback.test.tsx pins the absence. */
  test("the next move never sends the researcher back to an open question", () => {
    const step = nextStep({ ...SETTLED, pendingDrafts: 2 });
    expect(step.rule).toBe("drafts");
    expect(step.sentence).not.toMatch(/open question/);
  });

  test("drafts waiting outrank framing and the next station", () => {
    // The researcher's own answer coming back, and the one thing that goes
    // stale.
    const step = nextStep({
      ...SETTLED,
      pendingDrafts: 2,
      brief: emptyBrief(),
      states: states([]),
    });
    expect(step.rule).toBe("drafts");
    /* M28: copy. A draft is not yet a claim in the model, and the old sentence
     * said it was already in there. R3, copy C6: "drafts" was the first noun a
     * returning reader met on the page, unglossed, so the sentence names the
     * object in full. */
    expect(step.sentence).toBe(
      // M29b: copy. The sentence attributed every draft to an answer over a
      // queue where most came from the papers and said so two lines below.
      "You have 2 suggestions to review.",
    );
    expect(step.label).toBe("Review suggestions");
    expect(nextStepHref(PROJECT_ID, step.action)).toBe(`#/study/${PROJECT_ID}/ontology`);
  });

  test("one draft is counted in the singular, on both halves of the line", () => {
    const step = nextStep({ ...SETTLED, pendingDrafts: 1 });
    // M28: copy. R3, copy C6.
    expect(step.sentence).toBe(
      // M29b: copy. Same sentence, singular.
      "You have 1 suggestion to review.",
    );
    expect(step.label).toBe("Review suggestion");
  });

  test("framing outranks the next station", () => {
    // A station answered without the framing is answered against nothing.
    const step = nextStep({
      ...SETTLED,
      brief: emptyBrief(),
      states: states(["context", "site", "process", "outcome"]),
    });
    /* R4 item 7. The sentence and the caret now name the same field.
     *
     * It said "Start with what is puzzling you" and focused field two, which
     * asks what you expected and what you found instead. Most people opening
     * this tool cannot answer that on day one, which is why the band puts
     * "What are you thinking about exploring?" first. The rule still fires on
     * an empty puzzle, which is what makes it the framing rule; only where it
     * sends the reader changed. */
    expect(step.rule).toBe("framing");
    /* M28 r6: copy. The standing bar prefixes this with "Next for you:", so
     * the old wording put two colons in one sentence, and this bar sits beside
     * an "Open Framing" button that already says where to go. */
    expect(step.sentence).toBe("Name the interest that draws you to this research inquiry.");
    expect(step.label).toBe("Open starting point");
    /* M53, ISC-540. The motivation is a tab, so the field is a real route: the
     * href goes to the tab with the field in the hash, and the page marks it. */
    expect(step.action).toEqual({ kind: "focus", field: "framing-starting-interest" });
    expect(nextStepHref(PROJECT_ID, step.action)).toBe(
      `#/study/${PROJECT_ID}/motivation/field-framing-starting-interest`,
    );
  });

  test("Anti: whitespace in a framing field is not an answer", () => {
    /* It was the puzzle field until M40, which is not a field any more: the bar
     * cannot send anyone to fill in the tool's own reading. The claim is unchanged
     * and rides on the venue instead. */
    const step = nextStep({ ...SETTLED, brief: { ...FRAMED, targetVenue: "  \n " } });
    expect(step.rule).toBe("framing");
  });

  test("Anti: the bar never sends anyone to the puzzle (M40, ISC-508)", () => {
    /* The puzzle is the tool's reading of the saved answers, so an empty one is
     * not something the researcher can be asked to fix. A study with every field
     * answered and no reading yet has moved on from the framing rule, which is the
     * property that would break first if `researchQuestion` came back into
     * `FRAMING_FIELDS`: the bar would park on the framing for ever on any study
     * with no model connected. */
    const step = nextStep({ ...SETTLED, brief: { ...FRAMED, researchQuestion: "" } });
    expect(step.rule).not.toBe("framing");
    for (const ask of Object.values(FRAMING_ASK)) {
      expect(ask).not.toContain("expected to find");
    }
  });

  test("the move names whichever of the three is empty, in the order they are asked", () => {
    /* Walk fix. The bar said "Say what you are thinking about exploring" and
     * put the caret in field one whether or not field one was filled, so a
     * researcher who had answered it read an instruction to answer it again.
     * Each field gets the sentence that asks for it, and the caret follows.
     *
     * Three cases, not four: the puzzle left the band at M40. */
    const cases: readonly (readonly [Partial<ProjectBrief>, string, string])[] = [
      [{}, "Name the interest that draws you to this research inquiry.", "framing-starting-interest"],
      [
        { startingInterest: "night shifts" },
        "Name the bodies of work you expect to draw on.",
        "framing-seminal-corpus",
      ],
      [
        { startingInterest: "night shifts", seminalCorpus: "Bechky 2006" },
        "Name the journal that you're aiming at.",
        "framing-venue",
      ],
    ];
    for (const [over, sentence, field] of cases) {
      const step = nextStep({ ...SETTLED, brief: { ...emptyBrief(), ...over } });
      expect({ field, rule: step.rule, sentence: step.sentence, action: step.action }).toEqual({
        field,
        rule: "framing",
        sentence,
        action: { kind: "focus", field },
      });
    }
  });

  test("Anti: all three answered and the bar has moved on", () => {
    // The rule is about the framing being incomplete, so a complete framing
    // must not keep the bar parked on it.
    expect(nextStep({ ...SETTLED, brief: FRAMED }).rule).not.toBe("framing");
  });

  test("otherwise it names the first station with nothing said at it", () => {
    // M58: rail order is the two loops', so Process follows Context.
    const step = nextStep({ ...SETTLED, states: states(["context"]) });
    expect(step.rule).toBe("station");
    expect(step.sentence).toBe("the Process step."); // M78b, ISC-681: the bar no longer reads "Next for you: Next step: …"
    expect(step.label).toBe("Open Process");
    expect(nextStepHref(PROJECT_ID, step.action)).toBe(`#/study/${PROJECT_ID}/design/process`);
  });

  test("first unanswered reads in rail order, not in the order they were answered", () => {
    expect(firstUnanswered(states([]))).toBe(STATIONS[0]?.id);
    expect(firstUnanswered(states(["context", "process"]))).toBe("outcome");
    expect(firstUnanswered(states(["context", "process", "outcome", "site"]))).toBe("puzzle");
    expect(firstUnanswered(states(STATIONS.map((s) => s.id)))).toBeUndefined();
  });

  test("a settled study still says something true rather than going blank", () => {
    // The bar is persistent, so every branch has to render one sentence and one
    // control. A bar that empties is a bar the reader stops looking at.
    const step = nextStep(SETTLED);
    expect(step.rule).toBe("settled");
    expect(step.sentence).toBe("You have answered every step.");
    expect(nextStepHref(PROJECT_ID, step.action)).toBe(`#/study/${PROJECT_ID}/exports`);
  });

  test("R4 item 1: the primary weight follows the move the bar names", () => {
    /* The F2 failure round 3 left standing. The page named one next move and
     * gave the filled button to a different control: on an empty study both
     * bars said to start at the framing and the only primary on the screen was
     * the step's save, attached to a question nobody had been asked yet.
     *
     * The rule is that the weight goes wherever the sentence points. Every move
     * that sends the reader somewhere else carries it; the one move that names
     * the step they are already standing in does not, because the step's own
     * save is the primary for that act and two filled buttons for one act is
     * what round 3 removed. */
    const framing = nextStep({ ...SETTLED, brief: emptyBrief() });
    expect({ rule: framing.rule, primary: framing.primary }).toEqual({
      rule: "framing",
      primary: true,
    });

    const drafts = nextStep({ ...SETTLED, pendingDrafts: 2 });
    expect({ rule: drafts.rule, primary: drafts.primary }).toEqual({
      rule: "drafts",
      primary: true,
    });

    // The one exception, and the reason the flag is on the step rather than a
    // constant: the move is the box the researcher is standing in front of.
    const here = nextStep({
      ...SETTLED,
      station: "context",
      states: states([]),
    });
    expect({ rule: here.rule, station: here.action, primary: here.primary }).toEqual({
      rule: "station",
      station: { kind: "station", station: "context" },
      primary: false,
    });

    // And the same rule pointing at a different step is a journey again.
    const elsewhere = nextStep({
      ...SETTLED,
      station: "site",
      states: states([]),
    });
    expect({ rule: elsewhere.rule, primary: elsewhere.primary }).toEqual({
      rule: "station",
      primary: true,
    });
  });

  test("R4 item 1: the step's save is quiet with an empty box and filled with an answer", () => {
    // Weight only. It is never disabled and never removed, so a keyboard user
    // reaches it in both states and a press is a real press in both.
    const source = code(STATION_SRC);
    expect(source).toContain('className={hasAnswer ? "primary" : "btn-quiet"}');
    expect(source).toContain('const hasAnswer = stationValue(brief, stationId).trim() !== "";');
    expect(source).not.toContain('disabled={');
  });

  test("Anti: every branch renders exactly one sentence and one label", () => {
    const inputs: readonly NextStepInput[] = [
      { ...SETTLED, pendingDrafts: 3 },
      { ...SETTLED, brief: emptyBrief() },
      { ...SETTLED, states: states(["context", "site", "process"]) },
      { ...SETTLED, states: states(["context"]) },
      SETTLED,
    ];
    const rules = new Set<string>();
    for (const input of inputs) {
      const step = nextStep(input);
      rules.add(step.rule);
      expect(step.sentence.trim().length).toBeGreaterThan(10);
      expect(step.label.trim().length).toBeGreaterThan(2);
      // A verb phrase, which is the copy rule for every control in the app.
      // M28: copy. "Read" joins the list; the rule is unchanged.
      expect(/^(Go|Open|Run|Read|Review)\b/.test(step.label)).toBe(true); // M61: Review suggestions
      expect(step.sentence).not.toContain("—");
    }
    // Vacuity guard: the five inputs really do take four different branches
    // (M84, ISC-706: the open-question branch went; M89: the checks branch went).
    expect(rules.size).toBe(4);
  });

  test("answeredCount counts the steps with an answer", () => {
    // M89: the third argument, the steps with an open flag, left with the checks.
    const answered = stationStates(
      { ...emptyBrief(), context: "a ward", siteRationale: "one ward" },
      0,
    );
    expect(answeredCount(answered)).toBe(2);
  });

  test("Anti: an empty station is not an answered one", () => {
    // M69, ISC-641: the set-aside state went; a step with no saved answer counts as not answered.
    const empty = stationStates(emptyBrief(), 0);
    expect(answeredCount(empty)).toBe(0);
  });
});
