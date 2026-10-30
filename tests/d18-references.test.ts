/**
 * D18: an imported study says what the original said.
 *
 * The defect, on the deployed copy of the example. `bechky-2003.pdf` read "not
 * judged yet" and the Design band counted "3 papers fit, 1 unclear" where the
 * original counts four. Nothing threw. The verdict was in the imported ledger
 * the whole time, filed under the id the document had before the import gave
 * it a new one: `paper-fit.paperKey` is the document id for an uploaded paper,
 * and `remapBundleIds` was not rewriting it.
 *
 * It was one of nine. The others were the chunk on a paper baseline, the
 * composite baseline id, the `[[chunk:ID]]` citations inside a page body, a
 * structural finding id with a chunk id in the middle of it, a lint finding's
 * target, a question's topic and move id and alternatives, and the two turn
 * pointers that say which answer a draft came out of.
 *
 * So the first test here is not about any of the nine. It is the property they
 * are all instances of: after a remap, no string anywhere in the bundle holds
 * an id the remap replaced. A tenth field added next month fails that test on
 * the day it is added, which is the thing a list of fields cannot do.
 *
 * The rest read the real example, because the shipped bundle is the artefact a
 * co-author actually opens and it is the only fixture that carries all nine
 * shapes at once. It is 357 KB, which is a file read per run and no more.
 */

import { describe, expect, test } from "bun:test";

import {
  parseBundle,
  remapBundleIds,
  serializeBundle,
  type ProjectBundle,
} from "../src/export/bundle.ts";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { paperVerdicts } from "../src/proposals/paperFit.ts";
import { paperRefs } from "../src/proposals/theory.ts";
import { paperFitSummary } from "../src/views/paperFitLine.ts";
import { normalizeBrief } from "../src/state/projects.ts";

/* The Gleanline walk of record, the example shipped until 2026-09-13. It stays the
 * fixture here because it holds every shape these tests pin (a paper whose file
 * was removed, a dismissed finding, an export stamp) and the example shipped now
 * does not. What ships is read by tests/m36-share.test.ts and tests/m37-import-references.test.ts. */
const SHIPPED = new URL("./fixtures/gleanline.bundle.json", import.meta.url).pathname;
const SOURCE: ProjectBundle = parseBundle(await Bun.file(SHIPPED).text());

/**
 * A deterministic remap, so a failure names the same ids twice running.
 *
 * The shape matters more than the digits: these have to be ids no field of the
 * source could already hold, or a test could pass by collision.
 */
function copy(bundle: ProjectBundle = SOURCE): ProjectBundle {
  let n = 0;
  return remapBundleIds(bundle, () => `d18-fresh-${(n += 1)}`);
}

/** Every id a remap of this bundle regenerates. */
function regenerated(bundle: ProjectBundle): readonly string[] {
  return [
    bundle.project.id,
    ...bundle.documents.map((d) => d.id),
    ...bundle.chunks.map((c) => c.id),
    ...bundle.anomalies.map((a) => a.id),
    ...(bundle.twin === null ? [] : [bundle.twin.id]),
    ...bundle.events.map((e) => e.id),
  ];
}

const CITATION = /\[\[chunk:([^\]\s]+)\]\]/g;

/** The chunk ids a bundle's page bodies cite inline. */
function citedInBodies(bundle: ProjectBundle): readonly string[] {
  return bundle.events.flatMap((event) => {
    const body = (event as { body?: unknown }).body;
    return typeof body !== "string"
      ? []
      : [...body.matchAll(CITATION)].map((m) => m[1] ?? "");
  });
}

/** The chunk ids a bundle names in a field, wherever they are named. */
function named(bundle: ProjectBundle, field: "supportingChunks" | "sourceChunks"): readonly string[] {
  return bundle.events.flatMap((event) => {
    const value = (event as unknown as Record<string, unknown>)[field];
    return Array.isArray(value) ? (value as string[]) : [];
  });
}

