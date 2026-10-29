/**
 * The interview, one turn at a time (ISC-43, ISC-47, ISC-48, ISC-62).
 *
 * Three commitments show up directly in this component:
 *
 *   - The question text comes from the deterministic move, not the model. The
 *     model's job is to react to the last answer and deliver the question, so
 *     what gets asked is auditable independently of what the model felt like
 *     saying.
 *   - "I don't know" sits next to Send at equal weight. Making it a small
 *     escape hatch would be a way of penalising it while claiming not to.
 *   - Redirection is always available, including with a question outstanding.
 *     A tool that requires an answer before it will listen is not keeping the
 *     author in the loop.
 *   - Whatever the researcher can act on next sits directly under the station
 *     card, and the record goes below it. See `live` for why that flips the
 *     order of this column rather than fixing one.
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LedgerEvent } from "../ledger/events.ts";
import { projectInterview } from "../interview/state.ts";
import { guidanceAnswerViolations, proposedAnswerViolations } from "../interview/prompt.ts";
import type { InterviewState, NextMove, TurnMode } from "../interview/types.ts";
import {
  recordAnswer,
  recordAskDifferently,
  recordConversationTurn,
  recordDontKnow,
  recordFreeTurn,
  recordRedirection,
} from "../interview/orchestrator.ts";
import { followUpOpen, nextChallenge } from "../interview/challenges.ts";
import {
  CONVERSATION_INSTRUCTION,
  conversationPrompt,
} from "../interview/conversationPrompt.ts";
import {
  FRAMING_PLACE,
  framingCoverage,
  isConversationMove,
  parseConversationTurn,
  placeLabel,
  topicForPlace,
  withoutTrailingQuestion,
} from "../interview/conversation.ts";
import { voiceGateProvenance } from "../inference/voiceGate.ts";
import { reviseInVoice } from "../inference/voiceRetry.ts";
import { sentencesOf } from "../copy/rules.ts";
import { streamOrComplete } from "../inference/types.ts";
import { activeInferenceClient } from "../ui/personaRun.ts";
import { dataChunkCount, type Chunk, type StoredDocument } from "../state/chunks.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import {
  designDigest,
  digestIsEmpty,
  ontologyDigest,
  transcriptDigest,
} from "../interview/designDigest.ts";
import type { ProjectBrief } from "../state/projects.ts";
import {
  researcherTurnLabel,
  toolReplyLabel,
  toolStreamingLabel,
  toolTurnLabel,
  topicLabel,
  CUT_SHORT_LINE,
} from "../interview/topicLabel.ts";
import {
  SET_ASIDE_LABEL,
  setAsideLine,
  setAsideReasons,
  type SetAsideReason,
} from "../views/setAside.ts";
import { isStationId, stationById, type StationId } from "../flow/stations.ts";
import { INTEREST_SUBJECT, stationStated } from "../flow/stationBrief.ts";
import { FRAMING_PROBES, stationLabel } from "../interview/stationProbes.ts";
import { navigate, studyPath } from "../ui/routes.ts";
import { formatMoment } from "../ui/format.ts";
import { providerField } from "../inference/types.ts";
import { MODEL_UNREACHABLE, ModelUnreachableError } from "../inference/cliBridge.ts";

/** Why the opener's question was put, for the record (M74b): it is the step's own. */
const OPENER_BECAUSE = "The step's own question, which the bubble at the head of the step shows.";

/** Every word the researcher has written in the conversation, for the quotation check (M74b, ISC-665). */
function researcherWords(events: readonly LedgerEvent[], projectId: string): readonly string[] {
  return events.flatMap((e) =>
    e.projectId === projectId && e.type === "response" && e.actor === "human" ? [e.text] : [],
  );
}

/**
 * The framing's own question and purpose, for a conversation held there.
 *
 * The seven stations declare theirs in `stations.ts` and the framing does not,
 * because it is not a station. These two sentences are the band's own first
 * field, said to the model rather than drawn on the page, so the conversation
 * at the framing knows what it is for.
 */
/* M62, ISC-599: the purpose names the three parts the conversation covers, and
 * the question put is the next uncovered part's (`FRAMING_PROBES`), read per
 * turn in `conversationTurn` rather than fixed here. */
const FRAMING_PURPOSE =
  "The setting for the whole study: what the researcher is looking at, the literatures that they expect to draw on, and where they want the project to land.";

/**
 * Places whose opener has been started in this page's life.
 *
 * The opener is generated on visit rather than on a button, so the guard has to
 * sit in front of the model call and not only in front of the append. React
 * runs an effect twice under StrictMode and the second run starts before the
 * first has finished awaiting anything, so a check against the ledger alone
 * would let two openers reach the model and one of them be thrown away after
 * it had been paid for. The choke point still refuses the second append; this
 * stops the second call.
 */
const openersStarted = new Set<string>();

/** Test seam: forget which openers this page has already spoken. */
export function resetConversationOpeners(): void {
  openersStarted.clear();
}

/**
 * A turn of Abductive's that could not reach the model, by place (M74b,
 * ISC-664).
 *
 * The walk of 2026-10-02 lost the line that said a reply had failed the moment
 * the student left the step, and nothing offered to ask again. The turn's own
 * options are kept here for the page's life, keyed by project and place, so the
 * step shows "Abductive couldn't reach the model." with Try again on every visit
 * until a reply lands there, and Try again asks for the same turn.
 */
export interface FailedTurn {
  readonly mode: TurnMode;
  readonly opener?: boolean;
  readonly answering?: string;
  /** Why it failed (M85, ISC-716): the model out of reach, or the call cut off. */
  readonly reason?: "unreachable" | "interrupted";
}
const chatFailures = new Map<string, FailedTurn>();

/** Test seam: forget the turns that could not reach the model. */
export function resetChatFailures(): void {
  chatFailures.clear();
}

/**
 * The sentence for a turn cut off by an abort that the researcher didn't cause
 * (M85, ISC-716). Safari, 2026-10-14: WebKit aborted the ledger's write of a
 * turn that a save's suggestion was writing beside, and the chat printed the
 * exception's bare name. The researcher's own Stop aborts the turn's own
 * controller, and that case keeps what was shown, as it always did.
 */
export const REPLY_INTERRUPTED = "Abductive couldn't finish that reply. Try again.";

/** An abort that came from somewhere other than the researcher's Stop. */
function interrupted(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
}

/** What the page says for a failed call: Abductive's sentence for an abort, else the error's own. */
function errorLine(err: unknown): string {
  if (interrupted(err)) return REPLY_INTERRUPTED;
  return err instanceof Error ? err.message : String(err);
}

/** A failure the bridge client gives up on, after its one retry. */
function unreachable(err: unknown): boolean {
  return err instanceof ModelUnreachableError || (err instanceof Error && err.name === "ModelUnreachableError");
}

/** The line a reply typed while Abductive writes carries until it goes (M74b, ISC-664). */
export const REPLY_QUEUED_LINE = "Abductive is still writing; your reply goes next.";

// Was a census — "2 puzzle, 1 observation" — which tells a model the shape of
// the graph and nothing about the study it is meant to be interviewing about.
// See ontologyDigest for what replaced it.

