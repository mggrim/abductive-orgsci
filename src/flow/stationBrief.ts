/**
 * The bridge between the seven stations and the stored brief (ISC-77, ISC-78).
 *
 * Kept apart from `stations.ts` so the station content — labels, blurbs,
 * prompts — stays testable without dragging IndexedDB types in, and so the
 * mapping from station to persisted field is one table rather than a switch
 * repeated in the workspace, the rail, and the introduction.
 *
 * The `bound` event is the point of this file. Every station save is a
 * bounding decision — the researcher committing to a site, a process, a
 * reading of the tension — and the ledger is where that becomes auditable.
 * `bound.subject` is the station id — `stationSubject` is the one place that
 * says so — so the timeline can answer "when did the process of interest
 * change, and to what" without any extra bookkeeping.
 */

import type { BoundEvent, LedgerEvent } from "../ledger/events.ts";
import type { ProjectBrief } from "../state/projects.ts";
import { STATIONS, type Station, type StationId } from "./stations.ts";
import { UNIT_SUBJECT } from "../interview/unitOfAnalysis.ts";

/**
 * Which brief field each station writes.
 *
 * `early-data` mapped to `null` until D5, on the reasoning that its content is
 * the corpus. It asked "What has your material already shown you that you did
 * not expect?" over no box at all, and the workspace renders a textarea for
 * any station whose field is not null, so the walk found a question with
 * nowhere to answer it and a step the researcher learns to walk past
 * (ISC-489). It writes `earlySurprise` now, and the corpus reading is kept
 * beside it in `stationStated`: a field or material, either way.
 *
 * The field is `earlySurprise` and the subject the save is filed under is the
 * station id, like every other station (owner, 2026-09-10). The two names
 * differ on purpose and the difference is only in this table: the field is one
 * of the two things this step holds, and the subject is the step. Filing the
 * save under a subject of its own would have cost the three things every
 * station's save gets for free — the loop below that writes `station.id`, the
 * declination a plain save clears, and the timeline row that reads "Early
 * data" rather than a de-hyphenated field name.
 *
 * The type keeps `| null` rather than narrowing to `keyof ProjectBrief`. A
 * station that is a place to do something rather than a place to write is a
 * shape this flow has had once and may have again, and every caller already
 * handles it.
 */
const FIELD: Readonly<Record<StationId, keyof ProjectBrief | null>> = {
  context: "context",
  site: "siteRationale",
  process: "processOfInterest",
  outcome: "outcomeOfInterest",
  sample: "sampleRationale",
  "early-data": "earlySurprise",
  // One field where there were two (D3). `challenge` and `tension` stay on
  // ProjectBrief so a bundle written before M27 still loads; `normalizeBrief`
  // folds them into this one, and nothing writes to them again.
  bind: "bind",
  // M58, ISC-567. Its own optional field; `researchQuestion` keeps the reading.
  puzzle: "puzzleAnswer",
};

export function stationField(id: StationId): keyof ProjectBrief | null {
  return FIELD[id];
}

/**
 * What a save at this station is filed under on the record: the station id.
 *
 * Every station, with no exception, which is the point of stating it here
 * rather than leaving it implicit in the loop that writes it. M37 nearly gave
 * `early-data` a subject of its own on the reasoning that the field is only
 * one of the two things that step holds, and three separate mechanisms key a
 * save on the station id: `declinedStations` below clears a "decide later"
 * when one arrives, `boundSubjectLabel` in the instrumentation reads the row
 * back as the station's label, and the conversation work finds the save a
 * draft became by the same route (ISC-487). A second spelling would have been
 * invisible to all three.
 */
export function stationSubject(id: StationId): string {
  return id;
}

/**
 * The subject the framing's starting interest is filed under (M37).
 *
 * Not a station, so it is not in the table above, and spelled once here because
 * three surfaces key on it: the writer below, `placeSubjects` in
 * `views/placeSummary.ts`, and the puzzle reading's own source list. It was a
 * literal in all three until M40, which is one spelling away from a surface
 * looking for a row nothing writes.
 */
export const INTEREST_SUBJECT = "starting-interest";

/* ISC-592: the Starting point's other two answers are saved on the record too,
 * so a save drafted from the conversation can name its draft, as the interest's
 * has since M37. History labels a subject by its words, so these read "papers"
 * and "target journal". */
export const PAPERS_SUBJECT = "papers";
export const VENUE_SUBJECT = "target-journal";

/** The subject each Starting point answer is saved under. */
export const FRAMING_SUBJECT = {
  startingInterest: INTEREST_SUBJECT,
  seminalCorpus: PAPERS_SUBJECT,
  targetVenue: VENUE_SUBJECT,
} as const;

