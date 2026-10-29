/**
 * A save in the footer dock reaches the surfaces that hold the same brief (M41).
 *
 * The owner's ruling made the framing chrome: "NO!! It needs to look like an app. It
 * needs to be a bar just like the menu bar at the left but as a footer bar that is
 * always present, expandable and collapsible." Moving it up the tree broke something
 * that had been invisible while it sat where it did.
 *
 * The band was mounted by the Workbench and handed the Workbench's own `reload`, so
 * "tell whoever needs to re-read this" was a prop from the one surface that needed
 * to. The shell mounts it now, and three surfaces in this tab hold the same project
 * record: the shell's `current`, which the study header prints from; the Workbench's
 * `project`, which the next-move bar's rule is computed from; and StudyViews'
 * `project` on Material and Exports. None of them is the dock's parent.
 *
 * The existing signal could not carry it. `studyChannel` is a `BroadcastChannel` and
 * a channel never delivers to the tab that posted — deliberately, in both of its
 * implementations, because a tab re-reading on its own write would loop. So the hook
 * gained a second signal, a document event, and `announceHere` is what fires it. The
 * channel was left alone on purpose: making it self-deliver would make
 * `ledgerContext` re-read its own store on its own appends, which is the loop the
 * channel was built to avoid.
 *
 * Three claims, and the middle one is the regression:
 *
 *   the hook     fires on `announceHere` in this tab, still fires on the channel,
 *                and ignores both for another study.
 *   the chain    a venue typed into the dock and blurred changes what the
 *                Workbench's next-move bar says, on the real store, under
 *                StrictMode. Nothing else in the suite holds that: a dock save that
 *                announced nothing would leave the bar naming a move the researcher
 *                had just made, and every test of the band itself would pass.
 *   the wiring   the shell announces rather than reloading something of its own, and
 *                it is the shell that subscribes for `current`.
 */

