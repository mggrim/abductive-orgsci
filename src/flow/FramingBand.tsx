/**
 * The theoretical motivation, as the study's first tab (M53, ISC-540).
 *
 * The owner, on the M52 build: "Move Theoretical Motivation to its own tab in
 * front of Design." That supersedes the M41 decision this file was built under,
 * which made the same three fields the app's footer dock, and it supersedes it
 * for a reason the two surfaces show side by side. The dock took a third of every
 * window on all five tabs, and it held three questions a researcher answers once
 * and revises when the study moves. Laid out as a bar, the three fields, the
 * conversation about them and the tool's puzzle reading were a column of boxes in
 * a strip; laid out as a page they are what they always were, the thing the study
 * argues from.
 *
 * So there is no fold, no summary bar, no stored open state and no drag handle.
 * `AppShell` renders this as the body of the `motivation` route the way it renders
 * the Workbench as the body of `design`, the tab strip prints the name, and the
 * page is two columns above 1100px: the three answers on the left, the
 * conversation on the right (the puzzle left this page at ISC-587).
 *
 * ── Why the file is still called FramingBand.tsx ──────────────────────────
 *
 * The same reason `framing` is still the place id, the topic key and the bound
 * subject after M50 renamed the words on screen: every study already saved files
 * its answer under it, and the helpers this module exports (`framingFields`,
 * `framingResync`, `firstEmptyFraming`, `framingCount`) are read by the next-move
 * bar, the rail, the companion and thirty test files. What a reader sees is the
 * tab's label; what the code calls it is unchanged.
 *
 * ── What the page keeps from the dock ────────────────────────────────────
 *
 * Every field, every sentence, both save paths and the puzzle block, unchanged.
 * Three fields: one was a station's neighbour (`startingInterest`), one was the
 * rail's unreachable hub (`targetVenue`), and one lived on the Material tab
 * (`seminalCorpus`). None of them is a station: a station is a question the tool
 * comes back to, and these are what the study is set up to argue.
 *
 * The papers are edited here and uploaded on Material, and both surfaces write
 * `brief.seminalCorpus`. That is deliberate: the names of the papers are a
 * sentence the researcher types while framing, and the files are material, and
 * material has a tab. The link says so rather than making the reader guess.
 *
 * The fields save on blur and there is no save button. `briefChangeEvents` diffs
 * the stored brief against the edited one and returns nothing when a field comes
 * back unchanged, so tabbing through three untouched fields writes nothing at all.
 * A blur that did change a field writes exactly the event a button would have,
 * which is what keeps the record evidence about when a commitment moved.
 *
 * The puzzle is read, never asked (M40, ISC-508): the tool reads it out of the
 * Early data surprise, the steps' answers, the starting interest and the passages
 * the researcher keeps opening. Since the M61 follow-up (ISC-587) this page shows
 * nothing of the puzzle; the reading is offered at the Puzzle step. The page still
 * asks for a reading when what it reads has moved, as it has since M40, so the
 * step, the study bar, the checks and the prompts find a current one.
 */

import { declineDraftEvent, editedFrom } from "../concepts/decisions.ts";
import { SurfaceStep } from "../ui/SurfaceStep.tsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  motivationFieldRequested,
  papersPath,
  studyPath,
  useRoute,
} from "../ui/routes.ts";
import { MAIN_LANDMARK_ID } from "../ui/landmarks.ts";
import { updateBrief, type BriefPatch, type Project, type ProjectBrief } from "../state/projects.ts";
import { serialise, type SaveLoop } from "../state/serialise.ts";

/* Re-exported: the loop was written here for the framing band and is now shared
 * with the paper judge, which had the same defect one surface over. */
export { serialise, type SaveLoop };
import { briefChangeEvents, FRAMING_SUBJECT } from "./stationBrief.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { useStudyFreshness } from "../state/useStudyFreshness.ts";
import { paperFitLine } from "../views/paperFitLine.ts";
import { paperVerdicts } from "../proposals/paperFit.ts";
import {
  baselinesSettled,
  openBaselines,
  paperBaselines,
} from "../proposals/baselines.ts";
import { useJudgeOnMount, judgingAvailableAsync, usePaperFit } from "./usePaperFit.ts";
/* The puzzle, as the tool reads it (M40, ISC-508). The projection says every
 * sentence the Puzzle step prints about it and the hook is what asks the model;
 * this page holds neither rule. */
import { readingDue, usePuzzleReading } from "./usePuzzleReading.ts";
import { formatMoment } from "../ui/format.ts";
import { puzzleSources, readFromSentence, type PuzzleState } from "../views/puzzleReading.ts";
import { paperRefs } from "../proposals/theory.ts";
import { paperRows } from "../views/paperRows.ts";
import { getProject, listChunks, listDocuments } from "../state/projects.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import { Disclosure, StatusChip } from "../ui/components/index.ts";
import { readUnsaved, setUnsaved } from "./unsavedEdits.ts";
// M38, ISC-499. The papers are read beside the framing now, so the verdict chip
// and the two sentences a row says when there is nothing to list come from the
// row on Material rather than being written a second time here.
import { PaperFitChip } from "./PaperFitChip.tsx";
import { NOTHING_EXPECTED_NOTE, NOT_JUDGED_NOTE } from "./PaperExpectations.tsx";
import { AboutYouBlock } from "../help/AboutYouBlock.tsx";
import { Dialogue } from "../workbench/Dialogue.tsx";
import { projectOntology } from "../ontology/projection.ts";
import { projectInterview } from "../interview/state.ts";
import {
  FRAMING_DRAFT_LABELS,
  FRAMING_PLACE,
  framingCoverage,
  GAP_MARKER_NOTE,
  hasGapMarker,
  isGapOnly,
} from "../interview/conversation.ts";
import { useBriefDraft } from "./useBriefDraft.ts";
import { FRAMING_OPENING, FRAMING_PAGE_QUESTION } from "../interview/stationProbes.ts";
import { EditButtons, SummaryButtons, SummaryText } from "./SummaryControls.tsx";
import { STAGE_LINE } from "../ui/stageLine.ts";
/* Where each of the two framing answers came from (M39, ISC-505). */
import { ProvenancePopover } from "../ui/components/ProvenancePopover.tsx";
import { answerProvenance } from "../views/provenance.ts";
import { FRAMING_PLACE_ID } from "../views/placeSummary.ts";
import type { BoundEvent, LedgerEvent } from "../ledger/events.ts";

/**
 * The first field, and where the NextBar sends a researcher who has written
 * nothing at all (R4 item 7).
 *
 * The bar used to say "Start with what is puzzling you" and put the caret in
 * the second field, which asks what you expected and what you found instead.
 * Most people opening this tool cannot answer that on day one, which is why the
 * band puts "What are you thinking about exploring?" first. The sentence and
 * the caret name the same field now.
 */
export const FRAMING_INTEREST_FIELD = "framing-starting-interest";

/** The papers field, third in the band. */
export const FRAMING_PAPERS_FIELD = "framing-seminal-corpus";

/** The venue field, fourth in the band. */
export const FRAMING_VENUE_FIELD = "framing-venue";

/**
 * The three fields this band owns, in the order they are asked.
 *
 * Four until M40. `researchQuestion` left the list because the band stopped
 * writing it: the puzzle is read from the saved answers by
 * `flow/usePuzzleReading.ts` and mirrored into that field, so a band that also
 * wrote it would be the second writer of one value and the researcher would see
 * whichever won.
 *
 * Everything else on a brief belongs to a station, and the band must not write
 * it. A save that shipped the whole brief from the copy this component was
 * holding is how a station's answer got rolled back by a blur two tabs away.
 */
export const FRAMING_FIELDS = ["startingInterest", "seminalCorpus", "targetVenue"] as const;

export type FramingField = (typeof FRAMING_FIELDS)[number];

/** The input each framing field's caret goes to. */
export const FRAMING_FIELD_ID: Readonly<Record<FramingField, string>> = {
  startingInterest: FRAMING_INTEREST_FIELD,
  seminalCorpus: FRAMING_PAPERS_FIELD,
  targetVenue: FRAMING_VENUE_FIELD,
};

/**
 * The three questions, written once (M50, ISC-531 worded them). The page labels
 * its boxes with these and the Design companion prints them over the answers
 * (M53, ISC-541), so the two can never ask different questions.
 */
/** M61, row M90. The field's label is a short noun and the question is its help line. */
export const FRAMING_LABEL: Readonly<Record<FramingField, string>> = {
  startingInterest: "Interest",
  /* M62, ISC-597: the field summarises the literatures named in the
   * conversation, and its label says so. */
  seminalCorpus: "Literatures",
  targetVenue: "Target journal",
};

/* M62, ISC-599: the questions are written once, with the probes the Starting
 * point conversation puts (interview/stationProbes.ts), so the page and the
 * conversation ask the same three. */
export const FRAMING_QUESTION: Readonly<Record<FramingField, string>> = FRAMING_PAGE_QUESTION;

/**
 * The three parts "Summarise" drafts in one call (ISC-592; named so at M62), each
 * under its label and asked in the page's own words.
 */
export const FRAMING_DRAFT_PARTS: readonly { readonly field: FramingField; readonly label: string; readonly question: string }[] =
  FRAMING_FIELDS.map((field) => ({ field, label: FRAMING_DRAFT_LABELS[field], question: FRAMING_QUESTION[field] }));

