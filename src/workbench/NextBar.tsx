/**
 * One sentence and one link, at the foot of the Design page (D4).
 *
 * The flow critic's finding was that a first-time user cannot say what to do
 * first or next. The standing bar at the top of this view says what is
 * outstanding, which is a different question and a harder one to act on: it
 * reported three things about three tabs before the researcher had done
 * anything, and none of them was a place to go. Two of its three lines named a
 * tab in prose with nothing to click.
 *
 * So the naming of tabs moves here and OutstandingBar stops doing it. This bar
 * answers exactly one question, always, on every station: what now. One
 * sentence, one control, chosen by the priority below and never more than one
 * at a time, because a bar that offers three next steps is a bar that has not
 * decided either.
 *
 * `nextStep` is a pure function over the state the view already computes, so
 * the priority is a thing a test can read rather than a ternary buried in the
 * markup. That matters more here than usual: the order of these four rules is
 * the whole product claim of the bar, and the order is the part that will get
 * quietly edited.
 */

import { STATIONS, stationById, type StationId } from "../flow/stations.ts";
import type { StationState } from "../flow/stationBrief.ts";
import type { ProjectBrief } from "../state/projects.ts";
import {
  FRAMING_FIELD_ID,
  firstEmptyFraming,
  type FramingField,
} from "../flow/FramingBand.tsx";
import { motivationPath, navigate, studyPath, type StudyTab } from "../ui/routes.ts";

/**
 * Where the bar's one control goes.
 *
 * `focus` used to be the odd one, and the reason this was a union rather than a
 * bare href: the framing was a fold at the foot of the page the researcher was
 * already on, so there was no route to change and the control asked the dock to
 * open and take the caret. The motivation is a tab as of M53, so `focus` names a
 * field on another route and `nextStepHref` has an href for it like the other two.
 * The union stays because the three kinds still say different things about where
 * the move is, and because `rule` and `action` are what the priority tests assert.
 */
export type NextStepAction =
  | { readonly kind: "station"; readonly station: StationId }
  | { readonly kind: "tab"; readonly tab: StudyTab }
  | { readonly kind: "focus"; readonly field: string };

export interface NextStep {
  /** Which rule fired. Named so a test asserts the priority, not the prose. */
  readonly rule: "drafts" | "framing" | "station" | "settled";
  readonly sentence: string;
  readonly label: string;
  readonly action: NextStepAction;
  /**
   * Whether this bar's control carries the page's primary weight (R4 item 1).
   *
   * The flow critic's F2 failure was not that the page had two primaries, which
   * round 3 fixed. It was that the page named a next move and then gave the
   * weight to a different control: on an empty study both bars said to start at
   * the framing, and the only filled button on the screen was the step's save,
   * attached to a question nobody had been asked to answer yet.
   *
   * So the weight follows the sentence. When the move is somewhere else on this
   * page or on another tab, this bar's control is the thing to press and it is
   * drawn as one. When the move is the step the researcher is standing in, the
   * step's own save is the primary and this bar stays a link, because two filled
   * buttons pointing at the same act is the failure round 3 removed.
   *
   * Nothing is gated and nothing is hidden by this. It is weight only.
   */
  readonly primary: boolean;
}

export interface NextStepInput {
  /** The station being worked. */
  readonly station: StationId;
  /** Pages drafted from answers and waiting on a decision. */
  readonly pendingDrafts: number;
  readonly brief: ProjectBrief;
  /** The rail's own reading, so this bar and the rail cannot disagree. */
  readonly states: ReadonlyMap<StationId, StationState>;
}

/** How many stations the researcher has actually said something at. */
export function answeredCount(states: ReadonlyMap<StationId, StationState>): number {
  let n = 0;
  for (const station of STATIONS) {
    const state = states.get(station.id);
    if (state === "stated") n += 1;
  }
  return n;
}

