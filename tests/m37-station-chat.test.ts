/**
 * The station, rendered, with the conversation in it (M37, ISC-482, ISC-491).
 *
 * The three claims here are the ones only a render can make. The order of the
 * page, because "the conversation is the way a step is answered" is a claim
 * about where things sit and nothing in the model can hold it. The opener
 * speaking once, because the guard has to survive React running an effect twice
 * under StrictMode, which is the shape the duplicate-fire defect in
 * `personaRun` took and the reason the orchestrator has an in-flight map at all.
 * And the offline case, because "no model attached" has to mean no request was
 * made, not a request whose result was thrown away.
 *
 * The real component, inside the real Workbench, over a real IndexedDB and the
 * real ledger provider. The one thing replaced is the inference client, so the
 * turns are deterministic and countable.
 */

import "fake-indexeddb/auto";
import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, describe, expect, test, mock } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MockInferenceClient } from "../src/inference/mock.ts";
import type { CompleteRequest } from "../src/inference/types.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

/**
 * The inference client, swapped for one that says it is live.
 *
 * `activeInferenceClient` reports the mock as not live on purpose, because the
 * offline banner exists to stop a researcher reading fixtures as findings.
 * These tests need both states, so the module is replaced and `live` is set per
 * test. The real namespace is spread and put back in `afterAll`: `mock.module`
 * is process-wide and every test file shares the process, so a replacement
 * holding one export makes the other five vanish for the whole run.
 */
let live = true;
const requests: CompleteRequest[] = [];
class CountingClient extends MockInferenceClient {
  override complete(req: CompleteRequest) {
    requests.push(req);
    return super.complete(req);
  }
}
const realPersonaRun = { ...(await import(`${SRC}ui/personaRun.ts`)) };
await mock.module(`${SRC}ui/personaRun.ts`, () => ({
  ...realPersonaRun,
  activeInferenceClient: () => ({ client: new CountingClient(), live }),
}));
afterAll(() => {
  void mock.module(`${SRC}ui/personaRun.ts`, () => realPersonaRun);
});

/* The paper judge is the other thing on this page that would call a model, and
 * it is not what these tests are about. Stubbed, and put back afterwards, for
 * the reason the persona run is. */
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

const { InMemoryLedgerStore } = await import(`${SRC}ledger/ledger.ts`);
const { Workbench } = await import(`${SRC}workbench/Workbench.tsx`);
const { resetConversationOpeners } = await import(`${SRC}workbench/Dialogue.tsx`);
const { resetInterviewInFlight } = await import(`${SRC}interview/orchestrator.ts`);
const { GAP_MARKER_NOTE } = await import(`${SRC}interview/conversation.ts`);
const projects = await import(`${SRC}state/projects.ts`);
const { LedgerProvider } = await import(`${SRC}state/ledgerContext.tsx`);
/* M53, ISC-540. The motivation is a tab, reached by a link. Imported through the
 * same dynamic path the rest of this file uses, so the mocked modules above are in
 * place first. */
const { motivationPath, studyPath } = await import(`${SRC}ui/routes.ts`);
const { FRAMING_VENUE_FIELD } = await import(`${SRC}flow/FramingBand.tsx`);
/* M41. The framing is the shell's footer dock, so the three tests below that reach
 * for the band mount the shell rather than the Workbench; a Workbench mount renders
 * no band now. Everything else in this file is about a station's own conversation
 * and mounts the Workbench as it did. */
const { AppShell } = await import(`${SRC}ui/AppShell.tsx`);

async function study(id: string, brief: Record<string, unknown> = {}) {
  await projects.saveProject({
    id,
    title: "night wards",
    stage: "design-brief",
    createdAt: 1,
    brief: { ...projects.emptyBrief(), ...brief },
  } as never);
}

