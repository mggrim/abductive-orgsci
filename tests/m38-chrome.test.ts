/**
 * The chrome, the rail, the record and the papers (M38, ISC-492 … ISC-494, 499).
 *
 * What the interface investigation found was not a defect in a page. The tool is
 * built as one record with conversations as events in it, and it is presented as
 * eight chats behind five tabs with the record collapsed at the foot of one of
 * them. Iqbal and Horvitz measured what that costs: a suspended thread less than
 * a quarter visible takes significantly longer to come back to than one mostly
 * on screen, and eight conversations behind five tabs hide seven of eight by
 * construction.
 *
 * So the four claims here are claims about the chrome, and three of them can
 * only be made by rendering:
 *
 *   ISC-492  the one open question is in the study header on every tab, it names
 *            where it is, and the link lands there. The study list's chip reads
 *            the same call, so the list and the header cannot disagree.
 *   ISC-493  every rail cell carries a line from the projection, the framing is
 *            the eighth cell, and the line adds no colour channel.
 *   ISC-494  one control in the study header opens the record from all five
 *            tabs, and the timeline is the first thing in it.
 *   ISC-499  the papers can be read beside the framing, each with its verdict
 *            and what the reader drew out of it.
 *
 * The greyscale check is a source assertion rather than a render, for the reason
 * styles-integrity.test.ts gives: a stylesheet has no parser in this suite and a
 * legibility failure passes every other gate. What it reads is the three rules
 * M38 added to the rail, and what it asserts is that they carry one ink and one
 * size between them and nothing else.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { LedgerEvent, PaperBaseline } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

/* The two things on these surfaces that would call a model, stubbed and put
 * back. `mock.module` is process-wide and the process is shared, so the real
 * namespace is spread in and restored afterwards; see m37-station-chat.test.ts,
 * which learned this the hard way. */
const realPaperFit = { ...(await import(`${SRC}flow/usePaperFit.ts`)) };
await mock.module(`${SRC}flow/usePaperFit.ts`, () => ({
  ...realPaperFit,
  usePaperFit: () => async () => 0,
  useJudgeOnMount: () => undefined,
  openedCounts: () => new Map(),
}));
afterAll(() => {
  void mock.module(`${SRC}flow/usePaperFit.ts`, () => realPaperFit);
});

const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: undefined, live: false }),
}));
afterAll(() => {
  void mock.module(`${SRC}ui/personaRun.ts`, () => realPersonaRun);
});

const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const { AppShell } = await import(`${SRC}ui/AppShell.tsx`);
const { StationRail } = await import(`${SRC}flow/StationRail.tsx`);
const { MotivationPage } = await import(`${SRC}flow/FramingBand.tsx`);
const { studyState } = await import(`${SRC}ui/ProjectList.tsx`);
const projects = await import(`${SRC}state/projects.ts`);
const routes = await import(`${SRC}ui/routes.ts`);
const places = await import(`${SRC}views/placeSummary.ts`);
const lines = await import(`${SRC}ui/placeLines.ts`);
const { citationKey } = await import(`${SRC}proposals/paperFit.ts`);
const { STUDY_TABS } = routes;

// ---------------------------------------------------------------------------
// The record, as a fixture
// ---------------------------------------------------------------------------

let seq = 0;
const uid = () => `dddddddd-3888-4888-8888-${String((seq += 1)).padStart(12, "0")}`;
const envelope = (actor: string, projectId: string) => ({
  id: uid(),
  ts: 1_700_000_000_000 + (seq += 1),
  actor,
  projectId,
});

function ask(projectId: string, station: string, question: string): LedgerEvent {
  return {
    ...envelope("system", projectId),
    type: "question-selection",
    moveId: `conversation:${station}@1`,
    topic: `station:${station}`,
    question,
    alternatives: [],
    mode: "interrogation",
    reason: "Asked as a follow-up in the conversation here.",
    station,
  } as LedgerEvent;
}

function said(projectId: string, station: string, text: string): LedgerEvent {
  return { ...envelope("human", projectId), type: "response", text, station } as LedgerEvent;
}

function answers(projectId: string, to: LedgerEvent, text: string): LedgerEvent {
  return {
    ...envelope("human", projectId),
    type: "response",
    text,
    inReplyTo: to.id,
  } as LedgerEvent;
}

