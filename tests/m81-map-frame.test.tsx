/**
 * M81, ISC-692 (the owner, 2026-10-03): "The concept map is currently embedded
 * in the left section of the emerging project ontology. It should be on its own
 * spread across the entire emerging project ontology section in its own frame as
 * something that can be as a subsection that can be dragged up and down with the
 * mouse to expand or collapse."
 *
 * The map leaves the main pane's column for a frame below both columns, across
 * the whole tab, with a header row (Concept map, the count, Expand) and a drag
 * handle on its top edge. Dragging up opens the map and dragging down closes it,
 * with a pointer or the keyboard (arrows step, Home collapses, End opens to the
 * map's natural height). The frame is collapsed to its header until the first
 * accepted concept, then opens at the map's natural height up to 60% of the
 * window, and this browser keeps the height per project. The M79 fold is gone.
 */

import { useDom, wait } from "./dom.ts";
useDom();

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LedgerEvent } from "../src/ledger/events.ts";
import { projectOntology } from "../src/ontology/projection.ts";
import { projectConcepts, type ProjectOntologyView } from "../src/concepts/projection.ts";
import { addConceptEvents, addRelationEvents } from "../src/concepts/door.ts";
import { ConceptsPage } from "../src/ui/ConceptsView.tsx";
import { MAP_FRAME_STEP, bodyRoom, defaultMapHeight, mapFrameKey, openBound, readMapFrame, tabRoom } from "../src/ui/concepts/ConceptMapFrame.tsx";
import { PAGE_HELP } from "../src/ui/pageHelp.ts";

const P = "p-m81frame";
const Q = "p-m81other";
let n = 0;
const uid = () => `81818181-8181-4818-8818-${String((n += 1)).padStart(12, "0")}`;
let t = 81_000;
const clock = { now: () => (t += 10), makeId: uid };
const env = (projectId: string) => ({ id: uid(), ts: (t += 10), actor: "persona:concepts" as const, model: "claude", modelVersion: "test", projectId });

function suggestedConcept(projectId: string, conceptId: string, name: string): LedgerEvent {
  return {
    ...env(projectId),
    type: "concept-suggested",
    conceptId,
    name,
    definition: `${name} [...]`,
    properties: [],
    relations: [],
    statementIds: [],
    statements: [],
    source: { kind: "summary", station: "context" },
  } as LedgerEvent;
}

/** Two suggested concepts and nothing accepted. */
function suggestedOnly(projectId = P): ProjectOntologyView {
  const events = [suggestedConcept(projectId, "c-one", "Waiting time"), suggestedConcept(projectId, "c-two", "Warm intro")];
  return projectConcepts(events, projectId, projectOntology(events, projectId));
}

/** Two accepted concepts joined by one accepted relation, and one suggested concept. */
function withAccepted(projectId = P): ProjectOntologyView {
  let events: LedgerEvent[] = [];
  for (const name of ["Office-hours slot", "Command score"]) {
    events = [...events, ...addConceptEvents(events, { projectId, name, definition: `${name}.` }, clock)];
  }
  const [slot, score] = projectConcepts(events, projectId, projectOntology(events, projectId)).accepted;
  events = [...events, ...addRelationEvents(events, { projectId, from: slot!.id, to: score!.id, relation: "leads-to", claim: "Longer slots lead to higher scores." }, clock)];
  events = [...events, suggestedConcept(projectId, "c-wait", "Waiting time")];
  return projectConcepts(events, projectId, projectOntology(events, projectId));
}

let host: HTMLElement;
let root: Root;

const realStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const realInnerHeight = Object.getOwnPropertyDescriptor(globalThis, "innerHeight");
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}
const storage = () => (globalThis as unknown as { localStorage: Storage }).localStorage;
const setViewport = (h: number) => Object.defineProperty(globalThis, "innerHeight", { value: h, configurable: true, writable: true });
afterAll(() => {
  if (realStorage !== undefined) Object.defineProperty(globalThis, "localStorage", realStorage);
  if (realInnerHeight !== undefined) Object.defineProperty(globalThis, "innerHeight", realInnerHeight);
});

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage(), configurable: true, writable: true });
  setViewport(1000);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function draw(view: ProjectOntologyView, projectId = P) {
  await act(async () => {
    root.render(
      createElement(ConceptsPage, {
        projectId,
        view,
        chunks: [],
        documents: [],
        current: null,
        onCurrent: () => {},
        acts: null,
      }),
    );
    await wait(5);
  });
}

