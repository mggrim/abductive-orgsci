/**
 * The focused station (ISC-86 … ISC-91).
 *
 * One station at a time in this column, not because the others are closed
 * (the rail keeps all seven one click away) but because answering a good
 * question well needs the screen to stop competing for attention. The old
 * workbench put nine panels up at once and the researcher's first move was to
 * scan rather than to think.
 *
 * The station's *question* is the largest thing on screen and the textarea is
 * the smallest. That inversion is deliberate: a form asks you to fill a field,
 * and the point here is to answer something a rigorous colleague would ask.
 *
 * Saving appends `bound` events for what changed and nothing for what did not
 * (ISC-77, ISC-78). The brief is editable forever — there is no lock, because
 * revising the process of interest after early data is the method working, not
 * a mistake to be prevented.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { STATIONS, stationById, type StationId } from "./stations.ts";
import { stepKicker } from "./StationLoop.tsx";
import {
  briefChangeEvents,
  recordedAnswerAt,
  stationBoundEvent,
  stationField,
  stationValue,
  withStationValue,
} from "./stationBrief.ts";
import {
  applyBriefPatch,
  getProject,
  updateBrief,
  type BriefPatch,
  type Project,
  type ProjectBrief,
} from "../state/projects.ts";
import { useLedger } from "../state/ledgerContext.tsx";
// M47. The run that fills the bias grid, and the rule for when it is due.
import { activeInferenceClient } from "../ui/personaRun.ts";
import { runSuggestionCounts, suggestedLine } from "../concepts/run.ts";
import { EarlyDataScopeLine } from "./EarlyDataScopeLine.tsx";
import { DeclareEarlyData } from "./DeclareEarlyData.tsx";
import { hasData } from "./earlyData.ts";
import { documentKindLabel } from "../ui/materialVocabulary.ts";
import { UNITS, UNIT_LABEL, UNIT_OPTION, UNIT_OTHER_LABEL, isUnit, type UnitOfAnalysis } from "../interview/unitOfAnalysis.ts";
import type { DocumentKind } from "../state/chunks.ts";
import type { Chunk, StoredDocument } from "../state/chunks.ts";
import type { OntologyGraph } from "../ontology/schema.ts";
import { StatusChip } from "../ui/components/index.ts";
import { useBriefDraft } from "./useBriefDraft.ts";
import { EditButtons, SummaryButtons, SummaryText } from "./SummaryControls.tsx";
/* Where the saved answer came from, on hover and on focus (M39, ISC-505). The
 * reading is `views/provenance.ts`; this file only says which answer is being
 * asked about. */
import { ProvenancePopover } from "../ui/components/ProvenancePopover.tsx";
import { answerProvenance } from "../views/provenance.ts";
import { GAP_MARKER_NOTE, hasGapMarker, isGapOnly } from "../interview/conversation.ts";
import { latestReading } from "../views/puzzleReading.ts";
import { studyPath } from "../ui/routes.ts";
import type { BoundEvent, LedgerEvent } from "../ledger/events.ts";
import { declineDraftEvent, editedFrom, readingDecision, rejectedBefore } from "../concepts/decisions.ts";
import { SurfaceStep } from "../ui/SurfaceStep.tsx";

/**
 * No step-level set-aside (M69, ISC-641).
 *
 * "Doesn't apply to this study" went at M59, and "Set step aside", which M59
 * put back for the M58 gate, went at M69. Matthew, 2026-10-02: "The user can
 * just set things aside. They don't actually have to tell you that they're
 * setting it aside. They can just move on." The `not-yet` and `not-applicable`
 * kinds stay on the record type, so older studies validate and History still
 * renders them; this page writes neither.
 */

/* The summary's lede (M59, ISC-573) moved into Design's Help panel at M62
 * (ISC-600, ui/pageHelp.ts). M92, ISC-748: one sentence comes back under the
 * heading, worded like Starting point's, so the two pages read alike. */
export const SUMMARY_LEDE =
  "Talk the step through with Abductive in the chat, then press Auto-generate summary from chat for a summary from the conversation, or Edit summary to write your own.";

/**
 * What the card shows when a fresh copy of the project arrives underneath it.
 *
 * The same rule `framingResync` states for the band's four fields, for this
 * card's one: a field the researcher has not touched since the last sync takes
 * whatever is on disk, and a field they have takes what is in the box. "They"
 * includes the draft control, which puts text in the box without a keystroke.
 */

/**
 * Whether Save answer on a Design step starts its own concept pass (M93,
 * ISC-759). Off from M93: Surface concepts and relationships under the chat is
 * the step's one door for suggestions, and it reads the saved summary with the
 * chat. The lead confirms the replacement with the owner; turning this back on
 * restores the M63 pass after a save and changes nothing else. An object rather
 * than a boolean, so the M78b and M85 tests can keep that path covered.
 */