function draft(projectId: string, station: string, fromTurnIds: readonly string[]): LedgerEvent {
  return {
    ...envelope("persona:interviewer", projectId),
    type: "brief-draft",
    station,
    text: "the drafted answer",
    fromTurnIds,
    model: "claude",
    modelVersion: "test-1.0",
  } as LedgerEvent;
}

function judged(
  projectId: string,
  paperKey: string,
  paperName: string,
  verdict: string,
  baselines?: readonly PaperBaseline[],
): LedgerEvent {
  return {
    ...envelope("system", projectId),
    type: "paper-fit",
    paperKey,
    paperName,
    verdict,
    reason: `${paperName} speaks to handovers.`,
    framingDigest: "the framing as it stands",
    ...(baselines === undefined ? {} : { baselines }),
  } as LedgerEvent;
}

const SITE_WORDS = "The church hall, because it is the only one in the town.";
const CONTEXT_QUESTION = "What is going on in this setting that made you look twice?";

/**
 * One study, and enough of a record to make every indicator say something.
 *
 * A conversation at Site with two turns and the researcher's own first words, a
 * conversation at Context with an open question and a draft nobody has taken up,
 * and nothing at all at the other five steps, because a rail whose cells all say
 * something is not the rail a researcher actually meets.
 */
async function study(id: string, options: { readonly open?: boolean } = {}) {
  await projects.saveProject({
    id,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: {
      ...projects.emptyBrief(),
      startingInterest: "night shifts",
      researchQuestion: "expected a clean handover, found a drift",
    },
  } as never);
  const events: LedgerEvent[] = [];
  const siteSaid = said(id, "site", SITE_WORDS);
  events.push(siteSaid, said(id, "site", "About a dozen fixers come."));
  const contextAsked = ask(id, "context", CONTEXT_QUESTION);
  events.push(contextAsked);
  if (options.open === false) events.push(answers(id, contextAsked, "They hand over at seven."));
  events.push(draft(id, "site", [siteSaid.id]));
  return events;
}

async function storeWith(events: readonly LedgerEvent[]) {
  const store = new InMemoryLedgerStore();
  for (const event of events) await store.append(event);
  return store;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function goTo(hash: string) {
  window.location.hash = hash;
}

async function mount(node: React.ReactElement, store: InstanceType<typeof InMemoryLedgerStore>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(LedgerProvider, { store }, node));
  });
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
  return { host, root };
}

function find(host: Element, id: string): Element | null {
  return host.querySelector(`[data-testid="${id}"]`);
}
function press(el: Element | null) {
  const key = Object.keys(el ?? {}).find((k) => k.startsWith("__reactProps$"));
  const props = key === undefined ? undefined : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
  props?.onClick?.({ preventDefault() {} });
}

// ---------------------------------------------------------------------------
// The route, and the words
// ---------------------------------------------------------------------------

describe("the framing is somewhere a link can land (ISC-492, ISC-493)", () => {
  test("the router's segment and the projection's place id are the same string", () => {
    // Written twice because the projection may not import the router and the
    // router may not import the projection. This is the cheap half of the trade.
    expect(routes.FRAMING_SECTION_ID).toBe(places.FRAMING_PLACE_ID);
  });

  test("a place's link lands on the place", () => {
    expect(routes.placePath("s1", "site")).toBe("#/study/s1/design/site");
    /* M53, ISC-540. The framing's place is the first tab now. */
    expect(routes.placePath("s1", places.FRAMING_PLACE_ID)).toBe("#/study/s1/motivation");
    expect(routes.parseHash(routes.motivationPath("s1"))).toMatchObject({
      view: "study",
      projectId: "s1",
      tab: "motivation",
    });
    // A field rides in the hash and parses back out; a station link carries none.
    expect(routes.motivationFieldRequested(routes.motivationPath("s1", "framing-venue"))).toBe(
      "framing-venue",
    );
    expect(routes.parseHash(routes.motivationPath("s1", "framing-venue"))).toMatchObject({
      view: "study",
      tab: "motivation",
    });
    expect(routes.motivationFieldRequested(routes.motivationPath("s1"))).toBeNull();
    expect(routes.motivationFieldRequested(routes.placePath("s1", "site"))).toBeNull();
    // And the old dock link still lands on a study route rather than the intro.
    expect(routes.parseHash("#/study/s1/design/framing")).toMatchObject({ view: "study", tab: "design" });
  });
});

