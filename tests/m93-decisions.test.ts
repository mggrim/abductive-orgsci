/**
 * M93, ISC-755 to ISC-770: every model output the researcher keeps is a
 * decision on the record.
 *
 * The owner, 2026-10-16: "at each station, it feels like there needs to be a
 * step at the end after the chat has progressed, where the user can click a
 * button that says surface concepts and relationships, which then the model
 * surfaces from the chat, and then the user can accept or reject those
 * emerging insights." Asked whether the pass reads one side of the chat or
 * both, he said "both". The proposal's two claims (History shows which partner
 * proposed, changed or dropped each expectation and puzzle; over-reliance is
 * measured from what the researcher accepts) fail while model text enters the
 * project with no decision, or while one Accept writes several decisions.
 *
 * `tests/fixtures/m93-pre.bundle.json` is a project built with the code on main
 * at 895b64d (concepts accepted with their bundled parts, a relation, a placed
 * statement, Why it matters lines, an argument and a puzzle reading mirrored
 * into the research question); `m93-pre.meaning.json` is what main's code reads
 * out of it. The last block holds the current code to the same reading.
 */

import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { validateEvent, type LedgerEvent, type PuzzleReadingEvent } from "../src/ledger/events.ts";
import { MockInferenceClient } from "../src/inference/mock.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { studyContext } from "../src/interview/studyContext.ts";
import { emptyBrief, getProject, saveProject } from "../src/state/projects.ts";
import { CHAT_DROP_REASON, suggestConcepts } from "../src/concepts/suggest.ts";
import { chatTurnsAt, originOf, savedSummariesAt, speakers, suggestionOrigin, surfaceReady, surfacingsAt, unsurfacedTurns } from "../src/concepts/chat.ts";
import { runSurfacing } from "../src/concepts/run.ts";
import { CHAT_ORIGIN_LABEL } from "../src/concepts/vocabulary.ts";
import {
  acceptAllOnCardEvents,
  acceptConceptEvents,
  acceptPropertyEvents,
  acceptRelationEvents,
  acceptStatementEvents,
  addConceptEvents,
  homeWaiting,
  rejectPropertyEvents,
  rejectWhyEvents,
  relationBlocked,
} from "../src/concepts/door.ts";
import {
  acceptArgumentEvent,
  acceptReadingEvent,
  declineDraftEvent,
  editedFrom,
  readingDecision,
  rejectArgumentEvent,
  rejectedBefore,
} from "../src/concepts/decisions.ts";
import { argumentEvent } from "../src/concepts/why.ts";
import { conceptReportLines } from "../src/export/conceptsExport.ts";
import { decidedReading, puzzleOfRecord, puzzleState } from "../src/views/puzzleReading.ts";
import { acceptReading, rejectReading } from "../src/flow/usePuzzleReading.ts";
import { pendingFramingDrafts } from "../src/flow/FramingBand.tsx";
import { SAVE_SUGGESTS_CONCEPTS } from "../src/flow/StationWorkspace.tsx";
import { SURFACE_EMPTY, SURFACE_LABEL, surfacedLine } from "../src/ui/SurfaceStep.tsx";
import { ConceptsPage } from "../src/ui/ConceptsView.tsx";
import { needsWhy } from "../src/ui/ConceptsView.tsx";
import { bearingEvents } from "../src/views/paperBearings.ts";
import { recordConversationTurn, resetInterviewInFlight } from "../src/interview/orchestrator.ts";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";
import { parseBundle } from "../src/export/bundle.ts";
import { OWNER_LABELS } from "./copyBarScan.ts";

const P = "p-m93";
let n = 0;
const uid = () => `93939393-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`;
let t = 1_000_000;
const clock = { now: () => (t += 10), makeId: uid };
const ai = { model: "claude-sonnet-5-5", modelVersion: "2026-10-01" };
const env = (actor: string) => ({ id: uid(), ts: (t += 10), actor, projectId: P, ...(actor.startsWith("persona:") ? ai : {}) });
const context = studyContext({ ...emptyBrief(), context: "Three community repair cafes in one city." });
const onto = (events: readonly LedgerEvent[]) => projectConcepts(events, P, projectOntology(events, P));