/** A save at a step, on the record: one `bound` row under the step's subject. */
export function stationBoundEvent(projectId: string, station: StationId, statement: string): BoundEvent {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    actor: "human",
    projectId,
    type: "bound",
    subject: stationSubject(station),
    statement,
  };
}

/**
 * What the record last says was saved at a step, or undefined when nothing was
 * (M73, ISC-658). A step's answer on disk with no row saying it is the state a
 * failed save left behind, and the next press records it.
 */
export function recordedAnswerAt(
  events: readonly LedgerEvent[],
  projectId: string,
  station: StationId,
): string | undefined {
  const subject = stationSubject(station);
  let out: string | undefined;
  for (const e of events) {
    if (e.type === "bound" && e.projectId === projectId && e.subject === subject) out = e.statement;
  }
  return out;
}

export function stationValue(brief: ProjectBrief, id: StationId): string {
  const field = FIELD[id];
  if (field === null) return "";
  const value = brief[field];
  return typeof value === "string" ? value : "";
}

export function withStationValue(
  brief: ProjectBrief,
  id: StationId,
  value: string,
): ProjectBrief {
  const field = FIELD[id];
  if (field === null) return brief;
  return { ...brief, [field]: value };
}

/**
 * True when the researcher has said something at this station.
 *
 * Early data is the one station that can be said in two ways (D5). It has a
 * box now, and it still reads as said when material is loaded and nothing is
 * typed, because uploading a corpus is doing the step. Either counts, and
 * neither is required to make the other count: a researcher who has read their
 * transcripts elsewhere and typed what surprised them has done this step as
 * surely as one who has only uploaded.
 *
 * `dataCorpusSize` counts passages of the researcher's own data and nothing
 * else (D12, M43). It was `corpusSize`, and every caller handed it the whole
 * study's chunk count, so one PDF on the reading list marked the step answered:
 * see `dataChunkCount` in `state/chunks.ts` for what the walk found. The name
 * carries the requirement now, because the type cannot.
 */
export function stationStated(
  brief: ProjectBrief,
  station: Station,
  dataCorpusSize: number,
): boolean {
  if (stationValue(brief, station.id).trim() !== "") return true;
  return station.id === "early-data" && dataCorpusSize > 0;
}

/* M69, ISC-641: "deferred" went with the "Set step aside" control. A step is not
 * started, answered, or carrying an open question; an earlier set-aside stays on
 * the record and in History and no longer draws a state of its own. The state
 * keeps its id, "flagged", from when an open flag also raised it (M89). */
export type StationState = "empty" | "stated" | "flagged";

/**
 * Declining a station, first-class (advisor finding, 2026-08-01).
 *
 * The interview loop already treats "I don't know" as a real answer that costs
 * the researcher nothing. The stations did not, and the inconsistency mattered:
 * with only "empty" and "stated" available, ambivalence and irrelevance both
 * render as a blank, an empty rail dot reads as debt, and the researcher fills
 * boxes to clear them. That is the tool manufacturing the false confidence it
 * exists to detect.
 *
 * So a station can be *deferred* — "not yet", the honest state of most of a
 * design most of the time — or marked *not applicable*, which for an
 * interpretivist study is the correct answer at the outcome station and should
 * never look like an omission.
 *
 * Both are recorded, because what the researcher declines to specify is
 * evidence about the design in exactly the way a refused question is.
 */
export type StationDeclination = "not-yet" | "not-applicable";

const DECLINE_SUBJECT = (id: StationId, kind: StationDeclination) => `${id}:${kind}`;

const DECLINE_STATEMENT: Readonly<Record<StationDeclination, string>> = {
  "not-yet": "Set aside for now; not settled yet.",
  "not-applicable": "Not applicable to this project.",
};

export function declineStationEvent(
  projectId: string,
  station: StationId,
  kind: StationDeclination,
  note: string,
): LedgerEvent {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    actor: "human",
    projectId,
    type: "bound",
    subject: DECLINE_SUBJECT(station, kind),
    statement: note.trim() === "" ? DECLINE_STATEMENT[kind] : note.trim(),
  };
}

/**
 * The latest declination per station, read from the ledger. A later save at
 * the same station clears it — writing something is the strongest possible
 * signal that you are no longer deferring.
 */
export function declinedStations(
  events: readonly LedgerEvent[],
): ReadonlyMap<StationId, StationDeclination> {
  const out = new Map<StationId, StationDeclination>();
  for (const event of events) {
    if (event.type !== "bound") continue;
    const [id, kind] = event.subject.split(":");
    if (id === undefined) continue;
    if (kind === "not-yet" || kind === "not-applicable") {
      out.set(id as StationId, kind);
    } else if (out.has(id as StationId)) {
      // A plain save at a station supersedes an earlier declination.
      out.delete(id as StationId);
    }
  }
  return out;
}