describe("what a surface says about a place", () => {
  /* M84, ISC-706: the header's open-question line and its helper went. */
  test("a place nothing has happened at says nothing", () => {
    const empty = {
      place: "site",
      label: "Site",
      title: null,
      turns: 0,
      answer: "empty",
      draftWaiting: false,
      openQuestion: false,
      waiting: 0,
      lastTs: null,
    } as const;
    expect(lines.placeStateParts(empty)).toEqual([]);
    /* States, in the order a researcher would act on them.
     *
     * M49 (ISC-530) took the turn count out of this line. A cell saying "14
     * turns" reports how much was typed there, which is not a fact anybody
     * decides by, and it put a number under all eight cells of the one surface
     * meant to read as a design rather than as a tally. What is waiting on the
     * researcher stays, and a place where nothing has happened still says
     * nothing at all. */
    expect(lines.placeStateParts({ ...empty, turns: 3 })).toEqual([]);
    expect(lines.placeStateParts({ ...empty, turns: 1, draftWaiting: true })).toEqual([
      "suggestion to review",
    ]);
    expect(lines.placeStateLine({ ...empty, turns: 2, waiting: 1 })).toBe("1 claim to review");
  });
});

// ---------------------------------------------------------------------------
// ISC-492, the chrome
// ---------------------------------------------------------------------------

/* M84, ISC-706 (a co-author, 2026-10-07: move between the steps "without
 * Abductive wanting the user to jump back and answer a specific question"). The
 * header's line went from every tab; the study list's chip still marks a project
 * with a question open, off the same call. */
describe("the open question is a state on the study list, not a line in the header (ISC-492; M84, ISC-706)", () => {
  test("the header carries no line, and the study list still reads the same call", async () => {
    const events = await study("m38-open");
    const store = await storeWith(events);
    goTo("#/study/m38-open/material");
    const { host, root } = await mount(React.createElement(AppShell), store);
    expect(find(host, "studybar-open")).toBeNull();
    expect(host.textContent ?? "").not.toContain("Go to the open question at");
    const project = await projects.getProject("m38-open");
    const state = studyState({ project: project as NonNullable<typeof project>, events, corpusChunkIds: [] });
    expect(state.questionOnTable).toBe(true);
    expect(places.openQuestionAt(events, "m38-open")).toMatchObject({ place: "context" });
    root.unmount();
  });
});

// ---------------------------------------------------------------------------
// ISC-493, the rail
// ---------------------------------------------------------------------------