export function Dialogue(props: {
  /** Lines drawn just above the composer (M63; the step's flags until M89). */
  aboveComposer?: ReactNode;
  projectId: string;
  graph: OntologyGraph;
  interview: InterviewState;
  moves: readonly NextMove[];
  events: readonly LedgerEvent[];
  chunks: readonly Chunk[];
  /**
   * The files the passages belong to (M35, D8).
   *
   * One fact, and only for drafting: which file a passage came from, so the
   * drafter can be handed the material an answer names and cite what the answer
   * rests on. Absent means no passages reach the drafter and every page it
   * writes cites nothing, which is what the read-only transcript wants and what
   * every build before this one did everywhere.
   */
  documents?: readonly StoredDocument[];
  /** The design so far. Without it the interviewer cannot see what it is asking about. */
  brief?: ProjectBrief;
  /**
   * The station being worked. Given one, this column shows only the turns
   * belonging to it and records new turns against it; without one it shows
   * the whole conversation, which is what the Ontology view wants.
   */
  station?: string;
  /**
   * Show the record and nothing to act with. The Ontology view is where the
   * conversation is read against the pages it produced; asking and answering
   * belong at a station, where there is a station to record the turn against.
   */
  readOnly?: boolean;
  /** Walk the researcher to the station holding the open question. */
  onGoToStation?: (station: StationId) => void;
  /**
   * The step's own question, drawn as the tool's first turn in the thread
   * (M58, ISC-564), so an empty conversation reads as the tool having asked
   * once. Absent on the read-only record, which has no step to ask about.
   */
  question?: string;
  /**
   * A tool turn offered after the question, drawn from something already on the
   * record rather than written by this component (M58, ISC-567): at the puzzle
   * step, the tool's reading as the first draft.
   */
  offer?: ReactNode;
}) {
  const {
    projectId,
    graph,
    interview,
    events,
    chunks,
    documents,
    brief,
    station,
    readOnly,
    onGoToStation,
    question,
    offer,
  } = props;
  const { appendAll, readEvents } = useLedger();
  /* Two conversations can be on screen at once since M37: the step's, and the
   * framing's when the band's own is open. Both carry a chat box, and both used
   * a fixed id, so the second copy had no accessible name at all: two elements
   * share an id, `for` binds to the first, and a screen reader user meets an
   * unlabelled textarea on the surface this app spends most of its words on. */
  const uid = useId();
  const answerId = `answer-input-${uid}`;
  const [streaming, setStreaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /* M74b, ISC-664: the box's text, read at the moment a queued reply goes. */
  const draftRef = useRef(draft);
  draftRef.current = draft;
  /* A reply typed while Abductive writes, waiting for the turn to end. */
  const queued = useRef(false);
  const [waitingToSend, setWaitingToSend] = useState(false);
  /* The turn at this place that could not reach the model, if one is owed. */
  const failureKey = `${projectId}:${station ?? ""}`;
  const [failure, setFailure] = useState<FailedTurn | null>(() => chatFailures.get(failureKey) ?? null);
  useEffect(() => {
    setFailure(chatFailures.get(failureKey) ?? null);
  }, [failureKey]);
  const questionRef = useRef(question);
  questionRef.current = question;
  /* Whether there is a model to talk to, read the way OfflineBanner reads it.
   * No probe of its own: the banner runs one on every screen, and a second
   * probe from a component that renders eight times a session would be a
   * request per station change. */
  const [connected, setConnected] = useState(() => {
    try {
      return activeInferenceClient().live;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const read = () => {
      try {
        setConnected(activeInferenceClient().live);
      } catch {
        setConnected(false);
      }
    };
    window.addEventListener("hashchange", read);
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("hashchange", read);
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
    };
  }, []);
  // Guards the button against a double-click landing two turns before the
  // orchestrator's in-flight map has seen the first. The orchestrator is still
  // the thing that makes it correct; this only stops the UI looking broken.
  const busy = useRef(false);
  /* The stream in flight, so Stop can end it (M58, the lead's ruling of
   * 2026-09-27). One at a time, like the turns themselves. */
  const stopper = useRef<AbortController | null>(null);
  const stop = useCallback(() => stopper.current?.abort(), []);

  const ledger = useMemo(
    () => ({ appendAll, readEvents }),
    [appendAll, readEvents],
  );

  const fullTranscript = useMemo(() => buildTranscript(events), [events]);
  // What this column shows. At a station that is the station's own exchange;
  // the whole conversation lives on the Ontology view, which renders this
  // component without a station.
  /** The question-selection event for whatever is outstanding, if anything. */
  const askedEvent = useMemo(() => {
    const id = interview.outstanding?.eventId;
    if (id === undefined) return undefined;
    const found = events.find((e) => e.id === id);
    return found?.type === "question-selection" ? found : undefined;
  }, [events, interview.outstanding]);

  const transcript = useMemo(
    () => (station === undefined ? fullTranscript : turnsAtStation(fullTranscript, station)),
    [fullTranscript, station],
  );

  /**
   * An outstanding question that belongs to no station at all.
   *
   * Only reachable in studies that predate ISC-367, where turns carry no
   * station and cannot be back-filled with a guess. It belongs to every
   * station equally, so it shows and is answerable wherever the researcher is
   * standing — but in a block of its own, not folded into "the conversation
   * here", which is the mistake this file has now made twice. Self-healing:
   * once it is answered it is gone, and every question since carries a
   * station.
   */
  const unplaced = useMemo(() => {
    if (station === undefined || askedEvent === undefined) return [];
    if (askedEvent.station !== undefined) return [];
    const ids = exchangeIds(events, askedEvent.id);
    return fullTranscript.filter((e) => ids.has(e.id));
  }, [fullTranscript, station, askedEvent, events]);

  /**
   * Where the outstanding question was opened, when it was not opened here.
   *
   * This went through two wrong versions. First the whole exchange was carried
   * into the station's own transcript, so a section headed "the conversation
   * here" showed a question from another station and a caption underneath
   * explained the contradiction, which leaves two claims on screen rather than
   * fixing one. Then it got its own block, correctly labelled, and reproduced
   * itself at all eight stations: an unanswered question turned the entire
   * rail into eight copies of the same prompt.
   *
   * A question belongs at the station it was asked at. What the other stations
   * need is not the question but the fact of it and the way back, which is one
   * line. The standing bar at the top of the view already reports that a
   * question is on the table; this says where.
   */
  const openedElsewhere = useMemo(() => {
    if (station === undefined || askedEvent === undefined) return undefined;
    // No station on the question means it belongs nowhere in particular,
    // which `unplaced` above handles by showing it in its own block. Only a
    // question that has a station, and a different one, blocks this view.
    if (askedEvent.station === undefined || askedEvent.station === station) return undefined;
    return askedEvent.station;
  }, [station, askedEvent]);
  /* M89: `ask`, which put a question brought here from a flag on Checks, went
   * with the checks. The chat asks through `conversationTurn` below. */

  /**
   * One turn of the conversation at this place (M37, ISC-483 … ISC-486).
   *
   * The question is the model's, which is the one thing this path does that
   * `ask` above does not, and the reason is that a follow-up which cannot read
   * the last answer is not a follow-up. Everything that made the offered set
   * auditable is kept and moved rather than dropped: the question and the
   * reason for it are parsed out of the reply and written to the record, the
   * marked lines never reach the screen, the reply is scanned on the way out
   * for language that supplies an answer, and the append goes through the
   * orchestrator's choke point so one outstanding question at a time still
   * holds.
   */
  const conversationTurn = useCallback(
    async (opts: { mode: TurnMode; opener?: boolean; answering?: string }) => {
      if (station === undefined) return;
      /* The choke point's check, made before the model is called rather than
       * only after. The first live walk of M37 opened the framing while the
       * Context opener was still on the table: the model was called, replied,
       * and the reply was refused at the append, so a whole turn was paid for
       * and thrown away, and the refusal was shown as an error under a line
       * that had already said where the open question was. An opener that
       * finds a question open says nothing; the researcher can write here and
       * the redirection in `send` sets that question aside. */
      let events = await readEvents(projectId);
      const before = projectInterview(events, projectId);
      if (before.outstanding !== null && before.outstanding.eventId !== opts.answering) {
        /* M84, ISC-706 (a co-author: "jump between different 'boxes' … without
         * Abductive wanting the user to jump back"). A question open at another
         * step is set aside by a redirection to this one, as `send` does, and the
         * turn goes ahead with no note. The question stays in its own step and
         * in History. One open at this step is the turn's own, and stays. */
        const askedAt = events.find((e) => e.id === before.outstanding?.eventId);
        const at = askedAt?.type === "question-selection" ? askedAt.station : undefined;
        if (at === undefined || at === station) return;
        await recordRedirection({ projectId, toTopic: topicForPlace(station) }, ledger);
        events = await readEvents(projectId);
      }
      const fresh = buildTranscript(events);
      const { client } = activeInferenceClient();
      const isStation = isStationId(station);
      /* M62, ISC-599: at the framing, the replay says which of the three parts
       * the conversation has covered, and the turn asks about the next one. */
      const framing = isStation ? undefined : framingCoverage(events, projectId, brief ?? {});
      const stationQuestion = isStation
        ? stationById(station).prompt
        : FRAMING_PROBES[framing?.next ?? "startingInterest"];
      /* M74b, ISC-664: an opener whose question the bubble above already shows
       * leads into it and asks nothing of its own. */
      const bubble = questionRef.current;
      /* M92, ISC-747: Starting point's bubble says which parts Abductive asks
       * about and ends on the interest question, so a bubble that ends on the
       * turn's question shows it too. */
      const leadIn =
        opts.opener === true && (bubble === undefined || bubble === stationQuestion || bubble.endsWith(` ${stationQuestion}`));
      /* M78b, ISC-682: a design challenge waiting at this step is a candidate
       * for the turn's question, behind an open follow-up on the researcher's
       * last reply and ahead of the step's own question. */
      const challenge = isStation ? nextChallenge(events, projectId, station) : undefined;
      const prompt = conversationPrompt({
        place: station,
        placeLabel: placeLabel(station),
        purpose: isStation ? stationById(station).blurb : FRAMING_PURPOSE,
        stationQuestion,
        ...(opts.opener === true && !leadIn ? { openerAsks: true } : {}),
        ...(framing === undefined ? {} : { framing: { covered: framing.covered, open: framing.open, next: framing.next } }),
        ...(challenge === undefined ? {} : { challenge: { text: challenge.text, followUp: followUpOpen(events, projectId, station) } }),
        mode: opts.mode,
        opener: opts.opener === true,
        nothingWrittenYet: brief === undefined || digestIsEmpty(designDigest(brief)),
        /* Whether this step already holds an answer (M51, ISC-534). The rail's
         * own test, `stationStated`, so the conversation and the rail cannot
         * disagree: the typed answer, or, at Early data, the researcher's own
         * data standing in for one (D5, and D12 for what counts as data). The
         * framing is answered by its starting interest, which is what
         * `placeSummary` reads there. */
        stepAnswered: isStation
          ? brief !== undefined &&
            stationStated(brief, stationById(station), dataChunkCount(chunks))
          : (brief?.startingInterest ?? "").trim() !== "",
        chunks,
        ontologySummary: ontologyDigest(graph),
        ...(brief === undefined ? {} : { design: designDigest(brief) }),
        /* From the store, not the render snapshot. `send` appends the
         * researcher's message and then calls this, and the snapshot this
         * closure holds predates that append, so the first live walk had the
         * tool replying to the message before the one just sent: at Context it
         * answered the framing's radio anecdote and told the researcher they
         * had "answered with a person" when their Context message was about
         * the setting. The reply must read the message it is replying to. */
        here: transcriptDigest(turnsAtStation(fresh, station), 12),
        earlier: transcriptDigest(
          fresh.filter((e) => e.station !== station),
          6,
        ),
      });

      setStreaming("");
      let accumulated = "";
      const controller = new AbortController();
      stopper.current = controller;
      let result;
      try {
        result = await streamOrComplete(
          client,
          {
            signal: controller.signal,
            system: prompt,
            messages: [{ role: "user", content: CONVERSATION_INSTRUCTION(opts.opener === true, !leadIn) }],
          },
          (delta) => {
            accumulated += delta.text;
            // Parsed on the way in, so the two marked lines are never on screen
            // even for the second they would take to stream past.
            setStreaming(parseConversationTurn(accumulated).shown);
          },
        );
        // M69, ISC-644: one retry for a sentence that breaks one of the owner's rules.
        result = await reviseInVoice(client, result, controller.signal, { quotable: researcherWords(events, projectId) });
      } catch (err) {
        /* M74b, ISC-664: the bridge has tried twice. The turn is kept for Try
         * again, here and on every later visit, and the line says what failed. */
        if (!controller.signal.aborted && (unreachable(err) || interrupted(err))) {
          const owed: FailedTurn = {
            mode: opts.mode,
            ...(opts.opener === true ? { opener: true } : {}),
            ...(opts.answering === undefined ? {} : { answering: opts.answering }),
            reason: unreachable(err) ? "unreachable" : "interrupted",
          };
          chatFailures.set(`${projectId}:${station}`, owed);
          setFailure(owed);
          return;
        }
        if (!controller.signal.aborted) throw err;
        /* Stopped part way (M58). What the reader saw becomes the tool's turn,
         * marked cut short, and asks no question: a stopped reply opens nothing. */
        const shown = parseConversationTurn(accumulated).shown;
        if (shown.trim() !== "") {
          await recordConversationTurn(
            {
              projectId,
              place: station,
              topic: topicForPlace(station),
              question: "",
              because: "",
              shown,
              mode: opts.mode,
              model: client.requestedModel ?? "unknown",
              modelVersion: client.requestedModel ?? "unknown",
              ...providerField(client),
              cutShort: true,
              ...(opts.answering === undefined ? {} : { answering: opts.answering }),
            },
            ledger,
          );
        }
        return;
      } finally {
        stopper.current = null;
      }

      const read = parseConversationTurn(result.text);
      const ledIn = leadIn ? withoutTrailingQuestion(read.shown) : "";
      const parsed =
        leadIn && ledIn !== ""
          ? { shown: ledIn, question: stationQuestion, because: OPENER_BECAUSE }
          : read;
      chatFailures.delete(`${projectId}:${station}`);
      setFailure(null);
      /* M85, ISC-716: the record of the turn can abort too (WebKit, beside a
       * save's writes). The reply is owed as for a stream that was cut off. */
      const owe = (): void => {
        const owed: FailedTurn = {
          mode: opts.mode,
          ...(opts.opener === true ? { opener: true } : {}),
          ...(opts.answering === undefined ? {} : { answering: opts.answering }),
          reason: "interrupted",
        };
        chatFailures.set(`${projectId}:${station}`, owed);
        setFailure(owed);
      };
      const outcome = await recordConversationTurn(
        {
          projectId,
          place: station,
          topic: topicForPlace(station),
          question: parsed.question,
          because: parsed.because,
          shown: parsed.shown,
          ...(leadIn && ledIn !== "" ? { opener: true as const } : {}),
          ...(challenge !== undefined && !leadIn && read.fromChallenge && parsed.question !== "" ? { fromChallenge: challenge.id } : {}),
          mode: opts.mode,
          model: result.model,
          modelVersion: result.modelVersion,
          ...providerField(result),
          /* M62, ISC-604: a guidance reply is read for a shortcut to an answer
           * too, and recorded as it always was, with the leak marked. */
          answerLeaks: (opts.mode === "guidance" ? guidanceAnswerViolations : proposedAnswerViolations)(parsed.shown).map(
            (l) => l.phrase,
          ),
          provenance: voiceGateProvenance(result),
          ...(opts.answering === undefined ? {} : { answering: opts.answering }),
          ...(opts.opener === true ? { onlyIfPlaceEmpty: true } : {}),
        },
        ledger,
      ).catch((err: unknown) => {
        if (!interrupted(err)) throw err;
        owe();
        return undefined;
      });
      if (outcome === undefined) return;
      if (outcome.kind === "blocked-outstanding" && opts.opener !== true) {
        /* M84, ISC-706: L9's error, with no instruction to go back. */
        setError("Abductive couldn't record that question. Try again.");
      }
    },
    [station, projectId, brief, chunks, graph, ledger, readEvents],
  );

  /* The two the opener reads, held in refs rather than in its closure.
   *
   * `openHere` is called from an event handler that React attached on some
   * earlier render, so a value captured in the closure is whatever was true
   * when that render ran. The guard it feeds is "is this place still empty",
   * which has to be answered at the moment of the press. Keeping them out of
   * the dependency list also keeps the callback stable across every keystroke
   * in the box, which is what stops the textarea losing its handler mid-focus. */
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;

  /**
   * The tool speaks first, once the researcher shows they are here (ISC-482,
   * ISC-497).
   *
   * It used to fire on arrival. The interface research measured what that
   * costs on a rail of eight places: a single pass along the rail spent seven
   * model calls and left seven unanswered questions behind it, which is the
   * fragmentation condition Mark, Gonzalez and Harris describe and which also
   * pollutes the ask-and-propose ratio the tool reports about itself. Clicking
   * along the rail to see where you are is not a decision to work at any of
   * the places you pass through.
   *
   * So it fires on intent instead: the first focus in the chat box here, or a
   * press of "Start here" in the empty conversation. A conversation that waits
   * to be started is still not a form with a Send button, because the tool
   * still speaks first once you arrive at the box; what changed is that
   * arriving in the room is no longer taken for sitting down.
   *
   * Once per place, and both guards are kept. `openersStarted` sits in front
   * of the model call, because React runs an effect twice under StrictMode and
   * because a researcher can focus, blur and focus again in less time than a
   * call takes. The choke point checks the persisted ledger again.
   *
   * Nothing happens with no model attached. The alternative would be the mock
   * client opening every station with the same canned paragraph, which is the
   * fixture-as-finding failure this tool exists to measure.
   */
  const openHere = useCallback(async () => {
    if (readOnly === true || station === undefined || !connected) return;
    if (transcriptRef.current.length > 0 || streamingRef.current !== null || busy.current) return;
    const key = `${projectId}:${station}`;
    if (openersStarted.has(key)) return;
    openersStarted.add(key);
    /* M74b: the opener holds the floor, so a reply typed while it streams
     * waits for it rather than racing it to the record. */
    busy.current = true;
    try {
      /* Opening here is the researcher's intent, so a question open at another
       * place is set aside the way `send` sets it aside: a redirection to this
       * place on the record (ISC-47). The M38 walk pressed "Start here" at
       * Sample with a question open at Early data, and nothing happened and
       * nothing said why: the opener's rule was to say nothing when a question
       * is open elsewhere, which fitted an opener fired by arrival, and since
       * ISC-497 no opener fires by arrival. */
      if (openedElsewhere !== undefined) {
        await recordRedirection({ projectId, toTopic: topicForPlace(station) }, ledger);
      }
      await conversationTurn({ mode: "interrogation", opener: true });
      /* An opener that wrote nothing leaves the place empty, so it may open on
       * a later visit. Only a turn on the record makes the key final. */
      if ((await readEvents(projectId)).every((e) => e.type !== "question-selection" || e.station !== station)) {
        openersStarted.delete(key);
      }
    } catch (err) {
      setError(errorLine(err));
    } finally {
      setStreaming(null);
      busy.current = false;
      sendQueued();
    }
  }, [readOnly, station, connected, projectId, conversationTurn, readEvents, openedElsewhere, ledger]);

  /**
   * Answering used to end here, and that was the gap between what the tool
   * says it does and what it did. The landing page promises it builds your
   * model of the phenomenon as you answer; before this, an answer produced a
   * transcript line and the ontology stayed empty however long you talked.
   *
   * Drafting runs after the answer is safely on the record, never as part of
   * appending it. If the model call fails the turn still happened, and the
   * failure is shown rather than swallowed — a silent no-op here would be
   * indistinguishable from an answer that implied no page, which is a
   * perfectly ordinary outcome.
   */
  const send = useCallback(async () => {
    if (draftRef.current.trim() === "") return;
    /* M74b, ISC-664 (the walk's finding 2): while Abductive writes, the reply
     * waits in the box with a line saying so, and goes when the turn ends. */
    if (busy.current || streamingRef.current !== null) {
      queued.current = true;
      setWaitingToSend(true);
      return;
    }
    busy.current = true;
    const answer = draftRef.current.trim();
    let answering: string | undefined;
    try {
      /* Read from the store, not the render: a reply queued behind the opener
       * goes after the opener's question is on the record, and the render this
       * callback came from predates it (M74b). */
      const fresh = await readEvents(projectId);
      const open = projectInterview(fresh, projectId).outstanding;
      const askedAt = open === null ? undefined : fresh.find((e) => e.id === open.eventId);
      const openedElsewhere =
        station !== undefined &&
        askedAt?.type === "question-selection" &&
        askedAt.station !== undefined &&
        askedAt.station !== station
          ? askedAt.station
          : undefined;
      // A question open elsewhere is set aside by the redirection below, so the
      // reply that follows answers nothing and must not name it.
      answering = openedElsewhere === undefined ? open?.eventId : undefined;
      /* Two ways a message lands, and the second one is what makes this a
       * conversation rather than a form. With a question outstanding the
       * message answers it, as it always has. With nothing outstanding, after
       * a pass or before the tool has asked anything, it is still theirs and
       * still belongs on the record, so it lands as a turn carrying its own
       * place and replying to nothing. */
      if (station !== undefined && openedElsewhere !== undefined) {
        /* A question open at another place, and the researcher writing here
         * anyway. That is the researcher seizing the agenda, which the record
         * already has a word for (ISC-47): a redirection to this place sets
         * the other question aside, and the message lands as this place's own
         * turn. Without this, a step's opener left a question on the table
         * that blocked "Talk it through" at the framing, and the only way past
         * it was a box asking what you wanted to work on instead. */
        await recordRedirection({ projectId, toTopic: topicForPlace(station) }, ledger);
        await recordFreeTurn({ projectId, place: station, text: answer }, ledger);
      } else if (open !== null) {
        await recordAnswer({ projectId, text: answer }, ledger);
      } else if (station !== undefined) {
        await recordFreeTurn({ projectId, place: station, text: answer }, ledger);
      } else {
        await recordAnswer({ projectId, text: answer }, ledger);
      }
      setDraft("");
      setError(null);
      setNote(null);
      /* M63, ISC-610 (the owner, 2026-09-30). A turn no longer drafts claims.
       * Abductive suggests concepts when the researcher saves the summary of
       * this conversation at the step, and after a read of their data, which
       * is where the claims drafter was redirected (`concepts/suggest.ts`). */
    } catch (err) {
      // The answer did not reach History, so Abductive does not reply to it.
      setError(errorLine(err));
      busy.current = false;
      return;
    }

    /* And then the tool's turn, which is what makes this an exchange. Outside
     * the drafting block above, so a failure to draft a page from the answer
     * does not swallow the reply, and after it, so the reply is written knowing
     * everything the answer produced. */
    try {
      if (station !== undefined) {
        await conversationTurn({
          mode: "interrogation",
          ...(answering === undefined ? {} : { answering }),
        });
      }
    } catch (err) {
      setError(errorLine(err));
    } finally {
      setStreaming(null);
      busy.current = false;
      sendQueued();
    }
  }, [projectId, ledger, readEvents, station, conversationTurn]);

  /* The queued reply goes once the turn holding the floor ends (M74b). Read
   * through a ref, so a turn that began before the reply was typed still sends
   * the text the box holds now. */
  const sendRef = useRef(send);
  sendRef.current = send;
  function sendQueued(): void {
    if (!queued.current) return;
    queued.current = false;
    /* The turn has ended and its `setStreaming(null)` has not rendered yet, so
     * the ref still holds its text; the reply must not wait on it again. */
    streamingRef.current = null;
    setWaitingToSend(false);
    void sendRef.current();
  }

  /**
   * Try again (M74b, ISC-664): the same turn that could not reach the model,
   * asked again. The researcher's message is already on the record, so only
   * Abductive's turn is asked for.
   */
  const retry = useCallback(async () => {
    const owed = chatFailures.get(failureKey);
    if (owed === undefined || busy.current || station === undefined) return;
    busy.current = true;
    setError(null);
    setFailure(null);
    if (owed.opener === true) openersStarted.add(failureKey);
    try {
      await conversationTurn({
        mode: owed.mode,
        ...(owed.opener === true ? { opener: true } : {}),
        ...(owed.answering === undefined ? {} : { answering: owed.answering }),
      });
    } catch (err) {
      setError(errorLine(err));
    } finally {
      setStreaming(null);
      busy.current = false;
      sendQueued();
    }
  }, [failureKey, station, conversationTurn]);

  /**
   * Help, on request (ISC-485).
   *
   * Guidance is a mode of a turn rather than a mode of the session, so asking
   * for it is one turn in guidance mode and it counts as guidance in the
   * ask-and-propose split. That is the point rather than an accounting detail:
   * help is available whenever the researcher wants it, and the record shows
   * how often they took it.
   */
  const guide = useCallback(async () => {
    if (busy.current || station === undefined) return;
    busy.current = true;
    setError(null);
    setNote(null);
    try {
      /* Asked with the tool's question still on the table, which is when a
       * researcher asks for directions: they cannot answer it as put. The
       * first live walk refused the press with "A question is open at
       * Context", which is the tool declining to help with its own question.
       * The open question is set aside on the record (not now, in their
       * terms, since they have asked for help before answering), or, when it
       * is open at another place, the conversation is steered here (ISC-47),
       * and the guidance turn follows. */
      if (openedElsewhere !== undefined) {
        await recordRedirection({ projectId, toTopic: topicForPlace(station) }, ledger);
      } else if (interview.outstanding !== null) {
        /* M74b, ISC-665: the chip's own event, which names the step and the
         * question it closes and declines nothing (it was a `not-now` refusal
         * set aside for directions, D9). */
        await recordAskDifferently({ projectId, station }, ledger);
      } else {
        await recordAskDifferently({ projectId, station }, ledger);
      }
      await conversationTurn({ mode: "guidance" });
    } catch (err) {
      setError(errorLine(err));
    } finally {
      setStreaming(null);
      busy.current = false;
      sendQueued();
    }
  }, [station, conversationTurn, openedElsewhere, interview, projectId, ledger]);

  const decline = useCallback(
    async (kind: "dont-know") => {
      if (busy.current) return;
      busy.current = true;
      try {
        /* M74b, ISC-665: its own event, `dont-know`, where it was a refusal. */
        if (kind === "dont-know") await recordDontKnow({ projectId }, ledger);
        /* After "I don't know" the tool asks something narrower, which is the
         * rule that makes a declined answer a step forward rather than a dead
         * end. */
        if (station !== undefined) {
          await conversationTurn({ mode: "interrogation" });
        }
      } catch (err) {
        setError(errorLine(err));
      } finally {
        setStreaming(null);
        busy.current = false;
        sendQueued();
      }
    },
    [projectId, ledger, station, conversationTurn],
  );

  const outstanding = interview.outstanding !== null;

  /**
   * Whether the exchange is live, kept as an attribute for the styles and the
   * tests that read it (ISC-357). Since M58 it no longer decides any order: the
   * thread is always above the composer, the way every chat people know is laid
   * out, and the composer is always the last thing in the column.
   */
  const live = outstanding || streaming !== null;
  const openPlace: OpenQuestionPlace =
    openedElsewhere !== undefined ? "elsewhere" : unplaced.length > 0 ? "unplaced" : outstanding ? "here" : "none";

  /* The thread follows the newest turn unless the reader has scrolled up to
   * read an older one (M58, ISC-564). `stick` is read at the moment a turn
   * lands, so a reader part way up the thread is left where they are. */
  const threadRef = useRef<HTMLOListElement | null>(null);
  const stick = useRef(true);
  const onThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (el === null) return;
    stick.current = nearBottom(el.scrollTop, el.scrollHeight, el.clientHeight);
  }, []);
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (el === null || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [transcript.length, streaming]);

  /* Where the saved answer sits in the thread: under the last turn said before
   * it was saved, or under the step's question when the answer came first. */
  const savedAt = useMemo(
    () => (station === undefined ? undefined : savedAnswerAt(events, transcript, station)),
    [events, transcript, station],
  );
  const savedMark = (
    <li className="chat-saved small muted" data-testid="chat-saved" key="saved">
      Answer saved
    </li>
  );

  const aboutLabel = station === undefined
    ? "Chat"
    : `Chat about ${conversationAbout(station)}`;
  const empty = transcript.length === 0 && streaming === null;

  /* The thread as Messages draws it (M66, ISC-627). Every row is listed first
   * with its side, so the tail can go on the last bubble of each run: a time,
   * the saved note or a centred line ends a run, as in Messages. */
  const stamps = useMemo(() => chatStamps(transcript), [transcript]);
  const rows: { readonly key: string; readonly side: ChatSide; readonly draw: (tail: boolean) => ReactNode }[] = [];
  const stampRow = (key: string, ts: number) =>
    rows.push({ key, side: "break", draw: () => <ChatStamp key={key} ts={ts} /> });
  if (stamps.lead !== undefined) stampRow("stamp-lead", stamps.lead);
  /* The step's question is the tool's first turn, so an empty conversation
   * reads as the tool having asked once (M58). */
  if (question !== undefined) {
    rows.push({
      key: "prompt",
      side: "tool",
      draw: (tail) => (
        <li key="prompt" className={bubbleClass("tool", tail, "turn turn-agent")} data-testid="station-prompt">
          <span className="visually-hidden">Abductive</span>
          <p className="chat-question">{question}</p>
        </li>
      ),
    });
  }
  if (offer !== undefined) {
    rows.push({
      key: "offer",
      side: "tool",
      draw: (tail) => (
        <li key="offer" className={bubbleClass("tool", tail, "turn turn-agent")} data-testid="chat-offer">
          <span className="visually-hidden">Abductive</span>
          {offer}
        </li>
      ),
    });
  }
  if (savedAt === null) rows.push({ key: "saved", side: "break", draw: () => savedMark });
  for (const entry of transcript) {
    const at = stamps.before.get(entry.id);
    if (at !== undefined) stampRow(`stamp-${entry.id}`, at);
    const side = turnSide(entry);
    rows.push({
      key: entry.id,
      side: side === "system" ? "break" : side,
      draw: (tail) => <Turn key={entry.id} entry={entry} tail={tail} />,
    });
    if (savedAt === entry.id) rows.push({ key: "saved", side: "break", draw: () => savedMark });
  }
  /* While Abductive writes, a grey bubble with the typing dots, and then the
   * text in the same bubble as it arrives (M66, ISC-628). */
  if (streaming !== null) {
    rows.push({
      key: "streaming",
      side: "tool",
      draw: (tail) => (
        <li
          key="streaming"
          className={bubbleClass("tool", tail, "turn turn-agent streaming")}
          data-testid="streaming-turn"
        >
          <span className="visually-hidden">{toolStreamingLabel(station)}</span>
          {streaming === "" ? (
            <span className="chat-typing" data-testid="chat-waiting" role="img" aria-label="Abductive is writing">
              <span />
              <span />
              <span />
            </span>
          ) : (
            <p>{streaming}</p>
          )}
        </li>
      ),
    });
  }
  const tails = tailFlags(rows.map((r) => r.side));

  const conversation = (
    <div
      className="conversation"
      data-testid={station !== undefined && empty ? "conversation-empty" : "conversation"}
    >
      <ol
        ref={threadRef}
        className="transcript chat-thread"
        role="log"
        aria-live="polite"
        aria-label={aboutLabel}
        data-testid="transcript"
        onScroll={onThreadScroll}
      >
        {rows.map((row, i) => row.draw(tails[i] === true))}
      </ol>
    </div>
  );

  /* M84, ISC-706: the line that named a question open at another step, with Go
   * to question, went. Writing here sets that question aside on the record, and
   * the question stays in its own step and in History. */
  const openBlock =
    openedElsewhere !== undefined ? null : unplaced.length > 0 ? (
      <div className="open-unplaced" data-testid="open-unplaced">
        <h3 className="open-unplaced-head">Earlier question</h3>
        <p className="small muted">
          Abductive asked this question before it filed questions under a step, so you can answer
          it from anywhere.
        </p>
        <ol className="transcript chat-thread" data-testid="unplaced-transcript">
          {(() => {
            const sides = unplaced.map((entry): ChatSide => {
              const side = turnSide(entry);
              return side === "system" ? "break" : side;
            });
            const unplacedTails = tailFlags(sides);
            return unplaced.map((entry, i) => (
              <Turn key={entry.id} entry={entry} tail={unplacedTails[i] === true} />
            ));
          })()}
        </ol>
      </div>
    ) : null;

  const status = (
    <>
      {failure !== null && streaming === null && (
        <p className="error chat-unreachable" data-testid="chat-unreachable" role="alert">
          {(failure.reason === "interrupted" ? REPLY_INTERRUPTED : MODEL_UNREACHABLE).replace(/ Try again\.$/, "")}{" "}
          <button type="button" className="linkish" onClick={() => void retry()} data-testid="chat-try-again">
            Try again
          </button>
        </p>
      )}
      {waitingToSend && (
        <p className="small muted" data-testid="reply-queued" role="status">
          {REPLY_QUEUED_LINE}
        </p>
      )}
      {error !== null && (
        <p className="error" data-testid="dialogue-error" role="alert">
          {error}
        </p>
      )}


      {note !== null && (
        <p className="small muted" data-testid="dialogue-note" role="status">
          {note}
        </p>
      )}
    </>
  );

  /* The composer grows with what is typed, from one line to about eight, and
   * shrinks back when a send clears it. */
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    if (composerRef.current !== null) fitComposer(composerRef.current);
  }, [draft]);

  const hasText = draft.trim() !== "";

  const chatBox = !connected ? (
    <p className="small muted conversation-offline" data-testid="conversation-offline">
      <a
        className="linkish"
        href="#/settings"
        onClick={(e) => {
          e.preventDefault();
          navigate("#/settings");
        }}
        data-testid="conversation-connect"
      >
        Connect a model
      </a>{" "}
      to talk this through.
    </p>
  ) : (
    <div className="chat-compose" data-testid="chat-compose">
      {/* In the DOM first, so Tab reaches the box and Send before the chips;
          drawn below them, since the chips sit above the box in every chat
          people know (M58, ISC-564). */}
      {/* A pill with a round send button inside its right edge (M66, ISC-629).
          No placeholder: the box is named "Your reply" for a screen reader, and
          a sentence in the box read as an answer someone had already given. */}
      <div className="answer-box chat-composer" data-testid="answer-box">
        <label className="visually-hidden" htmlFor={answerId}>
          Your reply
        </label>
        <textarea
          id={answerId}
          aria-label="Your reply"
          ref={composerRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => void openHere()}
          onKeyDown={(e) => {
            if (!sendsOnKey(e)) return;
            e.preventDefault();
            void send();
          }}
          rows={1}
          data-testid="answer-input"
        />
        {streaming !== null && !hasText ? (
          /* While a reply streams, Stop takes Send's place (M58). With text in
             the box, Send stays, and the reply goes when the turn ends (M74b). */
          <button type="button" className="chat-send" data-live="true" onClick={stop} data-testid="stop-reply">
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" fill="currentColor" />
            </svg>
            <span className="visually-hidden">Stop</span>
          </button>
        ) : (
          <button
            type="button"
            /* Live only with text (M58). Quiet and a no-op while the box is
               empty, rather than disabled: nothing in this app is inert at rest
               without a sentence saying why (FND-03). The lead kept this for
               M66's round button on 2026-10-01. */
            className="chat-send"
            data-live={hasText ? "true" : "false"}
            onClick={() => void send()}
            data-testid="send-answer"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path
                d="M8 13V3.5M3.75 7.5 8 3.25l4.25 4.25"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="visually-hidden">Send</span>
          </button>
        )}
      </div>
      {/* The two replies that are not messages: one says you don't know the
          answer to the open question and one asks for the question another way.
          M69, ISC-642: "Not now" went (Matthew, 2026-10-02: "Why does there
          need to be a not now button?"). A researcher who wants to leave a
          question simply moves on: a message at another step changes the
          subject, and the record already writes that as a redirection. */}
      <div className="chat-chips" data-testid="chat-chips">
        {outstanding && (
          <button
            type="button"
            className="chat-chip"
            onClick={() => void decline("dont-know")}
            data-testid="dont-know"
          >
            I don't know
          </button>
        )}
        <button
          type="button"
          className="chat-chip"
          onClick={() => void guide()}
          data-testid="give-directions"
        >
          {/* M62, ISC-604: named for the act, which asks differently and never answers. */}
          Ask me differently
        </button>
      </div>
      {/* M62, ISC-600: The note under the moves moved into the page's Help control (ui/pageHelp.ts). */}
    </div>
  );

  /* M59, ISC-570. The menu of the tool's other questions ("Ask about something
   * else") is gone. The moves stay in the record and in the model's brief, so
   * the tool still raises them in the conversation. M89 (2026-10-14): the
   * question a researcher brought here from a flag on Checks left with the
   * checks, on the owner's instruction. */

  const slots: Readonly<Record<DialogueSlot, ReactNode>> = {
    record: conversation,
    open: openBlock,
    status,
    chat: (
      <>
        {props.aboveComposer}
        {chatBox}
      </>
    ),
  };

  return (
    <section
      className="dialogue"
      data-testid="dialogue"
      data-live={live ? "true" : "false"}
      data-open={openPlace}
      data-read-only={readOnly === true ? "true" : undefined}
    >
      {dialogueOrder(live, readOnly === true, openPlace).map((slot) => (
        <Fragment key={slot}>{slots[slot]}</Fragment>
      ))}
    </section>
  );
}

