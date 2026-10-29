/**
 * M78a, ISC-679: the Report on the serendipity walk's record is under 20 kB,
 * by trimming what a reader doesn't need (the lead's ruling (a), 2026-10-03).
 *
 * The walk exported 42.2 kB. Most of it was 22 concept sections padded with
 * "variation not defined yet" and "None yet." lines, each relation written out
 * under both of its concepts and again under Relations, and a field list that
 * named each concept twice per line. What must stay: every concept's name and
 * definition, every defined property, every relation once in full, every placed
 * statement and the puzzle.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent } from "../src/ledger/events.ts";
import type { ProjectBrief } from "../src/state/projects.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts } from "../src/concepts/projection.ts";
import { buildOntologyMemo } from "../src/export/ontologyMemo.ts";
import { conceptReportLines, relationAnchor } from "../src/export/conceptsExport.ts";
import { relationSentence } from "../src/concepts/vocabulary.ts";

const WALK = (await Bun.file(new URL("./fixtures/m76-walk.json", import.meta.url)).json()) as {
  project: { id: string; title: string; brief: ProjectBrief };
  documents: never[];
  chunks: never[];
  events: LedgerEvent[];
};
const WP = WALK.project.id;
const graph = projectOntology(WALK.events, WP);
const view = projectConcepts(WALK.events, WP, graph);
const md = buildOntologyMemo({
  project: WALK.project as never,
  graph,
  events: WALK.events,
  labels: { chunks: WALK.chunks, documents: WALK.documents },
  now: () => 1_790_974_000_000,
} as never);
const bytes = (s: string) => new TextEncoder().encode(s).length;

function section(title: string): string {
  const start = md.indexOf(`\n${title}\n`);
  if (start < 0) return "";
  const level = title.match(/^#+/)?.[0].length ?? 2;
  const rest = md.slice(start + 1);
  const next = rest.slice(title.length).search(new RegExp(`\\n#{1,${level}} `));
  return next < 0 ? rest : rest.slice(0, title.length + next);
}

describe("the Report on the walk's record", () => {
  /* The lead's ruling (2026-10-03): the bar is 30 kB. The content the ruling
     keeps measures about 20.6 kB on this record before any heading, so the
     brief's 20 kB was out of reach without dropping some of it. M82 (the lead's
     ruling A, 2026-10-04): the bar is 40 kB on this record with a Why it matters
     line on every card, and who wrote the lines is said once for the section. */
  test("is under 40 kB", () => {
    expect(bytes(md)).toBeLessThan(40_000);
  });

  test("with a Why it matters line on every card and The argument so far, it stays under 40 kB (M82)", () => {
    /* Lines as long as the Safari walk's, about 300 characters in two sentences. */
    const line = (name: string) =>
      `${name} is the part of your account that ties the drop in chance encounters after May to something you can watch at the crib. Without ${name} in your design, the comparison across the two periods has a gap that your fieldnotes can't fill.`;
    let k = 0;
    const cards = [
      ...view.accepted.map((c) => ({ kind: "concept" as const, id: c.id, name: c.name })),
      ...view.acceptedRelations.map((r) => ({ kind: "relation" as const, id: r.id, name: "this relation" })),
    ];
    const lined: LedgerEvent[] = [
      ...WALK.events,
      ...cards.map(
        (card) =>
          ({
            id: `m82-why-${(k += 1)}`,
            ts: 1_790_973_000_000 + k,
            actor: "persona:why-writer",
            model: "m",
            modelVersion: "v",
            projectId: WP,
            type: "why-suggested",
            target: { kind: card.kind, id: card.id },
            text: line(card.name),
          }) as LedgerEvent,
      ),
      {
        id: "m82-argument",
        ts: 1_790_973_100_000,
        actor: "persona:argument-writer",
        model: "m",
        modelVersion: "v",
        projectId: WP,
        type: "argument-written",
        text: "You argue that the booking system cut Dave's introductions and, because founders stopped waiting at the crib, cut the helpers' stories that other founders overheard and acted on. Your accepted cards don't yet link Dave's introductions to Acting on a lead.",
        basis: "b",
      } as LedgerEvent,
    ];
    const full = buildOntologyMemo({
      project: WALK.project as never,
      graph,
      events: lined,
          labels: { chunks: WALK.chunks, documents: WALK.documents },
      now: () => 1_790_974_000_000,
    } as never);
    expect((full.match(/\*\*Why it matters:\*\*/g) ?? []).length).toBe(cards.length);
    console.log(`M82: the walk's Report with every Why line and the argument: ${bytes(full)} bytes; without: ${bytes(md)} bytes`);
    expect(bytes(full)).toBeLessThan(40_000);
  });

  test("drops the padding lines", () => {
    expect(md).not.toContain("variation not defined yet");
    expect(md).not.toContain("- None yet.");
    expect(md).not.toContain("- None placed yet.");
  });

  test("keeps every concept's name and definition", () => {
    for (const c of view.accepted) {
      expect(md).toContain(`### ${c.name}\n`);
      expect(md).toContain(c.definition);
    }
  });

  test("keeps every defined property with its variation", () => {
    const lines = conceptReportLines(
      [
        ...WALK.events,
        {
          id: "zz-prop",
          ts: 1_790_974_000_001,
          actor: "human",
          projectId: WP,
          type: "concept-property-set",
          conceptId: view.accepted[0]!.id,
          propertyId: view.accepted[0]!.properties[0]!.id,
          name: view.accepted[0]!.properties[0]!.name,
          varies: "from one founder to five",
        } as never,
      ],
      WP,
      graph,
    ).join("\n");
    expect(lines).toContain(`- ${view.accepted[0]!.properties[0]!.name}: from one founder to five`);
  });

  test("writes every relation once in full and links to it from its concepts", () => {
    const name = (id: string) => view.concepts.get(id)?.name ?? "";
    view.acceptedRelations.forEach((r, i) => {
      const heading = `#### R${i + 1}. ${relationSentence(name(r.from), r.relation, name(r.to))}`;
      expect(md.split(heading).length - 1).toBe(1);
      if (r.claim !== "") expect(md.split(r.claim).length - 1).toBe(1);
      expect(md).toContain(`](#${relationAnchor(i, r, name)})`);
    });
  });

  test("keeps every placed statement", () => {
    for (const s of view.statements.values()) {
      if (s.conceptId === null && s.relationId === null) continue;
      expect(md).toContain(s.text);
    }
  });

  test("keeps the puzzle", () => {
    expect(md).toContain(WALK.project.brief.puzzleAnswer!.slice(0, 80));
  });

  test("prints each field line once, grouped under its concept with the question only", () => {
    const field = section("## What to look for in the field");
    expect(field).toContain("\n### Dave's introductions\n\n- How often do they happen?\n- Which days do they happen on?\n");
    expect(field).toContain("- Compare reasons to be at the bench.");
    expect(field).not.toContain("In each case of");
    expect(field).not.toContain("Across your cases of");
    const items = field.split("\n").filter((l) => l.startsWith("- "));
    expect(items.length).toBeGreaterThan(40);
  });
});