/**
 * The band's values written onto whatever is on disk now.
 *
 * Two properties, and the live walk lost a field to each of them. The stored
 * brief is read at save time rather than captured when the component rendered,
 * so a save cannot roll back a field somebody else wrote while this one was
 * being typed. And every one of the band's fields goes in every time, so a save
 * triggered by blurring the venue still carries the papers list typed a minute
 * earlier, whether or not it has landed yet.
 */
export function framingMerge(stored: ProjectBrief, band: ProjectBrief): ProjectBrief {
  const named = Object.fromEntries(
    Object.entries(framingFields(band)).filter(([, value]) => value !== undefined),
  );
  return { ...stored, ...named };
}

/**
 * Just the band's three, as a patch.
 *
 * `undefined` means the band has nothing to say about a field, which is not the
 * same as clearing it: a researcher who empties the venue box sends "".
 *
 * `researchQuestion` is deliberately absent (M40). The band no longer has an
 * opinion about the puzzle, and a patch that carried it would let a blur on the
 * venue write back whatever reading this component was holding when it rendered,
 * over a newer one the hook had since stored.
 */
export function framingFields(band: ProjectBrief, pending: ReadonlySet<FramingField> = new Set()): BriefPatch {
  /* Two things never written (ISC-592, and the lead's ruling on it): a field
   * holding nothing but the draft's gap marker, which says the conversation never
   * covered it, and a field still holding an unsaved suggestion, which enters the
   * record only when the researcher presses Save answer or edits it. */
  const kept = (f: FramingField) => {
    const v = band[f];
    return v !== undefined && !pending.has(f) && !(v.trim() !== "" && isGapOnly(v));
  };
  return {
    ...(kept("startingInterest") ? { startingInterest: band.startingInterest } : {}),
    ...(kept("seminalCorpus") ? { seminalCorpus: band.seminalCorpus } : {}),
    ...(kept("targetVenue") ? { targetVenue: band.targetVenue } : {}),
  };
}

/**
 * The suggestions still waiting on the researcher, read from the record (the
 * lead's ruling on ISC-592). Per field, the latest Starting point draft that no
 * save of that field has come after. A draft from before ISC-592 carries no
 * `field` and was always the interest. This is what brings a suggestion back
 * after a reload, so M53's lost draft does not return now that drafts land
 * unsaved.
 */
export function pendingFramingDrafts(
  events: readonly LedgerEvent[],
  projectId: string,
): Partial<Record<FramingField, { readonly eventId: string; readonly text: string }>> {
  const draft = new Map<FramingField, { eventId: string; text: string; ts: number }>();
  const savedAt = new Map<FramingField, number>();
  /* M93, ISC-767: a draft the researcher cancelled or replaced stays declined
     across a reload (the M92 open item). */
  const declined = new Set<string>();
  for (const e of events) if (e.projectId === projectId && e.type === "draft-declined" && e.kind === "brief") declined.add(e.draftId);
  for (const e of events) {
    if (e.projectId !== projectId) continue;
    if (e.type === "brief-draft" && declined.has(e.id)) continue;
    if (e.type === "brief-draft" && e.station === FRAMING_PLACE) {
      const field = FRAMING_FIELDS.find((f) => f === (e.field ?? "startingInterest"));
      const had = field === undefined ? undefined : draft.get(field);
      if (field !== undefined && (had === undefined || e.ts >= had.ts)) draft.set(field, { eventId: e.id, text: e.text, ts: e.ts });
    } else if (e.type === "bound") {
      const field = FRAMING_FIELDS.find((f) => FRAMING_SUBJECT[f] === e.subject);
      if (field !== undefined) savedAt.set(field, Math.max(savedAt.get(field) ?? 0, e.ts));
    }
  }
  const out: Partial<Record<FramingField, { eventId: string; text: string }>> = {};
  for (const [field, d] of draft) {
    if (d.ts > (savedAt.get(field) ?? -Infinity)) out[field] = { eventId: d.eventId, text: d.text };
  }
  return out;
}

/**
 * What a field left open by the researcher's own account says (the owner's
 * amendment to M62): the part was asked and they said it isn't settled, so
 * Summarise leaves the field a gap and names why, in place of the note for a
 * part the conversation never reached.
 */
export const UNSETTLED_NOTE: Readonly<Record<FramingField, string>> = {
  startingInterest: "You said your interest is still open, so Auto-generate summary from chat leaves the field for you to fill.",
  seminalCorpus: "You said the literatures are still up in the air, so Auto-generate summary from chat leaves the field for you to fill.",
  targetVenue: "You said you're still working out the journal, so Auto-generate summary from chat leaves the field for you to fill.",
};

/** The draft each field came from, when it came from one (ISC-592: any of the three). */
type DraftedFrom = Readonly<Partial<Record<FramingField, string>>>;

/**
 * The marks a drafted field carries (M37, D1; ISC-592 for all three). The
 * attribute alone is for tests and styling; the researcher is told, in words,
 * that the text is a suggestion made from what they said, and what a [...] in it
 * means. The interest keeps the test ids it has had since M37.
 */
function DraftMarks(props: {
  readonly field: FramingField;
  readonly drafted: boolean;
  readonly text: string;
  /** True when the field is open by the researcher's own account. */
  readonly unsettled?: boolean;
}) {
  if (!props.drafted) return null;
  const suffix = props.field === "startingInterest" ? "" : `-${props.field}`;
  return (
    <>
      <p className="small station-drafted" data-testid={`framing-drafted${suffix}`} role="status">
        Abductive wrote this from your replies. Save answer makes the summary yours.
      </p>
      {/* The lead's ruling on ISC-592: a suggestion enters the record on a press.
          Since M78b the press is the field's own Save answer (FieldSave). */}
      {hasGapMarker(props.text) &&
        (props.unsettled === true && isGapOnly(props.text) ? (
          <p className="small muted" data-testid={`framing-draft-unsettled-${props.field}`} role="status">
            {UNSETTLED_NOTE[props.field]}
          </p>
        ) : (
          <p className="small muted" data-testid={`framing-draft-gap${suffix}`} role="status">
            {GAP_MARKER_NOTE}
          </p>
        ))}
    </>
  );
}

/**
 * A field's own save (M78b, ISC-681), as a Design step's: Save answer while the
 * field holds an edit or a suggestion that the record doesn't, and the step's
 * chip otherwise. On the serendipity walk the field saved when it lost focus,
 * and a researcher who left the last field for another tab couldn't tell whether
 * the edit had stayed. The edit stays in the field until the press, as a draft.
 */
/**
 * A summary's state, beside its label (M92 polish): Not started, Saved, or
 * Draft while the field holds text that isn't on the record yet.
 */
function FieldChip(props: {
  readonly field: FramingField;
  readonly text: string;
  readonly saved: string;
  readonly waiting: boolean;
  readonly justSaved: boolean;
}) {
  const dirty = props.waiting || props.text !== props.saved;
  return (
    <StatusChip
      label={dirty ? "Draft" : props.justSaved || props.saved.trim() !== "" ? "Saved" : "Not started"}
      tone={props.justSaved && !dirty ? "ok" : "neutral"}
      testId={`framing-saved-${props.field}`}
    />
  );
}

/** Save answer, under a summary that holds unsaved text; a gap alone is not savable. */
function FieldSave(props: {
  readonly field: FramingField;
  readonly text: string;
  readonly onSave: () => void;
}) {
  /* The gap marker alone is never an answer; an empty open box still shows Save answer beside Cancel. */
  if (props.text.trim() !== "" && isGapOnly(props.text)) return null;
  return (
    <button type="button" className="primary" data-testid={`framing-save-${props.field}`} onClick={props.onSave}>
      Save answer
    </button>
  );
}

/**
 * What the band shows when a fresh copy of the project arrives underneath it.
 *
 * The band stays mounted while the researcher works, so the stored project
 * changes under it: a station saves, a paper is judged, a check runs. Taking
 * the incoming value every time discards whatever is in the field right now,
 * which is the text the researcher is in the middle of typing. Taking the local
 * value every time ignores a save made somewhere else.
 *
 * So it is per field: a field the researcher has not touched since the last
 * sync takes whatever is on disk, and a field they have takes what they typed.
 */
export function framingResync(
  local: ProjectBrief,
  lastSynced: ProjectBrief,
  incoming: ProjectBrief,
): ProjectBrief {
  let next: ProjectBrief = incoming;
  for (const field of FRAMING_FIELDS) {
    if ((local[field] ?? "") === (lastSynced[field] ?? "")) continue;
    const held = local[field];
    next = held === undefined ? next : { ...next, [field]: held };
  }
  return next;
}

/** The first of the three with nothing in it, in the order they are asked. */
export function firstEmptyFraming(brief: ProjectBrief): FramingField | undefined {
  return FRAMING_FIELDS.find((field) => (brief[field] ?? "").trim() === "");
}

/** How long the chip reads "Saved" after a blur that wrote something. */
export const SAVED_FLASH_MS = 2000;

