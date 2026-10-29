/**
 * One projection per place, for every surface that says anything about a
 * conversation (M38).
 *
 * Eight places carry a conversation: the framing and the seven steps. Before
 * this, what each surface knew about a place it worked out for itself: the
 * rail read the brief, the chat read the transcript, the study list read the
 * interview state. FIN-02 was a rail dot and a tab count computed twice and
 * disagreeing, and the fix then was one list every surface reads
 * (`openFindings.ts`). This is the same fix for places, made before the
 * second computation exists: the rail's line, the header's open-question
 * pointer, Your model's grouping and the study list all read this.
 *
 * Three rules, all inherited:
 *
 *  - **Titles are the researcher's words.** A place's title is the first thing
 *    they said there, cut at a word boundary. Never a summary the tool wrote,
 *    which would be the tool saying what they meant (M37's refusal of
 *    summarise-into-the-answer, kept).
 *  - **Counts and states, never prose.** What a conversation produced is said
 *    as a number and a state, so a rail cannot become a score to be cleared.
 *  - **Nothing here gates.** Every field is descriptive; a surface may show it
 *    and may never disable anything on it (ISC-82). The one gate the app has,
 *    Sample and Early data waiting for the loops (M58), is `flow/loopGate.ts`
 *    and reads the brief, not these summaries.
 */

import type { LedgerEvent } from "../ledger/events.ts";
import { STATIONS, isStationId, stationById, type StationId } from "../flow/stations.ts";
// M40. `INTEREST_SUBJECT` is the one subject the framing files an answer under
// now, spelled beside the writer that writes it.
import { declinedStations, INTEREST_SUBJECT, stationValue } from "../flow/stationBrief.ts";
import type { ProjectBrief } from "../state/projects.ts";
import { projectInterview } from "../interview/state.ts";
import { projectProposals } from "../proposals/projection.ts";
import { buildTranscript, turnsAtStation } from "../workbench/Dialogue.tsx";

export const FRAMING_PLACE_ID = "framing";

export type PlaceId = StationId | typeof FRAMING_PLACE_ID;

export function isPlaceId(value: string): value is PlaceId {
  return value === FRAMING_PLACE_ID || isStationId(value);
}

/* M50, ISC-531. "Your framing" is "Theoretical motivation" wherever a reader
 * meets it. The id under it is unchanged: `framing` is on the record as a place,
 * a topic key and a bound subject in every study already saved. */
export function placeLabel(place: PlaceId): string {
  return place === FRAMING_PLACE_ID ? "Starting point" : stationById(place).label;
}

/**
 * The bound subjects a place's saved answer is filed under.
 *
 * One each since M40 (ISC-509). The framing had two, because the puzzle was its
 * second field and wrote a `research-question` row of its own. The puzzle is the
 * tool's reading now and writes no `bound` row at all, so the framing's saved
 * answer is the starting interest and nothing else. A second entry here would
 * make every surface look for a row nothing writes.
 */
export function placeSubjects(place: PlaceId): readonly string[] {
  return place === FRAMING_PLACE_ID ? [INTEREST_SUBJECT] : [place];
}

/** How the box at a place stands on the record. */
export type PlaceAnswer = "empty" | "saved" | "declined";

export interface PlaceSummary {
  readonly place: PlaceId;
  readonly label: string;
  /** The first thing the researcher said here, in their words, or null. */
  readonly title: string | null;
  /** Turns at this place, theirs and the tool's. */
  readonly turns: number;
  readonly answer: PlaceAnswer;
  /** A draft made from this conversation that no save has taken up since. */
  readonly draftWaiting: boolean;
  /** The study's one open question is here. */
  readonly openQuestion: boolean;
  /** Claims drafted from turns here, still waiting for a decision. */
  readonly waiting: number;
  /** When anything last happened here, or null. */
  readonly lastTs: number | null;
}

/** Characters a title keeps. Long enough to be recognisable, short enough for a rail. */
export const TITLE_CHARS = 72;

/**
 * A title from the researcher's first words at a place.
 *
 * Cut at a word boundary, first sentence preferred, no ellipsis added: the
 * text is theirs and the rail should not decorate it. An empty or whitespace
 * message gives null rather than an empty string, so a caller can tell "never
 * spoke here" from "said nothing".
 */
