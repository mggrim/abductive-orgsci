/**
 * The coverage grid and its glossary (ISC-111 … ISC-130).
 *
 * Content tests again, for the same reason the station prompts have them: the
 * words are the product. A grid axis labelled with nine slugs is unreadable no
 * matter how well the grid is drawn, so "every bias has a definition" and
 * "no definition is a restatement of its own slug" are assertions worth having
 * a machine make. Prose drifts under editing; a test does not.
 */

import { describe, expect, test } from "bun:test";
import { MATRIX } from "../src/matrix/matrix.ts";
import {
  AI_BIASES,
  BIAS_IDS,
  HUMAN_BIASES,
  STAGE_IDS,
  type MatrixCell,
} from "../src/matrix/schema.ts";
import {
  BIAS_GLOSSARY,
  CONTEXT_GLOSSARY,
  TRIGGER_GLOSSARY,
  triggerEntry,
} from "../src/matrix/glossary.ts";
import { adjudicatedCount } from "../src/matrix/coverageNotes.ts";
import {
  buildCoverageGrid,
  thinnestColumns,
  thinnestRows,
} from "../src/views/coverageGrid.ts";

const GRID = buildCoverageGrid(MATRIX);

describe("coverage grid model", () => {
  test("the registry projects into a grid of every bias against every used context (ISC-111)", () => {
    expect(GRID.rows).toHaveLength(BIAS_IDS.length);
    for (const row of GRID.rows) expect(row.cells).toHaveLength(GRID.columns.length);
    expect(GRID.possible).toBe(BIAS_IDS.length * GRID.columns.length);
  });

  test("every declared cell lands in exactly one square (ISC-112)", () => {
    const placed = GRID.rows.flatMap((r) => r.cells).filter((c) => c.cell !== undefined);
    expect(placed).toHaveLength(MATRIX.length);
    expect(new Set(placed.map((c) => c.cell?.id)).size).toBe(MATRIX.length);
  });

  test("the watched count and the row totals agree (ISC-113)", () => {
    expect(GRID.rows.reduce((n, r) => n + r.watched, 0)).toBe(GRID.watched);
    expect(GRID.columns.reduce((n, c) => n + c.watched, 0)).toBe(GRID.watched);
    expect(GRID.watched).toBe(MATRIX.length);
  });

  test("the gaps are the point: watched is a minority of possible (ISC-114)", () => {
    // Not an aesthetic claim. If this ever inverts, the grid stops being a
    // coverage diagnostic and becomes decoration, and the page needs rethinking
    // rather than the assertion loosening.
    expect(GRID.possible - GRID.watched).toBeGreaterThan(0);
    expect(GRID.density).toBeLessThan(1);
  });

  test("rows run human biases first, then the model's (ISC-115)", () => {
    const sides = GRID.rows.map((r) => r.side);
    expect(sides.slice(0, HUMAN_BIASES.length).every((s) => s === "human")).toBe(true);
    expect(sides.slice(HUMAN_BIASES.length).every((s) => s === "ai")).toBe(true);
    expect(sides.filter((s) => s === "ai")).toHaveLength(AI_BIASES.length);
  });

  test("columns run the five stages in the order the work happens, then the rest (ISC-116)", () => {
    const contexts = GRID.columns.map((c) => c.context);
    const stagePart = contexts.filter((c) => (STAGE_IDS as readonly string[]).includes(c));
    expect(stagePart).toEqual(STAGE_IDS.filter((s) => contexts.includes(s)));
    const firstNonStage = contexts.findIndex((c) => !(STAGE_IDS as readonly string[]).includes(c));
    expect(contexts.slice(firstNonStage).every((c) => !(STAGE_IDS as readonly string[]).includes(c))).toBe(
      true,
    );
  });

  test("Anti: a context no cell files under gets no column (ISC-125)", () => {
    // Inventing a `rival-deleted` column with nine blanks would manufacture
    // nine absences that were never declared. The empty squares are only
    // meaningful inside a space the registry actually spans.
    const used = new Set(MATRIX.map((c) => c.stage));
    for (const col of GRID.columns) expect(used.has(col.context)).toBe(true);
    expect(GRID.columns).toHaveLength(used.size);
  });

  test("Anti: the projection invents no cell that is not in the registry (ISC-126)", () => {
    const ids = new Set(MATRIX.map((c) => c.id));
    for (const gc of GRID.rows.flatMap((r) => r.cells)) {
      if (gc.cell !== undefined) expect(ids.has(gc.cell.id)).toBe(true);
    }
  });

  test("it is a pure projection — same input, deep-equal output", () => {
    expect(buildCoverageGrid(MATRIX)).toEqual(buildCoverageGrid(MATRIX));
  });

  test("an empty registry yields an empty grid rather than throwing", () => {
    const empty = buildCoverageGrid([] as readonly MatrixCell[]);
    expect(empty.columns).toHaveLength(0);
    expect(empty.watched).toBe(0);
    expect(empty.density).toBe(0);
  });

  test("the thinnest column is the one the page names (ISC-127)", () => {
    const thin = thinnestColumns(GRID, 2);
    expect(thin).toHaveLength(2);
    expect(thin[0]!.watched).toBeLessThanOrEqual(thin[1]!.watched);
    for (const col of GRID.columns) expect(col.watched).toBeGreaterThanOrEqual(thin[0]!.watched);
  });

  test("the thinnest row is the bias reaching fewest points in the work", () => {
    const thin = thinnestRows(GRID, 1);
    for (const row of GRID.rows) expect(row.watched).toBeGreaterThanOrEqual(thin[0]!.watched);
  });
});

