/**
 * The concept map in its own frame below both columns of the concepts tab (M81,
 * ISC-692; replaces M79's fold).
 *
 * The owner, 2026-10-03: "It should be on its own spread across the entire
 * emerging project ontology section in its own frame as something that can be
 * as a subsection that can be dragged up and down with the mouse to expand or
 * collapse." M79 put the map in a fold at the foot of the main pane, inside the
 * left column. The frame sits under the main pane and the side panel together,
 * as wide as the tab, with a header row (Concept map, the count, Expand) and a
 * handle on its top edge.
 *
 * The handle is `DockHandle`, the top-edge grab M45 built for a bottom panel:
 * up grows the frame, Home is the floor (collapsed to the header) and End the
 * ceiling (the map's natural height), with pointer capture so a trackpad or a
 * touch steers it too. Its geometry is the caller's, and here a drag moves the
 * height by the distance the pointer travelled from where it went down, which
 * holds whether the panes give way above the frame (desktop) or the page grows
 * below it (one column).
 *
 * The height is the viewer's, not the project's, so this browser keeps it per
 * project the way M79 kept the fold, inside try/catch, and it never reaches
 * History. With no stored height the frame is collapsed (the owner,
 * 2026-10-03: "the default should be collapsed"); a drag or the End key opens
 * it as far as the map's natural height, up to 60% of the window. The map draws at the frame's width (m77b's one unit to a pixel)
 * and the frame scrolls inside itself when it is shorter than the drawing.
 *
 * The lead's rulings, 2026-10-03, after the Safari walk at 1398 by 625: the
 * default and the drag stop at the room the tab has left, so the panes keep
 * their 8rem floor (60% of a 625px window had squeezed them to it and run the
 * page past the window); and the tab's height cap reads the study bar's real
 * height, which gains the open-question line, instead of `100dvh - 11rem`
 * (the tab started at y 207 and that cap ended 31px under the window). The tab
 * measures its room with `useTabRoom`, writes it as `--concepts-room` for its
 * cap and hands it to the frame, the way Workbench measures the bar for its
 * sticky pane.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { ProjectOntologyView } from "../../concepts/projection.ts";
import { DockHandle } from "../components/DockHandle.tsx";
import { Sheet } from "../components/Sheet.tsx";
import { countOf } from "../format.ts";
import { ConceptMap, type MapQueue } from "./ConceptMap.tsx";

/** How far one arrow press on the handle moves the frame's edge, in pixels. */
export const MAP_FRAME_STEP = 32;

/** The share of the window that the frame opens to by default. */
const DEFAULT_SHARE = 0.6;

/* Room under a drawing for its caption: two lines of small text and the gap above them. */
const CAPTION_ROOM = 56;

export function mapFrameKey(projectId: string): string {
  return `abductive:concept-map-frame:${projectId}`;
}