/** A chat at Context, both sides: Abductive asks, the researcher answers, twice. */
function chat(): { events: LedgerEvent[]; ids: Record<"q1" | "a1" | "h1" | "q2" | "a2" | "h2", string> } {
  const q1 = { ...env("system"), ...ai, type: "question-selection", moveId: "conversation:context@1", topic: "station:context", question: "What setting do you plan to study?", alternatives: [], mode: "interrogation", station: "context", reason: "Asked." } as LedgerEvent;
  const a1 = { ...env("persona:interviewer"), type: "response", text: "Let's start with the setting.", inReplyTo: q1.id } as LedgerEvent;
  const h1 = { ...env("human"), type: "response", text: "Three repair cafes, each with a sign-in sheet of every item brought in.", inReplyTo: q1.id } as LedgerEvent;
  const q2 = { ...env("system"), ...ai, type: "question-selection", moveId: "conversation:context@2", topic: "station:context", question: "Which items do fixers turn away?", alternatives: [], mode: "interrogation", station: "context", reason: "Asked." } as LedgerEvent;
  const a2 = { ...env("persona:interviewer"), type: "response", text: "The sign-in sheet gives you a record.", inReplyTo: q2.id } as LedgerEvent;
  const h2 = { ...env("human"), type: "response", text: "Lamps wait while fixers talk over a toaster.", inReplyTo: q2.id } as LedgerEvent;
  return { events: [q1, a1, h1, q2, a2, h2], ids: { q1: q1.id, a1: a1.id, h1: h1.id, q2: q2.id, a2: a2.id, h2: h2.id } };
}

const surfacing = (events: readonly LedgerEvent[], place = "context") => {
  const turns = unsurfacedTurns(events, P, place);
  return { ...env("human"), type: "surfacing", station: place, turnIds: turns.map((x) => x.id), summaryIds: [] } as LedgerEvent;
};

describe("M93: Surface concepts and relationships reads both sides of a step's chat (ISC-755, ISC-756)", () => {
  test("the label is the owner's, listed beside the M92 one", () => {
    expect(SURFACE_LABEL).toBe("Surface concepts and relationships");
    expect(OWNER_LABELS.has(SURFACE_LABEL)).toBe(true);
  });

  test("a delivered question is one turn of Abductive's; the researcher's replies are theirs", () => {
    const { events, ids } = chat();
    const turns = chatTurnsAt(events, P, "context");
    expect(turns.map((x) => [x.id, x.who])).toEqual([
      [ids.a1, "abductive"],
      [ids.h1, "researcher"],
      [ids.a2, "abductive"],
      [ids.h2, "researcher"],
    ]);
    expect(turns[0]!.text).toContain("What setting do you plan to study?");
    expect(chatTurnsAt(events, P, "process")).toEqual([]);
  });

  test("the control opens on an unread reply of the researcher's, closes once read, and opens again on the next", () => {
    const { events } = chat();
    expect(surfaceReady([], P, "context")).toBe(false);
    expect(surfaceReady(events.slice(0, 2), P, "context")).toBe(false); // Abductive's turns alone
    expect(surfaceReady(events, P, "context")).toBe(true);
    const read = [...events, surfacing(events)];
    expect(surfaceReady(read, P, "context")).toBe(false);
    expect(unsurfacedTurns(read, P, "context")).toEqual([]);
    const more = [...read, { ...env("human"), type: "response", text: "Bicycles go first.", station: "context" } as LedgerEvent];
    expect(surfaceReady(more, P, "context")).toBe(true);
    expect(unsurfacedTurns(more, P, "context").map((x) => x.text)).toEqual(["Bicycles go first."]);
  });

  test("Save answer on a Design step no longer starts a pass, behind one constant", () => {
    expect(SAVE_SUGGESTS_CONCEPTS.on).toBe(false);
  });
});

