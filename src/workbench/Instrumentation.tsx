/**
 * Instrumentation, collapsed by default (ISC-63, ISC-64, ISC-65).
 *
 * Collapsed because it is evidence about the session rather than part of
 * doing the work, and a researcher watching their own coverage bar while
 * answering will start answering for the bar. Available in one click, because
 * the moment it becomes hard to reach it stops being checked at all.
 *
 * The guide-as-territory panel renders the gap in both directions: cells the
 * matrix names and the session never reached, and topics the session spent
 * real turns on that no cell anticipated. The second list is the one that
 * feeds back into the matrix.
 */

import { CUT_SHORT_LINE } from "../interview/topicLabel.ts";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  EdgeRole,
  LedgerEvent,
  LedgerEventType,
  OntologyOp,
  PageType,
  Verdict,
} from "../ledger/events.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import { Divergence } from "../views/Divergence.tsx";
import { CoverageMap } from "../views/CoverageMap.tsx";
import type { SessionSpine } from "../views/spineModel.ts";
import type { TerritorySummary } from "../views/territoryModel.ts";
import type { TrajectorySummary } from "../views/trajectoryModel.ts";
import type { ConceptRelation, Origin } from "../ledger/events.ts";
import {
  droppedLine,
  evidencePhrase,
  RELATION_PHRASE,
  relationSentence,
  sourcePhrase,
  stepName,
} from "../concepts/vocabulary.ts";
import { STATION_IDS, resolveStationId, stationById, type StationId } from "../flow/stations.ts";
// D54 (M43d). A finding is filed at the step its rule speaks to. M89: the
// readings History needs outlived the checks in views/flagHistory.ts.
import { stationForRule, structuralParts } from "../views/flagHistory.ts";
import { countOf, formatClock, formatDate, formatDay } from "../ui/format.ts";
import { modeWord, topicLabel } from "../interview/topicLabel.ts";
import { Disclosure, EmptyState, Field, StatusChip } from "../ui/components/index.ts";
import { PASSAGE_WORD, passageRef } from "../ui/materialVocabulary.ts";
// The three literals that stood here shared every value with graphLayout's
// PAGE_TYPE_COLOUR, so the trajectory legend and the page list said different
// things with the same swatch (FND-04). The ink ramp that replaced them was
// this file's own channel and nobody else's, which is how the two figures a
// researcher actually reads each ended up inventing a third and fourth. Origin
// is fill share now, out of one module, on all four surfaces.
import { COLOUR } from "../ui/tokens.ts";
import { originLabel } from "../ui/originVocabulary.ts";
import { pageTypePhrase, untypedPagePhrase } from "../ui/pageTypeVocabulary.ts";
import type { OriginCensus } from "../ontology/attribution.ts";
import { OriginMark } from "../ui/components/index.ts";
// M40, ISC-509. A reading's row names the places it read from, in the words the
// band names them in, out of the one projection that decides them.
import { readFromLabels, readFromSentence } from "../views/puzzleReading.ts";
import { FRAMING_PLACE_ID } from "../views/placeSummary.ts";
import { FRAMING_PLACE } from "../interview/conversation.ts";
import { FRAMING_SUBJECT } from "../flow/stationBrief.ts";
import { isStudyTab, STUDY_TAB_LABEL } from "../ui/routes.ts";


/**
 * What this section is called, wherever it is called something (M38).
 *
 * The panel in the study header renders its own heading, because a dialog needs
 * an accessible name before its contents exist. Exported rather than typed
 * twice, so the control, the heading and the section cannot come apart.
 */
export const RECORD_TITLE = "History";