export function placeTitle(text: string): string | null {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat === "") return null;
  const sentence = /^(.+?[.!?])(\s|$)/.exec(flat)?.[1] ?? flat;
  if (sentence.length <= TITLE_CHARS) return sentence;
  const cut = sentence.slice(0, TITLE_CHARS);
  const atWord = cut.lastIndexOf(" ");
  return (atWord > TITLE_CHARS / 2 ? cut.slice(0, atWord) : cut).replace(/[,;:]$/, "");
}

export interface PlaceSummaryInput {
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
  readonly brief: ProjectBrief;
  /**
   * Passages of the researcher's own data, for the one step whose answer can be
   * material (D12, M43).
   *
   * Data only, and the field says so because the number it used to take was the
   * whole study's chunk count: a paper uploaded to the reading list marked Early
   * data answered on the rail while the step read "Nothing to save yet". Build it
   * with `dataChunkCount` from `state/chunks.ts` and nothing else.
   */
  readonly dataCorpusSize?: number;
}

/** The place a question-selection was asked at, following the retired ids. */
function placeOf(station: string | undefined): PlaceId | undefined {
  if (station === undefined) return undefined;
  return isPlaceId(station) ? station : undefined;
}

/**
 * The place each turn belongs to, by turn id.
 *
 * One derivation, used by `placeSummaries` below and by `placeOfTurnId` beside
 * it, because the two answer the same question at two scales and ISC-501 is that
 * a fact has one projection. It was private to `placeSummaries`, which is why
 * the map could not ask it anything: a surface needing the place of one turn
 * would have had to walk the transcript itself, and that second walk is FIN-02
 * with a different noun.
 */
function placesOfTurns(events: readonly LedgerEvent[]): ReadonlyMap<string, PlaceId> {
  const placeOfTurn = new Map<string, PlaceId>();
  for (const entry of buildTranscript(events)) {
    const place = placeOf(entry.station);
    if (place !== undefined) placeOfTurn.set(entry.id, place);
  }
  return placeOfTurn;
}

/**
 * Where one turn was taken, or null (M39, ISC-502).
 *
 * The map's reason for existing at all: pressing a claim has to offer the
 * conversation the claim came from, and a claim knows a turn id and nothing
 * about places. Null rather than a default station for three separate states a
 * caller must be able to tell apart — an id that is not a turn, a turn the
 * transcript has no station for, and a claim with no turn behind it at all —
 * because each of those means "there is no conversation to go to" and none of
 * them means "go to the first step".
 *
 * Scoped to the project before the transcript is built, so a turn id from
 * another study in the same ledger resolves to null rather than to whatever
 * place its own study put it at.
 */
export function placeOfTurnId(
  events: readonly LedgerEvent[],
  projectId: string,
  turnId: string,
): PlaceId | null {
  return placesOfTurns(events.filter((e) => e.projectId === projectId)).get(turnId) ?? null;
}

/**
 * Every place, framing first then the seven in rail order.
 *
 * Framing first because it is the conversation with no rail cell of its own,
 * which the interface research named as the thread most likely to be
 * abandoned; a list that starts with it cannot lose it.
 */
