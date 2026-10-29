/**
 * Who set a question aside, and what the record says about it (D9, M43).
 *
 * Three controls put a question to bed and until M43 the record could not tell
 * them apart. "I don't know", "Not now" and "Give me some directions" all wrote
 * a `refusal`, so the walk of 2026-09-13 pressed for directions at the Site
 * step and the transcript answered `declined · the Site step` over the words
 * "Not now.", with the model's next sentence reading "Fair enough, that's yours
 * to decline". The researcher had declined nothing. They had asked for help
 * before answering, and the tool wrote a decision in their name on the one
 * surface whose claim is that it never does.
 *
 * Setting the question aside is right and stays: one question is open at a time
 * across the whole study (M37 D4), so the tool has to close the open one before
 * it can help with anything else. What changes is whose act the record says it
 * was. `RefusalEvent.setAsideFor` carries the tool's own reason when the tool is
 * the one doing it, and this module is the single reading of that fact.
 *
 * ## Records written before the field existed
 *
 * A ledger appends and does not rewrite, so the study walked on 2026-09-13 holds
 * refusals with nothing on them. `setAsideReasons` reads those from the shape of
 * what follows: a `not-now` refusal whose very next event in the same study is a
 * guidance turn at the same place is the tool asking for the floor, because
 * nothing else in the app produces that pair. Conservative on purpose. An event
 * between the two, a different place, or any other mode, and the refusal reads
 * as the researcher's own, which is what it was until M43 and what it should
 * stay when the record cannot say otherwise.
 */

import type { LedgerEvent, RefusalEvent } from "../ledger/events.ts";

/** The tool's reason for closing its own question. */
export type SetAsideReason = NonNullable<RefusalEvent["setAsideFor"]>;

/**
 * The reason per refusal event id, for every refusal the tool wrote itself.
 *
 * A refusal the researcher pressed is absent from the map rather than present
 * with a null: the map answers "did the tool do this", and an entry that says
 * "no" is a fact two surfaces could read two ways.
 */
export function setAsideReasons(
  events: readonly LedgerEvent[],
): ReadonlyMap<string, SetAsideReason> {
  const out = new Map<string, SetAsideReason>();
  /** Where each question was asked, so a legacy pair can be matched on place. */
  const placeOfQuestion = new Map<string, string>();
  for (const event of events) {
    if (event.type === "question-selection" && event.station !== undefined) {
      placeOfQuestion.set(event.id, event.station);
    }
  }

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event === undefined || event.type !== "refusal") continue;
    if (event.setAsideFor !== undefined) {
      out.set(event.id, event.setAsideFor);
      continue;
    }
    if (event.kind !== "not-now") continue;

    /* The next event in this study, which is the whole of "nothing between
     * them". Scoped here rather than trusted from the caller, because two
     * studies' events interleave in the store and adjacency across them would
     * be an accident of write order. */
    const next = events.slice(i + 1).find((e) => e.projectId === event.projectId);
    if (next === undefined || next.type !== "question-selection") continue;
    if (next.mode !== "guidance") continue;
    const place = placeOfQuestion.get(event.questionEventId);
    if (place === undefined || next.station !== place) continue;
    out.set(event.id, "directions");
  }
  return out;
}

/** The kicker on a set-aside turn. The verb, so a reader scanning sees the act. */
export const SET_ASIDE_LABEL = "set aside";

/**
 * What the transcript says about a question the tool set aside.
 *
 * `where` is the place in the rail's own words, from `topicLabel`, so the step
 * is named in the sentence rather than left to the reader to infer from which
 * column they are looking at. The tool's own act is the subject of the second
 * clause, because the first thing the reader needs to know is that this turn is
 * not a decision of theirs.
 */
export function setAsideLine(reason: SetAsideReason, where: string): string {
  return reason === "directions"
    ? `You asked for directions at ${where}, so Abductive set its own question aside.`
    : `You picked another question at ${where}, so Abductive set its own question aside.`;
}