async function render(id: string, station: string, existing?: InstanceType<typeof InMemoryLedgerStore>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  // The store is handed in so a test can read the record back without going
  // through a second projection of it, and so two renders can share one record.
  const store = existing ?? new InMemoryLedgerStore();
  await act(async () => {
    root.render(
      React.createElement(
        StrictMode,
        null,
        React.createElement(
          LedgerProvider,
          { store },
          React.createElement(Workbench, { projectId: id, station }),
        ),
      ),
    );
  });
  return { host, root, store };
}

/**
 * The whole shell, at a study's Design tab (M41).
 *
 * The three framing tests in this file need the band, and the band is the shell's
 * footer dock now rather than the Workbench's last child. The shell renders the
 * Workbench at this route, so a mount of it is a superset of `render`'s: the step's
 * own conversation, its answer box and its "Not now" are all still on screen, which
 * is what those tests drive before they reach the band.
 */
async function renderShell(id: string, station: string, existing?: InstanceType<typeof InMemoryLedgerStore>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const store = existing ?? new InMemoryLedgerStore();
  window.location.hash = studyPath(id, "design", station as never);
  await act(async () => {
    root.render(
      React.createElement(
        StrictMode,
        null,
        React.createElement(LedgerProvider, { store }, React.createElement(AppShell)),
      ),
    );
  });
  return { host, root, store };
}

/** The props React attached to a node, so its handler can be driven. */
function reactProps(el: Element): Record<string, (e: unknown) => void> | undefined {
  const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
  return key === undefined
    ? undefined
    : (el as unknown as Record<string, Record<string, (e: unknown) => void>>)[key];
}
function typeInto(el: HTMLTextAreaElement, value: string) {
  el.value = value;
  reactProps(el)?.onChange?.({ target: el });
}
function press(el: Element | null) {
  reactProps(el as Element)?.onClick?.({ preventDefault() {} });
}
/* Reaching for the box, which is what the opener waits for since ISC-497.
 * `focus()` on the element is not enough: happy-dom dispatches a real focus
 * event and React's synthetic handler is attached at the root, so the props
 * are driven directly here the way every other gesture in this file is. */
function focus(el: Element | null) {
  reactProps(el as Element)?.onFocus?.({});
}
function find<T extends Element>(host: Element, id: string): T | null {
  return host.querySelector(`[data-testid="${id}"]`) as T | null;
}

/** Settle the effects, the model call and the appends that follow it. */
async function settle(times = 25) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await wait(5);
    });
  }
}

describe("the step reads top to bottom, with the conversation in the middle", () => {
  test("question, then conversation, then the box you type in, then the answer and Save", async () => {
    live = true;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    await study("m37-order");
    const { host, root } = await render("m37-order", "site");
    await settle();

    const card = host.querySelector('[data-testid="station-workspace"]');
    expect(card).not.toBeNull();
    const text = card?.innerHTML ?? "";
    const at = (id: string) => text.indexOf(`data-testid="${id}"`);

    // M58: the step's question is the tool's first turn in the thread, then
    // the box the researcher types in, then the answer as it stands and the
    // control that commits it.
    expect(at("dialogue")).toBeGreaterThan(-1);
    expect(at("station-prompt")).toBeGreaterThan(at("dialogue"));
    expect(at("transcript")).toBeLessThan(at("station-prompt"));
    expect(at("answer-input")).toBeGreaterThan(at("station-prompt"));
    expect(at("station-answer")).toBeGreaterThan(at("answer-input"));
    // M92 polish: Save answer shows under an open or unsaved summary; at rest, Edit summary.
    expect(at("station-summary-edit")).toBeGreaterThan(at("station-answer"));
    // And the offer to draft from the conversation sits under the summary (M92, ISC-752).
    expect(at("station-summary-generate")).toBeGreaterThan(at("station-answer"));
    root.unmount();
  });
});

