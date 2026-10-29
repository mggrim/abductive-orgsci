/**
 * The spine (ISC-80 … ISC-85).
 *
 * Every station present and reachable, always, with one exception the owner
 * made. There is no `disabled` in this file: the moment a station greys out
 * pending another, the tool has become the staged wizard v2 was forked to
 * escape, and ISC-82 is an anti-criterion for exactly that regression.
 *
 * M58 (Matthew, 2026-09-27: "sample and early data are two external pieces
 * that are greyed out until the other bits are filled in"; the lead's ruling of
 * the same day) supersedes ISC-81 and ISC-82 for Sample and Early data only.
 * Those two cells are visible, labelled and inert until you have answered each
 * of the six loop steps (M69, ISC-641), and say so in a sentence under the cell
 * rather than in a tooltip. The rule lives in `flow/loopGate.ts`; this file
 * only draws the set it is handed, and every other cell stays open.
 *
 * What the rail adds over the old flat workbench is not capability but
 * orientation — where you are in the arc of designing a study, what you have
 * committed to, and where the tool currently has a question. That is the whole
 * job. Every station's *content* remains one click away regardless of state.
 *
 * M38 finished the job on both halves of that sentence.
 *
 * The framing is the eighth cell. Seven of the eight places that hold a
 * conversation were on the rail and the framing was not, so the interface
 * research named it the thread most likely to be abandoned: the one you cannot
 * see is the one you do not go back to. It sits above the loop, because it is
 * what the loop is about, and it is a link rather than a focus call, because it
 * is a band on the page rather than a station in the workspace.
 *
 * And every cell carries a line saying what its conversation produced, out of
 * `views/placeSummary.ts`. The rail said whether you had answered and nothing
 * about what happened at the step: not how much was said, not that a draft was
 * sitting unsaved, not that a claim was waiting on you. The line is the
 * researcher's own first words plus counts and states, never prose about what
 * they meant, and `STATE_TITLE`'s own comment below is the bar every word here
 * has to pass.
 */

import { useEffect, useMemo, useState } from "react";
import { type Station, type StationId } from "./stations.ts";
import { FRAMEWORK_NAME, StationLoop } from "./StationLoop.tsx";

/** M83, ISC-698: the caption over the Design rail's figure. */
export const FRAMEWORK_CAPTION = `The ${FRAMEWORK_NAME}`;
import type { StationState } from "./stationBrief.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { getProject, type ProjectBrief } from "../state/projects.ts";
import { emptyBrief } from "../state/projects.ts";
import {
  placeSummaries,
  type PlaceId,
  type PlaceSummary,
} from "../views/placeSummary.ts";
import { placeStateLine } from "../ui/placeLines.ts";
import { useRoute } from "../ui/routes.ts";
import { gateSentence } from "./loopGate.ts";
import { InertNote, inertAttrs } from "../ui/components/index.ts";

const STATE_TITLE: Readonly<Record<StationState, string>> = {
  // "nothing said yet" rather than "incomplete". An empty step is the honest
  // state of most of a design most of the time, and a rail that reads as a
  // checklist is a rail that gets cleared rather than answered.
  empty: "Not started",
  stated: "Answered",
  /* M89 (2026-10-14): "Open question or flag" from D53 until the flags left
   * main with the checks; the mark now means one fact. */
  flagged: "Open question",
};

/**
 * The sentence for one cell (D53, M43d). The mark covered an open question or
 * an open flag until M89 took the flags out with the checks, so the cell's
 * sentence and the legend's now agree.
 */
export function cellTitle(state: StationState, _summary?: PlaceSummary): string {
  return STATE_TITLE[state];
}

