/**
 * M78a, ISC-680: History tells the researcher's replies from Abductive's, and
 * Export counts an edited summary as the researcher's (the serendipity walk of
 * 2026-10-03, findings 12 and 13).
 *
 * History counted RSP 79 under "your answer": the student's 34 typed replies
 * and Abductive's 45 together. Export counted "Answers that you typed yourself
 * 1 of 12" for a student who edited every summary before saving it.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import type { ProjectBrief } from "../src/state/projects.ts";
import {
  historyKind,
  kindCounts,
  kindLabel,
  kindMark,
  LEDGER_KINDS,
  startingKinds,
} from "../src/workbench/Instrumentation.tsx";
import { exportHeader } from "../src/views/exportHeader.ts";
import { stampLine } from "../src/export/stamp.ts";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HowArrived } from "../src/ui/model/HowArrived.tsx";

const WALK = (await Bun.file(new URL("./fixtures/m76-walk.json", import.meta.url)).json()) as {
  project: { id: string; brief: ProjectBrief };
  events: LedgerEvent[];
};

const reply = (actor: string): LedgerEvent =>
  ({ id: `r-${actor}`, ts: 1, actor, projectId: "p", type: "response", text: "Yes." }) as never;

describe("History splits the replies by who wrote them", () => {
  test("a reply's kind follows its actor, old events included", () => {
    expect(historyKind(reply("human"))).toBe("response");
    expect(historyKind(reply("persona:interviewer"))).toBe("abductive-reply");
  });

  test("each kind has its own gloss and mark", () => {
    expect(kindLabel("response")).toBe("your reply");
    expect(kindLabel("abductive-reply")).toBe("Abductive's reply");
    expect(kindMark("response")).toBe("RSP");
    expect(kindMark("abductive-reply")).toBe("ARP");
    expect(LEDGER_KINDS).toContain("abductive-reply");
  });

  test("the walk counts 34 replies of the student's and 45 of Abductive's", () => {
    const counts = kindCounts(WALK.events);
    expect(counts.get("response")).toBe(34);
    expect(counts.get("abductive-reply")).toBe(45);
  });

  test("a count that opens History at the conversation shows both kinds of reply", () => {
    const kinds = startingKinds(["response", "question-selection"]);
    expect(kinds.has("response")).toBe(true);
    expect(kinds.has("abductive-reply")).toBe(true);
  });
});

describe("Export counts an edited summary as the researcher's", () => {
  const view = exportHeader({
    projectId: WALK.project.id,
    events: WALK.events,
    brief: WALK.project.brief,
    claims: { population: 0 } as never,
  });

  test("the walk's twelve answers are all the student's, since every summary was edited", () => {
    expect(view.typedAnswers).toBe(12);
    expect(view.draftedAnswers).toBe(0);
  });

  test("a summary saved exactly as Abductive wrote it still counts as suggested from chat", () => {
    const events: LedgerEvent[] = [
      { id: "d1", ts: 1, actor: "persona:interviewer", projectId: "p", type: "brief-draft", station: "context", text: "A repair café in a church hall.", fromTurnIds: [] } as never,
      { id: "b1", ts: 2, actor: "human", projectId: "p", type: "bound", subject: "context", statement: "A repair café in a church hall.", draftedFrom: "d1" } as never,
      { id: "d2", ts: 3, actor: "persona:interviewer", projectId: "p", type: "brief-draft", station: "site", text: "The café near me.", fromTurnIds: [] } as never,
      { id: "b2", ts: 4, actor: "human", projectId: "p", type: "bound", subject: "site", statement: "The café near me, which I have volunteered at.", draftedFrom: "d2" } as never,
    ];
    const v = exportHeader({ projectId: "p", events, brief: WALK.project.brief, claims: { population: 0 } as never });
    expect(v.draftedAnswers).toBe(1);
    expect(v.typedAnswers).toBe(1);
  });

  test("the receipt's stamp line says what the stamp is for before its technical name", () => {
    const line = stampLine(WALK.events);
    const plain = line.indexOf("a fingerprint of this file");
    const technical = line.indexOf("FNV-1a");
    expect(plain).toBeGreaterThan(-1);
    expect(technical).toBeGreaterThan(plain);
  });
});

describe("Design history counts placed statements as the claims", () => {
  const view = exportHeader({
    projectId: WALK.project.id,
    events: WALK.events,
    brief: WALK.project.brief,
    claims: { unit: { one: "claim", many: "claims" }, population: 0, byOrigin: { "author-prior": 0, "literature-derived": 0, "data-driven": 0, "model-proposed": 0 }, modelShare: null } as never,
  });

  test("the walk placed 38 statements", () => {
    expect(view.placedStatements).toBe(38);
  });

  test("the row reads the placed statements, not claims still to come", () => {
    const html = renderToStaticMarkup(React.createElement(HowArrived, { projectId: WALK.project.id, view }));
    expect(html).toContain("38 placed statements");
    expect(html).not.toContain("claims still to come");
  });
});

