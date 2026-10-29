/**
 * M82, ISC-694 and ISC-695: the model's passes.
 *
 * The owner, 2026-10-04: "why aren't there more links between concepts? It
 * seems like there are only dyads that are independent of one another." And:
 * "it just feels like a list of concepts and relationships, without insight
 * into why those concepts or relationships matter."
 *
 *   - Every pass that suggests concepts is asked to relate each new concept to
 *     a concept already accepted where the material supports it, and to say
 *     why each suggestion matters (a WHY line on the block).
 *   - Relate concepts reads every accepted concept with its definition and
 *     statements and proposes up to three relations among them, each resting on
 *     a statement it names.
 *   - Abductive writes a Why it matters line for each accepted card that has
 *     none, from the puzzle, the expectation and the card's statements.
 *   - The argument so far: two to four sentences, at most 60 words, from the
 *     accepted cards, with the read-back's send-back when it runs long.
 */

import { describe, expect, test } from "bun:test";
import { validateEvent, type LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts, type ProjectOntologyView } from "../src/concepts/projection.ts";
import { addConceptEvents, addRelationEvents, answerLineEvents } from "../src/concepts/door.ts";
import { suggestConcepts } from "../src/concepts/suggest.ts";
import { MAX_RELATED, relateConcepts } from "../src/concepts/relate.ts";
import { ARGUMENT_MAX_WORDS, argumentBasis, argumentFits, writeArgument, writeWhyLines } from "../src/concepts/why.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief } from "../src/state/projects.ts";

const P = "p-m82-passes";
let n = 0;
let t = 60_000;
const clock = { now: () => (t += 10), makeId: () => `eeeeeeee-8282-4282-8282-${String((n += 1)).padStart(12, "0")}` };
const brief = {
  ...emptyBrief(),
  researchQuestion: "Why did chance meetings at the tool crib drop after the booking system came in?",
  context: "A deep-tech incubator's shared tool workshop.",
};
const context = studyContext(brief, projectOntology([], P));
const view = (events: readonly LedgerEvent[]): ProjectOntologyView => projectConcepts(events, P, projectOntology(events, P));

/** Four accepted concepts, a relation between two, and a statement under each concept. */
function ontology(): LedgerEvent[] {
  let events: LedgerEvent[] = [];
  for (const [name, definition] of [
    ["Booked slot", "A slot a founder books ahead for a machine."],
    ["Queue talk", "Talk between founders waiting for a machine."],
    ["Drive-by help", "Help from someone passing who was not asked."],
    ["Tool crib", "The shared workshop."],
  ]) {
    events = [...events, ...addConceptEvents(events, { projectId: P, name: name!, definition: definition! }, clock)];
  }
  const id = (name: string) => view(events).accepted.find((c) => c.name === name)!.id;
  events = [...events, ...addRelationEvents(events, { projectId: P, from: id("Queue talk"), to: id("Drive-by help"), relation: "leads-to", claim: "Queue talk leads to drive-by help." }, clock)];
  for (const [name, text] of [
    ["Booked slot", "Since May nobody waits; you come at your time and leave."],
    ["Queue talk", "We'd swap tips while the laser cutter warmed up."],
    ["Drive-by help", "Someone walking past fixed my jig."],
    ["Tool crib", "The crib has one bandsaw and one laser cutter."],
  ]) {
    events = [...events, ...answerLineEvents(events, { projectId: P, conceptId: id(name!), text: text!, chunkId: `chunk-${name}` }, clock)];
  }
  return events;
}