/** The height the researcher left the frame at for this project in this browser, or null. Never throws. */
export function readMapFrame(projectId: string): number | null {
  try {
    const raw = globalThis.localStorage?.getItem(mapFrameKey(projectId));
    if (raw === null || raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const height = (parsed as Record<string, unknown>).height;
    return typeof height === "number" && Number.isFinite(height) && height >= 0 ? Math.round(height) : null;
  } catch {
    return null;
  }
}

/** Keep the height. Never throws: a browser that will not store it opens the frame at its default next time. */
export function writeMapFrame(projectId: string, height: number): void {
  try {
    globalThis.localStorage?.setItem(mapFrameKey(projectId), JSON.stringify({ height: Math.round(height) }));
  } catch {
    /* Private mode, a full quota or blocked site data: the frame still works. */
  }
}

/**
 * Collapsed, always, until the researcher drags or keys the frame open (the
 * owner, 2026-10-03: "the default should be collapsed"). The frame opened by
 * itself at the first accepted concept before that; the arguments stay so the
 * drag's bound (the map's natural height, 60% of the window, the room the tab
 * has left) keeps one home, in `openBound`.
 */
export function defaultMapHeight(_accepted: number, _natural: number, _viewport: number, _room = Number.POSITIVE_INFINITY): number {
  return 0;
}

/** How far a drag or the End key opens the frame: the map's natural height, capped at 60% of the window and at the room the tab has left. */
export function openBound(natural: number, viewport: number, room = Number.POSITIVE_INFINITY): number {
  return Math.max(0, Math.min(natural, Math.round(viewport * DEFAULT_SHARE), room));
}

/* The page's foot under the tab: --space-3xl, the bottom padding that the
   panes' old `calc(100dvh - 11rem)` counted. */
const TAB_FOOT = 48;
/* The panes' least height at desktop, as concepts.css sets it (8rem). */
const PANES_FLOOR = 128;
/* The gap above the frame (--space-lg) and its top and bottom border. */
const FRAME_GAP = 16;
const FRAME_BORDERS = 2;
/* The header row's height before it is measured: one line of the h2 and its padding. */
const HEAD_FALLBACK = 40;
/* Where the panes stand beside each other and stop at the window (panels.css). */
const WIDE = "(min-width: 1000px)";

/** The tab's room: the scroller's visible height less the tab's top in it and the page's foot. */
export function tabRoom(scrollerHeight: number, tabTop: number): number {
  return Math.max(0, Math.round(scrollerHeight - tabTop - TAB_FOOT));
}

/**
 * The frame's body may take the tab's room less, at desktop, the panes' floor
 * and the gap above the frame, and always less its header and border; with no
 * measurement (the server render, a test without a shell) it is unbounded.
 */
export function bodyRoom(room: number | null, head: number, wide: boolean): number {
  if (room === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, room - (wide ? PANES_FLOOR + FRAME_GAP : 0) - head - FRAME_BORDERS);
}

/**
 * The tab's room, measured from the DOM (the lead's ruling, 2026-10-03): the
 * shell's scroller and the tab's top in it, which sits under the study bar and
 * moves with the bar's open-question line. Null until measured, and null
 * outside a shell.
 */
export function useTabRoom(tab: RefObject<HTMLElement>): number | null {
  const [room, setRoom] = useState<number | null>(null);
  useEffect(() => {
    const el = tab.current;
    const scroller = el?.closest(".shell-content") ?? null;
    if (el == null || scroller === null) return;
    const bar = scroller.querySelector(".studybar");
    const measure = () => {
      /* The tab's top in the scroller's content, so a scrolled page reads the same. */
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const next = tabRoom(scroller.clientHeight, top);
      setRoom((was) => (was === next ? was : next));
    };
    measure();
    const sizes = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    sizes?.observe(scroller);
    if (bar !== null) sizes?.observe(bar);
    if (el.parentElement !== null) sizes?.observe(el.parentElement);
    /* Measured in Safari: a reload in a background tab read the tab's top while
       the study bar was still settling, and the observer reported nothing while
       the tab was hidden, so the room stayed short. Showing the page measures
       again. */
    const shown = () => {
      if (document.visibilityState !== "hidden") measure();
    };
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", shown);
    return () => {
      sizes?.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", shown);
    };
  }, [tab]);
  return room;
}

/** Whether the panes stand beside each other, so the frame takes its room from them. */
function useWide(): boolean {
  const query = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(WIDE).matches;
  const [wide, setWide] = useState(query);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(WIDE);
    const on = () => setWide(list.matches);
    list.addEventListener?.("change", on);
    return () => list.removeEventListener?.("change", on);
  }, []);
  return wide;
}

/** The concepts and relations the map draws: the accepted ones and the window of suggestions the tab shows. */
function drawn(view: ProjectOntologyView): { readonly concepts: number; readonly relations: number } {
  const ids = new Set([...view.accepted, ...view.suggested].map((c) => c.id));
  const relations = [...view.acceptedRelations, ...view.suggestedRelations].filter((r) => ids.has(r.from) && ids.has(r.to));
  return { concepts: ids.size, relations: relations.length };
}

/** "6 concepts, 1 relation": what the map draws, in the header row. Zero counts, as on every count. */
export function mapFrameNote(view: ProjectOntologyView): string {
  const n = drawn(view);
  return `${countOf(n.concepts, "concept")}, ${countOf(n.relations, "relation")}`;
}

/** The height of a box, measured; 0 until measured, and 0 where nothing measures (the server render, a test). */
function useBoxHeight(measure: (el: HTMLDivElement) => number): [(el: HTMLDivElement | null) => void, number] {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (el === null || typeof ResizeObserver === "undefined") return;
    const read = () => setHeight(measure(el));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, measure]);
  return [setEl, height];
}

/* The content's whole height, rounded up so the frame at its natural height doesn't scroll by a fraction. */
const outerHeight = (el: HTMLDivElement) => Math.ceil(el.offsetHeight);
/* The dialog's free room, as M79 measured it. */
const freeRoom = (el: HTMLDivElement) => Math.floor(el.clientHeight);

const viewportHeight = () => (typeof window === "undefined" ? 800 : window.innerHeight || 800);