/**
 * The mark, and it is a shape before it is a colour.
 *
 * It was a 7px pill and hue was the entire channel. Measured on the fixture at
 * innerWidth 1440, five of the eight dots were rgb(164, 69, 43), which is
 * --warn, which tokens.css reserves in its own words for "the red of a thing
 * that destroys" and which the Delete control on /studies wears. So the tool
 * painted five eighths of its own progress indicator in the destroy hue to say
 * it had a question, on a product whose rule is that nothing gates and findings
 * are observations and never actions.
 *
 * The other half of it was worse for being quieter. The four states sat at L*
 * 41.5, 41.7, 40.2 and one light grey: a 1.5 L* spread end to end, 0.24 between
 * "you have said something here" and "the tool has a question about this". A
 * photocopy, a greyscale print or a deuteranope's eye collapsed three of the
 * four states of the primary progress indicator into one identical grey dot.
 * The token file already forbids exactly this on the bias grid, where trigger
 * kind is carried by glyph shape "because the page gets printed and checked on
 * paper", and the rail was the surface the rule was never applied to.
 *
 * Four glyphs, then, in the same vocabulary the bias grid uses, and a legend
 * under the rail because a mark nobody has defined is decoration. Colour agrees
 * with the shape and carries nothing on its own.
 *
 * M38 adds no glyph and no channel. The line under the label is the one
 * addition, it is text, and it is the same ink and the same size as the state
 * it sits under.
 */
const STATE_MARK: Readonly<Record<StationState, string>> = {
  empty: "·",
  stated: "●",
  flagged: "?",
};

/** The order the legend reads in: nothing, said, asked about. The set-aside state went at M69 (ISC-641). */
const STATE_ORDER: readonly StationState[] = ["empty", "stated", "flagged"];

/**
 * The state a cell draws, once the projection has a say (M38, ISC-493).
 *
 * "?" is documented above as "the tool has an open question about this step", and
 * until now the only thing that could raise it was an open lint finding mapped
 * to the step. The study's one outstanding question raised nothing anywhere on
 * the rail, which is the orientation gap the whole milestone is about. So the
 * two are unioned here, off the projection every other indicator reads, rather
 * than off a second computation in a component.
 *
 * M89 (2026-10-14): the open lint finding at a step was the other half of a
 * union here until the checks left main. The open interview question, read off
 * `openQuestion` on the row `placeSummaries` returns, is the one source now.
 */
export function cellState(state: StationState, summary: PlaceSummary | undefined): StationState {
  return summary?.openQuestion === true ? "flagged" : state;
}

/**
 * Where the rail gets the study it is drawing.
 *
 * The component above hands it a focused station id and a map of states, both
 * of which are about the study and neither of which names it. Eight place
 * summaries need the study, so the rail reads the route, the same way the
 * keyboard layer does and for the same reason: it is the one fact about where
 * you are that nothing has passed down.
 */
function useStudyPlaces(): {
  readonly projectId: string | undefined;
  readonly summaries: ReadonlyMap<PlaceId, PlaceSummary>;
} {
  const route = useRoute();
  const projectId = route.view === "study" ? route.projectId : undefined;
  const { events } = useLedger();
  const [brief, setBrief] = useState<ProjectBrief | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (projectId === undefined) {
      setBrief(undefined);
      return;
    }
    void getProject(projectId).then((p) => {
      if (!cancelled) setBrief(p?.brief);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, events.length]);

  const summaries = useMemo(() => {
    const out = new Map<PlaceId, PlaceSummary>();
    if (projectId === undefined) return out;
    /* The brief decides one field of a summary, `answer`, and the rail draws
       its own answer state from `states` above. So a rail rendered before the
       study has loaded shows its counts rather than nothing at all. */
    for (const summary of placeSummaries({ events, projectId, brief: brief ?? emptyBrief() })) {
      out.set(summary.place, summary);
    }
    return out;
  }, [events, projectId, brief]);

  return { projectId, summaries };
}