describe("M82: the suggestion passes relate new concepts to accepted ones (ISC-694a)", () => {
  test("the prompt asks for a relation from each new concept to one already in the ontology, and for a WHY line", async () => {
    const events = ontology();
    const client = new MockInferenceClient({ responses: ["NAME: Waiting\nDEFINITION: Time spent at the crib before a machine is free."] });
    await suggestConcepts({ projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "summary", station: "puzzle" }, text: "Since the booking system nobody waits at the crib any more, and the waiting was where people talked.", clock }, client);
    const system = client.requests[0]!.system;
    expect(system).toMatch(/relate each new concept to at least one concept already in their ontology/i);
    expect(system).toContain("WHY:");
    const user = client.requests[0]!.messages[0]!.content;
    for (const name of ["Booked slot", "Queue talk", "Drive-by help", "Tool crib"]) expect(user).toContain(`- ${name}:`);
    expect(user).toContain("Queue talk leads to Drive-by help");
  });

  test("a new concept's relation to an accepted one is kept, and each WHY line lands on its suggestion", async () => {
    const events = ontology();
    const reply = [
      "NAME: Waiting\nDEFINITION: Time spent at the crib before a machine is free.\nWHY: Waiting is the time your puzzle says the booking system removed; without it the drop in queue talk has no mechanism.",
      "FROM: Waiting\nKIND: condition-for\nTO: Queue talk\nCLAIM: Waiting at the crib is a condition for queue talk.\nWHY: This relation carries the mechanism from the booking system to the lost talk.",
    ].join("\n---\n");
    const out = await suggestConcepts(
      { projectId: P, events, graph: projectOntology(events, P), context, source: { kind: "summary", station: "puzzle" }, text: "Since the booking system nobody waits at the crib any more, and the waiting was where people talked.", clock },
      new MockInferenceClient({ responses: [reply] }),
    );
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    const concept = out.find((e) => e.type === "concept-suggested");
    const relation = out.find((e) => e.type === "relation-suggested");
    if (concept?.type !== "concept-suggested" || relation?.type !== "relation-suggested") throw new Error("both suggested");
    expect(concept.whyItMatters).toMatch(/^Waiting is the time/);
    expect(relation.whyItMatters).toMatch(/^This relation carries/);
    expect(relation.from).toBe(concept.conceptId);
    expect(relation.to).toBe(view(events).accepted.find((c) => c.name === "Queue talk")!.id);
  });
});

