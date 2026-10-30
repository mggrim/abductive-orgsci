/**
 * The Emerging project ontology tab (M63, ISC-609).
 *
 * The owner, 2026-09-30: the tab is "essentially a project ontology that will
 * guide further data collection and analysis", made of concepts the researcher
 * approves, refines or rejects, each with a definition, properties and relations,
 * and the answers or passages it came from. It comes before coding, so it is not
 * a theoretical model.
 *
 * The page, top to bottom: the gloss once; Concepts, with the concepts
 * Abductive suggested first (each with Accept, Refine and Reject) and the
 * accepted concept cards after them; Relations, in the same order; the
 * statements no concept takes yet; and at the foot, the map in its own fold
 * (M79). Beside it, "What to look for in the field". Nothing on the page acts
 * on its own: Abductive suggests and the researcher decides (L17).
 *
 * M70, ISC-646 to ISC-648 (the owner, 2026-10-02): every card opens as a
 * preview (the name or the pair and the kind, the first sentence, the count of
 * what else it carries) and Read more expands it to everything, every passage
 * and answer behind it in full. Four headings for two kinds became two.
 *
 * `ConceptsPage` draws; `ConceptsView` reads the project and writes through
 * `concepts/door.ts`, the one writer of a concept event.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { dataOnly, type Chunk, type StoredDocument } from "../state/chunks.ts";
import type { ConceptEvidence, ConceptRelation, LedgerEvent, RelationGround, StatementHome, StatementSuggestedEvent, WhyTarget } from "../ledger/events.ts";
import { CONCEPT_RELATIONS } from "../ledger/events.ts";
import {
  evidenceBehind,
  evidenceBehindRelation,
  lookForNeeded,
  projectConcepts,
  inInbox,
  type ConceptCard,
  type RelationCard,
  type LookForLine,
  type ProjectOntologyView,
  type Statement,
  type StatementFrom,
  type WhyLine,
} from "../concepts/projection.ts";
import { statementLabel, suggestionFrom } from "../concepts/statementOrigin.ts";
import {
  ONTOLOGY_GLOSS,
  droppedLine,
  RELATION_PHRASE,
  evidencePhrase,
  relationSentence,
  sourcePhrase,
  stepName,
  CHAT_ORIGIN_LABEL,
  type ChatOrigin,
} from "../concepts/vocabulary.ts";
import { speakers, suggestionOrigin } from "../concepts/chat.ts";
import { projectOntology } from "../ontology/projection.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { acceptArgumentEvent, rejectArgumentEvent } from "../concepts/decisions.ts";
import type { ConceptSource } from "../ledger/events.ts";
import {
  acceptConceptEvents,
  acceptRelationEvents,
  acceptStatementEvents,
  addConceptEvents,
  addRelationEvents,
  placeAtHomeEvents,
  refineRelationEvents,
  rejectRelationEvents,
  rejectStatementEvents,
  setRelationConditionsEvents,
  acceptWhyEvents,
  retireConceptEvents,
  acceptPropertyEvents,
  rejectPropertyEvents,
  rejectWhyEvents,
  acceptAllOnCardEvents,
  relationBlocked,
  homeWaiting,
  type NewHome,
  answerLineEvents,
  conceptAct,
  lookForSync,
  placeStatementEvents,
  refineConceptEvents,
  rejectConceptEvents,
  removeRelationEvents,
  setPropertyEvents,
  setRelationEvents,
  settleLineEvents,
} from "../concepts/door.ts";
import { useWorkbench } from "../workbench/useWorkbench.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { voicedGraph } from "../views/voicedGraph.ts";
import { MAIN_LANDMARK_ID } from "./landmarks.ts";
import { countOf } from "./format.ts";
import { Disclosure, InertNote, StatusChip, inertAttrs } from "./components/index.ts";
import { conceptMarkLabel, originLabel } from "./originVocabulary.ts";
import { passageIn } from "./materialVocabulary.ts";
import { GAP_MARKER_NOTE, hasGapMarker } from "../interview/conversation.ts";
import { mapQueue } from "./concepts/ConceptMap.tsx";
import { ConceptMapFrame, useTabRoom } from "./concepts/ConceptMapFrame.tsx";
import { RetireClaim } from "../workbench/RetireClaim.tsx";
import { MarkHeldInSetting } from "../workbench/MarkHeldInSetting.tsx";
import { ProvenancePopover } from "./components/ProvenancePopover.tsx";
import { claimProvenance, type ClaimProvenanceView } from "../views/provenance.ts";
import { markHeldInSetting, retirePage, type MutationOutcome } from "../proposals/adjudicate.ts";
import { cardElementId, cardPath, cardRequested, claimRequested, sectionPath, studyPath, type CardKind } from "./routes.ts";
import { Sheet } from "./components/Sheet.tsx";
import { homeRejected, pendingWindow, queueLine, toRead } from "../concepts/suggest.ts";
import { recentDrops } from "../concepts/conceptName.ts";
import { runArgument, runRelate, runSuggestionCounts, runWhyLines } from "../concepts/run.ts";
import { numberWord } from "../concepts/vocabulary.ts";
import { argumentBasis } from "../concepts/why.ts";
import { activeInferenceClient } from "./personaRun.ts";
import { emptyBrief } from "../state/projects.ts";
import { ProposalsTrayView, turnsAnsweringBaselines } from "../workbench/ProposalsTrayView.tsx";
import { paperBaselines } from "../proposals/baselines.ts";
import { DRAFTS_SECTION_ID } from "../views/argumentModel.ts";

/** What the page can do. Null draws the controls and wires them to nothing, for a static read. */
export interface ConceptActs {
  readonly accept: (conceptId: string) => void;
  readonly refine: (conceptId: string, edit: { readonly name: string; readonly definition: string; readonly why?: string }) => void;
  readonly reject: (conceptId: string, reason: string) => void;
  readonly addConcept: (name: string, definition: string) => void;
  readonly setProperty: (
    conceptId: string,
    property: { readonly propertyId?: string; readonly name: string; readonly varies?: string; readonly removed?: boolean },
  ) => void;
  readonly setRelation: (link: {
    readonly relationId?: string;
    readonly from: string;
    readonly to: string;
    readonly relation: ConceptRelation;
    readonly source?: ConceptEvidence;
  }) => void;
  readonly removeRelation: (relationId: string) => void;
  readonly place: (conceptId: string, pageId: string) => void;
  readonly settle: (itemId: string, note: string) => void;
  /** Retire a statement that is a claim, with a reason: the same event Retire claim wrote (M63 ruling). */
  readonly retire: (pageId: string, reason: string) => void;
  /** Say who in the setting holds an expectation, which the expectation chooser offers (M44). */
  readonly markHeld: (pageId: string, heldBy: string) => void;
  /** An answer to "What in your material shows that?", as a statement under the concept (M63 ruling). */
  readonly answer: (input: { readonly conceptId: string; readonly text: string; readonly chunkId: string; readonly itemId?: string }) => void;
  /** M67, ISC-631: a relation card's own acts. */
  readonly acceptRelation: (relationId: string) => void;
  readonly refineRelation: (relationId: string, edit: { readonly relation: ConceptRelation; readonly claim: string; readonly why?: string }) => void;
  /** M82 (the lead's ruling A): retire an accepted concept, with the researcher's reason. */
  readonly retireConcept: (conceptId: string, reason: string) => void;
  /** M82, ISC-695: accept the Why it matters line that Abductive wrote for an accepted card. */
  readonly acceptWhy: (target: WhyTarget) => void;
  /** M93, ISC-765: reject that line, with an optional reason. */
  readonly rejectWhy: (target: WhyTarget, reason: string) => void;
  /** M93, ISC-764: a property that a concept's suggestion carried, decided on its own. */
  readonly acceptProperty: (conceptId: string, name: string) => void;
  readonly rejectProperty: (conceptId: string, name: string, reason: string) => void;
  /** M93, ISC-764: Accept all on a card, one accept event per item. */
  readonly acceptAll: (conceptId: string) => void;
  /** M93, ISC-762: the argument so far, accepted as written or in the researcher's words, or rejected. */
  readonly acceptArgument: (text?: string) => void;
  readonly rejectArgument: (reason: string) => void;
  readonly rejectRelation: (relationId: string, reason: string) => void;
  readonly setConditions: (relationId: string, conditions: string) => void;
  readonly addRelation: (relation: {
    readonly from: string;
    readonly to: string;
    readonly relation: ConceptRelation;
    readonly claim: string;
    readonly conditions?: string;
    readonly source?: ConceptEvidence;
  }) => void;
  /** M67, ISC-633: accept a suggested statement at its home, or one chosen or written on its card. */
  readonly acceptStatement: (statementId: string, home: StatementHome | NewHome, text?: string) => void;
  readonly rejectStatement: (statementId: string, reason: string) => void;
  /** M67, ISC-634: place a statement still to place at the home proposed, or another. */
  readonly placeAt: (statementId: string, home: StatementHome | NewHome) => void;
  /** Open a concept card or a relation card: scroll to it, ring it and carry it in the hash (ISC-632). */
  readonly open: (kind: CardKind, id: string) => void;
  readonly busy: boolean;
  readonly error: string | null;
}

const NO_ACTS: ConceptActs = {
  accept: () => {},
  refine: () => {},
  reject: () => {},
  addConcept: () => {},
  setProperty: () => {},
  setRelation: () => {},
  removeRelation: () => {},
  place: () => {},
  settle: () => {},
  retire: () => {},
  markHeld: () => {},
  answer: () => {},
  acceptRelation: () => {},
  refineRelation: () => {},
  rejectRelation: () => {},
  setConditions: () => {},
  acceptWhy: () => {},
  rejectWhy: () => {},
  acceptProperty: () => {},
  rejectProperty: () => {},
  acceptAll: () => {},
  acceptArgument: () => {},
  rejectArgument: () => {},
  retireConcept: () => {},
  addRelation: () => {},
  acceptStatement: () => {},
  rejectStatement: () => {},
  placeAt: () => {},
  open: () => {},
  busy: false,
  error: null,
};

interface Names {
  /** The project's own data passages, papers left out, for an answer to point at. */
  readonly dataPassages: readonly string[];
  readonly concept: (id: string) => string;
  /** A relation as the sentence between its two concept names. */
  readonly relation: (id: string) => string;
  readonly passage: (chunkId: string) => string;
  /** The passage's whole text, as the document has it (M70, ISC-647). */
  readonly passageText: (chunkId: string) => string | null;
  /** The researcher's latest saved answer at a step, or the words of one reply in a conversation ("turn:<id>"). */
  readonly said: (subject: string) => string | null;
  /** A statement's origin as its label: "Context summary", "Fieldnote 2", "From the papers" (M75, ISC-669). */
  readonly label: (from: StatementFrom) => string;
  /** M93, ISC-757: whose words a suggestion from the chat draws on, read off the turns it names. */
  readonly origin?: (s: { readonly source: ConceptSource; readonly drawnFrom?: readonly string[] }) => ChatOrigin | null;
}

function namesFor(
  view: ProjectOntologyView,
  chunks: readonly Chunk[],
  documents: readonly StoredDocument[],
  events: readonly LedgerEvent[] = [],
): Names {
  const docName = new Map(documents.map((d) => [d.id, d.name] as const));
  const who = speakers(events);
  const chunk = new Map(chunks.map((c) => [c.id, c] as const));
  const answers = new Map<string, string>();
  const replies = new Map<string, string>();
  for (const e of events) {
    if (e.type === "bound") answers.set(e.subject, e.statement);
    else if (e.type === "response") replies.set(e.id, e.text);
  }
  return {
    dataPassages: dataOnly(chunks).map((c) => c.id),
    concept: (id) => view.concepts.get(id)?.name ?? "a concept",
    relation: (id) => {
      const r = view.relations.get(id);
      const name = (c: string) => view.concepts.get(c)?.name ?? "a concept";
      return r === undefined ? "a relation" : relationSentence(name(r.from), r.relation, name(r.to));
    },
    passage: (id) => {
      const c = chunk.get(id);
      return c === undefined ? "a passage" : passageIn(docName.get(c.documentId) ?? "a document", c.index + 1);
    },
    passageText: (id) => chunk.get(id)?.text.trim() ?? null,
    said: (subject) => (subject.startsWith("turn:") ? replies.get(subject.slice(5)) : answers.get(subject))?.trim() ?? null,
    label: (from) => statementLabel(from, { chunks, documents }),
    origin: (x) => suggestionOrigin(x, who),
  };
}

/**
 * Whose words a suggestion from the chat draws on, in plain words (M93,
 * ISC-757): "From your words", "From Abductive's questions" or "From both".
 */
function OriginChip(props: { readonly origin: ChatOrigin | null; readonly id: string }) {
  if (props.origin === null) return null;
  return (
    <span className="chat-origin small" data-testid={`chat-origin-${props.id}`} data-origin={props.origin}>
      {CHAT_ORIGIN_LABEL[props.origin]}
    </span>
  );
}

// ── Preview and overlay (M70, ISC-646, ISC-647, and the owner's addendum) ──

/*
 * The owner, 2026-10-02, after the brief: "The expanded view should be an
 * overlay rather than something that changes the page around." A card on the
 * page is a preview and only a preview; "Read more" opens the whole card in a
 * dialog over the page, one at a time, and the hash carries the open card so a
 * reload reopens it. A link or a map edge still scrolls to a card and rings it
 * (M67), and opens no overlay (the lead's ruling).
 */

/** The kinds of card that open in the overlay. */
export type ReadKind = "concept" | "relation" | "statement";

/** The card the overlay shows. */
export interface ReadTarget {
  readonly kind: ReadKind;
  readonly id: string;
}

/**
 * The hash of an open overlay: `#/study/:id/ontology/read-<kind>-<id>`. The tab's
 * route reads any segment in that place as the ontology tab, and the M67 card
 * link (`concept-<id>`, `relation-<id>`) does not match it, so a link still rings.
 */
export function readPath(projectId: string, target: ReadTarget): string {
  return sectionPath(projectId, "ontology", `read-${target.kind}-${target.id}`);
}

/** Which card this hash opens in the overlay, or null. */
export function readRequested(hash: string): ReadTarget | null {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");
  const match = /^\/(?:study|project)\/[^/]+\/ontology\/read-(concept|relation|statement)-([^/]+)$/.exec(path);
  if (match === null) return null;
  return { kind: match[1] as ReadKind, id: match[2] ?? "" };
}

/** The id of a card's Read more control, which takes focus back when the overlay closes. */
export function readMoreId(target: ReadTarget): string {
  return `read-more-${target.kind}-${target.id}`;
}

/**
 * How a card is drawn: as the preview on the page, or whole inside the overlay.
 * In the overlay a decision (Accept, Refine saved, Reject confirmed, a home
 * accepted) closes it, and the decision applies to the card beneath.
 */
interface Lens {
  readonly full: boolean;
  /** The preview's Read more. */
  readonly onRead: () => void;
  /** Called after a decision taken in the overlay. */
  readonly onDecided: () => void;
}

const PREVIEW: Lens = { full: false, onRead: () => {}, onDecided: () => {} };

/**
 * The first sentence of a definition or a claim, for a card's preview. A full
 * stop inside the gap marker `[...]` does not end a sentence, since the marker's
 * dots are followed by more dots or the bracket, not a space.
 */
export function firstSentence(text: string): string {
  const said = text.trim();
  const m = /^[\s\S]*?[.!?]["'”’)]*(?=\s|$)/.exec(said);
  return m === null ? said : m[0];
}

/** "3 properties, 2 statements, 1 passage": each count with its noun, singular at one, zeros left out. */
export function countLine(parts: readonly (readonly [number, string, string])[]): string {
  return parts
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => countOf(n, one, many))
    .join(", ");
}

/** The passages, answers and replies behind a card, each to be read whole. */
interface Behind {
  readonly passages: readonly string[];
  /** Step subjects, and "turn:<id>" for a reply in a conversation. */
  readonly answers: readonly string[];
}

function mergeBehind(...all: readonly Behind[]): Behind {
  return {
    passages: [...new Set(all.flatMap((b) => b.passages))],
    answers: [...new Set(all.flatMap((b) => b.answers))],
  };
}

/** What a statement stands on: the passages it cites, the answer it came from, the reply it was written from. */
function statementBehind(s: Statement | undefined): Behind {
  if (s === undefined) return { passages: [], answers: [] };
  return {
    passages: s.chunks,
    answers: [...(s.answer === undefined ? [] : [s.answer]), ...(s.turn === undefined ? [] : [`turn:${s.turn}`])],
  };
}

/**
 * The statements a suggested concept or relation would take: the claims the
 * suggestion names, and every statement still to place whose proposed home is
 * the suggestion. The first-open pass suggests from "the statements already in
 * your project" and names them only as homes (M67), so without the second kind
 * a grouped suggestion showed nothing of what it rests on (found in the M70 walk).
 */
function statementsFor(view: ProjectOntologyView, named: readonly string[], home: StatementHome): readonly Statement[] {
  const ids = new Set(named);
  for (const st of view.toPlace) {
    const h = view.homes.get(st.id);
    if (h !== undefined && h.kind === home.kind && h.id === home.id) ids.add(st.id);
  }
  return [...ids].flatMap((id) => {
    const st = view.statements.get(id);
    return st === undefined ? [] : [st];
  });
}