/**
 * Whether a scrolled thread is close enough to its foot to follow new turns
 * (M58, ISC-564). A reader within a line or two of the bottom is reading the
 * newest turn; one further up has scrolled back on purpose.
 */
export function nearBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  slack = 32,
): boolean {
  return scrollHeight - scrollTop - clientHeight <= slack;
}

/** Enter sends; Shift+Enter breaks a line; a composing IME keeps its Enter. */
export function sendsOnKey(e: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly nativeEvent?: { readonly isComposing?: boolean };
}): boolean {
  return e.key === "Enter" && !e.shiftKey && e.nativeEvent?.isComposing !== true;
}

/** The composer's height: its content, from one line up to eight. */
export const COMPOSER_MAX_LINES = 8;

function fitComposer(el: HTMLTextAreaElement): void {
  const style = window.getComputedStyle(el);
  const line = Number.parseFloat(style.lineHeight) || 21;
  const pad =
    (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  const max = line * COMPOSER_MAX_LINES + pad;
  el.style.height = "auto";
  const next = Math.min(el.scrollHeight, max);
  el.style.height = `${Math.max(next, line + pad)}px`;
  el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
}

/**
 * The turn a step's saved answer sits under (M58, ISC-564).
 *
 * The latest save at this place, read off the `bound` events the save writes
 * (a step's own subject, or the starting interest at Starting point). Returns
 * the id of the last turn said before that save, `null` when the answer was
 * saved before any turn (it then sits under the step's question), and
 * `undefined` when nothing has been saved here.
 */
export function savedAnswerAt(
  events: readonly LedgerEvent[],
  transcript: readonly TranscriptEntry[],
  station: string,
): string | null | undefined {
  const subject = station === FRAMING_PLACE ? INTEREST_SUBJECT : station;
  let savedTs: number | undefined;
  for (const e of events) {
    if (e.type === "bound" && e.subject === subject) savedTs = e.ts;
  }
  if (savedTs === undefined) return undefined;
  let at: string | null = null;
  for (const entry of transcript) {
    if (entry.ts !== undefined && entry.ts <= savedTs) at = entry.id;
  }
  return at;
}


/** A station id in the rail's words, or the id itself if it is not one. */
/**
 * A step in the rail's own words (M30, r8).
 *
 * It lower-cased the label, so the strip at the top of the page said "A
 * question is waiting at Context" and this sentence forty pixels down said "at
 * context", for the same step, on the same screen. The rail draws "Context" and
 * the NextBar prints "Context", so this does too.
 */
function stationName(station: string): string {
  return placeName(station);
}

/**
 * A place in the words the page uses for it (M74b, ISC-664): a step's label, and
 * "Starting point" for the framing's place id. The walk of 2026-10-02 read "A
 * question is open for you at framing." on Design, a word the owner retired at
 * M61, because the id fell through to the sentence.
 */
export function placeName(place: string): string {
  if (place === FRAMING_PLACE) return "Starting point";
  return isStationId(place) ? stationLabel(place) : place;
}

/**
 * What a conversation is about, in the words the rail and the record use for it.
 *
 * M42, from the owner's worked example: "The conversation here" told a reader
 * nothing. Which conversation, and where is here? Every string in this panel that
 * leaned on "here" or "this step" names the place instead, and the framing says
 * "your framing" rather than the place id, which is what `placeLabel` does for
 * the record and the popovers.
 */
function conversationAbout(station: string | undefined): string {
  if (station === undefined) return "this project";
  /* M50, ISC-531, string only: the name a reader meets. The id stays. */
  return isStationId(station) ? stationById(station).label : "your starting point";
}

/**
 * The model's reaction, with its closing restatement of the question removed.
 *
 * `TURN_INSTRUCTION` tells the model its reply "ends on that question", so a
 * turn that delivered one already carries it as its last paragraph. Rendering
 * the selected question underneath that turn without this printed the same
 * sentence twice, one line apart — the merge that was supposed to remove the
 * duplication only moved it inside the card.
 *
 * The question shown is still the selected one and never the model's wording,
 * which is the property the transcript has had since M5: the model is allowed
 * to paraphrase on its way in, and what appears on the page is what the
 * orchestrator chose. A model that ignores the contract and does not end on a
 * question loses nothing here — nothing is stripped, and its full text stands
 * above the question it was supposed to ask.
 */
export function withoutClosingQuestion(text: string): string {
  const trimmed = text.trimEnd();
  const paragraphs = trimmed.split(/\n{2,}/);
  const parts = paragraphs.length > 1 ? paragraphs : trimmed.split("\n");
  if (parts.length < 2) return trimmed;
  const last = (parts[parts.length - 1] ?? "").trim();
  if (!last.endsWith("?")) return trimmed;
  return parts.slice(0, -1).join(paragraphs.length > 1 ? "\n\n" : "\n").trimEnd();
}

/**
 * One card in a transcript.
 *
 * Exported since M38 so that Your model's grouped reading of the conversation
 * draws the same card this column draws. The alternative was a second turn
 * renderer on the other tab, which is how the same object comes to look like
 * two objects a click apart.
 */
/**
 * What a turn shows: its prose, and the question line under it when the prose
 * does not already end on the question (M74b, ISC-664).
 *
 * Three cases. An opener leads into the bubble's question and shows no question
 * of its own. A conversation turn is the model's question in the model's words,
 * so when its prose ends on a question it is drawn whole and the question is on
 * screen once, as the record keeps it; when it does not, the recorded question
 * goes under it. A turn delivering one of the offered questions keeps the M5
 * rule: the question shown is the selected one, under the reaction.
 */
export function turnDisplay(entry: TranscriptEntry): { readonly body: string; readonly asked?: string } {
  if (entry.question === undefined) return { body: entry.text };
  if (entry.opener === true) return { body: withoutTrailingQuestion(entry.text) };
  if (entry.conversational === true) {
    /* The prose asks the question itself, at its end or before a closing aside
     * (the Safari walk: a guidance turn asked mid-paragraph, offered examples,
     * and the question line repeated it in other words). */
    const whole = entry.text.trimEnd();
    return whole.includes("?") ? { body: whole } : { body: entry.text, asked: entry.question };
  }
  return { body: withoutClosingQuestion(entry.text), asked: entry.question };
}

export function Turn(props: { entry: TranscriptEntry; back?: ReactNode; tail?: boolean }) {
  const { entry, back } = props;
  const shown = turnDisplay(entry);
  const body = shown.body;
  const side = turnSide(entry);
  const title = entry.ts === undefined ? undefined : turnTime(entry.ts);
  /* A centred line, as Messages draws a note that is not a message (M66): the
   * tool closing its own question, or a change of subject. */
  if (side === "system") {
    return (
      <li
        className={`turn turn-${entry.kind} chat-turn chat-system small muted`}
        data-turn-kind={entry.kind}
        title={title}
      >
        <p>{entry.kind === "redirection" && entry.label !== undefined ? `${entry.label} · ${body}` : body}</p>
        {back}
      </li>
    );
  }
  /* Two sides, as in Messages (M66, ISC-627): Abductive's grey bubbles on the
   * left, yours in ink on the right. The speaker's name is for a screen reader;
   * the side says it to the eye. A decline is yours ("I don't know."), so it
   * sits on your side. The time is on hover, and in the centred stamps. */
  const speaker =
    entry.kind === "refusal" ? researcherTurnLabel(entry.station) : (entry.label ?? (side === "you" ? "You" : "Abductive"));
  /* M69: a turn that has just landed fades its rewritten sentences in. */
  const settling =
    entry.settled !== undefined && entry.ts !== undefined && Date.now() - entry.ts < VOICE_SETTLE_WINDOW_MS ? entry.settled : [];
  return (
    <li
      className={bubbleClass(side, props.tail === true, `turn turn-${entry.kind}`)}
      data-turn-kind={entry.kind}
      data-delivers-question={entry.question === undefined ? undefined : "true"}
      title={title}
    >
      <span className="visually-hidden">{speaker}</span>
      {body !== "" && <p>{withSettled(body, settling)}</p>}
      {shown.asked !== undefined && <p className="turn-asked">{withSettled(shown.asked, settling)}</p>}
      {entry.cutShort === true && (
        <p className="chat-cut small muted" data-testid="turn-cut-short">
          {CUT_SHORT_LINE}
        </p>
      )}
      {/* The way back to where this was said. Empty on the Design view, where
          the reader is already standing at the place; a link on Your model,
          where the whole conversation is read at once. */}
      {back}
    </li>
  );
}

/**
 * Which side of the thread a turn sits on (M66, ISC-627).
 *
 * Yours on the right: what you typed, and a decline you pressed, whose words
 * ("I don't know.") are yours. A note that is neither person's message, the
 * tool setting its own question aside or a change of subject, is a centred
 * line. Everything else Abductive said is on the left.
 */
export function turnSide(entry: Pick<TranscriptEntry, "kind" | "setAsideFor">): "tool" | "you" | "system" {
  if (entry.kind === "human") return "you";
  if (entry.kind === "refusal") return entry.setAsideFor === undefined ? "you" : "system";
  if (entry.kind === "redirection") return "system";
  return "tool";
}

/** A row's place in a run: a bubble on one side, or a row that ends a run. */
export type ChatSide = "tool" | "you" | "break";

/**
 * Which bubbles carry the tail (M66, ISC-627): the last of each run from one
 * side, as in Messages. A time, the saved note or a centred line ends a run.
 */
export function tailFlags(sides: readonly ChatSide[]): boolean[] {
  return sides.map((side, i) => side !== "break" && sides[i + 1] !== side);
}

/** More than this between two turns, and a time sits between them (Messages' rule). */
export const CHAT_STAMP_GAP = 10 * 60 * 1000;

/**
 * Where the centred times go (M66, ISC-627): one opening the thread, at its
 * first timed turn, and one before any turn said more than ten minutes after
 * the turn before it. Keyed by the turn the time sits above.
 */
export function chatStamps(
  entries: readonly Pick<TranscriptEntry, "id" | "ts">[],
  gap: number = CHAT_STAMP_GAP,
): { readonly lead?: number; readonly before: ReadonlyMap<string, number> } {
  const before = new Map<string, number>();
  let lead: number | undefined;
  let previous: number | undefined;
  for (const entry of entries) {
    if (entry.ts === undefined) continue;
    if (lead === undefined) lead = entry.ts;
    else if (previous !== undefined && entry.ts - previous > gap) before.set(entry.id, entry.ts);
    previous = entry.ts;
  }
  return lead === undefined ? { before } : { lead, before };
}

/** A centred time: "Today at 14:05", "3 September 2026 at 09:30". */
export function chatStampLabel(ts: number, now: number = Date.now()): string {
  const moment = formatMoment(ts, now);
  return moment.charAt(0).toUpperCase() + moment.slice(1);
}

function ChatStamp(props: { ts: number }) {
  return (
    <li className="chat-stamp" data-testid="chat-stamp">
      <time dateTime={new Date(props.ts).toISOString()}>{chatStampLabel(props.ts)}</time>
    </li>
  );
}

/** The classes on a bubble: its side, and the tail on the last of a run. */
function bubbleClass(side: "tool" | "you", tail: boolean, extra: string): string {
  return `${extra} chat-turn chat-bubble chat-${side}${tail ? " chat-tail" : ""}`;
}

/** The blocks this column can render, in no particular order. */
/** A turn's time, for the hover title. */
export function turnTime(ts: number): string {
  return formatMoment(ts);
}

export type DialogueSlot = "record" | "open" | "status" | "chat";

/**
 * Where each block goes, given the state of the exchange (ISC-357, ISC-377, M37).
 *
 * Extracted rather than inlined into the JSX because the ordering is the whole
 * claim being made here and a claim buried in a ternary cannot be tested
 * except by reading the file with a regex, which this project has already been
 * bitten by once.
 *
 * The rule it used to encode was that whatever the researcher can act on next
 * sits directly under the station card, which flipped the column depending on
 * whether a question was on the table: with one open the record went first,
 * with none the menu of next questions did. M37 removes the flip along with the
 * menu. The conversation is the record and the live thing at once, the box you
 * type in sits under it the way a chat box sits under a transcript, and the
 * order is the same whatever state the exchange is in. Two exceptions survive
 * and both are about a question that cannot be answered here:
 *
 *   - A question open at another station ("elsewhere"): a line saying where
 *     the question is, then the chat box, because writing here steers the
 *     conversation to this place and sets that question aside (a redirection
 *     on the record); no offered set, because the orchestrator refuses a
 *     selection while one is outstanding.
 *   - A question open and filed under no station ("unplaced"): only possible in
 *     studies predating ISC-367. There is nowhere to point at, so it is shown
 *     in full and answered from wherever the researcher is standing.
 *
 * M47 drops the "redirect" slot. It held a labelled field reading "Or say what
 * you want to work on instead", which asked the researcher to name a topic in
 * prose when the rail beside them is already the list of steps, and the owner
 * read it on the demo and could not say what it was for. The redirection event
 * (ISC-47) is untouched: writing at a step while a question waits at another
 * one records it, asking the tool for directions records it, and picking one of
 * the offered questions records it.
 */
export type OpenQuestionPlace = "none" | "here" | "elsewhere" | "unplaced";

export function dialogueOrder(
  live: boolean,
  readOnly = false,
  open: OpenQuestionPlace = "none",
): readonly DialogueSlot[] {
  // Read-only is the record and nothing else. The Ontology view reads the
  // conversation against the pages it produced; talking belongs at a place,
  // where there is a place to record the turn against.
  if (readOnly) return ["record"];
  // The chat box stays: writing here sets the other question aside (a
  // redirection, ISC-47) and lands the message at this place. The offered set
  // does not, because a selection is refused while a question is outstanding.
  /* M58: the thread is always above the composer, whatever is open where. */
  if (open === "elsewhere") return ["open", "record", "status", "chat"];
  if (open === "unplaced") return ["open", "record", "status", "chat"];
  return ["record", "status", "chat"];
}

export interface TranscriptEntry {
  readonly id: string;
  /** When the turn was said, for the hover title and the saved-answer mark. */
  readonly ts?: number;
  /** The researcher stopped this tool turn part way (M58). */
  readonly cutShort?: true;
  /**
   * The opener at a step, whose question the bubble at the head of the step
   * shows (M74b, ISC-664). Its prose is drawn without a closing question and
   * without the question line, so the question is on screen once.
   */
  readonly opener?: true;
  /**
   * A turn of the conversation, whose question is the model's own (M37). Its
   * prose is drawn whole when it ends on the question, so the question on
   * screen is the one the record keeps (M74b, the walk's finding 3).
   */
  readonly conversational?: true;
  readonly kind: "question" | "agent" | "human" | "refusal" | "redirection";
  readonly text: string;
  readonly label?: string;
  /**
   * The canonical question this turn delivered, when it delivered one.
   *
   * A question exists as two events by design: the deterministic selection,
   * which is what makes the tool auditable, and the model's turn, which reacts
   * to the last answer and puts the question in context. Rendering both as
   * sibling cards showed the researcher the same sentence twice in a row, the
   * second time inside a paragraph that had just finished leading up to it.
   * One card now, with the model's reaction above and the selected question
   * below it, so the question on screen is still provably the selected one.
   */
  readonly question?: string;
  /**
   * The station this turn belongs to, when it has one.
   *
   * A refusal and an answer inherit it from the question they reply to, so a
   * whole exchange stays together. Turns from studies that predate M26 have
   * none and belong to the study rather than to a station.
   */
  readonly station?: string;
  /**
   * On a refusal the tool wrote itself, why it wrote one (D9, M43).
   *
   * Absent on a refusal the researcher pressed, which is what keeps "I declined
   * this" and "the tool closed its own question to do what I asked" two facts
   * rather than one. Resolved by `views/setAside.ts`, which also reads the pairs
   * written before the field existed, so the prompt digest and this card cannot
   * come to two readings of one turn.
   */
  readonly setAsideFor?: SetAsideReason;
  /**
   * The sentences that the voice retry rewrote in this turn (M69, ISC-644): the
   * sentences shown that the model's first reply did not contain. Present only
   * on a tool turn recorded with `voiceRetry` and `rawText`.
   */
  readonly settled?: readonly string[];
}

/**
 * How long after a turn lands its rewritten sentences fade into place (M69).
 *
 * The lead's ruling of 2026-10-02: the chat streams, so the retry runs after
 * the stream ends, and the one or two rewritten sentences replace their
 * originals in place with a short fade, so the researcher sees a settle rather
 * than a jump. A turn read later, or on a reload, draws plainly.
 */
export const VOICE_SETTLE_WINDOW_MS = 10_000;

/** The sentences of `shown` that the model's first reply, `raw`, did not contain. */
export function settledSentences(shown: string, raw: string | undefined): readonly string[] {
  if (raw === undefined) return [];
  const first = raw.replace(/\s+/g, " ");
  return shown
    .split(/\n+/)
    .flatMap((line) => sentencesOf(line.trim()))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== "" && !first.includes(sentence));
}