describe("M93: whose words a suggestion is, worked out from the turns (ISC-757)", () => {
  test("researcher, Abductive or both, and null for a turn off the record or none", () => {
    const { events, ids } = chat();
    const who = speakers(events);
    expect(originOf([ids.h1], who)).toBe("researcher");
    expect(originOf([ids.a1, ids.q2], who)).toBe("abductive");
    expect(originOf([ids.h1, ids.a2], who)).toBe("both");
    expect(originOf([], who)).toBeNull();
    expect(originOf([ids.h1, "not-a-turn"], who)).toBeNull();
    expect(CHAT_ORIGIN_LABEL).toEqual({ researcher: "From your words", abductive: "From Abductive's questions", both: "From both" });
  });

  test("each item stores the turns it names; an item naming a turn off the transcript, or none, is dropped and logged", async () => {
    const { events, ids } = chat();
    const turns = chatTurnsAt(events, P, "context");
    const reply = [
      "NAME: Ghost\nDEFINITION: A thing.\nTURNS: T9",
      "NAME: Sign-in sheet\nDEFINITION: The record each cafe keeps of every item.\nTURNS: T2\nSTATEMENT: Each cafe keeps a sheet of every item. [[turn:T2]]",
      "NAME: Unsourced\nDEFINITION: A thing with no turns.",
      "NAME: Lamp\nDEFINITION: An item that waits.\nTURNS: T3, T4",
      "FROM: Sign-in sheet\nKIND: leads-to\nTO: Lamp\nCLAIM: The sheet records the lamps that wait.\nTURNS: T1, T3",
    ].join("\n---\n");
    const client = new MockInferenceClient({ responses: [reply] });
    const source = { kind: "chat" as const, station: "context", turnIds: turns.map((x) => x.id), surfacingId: uid() };
    const out = await suggestConcepts({ projectId: P, events, graph: projectOntology(events, P), context, source, text: "", turns, clock }, client);
    for (const e of out) expect(validateEvent(e)).toEqual([]);
    const who = speakers(events);
    const concepts = out.flatMap((e) => (e.type === "concept-suggested" ? [e] : []));
    expect(concepts.map((c) => [c.name, c.drawnFrom, suggestionOrigin(c, who)])).toEqual([
      ["Sign-in sheet", [ids.h1], "researcher"],
      ["Lamp", [ids.a2, ids.h2], "both"],
    ]);
    const rel = out.find((e) => e.type === "relation-suggested");
    expect(rel?.type === "relation-suggested" && suggestionOrigin(rel, who)).toBe("abductive");
    const st = out.find((e) => e.type === "statement-suggested");
    expect(st?.type === "statement-suggested" && st.drawnFrom).toEqual([ids.h1]);
    const dropped = out.flatMap((e) => (e.type === "suggestion-dropped" ? [[e.name, e.reason]] : []));
    expect(dropped).toEqual([
      ["Ghost", CHAT_DROP_REASON],
      ["Unsourced", CHAT_DROP_REASON],
    ]);
    // History says why, in the chat's own terms.
    const rows = projectLedger([...events, ...out]).filter((r) => r.kind === "suggestion-dropped");
    expect(rows[0]!.happened).toBe('Abductive left out a suggestion, "Ghost", because it named turns that aren\'t in the chat at Context.');
    // The generator receives studyContext and both sides of the chat, labelled by speaker.
    const asked = client.requests[0]!.messages[0]!.content as string;
    expect(asked).toContain("# The study you are reading for");
    expect(asked).toContain("T1. (Abductive)");
    expect(asked).toContain("T2. (The researcher)");
    expect(client.requests[0]!.system).toContain("TURNS:");
  });
});

describe("M93: a chat source on the record (ISC-756, ISC-757)", () => {
  const base = { ...env("persona:concept-suggester"), type: "concept-suggested", conceptId: "c1", name: "Lamp", definition: "An item.", properties: [], relations: [], statementIds: [], statements: [] };
  test("the validator wants the step, the turns read, and drawnFrom among them", () => {
    const ok = { ...base, source: { kind: "chat", station: "context", turnIds: ["t1", "t2"] }, drawnFrom: ["t2"] };
    expect(validateEvent(ok)).toEqual([]);
    expect(validateEvent({ ...ok, source: { kind: "chat", turnIds: ["t1"] } }).join(" ")).toContain("station");
    expect(validateEvent({ ...ok, source: { kind: "chat", station: "context", turnIds: [] } }).join(" ")).toContain("at least one turn");
    expect(validateEvent({ ...ok, drawnFrom: ["t9"] }).join(" ")).toContain("did not read");
    expect(validateEvent({ ...ok, drawnFrom: undefined }).join(" ")).toContain("drawnFrom");
    expect(validateEvent({ ...base, source: { kind: "summary", station: "context" }, drawnFrom: ["t1"] }).join(" ")).toContain("only on a suggestion from the chat");
    const press = { ...env("human"), type: "surfacing", station: "context", turnIds: ["t1"], summaryIds: [] };
    expect(validateEvent(press)).toEqual([]);
    expect(validateEvent({ ...press, actor: "system" }).join(" ")).toContain("researcher's press");
  });
});

