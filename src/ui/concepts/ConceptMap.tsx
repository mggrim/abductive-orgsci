/**
 * The concept map (M63, ISC-609): concepts as nodes, the five relations as
 * labelled lines, read-only, with the current card marked.
 *
 * The positions come from the claims map's own force layout (`layoutGraph`),
 * fed the concepts as if they were claims and the relations as links, so the
 * two maps settle the same way. The drawing is this file's, because a relation
 * here is named in words on its line rather than by the argument roles' dashes.
 *
 * M75, ISC-668 (the owner, 2026-10-03): "Why is the concept map not drawing all
 * of the concepts and relationships?" It drew the accepted ones only, which the
 * field list also lists, so the two looked linked. The map draws every concept
 * and relation now: accepted ones solid, suggested ones dotted with a
 * "suggested" ring, and a suggested concept that a statement to place has as its
 * proposed home faint. A press on a dotted node or line opens its suggestion
 * card; the caption counts both.
 */

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { MAP_MIN_WIDTH, MAP_WIDTH, TAB_TYPE, conceptMapDrawing, labelLines, labelPlace } from "../../concepts/mapLayout.ts";
import { loneConcepts, type ConceptCard, type ConceptLink, type ProjectOntologyView, type RelationCard } from "../../concepts/projection.ts";
import { RELATION_PHRASE } from "../../concepts/vocabulary.ts";

const R = 7;

const counted = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** The suggestions waiting behind the ones the tab shows, which the map leaves out. */
export interface MapQueue {
  readonly concepts: number;
  readonly relations: number;
}

/** What the queue holds: every suggestion in the project less the window the tab shows (M77b). */
export function mapQueue(all: ProjectOntologyView, shown: ProjectOntologyView): MapQueue {
  return {
    concepts: Math.max(0, all.suggested.length - shown.suggested.length),
    relations: Math.max(0, all.suggestedRelations.length - shown.suggestedRelations.length),
  };
}

/**
 * "3 concepts and 1 relation accepted, 3 concepts suggested, and 14 concepts and
 * 5 relations in the queue": each part only when it has something to count. The
 * queue is the lead's ruling of 2026-10-03 (M77b): the map draws the window of
 * suggestions the tab shows, and the caption counts the rest.
 */
export function mapCaption(
  concepts: number,
  relations: number,
  suggestedConcepts: number,
  suggestedRelations: number,
  queued: MapQueue = { concepts: 0, relations: 0 },
): string {
  const half = (c: number, r: number, verb: string) => {
    const parts = [...(c > 0 ? [counted(c, "concept")] : []), ...(r > 0 ? [counted(r, "relation")] : [])];
    return parts.length === 0 ? null : `${parts.join(" and ")} ${verb}`;
  };
  const shown = [half(concepts, relations, "accepted"), half(suggestedConcepts, suggestedRelations, "suggested")]
    .filter((h): h is string => h !== null)
    .join(", ");
  const queue = half(queued.concepts, queued.relations, "in the queue");
  return queue === null ? shown : shown === "" ? queue : `${shown}, and ${queue}`;
}

/**
 * The second sentence of the caption (M82, ISC-694): how many accepted concepts
 * stand alone, with no accepted relation. Null at zero, and below two accepted
 * concepts, where `loneConcepts` names none.
 */
export function loneCaption(lone: number): string | null {
  if (lone <= 0) return null;
  return `${lone} accepted ${lone === 1 ? "concept stands" : "concepts stand"} alone.`;
}

/**
 * The panel's width, measured, so the drawing is one unit to a pixel and the
 * 11px labels render at 11px (M77b, the lead's ruling). Before a measurement,
 * and where nothing measures (the server render, a test), `fallback` stands.
 * A panel narrower than the drawing's least width scrolls sideways rather than
 * shrinking the text. The section is measured, not the drawing's frame: the
 * section renders from the first paint, while the frame waits for a concept,
 * and History loads after the first paint.
 */