describe("the tool speaks first, once you reach for the box (ISC-482, ISC-497)", () => {
  test("arriving at a step spends nothing and leaves no question open", async () => {
    live = true;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    await study("m37-arrive");
    const { host, root } = await render("m37-arrive", "site", new InMemoryLedgerStore());
    await settle();

    /* The measurement behind ISC-497. A pass along a rail of eight places used
     * to cost eight model calls and leave eight questions open, none of them
     * asked because the researcher wanted to work there. Standing at a place is
     * not a decision to work at it. */
    expect(requests).toHaveLength(0);
    // M58: the empty place reads as the tool having asked once. The step's
    // question is the first turn in the thread, and nothing else is in it.
    expect(find(host, "conversation-empty")).not.toBeNull();
    const thread = host.querySelector('[data-testid="transcript"]');
    expect(thread?.querySelectorAll("li")).toHaveLength(1);
    expect(find(host, "station-prompt")?.textContent ?? "").toContain("Why is this the right place");
    root.unmount();
  });

  test("the opener lands when the researcher reaches for the box, and does not speak again", async () => {
    live = true;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    await study("m37-opener");

    const shared = new InMemoryLedgerStore();
    const first = await render("m37-opener", "site", shared);
    await settle();
    expect(requests).toHaveLength(0);

    await act(async () => {
      focus(find(first.host, "answer-input"));
    });
    await settle();
    const opening = requests.length;
    // One turn, even though StrictMode ran the render twice and a researcher
    // can focus, leave and come back faster than a call returns.
    expect(opening).toBe(1);
    await act(async () => {
      focus(find(first.host, "answer-input"));
    });
    await settle();
    expect(requests.length).toBe(opening);

    const transcript = first.host.querySelector('[data-testid="transcript"]');
    /* M74b, ISC-664: the opener leads into the step's question, which the
     * bubble above it carries, so the opener's own closing question is gone. */
    expect(transcript?.textContent ?? "").toContain("That is the part that I want to stay with for a moment.");
    expect(transcript?.textContent ?? "").not.toContain("What did you see that made you say it?");
    // The marked lines are for the record and never for the reader.
    expect(transcript?.textContent ?? "").not.toContain("QUESTION:");
    expect(transcript?.textContent ?? "").not.toContain("BECAUSE:");
    first.root.unmount();

    // A place already holding a conversation never re-opens. The guard is
    // cleared first, so what is being tested is the read of the record rather
    // than the in-memory set that stops the second StrictMode pass.
    resetConversationOpeners();
    resetInterviewInFlight();
    const second = await render("m37-opener", "site", shared);
    await settle();
    await act(async () => {
      focus(find(second.host, "answer-input"));
    });
    await settle();
    expect(requests.length).toBe(opening);
    second.root.unmount();
  });

  /* M58 retired the "Start here" button with the empty state it lived in: the
   * question is on screen as the tool's turn, and reaching for the composer is
   * the intent that opens the conversation (ISC-497 still holds on focus). */
  test("reaching for the composer opens the conversation and the empty mark goes (M58)", async () => {
    live = true;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    await study("m37-starthere");
    const { host, root } = await render("m37-starthere", "site", new InMemoryLedgerStore());
    await settle();
    expect(requests).toHaveLength(0);

    await act(async () => {
      focus(find(host, "answer-input"));
    });
    await settle();
    expect(requests).toHaveLength(1);
    expect(host.querySelector('[data-testid="transcript"]')?.querySelectorAll("li").length ?? 0).toBeGreaterThan(1);
    expect(find(host, "conversation-empty")).toBeNull();
    expect(find(host, "start-here")).toBeNull();
    root.unmount();
  });
});

describe("with no model attached, nothing breaks and nothing is spent (ISC-491)", () => {
  test("the page says how to connect one, and makes no request", async () => {
    live = false;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    await study("m37-offline");
    const { host, root } = await render("m37-offline", "site");
    await settle();

    expect(requests).toHaveLength(0);
    const offline = host.querySelector('[data-testid="conversation-offline"]');
    expect(offline?.textContent ?? "").toContain("Connect a model to talk this through.");
    // And there is no box, because there is nothing to talk to. A chat box that
    // replies with the same canned paragraph at every step is the failure the
    // offline banner exists to prevent, arriving through a working-looking
    // control.
    expect(host.querySelector('[data-testid="answer-input"]')).toBeNull();
    // The rest of the step still renders.
    expect(host.querySelector('[data-testid="station-prompt"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="station-summary-edit"]')).not.toBeNull();
    root.unmount();
  });
});