describe("every rail cell says what its conversation produced (ISC-493)", () => {
  test("the researcher's own words, the counts, and nothing where nothing happened", async () => {
    const events = await study("m38-rail");
    const store = await storeWith(events);
    goTo("#/study/m38-rail/design/context");
    const { host, root } = await mount(
      React.createElement(StationRail, {
        focused: "context",
        states: new Map([["site", "stated"]]),
        onFocus: () => undefined,
      }),
      store,
    );

    const site = find(host, "rail-line-site");
    expect(site).not.toBeNull();
    // The title is the researcher's first words at that place, cut at a word by
    // the projection, never a sentence the tool wrote about what they meant.
    expect(site?.textContent ?? "").toContain(SITE_WORDS);
    // M49 (ISC-530): the turn count came off the cell. What is waiting stays.
    expect(site?.textContent ?? "").not.toContain("turns");
    expect(site?.textContent ?? "").toContain("suggestion to review");

    // A step nobody has been to carries no line at all, which is what keeps the
    // rail from reading as seven boxes to clear.
    expect(find(host, "rail-line-outcome")).toBeNull();
    expect(find(host, "rail-line-sample")).toBeNull();
    root.unmount();
  });

  /* M58, ISC-566 replaced "the framing is the eighth cell, above the loop": Design
   * shows nothing of Starting point, so the rail has no cell for it. */
  test("the rail has no Starting point cell (M58, ISC-566)", async () => {
    const events = await study("m38-rail-framing");
    const store = await storeWith(events);
    goTo("#/study/m38-rail-framing/design/context");
    const { host, root } = await mount(
      React.createElement(StationRail, {
        focused: "context",
        states: new Map(),
        onFocus: () => undefined,
      }),
      store,
    );

    expect(find(host, "rail-item-framing")).toBeNull();
    expect(find(host, "rail-framing")).toBeNull();
    expect(host.textContent ?? "").not.toContain("Starting point");
    expect(find(host, "rail-loop")).not.toBeNull();
    root.unmount();
  });

  test("the cell holding the open question wears the mark the legend defines", async () => {
    const events = await study("m38-rail-mark");
    const store = await storeWith(events);
    goTo("#/study/m38-rail-mark/design/site");
    const { host, root } = await mount(
      React.createElement(StationRail, {
        focused: "site",
        states: new Map(),
        onFocus: () => undefined,
      }),
      store,
    );

    /* "?" is the legend's own "the tool has an open question about this", and
       until M38 the study's one outstanding question raised it nowhere. The
       state comes off the projection now rather than out of a second
       computation, and it is unioned with the lint findings that already
       raised it. */
    const context = host.querySelector('.rail-item[data-station="context"]');
    expect(context?.getAttribute("data-state")).toBe("flagged");
    const site = host.querySelector('.rail-item[data-station="site"]');
    expect(site?.getAttribute("data-state")).not.toBe("flagged");
    root.unmount();
  });

  test("the line adds no colour channel and no second size", async () => {
    /* Greyscale, as a source check. The rail's four glyphs are the encoding on
       this surface and M32 bought that deliberately, moving off hue after five
       of eight dots measured as the destroy red. A hue on the new line would
       spend it back, and a stylesheet has no parser in this suite. */
    const css = await Bun.file(`${SRC}ui/styles/design.css`).text();
    const rules = ["\\.rail-line", "\\.rail-said", "\\.rail-state"]
      .map((selector) => new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "")
      .join("\n");
    expect(rules.trim().length).toBeGreaterThan(0);

    // One ink and one size between the three of them, both from the token file.
    expect([...rules.matchAll(/color:\s*([^;]+);/g)].map((m) => (m[1] ?? "").trim())).toEqual([
      "var(--ink-muted)",
    ]);
    expect([...rules.matchAll(/font-size:\s*([^;]+);/g)].map((m) => (m[1] ?? "").trim())).toEqual([
      "var(--text-micro)",
    ]);
    // And nothing that draws a second channel: no hex, no ground, no rule, no
    // weight, and none of the hue tokens the encodings use.
    for (const forbidden of [
      /#[0-9a-f]{3,8}/i,
      /background/,
      /border/,
      /font-weight/,
      /var\(--(?:accent|ok|warn|notice|page-|origin-|family-)/,
    ]) {
      expect({ forbidden: String(forbidden), found: forbidden.test(rules) }).toEqual({
        forbidden: String(forbidden),
        found: false,
      });
    }

    /* The eighth cell's own ink rule (.rail-framing a) went with the cell at M58. */
  });
});

// ---------------------------------------------------------------------------
// ISC-494, the record
// ---------------------------------------------------------------------------

describe("the record opens from every tab, one level deep (ISC-494)", () => {
  test("the control is on all five tabs", async () => {
    const events = await study("m38-record");
    for (const tab of STUDY_TABS) {
      const store = await storeWith(events);
      goTo(`#/study/m38-record/${tab}`);
      const { host, root } = await mount(React.createElement(AppShell), store);
      expect({ tab, control: find(host, "record-open") !== null }).toEqual({ tab, control: true });
      // The same control, reached the same way, rather than five surfaces each
      // offering their own.
      expect(host.querySelectorAll('[data-testid="record-open"]')).toHaveLength(1);
      /* And it carries the attribute the keyboard model resolves. The bindings
         table says `g r` points at `[data-kbd="record"]`, and keyboard.test.ts
         can only check that the table names a selector; whether anything in the
         app answers to it is a fact about this surface. */
      expect(host.querySelectorAll('[data-kbd="record"]')).toHaveLength(1);
      root.unmount();
    }
  });

  test("pressing it shows the timeline first, with no fold in front of it", async () => {
    const events = await study("m38-record-open");
    const store = await storeWith(events);
    goTo("#/study/m38-record-open/exports");
    const { host, root } = await mount(React.createElement(AppShell), store);

    const panel = find(host, "record-panel") as HTMLDialogElement | null;
    expect(panel).not.toBeNull();
    // Closed until asked for, and it costs nothing until then.
    expect(panel?.open ?? false).toBe(false);
    expect(find(host, "instrumentation-body")).toBeNull();

    await act(async () => {
      press(find(host, "record-open"));
    });
    for (let i = 0; i < 8; i += 1) {
      await act(async () => {
        await wait(5);
      });
    }

    expect((find(host, "record-panel") as HTMLDialogElement | null)?.open ?? false).toBe(true);
    const body = find(host, "instrumentation-body");
    expect(body).not.toBeNull();
    // One level: the panel is the press, and the timeline is the first thing in
    // it. No "Show History" button and no fold above the timeline.
    expect(find(host, "instrumentation-toggle")).toBeNull();
    expect(find(host, "instrumentation-what")).toBeNull();
    const inner = body?.innerHTML ?? "";
    expect(inner.indexOf('data-testid="ledger-panel"')).toBeGreaterThan(-1);
    for (const later of ["territory-view", "asking-view", "coverage-panel"]) {
      const at = inner.indexOf(`data-testid="${later}"`);
      if (at === -1) continue;
      expect({ later, first: inner.indexOf('data-testid="ledger-panel"') < at }).toEqual({
        later,
        first: true,
      });
    }
    root.unmount();
  });

  test("the panel gives back the page-foot spacing the section was written with", async () => {
    /* The section carried a top margin, a rule and padding under it, which is how
       it separated itself from the work above at the foot of Design. Inside a
       panel whose own header does that job, the three are a void under the
       heading, and a stylesheet has no parser in this suite. */
    const css = await Bun.file(`${SRC}ui/styles/shell.css`).text();
    const rule =
      /\.recordpanel \.instrumentation\[data-hosted="true"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    for (const zeroed of ["margin-top: 0", "border-top: 0", "padding-top: 0"]) {
      expect({ zeroed, found: rule.includes(zeroed) }).toEqual({ zeroed, found: true });
    }
  });
});

// ---------------------------------------------------------------------------
// ISC-499, the papers beside the framing
// ---------------------------------------------------------------------------

describe("the papers can be read beside the framing (ISC-499)", () => {
  test("each paper, its verdict, what it expects, and a link to it on Material", async () => {
    const id = "m38-papers";
    const typed = "Bechky 2003, Sharing meaning across occupational communities";
    const unjudged = "Barley 1986, Technology as an occasion for structuring";
    await projects.saveProject({
      id,
      title: "night wards",
      stage: "design-brief",
      createdAt: 1,
      brief: {
        ...projects.emptyBrief(),
        startingInterest: "night shifts",
        researchQuestion: "expected a clean handover, found a drift",
        seminalCorpus: `${typed}\n${unjudged}`,
      },
    } as never);
    const baseline: PaperBaseline = {
      id: "b1",
      expectation: "Handover breaks down where two occupations share no vocabulary.",
      scope: "occupational communities inside one organisation",
    };
    const store = await storeWith([
      judged(id, citationKey(typed), typed, "fits", [baseline]),
    ]);

    const project = await projects.getProject(id);
    goTo(`#/study/${id}/design/context`);
    const { host, root } = await mount(
      React.createElement(MotivationPage, {
        project: project as NonNullable<typeof project>,
        onChanged: () => undefined,
      }),
      store,
    );

    const fold = find(host, "framing-papers-read");
    expect(fold).not.toBeNull();
    expect(fold?.textContent ?? "").toContain("Paper expectations");

    const judgedRow = find(host, `framing-paper-${citationKey(typed)}`);
    expect(judgedRow).not.toBeNull();
    expect(judgedRow?.textContent ?? "").toContain("Bechky 2003");
    /* M51, ISC-533. The chip says the tool has read the paper, in the words every
       other surface says it in, and it no longer says how the paper fared. */
    expect(judgedRow?.querySelector('[data-testid="paper-fit-read"]')).not.toBeNull();
    expect(judgedRow?.textContent ?? "").not.toContain("fits your setting");
    // And the expectation the reader drew, which is the thing a researcher can
    // argue with.
    expect(judgedRow?.textContent ?? "").toContain(baseline.expectation);
    // Each row goes to the paper on Material.
    expect(judgedRow?.querySelector("a")?.getAttribute("href")).toBe(
      `#/study/${id}/material/literature`,
    );

    /* A paper nobody has judged says so, rather than looking like a paper that
       passed. "Judged and fine" and "never judged" were the two states the old
       build could not tell apart, and an absent expectation list is not an empty
       one. */
    const other = find(host, `framing-paper-${citationKey(unjudged)}`);
    expect(other).not.toBeNull();
    expect(other?.querySelector('[data-testid="paper-fit-unjudged"]')).not.toBeNull();
    expect(other?.textContent ?? "").not.toContain(baseline.expectation);
    root.unmount();
  });
});