/**
 * What the band asks, as one question, for a conversation held here.
 *
 * One clause since M40. It asked for the exploring text and the puzzle together,
 * because the band drew both; the puzzle is the tool's reading of saved answers
 * now, so the conversation here is about the one field it can fill. Said once,
 * here, so the question the model is given and the question the page puts cannot
 * drift apart.
 */
export const FRAMING_TALK_QUESTION = "What are you thinking about exploring?";

/** The right column's heading and its one sentence (M92, ISC-748). */
export const ANSWERS_HEADING = "Your answers";
export const ANSWERS_LEDE =
  "Talk each question through with Abductive in the chat, then press Auto-generate summary from chat for a summary from the conversation, or Edit summary to write your own.";

/** Where "Upload the papers" goes: the Material tab, at its literature section.
 * A path segment, not a fragment: the router reads the whole hash, so a
 * fragment would land on the Design tab (see literaturePath in ui/routes.ts).
 *
 * M33: through `papersPath`, which is also what the papers node on the landing
 * page's fit diagram calls. Two surfaces pointing at the papers is two places
 * the route can drift, so there is one function and both of them use it. */
export function framingPapersHref(projectId: string): string {
  return papersPath(projectId);
}

/** Where the drafts from the papers are waiting: the model, on its own tab. */
export function framingExpectationsHref(projectId: string): string {
  return studyPath(projectId, "ontology");
}

/**
 * What the papers have produced so far, in words (M29, R12).
 *
 * The count is of drafts, not of accepted claims, and that is the useful number
 * here: it tells the researcher there is something waiting for them, which is
 * the only thing this line is for. A count of accepted claims would go up only
 * after they had already been to the tab this line points at.
 */
export function expectationsDrafted(n: number): string {
  return `${n} expectation${n === 1 ? "" : "s"} suggested from your papers`;
}

/**
 * How many of the three are answered, for the chip on the fold's own row.
 *
 * Three since M40, and read off `FRAMING_FIELDS` rather than a second list of the
 * same names, because the chip is now the line a closed fold shows and a count
 * that disagreed with what is inside it would be the fold lying about itself.
 */
export function framingCount(brief: ProjectBrief): number {
  /* A field holding only a draft's gap marker is not answered (ISC-592): the
   * marker says the conversation never covered it, and it is never saved. */
  return FRAMING_FIELDS.filter((field) => {
    const v = (brief[field] ?? "").trim();
    return v !== "" && !isGapOnly(v);
  }).length;
}

/* The dock's own machinery was here and went with the dock (M53, ISC-540).
 *
 * `FRAMING_OPEN_KEY` and `FRAMING_OPEN_DEFAULT` with their reader and writer,
 * `FRAMING_HEIGHT_KEY` with its bounds, step, clamp, reader, writer and pointer
 * arithmetic, `NO_HANDLE_BELOW`, `FRAMING_HANDLE_LABEL`, `framingHeightSaid` and
 * `framingBodyScrollTop`. Fourteen exports, and every one of them answered a
 * question a fold at the foot of a window has to answer: is it open, how tall is
 * it, does this width afford a handle, and where does its scroller have to sit so
 * a focused field's question is not clipped under the bar.
 *
 * A tab has none of those questions. It is as tall as its content, the window
 * scrolls it, and the two stored values (`abductive:framing-open`,
 * `abductive:framing-height`) are read by nothing now. They are left in whatever
 * browsers hold them rather than swept: a stale key costs a reader nothing, and a
 * migration that deleted storage on load would be a write on every visit for no
 * gain.
 *
 * `FRAMING_TITLE` went too. The name is the tab's label, declared once as
 * `STUDY_TAB_LABEL.motivation` in routes.ts and printed by the study bar's h1, so
 * a second declaration here would be the page and the strip able to disagree
 * about what the tab is called.
 */

/**
 * The line under the puzzle, per state (M40, ISC-508).
 *
 * Every sentence a reader meets about the puzzle is here rather than in the
 * markup, for the reason `views/takeToConversation.ts` holds its one line: one
 * sentence, one place, and the surface that draws it cannot reword it. What it is
 * handed is `puzzleState`'s answer, so there is no branch in this function the
 * projection has not already decided.
 */
export function puzzleSourceLine(
  state: PuzzleState,
  status: { readonly reading: boolean; readonly error: string | null },
): string {
  if (status.error !== null) return `Abductive couldn't suggest a puzzle: ${status.error}`;
  /* In every state, not only the first (owner, 2026-09-12: "Read the puzzle
   * doesn't do anything"). It did: a press wrote a second reading in ten seconds.
   * But the line under the puzzle said the same words before and after, and the
   * new reading was near enough the old one that nothing on the screen moved.
   * So the line says when it is reading, and the read state carries the time. */
  if (status.reading) return READING_NOW;
  switch (state.kind) {
    case "nothing-to-read":
      return "Abductive suggests the puzzle from your Early data and your answers at the steps. You haven't saved an answer for Abductive to consider yet.";
    case "unread":
      return "Not suggested yet.";
    case "stated":
      /* C1: the reader's own verb inside eight words. "As stated when this study was
       * framed" led with a passive and named nobody, on the one line whose whole job
       * is to say that these words are theirs rather than the tool's. */
      return "You stated this puzzle when you framed the project, before Abductive suggested puzzles.";
    case "none":
      return `Your puzzle is still to come. ${state.reason}`;
    case "read":
      /* The moment, through the one formatter the app has (`ui/format.ts`), so a
       * second reading visibly differs from the first on the line under it. */
      {
        /* What it was read from, and how much of the corpus that is (D21). The
         * passage count on its own said three over a corpus of twelve and left
         * the reader to wonder which three. */
        const from = `Suggested from ${readFromSentence(state.readFrom)}, ${formatMoment(state.reading.ts)}.`;
        const moved = state.stale ? " Something that Abductive considered has changed since that suggestion." : "";
        // M61: how much the reading covers moved behind Learn more (decision 6).
        return `${from}${moved}`;
      }
  }
}

/** Said while a reading is in the air, in both the line and the control. */
export const READING_NOW = "Suggesting a puzzle from your saved answers…";

/**
 * The control, or none (owner, 2026-09-12: "What is supposed to happen when the
 * user clicks read the puzzle? What does that button do? And how should the user
 * know?").
 *
 * The tool reads on its own whenever what it reads moves, so in the ordinary
 * case a button that reads again does nothing the researcher can see, and a
 * control that does nothing visible cannot be explained by any label. It exists
 * only when a reading is wanted and did not happen by itself: the study was
 * framed before the tool read puzzles, a model was not there when it was due, or
 * the last call failed. Its label names the act, and the line above it says what
 * the last reading was made of and when.
 */
export function puzzleReadControl(
  state: PuzzleState,
  status: { readonly reading: boolean; readonly error: string | null },
): string | null {
  if (status.reading) return null;
  if (status.error !== null) return "Try again";
  switch (state.kind) {
    case "nothing-to-read":
      return null;
    case "stated":
    case "unread":
      return "Suggest a puzzle from my saved answers";
    case "none":
    case "read":
      return state.stale ? "Suggest the puzzle again from my saved answers" : null;
  }
}