import "fake-indexeddb/auto";
import { openSummary } from "./openSummary.ts";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import { readFileSync } from "node:fs";
import React, { act, StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";

const SRC = new URL("../src/", import.meta.url).pathname;

/* The two things on this surface that would call a model, stubbed and put back.
 * `mock.module` is process-wide and the process is shared by every test file, so the
 * real namespace is spread in and restored; see m37-station-chat.test.ts, which
 * learned this the hard way. Nothing here is about a model call. */
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

const { AppShell } = await import(`${SRC}ui/AppShell.tsx`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
const freshness = await import(`${SRC}state/useStudyFreshness.ts`);
const { makeStudyChannel } = await import(`${SRC}state/studyChannel.ts`);
const routes = await import(`${SRC}ui/routes.ts`);
const projects = await import(`${SRC}state/projects.ts`);

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

let seq = 0;
const nextId = () => `m41-dock-${(seq += 1)}`;

async function study(id: string, brief: Record<string, unknown> = {}) {
  await projects.saveProject({
    id,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...projects.emptyBrief(), ...brief },
  } as never);
}

/** The props React attached to a node, so its handler can be driven. */
function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined
    ? undefined
    : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
/* React's change tracking does not fire under this DOM, so the handlers React
 * attached to the textarea are called directly. `framing-band-live.test.ts` makes the
 * same call for the same reason: everything after the handler is the component. */
function type(el: HTMLTextAreaElement, value: string) {
  el.value = value;
  reactProps(el)?.onChange?.({ target: el });
}
function blur(el: HTMLTextAreaElement) {
  reactProps(el)?.onBlur?.({ target: el });
}
function find<T extends Element>(host: Element, id: string): T | null {
  return host.querySelector(`[data-testid="${id}"]`) as T | null;
}

async function settle(times = 25) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

/**
 * A subscriber and nothing else.
 *
 * The hook's contract is "call this back", so what it is mounted in is a component
 * whose whole job is to count the calls. Using one of the three real surfaces here
 * would test the surface's own fetching as well and would not say which half failed.
 */
function Probe(props: { projectId: string; onFresh: () => void }) {
  const [, setN] = useState(0);
  const reload = useCallback(() => {
    props.onFresh();
    setN((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  freshness.useStudyFreshness(props.projectId, reload);
  return null;
}

async function mountProbe(projectId: string, onFresh: () => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Probe, { projectId, onFresh }));
  });
  return { host, root };
}

describe("the freshness signal has two halves (M41)", () => {
  test("the event name is written once, beside the channel's", () => {
    /* Modelled on `FRAMING_OPEN_EVENT` and for the same reason it is written in
     * `routes.ts`: more than one module needs the name, and a second one hand-rolling
     * it is two names that agree until one moves. */
    expect(freshness.STUDY_CHANGED_EVENT).toBe("abductive:study-changed");
    expect(typeof freshness.announceHere).toBe("function");
  });

  test("it fires on announceHere, in the tab that announced", async () => {
    /* The half that did not exist. A `BroadcastChannel` never delivers to the tab
     * that posted, so before this the dock's save reached every other tab and no
     * surface in its own. */
    const id = nextId();
    let fired = 0;
    const { root } = await mountProbe(id, () => {
      fired += 1;
    });
    await act(async () => {
      freshness.announceHere(id);
    });
    expect(fired).toBe(1);
    root.unmount();
  });

  test("it still fires on the channel, which is the other tab's half", async () => {
    /* The cross-tab path is untouched, and this is the guard on that: a second signal
     * that quietly replaced the first would leave two tabs disagreeing again, which
     * is the walk finding `studyChannel` exists for. Posted from a second channel
     * instance because that is what another tab is. */
    const id = nextId();
    let fired = 0;
    const { root } = await mountProbe(id, () => {
      fired += 1;
    });
    const otherTab = makeStudyChannel();
    await act(async () => {
      otherTab.post({ projectId: id, kind: "project" });
      await wait(10);
    });
    expect(fired).toBe(1);
    otherTab.close();
    root.unmount();
  });

  test("Anti: another study's news is not this study's", async () => {
    /* Both halves filter on the same id, so a researcher with two studies open does
     * not have one refetched every time the other is written. */
    const id = nextId();
    let fired = 0;
    const { root } = await mountProbe(id, () => {
      fired += 1;
    });
    const otherTab = makeStudyChannel();
    await act(async () => {
      freshness.announceHere(`${id}-elsewhere`);
      otherTab.post({ projectId: `${id}-elsewhere`, kind: "project" });
      await wait(10);
    });
    expect(fired).toBe(0);
    otherTab.close();
    root.unmount();
  });

  test("Anti: unmounting stops listening, on both halves", async () => {
    /* An event listener left on `document` by an unmounted component is a leak that
     * grows with every route change, and the callback it holds closes over a
     * setState on a tree that is gone. */
    const id = nextId();
    let fired = 0;
    const { root } = await mountProbe(id, () => {
      fired += 1;
    });
    root.unmount();
    const otherTab = makeStudyChannel();
    await act(async () => {
      freshness.announceHere(id);
      otherTab.post({ projectId: id, kind: "project" });
      await wait(10);
    });
    expect(fired).toBe(0);
    otherTab.close();
  });
});

// ---------------------------------------------------------------------------
// The chain, end to end
// ---------------------------------------------------------------------------

describe("a save on the motivation tab reaches the page (M41, M53)", () => {
  test("the venue typed on the tab changes what the next-move bar on Design says", async () => {
    /* M53, ISC-540. The dock became the first tab, so the save and the bar are on
     * two routes now. The shell's `current` and the Workbench's project must both
     * have heard the save by the time the researcher crosses to Design. */
    /* The regression this milestone could have shipped, and the only test in the
     * suite that would catch it.
     *
     * Two of the three framing fields are answered, so the bar's rule is "framing"
     * and its sentence names the third. The researcher types the third into the dock
     * and tabs out. The bar is the Workbench's, computed from the Workbench's own
     * copy of the project record, and the dock is three levels above it in the tree
     * with no prop between them. If the save announces nothing in this tab, the bar
     * goes on naming a move that has just been made, and every test of the band
     * itself still passes because the band's own state is right.
     *
     * The real store, the real ledger provider and StrictMode, the same conditions
     * `framing-band-live.test.ts` runs the save loop under. A probe is mounted beside
     * the shell as well, so a failure says which half broke: the announcement or the
     * surfaces' reaction to it. */
    const id = nextId();
    await study(id, {
      startingInterest: "night handovers on one ward",
      seminalCorpus: "Bechky 2006\nBarley 1986",
    });

    let heard = 0;
    const probe = await mountProbe(id, () => {
      heard += 1;
    });

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    window.location.hash = routes.studyPath(id, "design");
    await act(async () => {
      root.render(
        React.createElement(
          StrictMode,
          null,
          React.createElement(LedgerProvider, null, React.createElement(AppShell)),
        ),
      );
    });
    await settle();
    // Before: the framing is short of one answer and Design's bar says so.
    expect(find(host, "next-bar")?.getAttribute("data-rule")).toBe("framing");
    await act(async () => {
      window.location.hash = routes.studyPath(id, "motivation");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();

    await openSummary(host, "framing-journal");
    const venue = find<HTMLTextAreaElement>(host, "framing-venue");
    expect(venue).not.toBeNull();

    await act(async () => {
      type(venue as HTMLTextAreaElement, "A US management journal, ASQ or AMJ.");
    });
    // M78b, ISC-681: the field saves on Save answer, not on leaving it.
    await act(async () => {
      reactProps(find(host, "framing-save-targetVenue") as Element)?.onClick?.({});
      await wait(20);
    });
    await settle();

    // The write landed.
    expect((await projects.getProject(id))?.brief.targetVenue).toBe(
      "A US management journal, ASQ or AMJ.",
    );
    // It was announced in this tab.
    expect(heard).toBeGreaterThan(0);
    // And Design moved on: the bar is not still asking for the framing.
    await act(async () => {
      window.location.hash = routes.studyPath(id, "design");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();
    expect(find(host, "next-bar")).not.toBeNull();
    expect(find(host, "next-bar")?.getAttribute("data-rule")).not.toBe("framing");
    root.unmount();
    probe.root.unmount();
  });
});

// ---------------------------------------------------------------------------
// The wiring
// ---------------------------------------------------------------------------

describe("the shell announces and subscribes (M41)", () => {
  test("the dock's onChanged is an announcement, not a reload of the shell's own", () => {
    /* The shell has no `reload` to hand the dock, and it must not grow one: it already
     * re-reads `current` through its own `useStudyFreshness` subscription, so a second
     * path would be two ways for one surface to refetch one record. `announceHere` is
     * the only thing the dock is given, and every subscriber including the shell's own
     * hears it. */
    const shell = readSource("ui/AppShell.tsx");
    expect(shell).toContain("onChanged={() => announceHere(route.projectId)}");
    expect(shell).toContain("useStudyFreshness(");
    /* And the channel is untouched. Self-delivery there would make `ledgerContext`
     * re-read its own store on its own appends. */
    const channel = readSource("state/studyChannel.ts");
    expect(channel).toContain("A channel never hears its own posts");
  });

  test("all three holders of the brief subscribe, so one announcement is enough", () => {
    /* The dock does not know who they are, which is the property worth pinning: a
     * fourth surface that holds the record subscribes and is served, rather than
     * being added to a list in the dock. */
    for (const file of [
      "ui/AppShell.tsx",
      "workbench/Workbench.tsx",
      "ui/StudyViews.tsx",
    ]) {
      expect({ file, subscribes: readSource(file).includes("useStudyFreshness(") }).toEqual({
        file,
        subscribes: true,
      });
    }
  });
});

/** A source file, for the three claims that are about wiring rather than about a
 * rendered document. */
function readSource(rel: string): string {
  return readFileSync(SRC + rel, "utf8");
}