describe("M93: one surfacing event per press, then the model's suggestions (ISC-760)", () => {
  test("the press is the researcher's and comes first; the summary saved here is read too; zero suggestions says so", async () => {
    const { events, ids } = chat();
    const summary = { ...env("human"), type: "bound", subject: "context", statement: "Three cafes, each keeping a sheet of every item." } as LedgerEvent;
    const store: LedgerEvent[] = [...events, summary];
    const io = { readEvents: async () => store, appendAll: async (es: readonly LedgerEvent[]) => void store.push(...es) };
    expect(savedSummariesAt(store, P, "context").map((x) => x.id)).toEqual([summary.id]);
    const client = new MockInferenceClient({ responses: ["NAME: Sign-in sheet\nDEFINITION: The record each cafe keeps.\nTURNS: T2, S1"] });
    const counts = await runSurfacing({ projectId: P, brief: emptyBrief(), place: "context", ...io, clock }, client);
    expect(counts.concepts).toBe(1);
    const fresh = store.slice(events.length + 1);
    expect(fresh[0]!.type).toBe("surfacing");
    expect(fresh[0]!.actor).toBe("human");
    const press = fresh[0] as Extract<LedgerEvent, { type: "surfacing" }>;
    expect(press.turnIds).toEqual([ids.a1, ids.h1, ids.a2, ids.h2]);
    expect(press.summaryIds).toEqual([summary.id]);
    const c = fresh.find((e) => e.type === "concept-suggested");
    expect(c?.actor).toBe("persona:concept-suggester");
    expect(c?.model).toBe("mock");
    expect((c?.modelVersion ?? "") !== "").toBe(true);
    expect(c?.type === "concept-suggested" && c.drawnFrom).toEqual([ids.h1, summary.id]);
    expect(c?.type === "concept-suggested" && c.source.kind === "chat" && c.source.surfacingId).toBe(press.id);
    expect(surfacingsAt(store, P, "context").map((s) => s.suggestions)).toEqual([1]);
    // A second press after a new reply, and a reply with nothing in it.
    store.push({ ...env("human"), type: "response", text: "Bicycles go first.", station: "context" } as LedgerEvent);
    const empty = await runSurfacing({ projectId: P, brief: emptyBrief(), place: "context", ...io, clock }, new MockInferenceClient({ responses: [""] }));
    expect(empty).toMatchObject({ concepts: 0, relations: 0, statements: 0 });
    expect(surfacingsAt(store, P, "context").map((s) => s.suggestions)).toEqual([1, 0]);
    expect(surfacedLine(empty)).toBe(SURFACE_EMPTY);
    expect(projectLedger(store).find((r) => r.kind === "surfacing")?.happened).toBe("You asked Abductive to surface concepts and relationships from 4 turns of the chat at Context");
  });
});