/** The text with each settled sentence wrapped in the span that fades it in. */
function withSettled(text: string, settled: readonly string[]): ReactNode {
  if (settled.length === 0) return text;
  const parts: ReactNode[] = [];
  let rest = text;
  for (let key = 0; ; key += 1) {
    let at = -1;
    let found = "";
    for (const sentence of settled) {
      const i = rest.indexOf(sentence);
      if (i >= 0 && (at < 0 || i < at)) {
        at = i;
        found = sentence;
      }
    }
    if (at < 0) break;
    if (at > 0) parts.push(rest.slice(0, at));
    parts.push(
      <span key={key} className="chat-settle" data-testid="voice-settled">
        {found}
      </span>,
    );
    rest = rest.slice(at + found.length);
  }
  if (rest !== "") parts.push(rest);
  return parts;
}

/**
 * The turns belonging to one station (ISC-368, ISC-369).
 *
 * A station stops being a label on a question and becomes a place you can
 * work: the exchange you had about site selection is at site selection, and
 * the whole conversation is on the Ontology view. Turns with no station —
 * anything recorded before M26 — are not shown at a station, because guessing
 * which one they belonged to would be inventing record.
 *
 * `carry` is the exception that keeps the whole thing honest. A question can be
 * outstanding at one station while the researcher is standing at another, and
 * the answer box is available everywhere by design: a tool that makes you walk
 * back to a station before it will listen is the gating v2 was built to
 * remove. Filtering without this rendered an answer box under an empty
 * conversation, which is the exact defect the M25 ordering work was for, typing
 * at a question you cannot see.
 */