/** The first station in rail order with nothing said at it. */
export function firstUnanswered(states: ReadonlyMap<StationId, StationState>): StationId | undefined {
  /* M89 (2026-10-14): a flag open on a step used to mark it "flagged" whether
   * or not it had an answer (M74b, ISC-664). The flags left main with the
   * checks, so a step is empty or stated here. */
  for (const station of STATIONS) {
    if ((states.get(station.id) ?? "empty") === "empty") return station.id;
  }
  return undefined;
}

/**
 * What the bar asks for, per framing field.
 *
 * One sentence each, in the words the field's own label uses, so the researcher
 * reads the same question in the bar and beside the caret it puts them at.
 */
export const FRAMING_ASK: Readonly<Record<FramingField, string>> = {
  /* M62, ISC-602 (the lead's ruling, 2026-09-30): the question's own words, as
   * L13 allows them in a statement. */
  startingInterest: "Name the interest that draws you to this research inquiry.",
  // ISC-588 (lead's ruling, option a): the one sentence the bar says for this field.
  seminalCorpus: "Name the bodies of work you expect to draw on.",
  targetVenue: "Name the journal that you're aiming at.",
};

/**
 * What now, in priority order.
 *
 * The order is an argument about what blocks what. A question already on the
 * table blocks everything, because the orchestrator will refuse to select
 * another one and every other suggestion would fail on click. A draft waiting
 * on a decision comes next, because it is the researcher's own answer coming
 * back and it is the one thing that goes stale. Framing before stations,
 * because every step is answered against it.
 *
 * M89 (2026-10-14): "Run checks" stood between the framing and the next
 * station until the checks left main, on the owner's instruction.
 */
export function nextStep(input: NextStepInput): NextStep {
  const { station, pendingDrafts, brief, states } = input;

  /* M84, ISC-706. The first rule was "You have an open question at X." with Go
   * to question. A co-author (2026-10-07): "people should be able to jump
   * between different 'boxes' in the framework without Abductive wanting the
   * user to jump back and answer a specific question." So an open question at
   * another step is no longer the next move: it stays open in its own step and
   * in History, and writing here sets it aside on the record. */

  if (pendingDrafts > 0) {
    const one = pendingDrafts === 1;
    return {
      rule: "drafts",
      /* M29b. It said "the tool drafted from your answers" over a queue where
       * five of seven were drafted from the papers and labelled so two lines
       * below. Provenance is the promise the product is built on, so the
       * sentence that cannot know says the count and stops. */
      sentence: `You have ${pendingDrafts} suggestion${one ? "" : "s"} to review.`,
      label: one ? "Review suggestion" : "Review suggestions",
      action: { kind: "tab", tab: "ontology" },
      primary: true,
    };
  }

  const emptyFraming = firstEmptyFraming(brief);
  if (emptyFraming !== undefined) {
    /* R4 item 7. It said "Start with what is puzzling you" and focused the
     * second field, which asks what you expected and what you found instead.
     * Field one asks what you are thinking about exploring, and it is the one
     * most people can answer on the day they open the tool: the band puts it
     * first for exactly that reason. The sentence and the caret now name the
     * same field.
     *
     * Team-lead walk: they named the same field, and it was always field one.
     * A researcher who had answered field one read a bar telling them to answer
     * field one, and the caret landed in text they had already written. The
     * move now finds the first of the three with nothing in it, and the sentence
     * asks for that one.
     *
     * Three since M40: the puzzle left the band, so the bar can no longer send
     * anyone to fill it in. `FRAMING_FIELDS` is the list `firstEmptyFraming` reads,
     * so a field that leaves the band leaves the bar in the same commit. */
    return {
      rule: "framing",
      /* M28 r6: copy. Two colons in one sentence once the standing bar
       * prefixes it with "Waiting on you:", and this bar sits beside an "Open
       * Framing" button that already says where to go. */
      sentence: FRAMING_ASK[emptyFraming],
      label: "Open starting point",
      action: { kind: "focus", field: FRAMING_FIELD_ID[emptyFraming] },
      primary: true,
    };
  }

  const next = firstUnanswered(states);
  if (next !== undefined) {
    const label = stationById(next).label;
    return {
      rule: "station",
      /* M78b, ISC-681: the bar prefixes "Next for you:", and the walk of
         2026-10-03 read "Next for you: Next step: Context." */
      sentence: `the ${label} step.`,
      label: `Open ${label}`,
      action: { kind: "station", station: next },
      /* The move is the step the researcher is already standing in, so the
       * step's own save carries the weight and this bar is a link to the next
       * one. Two filled buttons for one act is what round 3 removed. */
      primary: next !== station,
    };
  }

  /* Every station answered, nothing waiting. The bar is persistent, so it
     still has to say something true, and the true thing at that point is that
     the design is ready to leave the tool. */
  return {
    rule: "settled",
    sentence: "You have answered every step.",
    label: "Open Export",
    action: { kind: "tab", tab: "exports" },
    primary: true,
  };
}