function attentionChunks(bundle: ProjectBundle): readonly string[] {
  return bundle.events.filter((e) => e.type === "attention").map((e) => e.chunkId);
}

function baselineChunks(bundle: ProjectBundle): readonly string[] {
  return bundle.events.flatMap((event) =>
    event.type !== "paper-fit"
      ? []
      : (event.baselines ?? []).flatMap((b) => (b.chunkId === undefined ? [] : [b.chunkId])),
  );
}

/** How many of these ids name a chunk this bundle actually carries. */
function resolved(bundle: ProjectBundle, ids: readonly string[]): number {
  const have = new Set(bundle.chunks.map((c) => c.id));
  return ids.filter((id) => have.has(id)).length;
}

/** The papers line Design prints, off the same selectors FramingBand uses. */
function designPapersLine(bundle: ProjectBundle): {
  readonly line: string;
  readonly judged: number;
  readonly baselinesOn: (name: string) => number | null;
} {
  const brief = normalizeBrief(bundle.project.brief);
  const live = new Set(
    paperRefs({
      documents: bundle.documents,
      chunks: bundle.chunks,
      ...(brief.seminalCorpus === undefined ? {} : { typedList: brief.seminalCorpus }),
    }).map((p) => p.key),
  );
  const verdicts = [...paperVerdicts(bundle.events, bundle.project.id, live).values()];
  return {
    line: paperFitSummary({
      fits: verdicts.filter((v) => v.verdict === "fits").length,
      unclear: verdicts.filter((v) => v.verdict === "unclear").length,
      misfit: verdicts.filter((v) => v.verdict === "misfit").length,
    }),
    judged: verdicts.length,
    baselinesOn: (name) => {
      const found = verdicts.find((v) => v.paperName === name);
      return found === undefined ? null : (found.baselines ?? []).length;
    },
  };
}

// ---------------------------------------------------------------------------

/**
 * The oracle reads differently from the code, on purpose.
 *
 * `rewriteIds` scans by token, because that is what makes a composite key come
 * apart at its separators cheaply. A test that scanned the same way would
 * inherit the same blind spot: a key that packed an id in with a hyphen would
 * be one token, would not be in the map, and both the code and the test would
 * walk past it agreeing.
 *
 * So this scans by substring over the serialized copy. It is the slower read
 * and the complete one, it shares nothing with the implementation but the map,
 * and a uuid cannot appear in 357 KB of text by accident.
 */
describe("D18: the property every one of the nine fields is an instance of", () => {
  test("no id the remap replaced appears anywhere in the copy", () => {
    const replaced = regenerated(SOURCE);
    // Vacuity guard. An empty list would make the loop below pass over nothing.
    expect(replaced.length).toBeGreaterThan(400);
    const text = serializeBundle(copy());
    expect(replaced.filter((id) => text.includes(id))).toEqual([]);
  });

  test("a reference survives whatever syntax it is written inside", () => {
    /* One event carrying the same chunk id five ways: alone, inside the
     * citation syntax, inside a colon-joined composite, inside a hyphen-joined
     * one, and inside a sentence. The fourth is the one the token pass alone
     * would miss and the uuid pass exists for; the fifth is what a model
     * writes when it names a passage in prose. */
    const chunk = SOURCE.chunks[0];
    expect(chunk).toBeDefined();
    const id = (chunk as { id: string }).id;
    const probe: ProjectBundle = {
      ...SOURCE,
      events: [
        {
          ...(SOURCE.events.find((e) => e.type === "response") ?? SOURCE.events[0]),
          text: `${id} [[chunk:${id}]] structural:uncited-chunk:${id} paper-${id} see ${id}.`,
        } as LedgerEvent,
      ],
    };
    const rewritten = copy(probe).events[0] as { text: string };
    expect(rewritten.text).not.toContain(id);
    // Five occurrences in, five fresh ids out, and all of them the same one.
    const fresh = [...rewritten.text.matchAll(/d18-fresh-\d+/g)].map((m) => m[0]);
    expect(fresh).toHaveLength(5);
    expect(new Set(fresh).size).toBe(1);
  });

  test("Anti: the same scan catches the defect that was shipped", () => {
    /* The pre-D18 rewrite in the one respect that matters, which is that it
     * moved the envelope and left `paper-fit.paperKey` where it was. If the
     * scan above cannot see that, it proves nothing about the fix. */
    const halfDone: ProjectBundle = {
      ...SOURCE,
      project: { ...SOURCE.project, id: "d18-fresh-project" },
      events: SOURCE.events.map((e) => ({ ...e, projectId: "d18-fresh-project" })),
    };
    const text = serializeBundle(halfDone);
    const survivors = regenerated(SOURCE).filter((id) => text.includes(id));
    expect(survivors.length).toBeGreaterThan(0);
  });
});