export function MotivationPage(props: { project: Project; onChanged: () => void }) {
  const { project, onChanged } = props;
  /*
   * Which field the reader was sent to, and why it is a route rather than an
   * event (M53, ISC-540).
   *
   * The next-move bar names one move and marks the field it names (R4 item 1).
   * Until M52 it dispatched `openFraming(field)` at a dock that was already
   * mounted on the page the bar was on. The motivation is a tab now, so the bar is
   * on Design and this page does not exist until the route has changed, and an
   * event fired before the navigation would reach nothing. So the field rides in
   * the hash (`motivationPath(id, field)`) and the page that arrives reads it.
   *
   * The study header's open-question line and the rail's eighth cell send a reader
   * here with no field, and they should: they point at the whole answer rather
   * than at one box of it.
   *
   * Weight, not a gate, which is what the mark always was. Nothing here is hidden,
   * disabled or reordered by it.
   */
  const route = useRoute();
  /* `typeof window` because this page is also rendered to a string, where there is
   * no location to read and nothing has been asked for. */
  const askedFor =
    route.view === "study" && typeof window !== "undefined"
      ? (motivationFieldRequested(window.location.hash) ?? undefined)
      : undefined;
  /* Cleared by a press anywhere in the fields, so the mark is about the visit the
   * link began rather than a permanent decoration on one of three boxes. */
  const [cleared, setCleared] = useState<string | undefined>(undefined);
  const highlight = cleared === askedFor ? undefined : askedFor;
  const { appendAll, events } = useLedger();
  /* The field a hash carrying one has already been focused for, so a re-render
   * does not take the caret back out of whatever the researcher moved it to. */
  const focused = useRef<string | null>(null);
  const judgeFit = usePaperFit(project.id);
  /* The corpus, for the data half of a fit judgement. Loaded here rather than
   * threaded through, because this band is the one surface that can make a
   * study judgeable and it has no other reason to hold the material. */
  const [documents, setDocuments] = useState<readonly StoredDocument[]>([]);
  const [chunks, setChunks] = useState<readonly Chunk[]>([]);
  /*
   * Whether the corpus read has come back, for the study now showing (M40).
   *
   * A separate flag rather than "the arrays are not empty", because a study with no
   * material has an empty corpus as its settled state and would never satisfy that
   * test. It has to be a flag because the puzzle reading is held until the material
   * is in: the first render has empty arrays, so the digest computed then covers the
   * answers and none of the passages, and a reading started against it wrote one
   * event and was immediately superseded by a second against the real digest. Two
   * readings of one study, three seconds apart, which is the race the walk of
   * 2026-09-09 caught between the two paper judges.
   */
  const [corpusRead, setCorpusRead] = useState<string | null>(null);
  /*
   * Why the corpus is read again, and not only when the study changes (D21, M43b).
   *
   * The dock is the shell's, mounted once per study and standing across all five
   * tabs, and this effect was keyed on the study alone. So the material a
   * researcher added on Material never reached it: the band went on holding the
   * corpus as it was when the study opened, while `usePuzzleReading` reads the
   * corpus fresh from storage inside its own loop.
   *
   * That is what made the puzzle permanently stale on the walk of 2026-09-13.
   * The reading was written over the answers and three passages; the band
   * computed its digest over the answers and no passages at all, the two could
   * never compare equal, and the block said "Something the tool read has moved
   * since" about a reading regenerated one second earlier. Pressing the control
   * wrote another reading with the same digest and the line never cleared.
   *
   * One corpus, read on the same announcement every other holder of this study
   * re-reads on, so the digest the band compares and the digest the writer
   * stamps are over the same material.
   */
  const [corpusNonce, setCorpusNonce] = useState(0);
  const rereadCorpus = useCallback(() => setCorpusNonce((n) => n + 1), []);
  useStudyFreshness(project.id, rereadCorpus);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([listDocuments(project.id), listChunks(project.id)]).then(([d, c]) => {
      if (cancelled) return;
      setDocuments(d);
      setChunks(c);
      setCorpusRead(project.id);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id, corpusNonce]);
  /*
   * Counted off the record rather than passed in (M29, R12).
   *
   * The band is mounted inside the Design page and the papers are read on the
   * Material tab, so the two never share a render. The record is what they do
   * share, and a proposal that will stamp `literature-derived` on accept is
   * exactly and only a draft that came out of a paper.
   */
  /* M78b, ISC-681: an edit not yet saved comes back with the tab. */
  const [brief, setBrief] = useState<ProjectBrief>(() => ({ ...project.brief, ...readUnsaved(project.id) }));
  const drafted = useMemo(
    () =>
      new Set(
        events
          .filter(
            (e) =>
              e.projectId === project.id &&
              e.type === "proposal" &&
              e.originOnAccept === "literature-derived",
          )
          .map((e) => (e as { proposalId: string }).proposalId),
      ).size,
    [events, project.id],
  );
  /* Papers the reader would not draft from (M29b). Beside the count of what the
   * papers produced, because a researcher reading "6 expectations drafted" has
   * no way to know that one of their five papers produced none of them and was
   * not read for a reason. Same selector the Material tab uses. */
  /* How the papers stand, counted once (M29c). Read off the verdicts rather
   * than off the findings, because two of the three verdicts raise no finding
   * and a line counting only failures cannot say "2 papers fit". */
  const fitCounts = useMemo(() => {
    /* Only the papers the study still names (team-lead walk, item a). The line
     * read "4 papers fit, 1 does not" over a list of three, because a line the
     * researcher had edited left its verdict behind. */
    const live = new Set(
      paperRefs({
        documents,
        chunks,
        ...(brief.seminalCorpus === undefined ? {} : { typedList: brief.seminalCorpus }),
      }).map((p) => p.key),
    );
    const verdicts = [...paperVerdicts(events, project.id, live).values()];
    /* M33. What the papers expect and nobody has answered, from the same live
     * set, so a line the researcher edited cannot leave its expectations behind
     * the way it used to leave its verdict. */
    const waiting = openBaselines(
      paperBaselines(events, project.id, live),
      baselinesSettled(events, project.id),
    ).length;
    return {
      fits: verdicts.filter((v) => v.verdict === "fits").length,
      unclear: verdicts.filter((v) => v.verdict === "unclear").length,
      misfit: verdicts.filter((v) => v.verdict === "misfit").length,
      judged: verdicts.length,
      waiting,
    };
  }, [events, project.id, documents, chunks, brief.seminalCorpus]);
  /*
   * The papers, readable here (M38, ISC-499).
   *
   * Judging whether a paper fits needs the paper and the framing side by side,
   * and they were on two tabs: the framing on Design, the papers and what each
   * one expects on Material. The interface research ranked co-visibility ninth
   * of ten and offered two shapes for it, a split view or a strip beside the
   * framing; this is the smaller one. One fold, read-only, off the record the
   * Material rows read. The controls stay on Material, because adding an
   * expectation to your model is a decision and a decision belongs on the
   * surface that shows the whole paper.
   *
   * Live papers only, keyed the way a verdict is keyed, for the reason the
   * count above it is: a typed line the researcher has edited stops being a
   * paper the moment the line goes, and its verdict is about a line that no
   * longer exists.
   */
  /* Lifted to `views/paperRows.ts` at M39 (ISC-503), when the Design companion
   * needed the same rows. The fold was written here and it is read from there by
   * both surfaces now: two surfaces folding three sources into the same rows is
   * FIN-02 with a different noun. The three sentences a reader meets about a
   * paper stay in the markup below, where they already were. */
  const rows = useMemo(
    () =>
      paperRows({
        events,
        projectId: project.id,
        documents,
        chunks,
        ...(brief.seminalCorpus === undefined ? {} : { typedList: brief.seminalCorpus }),
      }),
    [events, project.id, documents, chunks, brief.seminalCorpus],
  );
  const [saved, setSaved] = useState(false);
  /** The fields that this visit's last press saved, for their chips (M78b). */
  const [justSaved, setJustSaved] = useState<ReadonlySet<FramingField>>(() => new Set());
  /** The fields that the presses waiting on the save loop asked for (M78b). */
  const toSave = useRef<Set<FramingField>>(new Set());
  /* The parts the researcher said are still open (the owner's amendment to M62). */
  const openParts = useMemo(() => framingCoverage(events, project.id, {}).open, [events, project.id]);
  /* The conversation is always open (M62, ISC-597, owner, 2026-09-30: "the
   * section on the left should not have a hide chat button"). The open state
   * ISC-488 added and ISC-589 opened on arrival is gone with its control. */
  /** The draft each field came from, when it came from one (ISC-592). */
  const [draftedFrom, setDraftedFrom] = useState<DraftedFrom>({});
  /** The fields still holding an unsaved suggestion (the lead's ruling on ISC-592). */
  const [pending, setPending] = useState<ReadonlySet<FramingField>>(() => new Set());
  const pendingRef = useRef<ReadonlySet<FramingField>>(pending);
  pendingRef.current = pending;
  /** The drafts already put into a field on this mount, so a re-render never puts one back over an edit. */
  const applied = useRef<Set<string>>(new Set());
  /** The brief as saved, which is what the chip counts: a suggestion is not an answer until it is saved. */
  const [savedBrief, setSavedBrief] = useState<ProjectBrief>(project.brief);
  const savedRef = useRef<ProjectBrief>(savedBrief);
  savedRef.current = savedBrief;
  const [draftNote, setDraftNote] = useState<string | null>(null);
  /* M92, ISC-752: each summary reads as text until Edit summary opens it, and
   * Cancel puts back the text that it held when the edit opened. */
  const [editing, setEditing] = useState<ReadonlySet<FramingField>>(() => new Set());
  const editStart = useRef<Partial<Record<FramingField, string>>>({});
  const [generating, setGenerating] = useState<FramingField | null>(null);
  const { makeDraft, drafting } = useBriefDraft(project.id);
  /*
   * The puzzle: what there is to read, and whether a reading is due
   * (M40, ISC-508).
   *
   * Out of `views/puzzleReading.ts`. The page recomputes nothing: the sources and
   * the digest decide whether a reading is due, and a second derivation here would
   * be the page and the record disagreeing about whether the tool has read this
   * study. Since ISC-587 the page prints none of it; a failed reading is reported
   * at the Puzzle step, whose control is the retry.
   */
  const { readNow: readOnly, reading } = usePuzzleReading(project.id);
  /* A reading moves the stored brief, and the two things that hold a copy of it
   * have to be told (walk of 2026-09-12). `onChanged` is how the workbench
   * re-reads the project, which is what the prompts and the checks read the puzzle
   * from; and the papers are judged against the puzzle, so a reading that moved it
   * re-judges them the way a framing save does. The brief for the judge is read
   * fresh rather than taken from `briefRef`, which is this band's own copy and
   * holds the puzzle only once the reload has come back. */
  const readNow = useCallback(async () => {
    await readOnly();
    onChanged();
    const fresh = await getProject(project.id);
    if (fresh === undefined) return;
    const written = await judgeFit({ brief: fresh.brief }).catch(() => 0);
    if (written > 0) onChanged();
  }, [readOnly, onChanged, judgeFit, project.id]);
  const puzzleInput = useMemo(
    () => ({ brief, chunks, documents, events, projectId: project.id }),
    [brief, chunks, documents, events, project.id],
  );
  const { sources, digest } = useMemo(() => puzzleSources(puzzleInput), [puzzleInput]);
  /* The graph and the interview, projected here rather than threaded through.
   * The band has no workbench state of its own, and both are pure replays of the
   * record it already holds. */
  const graph = useMemo(() => projectOntology(events, project.id), [events, project.id]);
  const interview = useMemo(() => projectInterview(events, project.id), [events, project.id]);
  const framingEvents = useMemo(
    () => events.filter((e) => e.projectId === project.id),
    [events, project.id],
  );
  /*
   * The save loop, and why it is a loop rather than a guard (team-lead walk).
   *
   * It was a boolean that returned early while a save was running. The save
   * ends with a model call that judges the papers, which can take half a
   * minute, so every blur inside that window was thrown away silently: fill
   * four fields at ordinary speed and two of them never reach disk.
   *
   * A dropped save is not acceptable and neither is one save per blur running
   * concurrently, because two writers of one record race. So a blur raises a
   * flag, and whichever call owns the loop keeps writing until the flag is
   * down. The last write always carries the latest values, and no blur is lost.
   */
  const loop = useRef<SaveLoop>({ running: false, pending: false });
  /* The band's current values, readable from inside the loop without making
   * the loop depend on a render. */
  const briefRef = useRef<ProjectBrief>(brief);
  briefRef.current = brief;
  /* Read from inside the save loop, which runs outside a render for the same
   * reason `briefRef` does. */
  const draftedFromRef = useRef<DraftedFrom>(draftedFrom);
  draftedFromRef.current = draftedFrom;
  /* M93, ISC-767: each draft's own text, so a save can say whether it was edited. */
  const draftTextRef = useRef<Partial<Record<FramingField, string>>>({});
  const declineDraft = useCallback(
    (draftId: string | undefined) => {
      if (draftId === undefined) return;
      void appendAll([declineDraftEvent({ projectId: project.id, draftId, kind: "brief" })]).catch(() => {
        /* The draft stays on the record as offered; the decline is the only thing lost. */
      });
    },
    [appendAll, project.id],
  );
  /* The stored brief this band last took values from, so a resync can tell an
   * incoming change from a field the researcher is in the middle of editing. */
  const lastSynced = useRef<ProjectBrief>(project.brief);
  /* The "Saved" flash, cleared on a timer. It is the only feedback the band
   * has now, so it has to be visible for long enough to be read and short
   * enough not to be mistaken for a resting state. */
  const flash = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flash.current !== null) clearTimeout(flash.current);
    },
    [],
  );

  /*
   * The caret, when the hash names a field (M53, ISC-540).
   *
   * One frame after the arrival, because the field is this page's and the page has
   * to have painted for `getElementById` to find it. `preventScroll` and then the
   * field's own block rather than its box, which is D7's finding with the dock
   * taken out of it: a plain `focus()` brings the textarea into view and leaves the
   * question above it off the top of the screen, and what a reader needs on
   * arriving is the question. The window is the scroller here, so `scrollIntoView`
   * on the block is the whole of it.
   *
   * Once per field, guarded by a ref. Every render of this page reads the same
   * hash, so an unguarded effect would take the caret back out of whichever box the
   * researcher had moved it to on the next save.
   */
  useEffect(() => {
    if (route.view !== "study") return;
    const field = motivationFieldRequested(window.location.hash);
    if (field === null || focused.current === field) return;
    /* M92, ISC-752: a summary reads as text, so a link that names a field opens
     * that field's box for editing, and the caret goes into it a frame later. */
    const linked = FRAMING_FIELDS.find((f) => FRAMING_FIELD_ID[f] === field);
    if (linked !== undefined) {
      editStart.current = { ...editStart.current, [linked]: briefRef.current[linked] ?? "" };
      setEditing((was) => new Set([...was, linked]));
    }
    let inner = 0;
    const frame = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        /* Marked done inside the frame rather than before it, so an effect that is
         * cleaned up and run again (StrictMode does both) still focuses once. */
        focused.current = field;
        /* Optional, and it has to be: the field is this page's and a build in which
         * it has not landed must focus nothing rather than throw on the way past. */
        const box = document.getElementById(field) as HTMLTextAreaElement | null;
        box?.focus({ preventScroll: true });
        const block = box?.closest(".station-field") ?? box;
        block?.scrollIntoView({ block: "start" });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(inner);
    };
  }, [route]);

  /*
   * The tool reads the puzzle on its own (M40, ISC-508).
   *
   * Two occasions, one effect. Once when the study opens, and again whenever the
   * digest moves while the band is mounted, which is what makes a reading follow
   * the answers it was read from rather than sitting under them going stale. Both
   * are the same condition — there is something to read and the latest reading was
   * not of it — so they are one effect rather than two that could disagree.
   *
   * A mount effect of its own was written first and taken out: `useJudgeOnMount`
   * and this both fire on the first render, and `readNow` serialises rather than
   * dropping, so the second would have been queued as pending and written a second
   * reading of the same digest. What is reused from the judge is the question it
   * asks, `judgingAvailableAsync`, which waits for the bridge probe instead of
   * reading a mock as "no model" the way the synchronous form does on mount.
   *
   * `readingDue` is the projection's rule, so this surface does not decide what
   * counts as due, and a study whose answers have not moved pays one storage read
   * and no model call at all. A failure sets `error`, is shown, and is not retried:
   * the control is the retry.
   */
  const due = useMemo(
    () => readingDue({ sources, digest, events, projectId: project.id }),
    [sources, digest, events, project.id],
  );
  /* What this mount has already asked about, as study and digest. Keyed by both, so
   * a band kept mounted while the route moves to another study asks again for that
   * one, and a digest that changes back to one already read is not read twice. */
  const readAt = useRef<string | null>(null);
  useEffect(() => {
    /* Nothing is read until the material for this study is in. The digest on the
     * first render covers the answers and none of the passages, and a reading of
     * that is a reading of the wrong thing that the next render immediately makes
     * stale. */
    if (corpusRead !== project.id) return;
    /* And nothing is read while a reading is in flight. The loop inside the hook
     * serialises the writes rather than dropping them, so a second start here would
     * not be discarded: it would be queued and land as a duplicate event. When the
     * one in flight finishes, `events` carries it and `due` is false. */
    if (reading) return;
    const key = `${project.id}:${digest}`;
    if (!due || readAt.current === key) return;
    /* Marked before the wait, not after, so the effect React double-invokes under
     * StrictMode cannot start two probes that both come back live. */
    readAt.current = key;
    void (async () => {
      if (!(await judgingAvailableAsync())) return;
      await readNow();
    })();
  }, [due, digest, project.id, readNow, corpusRead, reading]);

  // Resync when the stored project changes underneath, for the same reason
  // StationWorkspace does: this band stays mounted while the researcher moves
  // along the rail, so a save made at a station must not be discarded by the
  // copy this component was holding. Per field, because taking the incoming
  // brief whole discards the text in the field the researcher has open.
  useEffect(() => {
    setBrief((current) => framingResync(current, lastSynced.current, project.brief));
    /* M78b: an unsaved edit that the record now holds is no longer unsaved. */
    const edits = readUnsaved(project.id);
    for (const f of FRAMING_FIELDS) if (edits[f] !== undefined && edits[f] === (project.brief[f] ?? "")) setUnsaved(project.id, f, undefined);
    lastSynced.current = project.brief;
    setSavedBrief(project.brief);
    setSaved(false);
  }, [project]);

  /*
   * One write: the latest values, onto the latest stored brief.
   *
   * Both halves matter and the walk lost a field to each. The stored brief is
   * read here rather than taken from the `project` prop, because the prop is a
   * snapshot from whenever this component last rendered and writing it back
   * rolls other fields to what they were then. And the band's four fields go in
   * whole, so a blur on the venue also carries the puzzle typed a minute ago.
   */
  const writeOnce = useCallback(async () => {
    const band = briefRef.current;
    /* M78b, ISC-681: only the fields whose Save answer was pressed. */
    const asked = [...toSave.current];
    toSave.current = new Set();
    if (asked.length === 0) return false;
    const all = framingFields(band, pendingRef.current);
    const patch = Object.fromEntries(Object.entries(all).filter(([k]) => asked.includes(k as FramingField))) as BriefPatch;
    /* Four fields, named, merged onto whatever is on disk inside one
     * transaction. The band never writes a whole brief: a station's answer and
     * the papers list on Material are somebody else's to write, and a save that
     * carried them would carry whatever this component happened to be holding,
     * which is as old as its last render. */
    const written = await updateBrief(project.id, patch);
    for (const f of asked) setUnsaved(project.id, f, undefined);
    if (written === undefined || !written.changed) return false;
    /* The provenance rides on the one framing row a draft can fill, the same way a
     * step's does. `briefChangeEvents` writes one row per field that moved and
     * knows nothing about drafts, so the mark goes on afterwards and on that row
     * alone.
     *
     * One row since M40, and the narrowing is the point: it was `starting-interest`
     * or `research-question`, and nothing writes a `research-question` row now. A
     * mark left on that branch would be waiting for an event that never arrives. */
    /* ISC-592: each of the three answers can have come from a draft, and each
     * save names its own. */
    const changes = briefChangeEvents(project.id, written.before, written.after).map((event: LedgerEvent) => {
      if (event.type !== "bound") return event;
      const field = FRAMING_FIELDS.find((f) => FRAMING_SUBJECT[f] === event.subject);
      const from = field === undefined ? undefined : draftedFromRef.current[field];
      /* M93, ISC-767: and whether the draft was changed, by comparing the text. */
      const was = field === undefined ? undefined : draftTextRef.current[field];
      return from === undefined
        ? event
        : ({ ...event, draftedFrom: from, ...(was === undefined ? {} : { edited: editedFrom(was, event.statement) }) } satisfies BoundEvent);
    });
    if (changes.length > 0) await appendAll(changes);
    lastSynced.current = written.after;
    setSavedBrief(written.after);
    /* M78b (the lead's ruling): once saved, the summary is the researcher's, so
       "Abductive wrote this from your replies" goes, as it does on a Design step.
       The save above has already named the draft it came from. */
    const named = { ...draftedFromRef.current };
    for (const f of asked) delete named[f];
    draftedFromRef.current = named;
    setDraftedFrom(named);
    return true;
  }, [project.id, appendAll]);

  /* Called on blur, and it decides for itself whether anything moved: the
   * write is a no-op when every field comes back the same, so tabbing through
   * four untouched fields writes nothing at all. */
  const writeRef = useRef(writeOnce);
  writeRef.current = writeOnce;
  const save = useCallback(async (field: FramingField) => {
    toSave.current.add(field);
    const wrote = await serialise(loop.current, () => writeRef.current());
    if (!wrote) return;
    setJustSaved((had) => new Set([...had, field]));
    setSaved(true);
    if (flash.current !== null) clearTimeout(flash.current);
    flash.current = setTimeout(() => setSaved(false), SAVED_FLASH_MS);
    onChanged();
    /* Two occasions, one call (M29c).
     *
     * A framing save is when a study that could not be judged against becomes
     * judgeable, so every paper waiting since before there was a puzzle is
     * judged at that moment. And it is when a study that has already judged
     * its papers moves under them, so a paper that has stopped fitting is
     * flagged and one that now fits has its notice withdrawn.
     *
     * Which of the two it is comes out of the framing digest the hook
     * compares, so this call site does not have to know. A save that changed
     * neither the puzzle nor the exploring text writes nothing and costs no
     * model call.
     *
     * Outside the write loop, because it is a model call and the loop is what
     * gets the researcher's typing onto disk. Judging inside it made every
     * blur wait on the previous blur's inference. */
    const written = await judgeFit({ brief: briefRef.current }).catch(() => 0);
    if (written > 0) onChanged();
  }, [onChanged, judgeFit]);

  /* The same ask, from the other surface that shows how the papers stand
   * (M33 fix). The band's fit row is the line the walk was reading, so a
   * researcher who opens Design rather than Material gets a current answer for
   * the same reason. One judge at a time across both: the loop inside
   * `usePaperFit` is keyed by study and shared. */
  useJudgeOnMount(project.id, true, async () => {
    const written = await judgeFit({ brief: briefRef.current });
    if (written > 0) onChanged();
  });

  const set = (next: Partial<ProjectBrief>) => {
    setBrief({ ...brief, ...next });
    setSaved(false);
    /* M78b, ISC-681: an edit is a draft until Save answer, kept for the tab strip's dot. */
    for (const f of FRAMING_FIELDS) {
      const value = next[f];
      if (value === undefined) continue;
      setUnsaved(project.id, f, value === (savedRef.current[f] ?? "") ? undefined : value);
    }
    setJustSaved((had) => {
      const rest = new Set(had);
      for (const f of FRAMING_FIELDS) if (next[f] !== undefined) rest.delete(f);
      return rest;
    });
    // An edit makes a suggestion the researcher's own text: it is no longer
    // waiting, and it saves on Save answer with its draft named (M78b).
    const edited = FRAMING_FIELDS.filter((f) => next[f] !== undefined && pendingRef.current.has(f));
    if (edited.length > 0) {
      const rest = new Set(pendingRef.current);
      for (const f of edited) rest.delete(f);
      pendingRef.current = rest;
      setPending(rest);
    }
    // Emptied and typed afresh is not a drafted answer any more.
    const emptied = FRAMING_FIELDS.filter((f) => next[f] !== undefined && (next[f] ?? "").trim() === "");
    if (emptied.length > 0) {
      setDraftedFrom((d) => {
        const out: Partial<Record<FramingField, string>> = { ...d };
        for (const f of emptied) delete out[f];
        return out;
      });
    }
  };

  /**
   * Draft the interest field out of the conversation here (ISC-488).
   *
   * One part since M40, and that is the resolution of the case this control was
   * built for rather than a narrowing of it. It asked for two, the second being
   * what you expected and what you found instead, and let the second come back
   * empty, because a researcher on day one holds no expectation to state. The
   * puzzle is not asked for at all now: the tool reads it out of what they save,
   * which is the same refusal to write their answer arriving one level up.
   */
  /**
   * Put suggestions into their fields, unsaved and marked (the lead's ruling on
   * ISC-592). A gap goes only into an empty field. Nothing is written: a
   * suggestion enters the record when the researcher presses Save answer or
   * edits it and leaves the field.
   */
  const landDrafts = useCallback((parts: readonly { readonly field: string; readonly text: string; readonly eventId: string }[]) => {
    const next: { -readonly [K in keyof ProjectBrief]: ProjectBrief[K] } = { ...briefRef.current };
    const from: Partial<Record<FramingField, string>> = { ...draftedFromRef.current };
    const waiting = new Set(pendingRef.current);
    let changed = false;
    for (const part of parts) {
      applied.current.add(part.eventId);
      const field = FRAMING_FIELDS.find((f) => f === part.field);
      if (field === undefined || part.text === "") continue;
      if (isGapOnly(part.text) && (next[field] ?? "").trim() !== "" && !waiting.has(field)) continue;
      /* M78b: an edit of this suggestion, unsaved, comes back over it and names it. */
      const edit = readUnsaved(project.id)[field];
      if (edit !== undefined && edit !== part.text) {
        next[field] = edit;
        from[field] = part.eventId;
        draftTextRef.current = { ...draftTextRef.current, [field]: part.text };
        changed = true;
        continue;
      }
      /* M93, ISC-767: a new summary replaces one still waiting, which is declined. */
      const replaced = from[field];
      if (replaced !== undefined && replaced !== part.eventId && waiting.has(field)) declineDraft(replaced);
      next[field] = part.text;
      from[field] = part.eventId;
      draftTextRef.current = { ...draftTextRef.current, [field]: part.text };
      waiting.add(field);
      changed = true;
    }
    if (!changed) return;
    briefRef.current = next;
    draftedFromRef.current = from;
    pendingRef.current = waiting;
    setBrief(next);
    setDraftedFrom(from);
    setPending(waiting);
    setSaved(false);
  }, [project.id, declineDraft]);

  /* A reload, or a draft written by another tab: the record's waiting suggestions
   * come back into their fields, each once per mount. */
  useEffect(() => {
    const waiting = pendingFramingDrafts(events, project.id);
    const fresh = FRAMING_FIELDS.flatMap((field) => {
      const d = waiting[field];
      return d === undefined || applied.current.has(d.eventId) ? [] : [{ field, text: d.text, eventId: d.eventId }];
    });
    if (fresh.length > 0) landDrafts(fresh);
  }, [events, project.id, landDrafts]);

  /** Save answer on one suggestion: it becomes the researcher's answer, with its draft named. */
  const keepDraft = useCallback(
    (field: FramingField) => {
      const rest = new Set(pendingRef.current);
      rest.delete(field);
      pendingRef.current = rest;
      setPending(rest);
      void save(field);
    },
    [save],
  );

  /* M92, ISC-752: Auto-generate summary from chat writes one summary, the one
   * under the control, by the same draft that Summarise wrote for all three. */
  const draftFraming = useCallback(async (field: FramingField) => {
    setDraftNote(null);
    setGenerating(field);
    try {
      /* M62, ISC-599: which question each reply was to, from the record, and
       * (the owner's amendment) which parts they said are still open. */
      const { answered, open } = framingCoverage(events, project.id, {});
      const turnParts = new Map([...answered].map(([turn, f]) => [turn, FRAMING_DRAFT_LABELS[f]]));
      const outcome = await makeDraft({
        place: FRAMING_PLACE,
        question: FRAMING_TALK_QUESTION,
        parts: FRAMING_DRAFT_PARTS.filter((p) => p.field === field),
        turnParts,
        openParts: new Set([...open].filter((f) => f === field)),
      });
      if (outcome.kind === "nothing-said") {
        setDraftNote("Say something in the chat first, and Abductive writes a summary from your words.");
        return;
      }
      if (outcome.kind === "failed") {
        setDraftNote(`Abductive couldn't write a summary: ${outcome.error}`);
        return;
      }
      /* The ref is written before the save, not left to the next render (M53).
       * A part that the conversation never covered comes back as the gap alone
       * and is never saved (`framingFields`). */
      const parts = outcome.kind === "drafted-parts" ? outcome.parts : [{ field, text: outcome.text, eventId: outcome.eventId }];
      landDrafts(parts);
      setEditing((was) => {
        const next = new Set(was);
        next.delete(field);
        return next;
      });
    } finally {
      setGenerating(null);
    }
  }, [makeDraft, landDrafts, events, project.id]);

  const openEdit = useCallback((field: FramingField) => {
    editStart.current = { ...editStart.current, [field]: briefRef.current[field] ?? "" };
    setEditing((was) => new Set([...was, field]));
  }, []);
  const closeEdit = useCallback((field: FramingField) => {
    setEditing((was) => {
      const next = new Set(was);
      next.delete(field);
      return next;
    });
  }, []);
  /** The field holds text that isn't on the record: an edit, or a draft waiting for Save answer. */
  const fieldDirty = (field: FramingField): boolean =>
    pending.has(field) || (brief[field] ?? "") !== (savedBrief[field] ?? "");
  const cancelEdit = useCallback(
    (field: FramingField) => {
      const before = editing.has(field) ? editStart.current[field] : undefined;
      /* An open box goes back to its text when Edit summary opened it; a draft
       * goes back to the answer on the record. */
      set({ [field]: before ?? savedRef.current[field] ?? "" });
      if (before === undefined) {
        /* M93, ISC-767: Cancel on an auto-generated summary declines it. */
        if (pendingRef.current.has(field) || draftedFromRef.current[field] !== undefined) declineDraft(draftedFromRef.current[field]);
        const rest = new Set(pendingRef.current);
        rest.delete(field);
        pendingRef.current = rest;
        setPending(rest);
        setDraftedFrom((d) => {
          const out: Partial<Record<FramingField, string>> = { ...d };
          delete out[field];
          draftedFromRef.current = out;
          return out;
        });
      }
      closeEdit(field);
    },
    [closeEdit, set, editing, declineDraft],
  );

  return (
    /* A page, and the landmark the skip link lands on (M53, ISC-540).
     *
     * `<main>` rather than a `<section>`, because this is the body of a route now
     * and every study route owns its own landmark (tests/landmarks.test.ts). No
     * `h1` of its own: the study bar prints the tab's label as the page's heading,
     * which is the one-instrument rule every other tab is held to.
     *
     * The chip is the head row rather than a bar's own summary. A closed dock had
     * to say how much of the framing was answered because its contents were out of
     * sight; a page shows all three boxes, so what the chip is left doing is
     * telling the reader that the last thing they typed landed.
     */
    <main
      className="motivation"
      id={MAIN_LANDMARK_ID}
      tabIndex={-1}
      data-testid="motivation-page"
      onPointerDownCapture={() => setCleared(askedFor)}
    >
      {/* Two columns from 1100px and one below (ISC-540, ISC-589).
       *
       * ISC-592 (owner, 2026-09-30): the page reads the way a Design step does,
       * the conversation on the left with its composer and the answers on the
       * right, so a reader who has used one knows the other. Beside the answers
       * rather than under them, which is the whole reason the dock could not
       * hold it well: at a third of a window, opening the conversation pushed
       * the venue box off the bottom of the scroller. Below 1100 the answers go
       * under the conversation, as a Design step's summary does. */}
      {/* M84, ISC-703: the stage, said once at the head of the page. */}
      <p className="motivation-stage small muted" data-testid="design-stage">
        {STAGE_LINE}
      </p>
      {/* M96, ISC-793: About you, asked once per browser (the owner, 2026-10-30). */}
      <AboutYouBlock />
      <div className="motivation-frame" data-testid="motivation-frame">
        <div className="motivation-aside" data-testid="motivation-aside">
          {/* M61 follow-up, ISC-587 (Matthew, 2026-09-30): the puzzle "should be
              removed from the starting point. it's already part of the design." The
              suggested puzzle, its reading and its pointer left this column. The
              reading is offered at the Puzzle step (PuzzleOffer.tsx), and the
              conversation about the three answers is all that sits here. */}
          {/* ISC-488. Under the two fields the conversation is about, and inline
              rather than in a modal: a researcher who cannot answer the question
              above needs to see the question while they talk about it.

              One control, and it is the answer to the note this milestone came
              from. The band asks what you are exploring and then, immediately
              under it, what you expected and what you found instead. A co-author
              asked whether each of those could evolve as a chat, with follow-ups
              that let a junior scholar ease into an answer they do not yet hold.
              This is where that starts. */}
          {/* M62, ISC-600: The sentence over the conversation moved into the page's Help control (ui/pageHelp.ts). */}
          <div className="framing-talk" data-testid="framing-talk">
            <>
                {/* Summarise left the head of the conversation for the foot of the
                    Summaries column (the owner's amendment to M62, ISC-598). */}
                <Dialogue
                  projectId={project.id}
                  graph={graph}
                  interview={interview}
                  moves={[]}
                  events={framingEvents}
                  chunks={chunks}
                  documents={documents}
                  brief={brief}
                  station={FRAMING_PLACE}
                  question={FRAMING_OPENING}
                />
                {/* M93, ISC-755: the chat closes with Surface concepts and relationships. */}
                <SurfaceStep
                  projectId={project.id}
                  place={FRAMING_PLACE}
                  brief={project.brief}
                  graph={graph}
                  chunks={chunks}
                  documents={documents}
                  onChanged={onChanged}
                />
            </>
          </div>
        </div>

        <div className="motivation-answers" data-testid="motivation-answers">
          {/* ISC-592: the answers read like a Design step's summary pane, a heading
              and the answered chip over them, beside the conversation on the left.
              ISC-589: the column starts level with the conversation's, so the
              conversation can hold the viewport under the study bar. */}
          <div className="motivation-head">
            {/* M62, ISC-597: the three fields are summaries drawn from the
                conversation on the left, and the column says so. */}
            <h2 className="motivation-heading">{ANSWERS_HEADING}</h2>
            <StatusChip
              /* M84, ISC-705: the state, as each field's own chip says it, with no count. */
              label={saved ? "Saved" : framingCount(savedBrief) === 0 ? "Not started" : "In progress"}
              tone={saved ? "ok" : "neutral"}
              testId="framing-status"
            />
          </div>
          {/* M62, ISC-600: The sentence over the summaries and the Learn more fold under it moved into the page's Help control (ui/pageHelp.ts).
              M92, ISC-748 (Matthew, 2026-10-15: how the chat and the boxes
              relate was unclear): one sentence under the heading says so. */}
          <p className="small muted motivation-lede" data-testid="answers-lede">{ANSWERS_LEDE}</p>

          {/*
           * Before the puzzle, because most people do not arrive with one. They
           * arrive with a context that grips them or a site they can get into,
           * and asking for a question first makes them invent one and defend it.
           */}
          <div
            className="station-field"
            data-highlight={highlight === FRAMING_INTEREST_FIELD ? "true" : undefined}
          >
            {/* M39, ISC-505. The framing saves two fields under two subjects, so
                each one is asked about separately: a popover on the puzzle must not
                report the starting interest's save. */}
            <div className="field-label-row">
              <label className="field-label" htmlFor="framing-starting-interest">
                {FRAMING_LABEL.startingInterest}
              </label>
              <FieldChip
                field="startingInterest"
                text={brief.startingInterest ?? ""}
                saved={savedBrief.startingInterest ?? ""}
                waiting={pending.has("startingInterest")}
                justSaved={justSaved.has("startingInterest")}
              />
              <ProvenancePopover
                view={answerProvenance({
                  events,
                  projectId: project.id,
                  place: FRAMING_PLACE_ID,
                  subject: FRAMING_SUBJECT.startingInterest,
                })}
                about="what is drawing you to this particular research inquiry"
                testId="framing-interest-provenance"
              />
            </div>
            <p className="small muted field-hint">{FRAMING_QUESTION.startingInterest}</p>
            {/* M92, ISC-752: text until Edit summary opens the box. */}
            {editing.has("startingInterest") ? (
                <textarea
                  id="framing-starting-interest"
                  rows={3}
                  value={brief.startingInterest ?? ""}
                  data-testid="framing-starting-interest"
                  data-drafted={draftedFrom.startingInterest === undefined ? undefined : "true"}
                  onChange={(e) => set({ startingInterest: e.target.value })}
                />
            ) : (
              <SummaryText text={brief.startingInterest ?? ""} testId="framing-starting-interest-text" drafted={draftedFrom.startingInterest !== undefined} />
            )}
            {/* M92 polish: Save answer and Cancel straight under unsaved text (an
                edit or a draft); otherwise the two ways to change the summary. */}
            {editing.has("startingInterest") || fieldDirty("startingInterest") ? (
              <EditButtons
                testIdPrefix="framing-interest"
                onCancel={() => cancelEdit("startingInterest")}
                {...(editing.has("startingInterest") ? {} : { onEdit: () => openEdit("startingInterest") })}
                save={
                  <FieldSave
                    field="startingInterest"
                    text={brief.startingInterest ?? ""}
                    onSave={() => {
                      closeEdit("startingInterest");
                      if (pending.has("startingInterest")) keepDraft("startingInterest");
                      else void save("startingInterest");
                    }}
                  />
                }
              />
            ) : (
              <SummaryButtons
                testIdPrefix="framing-interest"
                generating={generating === "startingInterest"}
                onEdit={() => openEdit("startingInterest")}
                onGenerate={() => void draftFraming("startingInterest")}
              />
            )}
            <DraftMarks
              field="startingInterest"
              drafted={draftedFrom.startingInterest !== undefined}
              text={brief.startingInterest ?? ""}
              unsettled={openParts.has("startingInterest")}
            />
          </div>

          <div
            className="station-field"
            data-highlight={highlight === FRAMING_PAPERS_FIELD ? "true" : undefined}
          >
            <div className="field-label-row">
              <label className="field-label" htmlFor={FRAMING_PAPERS_FIELD}>
                {FRAMING_LABEL.seminalCorpus}
              </label>
              <FieldChip
                field="seminalCorpus"
                text={brief.seminalCorpus ?? ""}
                saved={savedBrief.seminalCorpus ?? ""}
                waiting={pending.has("seminalCorpus")}
                justSaved={justSaved.has("seminalCorpus")}
              />
              {/* ISC-592: saved on the record now, so it can say where it came from. */}
              <ProvenancePopover
                view={answerProvenance({
                  events,
                  projectId: project.id,
                  place: FRAMING_PLACE_ID,
                  subject: FRAMING_SUBJECT.seminalCorpus,
                })}
                about="the literatures relevant to your exploration"
                testId="framing-papers-provenance"
              />
            </div>
            <p className="small muted field-hint">{FRAMING_QUESTION.seminalCorpus}</p>
            {/* M92, ISC-752: text until Edit summary opens the box. */}
            {editing.has("seminalCorpus") ? (
                <textarea
                  id={FRAMING_PAPERS_FIELD}
                  rows={3}
                  value={brief.seminalCorpus ?? ""}
                  data-testid="framing-seminal-corpus"
                  data-drafted={draftedFrom.seminalCorpus === undefined ? undefined : "true"}
                  onChange={(e) => set({ seminalCorpus: e.target.value })}
                />
            ) : (
              <SummaryText text={brief.seminalCorpus ?? ""} testId="framing-seminal-corpus-text" drafted={draftedFrom.seminalCorpus !== undefined} />
            )}
            {/* M92 polish: Save answer and Cancel straight under unsaved text (an
                edit or a draft); otherwise the two ways to change the summary. */}
            {editing.has("seminalCorpus") || fieldDirty("seminalCorpus") ? (
              <EditButtons
                testIdPrefix="framing-literatures"
                onCancel={() => cancelEdit("seminalCorpus")}
                {...(editing.has("seminalCorpus") ? {} : { onEdit: () => openEdit("seminalCorpus") })}
                save={
                  <FieldSave
                    field="seminalCorpus"
                    text={brief.seminalCorpus ?? ""}
                    onSave={() => {
                      closeEdit("seminalCorpus");
                      if (pending.has("seminalCorpus")) keepDraft("seminalCorpus");
                      else void save("seminalCorpus");
                    }}
                  />
                }
              />
            ) : (
              <SummaryButtons
                testIdPrefix="framing-literatures"
                generating={generating === "seminalCorpus"}
                onEdit={() => openEdit("seminalCorpus")}
                onGenerate={() => void draftFraming("seminalCorpus")}
              />
            )}
            <DraftMarks
              field="seminalCorpus"
              drafted={draftedFrom.seminalCorpus !== undefined}
              text={brief.seminalCorpus ?? ""}
              unsettled={openParts.has("seminalCorpus")}
            />
            {/* M74b, ISC-664 (the lead's ruling): the rule that turns a line into a
                paper, said beside the field it reads. */}
            <p className="small muted" data-testid="framing-citation-note">
              A line with an author and a year, such as Hallen 2008, becomes a paper on Sources.
            </p>
            {/* M32, R7. Three stacked underlined links sat here: one action and
                two counts, all three drawn identically, which is the defect the
                critique names as "actions are hyperlinks, not controls". They are
                one control and two status rows now. The strings, their order and
                their destinations are unchanged.

                Still an anchor, because it goes somewhere: it can be
                middle-clicked and it shows its destination. `.btn` is the role
                that makes it look like the control it is; secondary rather than
                primary, because the station below this band owns the page's one
                filled action. */}
            <p className="framing-papers-do">
              <a className="btn" href={framingPapersHref(project.id)} data-testid="framing-papers-link">
                Upload papers
              </a>
            </p>
            {/* M29, R12. Only once there is something to see, because a line
                reading "0 expectations" is a report on nothing having happened
                beside a field the researcher has just filled in. */}
            {drafted > 0 && (
              <p className="small framing-papers-status">
                <a href={framingExpectationsHref(project.id)} data-testid="framing-expectations-link">
                  {expectationsDrafted(drafted)}
                </a>
              </p>
            )}
            {/* M29b. It points at the papers rather than at the drafts, because
                that is where the researcher can look at the paper and decide
                whether the tool has it right.
            
                M29c: it said something only when a paper failed, so a researcher
                whose papers all fit read the same blank as one whose papers had
                never been judged. It counts all three verdicts now. */}
            {fitCounts.judged > 0 && (
              <p className="small framing-papers-status">
                <a href={framingPapersHref(project.id)} data-testid="framing-misfit-link">
                  {paperFitLine(fitCounts, fitCounts.waiting)}
                </a>
              </p>
            )}
            {/* M38, ISC-499. One level, under the field it is about, so a reader
                can see what each paper expects without leaving the tab their
                framing is on. Nothing here is a control: the row on Material owns
                adding an expectation and turning one down. */}
            {rows.length > 0 && (
              <Disclosure
                summary="Paper expectations"
                count={rows.length}
                countNoun="papers"
                testId="framing-papers-read"
              >
                <ul className="framing-papers-list">
                  {rows.map((paper) => (
                    <li key={paper.key} data-testid={`framing-paper-${paper.key}`}>
                      <p className="framing-paper-head">
                        <a href={framingPapersHref(project.id)}>{paper.name}</a>
                        <PaperFitChip verdict={paper.verdict} state="unjudged" />
                      </p>
                      {paper.expectations === undefined && (
                        <p className="small muted">{NOT_JUDGED_NOTE}</p>
                      )}
                      {paper.expectations !== undefined && paper.expectations.length === 0 && (
                        <p className="small muted">{NOTHING_EXPECTED_NOTE}</p>
                      )}
                      {paper.expectations !== undefined && paper.expectations.length > 0 && (
                        <ul className="framing-paper-expects">
                          {paper.expectations.map((baseline) => (
                            <li key={baseline.id}>{baseline.expectation}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </div>

          <div
            className="station-field"
            data-highlight={highlight === FRAMING_VENUE_FIELD ? "true" : undefined}
          >
            <div className="field-label-row">
              <label className="field-label" htmlFor={FRAMING_VENUE_FIELD}>
                {FRAMING_LABEL.targetVenue}
              </label>
              <FieldChip
                field="targetVenue"
                text={brief.targetVenue ?? ""}
                saved={savedBrief.targetVenue ?? ""}
                waiting={pending.has("targetVenue")}
                justSaved={justSaved.has("targetVenue")}
              />
              <ProvenancePopover
                view={answerProvenance({
                  events,
                  projectId: project.id,
                  place: FRAMING_PLACE_ID,
                  subject: FRAMING_SUBJECT.targetVenue,
                })}
                about="the journal that you're aiming at"
                testId="framing-venue-provenance"
              />
            </div>
            <p className="small muted field-hint">{FRAMING_QUESTION.targetVenue}</p>
            {/* M92, ISC-752: text until Edit summary opens the box. */}
            {editing.has("targetVenue") ? (
                <textarea
                  id={FRAMING_VENUE_FIELD}
                  rows={3}
                  value={brief.targetVenue ?? ""}
                  data-testid="framing-venue"
                  data-drafted={draftedFrom.targetVenue === undefined ? undefined : "true"}
                  onChange={(e) => set({ targetVenue: e.target.value })}
                />
            ) : (
              <SummaryText text={brief.targetVenue ?? ""} testId="framing-venue-text" drafted={draftedFrom.targetVenue !== undefined} />
            )}
            {/* M92 polish: Save answer and Cancel straight under unsaved text (an
                edit or a draft); otherwise the two ways to change the summary. */}
            {editing.has("targetVenue") || fieldDirty("targetVenue") ? (
              <EditButtons
                testIdPrefix="framing-journal"
                onCancel={() => cancelEdit("targetVenue")}
                {...(editing.has("targetVenue") ? {} : { onEdit: () => openEdit("targetVenue") })}
                save={
                  <FieldSave
                    field="targetVenue"
                    text={brief.targetVenue ?? ""}
                    onSave={() => {
                      closeEdit("targetVenue");
                      if (pending.has("targetVenue")) keepDraft("targetVenue");
                      else void save("targetVenue");
                    }}
                  />
                }
              />
            ) : (
              <SummaryButtons
                testIdPrefix="framing-journal"
                generating={generating === "targetVenue"}
                onEdit={() => openEdit("targetVenue")}
                onGenerate={() => void draftFraming("targetVenue")}
              />
            )}
            <DraftMarks
              field="targetVenue"
              drafted={draftedFrom.targetVenue !== undefined}
              text={brief.targetVenue ?? ""}
              unsettled={openParts.has("targetVenue")}
            />
          </div>

          {/* M92, ISC-752: the Summarise at the foot of the column went at the owner's
              word of 2026-10-15; each summary has its own Auto-generate summary from chat. */}
          {draftNote !== null && (
            <p className="small muted" data-testid="framing-draft-note" role="status">
              {draftNote}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
