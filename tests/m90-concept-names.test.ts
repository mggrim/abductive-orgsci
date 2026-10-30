/**
 * M90, ISC-730 to ISC-734: a concept is one noun or gerund.
 *
 * The owner, 2026-10-14: "for the emerging project ontology, the concepts
 * appear as concept bundles. The tool should really be surfacing nouns and
 * gerunds I think. Rather than 'Introduced founders' longer slots' these should
 * be different concepts like introductions, founders, office hour slot time".
 * His ruling the same day: split into concepts and relations.
 *
 * The suggestion pass asks for one noun or gerund per concept, a guard in code
 * catches a bundle after the model answers, the pass asks once more for that
 * item with the instruction to split it, and a second bundle is dropped with an
 * event in History and a line in the tray.
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { suggestConcepts } from "../src/concepts/suggest.ts";
import { MAX_NAME_WORDS, NAME_CONTRACT, bundleReason, recentDrops } from "../src/concepts/conceptName.ts";
import { droppedLine } from "../src/concepts/vocabulary.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { acceptConceptEvents } from "../src/concepts/door.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief } from "../src/state/projects.ts";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";

const P = "p-m90";
let n = 0;
const uid = () => `90909090-4444-4444-8444-${String((n += 1)).padStart(12, "0")}`;
let t = 50_000;
const clock = { now: () => (t += 10), makeId: uid };
const context = studyContext({ ...emptyBrief(), context: "Office hours at a start-up programme, where the programme's staff introduce some founders to mentors." });

const SUMMARY =
  "At office hours the staff introduced some founders to the mentors by name, and those founders got longer slots; the others got the standard fifteen minutes.";

const concept = (name: string, why = "WHY: You need it to tie each introduction to the length of a slot.") =>
  `NAME: ${name}\nDEFINITION: ${name}, in your words [...]\n${why}`;
const relation = (from: string, kind: string, to: string, claim: string) =>
  `FROM: ${from}\nKIND: ${kind}\nTO: ${to}\nCLAIM: ${claim}\nWHY: You need it to tie the introduction to the time.`;

const run = (client: MockInferenceClient, events: readonly LedgerEvent[] = []) =>
  suggestConcepts(
    { projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "summary", station: "context" }, text: SUMMARY, clock },
    client,
  );

const names = (out: readonly LedgerEvent[]) => out.flatMap((e) => (e.type === "concept-suggested" ? [e.name] : []));

describe("the guard reads a name for a bundle", () => {
  test("the owner's bundle and its kin are bundles", () => {
    for (const bundle of [
      "Introduced founders' longer slots",
      "Delayed doctors' rounds",
      "Introduced longer slots",
      "Getting founders' slots",
      "Introducing the founders",
      "Introductions and founders",
      "Acme and Beta Labs",
      "Mentors or staff",
      "Introductions, founders",
      "Mentors/staff",
      "Founders' longer office hour slots",
    ]) {
      expect({ bundle, reason: bundleReason(bundle) }).toEqual({ bundle, reason: expect.any(String) });
    }
  });

  test("a noun, a gerund and a short noun phrase pass", () => {
    for (const name of [
      "introductions",
      "founders",
      "Introduction",
      "pitching",
      "founder pitching",
      "office hour slots",
      "office hour slot time",
      "Office-hours slot",
      "Time on task",
      "Room performance",
      "seed funding",
      "Funding rounds",
      "Mentors' attention",
      // The lead's ruling, 2026-10-14: a bare -ed opener is a modifier, not a verb.
      "Introduced founders",
      "Introduced founder",
      "Shared office space",
      "Limited partners",
      "Extended office hours",
    ]) {
      expect({ name, reason: bundleReason(name) }).toEqual({ name, reason: null });
    }
  });

  test(`a name over ${MAX_NAME_WORDS} words is a bundle`, () => {
    const at = Array.from({ length: MAX_NAME_WORDS }, () => "slot").join(" ");
    expect(bundleReason(at)).toBeNull();
    expect(bundleReason(`${at} time`)).not.toBeNull();
  });
});

describe("the prompt carries the contract", () => {
  test("NAME asks for one noun or gerund naming one thing, and a compound becomes concepts and relations", async () => {
    const client = new MockInferenceClient({ responses: [concept("introductions")] });
    await run(client);
    const system = client.requests[0]!.system;
    expect(system).toContain(NAME_CONTRACT);
    expect(system).toContain("one noun or one gerund");
    // The lead's ruling, 2026-10-14: four words, so the owner's "office hour slot time" passes.
    expect(MAX_NAME_WORDS).toBe(4);
    expect(system).toContain("at most four words");
    expect(system).toContain("(introductions, founders, office hour slot time)");
    expect(system).toContain("Introduced founders' longer slots");
    expect(system).toContain("relations that joined them");
    expect(system).not.toContain("under six words");
    // The rest of the contract stands: their words, the gap marker, the caps, the WHY lines.
    expect(system).toContain("[...]");
    expect(system).toContain("At most 3 new concepts and at most 3 new relations");
    expect(system).toContain("WHY:");
  });
});

describe("a bundle goes back once to be split", () => {
  test("no bundle, one call", async () => {
    const client = new MockInferenceClient({ responses: [[concept("introductions"), concept("founders")].join("\n---\n")] });
    const out = await run(client);
    expect(client.requests.length).toBe(1);
    expect(names(out)).toEqual(["introductions", "founders"]);
  });

  test("the bundle is asked again with the instruction to split it, and the split arrives as concepts and relations", async () => {
    const client = new MockInferenceClient({
      responses: [
        [concept("Introduced founders' longer slots"), concept("mentors")].join("\n---\n"),
        [
          concept("introductions"),
          concept("founders"),
          relation("introductions", "leads-to", "mentors", "The staff introduced some founders to the mentors by name."),
          relation("introductions", "condition-for", "founders", "Introduced founders got longer slots."),
        ].join("\n---\n"),
      ],
    });
    const out = await run(client);
    expect(client.requests.length).toBe(2);
    const again = client.requests[1]!.messages;
    expect(again.length).toBe(3);
    expect(again[1]!.role).toBe("assistant");
    expect(again[2]!.content).toContain("Introduced founders' longer slots");
    expect(again[2]!.content).toMatch(/\bsplit\b/i);
    expect(names(out)).toEqual(["mentors", "introductions", "founders"]);
    expect(out.filter((e) => e.type === "relation-suggested").length).toBe(2);
    expect(out.some((e) => e.type === "suggestion-dropped")).toBe(false);
    for (const e of out) expect(validateEvent(e)).toEqual([]);
  });

  test("a second bundle is dropped, and History says so", async () => {
    const client = new MockInferenceClient({
      responses: [concept("Introduced founders' longer slots"), concept("Introduced founders and their slots")],
    });
    const out = await run(client);
    expect(client.requests.length).toBe(2);
    expect(names(out)).toEqual([]);
    const dropped = out.filter((e) => e.type === "suggestion-dropped");
    expect(dropped.length).toBe(1);
    const d = dropped[0]!;
    if (d.type !== "suggestion-dropped") throw new Error("wrong type");
    expect(d.name).toBe("Introduced founders and their slots");
    expect(d.actor).toBe("persona:concept-suggester");
    expect(validateEvent(d)).toEqual([]);
    const row = projectLedger(out).find((r) => r.id === d.id)!;
    expect(row.who).toBe("Abductive");
    expect(row.happened).toContain('"Introduced founders and their slots"');
  });

  test("a bundle that the second answer leaves out is dropped too", async () => {
    const client = new MockInferenceClient({ responses: [concept("Introduced founders' longer slots"), "---"] });
    const out = await run(client);
    const dropped = out.flatMap((e) => (e.type === "suggestion-dropped" ? [e.name] : []));
    expect(dropped).toEqual(["Introduced founders' longer slots"]);
  });

  test("a researcher's event is refused as a drop", () => {
    const e = { id: uid(), ts: 1, actor: "human", projectId: P, type: "suggestion-dropped", name: "X and Y", reason: "joins two things", source: { kind: "summary", station: "context" } } as LedgerEvent;
    expect(validateEvent(e).length).toBeGreaterThan(0);
  });
});

describe("the tray names what Abductive left out", () => {
  const drop = (name: string, ts: number): LedgerEvent =>
    ({ id: uid(), ts, actor: "persona:concept-suggester", model: "m", modelVersion: "v", projectId: P, type: "suggestion-dropped", name, reason: "joins two things", source: { kind: "summary", station: "context" } }) as LedgerEvent;

  test("the line names each drop since your last decision on the tab", () => {
    const suggested = {
      id: uid(), ts: 100, actor: "persona:concept-suggester", model: "m", modelVersion: "v", projectId: P, type: "concept-suggested",
      conceptId: "c-intro", name: "introductions", definition: "d", properties: [], relations: [], statementIds: [], statements: [], source: { kind: "summary", station: "context" },
    } as LedgerEvent;
    const before = [suggested, drop("Introduced founders' longer slots", 110)];
    expect(recentDrops(before, P)).toEqual(["Introduced founders' longer slots"]);
    const decided = [...before, ...acceptConceptEvents(before, { projectId: P, conceptId: "c-intro" }, { now: () => 200, makeId: uid })];
    expect(recentDrops(decided, P)).toEqual([]);
    expect(recentDrops([...decided, drop("A and B", 300), drop("C or D", 310)], P)).toEqual(["A and B", "C or D"]);
  });

  test("the sentence, for one and for two", () => {
    expect(droppedLine([])).toBeNull();
    expect(droppedLine(["Introduced founders' longer slots"])).toBe(
      "Abductive left out a suggestion, \"Introduced founders' longer slots\", because its name joined more than one concept and the model didn't split it when Abductive asked.",
    );
    expect(droppedLine(["A and B", "C or D"])).toBe(
      "Abductive left out two suggestions, \"A and B\" and \"C or D\", because each name joined more than one concept and the model didn't split them when Abductive asked.",
    );
  });
});