async function remount(view: ProjectOntologyView, projectId = P) {
  act(() => root.unmount());
  root = createRoot(host);
  await draw(view, projectId);
}

const q = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const frame = () => q("concept-map-frame") as HTMLElement | null;
const handle = () => q("concept-map-handle") as HTMLElement;
const body = () => q("concept-map-frame-body") as HTMLElement;
const now = () => Number(handle().getAttribute("aria-valuenow"));
const max = () => Number(handle().getAttribute("aria-valuemax"));
const bodyHeight = () => body().style.height;

async function key(k: string) {
  await act(async () => {
    handle().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    await wait(5);
  });
}

/** A real pointer drag on the handle: down at one y, moved to another, released. */
async function drag(fromY: number, toY: number) {
  const h = handle();
  await act(async () => {
    h.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 7, clientY: fromY, bubbles: true, cancelable: true }));
    await wait(1);
    h.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientY: Math.round((fromY + toY) / 2), bubbles: true }));
    h.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientY: toY, bubbles: true }));
    h.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, clientY: toY, bubbles: true }));
    await wait(5);
  });
}

describe("M81: the map sits below both columns, across the tab, in its own frame (ISC-692)", () => {
  test("the frame is the tab's own child after the two panes, and neither pane holds the map", async () => {
    await draw(withAccepted());
    const main = host.querySelector("main.conceptsview") as HTMLElement;
    const f = frame()!;
    expect(f).not.toBeNull();
    expect(f.parentElement).toBe(main);
    const panes = main.querySelector(".panel-frame")!;
    expect(panes.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(panes.contains(f)).toBe(false);
    expect(main.querySelector(".panel-main [data-testid='concept-map']")).toBeNull();
    expect(main.querySelector(".panel-side [data-testid='concept-map']")).toBeNull();
    expect(f.querySelector("[data-testid='concept-map']")).not.toBeNull();
    /* The M79 fold is gone. */
    expect(q("concept-map-fold")).toBeNull();
    expect(q("concept-map-fold-details")).toBeNull();
  });

  test("the header row reads Concept map, the count and Expand", async () => {
    await draw(withAccepted());
    const head = q("concept-map-frame-head")!;
    expect(head.querySelector("h2")?.textContent).toBe("Concept map");
    expect(q("concept-map-frame-count")?.textContent).toBe("3 concepts, 1 relation");
    expect(head.querySelector("[data-testid='concept-map-expand']")?.textContent).toBe("Expand");
    expect(frame()!.getAttribute("aria-labelledby")).toBe(head.querySelector("h2")!.id);
  });

  test("the handle sits on the frame's top edge, before the header, as a horizontal separator", async () => {
    await draw(withAccepted());
    const h = handle();
    expect(h.parentElement).toBe(frame());
    expect(frame()!.firstElementChild).toBe(h);
    expect(h.getAttribute("role")).toBe("separator");
    expect(h.getAttribute("aria-orientation")).toBe("horizontal");
    expect(h.getAttribute("tabindex")).toBe("0");
    expect(h.getAttribute("aria-label")).toBe("Resize concept map");
  });
});

describe("M81: the default height (ISC-692)", () => {
  test("collapsed to its header on a project with no accepted concept", async () => {
    await draw(suggestedOnly());
    expect(now()).toBe(0);
    expect(bodyHeight()).toBe("0px");
    expect(body().getAttribute("aria-hidden")).toBe("true");
    expect(frame()!.getAttribute("data-collapsed")).toBe("true");
    expect(readMapFrame(P)).toBeNull();
  });

  test("collapsed to its header even once a concept is accepted (the owner, 2026-10-03: the default is collapsed)", async () => {
    await draw(withAccepted());
    expect(max()).toBeGreaterThan(0);
    expect(now()).toBe(0);
    expect(bodyHeight()).toBe("0px");
    expect(frame()!.getAttribute("data-collapsed")).toBe("true");
    /* No choice was made, so nothing is stored. */
    expect(readMapFrame(P)).toBeNull();
  });

  /* The two tests that opened the frame by default at the first accepted concept
     were retired on 2026-10-03: the owner ruled the default collapsed. The bound
     they checked (60% of the window) now applies to a drag or the End key, in
     `openBound`. */

  test("the rule, as a function", () => {
    expect(defaultMapHeight(0, 400, 1000)).toBe(0);
    expect(defaultMapHeight(1, 400, 1000)).toBe(0);
    expect(defaultMapHeight(3, 900, 1000)).toBe(0);
    /* The bound a drag or the End key opens to: the natural height, 60% of the
       window, and (the lead's ruling, 2026-10-03) never past the room. */
    expect(openBound(400, 1000)).toBe(400);
    expect(openBound(900, 1000)).toBe(600);
    expect(openBound(577, 625, 184)).toBe(184);
    expect(openBound(120, 625, 184)).toBe(120);
  });
});

/* ── The lead's rulings of 2026-10-03 ──────────────────────────────────────────
   1. The default and the drag stop at the room the tab has left, so the panes
      keep their 8rem floor. 2. The tab's height cap reads the study bar's real
      height (it gains the open-question line), so a collapsed frame's header
      sits inside a 625px window. Measured in Safari before the fix: the tab
      started at y 207 and the `100dvh - 11rem` cap ended 31px under the window. */

describe("M81, the lead's ruling: the room the tab has left (ISC-692)", () => {
  test("the tab's room is the scroller's height less the tab's top and the page's foot", () => {
    expect(tabRoom(625, 207)).toBe(370);
    expect(tabRoom(100, 207)).toBe(0);
  });

  test("the frame's body gets the tab's room less the panes' floor, the gap, its header and its border at desktop", () => {
    expect(bodyRoom(370, 40, true)).toBe(370 - 128 - 16 - 40 - 2);
    /* In one column the panes are in the page's own scroll, so only the window bounds the frame. */
    expect(bodyRoom(370, 40, false)).toBe(370 - 40 - 2);
    expect(bodyRoom(null, 40, true)).toBe(Number.POSITIVE_INFINITY);
    expect(bodyRoom(100, 40, true)).toBe(0);
  });

  describe("inside a shell with a study bar", () => {
    const realRect = Element.prototype.getBoundingClientRect;
    const realMatch = window.matchMedia;
    let scroller: HTMLElement;
    let tabTop = 207;
    beforeEach(() => {
      tabTop = 207;
      /* A 625px scroller whose study bar, with its open-question line, puts the tab's top at 207. */
      Element.prototype.getBoundingClientRect = function (this: Element) {
        const box = (top: number, height: number) => ({ top, height, bottom: top + height, left: 0, right: 1000, width: 1000, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
        if (this.matches("main.conceptsview")) return box(tabTop, 400);
        if (this.classList.contains("studybar")) return box(0, 183);
        if (this.classList.contains("shell-content")) return box(0, 625);
        return realRect.call(this);
      };
      window.matchMedia = ((query: string) => ({ matches: query.includes("min-width: 1000px"), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as unknown as typeof window.matchMedia;
      scroller = document.createElement("div");
      scroller.className = "shell-content";
      Object.defineProperty(scroller, "clientHeight", { value: 625, configurable: true });
      const bar = document.createElement("div");
      bar.className = "studybar";
      host.remove();
      scroller.append(bar, host);
      document.body.appendChild(scroller);
    });
    afterEach(() => {
      Element.prototype.getBoundingClientRect = realRect;
      window.matchMedia = realMatch;
      scroller.remove();
    });

    test("the tab carries its measured room, which its height cap reads", async () => {
      await draw(withAccepted());
      const main = host.querySelector("main.conceptsview") as HTMLElement;
      expect(main.style.getPropertyValue("--concepts-room")).toBe("370px");
    });

    test("a room measured while the bar was settling is measured again when the page is shown", async () => {
      /* Measured in Safari: a reload in a background tab measured the tab's top
         at 265 while the study bar settled, the observer reported nothing while
         the tab was hidden, and the room stayed 312 instead of 370. */
      tabTop = 265;
      await draw(withAccepted());
      const main = host.querySelector("main.conceptsview") as HTMLElement;
      expect(main.style.getPropertyValue("--concepts-room")).toBe("312px");
      tabTop = 207;
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await wait(5);
      });
      expect(main.style.getPropertyValue("--concepts-room")).toBe("370px");
    });

    test("the default and the drag stop at the room, never past it", async () => {
      setViewport(625);
      await draw(withAccepted());
      const room = 370 - 128 - 16 - 40 - 2;
      expect(max()).toBe(room);
      /* The default is collapsed (the owner, 2026-10-03); the drag opens it and stops at the room. */
      expect(now()).toBe(0);
      await drag(500, -3000);
      expect(now()).toBe(room);
      await key("End");
      expect(now()).toBe(room);
      expect(bodyHeight()).toBe(`${room}px`);
      /* Measured in Safari: at the cap the handle said "Open to the map's full height" over a map three times taller. */
      expect(handle().getAttribute("aria-valuetext")).toBe("Open as far as the window allows");
      await key("ArrowDown");
      expect(handle().getAttribute("aria-valuetext")).toBe(`${Math.round(((room - MAP_FRAME_STEP) / 296) * 100)}% of the map's height`);
    });
  });

  test("the tab's height cap reads the measured room, with the old arithmetic before a measurement", async () => {
    const css = await Bun.file(new URL("../src/ui/styles/concepts.css", import.meta.url)).text();
    const desk = css.slice(css.indexOf("@media (min-width: 1000px)"));
    const at = desk.indexOf(".conceptsview {");
    expect(desk.slice(at, desk.indexOf("}", at))).toContain("max-height: var(--concepts-room)");
    const tokens = await Bun.file(new URL("../src/ui/styles/tokens.css", import.meta.url)).text();
    expect(tokens).toContain("--concepts-room: calc(100dvh - 11rem);");
  });
});

describe("M81: a pointer drag on the handle sets the height (ISC-692)", () => {
  test("dragging up opens the map by the distance dragged, and dragging down closes it", async () => {
    await draw(suggestedOnly());
    expect(now()).toBe(0);
    await drag(500, 400);
    expect(now()).toBe(100);
    expect(bodyHeight()).toBe("100px");
    expect(frame()!.getAttribute("data-collapsed")).toBe("false");
    await drag(400, 440);
    expect(now()).toBe(60);
    /* Past the bottom, the frame stops at its header. */
    await drag(440, 900);
    expect(now()).toBe(0);
    expect(frame()!.getAttribute("data-collapsed")).toBe("true");
    /* Past the top, it stops at the map's natural height. */
    await drag(900, -2000);
    expect(now()).toBe(max());
  });

  test("the drag is remembered for the project, and another project keeps its own default", async () => {
    await draw(withAccepted());
    /* The default is collapsed (the owner, 2026-10-03), so the first drag opens the frame. */
    await key("End");
    const open = now();
    expect(open).toBe(max());
    await drag(600, 650);
    expect(now()).toBe(open - 50);
    expect(readMapFrame(P)).toBe(open - 50);
    expect(storage().getItem(mapFrameKey(P))).not.toBeNull();
    await remount(withAccepted());
    expect(now()).toBe(open - 50);
    expect(bodyHeight()).toBe(`${open - 50}px`);
    await remount(withAccepted(Q), Q);
    expect(now()).toBe(0);
    /* A frame collapsed by hand stays collapsed on the next visit, accepted concepts or not. */
    await drag(300, 3000);
    expect(readMapFrame(Q)).toBe(0);
    await remount(withAccepted(Q), Q);
    expect(now()).toBe(0);
    expect(readMapFrame(P)).toBe(open - 50);
  });
});

describe("M81: a drag survives a pointer the browser won't capture (ISC-692)", () => {
  test("when setPointerCapture throws, the drag still follows the pointer through the window", async () => {
    /* Measured in Safari: a pointer the browser isn't tracking makes
       setPointerCapture throw NotFoundError, and the handler stopped before it
       listened for a move, so the frame didn't open. */
    const proto = HTMLElement.prototype as unknown as { setPointerCapture: (id: number) => void; releasePointerCapture: (id: number) => void };
    const realSet = proto.setPointerCapture;
    const realRelease = proto.releasePointerCapture;
    proto.setPointerCapture = () => {
      throw new DOMException("The object can not be found here.", "NotFoundError");
    };
    proto.releasePointerCapture = () => {
      throw new DOMException("The object can not be found here.", "NotFoundError");
    };
    try {
      await draw(suggestedOnly());
      await act(async () => {
        handle().dispatchEvent(new PointerEvent("pointerdown", { pointerId: 9, clientY: 500, bubbles: true, cancelable: true }));
        await wait(1);
        /* The moves arrive away from the handle, as they do once the pointer leaves the strip. */
        document.body.dispatchEvent(new PointerEvent("pointermove", { pointerId: 9, clientY: 420, bubbles: true }));
        document.body.dispatchEvent(new PointerEvent("pointerup", { pointerId: 9, clientY: 420, bubbles: true }));
        await wait(5);
      });
      expect(now()).toBe(80);
      /* And the listeners went with the release: a later move changes nothing. */
      await act(async () => {
        document.body.dispatchEvent(new PointerEvent("pointermove", { pointerId: 9, clientY: 100, bubbles: true }));
        await wait(5);
      });
      expect(now()).toBe(80);
      expect(document.body.classList.contains("dock-resizing")).toBe(false);
    } finally {
      proto.setPointerCapture = realSet;
      proto.releasePointerCapture = realRelease;
    }
  });
});

describe("M81: the keyboard path on the handle (ISC-692)", () => {
  test("arrows step the height, Home collapses and End opens to the natural height", async () => {
    await draw(suggestedOnly());
    await key("ArrowUp");
    expect(now()).toBe(MAP_FRAME_STEP);
    await key("ArrowUp");
    expect(now()).toBe(2 * MAP_FRAME_STEP);
    await key("ArrowDown");
    expect(now()).toBe(MAP_FRAME_STEP);
    await key("End");
    expect(now()).toBe(max());
    expect(bodyHeight()).toBe(`${max()}px`);
    await key("Home");
    expect(now()).toBe(0);
    expect(bodyHeight()).toBe("0px");
    expect(readMapFrame(P)).toBe(0);
  });

  test("the handle says where it is in words", async () => {
    await draw(suggestedOnly());
    expect(handle().getAttribute("aria-valuetext")).toBe("Collapsed");
    await key("End");
    expect(handle().getAttribute("aria-valuetext")).toBe("Open to the map's full height");
    await key("ArrowDown");
    expect(handle().getAttribute("aria-valuetext")).toMatch(/^\d+% of the map's height$/);
  });
});

describe("M81: the stored height (ISC-692)", () => {
  test("a stored value this file did not write is read as no choice, and storage that throws is survived", async () => {
    storage().setItem(mapFrameKey(P), "{not json");
    expect(readMapFrame(P)).toBeNull();
    storage().setItem(mapFrameKey(P), JSON.stringify({ height: "tall" }));
    expect(readMapFrame(P)).toBeNull();
    storage().setItem(mapFrameKey(P), JSON.stringify({ height: -4 }));
    expect(readMapFrame(P)).toBeNull();
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
      configurable: true,
      writable: true,
    });
    expect(readMapFrame(P)).toBeNull();
    await draw(withAccepted());
    await key("Home");
    expect(now()).toBe(0);
  });

  test("a stored height taller than the map opens only to the map's natural height", async () => {
    storage().setItem(mapFrameKey(P), JSON.stringify({ height: 5000 }));
    await draw(withAccepted());
    expect(now()).toBe(max());
  });
});

describe("M81: the frame's styles (ISC-692)", () => {
  const sheet = () => Bun.file(new URL("../src/ui/styles/concepts.css", import.meta.url)).text();
  const ruleOf = (css: string, selector: string) => {
    const at = css.indexOf(`${selector} {`);
    return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
  };

  test("the frame scrolls inside itself when it is shorter than the drawing", async () => {
    const css = await sheet();
    expect(ruleOf(css, ".concept-map-dock-body")).toContain("overflow: auto;");
  });

  test("the handle's hit area is at least 12px tall and shows a grip", async () => {
    const css = await sheet();
    const components = await Bun.file(new URL("../src/ui/styles/components.css", import.meta.url)).text();
    expect(ruleOf(components, "\n.dock-handle")).toContain("height: var(--space-md);");
    const grip = ruleOf(css, ".concept-map-dock > .dock-handle::after");
    expect(grip).toContain('content: ""');
    expect(grip).toContain("background: var(--line-strong)");
  });

  test("at desktop the panes give the frame its room, so the header stays in the window", async () => {
    const css = await sheet();
    const desk = css.slice(css.indexOf("@media (min-width: 1000px)"));
    expect(ruleOf(desk, ".conceptsview")).toContain("flex-direction: column");
    expect(ruleOf(desk, ".conceptsview")).toContain("max-height: var(--concepts-room)");
    expect(ruleOf(desk, ".conceptsview > .panel-frame")).toContain("max-height: none");
    expect(ruleOf(desk, ".conceptsview > .panel-frame")).toContain("flex: 1 1 auto");
    expect(ruleOf(css, ".concept-map-dock")).toContain("flex: 0 0 auto");
  });
});

describe("M81: Help says where the map is and how to open it", () => {
  test("the Concept map part names the frame below both columns, the drag, the keys and Expand", () => {
    const part = PAGE_HELP.ontology.parts.find((p) => p.name === "Concept map")!;
    const said = part.says.join(" ");
    expect(said).toContain("below both columns");
    expect(said).toContain("Drag");
    expect(said).toContain("Home");
    expect(said).toContain("End");
    expect(said).toContain("Expand");
    expect(said).not.toContain("fold");
    expect(said).not.toContain("at the foot of the page");
  });
});