export function StationRail(props: {
  focused: StationId;
  states: ReadonlyMap<StationId, StationState>;
  onFocus: (id: StationId) => void;
  /** The steps closed right now (M58): Sample and Early data until the loops settle. */
  gated?: ReadonlySet<StationId>;
}) {
  const { focused, states, onFocus, gated } = props;
  const { projectId, summaries } = useStudyPlaces();

  /* The line under a cell's label: the researcher's own first words at this
   * place, and what the conversation there produced, as counts and states.
   * Nothing at all where nothing has happened, which is what stops eight cells
   * reading as eight boxes to tick. */
  const line = (place: PlaceId) => {
    const summary = summaries.get(place);
    if (summary === undefined) return null;
    const state = placeStateLine(summary);
    if (summary.title === null && state === "") return null;
    return (
      <span className="rail-line" data-testid={`rail-line-${place}`}>
        {summary.title !== null && <span className="rail-said">{summary.title}</span>}
        {state !== "" && <span className="rail-state">{state}</span>}
      </span>
    );
  };

  /* The cell, which is the half of the rail that is this surface's own. It
   * carries the station's state, a title naming that state and a mark for it;
   * the front page's cell carries a glyph and no state at all, because there is
   * no study on the front page to have one. The list item around it and which
   * list it lands in are StationLoop's (M34, round three). */
  const cell = (station: Station) => {
    const state = cellState(states.get(station.id) ?? "empty", summaries.get(station.id));
    const current = station.id === focused;
    /* A closed step (M58): the label, the sentence saying what opens it, and a
     * press that goes nowhere. `inertAttrs` carries the sentence on hover and
     * ties the button to the note under it. */
    /* M84, ISC-705 (the lead's ruling on question 2): the gate is said once, in
     * Design's Help. The note under the cell, its tooltip and its list of the
     * steps still without an answer went; the cell stays greyed and inert, and a
     * screen reader hears the rule's first sentence from inside the control. */
    if (gated?.has(station.id) === true) {
      const control = `rail-item-${station.id}`;
      return (
        <>
          <button
            type="button"
            className="rail-item"
            data-station={station.id}
            data-gated="true"
            data-testid={control}
            {...inertAttrs(control, gateSentence(station.id), { tooltip: false })}
          >
            <span className="rail-label">{station.label}</span>
          </button>
          <InertNote control={control} reason={gateSentence(station.id)} visuallyHidden />
        </>
      );
    }
    return (
      <button
        type="button"
        className="rail-item"
        data-station={station.id}
        data-state={state}
        data-current={current ? "true" : "false"}
        aria-current={current ? "step" : undefined}
        title={`${station.label}: ${cellTitle(state, summaries.get(station.id))}`}
        onClick={() => onFocus(station.id)}
      >
        <span className="rail-label">{station.label}</span>
        <span className={`rail-dot ${state}`} aria-hidden="true">
          {STATE_MARK[state]}
        </span>
        <span className="visually-hidden">{cellTitle(state, summaries.get(station.id))}</span>
        {line(station.id)}
      </button>
    );
  };

  return (
    <nav className="rail" aria-label="Steps" data-testid="station-rail">
      {/* M58, ISC-566: Starting point has no cell on Design. The eighth cell that
          stood here from M38 to M57 linked to the Starting point tab; the tab is
          first in the strip, and Design now shows only the steps. */}

      {/*
       * A ring, not a queue. The numbers came off at M21: the rail printed
       * "1 Context, 2 Site selection, 3 Process of interest, 4 Outcome of
       * interest" directly above a sentence saying the order was not a
       * sequence you have to follow. One of the two was lying, and it was not
       * the sentence.
       *
       * The hub in the middle of the ring is gone (D2). It named the
       * literature and the venue, in the same visual vocabulary as the four
       * buttons around it, at the geometric centre of them, and it was both
       * unclickable and `aria-hidden`. Both things it named are real and
       * editable, and the one element on screen that named them was the one
       * element that could not reach them. They are the first and last fields
       * of the Framing band above this rail now.
       *
       * M34, round three: the two figures, the two lists and the two sentences
       * beside them moved into StationLoop, because the front page draws the
       * same seven in the same arrangement and two copies of a geometry are
       * two geometries. What stayed here is the cell above and the legend
       * below, both of which are about a study's state and neither of which
       * the front page has.
       */}
      {/* Resolved at the merge, M34 round three against main's ProseCodex batch.
       * Main rewrote the two sentences beside the rings; this side had moved
       * both of them into StationLoop so the front page draws the same seven
       * with the same words. Both sides are kept: main's wording, in the shared
       * module, which is the only place either surface reads it from. */}
      {/* M62, ISC-600: the loops' sentence lives in Design's Help; the walkthrough keeps its own. */}
      <StationLoop cell={cell} testIdPrefix="rail" note={false} caption={FRAMEWORK_CAPTION} />

      {/* The rail carried four marks and there was no legend for them anywhere
          in the app. A reader could hover a station and get the sentence, which
          is one station at a time and nothing at all on a printout. */}
      <ul className="rail-legend" data-testid="rail-legend">
        {STATE_ORDER.map((state) => (
          <li key={state}>
            <span className={`rail-dot ${state}`} aria-hidden="true">
              {STATE_MARK[state]}
            </span>
            {STATE_TITLE[state]}
          </li>
        ))}
      </ul>
    </nav>
  );
}
