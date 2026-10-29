/**
 * Interview orchestration (ISC-43, ISC-45, ISC-47, ISC-48, ISC-50, ISC-52, ISC-58).
 *
 * The one stateful module in the interview layer, and it holds only in-flight
 * promises. Every fact about the interview is read back from the ledger.
 *
 * On idempotency: v1 shipped a check-then-act race that fired every
 * design-brief matrix cell twice, because two callers each read a pre-append
 * React snapshot, each concluded the cell had not fired, and each fired it.
 * Component-local `busy` flags could not fix it — the callers were different
 * components. The fix, repeated here, is a single choke point with an
 * in-flight map plus a read-through to the persisted ledger rather than the
 * render snapshot. Every check-then-act path below goes through it.
 */

import type {
  LedgerEvent,
  QuestionSelectionEvent,
  RedirectionEvent,
  RefusalEvent,
  DontKnowEvent,
  AskDifferentlyEvent,
  ResponseEvent,
} from "../ledger/events.ts";
import { projectInterview } from "./state.ts";
import { checkSaturation, saturationEvent, type SaturationOptions } from "./saturation.ts";
import { divergenceErrors } from "./moves.ts";
import { countOf } from "../ui/format.ts";
import type { InterviewState, NextMove, TurnMode } from "./types.ts";
import { providerField, type Provider } from "../inference/types.ts";

export interface LedgerAccess {
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<void>;
  /** Fresh read-through to the store. Never a render snapshot. */
  readonly readEvents: (projectId?: string) => Promise<readonly LedgerEvent[]>;
  /** Injected so tests are deterministic and the module owns no clock. */
  readonly now?: () => number;
  readonly newId?: () => string;
}

export type SelectOutcome =
  | { readonly kind: "asked"; readonly event: QuestionSelectionEvent; readonly state: InterviewState }
  | { readonly kind: "blocked-outstanding"; readonly state: InterviewState }
  | { readonly kind: "rejected"; readonly errors: readonly string[] };

export interface SelectMoveInput {
  readonly projectId: string;
  /** The full offered set. All of it is logged; one of it is taken. */
  readonly moves: readonly NextMove[];
  /** Id of the move the researcher chose. */
  readonly chosenId: string;
  readonly saturation?: SaturationOptions;
  /**
   * The station they were standing on. Recorded on the turn so the design view
   * can show the conversation belonging to one station. See
   * `QuestionSelectionEvent.station`.
   */
  readonly station?: string;
}

const selectionsInFlight = new Map<string, Promise<SelectOutcome>>();

/**
 * Log a question selection and put the question on the table.
 *
 * Keyed on the project alone, because "exactly one outstanding question"
 * (ISC-43) means concurrent selections within a project are never both
 * correct — the second must see the first's event, not race past it.
 */
export async function selectMove(
  input: SelectMoveInput,
  ledger: LedgerAccess,
): Promise<SelectOutcome> {
  const existing = selectionsInFlight.get(input.projectId);
  if (existing !== undefined) return existing;
  const run = selectMoveOnce(input, ledger).finally(() => {
    selectionsInFlight.delete(input.projectId);
  });
  selectionsInFlight.set(input.projectId, run);
  return run;
}

