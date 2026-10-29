/**
 * Ontology projection (ISC-14 … ISC-19, ISC-24).
 *
 * The proto-ontology has no storage of its own. It is computed here, from the
 * event array, every time it is needed. That is not an efficiency choice —
 * it is what makes the tool auditable: there is exactly one record, the
 * ledger, and everything the researcher sees is a function of it. A cache or
 * a mutable module-level graph would reintroduce a second source of truth and
 * quietly break the claim the whole instrument rests on.
 *
 * Consequences worth stating, because they constrain every edit to this file:
 *   - no module-level mutable state (ISC-24)
 *   - no Date.now(), no crypto.randomUUID(), no ordering by anything but the
 *     event array itself — replaying twice must be deep-equal (ISC-14)
 *   - retire and supersede mark; they never remove (ISC-16, ISC-17)
 */

import type { LedgerEvent, OntologyMutationEvent } from "../ledger/events.ts";
import type {
  CollapseRecord,
  OntologyEdge,
  OntologyGraph,
  OntologyPage,
  PageVersion,
  PuzzleRelationClaim,
} from "./schema.ts";

/** Deterministic edge identity: an edge is its endpoints plus its role. */
export function edgeKey(from: string, to: string, role: string): string {
  return `${from}|${role}|${to}`;
}

interface MutablePage {
  page: OntologyPage;
}

/**
 * Replay events into the ontology graph. Pure: same events in, deep-equal
 * graph out, every time.
 *
 * `projectId` filters when supplied; the ledger may hold several projects.
 */
export function projectOntology(
  events: readonly LedgerEvent[],
  projectId?: string,
): OntologyGraph {
  const scoped = projectId === undefined ? events : events.filter((e) => e.projectId === projectId);

  const pages = new Map<string, MutablePage>();
  const edges = new Map<string, OntologyEdge>();
  const relations: PuzzleRelationClaim[] = [];
  const collapses: CollapseRecord[] = [];

  for (const event of scoped) {
    if (event.type === "puzzle-collapse") {
      collapses.push({
        eventId: event.id,
        keptPuzzleIds: [...event.keptPuzzleIds],
        supersededPuzzleIds: [...event.supersededPuzzleIds],
        reason: event.reason,
        ts: event.ts,
      });
      // Supersede, never delete: the abandoned puzzle stays in the graph so
      // the collapse can be reviewed and, if premature, reversed (ISC-16).
      for (const id of event.supersededPuzzleIds) {
        const entry = pages.get(id);
        if (entry !== undefined) {
          entry.page = { ...entry.page, supersededBy: event.id, updatedAt: event.ts };
        }
      }
      continue;
    }

    if (event.type !== "ontology-mutation") continue;
    applyMutation(event, pages, edges, relations);
  }

  const finalPages = new Map<string, OntologyPage>();
  for (const [id, entry] of pages) finalPages.set(id, entry.page);

  const puzzleRoots: string[] = [];
  const supersededPuzzles: string[] = [];
  for (const page of finalPages.values()) {
    if (page.type !== "puzzle") continue;
    if (page.supersededBy !== null) supersededPuzzles.push(page.id);
    else if (!page.retired) puzzleRoots.push(page.id);
  }

  return {
    projectId: projectId ?? (scoped[0]?.projectId ?? ""),
    pages: finalPages,
    edges,
    relations,
    collapses,
    puzzleRoots,
    supersededPuzzles,
  };
}

