/**
 * M34: the front page's glyphs, its two labels, and its two sliders.
 *
 * The owner, verbatim: "For what goes wrong early, there should be icons for
 * each of the nine aspects. It should also clarify that the subtitle is the
 * problem, and the following statement is how the tool helps. The seven aspects
 * … need a sub label, which should be something like how to use the tool. Again,
 * seven steps should have an icon for each of the seven. What goes wrong early
 * should probably be a slider. Same with how to use the tool."
 *
 * Four properties, and each has a way of going wrong that no screenshot would
 * catch:
 *
 *   completeness   a glyph per item, checked from the ARRAYS. The records are
 *                  keyed by a union type, so the compiler already refuses a
 *                  record with a hole in it; what the compiler cannot see is a
 *                  union that has drifted away from the array it describes, so
 *                  a tenth obstacle typed against a stale union would compile
 *                  and render nine glyphs and ten cards. This reads the arrays.
 *   the two labels which half of an obstacle card is the problem and which is
 *                  what the tool does about it, in order, above the sentence
 *                  each one names. Order is the whole of it: the same two
 *                  strings in the other places would say the opposite thing.
 *   the track      a scroll-snap track with a previous and a next, and cards
 *                  that stay list items. A slider built out of divs and
 *                  transforms passes any visual check and loses a screen reader
 *                  the list it was reading.
 *   the keyboard   rendered, because whether Tab reaches the ninth card and
 *                  whether Next moves the track are exactly what source text
 *                  cannot say. happy-dom has no layout, so the card widths are
 *                  the component's own fallback here; what is under test is the
 *                  wiring, not the arithmetic of a browser's scroll port.
 */

import { useDom } from "./dom.ts";
useDom();

import { describe, expect, test } from "bun:test";
import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ObstacleSlider } from "../src/ui/Introduction.tsx";
import { OBSTACLE_ICONS, STEP_ICONS } from "../src/ui/icons/FrontIcons.tsx";
import { STATIONS } from "../src/flow/stations.ts";

const INTRO = await Bun.file(
  new URL("../src/ui/Introduction.tsx", import.meta.url).pathname,
).text();
const ICONS = await Bun.file(
  new URL("../src/ui/icons/FrontIcons.tsx", import.meta.url).pathname,
).text();
const CSS = await Bun.file(
  new URL("../src/ui/styles/intro.css", import.meta.url).pathname,
).text();

/** Comments hold the reasoning, including naming the channels the code avoids. */
function bare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}
const ICON_CODE = bare(ICONS);
const INTRO_CODE = bare(INTRO);

/** The obstacle ids, read off the source array rather than off the union. */
const OBSTACLE_IDS: readonly string[] = [
  ...INTRO.slice(INTRO.indexOf("const OBSTACLES:"), INTRO.indexOf("const SPELLED:")).matchAll(
    /^\s{4}id: "([a-z-]+)",$/gm,
  ),
].map((m) => m[1] ?? "");