describe("D18: the uploaded paper keeps its verdict", () => {
  test("Design counts the same papers before and after the import", () => {
    const before = designPapersLine(SOURCE);
    const after = designPapersLine(copy());

    // The number the walk reported, pinned rather than merely compared, so a
    // change to the example that alters it is a decision somebody makes.
    expect(before.line).toBe("5 papers considered");
    expect(after.line).toBe(before.line);
    expect(after.judged).toBe(before.judged);
  });

  test("the paper the walk found keeps its verdict and both its baselines", () => {
    // The defect was specific: an uploaded paper, keyed by its document id.
    // A typed line is keyed by its own text and was never affected, so the
    // uploaded one is the case worth naming.
    expect(SOURCE.documents.some((d) => d.name === "bechky-2003.pdf")).toBe(true);
    expect(designPapersLine(SOURCE).baselinesOn("bechky-2003.pdf")).toBe(2);
    expect(designPapersLine(copy()).baselinesOn("bechky-2003.pdf")).toBe(2);
  });

  test("a paper's key follows its document, and its baselines follow their chunks", () => {
    const fresh = copy();
    const wasDocument = new Set(SOURCE.documents.map((d) => d.id));
    const isDocument = new Set(fresh.documents.map((d) => d.id));
    /* Paired by position, because the remap preserves order and a paper is
       identified here by the document it was uploaded as, which is the whole
       thing under test. */
    const uploaded = SOURCE.events
      .map((event, i) => [event, fresh.events[i]] as const)
      .filter(
        (pair): pair is readonly [Extract<LedgerEvent, { type: "paper-fit" }>, LedgerEvent] =>
          pair[0].type === "paper-fit" && wasDocument.has(pair[0].paperKey),
      );
    expect(uploaded.length).toBeGreaterThan(0);
    for (const [was, now] of uploaded) {
      const key = now.type === "paper-fit" ? now.paperKey : "";
      expect({ paper: was.paperName, keyed: isDocument.has(key) }).toEqual({
        paper: was.paperName,
        keyed: true,
      });
    }
    // And the passage a baseline came out of is one this copy carries.
    expect(baselineChunks(SOURCE).length).toBeGreaterThan(0);
    expect(resolved(fresh, baselineChunks(fresh))).toBe(
      resolved(SOURCE, baselineChunks(SOURCE)),
    );
  });

  test("a paper whose file was removed stays out of the count, as it was", () => {
    /* `cohen-hilligoss-2010.pdf` was uploaded, judged a misfit, and taken out
       of the study. Its verdict is keyed by a document that is no longer in the
       bundle, so it is not in the map and passes through untouched, and the
       band goes on not counting it. That is the "unknown references pass
       through" half of the remap, and it is the half a rewrite that tried to
       be helpful would get wrong. */
    const dangling = (b: ProjectBundle) => {
      const have = new Set(b.documents.map((d) => d.id));
      return b.events.filter(
        (e) => e.type === "paper-fit" && !have.has(e.paperKey) && e.paperName.endsWith(".pdf"),
      ).length;
    };
    expect(dangling(SOURCE)).toBe(1);
    expect(dangling(copy())).toBe(1);
  });
});

