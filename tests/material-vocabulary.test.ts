/**
 * One word for a slice of material, held across the surfaces that say it.
 *
 * The coherence walk found the same object called a passage on /material and a
 * chunk on /coherence, /instrumentation and the coverage map, in one study, on
 * one afternoon. The worst of it was a single finding row on /coherence whose
 * claim read "chunk 79a5efe9 is in the corpus but no page cites it" directly
 * above its own falsifier, which already read "you have read the passage and
 * decided nothing in it belongs in your model". One row, one object, both
 * words, eighteen pixels apart.
 *
 * The internal type is `Chunk` and stays `Chunk`. What is under test is the
 * boundary: nothing the researcher reads, and nothing handed to the model, may
 * call it that. Same property `tests/origin-boundary.test.ts` holds for the
 * origin field, one field further out.
 *
 * M89 (2026-10-14): the structural findings and their falsifiers, which said
 * the same word on Checks, left main with the tab; their three tests went.
 *
 * Written against the prose-producing functions rather than a render, because
 * five of the six sites are pure and the sixth is a title attribute. A leak
 * into a rendered surface is caught by the same assertion either way: the
 * string is built here.
 */

import { describe, expect, test } from "bun:test";
import type { LedgerEvent, Origin, PageType } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { checkAllObligations } from "../src/ontology/relations.ts";
import { projectLedger } from "../src/workbench/Instrumentation.tsx";
import { passageAt, passageCount, passageRef, PASSAGE_WORD } from "../src/ui/materialVocabulary.ts";
import { passageRowLabel } from "../src/flow/CorpusMaterial.tsx";

const PROJECT = "proj-material-vocab";
let clock = 1_900_000_000_000;

function env(actor: "human" | "system" = "human") {
  clock += 1000;
  return { id: crypto.randomUUID(), ts: clock, actor, projectId: PROJECT };
}

function create(
  targetId: string,
  pageType: PageType,
  title: string,
  opts: { origin?: Origin; chunks?: string[] } = {},
): LedgerEvent {
  return {
    ...env(),
    type: "ontology-mutation",
    op: "create",
    targetId,
    pageType,
    title,
    body: "",
    origin: opts.origin ?? "author-prior",
    supportingChunks: opts.chunks ?? [],
  } as LedgerEvent;
}

describe("the word for a slice of material", () => {
  test("the ledger row for an attention event names a passage", () => {
    const rows = projectLedger([
      {
        ...env("system"),
        type: "attention",
        layer: "retrieval",
        chunkId: "79a5efe9-aaaa-bbbb",
      },
    ] as LedgerEvent[]);
    const row = rows[0];
    expect(row).toBeDefined();
    expect(row?.changed).toBe(passageRef("79a5efe9-aaaa-bbbb"));
    expect(`${row?.happened} ${row?.changed}`).not.toContain("chunk");
  });

  test("the coverage map and the material list name the same passage the same way", () => {
    // The collision that opened this file: /material's row said "Passage 12"
    // and the grid cell for that same object said "Chunk #12".
    expect(passageRowLabel(12, "the ward was quiet", { opened: false, cited: false })).toStartWith(
      passageAt(12),
    );
  });

  test("a relation obligation counts passages, singular and plural, with no bracketed s", () => {
    // It read "1 supporting chunk(s)". No other count in the app hedges its
    // plural, and none of them should have to.
    expect(passageCount(1)).toBe("1 passage");
    expect(passageCount(3)).toBe("3 passages");
    const graph = projectOntology(
      [
        create("p1", "puzzle", "Handoff labels drift"),
        create("ob1", "observation", "A", { chunks: ["c1"] }),
        create("ob2", "observation", "B", { chunks: ["c1"] }),
      ],
      PROJECT,
    );
    for (const ob of checkAllObligations(graph)) {
      const said = `${ob.requirement} ${ob.detail}`;
      expect({ relation: ob.relation, saysChunk: /chunk/i.test(said) }).toEqual({
        relation: ob.relation,
        saysChunk: false,
      });
    }
  });
});
