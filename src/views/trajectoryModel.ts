/**
 * Ontology trajectory projection (ISC-65).
 *
 * Every revision, in order, coloured by who originated it, with the live
 * residue count carried alongside. This is the colonization-vs-discovery
 * measurement rendered directly: a study whose revisions are overwhelmingly
 * `model-proposed` and whose residue only falls has been digesting the field
 * rather than being changed by it.
 *
 * Residue is plotted on the same axis deliberately. Attribution alone can
 * look healthy while the account quietly absorbs everything, and the two series
 * only mean something together.
 *
 * What this file counts, and what it does not. Every point is one
 * ontology-mutation event, `relate` included, because the plot is of the work
 * and a relation is work. That makes this population strictly larger than the
 * ontology: 98 events behind 44 live pages on the density probe. For four
 * rounds the summary handed out a bare `byOrigin` and a bare `modelShare` over
 * that population, three surfaces printed them under the words and the marks
 * that mean pages, and the tool's central claim carried two different numbers
 * depending on which tab you read it from. The counts leave here as an
 * `OriginCensus` now, which cannot be quoted without the unit it counted. The
 * claim about the ontology itself is a census over `livePages`, taken where the
 * graph is. See `src/ontology/attribution.ts`.
 *
 * Pure function over the ledger.
 */

import type { LedgerEvent, Origin, OntologyOp, PageType } from "../ledger/events.ts";
import { originCensus, RECORDED_MUTATIONS, type OriginCensus } from "../ontology/attribution.ts";

export interface TrajectoryPoint {
  readonly index: number;
  readonly ts: number;
  readonly eventId: string;
  readonly targetId: string;
  readonly op: OntologyOp;
  readonly pageType?: PageType;
  readonly title?: string;
  readonly origin: Origin;
  /** Version number of the target after this mutation, for page ops. */
  readonly version: number;
  /** Live analytic-residue pages immediately after this mutation. */
  readonly residue: number;
  /** Live pages of all types immediately after this mutation. */
  readonly livePages: number;
}

export interface TrajectorySummary {
  readonly points: readonly TrajectoryPoint[];
  /**
   * Who originated each recorded mutation, with its own denominator attached.
   *
   * This was a bare `byOrigin` and a bare `modelShare`, and the two names are
   * the defect. Every mutation counts here, `relate` included, which is right
   * for a plot of the work and wrong for a claim about the ontology: on the
   * 44-page probe this population is 98 and the ontology is 44. Both numbers
   * were printed under the same three marks, one on the Design tab and one on
   * /ontology, and neither said what it was over. A census cannot be quoted
   * without its unit now, because there is no way to get one out of it.
   *
   * The claim about the ontology is `originCensus(livePages(graph),
   * LIVE_PAGES)`, computed where the graph is, and it is not this.
   */
  readonly mutations: OriginCensus;
  /**
   * And what those mutations were.
   *
   * The summary called all of them "revisions". Zero of the probe's 98 were:
   * 44 created a page and 54 drew a relation. A reader cannot check the
   * attribution against anything unless the population is broken down into the
   * things it is actually made of.
   */
  readonly byOp: Readonly<Record<OntologyOp, number>>;
  /**
   * True when residue never rose across the whole trajectory. The
   * force-fitting lint reads a window; this reads the whole study, and a
   * study-length monotonic decline is a stronger statement than a local one.
   */
  readonly residueMonotonicallyShrinking: boolean;
  readonly finalResidue: number;
}

export function projectTrajectory(
  events: readonly LedgerEvent[],
  projectId?: string,
): TrajectorySummary {
  const scoped = projectId === undefined ? events : events.filter((e) => e.projectId === projectId);

  const points: TrajectoryPoint[] = [];
  const versions = new Map<string, number>();
  const pageTypes = new Map<string, PageType>();
  const live = new Set<string>();
  const byOp: Record<OntologyOp, number> = {
    create: 0,
    revise: 0,
    relate: 0,
    unrelate: 0,
    retire: 0,
    reinstate: 0,
    // M44. Counted like every other op; it touches no page version, so the
    // switch below leaves it to the default beside relate and unrelate.
    mark: 0,
  };

  for (const event of scoped) {
    if (event.type !== "ontology-mutation") continue;

    switch (event.op) {
      case "create":
        live.add(event.targetId);
        versions.set(event.targetId, 1);
        if (event.pageType !== undefined) pageTypes.set(event.targetId, event.pageType);
        break;
      case "revise":
        versions.set(event.targetId, (versions.get(event.targetId) ?? 0) + 1);
        break;
      case "retire":
        live.delete(event.targetId);
        break;
      case "reinstate":
        live.add(event.targetId);
        break;
      default:
        // relate / unrelate touch edges, not page versions.
        break;
    }

    let residue = 0;
    for (const id of live) if (pageTypes.get(id) === "analytic-residue") residue += 1;

    byOp[event.op] += 1;
    points.push({
      index: points.length,
      ts: event.ts,
      eventId: event.id,
      targetId: event.targetId,
      op: event.op,
      ...(pageTypes.get(event.targetId) === undefined
        ? {}
        : { pageType: pageTypes.get(event.targetId) as PageType }),
      ...(event.title === undefined ? {} : { title: event.title }),
      origin: event.origin,
      version: versions.get(event.targetId) ?? 0,
      residue,
      livePages: live.size,
    });
  }

  const finalResidue = points[points.length - 1]?.residue ?? 0;
  return {
    points,
    mutations: originCensus(points, RECORDED_MUTATIONS),
    byOp,
    residueMonotonicallyShrinking: isMonotonicallyShrinking(points),
    finalResidue,
  };
}

/**
 * Residue shrank monotonically when it reached a peak above zero and never
 * rose again after it. A single later rise means the corpus was still able to
 * resist the account — which is the thing being looked for, so it disqualifies.
 *
 * A study whose residue never rose at all, or that ended at its peak, reports
 * false rather than "shrinking": nothing has actually been absorbed.
 */
function isMonotonicallyShrinking(points: readonly TrajectoryPoint[]): boolean {
  if (points.length === 0) return false;
  let peak = 0;
  let peakAt = -1;
  points.forEach((p, i) => {
    if (p.residue > peak) {
      peak = p.residue;
      peakAt = i;
    }
  });
  if (peak === 0 || peakAt < 0) return false;

  let previous = peak;
  let declined = false;
  for (let i = peakAt + 1; i < points.length; i++) {
    const residue = points[i]?.residue ?? 0;
    if (residue > previous) return false;
    if (residue < previous) declined = true;
    previous = residue;
  }
  return declined;
}
