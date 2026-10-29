/**
 * M74a, ISC-662: History's labels (the walk of 2026-10-02, finding 16).
 *
 * On the day the student created the project, History said "Every action that
 * you and Abductive have taken since today". It counted eight changes of step
 * as "you changed the subject", read 0 beside "a change to your model" with
 * three concepts accepted and 0 beside "homes that Abductive proposed for
 * statements" with 38 homes proposed, filed both chips as "a question that you
 * declined", gave two kinds nearly one label, and offered persona ids in Who.
 * The chips' own kinds are M74b's (the lead's ruling); this file pins the rows.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { formatDate } from "../src/ui/format.ts";
import {
  actorLabel,
  kindCounts,
  kindLabel,
  LEDGER_KINDS,
  LedgerView,
  projectLedger,
} from "../src/workbench/Instrumentation.tsx";

const WALK = (await Bun.file(new URL("./fixtures/m72-walk.json", import.meta.url)).json()) as {
  project: { id: string };
  events: LedgerEvent[];
};
const P = WALK.project.id;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the header dates from the project's first event", () => {
  test("on the day the project began, the header names the date", () => {
    const now = Date.now();
    const events = WALK.events.map((e, i) => ({ ...e, ts: now - 1000 + i })) as LedgerEvent[];
    const html = text(renderToStaticMarkup(createElement(LedgerView, { events })));
    expect(html).toContain(`since ${formatDate(now - 1000)},`);
    expect(html).not.toContain("since today");
  });
});

describe("the kinds and their glosses", () => {
  const rows = projectLedger(WALK.events);

  test("a change of step reads as going to that step", () => {
    const steps = rows.filter((r) => r.kind === "redirection");
    expect(steps.length).toBe(8);
    expect(steps.map((r) => r.happened)).toContain("You went to the Site step");
    expect(kindLabel("redirection")).toBe("you went to another step");
    expect(LEDGER_KINDS.map(kindLabel).join(" ")).not.toContain("changed the subject");
  });

  test("a change to your ontology counts the concept, relation and statement events", () => {
    const counts = kindCounts(WALK.events);
    // 3 accepted, 1 refined, 8 properties, 1 relation set, 1 relation accepted, 2 statements placed.
    expect(counts.get("ontology-mutation")).toBe(16);
    expect(kindLabel("ontology-mutation")).toBe("a change to your ontology");
  });

  test("homes that Abductive proposed counts every proposed home", () => {
    expect(kindCounts(WALK.events).get("homes-proposed")).toBe(38);
  });

  test("a refusal row that a chip wrote says which chip it was, and M74b's chip events render", () => {
    /* The lead's ruling (2026-10-02): M74b writes the chips' own kinds and
       their map lines; until then a chip's refusal row keeps the refusal kind. */
    const chips = rows.filter((r) => r.kind === "refusal").map((r) => r.happened);
    expect(chips).toEqual(["You said you don't know", "You asked for a different question"]);
    const question = WALK.events.find((e) => e.type === "question-selection")!;
    const later = [
      { id: "n1", ts: 2, actor: "human", projectId: P, type: "dont-know", questionEventId: question.id },
      { id: "n2", ts: 3, actor: "human", projectId: P, type: "ask-differently", questionEventId: question.id },
    ] as unknown as LedgerEvent[];
    const fresh = projectLedger(later);
    expect(fresh.map((r) => r.kind as string)).toEqual(["dont-know", "ask-differently"]);
    expect(fresh.map((r) => r.happened)).toEqual(["You said you don't know", "You asked for a different question"]);
  });

  test("the two kinds of question that Abductive asks have distinct glosses", () => {
    expect(kindLabel("question-selection")).toBe("a question that Abductive asked in the conversation");
    expect(kindLabel("challenge")).toBe("a question that Abductive raised about your design");
    const labels = LEDGER_KINDS.map(kindLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("Who shows Abductive for every persona", () => {
  test("no persona id reaches the filter or a row", () => {
    for (const actor of ["persona:eisenhardt-positivist", "persona:langley-process", "persona:interviewer", "persona:drafter", "system"]) {
      expect(actorLabel(actor)).toBe("Abductive");
    }
    expect(actorLabel("human")).toBe("you");
    const html = renderToStaticMarkup(createElement(LedgerView, { events: WALK.events }));
    const who = html.slice(html.indexOf('label="Who"') > -1 ? html.indexOf('label="Who"') : html.indexOf(">Who<"));
    const options = [...who.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
    expect(options).toContain("Abductive");
    expect(options.filter((o) => o === "Abductive").length).toBe(1);
    expect(text(html)).not.toMatch(/eisenhardt[ -]positivist|langley[ -]process|tavory[ -]timmermans|Abductive, as /i);
  });
});