export function Instrumentation(props: {
  territory: TerritorySummary;
  spine: SessionSpine;
  trajectory: TrajectorySummary;
  /** Who wrote the live pages. Read by the ledger rows, not by a panel here. */
  attribution: OriginCensus;
  /** Carried forward from v1: timeline, flags, divergence, three-layer coverage. */
  events: readonly LedgerEvent[];
  chunks: readonly Chunk[];
  documents: readonly StoredDocument[];
  /**
   * Rendered inside a surface that has already named it and already opened it
   * (M38, ISC-494).
   *
   * The record is reached from the study header now, and the press that opens
   * the panel is the one press the reader should need. A section arriving inside
   * an open panel carrying its own heading, its own "Show the record" button and
   * its own fold about what a record is would be three levels where the
   * criterion allows one, with the timeline last of the three.
   *
   * So `hosted` drops those three and renders the body. It changes neither what
   * the body holds nor the order it holds it in, and the standalone form above
   * is untouched for anything that still mounts this on a page of its own.
   */
  hosted?: boolean;
  /**
   * The kinds the timeline starts filtered to (D51, M43d).
   *
   * Set when a count on another surface opened the record, so the press lands on
   * the entries the number was counting. Empty, or absent, is every kind.
   */
  kinds?: readonly LedgerEventType[];
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  if (props.hosted === true) {
    return (
      <section className="instrumentation" data-testid="instrumentation" data-hosted="true">
        <Body {...props} />
      </section>
    );
  }
  return (
    <section
      className="instrumentation"
      data-testid="instrumentation"
      aria-labelledby={`${uid}-title`}
    >
      {/* Nothing named this section. A bare button read "Show how this session
          has gone", the paragraph above it named attention, stations and the
          ontology, and the word "ledger" appeared nowhere on the page until you
          pressed the button: the record was the one thing the product's pitch
          rests on and the only path to it was a control that did not contain
          the word. A researcher searching the screen for "ledger", "record" or
          "audit trail" found nothing to click. The heading says it out loud,
          collapsed or open, and the button repeats it. */}
      {/* M28: copy. "Ledger" is the term of art and "the record" is what a
          reader already knows, so the heading leads on the plain phrase and
          glosses the term once, here, where the section starts. */}
      <h2 className="instrumentation-title" id={`${uid}-title`}>
        History
      </h2>
      {/* R3 item 6. One sentence, then the control, then the definition behind
          a fold. It was 48 words and three sentences before the button, which is
          the shape the flow critic failed four blocks in the product for. */}
      <p className="small muted instrumentation-why">
        Show a reviewer how you arrived at this design.
      </p>
      <button
        type="button"
        className="instrumentation-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="instrumentation-toggle"
      >
        {open ? "Hide History" : "Show History"}
      </button>
      {/* M62, ISC-600: History's fold moved into the page's Help control (ui/pageHelp.ts). */}
      {open && <Body {...props} />}
    </section>
  );
}

/**
 * The record itself, and the three readings under it (M38).
 *
 * Split out so the panel in the study header renders exactly this, with the
 * timeline first and nothing folded in front of it, and so the standalone
 * section above renders the same thing when it is opened. Two copies of this
 * list would be two records.
 */
function Body(props: {
  territory: TerritorySummary;
  spine: SessionSpine;
  trajectory: TrajectorySummary;
  attribution: OriginCensus;
  events: readonly LedgerEvent[];
  chunks: readonly Chunk[];
  documents: readonly StoredDocument[];
  kinds?: readonly LedgerEventType[];
}) {
  return (
    <div className="instrumentation-body" data-testid="instrumentation-body">
      {/* First and full width. Every other panel here is a reading of the
          session; this one is the session, and it was the panel a
          side-by-side against the incumbents named as the missing thing.
          It sat seventh, in a 395px track, 5092px tall for 44 events. */}
      <LedgerView events={props.events} {...(props.kinds === undefined ? {} : { only: props.kinds })} />
      <TerritoryView territory={props.territory} />
      <SpineView spine={props.spine} />
      <AskingView events={props.events} />
      {/* M30: "How your model moved" is gone from this tab.
        *
        * The trajectory's two readings are both about the model rather than
        * about the session, and both were rendered here, on the Design tab,
        * under a fold, on a page about answering questions. What the account
        * cannot explain and whether that list has ever grown is the most
        * useful thing the tool computes, and it now stands on the page that
        * bears the model's name, in `ui/model/ResiduePanel.tsx`, with the
        * claims it is a count of directly above it.
        *
        * The open call the note here left, whether the mutation census the
        * panel also carried should follow it, was answered by R10: it did,
        * as `ui/model/ModelMovement.tsx`, folded under the claims table on
        * Your model. The panel is gone from this file rather than left
        * exported and unmounted, so the census over recorded mutations and
        * the census over live claims now sit one above the other on one
        * page, each naming its own denominator, which is the property
        * `attribution-population.test.ts` exists to hold. */}
      {/* The h3 that stood here read "Attention across the corpus" over a
          CoverageMap whose own h2 read "Coverage map": two headings, one
          panel, 40px of vertical space spent saying the same thing twice.
          The map owns its title now. */}
      <div className="panel" data-testid="coverage-panel">
        <CoverageMap
          events={props.events}
          chunks={props.chunks}
          documents={props.documents}
        />
      </div>
      {/* M89 (2026-10-14): the bias flag panel, a count of flags per square of
          the bias grid on Checks, stood here until the checks left main. The
          flags themselves stay in the timeline above. */}
      <div className="panel" data-testid="divergence-panel">
        <Divergence events={props.events} />
      </div>
    </div>
  );
}

export interface AskingSummary {
  /** Questions put as questions. */
  readonly asked: number;
  /** Turns that put a proposal in front of the researcher instead. */
  readonly offered: number;
  /** Turns the tool spoke. */
  readonly turns: number;
  /** Of those, the ones carrying language that supplies an answer. */
  readonly leaked: number;
}

/**
 * How the tool has been putting things, counted off the record (M37, ISC-486).
 *
 * Two numbers that answer different questions about the same session. The
 * ask-and-propose split says how often the tool asked rather than proposed,
 * which is the ratio the interview loop has computed since ISC-53 and which no
 * surface had ever drawn. The second is new: every turn the tool speaks is
 * scanned on the way out for language that supplies an answer, and this is how
 * many were caught. Neither blocks anything. A researcher who can see that the
 * tool answered its own question eleven times out of forty knows something
 * about their transcript that no amount of reading it back would tell them.
 */
export function askingSummary(
  events: readonly LedgerEvent[],
  projectId?: string,
): AskingSummary {
  let asked = 0;
  let offered = 0;
  let turns = 0;
  let leaked = 0;
  for (const event of events) {
    if (projectId !== undefined && event.projectId !== projectId) continue;
    if (event.type === "question-selection") {
      if (event.mode === "interrogation") asked += 1;
      else offered += 1;
    }
    if (event.type === "response" && event.actor !== "human") {
      turns += 1;
      if ((event.answerLeaks ?? []).length > 0) leaked += 1;
    }
  }
  return { asked, offered, turns, leaked };
}

export function AskingView(props: { events: readonly LedgerEvent[] }) {
  const summary = askingSummary(props.events);
  return (
    <div className="panel" data-testid="asking-view">
      <h3>Questions that Abductive asked, and claims that Abductive suggested</h3>
      <p className="small muted" data-testid="asking-split">
        {countOf(summary.asked, "question")} asked · {summary.offered} suggested as a claim
      </p>
      {/* The row the outgoing scan feeds. Phrased as a count of turns rather
          than as a verdict on any one of them, because the scan is blunt on
          purpose: it costs a rewrite when it is wrong and it costs the study's
          provenance when it is missed. */}
      <p className="small muted" data-testid="answer-leaks">
        Turns where Abductive supplied an answer: {summary.leaked} of {summary.turns}
      </p>
    </div>
  );
}

export function TerritoryView(props: { territory: TerritorySummary }) {
  const { territory } = props;
  return (
    <div className="panel" data-testid="territory-view">
      <h3>Squares of the bias grid that this session has been near</h3>
      <p className="small muted">
        {territory.engaged} you engaged with · {territory.raised} Abductive raised and you did not
        take up · {territory.untouched} untouched
      </p>
      <ul className="territory-grid">
        {territory.cells.map((cell) => (
          <li
            key={cell.cellId}
            className={`territory-cell ${cell.coverage}`}
            data-cell-id={cell.cellId}
            data-coverage={cell.coverage}
            title={`${cell.cellId}: ${cell.flag} (${cell.coverage})`}
          >
            <span className="small">{cell.bias}</span>
            <span className="small muted">{cell.context}</span>
          </li>
        ))}
      </ul>
      <div data-testid="unmapped-topics">
        <h4 className="small">Topics that you and Abductive went to and that the bias grid doesn't name</h4>
        {territory.unmappedTopics.length === 0 ? (
          <p className="small muted">Abductive watches every topic so far.</p>
        ) : (
          <ul className="small unmapped-list">
            {/* Was the raw topic: "station:context: 3 turns", "puzzle:root: 1
                turn". This list is the matrix's own revision mechanism, so it
                is the last place the routing key should be what the reader
                gets. The key is still on the row, in the title. */}
            {territory.unmappedTopics.map((t) => (
              <li key={t.topic} title={t.topic}>
                {topicLabel(t.topic)}: {t.turns} turn{t.turns === 1 ? "" : "s"}
                {t.researcherInitiated ? ", you steered to this topic" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The spine's turn label, inside the width the figure actually has.
 *
 * The viewBox is 420 units wide and the label starts at 44, so anything past
 * about 63 characters is drawn outside the box and clipped by it, with nothing
 * on screen saying it was cut. That was survivable while the label was a slug
 * and became a defect the moment it became a sentence.
 *
 * 63 is measured rather than guessed: 376 units of 13-unit type at the 0.459em
 * average advance this app's own prose runs at. The budget below keeps three
 * characters in hand.
 *
 * The topic gives way and the outcome never does. Budgeting the whole string
 * instead produced rows ending in the mode and then a mark, which drops the one
 * word the column is scanned for. The untruncated topic stays in the title.
 */
export function spineLabel(topic: string, mode: string, outcome: string): string {
  const tail = ` \u00b7 ${modeWord(mode)} \u00b7 ${outcome}`;
  const subject = topicLabel(topic);
  const budget = Math.max(12, 60 - tail.length);
  return subject.length <= budget
    ? `${subject}${tail}`
    : `${subject.slice(0, budget - 1)}\u2026${tail}`;
}

export function SpineView(props: { spine: SessionSpine }) {
  const { spine } = props;
  const rowHeight = 34;
  const height = Math.max(spine.turns.length * rowHeight + 20, 60);
  const branchX = (b: number) => 30 + b * 46;

  return (
    <div className="panel" data-testid="spine-view">
      <h3>The shape of this session</h3>
      <p className="small muted">
        {spine.turns.length} message{spine.turns.length === 1 ? "" : "s"} · {spine.branchCount}{" "}
        time{spine.branchCount === 1 ? "" : "s"} you went to another step · {spine.barrenTurns}{" "}
        that left your ontology unchanged
      </p>
      {spine.turns.length === 0 ? (
        <p className="small muted">Your first message is still to come.</p>
      ) : (
        <svg
          className="spine"
          viewBox={`0 0 420 ${height}`}
          role="img"
          aria-label="Session spine"
        >
          {spine.turns.map((turn, i) => {
            const y = 20 + i * rowHeight;
            const previous = spine.turns[i - 1];
            const x = branchX(turn.branch);
            return (
              <g key={turn.id} data-turn-index={turn.index} data-outcome={turn.outcome}>
                {previous !== undefined && (
                  <line
                    x1={branchX(previous.branch)}
                    y1={y - rowHeight}
                    x2={x}
                    y2={y}
                    /* A branch change is a thing that happened in the session,
                       not a thing that went wrong, and it was drawn in the hue
                       this app deletes a study in. The weight already carries
                       it: 2.5 against 1.5 is the difference the eye reads here,
                       and the colour was only ever agreeing with it. */
                    stroke={
                      previous.branch === turn.branch ? COLOUR["line-strong"] : COLOUR["ink-strong"]
                    }
                    strokeWidth={previous.branch === turn.branch ? 1.5 : 2.5}
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={turn.mutations > 0 ? 7 : 4}
                  fill={
                    turn.outcome === "answered"
                      ? COLOUR.ok
                      : turn.outcome === "refused"
                        ? COLOUR.notice
                        : turn.outcome === "abandoned"
                          ? /* Walking away from a turn is first-class and is
                               never penalised, and this painted it in the
                               destroy hue. The four outcomes are four steps of
                               ink now, so the spine reads as a record rather
                               than as a scorecard. */
                            COLOUR["ink-strong"]
                          : COLOUR["line-strong"]
                  }
                />
                {/* Was `{turn.topic}`, so the spine printed
                    "lint:phenomenon-troubling-no-theory:b19b3f86-5963-4c18-b592"
                    and clipped it at the viewBox edge: a routing key and a uuid,
                    in a figure whose whole job is to be read at a glance. The
                    key is in the <title> for anyone who needs it. */}
                <text className="spine-label" x={x + 14} y={y + 4} fill={COLOUR.ink}>
                  <title>{turn.topic}</title>
                  {spineLabel(turn.topic, turn.mode, turn.outcome)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {spine.branches.length > 0 && (
        <ul className="small" data-testid="spine-branches">
          {spine.branches.map((b) => (
            <li key={`${b.atTurnIndex}-${b.toTopic}`}>
              After turn {b.atTurnIndex + 1}: {b.fromTopic ?? "a moment without an open question"} → {b.toTopic}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The ledger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every event, readable.
 *
 * The append-only ledger is the product's central claim and there was no way to
 * read it inside the tool. What stood here was `views/Timeline.tsx`: seventeen
 * checkboxes stacked into a wall, then one card per event with the actor in a
 * pill, the stamp spelled out as "3 August 2026 at 23:55" on every row, and the
 * summary dropped onto its own line underneath. Measured on the fixture at
 * innerWidth 1440 with the panel open: 44 events, 5092px tall, 116px per event,
 * inside a 395px grid track with 820px of the instrumentation body empty beside
 * it. A real study has thousands of events. At that rate the ledger for one is
 * a hundred metres of scroll.
 *
 * Four things carry the density here, and none of them is smaller type.
 *
 * The stamp is banded rather than repeated. A row shows a clock and the day is
 * a band above the rows that share it, so 44 rows spend one line on the date
 * instead of 44.
 *
 * The columns are fixed and the prose is clipped to one line. What a researcher
 * scans a ledger for is the shape of a run of events, and a wrapped summary
 * destroys the shape: the eye has to re-find the left edge on every row. The
 * full text is one click away on the row itself, with the whole stored event
 * under it, which is what makes this an audit trail rather than a feed.
 *
 * "What it changed" is its own column and it is derived, not stored. An
 * adjudication names a challenge id; the ledger shows the cell that challenge
 * came from. A proposal decision names a proposal id; the ledger shows the
 * title. A finding decision names a finding id; the ledger shows the rule. The
 * ids were what the old view printed, and an id is not what was changed.
 *
 * Kinds filter by family first, seventeen at once being a filter nobody uses.
 * The five families are the five kinds of thing that happen in a study, and the
 * seventeen individual kinds are folded away for when the family is too coarse.
 *
 * Station is derived too, and it has to be: only `question-selection` carries
 * one. An answer and a refusal inherit the station of the question they reply
 * to, the same inheritance `Dialogue.turnsAtStation` already uses, and anything
 * else takes the station that was in force when it landed. Events from before
 * stations existed have none and read as belonging to the study, because
 * guessing would be inventing record.
 */

/**
 * The six kinds of thing that happen in a study.
 *
 * "record" is the sixth and it arrived with the `export` event. Taking a file
 * out of the study is not a conversation, a design move, a model act, a check
 * or a piece of material, and filing it under any of those would have made the
 * filter row lie about what it was hiding. It is the one family whose rows the
 * researcher produced by leaving the tool.
 */
export type LedgerFamily =
  | "conversation"
  | "design"
  | "model"
  | "checks"
  | "material"
  | "record";

/**
 * A row's kind is its event type (M74a, ISC-662). The two chips get kinds of
 * their own when M74b's `dont-know` and `ask-differently` events land, with
 * their lines in the three maps below written by M74b (the lead's ruling,
 * 2026-10-02). A refusal row that a chip wrote before then keeps the refusal
 * kind and says in its own words which chip it was.
 */
export type HistoryKind = LedgerEventType | "abductive-reply";

/**
 * M78a, ISC-680: a reply's kind follows its author. The serendipity walk counted
 * RSP 79 under "your answer", the student's 34 replies and Abductive's 45
 * together. Every reply event records its actor, so old events split the same way.
 */
export function historyKind(event: LedgerEvent): HistoryKind {
  if (event.type === "response" && event.actor !== "human") return "abductive-reply";
  return event.type;
}

/** The families in reading order. Exported so a test asserts against the list rather than against a transcription of its length. */
export const LEDGER_FAMILIES: readonly LedgerFamily[] = [
  "conversation",
  "design",
  "model",
  "checks",
  "material",
  "record",
];

const FAMILY_LABEL: Readonly<Record<LedgerFamily, string>> = {
  conversation: "Conversation",
  design: "Your design",
  model: "Your ontology",
  checks: "Checks",
  material: "Sources",
  /* M42. "Taken out" told a reader nothing. The team lead's reading asked for
   * "Files removed", which would be false: a removal is filed under material, and
   * this family holds the `export` kind alone. See KIND_FAMILY below. */
  record: "Files that you exported",
};

/**
 * Kind to family, and the only list of kinds in this file.
 *
 * The old view kept a second hand-written array of the seventeen beside the
 * mark table, which is the drift the stations file warns about in its own
 * header. The keys of this record are the list, in family order, so the filter
 * rows and the checkbox grid cannot disagree about what exists, and a
 * seventeenth-plus-one event type fails to compile until it is placed.
 */
const FAMILY_OF: Readonly<Record<HistoryKind, LedgerFamily>> = {
  "question-selection": "conversation",
  response: "conversation",
  "abductive-reply": "conversation",
  refusal: "conversation",
  redirection: "conversation",
  /* M74b, ISC-665 (the lead's ruling): the chips' own kinds. */
  "dont-know": "conversation",
  "ask-differently": "conversation",
  bound: "design",
  "ontology-mutation": "design",
  "puzzle-collapse": "design",
  // A draft of the researcher's own words, offered into a step's box. It is
  // part of answering rather than part of the model's output, which is why it
  // is filed with the conversation that produced it.
  "brief-draft": "conversation",
  // The tool reading the puzzle out of the answers that are already on the
  // record. Filed with the design rather than with the conversation, because a
  // reading is about what the researcher has bound and never about a turn: no
  // conversation triggers one and turns are not sources.
  "puzzle-reading": "design",
  proposal: "model",
  "proposal-adjudication": "model",
  challenge: "model",
  adjudication: "model",
  flag: "checks",
  // The run that produces the flags above, filed with them: a reader looking at
  // what the checks did should see both the pass and what it concluded.
  "bias-scan": "checks",
  "lint-finding": "checks",
  "finding-disposition": "checks",
  // A verdict on one of the papers the researcher named, which is material.
  "paper-fit": "material",
  // What the researcher said one of those papers bears on (M51), filed beside
  // the judgement it answers.
  "paper-bearing": "material",
  "document-removed": "material",
  "saturation-check": "checks",
  attention: "material",
  reveal: "material",
  export: "record",
  /* M63, ISC-608. A suggested concept is Abductive's output, filed with the other
   * suggestions; what the researcher does with it is part of the design. The
   * report and the flags it places are the checks' own rows. */
  "concept-suggested": "model",
  "concept-accepted": "design",
  "concept-refined": "design",
  "concept-rejected": "design",
  "concept-property-set": "design",
  "concept-relation-set": "design",
  "concept-relation-removed": "design",
  "statement-attached": "design",
  "look-for-raised": "model",
  "look-for-settled": "design",
  "readiness-report": "checks",
  "concept-flag": "checks",
  /* M67, ISC-631. A relation card is filed where a concept is: the suggestion and
   * the proposed homes are Abductive's output, the decisions are the design. */
  "relation-suggested": "model",
  "relation-accepted": "design",
  "relation-refined": "design",
  "relation-rejected": "design",
  "relation-claim-set": "design",
  "relation-conditions-set": "design",
  "relation-statement-attached": "design",
  "homes-proposed": "model",
  "statement-suggested": "model",
  "statement-rejected": "design",
  /* M82, ISC-695: a card's "Why it matters" line and the argument so far. */
  "concept-retired": "design",
  "why-suggested": "model",
  "why-accepted": "design",
  "why-refined": "design",
  "argument-written": "model",
  /* M90, ISC-733: a concept that Abductive left out because its name joined more than one concept. */
  "suggestion-dropped": "model",
  /* M93: every model output the researcher keeps is a decision on the record. */
  "why-rejected": "design",
  "argument-accepted": "design",
  surfacing: "model",
  "reading-accepted": "design",
  "draft-declined": "design",
  "property-rejected": "design",
  /* M95, ISC-778: the help chat is a conversation of its own, beside the interview's. */
  "help-asked": "conversation",
  "help-answered": "conversation",
};

export const LEDGER_KINDS = Object.keys(FAMILY_OF) as readonly HistoryKind[];

/**
 * The kinds a freshly opened timeline shows (D51, M43d).
 *
 * Every kind by default, which is what the record is. A list means a count
 * somewhere else asked for these, and an empty list means the control that opened
 * the panel was not counting anything in particular.
 */
export function startingKinds(
  only: readonly LedgerEventType[] | undefined,
): ReadonlySet<HistoryKind> {
  if (only === undefined || only.length === 0) return new Set(LEDGER_KINDS);
  /* M78a: a count of the conversation's replies counts both authors' replies. */
  return new Set<HistoryKind>([...only, ...(only.includes("response") ? (["abductive-reply"] as const) : [])]);
}

/**
 * Three letters per kind, carried over unchanged from the view this replaces.
 *
 * A researcher who has read the old panel should not have to relearn the codes,
 * and three monospaced characters in a fixed column is the cheapest kind marker
 * that survives being printed.
 */
const KIND_MARK: Readonly<Record<HistoryKind, string>> = {
  bound: "BND",
  "brief-draft": "DFT",
  "puzzle-reading": "PZL",
  challenge: "CHG",
  flag: "FLG",
  "bias-scan": "SCN",
  attention: "ATT",
  response: "RSP",
  "abductive-reply": "ARP",
  adjudication: "ADJ",
  reveal: "RVL",
  "ontology-mutation": "ONT",
  proposal: "PRP",
  "proposal-adjudication": "PAD",
  "question-selection": "ASK",
  redirection: "RDR",
  refusal: "RFS",
  "dont-know": "DNK",
  "ask-differently": "ADF",
  "saturation-check": "SAT",
  "puzzle-collapse": "CLP",
  "lint-finding": "LNT",
  "finding-disposition": "FDS",
  "paper-fit": "FIT",
  "paper-bearing": "BRG",
  "document-removed": "RMV",
  export: "OUT",
  "concept-suggested": "CSG",
  "concept-accepted": "CAC",
  "concept-refined": "CRF",
  "concept-rejected": "CRJ",
  "concept-property-set": "CPR",
  "concept-relation-set": "CRL",
  "concept-relation-removed": "CRX",
  "statement-attached": "STM",
  "look-for-raised": "LFR",
  "look-for-settled": "LFS",
  "readiness-report": "RDY",
  "concept-flag": "CFL",
  "relation-suggested": "RSG",
  "relation-accepted": "RAC",
  "relation-refined": "RRF",
  "relation-rejected": "RRJ",
  "relation-claim-set": "RCL",
  "relation-conditions-set": "RCN",
  "relation-statement-attached": "RST",
  "homes-proposed": "HOM",
  "statement-suggested": "SSG",
  "statement-rejected": "SRJ",
  "concept-retired": "CRT",
  "why-suggested": "WSG",
  "why-accepted": "WAC",
  "why-refined": "WRF",
  "argument-written": "ARG",
  "suggestion-dropped": "SDR",
  "why-rejected": "WRJ",
  "argument-accepted": "AAC",
  surfacing: "SRF",
  "reading-accepted": "RAC",
  "draft-declined": "DDC",
  "property-rejected": "PRJ",
  "help-asked": "HLQ",
  "help-answered": "HLA",
};

/**
 * What each kind is called in the filter and in a row's accessible name.
 *
 * Every label says who did what (M42). Nine of them were bare nouns: "question",
 * "answer", "declined", "change of subject", "boundary", "draft". A reader ten
 * minutes into their first study cannot tell from "question" whether they asked
 * it or the tool did, and the record's whole job is to say who did what, in what
 * order. The three-letter marks beside them are unchanged, and tests pin those.
 *
 * "saturation check" and "puzzle collapse" keep their names: both are the tool's
 * own act and neither has a plainer word that is still true.
 */
const KIND_LABEL: Readonly<Record<HistoryKind, string>> = {
  bound: "an answer that you saved",
  /* M62, ISC-598: the act is a summary of the conversation, as the control says. */
  "brief-draft": "an answer that Abductive summarised from the conversation",
  // The tool's, said so in the filter as well as in the row, because the filter
  // is where a reader decides what to look at and "puzzle read" alone would read
  // as something the researcher did.
  "puzzle-reading": "a puzzle that Abductive read",
  /* M74a, ISC-662: this and `question-selection` read "a question that Abductive
     asked you" and "a question that Abductive asked". A challenge is raised
     about the design; a selection is the conversation's next question. */
  challenge: "a question that Abductive raised about your design",
  flag: "a bias flag that Abductive raised",
  "bias-scan": "an answer that Abductive read for bias flags",
  attention: "a passage that you opened",
  /* M78a, ISC-680: a reply, the conversation's word; the researcher's and Abductive's apart. */
  response: "your reply",
  "abductive-reply": "Abductive's reply",
  // M28: copy. "adjudication" and "ontology change" were the two rows in this
  // filter a reader had to already know the tool to parse, and both name a
  // thing the reader did rather than a thing the tool has.
  adjudication: "your decision",
  reveal: "you asked to see the ordinary version",
  "ontology-mutation": "a change to your ontology",
  proposal: "a claim that Abductive suggested",
  "proposal-adjudication": "your decision on a suggestion",
  "question-selection": "a question that Abductive asked in the conversation",
  /* M74a, ISC-662: every redirection the walk recorded was a change of step. */
  redirection: "you went to another step",
  refusal: "a question that you declined",
  "dont-know": "you said you don't know",
  "ask-differently": "you asked for a different question",
  "saturation-check": "a saturation check",
  "puzzle-collapse": "a puzzle that collapsed",
  "lint-finding": "a flag from a check",
  /* D41 (M43d). Was "your decision on a finding", which made the count of 36
   * read as 36 decisions the researcher had made. Three of them were the judge
   * withdrawing its own notices, and the Who column beside the gloss already
   * says which rows those are. */
  "finding-disposition": "a decision on a flag",
  "paper-fit": "a paper that Abductive judged",
  "paper-bearing": "your answer about a paper and your setting",
  "document-removed": "a file that you removed",
  export: "a file that you took out",
  "concept-suggested": "a concept that Abductive suggested",
  "concept-accepted": "a concept that you accepted",
  "concept-refined": "a concept that you refined",
  "concept-rejected": "a concept that you rejected",
  "concept-property-set": "a property that you set",
  "concept-relation-set": "a relation that you set",
  "concept-relation-removed": "a relation that you removed",
  "statement-attached": "a statement that you placed",
  "look-for-raised": "a line to look for, from Abductive",
  "look-for-settled": "a line to look for, settled",
  "readiness-report": "a readiness report that Abductive wrote",
  "concept-flag": "a flag that Abductive placed at a concept",
  "relation-suggested": "a relation that Abductive suggested",
  "relation-accepted": "a relation that you accepted",
  "relation-refined": "a relation that you refined",
  "relation-rejected": "a relation that you rejected",
  "relation-claim-set": "a claim that you wrote for a relation",
  "relation-conditions-set": "conditions that you wrote for a relation",
  "relation-statement-attached": "a statement that you placed under a relation",
  "homes-proposed": "homes that Abductive proposed for statements",
  "statement-suggested": "a statement that Abductive suggested",
  "statement-rejected": "a statement that you rejected",
  "concept-retired": "a concept that you retired",
  "why-suggested": "a Why it matters line that Abductive wrote",
  "why-accepted": "a Why it matters line that you accepted",
  "why-refined": "a Why it matters line that you wrote",
  "argument-written": "the argument so far, from Abductive",
  "suggestion-dropped": "a suggestion that Abductive left out",
  "why-rejected": "a Why it matters line that you rejected",
  "argument-accepted": "the argument so far, as you accepted it",
  surfacing: "concepts and relationships that you asked Abductive to surface",
  "reading-accepted": "a puzzle reading that you accepted",
  "draft-declined": "a suggestion from Abductive that you declined",
  "property-rejected": "a suggested property that you rejected",
  "help-asked": "a help request that you made",
  "help-answered": "an answer from Abductive to a help request",
};

/** What a kind is called, for the filter, a row's name, and the tests. */
export function kindLabel(kind: HistoryKind): string {
  return KIND_LABEL[kind];
}

/**
 * The kinds that change the model since M63 (M74a, ISC-662). The walk read
 * "a change to your model" 0 beside three accepted concepts: the row counted
 * `ontology-mutation` alone, which concepts, relations and statements no longer
 * write. Rejections are left out, because a rejection keeps the model as it was.
 */
const MODEL_CHANGES: readonly HistoryKind[] = [
  "ontology-mutation",
  "concept-accepted",
  "concept-refined",
  "concept-property-set",
  "concept-relation-set",
  "concept-relation-removed",
  "statement-attached",
  "relation-accepted",
  "relation-refined",
  "relation-claim-set",
  "relation-conditions-set",
  "relation-statement-attached",
  "why-accepted",
  "why-refined",
  "concept-retired",
];

/** Each suggested statement arrives with its proposed home (M67), so it counts as one. */
const HOME_KINDS: readonly HistoryKind[] = ["homes-proposed", "statement-suggested"];

/** A kind whose row in the filter stands for several, so its count and its box cover them all. */
const KIND_GROUP: Readonly<Partial<Record<HistoryKind, readonly HistoryKind[]>>> = {
  "ontology-mutation": MODEL_CHANGES,
  "homes-proposed": HOME_KINDS,
};

function members(kind: HistoryKind): readonly HistoryKind[] {
  return KIND_GROUP[kind] ?? [kind];
}

/**
 * How many entries each kind's row counts (M74a, ISC-662). One per event, but
 * "a change to your model" counts every event that changes the model, and
 * "homes that Abductive proposed for statements" counts proposed homes, which
 * the walk read as 0 beside 38.
 */
export function kindCounts(events: readonly LedgerEvent[]): ReadonlyMap<HistoryKind, number> {
  const counts = new Map<HistoryKind, number>();
  let homes = 0;
  for (const e of events) {
    const kind = historyKind(e);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (e.type === "homes-proposed") homes += e.proposals.length;
    if (e.type === "statement-suggested") homes += 1;
  }
  counts.set("ontology-mutation", MODEL_CHANGES.reduce((n, k) => n + (counts.get(k) ?? 0), 0));
  counts.set("homes-proposed", homes);
  return counts;
}

const VERDICT_WORD: Readonly<Record<Verdict, string>> = {
  accept: "Accepted the challenge",
  revise: "Sent the challenge back for revision",
  reject: "Rejected the challenge",
  defer: "Deferred the challenge",
  ignored: "Left the challenge unanswered",
};

/**
 * The page types, written out, with the article that belongs to each.
 *
 * There was no phrase at all once. The summary read
 * `${OP_WORD[op]} ${pageType ?? "a relation"}`, and a slug interpolated after a
 * verb produced two defects at once on the surface the whole product rests on.
 * On the density-200 fixture, 200 of 200 visible rows read "Joined two pages a
 * relation", because OP_WORD.relate was already a whole clause and the fallback
 * landed as a second bare noun phrase after it. On the main fixture the article
 * was hard-coded, so a proposal of an observation read "Drafted a observation":
 * one hit for an "a" before a vowel in a rendered-DOM scan, and it was this.
 *
 * Both are the same defect. A sentence assembled out of a verb table and a slug
 * cannot know its own grammar, so the article is part of the phrase and every
 * op below builds a whole clause rather than gluing two fragments together.
 *
 * What changed this round is where the words live. The fix above was a private
 * table of seven noun phrases in this file, which made it the fifth vocabulary
 * for one value: the index said "analytic residue", the detail card said
 * "analytic-residue", the tray said "something your account does not absorb",
 * the exported legend said "analytic-residue" and this ledger said "an
 * analytic residue page". The phrase is derived from the module's label and
 * its stored article now, so the ledger cannot drift from the index. The
 * rendered strings are unchanged: `pageTypePhrase` composes exactly the seven
 * pairs this table held.
 */

/** The page phrase, or the one that works when the event named no type. */
function pagePhrase(type: PageType | undefined, form: "a" | "the"): string {
  return type === undefined ? untypedPagePhrase(form) : pageTypePhrase(type, form);
}

/**
 * What an edge asserts, as the end of a sentence rather than as a role slug.
 *
 * The eight roles are argumentative claims and the ledger is the surface an
 * outside reader is shown, so "stands-to" has to arrive as the framing claim it
 * is and not as a hyphenated key.
 */
const ROLE_PHRASE: Readonly<Record<EdgeRole, string>> = {
  predicts: "as a prediction",
  contradicts: "as a contradiction",
  resolves: "as a resolution",
  rivals: "as a rival account",
  bounds: "as a scope condition",
  evidences: "as evidence",
  "tensions-with": "as a tension",
  "stands-to": "as the motivating claim",
};

/** The two chips' rows, from the old refusal events and from M74b's own (M74a, ISC-662). */
const CHIP_WORD: Readonly<Record<"dont-know" | "ask-differently", string>> = {
  "dont-know": "You said you don't know",
  "ask-differently": "You asked for a different question",
};

const REFUSAL_WORD: Readonly<Record<"dont-know" | "not-now" | "wont-answer", string>> = {
  "dont-know": "Said you don't know",
  "not-now": "Set the question aside for now",
  "wont-answer": "Declined to answer",
};

const PROPOSAL_WORD: Readonly<Record<"accept" | "reject" | "merge" | "defer", string>> = {
  accept: "Accepted the suggestion",
  reject: "Rejected the suggestion",
  merge: "Merged the suggestion into a claim that you already had",
  defer: "Deferred the suggestion",
};

/** What a verdict on a paper reads as in the record. */
const PAPER_FIT_WORD: Readonly<Record<"fits" | "unclear" | "misfit", string>> = {
  fits: "Judged this paper a fit for your setting",
  unclear: "Couldn't tell whether this paper fits your setting",
  misfit: "Judged that this paper doesn't fit your setting",
};

const FINDING_WORD: Readonly<Record<"acknowledged" | "not-applicable", string>> = {
  acknowledged: "Acknowledged the flag",
  "not-applicable": "Marked the flag as not applying",
};

/**
 * The same row when the tool settled the finding rather than the researcher
 * (D41, M43d).
 *
 * `retireMisfit` writes a `finding-disposition` as `system` when a re-judgement
 * clears a paper or the paper leaves the list, and both words above are written
 * in the researcher's voice. The walk of 2026-09-13 read three rows saying the
 * researcher had recorded that a finding did not apply, over a study where they
 * had recorded nothing of the kind, and the FDS count read 36 decisions against
 * the 33 they had made.
 */
const WITHDRAWAL_WORD = "Abductive withdrew a flag that it had raised";

const REVEAL_WORD: Readonly<Record<"stage-gate" | "on-demand", string>> = {
  "stage-gate": "Opened when the project reached the stage that it belongs to",
  "on-demand": "Opened on request, ahead of the stage that it belongs to",
};

const LAYER_WORD: Readonly<Record<"retrieval" | "citation" | "human", string>> = {
  retrieval: `A ${PASSAGE_WORD} went into the model's context`,
  citation: `A check cited a ${PASSAGE_WORD}`,
  human: `You opened or stayed with a ${PASSAGE_WORD}`,
};

/** One name and one value in the expanded view of a row. */
export interface LedgerField {
  readonly name: string;
  readonly value: string;
}

/** One event, as the table reads it. */
export interface LedgerRow {
  readonly id: string;
  readonly ts: number;
  readonly kind: HistoryKind;
  readonly family: LedgerFamily;
  /** The raw actor, for the filter to match on. */
  readonly actor: string;
  /** The actor as a person would say it. */
  readonly who: string;
  /** What happened, in one clause. */
  readonly happened: string;
  /** The object it changed, resolved through whatever id the event carried. */
  readonly changed: string;
  /** Set on ontology changes, so the row can carry the attribution mark. */
  readonly origin?: Origin;
  /** Absent on events from before stations existed. */
  readonly station?: string;
  /** Every stored field, for the expanded row. */
  readonly fields: readonly LedgerField[];
}

const ENVELOPE = new Set(["id", "ts", "actor", "projectId", "type"]);

function shortId(id: string): string {
  return id.slice(0, 8);
}

/**
 * The actor, said rather than spelled.
 *
 * The old view printed the stored value, so the ledger addressed the researcher
 * as "human" and the tool as "system" in the one place in the app whose whole
 * job is to be read by an outside auditor. The persona prefix is stripped the
 * same way `views/Divergence.tsx` strips it.
 */
/**
 * Who did it, in the Who filter and in a row's accessible name: "you" or
 * "Abductive". M42 gave the roles the tool writes under a hat each ("Abductive,
 * asking questions") and a creed from the bias grid read "Abductive, as
 * eisenhardt positivist"; M74a (ISC-662) reads every persona as Abductive.
 */
export function actorLabel(actor: string): string {
  if (actor === "human") return "you";
  /* M74a, ISC-662 (the walk, finding 16): every persona is Abductive. The Who
     filter offered "Abductive, as eisenhardt positivist" and two more creed
     names a student can't place; the role a row was written under stays in
     the row's stored fields. */
  return "Abductive";
}

/**
 * A station id read as its rail label, or the id when it is not one.
 *
 * `resolveStationId` as of M27 (D3): rows written before the challenge and
 * tension stations merged still carry those ids, and an auditor reading the
 * ledger should see the station's name rather than a retired key.
 */
function stationLabel(id: string): string {
  // M61 walk: the framing's place id reached the Step filter as "framing".
  if (id === FRAMING_PLACE_ID) return STUDY_TAB_LABEL.motivation;
  const station = resolveStationId(id);
  return station === undefined ? id : stationById(station).label;
}

const DECLINE_READS: Readonly<Record<string, string>> = {
  "not-yet": "set aside for now",
  "not-applicable": "doesn't apply to this project",
};

/**
 * What a boundary is about, said rather than keyed.
 *
 * `bound.subject` is `<station>`, `<station>:<declination>`, or one of the two
 * fixed subjects the brief writes. Measured on the fixture, the column read
 * "context:not-applicable" and "context:not-yet" five rows running, which is
 * the interior vocabulary `interview/topicLabel.ts` was written to keep off
 * the screen, in the one panel an outside auditor reads.
 */
/**
 * The subject a draft was made for (ISC-592). A step's draft is its station.
 * A Starting point draft names its answer in `field`; one from before ISC-592
 * has none and was always the interest. So History names "papers" or "target
 * journal" rather than the internal place id "framing".
 */
export function briefDraftSubject(event: { readonly station: string; readonly field?: string }): string {
  if (event.station !== FRAMING_PLACE) return event.station;
  const field = (event.field ?? "startingInterest") as keyof typeof FRAMING_SUBJECT;
  return FRAMING_SUBJECT[field] ?? FRAMING_SUBJECT.startingInterest;
}

/** The page a help request came from, as its tab reads, with the step on Design (M95). */
function helpPlace(page: string, station: string | undefined): string {
  const tab = isStudyTab(page) ? STUDY_TAB_LABEL[page] : page;
  return station === undefined ? tab : `${tab}, at ${stationLabel(station)}`;
}

function boundSubjectLabel(subject: string): string {
  const [head, tail] = subject.split(":");
  const station = head === undefined ? undefined : resolveStationId(head);
  if (station !== undefined) {
    const label = stationById(station).label;
    if (tail === undefined) return label;
    return `${label}, ${DECLINE_READS[tail] ?? tail}`;
  }
  return subject.replace(/-/g, " ");
}

/**
 * A matrix cell, in the glossary's words. `topicLabel` already resolves the
 * `cell:` shape into "confirmation at the design brief", so the cell id is
 * handed to it with that prefix rather than given a second renderer here. The
 * raw id is still on the row, in the expanded fields.
 */
function cellLabel(cellId: string): string {
  return topicLabel(`cell:${cellId}`);
}

/** `station:site` is a topic naming a station, which is a station. */
function stationFromTopic(topic: string): string | undefined {
  const suffix = topic.startsWith("station:") ? topic.slice("station:".length) : undefined;
  return suffix === undefined ? undefined : resolveStationId(suffix);
}

function stringifyValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0 ? "none" : value.map((v) => stringifyValue(v)).join(", ");
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .map(([key, inner]) => `${fieldName(key)} ${stringifyValue(inner)}`)
      .join(", ");
  }
  return String(value);
}

/**
 * A stored key, as English. `inReplyTo` reads as "in reply to".
 *
 * One key is renamed rather than spaced out. `supportingChunks` came through as
 * "supporting chunks", which is the internal noun for the object /material calls
 * a passage, printed to the researcher inside an expanded ledger row. Same class
 * as the origin slug that `fieldValue` below exists to stop, one column to the
 * left: a value with a canonical human name, rendered by its internal one.
 */
function fieldName(key: string): string {
  if (key === "supportingChunks") return `supporting ${PASSAGE_WORD}s`;
  return key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

/**
 * Origin is the one stored value with a canonical word, and the expanded row
 * is rendered text like any other. Printing the slug here would have put
 * "author-prior" in front of a researcher on a screen whose own summary line
 * three pixels above says "yours".
 */
function fieldValue(key: string, value: unknown): string {
  if (key === "origin" && typeof value === "string") return originLabel(value as Origin);
  return stringifyValue(value);
}

function eventFields(event: LedgerEvent): readonly LedgerField[] {
  const out: LedgerField[] = [];
  for (const [key, value] of Object.entries(event as unknown as Record<string, unknown>)) {
    if (ENVELOPE.has(key) || value === undefined) continue;
    out.push({ name: fieldName(key), value: fieldValue(key, value) });
  }
  return out;
}

interface LedgerIndex {
  readonly topicOf: ReadonlyMap<string, string>;
  readonly cellOfChallenge: ReadonlyMap<string, string>;
  readonly titleOfProposal: ReadonlyMap<string, string>;
  readonly ruleOfFinding: ReadonlyMap<string, string>;
  readonly stationOf: ReadonlyMap<string, string>;
  /**
   * Page title by target id, so a relation can name the two pages it joined.
   * Without it every relate row said "Joined two pages" and put an eight-char
   * id in the object column beside it, which is the id the reader was already
   * unable to resolve.
   */
  readonly titleOfPage: ReadonlyMap<string, string>;
  /** M63. Each concept's name as it stood when the row was written, latest first. */
  readonly nameOfConcept: ReadonlyMap<string, string>;
  /** M63. Each relation's two ends and its kind, so a removal can say what it removed. */
  readonly relationOf: ReadonlyMap<string, { readonly from: string; readonly to: string; readonly relation: ConceptRelation }>;
  /** M63. Each field line's text, so a settled row can say which line it settled. */
  readonly textOfLookFor: ReadonlyMap<string, string>;
  readonly textOfSuggestedStatement: ReadonlyMap<string, string>;
}

/**
 * The step behind a structural finding's derived id (D54, M43d).
 *
 * A structural finding is recomputed rather than recorded, so a dismissal
 * against it points at `structural:<rule>:<target>` and no `lint-finding` event
 * exists to take the step from. The rule is in the id, and the rule is what
 * decides the step.
 */
function derivedRuleStation(findingId: string): StationId | undefined {
  const parts = structuralParts(findingId);
  return parts === undefined ? undefined : stationForRule(parts.rule);
}

function indexLedger(events: readonly LedgerEvent[]): LedgerIndex {
  const topicOf = new Map<string, string>();
  const cellOfChallenge = new Map<string, string>();
  const titleOfProposal = new Map<string, string>();
  const ruleOfFinding = new Map<string, string>();
  const stationOf = new Map<string, string>();
  /** Each finding's step, so a decision about it is filed where the finding is. */
  const stationOfFinding = new Map<string, StationId | undefined>();
  const titleOfPage = new Map<string, string>();
  const nameOfConcept = new Map<string, string>();
  const relationOf = new Map<string, { from: string; to: string; relation: ConceptRelation }>();
  const textOfLookFor = new Map<string, string>();
  const textOfSuggestedStatement = new Map<string, string>();
  let standing: string | undefined;

  for (const event of events) {
    switch (event.type) {
      case "question-selection": {
        topicOf.set(event.id, event.topic);
        const named = event.station ?? stationFromTopic(event.topic);
        if (named !== undefined) {
          standing = named;
          stationOf.set(event.id, named);
        }
        break;
      }
      case "challenge":
        if (event.matrixCell !== undefined) cellOfChallenge.set(event.id, event.matrixCell);
        break;
      case "proposal":
        titleOfProposal.set(event.proposalId, event.title);
        break;
      case "lint-finding": {
        ruleOfFinding.set(event.id, event.rule);
        /* The rule's own step, never the step the run was pressed from (D54,
         * M43d). A finding is placed by what would have to move if the
         * researcher agreed with it, which is what `RULE_STATION` maps and what
         * the cards and the Checks facets already read. Falling through to the
         * standing station stamped all nine findings of the walk's second run as
         * Early data while the cards routed six to Context, two to Sample and
         * one to The bind. */
        const home = stationForRule(event.rule);
        if (home !== undefined) stationOf.set(event.id, home);
        stationOfFinding.set(event.id, home);
        break;
      }
      case "ontology-mutation":
        // The latest title wins, because a revise renames the page and a
        // relation recorded after it should read under the name it has now.
        if (event.title !== undefined) titleOfPage.set(event.targetId, event.title);
        break;
      case "concept-suggested":
        if (!nameOfConcept.has(event.conceptId)) nameOfConcept.set(event.conceptId, event.name);
        break;
      case "concept-accepted":
      case "concept-refined":
        if (event.name !== undefined) nameOfConcept.set(event.conceptId, event.name);
        break;
      case "concept-relation-set":
      case "relation-suggested":
        if (event.type === "concept-relation-set" || !relationOf.has(event.relationId)) {
          relationOf.set(event.relationId, { from: event.from, to: event.to, relation: event.relation });
        }
        break;
      case "look-for-raised":
        textOfLookFor.set(event.itemId, event.text);
        break;
      case "statement-suggested":
        textOfSuggestedStatement.set(event.statementId, event.text);
        break;
      /* M95: a help request sits at the step it was asked at, or at none. */
      case "help-asked":
        if (event.station !== undefined) stationOf.set(event.id, event.station);
        break;
      default:
        break;
    }

    if (!stationOf.has(event.id)) {
      /* A check's rows are placed by the rule and by nothing else (D54, M43d).
       * A rule with no step of its own belongs to the study as a whole, which is
       * what the column says when nothing is stamped, so neither kind may fall
       * through to whichever question happened to be open. */
      if (event.type === "lint-finding") continue;
      /* M95: help is placed by the request, never by whichever question was open. */
      if (event.type === "help-asked") continue;
      if (event.type === "help-answered") {
        const at = stationOf.get(event.asked);
        if (at !== undefined) stationOf.set(event.id, at);
        continue;
      }
      if (event.type === "finding-disposition") {
        const placed = stationOfFinding.get(event.findingId) ?? derivedRuleStation(event.findingId);
        if (placed !== undefined) stationOf.set(event.id, placed);
        continue;
      }
      const inherited =
        event.type === "response" && event.inReplyTo !== undefined
          ? stationOf.get(event.inReplyTo)
          : event.type === "refusal"
            ? stationOf.get(event.questionEventId)
            : undefined;
      const station = inherited ?? standing;
      if (station !== undefined) stationOf.set(event.id, station);
    }
  }

  return {
    topicOf,
    cellOfChallenge,
    titleOfProposal,
    ruleOfFinding,
    stationOf,
    titleOfPage,
    nameOfConcept,
    relationOf,
    textOfLookFor,
    textOfSuggestedStatement,
  };
}

/** A concept, named as History last recorded it, or by its short id. */
function conceptName(index: LedgerIndex, conceptId: string): string {
  return index.nameOfConcept.get(conceptId) ?? shortId(conceptId);
}

/** A relation as the sentence between its two concept names (M67). */
function relationName(index: LedgerIndex, relationId: string): string {
  const rel = index.relationOf.get(relationId);
  return rel === undefined ? "a relation" : relationSentence(conceptName(index, rel.from), rel.relation, conceptName(index, rel.to));
}

/** The card a Why it matters line belongs to, by name (M82). */
function whyTargetName(index: LedgerIndex, target: { readonly kind: "concept" | "relation"; readonly id: string }): string {
  return target.kind === "concept" ? conceptName(index, target.id) : `"${relationName(index, target.id)}"`;
}

/** An edge end, named if the ledger ever recorded a name for it. */
type Edge = { readonly from: string; readonly to: string; readonly role: EdgeRole };

/**
 * The whole clause for one ontology op. Whole, and that is the point.
 *
 * What this replaces built the sentence as verb-plus-noun out of two tables
 * that did not know about each other, so the relate verb ("Joined two pages")
 * and the page-type fallback ("a relation") both arrived and the row read as
 * the concatenation it was. Every branch below returns a finished clause, so
 * there is nothing left for a caller to glue on.
 */
function ontologyClause(op: OntologyOp, pageType: PageType | undefined, edge: Edge | undefined): string {
  switch (op) {
    case "create":
      return `Created ${pagePhrase(pageType, "a")}`;
    case "revise":
      return `Revised ${pagePhrase(pageType, "the")}`;
    case "retire":
      // Retirement supersedes and never deletes, and a ledger that says
      // "Retired" without saying so invites the reader to assume the page is
      // gone from the record it is reading.
      return `Retired ${pagePhrase(pageType, "the")}, superseded rather than deleted`;
    case "reinstate":
      return `Brought ${pagePhrase(pageType, "the")} back`;
    /* M44. The holder itself is not in this row: the object column carries the
     * page, the reason column carries no `heldBy`, and a summary that quoted the
     * researcher's sentence would clip it at the same width every other cell
     * clips a title at. The card on Your model prints the holder in full. */
    case "mark":
      return `Marked ${pagePhrase(pageType, "the")} as held in the setting`;
    // The two pages are named in the object column beside this, not here.
    // Naming them in both was measured on the density-200 fixture and the row
    // read "Joined Probe page 39: a title long enough to wrap across the label
    // lin…": every cell in the table is one line clipped, so two titles in the
    // summary pushed the role and the origin off the right edge of all 200
    // rows and said the same two names twice on the ones that fitted. The
    // summary carries the claim the edge makes, the object column carries what
    // it was made between.
    case "relate":
      return edge === undefined ? "Joined two claims" : `Joined two claims ${ROLE_PHRASE[edge.role]}`;
    case "unrelate":
      return edge === undefined
        ? "Removed a link between two claims"
        : `Removed a link that stood ${ROLE_PHRASE[edge.role]}`;
  }
}

/**
 * What an ontology change acted on, for the object column.
 *
 * A page carries its title. A relation carries neither a title nor anything a
 * reader can resolve, so the column printed `shortId(targetId)`: an eight-char
 * hex on every relate row, in the column whose whole job is to say what was
 * touched in words (ISC-26).
 */
function ontologyObject(
  title: string | undefined,
  edge: Edge | undefined,
  targetId: string,
  index: LedgerIndex,
): string {
  if (title !== undefined) return title;
  if (edge !== undefined) {
    const from = index.titleOfPage.get(edge.from);
    const to = index.titleOfPage.get(edge.to);
    if (from !== undefined && to !== undefined) return `the link between ${from} and ${to}`;
    return "the relation";
  }
  return `the page ${shortId(targetId)}`;
}

/** A topic in the researcher's words, or the fallback when there was no topic. */
function topicOrDefault(topic: string | undefined, fallback: string): string {
  return topic === undefined ? fallback : topicLabel(topic);
}

/** What happened, and what it changed, for one event. */
function describeEvent(
  event: LedgerEvent,
  index: LedgerIndex,
): { readonly happened: string; readonly changed: string } {
  /* M74b's chip events, read before the switch so this file renders them
     whether or not the event union names them yet. */
  const type = (event as { readonly type: string }).type;
  if (type === "dont-know" || type === "ask-differently") {
    const question = (event as { readonly questionEventId?: string }).questionEventId;
    return {
      happened: CHIP_WORD[type],
      changed: topicOrDefault(question === undefined ? undefined : index.topicOf.get(question), "a question"),
    };
  }
  switch (event.type) {
    case "bound":
      /* M93, ISC-767: a save that began as Abductive's draft says whether you changed it. */
      return {
        happened:
          event.draftedFrom === undefined || event.edited === undefined
            ? event.statement
            : `${event.statement} (${event.edited ? "you edited Abductive's draft" : "Abductive's draft, as written"})`,
        changed: boundSubjectLabel(event.subject),
      };
    case "brief-draft": {
      const about = boundSubjectLabel(briefDraftSubject(event));
      // M62, ISC-598 (owner): History says what the act was. The changed column names the answer.
      return { happened: "Summarised from the conversation", changed: about };
    }
    /* M40, ISC-509. The tool's act, said as the tool's, in both columns.
     *
     * "Read the puzzle" with no subject would read as something the researcher did,
     * on a row whose actor column says a persona; the record's rule since M28 is
     * that a row names the thing the reader did or the thing the tool has, and this
     * is the second kind. The places come out of `views/puzzleReading.ts`, so the
     * sentence here and the line in the band cannot name different sources. */
    case "puzzle-reading":
      return {
        happened:
          event.text.trim() === ""
            ? "Abductive read the answers that you have saved and found the puzzle still to come"
            : `Abductive read the puzzle from ${readFromSentence(readFromLabels(event.sources))}`,
        changed: "the suggested puzzle",
      };
    case "challenge":
      return {
        happened: event.text,
        changed: event.matrixCell === undefined ? "the design" : cellLabel(event.matrixCell),
      };
    case "flag":
      return { happened: event.reason, changed: cellLabel(event.matrixCell) };
    case "bias-scan":
      return {
        happened:
          event.firedCells.length === 0
            ? "Abductive read your answer for bias flags and raised none"
            : `Abductive read your answer for bias flags and raised ${event.firedCells.length}`,
        changed: stationLabel(event.station),
      };
    case "attention":
      return { happened: LAYER_WORD[event.layer], changed: passageRef(event.chunkId) };
    case "response":
      return {
        /* M58: a turn the researcher stopped carries one line saying so. */
        happened: event.cutShort === true ? `${event.text}\n\n${CUT_SHORT_LINE}` : event.text,
        changed: topicOrDefault(
          event.inReplyTo === undefined ? undefined : index.topicOf.get(event.inReplyTo),
          "the conversation",
        ),
      };
    case "adjudication":
      return {
        happened:
          event.reason === undefined
            ? VERDICT_WORD[event.verdict]
            : `${VERDICT_WORD[event.verdict]}: ${event.reason}`,
        changed: (() => {
          const cell = index.cellOfChallenge.get(event.challengeId);
          return cell === undefined ? `challenge ${shortId(event.challengeId)}` : cellLabel(cell);
        })(),
      };
    case "reveal":
      return {
        // Was `Revealed by ${via.replace(/-/g, " ")}`, which rendered the two
        // stored values as "stage gate" and "on demand": the same
        // slug-with-the-hyphens-taken-out shape as the ontology row beside it,
        // and neither of them says what happened.
        happened: REVEAL_WORD[event.via],
        changed: event.subject.replace(/-/g, " "),
      };
    case "ontology-mutation":
      return {
        // "marked" rather than a bare comma. The origin word has to stay in the
        // summary (tests/ledger-panel.test.ts holds it there, because the disc
        // beside it is aria-hidden and the row would otherwise say the origin
        // to nobody), and appending it raw is what produced ", model-proposed"
        // hanging off the end of 200 rows. "marked X" ties the word to the mark
        // the object column draws and reads as a sentence with all three
        // labels.
        happened: `${ontologyClause(event.op, event.pageType, event.edge)}, marked ${originLabel(event.origin)}`,
        changed: ontologyObject(event.title, event.edge, event.targetId, index),
      };
    case "proposal":
      return {
        happened:
          event.pageType === undefined && event.edge !== undefined
            ? "Suggested a link between two claims for you to look at"
            : `Suggested ${pagePhrase(event.pageType, "a")} for you to look at`,
        changed: event.title,
      };
    case "proposal-adjudication":
      return {
        happened:
          event.reason === undefined
            ? PROPOSAL_WORD[event.disposition]
            : `${PROPOSAL_WORD[event.disposition]}: ${event.reason}`,
        changed:
          index.titleOfProposal.get(event.proposalId) ?? `proposal ${shortId(event.proposalId)}`,
      };
    case "question-selection":
      return { happened: event.question, changed: topicLabel(event.topic) };
    case "redirection": {
      /* M74a, ISC-662: a change of step names the step. */
      const step = stationFromTopic(event.toTopic);
      return {
        happened: step === undefined ? "You went to another question" : `You went to the ${stationLabel(step)} step`,
        changed: topicLabel(event.toTopic),
      };
    }
    case "refusal": {
      /* M74a, ISC-662: a row that a chip wrote says which chip it was. */
      const said =
        event.kind === "dont-know"
          ? CHIP_WORD["dont-know"]
          : event.kind === "not-now" && event.setAsideFor === "directions"
            ? CHIP_WORD["ask-differently"]
            : REFUSAL_WORD[event.kind];
      return {
        happened: event.note === undefined ? said : `${said}: ${event.note}`,
        changed: topicOrDefault(index.topicOf.get(event.questionEventId), "a question"),
      };
    }
    case "saturation-check":
      return {
        happened: `${event.mutationsInWindow} change${
          event.mutationsInWindow === 1 ? "" : "s"
        } to your ontology in the last ${event.windowTurns} turns, ${
          event.reached ? "which reads as saturated" : "which does not read as saturated"
        }`,
        changed: "your ontology, unchanged",
      };
    case "puzzle-collapse":
      return {
        happened: event.reason,
        changed: `${event.keptPuzzleIds.length} kept, ${event.supersededPuzzleIds.length} superseded`,
      };
    case "lint-finding":
      return {
        happened: event.reason,
        changed:
          event.targetId === ""
            ? `the ${event.targetKind}`
            : `${event.targetKind} ${shortId(event.targetId)}`,
      };
    case "finding-disposition": {
      /* Whose act this was (D41). The actor is on the envelope and the two
       * vocabularies are both in this file, so the row can say it without
       * inferring anything from the reason text. */
      const word = event.actor === "human" ? FINDING_WORD[event.disposition] : WITHDRAWAL_WORD;
      return {
        happened: event.reason === undefined ? word : `${word}: ${event.reason}`,
        changed: index.ruleOfFinding.get(event.findingId) ?? shortId(event.findingId),
      };
    }
    case "document-removed":
      return {
        happened:
          event.reason === undefined
            ? `Removed a ${event.documentKind}, and the ${countOf(event.passageCount, "passage")} in it`
            : `Removed a ${event.documentKind}, and the ${countOf(event.passageCount, "passage")} in it: ${event.reason}`,
        changed: event.documentName,
      };
    case "paper-fit":
      return {
        happened:
          event.reason === "" ? PAPER_FIT_WORD[event.verdict] : `${PAPER_FIT_WORD[event.verdict]}: ${event.reason}`,
        changed: event.paperName,
      };
    /* M51, ISC-533. The researcher's own sentence about a paper, in their words
     * and attributed to them. The judgement above stays on the record as the
     * tool's act; this is the answer to the question it produced. */
    case "paper-bearing":
      return {
        happened:
          event.startedFrom === undefined
            ? `You related this paper to your setting: ${event.reason}`
            : `You related this paper to your setting, ${event.edited === false ? "keeping Abductive's sentence as written" : "editing Abductive's sentence"}: ${event.reason}`,
        changed: event.paperName,
      };
    /* M63, ISC-608. The ontology's rows, each saying who did what in the copy
     * standard: Abductive suggests, raises, writes and places; you accept,
     * refine, reject, set, remove, place and settle. */
    /* M70 (the lead's ruling): a suggestion and its rejection name the section
     * that now holds them, Concepts, Relations or Statements to place, since the
     * "Suggested …" headings went when the tab took one section per kind. */
    case "concept-suggested":
      return {
        happened: `Abductive suggested the concept "${event.name}" from ${sourcePhrase(event.source, boundSubjectLabel)}`,
        changed: "Concepts",
      };
    case "concept-accepted": {
      const name = event.name ?? conceptName(index, event.conceptId);
      return {
        happened:
          event.origin === "author-prior"
            ? `You added the concept "${name}"`
            : `You accepted the concept "${name}", marked ${originLabel(event.origin)}`,
        changed: "Emerging project ontology",
      };
    }
    case "concept-refined": {
      const parts = [
        ...(event.name === undefined ? [] : [`the name now reads "${event.name}"`]),
        ...(event.definition === undefined ? [] : [`the definition now reads "${event.definition}"`]),
      ];
      return { happened: `You refined the concept: ${parts.join(", and ")}`, changed: conceptName(index, event.conceptId) };
    }
    case "concept-rejected":
      return {
        happened: `You rejected the concept "${conceptName(index, event.conceptId)}": ${event.reason}`,
        changed: "Concepts",
      };
    case "concept-property-set":
      return {
        happened:
          event.removed === true
            ? `You removed the property "${event.name}"`
            : event.varies === undefined
              ? `You set the property "${event.name}"`
              : `You set the property "${event.name}": ${event.varies}`,
        changed: conceptName(index, event.conceptId),
      };
    case "concept-relation-set": {
      const said = relationSentence(conceptName(index, event.from), event.relation, conceptName(index, event.to));
      return {
        happened:
          event.source === undefined
            ? `You set the relation: ${said}`
            : `You set the relation: ${said}, ${evidencePhrase(event.source, { step: boundSubjectLabel, passage: () => "a passage" })}`,
        changed: "Emerging project ontology",
      };
    }
    case "concept-relation-removed": {
      const rel = index.relationOf.get(event.relationId);
      const said =
        rel === undefined
          ? "a relation"
          : relationSentence(conceptName(index, rel.from), rel.relation, conceptName(index, rel.to));
      return {
        happened: event.reason === undefined ? `You removed the relation: ${said}` : `You removed the relation: ${said}. ${event.reason}`,
        changed: "Emerging project ontology",
      };
    }
    case "statement-attached":
      return {
        happened:
          event.pageId !== undefined
            ? `You placed the claim "${index.titleOfPage.get(event.pageId) ?? shortId(event.pageId)}" as a statement`
            : `You placed a new statement: ${event.text ?? ""}`,
        changed: conceptName(index, event.conceptId),
      };
    case "look-for-raised":
      return {
        happened: `Abductive added a line to look for in the field: ${event.text}`,
        changed: conceptName(index, event.conceptId),
      };
    case "look-for-settled": {
      const line = index.textOfLookFor.get(event.itemId) ?? "a line to look for in the field";
      return {
        happened:
          event.by === "passage"
            ? `Abductive settled a line with a later passage: ${line}`
            : event.note === undefined
              ? `You settled a line: ${line}`
              : `You settled a line: ${line}. ${event.note}`,
        changed: "What to look for in the field",
      };
    }
    case "readiness-report":
      return { happened: `Abductive wrote the readiness report: ${event.verdict}`, changed: "Checks" };
    case "concept-flag":
      return {
        happened: `Abductive placed a flag at this concept: ${event.reason}`,
        changed: conceptName(index, event.conceptId),
      };
    /* M67, ISC-631 to ISC-634. A relation card's rows, in the same voice. */
    case "relation-suggested":
      return {
        happened: `Abductive suggested the relation "${relationName(index, event.relationId)}" from ${sourcePhrase(event.source, boundSubjectLabel)}: ${event.claim}`,
        changed: "Relations",
      };
    case "relation-accepted":
      return {
        happened: `You accepted the relation "${relationName(index, event.relationId)}", marked ${originLabel(event.origin)}`,
        changed: "Emerging project ontology",
      };
    case "relation-refined": {
      const parts = [
        ...(event.relation === undefined ? [] : [`the kind now reads "${RELATION_PHRASE[event.relation]}"`]),
        ...(event.claim === undefined ? [] : [`the claim now reads "${event.claim}"`]),
      ];
      return { happened: `You refined the relation: ${parts.join(", and ")}`, changed: relationName(index, event.relationId) };
    }
    case "relation-rejected":
      return {
        happened: `You rejected the relation "${relationName(index, event.relationId)}": ${event.reason}`,
        changed: "Relations",
      };
    case "relation-claim-set":
      return { happened: `You wrote the relation's claim: ${event.claim}`, changed: relationName(index, event.relationId) };
    case "relation-conditions-set":
      return {
        happened:
          event.conditions === undefined
            ? "You cleared the conditions on the relation"
            : `You wrote the conditions for the relation: ${event.conditions}`,
        changed: relationName(index, event.relationId),
      };
    case "relation-statement-attached":
      return {
        happened:
          event.pageId !== undefined
            ? `You placed the claim "${index.titleOfPage.get(event.pageId) ?? shortId(event.pageId)}" as a statement under a relation`
            : `You placed a new statement under a relation: ${event.text ?? ""}`,
        changed: relationName(index, event.relationId),
      };
    case "homes-proposed":
      return {
        happened: `Abductive proposed a home for ${countOf(event.proposals.length, "statement")} of the ${countOf(event.read.length, "statement")} that it read`,
        changed: "Statements to place",
      };
    case "statement-suggested": {
      const home = event.home.kind === "concept" ? conceptName(index, event.home.id) : relationName(index, event.home.id);
      return {
        happened: `Abductive suggested the statement "${event.text}" from ${sourcePhrase(event.source, boundSubjectLabel)}, with a home under ${home}`,
        changed: "Statements to place",
      };
    }
    case "statement-rejected":
      return {
        happened: `You rejected the statement "${index.textOfSuggestedStatement.get(event.statementId) ?? shortId(event.statementId)}": ${event.reason}`,
        changed: "Statements to place",
      };
    /* M82, the lead's ruling A. */
    case "concept-retired":
      return { happened: `You retired the concept ${conceptName(index, event.conceptId)}: ${event.reason}`, changed: "Emerging project ontology" };
    /* M82, ISC-695. */
    case "why-suggested":
      return {
        happened: `Abductive wrote the Why it matters line for ${whyTargetName(index, event.target)}: ${event.text}`,
        changed: whyTargetName(index, event.target),
      };
    case "why-accepted":
      return { happened: `You accepted Abductive's Why it matters line for ${whyTargetName(index, event.target)}`, changed: whyTargetName(index, event.target) };
    case "why-refined":
      return { happened: `You wrote your own Why it matters line for ${whyTargetName(index, event.target)}: ${event.text}`, changed: whyTargetName(index, event.target) };
    case "argument-written":
      return { happened: `Abductive wrote the argument so far: ${event.text}`, changed: "The argument so far" };
    /* M90, ISC-733. */
    case "suggestion-dropped":
      /* M93, ISC-757: a suggestion from the chat that named turns the pass didn't read. */
      return {
        happened:
          event.source.kind === "chat"
            ? `Abductive left out a suggestion, "${event.name}", because it named turns that aren't in the chat at ${stepName(event.source.station)}.`
            : (droppedLine([event.name]) ?? ""),
        changed: "Emerging project ontology",
      };
    /* M93: every model output the researcher keeps is a decision on the record. */
    case "surfacing":
      return {
        happened: `You asked Abductive to surface concepts and relationships from ${countOf(event.turnIds.length, "turn")} of the chat at ${stepName(event.station)}`,
        changed: "Emerging project ontology",
      };
    case "why-rejected":
      return {
        happened: `You rejected Abductive's Why it matters line for ${whyTargetName(index, event.target)}${event.reason === undefined ? "" : `: ${event.reason}`}`,
        changed: whyTargetName(index, event.target),
      };
    case "argument-accepted":
      return {
        happened: event.edited ? `You accepted the argument so far in your own words: ${event.text}` : `You accepted Abductive's argument so far: ${event.text}`,
        changed: "The argument so far",
      };
    case "reading-accepted":
      return {
        happened: event.edited ? `You accepted Abductive's puzzle reading in your own words: ${event.text}` : `You accepted Abductive's puzzle reading: ${event.text}`,
        changed: "the research question",
      };
    case "draft-declined": {
      const what = event.kind === "brief" ? "a summary that Abductive wrote from the chat" : event.kind === "puzzle-reading" ? "Abductive's puzzle reading" : "Abductive's argument so far";
      return {
        happened: `You declined ${what}${event.reason === undefined ? "" : `: ${event.reason}`}`,
        changed: event.kind === "argument" ? "The argument so far" : event.kind === "puzzle-reading" ? "the suggested puzzle" : "the summary",
      };
    }
    case "property-rejected":
      return {
        happened: `You rejected the suggested property "${event.name}"${event.reason === undefined ? "" : `: ${event.reason}`}`,
        changed: conceptName(index, event.conceptId),
      };
    /* M95, ISC-778: the help chat, named by the page and the step it was asked on. */
    case "help-asked":
      return {
        happened: event.stuck === true
          ? `You pressed I'm stuck on ${helpPlace(event.page, event.station)}`
          : `You asked for help on ${helpPlace(event.page, event.station)}: ${event.text}`,
        changed: "Help",
      };
    case "help-answered":
      return {
        happened: event.cutShort === true
          ? `You stopped Abductive partway through the answer to your help request: ${event.text}`
          : `Abductive answered your help request: ${event.text}`,
        changed: "Help",
      };
    case "export":
      return {
        // The stamp goes in the prose rather than only in the expanded detail,
        // because it is the whole reason this row exists: a researcher scanning
        // the log for "which version did I send in March" is looking for these
        // eight characters and nothing else on the row identifies the file.
        happened: `You exported ${event.artefact} (file stamp ${event.stamp})`,
        changed: "Your project is unchanged: Abductive reads the project to export it.",
      };
  }
  /* An event type this switch doesn't name yet (M74b's chip events arrive with
     their map lines and are read before the switch). */
  return { happened: type, changed: "" };
}

/**
 * The ledger as rows, in append order. Pure projection over the event array;
 * the filters below reorder and hide, and neither touches this.
 */
export function projectLedger(events: readonly LedgerEvent[]): readonly LedgerRow[] {
  const index = indexLedger(events);
  return events.map((event) => {
    const { happened, changed } = describeEvent(event, index);
    const station = index.stationOf.get(event.id);
    return {
      id: event.id,
      ts: event.ts,
      kind: historyKind(event),
      family: FAMILY_OF[historyKind(event)],
      actor: event.actor,
      who: actorLabel(event.actor),
      happened,
      changed,
      ...(event.type === "ontology-mutation" ? { origin: event.origin } : {}),
      ...(station === undefined ? {} : { station }),
      // A field whose value is the summary verbatim is the summary printed
      // twice. For a flag, a finding and a challenge the summary IS the reason
      // field, so the expanded row was showing the same paragraph in the prose
      // column and again under "reason" beside it.
      fields: eventFields(event).filter((f) => f.value !== happened),
    };
  });
}

/** Sentinel values for the two selects. Neither is a station or an actor. */
const ANY = "any";
const NO_STATION = "no-station";

/**
 * How many rows are put in the DOM at once.
 *
 * A study runs to thousands of events and every row here is a button plus six
 * cells, so the whole ledger in one pass is tens of thousands of nodes for a
 * pane that shows twenty of them. The cap is stated on screen with the count it
 * is hiding, because a list that silently stops is worse than one that scrolls.
 */
const PAGE_SIZE = 200;

export function LedgerView(props: {
  events: readonly LedgerEvent[];
  /**
   * The kinds to start on, when a count somewhere else opened this (D51, M43d).
   *
   * The Exports header says "Press a count to open the record at the entries it
   * counts", and pressing one opened the record showing all 1,447 rows. The
   * filter row is still the reader's: this only decides which kinds are on when
   * the panel appears, and Everything puts them all back.
   */
  only?: readonly LedgerEventType[];
}) {
  const uid = useId();
  const rows = useMemo(() => projectLedger(props.events), [props.events]);
  const only = props.only;
  const [kinds, setKinds] = useState<ReadonlySet<HistoryKind>>(() => startingKinds(only));
  /* A second press on a different count re-aims the timeline. Keyed on the list
   * rather than on the panel opening, because the panel stays mounted. */
  const aim = only === undefined ? "" : [...only].join(",");
  const lastAim = useRef(aim);
  useEffect(() => {
    if (lastAim.current === aim) return;
    lastAim.current = aim;
    setKinds(startingKinds(only));
  }, [aim, only]);
  const [station, setStation] = useState<string>(ANY);
  const [who, setWho] = useState<string>(ANY);
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [limit, setLimit] = useState(PAGE_SIZE);

  const byFamily = useMemo(() => {
    const counts = new Map<LedgerFamily, number>();
    for (const row of rows) counts.set(row.family, (counts.get(row.family) ?? 0) + 1);
    return counts;
  }, [rows]);

  /* M74a, ISC-662: the model and homes rows count what they name. */
  const byKind = useMemo(() => kindCounts(props.events), [props.events]);

  const stations = useMemo(() => {
    const seen = new Set<string>();
    let unplaced = false;
    for (const row of rows) {
      if (row.station === undefined) unplaced = true;
      else seen.add(row.station);
    }
    const order = (id: string) => {
      const at = (STATION_IDS as readonly string[]).indexOf(id);
      return at === -1 ? STATION_IDS.length : at;
    };
    return { ids: [...seen].sort((a, b) => order(a) - order(b)), unplaced };
  }, [rows]);

  /* M74a, ISC-662: the Who filter lists people by what it says (you,
     Abductive), so every persona is one entry and no persona id reaches it. */
  const actors = useMemo(() => {
    const seen = new Set<string>();
    for (const row of rows) seen.add(row.who);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!kinds.has(row.kind)) return false;
      if (station !== ANY) {
        if (station === NO_STATION ? row.station !== undefined : row.station !== station) {
          return false;
        }
      }
      if (who !== ANY && row.who !== who) return false;
      if (needle === "") return true;
      return `${row.happened} ${row.changed} ${KIND_LABEL[row.kind]} ${row.who}`
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, kinds, station, who, query]);

  const ordered = useMemo(
    () => (newestFirst ? [...filtered].reverse() : filtered),
    [filtered, newestFirst],
  );
  const shown = ordered.slice(0, limit);

  /* A row that stands for several kinds turns them on and off together. */
  function toggleKind(kind: HistoryKind): void {
    setKinds((prev) => {
      const next = new Set(prev);
      const all = members(kind).every((k) => next.has(k));
      for (const k of members(kind)) {
        if (all) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }

  function toggleFamily(family: LedgerFamily): void {
    const members = LEDGER_KINDS.filter((k) => FAMILY_OF[k] === family);
    setKinds((prev) => {
      const next = new Set(prev);
      const all = members.every((k) => next.has(k));
      for (const k of members) {
        if (all) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }

  function toggleRow(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearFilters(): void {
    setKinds(new Set(LEDGER_KINDS));
    setStation(ANY);
    setWho(ANY);
    setQuery("");
  }

  if (rows.length === 0) {
    return (
      <section className="panel panel-wide ledger" data-testid="ledger-panel">
        <h3>History</h3>
        <EmptyState
          status="Your first event is still to come."
          teach="Answer a question on the Design tab and the answer lands in History as an event. Each suggestion, decision and check lands here too, in the order that they happened. Abductive keeps every entry in its original form."
          testId="ledger-empty"
        />
      </section>
    );
  }

  /* M74a, ISC-662 (the walk, finding 16): the date of the project's first
     event. "since today" read on the day a project began. */
  const span = formatDate(rows[0]?.ts ?? 0);

  const body: ReactNode[] = [];
  let band = "";
  for (const row of shown) {
    const day = formatDay(row.ts);
    if (day !== band) {
      band = day;
      body.push(
        <tr className="ledger-day" key={`day-${row.id}`}>
          <th colSpan={6} scope="colgroup">
            {day}
          </th>
        </tr>,
      );
    }
    const isOpen = expanded.has(row.id);
    const detailId = `${uid}-detail-${row.id}`;
    body.push(
      <tr className="ledger-row" key={row.id} data-kind={row.kind} data-family={row.family}>
        <td className="evicon" title={KIND_LABEL[row.kind]}>
          {KIND_MARK[row.kind]}
        </td>
        <td className="ledger-time">{formatClock(row.ts)}</td>
        <td className="ledger-who" title={row.who}>
          {row.who}
        </td>
        <td className="ledger-what">
          {/* The row expands rather than the summary wrapping. A wrapped
              summary was what made the old view 116px per event, and it took
              the left edge of the next row with it. */}
          {/* The title carries the whole sentence, because every cell in this
              table is one line clipped and the summaries got longer the moment
              they stopped being templates. Every other cell in the row already
              had one; this was the cell that needed it most and did not. */}
          <button
            type="button"
            className="ledger-open"
            title={row.happened}
            aria-expanded={isOpen}
            {...(isOpen ? { "aria-controls": detailId } : {})}
            onClick={() => toggleRow(row.id)}
          >
            <span className="visually-hidden">{`${KIND_LABEL[row.kind]}, `}</span>
            {row.happened}
          </button>
        </td>
        <td className="ledger-changed" title={row.changed}>
          {row.origin !== undefined && <OriginMark origin={row.origin} />}
          {row.changed}
        </td>
        <td className="ledger-station">
          {row.station === undefined ? (
            <span className="ledger-unplaced">the project</span>
          ) : (
            stationLabel(row.station)
          )}
        </td>
      </tr>,
    );
    if (isOpen) {
      body.push(
        <tr className="ledger-detail" key={`detail-${row.id}`} id={detailId}>
          <td colSpan={6}>
            <div className="ledger-detail-grid">
              <p className="ledger-detail-text">{row.happened}</p>
              <dl className="ledger-fields">
                {row.fields.map((field) => (
                  <div className="ledger-field" key={field.name}>
                    <dt>{field.name}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
                <div className="ledger-field">
                  <dt>event id</dt>
                  <dd className="ledger-id">{row.id}</dd>
                </div>
              </dl>
            </div>
          </td>
        </tr>,
      );
    }
  }

  return (
    <section className="panel panel-wide ledger" data-testid="ledger-panel">
      <div className="ledger-head">
        <h3>History</h3>
        <div className="ledger-counts">
          <StatusChip label="events" count={rows.length} />
          <StatusChip
            label="shown"
            count={filtered.length}
            tone={filtered.length === rows.length ? "neutral" : "accent"}
          />
        </div>
        <p className="small muted ledger-blurb">
          Every action that you and Abductive have taken since {span}, {newestFirst ? "newest" : "oldest"}{" "}
          first. The filters change which entries you see; History keeps every entry.
        </p>
      </div>

      <div className="ledger-controls">
        <div className="ledger-families" role="group" aria-label="Filter by kind of event">
          {LEDGER_FAMILIES.map((family) => {
            const members = LEDGER_KINDS.filter((k) => FAMILY_OF[k] === family);
            const on = members.filter((k) => kinds.has(k)).length;
            return (
              <button
                key={family}
                type="button"
                className="ledger-family"
                aria-pressed={on > 0}
                data-state={on === members.length ? "all" : on === 0 ? "none" : "some"}
                onClick={() => toggleFamily(family)}
              >
                {FAMILY_LABEL[family]}
                <span className="ledger-family-count">{byFamily.get(family) ?? 0}</span>
              </button>
            );
          })}
        </div>

        <Field label="Search" htmlFor={`${uid}-query`}>
          <input
            id={`${uid}-query`}
            type="search"
            className="ledger-search"
            value={query}
            placeholder="the event, or its effect"
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>

        <Field label="Step" htmlFor={`${uid}-station`}>
          <select
            id={`${uid}-station`}
            value={station}
            onChange={(e) => setStation(e.target.value)}
          >
            <option value={ANY}>Every step</option>
            {stations.ids.map((id) => (
              <option key={id} value={id}>
                {stationLabel(id)}
              </option>
            ))}
            {stations.unplaced && <option value={NO_STATION}>The project as a whole</option>}
          </select>
        </Field>

        <Field label="Who" htmlFor={`${uid}-who`}>
          <select id={`${uid}-who`} value={who} onChange={(e) => setWho(e.target.value)}>
            <option value={ANY}>Anyone</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="button"
          className="ledger-order"
          aria-pressed={newestFirst}
          onClick={() => setNewestFirst((v) => !v)}
        >
          {newestFirst ? "Newest first" : "Oldest first"}
        </button>
      </div>

      <Disclosure
        summary="Kinds one by one"
        count={kinds.size}
        countNoun="kinds"
        testId="ledger-kind-filter"
      >
        <div className="ledger-kinds">
          {LEDGER_KINDS.map((kind) => (
            <label key={kind} className="ledger-kind-key">
              {/* `tickbox` is the shared class the two checkbox surfaces in
                  this file's stylesheet own. Without it these seventeen and the
                  three coverage keys rendered as the UA control: appearance
                  auto, accent-color auto, and the default blue was the only
                  saturated colour on an otherwise monochrome screen. */}
              <input
                type="checkbox"
                className="tickbox"
                checked={members(kind).every((k) => kinds.has(k))}
                onChange={() => toggleKind(kind)}
              />
              <span className="evicon">{KIND_MARK[kind]}</span>
              <span className="ledger-kind-name">{KIND_LABEL[kind]}</span>
              <span className="ledger-kind-count">{byKind.get(kind) ?? 0}</span>
            </label>
          ))}
        </div>
      </Disclosure>

      {filtered.length === 0 ? (
        <EmptyState
          status="The filters that you set match none of the events."
          teach="History is unchanged. Widening the kinds, or clearing the search, brings the rest of History back."
          action={
            <button type="button" className="btn btn-quiet" onClick={clearFilters}>
              Clear filters
            </button>
          }
          testId="ledger-no-match"
        />
      ) : (
        <>
          <div className="ledger-pane" data-testid="ledger-pane">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  <th scope="col">Time</th>
                  <th scope="col">Who</th>
                  <th scope="col">What happened</th>
                  <th scope="col">What the event changed</th>
                  <th scope="col">Step</th>
                </tr>
              </thead>
              <tbody>{body}</tbody>
            </table>
          </div>
          <div className="ledger-foot">
            <p className="small muted">
              {shown.length === filtered.length
                ? `All ${filtered.length} matching events are on screen.`
                : `${shown.length} of ${filtered.length} matching events are on screen, oldest still hidden.`}
            </p>
            {shown.length < filtered.length && (
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
              >
                Show {Math.min(PAGE_SIZE, filtered.length - shown.length)} more
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** A kind's three-letter mark, for the tests that pin them (M78a). */
export function kindMark(kind: HistoryKind): string {
  return KIND_MARK[kind];
}
