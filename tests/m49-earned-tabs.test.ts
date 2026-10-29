/**
 * M49-2, the tabs a study earns (ISC-528).
 *
 * Two halves, and the second is the one that can go wrong quietly.
 *
 *   the projection  which of the five are on the strip, off the record alone.
 *                   Every edge here is an event that looks like the one that
 *                   earns a tab and is not: a `bound` written by the framing
 *                   rather than at a step, an `ontology-mutation` that revises
 *                   rather than creates, and every event of another study.
 *   the redirect    a link to a tab this study has not earned lands on Design
 *                   with the sentence that says what brings the tab. A redirect
 *                   with no sentence is a link that silently goes somewhere
 *                   else, and a redirect that loses its sentence to the hash
 *                   change it caused looks identical on a screenshot.
 */

import "fake-indexeddb/auto";
import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";

/* M62, ISC-607 (the owner, 2026-09-30) supersedes M49's strip: all six tabs
 * show from the start, the four not yet earned greyed with a line saying how to
 * open each; the arrival lines and the redirect to Design went with the hidden
 * tabs. What M49 built and M62 keeps is the projection of the three earned
 * moments, held below. The strip, the lines and the pages are held in
 * tests/m62-tabs.test.ts. */
import { ALWAYS_SHOWN, EARNED_TABS, earnedBy, isEarnedTab } from "../src/views/earnedTabs.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";

const PID = "m49-study";

let seq = 0;
/* The store validates every row it is handed, so the fixtures carry a real
 * envelope: a UUID and an epoch-millisecond timestamp. */
function envelope(): { id: string; ts: number; projectId: string; actor: "human" } {
  seq += 1;
  return {
    id: crypto.randomUUID(),
    ts: 1_700_000_000_000 + seq,
    projectId: PID,
    actor: "human",
  };
}

const boundAt = (subject: string): LedgerEvent =>
  ({ ...envelope(), type: "bound", subject, statement: "said" }) as LedgerEvent;

const proposal = (): LedgerEvent =>
  ({
    ...envelope(),
    type: "proposal",
    proposalId: `p${seq}`,
    pageType: "observation",
    title: "A claim the tool drafted",
    sourceChunks: [],
  }) as LedgerEvent;

const mutation = (op: "create" | "revise"): LedgerEvent =>
  ({
    ...envelope(),
    type: "ontology-mutation",
    op,
    targetId: `t${seq}`,
    ...(op === "create" ? { pageType: "observation", title: "A claim you accepted" } : {}),
    origin: "author-prior",
  }) as LedgerEvent;

function elsewhere(event: LedgerEvent): LedgerEvent {
  return { ...event, projectId: "some-other-study" } as LedgerEvent;
}

describe("M49-2: the projection reads the record and nothing else", () => {
  test("a study with no events shows the starting point, Design and Material only", () => {
    expect(earnedBy([], PID)).toEqual({ ontology: false, exports: false });
  });

  test("the first draft brings Your model", () => {
    expect(earnedBy([proposal()], PID).ontology).toBe(true);
  });

  test("the first accepted claim brings Exports, and a revision does not", () => {
    expect(earnedBy([mutation("create")], PID).exports).toBe(true);
    expect(earnedBy([mutation("revise")], PID).exports).toBe(false);
  });

  test("another study's events earn this study nothing", () => {
    const foreign = [proposal(), boundAt("site"), mutation("create")].map(elsewhere);
    expect(earnedBy(foreign, PID)).toEqual({
      ontology: false,
      exports: false,
    });
  });

  test("every earnable tab is one of the two", () => {
    for (const tab of EARNED_TABS) expect(isEarnedTab(tab)).toBe(true);
  });

  test("neither of the always-shown tabs can be earned", () => {
    for (const tab of ALWAYS_SHOWN) expect(isEarnedTab(tab)).toBe(false);
  });
});

/* M49's shell tests (the hidden strip, the arrival lines, the redirect) are
 * superseded by ISC-607; tests/m62-tabs.test.ts renders the strip now. */