describe("M82: Relate concepts (ISC-694b)", () => {
  test("the prompt reads every accepted concept with its definition and statements, names the ones standing alone, and the focus", async () => {
    const events = ontology();
    const focus = view(events).accepted.find((c) => c.name === "Tool crib")!.id;
    const client = new MockInferenceClient({ responses: [""] });
    await relateConcepts({ projectId: P, events, graph: projectOntology(events, P), context, focus, clock }, client);
    const { system, messages } = client.requests[0]!;
    const user = messages[0]!.content;
    for (const name of ["Booked slot", "Queue talk", "Drive-by help", "Tool crib"]) expect(user).toContain(name);
    expect(user).toContain("A slot a founder books ahead for a machine.");
    expect(user).toMatch(/S\d+\. We'd swap tips while the laser cutter warmed up\./);
    expect(user).toMatch(/stand alone: Booked slot and Tool crib/i);
    expect(user).toMatch(/Relate Tool crib first/);
    expect(system).toMatch(new RegExp(`at most ${MAX_RELATED} relations`, "i"));
    expect(system).toMatch(/chain/i);
    expect(system).toContain("RESTS:");
  });

  test("up to three relations among accepted concepts, each resting on a statement it names, with its WHY line", async () => {
    const events = ontology();
    const v = view(events);
    const sId = (text: string) => [...v.statements.values()].find((s) => s.text === text)!.id;
    const block = (from: string, kind: string, to: string, rests: string, why = "") =>
      `FROM: ${from}\nKIND: ${kind}\nTO: ${to}\nCLAIM: ${from} ${kind} ${to}.\nRESTS: ${rests}${why === "" ? "" : `\nWHY: ${why}`}`;
    const client = new MockInferenceClient({ responses: [""] });
    await relateConcepts({ projectId: P, events, graph: projectOntology(events, P), context, clock }, client);
    const user = client.requests[0]!.messages[0]!.content;
    const label = (text: string) => new RegExp(`(S\\d+)\\. ${text.replace(/[.?]/g, "\\$&")}`).exec(user)![1]!;
    const reply = [
      block("Booked slot", "leads-to", "Queue talk", label("Since May nobody waits; you come at your time and leave."), "Booked slot is the cause your puzzle names."),
      block("Tool crib", "condition-for", "Queue talk", `${label("The crib has one bandsaw and one laser cutter.")}, ${label("We'd swap tips while the laser cutter warmed up.")}`),
      block("Queue talk", "leads-to", "Drive-by help", label("Someone walking past fixed my jig.")), // already in the ontology
      block("Booked slot", "contrasts-with", "Tool crib", ""), // rests on nothing
      block("A name nobody wrote", "leads-to", "Tool crib", label("Someone walking past fixed my jig.")),
      block("Drive-by help", "varies-with", "Tool crib", label("Someone walking past fixed my jig.")),
      block("Booked slot", "part-of", "Drive-by help", label("Someone walking past fixed my jig.")), // past the cap
    ].join("\n---\n");
    const out = await relateConcepts(
      { projectId: P, events, graph: projectOntology(events, P), context, clock },
      new MockInferenceClient({ responses: [reply] }),
    );
    expect(out.length).toBe(MAX_RELATED);
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    const [first, second, third] = out;
    if (first?.type !== "relation-suggested" || second?.type !== "relation-suggested" || third?.type !== "relation-suggested") throw new Error("relations");
    expect(first.source).toEqual({ kind: "relate" });
    expect(first.restsOn).toEqual([{ kind: "statement", statementId: sId("Since May nobody waits; you come at your time and leave.") }]);
    expect(first.whyItMatters).toBe("Booked slot is the cause your puzzle names.");
    expect(second.restsOn?.length).toBe(2);
    expect(third.relation).toBe("varies-with");
    expect(first.statements).toEqual([]);
    expect(first.statementIds).toEqual([]);
  });

  test("with fewer than two accepted concepts, Abductive makes no call", async () => {
    const events = addConceptEvents([], { projectId: P, name: "Alone", definition: "A." }, clock);
    const client = new MockInferenceClient({ responses: ["FROM: x"] });
    expect(await relateConcepts({ projectId: P, events, graph: projectOntology(events, P), context, clock }, client)).toEqual([]);
    expect(client.requests.length).toBe(0);
  });
});

describe("M82: Why it matters, written for accepted cards (ISC-695)", () => {
  test("one line per accepted card without one, from the puzzle and the card's statements, at most two sentences", async () => {
    const events = ontology();
    const client = new MockInferenceClient({ responses: [""] });
    await writeWhyLines({ projectId: P, events, graph: projectOntology(events, P), context, clock }, client);
    const { system, messages } = client.requests[0]!;
    const user = messages[0]!.content;
    expect(user).toContain("Why did chance meetings at the tool crib drop");
    expect(user).toContain("We'd swap tips while the laser cutter warmed up.");
    expect(system).toMatch(/what the design loses without it/);
    const c = (label: string) => new RegExp(`(${label})\\. `).test(user);
    expect(c("C1") && c("C4") && c("R1")).toBe(true);
    const reply = [
      "C1: Booked slot is the change your puzzle turns on. Without it the design has no before and after. A third sentence goes.",
      "C2: Queue talk is the encounter you expect to lose.",
      "R1: This relation is the mechanism your puzzle needs.",
      "C9: Not a card.",
    ].join("\n");
    const out = await writeWhyLines({ projectId: P, events, graph: projectOntology(events, P), context, clock }, new MockInferenceClient({ responses: [reply] }));
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    const v = view([...events, ...out]);
    const booked = v.accepted.find((x) => x.name === "Booked slot")!;
    expect(booked.why).toEqual({ text: "Booked slot is the change your puzzle turns on. Without it the design has no before and after.", by: "abductive", status: "suggested" });
    expect(v.acceptedRelations[0]!.why?.text).toBe("This relation is the mechanism your puzzle needs.");
    expect(out.length).toBe(3);
  });

  test("a card that has a line is left out, and with every card lined Abductive makes no call", async () => {
    const events = ontology();
    const first = await writeWhyLines(
      { projectId: P, events, graph: projectOntology(events, P), context, clock },
      new MockInferenceClient({ responses: ["C1: a.\nC2: b.\nC3: c.\nC4: d.\nR1: e."] }),
    );
    const client = new MockInferenceClient({ responses: ["C1: again."] });
    const after = [...events, ...first];
    expect(await writeWhyLines({ projectId: P, events: after, graph: projectOntology(after, P), context, clock }, client)).toEqual([]);
    expect(client.requests.length).toBe(0);
  });
});

describe("M82: The argument so far (ISC-695)", () => {
  test("two to four sentences of at most 60 words, sent back once when long and cut at the fourth sentence", async () => {
    expect(ARGUMENT_MAX_WORDS).toBe(60);
    const events = ontology();
    const v = view(events);
    const short = "You expect the booking system to have cut queue talk at the tool crib. Queue talk leads to drive-by help, so you look for less of it since May.";
    const one = new MockInferenceClient({ responses: [short] });
    expect(await writeArgument({ brief, view: v }, one)).toBe(short);
    expect(one.requests[0]!.messages[0]!.content).toContain("Queue talk leads to Drive-by help");
    const long = Array.from({ length: 6 }, (_, i) => `Sentence ${i + 1} says something about booked slots and queue talk at the crib.`).join(" ");
    const two = new MockInferenceClient({ responses: [long, long] });
    const cut = await writeArgument({ brief, view: v }, two);
    expect(two.requests.length).toBe(2);
    expect(cut?.split(/(?<=\.)\s+/).length).toBe(4);
    expect(argumentFits(short)).toBe(true);
    expect(argumentFits(long)).toBe(false);
  });

  test("a paragraph still long after the send-back loses sentences from its end until it keeps 60 words (the Safari walk read 62 in three)", async () => {
    const v = view(ontology());
    const long =
      "Your accepted relations say the Online booking system cut Dave's introductions, and that Helping another founder contrasts with Fixing your own repair, since helpers leave with leads. Waiting at the crib is a condition for Overheard stories, and the Booked slot leads to Drive-by help. You haven't yet connected Booking system as a gain to the fewer encounters you count after May.";
    expect(argumentFits(long)).toBe(false);
    /* The voice retry may ask once more for the long first sentence; every reply stays long. */
    const client = new MockInferenceClient({ responses: [long, long, long] });
    const out = (await writeArgument({ brief, view: v }, client))!;
    expect(client.requests.length).toBeGreaterThanOrEqual(2);
    expect(argumentFits(out)).toBe(true);
    expect(out).toBe(
      "Your accepted relations say the Online booking system cut Dave's introductions, and that Helping another founder contrasts with Fixing your own repair, since helpers leave with leads. Waiting at the crib is a condition for Overheard stories, and the Booked slot leads to Drive-by help.",
    );
  });

  test("Abductive writes it once a concept is accepted, and its basis moves with every accept and refine", async () => {
    const client = new MockInferenceClient({ responses: ["x"] });
    expect(await writeArgument({ brief, view: view([]) }, client)).toBeNull();
    expect(client.requests.length).toBe(0);
    const events = ontology();
    const before = argumentBasis(view(events));
    const more = [...events, ...addConceptEvents(events, { projectId: P, name: "Machine time", definition: "Hours on a machine." }, clock)];
    expect(argumentBasis(view(more))).not.toBe(before);
    expect(argumentBasis(view(events))).toBe(before);
  });
});