describe("a draft made of your own words, into the step's box (ISC-487)", () => {
  test("the box is filled unsaved and marked, and saving records the draft it came from", async () => {
    live = true;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    await study("m37-draft");
    const { host, root, store } = await render("m37-draft", "site", new InMemoryLedgerStore());
    await settle();

    // Answer the opener, so there is something of the researcher's to draft
    // from. The tool's own turns are never drafted from.
    const box = find<HTMLTextAreaElement>(host, "answer-input");
    expect(box).not.toBeNull();
    await act(async () => {
      typeInto(box as HTMLTextAreaElement, "The handover sheet was blank three nights running.");
    });
    await act(async () => {
      press(find(host, "send-answer"));
    });
    await settle();

    await act(async () => {
      press(find(host, "station-summary-generate"));
    });
    await settle();

    // M92, ISC-752: the draft reads as text, marked, until a save.
    const answer = find<HTMLElement>(host, "station-text");
    expect(answer?.textContent ?? "").not.toBe("");
    // Marked, so the researcher can see the words did not come from their
    // keyboard, and unsaved, so nothing is on the record as their answer yet.
    expect(answer?.getAttribute("data-drafted")).toBe("true");
    expect(find(host, "station-drafted")?.textContent ?? "").toContain(
      "Abductive wrote this from your replies. Save answer makes the summary yours.", // M62, ISC-598
    );
    /* And what the marker in it is (D1, M43b). The canned draft carries two, the
     * way a real one does when the answer needs something the researcher has not
     * said; the walk of 2026-09-13 met one mid-body with nothing naming it. */
    expect(answer?.textContent ?? "").toContain("[...]");
    expect(find(host, "station-draft-gap")?.textContent ?? "").toBe(GAP_MARKER_NOTE);
    const beforeSave: readonly LedgerEvent[] = await store.readAll();
    expect(
      beforeSave.filter((e) => e.type === "bound" && e.subject === "site"),
    ).toHaveLength(0);
    // And the draft itself is on the record, naming the turns it was made of.
    const draft = beforeSave.find((e) => e.type === "brief-draft");
    expect(draft).toBeDefined();
    expect(draft?.type === "brief-draft" && draft.fromTurnIds.length).toBeGreaterThan(0);

    await act(async () => {
      press(find(host, "save-station"));
    });
    await settle();

    const after: readonly LedgerEvent[] = await store.readAll();
    const bound = after.find((e) => e.type === "bound" && e.subject === "site");
    expect(bound).toBeDefined();
    // The difference this field exists to keep visible: a sentence you accepted
    // is not the same evidence as a sentence you wrote.
    expect(bound?.type === "bound" && bound.draftedFrom).toBe(draft?.id);
    root.unmount();
  });
});

