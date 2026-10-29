/**
 * Where a saved answer came from (M39, ISC-505).
 *
 * Two halves. The projection, which is a fold over events and is tested as one;
 * and the popover, which is tested for the behaviours `RouteHelp.tsx` records a
 * decision against hover cards over: that focus reaches it, that Escape closes
 * it, that a press pins it, and that moving the pointer toward the box does not
 * make it vanish.
 *
 * The claim half is the second subject ISC-505 names. It reads a different set
 * of events — a draft, the accept that let it in, and the create the accept
 * emitted — and returns its own shape, for the three reasons the projection's
 * own header gives. What it must not do is answer for a claim the researcher
 * wrote straight into the model: there is no draft behind one, so there is
 * nothing to say and no control to say it with.
 *
 * The case worth designing against first is the shipped example's. Measured on
 * the example shipped until 2026-09-13 (Gleanline): 0 of 8 `bound` events carried
 * `draftedFrom` and the bundle holds no `brief-draft` at all, because it was
 * exported from the walk of record before drafting shipped, so on it every
 * answer read "you typed this". The example shipped from 2026-09-13 was walked
 * through the conversation, and the drafted branch is now the one a reader
 * meets first; the block at the end of this file pins both branches on it.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useDom, wait } from "./dom.ts";
import { envelope } from "./helpers.ts";
import type {
  BoundEvent,
  BriefDraftEvent,
  LedgerEvent,
  OntologyMutationEvent,
  Origin,
  ProposalAdjudicationEvent,
  ProposalEvent,
  QuestionSelectionEvent,
  ResponseEvent,
} from "../src/ledger/events.ts";
import {
  ACCEPTED_BY,
  MARKED_BY,
  NO_CONVERSATION_LINE,
  ROUTE_LINE,
  answerProvenance,
  cameFromConversation,
  claimOriginLine,
  claimProvenance,
  noTurnsLine,
  turnsBehindClaims,
} from "../src/views/provenance.ts";
import { projectProposals } from "../src/proposals/projection.ts";
import { formatMoment } from "../src/ui/format.ts";
import { originLabel } from "../src/ui/originVocabulary.ts";
import { placeLabel, placeOfTurnId, placeSubjects } from "../src/views/placeSummary.ts";

useDom();

const { act } = await import("react-dom/test-utils");
const { createRoot } = await import("react-dom/client");
const { createElement } = await import("react");
const { ProvenancePopover } = await import("../src/ui/components/ProvenancePopover.tsx");

const PROJECT = "proj-test";
const ROOT = join(import.meta.dir, "..");

function ask(station: string, question = "What is going on here?"): QuestionSelectionEvent {
  return {
    ...envelope("system"),
    type: "question-selection",
    moveId: `conversation:${station}@1`,
    topic: `station:${station}`,
    question,
    alternatives: [],
    mode: "interrogation",
    reason: "Asked as a follow-up in the conversation here.",
    station,
  };
}

function delivered(q: QuestionSelectionEvent): ResponseEvent {
  return {
    ...envelope("persona:interviewer"),
    type: "response",
    text: `Tell me. ${q.question}`,
    inReplyTo: q.id,
  };
}

function answered(q: QuestionSelectionEvent, text: string): ResponseEvent {
  return { ...envelope("human"), type: "response", text, inReplyTo: q.id };
}

function draft(station: string, fromTurnIds: readonly string[]): BriefDraftEvent {
  return {
    ...envelope("persona:interviewer"),
    type: "brief-draft",
    station,
    text: "the drafted answer",
    fromTurnIds,
  };
}

function saved(subject: string, draftedFrom?: string): BoundEvent {
  return {
    ...envelope("human"),
    type: "bound",
    subject,
    statement: "what they wrote",
    ...(draftedFrom === undefined ? {} : { draftedFrom }),
  };
}

describe("the projection reads the record and computes nothing twice", () => {
  test("an answer with no draftedFrom reads as typed, with no turns", () => {
    const events: LedgerEvent[] = [saved("site")];
    const view = answerProvenance({ events, projectId: PROJECT, place: "site" });
    expect(view).not.toBeNull();
    expect(view?.route).toBe("typed");
    expect(view?.routeLine).toBe(ROUTE_LINE.typed);
    expect(view?.turns).toEqual([]);
    expect(view?.noTurnsBecause).toBe("typed");
    expect(noTurnsLine(view!)).toBe("You wrote this answer outside a conversation.");
  });

  test("an answer drafted from a conversation names the turns and where they were said", () => {
    const q = ask("site");
    const bot = delivered(q);
    const mine = answered(q, "The ward is the unit, and access is settled.");
    const d = draft("site", [mine.id, bot.id]);
    const events: LedgerEvent[] = [q, bot, mine, d, saved("site", d.id)];

    const view = answerProvenance({ events, projectId: PROJECT, place: "site" });
    expect(view?.route).toBe("drafted");
    expect(view?.routeLine).toBe(ROUTE_LINE.drafted);
    expect(view?.turns.map((t) => t.who)).toEqual(["you", "the tool"]);
    expect(view?.turns.map((t) => t.place)).toEqual(["site", "site"]);
    expect(view?.turns.map((t) => t.placeLabel)).toEqual(["Site", "Site"]);
    expect(view?.noTurnsBecause).toBeNull();
    expect(noTurnsLine(view!)).toBeNull();
  });

  test("the turns keep the order the draft names them in", () => {
    const q = ask("site");
    const first = answered(q, "one");
    const second = answered(q, "two");
    const d = draft("site", [second.id, first.id]);
    const events: LedgerEvent[] = [q, delivered(q), first, second, d, saved("site", d.id)];
    const view = answerProvenance({ events, projectId: PROJECT, place: "site" });
    expect(view?.turns.map((t) => t.turnId)).toEqual([second.id, first.id]);
  });

  test("nothing saved gives null rather than an empty reading", () => {
    expect(answerProvenance({ events: [], projectId: PROJECT, place: "site" })).toBeNull();
  });

  test("the last save wins, so an edit is not reported as the original", () => {
    const q = ask("site");
    const mine = answered(q, "first pass");
    const d = draft("site", [mine.id]);
    // Drafted, saved, then typed over and saved again.
    const events: LedgerEvent[] = [q, delivered(q), mine, d, saved("site", d.id), saved("site")];
    const view = answerProvenance({ events, projectId: PROJECT, place: "site" });
    expect(view?.route).toBe("typed");
  });

  test("a draft whose event has left the ledger says so rather than showing nothing", () => {
    const events: LedgerEvent[] = [saved("site", "a-draft-that-is-gone")];
    const view = answerProvenance({ events, projectId: PROJECT, place: "site" });
    expect(view?.route).toBe("drafted");
    expect(view?.noTurnsBecause).toBe("draft-missing");
    expect(noTurnsLine(view!)).toBe("The summary that this answer came from is no longer in History.");
  });

  test("a draft naming no turns is a third silence, not the typed one", () => {
    const d = draft("site", []);
    const events: LedgerEvent[] = [d, saved("site", d.id)];
    const view = answerProvenance({ events, projectId: PROJECT, place: "site" });
    expect(view?.noTurnsBecause).toBe("draft-named-none");
    expect(noTurnsLine(view!)).toBe(
      // M42: a turn is the record's word for one message, and the step card,
      // the record and this box now all say message.
      "Abductive wrote this summary without noting the messages behind it, so the list of messages is empty.",
    );
  });

  test("a turn with no station reads as no step rather than a guessed one", () => {
    /* Turns from studies predating M26 carry no station. Naming one would be
     * inventing record, which is the rule placeSummary.ts states. */
    const loose: ResponseEvent = { ...envelope("human"), type: "response", text: "said once" };
    const d = draft("site", [loose.id]);
    const events: LedgerEvent[] = [loose, d, saved("site", d.id)];
    const view = answerProvenance({ events, projectId: PROJECT, place: "site" });
    expect(view?.turns[0]?.place).toBeNull();
    expect(view?.turns[0]?.placeLabel).toBeNull();
  });

  test("the framing has one subject, and a row nothing writes answers nothing (M40)", () => {
    /* It had two, and this test asked about them separately: a popover on the
     * puzzle must not report the starting interest's save. The puzzle is the tool's
     * reading now and files no `bound` row at all, so the framing's saved answer is
     * the starting interest and nothing else.
     *
     * Both halves are asserted, because the second is what would break first if a
     * `research-question` writer came back: the subject is still a legal string and
     * a study carrying one from before M40 must not have it read as the framing's
     * current answer. `placeSubjects` is the one list, so asking for the framing
     * without naming a subject reaches only the interest. */
    const q = ask("framing");
    const mine = answered(q, "the itch");
    const d = draft("framing", [mine.id]);
    const events: LedgerEvent[] = [
      q,
      delivered(q),
      mine,
      d,
      saved("starting-interest", d.id),
      // A row from a study framed before M40. Still on the record, never the
      // framing's answer again.
      saved("research-question"),
    ];
    expect(placeSubjects("framing")).toEqual(["starting-interest"]);
    const interest = answerProvenance({
      events,
      projectId: PROJECT,
      place: "framing",
      subject: "starting-interest",
    });
    expect(interest?.route).toBe("drafted");
    // Asked about the place rather than a subject, it reads the interest's save and
    // not the older puzzle row that happens to sit after it.
    const place = answerProvenance({ events, projectId: PROJECT, place: "framing" });
    expect(place?.route).toBe("drafted");
    expect(place?.recordEventId).toBe(
      events.find((e) => e.type === "bound" && e.subject === "starting-interest")?.id,
    );
  });

  test("another study's events cannot answer this study's question", () => {
    const mine = saved("site");
    const theirs: BoundEvent = { ...saved("site", "some-draft"), projectId: "other-study" };
    const view = answerProvenance({ events: [theirs, mine], projectId: PROJECT, place: "site" });
    expect(view?.route).toBe("typed");
    expect(view?.recordEventId).toBe(mine.id);
  });

  test("the place of a turn is placeSummary's own rule, and this file has no copy of it", async () => {
    // The panes builder wrote a local stand-in while the map's export had not
    // landed; the swap happened at the merge and must not come back.
    const q = ask("sample");
    const mine = answered(q, "twelve interviews");
    const events: LedgerEvent[] = [q, delivered(q), mine];
    expect(placeOfTurnId(events, PROJECT, mine.id)).toBe("sample");
    expect(placeOfTurnId(events, PROJECT, "no-such-turn")).toBeNull();
    const src = readFileSync(join(ROOT, "src/views/provenance.ts"), "utf8");
    expect(src).not.toContain("placeOfTurnLocally");
    expect(src).not.toContain('from "../workbench/Dialogue.tsx"');
    expect(src).toContain("placeOfTurnId(");
  });
});