/** The counts of what stands behind a card: passages, answers at steps, replies in conversations. */
function behindCounts(b: Behind): readonly (readonly [number, string, string])[] {
  const replies = b.answers.filter((a) => a.startsWith("turn:")).length;
  return [
    [b.passages.length, "passage", "passages"],
    [b.answers.length - replies, "answer", "answers"],
    [replies, "reply", "replies"],
  ];
}

/** A long text read whole, in a box that scrolls inside itself rather than cutting it. */
function ReadBox(props: { readonly label: string; readonly text: string; readonly answer?: boolean }) {
  return (
    <blockquote className={props.answer === true ? "passage-text answer-text" : "passage-text"} tabIndex={0} aria-label={props.label}>
      {props.text}
    </blockquote>
  );
}

/** Every passage, answer and reply behind a card, each in full (ISC-647). */
function BehindList(props: { readonly behind: Behind; readonly names: Names; readonly heading: string; readonly testId: string }) {
  const { behind, names } = props;
  const steps = behind.answers.filter((a) => !a.startsWith("turn:"));
  const turns = behind.answers.filter((a) => a.startsWith("turn:"));
  return (
    <div className="concept-part" data-testid={props.testId}>
      <h4>{props.heading}</h4>
      {behind.passages.length === 0 && behind.answers.length === 0 ? (
        <p className="small muted">A passage or an answer behind the concept is still to come.</p>
      ) : (
        <ul className="concept-list behind-list">
          {steps.map((subject) => {
            const label = `Your answer at ${stepName(subject)}`;
            const said = names.said(subject);
            return (
              <li key={subject} className="concept-passage">
                <span className="small">{label}</span>
                {said !== null && <ReadBox label={label} text={said} answer />}
              </li>
            );
          })}
          {turns.map((turn) => {
            const said = names.said(turn);
            return (
              <li key={turn} className="concept-passage">
                <span className="small">Your reply in a conversation</span>
                {said !== null && <ReadBox label="Your reply in a conversation" text={said} answer />}
              </li>
            );
          })}
          {behind.passages.map((p) => {
            const said = names.passageText(p);
            return (
              <li key={p} className="concept-passage">
                <span className="small">{names.passage(p)}</span>
                {said !== null && <ReadBox label={names.passage(p)} text={said} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The foot of a preview: the count of what else the card carries, and Read
 * more, which opens the whole card in the overlay (the owner's addendum).
 */
function ReadMore(props: { readonly target: ReadTarget; readonly counts: string; readonly onRead: () => void }) {
  const { target } = props;
  return (
    <>
      {props.counts !== "" && (
        <p className="small muted card-counts" data-testid={`card-counts-${target.id}`}>
          {props.counts}
        </p>
      )}
      <button
        type="button"
        className="btn-bare linkish small card-read"
        id={readMoreId(target)}
        aria-haspopup="dialog"
        onClick={props.onRead}
        data-testid={`card-read-${target.id}`}
      >
        Open full view
      </button>
    </>
  );
}

// ── Suggested concepts ──────────────────────────────────────────────────────

/** The mark on a card that waits for a decision (ISC-648). */
function SuggestedChip(props: { readonly id: string }) {
  return <StatusChip label="Suggested" tone="notice" testId={`suggested-chip-${props.id}`} />;
}

/** The chip on a card's preview when its definition carries the gap marker (M78a, ISC-679). */
/* "Gap open", two words (L8, the lead's ruling). */
export const GAP_CHIP_LABEL = "Gap open";

/**
 * The preview shows a definition's first sentence, which hid a marker that ends
 * the definition (the walk's Dave's introductions), so the header says so and
 * the researcher sees the gap before Accept.
 */
export function GapChip(props: { id: string; definition: string }) {
  if (!hasGapMarker(props.definition)) return null;
  return <StatusChip label={GAP_CHIP_LABEL} tone="notice" testId={`gap-chip-${props.id}`} />;
}

// ── Why it matters (M82, ISC-695) ───────────────────────────────────────────

/**
 * A card's "Why it matters" line. A suggestion shows the line Abductive
 * proposed, to be accepted with the card. An accepted card shows its line: one
 * Abductive wrote for it waits, marked Suggested, with Accept; one in the
 * researcher's words is marked Yours. Refine on the card edits it.
 */
function WhyBlock(props: {
  readonly target: WhyTarget;
  readonly line: WhyLine | null;
  /** The line a suggestion carries, shown before Accept. */
  readonly proposed?: string | undefined;
  readonly acts: ConceptActs;
}) {
  const { target, line, acts } = props;
  const busy = acts.busy;
  const testId = `why-${target.kind}-${target.id}`;
  /* M93, ISC-765: Reject beside Accept, with an optional reason. */
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  if (props.proposed !== undefined) {
    if (props.proposed === "") return null;
    return (
      <p className="why-line small" data-testid={testId}>
        <span className="why-label">Why it matters</span> {props.proposed}
      </p>
    );
  }
  if (line === null) {
    return (
      <p className="why-line small muted" data-testid={testId}>
        <span className="why-label">Why it matters</span> The Why it matters line is still to come.
      </p>
    );
  }
  if (line.status === "rejected") {
    return (
      <p className="why-line small muted" data-testid={testId} data-status="rejected">
        <span className="why-label">Why it matters</span> You rejected Abductive's line. Refine this concept or relation to write your own.
      </p>
    );
  }
  return (
    <div className="why-line small" data-testid={testId}>
      <span className="why-label">Why it matters</span> {line.text}{" "}
      {line.status === "suggested" ? (
        <>
          <SuggestedChip id={`why-${target.id}`} />{" "}
          <button
            type="button"
            className="btn-bare linkish small"
            disabled={busy}
            onClick={() => acts.acceptWhy(target)}
            data-testid={`why-accept-${target.kind}-${target.id}`}
          >
            Accept
          </button>{" "}
          <button
            type="button"
            className="btn-bare linkish small"
            disabled={busy}
            onClick={() => setRejecting(true)}
            data-testid={`why-reject-${target.kind}-${target.id}`}
          >
            Reject…
          </button>
          {rejecting && (
            <span className="concept-form why-reject-form" data-testid={`why-reject-form-${target.kind}-${target.id}`}>
              <label className="concept-field">
                <span>Reason (optional)</span>
                <textarea value={reason} rows={2} onChange={(e) => setReason(e.target.value)} data-testid={`why-reject-reason-${target.kind}-${target.id}`} />
              </label>
              <span className="concept-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    acts.rejectWhy(target, reason);
                    setRejecting(false);
                  }}
                  data-testid={`why-reject-confirm-${target.kind}-${target.id}`}
                >
                  Reject line
                </button>
                <button type="button" className="btn-bare" onClick={() => setRejecting(false)}>
                  Cancel
                </button>
              </span>
            </span>
          )}
        </>
      ) : (
        <span className="small muted">{line.by === "you" ? "Yours" : "AI-suggested"}</span>
      )}
    </div>
  );
}

/**
 * The properties a concept's suggestion carried, still waiting after the
 * concept was accepted (M93, ISC-764), each with its own Accept and Reject.
 */
function SuggestedProperties(props: { readonly card: ConceptCard; readonly acts: ConceptActs }) {
  const { card, acts } = props;
  const busy = acts.busy;
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  if (card.suggestedProperties.length === 0) return null;
  return (
    <div className="concept-part" data-testid={`suggested-properties-${card.id}`}>
      <h4>Suggested properties</h4>
      <ul className="concept-list">
        {card.suggestedProperties.map((name) => (
          <li key={name} data-testid={`suggested-property-${card.id}-${name}`}>
            {name} <SuggestedChip id={`property-${card.id}-${name}`} />{" "}
            <button
              type="button"
              className="btn-bare linkish small"
              disabled={busy}
              onClick={() => acts.acceptProperty(card.id, name)}
              data-testid={`property-accept-${card.id}-${name}`}
            >
              Accept
            </button>{" "}
            <button
              type="button"
              className="btn-bare linkish small"
              disabled={busy}
              onClick={() => {
                setRejecting(name);
                setReason("");
              }}
              data-testid={`property-reject-${card.id}-${name}`}
            >
              Reject…
            </button>
            {rejecting === name && (
              <span className="concept-form">
                <label className="concept-field">
                  <span>Reason (optional)</span>
                  <textarea value={reason} rows={2} onChange={(e) => setReason(e.target.value)} data-testid={`property-reject-reason-${card.id}-${name}`} />
                </label>
                <span className="concept-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      acts.rejectProperty(card.id, name, reason);
                      setRejecting(null);
                    }}
                    data-testid={`property-reject-confirm-${card.id}-${name}`}
                  >
                    Reject property
                  </button>
                  <button type="button" className="btn-bare" onClick={() => setRejecting(null)}>
                    Cancel
                  </button>
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The Why it matters field in a Refine form, filled with the line as it stands. */
function WhyField(props: { readonly value: string; readonly onChange: (v: string) => void; readonly testId: string }) {
  return (
    <label className="concept-field">
      <span>Why it matters</span>
      <textarea value={props.value} rows={2} onChange={(e) => props.onChange(e.target.value)} data-testid={props.testId} />
    </label>
  );
}

function SuggestionCard(props: { card: ConceptCard; view: ProjectOntologyView; names: Names; acts: ConceptActs; lens?: Lens }) {
  const { card, view, names, acts } = props;
  const lens = props.lens ?? PREVIEW;
  const s = card.suggestion;
  const [mode, setMode] = useState<"view" | "refine" | "reject">("view");
  const [name, setName] = useState(card.name);
  const [definition, setDefinition] = useState(card.definition);
  const [why, setWhy] = useState(card.suggestion?.whyItMatters ?? "");
  const [reason, setReason] = useState("");
  if (s === undefined) return null;
  const busy = acts.busy;
  const unnamed = name.trim() === "" ? "Name the concept first." : null;
  const unreasoned = reason.trim() === "" ? "Give your reason first." : null;
  const claims = statementsFor(view, s.statementIds, { kind: "concept", id: card.id });
  const homed = view.suggestedStatements.filter((x) => x.home.kind === "concept" && x.home.id === card.id);
  const behind = mergeBehind(evidenceBehind(view, card.id), ...claims.map(statementBehind), {
    passages: homed.flatMap((x) => (x.chunkId === undefined ? [] : [x.chunkId])),
    answers: [],
  });
  const counts = countLine([
    [s.properties.length, "property", "properties"],
    [s.relations.length, "relation", "relations"],
    [claims.length + s.statements.length, "statement", "statements"],
    ...behindCounts(behind),
  ]);
  const decide = (act: () => void) => {
    act();
    lens.onDecided();
  };
  const Root = lens.full ? "div" : "article";
  return (
    <Root
      className={lens.full ? "card-full" : "concept-card concept-suggestion"}
      data-testid={lens.full ? `overlay-suggestion-${card.id}` : `suggestion-${card.id}`}
    >
      <header className="concept-head">
        {!lens.full && <h3 className="concept-name">{card.name}</h3>}
        <span className="concept-mark small muted">
          <SuggestedChip id={card.id} /> AI-suggested from {sourcePhrase(s.source, stepName)}
        </span>
        <OriginChip origin={names.origin?.(card.suggestion ?? s) ?? null} id={card.id} />
        {!lens.full && <GapChip id={card.id} definition={card.definition} />}
      </header>
      {mode === "refine" ? (
        <div className="concept-form" data-testid={`concept-refine-form-${card.id}`}>
          <label className="concept-field">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid={`concept-refine-name-${card.id}`} />
          </label>
          <label className="concept-field">
            <span>Definition</span>
            <textarea
              value={definition}
              rows={3}
              onChange={(e) => setDefinition(e.target.value)}
              data-testid={`concept-refine-definition-${card.id}`}
            />
          </label>
          <WhyField value={why} onChange={setWhy} testId={`concept-refine-why-${card.id}`} />
          <div className="concept-actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              {...inertAttrs(`refine-${card.id}`, unnamed)}
              onClick={() => {
                if (unnamed === null) decide(() => acts.refine(card.id, { name, definition, ...(why.trim() === (s.whyItMatters ?? "") ? {} : { why }) }));
              }}
              data-testid={`concept-refine-save-${card.id}`}
            >
              Save concept
            </button>
            <InertNote control={`refine-${card.id}`} reason={unnamed} />
            <button type="button" className="btn-bare" onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="concept-definition">{lens.full ? card.definition : firstSentence(card.definition)}</p>
      )}
      {hasGapMarker(card.definition) && mode !== "refine" && <p className="small muted">{GAP_MARKER_NOTE}</p>}
      {mode !== "refine" && <WhyBlock target={{ kind: "concept", id: card.id }} line={null} proposed={s.whyItMatters ?? ""} acts={acts} />}
      {!lens.full && <ReadMore target={{ kind: "concept", id: card.id }} counts={counts} onRead={lens.onRead} />}
      {/* M93, ISC-764: Accept takes the name and definition; the rest waits for its own decision. */}
      {mode === "view" && (s.properties.length > 0 || s.relations.length > 0 || (s.whyItMatters ?? "") !== "") && (
        <p className="small muted" data-testid={`concept-accept-scope-${card.id}`}>
          When you accept, you keep the name and definition, and you decide on each property, relation and the Why it matters line after.
        </p>
      )}
      {lens.full && (
        <>
          {s.properties.length > 0 && (
            <div className="concept-part">
              <h4>Properties</h4>
              <ul className="concept-list">
                {s.properties.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {s.relations.length > 0 && (
            <div className="concept-part">
              <h4>Relations</h4>
              <ul className="concept-list">
                {s.relations.map((r) => (
                  <li key={`${r.relation}-${r.to}`}>{relationSentence(card.name, r.relation, names.concept(r.to))}</li>
                ))}
              </ul>
            </div>
          )}
          {homed.length > 0 && (
            <p className="small muted" data-testid={`suggestion-statements-${card.id}`}>
              {homedLine(homed.length, "concept")}
            </p>
          )}
          {(claims.length > 0 || s.statements.length > 0) && (
            <div className="concept-part">
              <h4>Statements to place under this concept</h4>
              <ul className="concept-list">
                {claims.map((st) => (
                  <li key={st.id}>{st.text}</li>
                ))}
                {s.statements.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          <BehindList behind={behind} names={names} heading="Behind this concept" testId={`suggestion-evidence-${card.id}`} />
        </>
      )}
      {mode === "reject" ? (
        <div className="concept-form" data-testid={`concept-reject-form-${card.id}`}>
          <label className="concept-field">
            <span>Reason</span>
            <textarea
              value={reason}
              rows={2}
              placeholder="Too close to a claim that you already have"
              onChange={(e) => setReason(e.target.value)}
              data-testid={`concept-reject-reason-${card.id}`}
            />
          </label>
          <div className="concept-actions">
            <button
              type="button"
              disabled={busy}
              {...inertAttrs(`reject-${card.id}`, unreasoned)}
              onClick={() => {
                if (unreasoned === null) decide(() => acts.reject(card.id, reason));
              }}
              data-testid={`concept-reject-confirm-${card.id}`}
            >
              Reject concept
            </button>
            <InertNote control={`reject-${card.id}`} reason={unreasoned} />
            <button type="button" className="btn-bare" onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        mode === "view" && (
          <div className="concept-actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => decide(() => acts.accept(card.id))}
              data-testid={`concept-accept-${card.id}`}
            >
              Accept
            </button>
            {/* M93, ISC-764: one accept event per item, each marked bulk. */}
            {(s.properties.length > 0 || s.relations.length > 0 || (s.whyItMatters ?? "") !== "" || homed.length > 0) && (
              <button type="button" disabled={busy} onClick={() => decide(() => acts.acceptAll(card.id))} data-testid={`concept-accept-all-${card.id}`}>
                Accept all
              </button>
            )}
            <button type="button" onClick={() => setMode("refine")} data-testid={`concept-refine-${card.id}`}>
              Refine
            </button>
            <button type="button" className="btn-bare" onClick={() => setMode("reject")} data-testid={`concept-reject-${card.id}`}>
              Reject…
            </button>
          </div>
        )
      )}
    </Root>
  );
}

// ── Accepted concepts ───────────────────────────────────────────────────────

function PropertyRow(props: { conceptId: string; property: ConceptCard["properties"][number]; acts: ConceptActs }) {
  const { conceptId, property, acts } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(property.name);
  const [varies, setVaries] = useState(property.varies ?? "");
  const busy = acts.busy;
  const unnamed = name.trim() === "" ? "Name the property first." : null;
  if (editing) {
    return (
      <li className="concept-form" data-testid={`property-form-${property.id}`}>
        <label className="concept-field">
          <span>Property</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="concept-field">
          <span>Variation</span>
          <input
            value={varies}
            placeholder="From none to every weekly update"
            onChange={(e) => setVaries(e.target.value)}
            data-testid={`property-varies-${property.id}`}
          />
        </label>
        <div className="concept-actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            {...inertAttrs(`property-${property.id}`, unnamed)}
            onClick={() => {
              if (unnamed !== null) return;
              acts.setProperty(conceptId, { propertyId: property.id, name, varies });
              setEditing(false);
            }}
            data-testid={`property-save-${property.id}`}
          >
            Save property
          </button>
          <button
            type="button"
            className="btn-bare"
            onClick={() => acts.setProperty(conceptId, { propertyId: property.id, name: property.name, removed: true })}
          >
            Remove property
          </button>
          <button type="button" className="btn-bare" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <InertNote control={`property-${property.id}`} reason={unnamed} />
        </div>
      </li>
    );
  }
  return (
    <li data-testid={`property-${property.id}`}>
      <strong>{property.name}</strong>
      {property.varies === undefined ? (
        <span className="small muted"> Variation not defined yet.</span>
      ) : (
        <span>: {property.varies}</span>
      )}
      {property.original !== undefined && (
        <span className="small muted"> First set as {property.original.name}.</span>
      )}{" "}
      <button type="button" className="btn-bare linkish small" onClick={() => setEditing(true)} data-testid={`property-edit-${property.id}`}>
        Edit
      </button>
    </li>
  );
}

function AddProperty(props: { conceptId: string; acts: ConceptActs }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [varies, setVaries] = useState("");
  const busy = props.acts.busy;
  const unnamed = name.trim() === "" ? "Name the property first." : null;
  if (!open) {
    return (
      <button type="button" className="btn-bare linkish small" onClick={() => setOpen(true)} data-testid={`property-add-${props.conceptId}`}>
        Add property
      </button>
    );
  }
  return (
    <div className="concept-form">
      <label className="concept-field">
        <span>Property</span>
        <input value={name} placeholder="Time on task" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="concept-field">
        <span>Variation</span>
        <input value={varies} placeholder="From none to every weekly update" onChange={(e) => setVaries(e.target.value)} />
      </label>
      <div className="concept-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          {...inertAttrs(`property-add-${props.conceptId}`, unnamed)}
          onClick={() => {
            if (unnamed !== null) return;
            props.acts.setProperty(props.conceptId, { name, varies });
            setOpen(false);
            setName("");
            setVaries("");
          }}
        >
          Save property
        </button>
        <button type="button" className="btn-bare" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <InertNote control={`property-add-${props.conceptId}`} reason={unnamed} />
      </div>
    </div>
  );
}

function SetRelation(props: {
  card: ConceptCard;
  view: ProjectOntologyView;
  names: Names;
  acts: ConceptActs;
}) {
  const { card, view, names, acts } = props;
  const others = view.accepted.filter((c) => c.id !== card.id);
  const [open, setOpen] = useState(false);
  const [relation, setRelation] = useState<ConceptRelation>("leads-to");
  const [to, setTo] = useState(others[0]?.id ?? "");
  const [source, setSource] = useState("");
  const busy = acts.busy;
  if (others.length === 0) return null;
  if (!open) {
    return (
      <button type="button" className="btn-bare linkish small" onClick={() => setOpen(true)} data-testid={`relation-add-${card.id}`}>
        Set relation
      </button>
    );
  }
  const target = to === "" ? others[0]?.id ?? "" : to;
  const passages = [...new Set([...evidenceBehind(view, card.id).passages, ...evidenceBehind(view, target).passages])];
  const answers = [card, view.concepts.get(target)]
    .flatMap((c) => (c?.source.kind === "summary" ? [c.source.station] : []))
    .filter((subject, i, all) => all.indexOf(subject) === i);
  return (
    <div className="concept-form" data-testid={`relation-form-${card.id}`}>
      <p className="small">
        {card.name}{" "}
        <select value={relation} onChange={(e) => setRelation(e.target.value as ConceptRelation)} aria-label="Relation">
          {CONCEPT_RELATIONS.map((r) => (
            <option key={r} value={r}>
              {RELATION_PHRASE[r]}
            </option>
          ))}
        </select>{" "}
        <select value={target} onChange={(e) => setTo(e.target.value)} aria-label="Concept">
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </p>
      <label className="concept-field">
        <span>Came from</span>
        <select value={source} onChange={(e) => setSource(e.target.value)} data-testid={`relation-source-${card.id}`}>
          <option value="">To add later</option>
          {answers.map((a) => (
            <option key={`a:${a}`} value={`a:${a}`}>
              Your answer at {stepName(a)}
            </option>
          ))}
          {passages.map((p) => (
            <option key={`p:${p}`} value={`p:${p}`}>
              {names.passage(p)}
            </option>
          ))}
        </select>
      </label>
      <div className="concept-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            if (target === "") return;
            const chosen: ConceptEvidence | undefined = source.startsWith("p:")
              ? { kind: "passage", chunkId: source.slice(2) }
              : source.startsWith("a:")
                ? { kind: "answer", subject: source.slice(2) }
                : undefined;
            acts.setRelation({ from: card.id, to: target, relation, ...(chosen === undefined ? {} : { source: chosen }) });
            setOpen(false);
          }}
          data-testid={`relation-save-${card.id}`}
        >
          Save relation
        </button>
        <button type="button" className="btn-bare" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RefineConcept(props: { card: ConceptCard; acts: ConceptActs }) {
  const { card, acts } = props;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(card.name);
  const [definition, setDefinition] = useState(card.definition);
  const [why, setWhy] = useState(card.why?.text ?? "");
  const busy = acts.busy;
  const unnamed = name.trim() === "" ? "Name the concept first." : null;
  if (!open) {
    return (
      <button type="button" className="btn-bare linkish small" onClick={() => setOpen(true)} data-testid={`concept-refine-${card.id}`}>
        Refine
      </button>
    );
  }
  return (
    <div className="concept-form">
      <label className="concept-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="concept-field">
        <span>Definition</span>
        <textarea value={definition} rows={3} onChange={(e) => setDefinition(e.target.value)} />
      </label>
      <WhyField value={why} onChange={setWhy} testId={`concept-refine-why-${card.id}`} />
      <div className="concept-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          {...inertAttrs(`refine-${card.id}`, unnamed)}
          onClick={() => {
            if (unnamed !== null) return;
            acts.refine(card.id, { name, definition, ...(why.trim() === (card.why?.text ?? "") ? {} : { why }) });
            setOpen(false);
          }}
          data-testid={`concept-refine-save-${card.id}`}
        >
          Save concept
        </button>
        <button type="button" className="btn-bare" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <InertNote control={`refine-${card.id}`} reason={unnamed} />
      </div>
    </div>
  );
}

/** A statement's own controls: retire it, and for an expectation say who in the setting holds it. */
function StatementControls(props: { statement: Statement; acts: ConceptActs }) {
  const { statement, acts } = props;
  if (statement.kind !== "claim") return null;
  return (
    <span className="statement-controls">
      <RetireClaim
        noun="statement"
        title={statement.text}
        onRetire={(reason) => acts.retire(statement.id, reason)}
        testId={`retire-${statement.id}`}
      />
      {statement.pageType === "theory" && (
        <MarkHeldInSetting
          title={statement.text}
          {...(statement.heldBy === undefined ? {} : { heldBy: statement.heldBy })}
          onMark={(heldBy) => acts.markHeld(statement.id, heldBy)}
          testId={`held-${statement.id}`}
        />
      )}
    </span>
  );
}

function StatementLine(props: { statement: Statement; names: Names; acts: ConceptActs }) {
  const { statement, names, acts } = props;
  return (
    <li className="concept-statement" data-testid={`statement-${statement.id}`} id={`statement-${statement.id}`}>
      <span className="statement-origin small" data-testid={`statement-label-${statement.id}`}>{names.label(statement.from)}</span>{" "}
      <span>{statement.text}</span>
      {statement.origin !== undefined && <span className="small muted"> ({originLabel(statement.origin)})</span>}
      {statement.chunks.length > 0 && (
        <span className="small muted">
          {" "}
          {statement.chunks.length === 1 ? `Cites ${names.passage(statement.chunks[0] ?? "")}.` : `Cites ${statement.chunks.length} passages.`}
        </span>
      )}
      <StatementControls statement={statement} acts={acts} />
    </li>
  );
}


/* M89 (2026-10-14): `CardFlags`, the flags the readiness report placed at a
 * concept (ISC-612), drawn on its card with a link to the report on Checks,
 * went with the checks. */

function ConceptCardView(props: {
  card: ConceptCard;
  view: ProjectOntologyView;
  names: Names;
  acts: ConceptActs;
  current: boolean;
  onCurrent: (id: string) => void;
  projectId: string;
  focus: string | null;
  lens?: Lens;
}) {
  const { card, view, names, acts, current, onCurrent, projectId, focus } = props;
  const lens = props.lens ?? PREVIEW;
  const links = view.links.filter((l) => l.from === card.id || l.to === card.id);
  const elementId = cardElementId("concept", card.id);
  const behind = evidenceBehind(view, card.id);
  const counts = countLine([
    [card.properties.length, "property", "properties"],
    [links.length, "relation", "relations"],
    [card.statementIds.length, "statement", "statements"],
    ...behindCounts(behind),
  ]);
  const definition = card.definition === "" ? "Definition not written yet." : lens.full ? card.definition : firstSentence(card.definition);
  // The preview carries the card's place on the page (its id, the ring, the map's current mark); the overlay carries none.
  const place = lens.full
    ? { className: "card-full", "data-testid": `overlay-concept-card-${card.id}` }
    : {
        className: "concept-card",
        "data-testid": `concept-card-${card.id}`,
        "data-current": current ? "true" : "false",
        "data-focus": focus === elementId ? "true" : "false",
        id: elementId,
        tabIndex: -1,
      };
  return (
    <article {...place}>
      <header className="concept-head">
        {!lens.full && (
          <h3 className="concept-name">
            <button type="button" className="btn-bare" onClick={() => onCurrent(card.id)} aria-pressed={current}>
              {card.name}
            </button>
          </h3>
        )}
        {card.origin !== undefined && (
          <span className="concept-mark small muted">{conceptMarkLabel(card.origin, card.original !== null)}</span>
        )}
        {!lens.full && <GapChip id={card.id} definition={card.definition} />}
      </header>
      <p className="concept-definition">{definition}</p>
      <WhyBlock target={{ kind: "concept", id: card.id }} line={card.why} acts={acts} />
      {!lens.full && card.suggestedProperties.length > 0 && (
        <p className="small muted" data-testid={`concept-parts-waiting-${card.id}`}>
          {card.suggestedProperties.length === 1
            ? "You have one suggested property to decide on under Open full view."
            : `You have ${numberWord(card.suggestedProperties.length)} suggested properties to decide on under Open full view.`}
        </p>
      )}
      {!lens.full && <ReadMore target={{ kind: "concept", id: card.id }} counts={counts} onRead={lens.onRead} />}
      {lens.full && (
        <>
          {card.original !== null && (
            <p className="small muted concept-original">
              First accepted as {card.original.name}: {card.original.definition}
            </p>
          )}
          <div className="concept-part">
            <h4>Properties</h4>
            {card.properties.length === 0 ? (
              <p className="small muted">You haven't added a property yet.</p>
            ) : (
              <ul className="concept-list">
                {card.properties.map((p) => (
                  <PropertyRow key={p.id} conceptId={card.id} property={p} acts={acts} />
                ))}
              </ul>
            )}
            <AddProperty conceptId={card.id} acts={acts} />
          </div>
          <SuggestedProperties card={card} acts={acts} />
          <div className="concept-part">
            <h4>Relations</h4>
            {links.length === 0 ? (
              <p className="small muted">You haven't set a relation for this concept yet.</p>
            ) : (
              <ul className="concept-list">
                {links.map((l) => (
                  <li key={l.id} data-testid={`concept-relation-${l.id}`}>
                    <CardLink projectId={projectId} kind="relation" id={l.id} acts={acts} testId={`concept-relation-link-${l.id}`}>
                      {l.from === card.id
                        ? `${RELATION_PHRASE[l.relation]} ${names.concept(l.to)}`
                        : relationSentence(names.concept(l.from), l.relation, names.concept(l.to))}
                    </CardLink>
                    <span className="small muted">{relationEvidenceTail(view, l.id, l.source, names)}</span>
                  </li>
                ))}
              </ul>
            )}
            <SetRelation card={card} view={view} names={names} acts={acts} />
          </div>
          <div className="concept-part">
            <h4>Statements</h4>
            {card.statementIds.length === 0 ? (
              <p className="small muted">You haven't placed a statement under this concept yet.</p>
            ) : (
              <ul className="concept-list">
                {card.statementIds.flatMap((id) => {
                  const st = view.statements.get(id);
                  return st === undefined ? [] : [<StatementLine key={id} statement={st} names={names} acts={acts} />];
                })}
              </ul>
            )}
          </div>
          <BehindList behind={behind} names={names} heading="Behind this concept" testId={`concept-evidence-${card.id}`} />
        </>
      )}
      <div className="concept-actions">
        <RefineConcept card={card} acts={acts} />
        {/* M82 (the lead's ruling A): a concept that turned out empty can leave the ontology. */}
        <RetireClaim
          noun="concept"
          title={card.name}
          onRetire={(reason) => {
            acts.retireConcept(card.id, reason);
            lens.onDecided();
          }}
          testId={`concept-retire-${card.id}`}
        />
      </div>
    </article>
  );
}

/** The end of a relation line: where the relation came from, or how much stands behind it. */
function relationEvidenceTail(view: ProjectOntologyView, relationId: string, source: ConceptEvidence | undefined, names: Names): string {
  if (source !== undefined) return `, ${evidencePhrase(source, { step: stepName, passage: names.passage })}.`;
  const { passages, answers } = evidenceBehindRelation(view, relationId);
  const n = passages.length + answers.length;
  if (n === 0) return ". A passage behind the relation is still to come.";
  return n === 1 ? ", with one passage or answer behind the relation." : `, with ${numberWord(n)} passages or answers behind the relation.`;
}

// ── Links between cards (M67, ISC-632) ──────────────────────────────────────

/**
 * A link from one card to another. The href carries the card in the hash, so
 * the link can be copied and shared within the project; a press opens the card
 * here, which scrolls it into view and rings it briefly.
 */
function CardLink(props: {
  readonly projectId: string;
  readonly kind: CardKind;
  readonly id: string;
  readonly acts: ConceptActs;
  readonly testId: string;
  readonly children: ReactNode;
}) {
  const { projectId, kind, id, acts, testId } = props;
  return (
    <a
      className="card-link"
      href={cardPath(projectId, kind, id)}
      onClick={(e) => {
        e.preventDefault();
        acts.open(kind, id);
      }}
      data-testid={testId}
    >
      {props.children}
    </a>
  );
}

// ── Relation cards (M67, ISC-631) ───────────────────────────────────────────

/** The two concept names, each a link to its card, with the kind between them. */
function RelationEnds(props: { relation: RelationCard; names: Names; acts: ConceptActs; projectId: string; linked: boolean }) {
  const { relation: r, names, acts, projectId, linked } = props;
  const end = (id: string, side: "from" | "to") =>
    linked ? (
      <CardLink projectId={projectId} kind="concept" id={id} acts={acts} testId={`relation-${side}-link-${r.id}`}>
        {names.concept(id)}
      </CardLink>
    ) : (
      <span>{names.concept(id)}</span>
    );
  return (
    <h3 className="relation-ends">
      {end(r.from, "from")} <span className="relation-kind">{RELATION_PHRASE[r.relation]}</span> {end(r.to, "to")}
    </h3>
  );
}


/** The kind and the claim, edited together: Refine on a suggestion, and on a card in the ontology. */
function RelationForm(props: {
  relation: RelationCard;
  acts: ConceptActs;
  onDone: () => void;
  /** After the refinement is saved (in the overlay, a decision that closes it). */
  onSaved?: () => void;
  saveLabel: string;
}) {
  const { relation: r, acts, onDone } = props;
  const busy = acts.busy;
  const [kind, setKind] = useState<ConceptRelation>(r.relation);
  const [claim, setClaim] = useState(r.claim);
  const was = r.status === "suggested" ? (r.suggestion?.whyItMatters ?? "") : (r.why?.text ?? "");
  const [why, setWhy] = useState(was);
  const blocked = claim.trim() === "" ? "Write the claim first, in one sentence." : null;
  return (
    <div className="concept-form" data-testid={`relation-refine-form-${r.id}`}>
      <label className="concept-field">
        <span>Kind</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as ConceptRelation)} data-testid={`relation-refine-kind-${r.id}`}>
          {CONCEPT_RELATIONS.map((k) => (
            <option key={k} value={k}>
              {RELATION_PHRASE[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="concept-field">
        <span>Claim</span>
        <textarea value={claim} rows={2} onChange={(e) => setClaim(e.target.value)} data-testid={`relation-refine-claim-${r.id}`} />
      </label>
      <WhyField value={why} onChange={setWhy} testId={`relation-refine-why-${r.id}`} />
      <div className="concept-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          {...inertAttrs(`relation-refine-${r.id}`, blocked)}
          onClick={() => {
            if (blocked !== null) return;
            acts.refineRelation(r.id, { relation: kind, claim, ...(why.trim() === was ? {} : { why }) });
            onDone();
            props.onSaved?.();
          }}
          data-testid={`relation-refine-save-${r.id}`}
        >
          {props.saveLabel}
        </button>
        <InertNote control={`relation-refine-${r.id}`} reason={blocked} />
        <button type="button" className="btn-bare" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RelationSuggestionCard(props: { relation: RelationCard; view: ProjectOntologyView; names: Names; acts: ConceptActs; projectId: string; lens?: Lens }) {
  const { relation: r, view, names, acts, projectId } = props;
  const lens = props.lens ?? PREVIEW;
  const busy = acts.busy;
  const [mode, setMode] = useState<"view" | "refine" | "reject">("view");
  const [reason, setReason] = useState("");
  const s = r.suggestion;
  if (s === undefined) return null;
  const unreasoned = reason.trim() === "" ? "Give your reason first." : null;
  /* M93, ISC-764: accepting a relation never accepts an end; a suggested end blocks it. */
  const blocked = relationBlocked(view, r.id);
  const proposed = view.suggestedStatements.filter((x) => x.home.kind === "relation" && x.home.id === r.id);
  const claims = statementsFor(view, s.statementIds, { kind: "relation", id: r.id });
  const behind = mergeBehind(evidenceBehindRelation(view, r.id), ...claims.map(statementBehind), {
    passages: proposed.flatMap((x) => (x.chunkId === undefined ? [] : [x.chunkId])),
    answers: [],
  });
  const counts = countLine([
    [r.conditions === "" ? 0 : 1, "condition", "conditions"],
    [r.groundsSaid.length, "link", "links"],
    [claims.length + s.statements.length, "statement", "statements"],
    ...behindCounts(behind),
  ]);
  const decide = (act: () => void) => {
    act();
    lens.onDecided();
  };
  const Root = lens.full ? "div" : "article";
  return (
    <Root
      className={lens.full ? "card-full" : "concept-card concept-suggestion"}
      data-testid={lens.full ? `overlay-relation-suggestion-${r.id}` : `relation-suggestion-${r.id}`}
    >
      <header className="concept-head">
        {!lens.full && <RelationEnds relation={r} names={names} acts={acts} projectId={projectId} linked={false} />}
        <span className="concept-mark small muted">
          <SuggestedChip id={r.id} /> AI-suggested from {sourcePhrase(s.source, stepName)}
        </span>
        <OriginChip origin={names.origin?.(r.suggestion ?? s) ?? null} id={r.id} />
      </header>
      {mode === "refine" ? (
        <RelationForm relation={r} acts={acts} onDone={() => setMode("view")} onSaved={lens.onDecided} saveLabel="Save relation" />
      ) : (
        <p className="relation-claim">{lens.full ? r.claim : firstSentence(r.claim)}</p>
      )}
      {hasGapMarker(r.claim) && mode !== "refine" && <p className="small muted">{GAP_MARKER_NOTE}</p>}
      <RestsOn relation={r} view={view} names={names} />
      {mode !== "refine" && <WhyBlock target={{ kind: "relation", id: r.id }} line={null} proposed={s.whyItMatters ?? ""} acts={acts} />}

      {!lens.full && <ReadMore target={{ kind: "relation", id: r.id }} counts={counts} onRead={lens.onRead} />}
      {lens.full && (
        <>
          {r.groundsSaid.length > 0 && (
            <p className="small muted" data-testid={`relation-grounds-${r.id}`}>
              Abductive grounded this relation in your {r.groundsSaid.length === 1 ? "link" : "links"}: {r.groundsSaid.join("; ")}.
            </p>
          )}
          {r.conditions !== "" && <p className="small">Conditions: {r.conditions}</p>}
          {proposed.length > 0 && (
            <p className="small muted">
              {homedLine(proposed.length, "relation")}
            </p>
          )}
          {(claims.length > 0 || s.statements.length > 0) && (
            <div className="concept-part">
              <h4>Statements to place under this relation</h4>
              <ul className="concept-list">
                {claims.map((st) => (
                  <li key={st.id}>{st.text}</li>
                ))}
                {s.statements.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
          )}
          <BehindList behind={behind} names={names} heading="Behind this relation" testId={`relation-suggestion-evidence-${r.id}`} />
        </>
      )}
      {mode === "reject" ? (
        <div className="concept-form" data-testid={`relation-reject-form-${r.id}`}>
          <label className="concept-field">
            <span>Reason</span>
            <textarea value={reason} rows={2} onChange={(e) => setReason(e.target.value)} data-testid={`relation-reject-reason-${r.id}`} />
          </label>
          <div className="concept-actions">
            <button
              type="button"
              disabled={busy}
              {...inertAttrs(`relation-reject-${r.id}`, unreasoned)}
              onClick={() => {
                if (unreasoned === null) decide(() => acts.rejectRelation(r.id, reason));
              }}
              data-testid={`relation-reject-confirm-${r.id}`}
            >
              Reject relation
            </button>
            <InertNote control={`relation-reject-${r.id}`} reason={unreasoned} />
            <button type="button" className="btn-bare" onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        mode === "view" && (
          <div className="concept-actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              {...inertAttrs(`relation-accept-${r.id}`, blocked)}
              onClick={() => {
                if (blocked === null) decide(() => acts.acceptRelation(r.id));
              }}
              data-testid={`relation-accept-${r.id}`}
            >
              Accept
            </button>
            <button
              type="button"
              {...inertAttrs(`relation-accept-${r.id}`, blocked)}
              onClick={() => {
                if (blocked === null) setMode("refine");
              }}
              data-testid={`relation-refine-${r.id}`}
            >
              Refine
            </button>
            <button type="button" className="btn-bare" onClick={() => setMode("reject")} data-testid={`relation-reject-${r.id}`}>
              Reject…
            </button>
            <InertNote control={`relation-accept-${r.id}`} reason={blocked} />
          </div>
        )
      )}
    </Root>
  );
}

/**
 * The statements and passages a relation from Relate concepts rests on (M82,
 * ISC-694): each statement in full with its origin label.
 */
function RestsOn(props: { relation: RelationCard; view: ProjectOntologyView; names: Names }) {
  const { relation: r, view, names } = props;
  if (r.restsOn.length === 0) return null;
  const said = (g: RelationGround) => {
    if (g.kind === "passage") return names.passage(g.chunkId);
    const st = view.statements.get(g.statementId);
    return st === undefined ? "a statement that you retired" : `${names.label(st.from)}: "${st.text}"`;
  };
  return (
    <div className="small relation-rests" data-testid={`relation-rests-${r.id}`}>
      <span className="why-label">Rests on</span>
      <ul className="concept-list">
        {r.restsOn.map((g) => (
          <li key={g.kind === "passage" ? g.chunkId : g.statementId}>{said(g)}</li>
        ))}
      </ul>
    </div>
  );
}

function Conditions(props: { relation: RelationCard; acts: ConceptActs }) {
  const { relation: r, acts } = props;
  const busy = acts.busy;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(r.conditions);
  if (!open) {
    return (
      <div className="concept-part">
        <h4>Conditions</h4>
        <p className="small">
          {r.conditions === "" ? <span className="muted">You haven't written the conditions yet.</span> : r.conditions}{" "}
          <button type="button" className="btn-bare linkish small" onClick={() => setOpen(true)} data-testid={`relation-conditions-edit-${r.id}`}>
            Edit conditions
          </button>
        </p>
      </div>
    );
  }
  return (
    <div className="concept-part concept-form">
      <label className="concept-field">
        <span>Conditions</span>
        <textarea
          value={text}
          rows={2}
          placeholder="When the founder came through a board member"
          onChange={(e) => setText(e.target.value)}
          data-testid={`relation-conditions-${r.id}`}
        />
      </label>
      <div className="concept-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            acts.setConditions(r.id, text);
            setOpen(false);
          }}
          data-testid={`relation-conditions-save-${r.id}`}
        >
          Save conditions
        </button>
        <button type="button" className="btn-bare" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RelationCardView(props: {
  relation: RelationCard;
  view: ProjectOntologyView;
  names: Names;
  acts: ConceptActs;
  projectId: string;
  focus: string | null;
  lens?: Lens;
}) {
  const { relation: r, view, names, acts, projectId, focus } = props;
  const lens = props.lens ?? PREVIEW;
  const [refining, setRefining] = useState(false);
  const elementId = cardElementId("relation", r.id);
  const behind = evidenceBehindRelation(view, r.id);
  const counts = countLine([
    [r.conditions === "" ? 0 : 1, "condition", "conditions"],
    [r.groundsSaid.length, "link", "links"],
    [r.statementIds.length, "statement", "statements"],
    ...behindCounts(behind),
  ]);
  const place = lens.full
    ? { className: "card-full", "data-testid": `overlay-relation-card-${r.id}` }
    : {
        className: "concept-card relation-card",
        "data-testid": `relation-card-${r.id}`,
        "data-focus": focus === elementId ? "true" : "false",
        id: elementId,
        tabIndex: -1,
      };
  return (
    <article {...place}>
      <header className="concept-head">
        {!lens.full && <RelationEnds relation={r} names={names} acts={acts} projectId={projectId} linked={true} />}
        {r.origin !== undefined && <span className="concept-mark small muted">{conceptMarkLabel(r.origin, r.original !== null)}</span>}
      </header>
      {refining ? (
        <RelationForm relation={r} acts={acts} onDone={() => setRefining(false)} saveLabel="Save relation" />
      ) : r.claim === "" ? (
        <p className="relation-claim small muted" data-testid={`relation-claim-${r.id}`}>
          Claim not written yet.{" "}
          <button type="button" className="btn-bare linkish small" onClick={() => setRefining(true)} data-testid={`relation-claim-write-${r.id}`}>
            Write claim
          </button>
        </p>
      ) : (
        <p className="relation-claim" data-testid={`relation-claim-${r.id}`}>
          {lens.full ? r.claim : firstSentence(r.claim)}
        </p>
      )}
      {hasGapMarker(r.claim) && !refining && <p className="small muted">{GAP_MARKER_NOTE}</p>}
      {!refining && <WhyBlock target={{ kind: "relation", id: r.id }} line={r.why} acts={acts} />}
      {!lens.full && <ReadMore target={{ kind: "relation", id: r.id }} counts={counts} onRead={lens.onRead} />}
      {lens.full && (
        <>
          <RestsOn relation={r} view={view} names={names} />
          {r.original !== null && (
            <p className="small muted concept-original">
              First accepted as {RELATION_PHRASE[r.original.relation]}: {r.original.claim === "" ? "a claim that you hadn't written yet" : r.original.claim}
            </p>
          )}
          {r.groundsSaid.length > 0 && (
            <p className="small muted" data-testid={`relation-grounds-${r.id}`}>
              Abductive grounded this relation in your {r.groundsSaid.length === 1 ? "link" : "links"}: {r.groundsSaid.join("; ")}.
            </p>
          )}
          <Conditions relation={r} acts={acts} />
          <div className="concept-part">
            <h4>Statements</h4>
            {r.statementIds.length === 0 ? (
              <p className="small muted">You haven't placed a statement under this relation yet.</p>
            ) : (
              <ul className="concept-list">
                {r.statementIds.flatMap((id) => {
                  const st = view.statements.get(id);
                  return st === undefined ? [] : [<StatementLine key={id} statement={st} names={names} acts={acts} />];
                })}
              </ul>
            )}
          </div>
          <BehindList behind={behind} names={names} heading="Behind this relation" testId={`relation-evidence-${r.id}`} />
        </>
      )}
      <div className="concept-actions">
        {!refining && r.claim !== "" && (
          <button type="button" className="btn-bare linkish small" onClick={() => setRefining(true)} data-testid={`relation-card-refine-${r.id}`}>
            Refine
          </button>
        )}
        <button
          type="button"
          className="btn-bare linkish small"
          onClick={() => {
            acts.removeRelation(r.id);
            lens.onDecided();
          }}
          data-testid={`relation-remove-${r.id}`}
        >
          Remove relation
        </button>
      </div>
    </article>
  );
}

/** A relation the researcher writes in the Relations section: two concepts, the kind, the claim and any conditions. */
function AddRelation(props: { view: ProjectOntologyView; acts: ConceptActs }) {
  const { view, acts } = props;
  const busy = acts.busy;
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<ConceptRelation>("leads-to");
  const [claim, setClaim] = useState("");
  const [conditions, setConditions] = useState("");
  const concepts = view.accepted;
  if (concepts.length < 2) return null;
  if (!open) {
    return (
      <button type="button" className="btn-bare linkish" onClick={() => setOpen(true)} data-testid="relation-add">
        Add relation
      </button>
    );
  }
  const a = from === "" ? concepts[0]!.id : from;
  const b = to === "" ? (concepts.find((c) => c.id !== a)?.id ?? "") : to;
  const blocked = a === b ? "Choose two different concepts." : claim.trim() === "" ? "Write the claim first, in one sentence." : null;
  return (
    <div className="concept-form concept-card" data-testid="relation-add-form">
      <p className="small">
        <select value={a} onChange={(e) => setFrom(e.target.value)} aria-label="First concept" data-testid="relation-add-from">
          {concepts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>{" "}
        <select value={kind} onChange={(e) => setKind(e.target.value as ConceptRelation)} aria-label="Kind" data-testid="relation-add-kind">
          {CONCEPT_RELATIONS.map((k) => (
            <option key={k} value={k}>
              {RELATION_PHRASE[k]}
            </option>
          ))}
        </select>{" "}
        <select value={b} onChange={(e) => setTo(e.target.value)} aria-label="Second concept" data-testid="relation-add-to">
          {concepts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </p>
      <label className="concept-field">
        <span>Claim</span>
        <textarea
          value={claim}
          rows={2}
          placeholder="Longer office-hours slots lead to higher command scores."
          onChange={(e) => setClaim(e.target.value)}
          data-testid="relation-add-claim"
        />
      </label>
      <label className="concept-field">
        <span>Conditions</span>
        <textarea value={conditions} rows={2} onChange={(e) => setConditions(e.target.value)} data-testid="relation-add-conditions" />
      </label>
      <div className="concept-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          {...inertAttrs("relation-add", blocked)}
          onClick={() => {
            if (blocked !== null) return;
            acts.addRelation({ from: a, to: b, relation: kind, claim, conditions });
            setOpen(false);
            setClaim("");
            setConditions("");
          }}
          data-testid="relation-add-save"
        >
          Save relation
        </button>
        <button type="button" className="btn-bare" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <InertNote control="relation-add" reason={blocked} />
      </div>
    </div>
  );
}

// ── Homes (M67, ISC-633, ISC-634) ───────────────────────────────────────────

const NEW_CONCEPT = "new:concept";
const NEW_RELATION = "new:relation";
/** The tray's own choice: accept the claim and place its statement later, under Statements to place. */
const LATER = "later:";
/** The cleared choice, for a statement whose proposed home the researcher rejected (M78b, ISC-681). */
const CHOOSE = "choose:";

function homeValue(h: StatementHome): string {
  return `${h.kind}:${h.id}`;
}

function homeFrom(value: string): StatementHome | null {
  const at = value.indexOf(":");
  const kind = value.slice(0, at);
  return kind === "concept" || kind === "relation" ? { kind, id: value.slice(at + 1) } : null;
}

/** A home as a phrase: "Office-hours slot", or "the relation Office-hours slot leads to Command score". */
function homeName(h: StatementHome, view: ProjectOntologyView, names: Names): string {
  const waiting =
    h.kind === "concept" ? view.concepts.get(h.id)?.status === "suggested" : view.relations.get(h.id)?.status === "suggested";
  const said = h.kind === "concept" ? `the concept ${names.concept(h.id)}` : `the relation ${names.relation(h.id)}`;
  return waiting ? `${said}, which Abductive suggested` : said;
}

/**
 * The home a statement goes to: the proposed one, another concept or relation
 * in the ontology or waiting as a suggestion, or a new concept or relation
 * written here. The select lists concepts and relations, then "New concept"
 * and "New relation" (the owner's controls, 2026-10-02).
 */
/** What the home fields hold while the researcher chooses. */
interface HomeDraft {
  readonly value: string;
  readonly name: string;
  readonly definition: string;
  readonly from: string;
  readonly to: string;
  readonly kind: ConceptRelation;
  readonly claim: string;
}

/** The home the fields name, with the reason it can't be used yet, if any. */
function resolveHome(d: HomeDraft, view: ProjectOntologyView): { readonly home: StatementHome | NewHome | null; readonly blocked: string | null } {
  const concepts = [...view.accepted, ...view.suggested];
  const chosen = d.value === "" ? (concepts[0] === undefined ? "" : homeValue({ kind: "concept", id: concepts[0].id })) : d.value;
  const a = d.from === "" ? (view.accepted[0]?.id ?? "") : d.from;
  const b = d.to === "" ? (view.accepted.find((c) => c.id !== a)?.id ?? "") : d.to;
  if (chosen === LATER) return { home: null, blocked: null };
  if (chosen === "" || chosen === CHOOSE) return { home: null, blocked: "Choose a home, or write a new concept." };
  if (chosen === NEW_CONCEPT) {
    return d.name.trim() === ""
      ? { home: null, blocked: "Name the concept first." }
      : { home: { kind: "new-concept", name: d.name, definition: d.definition }, blocked: null };
  }
  if (chosen === NEW_RELATION) {
    if (a === "" || b === "" || a === b) return { home: null, blocked: "Choose two different concepts." };
    if (d.claim.trim() === "") return { home: null, blocked: "Write the claim first, in one sentence." };
    return { home: { kind: "new-relation", from: a, to: b, relation: d.kind, claim: d.claim }, blocked: null };
  }
  /* M93, ISC-764: a suggested home asks for its own decision first. */
  const home = homeFrom(chosen);
  return { home, blocked: home === null ? null : homeWaiting(view, home) };
}

function useHomeDraft(proposed: StatementHome | undefined, later = false, cleared = false) {
  return useState<HomeDraft>({
    value: cleared ? CHOOSE : proposed === undefined ? (later ? LATER : "") : homeValue(proposed),
    name: "",
    definition: "",
    from: "",
    to: "",
    kind: "leads-to",
    claim: "",
  });
}

/**
 * The home fields: a select listing concepts and relations, then "New concept"
 * and "New relation" (the owner's controls, 2026-10-02), with the fields that
 * a new concept or relation needs.
 */
function HomeFields(props: {
  readonly draft: HomeDraft;
  readonly set: (patch: Partial<HomeDraft>) => void;
  readonly view: ProjectOntologyView;
  readonly names: Names;
  readonly testId: string;
  /** Offer "Place later" first, for a claim in the tray. */
  readonly later?: boolean;
}) {
  const { draft, set, view, names, testId } = props;
  const concepts = [...view.accepted, ...view.suggested];
  const relations = [...view.acceptedRelations, ...view.suggestedRelations];
  const chosen = draft.value === "" ? (concepts[0] === undefined ? "" : homeValue({ kind: "concept", id: concepts[0].id })) : draft.value;
  const a = draft.from === "" ? (view.accepted[0]?.id ?? "") : draft.from;
  const b = draft.to === "" ? (view.accepted.find((c) => c.id !== a)?.id ?? "") : draft.to;
  return (
    <>
      <label className="concept-field">
        <span>Home</span>
        <select value={chosen} onChange={(e) => set({ value: e.target.value })} data-testid={`${testId}-home-select`}>
          {props.later === true && <option value={LATER}>Place later</option>}
          {chosen === CHOOSE && (
            <option value={CHOOSE} disabled>
              Choose a home
            </option>
          )}
          {concepts.length > 0 && (
            <optgroup label="Concepts">
              {concepts.map((c) => (
                <option key={c.id} value={homeValue({ kind: "concept", id: c.id })}>
                  {c.status === "suggested" ? `${c.name} (suggested)` : c.name}
                </option>
              ))}
            </optgroup>
          )}
          {relations.length > 0 && (
            <optgroup label="Relations">
              {relations.map((r) => (
                <option key={r.id} value={homeValue({ kind: "relation", id: r.id })}>
                  {r.status === "suggested" ? `${names.relation(r.id)} (suggested)` : names.relation(r.id)}
                </option>
              ))}
            </optgroup>
          )}
          <option value={NEW_CONCEPT}>New concept</option>
          {view.accepted.length >= 2 && <option value={NEW_RELATION}>New relation</option>}
        </select>
      </label>
      {chosen === NEW_CONCEPT && (
        <>
          <label className="concept-field">
            <span>Name</span>
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} data-testid={`${testId}-new-name`} />
          </label>
          <label className="concept-field">
            <span>Definition</span>
            <textarea value={draft.definition} rows={2} onChange={(e) => set({ definition: e.target.value })} data-testid={`${testId}-new-definition`} />
          </label>
        </>
      )}
      {chosen === NEW_RELATION && (
        <>
          <p className="small">
            <select value={a} onChange={(e) => set({ from: e.target.value })} aria-label="First concept">
              {view.accepted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>{" "}
            <select value={draft.kind} onChange={(e) => set({ kind: e.target.value as ConceptRelation })} aria-label="Kind">
              {CONCEPT_RELATIONS.map((k) => (
                <option key={k} value={k}>
                  {RELATION_PHRASE[k]}
                </option>
              ))}
            </select>{" "}
            <select value={b} onChange={(e) => set({ to: e.target.value })} aria-label="Second concept">
              {view.accepted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </p>
          <label className="concept-field">
            <span>Claim</span>
            <textarea value={draft.claim} rows={2} onChange={(e) => set({ claim: e.target.value })} data-testid={`${testId}-new-claim`} />
          </label>
        </>
      )}
    </>
  );
}

/** The home fields with their own Accept, for a statement to place or a suggested statement. */
function HomeChoice(props: {
  readonly statementId: string;
  readonly proposed: StatementHome | undefined;
  readonly view: ProjectOntologyView;
  readonly names: Names;
  readonly acts: ConceptActs;
  readonly label: string;
  readonly onChoose: (home: StatementHome | NewHome) => void;
  readonly testId: string;
  /** Open on "Choose a home", for a statement whose proposed home was rejected (M78b). */
  readonly cleared?: boolean;
}) {
  const { proposed, view, names, acts, testId } = props;
  const busy = acts.busy;
  const [draft, setDraft] = useHomeDraft(proposed, false, props.cleared === true);
  const { home, blocked } = resolveHome(draft, view);
  return (
    <div className="concept-form home-choice" data-testid={`${testId}-home`}>
      <HomeFields draft={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))} view={view} names={names} testId={testId} />
      <div className="concept-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          {...inertAttrs(testId, blocked)}
          onClick={() => {
            if (home !== null) props.onChoose(home);
          }}
          data-testid={`${testId}-accept`}
        >
          {props.label}
        </button>
        <InertNote control={testId} reason={blocked} />
      </div>
    </div>
  );
}

/**
 * A claim from the papers or the rival writer, waiting in the tray, carries the
 * home Abductive proposed and the same select (the lead's ruling, M67). The
 * tray's own Accept accepts the claim; the home the researcher leaves chosen
 * here is where the statement goes in the same press.
 */
export function TrayHome(props: {
  readonly proposalId: string;
  readonly view: ProjectOntologyView;
  readonly names: Names;
  readonly onChange: (proposalId: string, home: StatementHome | NewHome | null) => void;
}) {
  const { proposalId, view, names, onChange } = props;
  const proposed = view.proposalHomes.get(proposalId);
  const [draft, setDraft] = useHomeDraft(proposed, true);
  const { home } = resolveHome(draft, view);
  const said = JSON.stringify(home);
  useEffect(() => {
    onChange(proposalId, home);
    // `said` stands for `home`, which is a fresh object on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalId, said, onChange]);
  if (view.accepted.length + view.suggested.length === 0 && proposed === undefined) return null;
  return (
    <div className="concept-form home-choice" data-testid={`tray-home-${proposalId}`}>
      {proposed !== undefined && (
        <p className="small" data-testid={`tray-home-proposed-${proposalId}`}>
          Abductive proposes a home under {homeName(proposed, view, names)}.
        </p>
      )}
      <HomeFields draft={draft} set={(patch) => setDraft((d) => ({ ...d, ...patch }))} view={view} names={names} testId={`tray-${proposalId}`} later />
    </div>
  );
}

/**
 * A statement Abductive suggested from a summary or the data, arriving with its
 * proposed home (ISC-633). From M70 it waits under Statements to place, first,
 * and previews and opens in the overlay as every other card does (the lead's
 * ruling: one section for every statement awaiting a decision or a home).
 */
function StatementSuggestionCard(props: {
  suggestion: StatementSuggestedEvent;
  view: ProjectOntologyView;
  names: Names;
  acts: ConceptActs;
  lens?: Lens;
}) {
  const { suggestion: s, view, names, acts } = props;
  const lens = props.lens ?? PREVIEW;
  const busy = acts.busy;
  const [mode, setMode] = useState<"view" | "refine" | "reject">("view");
  const [text, setText] = useState(s.text);
  const [reason, setReason] = useState("");
  const unreasoned = reason.trim() === "" ? "Give your reason first." : null;
  const testId = `statement-suggestion-${s.statementId}`;
  const rejectedHome = homeRejected(view, s.home);
  const behind: Behind = { passages: s.chunkId === undefined ? [] : [s.chunkId], answers: [] };
  const decide = (act: () => void) => {
    act();
    lens.onDecided();
  };
  const Root = lens.full ? "div" : "li";
  return (
    <Root
      className={lens.full ? "card-full" : "concept-card concept-suggestion concept-statement"}
      data-testid={lens.full ? `overlay-${testId}` : testId}
    >
      <header className="concept-head">
        <span className="concept-mark small muted">
          <SuggestedChip id={s.statementId} /> AI-suggested from {sourcePhrase(s.source, stepName)}
        </span>
        <OriginChip origin={names.origin?.(props.suggestion) ?? null} id={s.statementId} />
      </header>
      <p className="statement-origin small" data-testid={`statement-label-${s.statementId}`}>
        {names.label(suggestionFrom(s))}
      </p>
      {mode === "refine" ? (
        <label className="concept-field">
          <span>Statement</span>
          <textarea value={text} rows={2} onChange={(e) => setText(e.target.value)} data-testid={`${testId}-text`} />
        </label>
      ) : (
        // In the overlay the dialog's title is the statement in full, so the card does not repeat it.
        !lens.full && <p className="concept-definition">{firstSentence(text)}</p>
      )}
      {/* M78b, ISC-681: a rejected home leaves the statement here, to place. */}
      {rejectedHome ? (
        <p className="small" data-testid={`${testId}-home-rejected`}>
          You rejected its proposed home, {homeName(s.home, view, names)}.
        </p>
      ) : (
        <p className="small" data-testid={`${testId}-proposed`}>
          Abductive proposes a home under {homeName(s.home, view, names)}.
        </p>
      )}
      {!lens.full && (
        <ReadMore target={{ kind: "statement", id: s.statementId }} counts={countLine(behindCounts(behind))} onRead={lens.onRead} />
      )}
      {lens.full && <BehindList behind={behind} names={names} heading="Behind this statement" testId={`${testId}-evidence`} />}
      {mode === "reject" ? (
        <div className="concept-form">
          <label className="concept-field">
            <span>Reason</span>
            <textarea value={reason} rows={2} onChange={(e) => setReason(e.target.value)} data-testid={`${testId}-reason`} />
          </label>
          <div className="concept-actions">
            <button
              type="button"
              disabled={busy}
              {...inertAttrs(`${testId}-reject`, unreasoned)}
              onClick={() => {
                if (unreasoned === null) decide(() => acts.rejectStatement(s.statementId, reason));
              }}
              data-testid={`${testId}-reject-confirm`}
            >
              Reject statement
            </button>
            <InertNote control={`${testId}-reject`} reason={unreasoned} />
            <button type="button" className="btn-bare" onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <HomeChoice
            statementId={s.statementId}
            proposed={rejectedHome ? undefined : s.home}
            cleared={rejectedHome}
            view={view}
            names={names}
            acts={acts}
            label="Accept"
            testId={testId}
            onChoose={(home) => decide(() => acts.acceptStatement(s.statementId, home, text === s.text ? undefined : text))}
          />
          <div className="concept-actions">
            {mode === "view" && (
              <button type="button" onClick={() => setMode("refine")} data-testid={`${testId}-refine`}>
                Refine
              </button>
            )}
            <button type="button" className="btn-bare" onClick={() => setMode("reject")} data-testid={`${testId}-reject`}>
              Reject…
            </button>
          </div>
        </>
      )}
    </Root>
  );
}

/** How many proposals "Statements to place" shows at a time (the owner's three, 2026-10-02). */
export const PROPOSALS_SHOWN = 3;

/**
 * One statement to place (M70, ISC-647): the first sentence, its authorship
 * mark, the proposed home and Accept on the preview; the whole statement and
 * every passage and answer behind it in the overlay, with the same Accept.
 */
function ToPlaceCard(props: { statement: Statement; view: ProjectOntologyView; names: Names; acts: ConceptActs; lens?: Lens }) {
  const { statement: s, view, names, acts } = props;
  const lens = props.lens ?? PREVIEW;
  const behind = statementBehind(props.statement);
  const rest = s.body === undefined || s.body.trim() === "" ? "" : s.body.trim();
  const home = view.homes.get(s.id);
  const decide = (act: () => void) => {
    act();
    lens.onDecided();
  };
  // Retiring the statement in the overlay is a decision too: the statement leaves the page.
  const decidingActs: ConceptActs = lens.full ? { ...acts, retire: (pageId, reason) => decide(() => acts.retire(pageId, reason)) } : acts;
  const Root = lens.full ? "div" : "li";
  const place = lens.full
    ? { className: "card-full", "data-testid": `overlay-to-place-${s.id}` }
    : { className: "concept-card concept-suggestion concept-statement", id: `statement-${s.id}`, "data-testid": `to-place-${s.id}` };
  return (
    <Root {...place}>
      {/* In the overlay the dialog's title is the statement in full, so the card does not repeat it. */}
      <p className="statement-origin small" data-testid={`statement-label-${s.id}`}>
        {names.label(s.from)}
      </p>
      {!lens.full && <p className="concept-definition">{firstSentence(s.text)}</p>}
      {s.origin !== undefined && <p className="small muted">{originLabel(s.origin)}</p>}
      {home !== undefined && (
        <p className="small" data-testid={`to-place-proposed-${s.id}`}>
          Abductive proposes a home under {homeName(home, view, names)}.
        </p>
      )}
      {!lens.full && <ReadMore target={{ kind: "statement", id: s.id }} counts={countLine(behindCounts(behind))} onRead={lens.onRead} />}
      {lens.full && (
        <>
          {rest !== "" && <p className="statement-body">{rest}</p>}
          <BehindList behind={behind} names={names} heading="Behind this statement" testId={`to-place-evidence-${s.id}`} />
        </>
      )}
      <HomeChoice
        statementId={s.id}
        proposed={home}
        view={view}
        names={names}
        acts={acts}
        label="Accept"
        testId={`to-place-${s.id}`}
        onChoose={(chosen) => decide(() => acts.placeAt(s.id, chosen))}
      />
      <StatementControls statement={s} acts={decidingActs} />
    </Root>
  );
}

/**
 * "Statements to place" (ISC-634), which replaces "Unplaced statements", and
 * from M70 the one section for every statement awaiting a decision or a home
 * (the lead's ruling): the statements Abductive suggested at a step save or a
 * read of the data come first, each with Accept, Refine and Reject; then the
 * statements already in the project, for which Abductive proposes a home on
 * first open, three at a time with the rest in the queue. A project with every
 * statement decided and placed shows no such section.
 */
export function StatementsToPlace(props: {
  readonly view: ProjectOntologyView;
  readonly names: Names;
  readonly acts: ConceptActs;
  readonly proposing: boolean;
  readonly note: string | null;
  readonly onPropose: (again: boolean) => void;
  /** How many statements and waiting claims no pass has read yet. */
  readonly unread: number;
  /** Open a card in the overlay. */
  readonly onRead: (target: ReadTarget) => void;
}) {
  const { view, names, acts, proposing, unread, onRead } = props;
  if (view.toPlace.length === 0 && view.suggestedStatements.length === 0) return null;
  const withHome = view.toPlace.filter((s) => view.homes.has(s.id));
  const shown = withHome.slice(0, PROPOSALS_SHOWN);
  const queued = withHome.length - shown.length;
  const homeless = view.toPlace.filter((s) => !view.homes.has(s.id));
  const lensFor = (id: string): Lens => ({ full: false, onRead: () => onRead({ kind: "statement", id }), onDecided: () => {} });
  return (
    <section data-testid="statements-to-place" aria-labelledby="to-place-h" aria-live="polite">
      <h2 id="to-place-h">Statements to place</h2>
      {proposing && (
        <p className="small muted" role="status" data-testid="to-place-proposing">
          Abductive is proposing a home for each of {numberWord(unread)} statements…
        </p>
      )}
      {props.note !== null && (
        <p className="small muted" role="status" data-testid="to-place-note">
          {props.note}
        </p>
      )}
      {view.suggestedStatements.length + shown.length > 0 && (
        <ul className="concept-list unplaced-list" data-testid="to-place-list">
          {view.suggestedStatements.map((s) => (
            <StatementSuggestionCard key={s.statementId} suggestion={s} view={view} names={names} acts={acts} lens={lensFor(s.statementId)} />
          ))}
          {shown.map((s) => (
            <ToPlaceCard key={s.id} statement={s} view={view} names={names} acts={acts} lens={lensFor(s.id)} />
          ))}
        </ul>
      )}
      {queued > 0 && (
        <p className="small muted" data-testid="to-place-queued">
          Abductive has {queued === 1 ? "one more suggested home" : `${numberWord(queued)} more suggested homes`} in the queue, and shows the next one
          when you place a statement.
        </p>
      )}
      {homeless.length > 0 && (
        <Disclosure summary="Statements without a suggested home" count={homeless.length} countNoun="statements" testId="to-place-homeless">
          <ul className="concept-list unplaced-list">
            {homeless.map((s) => (
              <li key={s.id} className="concept-statement" id={`statement-${s.id}`} data-testid={`unplaced-${s.id}`}>
                <span className="statement-origin small" data-testid={`statement-label-${s.id}`}>{names.label(s.from)}</span>{" "}
                <span>{s.text}</span>
                {s.origin !== undefined && <span className="small muted"> ({originLabel(s.origin)})</span>}{" "}
                <HomeChoice
                  statementId={s.id}
                  proposed={undefined}
                  view={view}
                  names={names}
                  acts={acts}
                  label="Place statement"
                  testId={`place-${s.id}`}
                  onChoose={(home) => acts.placeAt(s.id, home)}
                />
                <StatementControls statement={s} acts={acts} />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
      {!proposing && homeless.length > 0 && (
        <div className="concept-actions">
          <button type="button" onClick={() => props.onPropose(unread === 0)} data-testid="to-place-propose">
            Suggest homes
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * The line under a suggestion that is a proposed home (M74a, ISC-663). The
 * relation's copy read "One suggested statement has this relation as their
 * proposed home."; one sentence for both cards keeps the number in agreement.
 */
export function homedLine(n: number, home: "concept" | "relation"): string {
  return n === 1
    ? `One suggested statement has this ${home} as its proposed home.`
    : `${capitalWord(n)} suggested statements have this ${home} as their proposed home.`;
}

const capitalWord = (n: number) => {
  const w = numberWord(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
};

function AddConcept(props: { acts: ConceptActs }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [definition, setDefinition] = useState("");
  const busy = props.acts.busy;
  const unnamed = name.trim() === "" ? "Name the concept first." : null;
  if (!open) {
    return (
      <button type="button" className="btn-bare linkish" onClick={() => setOpen(true)} data-testid="concept-add">
        Add concept
      </button>
    );
  }
  return (
    <div className="concept-form concept-card" data-testid="concept-add-form">
      <label className="concept-field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} data-testid="concept-add-name" />
      </label>
      <label className="concept-field">
        <span>Definition</span>
        <textarea value={definition} rows={3} onChange={(e) => setDefinition(e.target.value)} data-testid="concept-add-definition" />
      </label>
      <div className="concept-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          {...inertAttrs("concept-add", unnamed)}
          onClick={() => {
            if (unnamed !== null) return;
            props.acts.addConcept(name, definition);
            setOpen(false);
            setName("");
            setDefinition("");
          }}
          data-testid="concept-add-save"
        >
          Save concept
        </button>
        <button type="button" className="btn-bare" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <InertNote control="concept-add" reason={unnamed} />
      </div>
    </div>
  );
}

// ── What to look for in the field ───────────────────────────────────────────

/**
 * "What in your material shows that?", answered in the researcher's words with
 * the passage they point at (the lead's ruling, M63): the answer becomes a
 * statement under the concept, and a line it answers is settled by that passage.
 */
export function AnswerAtConcept(props: {
  readonly conceptId: string;
  readonly itemId?: string;
  readonly names: Names;
  readonly acts: ConceptActs;
  readonly testId: string;
}) {
  const { conceptId, itemId, names, acts, testId } = props;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [chunk, setChunk] = useState("");
  const busy = acts.busy;
  const blocked =
    text.trim() === "" ? "Say, in your words, what the passage shows." : chunk === "" ? "Choose the passage that shows it." : null;
  if (names.dataPassages.length === 0) return null;
  if (!open) {
    return (
      <button type="button" className="btn-bare linkish small" onClick={() => setOpen(true)} data-testid={`${testId}-ask`}>
        Answer…
      </button>
    );
  }
  return (
    <span className="concept-form" data-testid={`${testId}-form`}>
      <label className="concept-field">
        <span>What in your material shows that?</span>
        <textarea value={text} rows={2} onChange={(e) => setText(e.target.value)} data-testid={`${testId}-text`} />
      </label>
      <label className="concept-field">
        <span>Passage</span>
        <select value={chunk} onChange={(e) => setChunk(e.target.value)} data-testid={`${testId}-passage`}>
          <option value="">Choose a passage of your data</option>
          {names.dataPassages.map((id) => (
            <option key={id} value={id}>
              {names.passage(id)}
            </option>
          ))}
        </select>
      </label>
      <span className="concept-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          {...inertAttrs(testId, blocked)}
          onClick={() => {
            if (blocked !== null) return;
            acts.answer({ conceptId, text, chunkId: chunk, ...(itemId === undefined ? {} : { itemId }) });
            setOpen(false);
            setText("");
            setChunk("");
          }}
          data-testid={`${testId}-save`}
        >
          Attach observation
        </button>
        <button type="button" className="btn-bare" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <InertNote control={testId} reason={blocked} />
      </span>
    </span>
  );
}

/**
 * Which property, relation or concept a field line settles (M82, ISC-695), so
 * the list reads as the work that finishes the ontology. Null when the line's
 * subject has gone.
 */
export function settlesLine(line: Pick<LookForLine, "kind" | "conceptId" | "targetId">, view: ProjectOntologyView): string | null {
  const name = (id: string) => view.concepts.get(id)?.name ?? "this concept";
  switch (line.kind) {
    case "property": {
      const card = view.concepts.get(line.conceptId);
      const p = card?.properties.find((x) => x.id === line.targetId);
      return card === undefined || p === undefined ? null : `When you settle this line, you define the property "${p.name}" of ${card.name}.`;
    }
    case "relation": {
      const r = line.targetId === undefined ? undefined : view.relations.get(line.targetId);
      return r === undefined ? null : `When you settle this line, you have evidence for the relation ${relationSentence(name(r.from), r.relation, name(r.to))}.`;
    }
    case "evidence":
      return view.concepts.has(line.conceptId) ? `When you settle this line, you have evidence for ${name(line.conceptId)}.` : null;
    case "residue":
      return "When you settle this line, you have an account of this statement in your ontology.";
  }
}

function LookForLineView(props: { line: LookForLine; names: Names; acts: ConceptActs; view?: ProjectOntologyView }) {
  const { line, names, acts } = props;
  const settles = props.view === undefined || line.settled !== null ? null : settlesLine(line, props.view);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const busy = acts.busy;
  return (
    <li className="look-for-line" data-testid={`look-for-line-${line.itemId}`}>
      <span>{line.text}</span>
      {settles !== null && " "}
      {settles !== null && (
        <span className="small muted look-for-settles" data-testid={`look-for-settles-${line.itemId}`}>
          {settles}
        </span>
      )}
      {line.settled !== null ? (
        <span className="small muted">
          {" "}
          {line.settled.by === "passage"
            ? `Settled by ${names.passage(line.settled.chunkId ?? "")}.`
            : line.settled.note === undefined
              ? "Settled by you."
              : `Settled by you: ${line.settled.note}`}
        </span>
      ) : open ? (
        <span className="concept-form">
          <input
            value={note}
            placeholder="Your note from the field (optional)"
            onChange={(e) => setNote(e.target.value)}
            aria-label="Note"
          />{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              acts.settle(line.itemId, note);
              setOpen(false);
            }}
            data-testid={`look-for-settle-confirm-${line.itemId}`}
          >
            Mark settled
          </button>{" "}
          <button type="button" className="btn-bare" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <>
          {" "}
          <button
            type="button"
            className="btn-bare linkish small"
            onClick={() => setOpen(true)}
            data-testid={`look-for-settle-${line.itemId}`}
          >
            Mark settled…
          </button>
          {line.kind !== "property" && line.conceptId !== "" && (
            <>
              {" "}
              <AnswerAtConcept conceptId={line.conceptId} itemId={line.itemId} names={names} acts={acts} testId={`look-for-answer-${line.itemId}`} />
            </>
          )}
        </>
      )}
    </li>
  );
}

function LookForPanel(props: { view: ProjectOntologyView; names: Names; acts: ConceptActs }) {
  const { view, names, acts } = props;
  /* Lines are shown as soon as their condition holds; the next act records
     the raise. A residue line shows whether or not its statement sits under a
     concept (the lead's ruling, M63). */
  const raisedIds = new Set(view.lookFor.map((l) => l.itemId));
  const derived: LookForLine[] = lookForNeeded(view)
    .filter((l) => !raisedIds.has(l.itemId))
    .map((l) => ({ ...l, raisedAt: 0, settled: null }));
  const open = [...view.lookFor, ...derived].filter(
    (l) => l.settled === null && (l.kind === "residue" || view.concepts.get(l.conceptId)?.status === "accepted"),
  );
  const settled = view.lookFor.filter((l) => l.settled !== null);
  const byConcept = new Map<string, LookForLine[]>();
  for (const l of open) byConcept.set(l.conceptId, [...(byConcept.get(l.conceptId) ?? []), l]);
  return (
    <section className="look-for" data-testid="look-for" aria-labelledby="look-for-h">
      <h2 id="look-for-h">What to look for in the field</h2>
      {open.length === 0 ? (
        <p className="small muted" data-testid="look-for-empty">
          {view.accepted.length === 0
            ? "Accept a concept, and Abductive writes the things to observe or ask about the concept."
            : "You have defined every property, and every relation has a passage behind it."}
        </p>
      ) : (
        [...byConcept].map(([conceptId, lines]) => (
          <div key={conceptId}>
            <h3 className="small">{conceptId === "" ? "Statements still to place" : names.concept(conceptId)}</h3>
            <ul className="concept-list">
              {lines.map((l) => (
                <LookForLineView key={l.itemId} line={l} names={names} acts={acts} view={view} />
              ))}
            </ul>
          </div>
        ))
      )}
      {settled.length > 0 && (
        <Disclosure summary="Settled lines" count={settled.length} countNoun="lines" testId="look-for-settled">
          <ul className="concept-list">
            {settled.map((l) => (
              <LookForLineView key={l.itemId} line={l} names={names} acts={acts} />
            ))}
          </ul>
        </Disclosure>
      )}
    </section>
  );
}

// ── All statements ──────────────────────────────────────────────────────────

/**
 * Every statement in one flat, folded list (the lead's ruling, M63): its
 * concept or "unplaced", its authorship mark and its provenance popover, so the
 * project's claims can still be read and searched without a concept in hand.
 * The claims table and the claims map it replaces went with the old tab.
 */
function AllStatements(props: {
  view: ProjectOntologyView;
  names: Names;
  acts: ConceptActs;
  provenance?: ((pageId: string) => ClaimProvenanceView | null) | undefined;
}) {
  const { view, names, provenance } = props;
  const all = [...view.statements.values()];
  if (all.length === 0) return null;
  return (
    <section className="all-statements" data-testid="all-statements">
      <Disclosure summary="All statements" count={all.length} countNoun="statements" testId="all-statements-fold">
        <ul className="concept-list unplaced-list">
          {all.map((s) => (
            <li key={s.id} className="concept-statement" data-testid={`all-statement-${s.id}`}>
              <span className="statement-origin small" data-testid={`statement-label-${s.id}`}>{names.label(s.from)}</span>{" "}
              <span>{s.text}</span>{" "}
              <span className="small muted">
                {s.conceptId !== null ? names.concept(s.conceptId) : s.relationId !== null ? names.relation(s.relationId) : "unplaced"}
                {s.origin === undefined ? "" : `, ${originLabel(s.origin)}`}
              </span>{" "}
              {s.kind === "claim" && provenance !== undefined && (
                <ProvenancePopover view={provenance(s.id)} about={s.text} testId={`all-statement-provenance-${s.id}`} />
              )}
              {/* M75, ISC-669: a paper's claim, a rival or a claim from the conversation
                  alone is not a statement to place, so its own acts (Retire statement,
                  Mark held in setting) sit on its line here while it is unplaced. */}
              {s.conceptId === null && s.relationId === null && !inInbox(s.from) && (
                <StatementControls statement={s} acts={props.acts} />
              )}
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}

// ── The overlay (the owner's addendum, M70) ─────────────────────────────────

/**
 * The card the overlay shows, with its title, or null when the target names
 * nothing on the page now (a card decided, removed or placed since).
 */
function overlayTitle(target: ReadTarget, view: ProjectOntologyView, names: Names): string | null {
  if (target.kind === "concept") {
    const c = view.concepts.get(target.id);
    return c !== undefined && (c.status === "suggested" || c.status === "accepted") ? c.name : null;
  }
  if (target.kind === "relation") {
    const r = view.relations.get(target.id);
    return r !== undefined && (r.status === "suggested" || r.status === "accepted") ? names.relation(r.id) : null;
  }
  const suggested = view.suggestedStatements.find((s) => s.statementId === target.id);
  if (suggested !== undefined) return suggested.text;
  const st = view.toPlace.find((s) => s.id === target.id && view.homes.has(s.id));
  return st === undefined ? null : st.text;
}

/**
 * One card, whole, in a dialog over the page: centred, bounded to the window
 * and scrolling inside itself, so the page beneath does not move. Escape, the
 * Close control or a press outside it closes it, and so does a decision taken
 * inside it. Its accessible name is the concept's name or the relation's pair.
 */
function CardOverlay(props: {
  readonly target: ReadTarget;
  readonly view: ProjectOntologyView;
  readonly names: Names;
  readonly acts: ConceptActs;
  readonly projectId: string;
  readonly onClose: () => void;
}) {
  const { target, view, names, acts, projectId, onClose } = props;
  const title = overlayTitle(target, view, names);
  if (title === null) return null;
  const lens: Lens = { full: true, onRead: () => {}, onDecided: onClose };
  let body: ReactNode = null;
  if (target.kind === "concept") {
    const c = view.concepts.get(target.id)!;
    body =
      c.status === "suggested" ? (
        <SuggestionCard card={c} view={view} names={names} acts={acts} lens={lens} />
      ) : (
        <ConceptCardView
          card={c}
          view={view}
          names={names}
          acts={acts}
          current={false}
          onCurrent={() => {}}
          projectId={projectId}
          focus={null}
          lens={lens}
        />
      );
  } else if (target.kind === "relation") {
    const r = view.relations.get(target.id)!;
    body =
      r.status === "suggested" ? (
        <RelationSuggestionCard relation={r} view={view} names={names} acts={acts} projectId={projectId} lens={lens} />
      ) : (
        <RelationCardView relation={r} view={view} names={names} acts={acts} projectId={projectId} focus={null} lens={lens} />
      );
  } else {
    const suggested = view.suggestedStatements.find((s) => s.statementId === target.id);
    const st = view.toPlace.find((s) => s.id === target.id);
    body =
      suggested !== undefined ? (
        <StatementSuggestionCard suggestion={suggested} view={view} names={names} acts={acts} lens={lens} />
      ) : st !== undefined ? (
        <ToPlaceCard statement={st} view={view} names={names} acts={acts} lens={lens} />
      ) : null;
  }
  return (
    <Sheet open onClose={onClose} title={title} className="card-overlay" testId="card-overlay" closeOnBackdrop>
      {body}
    </Sheet>
  );
}

/**
 * Suggest relations (M82, ISC-694): Relate concepts on a press, which reads
 * every accepted concept with its definition and statements and suggests up to
 * three relations among them.
 */
function SuggestRelations(props: { readonly view: ProjectOntologyView; readonly onRelate: () => void; readonly relating: boolean; readonly note: string | null }) {
  const blocked = props.view.accepted.length < 2 ? "Accept a second concept first." : null;
  const busy = props.relating;
  return (
    <div className="concept-actions suggest-relations">
      <button
        type="button"
        disabled={busy}
        {...inertAttrs("relations-suggest", blocked)}
        onClick={() => {
          if (blocked === null) props.onRelate();
        }}
        data-testid="relations-suggest"
      >
        Suggest relations
      </button>
      <InertNote control="relations-suggest" reason={blocked} />
      {(props.relating || props.note !== null) && (
        <p className="small muted" role="status" data-testid="relations-suggest-note">
          {props.relating ? "Abductive is considering your accepted concepts and their statements for relations." : props.note}
        </p>
      )}
    </div>
  );
}

// ── The argument so far (M82, ISC-695) ──────────────────────────────────────

/** Where Abductive is with the argument so far: writing, failed, or neither; and whether a model is connected. */
export interface ArgumentPanel {
  readonly state: "idle" | "writing" | "error";
  readonly offline?: boolean;
  readonly onRetry?: () => void;
}

/**
 * "The argument so far" at the tab's top: two to four sentences that Abductive
 * writes from the accepted cards and writes again after each accept or refine.
 */
/** Whose paragraph the accepted argument is, as the tab and the Report label it (M93, ISC-762). */
export function argumentOriginLabel(by: "you" | "abductive" | "legacy"): string {
  return by === "you" ? "In your words, edited from Abductive's paragraph" : by === "abductive" ? "Abductive's paragraph, which you accepted" : "AI-suggested from your accepted concepts and relations";
}

function ArgumentSoFar(props: { readonly view: ProjectOntologyView; readonly panel: ArgumentPanel; readonly acts?: ConceptActs }) {
  const { view, panel } = props;
  const acts = props.acts ?? NO_ACTS;
  const busy = acts.busy;
  /* M93, ISC-762: Accept, Edit and Reject on the paragraph. */
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  const decision = view.argument?.decision ?? null;
  const accepted = view.acceptedArgument;
  const text = view.argument?.text ?? null;
  const stale = argumentStale(view);
  const status =
    view.accepted.length === 0
      ? "Accept a concept, and Abductive writes your argument so far from your accepted concepts and relations."
      : panel.state === "writing"
        ? "Abductive is writing the argument so far from your accepted concepts and relations."
        : panel.state === "error"
          ? "Abductive couldn't write the argument so far. Try again."
          : stale && panel.offline === true
            ? text === null
              ? "Connect a model under Model access, and Abductive writes your argument so far from your accepted concepts and relations."
              : "Your accepted concepts and relations have changed since Abductive wrote this paragraph. Connect a model under Model access, and Abductive writes the paragraph again."
            : null;
  return (
    <section className="argument-so-far" data-testid="argument-so-far" aria-labelledby="argument-h">
      <h2 id="argument-h">The argument so far</h2>
      {accepted !== null && view.accepted.length > 0 && (decision !== "suggested" || accepted.argumentId !== view.argument?.id) && (
        <>
          <p className="argument-text" data-testid="argument-text">
            {accepted.text}
          </p>
          <p className="concept-mark small muted" data-testid="argument-origin">
            {argumentOriginLabel(accepted.by)}
          </p>
        </>
      )}
      {text !== null && view.accepted.length > 0 && decision === "suggested" && (
        <div className="argument-suggestion" data-testid="argument-suggestion">
          <p className="concept-mark small muted">
            <SuggestedChip id="argument" /> AI-suggested from your accepted concepts and relations
          </p>
          {mode === "edit" ? (
            <label className="concept-field">
              <span>The argument so far</span>
              <textarea value={draft} rows={4} onChange={(e) => setDraft(e.target.value)} data-testid="argument-edit-text" />
            </label>
          ) : (
            <p className="argument-text" data-testid="argument-suggested-text">
              {text}
            </p>
          )}
          {mode === "view" && (
            <div className="concept-actions">
              <button type="button" className="primary" disabled={busy} onClick={() => acts.acceptArgument()} data-testid="argument-accept">
                Accept
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(text);
                  setMode("edit");
                }}
                data-testid="argument-edit"
              >
                Edit
              </button>
              <button type="button" className="btn-bare" onClick={() => setMode("reject")} data-testid="argument-reject">
                Reject…
              </button>
            </div>
          )}
          {mode === "edit" && (
            <div className="concept-actions">
              <button
                type="button"
                className="primary"
                disabled={busy}
                {...inertAttrs("argument-edit-save", draft.trim() === "" ? "Write the argument first." : null)}
                onClick={() => {
                  if (draft.trim() === "") return;
                  acts.acceptArgument(draft);
                  setMode("view");
                }}
                data-testid="argument-edit-save"
              >
                Save argument
              </button>
              <InertNote control="argument-edit-save" reason={draft.trim() === "" ? "Write the argument first." : null} />
              <button type="button" className="btn-bare" onClick={() => setMode("view")}>
                Cancel
              </button>
            </div>
          )}
          {mode === "reject" && (
            <div className="concept-form" data-testid="argument-reject-form">
              <label className="concept-field">
                <span>Reason (optional)</span>
                <textarea value={reason} rows={2} onChange={(e) => setReason(e.target.value)} data-testid="argument-reject-reason" />
              </label>
              <div className="concept-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    acts.rejectArgument(reason);
                    setMode("view");
                  }}
                  data-testid="argument-reject-confirm"
                >
                  Reject paragraph
                </button>
                <button type="button" className="btn-bare" onClick={() => setMode("view")}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {decision === "rejected" && view.accepted.length > 0 && (
        <p className="small muted" data-testid="argument-rejected" role="status">
          You rejected Abductive's last paragraph. Abductive writes a new one when your accepted concepts and relations change.
        </p>
      )}
      {status !== null && (
        <p className="small muted" role="status" data-testid="argument-status">
          {status}
          {panel.state === "error" && panel.onRetry !== undefined && " "}
          {panel.state === "error" && panel.onRetry !== undefined && (
            <button type="button" className="btn-bare linkish small" onClick={panel.onRetry} data-testid="argument-retry">
              Try again
            </button>
          )}
        </p>
      )}
    </section>
  );
}

/** Whether the paragraph no longer matches the accepted cards: an accepted concept, and a basis that has moved. */
export function argumentStale(view: ProjectOntologyView): boolean {
  return view.accepted.length > 0 && view.argument?.basis !== argumentBasis(view);
}

/** Whether an accepted card still lacks its Why it matters line. */
export function needsWhy(view: ProjectOntologyView): boolean {
  return view.accepted.some((c) => c.why === null) || view.acceptedRelations.some((r) => r.why === null);
}

/**
 * The concept that Relate concepts should start from after an accept (M82,
 * ISC-694): the newest accepted concept, when it differs from `before` (the
 * newest when last looked), the ontology holds three or more concepts, and the
 * newest has no relation, accepted or suggested. Null otherwise, and null while
 * `before` is unknown, so opening a project runs nothing.
 */
export function relateFocus(before: string | null, view: ProjectOntologyView): string | null {
  if (before === null || view.accepted.length < 3) return null;
  const newest = newestAccepted(view);
  if (newest === null || newest === before) return null;
  const touched = [...view.links, ...view.suggestedRelations].some((r) => r.from === newest || r.to === newest);
  return touched ? null : newest;
}

/** The concept accepted last, or null. */
export function newestAccepted(view: ProjectOntologyView): string | null {
  return [...view.accepted].sort((a, b) => (a.decidedAt ?? 0) - (b.decidedAt ?? 0)).at(-1)?.id ?? null;
}

// ── The page ────────────────────────────────────────────────────────────────

export function ConceptsPage(props: {
  readonly projectId: string;
  readonly view: ProjectOntologyView;
  readonly chunks: readonly Chunk[];
  readonly documents: readonly StoredDocument[];
  /** The project's events, for the answers and replies behind a card, read in full (M70, ISC-647). */
  readonly events?: readonly LedgerEvent[];
  readonly current: string | null;
  readonly onCurrent: (id: string) => void;
  readonly acts: ConceptActs | null;
  /** Above the suggestions, when there is something to say first. */
  readonly lead?: ReactNode;
  /** Below the statements to place: the claims Abductive suggested, while any are pending. */
  readonly after?: ReactNode;
  /** Where a claim came from, for its provenance popover in All statements. */
  readonly provenance?: (pageId: string) => ClaimProvenanceView | null;
  /** The element id of the card a link has just opened, for its brief ring (ISC-632). */
  readonly focus?: string | null;
  /** While Abductive proposes homes for the statements to place (ISC-634). */
  readonly proposing?: boolean;
  readonly proposeNote?: string | null;
  readonly onPropose?: (again: boolean) => void;
  /** Statements and waiting claims that no pass of proposals has read. */
  readonly unread?: number;
  /** The card open in the overlay, if any (the owner's addendum). */
  readonly reading?: ReadTarget | null;
  /** Open a card in the overlay, or close it with null. */
  readonly onRead?: (target: ReadTarget | null) => void;
  /** M82, ISC-695: where Abductive is with the argument so far. */
  readonly argument?: ArgumentPanel;
  /** M82, ISC-694: Suggest relations, while Abductive reads, and the line after. */
  readonly onRelate?: () => void;
  readonly relating?: boolean;
  readonly relateNote?: string | null;
}) {
  const { projectId, current, onCurrent } = props;
  /* M74b, ISC-665: three concepts, three relations and six statements pending
   * at once; the rest wait their turn on the record, and the line says so. */
  const pending = useMemo(() => pendingWindow(props.view), [props.view]);
  const view = pending.view;
  const queue = queueLine(pending.queued);
  /* M90, ISC-733: the concepts Abductive left out since your last decision on the tab. */
  const drops = useMemo(() => droppedLine(recentDrops(props.events ?? [], projectId)), [props.events, projectId]);
  const read = props.onRead ?? (() => {});
  const lensFor = (kind: ReadKind, id: string): Lens => ({ full: false, onRead: () => read({ kind, id }), onDecided: () => {} });
  const acts = props.acts ?? NO_ACTS;
  const focus = props.focus ?? null;
  const names = useMemo(
    () => namesFor(view, props.chunks, props.documents, props.events),
    [view, props.chunks, props.documents, props.events],
  );
  /* M81, the lead's ruling: the tab's room under the study bar, measured, for its height cap and the map's frame. */
  const tabRef = useRef<HTMLElement>(null);
  const room = useTabRoom(tabRef);
  return (
    <main
      className="studyview conceptsview"
      id={MAIN_LANDMARK_ID}
      tabIndex={-1}
      data-testid="study-ontology"
      ref={tabRef}
      style={room === null ? undefined : ({ "--concepts-room": `${room}px` } as CSSProperties)}
    >
      <div className="panel-frame" data-panels="main-side" data-testid="ontology-panels">
        <section className="panel-main">
          <div className="panel-body conceptsview-body">
            <p className="concepts-gloss" data-testid="concepts-gloss">
              {ONTOLOGY_GLOSS}
            </p>
            {/* M82, ISC-695: the argument so far, at the tab's top. */}
            <ArgumentSoFar view={props.view} panel={props.argument ?? { state: "idle" }} acts={acts} />
            {acts.error !== null && (
              <p className="error small" role="alert" data-testid="concepts-error">
                {acts.error}
              </p>
            )}
            {props.lead}
            {queue !== null && (
              <p className="small muted" data-testid="suggestion-queue" role="status">
                {queue}
              </p>
            )}
            {drops !== null && (
              <p className="small muted" data-testid="suggestion-dropped" role="status">
                {drops}
              </p>
            )}
            <section data-testid="concepts" aria-labelledby="concepts-h">
              <h2 id="concepts-h">Concepts</h2>
              <div className="concept-grid" data-testid="concept-grid">
                  {view.suggested.map((c) => (
                    <SuggestionCard key={c.id} card={c} view={view} names={names} acts={acts} lens={lensFor("concept", c.id)} />
                  ))}
                  {view.accepted.map((c) => (
                    <ConceptCardView
                      key={c.id}
                      card={c}
                      view={view}
                      names={names}
                      acts={acts}
                      current={c.id === current}
                      onCurrent={onCurrent}
                      projectId={projectId}
                      focus={focus}
                      lens={lensFor("concept", c.id)}
                    />
                  ))}
              </div>
              {view.suggested.length + view.accepted.length === 0 && (
                <p className="small muted" data-testid="concepts-empty">
                  Save a summary at a step on Design, or press Suggest concepts on Sources, and Abductive suggests concepts from your words.
                </p>
              )}
              <AddConcept acts={acts} />
            </section>
            <section data-testid="relations" aria-labelledby="relations-h">
              <h2 id="relations-h">Relations</h2>
              <div className="concept-grid" data-testid="relation-grid">
                  {view.suggestedRelations.map((r) => (
                    <RelationSuggestionCard key={r.id} relation={r} view={view} names={names} acts={acts} projectId={projectId} lens={lensFor("relation", r.id)} />
                  ))}
                  {view.acceptedRelations.map((r) => (
                    <RelationCardView key={r.id} relation={r} view={view} names={names} acts={acts} projectId={projectId} focus={focus} lens={lensFor("relation", r.id)} />
                  ))}
              </div>
              {view.suggestedRelations.length + view.acceptedRelations.length === 0 && (
                <p className="small muted" data-testid="relations-empty">
                  {view.accepted.length < 2
                    ? "A relation joins two concepts, so accept or add a second concept first."
                    : "Add a relation between two of your concepts."}
                </p>
              )}
              <AddRelation view={view} acts={acts} />
              {props.onRelate !== undefined && (
                <SuggestRelations view={view} onRelate={props.onRelate} relating={props.relating ?? false} note={props.relateNote ?? null} />
              )}
            </section>
            <StatementsToPlace
              onRead={read}
              view={view}
              names={names}
              acts={acts}
              proposing={props.proposing ?? false}
              note={props.proposeNote ?? null}
              onPropose={props.onPropose ?? (() => {})}
              unread={props.unread ?? 0}
            />
            {props.after}
            <AllStatements view={view} names={names} acts={acts} provenance={props.provenance} />
          </div>
        </section>
        <aside className="panel-side">
          <div className="panel-body">
            <LookForPanel view={view} names={names} acts={acts} />
          </div>
        </aside>
      </div>
      {/* M81, ISC-692: the map below both columns, across the tab, in its own frame with a drag handle (replaces M79's fold). */}
      <ConceptMapFrame
        projectId={projectId}
        view={view}
        /* M77b: the map draws the window; the caption counts the queue behind it. */
        queued={mapQueue(props.view, view)}
        current={current}
        /* M75, ISC-668: a dotted node or line opens its suggestion card in the overlay. */
        onOpen={(kind, id, suggested) => (suggested ? read({ kind, id }) : acts.open(kind, id))}
        room={room}
      />
      {props.reading != null && (
        <CardOverlay
          target={props.reading}
          view={view}
          names={names}
          acts={acts}
          projectId={projectId}
          onClose={() => read(null)}
        />
      )}
    </main>
  );
}

/** How long the ring stays on a card that a link opened. */
const FOCUS_RING_MS = 1600;

/** How long focus follows a card's Read more after the overlay closes, while a decision redraws the card. */
const FOCUS_RETURN_MS = 1500;

/** What a page wires the acts to: the door's runner, the proposal door, where a card opens, and the page's busy and error. */
interface ActDeps {
  readonly projectId: string;
  readonly run: (build: Parameters<typeof conceptAct>[2]) => void;
  readonly mutate: (write: () => Promise<MutationOutcome>) => void;
  readonly open: (kind: CardKind, id: string) => void;
  readonly setCurrent: (id: string) => void;
  readonly appendAll: ReturnType<typeof useLedger>["appendAll"];
  readonly readEvents: ReturnType<typeof useLedger>["readEvents"];
  readonly busy: boolean;
  readonly error: string | null;
}

/**
 * Every act on a card, through the door (M93: shared by the ontology tab and
 * the cards under a step's chat, so one card has one set of doors wherever it
 * shows).
 */
function actsFor(d: ActDeps): ConceptActs {
  const { projectId, run, mutate, open, setCurrent, appendAll, readEvents, busy, error } = d;
  return {
  accept: (conceptId) => {
    setCurrent(conceptId);
    run((events) => acceptConceptEvents(events, { projectId, conceptId }));
  },
  refine: (conceptId, edit) => run((events) => refineConceptEvents(events, { projectId, conceptId, ...edit })),
  reject: (conceptId, reason) => run((events) => rejectConceptEvents(events, { projectId, conceptId, reason })),
  addConcept: (name, definition) => run((events) => addConceptEvents(events, { projectId, name, definition })),
  setProperty: (conceptId, property) =>
    run((events) => setPropertyEvents(events, { projectId, conceptId, ...property })),
  setRelation: (link) => run((events) => setRelationEvents(events, { projectId, ...link })),
  removeRelation: (relationId) => run((events) => removeRelationEvents(events, { projectId, relationId })),
  place: (conceptId, pageId) => run((events) => placeStatementEvents(events, { projectId, conceptId, pageId })),
  settle: (itemId, note) => run((events) => settleLineEvents(events, { projectId, itemId, note })),
  retire: (pageId, reason) => mutate(() => retirePage({ projectId, pageId, reason }, { appendAll, readEvents })),
  markHeld: (pageId, heldBy) => mutate(() => markHeldInSetting({ projectId, pageId, heldBy }, { appendAll, readEvents })),
  answer: (input) => run((events) => answerLineEvents(events, { projectId, ...input })),
  acceptRelation: (relationId) => run((events) => acceptRelationEvents(events, { projectId, relationId })),
  refineRelation: (relationId, edit) => run((events) => refineRelationEvents(events, { projectId, relationId, ...edit })),
  rejectRelation: (relationId, reason) => run((events) => rejectRelationEvents(events, { projectId, relationId, reason })),
  setConditions: (relationId, conditions) =>
    run((events) => setRelationConditionsEvents(events, { projectId, relationId, conditions })),
  acceptWhy: (target) => run((events) => acceptWhyEvents(events, { projectId, target })),
  rejectWhy: (target, reason) => run((events) => rejectWhyEvents(events, { projectId, target, reason })),
  acceptProperty: (conceptId, name) => run((events) => acceptPropertyEvents(events, { projectId, conceptId, name })),
  rejectProperty: (conceptId, name, reason) => run((events) => rejectPropertyEvents(events, { projectId, conceptId, name, reason })),
  acceptAll: (conceptId) => {
    setCurrent(conceptId);
    run((events) => acceptAllOnCardEvents(events, { projectId, conceptId }));
  },
  acceptArgument: (text) =>
    run((events) => [acceptArgumentEvent({ projectId, view: projectConcepts(events, projectId, voicedGraph(projectOntology(events, projectId))), ...(text === undefined ? {} : { text }) })]),
  rejectArgument: (reason) =>
    run((events) => [rejectArgumentEvent({ projectId, view: projectConcepts(events, projectId, voicedGraph(projectOntology(events, projectId))), reason })]),
  retireConcept: (conceptId, reason) => run((events) => retireConceptEvents(events, { projectId, conceptId, reason })),
  addRelation: (relation) => run((events) => addRelationEvents(events, { projectId, ...relation })),
  acceptStatement: (statementId, home, text) =>
    run((events) => acceptStatementEvents(events, { projectId, statementId, home, ...(text === undefined ? {} : { text }) })),
  rejectStatement: (statementId, reason) => run((events) => rejectStatementEvents(events, { projectId, statementId, reason })),
  placeAt: (statementId, home) =>
    run((events) =>
      home.kind === "concept" || home.kind === "relation"
        ? placeAtHomeEvents(events, { projectId, statementId, home })
        : placeAtHomeEvents(events, { projectId, statementId, home }),
    ),
  open,
  busy,
  error,
  };
}

export function ConceptsView(props: { readonly projectId: string }) {
  const { projectId } = props;
  const wb = useWorkbench(projectId);
  const { appendAll, readEvents, ready } = useLedger();
  const graph = useMemo(() => voicedGraph(wb.graph), [wb.graph]);
  const view = useMemo(() => projectConcepts(wb.events, projectId, graph), [wb.events, projectId, graph]);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const shown = current !== null && view.concepts.get(current)?.status === "accepted" ? current : (view.accepted[0]?.id ?? null);

  /* A link naming one claim lands on the statement (M53's search results):
     `#/study/:id/ontology/claim-<id>` opens the concept holding it. A link
     naming a card (M67, ISC-632), `concept-<id>` or `relation-<id>`, scrolls
     the card into view and rings it briefly. */
  const ring = useCallback((kind: CardKind, id: string) => {
    if (kind === "concept") setCurrent(id);
    const elementId = cardElementId(kind, id);
    setFocus(elementId);
    requestAnimationFrame(() => {
      const el = document.getElementById(elementId);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    });
    window.setTimeout(() => setFocus((f) => (f === elementId ? null : f)), FOCUS_RING_MS);
  }, []);
  useEffect(() => {
    const land = () => {
      const card = cardRequested(window.location.hash);
      if (card !== null) {
        ring(card.kind, card.id);
        return;
      }
      const id = claimRequested(window.location.hash);
      if (id === null) return;
      const st = view.statements.get(id);
      /* M70: a placed statement is read in its card's overlay, so the link rings
         the card that holds it, as a card link does (the lead's ruling); a
         statement still to place is on the page and scrolls into view. */
      if (st?.conceptId != null) ring("concept", st.conceptId);
      else if (st?.relationId != null) ring("relation", st.relationId);
      else requestAnimationFrame(() => document.getElementById(`statement-${id}`)?.scrollIntoView({ block: "center" }));
    };
    land();
    window.addEventListener("hashchange", land);
    return () => window.removeEventListener("hashchange", land);
    // The card is read once per arrival; a later change to the project re-renders the ring in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ring]);
  /* The owner's addendum: the card open in the overlay is the hash's, so a
     reload reopens it and Back closes it. Closing puts the tab's own hash back
     and hands focus to the card's Read more. */
  const [reading, setReading] = useState<ReadTarget | null>(() => readRequested(window.location.hash));
  useEffect(() => {
    const follow = () => setReading(readRequested(window.location.hash));
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  /* Focus goes back to the card's Read more once the overlay has left the
     page: an effect after the commit, since a frame callback does not run in
     a tab that is in the background (found in the Safari walk). After a
     decision the card beneath is redrawn when the new event arrives (a
     suggestion becomes an accepted card with the same Read more id), so the
     return stays armed for a moment and follows the redraw. */
  const returnTo = useRef<{ readonly id: string; readonly until: number } | null>(null);
  useEffect(() => {
    const back = returnTo.current;
    if (reading !== null || back === null) return;
    if (Date.now() > back.until) {
      returnTo.current = null;
      return;
    }
    const el = document.getElementById(back.id);
    if (el !== null && document.activeElement !== el) el.focus();
  }, [reading, view]);
  const onRead = useCallback(
    (target: ReadTarget | null) => {
      if (target !== null) {
        setReading(target);
        window.location.hash = readPath(projectId, target);
        return;
      }
      const was = readRequested(window.location.hash);
      if (was !== null) {
        returnTo.current = { id: readMoreId(was), until: Date.now() + FOCUS_RETURN_MS };
        window.history.replaceState(null, "", studyPath(projectId, "ontology"));
      }
      setReading(null);
    },
    [projectId],
  );
  const open = useCallback(
    (kind: CardKind, id: string) => {
      const path = cardPath(projectId, kind, id);
      if (window.location.hash === path) ring(kind, id);
      else window.location.hash = path;
    },
    [projectId, ring],
  );

  const run = useCallback(
    (build: Parameters<typeof conceptAct>[2]) => {
      setBusy(true);
      setError(null);
      void conceptAct(projectId, { appendAll, readEvents }, build).then((outcome) => {
        setBusy(false);
        if (!outcome.ok) setError(outcome.error);
      });
    },
    [appendAll, projectId, readEvents],
  );

  /* M67, ISC-634. On first open, Abductive proposes a home for each statement
     that has none: one pass over every statement no pass has read, written as
     one event with the concepts and relations it suggests. A pass runs once
     per open of the tab, and only with a model connected. */
  const [proposing, setProposing] = useState(false);
  const [proposeNote, setProposeNote] = useState<string | null>(null);
  const asked = useRef(false);
  const propose = useCallback(
    (again: boolean) => {
      if (proposing) return;
      const { client, live } = activeInferenceClient();
      if (!live) {
        setProposeNote("Connect a model under Model access, and Abductive proposes a home for each statement.");
        return;
      }
      setProposing(true);
      setProposeNote(null);
      void runSuggestionCounts(
        { projectId, brief: wb.brief ?? emptyBrief(), source: { kind: "grouping" }, again, readEvents, appendAll },
        client,
      )
        .then((counts) =>
          setProposeNote(
            counts.homes === 0 ? "Abductive couldn't find a home to propose for these statements. Place each one under a concept or a relation." : null,
          ),
        )
        .catch((err: unknown) => setProposeNote(`Abductive couldn't propose homes: ${err instanceof Error ? err.message : String(err)}. Try again.`))
        .finally(() => setProposing(false));
    },
    [appendAll, proposing, projectId, readEvents, wb.brief],
  );
  const unread = useMemo(() => toRead(wb.events, projectId, view).length, [wb.events, projectId, view]);
  useEffect(() => {
    if (asked.current || !ready || unread === 0) return;
    asked.current = true;
    propose(false);
  }, [propose, unread, ready]);

  /* Claims Abductive suggested before M63, or from the papers and the rival
     writer, still wait for a decision; they are decided here, where the
     statements they become are shown. */
  /* The lead's ruling (M67): a waiting claim carries its proposed home and the
     select, and accepting it places the statement at the home left chosen. */
  const trayNames = useMemo(() => namesFor(view, wb.chunks, wb.documents, wb.events), [view, wb.chunks, wb.documents, wb.events]);
  const trayHomes = useRef(new Map<string, StatementHome | NewHome>());
  const chooseTrayHome = useCallback((proposalId: string, home: StatementHome | NewHome | null) => {
    if (home === null) trayHomes.current.delete(proposalId);
    else trayHomes.current.set(proposalId, home);
  }, []);
  const placeAccepted = useCallback(
    async (proposalId: string, pageId: string) => {
      const home = trayHomes.current.get(proposalId);
      if (home === undefined) return;
      const outcome = await conceptAct(projectId, { appendAll, readEvents }, (events) =>
        placeAtHomeEvents(events, { projectId, statementId: pageId, home }),
      );
      if (!outcome.ok) setError(outcome.error);
    },
    [appendAll, projectId, readEvents],
  );
  const tray =
    wb.tray.pending.length === 0 ? null : (
      <section className="tray-pane" id={DRAFTS_SECTION_ID} data-testid="tray-pane">
        <ProposalsTrayView
          projectId={projectId}
          tray={wb.tray}
          duplicates={wb.duplicates}
          documents={wb.documents}
          chunks={wb.chunks}
          answeredAbout={turnsAnsweringBaselines(wb.events, projectId, paperBaselines(wb.events, projectId))}
          homeSlot={(proposalId) => <TrayHome proposalId={proposalId} view={view} names={trayNames} onChange={chooseTrayHome} />}
          afterAccept={placeAccepted}
        />
      </section>
    );

  /* A claim's own acts go through the proposal door, the one writer of an
     ontology mutation; the field lines are brought up to date after. */
  const mutate = useCallback(
    (write: () => Promise<MutationOutcome>) => {
      setBusy(true);
      setError(null);
      void write().then(async (outcome) => {
        if (outcome.kind === "rejected") setError(outcome.errors.join(" "));
        else await conceptAct(projectId, { appendAll, readEvents }, (events) => lookForSync(events, [], projectId, "human"));
        setBusy(false);
      });
    },
    [appendAll, projectId, readEvents],
  );
  const provenance = useCallback(
    (pageId: string) => claimProvenance({ events: wb.events, projectId, pageId }),
    [wb.events, projectId],
  );

  /* ── M82: Relate concepts, Why it matters, The argument so far ─────────── */

  /* Relate concepts, on a press of Suggest relations and after an accept that
     leaves the newest of three or more concepts standing alone (ISC-694). The
     newest concept is read at load, so opening a project runs nothing. */
  const [relating, setRelating] = useState(false);
  const [relateNote, setRelateNote] = useState<string | null>(null);
  const relate = useCallback(
    (focus?: string) => {
      const { client, live } = activeInferenceClient();
      if (!live) {
        setRelateNote("Connect a model under Model access, and Abductive suggests relations between your concepts.");
        return;
      }
      setRelating(true);
      setRelateNote(null);
      void runRelate({ projectId, brief: wb.brief ?? emptyBrief(), readEvents, appendAll, ...(focus === undefined ? {} : { focus }) }, client)
        .then((n) => setRelateNote(relatedLine(n)))
        .catch((err: unknown) => setRelateNote(`Abductive couldn't suggest relations: ${err instanceof Error ? err.message : String(err)}. Try again.`))
        .finally(() => setRelating(false));
    },
    [appendAll, projectId, readEvents, wb.brief],
  );
  const newestSeen = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    const before = newestSeen.current;
    newestSeen.current = newestAccepted(view) ?? "";
    const focus = relateFocus(before, view);
    if (focus !== null && !relating && activeInferenceClient().live) relate(focus);
    // Read once per change of the ontology; `relating` and `relate` are read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, view]);

  /* Why it matters: a line for each accepted card without one, once per set of
     cards lacking one, so a reply that writes none is not asked again on every render. */
  const whyTried = useRef<string>("");
  useEffect(() => {
    if (!ready || !needsWhy(view)) return;
    const lacking = [...view.accepted.filter((c) => c.why === null).map((c) => c.id), ...view.acceptedRelations.filter((r) => r.why === null).map((r) => r.id)].join("|");
    if (whyTried.current === lacking) return;
    const { client, live } = activeInferenceClient();
    if (!live) return;
    whyTried.current = lacking;
    void runWhyLines({ projectId, brief: wb.brief ?? emptyBrief(), readEvents, appendAll }, client).catch(() => {
      /* The cards keep "still to come"; the next change to the ontology asks again. */
    });
  }, [ready, view, projectId, wb.brief, readEvents, appendAll]);

  /* The argument so far, written again whenever the accepted cards have moved,
     a moment after the last change, once per basis. */
  const [argumentState, setArgumentState] = useState<ArgumentPanel["state"]>("idle");
  const argumentTried = useRef<string>("");
  const writeArgumentNow = useCallback(() => {
    const { client, live } = activeInferenceClient();
    if (!live) return;
    setArgumentState("writing");
    void runArgument({ projectId, brief: wb.brief ?? emptyBrief(), readEvents, appendAll }, client)
      .then(() => setArgumentState("idle"))
      .catch(() => setArgumentState("error"));
  }, [appendAll, projectId, readEvents, wb.brief]);
  useEffect(() => {
    if (!ready || !argumentStale(view) || !activeInferenceClient().live) return;
    const basis = argumentBasis(view);
    if (argumentTried.current === basis) return;
    const timer = window.setTimeout(() => {
      argumentTried.current = basis;
      writeArgumentNow();
    }, ARGUMENT_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [ready, view, writeArgumentNow]);
  const argumentPanel: ArgumentPanel = useMemo(
    () => ({ state: argumentState, offline: !activeInferenceClient().live, onRetry: writeArgumentNow }),
    // `view` is read so the offline line follows a model connected mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [argumentState, writeArgumentNow, view],
  );

  const acts: ConceptActs = useMemo(
    () => actsFor({ projectId, run, mutate, open, setCurrent, appendAll, readEvents, busy, error }),
    [busy, error, projectId, run, mutate, appendAll, readEvents, open],
  );

  return (
    <ConceptsPage
      projectId={projectId}
      view={view}
      chunks={wb.chunks}
      documents={wb.documents}
      events={wb.events}
      current={shown}
      onCurrent={setCurrent}
      acts={acts}
      provenance={provenance}
      after={tray}
      focus={focus}
      proposing={proposing}
      proposeNote={proposeNote}
      onPropose={propose}
      unread={unread}
      reading={reading}
      onRead={onRead}
      argument={argumentPanel}
      onRelate={() => relate()}
      relating={relating}
      relateNote={relateNote}
    />
  );
}

/** How long the tab waits after the last change before it writes the argument again, so a run of accepts costs one call. */
const ARGUMENT_SETTLE_MS = 1500;

/** The line after Suggest relations (M82): how many relations Abductive suggested, or that it left them as they were. */
export function relatedLine(n: number): string {
  if (n === 0) return "Abductive considered your accepted concepts and their statements, and left your relations as they were.";
  return `Abductive considered your accepted concepts and suggested ${n === 1 ? "one relation" : `${numberWord(n)} relations`}. Review the ${n === 1 ? "suggestion" : "suggestions"} under Relations.`;
}

// ── M93: the cards under a step's chat (ISC-758) ─────────────────────────────

/**
 * The suggestions that Surface concepts and relationships brought at one place,
 * drawn under the chat with the same cards and the same doors as the ontology
 * tab (M93, ISC-758): Accept, Refine and Reject, with a reason to reject. Each
 * card says whose words it draws on. Read more opens the card on the tab.
 */
export function StationSuggestions(props: {
  readonly projectId: string;
  /** A station id, or "framing". */
  readonly place: string;
  readonly events: readonly LedgerEvent[];
  readonly graph: OntologyGraph;
  readonly chunks: readonly Chunk[];
  readonly documents: readonly StoredDocument[];
}) {
  const { projectId, place, events, chunks, documents } = props;
  const { appendAll, readEvents } = useLedger();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const graph = useMemo(() => voicedGraph(props.graph), [props.graph]);
  const view = useMemo(() => projectConcepts(events, projectId, graph), [events, projectId, graph]);
  const names = useMemo(() => namesFor(view, chunks, documents, events), [view, chunks, documents, events]);
  const run = useCallback(
    (build: Parameters<typeof conceptAct>[2]) => {
      setBusy(true);
      setError(null);
      void conceptAct(projectId, { appendAll, readEvents }, build).then((outcome) => {
        setBusy(false);
        if (!outcome.ok) setError(outcome.error);
      });
    },
    [appendAll, projectId, readEvents],
  );
  const mutate = useCallback(
    (write: () => Promise<MutationOutcome>) => {
      setBusy(true);
      setError(null);
      void write().then((outcome) => {
        if (outcome.kind === "rejected") setError(outcome.errors.join(" "));
        setBusy(false);
      });
    },
    [],
  );
  const open = useCallback((kind: CardKind, id: string) => {
    window.location.hash = cardPath(projectId, kind, id);
  }, [projectId]);
  const acts = useMemo(
    () => actsFor({ projectId, run, mutate, open, setCurrent: () => {}, appendAll, readEvents, busy, error }),
    [projectId, run, mutate, open, appendAll, readEvents, busy, error],
  );
  const here = (source: ConceptSource) => source.kind === "chat" && source.station === place;
  const concepts = view.suggested.filter((c) => c.suggestion !== undefined && here(c.suggestion.source));
  const relations = view.suggestedRelations.filter((r) => r.suggestion !== undefined && here(r.suggestion.source));
  const statements = view.suggestedStatements.filter((x) => here(x.source));
  const partsWaiting = view.accepted.some(
    (c) => c.source.kind === "chat" && c.source.station === place && (c.suggestedProperties.length > 0 || c.why?.status === "suggested"),
  );
  const lens = (kind: ReadKind, id: string): Lens => ({
    full: false,
    onRead: () => {
      window.location.hash = readPath(projectId, { kind, id });
    },
    onDecided: () => {},
  });
  if (concepts.length + relations.length + statements.length === 0) {
    return partsWaiting ? (
      <p className="small muted" data-testid="station-parts-waiting">
        You decide on the suggested properties of each concept that you accepted from this chat on the Emerging project ontology tab.
      </p>
    ) : null;
  }
  return (
    <section className="station-suggestions" data-testid="station-suggestions" aria-labelledby={`station-suggestions-h-${place}`}>
      <h3 id={`station-suggestions-h-${place}`}>Surfaced from this chat</h3>
      {error !== null && (
        <p className="error small" role="alert" data-testid="station-suggestions-error">
          {error}
        </p>
      )}
      <div className="concept-grid" data-testid="station-suggestion-grid">
        {concepts.map((c) => (
          <SuggestionCard key={c.id} card={c} view={view} names={names} acts={acts} lens={lens("concept", c.id)} />
        ))}
        {relations.map((r) => (
          <RelationSuggestionCard key={r.id} relation={r} view={view} names={names} acts={acts} projectId={projectId} lens={lens("relation", r.id)} />
        ))}
      </div>
      {statements.length > 0 && (
        <ul className="concept-grid" data-testid="station-statement-grid">
          {statements.map((x) => (
            <StatementSuggestionCard key={`${x.statementId}:${homeRejected(view, x.home) ? "cleared" : "proposed"}`} suggestion={x} view={view} names={names} acts={acts} lens={lens("statement", x.statementId)} />
          ))}
        </ul>
      )}
      {partsWaiting && (
        <p className="small muted" data-testid="station-parts-waiting">
          You decide on the suggested properties of each concept that you accepted from this chat on the Emerging project ontology tab.
        </p>
      )}
    </section>
  );
}