function applyMutation(
  event: OntologyMutationEvent,
  pages: Map<string, MutablePage>,
  edges: Map<string, OntologyEdge>,
  relations: PuzzleRelationClaim[],
): void {
  const chunks = [...(event.supportingChunks ?? [])];
  const turn = event.supportingTurn === undefined ? {} : { supportingTurn: event.supportingTurn };
  const paper = event.paperKey === undefined ? {} : { paperKey: event.paperKey };

  switch (event.op) {
    case "create": {
      if (event.pageType === undefined) return;
      if (pages.has(event.targetId)) return; // create is idempotent by id
      const version: PageVersion = {
        version: 1,
        title: event.title ?? "",
        body: event.body ?? "",
        origin: event.origin,
        supportingChunks: chunks,
        ...turn,
        eventId: event.id,
        ts: event.ts,
      };
      pages.set(event.targetId, {
        page: {
          id: event.targetId,
          projectId: event.projectId,
          type: event.pageType,
          title: version.title,
          body: version.body,
          origin: event.origin,
          status: "conjecture",
          supportingChunks: chunks,
          ...turn,
          ...paper,
          version: 1,
          history: [version],
          supersededBy: null,
          retired: false,
          createdAt: event.ts,
          updatedAt: event.ts,
        },
      });
      return;
    }

    case "revise": {
      const entry = pages.get(event.targetId);
      if (entry === undefined) return;
      const prev = entry.page;
      // Revisions accumulate. The prior version stays readable, which is what
      // makes the trajectory — and its attribution — recoverable (ISC-19).
      const version: PageVersion = {
        version: prev.version + 1,
        title: event.title ?? prev.title,
        body: event.body ?? prev.body,
        origin: event.origin,
        supportingChunks: event.supportingChunks === undefined ? prev.supportingChunks : chunks,
        eventId: event.id,
        ts: event.ts,
      };
      entry.page = {
        ...prev,
        title: version.title,
        body: version.body,
        origin: event.origin,
        supportingChunks: version.supportingChunks,
        version: version.version,
        history: [...prev.history, version],
        updatedAt: event.ts,
      };
      return;
    }

    case "relate": {
      if (event.edge === undefined) return;
      const key = edgeKey(event.edge.from, event.edge.to, event.edge.role);
      edges.set(key, {
        id: key,
        projectId: event.projectId,
        from: event.edge.from,
        to: event.edge.to,
        role: event.edge.role,
        origin: event.origin,
        supportingChunks: chunks,
        retired: false,
        createdAt: event.ts,
      });
      if (event.puzzleRelation !== undefined) {
        relations.push({
          edgeId: key,
          puzzleId: event.edge.from,
          theoryId: event.edge.to,
          relation: event.puzzleRelation,
          ts: event.ts,
        });
      }
      return;
    }

    case "unrelate": {
      if (event.edge === undefined) return;
      const key = edgeKey(event.edge.from, event.edge.to, event.edge.role);
      const existing = edges.get(key);
      if (existing !== undefined) edges.set(key, { ...existing, retired: true });
      /*
       * The framing claim goes with the edge that carried it (walk item 1).
       *
       * `relations` was append-only, so withdrawing a stands-to edge retired the
       * edge and left the claim standing: the drawing lost the line, the
       * obligation carried on being owed, and the chooser went on believing the
       * puzzle was already claimed, so there was no way back in. That made the
       * withdrawal cosmetic.
       *
       * This is not the ledger forgetting. The events are untouched and the
       * trajectory still walks every one of them; what this array holds is the
       * framing claims a study is currently making, and a withdrawn one is not
       * one of those.
       */
      for (let i = relations.length - 1; i >= 0; i -= 1) {
        if (relations[i]?.edgeId === key) relations.splice(i, 1);
      }
      return;
    }

    case "retire": {
      const entry = pages.get(event.targetId);
      if (entry === undefined) return;
      entry.page = { ...entry.page, retired: true, status: "retired", updatedAt: event.ts };
      return;
    }

    case "reinstate": {
      const entry = pages.get(event.targetId);
      if (entry === undefined) return;
      // Reinstatement clears both retirement and supersession — a collapse
      // the researcher regrets is recoverable (ISC-17).
      entry.page = {
        ...entry.page,
        retired: false,
        supersededBy: null,
        status: entry.page.status === "retired" ? "conjecture" : entry.page.status,
        updatedAt: event.ts,
      };
      return;
    }

    /*
     * Who holds this expectation in the setting (M44).
     *
     * The holder lands and nothing else moves: not the title, not the body, not
     * the version, not the history, and above all not the origin. A board paper's
     * aim that the model transcribed is still the model's page, and the mark says
     * who held the expectation rather than who wrote the claim. That is why this
     * is its own op and not a revise, which takes `origin` off the event it reads
     * and would have turned "the board said this in January" into "the researcher
     * wrote this claim".
     *
     * Last mark wins, because a researcher correcting the holder is correcting a
     * sentence they typed, and the earlier marks stay in the record where every
     * superseded fact in this tool stays.
     */
    case "mark": {
      const entry = pages.get(event.targetId);
      if (entry === undefined || event.heldBy === undefined) return;
      entry.page = { ...entry.page, heldBy: event.heldBy, updatedAt: event.ts };
      return;
    }
  }
}

/**
 * Ontology mutations in the trailing `windowTurns` events. The saturation
 * signal reads this: when new questions stop changing the ontology, the
 * interview has stopped earning its keep.
 */
export function mutationsInWindow(
  events: readonly LedgerEvent[],
  windowTurns: number,
): number {
  return events
    .slice(-windowTurns)
    .filter((e) => e.type === "ontology-mutation").length;
}

/**
 * Analytic-residue count at each point a residue page was created or retired,
 * oldest first. Monotonic decline is the colonization signature: everything
 * the data offered was absorbed and nothing new resisted.
 */
export function residueTrajectory(events: readonly LedgerEvent[], projectId?: string): readonly number[] {
  const scoped = projectId === undefined ? events : events.filter((e) => e.projectId === projectId);
  const live = new Set<string>();
  const series: number[] = [];
  for (const event of scoped) {
    if (event.type !== "ontology-mutation") continue;
    if (event.op === "create" && event.pageType === "analytic-residue") {
      live.add(event.targetId);
      series.push(live.size);
    } else if ((event.op === "retire" || event.op === "reinstate") && live.has(event.targetId)) {
      if (event.op === "retire") live.delete(event.targetId);
      series.push(live.size);
    } else if (event.op === "retire" && !live.has(event.targetId)) {
      continue;
    }
  }
  return series;
}