describe("M34: every item on the front page carries a glyph", () => {
  test("the nine obstacles are nine, and each one has an icon", () => {
    // Vacuity guard first: a slice that stopped matching would make the loop
    // below pass over an empty list.
    expect(OBSTACLE_IDS).toHaveLength(9);
    expect(new Set(OBSTACLE_IDS).size).toBe(9);
    for (const id of OBSTACLE_IDS) {
      expect({ id, drawn: id in OBSTACLE_ICONS }).toEqual({ id, drawn: true });
    }
    // And nothing is drawn that no card renders, which is the other direction
    // and the one a union drifting off its array would show up in.
    expect(Object.keys(OBSTACLE_ICONS).sort()).toEqual([...OBSTACLE_IDS].sort());
  });

  /* M88: "How the parts fit together" left the front page, and its seven
   * moves' glyphs with it. The obstacle card still draws its number from the
   * index rather than a written number. */
  test("the obstacle card keeps its number, read off the index", () => {
    expect(
      INTRO.match(/<span className="obstacle-n">\{(?:i|props\.index) \+ 1\}<\/span>/g),
    ).toHaveLength(1);
  });

  test("the eight steps each have an icon, keyed by the station's own id (M58)", () => {
    expect(STATIONS.length).toBe(8);
    for (const station of STATIONS) {
      expect({ id: station.id, drawn: station.id in STEP_ICONS }).toEqual({
        id: station.id,
        drawn: true,
      });
    }
    expect(Object.keys(STEP_ICONS).sort()).toEqual(STATIONS.map((s) => s.id).sort());
  });

  test("a glyph is a hidden achromatic line drawing that fetches nothing", () => {
    // Twenty-three glyphs, one box. The words carry the meaning on every card,
    // so every one of these is decoration and says so.
    const boxes = ICON_CODE.match(/viewBox="0 0 24 24"/g) ?? [];
    expect(boxes).toHaveLength(1); // one shared wrapper, not twenty-three
    expect(ICON_CODE).toContain('stroke="currentColor"');
    expect(ICON_CODE).toContain('strokeWidth="1.5"');
    expect(ICON_CODE).toContain('strokeLinecap="round"');
    expect(ICON_CODE).toContain('aria-hidden="true"');
    // Achromatic: no hex, no named colour, no second palette on the first
    // screen. tests/styles-integrity.test.ts holds the hex half globally; this
    // is the half that would let a glyph reach for `red` instead.
    expect(ICON_CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(ICON_CODE.match(/fill="(?!none|currentColor)/g)).toBeNull();
    // No fetch, which is the constraint the whole page is written under.
    expect(ICON_CODE).not.toMatch(/https?:\/\//);
    expect(ICON_CODE).not.toContain("<img");
    // No dash. That channel means "nothing joins this page yet" on the ontology
    // surfaces, and tests/origin-boundary.test.ts keeps it there.
    expect(ICON_CODE).not.toContain("strokeDasharray");
    // The metaphor table is in the file, so the choices can be judged without
    // reading twenty-three path strings.
    expect(ICONS).toContain("The twenty-three metaphors");
  });
});

describe("M34: an obstacle card says which half is the problem", () => {
  test("the heading, then the one label, then the sentence it names", () => {
    const card = INTRO.slice(
      INTRO.indexOf("export function ObstacleSlider"),
      INTRO.indexOf("export function StepRail"),
    );
    // M85, ISC-709: "The question" went, since the question is the heading; the
    // help's kicker is HELP_LABEL, "How Abductive might help".
    expect(card).not.toContain("The question");
    const heading = card.indexOf("<h3>{o.title}</h3>");
    const helps = card.indexOf('<p className="intro-card-label">{HELP_LABEL}</p>');
    const body = card.indexOf("<p>{o.body}</p>");
    for (const [name, at] of [
      ["the heading", heading],
      ["How Abductive might help", helps],
      ["the body", body],
    ] as const) {
      expect({ name, present: at > 0 }).toEqual({ name, present: true });
    }
    // Order is the whole of it: the label names the sentence under it.
    expect(heading).toBeLessThan(helps);
    expect(helps).toBeLessThan(body);
  });

  /* M88: the kicker went with "How the parts fit together"; the card's label
   * keeps the micro step. */
  test("the label is the micro step, with its tracking", () => {
    const rule = /p\.intro-card-label \{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(rule).toContain("font-size: var(--text-micro)");
    expect(rule).toContain("letter-spacing: 0.06em");
  });
});

describe("M34: the two lists are sliders and are still lists", () => {
  test("the track snaps, one card at a time, and is not a carousel of divs", () => {
    const track = /\.intro-slider-track \{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(track).toContain("scroll-snap-type: x mandatory");
    expect(track).toContain("overflow-x: auto");
    expect(track).toContain("scroll-behavior: smooth");
    const slide = /\n\.intro-slide \{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(slide).toContain("scroll-snap-align: start");
    // About 320px, held rather than fluid, so three sit in view at 1440 and two
    // at 1024 with the next one part-shown either way.
    expect(slide).toContain("flex: 0 0 320px");
    // Below the narrow breakpoint the card takes the port and touch does the
    // scrolling; the track never stops being scrollable.
    expect(CSS).toContain("@media (max-width: 700px)");
    // No autoplay anywhere: no timer, no interval, no animation on the track.
    expect(INTRO_CODE).not.toMatch(/setInterval|setTimeout/);
  });

  test("motion is switched off when the reader has asked for less of it", () => {
    expect(CSS).toContain("prefers-reduced-motion: reduce");
  });

  test("the list survived: an ol of li, one li per item", () => {
    const slider = INTRO.slice(INTRO.indexOf("function IntroSlider"));
    expect(slider).toContain("<ol");
    expect(slider).not.toContain('role="list"');
    expect(INTRO).toContain('<li key={o.title} className="obstacle-card intro-slide"');
  });

  /* The owner's ruling, M34: an arrow at the end of a track is not a control
   * waiting on a condition, so it is never drawn inert and never carries a
   * sentence explaining a wait that is not happening. The position line is what
   * says where you are. What this pins is that the slider never reaches for the
   * inert primitive: `intro-start` above it still does, and this must not read
   * as a claim that the front page has no inert control at all. */
  test("the slider never wires an inert state into either arrow", () => {
    const slider = bare(
      INTRO.slice(INTRO.indexOf("function IntroSlider"), INTRO.indexOf("export function ObstacleSlider")),
    );
    expect(slider).toContain("intro-slider-buttons");
    expect(slider).not.toContain("aria-disabled");
    expect(slider).not.toContain("inertAttrs");
    expect(slider).not.toContain("InertNote");
    expect(slider).not.toContain("disabled");
    // M34 round four: the end is no longer a guard on a remembered flag, it is
    // the absence of a next snap point. A press at the end finds none and
    // returns, which is the same behaviour with one fewer thing to go stale.
    expect(slider).toContain("if (next === undefined) return;");
    // The one inert control on this page is still the one that was always
    // there, so this test cannot pass by the primitive having been deleted.
    expect(INTRO).toContain('inertAttrs("intro-start"');
  });
});

/**
 * Rendered, because none of the above says whether a keyboard reader can get
 * to the ninth card or whether Next does anything.
 */
async function render(): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        StrictMode,
        null,
        React.createElement(ObstacleSlider),
      ),
    );
  });
  return host;
}

describe("M34: the slider, rendered", () => {
  test("every card is a list item and every one takes a tab stop", async () => {
    const host = await render();
    const cards = host.querySelectorAll<HTMLElement>("ol.obstacle-cards > li");
    expect(cards).toHaveLength(9);
    for (const card of cards) {
      expect(card.tagName).toBe("LI");
      expect(card.getAttribute("tabindex")).toBe("0");
      // The snap point the browser scrolls a focused card to, and the hook the
      // step measurement reads, are the same element.
      expect(card.hasAttribute("data-slide")).toBe(true);
    }
    // Focus really does land on one, which is what a tab stop is for.
    const ninth = cards[8] as HTMLElement;
    ninth.focus();
    expect(document.activeElement).toBe(ninth);
  });

  test("Next moves the track and Previous brings it back", async () => {
    const host = await render();
    const track = host.querySelector<HTMLElement>(".intro-slider-track") as HTMLElement;
    const next = host.querySelector<HTMLElement>(
      '[data-testid="intro-obstacles-slider-next"]',
    ) as HTMLElement;
    const prev = host.querySelector<HTMLElement>(
      '[data-testid="intro-obstacles-slider-prev"]',
    ) as HTMLElement;
    expect(track.scrollLeft).toBe(0);
    await act(async () => {
      next.click();
    });
    const afterOne = track.scrollLeft;
    expect(afterOne).toBeGreaterThan(0);
    await act(async () => {
      next.click();
    });
    // A second press is a second card, not the same one twice.
    expect(track.scrollLeft).toBe(afterOne * 2);
    await act(async () => {
      prev.click();
    });
    expect(track.scrollLeft).toBe(afterOne);
  });

  test("neither arrow is ever drawn inert, at either end or in the middle", async () => {
    const host = await render();
    const track = host.querySelector<HTMLElement>(".intro-slider-track") as HTMLElement;
    const prev = host.querySelector<HTMLElement>(
      '[data-testid="intro-obstacles-slider-prev"]',
    ) as HTMLElement;
    const next = host.querySelector<HTMLElement>(
      '[data-testid="intro-obstacles-slider-next"]',
    ) as HTMLElement;
    // At the left end, which is where the old build drew Previous inert.
    expect(track.scrollLeft).toBe(0);
    for (const button of [prev, next]) {
      expect(button.getAttribute("aria-disabled")).toBeNull();
      expect(button.hasAttribute("disabled")).toBe(false);
      expect(button.getAttribute("aria-describedby")).toBeNull();
      expect(button.getAttribute("title")).toBeNull();
    }
    // And still not after the track has moved off it.
    await act(async () => {
      next.click();
    });
    expect(track.scrollLeft).toBeGreaterThan(0);
    for (const button of [prev, next]) {
      expect(button.getAttribute("aria-disabled")).toBeNull();
      expect(button.hasAttribute("disabled")).toBe(false);
    }
    // No sentence appeared under the track at either position.
    expect(host.querySelector(".inert-note")).toBeNull();
  });

  /* M34 round four. The position is now said twice: drawn for a sighted reader
   * and announced for a screen reader, because the native scrollbar that used
   * to be the only visual signal is hidden on both tracks. The two read the
   * same index, which is the property worth pinning. */
  /* M88: this read the moves' slider, which left the page with "How the parts
   * fit together". SliderCount is shared, so the same properties are read off
   * the nine. */
  test("the position is both drawn and announced, off one index", async () => {
    const host = await render();
    const line = host.querySelector<HTMLElement>(
      '[data-testid="intro-obstacles-slider-position"]',
    ) as HTMLElement;
    const drawn = host.querySelector<HTMLElement>(
      '[data-testid="intro-obstacles-slider-count"]',
    ) as HTMLElement;
    expect(line.getAttribute("aria-live")).toBe("polite");
    expect(line.className).toContain("visually-hidden");
    expect(line.textContent).toBe("1 of 9");
    // Drawn, and hidden from the screen reader that is already hearing it, or
    // it would be read twice on every twitch of the track.
    expect(drawn.getAttribute("aria-hidden")).toBe("true");
    expect(drawn.className).not.toContain("visually-hidden");
    expect(drawn.textContent).toBe("1 / 9");
    const next = host.querySelector<HTMLElement>(
      '[data-testid="intro-obstacles-slider-next"]',
    ) as HTMLElement;
    const track = host.querySelector<HTMLElement>(".intro-slider-track") as HTMLElement;
    await act(async () => {
      next.click();
      // What Chrome does once the smooth scroll lands. The press writes an
      // offset and reads nothing back, so this is the only thing that moves
      // the count, which is the whole of the round-four fix.
      track.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(line.textContent).toBe("2 of 9");
    expect(drawn.textContent).toBe("2 / 9");
    // No dots. A row of them would be a second control that controls nothing.
    expect(host.querySelectorAll(".intro-slider-dot")).toHaveLength(0);
  });

  test("every glyph on a rendered card is hidden from a screen reader", async () => {
    const host = await render();
    const glyphs = host.querySelectorAll("svg.front-icon");
    expect(glyphs).toHaveLength(9);
    for (const glyph of glyphs) {
      expect(glyph.getAttribute("aria-hidden")).toBe("true");
      expect(glyph.getAttribute("stroke")).toBe("currentColor");
    }
  });
});

/**
 * M34, round four: what the design critic sent back.
 *
 * Four items, and three of them are things a passing suite said nothing about.
 * The glyph redraws are judged by eye and can only be pinned negatively, so
 * what is asserted is that the two shapes the critic named are gone and the two
 * that replaced them are there. The other three are properties.
 */
describe("M34 round four: the two glyphs that did not read", () => {
  // M34 round five: third drawing. The ring of seats read as a camera aperture
  // and the staggered rules that replaced it read as a list, because a
  // horizontal rule reads as text at 24px whatever it stands for.
  test("the conversation is speech, not a ring and not a list of rules", () => {
    // Searched forward from the record entry, because the union type above it
    // lists every id and an unanchored indexOf would land there instead.
    const from = ICON_CODE.indexOf('"no-conversation": (');
    const glyph = ICON_CODE.slice(from, ICON_CODE.indexOf('"site-of-convenience": (', from));
    // Neither of the two shapes that failed.
    expect(glyph).not.toContain("<circle");
    expect(glyph).not.toContain('d="M3 6.5 h13"');
    expect(glyph).not.toContain('d="M8 12 h13"');
    // Two bubbles, one behind the other, and the front one has the tail that
    // makes it speech rather than a rounded box.
    expect((glyph.match(/<path/g) ?? [])).toHaveLength(2);
    expect(glyph).toContain("l3.5-3.5"); // the tail
    expect(glyph).toContain('d="M9 3.5 h9.5'); // the one behind
  });

  test("closing too soon is a shut box, not the undo hook", () => {
    // "It renders as a hook, which is the universal undo/return glyph. A reader
    // will take it as 'go back', the opposite of closing too soon."
    const from = ICON_CODE.indexOf('"early-closure": (');
    const glyph = ICON_CODE.slice(from, ICON_CODE.indexOf('"lost-provenance": (', from));
    expect(glyph).not.toContain("a5 5 0 0 1");
    // A lidded box, and the one thing that would not go into it.
    expect(glyph).toContain('<rect x="2.5" y="8.5"');
    expect(glyph).toContain('d="M2.5 12.5 h13"');
    expect(glyph).toContain("<circle");
  });

  // M34 round five: the critic passed four of the five and sent two back with
  // obstacle 2. The three that passed are still pinned here; the two that went
  // round again are pinned in the round-five block below.
  test("the weak ones the critic passed are still amended", () => {
    expect(ICON_CODE).toContain('d="M3 4 v16"'); // the funnel's breadth
    expect(ICON_CODE).not.toContain('d="M6 10.5 v3.5"'); // the podium's stems
    // And the table says what each of them is now, so the next critic reads a
    // line rather than a path string.
    for (const metaphor of [
      "two conversations running, no mark on which one is yours",
      "a lidded box, shut, with what would not go in beside it",
      "a bar's whole breadth funnelled to a single point",
    ]) {
      expect({ metaphor, named: ICONS.includes(metaphor) }).toEqual({ metaphor, named: true });
    }
  });
});

describe("M34 round four: where you are, drawn as well as announced", () => {
  /* M88: one slider now, since the moves' slider went with "How the parts fit
   * together". */
  test("the slider draws the count and keeps the live region", () => {
    // One component renders the pair, so the two sliders cannot end up saying
    // where you are in two different ways, which is the defect the two
    // different native scrollbars were.
    expect(INTRO).toContain('<p className="intro-slider-count" aria-hidden="true"');
    expect(INTRO.match(/<SliderCount/g)).toHaveLength(1);
    const rule = /\.intro-slider-count \{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(rule).toContain("font-size: var(--text-micro)");
    expect(rule).toContain("font-variant-numeric: tabular-nums");
    expect(rule).toContain("margin: 0 0 0 auto");
    expect(/\.intro-slider-foot \{([^}]*)\}/.exec(CSS)?.[1] ?? "").toContain("align-items: center");
  });

  test("the obstacles slider draws it too, and it moves", async () => {
    const host = await render();
    const drawn = host.querySelector<HTMLElement>(
      '[data-testid="intro-obstacles-slider-count"]',
    ) as HTMLElement;
    const line = host.querySelector<HTMLElement>(
      '[data-testid="intro-obstacles-slider-position"]',
    ) as HTMLElement;
    expect(drawn.textContent).toBe("1 / 9");
    expect(line.textContent).toBe("1 of 9");
    const track = host.querySelector<HTMLElement>(".intro-slider-track") as HTMLElement;
    const next = host.querySelector<HTMLElement>(
      '[data-testid="intro-obstacles-slider-next"]',
    ) as HTMLElement;
    await act(async () => {
      next.click();
      track.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    expect(drawn.textContent).toBe("2 / 9");
    expect(line.textContent).toBe("2 of 9");
  });

  test("neither track shows a native scrollbar", () => {
    // The critic measured one under the moves track and none under the
    // obstacles track, which is one page saying where you are two ways.
    for (const track of [".intro-slider-track"]) {
      const rule = new RegExp(`\\${track} \\{([^}]*)\\}`).exec(CSS)?.[1] ?? "";
      expect({ track, hidden: rule.includes("scrollbar-width: none") }).toEqual({
        track,
        hidden: true,
      });
      expect({ track, webkit: CSS.includes(`${track}::-webkit-scrollbar`) }).toEqual({
        track,
        webkit: true,
      });
    }
  });
});

describe("M34 round four: a write and a read are never the same act", () => {
  /** One writer's body, so the rule is checked where it can be broken. */
  function body(name: string): string {
    const at = INTRO_CODE.indexOf(`function ${name}(`);
    expect(at).toBeGreaterThan(0);
    const from = INTRO_CODE.slice(at);
    return from.slice(0, from.indexOf("\n  }") + 4);
  }

  test("no press reads a scroll offset back after writing one", () => {
    // The defect: `move()` assigned scrollLeft and read the position back on
    // the next line while the sheet was animating the scroll, so every press
    // wrote the pre-press index into state. Seven presses of Next announced
    // "1 of 9" seven times.
    // M88: `step` and `goTo` were the moves' slider's, and went with it.
    for (const writer of ["move"]) {
      const source = body(writer);
      expect({ writer, writes: /scroll(Left|Top) = /.test(source) }).toEqual({
        writer,
        writes: true,
      });
      expect({ writer, reads: source.includes("setWhere") }).toEqual({ writer, reads: false });
      expect({ writer, reads: source.includes("trackPosition") }).toEqual({
        writer,
        reads: false,
      });
    }
  });

  test("the only reader is the scroll listener, plus the first measurement", () => {
    // Three calls: two `onScroll` handlers and the two mount effects. Anything
    // else reading a position is a second source of truth about where the
    // track is, which is what went stale.
    // M88: one slider now, so one listener and one mount effect.
    const calls = INTRO_CODE.match(/setWhere\(/g) ?? [];
    expect(calls).toHaveLength(2);
    expect((INTRO_CODE.match(/onScroll=\{\(e\) => setWhere\(trackPosition\(/g) ?? []).length).toBe(1);
  });

  test("the sheet owns the motion, so reduced motion is honoured in one place", () => {
    // `scrollLeft = x` rather than `scrollTo({ behavior: "smooth" })`:
    // `scroll-behavior` animates a property assignment exactly as it animates
    // scrollTo, so there is no second place where a preference could be missed.
    expect(INTRO_CODE).not.toContain('behavior: "smooth"');
    for (const track of [".intro-slider-track"]) {
      const rule = new RegExp(`\\${track} \\{([^}]*)\\}`).exec(CSS)?.[1] ?? "";
      expect({ track, smooth: rule.includes("scroll-behavior: smooth") }).toEqual({
        track,
        smooth: true,
      });
    }
    expect(CSS).toContain("prefers-reduced-motion: reduce");
  });
});

/**
 * M34, round five: the last three the critic could not read.
 *
 * All three were on their third drawing, and all three had failed twice for the
 * same kind of reason: a shape that means something else at 24px, regardless of
 * what it was drawn to mean. What is asserted is the shape that failed being
 * absent and the shape that replaced it being there, because a glyph is judged
 * by eye and a test can only hold the record of what was decided.
 */
describe("M34 round five: nothing converges, nothing waves, nothing rules", () => {
  /** One glyph's own source, sliced between its record entry and the next. */
  function glyph(key: string, next: string): string {
    const from = ICON_CODE.indexOf(key);
    expect(from).toBeGreaterThan(0);
    const to = ICON_CODE.indexOf(next, from);
    expect(to).toBeGreaterThan(from);
    return ICON_CODE.slice(from, to);
  }

  /* M88: the export glyph was a move's, and went with "How the parts fit
   * together". */
  test("process is stages in a row, with no line that rises or falls", () => {
    // "Step 03 is still a generic chart zigzag, now in a box." A line that
    // rises and falls is a chart at this size whatever is drawn around it, so
    // bracketing it made it a chart in a box.
    const g = glyph("  process: (", "  outcome: (");
    expect(g).not.toContain("C"); // no curve, so no wave
    expect(g).not.toContain('d="M7 4 H3.5 v16 H7"'); // nor the brackets round it
    // Three identical stages, two joins.
    expect((g.match(/<rect/g) ?? [])).toHaveLength(3);
    expect((g.match(/width="5\.5" height="6"/g) ?? [])).toHaveLength(3);
    expect((g.match(/<path/g) ?? [])).toHaveLength(2);
    // Level, because the process runs rather than grows: every stage sits on
    // one y, which is what stops it reading as a rising bar chart.
    expect((g.match(/y="9"/g) ?? [])).toHaveLength(3);
  });

  test("the table names all three afresh, so the next reader gets a line", () => {
    for (const metaphor of [
      "two conversations running, no mark on which one is yours",
      "three stages linked in a row, one run of the process",
    ]) {
      expect({ metaphor, named: ICONS.includes(metaphor) }).toEqual({ metaphor, named: true });
    }
    // And the wording each of them replaced is gone, so the table cannot
    // describe a drawing that is no longer there.
    for (const stale of [
      "an exchange in turns, with your line not yet written",
      "one closed record, three straight lines out of one gap",
      "a course running inside an opening and closing bracket",
    ]) {
      expect({ stale, present: ICONS.includes(stale) }).toEqual({ stale, present: false });
    }
  });

  test("the set is seventeen (M88), still hidden, still achromatic", () => {
    // The redraw touched three of twenty-three and must not have cost the
    // properties the whole set is held to. M58 added the puzzle step's glyph;
    // M88 took the seven moves' glyphs off with their section.
    expect((ICON_CODE.match(/<Glyph>/g) ?? [])).toHaveLength(17);
    expect(ICON_CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(ICON_CODE.match(/fill="(?!none|currentColor)/g)).toBeNull();
    expect(ICON_CODE).not.toContain("strokeDasharray");
    expect(ICON_CODE).not.toMatch(/https?:\/\//);
  });
});
