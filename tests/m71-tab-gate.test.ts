/**
 * M71, ISC-653: the greyed tabs open on the events the tool writes since M63 (Checks left at M89).
 *
 * Found in the M71 walk on a fresh project: a saved Context summary, a reply and
 * an accepted concept left Sources, Checks and Export greyed. The ledger held
 * concept-suggested, concept-accepted and statement events and no `bound` and
 * no `ontology-mutation`, and those two were all the gate read for Sources,
 * Checks and Export. A summary saved at a step lives in the project's brief,
 * which is what the steps gauge and the loop gate already read.
 *
 * The rules now: Sources once a Context or Puzzle summary is saved; the ontology
 * tab once Abductive suggests a concept; Checks once a concept or statement is
 * accepted; Export once the ontology has a concept or a placed statement. Every
 * earlier opening still opens (a `bound` at a step, an `ontology-mutation`
 * create), so no project made before M63 loses a tab.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { closedTabs, openTabs, TAB_UNLOCK } from "../src/views/earnedTabs.ts";
import { nonEntityActs } from "./copyBarScan.ts";

const P = "m71-gate";
let seq = 0;
const env = (projectId = P) => ({ id: crypto.randomUUID(), ts: 1_790_000_000_000 + ++seq, projectId, actor: "human" as const });

const suggested = (): LedgerEvent =>
  ({
    ...env(),
    actor: "persona:concepts",
    model: "m",
    modelVersion: "v",
    type: "concept-suggested",
    conceptId: `c${seq}`,
    name: "Night handover",
    definition: "The handover between nurses at night.",
    properties: [],
    relations: [],
    statementIds: [],
    statements: [],
    source: { kind: "summary", station: "context" },
  }) as unknown as LedgerEvent;
const accepted = (): LedgerEvent =>
  ({ ...env(), type: "concept-accepted", conceptId: `c${seq}`, origin: "model-proposed" }) as unknown as LedgerEvent;
const placed = (): LedgerEvent =>
  ({ ...env(), type: "statement-attached", conceptId: "c1", statementId: `s${seq}`, text: "Nurses speak up at the station." }) as unknown as LedgerEvent;
const statementSuggested = (): LedgerEvent =>
  ({ ...env(), actor: "persona:concepts", type: "statement-suggested", statementId: `s${seq}`, text: "x" }) as unknown as LedgerEvent;

/** The walk's ledger, by type: what the tool wrote on a fresh project after M63. */
const walk = (): readonly LedgerEvent[] => [suggested(), suggested(), statementSuggested(), accepted()];

/* M85, ISC-712: Sources is open from the start, so its rule (a saved Context
 * or Puzzle summary) and its tests went; tests/m85-sources-open.test.tsx holds
 * the new rule. */

describe("the ontology tab and Export on a ledger with no bound and no ontology-mutation", () => {
  test("a suggestion opens the ontology tab and nothing else", () => {
    expect(openTabs([suggested()], P)).toEqual({ ontology: true, exports: false });
  });

  test("an accepted concept opens Export", () => {
    const open = openTabs(walk(), P);
    expect(open).toEqual({ ontology: true, exports: true });
    expect(closedTabs(walk(), P).size).toBe(0);
  });

  test("a placed statement opens Export", () => {
    const open = openTabs([placed()], P);
    expect(open.exports).toBe(true);
  });

  test("a statement only suggested opens nothing", () => {
    const open = openTabs([statementSuggested()], P);
    expect(open.exports).toBe(false);
  });

  test("another project's acceptances open nothing here", () => {
    const foreign = { ...accepted(), projectId: "elsewhere" } as LedgerEvent;
    expect(openTabs([foreign], P)).toEqual({ ontology: false, exports: false });
  });
});

describe("every earlier opening still opens", () => {
  test("an ontology-mutation create opens Export", () => {
    const created = {
      ...env(),
      type: "ontology-mutation",
      op: "create",
      pageId: "p1",
      pageType: "observation",
      title: "A claim",
      origin: "you",
    } as unknown as LedgerEvent;
    expect(openTabs([created], P).exports).toBe(true);
  });

  test("the shipped example keeps every tab open", async () => {
    const bundle = await Bun.file(new URL("./fixtures/coldharbour.bundle.json", import.meta.url).pathname).json();
    expect(openTabs(bundle.events, bundle.project.id)).toEqual({
      ontology: true,
      exports: true,
    });
  });
});

describe("the unlock sentences say the same", () => {
  test("Export names the acceptances that open it", () => {
    expect(TAB_UNLOCK.exports).toBe("Export opens once your ontology has a concept or a placed statement.");
    for (const line of Object.values(TAB_UNLOCK)) expect({ line, act: nonEntityActs(line) }).toEqual({ line, act: false });
  });

  test("the shell reads the gate from the record alone (M85, ISC-712)", async () => {
    const shell = await Bun.file(new URL("../src/ui/AppShell.tsx", import.meta.url).pathname).text();
    expect(shell).toContain("closedTabs(events, route.projectId)");
    expect(shell).not.toContain("sourcesWork");
  });
});