describe("M93: one accept, one decision (ISC-764)", () => {
  const suggestion = (id: string, name: string, over: Record<string, unknown> = {}) =>
    ({
      ...env("persona:concept-suggester"),
      type: "concept-suggested",
      conceptId: id,
      name,
      definition: `${name}, as defined.`,
      properties: ["Length", "Order"],
      relations: [],
      statementIds: [],
      statements: [],
      source: { kind: "summary", station: "context" },
      whyItMatters: `${name} matters to your puzzle.`,
      ...over,
    }) as LedgerEvent;

  test("Accept writes the concept alone; its properties, Why it matters line and relations wait", () => {
    const anchor = addConceptEvents([], { projectId: P, name: "Fixer", definition: "A volunteer." }, clock);
    const fixer = onto(anchor).accepted[0]!.id;
    const events = [...anchor, suggestion("c-q", "Queue", { relations: [{ relation: "leads-to", to: fixer }] })];
    const written = acceptConceptEvents(events, { projectId: P, conceptId: "c-q" }, clock);
    expect(written.filter((e) => e.actor === "human").map((e) => e.type)).toEqual(["concept-accepted"]);
    const v = onto([...events, ...written]);
    const q = v.concepts.get("c-q")!;
    expect(q.properties).toEqual([]);
    expect(q.suggestedProperties).toEqual(["Length", "Order"]);
    expect(q.why?.status).toBe("suggested");
    expect(v.links).toEqual([]);
    expect(v.suggestedRelations.map((r) => [r.from, r.to, r.relation])).toEqual([["c-q", fixer, "leads-to"]]);
  });

  test("each part has its own accept and reject; a rejected line stays rejected and is not asked for again", () => {
    let events: LedgerEvent[] = [suggestion("c-q", "Queue")];
    events = [...events, ...acceptConceptEvents(events, { projectId: P, conceptId: "c-q" }, clock)];
    events = [...events, ...acceptPropertyEvents(events, { projectId: P, conceptId: "c-q", name: "Length" }, clock)];
    events = [...events, ...rejectPropertyEvents(events, { projectId: P, conceptId: "c-q", name: "Order", reason: "Order is the queue itself." }, clock)];
    events = [...events, ...rejectWhyEvents(events, { projectId: P, target: { kind: "concept", id: "c-q" }, reason: "Not why it matters to me." }, clock)];
    for (const e of events) expect(validateEvent(e)).toEqual([]);
    const v = onto(events);
    const q = v.concepts.get("c-q")!;
    expect(q.properties.map((p) => p.name)).toEqual(["Length"]);
    expect(q.suggestedProperties).toEqual([]);
    expect(q.why).toMatchObject({ status: "rejected", reason: "Not why it matters to me." });
    expect(needsWhy(v)).toBe(false);
    // The Report leaves the rejected line out.
    expect(conceptReportLines(events, P, projectOntology(events, P)).join("\n")).not.toContain("Queue matters to your puzzle.");
    const rows = projectLedger(events);
    expect(rows.find((r) => r.kind === "why-rejected")?.happened).toContain("You rejected Abductive's Why it matters line for");
    expect(rows.find((r) => r.kind === "property-rejected")?.happened).toBe('You rejected the suggested property "Order": Order is the queue itself.');
    expect(() => rejectWhyEvents(events, { projectId: P, target: { kind: "concept", id: "c-q" } }, clock)).toThrow();
  });

  test("Accept all writes one accept event per item, each marked bulk", () => {
    const anchor = addConceptEvents([], { projectId: P, name: "Fixer", definition: "A volunteer." }, clock);
    const fixer = onto(anchor).accepted[0]!.id;
    const homed = { ...env("persona:concept-suggester"), type: "statement-suggested", statementId: uid(), text: "The queue grows before Christmas.", home: { kind: "concept", id: "c-q" }, source: { kind: "summary", station: "context" } } as LedgerEvent;
    const events = [...anchor, suggestion("c-q", "Queue", { relations: [{ relation: "leads-to", to: fixer }] }), homed];
    const written = acceptAllOnCardEvents(events, { projectId: P, conceptId: "c-q" }, clock);
    for (const e of written) expect(validateEvent(e)).toEqual([]);
    const decisions = written.filter((e) => e.actor === "human" && e.type !== "concept-relation-set" && !e.type.startsWith("look-for-"));
    expect(decisions.map((e) => e.type)).toEqual([
      "concept-accepted",
      "concept-property-set",
      "concept-property-set",
      "why-accepted",
      "relation-accepted",
      "statement-attached",
    ]);
    expect(decisions.every((e) => (e as { bulk?: true }).bulk === true)).toBe(true);
    const v = onto([...events, ...written]);
    expect(v.concepts.get("c-q")!.properties.length).toBe(2);
    expect(v.links.length).toBe(1);
    expect(v.suggestedStatements).toEqual([]);
  });

  test("a relation never accepts an end, and a statement asks for its suggested home's decision first", () => {
    const events: LedgerEvent[] = [
      ...addConceptEvents([], { projectId: P, name: "Fixer", definition: "A volunteer." }, clock),
      suggestion("c-lamp", "Lamp", { properties: [] }),
    ];
    const fixer = onto(events).accepted[0]!.id;
    const rel = { ...env("persona:concept-suggester"), type: "relation-suggested", relationId: "r-1", from: fixer, to: "c-lamp", relation: "leads-to", claim: "Fixers leave lamps.", statementIds: [], statements: [], source: { kind: "relate" } } as LedgerEvent;
    const st = { ...env("persona:concept-suggester"), type: "statement-suggested", statementId: "s-1", text: "Lamps wait.", home: { kind: "concept", id: "c-lamp" }, source: { kind: "summary", station: "context" } } as LedgerEvent;
    let all = [...events, rel, st];
    expect(relationBlocked(onto(all), "r-1")).toBe('Accept the concept "Lamp" first. A relation sits between two concepts in your ontology.');
    expect(() => acceptRelationEvents(all, { projectId: P, relationId: "r-1" }, clock)).toThrow("first");
    expect(homeWaiting(onto(all), { kind: "concept", id: "c-lamp" })).toContain('Decide on the suggested concept "Lamp" first.');
    expect(() => acceptStatementEvents(all, { projectId: P, statementId: "s-1" }, clock)).toThrow("first");
    all = [...all, ...acceptConceptEvents(all, { projectId: P, conceptId: "c-lamp" }, clock)];
    const r = acceptRelationEvents(all, { projectId: P, relationId: "r-1" }, clock);
    expect(r.filter((e) => e.actor === "human").map((e) => e.type)).toEqual(["relation-accepted", "concept-relation-set"]);
    all = [...all, ...r];
    const placed = acceptStatementEvents(all, { projectId: P, statementId: "s-1" }, clock);
    expect(placed.filter((e) => e.actor === "human").map((e) => e.type)).toEqual(["statement-attached"]);
  });
});