describe("the framing can be talked through (ISC-488)", () => {
  test("the conversation opens inline, and the draft fills the interest", async () => {
    live = true;
    requests.length = 0;
    resetConversationOpeners();
    resetInterviewInFlight();
    await study("m37-framing");
    const { host, root } = await renderShell("m37-framing", "site", new InMemoryLedgerStore());
    await settle();

    // The step's opener waits to be invited now (ISC-497), and this test needs
    // a question open at the step so the band shows its pointer.
    await act(async () => {
      focus(find(host, "answer-input"));
    });
    await settle();

    /* M69, ISC-642: "Not now" went. The researcher leaves the step's question
     * open and moves on; their message at Starting point below changes the
     * subject, which the record writes as a redirection. */
    expect(find(host, "answer-input")).not.toBeNull();

    // Inline, under the two fields it is about, rather than in a modal: a
    // researcher who cannot answer the question above needs to see the question
    // while they talk about it.
    /* M53, ISC-540. The conversation is on the motivation tab, so the researcher
     * crosses to it. The step question above was put down first, so nothing is
     * holding the one open question when they arrive. */
    await act(async () => {
      window.location.hash = motivationPath("m37-framing");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();
    /* ISC-589: open on arrival, so there is no "Open chat" to press first. */
    expect(find(host, "framing-talk-open")).toBeNull();
    const band = find(host, "motivation-page");
    expect(band?.querySelector('[data-testid="dialogue"]')).not.toBeNull();

    const boxes = band?.querySelectorAll('[data-testid="answer-input"]') ?? [];
    const box = boxes[0] as HTMLTextAreaElement | undefined;
    expect(box).toBeDefined();
    await act(async () => {
      typeInto(box as HTMLTextAreaElement, "I am looking at night handovers on one ward.");
    });
    await act(async () => {
      press(band?.querySelector('[data-testid="send-answer"]') ?? null);
    });
    await settle();

    await act(async () => {
      press(find(host, "framing-interest-generate"));
    });
    await settle();

    const interest = find<HTMLElement>(host, "framing-starting-interest-text");
    expect(interest?.textContent ?? "").not.toBe("");
    expect(interest?.getAttribute("data-drafted")).toBe("true");
    /* The lead's ruling on ISC-592: a suggestion lands unsaved, as a step's
     * draft does, and enters the record only when the researcher presses Save
     * answer. (M53's lost draft is answered by re-hydrating unsaved drafts on
     * reload; tests/m61-framing-draft.test.ts holds that path.) */
    expect((await projects.getProject("m37-framing"))?.brief.startingInterest ?? "").toBe("");
    await act(async () => {
      press(find(host, "framing-save-startingInterest"));
    });
    await settle();
    expect((await projects.getProject("m37-framing"))?.brief.startingInterest ?? "").toBe(
      interest?.textContent ?? "<none>",
    );
    /* One field filled, and no puzzle box to leave empty (M40, ISC-508).
     *
     * The case this milestone came from was that the second framing field presumed
     * an expectation, a finding and the conflict between them, and a researcher on
     * day one holds none of the three. M37's answer was to let the box come back
     * empty with a line saying that was fine. M40's is not to have the box: the tool
     * reads the puzzle out of what they have saved, and says whose reading it is.
     *
     * And since the M61 follow-up (ISC-587) the reading is not on this page
     * either: it is offered at the Puzzle step. So no box, and no block. */
    expect(find<HTMLTextAreaElement>(host, "framing-research-question")).toBeNull();
    expect(find(host, "framing-no-puzzle")).toBeNull();
    expect(find(host, "framing-puzzle")).toBeNull();
    expect(host.textContent ?? "").not.toContain("Suggested puzzle");
    root.unmount();
  });

  test("a link naming a field lands on the tab, marks the field and puts the caret in it (M53, ISC-540)", async () => {
    /* The fold and its open event are gone with the dock. What the next-move bar
     * does now is navigate to `#/study/:id/motivation/field-<id>`, and the page that
     * arrives reads the field from the hash. This is the whole path, rendered. */
    live = false;
    resetConversationOpeners();
    resetInterviewInFlight();
    await study("m53-field", { startingInterest: "night shifts" });
    const { host, root } = await renderShell("m53-field", "context", new InMemoryLedgerStore());
    await settle();
    // On Design there is no motivation page and no dock: the tab is its only home.
    expect(find(host, "motivation-page")).toBeNull();
    expect(find(host, "framing-band")).toBeNull();

    await act(async () => {
      window.location.hash = motivationPath("m53-field", FRAMING_VENUE_FIELD);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await settle();
    const page = find(host, "motivation-page");
    expect(page).not.toBeNull();
    expect(document.activeElement?.id).toBe(FRAMING_VENUE_FIELD);
    const marked = [...host.querySelectorAll('.station-field[data-highlight="true"]')];
    expect(marked).toHaveLength(1);
    expect(marked[0]?.querySelector(`#${FRAMING_VENUE_FIELD}`)).not.toBeNull();
    root.unmount();
  });
});