async function selectMoveOnce(
  input: SelectMoveInput,
  ledger: LedgerAccess,
): Promise<SelectOutcome> {
  const { projectId, moves, chosenId } = input;
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());

  const divergence = divergenceErrors(moves);
  if (divergence.length > 0) return { kind: "rejected", errors: divergence };

  const chosen = moves.find((m) => m.id === chosenId);
  if (chosen === undefined) {
    return { kind: "rejected", errors: [`chosen move '${chosenId}' is not in the offered set`] };
  }

  const events = await ledger.readEvents(projectId);
  const state = projectInterview(events, projectId);
  if (state.outstanding !== null) return { kind: "blocked-outstanding", state };

  // Saturation is advisory. It never gates the selection; continuing past it
  // is simply recorded, so that continuing was a decision (ISC-52).
  const reading = checkSaturation(events, projectId, input.saturation);
  const toAppend: LedgerEvent[] = [];
  if (reading.windowComplete) {
    toAppend.push(saturationEvent(reading, { id: newId(), ts: now(), projectId }));
  }

  const reason = reading.reached
    ? `${chosen.rationale} [asked past saturation: ${countOf(reading.mutationsInWindow, "change to your ontology")} in the last ${reading.windowTurns} turns]`
    : chosen.rationale;

  const event: QuestionSelectionEvent = {
    id: newId(),
    ts: now(),
    actor: "system",
    projectId,
    type: "question-selection",
    moveId: chosen.id,
    topic: chosen.topic,
    question: chosen.question,
    alternatives: moves.filter((m) => m.id !== chosenId).map((m) => m.id),
    mode: chosen.mode,
    ...(chosen.matrixCell === undefined ? {} : { matrixCell: chosen.matrixCell }),
    ...(input.station === undefined ? {} : { station: input.station }),
    reason,
  };
  toAppend.push(event);

  await ledger.appendAll(toAppend);
  return {
    kind: "asked",
    event,
    state: projectInterview([...events, ...toAppend], projectId),
  };
}

// ---------------------------------------------------------------------------
// The conversation (M37, ISC-483 … ISC-486)
// ---------------------------------------------------------------------------

/**
 * Why a conversation turn does not go through `selectMove`.
 *
 * `selectMove` records a choice made out of an offered set: it validates the
 * set's divergence, logs the alternatives that were passed over, and takes the
 * question text from the deterministic move. A conversation has no set. The
 * model reads the exchange and asks the one question that follows from it, so
 * there are no alternatives to log and no move to validate.
 *
 * What does not change is the choke point. One outstanding question at a time
 * (ISC-43) and a reason on every selection (ISC-45) are properties of the
 * ledger rather than of a code path, so a conversation turn is written here,
 * behind the same in-flight map and the same read-through, and is refused when
 * a question is already open somewhere.
 */
export interface ConversationTurnInput {
  readonly projectId: string;
  /** Station id, or "framing". */
  readonly place: string;
  readonly topic: string;
  /** The question the model asked. Empty means it asked none. */
  readonly question: string;
  /** Why it asked, for the record. */
  readonly because: string;
  /** What the researcher sees, with the marked lines already taken out. */
  readonly shown: string;
  readonly mode: TurnMode;
  readonly model: string;
  readonly modelVersion: string;
  /** The bridge's lane that wrote the turn (M56, ISC-575); absent when there was none. */
  readonly provider?: Provider;
  /** M60: the local server, beside provider "local". */
  readonly server?: string;
  /** Phrases in `shown` that supply an answer. Recorded, never blocking. */
  readonly answerLeaks?: readonly string[];
  /** Provenance from the voice gate, spread onto the delivered turn. */
  readonly provenance?: Readonly<Record<string, unknown>>;
  /**
   * The question this turn is answering, when it is answering one.
   *
   * One outstanding question at a time still holds, and this is the single
   * exception the rule always had: a turn that closes the open question cannot
   * be blocked by it.
   */
  readonly answering?: string;
  /** Refuse when this place already holds a conversation. The opener sets it. */
  readonly onlyIfPlaceEmpty?: boolean;
  /** The researcher stopped this turn part way (M58); the text is what they saw. */
  readonly cutShort?: true;
  /**
   * An opener whose question is the bubble's (M74b, ISC-664): the selection is
   * marked, so the thread shows the question once, in the bubble.
   */
  readonly opener?: true;
  /** The challenge event this turn's question puts, when it puts one (M78b, ISC-682). */
  readonly fromChallenge?: string;
}