export function ConceptMapFrame(props: {
  readonly projectId: string;
  /** The window the tab shows, which the map draws. */
  readonly view: ProjectOntologyView;
  /** The suggestions behind the window, counted in the caption. */
  readonly queued: MapQueue;
  readonly current: string | null;
  readonly onOpen: (kind: "concept" | "relation", id: string, suggested: boolean) => void;
  /** The tab's measured room (`useTabRoom`), which bounds the default and the drag; null before a measurement. */
  readonly room?: number | null;
}) {
  const { projectId, view, queued, current, onOpen } = props;
  const [choice, setChoice] = useState<number | null>(() => readMapFrame(projectId));
  const [expanded, setExpanded] = useState(false);
  const [drawingHeight, setDrawingHeight] = useState(0);
  const [content, contentHeight] = useBoxHeight(outerHeight);
  const [room, roomHeight] = useBoxHeight(freeRoom);
  const [head, headHeight] = useBoxHeight(outerHeight);
  const wide = useWide();
  const seen = useRef(projectId);
  const origin = useRef({ y: 0, height: 0 });

  /* The tab is drawn again for another project without unmounting. */
  useEffect(() => {
    if (seen.current === projectId) return;
    seen.current = projectId;
    setChoice(readMapFrame(projectId));
  }, [projectId]);

  /* The map's natural height: the frame's content measured, or, where nothing
     measures, the drawing's own height and the caption's room under it. */
  const natural = contentHeight > 0 ? contentHeight : drawingHeight > 0 ? drawingHeight + CAPTION_ROOM : 0;
  /* The lead's ruling: the drag and the default stop at the room the tab has left. */
  const space = bodyRoom(props.room ?? null, headHeight > 0 ? headHeight : HEAD_FALLBACK, wide);
  const ceiling = Math.max(0, Math.min(natural, space));
  const wanted = choice ?? defaultMapHeight(view.accepted.length, natural, viewportHeight(), space);
  const height = Math.max(0, Math.min(wanted, ceiling));
  const collapsed = height === 0;

  const onChange = useCallback(
    (next: number) => {
      const h = Math.max(0, Math.round(next));
      setChoice(h);
      writeMapFrame(projectId, h);
    },
    [projectId],
  );
  /* Where a drag started, so the height follows the distance the pointer travelled. */
  const onPointerDownCapture = (e: ReactPointerEvent<HTMLElement>) => {
    if ((e.target as Element | null)?.closest?.(".dock-handle") == null) return;
    origin.current = { y: e.clientY, height };
  };
  const valueAt = useCallback((clientY: number) => origin.current.height + (origin.current.y - clientY), []);
  /* In words, against the map's own height; at a cap the window sets, the handle says so. */
  const valueText = collapsed
    ? "Collapsed"
    : height >= natural
      ? "Open to the map's full height"
      : height >= ceiling
        ? "Open as far as the window allows"
        : `${Math.round((height / Math.max(1, natural)) * 100)}% of the map's height`;

  const closeSheet = useCallback(() => setExpanded(false), []);
  const something = view.accepted.length + view.suggested.length > 0;
  /* A press inside the dialog opens a card over the page, so the dialog closes first. */
  const openFromSheet = (kind: "concept" | "relation", id: string, suggested: boolean) => {
    setExpanded(false);
    onOpen(kind, id, suggested);
  };

  return (
    <section
      className="concept-map-dock"
      data-testid="concept-map-frame"
      data-collapsed={collapsed ? "true" : "false"}
      aria-labelledby="concept-map-frame-h"
      onPointerDownCapture={onPointerDownCapture}
    >
      <DockHandle
        value={height}
        min={0}
        max={ceiling}
        step={MAP_FRAME_STEP}
        onChange={onChange}
        valueAt={valueAt}
        label="Resize concept map"
        valueText={valueText}
        testId="concept-map-handle"
      />
      <div className="concept-map-dock-head" data-testid="concept-map-frame-head" ref={head}>
        <h2 id="concept-map-frame-h">Concept map</h2>
        <span className="small muted" data-testid="concept-map-frame-count">
          {mapFrameNote(view)}
        </span>
        {something && (
          <button type="button" className="btn-bare concept-map-expand" data-testid="concept-map-expand" onClick={() => setExpanded(true)}>
            Expand
          </button>
        )}
      </div>
      <div
        className="concept-map-dock-body"
        data-testid="concept-map-frame-body"
        style={{ height: `${height}px` }}
        {...(collapsed ? { "aria-hidden": true } : {})}
      >
        <div className="concept-map-dock-content" ref={content}>
          <ConceptMap projectId={projectId} view={view} queued={queued} current={current} onOpen={onOpen} onHeight={setDrawingHeight} />
        </div>
      </div>
      {/* Drawn only while open, as the card overlay is, so the page holds no closed dialog. */}
      {expanded && (
        <Sheet open onClose={closeSheet} title="Concept map" className="concept-map-sheet" testId="concept-map-sheet">
          <div className="concept-map-sheet-room" ref={room}>
            <ConceptMap
              projectId={projectId}
              view={view}
              queued={queued}
              current={current}
              onOpen={openFromSheet}
              {...(roomHeight > CAPTION_ROOM ? { minHeight: roomHeight - CAPTION_ROOM } : {})}
            />
          </div>
        </Sheet>
      )}
    </section>
  );
}