export function placeSummaries(input: PlaceSummaryInput): readonly PlaceSummary[] {
  const { projectId, brief } = input;
  const events = input.events.filter((e) => e.projectId === projectId);
  const transcript = buildTranscript(events);
  const interview = projectInterview(events, projectId);
  const declined = declinedStations(events);
  const pending = projectProposals(events, projectId).pending;

  // The place each turn belongs to, by id, so a proposal's sourceTurn can be
  // counted at its place without re-deriving the station inheritance.
  const placeOfTurn = placesOfTurns(events);

  const askedAt = (() => {
    const id = interview.outstanding?.eventId;
    if (id === undefined) return undefined;
    const selection = events.find((e) => e.id === id);
    return selection?.type === "question-selection" ? placeOf(selection.station) : undefined;
  })();

  const places: PlaceId[] = [FRAMING_PLACE_ID, ...STATIONS.map((s) => s.id)];
  return places.map((place) => {
    const here = turnsAtStation(transcript, place);
    const firstHuman = here.find((e) => e.kind === "human");
    const subjects = placeSubjects(place);

    let lastBound = -Infinity;
    let lastDraft = -Infinity;
    let lastTs: number | null = null;
    const touch = (ts: number) => {
      lastTs = lastTs === null ? ts : Math.max(lastTs, ts);
    };
    for (const e of events) {
      if (e.type === "bound" && subjects.includes(e.subject)) {
        lastBound = Math.max(lastBound, e.ts);
        touch(e.ts);
      } else if (e.type === "brief-draft" && e.station === place) {
        lastDraft = Math.max(lastDraft, e.ts);
        touch(e.ts);
      } else if (placeOfTurn.get(e.id) === place) {
        touch(e.ts);
      } else if (e.type === "question-selection" && placeOf(e.station) === place) {
        touch(e.ts);
      }
    }

    const answer: PlaceAnswer =
      place === FRAMING_PLACE_ID
        ? /* The starting interest alone (M40). The puzzle is the tool's reading,
           * so a framing whose only filled field is one the tool wrote would have
           * read as answered by the researcher. */
          (brief.startingInterest ?? "").trim() !== ""
          ? "saved"
          : "empty"
        : stationValue(brief, place).trim() !== "" ||
            (place === "early-data" && (input.dataCorpusSize ?? 0) > 0)
          ? "saved"
          : declined.has(place)
            ? "declined"
            : "empty";

    const waiting = pending.filter(
      (p) => p.sourceTurn !== undefined && placeOfTurn.get(p.sourceTurn) === place,
    ).length;

    return {
      place,
      label: placeLabel(place),
      /* M74b, ISC-664: the saved summary where there is one. The walk read the
       * Site entry carrying the student's first chat sentence beside a saved
       * summary that said something else. */
      title: placeTitle(savedText(brief, place)) ?? (firstHuman === undefined ? null : placeTitle(firstHuman.text)),
      turns: here.filter((e) => e.kind === "human" || e.kind === "agent").length,
      answer,
      draftWaiting: lastDraft > lastBound,
      openQuestion: askedAt === place,
      waiting,
      lastTs,
    };
  });
}

/** The saved answer at a place: the starting interest at the framing, a step's own field elsewhere. */
function savedText(brief: ProjectBrief, place: PlaceId): string {
  return place === FRAMING_PLACE_ID ? (brief.startingInterest ?? "") : stationValue(brief, place);
}

/** What the line says when the tool is not holding a question at all. */
export const NO_QUESTION_WAITING = "Abductive's next question is still to come.";

/**
 * What Your model says about the questions, in one sentence (M48b).
 *
 * The line counted `wb.moves` and said "3 questions are waiting on the Design
 * tab" on the shipped example. Three is how many moves `generateMoves` had
 * ready, which is what the tool could ask next; the tool holds one open question
 * at a time (M37). So the sentence counted candidates and called them waiting,
 * while the link on the same line went to the single open question's step. The
 * count and the destination disagreed about the same fact, in the same sentence.
 *
 * M46 wired the destination to `openQuestionAt` and left the count where the
 * retired "What the tool would ask next" panel had put it. Both read the one
 * projection now, so they cannot part again.
 *
 * Three states, and the sentence says which one it is:
 *
 *   - A question is open. One, always, and the sentence names the step holding
 *     it, because that step is where it can be answered and nowhere else.
 *   - No question is open and the tool has one ready. The researcher owes
 *     nothing yet, so the sentence says what is there rather than counting it.
 *   - Neither, which is the sentence the line already had.
 *
 * Flags are not counted here at all. Until M89 the Checks tab counted them and
 * the rail's cell state unioned a question with a flag (M43d, D41); both went
 * with the checks, and the rail's mark now means an open question alone.
 */
export function questionsWaitingLine(
  open: { readonly place: PlaceId | null } | null,
  movesReady: number,
): string {
  if (open !== null) {
    return open.place === null
      ? "One question is open for you on the Design tab."
      : `One question is open for you at ${placeLabel(open.place)} on the Design tab.`;
  }
  return movesReady > 0 ? "Abductive has a question ready on the Design tab." : NO_QUESTION_WAITING;
}

/** The study's one open question and where it is, or null. */
export function openQuestionAt(
  events: readonly LedgerEvent[],
  projectId: string,
): { readonly place: PlaceId | null; readonly question: string; readonly eventId: string } | null {
  const scoped = events.filter((e) => e.projectId === projectId);
  const outstanding = projectInterview(scoped, projectId).outstanding;
  if (outstanding === null) return null;
  const selection = scoped.find((e) => e.id === outstanding.eventId);
  const place = selection?.type === "question-selection" ? placeOf(selection.station) : undefined;
  return { place: place ?? null, question: outstanding.question, eventId: outstanding.eventId };
}