describe("the glossary is the axis", () => {
  test("every bias has a plain-English definition (ISC-117)", () => {
    for (const id of BIAS_IDS) {
      const entry = BIAS_GLOSSARY[id];
      expect(entry).toBeDefined();
      expect(entry.definition.trim().length).toBeGreaterThan(80);
      expect(entry.name.trim().length).toBeGreaterThan(3);
    }
  });

  test("no definition is a restatement of its own slug (ISC-118)", () => {
    // The failure mode this guards is "force-fitting is when things get
    // force-fit" — a definition that names the term back at the reader and
    // teaches nothing. The slug itself must not appear in the prose.
    for (const id of BIAS_IDS) {
      expect(BIAS_GLOSSARY[id].definition.toLowerCase()).not.toContain(id);
    }
  });

  test("every bias names the tell — what it looks like from inside (ISC-119)", () => {
    for (const id of BIAS_IDS) {
      expect(BIAS_GLOSSARY[id].tell.trim().length).toBeGreaterThan(30);
    }
  });

  test("every context the registry uses is explained", () => {
    for (const context of new Set(MATRIX.map((c) => c.stage))) {
      const entry = CONTEXT_GLOSSARY[context];
      expect(entry).toBeDefined();
      expect(entry.definition.trim().length).toBeGreaterThan(40);
      expect(entry.short.trim().length).toBeGreaterThan(2);
    }
  });

  test("the intuition-as-theory entry keeps Zuckerman's probe, not an example (ISC-128)", () => {
    const prose = `${BIAS_GLOSSARY["intuition-as-theory"].definition} ${BIAS_GLOSSARY["intuition-as-theory"].tell}`.toLowerCase();
    expect(prose).toContain("mechanism");
  });

  test("Anti: the glossary imports no tension literature (ISC-129)", () => {
    // Same standing commitment as the tension station. A tension enters this
    // tool as a puzzle root on the researcher's own evidence.
    const all = Object.values(BIAS_GLOSSARY)
      .map((e) => `${e.definition} ${e.tell}`)
      .join(" ")
      .toLowerCase();
    expect(all).not.toContain("paradox");
  });
});

describe("trigger marks", () => {
  test("all three trigger kinds have a mark and a definition (ISC-120)", () => {
    expect(TRIGGER_GLOSSARY).toHaveLength(3);
    for (const t of TRIGGER_GLOSSARY) {
      expect(t.mark.trim().length).toBeGreaterThan(0);
      expect(t.definition.trim().length).toBeGreaterThan(30);
    }
  });

  test("the marks are distinct shapes, so the encoding survives greyscale (ISC-121)", () => {
    const marks = TRIGGER_GLOSSARY.map((t) => t.mark);
    expect(new Set(marks).size).toBe(marks.length);
    // The empty-cell mark must not collide with any filled one.
    expect(marks).not.toContain("·");
  });

  test("every cell in the registry resolves to a mark", () => {
    for (const cell of MATRIX) {
      expect(() => triggerEntry(cell.trigger.kind)).not.toThrow();
    }
  });

  test("an unknown trigger kind throws rather than rendering blank", () => {
    expect(() => triggerEntry("nonsense" as never)).toThrow();
  });
});

describe("a blank is not one thing (advisor finding)", () => {
  test("every square carries a status, and watched squares say so (ISC-131)", () => {
    for (const gc of GRID.rows.flatMap((r) => r.cells)) {
      expect(["watched", "not-applicable", "unadjudicated"]).toContain(gc.status);
      expect(gc.status === "watched").toBe(gc.cell !== undefined);
    }
  });

  test("with nothing adjudicated, every blank is unadjudicated rather than a claimed gap (ISC-132)", () => {
    // The page must not assert a coverage ratio off a denominator nobody has
    // earned. Zero adjudications is the honest state and it is stated as such.
    expect(adjudicatedCount()).toBe(0);
    expect(GRID.notApplicable).toBe(0);
    expect(GRID.unadjudicated).toBe(GRID.possible - GRID.watched);
  });

  test("adjudicating a blank removes it from the applicable denominator (ISC-133)", () => {
    const na = (b: string, c: string) =>
      b === "confirmation" && c === "instrument" ? "no instrument exists yet at this point" : undefined;
    const g = buildCoverageGrid(MATRIX, na as never);
    expect(g.notApplicable).toBe(1);
    expect(g.unadjudicated).toBe(GRID.unadjudicated - 1);

    const row = g.rows.find((r) => r.bias === "confirmation")!;
    expect(row.applicable).toBe(GRID.columns.length - 1);
    expect(row.watched).toBe(GRID.rows.find((r) => r.bias === "confirmation")!.watched);

    const col = g.columns.find((c) => c.context === "instrument")!;
    expect(col.applicable).toBe(BIAS_IDS.length - 1);
  });

  test("Anti: adjudicating a blank never inflates the watched count (ISC-134)", () => {
    const g = buildCoverageGrid(MATRIX, (() => "any reason") as never);
    expect(g.watched).toBe(GRID.watched);
    expect(g.unadjudicated).toBe(0);
    expect(g.notApplicable).toBe(GRID.possible - GRID.watched);
  });

  test("Anti: an adjudication cannot overwrite a declared cell (ISC-135)", () => {
    const g = buildCoverageGrid(MATRIX, (() => "reason") as never);
    for (const gc of g.rows.flatMap((r) => r.cells)) {
      if (gc.cell !== undefined) {
        expect(gc.status).toBe("watched");
        expect(gc.notApplicableReason).toBeUndefined();
      }
    }
  });

  test("the margin totals are additive because no prompt is reused (ISC-136)", () => {
    // If two marks shared a prompt, the count (39 since M75) would overstate distinct coverage and
    // the row and column sums would stop meaning what the page says they mean.
    expect(GRID.distinctPrompts).toBe(GRID.watched);
  });
});