export type ConversationOutcome =
  | {
      readonly kind: "recorded";
      /** Absent when the turn asked nothing, which opens no question. */
      readonly selection?: QuestionSelectionEvent;
      readonly delivered: ResponseEvent;
      readonly state: InterviewState;
    }
  | { readonly kind: "blocked-outstanding"; readonly state: InterviewState; readonly at?: string }
  | { readonly kind: "already-open" };

const conversationsInFlight = new Map<string, Promise<ConversationOutcome>>();

/** True when anything has been said at this place. */
export function placeHasConversation(
  events: readonly LedgerEvent[],
  projectId: string,
  place: string,
): boolean {
  return events.some(
    (e) =>
      e.projectId === projectId &&
      ((e.type === "question-selection" && e.station === place) ||
        (e.type === "response" && e.station === place)),
  );
}

/** How many turns the conversation at this place has already taken. */
export function conversationTurnCount(
  events: readonly LedgerEvent[],
  projectId: string,
  place: string,
): number {
  return events.filter(
    (e) =>
      e.projectId === projectId &&
      e.type === "question-selection" &&
      e.station === place &&
      e.moveId.startsWith("conversation:"),
  ).length;
}

/**
 * Put one turn of the conversation on the record.
 *
 * Keyed on the project rather than the place, for the reason `selectMove` is:
 * two turns at two places are never both correct while the rule is one open
 * question, and the second has to see the first's event rather than race past
 * it.
 */
export async function recordConversationTurn(
  input: ConversationTurnInput,
  ledger: LedgerAccess,
): Promise<ConversationOutcome> {
  const existing = conversationsInFlight.get(input.projectId);
  if (existing !== undefined) return existing;
  const run = recordConversationTurnOnce(input, ledger).finally(() => {
    conversationsInFlight.delete(input.projectId);
  });
  conversationsInFlight.set(input.projectId, run);
  return run;
}

async function recordConversationTurnOnce(
  input: ConversationTurnInput,
  ledger: LedgerAccess,
): Promise<ConversationOutcome> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());
  const events = await ledger.readEvents(input.projectId);

  if (input.onlyIfPlaceEmpty === true && placeHasConversation(events, input.projectId, input.place)) {
    return { kind: "already-open" };
  }

  const state = projectInterview(events, input.projectId);
  if (state.outstanding !== null && state.outstanding.eventId !== input.answering) {
    const asked = events.find((e) => e.id === state.outstanding?.eventId);
    const at = asked?.type === "question-selection" ? asked.station : undefined;
    return { kind: "blocked-outstanding", state, ...(at === undefined ? {} : { at }) };
  }

  const provenance = input.provenance ?? {};
  const toAppend: LedgerEvent[] = [];

  /* No question, no selection. A turn that asks nothing is still a turn the
   * researcher said something to and can reply to, so it is recorded as the
   * tool's reply carrying its own place. Writing a selection with an empty
   * question would be refused by the ledger and would take the turn with it. */
  const selection =
    input.question.trim() === ""
      ? undefined
      : ({
          id: newId(),
          ts: now(),
          actor: "system",
          projectId: input.projectId,
          /* M93, ISC-769: the question is the model's sentence, so the selection
           * names the call that wrote it, as the delivery beside it does. The
           * actor stays `system`: the choice to ask is the conversation's rule. */
          ...(input.model === "" ? {} : { model: input.model, modelVersion: input.modelVersion, ...providerField(input) }),
          type: "question-selection",
          moveId: `conversation:${input.place}@${
            conversationTurnCount(events, input.projectId, input.place) + 1
          }`,
          topic: input.topic,
          question: input.question.trim(),
          /* Empty, and that is the honest record. The divergence a selection
           * usually logs is the set it was chosen out of, and a conversation
           * chooses out of what was just said rather than out of a set. */
          alternatives: [],
          mode: input.mode,
          station: input.place,
          reason: input.because,
          ...(input.opener === true ? { opener: true as const } : {}),
          ...(input.fromChallenge === undefined ? {} : { fromChallenge: input.fromChallenge }),
        } satisfies QuestionSelectionEvent);
  if (selection !== undefined) toAppend.push(selection);

  const delivered: ResponseEvent = {
    id: newId(),
    ts: now(),
    actor: "persona:interviewer",
    projectId: input.projectId,
    model: input.model,
    modelVersion: input.modelVersion,
    ...providerField(input),
    type: "response",
    text: input.shown,
    ...(selection === undefined ? { station: input.place } : { inReplyTo: selection.id }),
    ...(input.answerLeaks === undefined || input.answerLeaks.length === 0
      ? {}
      : { answerLeaks: input.answerLeaks }),
    ...(input.cutShort === true ? { cutShort: true as const } : {}),
    ...provenance,
  };
  toAppend.push(delivered);

  await ledger.appendAll(toAppend);
  return {
    kind: "recorded",
    ...(selection === undefined ? {} : { selection }),
    delivered,
    state: projectInterview([...events, ...toAppend], input.projectId),
  };
}