export const SAVE_SUGGESTS_CONCEPTS: { on: boolean } = { on: false };

/** The sentence for a suggestion cut off by an abort that the researcher didn't cause (M85, ISC-716). */
export const SUGGEST_INTERRUPTED = "Abductive couldn't finish suggesting concepts from this summary.";

export function stationResync(
  local: ProjectBrief,
  lastSynced: ProjectBrief,
  incoming: ProjectBrief,
  station: StationId,
): ProjectBrief {
  const field = stationField(station);
  if (field === null) return incoming;
  if ((local[field] ?? "") === (lastSynced[field] ?? "")) return incoming;
  return { ...incoming, [field]: local[field] };
}

export function StationWorkspace(props: {
  project: Project;
  station: StationId;
  graph: OntologyGraph;
  documents: readonly StoredDocument[];
  chunks: readonly Chunk[];

  /**
   * The conversation at this step, rendered between the question and the box
   * (M37).
   *
   * Passed in rather than mounted here, and the distinction is the one
   * `flow-discipline` has pinned since ISC-229: the element is created by
   * Workbench's render, so moving along the rail reconciles it instead of
   * remounting it and dropping an answer that is still streaming. What changed
   * at M37 is only where it is drawn. It used to be a sibling in the right-hand
   * column, which put the tool's question at the top of one column and the
   * researcher's answer at the top of the other; the step is one act read top to
   * bottom now, and the conversation is the middle of it.
   */
  conversation?: ReactNode;
  onChanged: () => void;
  /**
   * The step is closed (M58): Sample or Early data before the loops settle. The
   * page names the step, says what opens it and links to the loop step still
   * waiting, and holds no conversation and no answer box.
   */
  closed?: { readonly sentence: string; readonly goTo?: StationId };
  /**
   * The right pane the summary is drawn into above 1100px (M59, ISC-573).
   *
   * The element is Workbench's and the summary is this component's, because the
   * summary is the step's answer editor and its state (the box, the draft's
   * provenance, the save) is kept here. A portal draws it in the right track and
   * keeps it in this tree, so nothing about the save moved. Null or absent is
   * the one-column page, where the summary sits under the thread.
   */
  summaryHost?: HTMLElement | null;
}) {
  const {
    project,
    station: stationId,
    graph,
    documents,
    chunks,
    conversation,
    onChanged,
    closed,
    summaryHost,
  } = props;
  const station = stationById(stationId);
  const { appendAll, events, readEvents } = useLedger();
  const [brief, setBrief] = useState<ProjectBrief>(project.brief);
  const [saved, setSaved] = useState(false);
  /** True after a press that had nothing to write. Cleared by the next edit. */
  const [nothing, setNothing] = useState(false);
  /**
   * The draft the text in the box came from, when it came from one (ISC-487).
   *
   * Cleared the moment the researcher empties the box, because a `draftedFrom`
   * on an answer they wrote from nothing would be a false provenance, and a
   * false provenance is worse than none on the one field this tool exists to
   * keep honest.
   */
  /* M89 (2026-10-14): the bias scan's two pieces of state (M47) went with the
   * save-time scan, on the owner's instruction to table the checks. */
  /* M78b, ISC-681: each save line belongs to the step whose save started it, so
   * the walk's Context lines no longer stand under Process (finding 14). */
  /* M73, ISC-658: a save that did not happen says so, and the box keeps the text. */
  const [saveError, setSaveError] = useState(false);
  /* M63, ISC-610: Abductive suggests concepts from the summary just saved. */
  const [suggestingAt, setSuggestingAt] = useState<StationId | null>(null);
  const [suggestNotes, setSuggestNotes] = useState<Partial<Record<StationId, string>>>({});
  const suggesting = suggestingAt === stationId;
  const suggestNote = suggestNotes[stationId] ?? null;
  /* M85, ISC-716: the summary whose suggestion an abort cut off, by step, so
   * Try again asks for the same suggestion. */
  const [suggestOwed, setSuggestOwed] = useState<Partial<Record<StationId, { brief: ProjectBrief; text: string }>>>({});
  const [draftedFrom, setDraftedFrom] = useState<string | null>(null);
  /* M93, ISC-767: the draft's own text, so a save can say whether it was edited,
   * and whether the draft was Abductive's summary (a `brief-draft`) or the reading. */
  const [draftText, setDraftText] = useState<string | null>(null);
  const [draftKind, setDraftKind] = useState<"brief" | "reading" | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  /* M92, ISC-752: the summary reads as text until Edit summary opens the box;
   * Cancel puts back the text that it held when the edit opened. */
  const [editing, setEditing] = useState(false);
  const editStart = useRef<string | null>(null);
  const { makeDraft, drafting } = useBriefDraft(project.id);
  /* The tool's latest puzzle reading, offered as a draft at the puzzle step. */
  const reading = stationId === "puzzle" ? latestReading(events, project.id) : null;
  /* M93, ISC-763: a rejected reading is not offered again, here or on its card. */
  const readingRejected =
    reading !== null && (readingDecision(events, project.id, reading).kind === "rejected" || rejectedBefore(events, project.id, reading));
  const inFlight = useRef(false);

  /* The stored brief this card last took its value from, so a resync can tell
   * an incoming change from text the researcher is in the middle of writing. */
  const lastSynced = useRef<{ brief: ProjectBrief; station: StationId }>({
    brief: project.brief,
    station: stationId,
  });

  /*
   * The workspace is reconciled in place as the researcher moves along the
   * rail, so local edit state has to resync when the stored project changes
   * underneath it: a save at one station must not be discarded by the stale
   * copy held while standing at another.
   *
   * Per field, for the reason the framing band is (M37). It used to take the
   * incoming brief whole, which discards whatever is in the box right now, and
   * the box is refreshed by any append at all: writing to the record announces
   * itself on the study channel, `useStudyFreshness` re-reads the project, and
   * a new object arrives here. That was survivable while nothing but a
   * keystroke put text in the box. It stopped being survivable the moment a
   * draft did, because appending the draft is itself the append that wipes it.
   */
  useEffect(() => {
    setBrief((current) =>
      lastSynced.current.station === stationId
        ? stationResync(current, lastSynced.current.brief, project.brief, stationId)
        : project.brief,
    );
    lastSynced.current = { brief: project.brief, station: stationId };
    setSaved(false);
    setNothing(false);
  }, [project, stationId]);

  /* A draft belongs to the step it was made at. Moving along the rail with the
   * mark still set would put "Drafted from your words" over the next step's own
   * answer. */
  useEffect(() => {
    setDraftedFrom(null);
    setDraftText(null);
    setDraftKind(null);
    setDraftNote(null);
  }, [stationId]);

  const field = stationField(stationId);
  const dirty =
    JSON.stringify(brief) !== JSON.stringify(project.brief);
  const stationSaidSomething = stationValue(project.brief, stationId).trim() !== "";
  /** Whether there is anything in the box, which is what decides the weight. */
  const hasAnswer = stationValue(brief, stationId).trim() !== "";

  /* R3 item 1: the save is live on every station, in every state.
   *
   * It was inert until the box changed, with a sentence under it saying so, and
   * the framing band above carried a second inert primary with a second such
   * sentence. Two dead buttons and two apologies on the page where the work
   * happens is what the flow critic failed the screen for, and the inert
   * grammar was the more expensive half: no comparable product explains a
   * greyed button twice on one screen.
   *
   * A press with nothing to save is a no-op that says so in the chip, which is
   * the honest shape. The reader finds out by pressing rather than by reading a
   * paragraph about a control they had not tried to use. */
  /* M63, ISC-610. And Abductive suggests concepts from the summary, after
   * the save and not inside it, for the reason the bias scan gives: the
   * answer is on the record before the model is asked anything. Only with a
   * model connected; without one the step saves as it always did.
   *
   * M85, ISC-716: an abort that the researcher didn't cause (WebKit, beside the
   * chat's writes) shows Abductive's sentence with Try again, which asks for
   * the same suggestion. */
  const suggestFrom = useCallback(
    (at: StationId, savedBrief: ProjectBrief, text: string) => {
      const { client, live } = activeInferenceClient();
      if (!live) return;
      setSuggestNotes((m) => ({ ...m, [at]: undefined }));
      setSuggestOwed((m) => ({ ...m, [at]: undefined }));
      setSuggestingAt(at);
      void runSuggestionCounts(
        {
          projectId: project.id,
          brief: savedBrief,
          source: { kind: "summary", station: at },
          text,
          readEvents,
          appendAll,
        },
        client,
      )
        .then((counts) => {
          setSuggestNotes((m) => ({ ...m, [at]: suggestedLine(counts) }));
          if (counts.concepts + counts.relations + counts.statements > 0) onChanged();
        })
        .catch((err: unknown) => {
          const aborted = typeof err === "object" && err !== null && (err as { name?: unknown }).name === "AbortError";
          if (aborted) setSuggestOwed((m) => ({ ...m, [at]: { brief: savedBrief, text } }));
          const said = aborted
            ? SUGGEST_INTERRUPTED
            : `Abductive couldn't suggest concepts from this summary: ${err instanceof Error ? err.message : String(err)}`;
          setSuggestNotes((m) => ({ ...m, [at]: said }));
        })
        .finally(() => setSuggestingAt((was) => (was === at ? null : was)));
    },
    [project.id, readEvents, appendAll, onChanged],
  );
  const owedSuggestion = suggestOwed[stationId];

  const save = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaveError(false);
    try {
      /* M73, ISC-658 (the lead's ruling). A press records the answer whenever
       * the record's latest save at this step differs from the box, even when
       * the disk already holds it: that is the state a save whose `bound` row
       * failed left behind, an answer on disk and no row in History. An answer
       * the record already holds, unchanged on disk, is still nothing to save. */
      const answer = stationValue(brief, stationId);
      const recorded = recordedAnswerAt(await readEvents(project.id), project.id, stationId);
      const unrecorded = answer.trim() !== "" && answer !== recorded;
      if (!dirty && !unrecorded) {
        setNothing(true);
        setEditing(false);
        return;
      }
      /* This station's own field, merged onto what is on disk now.
       *
       * It wrote the whole brief from the copy this component was holding, so a
       * station save rolled back anything the framing band above it had written
       * since this component last took a copy. One field, named, inside one
       * transaction: everything else keeps whoever wrote it last. */
      const field = stationField(stationId);
      /* And the kind of material, which only this station asks (D22, M43b).
       *
       * The select above the read control was never saved. The patch carried this
       * station's own field and nothing else, by the rule above, so the kind the
       * researcher chose lived in this component's copy of the brief and went
       * when they walked away from the step. It also wrote no `bound` row, so the
       * record never held the one methods declaration the checks and the bias
       * personas read. The walk of 2026-09-13 set it to `ethnographic` and the
       * study went on saying `interview`.
       *
       * Named rather than folded into the rule, because the rule is right: a
       * station writes its own field so it cannot roll back the framing band's
       * writes. The kind is Early data's own field as much as the surprise box is;
       * it is just the only station with two. */
      const patch: BriefPatch = {
        ...(field === null ? {} : { [field]: brief[field] }),
      } as BriefPatch;
      if (Object.keys(patch).length === 0) return;
      /* The record first, then the brief (M73, ISC-658).
       *
       * It wrote the brief and then appended the `bound` row, and in Safari, with
       * Abductive's question open at the step, the append failed: WebKit aborted
       * the ledger's transaction ("Attempt to generate key in database without an
       * in-progress transaction"). The brief held the answer, History held no
       * save, and the next press found the disk already equal to the box, said
       * "Saved" and wrote nothing. Rows first means a failed append leaves the
       * disk as it was, so the box still differs from it and the next press is
       * the whole save again. The rows are read off the stored brief, merged by
       * the rule `updateBrief` writes by, so they name what the write is about to
       * change and nothing else. */
      const stored = await getProject(project.id);
      if (stored === undefined) return;
      /* The provenance rides on the bound event for this station's own field.
       * `briefChangeEvents` writes one row per field that moved and knows
       * nothing about drafts, so the mark is put on afterwards, on the row this
       * save is about and on no other. */
      /* And no second row for an answer the record already holds: the disk can
       * lag the record when a save wrote the row and its brief write failed, and
       * this press brings the disk up without saying the same thing twice. */
      const changes = briefChangeEvents(project.id, stored.brief, applyBriefPatch(stored.brief, patch)).filter(
        (event) => !(event.type === "bound" && event.subject === stationId && event.statement === recorded),
      );
      /* The disk already holds the answer, so the diff has no row for it. */
      const recordAnyway =
        unrecorded && !changes.some((event) => event.type === "bound" && event.subject === stationId)
          ? [stationBoundEvent(project.id, stationId, answer)]
          : [];
      /* M93, ISC-767: and whether the draft was changed, by comparing the text. */
      const events = [...changes, ...recordAnyway].map(
        (event: LedgerEvent) =>
          draftedFrom !== null && event.type === "bound" && event.subject === stationId
            ? ({ ...event, draftedFrom, ...(draftText === null ? {} : { edited: editedFrom(draftText, event.statement) }) } satisfies BoundEvent)
            : event,
      );
      if (events.length > 0) await appendAll(events);
      const written = await updateBrief(project.id, patch);
      if (written === undefined) return;
      setSaved(true);
      /* M92, ISC-752: a save closes the box back to text; a refused one leaves it open. */
      setEditing(false);
      /* M74b: once saved, the answer is the researcher's, so the note that
       * Abductive wrote it goes (the walk read it still standing after the save). */
      setDraftedFrom(null);
      setDraftText(null);
      setDraftKind(null);
      onChanged();
      /* M89: the tool read what was just saved for bias flags here (M47) until
       * the save-time scan went with the checks. */
      /* M63, ISC-610. And Abductive suggests concepts from the summary, after
       * the save and not inside it: the answer is on the record before the model
       * is asked anything. Only with a
       * model connected; without one the step saves as it always did. */
      /* M93, ISC-759: behind SAVE_SUGGESTS_CONCEPTS, off, since Surface concepts
       * and relationships is the step's one door. */
      if (SAVE_SUGGESTS_CONCEPTS.on && answer.trim() !== "") suggestFrom(stationId, written.after, answer);
    } catch {
      /* It was `void save()` with nothing to catch, so a failed write was an
       * unhandled rejection and the page showed nothing at all. */
      setSaved(false);
      setSaveError(true);
    } finally {
      inFlight.current = false;
    }
  }, [
    brief,
    dirty,
    project,
    appendAll,
    readEvents,
    chunks,
    onChanged,
    draftedFrom,
    draftText,
    stationId,
    suggestFrom,
  ]);

  /* M93, ISC-767: a summary that Abductive wrote, cancelled or replaced before
   * the save, is declined on the record. */
  const declineDraft = useCallback(
    (draftId: string | null, kind: "brief" | "reading" | null) => {
      if (draftId === null || kind !== "brief") return;
      void appendAll([declineDraftEvent({ projectId: project.id, draftId, kind: "brief" })]).catch(() => {
        /* The draft stays on the record as offered; the decline is the only thing lost. */
      });
    },
    [appendAll, project.id],
  );


  /* M84, ISC-707. The unit of analysis, saved the moment it is chosen, as the
   * data kind is at Early data, with its row in History. */
  const chooseUnit = async (value: string, typed?: string): Promise<void> => {
    if (!isUnit(value)) return;
    const unit: UnitOfAnalysis = value;
    /* M92, ISC-749: Other carries the unit that the researcher types. */
    const patch = unit === "other" && typed !== undefined ? { unit, unitOther: typed.trim() } : { unit };
    setBrief((b) => ({ ...b, ...patch }));
    try {
      const stored = await getProject(project.id);
      if (stored === undefined) return;
      const rows = briefChangeEvents(project.id, stored.brief, { ...stored.brief, ...patch });
      if (rows.length > 0) await appendAll(rows);
      await updateBrief(project.id, patch);
      onChanged();
    } catch {
      setSaveError(true);
    }
  };

  const set = (value: string) => {
    setBrief((b) => withStationValue(b, stationId, value));
    setSaved(false);
    setNothing(false);
    setSaveError(false);
    // Emptied and typed afresh is not a drafted answer any more.
    if (value.trim() === "") {
      declineDraft(draftedFrom, draftKind);
      setDraftedFrom(null);
      setDraftText(null);
      setDraftKind(null);
      setDraftNote(null);
    }
  };

  /**
   * Put a draft of their own words in the box, unsaved (ISC-487).
   *
   * Unsaved is the whole design. The tool can assemble what they said into an
   * answer, and it can be wrong about the shape of it, so what it does is put
   * the text where they can read it and change it. Nothing is on the record as
   * their answer until they press save, and what the save records is that the
   * text began as a draft.
   */
  const draftAnswer = useCallback(async () => {
    setDraftNote(null);
    const outcome = await makeDraft({ place: stationId, question: station.prompt });
    if (outcome.kind === "nothing-said") {
      setDraftNote("Say something in the chat first, and Abductive writes a summary from your words.");
      return;
    }
    if (outcome.kind === "failed") {
      setDraftNote(`Abductive couldn't write a summary: ${outcome.error}`);
      return;
    }
    // A step asks one question, so its draft is one part (ISC-592 drafts several only on Starting point).
    if (outcome.kind !== "drafted") return;
    if (isGapOnly(outcome.text)) {
      // The draft is on the record as what the tool produced; the box is not
      // filled with a marker that says nothing. See `isGapOnly`.
      setDraftNote("You haven't answered this question in the conversation at this step yet. Keep talking, or write the answer yourself.");
      return;
    }
    /* M93, ISC-767: a new summary replaces an unsaved one, which is declined. */
    declineDraft(draftedFrom, draftKind);
    setBrief((b) => withStationValue(b, stationId, outcome.text));
    setEditing(false);
    setDraftedFrom(outcome.eventId);
    setDraftText(outcome.text);
    setDraftKind("brief");
    setSaved(false);
    setNothing(false);
  }, [makeDraft, stationId, station.prompt, declineDraft, draftedFrom, draftKind]);

  /* The summary (M59, ISC-573): the step's saved answer under its new name.
   * Matthew, 2026-09-27: "replace the bar on the right with your answer as it
   * stands, which is essentially a summary statement of what has been discussed
   * on the left. Change the title from your answer as it stands to summary for
   * this section." The record's events are those of the save they always were. */
  const saveButton = (
    <button
      type="button"
      className={hasAnswer ? "primary" : "btn-quiet"}
      data-testid="save-station"
      onClick={() => void save()}
    >
      Save answer
    </button>
  );
  /* Four states: whether what is on screen is what is on the record (M73), and
   * since M92 "Draft" while it isn't and the save hasn't failed. */
  const statusChip = (
    <StatusChip
      label={
        saveError
          ? "Not saved"
          : dirty
            ? "Draft"
            : saved
              ? "Saved"
              : nothing
                ? "Unchanged"
                : stationSaidSomething
                  ? "Saved"
                  : "Not started"
      }
      tone={saveError ? "warn" : saved && !dirty ? "ok" : "neutral"}
      testId="station-status"
    />
  );

  const summary = (
    <section className="station-summary" data-testid="station-summary" aria-label="Summary">
        {field !== null && (
          <div className="station-field station-answer" data-testid="station-answer">
            {/* Not the step's question again. The question is above the
                conversation; this says what the box holds, which is a different
                thing and is the thing a researcher scrolling back down needs to
                know. */}
            {/* The label, and beside it the one control that answers "where did
                this come from" (M39, ISC-505). On the row rather than as a line
                under the box: a reader who never asks the question pays nothing
                for it, and one who does asks it where the answer is. */}
            <div className="field-label-row">
              <h2 className="summary-head" data-testid="summary-head">
                <label htmlFor="station-input">Summary</label>
              </h2>
              {/* M92 polish: the state beside the heading, so the controls under
                  the summary sit on one row. "Draft" while the box holds text
                  that isn't on the record yet. */}
              {statusChip}
              <ProvenancePopover
                view={answerProvenance({ events, projectId: project.id, place: stationId })}
                about="your answer at this step"
                testId="station-provenance"
              />
            </div>
            <p className="small muted summary-lede" data-testid="summary-lede">{SUMMARY_LEDE}</p>
            {editing ? (
                <textarea
                  id="station-input"
                  rows={station.rows}
                  value={stationValue(brief, stationId)}
                  data-testid="station-input"
                  data-drafted={draftedFrom === null ? undefined : "true"}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set(e.target.value)}
                />
            ) : (
              <SummaryText text={stationValue(brief, stationId)} testId="station-text" drafted={draftedFrom !== null} />
            )}
            {/* M92 polish: one row of controls. Unsaved text (an edit or a draft)
                gets Save answer and Cancel straight under it; otherwise the two
                ways to change the summary. */}
            {editing || dirty || saveError ? (
              <EditButtons
                testIdPrefix="station-summary"
                save={saveButton}
                {...(editing
                  ? {}
                  : {
                      onEdit: () => {
                        editStart.current = stationValue(brief, stationId);
                        setEditing(true);
                      },
                    })}
                onCancel={() => {
                  if (editing && editStart.current !== null) set(editStart.current);
                  else {
                    /* A draft goes back to the answer on the record. */
                    setBrief((b) => withStationValue(b, stationId, stationValue(project.brief, stationId)));
                    declineDraft(draftedFrom, draftKind);
                    setDraftedFrom(null);
                    setDraftText(null);
                    setDraftKind(null);
                    setSaveError(false);
                  }
                  setEditing(false);
                }}
              />
            ) : (
              <SummaryButtons
                testIdPrefix="station-summary"
                generating={drafting}
                onEdit={() => {
                  editStart.current = stationValue(brief, stationId);
                  setEditing(true);
                }}
                onGenerate={() => void draftAnswer()}
              />
            )}
            {/* The lede under the heading says what the hint here used to (M59), so
                the sentence is said once. */}
            {draftedFrom !== null && (
              <p className="small station-drafted" data-testid="station-drafted" role="status">
                {reading !== null && draftedFrom === reading.id
                  ? "Abductive suggested this puzzle. Save answer makes the summary yours."
                  : "Abductive wrote this from your replies. Save answer makes the summary yours."}
              </p>
            )}
            {/* What the marker in the draft is (D1, M43b). The walk of 2026-09-13
                found the literal "[...]" mid-body in a station draft, between two
                paragraphs, with nothing on the page naming it. */}
            {draftedFrom !== null && hasGapMarker(stationValue(brief, stationId)) && (
              <p className="small muted" data-testid="station-draft-gap" role="status">
                {GAP_MARKER_NOTE}
              </p>
            )}
            {draftNote !== null && (
              <p className="small muted" data-testid="station-draft-note" role="status">
                {draftNote}
              </p>
            )}
          </div>
        )}

        {/* One primary, always rendered, one label (D4).
         *
         * On a fresh station this row used to hold two controls and both of them
         * were ways of not doing the thing: accept was omitted outright until the
         * researcher typed, so the first screen of the product offered "Doesn't
         * apply here" and "Decide later" and nothing else. Then it appeared,
         * labelled "Save, and log what changed", which leads with bookkeeping and
         * changes the words under a reader who had just learned them.
         *
         * So the save is here, above the group, in both states. Inert rather than
         * disabled: `aria-disabled` keeps it in the tab order, so a keyboard user
         * lands on it and hears the sentence saying what wakes it, which is the
         * only version of this state that sits honestly beside a rule that
         * nothing gates. `save` guards itself, because the click still fires. */}
        <div className="station-decide">
          <div className="station-primary">
            {/* R4 item 1. Weight follows the named next move.
             *
             * On a step with nothing written the page's move is somewhere else,
             * usually the framing at the top, and this button was the only filled
             * control on the screen: the page said one thing and pointed at
             * another. It is quiet until there is an answer to save, and filled
             * the moment there is. Never disabled and never hidden, so the
             * no-gating rule holds and the keyboard user reaches it either way. */}
            {/* M92 polish: Save answer moved under the summary, beside Cancel, and
                keeps every job it had (the record, the brief, the concept pass).
                A step without a box keeps it here. */}
            {field === null && saveButton}
            {/* M92, ISC-752: Summarise went at the owner's word of 2026-10-15; the
                summary's own Auto-generate summary from chat replaces it. */}
            {/* M58, ISC-567. At the puzzle step, the tool's reading is the first
                draft on offer: pressing this puts the reading in the box, unsaved,
                and a save records the reading as the draft the answer came from. */}
            {stationId === "puzzle" && reading !== null && reading.text.trim() !== "" && !readingRejected && (
              <button
                type="button"
                className="btn-quiet"
                data-testid="draft-from-reading"
                onClick={() => {
                  setBrief((b) => withStationValue(b, stationId, reading.text));
                  setDraftedFrom(reading.id);
                  setDraftText(reading.text);
                  setDraftKind("reading");
                  setSaved(false);
                  setNothing(false);
                }}
              >
                Use suggested puzzle
              </button>
            )}
            {/* M69, ISC-641: "Set step aside" went (Matthew, 2026-10-02: "They can
              just move on"). The loop gate reads saved answers only. */}

          {/* Three states, not two. "Nothing to save yet" was printed over a
                station holding four saved paragraphs, because the only
                distinction the chip drew was whether this session had written
                anything. What a researcher wants to know is whether what is on
                screen is what is on the record. */}
            {/* M73: "Not saved" after a save the record refused, beside the line
                that says so. The box keeps the text, so it differs from disk, and
                this is the one state the chip shows while it does. */}
            {field === null && statusChip}
          </div>


          {/* What the save set going, under the save row (M47; the bias scan's
           * two lines went at M89). `role="status"` for a working line so a
           * screen reader hears it without the focus moving, and `role="alert"`
           * for a failure, which is the one a reader has to know about. */}
          {saveError && (
            <p className="error small" data-testid="station-save-error" role="alert">
              Abductive couldn't record the answer. Try again.
            </p>
          )}
          {suggesting && (
            <p className="small muted" data-testid="station-suggesting" role="status">
              Abductive is considering this summary for concepts to suggest.
            </p>
          )}
          {suggestNote !== null && !suggesting && (
            <p className="small muted" data-testid="station-suggested" role="status">
              {suggestNote}
              {owedSuggestion !== undefined && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="linkish"
                    data-testid="suggest-try-again"
                    onClick={() => suggestFrom(stationId, owedSuggestion.brief, owedSuggestion.text)}
                  >
                    Try again
                  </button>
                </>
              )}
            </p>
          )}

        </div>

        {/* The step's own line, what it feeds (D4, then a fold under the save
            row), moved into Design's Help panel at M62 (ISC-600), which names
            the step you are on. */}
    </section>
  );

  if (closed !== undefined) {
    return (
      <section className="station" data-testid="station-workspace" data-station={stationId} data-closed="true">
        <header className="station-head">
          <p className="station-kicker small muted" data-testid="station-kicker">
            {stepKicker(stationId)}
          </p>
        </header>
        <p className="station-closed" data-testid="station-closed">
          {closed.sentence}
        </p>
        {closed.goTo !== undefined && (
          <a
            className="linkish"
            href={studyPath(project.id, "design", closed.goTo)}
            data-testid="station-closed-go"
          >
            {`Go to ${stationById(closed.goTo).label}`}
          </a>
        )}
      </section>
    );
  }

  return (
    <section className="station" data-testid="station-workspace" data-station={stationId}>
      {/* "Step n of 7", not "Station: x". The rail says which station you are
          at; what it could not say is how far along the seven you are, and a
          researcher who cannot see that is a researcher who does not know
          whether they are near the end. The label stays on the line because
          the kicker is also the only place the station is named in words on
          this half of the pane.

          M34, round three: the sentence is built by `stepKicker` in
          StationLoop.tsx, because the front page's step panel says the same
          thing about the same seven and two spellings of one form is how the
          two screens come to disagree about what step you are on. */}
      <header className="station-head">
        <p className="station-kicker small muted" data-testid="station-kicker">
          {stepKicker(stationId)}
        </p>
      </header>
      {/* M96, ISC-790: the files that the Early data conversation considers. */}
      {stationId === "early-data" && hasData(documents) && (
        <EarlyDataScopeLine projectId={project.id} documents={documents} chunks={chunks} />
      )}

      {/*
       * The prompt sits directly above its own field and is joined to it by
       * `for`. It used to be a standalone heading at the top of the card with
       * the research-question field between it and the box it was labelling,
       * so read top to bottom the big question appeared to ask for the thing in
       * the very next box, which was a different question entirely.
       *
       * The three framing fields that bracketed it are gone from this card
       * altogether as of M27 (D2). They are the band above the rail now, always
       * visible on every station, which is what they always were: settings for
       * the whole study rather than a fourth thing to answer at one stop.
       */}
      {/* The step's question, and then the conversation about it (M37).
        *
        * The question is a heading rather than a label on the box now, because
        * the box is no longer the next thing under it. It is still joined to
        * the box by `for`, so a screen reader user who lands on the textarea
        * hears what the step asks; what stands between them is the exchange
        * that is supposed to produce the answer. */}
      {/* M58, ISC-564: with a conversation, the question is the tool's first turn
          in the thread rather than a heading above it. Without one the heading
          stays, so the step still says what it asks. */}
      {conversation === undefined && (
        <h2 className="station-prompt" data-testid="station-prompt">
          {field !== null ? <label htmlFor="station-input">{station.prompt}</label> : station.prompt}
        </h2>
      )}
      {/* M50, ISC-532. Under the prompt, on the one step that is read as
          something else. Not inside the `h2`, because it is not part of the
          question and a heading that carried it would be read as one. */}
      {station.apart !== undefined && (
        <p className="small muted station-apart" data-testid="station-apart">
          {station.apart}
        </p>
      )}

      {/* M84, ISC-707: the unit of analysis, beside the setting, at Context. */}
      {stationId === "context" && (
        <label className="station-field">
          <span className="small muted">{UNIT_LABEL}</span>
          <select value={brief.unit ?? ""} data-testid="station-unit" onChange={(e) => void chooseUnit(e.target.value)}>
            <option value="">Choose unit</option>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_OPTION[u]}
              </option>
            ))}
          </select>
        </label>
      )}
      {/* M92, ISC-749: under Other, a box for the unit, saved when the researcher leaves it. */}
      {stationId === "context" && brief.unit === "other" && (
        <label className="station-field">
          <span className="small muted">{UNIT_OTHER_LABEL}</span>
          <input
            type="text"
            data-testid="station-unit-other"
            value={brief.unitOther ?? ""}
            onChange={(e) => {
              const unitOther = e.target.value;
              setBrief((b) => ({ ...b, unitOther }));
            }}
            onBlur={(e) => void chooseUnit("other", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void chooseUnit("other", e.currentTarget.value);
            }}
          />
        </label>
      )}

      {conversation}

      {/* M93, ISC-755: the chat closes with Surface concepts and relationships,
          and the suggestions it brings wait here under the chat. */}
      {conversation !== undefined && (
        <SurfaceStep projectId={project.id} place={stationId} brief={project.brief} graph={graph} chunks={chunks} documents={documents} onChanged={onChanged} />
      )}

      {/* M96, ISC-792: the Data type menu and Suggest concepts left Early data
          (the owner, 2026-10-30). With data, the line at the top of the step
          says which files the conversation considers; without it, the step
          offers the declaration that opens the Data section on Sources. */}
      {stationId === "early-data" && !hasData(documents) && (
        <div className="early-data" data-testid="early-data-controls">
          <DeclareEarlyData projectId={project.id} land="material" onDeclared={onChanged} />
        </div>
      )}

      {summaryHost !== undefined && summaryHost !== null ? createPortal(summary, summaryHost) : summary}
    </section>
  );
}