/** The href an action navigates to. Every move is a place since M53. */
export function nextStepHref(projectId: string, action: NextStepAction): string {
  if (action.kind === "station") return studyPath(projectId, "design", action.station);
  if (action.kind === "tab") return studyPath(projectId, action.tab);
  /* The field rides in the hash, and the page that arrives marks it and takes the
   * caret. See `motivationFieldRequested` in routes.ts for why it cannot be an
   * event any more. */
  return motivationPath(projectId, action.field);
}

/**
 * The step is passed in rather than computed here (R3 item 2).
 *
 * `Workbench` calls `nextStep` once and hands the result to this bar and to the
 * standing bar in the header, which is what makes it structurally impossible
 * for the two ends of one page to name different moves. They did, on the
 * shipped screen: the header said a question was waiting below while this bar
 * sent the reader to another tab.
 */
export function NextBar(props: { projectId: string; step: NextStep }) {
  const { projectId, step } = props;
  const href = nextStepHref(projectId, step.action);

  return (
    <aside className="nextbar" data-testid="next-bar" data-rule={step.rule}>
      {/* M32b, fix 1. The sentence and the control are siblings in a flex row
          rather than the control being a word inside the sentence.
          
          What that was costing, measured live at 1449: an anchor is an inline
          box and it fragments across lines like the words around it, which is
          exactly why the inline controls in this app are anchors. Once it wore
          `btn btn-primary` it fragmented *with its own background*, so "Open
          your exports" broke after "your" and the second half rendered as a
          separate dark slab underneath the sentence, overlapping it. The longer
          sentences the other states carry make it likelier, not less.
          
          A flex row fixes the class of defect rather than this instance: the
          sentence takes whatever width is left and wraps inside itself, and the
          control is `flex: none; white-space: nowrap` at the end, so no
          sentence length can break a button box again. The strings, their order
          and the bar's position in the flow are unchanged (R11). */}
      {/* In the standing header since 2026-09-12, not at the foot. The owner:
          the framing fold "should replace the 'Every step has an answer and
          checks have run' bar". So the foot is the framing's and this bar is
          the header's first line, where the same sentence was already printed
          as "Waiting on you: …" (R3 item 2); the prefix is kept and the control
          comes with it, which is the half the header never had. */}
      <p className="nextbar-line" data-testid="waiting-on">
        <strong>Next for you:</strong>{" "}
        <span data-testid="next-sentence">{step.sentence}</span>
      </p>
      {/* An anchor with the primary treatment when it carries the move, so it is
          still a link a reader can middle-click and still the thing on the page
          that looks pressable (R4 item 1).

          One branch since M53, and the branch that went was the framing's. This
          bar rendered a `<button>` for the one action that did not navigate, with a
          comment explaining that a hash href would parse as an unknown path; the
          motivation is a tab now, so its field is a real route and the exception
          has nothing left in it. */}
      <a
        /* M32, R7. `btn btn-primary`: the box comes from `.btn` and the fill from
           `.btn-primary`, and this anchor was taking only the second. See
           ArgumentBand for the same one-word fix. */
        className={`nextbar-action ${step.primary ? "btn btn-primary" : ""}`}
        href={href}
        data-testid="next-action"
        onClick={() => {
          navigate(href);
        }}
      >
        {step.label}
      </a>
    </aside>
  );
}