/**
 * The researcher speaks with nothing outstanding (ISC-483).
 *
 * A chat box that only works while a question is open is a form with a cursor
 * in it. After passing on a question, or before the tool has asked anything,
 * what they type is still theirs and still belongs on the record, so it lands
 * as a response carrying its own place and replying to nothing.
 */
export async function recordFreeTurn(
  params: { readonly projectId: string; readonly place: string; readonly text: string },
  ledger: LedgerAccess,
): Promise<ResponseEvent | null> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());
  if (params.text.trim() === "") return null;
  const event: ResponseEvent = {
    id: newId(),
    ts: now(),
    actor: "human",
    projectId: params.projectId,
    type: "response",
    text: params.text.trim(),
    station: params.place,
  };
  await ledger.appendAll([event]);
  return event;
}

// ---------------------------------------------------------------------------
// Closing a turn: answer, refusal, or redirection
// ---------------------------------------------------------------------------

const closuresInFlight = new Map<string, Promise<InterviewState>>();

async function closeTurn(
  projectId: string,
  key: string,
  build: (events: readonly LedgerEvent[]) => readonly LedgerEvent[],
  ledger: LedgerAccess,
): Promise<InterviewState> {
  const mapKey = `${projectId}:${key}`;
  const existing = closuresInFlight.get(mapKey);
  if (existing !== undefined) return existing;
  const run = (async () => {
    const events = await ledger.readEvents(projectId);
    const produced = build(events);
    if (produced.length > 0) await ledger.appendAll(produced);
    return projectInterview([...events, ...produced], projectId);
  })().finally(() => {
    closuresInFlight.delete(mapKey);
  });
  closuresInFlight.set(mapKey, run);
  return run;
}

/** Record the researcher's answer to the outstanding question. */
export async function recordAnswer(
  params: { readonly projectId: string; readonly text: string },
  ledger: LedgerAccess,
): Promise<InterviewState> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());
  return closeTurn(
    params.projectId,
    "answer",
    (events) => {
      const state = projectInterview(events, params.projectId);
      // No outstanding question means this answer has already landed, or there
      // was nothing to answer. Either way, appending a second one would
      // manufacture a turn that did not happen.
      if (state.outstanding === null) return [];
      const event: ResponseEvent = {
        id: newId(),
        ts: now(),
        actor: "human",
        projectId: params.projectId,
        type: "response",
        text: params.text,
        inReplyTo: state.outstanding.eventId,
      };
      return [event];
    },
    ledger,
  );
}

/**
 * Record a declined question. `dont-know` is a first-class answer and is
 * penalised nowhere: it breaks the confident-answer streak rather than
 * feeding it, and no signal reads it as disengagement (ISC-48).
 */
