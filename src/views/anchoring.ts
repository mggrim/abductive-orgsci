/**
 * What the graph is not connecting (ISC-342 … ISC-348).
 *
 * A co-author, 4 August: "it may be that if something is not a fit, the
 * connections are unclear." The graph draws what the researcher has related.
 * It says nothing about what they have not, and an unrelated page renders
 * exactly like a related one that happens to sit at the edge of the layout.
 *
 * This is the same move the bias page already makes. That page renders the
 * crossings nothing watches, rather than omitting them, so the absence is the
 * finding. Here the absence is a page nothing connects to, and a cluster that
 * touches no other cluster.
 *
 * A pure projection over the graph, with no opinion about whether any of it is
 * bad. Early on, everything is unanchored and that is the normal state of a
 * study that has just started. What makes it worth rendering is that it stops
 * being normal, and nobody notices the moment it does unless they can see it.
 */

import type { OntologyGraph, OntologyPage } from "../ontology/schema.ts";
import { connectingEdges, livePages } from "../ontology/schema.ts";

export interface AnchoringView {
  /** Pages with no live edge in either direction. */
  readonly unanchored: readonly OntologyPage[];
  /**
   * Connected components, largest first, as page-id sets. More than one means
   * the account is in pieces that do not speak to each other.
   */
  readonly components: readonly (readonly string[])[];
  /** Page ids that sit outside the largest component. */
  readonly stranded: readonly string[];
  readonly pageCount: number;
  readonly edgeCount: number;
}

export const NO_ANCHORING: AnchoringView = {
  unanchored: [],
  components: [],
  stranded: [],
  pageCount: 0,
  edgeCount: 0,
};

export function projectAnchoring(graph: OntologyGraph): AnchoringView {
  const pages = livePages(graph);
  // An edge naming a retired or absent page is not a connection. That rule was
  // written out here, and here only, while the layout and the view's own lede
  // asked a looser question and disagreed with this projection about the same
  // graph. It is `connectingEdges` in the schema now, so `edgeCount` counts the
  // same relations the neighbour map is built from: it was the looser number,
  // which is how `describeAnchoring` came to skip "nothing relating them yet"
  // for a graph whose only relation pointed at a page it had retired.
  const edges = connectingEdges(graph);
  if (pages.length === 0) return NO_ANCHORING;

  const neighbours = new Map<string, Set<string>>();
  for (const p of pages) neighbours.set(p.id, new Set());
  for (const e of edges) {
    neighbours.get(e.from)?.add(e.to);
    neighbours.get(e.to)?.add(e.from);
  }

  const unanchored = pages.filter((p) => (neighbours.get(p.id)?.size ?? 0) === 0);

  const seen = new Set<string>();
  const components: string[][] = [];
  for (const p of pages) {
    if (seen.has(p.id)) continue;
    const stack = [p.id];
    const component: string[] = [];
    seen.add(p.id);
    while (stack.length > 0) {
      const id = stack.pop() as string;
      component.push(id);
      for (const n of neighbours.get(id) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length);

  const largest = components[0] ?? [];
  const stranded = components.slice(1).flat();

  return {
    unanchored,
    components,
    stranded,
    pageCount: pages.length,
    edgeCount: edges.length,
  };
}

/**
 * One sentence about the shape, or null when there is nothing to say.
 *
 * Null rather than "the graph is fully connected", because a tool that
 * congratulates you on an empty graph is a tool you stop reading.
 */
export function describeAnchoring(view: AnchoringView): string | null {
  if (view.pageCount === 0) return null;
  if (view.edgeCount === 0) {
    return view.pageCount === 1
      ? null
      : `${view.pageCount} claims, and the links between those claims are still to come. What connects any two claims?`;
  }
  const parts: string[] = [];
  if (view.unanchored.length > 0) {
    parts.push(
      `${view.unanchored.length} claim${view.unanchored.length === 1 ? "" : "s"} without a link`,
    );
  }
  if (view.components.length > 1) {
    parts.push(
      `your ontology is in ${view.components.length} pieces that don't touch`,
    );
  }
  if (parts.length === 0) return null;
  return `${parts.join(", and ")}.`;
}
