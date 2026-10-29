/**
 * The App Shell and Entry surfaces: the introduction and /studies (SHL).
 *
 * Three defects, three properties.
 *
 * The introduction described a navigation model the app does not have. It said
 * "down the left of every study is a rail with these eight on it", and there is
 * no left rail on any of the ten routes: the eight stations are a loop across
 * the top of one of six study views, and the other five have no rail at all. It
 * also sent the reader to "Claude" and to "Bias × Context Matrix", neither of
 * which is the name of anything the app bar or the study bar renders. Prose is
 * not covered by types and does not throw, so the check is the same shape
 * claims.test.ts uses: the sentence is held against the thing that would make
 * it true, which here is `STUDY_TAB_LABEL` and `parseHash`.
 *
 * The studies list carried one fact per study, the day it was named, and drew
 * the control that destroys a study heavier than the study. The counts it
 * carries now have to be the same counts the study's own Design tab shows, or
 * the summary is worse than no summary; that correspondence is asserted against
 * the projections the workbench composes rather than against a fixture.
 *
 * And removing is two steps. The first step must not be able to destroy
 * anything, which is a property of the rendered row rather than of a handler
 * name, so the row is rendered in both states and read back.
 */

import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StudyRow,
  byMostRecent,
  createReason,
  studiesSummary,
  studyState,
  type StudyState,
} from "../src/ui/ProjectList.tsx";
import { resumeLine } from "../src/ui/Introduction.tsx";
import { STUDY_TABS, STUDY_TAB_LABEL, parseHash } from "../src/ui/routes.ts";
import { STATIONS } from "../src/flow/stations.ts";
import { emptyBrief, type Project } from "../src/state/projects.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { inInbox, projectConcepts } from "../src/concepts/projection.ts";
import { addConceptEvents } from "../src/concepts/door.ts";
import { projectProposals } from "../src/proposals/projection.ts";
import { projectInterview } from "../src/interview/state.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;
const INTRO = await Bun.file(`${SRC}ui/Introduction.tsx`).text();
const SHELL_CSS = await Bun.file(`${SRC}ui/styles/shell.css`).text();

