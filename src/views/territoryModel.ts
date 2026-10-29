/**
 * Guide-as-territory projection (ISC-63).
 *
 * The matrix is an interview guide: a prior claim about where bias enters a
 * qualitative design. The session spine is the territory: where the
 * conversation actually went. The interesting object is neither one on its
 * own — it is the gap, and it runs in both directions.
 *
 * Cells the guide names but the session never reached are the obvious half.
 * The other half matters more and is easier to lose: topics the researcher
 * and the tool spent real time on that no cell anticipated. Those are
 * candidates for cells the matrix is missing, which is the paper's own
 * revision mechanism rather than a UI nicety.
 *
 * Pure function over the ledger plus the matrix. No state, no DOM.
 */

import type { LedgerEvent } from "../ledger/events.ts";
import type { MatrixCell } from "../matrix/schema.ts";

/**
 * Three states, and the middle one is the point. A cell that fired and was
 * then ignored has not been covered — it has been raised and waved past, which
 * looks identical to coverage in any count of flags.
 */
export type CellCoverage = "untouched" | "raised" | "engaged";

export interface CellTerritory {
  readonly cellId: string;
  readonly bias: string;
  readonly context: string;
  readonly flag: string;
  readonly coverage: CellCoverage;
  readonly flagCount: number;
  /** Challenges produced by this cell that a human disposed of. */
  readonly adjudicatedCount: number;
  /** Interview turns explicitly attributed to this cell. */
  readonly turnCount: number;
}

/** A topic the session spent turns on that no matrix cell anticipated. */
export interface UnmappedTopic {
  readonly topic: string;
  readonly turns: number;
  /** True once the researcher steered here themselves. */
  readonly researcherInitiated: boolean;
}

export interface TerritorySummary {
  readonly cells: readonly CellTerritory[];
  readonly untouched: number;
  readonly raised: number;
  readonly engaged: number;
  /** Where the territory exceeded the guide. */
  readonly unmappedTopics: readonly UnmappedTopic[];
  /** Engaged cells as a share of all cells, 0–1. */
  readonly engagedShare: number;
}

export function projectTerritory(
  events: readonly LedgerEvent[],
  matrix: readonly MatrixCell[],
  projectId?: string,
): TerritorySummary {
  const scoped = projectId === undefined ? events : events.filter((e) => e.projectId === projectId);

  const flagCounts = new Map<string, number>();
  const turnCounts = new Map<string, number>();
  // challenge id → the cell that produced it, so adjudications can be attributed.
  const challengeCell = new Map<string, string>();
  const adjudicated = new Map<string, number>();
  const topicTurns = new Map<string, number>();
  const topicMapped = new Map<string, boolean>();
  const redirectedTo = new Set<string>();

  for (const event of scoped) {
    switch (event.type) {
      case "flag":
        flagCounts.set(event.matrixCell, (flagCounts.get(event.matrixCell) ?? 0) + 1);
        break;
      case "challenge":
        if (event.matrixCell !== undefined) challengeCell.set(event.id, event.matrixCell);
        break;
      case "adjudication": {
        const cell = challengeCell.get(event.challengeId);
        if (cell !== undefined) adjudicated.set(cell, (adjudicated.get(cell) ?? 0) + 1);
        break;
      }
      case "question-selection": {
        topicTurns.set(event.topic, (topicTurns.get(event.topic) ?? 0) + 1);
        if (event.matrixCell === undefined) {
          topicMapped.set(event.topic, topicMapped.get(event.topic) ?? false);
        } else {
          topicMapped.set(event.topic, true);
          turnCounts.set(event.matrixCell, (turnCounts.get(event.matrixCell) ?? 0) + 1);
        }
        break;
      }
      case "redirection":
        redirectedTo.add(event.toTopic);
        // A redirection is a turn's worth of territory even before it is asked
        // about, because the researcher has already spent attention getting
        // there. Counting it from zero would hide the steer entirely.
        topicTurns.set(event.toTopic, topicTurns.get(event.toTopic) ?? 0);
        topicMapped.set(event.toTopic, topicMapped.get(event.toTopic) ?? false);
        break;
      default:
        break;
    }
  }

  const cells: CellTerritory[] = matrix.map((cell) => {
    const flags = flagCounts.get(cell.id) ?? 0;
    const disposed = adjudicated.get(cell.id) ?? 0;
    const turns = turnCounts.get(cell.id) ?? 0;
    const coverage: CellCoverage =
      flags === 0 && turns === 0 ? "untouched" : disposed > 0 || turns > 0 ? "engaged" : "raised";
    return {
      cellId: cell.id,
      bias: cell.bias,
      context: cell.stage,
      flag: cell.flag,
      coverage,
      flagCount: flags,
      adjudicatedCount: disposed,
      turnCount: turns,
    };
  });

  const unmappedTopics: UnmappedTopic[] = [...topicTurns.entries()]
    .filter(([topic]) => topicMapped.get(topic) !== true)
    .map(([topic, turns]) => ({
      topic,
      turns,
      researcherInitiated: redirectedTo.has(topic),
    }))
    .sort((a, b) => b.turns - a.turns);

  const count = (c: CellCoverage) => cells.filter((x) => x.coverage === c).length;
  const engaged = count("engaged");
  return {
    cells,
    untouched: count("untouched"),
    raised: count("raised"),
    engaged,
    unmappedTopics,
    engagedShare: cells.length === 0 ? 0 : engaged / cells.length,
  };
}