describe("D18: every other way a copy points at a passage", () => {
  const fresh = copy();

  test("the chunks a page was drafted from still resolve", () => {
    for (const field of ["sourceChunks", "supportingChunks"] as const) {
      const was = resolved(SOURCE, named(SOURCE, field));
      // Vacuity guard: the example has to name some, or parity is free.
      expect({ field, was: was > 0 }).toEqual({ field, was: true });
      expect({ field, now: resolved(fresh, named(fresh, field)) }).toEqual({ field, now: was });
    }
  });

  test("the passages cited inside a page body still resolve", () => {
    const was = resolved(SOURCE, citedInBodies(SOURCE));
    expect(was).toBeGreaterThan(0);
    expect(citedInBodies(fresh).length).toBe(citedInBodies(SOURCE).length);
    expect(resolved(fresh, citedInBodies(fresh))).toBe(was);
  });

  test("the passages attention was paid to still resolve", () => {
    const was = resolved(SOURCE, attentionChunks(SOURCE));
    expect(was).toBeGreaterThan(0);
    expect(resolved(fresh, attentionChunks(fresh))).toBe(was);
  });

  test("a finding the researcher had already dismissed stays dismissed", () => {
    /* A structural finding has no event of its own: it is recomputed on every
     * render and its id is `structural:<rule>:<targetId>`. So a dismissal of
     * one about a passage carries a chunk id in the middle of a string, and
     * before D18 that id was left behind. The dismissal then matched nothing,
     * the finding came back open, and the imported copy told the researcher to
     * look at something they had already dealt with: the Design line read "12
     * things to look at, 1 of them about passages nothing cites yet" where the
     * original reads 11 and says nothing about passages. */
    const dismissedChunks = (b: ProjectBundle) => {
      const have = new Set(b.chunks.map((c) => c.id));
      return b.events.filter((e) => {
        if (e.type !== "finding-disposition") return false;
        const target = /^structural:[^:]+:(.+)$/.exec(e.findingId)?.[1];
        return target !== undefined && have.has(target);
      }).length;
    };
    expect(dismissedChunks(SOURCE)).toBe(1);
    expect(dismissedChunks(fresh)).toBe(1);
  });

  test("a draft still points at the answer it came out of", () => {
    const events = new Set(fresh.events.map((e) => e.id));
    const turns = fresh.events.flatMap((e) => {
      const record = e as { sourceTurn?: unknown; supportingTurn?: unknown };
      return [record.sourceTurn, record.supportingTurn].filter(
        (v): v is string => typeof v === "string",
      );
    });
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.filter((id) => !events.has(id))).toEqual([]);
  });
});

describe("D18: what the rewrite must leave alone", () => {
  test("an export stamp is not an id and survives the copy unchanged", () => {
    /* The stamp records what the exporting researcher's ledger digested to.
     * Recomputing it over the new ids would replace a fact with a fresh and
     * useless one, so it travels verbatim. */
    const stamps = (b: ProjectBundle) =>
      b.events.filter((e) => e.type === "export").map((e) => e.stamp);
    expect(stamps(SOURCE).length).toBeGreaterThan(0);
    expect(stamps(copy())).toEqual(stamps(SOURCE));
  });

  test("page ids are internal to a study and are not regenerated", () => {
    /* They key nothing in storage and no projection reads across projects, so
     * two copies of one study holding the same page ids never meet. Rewriting
     * them would be work with no property behind it. */
    const pages = (b: ProjectBundle) =>
      b.events.filter((e) => e.type === "ontology-mutation").map((e) => e.targetId);
    expect(pages(SOURCE).length).toBeGreaterThan(0);
    expect(pages(copy())).toEqual(pages(SOURCE));
  });

  test("the researcher's own material comes through byte for byte", () => {
    const fresh = copy();
    expect(fresh.chunks.map((c) => c.text)).toEqual(SOURCE.chunks.map((c) => c.text));
    expect(fresh.documents.map((d) => d.name)).toEqual(SOURCE.documents.map((d) => d.name));
    expect(fresh.project.title).toBe(SOURCE.project.title);
  });
});
