/**
 * The coverage grid: the matrix registry projected back into two dimensions
 * (ISC-111 … ISC-116).
 *
 * The registry is a list of 29 cells and the review page rendered it as a list
 * of 29 rows. Same data, wrong question. A list answers "what does this cell
 * say"; a grid answers "where is the instrument watching, and where is it
 * not". The second question is the reason the object is two-dimensional in the
 * first place, and it is the question a co-author auditing the design actually
 * has.
 *
 * So the mark on screen is not the cell. It is the *presence or absence* of a
 * cell, and the margin totals are what make an absence legible — without them
 * the empty squares read as visual noise rather than as a finding.
 *
 * Pure projection over `MATRIX`, like every other view in this tool: no
 * component holds this state privately, and the same function backs the page
 * and the tests.
 */

import { MATRIX } from "../matrix/matrix.ts";
import { BIAS_IDS, HUMAN_BIASES, STAGE_IDS, type BiasId, type ContextId, type MatrixCell } from "../matrix/schema.ts";
import { CONTEXT_GLOSSARY } from "../matrix/glossary.ts";
import { notApplicableReason } from "../matrix/coverageNotes.ts";

/**
 * A blank is not one thing. `not-applicable` is an adjudicated structural
 * zero and is excluded from the applicable denominator; `unadjudicated` means
 * nobody has yet decided whether it is a real gap. Reporting a coverage ratio
 * without this distinction is what the advisor pass caught — the number would
 * rest on a denominator the page has not earned.
 */
export type CellStatus = "watched" | "not-applicable" | "unadjudicated";

export interface GridCell {
  readonly bias: BiasId;
  readonly context: ContextId;
  /** The registry cell, when one exists. `undefined` is the interesting case. */
  readonly cell: MatrixCell | undefined;
  readonly status: CellStatus;
  /** Why this blank is not a gap, when it has been adjudicated as one. */
  readonly notApplicableReason: string | undefined;
}

export interface GridRow {
  readonly bias: BiasId;
  /** `human` biases are the researcher's; `ai` are the assistant's. */
  readonly side: "human" | "ai";
  readonly cells: readonly GridCell[];
  /** How many contexts watch this bias. */
  readonly watched: number;
  /** Contexts where this bias could apply — total minus adjudicated zeros. */
  readonly applicable: number;
}

export interface GridColumn {
  readonly context: ContextId;
  readonly family: "stage" | "graph" | "conduct";
  /** How many biases are watched at this point in the work. */
  readonly watched: number;
  readonly applicable: number;
}

export interface CoverageGrid {
  readonly rows: readonly GridRow[];
  readonly columns: readonly GridColumn[];
  readonly watched: number;
  readonly possible: number;
  /** Blanks adjudicated as structurally inapplicable. */
  readonly notApplicable: number;
  /** Blanks nobody has judged yet — the honest work queue. */
  readonly unadjudicated: number;
  /** Watched as a share of possible, 0–1. */
  readonly density: number;
  /** Distinct intervention prompts behind the marks. Equal to `watched` when
   *  no prompt is reused, which is what makes the margin totals additive. */
  readonly distinctPrompts: number;
}

/**
 * Column order: the five stages in the order the work happens, then the graph
 * columns, then conduct. Only contexts the registry actually uses appear — a
 * column for `rival-deleted` when no cell files there would invent 9 absences
 * that were never declared, and the whole point of the empty squares is that
 * they are real gaps in a declared space.
 */
function usedContexts(cells: readonly MatrixCell[]): readonly ContextId[] {
  const used = new Set<ContextId>(cells.map((c) => c.stage));
  const stages = STAGE_IDS.filter((s) => used.has(s));
  const rest = [...used]
    .filter((c) => !(STAGE_IDS as readonly string[]).includes(c))
    .sort((a, b) => {
      const fa = CONTEXT_GLOSSARY[a].family;
      const fb = CONTEXT_GLOSSARY[b].family;
      if (fa !== fb) return fa === "graph" ? -1 : 1;
      return a.localeCompare(b);
    });
  return [...stages, ...rest];
}

/**
 * `naLookup` is injectable purely so the adjudicated-blank path can be tested
 * without adjudicating anything for real. Production always passes the real
 * map, which is empty by design — see `coverageNotes.ts`.
 */
export function buildCoverageGrid(
  cells: readonly MatrixCell[] = MATRIX,
  naLookup: (bias: BiasId, context: ContextId) => string | undefined = notApplicableReason,
): CoverageGrid {
  const contexts = usedContexts(cells);
  const byKey = new Map<string, MatrixCell>();
  for (const cell of cells) byKey.set(`${cell.bias}:${cell.stage}`, cell);

  const rows: GridRow[] = BIAS_IDS.map((bias) => {
    const rowCells: GridCell[] = contexts.map((context) => {
      const cell = byKey.get(`${bias}:${context}`);
      const reason = cell === undefined ? naLookup(bias, context) : undefined;
      const status: CellStatus =
        cell !== undefined ? "watched" : reason !== undefined ? "not-applicable" : "unadjudicated";
      return { bias, context, cell, status, notApplicableReason: reason };
    });
    return {
      bias,
      side: (HUMAN_BIASES as readonly string[]).includes(bias) ? "human" : "ai",
      cells: rowCells,
      watched: rowCells.filter((c) => c.status === "watched").length,
      applicable: rowCells.filter((c) => c.status !== "not-applicable").length,
    };
  });

  const columns: GridColumn[] = contexts.map((context, i) => ({
    context,
    family: CONTEXT_GLOSSARY[context].family,
    watched: rows.filter((r) => r.cells[i]?.status === "watched").length,
    applicable: rows.filter((r) => r.cells[i]?.status !== "not-applicable").length,
  }));

  const all = rows.flatMap((r) => r.cells);
  const possible = rows.length * contexts.length;
  const watched = rows.reduce((n, r) => n + r.watched, 0);
  return {
    rows,
    columns,
    watched,
    possible,
    notApplicable: all.filter((c) => c.status === "not-applicable").length,
    unadjudicated: all.filter((c) => c.status === "unadjudicated").length,
    density: possible === 0 ? 0 : watched / possible,
    distinctPrompts: new Set(cells.map((c) => c.prompt.trim())).size,
  };
}

/**
 * The thinnest columns — where the fewest biases are watched. Surfaced on the
 * page because it is the finding the grid exists to produce, and leaving the
 * reader to count squares would be making them do the arithmetic the view was
 * built to do for them.
 */
export function thinnestColumns(grid: CoverageGrid, limit = 2): readonly GridColumn[] {
  return [...grid.columns].sort((a, b) => a.watched - b.watched).slice(0, limit);
}

/** The biases reaching the fewest points in the work. */
export function thinnestRows(grid: CoverageGrid, limit = 2): readonly GridRow[] {
  return [...grid.rows].sort((a, b) => a.watched - b.watched).slice(0, limit);
}
