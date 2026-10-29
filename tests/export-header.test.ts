/**
 * "How you arrived at this design" (M38, ISC-500, ISC-501).
 *
 * The header's whole claim is that its numbers are the study's, so what is
 * pinned here is that each one equals the projection the rest of the app reads:
 * the turns are `placeSummaries` summed and the census is the one Your model
 * prints. A header with numbers of its own
 * would be a second reading of the study on the page a co-author trusts most.
 */

import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type {
  BoundEvent,
  LedgerEvent,
  QuestionSelectionEvent,
  ResponseEvent,
} from "../src/ledger/events.ts";
import { envelope } from "./helpers.ts";
import { normalizeBrief } from "../src/state/projects.ts";
import { placeSummaries } from "../src/views/placeSummary.ts";
import { exportHeader } from "../src/views/exportHeader.ts";
import { LIVE_PAGES, censusRead, originCensus } from "../src/ontology/attribution.ts";
import { HowArrived } from "../src/ui/model/HowArrived.tsx";
import { RECORD_OPEN_EVENT } from "../src/ui/routes.ts";

const PROJECT = "proj-test";
const brief = normalizeBrief({ context: "A repair café in Ely." });

function ask(station: string): QuestionSelectionEvent {
  return {
    ...envelope("system"),
    type: "question-selection",
    moveId: `conversation:${station}@1`,
    topic: `station:${station}`,
    question: "What did you see?",
    alternatives: [],
    mode: "interrogation",
    reason: "asked here",
    station,
  };
}
function delivered(q: QuestionSelectionEvent): ResponseEvent {
  return {
    ...envelope("persona:interviewer"),
    type: "response",
    text: "Tell me more.",
    inReplyTo: q.id,
  };
}
function answered(q: QuestionSelectionEvent, text: string): ResponseEvent {
  return { ...envelope("human"), type: "response", text, inReplyTo: q.id };
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

function view(events: readonly LedgerEvent[]) {
  return exportHeader({
    events,
    projectId: PROJECT,
    brief,
    claims: originCensus([], LIVE_PAGES),
  });
}

describe("the header's numbers are the projections'", () => {
  test("turns equal placeSummaries summed", () => {
    const q = ask("context");
    const events: LedgerEvent[] = [q, delivered(q), answered(q, "A church hall.")];
    const rows = placeSummaries({ events, projectId: PROJECT, brief });
    const summed = rows.reduce((n, r) => n + r.turns, 0);
    expect(summed).toBe(2);
    expect(view(events).turns).toBe(summed);
  });

  test("drafted against typed reads draftedFrom, once per subject", () => {
    const events: LedgerEvent[] = [
      saved("context", "turn-1"),
      saved("site"),
      // The same subject saved again. What the header is about is the design as
      // it stands, so this replaces the row above rather than adding one.
      saved("site", "turn-2"),
      saved("sample"),
    ];
    const v = view(events);
    expect(v.draftedAnswers).toBe(2);
    expect(v.typedAnswers).toBe(1);
  });

  test("another study's events are not in any of the numbers", () => {
    const mine = saved("context", "turn-1");
    const theirs = { ...saved("site"), projectId: "other" };
    const v = view([mine, theirs]);
    expect(v.draftedAnswers).toBe(1);
    expect(v.typedAnswers).toBe(0);
  });
});

describe("the header renders those numbers, and every one links into the record", () => {
  const claims = originCensus(
    [
      { origin: "author-prior" as const },
      { origin: "model-proposed" as const },
      { origin: "model-proposed" as const },
    ],
    LIVE_PAGES,
  );

  function render() {
    const q = ask("context");
    const events: LedgerEvent[] = [
      q,
      delivered(q),
      answered(q, "A church hall."),
      saved("context", "turn-1"),
      saved("site"),
    ];
    const v = exportHeader({
      events,
      projectId: PROJECT,
      brief,
      claims,
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(React.createElement(HowArrived, { projectId: PROJECT, view: v }));
    });
    return { host, root, v };
  }

  function text(host: Element, id: string): string {
    return host.querySelector(`[data-testid="${id}"]`)?.textContent ?? "";
  }

  test("each row prints the projection's number", () => {
    const { host, root, v } = render();
    expect(text(host, "arrived-turns")).toBe(`${v.turns} turns`);
    expect(text(host, "arrived-drafted")).toBe("1 of 2");
    expect(text(host, "arrived-typed")).toBe("1 of 2");
    // The census sentence comes from the module that owns the origin words, so
    // the header cannot spell an origin its own way.
    expect(text(host, "arrived-claims")).toBe(censusRead(claims));
    expect(text(host, "arrived-claims")).toBe("3 claims: 1 yours, 2 AI-suggested");
    root.unmount();
  });

  /* The record is a dialog over whatever tab is showing (ISC-494), opened by
   * the one event routes.ts names and the chrome listens for on the document.
   * The two builders wrote this seam from opposite sides, one as a route with
   * an anchor and a fallback, one as the dialog; the dialog is the side that
   * draws the panel, so the header's numbers are buttons that raise its event
   * and nothing here navigates. */
  test("every number is a control into the record", () => {
    const { host, root } = render();
    const controls = [...host.querySelectorAll("button.linkish")];
    expect(controls).toHaveLength(4);
    expect(host.querySelectorAll("a")).toHaveLength(0);
    root.unmount();
  });

  test("pressing one raises the record's event on the document", () => {
    const { host, root } = render();
    let asked = 0;
    const listener = () => {
      asked += 1;
    };
    document.addEventListener(RECORD_OPEN_EVENT, listener);
    const before = window.location.hash;
    const control = host.querySelector('[data-testid="arrived-turns"]') as Element;
    const key = Object.keys(control).find((k) => k.startsWith("__reactProps$"));
    const props = (control as unknown as Record<string, { onClick?: (e: unknown) => void }>)[
      key as string
    ];
    act(() => {
      props?.onClick?.({ preventDefault() {} });
    });
    document.removeEventListener(RECORD_OPEN_EVENT, listener);
    expect(asked).toBe(1);
    // A dialog, not a route: nothing navigated.
    expect(window.location.hash).toBe(before);
    root.unmount();
  });
});