/**
 * What the rail shows per station (ISC-83). `flagged` outranks `stated`: a
 * station the researcher has answered but the tool has an open question about
 * is more interesting than one that is merely filled in, and the rail is the
 * only place that comparison is visible at a glance.
 */
export function stationStates(
  brief: ProjectBrief,
  /** Passages of the researcher's own data. See `stationStated` (D12). */
  dataCorpusSize: number,
): ReadonlyMap<StationId, StationState> {
  /* M89 (2026-10-14): a third argument, the steps with an open flag, marked a
   * step "flagged" here until the checks left main. The rail still draws
   * "flagged" for a step where a question is open (`cellState`). */
  const out = new Map<StationId, StationState>();
  for (const station of STATIONS) {
    out.set(station.id, stationStated(brief, station, dataCorpusSize) ? "stated" : "empty");
  }
  return out;
}

/**
 * Bound events for every station whose text actually changed (ISC-77), and
 * none for the ones that did not (ISC-78).
 *
 * The no-op filter is not tidiness. The bounding timeline is evidence about
 * when the researcher's design commitments moved; re-logging seven untouched
 * fields every time they edit the eighth fills that record with decisions
 * nobody made, which is precisely the corruption v1's phantom adjudications
 * introduced elsewhere.
 */
export function briefChangeEvents(
  projectId: string,
  previous: ProjectBrief,
  next: ProjectBrief,
): readonly LedgerEvent[] {
  const events: BoundEvent[] = [];
  for (const station of STATIONS) {
    const field = FIELD[station.id];
    if (field === null) continue;
    const before = stationValue(previous, station.id);
    const after = stationValue(next, station.id);
    if (after.trim() === "" || after === before) continue;
    events.push(stationBoundEvent(projectId, station.id, after));
  }
  /* The framing's first field, on the record like the puzzle (M37). It was the
   * one framing answer that wrote no bound row, which meant a draft of it made
   * from the conversation had nowhere to leave its provenance (ISC-487). */
  const interestAfter = (next.startingInterest ?? "").trim();
  if (interestAfter !== "" && next.startingInterest !== previous.startingInterest) {
    events.push({
      id: crypto.randomUUID(),
      ts: Date.now(),
      actor: "human",
      projectId,
      type: "bound",
      subject: INTEREST_SUBJECT,
      statement: next.startingInterest ?? "",
    });
  }
  /* The other two Starting point answers (ISC-592), on the rule the interest's
   * row follows: a row when the answer changed and is not empty. */
  for (const [field, subject] of [
    ["seminalCorpus", PAPERS_SUBJECT],
    ["targetVenue", VENUE_SUBJECT],
  ] as const) {
    const after = (next[field] ?? "").trim();
    if (after !== "" && next[field] !== previous[field]) {
      events.push({
        id: crypto.randomUUID(),
        ts: Date.now(),
        actor: "human",
        projectId,
        type: "bound",
        subject,
        statement: next[field] ?? "",
      });
    }
  }
  /* No `research-question` row (M40, ISC-509).
   *
   * The puzzle stopped being a field. `brief.researchQuestion` still exists and
   * still holds the puzzle, and every reader of it is unchanged, but what writes
   * it is `usePuzzleReading` mirroring the tool's own reading, and a `bound` row
   * is the researcher committing to a boundary of their design. They committed to
   * the answers the reading was made of; they did not commit to the reading. A
   * row here would file the tool's sentence on the bounding timeline under
   * `actor: "human"`, which is the one thing the M37 rule forbids outright.
   *
   * Deleted rather than guarded, so the omission is structural: there is no call
   * site left that has to remember not to reach it. The reading's own event is
   * `puzzle-reading`, and `views/puzzleReading.ts` is what reads it back. */
  /* Only a kind actually chosen (D22). The field opens empty now, so a study
   * that has never answered it must not file a `bound` row saying so. */
  /* M84, ISC-707: the unit of analysis, on the record like the data kind. */
  /* M92, ISC-749: Other goes on the record once it has a typed unit, as "Other: <unit>". */
  const typedNow = (next.unitOther ?? "").trim();
  const unitChanged =
    next.unit !== undefined &&
    (next.unit !== previous.unit || (next.unit === "other" && typedNow !== (previous.unitOther ?? "").trim()));
  if (unitChanged && (next.unit !== "other" || typedNow !== "")) {
    events.push({
      id: crypto.randomUUID(),
      ts: Date.now(),
      actor: "human",
      projectId,
      type: "bound",
      subject: UNIT_SUBJECT,
      statement: next.unit === "other" ? `Other: ${typedNow}` : next.unit,
    });
  }
  if (next.dataType !== previous.dataType && next.dataType !== "") {
    events.push({
      id: crypto.randomUUID(),
      ts: Date.now(),
      actor: "human",
      projectId,
      type: "bound",
      subject: "data-type",
      statement: next.dataType,
    });
  }
  return events;
}