/** Comments explain the defect by name, so only rendered prose is in scope. */
function rendered(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ---------------------------------------------------------------------------
// A synthetic study, built the way the app builds one.
// ---------------------------------------------------------------------------

const PROJECT_ID = "study-shell-entry";
let clock = 1_760_000_000_000;
function at(): number {
  clock += 1000;
  return clock;
}
function envelope() {
  return { id: crypto.randomUUID(), ts: at(), actor: "human" as const, projectId: PROJECT_ID };
}

const QUESTION: LedgerEvent = {
  ...envelope(),
  type: "question-selection",
  moveId: "m1",
  topic: "station:site",
  question: "Why this site rather than another?",
  alternatives: ["Why now?"],
  mode: "interrogation",
  reason: "The site is unstated and everything downstream depends on it.",
};

const EVENTS: readonly LedgerEvent[] = [
  { ...envelope(), type: "bound", subject: "context", statement: "Night-shift handoffs." },
  // D3: the tension station merged into `bind`.
  { ...envelope(), type: "bound", subject: "bind:not-yet", statement: "Deferred; not settled yet." },
  {
    ...envelope(),
    type: "ontology-mutation",
    op: "create",
    targetId: "p1",
    pageType: "puzzle",
    origin: "author-prior",
    title: "Why do stories thin out across a handoff?",
    // M75: each claim cites a passage, so each is a data statement the Statements column counts.
    supportingChunks: ["ch-1"],
  },
  {
    ...envelope(),
    type: "ontology-mutation",
    op: "create",
    targetId: "t1",
    pageType: "theory",
    origin: "model-proposed",
    title: "Compression under time pressure",
    supportingChunks: ["ch-2"],
  },
  {
    ...envelope(),
    type: "proposal",
    proposalId: "prop-1",
    pageType: "observation",
    title: "Nurses read the chart aloud",
    sourceChunks: [],
  },
  {
    ...envelope(),
    type: "proposal",
    proposalId: "prop-2",
    pageType: "rival",
    title: "The thinning is an artefact of the recording",
    sourceChunks: [],
  },
  {
    ...envelope(),
    type: "proposal-adjudication",
    proposalId: "prop-2",
    disposition: "reject",
    reason: "It restates the puzzle rather than rivalling it.",
  },
  QUESTION,
  // Events belonging to another study, to prove the scoping.
  {
    id: crypto.randomUUID(),
    ts: at(),
    actor: "human",
    projectId: "some-other-study",
    type: "bound",
    subject: "site",
    statement: "A different ward entirely.",
  },
];

const PROJECT: Project = {
  id: PROJECT_ID,
  title: "Handoffs on the night ward",
  stage: "design-brief",
  brief: {
    ...emptyBrief(),
    researchQuestion: "How do patient stories change across the night-shift handoff?",
    context: "A teaching hospital ward.",
  },
  createdAt: 1_759_000_000_000,
};

const STATE = studyState({ project: PROJECT, events: EVENTS, corpusChunkIds: [] });
/* M73, ISC-659: one accepted concept, for the project cell's concepts. */
const WITH_CONCEPT = studyState({
  project: PROJECT,
  events: [...EVENTS, ...addConceptEvents(EVENTS, { projectId: PROJECT_ID, name: "Night handoff", definition: "The handoff between shifts at night." })],
  corpusChunkIds: [],
});

// ---------------------------------------------------------------------------

describe("the studies list reads the same projections the study itself reads", () => {
  test("statements, staged and turns are the projections, not a second estimate", () => {
    const graph = projectOntology(EVENTS, PROJECT_ID);
    const view = projectConcepts(EVENTS, PROJECT_ID, graph);
    // M73: every statement in the model, and every suggestion waiting on a decision.
    // M75: the summary and data statements only.
    expect(STATE.statements).toBe([...view.statements.values()].filter((s) => inInbox(s.from)).length);
    expect(STATE.concepts).toBe(view.accepted.length);
    expect(STATE.staged).toBe(
      projectProposals(EVENTS, PROJECT_ID).pending.length +
        view.suggested.length +
        view.suggestedRelations.length +
        view.suggestedStatements.length,
    );
    expect(STATE.turns).toBe(projectInterview(EVENTS, PROJECT_ID).turns);
    expect(STATE.questionOnTable).toBe(projectInterview(EVENTS, PROJECT_ID).outstanding !== null);
    // Vacuity guard: a state of all zeroes would satisfy every line above.
    expect(STATE.statements).toBeGreaterThan(0);
    expect(WITH_CONCEPT.concepts).toBe(1);
    expect(STATE.staged).toBe(1);
    expect(STATE.turns).toBe(1);
    expect(STATE.questionOnTable).toBe(true);
  });

  // D3: eight stations became seven.
  test("the gauge reads the rail's own station states, all seven of them", () => {
    expect(STATE.stations).toHaveLength(STATIONS.length);
    expect(STATE.stations.map(([id]) => id)).toEqual(STATIONS.map((s) => s.id));
    const byId = new Map(STATE.stations);
    expect(byId.get("context")).toBe("stated");
    // M69, ISC-641: an earlier set-aside stays on the record and draws no state of its own.
    expect(byId.get("bind")).toBe("empty");
    expect(byId.get("sample")).toBe("empty");
    expect(STATE.answered).toBe(1);
  });

  test("touched is the study's own last event, not another study's", () => {
    const mine = EVENTS.filter((e) => e.projectId === PROJECT_ID);
    const last = Math.max(...mine.map((e) => e.ts));
    expect(STATE.touchedAt).toBe(last);
    // The other study's event is later in the array and must not count.
    expect(STATE.touchedAt).toBeLessThan(Math.max(...EVENTS.map((e) => e.ts)));
  });

  test("an untouched study reads as its creation moment rather than as 1970", () => {
    const fresh = studyState({
      project: { ...PROJECT, id: "fresh", brief: emptyBrief() },
      events: EVENTS,
      corpusChunkIds: [],
    });
    expect(fresh.touchedAt).toBe(PROJECT.createdAt);
    expect(fresh.answered).toBe(0);
    expect(fresh.questionOnTable).toBe(false);
  });

  test("most recent first", () => {
    const older: StudyState = { ...STATE, touchedAt: 1 };
    expect([older, STATE].sort(byMostRecent)[0]).toBe(STATE);
  });

  test("the summary counts studies and the ones with something waiting", () => {
    expect(studiesSummary([])).toContain("You haven't added a project yet");
    expect(studiesSummary([STATE])).toBe("1 project, 1 with something for you to do.");
    const calm: StudyState = { ...STATE, questionOnTable: false, staged: 0 };
    expect(studiesSummary([calm])).toBe("1 project. You're up to date on every project.");
  });

  // Restated, not weakened (coherence round three). It pinned two literals,
  // "a question waiting" and "1 staged", which were this line's own words for
  // two objects every other surface names differently: the Design banner and
  // the /studies row both say "question on the table", and the Ontology tab
  // heads the staged population "Waiting to go into your model". The property
  // the test was protecting is the ordering — outstanding facts before standing
  // ones — plus the fact that a calm study claims nothing is outstanding. Both
  // are still asserted. What is added is the property the literals were
  // accidentally pinning the wrong side of: the words match the /studies
  // columns this line summarises.
  test("the resume line names what is outstanding before what is there, in the columns' own words", () => {
    const line = resumeLine(STATE);
    expect(line.indexOf("an open question")).toBe(0);
    // M42: the columns' own words, and this line said "1 waiting" and "2 pages"
    // for the same two numbers. M73: the column is Statements now.
    expect(line).toContain("1 suggestion to review");
    expect(line).toContain("2 statements");
    // Outstanding before standing: whatever is waiting on the researcher is
    // read before the size of what they already have.
    expect(line.indexOf("1 suggestion to review")).toBeLessThan(line.indexOf("2 statements"));
    const calm: StudyState = { ...STATE, questionOnTable: false, staged: 0 };
    expect(resumeLine(calm)).not.toContain("waiting");
    expect(resumeLine(calm)).not.toContain("on the table");
  });

  test("Create study says what it is waiting to read", () => {
    expect(createReason("")).toBe("Name the project first.");
    expect(createReason("  ")).not.toBeNull();
    expect(createReason("A study")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("removing a study takes two steps and only the second one destroys", () => {
  const row = (armed: boolean) =>
    renderToStaticMarkup(
      createElement(StudyRow, {
        row: STATE,
        armed,
        onArm: () => {},
        onCancel: () => {},
        onRemove: () => {},
      }),
    );

  test("at rest there is no destructive control in the row at all", () => {
    const html = row(false);
    expect(html).toContain("study-remove");
    expect(html).not.toContain("btn-danger");
    expect(html).not.toContain("study-confirm");
    // And the resting control names the study, so a screen reader hears which
    // one it is about rather than the ninth "Remove" on the page.
    expect(html).toContain(PROJECT.title);
    // M71, ISC-651: the visible label names its object (L4), "Delete project",
    // where it read a bare "Delete" the owner did not find.
    expect(html).toContain("Delete project<span");
  });

  test("armed, it says what is lost and what is kept, and offers a way out", () => {
    const html = row(true);
    expect(html).toContain("btn-danger");
    expect(html).toContain("Cancel");
    expect(html).toContain("documents and passages");
    expect(html).toContain("stay in History");
  });

  test("the study outweighs the control that destroys it", () => {
    // The defect in one line: a 14px/400 title 16px from a 76x39 outlined red
    // button. Held on the sheet rather than on a screenshot, because the
    // relation is what matters and it is declared, not measured.
    const title = /\.study-title \{[^}]*\}/.exec(SHELL_CSS)?.[0] ?? "";
    const remove = /\.study-remove \{[^}]*\}/.exec(SHELL_CSS)?.[0] ?? "";
    expect(title).toContain("font-size: var(--text-title)");
    expect(remove).toContain("font-size: var(--text-small)");
    // The control's own rule adds no border and no fill of its own. M71 changed
    // what it is at rest: a quiet button (.btn-quiet carries the register) in
    // place of faint bare text, because the owner looked for the delete and did
    // not see it. Still small and still not the destroy palette.
    expect(remove).not.toContain("background");
    expect(remove).not.toContain("border");
    expect(remove).not.toContain("--ink-faint");
    expect(row(false)).toContain('class="btn-quiet study-remove"');
  });

  test("every count in the row is the route to the view it is about", () => {
    // A number with no way out of it is a dead end, and a row of navigation
    // links beside a row of counts is the same information written twice.
    const html = row(false);
    for (const tab of ["design", "ontology"]) {
      expect(html).toContain(`href="#/study/${PROJECT_ID}/${tab}`);
    }
    // M84, ISC-705: the Messages count (questions Abductive asked) went, so four.
    // M89: the Flags count went with the checks, so three.
    expect([...html.matchAll(/class="study-metric"/g)]).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------

describe("the introduction describes the navigation the app has", () => {
  test("it does not claim a rail down the left of a study", () => {
    // There is no left rail on any route. The claim survived because prose is
    // not covered by types, which is the whole reason this file exists.
    const text = rendered(INTRO);
    expect(text).not.toContain("Down the left");
    expect(text).not.toMatch(/rail (with|down|on the left)/i);
  });

  test("it says which tab holds the steps, in the app's one word for the thing you click", () => {
    const text = rendered(INTRO);
    /* D8 (M27): the sentence that listed the tab names is gone, so the loop
     * that checked every label went with it.
     *
     * The property it was built for was "the landing page teaches the map the
     * app actually has", and the sentence had stopped doing that: by M27 it
     * named six tabs of which one had been renamed and one had left the bar,
     * and it said Material twice. A list of names on a landing page is copy
     * that can only go stale, because the bar is what renders them and each
     * link now carries its own sentence saying when to open it. What is still
     * asserted is the half that cannot go stale: which tab holds the steps, and
     * that the intro does not teach a second word for a tab. */
    //
    // Restated from `toContain("Design view")` (coherence round three). The
    // property was "the intro says which of the six holds the eight stations",
    // and that is still asserted; the literal was the app's second word for the
    // navigational object. Four sentences elsewhere said "the Coherence tab",
    // "the Biases tab", "the Ontology tab"; three said "view", for six things
    // rendered as role="tab" in a tablist. The reader clicks a tab. The second
    // assertion is what stops the pair drifting apart again, and it is the
    // reason this is a restatement rather than a swapped string.
    expect(text).toContain("Design tab");
    for (const tab of STUDY_TABS) {
      expect({ tab, saidTwoWays: text.includes(`${STUDY_TAB_LABEL[tab]} view`) }).toEqual({
        tab,
        saidTwoWays: false,
      });
    }
  });

  test("every link the introduction offers resolves to a real route", () => {
    // parseHash falls back to the intro for anything it does not recognise, so
    // a dead link on the landing page is a link back to the landing page. Both
    // offenders were of exactly that shape in spirit: `#/auth` and `#/matrix`
    // resolved, but under names no bar in the app renders.
    const hrefs = [...rendered(INTRO).matchAll(/href="(#\/[^"]*)"/g)].map((m) => m[1] ?? "");
    expect(hrefs.length).toBeGreaterThan(1);
    for (const href of hrefs) {
      expect({ href, view: parseHash(href).view }).not.toEqual({ href, view: "intro" });
    }
  });

  test("the two named destinations are named the way the app names them", () => {
    const text = rendered(INTRO);
    // M56: the card is Model access.
    expect(text).toContain("Model access");
    expect(text).not.toContain("Bias × Context Matrix");
    expect(parseHash("#/settings").view).toBe("settings");
    // M89: the Biases entry went with the checks, and its address falls through.
    expect(parseHash("#/biases").view).toBe("studies");
  });

  test("Anti: the checks would fail on the paragraph that shipped", () => {
    // Every green check in this repo's history that stopped matching the thing
    // it was named for did so silently, so each matcher is exercised.
    const shipped =
      "Down the left of every study is a rail with these eight on it. Set that up under Claude.";
    expect(shipped).toContain("Down the left");
    expect(/rail (with|down|on the left)/i.test(shipped)).toBe(true);
    expect(parseHash("#/nowhere-at-all").view).toBe("intro");
  });
});