export async function recordRefusal(
  params: {
    readonly projectId: string;
    readonly kind: RefusalEvent["kind"];
    readonly note?: string;
    /**
     * Set when the tool is setting the question aside on the way to something
     * the researcher asked for, absent when they pressed a decline (D9).
     *
     * Two callers pass it, both in `Dialogue.tsx`: the guidance turn behind
     * "Give me some directions", and a question picked out of the alternatives
     * while one is open. The three decline controls pass nothing, which is what
     * makes the record able to tell the researcher's own decision from the
     * tool's bookkeeping.
     */
    readonly setAsideFor?: RefusalEvent["setAsideFor"];
  },
  ledger: LedgerAccess,
): Promise<InterviewState> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());
  return closeTurn(
    params.projectId,
    "refusal",
    (events) => {
      const state = projectInterview(events, params.projectId);
      if (state.outstanding === null) return [];
      const event: RefusalEvent = {
        id: newId(),
        ts: now(),
        actor: "human",
        projectId: params.projectId,
        type: "refusal",
        questionEventId: state.outstanding.eventId,
        kind: params.kind,
        ...(params.note === undefined ? {} : { note: params.note }),
        ...(params.setAsideFor === undefined ? {} : { setAsideFor: params.setAsideFor }),
      };
      return [event];
    },
    ledger,
  );
}

/**
 * "I don't know" on the chip (M74b, ISC-665): its own event, closing the open
 * question. A first-class answer, penalised nowhere.
 */
export async function recordDontKnow(
  params: { readonly projectId: string },
  ledger: LedgerAccess,
): Promise<InterviewState> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());
  return closeTurn(
    params.projectId,
    "dont-know",
    (events) => {
      const state = projectInterview(events, params.projectId);
      if (state.outstanding === null) return [];
      const event: DontKnowEvent = {
        id: newId(),
        ts: now(),
        actor: "human",
        projectId: params.projectId,
        type: "dont-know",
        questionEventId: state.outstanding.eventId,
      };
      return [event];
    },
    ledger,
  );
}

/**
 * "Ask me differently" on the chip (M74b, ISC-665): its own event at the step
 * it was pressed at, closing the question open there when one is. The
 * researcher declined nothing, so it is written as their request, not a
 * refusal.
 */
export async function recordAskDifferently(
  params: { readonly projectId: string; readonly station: string },
  ledger: LedgerAccess,
): Promise<InterviewState> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());
  return closeTurn(
    params.projectId,
    `ask-differently:${params.station}`,
    (events) => {
      const state = projectInterview(events, params.projectId);
      const event: AskDifferentlyEvent = {
        id: newId(),
        ts: now(),
        actor: "human",
        projectId: params.projectId,
        type: "ask-differently",
        station: params.station,
        ...(state.outstanding === null ? {} : { questionEventId: state.outstanding.eventId }),
      };
      return [event];
    },
    ledger,
  );
}

/**
 * The researcher seizes the agenda. Accepted at any point, including with a
 * question outstanding — a tool that requires an answer before it will listen
 * is not keeping the author in the loop (ISC-47).
 */
export async function recordRedirection(
  params: { readonly projectId: string; readonly toTopic: string },
  ledger: LedgerAccess,
): Promise<InterviewState> {
  const now = ledger.now ?? Date.now;
  const newId = ledger.newId ?? (() => crypto.randomUUID());
  return closeTurn(
    params.projectId,
    `redirect:${params.toTopic}`,
    (events) => {
      const state = projectInterview(events, params.projectId);
      const event: RedirectionEvent = {
        id: newId(),
        ts: now(),
        actor: "human",
        projectId: params.projectId,
        type: "redirection",
        ...(state.outstanding === null ? {} : { fromMoveId: state.outstanding.moveId }),
        toTopic: params.toTopic,
      };
      return [event];
    },
    ledger,
  );
}

/** Test seam: clear the in-flight maps between cases. */
export function resetInterviewInFlight(): void {
  selectionsInFlight.clear();
  closuresInFlight.clear();
  conversationsInFlight.clear();
}