describe("M93: the puzzle reading becomes the research question only by a decision (ISC-763)", () => {
  const reading = (text: string, awaits = true): PuzzleReadingEvent =>
    ({ ...env("persona:interviewer"), type: "puzzle-reading", text, sources: [{ kind: "answer", subject: "context" }], digest: "d", ...(awaits ? { awaitsDecision: true } : {}) }) as PuzzleReadingEvent;

  test("a reading written from M93 waits; accept, edit and reject each leave their own record", () => {
    const r = reading("Fixers leave lamps when the queue is short.");
    expect(validateEvent(r)).toEqual([]);
    expect(readingDecision([r], P, r)).toEqual({ kind: "pending" });
    const asWritten = acceptReadingEvent({ projectId: P, reading: r }, clock);
    expect(asWritten).toMatchObject({ type: "reading-accepted", readingId: r.id, edited: false });
    const edited = acceptReadingEvent({ projectId: P, reading: r, text: "Fixers leave lamps even when the queue is short." }, clock);
    expect(edited.edited).toBe(true);
    expect(readingDecision([r, edited], P, r)).toMatchObject({ kind: "accepted", edited: true });
    const declined = declineDraftEvent({ projectId: P, draftId: r.id, kind: "puzzle-reading", reason: "It leaves out my expectation." }, clock);
    expect(validateEvent(declined)).toEqual([]);
    expect(readingDecision([r, declined], P, r)).toEqual({ kind: "rejected", reason: "It leaves out my expectation." });
    expect(decidedReading([r], P)).toBeNull();
    expect(decidedReading([r, edited], P)).toEqual({ text: "Fixers leave lamps even when the queue is short." });
    // A reading from before M93 keeps its effect.
    const old = reading("An old reading.", false);
    expect(readingDecision([old], P, old)).toEqual({ kind: "legacy" });
    expect(decidedReading([old], P)).toEqual({ text: "An old reading." });
  });

  test("a rejected reading is not offered again unchanged", () => {
    const first = reading("Fixers leave lamps.");
    const declined = declineDraftEvent({ projectId: P, draftId: first.id, kind: "puzzle-reading" }, clock);
    const again = reading("Fixers  leave lamps.");
    const other = reading("Fixers leave toasters.");
    const events = [first, declined, again, other];
    expect(rejectedBefore(events, P, again)).toBe(true);
    expect(rejectedBefore(events, P, other)).toBe(false);
    const state = puzzleState({ brief: { ...emptyBrief(), contextAnswer: "x" } as never, chunks: [], documents: [], events: [first, declined, again], projectId: P });
    expect(state.kind === "read" && state.decision.kind).toBe("rejected");
  });

  test("Reject leaves brief.researchQuestion as it was; Accept writes the decision, then the field", async () => {
    await saveProject({ id: P, title: "M93 test", stage: "design-brief", createdAt: 1, brief: { ...emptyBrief(), researchQuestion: "My earlier question." } } as never);
    const r = reading("Fixers leave lamps.");
    const store: LedgerEvent[] = [r];
    const appendAll = async (es: readonly LedgerEvent[]) => void store.push(...es);
    await rejectReading({ projectId: P, reading: r, reason: "Not my puzzle.", appendAll });
    expect((await getProject(P))?.brief.researchQuestion).toBe("My earlier question.");
    expect(store.at(-1)).toMatchObject({ type: "draft-declined", kind: "puzzle-reading", draftId: r.id });
    const r2 = reading("Fixers leave lamps when the queue is short.");
    await acceptReading({ projectId: P, reading: r2, text: "Fixers leave lamps even when the queue is short.", appendAll });
    expect(store.at(-1)).toMatchObject({ type: "reading-accepted", edited: true });
    expect((await getProject(P))?.brief.researchQuestion).toBe("Fixers leave lamps even when the queue is short.");
  });

  test("no writer outside acceptReading puts a value in brief.researchQuestion", () => {
    const root = new URL("../src/", import.meta.url).pathname;
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const writers: string[] = [];
    for (const rel of glob.scanSync(root)) {
      const text = readFileSync(`${root}${rel}`, "utf8");
      for (const m of text.matchAll(/updateBrief\([^;]*researchQuestion/g)) writers.push(`${rel}:${m.index}`);
    }
    expect(writers.map((w) => w.split(":")[0])).toEqual(["flow/usePuzzleReading.ts"]);
    const text = readFileSync(`${root}flow/usePuzzleReading.ts`, "utf8");
    const at = text.indexOf("updateBrief(input.projectId, { researchQuestion: event.text })");
    expect(at).toBeGreaterThan(text.indexOf("export async function acceptReading"));
    expect(text.slice(0, text.indexOf("export async function acceptReading"))).not.toContain("updateBrief(projectId, { researchQuestion");
  });
});

describe("M93: The argument so far is a suggestion until accepted (ISC-762)", () => {
  const concept = addConceptEvents([], { projectId: P, name: "Queue", definition: "The items waiting." }, clock);

  test("a new paragraph waits; the Report carries only the accepted text, labelled by whose it is", async () => {
    const written = await argumentEvent({ projectId: P, brief: emptyBrief(), view: onto(concept), clock }, new MockInferenceClient({ responses: ["You expect the queue to grow before Christmas."] }));
    expect(written?.awaitsDecision).toBe(true);
    let events: LedgerEvent[] = [...concept, written!];
    expect(onto(events).argument?.decision).toBe("suggested");
    const report = () => conceptReportLines(events, P, projectOntology(events, P)).join("\n");
    expect(report()).not.toContain("You expect the queue");
    // Shown on the tab as a suggestion, with its three doors.
    const markup = renderToStaticMarkup(createElement(ConceptsPage, { projectId: P, view: onto(events), chunks: [], documents: [], current: null, onCurrent: () => {}, acts: null }));
    for (const id of ["argument-suggestion", "argument-accept", "argument-edit", "argument-reject"]) expect(markup).toContain(`data-testid="${id}"`);
    const accepted = acceptArgumentEvent({ projectId: P, view: onto(events), text: "My queue grows before Christmas." }, clock);
    expect(accepted.edited).toBe(true);
    events = [...events, accepted];
    expect(report()).toContain("My queue grows before Christmas.");
    expect(report()).toContain("_In your words, edited from the paragraph that Abductive wrote from the concepts and relations that you accepted._");
    const declined = rejectArgumentEvent({ projectId: P, view: onto(events), reason: "Too early." }, clock);
    expect(declined).toMatchObject({ type: "draft-declined", kind: "argument" });
  });

  test("a paragraph from before M93 keeps its effect", () => {
    const old = { ...env("persona:argument-writer"), type: "argument-written", text: "An older paragraph.", basis: "b" } as LedgerEvent;
    const events = [...concept, old];
    expect(onto(events).argument?.decision).toBe("legacy");
    expect(conceptReportLines(events, P, projectOntology(events, P)).join("\n")).toContain("An older paragraph.\n\n_Written by Abductive from the concepts and relations that you accepted._");
  });
});

describe("M93: declined drafts and edited flags (ISC-767, ISC-768)", () => {
  test("bound.edited is said only of a draft, and is computed by comparing the text", () => {
    expect(editedFrom("A  summary.", "A summary.")).toBe(false);
    expect(editedFrom("A summary.", "A changed summary.")).toBe(true);
    const save = { ...env("human"), type: "bound", subject: "context", statement: "x y", draftedFrom: "d1", edited: false };
    expect(validateEvent(save)).toEqual([]);
    expect(validateEvent({ ...save, draftedFrom: undefined }).join(" ")).toContain("only beside draftedFrom");
    expect(validateEvent({ ...save, edited: "no" }).join(" ")).toContain("true or false");
    const rows = projectLedger([save as LedgerEvent]);
    expect(rows[0]!.happened).toBe("x y (Abductive's draft, as written)");
  });

  test("a summary declined on Starting point stays declined across a reload (the M92 open item)", () => {
    const draft = { ...env("persona:interviewer"), type: "brief-draft", station: "framing", field: "startingInterest", text: "Repair cafes.", fromTurnIds: ["t1"] } as LedgerEvent;
    expect(pendingFramingDrafts([draft], P).startingInterest?.eventId).toBe(draft.id);
    const declined = declineDraftEvent({ projectId: P, draftId: draft.id, kind: "brief" }, clock);
    expect(pendingFramingDrafts([draft, declined], P).startingInterest).toBeUndefined();
    expect(projectLedger([draft, declined]).at(-1)?.happened).toBe("You declined a summary that Abductive wrote from the chat");
    expect(validateEvent({ ...declined, actor: "system" }).join(" ")).toContain("researcher's decision");
  });

  test("a placing sentence begun from the judge's reason names it and says whether it changed", () => {
    const [said] = bearingEvents({ projectId: P, paperKey: "k", paperName: "Orr 1996", reason: "It frames repair as tacit work.", startedFrom: "fit-1", edited: true });
    expect(validateEvent(said)).toEqual([]);
    expect(said).toMatchObject({ startedFrom: "fit-1", edited: true });
    expect(validateEvent({ ...said, startedFrom: undefined }).join(" ")).toContain("only beside startedFrom");
    const [typed] = bearingEvents({ projectId: P, paperKey: "k", paperName: "Orr 1996", reason: "Mine." });
    expect(typed).not.toHaveProperty("startedFrom");
  });
});

describe("M93: a conversation's question names the call that wrote it (ISC-769)", () => {
  test("the selection carries the model and version beside its delivery", async () => {
    resetInterviewInFlight();
    const store: LedgerEvent[] = [];
    const out = await recordConversationTurn(
      { projectId: P, place: "context", topic: "station:context", question: "Which items wait?", because: "Asked.", shown: "Let's look at the queue.", mode: "interrogation", ...ai },
      { readEvents: async () => store, appendAll: async (es) => void store.push(...es), newId: uid, now: clock.now },
    );
    expect(out.kind).not.toBe("blocked-outstanding");
    const sel = store.find((e) => e.type === "question-selection");
    expect(sel).toMatchObject({ actor: "system", model: "claude-sonnet-5-5", modelVersion: "2026-10-01" });
    for (const e of store) expect(validateEvent(e)).toEqual([]);
  });
});

describe("M93: a pre-M93 bundle loads with unchanged meaning (ISC-770)", () => {
  const meaning = (text: string) => {
    const bundle = parseBundle(text);
    const id = bundle.project.id;
    const events = bundle.events;
    const graph = projectOntology(events, id);
    const v = projectConcepts(events, id, graph);
    const why = (w: { text: string; by: string; status: string } | null) => (w === null ? null : { text: w.text, by: w.by, status: w.status });
    const ps = puzzleState({ brief: bundle.project.brief, chunks: [], documents: [], events, projectId: id }) as { kind: string; text?: string };
    return {
      accepted: v.accepted.map((c) => ({ id: c.id, name: c.name, definition: c.definition, origin: c.origin ?? null, properties: c.properties.map((p) => [p.name, p.varies ?? null]), why: why(c.why), statementIds: c.statementIds })),
      acceptedRelations: v.acceptedRelations.map((r) => ({ id: r.id, from: r.from, to: r.to, relation: r.relation, claim: r.claim, why: why(r.why), statementIds: r.statementIds })),
      suggested: v.suggested.map((c) => c.id),
      suggestedRelations: v.suggestedRelations.map((r) => r.id),
      suggestedStatements: v.suggestedStatements.map((s) => s.statementId),
      links: v.links.map((l) => l.id),
      unplaced: v.unplaced.map((s) => s.id),
      argument: v.argument === null ? null : v.argument.text,
      researchQuestion: bundle.project.brief.researchQuestion,
      puzzleOfRecord: puzzleOfRecord(bundle.project.brief),
      puzzleState: { kind: ps.kind, text: ps.text ?? null },
      report: conceptReportLines(events, id, graph),
    };
  };
  const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

  test("the current code reads the bundle exactly as main's code did", () => {
    expect(meaning(fixture("m93-pre.bundle.json"))).toEqual(JSON.parse(fixture("m93-pre.meaning.json")));
  });

  test("its reading and its argument keep their effect, and no part waits for a decision", () => {
    const bundle = parseBundle(fixture("m93-pre.bundle.json"));
    const v = projectConcepts(bundle.events, bundle.project.id, projectOntology(bundle.events, bundle.project.id));
    expect(v.accepted.every((c) => c.suggestedProperties.length === 0 && c.why?.status !== "suggested")).toBe(true);
    expect(v.argument?.decision).toBe("legacy");
    expect(v.acceptedArgument?.by).toBe("legacy");
    expect(decidedReading(bundle.events, bundle.project.id)?.text).toBe(bundle.project.brief.researchQuestion);
  });

  test("the coldharbour fixture is the same bytes and still loads", () => {
    const bytes = readFileSync(new URL("./fixtures/coldharbour.bundle.json", import.meta.url));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("b9ab9f79c4419a02c003478c0d12a79892d077fe9c3d0581d404d34842462155");
    for (const e of parseBundle(bytes.toString("utf8")).events) expect(validateEvent(e)).toEqual([]);
  });
});