describe("one projection per fact (ISC-501, applied to a fact M38 introduced)", () => {
  test("the export header reads this file's predicate rather than its own", () => {
    const header = readFileSync(join(ROOT, "src/views/exportHeader.ts"), "utf8");
    expect(header).toContain('from "./provenance.ts"');
    expect(header).toContain("cameFromConversation(e)");
    // The inline spelling it replaced. Two spellings of one predicate is how the
    // count on Exports and the sentence on Design come to disagree.
    const code = header.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toContain("draftedFrom !== undefined");
  });

  test("the predicate is absence of the field, which is the field's own contract", () => {
    expect(cameFromConversation({ draftedFrom: "d1" })).toBe(true);
    expect(cameFromConversation({})).toBe(false);
  });

  test("the drafted-or-typed wording is written once, in the projection", () => {
    const popover = readFileSync(
      join(ROOT, "src/ui/components/ProvenancePopover.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, " ");
    // The component draws `routeLine`; it does not compose a sentence of its own.
    expect(popover).toContain("view.routeLine");
    expect(popover).not.toContain("You typed");
    expect(popover).not.toContain("The tool drafted");
  });
});

// ---------------------------------------------------------------------------
// The claim half
// ---------------------------------------------------------------------------

/**
 * A draft, the accept, and the claim the accept minted.
 *
 * Built the way `adjudicate.ts` builds them, because the projection reads the
 * pair and a fixture that wrote only one of them would test a state the door
 * cannot produce: the accept and the create are appended together, and the
 * create carries the draft's turn and its passages forward unchanged.
 */
function accepted(opts: {
  readonly title?: string;
  readonly sourceTurn?: string;
  readonly sourceChunks?: readonly string[];
  readonly origin?: Origin;
  readonly by?: "human" | "persona:extractor";
}): {
  readonly pageId: string;
  readonly draft: ProposalEvent;
  readonly accept: ProposalAdjudicationEvent;
  readonly create: OntologyMutationEvent;
  readonly events: readonly LedgerEvent[];
} {
  const title = opts.title ?? "Handover is a boundary problem";
  const proposalId = crypto.randomUUID();
  const pageId = crypto.randomUUID();
  const draft: ProposalEvent = {
    ...envelope("persona:extractor"),
    type: "proposal",
    proposalId,
    pageType: "puzzle",
    title,
    sourceChunks: opts.sourceChunks ?? [],
    ...(opts.sourceTurn === undefined ? {} : { sourceTurn: opts.sourceTurn }),
  };
  const accept: ProposalAdjudicationEvent = {
    ...envelope(opts.by ?? "human"),
    type: "proposal-adjudication",
    proposalId,
    disposition: "accept",
  };
  const create: OntologyMutationEvent = {
    ...envelope("human"),
    type: "ontology-mutation",
    op: "create",
    targetId: pageId,
    pageType: "puzzle",
    origin: opts.origin ?? "model-proposed",
    supportingChunks: opts.sourceChunks ?? [],
    ...(opts.sourceTurn === undefined ? {} : { supportingTurn: opts.sourceTurn }),
    title,
    body: "",
  };
  return { pageId, draft, accept, create, events: [draft, accept, create] };
}

describe("an accepted claim (ISC-505, the second subject)", () => {
  test("a claim drafted from a turn names the turn and the place it was said at", () => {
    const q = ask("process");
    const mine = answered(q, "Nobody owns the patient between two wards.");
    const claim = accepted({ sourceTurn: mine.id });
    const events: LedgerEvent[] = [q, delivered(q), mine, ...claim.events];

    const view = claimProvenance({ events, projectId: PROJECT, pageId: claim.pageId });
    expect(view).not.toBeNull();
    expect(view?.kind).toBe("claim");
    expect(view?.turn?.turnId).toBe(mine.id);
    expect(view?.turn?.place).toBe("process");
    expect(view?.turn?.placeLabel).toBe(placeLabel("process"));
    expect(view?.turn?.who).toBe("you");
    expect(view?.noTurnLine).toBeNull();
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's OntologyGraph.tsx, src/workbench/OntologyGraph.tsx left with it; superseded: "a claim with no turn says so in the map"

  test("a turn the transcript has no place for reads as no conversation", () => {
    // A link to nowhere is worse than no link, which is the rule the map states
    // and applies. The turn is still returned, so the two silences stay apart.
    const loose: ResponseEvent = { ...envelope("human"), type: "response", text: "said once" };
    const claim = accepted({ sourceTurn: loose.id });
    const view = claimProvenance({
      events: [loose, ...claim.events],
      projectId: PROJECT,
      pageId: claim.pageId,
    });
    expect(view?.turn?.place).toBeNull();
    expect(view?.noTurnLine).toBe(NO_CONVERSATION_LINE);
  });

  test("a claim from the papers says so in the origin vocabulary", () => {
    const claim = accepted({ origin: "literature-derived", title: "Boundary work is costly" });
    const view = claimProvenance({
      events: claim.events,
      projectId: PROJECT,
      pageId: claim.pageId,
    });
    expect(view?.origin).toBe("literature-derived");
    expect(view?.originLine).toBe(claimOriginLine("literature-derived"));
    expect(view?.originLine).toContain(originLabel("literature-derived"));
    // The slug never reaches the sentence. tests/origin-boundary.test.ts holds
    // this across every surface; it is asserted here too because this is the
    // file that writes the sentence.
    expect(view?.originLine).not.toContain("literature-derived");
  });

  test("a claim with no draft behind it returns null, so the card carries no control", () => {
    // A page the researcher wrote straight into the model: a create with no
    // proposal and no accept. There is nothing to say about how it arrived.
    const own: OntologyMutationEvent = {
      ...envelope("human"),
      type: "ontology-mutation",
      op: "create",
      targetId: "page-mine",
      pageType: "puzzle",
      origin: "author-prior",
      supportingChunks: [],
      title: "I already thought this",
      body: "",
    };
    expect(claimProvenance({ events: [own], projectId: PROJECT, pageId: "page-mine" })).toBeNull();
    // And a page id nothing in the ledger knows about.
    expect(claimProvenance({ events: [own], projectId: PROJECT, pageId: "nope" })).toBeNull();
  });

  test("it names who accepted it, and when, off the one event", () => {
    const mine = accepted({});
    const yours = claimProvenance({
      events: mine.events,
      projectId: PROJECT,
      pageId: mine.pageId,
    });
    expect(yours?.acceptedBy).toBe("you");
    expect(yours?.acceptedAt).toBe(mine.accept.ts);

    const imported = accepted({ by: "persona:extractor", title: "Arrived in a bundle" });
    const theirs = claimProvenance({
      events: imported.events,
      projectId: PROJECT,
      pageId: imported.pageId,
    });
    expect(theirs?.acceptedBy).toBe("the tool");
    expect(ACCEPTED_BY[theirs!.acceptedBy]).toBe("Abductive accepted this claim");
  });

  // M63, the lead's rulings of 2026-09-30: the old model tab's citedPassages left with it; superseded: "it counts the passages the draft cited and links into the record at the draft"

  test("a record that has lost the create says nothing rather than the usual value", () => {
    // The origin the accept stamped lives on the create. Without it the box
    // would have to assume, and the usual assumption is the one value this tool
    // most needs to be right about.
    const claim = accepted({});
    const view = claimProvenance({
      events: [claim.draft, claim.accept],
      projectId: PROJECT,
      pageId: claim.pageId,
    });
    expect(view).toBeNull();
  });

  test("another study's claim cannot be answered by this study's ledger", () => {
    const claim = accepted({});
    const theirs = claim.events.map((e) => ({ ...e, projectId: "other-study" }) as LedgerEvent);
    expect(claimProvenance({ events: theirs, projectId: PROJECT, pageId: claim.pageId })).toBeNull();
  });

  test("the projection appends nothing: the event list is the same object list after", () => {
    const claim = accepted({ sourceChunks: ["doc-1#2"] });
    const events: LedgerEvent[] = [...claim.events];
    const before = events.length;
    claimProvenance({ events, projectId: PROJECT, pageId: claim.pageId });
    claimProvenance({ events, projectId: PROJECT, pageId: claim.pageId });
    expect(events.length).toBe(before);
  });
});

  // M63, the lead's rulings of 2026-09-30: the old model tab's OntologyView, ui/OntologyView.tsx, src/ui/OntologyView.tsx left with it; superseded: "the map reads this module"

describe("the shipped example's own case", () => {
  /* The example shipped since 2026-09-13 (docs/walks/2026-09-13-coldharbour) was
   * walked through the conversation: eight of its ten bound events carry
   * draftedFrom, so the drafted branch is the one a newcomer meets first, and
   * two saves are plain edits of a box, so the typed branch is exercised too.
   * Both sets are computed from the file rather than counted by hand, and both
   * must be non-empty, so a re-captured example that lost either route fails
   * here rather than on a reader's screen. */
  const bundle: unknown = JSON.parse(
    readFileSync(join(ROOT, "tests/fixtures/coldharbour.bundle.json"), "utf8"),
  );
  const events = ((bundle as { events?: readonly LedgerEvent[] }).events ??
    []) as readonly LedgerEvent[];
  const bounds = events.filter((e): e is BoundEvent => e.type === "bound");
  const projectId = bounds[0]?.projectId ?? "";

  /** The latest bound per subject, which is the one provenance reads. */
  function latestBySubject(): ReadonlyMap<string, BoundEvent> {
    const out = new Map<string, BoundEvent>();
    for (const b of bounds) out.set(b.subject, b);
    return out;
  }

  test("the example's answers were drafted from conversation and read as such", () => {
    const drafts = events.filter((e) => e.type === "brief-draft");
    expect(bounds.length).toBeGreaterThan(0);
    expect(drafts.length).toBeGreaterThan(0);
    const drafted = [...latestBySubject().values()].filter((e) => cameFromConversation(e));
    expect(drafted.length).toBeGreaterThan(0);
    for (const latest of drafted) {
      const view = answerProvenance({ events, projectId, place: latest.subject as never, subject: latest.subject });
      expect(view?.route).toBe("drafted");
      expect(noTurnsLine(view!)).toBeNull();
    }
  });

  test("an answer saved by editing the box reads as typed", () => {
    const typed = [...latestBySubject().values()].filter((e) => !cameFromConversation(e));
    expect(typed.length).toBeGreaterThan(0);
    for (const latest of typed) {
      const view = answerProvenance({ events, projectId, place: latest.subject as never, subject: latest.subject });
      expect(view?.route).toBe("typed");
      expect(noTurnsLine(view!)).toBe("You wrote this answer outside a conversation.");
    }
  });
});

// ---------------------------------------------------------------------------
// The popover
// ---------------------------------------------------------------------------

let host: HTMLDivElement | null = null;
let root: { render: (node: unknown) => void; unmount: () => void } | null = null;

function mount(node: unknown): void {
  host = document.createElement("div");
  document.body.appendChild(host);
  const created = createRoot(host);
  root = created as unknown as { render: (node: unknown) => void; unmount: () => void };
  act(() => {
    created.render(node as Parameters<typeof created.render>[0]);
  });
}

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function typedView() {
  const events: LedgerEvent[] = [saved("site")];
  return answerProvenance({ events, projectId: PROJECT, place: "site" });
}

function draftedView() {
  const q = ask("site");
  const mine = answered(q, "the ward is the unit");
  const d = draft("site", [mine.id]);
  const events: LedgerEvent[] = [q, delivered(q), mine, d, saved("site", d.id)];
  return answerProvenance({ events, projectId: PROJECT, place: "site" });
}

/**
 * The events React actually listens to.
 *
 * React 18 delegates at the root and synthesises `onFocus` from `focusin`,
 * `onMouseEnter` from `mouseover` and `onMouseLeave` from `mouseout`. Dispatching
 * `focus` or `mouseenter` reaches nothing, and a test built on those passes
 * vacuously: the box never opens, so every later assertion that it is closed is
 * true for the wrong reason. Probed against a bare component before being used
 * here.
 */
function pointerIn(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}
function pointerOut(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
}
function focusInto(el: HTMLElement): void {
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}

const trigger = (): HTMLElement =>
  document.querySelector<HTMLElement>('[data-testid="provenance-trigger"]') as HTMLElement;
const box = (): HTMLElement | null =>
  document.querySelector<HTMLElement>('[data-testid="provenance-box"]');

describe("the trigger and the box", () => {
  test("nothing saved renders no trigger at all", () => {
    mount(createElement(ProvenancePopover, { view: null, about: "your answer" }));
    expect(document.querySelector('[data-testid="provenance-trigger"]')).toBeNull();
  });

  test("the trigger is a real button, so a press and a focus both reach it", () => {
    mount(createElement(ProvenancePopover, { view: typedView(), about: "your answer" }));
    const el = trigger();
    expect(el.tagName).toBe("BUTTON");
    expect(el.getAttribute("type")).toBe("button");
    expect(el.getAttribute("aria-expanded")).toBe("false");
  });

  test("focus opens it and Escape closes it", () => {
    mount(createElement(ProvenancePopover, { view: typedView(), about: "your answer" }));
    expect(box()).toBeNull();
    act(() => focusInto(trigger()));
    expect(box()).not.toBeNull();
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(box()).toBeNull();
  });

  test("a press pins it, and a pinned box does not close when the pointer leaves", async () => {
    mount(createElement(ProvenancePopover, { view: typedView(), about: "your answer" }));
    act(() => trigger().click());
    expect(box()?.getAttribute("data-pinned")).toBe("true");
    act(() => pointerOut(trigger()));
    await act(async () => {
      await wait(320);
    });
    expect(box()).not.toBeNull();
    // And a pinned box offers its own way out.
    expect(box()?.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });

  test("the close is cancelled when the pointer lands on the box", async () => {
    mount(createElement(ProvenancePopover, { view: typedView(), about: "your answer" }));
    act(() => pointerIn(trigger()));
    expect(box()).not.toBeNull();
    // Leaving the trigger starts the delayed close; landing on the box cancels
    // it. This is the "boxes that vanish when you move toward them" failure.
    act(() => pointerOut(trigger()));
    act(() => {
      const el = box();
      if (el !== null) pointerIn(el);
    });
    await act(async () => {
      await wait(320);
    });
    expect(box()).not.toBeNull();
  });

  test("without the cancel, the delayed close does close it", async () => {
    // Vacuity guard on the test above: the delay has to actually fire.
    mount(createElement(ProvenancePopover, { view: typedView(), about: "your answer" }));
    act(() => pointerIn(trigger()));
    expect(box()).not.toBeNull();
    act(() => pointerOut(trigger()));
    await act(async () => {
      await wait(320);
    });
    expect(box()).toBeNull();
  });

  test("the box says the projection's sentence, for a typed and a drafted answer", () => {
    mount(createElement(ProvenancePopover, { view: typedView(), about: "your answer" }));
    act(() => trigger().click());
    expect(
      document.querySelector('[data-testid="provenance-route"]')?.textContent,
    ).toBe(ROUTE_LINE.typed);
    expect(document.querySelector('[data-testid="provenance-turns"]')).toBeNull();
    expect(document.querySelector('[data-testid="provenance-none"]')?.textContent).toBe(
      "You wrote this answer outside a conversation.",
    );

    act(() => root?.unmount());
    host?.remove();
    root = null;

    mount(createElement(ProvenancePopover, { view: draftedView(), about: "your answer" }));
    act(() => trigger().click());
    expect(
      document.querySelector('[data-testid="provenance-route"]')?.textContent,
    ).toBe(ROUTE_LINE.drafted);
    const turns = document.querySelectorAll('[data-testid="provenance-turns"] li');
    expect(turns.length).toBe(1);
    // M42: "You said it" named nothing, so the span says whose words the turn
    // holds. Who spoke is still what this asserts.
    expect(turns[0]?.textContent).toContain("Your words");
    expect(turns[0]?.textContent).toContain("Site");
    expect(document.querySelector('[data-testid="provenance-none"]')).toBeNull();
  });

  test("it carries one link into the record, and asking costs no event", () => {
    const opened: Event[] = [];
    const listener = (e: Event) => opened.push(e);
    document.addEventListener("abductive:open-record", listener);
    mount(createElement(ProvenancePopover, { view: typedView(), about: "your answer" }));
    act(() => trigger().click());
    const link = document.querySelector<HTMLElement>('[data-testid="provenance-record"]');
    expect(link).not.toBeNull();
    act(() => link?.click());
    expect(opened.length).toBe(1);
    document.removeEventListener("abductive:open-record", listener);
  });

  test("CSS anchor positioning is not used, because one shared anchor-name broke it", () => {
    /* Measured live in Chrome 152 on the shipped example, at a 900px viewport:
     * with the `@supports (anchor-name: --a)` block the box landed at top 2961px;
     * with it neutralised, at 404px, which is what the measurement computes.
     *
     * `anchor-name` is document-wide and this popover has many instances — the
     * framing alone renders two triggers — so one shared name named two elements
     * and `position-area` resolved against the wrong one. Being layout rather
     * than an offset, it won over the inline `top`. That is the exact clipping
     * failure the component exists to prevent, so the enhancement is not built.
     *
     * Reintroducing it needs a unique name per instance. This test is what makes
     * someone read the reason before they try. */
    const css = readFileSync(join(ROOT, "src/ui/styles/components.css"), "utf8");
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(rules).not.toContain("anchor-name");
    expect(rules).not.toContain("position-area");
    expect(rules).not.toContain("position-anchor");
    // And the reason survives in the file, rather than only in a commit message.
    expect(css).toContain("2961");
  });

  test("it renders without anchor positioning, which is what this environment has", () => {
    // The measured path is primary and the platform's is the enhancement, so the
    // default path is the one every test above has been exercising. Stated
    // explicitly so the inversion is not read as an accident.
    mount(createElement(ProvenancePopover, { view: typedView(), about: "your answer" }));
    act(() => trigger().click());
    const el = box();
    expect(el).not.toBeNull();
    expect(el?.style.position).toBe("");
    expect(el?.style.top).not.toBe("");
    const css = readFileSync(join(ROOT, "src/ui/styles/components.css"), "utf8");
    expect(css).toContain(".popbox {");
    expect(css).toContain("position: fixed");
  });

  test("the trigger names the answer it is about, for a screen reader", () => {
    mount(
      createElement(ProvenancePopover, { view: typedView(), about: "the puzzle as it stands" }),
    );
    expect(trigger().textContent).toContain("the puzzle as it stands");
    act(() => trigger().click());
    expect(box()?.getAttribute("aria-label")).toContain("the puzzle as it stands");
    expect(box()?.getAttribute("role")).toBe("dialog");
  });
});

describe("the box for a claim says the projection's output and nothing else", () => {
  function claimView(opts: Parameters<typeof accepted>[0], extra: readonly LedgerEvent[] = []) {
    const claim = accepted(opts);
    return claimProvenance({
      events: [...extra, ...claim.events],
      projectId: PROJECT,
      pageId: claim.pageId,
    });
  }

  const trig = (): HTMLElement =>
    document.querySelector<HTMLElement>('[data-testid="claim-provenance"]') as HTMLElement;
  const said = (id: string): string | null =>
    document.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.textContent ?? null;

  test("a claim with a conversation behind it: origin, the turn, who accepted it, passages", () => {
    const q = ask("process");
    const mine = answered(q, "Nobody owns the patient between two wards.");
    const view = claimView({ sourceTurn: mine.id, sourceChunks: ["doc-1#2", "doc-1#7"] }, [
      q,
      delivered(q),
      mine,
    ]);
    mount(
      createElement(ProvenancePopover, {
        view,
        about: "Handover is a boundary problem",
        testId: "claim-provenance",
      }),
    );
    act(() => trig().click());

    expect(said("provenance-origin")).toBe(view?.originLine ?? null);
    expect(said("provenance-none")).toBeNull();
    const turns = document.querySelectorAll('[data-testid="provenance-turns"] li');
    expect(turns.length).toBe(1);
    expect(turns[0]?.textContent).toContain("Your words");
    expect(turns[0]?.textContent).toContain(placeLabel("process"));
    expect(said("provenance-accepted")).toBe(
      `${ACCEPTED_BY.you} ${formatMoment(view!.acceptedAt)}.`,
    );
    // M42: the sentence names the claim rather than opening on "It".
    expect(said("provenance-passages")).toBe("This claim cites 2 passages.");
    // Neither of the answer body's own lines is drawn on a claim. Two readings,
    // two bodies, and the test ids are what say which one is on screen.
    expect(document.querySelector('[data-testid="provenance-route"]')).toBeNull();
    expect(said("provenance-when")).toBeNull();
  });

  /**
   * The mark that says an expectation is held in the setting (M44).
   *
   * The card this box opens from prints the holder, so what belongs here is whose
   * act the mark was and when they made it. An unmarked claim says nothing, which
   * is the rule every other line in this body follows.
   */
  test("a marked expectation says who marked it and when", () => {
    const claim = accepted({
      title: "Board's leveling expectation for the shared writing tool",
    });
    const marked: LedgerEvent = {
      ...envelope("human"),
      type: "ontology-mutation",
      op: "mark",
      targetId: claim.pageId,
      pageType: "theory",
      origin: "author-prior",
      heldBy: "the board, in the January paper",
    } as LedgerEvent;
    const view = claimProvenance({
      events: [...claim.events, marked],
      projectId: PROJECT,
      pageId: claim.pageId,
    });
    expect(view?.heldInSetting?.holder).toBe("the board, in the January paper");
    expect(view?.heldInSetting?.by).toBe("you");
    mount(
      createElement(ProvenancePopover, {
        view,
        about: "the board's expectation",
        testId: "claim-provenance",
      }),
    );
    act(() => trig().click());
    expect(said("provenance-held")).toBe(
      `${MARKED_BY.you} ${formatMoment(view!.heldInSetting!.at)}.`,
    );
  });

  test("a claim nobody has marked says nothing about a holder", () => {
    const view = claimView({});
    expect(view?.heldInSetting).toBeNull();
    mount(
      createElement(ProvenancePopover, {
        view,
        about: "Handover is a boundary problem",
        testId: "claim-provenance",
      }),
    );
    act(() => trig().click());
    expect(said("provenance-held")).toBeNull();
  });

  test("a claim with no conversation says the map's sentence and lists no turn", () => {
    const view = claimView({ origin: "literature-derived", title: "Boundary work is costly" });
    mount(
      createElement(ProvenancePopover, {
        view,
        about: "Boundary work is costly",
        testId: "claim-provenance",
      }),
    );
    act(() => trig().click());
    expect(said("provenance-origin")).toBe(claimOriginLine("literature-derived"));
    expect(said("provenance-none")).toBe(NO_CONVERSATION_LINE);
    expect(document.querySelector('[data-testid="provenance-turns"]')).toBeNull();
    // A claim citing nothing spends no line saying so.
    expect(said("provenance-passages")).toBeNull();
  });

  test("a singular passage is singular", () => {
    const view = claimView({ sourceChunks: ["doc-1#2"] });
    mount(
      createElement(ProvenancePopover, { view, about: "a claim", testId: "claim-provenance" }),
    );
    act(() => trig().click());
    expect(said("provenance-passages")).toBe("This claim cites 1 passage.");
  });

  test("no draft behind it means no trigger at all", () => {
    mount(
      createElement(ProvenancePopover, {
        view: null,
        about: "a claim you wrote yourself",
        testId: "claim-provenance",
      }),
    );
    expect(document.querySelector('[data-testid="claim-provenance"]')).toBeNull();
  });

  test("the component composes no sentence of its own about a claim", () => {
    const popover = readFileSync(
      join(ROOT, "src/ui/components/ProvenancePopover.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(popover).toContain("view.originLine");
    expect(popover).toContain("view.noTurnLine");
    expect(popover).toContain("ACCEPTED_BY[");
    // The words themselves live in the projection, which is what the origin
    // boundary test can see and a component's template literal is not.
    expect(popover).not.toContain("This claim is");
    expect(popover).not.toContain("No conversation");
    expect(popover).not.toContain("You accepted");
    expect(popover).not.toContain("originLabel");
  });
});

describe("no new screen, and no new line under every item (ISC-505)", () => {
  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel, workbench/PagePanel.tsx, src/workbench/PagePanel.tsx left with it; superseded: "the trigger sits on the label"

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel, OntologyGraph.tsx, workbench/PagePanel.tsx, src/workbench/OntologyGraph.tsx, src/workbench/PagePanel.tsx left with it; superseded: "the claim card carries the control on the title, and the map"

  // M63, the lead's rulings of 2026-09-30: the old model tab's PagePanel, OntologyView, ui/OntologyView.tsx, workbench/PagePanel.tsx, src/workbench/PagePanel.tsx, src/ui/OntologyView.tsx left with it; superseded: "the panel does not read the ledger for it; the caller hands it in"

  test("no route was added for it", () => {
    const routes = readFileSync(join(ROOT, "src/ui/routes.ts"), "utf8");
    expect(routes).not.toContain("provenance");
  });

  test("the projection is a fold, with no model call anywhere near it", () => {
    const source = readFileSync(join(ROOT, "src/views/provenance.ts"), "utf8");
    for (const forbidden of ["inference", "streamOrComplete", "activeInferenceClient", "fetch("]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