export function turnsAtStation(
  entries: readonly TranscriptEntry[],
  station: string,
  carry: ReadonlySet<string> = new Set(),
): readonly TranscriptEntry[] {
  return entries.filter((e) => e.station === station || carry.has(e.id));
}

/**
 * Ids of the turns making up one exchange: the question, whatever delivered
 * it, and whatever replied to it. Used to carry an outstanding question into
 * a station it was not asked at.
 */
export function exchangeIds(
  events: readonly LedgerEvent[],
  questionEventId: string,
): ReadonlySet<string> {
  const ids = new Set<string>([questionEventId]);
  for (const e of events) {
    if (e.type === "response" && e.inReplyTo === questionEventId) ids.add(e.id);
    if (e.type === "refusal" && e.questionEventId === questionEventId) ids.add(e.id);
  }
  return ids;
}

/** A place as the end of "at …": "the Process step", or "your starting point" (M74b). */
function askedAt(place: string): string {
  return isStationId(place) ? `the ${stationLabel(place)} step` : "your starting point";
}

/** Flatten the ledger into a readable transcript. Pure; exported for tests. */
export function buildTranscript(events: readonly LedgerEvent[]): readonly TranscriptEntry[] {
  // Which refusals the tool wrote itself, and why (D9). One reading, here,
  // because the card below and the prompt digest both read it.
  const setAside = setAsideReasons(events);
  const topicByEvent = new Map<string, string>();
  // Which selection each agent turn is delivering, so the selection does not
  // also get a card of its own. An undelivered selection — the model call
  // failed, or is still streaming — has no entry here and still renders alone,
  // because the researcher has to be able to see the question either way.
  const deliveredBy = new Map<string, string>();
  for (const event of events) {
    if (event.type === "response" && event.actor !== "human" && event.inReplyTo !== undefined) {
      // First delivery wins. A second turn pointing at the same selection is a
      // retry or a follow-up, and attaching the question to the later one
      // would move the question down the page after the fact.
      if (!deliveredBy.has(event.inReplyTo)) deliveredBy.set(event.inReplyTo, event.id);
    }
  }
  const questionFor = new Map<string, string>();
  const labelFor = new Map<string, string>();
  /* M74b, ISC-664: which delivered turns are openers, and which are the
   * conversation's own. An opener before M74b carries no mark, so the first
   * conversation question at a place, put before the researcher wrote there, is
   * read as one. */
  const openerFor = new Set<string>();
  const conversationalFor = new Set<string>();
  const spokenAt = new Set<string>();
  // An answer and a refusal belong to the station of the question they reply
  // to, not to wherever the researcher happens to be standing when the
  // projection runs. Keeping a whole exchange together is the point of
  // scoping at all.
  const stationOfQuestion = new Map<string, string>();
  const stationFor = new Map<string, string>();

  const out: TranscriptEntry[] = [];
  for (const event of events) {
    switch (event.type) {
      case "question-selection": {
        topicByEvent.set(event.id, event.topic);
        if (event.station !== undefined) stationOfQuestion.set(event.id, event.station);
        /* D23 and D24b. The step is named by one builder rather than by a
         * template here: the bind's label already carries an article, and a
         * question picked out of the offered set is filed under what it is about
         * rather than under where it was asked. */
        const label = toolTurnLabel({
          mode: event.mode,
          topic: event.topic,
          ...(event.station === undefined ? {} : { station: event.station }),
        });
        const deliverer = deliveredBy.get(event.id);
        const conversational = isConversationMove(event.moveId);
        const opener =
          event.opener === true ||
          (conversational && event.station !== undefined && !spokenAt.has(event.station));
        if (event.station !== undefined) spokenAt.add(event.station);
        if (deliverer !== undefined) {
          questionFor.set(deliverer, event.question);
          labelFor.set(deliverer, label);
          if (event.station !== undefined) stationFor.set(deliverer, event.station);
          if (conversational) conversationalFor.add(deliverer);
          if (opener) openerFor.add(deliverer);
          break;
        }
        out.push({
          id: event.id,
          ts: event.ts,
          kind: "question",
          text: event.question,
          label,
          ...(event.station === undefined ? {} : { station: event.station }),
        });
        break;
      }
      case "response": {
        /* Three ways a turn knows where it was said, in order of authority.
         *
         * The first is the delivery of a question, which takes the question's
         * place. The second is a turn that carries its own place, which is what
         * M37 added: a message sent with nothing outstanding, or a reply from
         * the tool that asked nothing, has no question to inherit from. The
         * third is a reply to a question, which takes that question's place so
         * a whole exchange stays together. Turns from studies that predate M26
         * have none of the three and belong to the study rather than to a
         * place. */
        const inherited =
          stationFor.get(event.id) ??
          event.station ??
          (event.inReplyTo === undefined ? undefined : stationOfQuestion.get(event.inReplyTo));
        if (inherited !== undefined) spokenAt.add(inherited);
        /* M69, ISC-644: the sentences the voice retry rewrote, read against the
           model's first reply, which the record keeps in rawText. */
        const raw = (event as { readonly rawText?: string }).rawText;
        const settled =
          event.actor !== "human" && event.voiceRetry === true
            ? settledSentences(`${event.text}\n${questionFor.get(event.id) ?? ""}`, raw)
            : [];
        out.push({
          id: event.id,
          ts: event.ts,
          kind: event.actor === "human" ? "human" : "agent",
          text: event.text,
          ...(settled.length === 0 ? {} : { settled }),
          /* Every turn carries a label, the researcher's included (D17).
           *
           * Their typed turns carried none, so on the walk of 2026-09-13 the only
           * unattributed speech in the record was the researcher's own, on a tool
           * whose claim is that you can always see who said what. A tool turn
           * that delivered no question has no selection to take a label from, and
           * "asking" stood there as the label for a turn that asked nothing. */
          label:
            event.actor === "human"
              ? researcherTurnLabel(inherited)
              : (labelFor.get(event.id) ?? toolReplyLabel(inherited)),
          ...(questionFor.has(event.id)
            ? { question: questionFor.get(event.id) as string }
            : {}),
          ...(inherited === undefined ? {} : { station: inherited }),
          ...(event.cutShort === true ? { cutShort: true as const } : {}),
          ...(openerFor.has(event.id) ? { opener: true as const } : {}),
          ...(conversationalFor.has(event.id) ? { conversational: true as const } : {}),
        });
        break;
      }
      case "refusal": {
        const inherited = stationOfQuestion.get(event.questionEventId);
        // topicLabel here too. The question turn was translated at M16 and
        // this one was not, so declining printed the raw routing key with a
        // page uuid on the end of it.
        const where = topicLabel(topicByEvent.get(event.questionEventId) ?? "");
        /* The tool's own bookkeeping, said as the tool's (D9).
         *
         * Two cards, because they are two different things that happened: the
         * researcher passing on a question, and the tool closing its question to
         * do what they asked next. The step is in the sentence rather than in
         * the kicker so the words the reader meets are not the step's name
         * twice. */
        const reason = setAside.get(event.id);
        if (reason !== undefined) {
          out.push({
            id: event.id,
            ts: event.ts,
            kind: "refusal",
            text: setAsideLine(reason, where),
            label: SET_ASIDE_LABEL,
            setAsideFor: reason,
            ...(inherited === undefined ? {} : { station: inherited }),
          });
          break;
        }
        out.push({
          id: event.id,
          ts: event.ts,
          kind: "refusal",
          text:
            event.kind === "dont-know"
              ? "I don't know."
              : event.kind === "not-now"
                ? "Not now."
                : "I won't answer that question.",
          label: `declined · ${where}`,
          ...(inherited === undefined ? {} : { station: inherited }),
        });
        break;
      }
      /* M74b, ISC-665: the chips' own events. "I don't know" is the
       * researcher's line, as the refusal was; "Ask me differently" is a centred
       * line saying what they asked for, at which step. */
      case "dont-know": {
        const inherited = stationOfQuestion.get(event.questionEventId);
        out.push({
          id: event.id,
          ts: event.ts,
          kind: "refusal",
          text: "I don't know.",
          label: researcherTurnLabel(inherited),
          ...(inherited === undefined ? {} : { station: inherited }),
        });
        break;
      }
      case "ask-differently":
        out.push({
          id: event.id,
          ts: event.ts,
          kind: "refusal",
          text: `You asked for a different question at ${askedAt(event.station)}.`,
          label: SET_ASIDE_LABEL,
          setAsideFor: "directions",
          station: event.station,
        });
        break;
      case "redirection":
        out.push({
          id: event.id,
          ts: event.ts,
          kind: "redirection",
          text: event.toTopic,
          label: "You, changing the subject",
        });
        break;
      default:
        break;
    }
  }
  return out;
}