function usePanelWidth(fallback: number): [RefObject<HTMLElement>, number] {
  const ref = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const read = () => {
      const measured = Math.floor(el.clientWidth);
      if (measured > 0) setWidth(Math.max(MAP_MIN_WIDTH, measured));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** The suggested concepts that a statement to place, or a suggested statement, has as its proposed home. */
function proposedHomes(view: ProjectOntologyView): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const s of view.toPlace) {
    const home = view.homes.get(s.id);
    if (home?.kind === "concept") ids.add(home.id);
  }
  for (const s of view.suggestedStatements) if (s.home.kind === "concept") ids.add(s.home.id);
  return new Set([...ids].filter((id) => view.concepts.get(id)?.status === "suggested"));
}

export function ConceptMap(props: {
  readonly projectId: string;
  readonly view: ProjectOntologyView;
  readonly current: string | null;
  /** A press on a node or a line: the card it opens, and whether that card is a suggestion. */
  readonly onOpen: (kind: "concept" | "relation", id: string, suggested: boolean) => void;
  /** The suggestions waiting behind the tab's window, counted in the caption (M77b). */
  readonly queued?: MapQueue;
  /** The drawing's width until the panel is measured; the server render and the tests use it. */
  readonly width?: number;
  /** The least height of the drawing: the expanded map's free height in its dialog (M79). */
  readonly minHeight?: number;
  /** The drawing's height once laid out, 0 with nothing to draw: the frame's natural height where nothing measures (M81). */
  readonly onHeight?: (height: number) => void;
}) {
  const { projectId, view, current, onOpen, minHeight, onHeight } = props;
  const [frame, WIDTH] = usePanelWidth(props.width ?? MAP_WIDTH);
  /* M79: the fold and the expanded dialog draw the map at once, so each drawing
     names its own arrowhead: with one id, both drawings would point at the first. */
  const arrow = `concept-arrow-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const concepts: readonly ConceptCard[] = useMemo(() => [...view.accepted, ...view.suggested], [view]);
  const relations: readonly RelationCard[] = useMemo(() => {
    const drawn = new Set(concepts.map((c) => c.id));
    return [...view.acceptedRelations, ...view.suggestedRelations].filter((r) => drawn.has(r.from) && drawn.has(r.to));
  }, [view, concepts]);
  const links: readonly ConceptLink[] = useMemo(
    () => relations.map((r) => ({ id: r.id, from: r.from, to: r.to, relation: r.relation })),
    [relations],
  );
  const homes = useMemo(() => proposedHomes(view), [view]);
  /* M77b, ISC-677: the drawing's height, the concept positions and the relation
     labels together, so every label clears every other at the panel's width. */
  const drawing = useMemo(
    () =>
      conceptMapDrawing({
        projectId,
        concepts,
        links,
        relations: relations.map((r) => ({ id: r.id, from: r.from, to: r.to, text: RELATION_PHRASE[r.relation] })),
        width: WIDTH,
        ...(minHeight === undefined ? {} : { minHeight }),
      }),
    [projectId, concepts, links, relations, WIDTH, minHeight],
  );
  const HEIGHT = drawing.height;
  useEffect(() => {
    onHeight?.(concepts.length === 0 ? 0 : HEIGHT);
  }, [onHeight, concepts.length, HEIGHT]);
  const at = drawing.at;
  const placed = drawing.placed;
  const accepted = relations.filter((r) => r.status === "accepted").length;
  const caption = mapCaption(view.accepted.length, accepted, view.suggested.length, relations.length - accepted, props.queued);
  const lone = loneCaption(loneConcepts(view).length);

  return (
    /* M79: the fold's summary and the dialog's title name the map, so it has no heading of its own. */
    <section className="concept-map" data-testid="concept-map" aria-label="Concept map" ref={frame}>
      {concepts.length === 0 ? (
        <p className="small muted" data-testid="concept-map-empty">
          Save a summary at a step, and each concept that Abductive suggests from your words appears here.
        </p>
      ) : (
        <>
          <div className="concept-map-frame">
          <svg className="concept-map-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img" aria-label={caption}>
            <defs>
              <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="concept-map-arrow" />
              </marker>
            </defs>
            {relations.map((r) => {
              const a = at.get(r.from);
              const b = at.get(r.to);
              if (a === undefined || b === undefined) return null;
              const suggested = r.status === "suggested";
              /* M82, ISC-693: the line as routed, straight or with one elbow, clear of every label and dot. */
              const route = drawing.routes.get(r.id) ?? [];
              const points = route.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
              const label = placed.get(r.id);
              return (
                <g
                  key={r.id}
                  className="concept-map-edge"
                  data-testid={`concept-map-edge-${r.id}`}
                  data-status={r.status}
                  data-from={r.from}
                  data-to={r.to}
                  onClick={() => onOpen("relation", r.id, suggested)}
                >
                  <title>
                    {suggested
                      ? `Open the suggested relation: ${RELATION_PHRASE[r.relation]}`
                      : `Open the relation: ${RELATION_PHRASE[r.relation]}`}
                  </title>
                  <polyline className="concept-map-hit" points={points} />
                  <polyline
                    className={suggested ? "concept-map-line concept-map-line-suggested" : "concept-map-line"}
                    points={points}
                    markerEnd={`url(#${arrow})`}
                  />
                  {label?.leader != null && (
                    <line
                      className="concept-map-leader"
                      x1={label.leader.x1}
                      y1={label.leader.y1}
                      x2={label.leader.x2}
                      y2={label.leader.y2}
                    />
                  )}
                  <text x={label?.x ?? (a.x + b.x) / 2} y={label?.y ?? (a.y + b.y) / 2 - 4} textAnchor="middle" className="concept-map-relation">
                    {RELATION_PHRASE[r.relation]}
                  </text>
                </g>
              );
            })}
            {concepts.map((c) => {
              const node = at.get(c.id);
              if (node === undefined) return null;
              const isCurrent = c.id === current;
              const lines = labelLines(c.name);
              const suggested = c.status === "suggested";
              /* M82, ISC-693: the label sits on the side of the dot that the lines leaving it cross least. */
              const place = labelPlace(TAB_TYPE, lines.length + (suggested ? 1 : 0), drawing.sides.get(c.id) ?? "below");
              const home = suggested && homes.has(c.id);
              return (
                <g
                  key={c.id}
                  className={home ? "concept-map-node concept-map-home" : "concept-map-node"}
                  data-testid={`concept-map-node-${c.id}`}
                  data-status={c.status}
                  {...(home ? { "data-home": "true" } : {})}
                  data-current={isCurrent ? "true" : "false"}
                  transform={`translate(${node.x} ${node.y})`}
                  onClick={() => onOpen("concept", c.id, suggested)}
                >
                  {suggested && (
                    <title>{home ? `${c.name}: a suggested concept, and the proposed home of a statement to place` : `${c.name}: a suggested concept`}</title>
                  )}
                  {suggested && <circle className="concept-map-ring" r={R + 4} />}
                  <circle className={suggested ? "concept-map-dot-suggested" : undefined} r={isCurrent ? R + 2 : R} />
                  <text x={place.dx} y={place.first} textAnchor={place.anchor} className="concept-map-label">
                    {lines.map((line, i) => (
                      <tspan key={i} x={place.dx} dy={i === 0 ? 0 : 12}>
                        {line}
                      </tspan>
                    ))}
                    {suggested && (
                      <tspan x={place.dx} dy={12} className="concept-map-suggested">
                        suggested
                      </tspan>
                    )}
                  </text>
                </g>
              );
            })}
          </svg>
          </div>
          {/* M79: the caption, with the queue's count, sits under the drawing. */}
          <p className="small muted concept-map-caption" data-testid="concept-map-caption">
            {caption}.{lone === null ? "" : ` ${lone}`}
          </p>
        </>
      )}
    </section>
  );
}
