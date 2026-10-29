/**
 * One decision vocabulary (FND-06).
 *
 * /design/context alone offered five ways to decline: "No changes" (permanently
 * disabled, no tooltip), "Not yet", "Doesn't apply to this study", "I don't know"
 * and "Not now", with nothing stating the difference between "Not yet" and "Not
 * now". /ontology used a different triad again, and /coherence collapsed to two
 * verbs with no defer at all and a past participle with no object.
 *
 * Four of the five went when this table landed. "Not yet" and "Not now"
 * survived it, one on the station decision row and one on the interview three
 * hundred pixels below, still with nothing stating the difference, which is the
 * clause above describing a state the code was still in. The station reads
 * `defer.label` now, so the app deferring anything through a decision row says
 * "Decide later". The interview keeps "Not now" and it is no longer a near
 * miss: its object is a question being put to you, not something you are
 * deciding about, and no other label on that screen is within a word of it.
 *
 * Three roles, defined once, and the definition travels with the control rather
 * than living in a help page. A surface that needs a fourth verb has to widen
 * this union, which is a code review rather than a copy edit.
 *
 * The verbs are the defaults. A surface may reword the label for its own object
 * as long as the role is unchanged: what the researcher is doing has to be the
 * same three things everywhere, but "Put it in" reads better than "Accept" over
 * a draft page.
 *
 * The `meaning` is the role's contract and is not a per-surface field. It was
 * treated as flavour text written for a draft page, and it went wrong in the one
 * way this table exists to prevent. `defer` read "Leaves it open. Nothing is
 * recorded except that you looked", and its only consumer, the station decision
 * row, appended a bound event on press and redrew the rail with the set-aside
 * mark within the second. So the control's own tooltip denied the record eight
 * pixels above a paragraph asserting it, on the one guarantee the tool exists to
 * make. The fix is here rather than a `meanings` override prop on DecisionGroup:
 * an override would let each surface restate what a role does, which is the
 * five-verbs-on-one-screen drift this module was written to end. Every role now
 * describes what pressing it writes, and a surface that cannot honour that has
 * to widen the union instead.
 */

export type DecisionRole = "accept" | "decline" | "defer";

export interface DecisionVerb {
  /** What the control says. */
  readonly label: string;
  /** What it does, one sentence, shown as the control's title. */
  readonly meaning: string;
  /** Whether choosing it opens the reason field. */
  readonly wantsReason: boolean;
}

export const DECISION_VERBS: Readonly<Record<DecisionRole, DecisionVerb>> = {
  accept: {
    label: "Accept",
    // "Takes it into your model" was written when the only thing anyone
    // imagined accepting was a draft page. The live consumer is the station
    // decision row, where accept saves the brief, and the aside a column away
    // says "nothing enters your ontology until you accept it", so the save
    // button claimed to put something in the ontology that the same screen said
    // was reached another way. Says what the role does for any object now.
    meaning: "Accepts it, with a record of its origin.",
    wantsReason: false,
  },
  decline: {
    label: "Reject",
    meaning:
      "Records that you looked and said no, with a reason if you have one, and the item stays on the list.",
    wantsReason: true,
  },
  defer: {
    label: "Decide later",
    // The string this round was sent back for. It said nothing was recorded,
    // and pressing it appended a bound event and changed the rail chip to "you
    // set this aside; recorded, not missing" inside one second. Deferring is a
    // declination like any other here: the record keeps it, and keeping it is
    // the point, because a design that shows what was left open is worth more
    // than one that shows only what was settled.
    meaning: "Records that you set it aside for now, unanswered and still on the list.",
    wantsReason: false,
  },
};

/** The order the three roles are offered in, everywhere. */
export const DECISION_ORDER: readonly DecisionRole[] = ["accept", "decline", "defer"];

/**
 * Accept is primary; the two others are quiet. Equal weight so declining is not
 * penalised, distinct treatment so the expected path is still unmistakable
 * (FND-06). Every group in the app was three identical outline pills.
 */
export function decisionButtonClass(role: DecisionRole): string {
  return role === "accept" ? "btn-primary" : "btn-quiet";
}

/**
 * Which roles a group offers. A surface may drop accept (nothing to accept yet)
 * or defer (the object is already open by default), and may never drop decline.
 * That was a sentence in a prop comment before, which is not a constraint, it
 * is a hope: declining is first-class and a surface author under deadline is
 * exactly who removes it.
 */
export function decisionRoles(omit: readonly DecisionRole[] = []): readonly DecisionRole[] {
  return DECISION_ORDER.filter((role) => role === "decline" || !omit.includes(role));
}

/**
 * The reason draft, shared by the decline path and the finding dismissal.
 *
 * Both are the same move: the researcher says no on the record, and the record
 * takes whatever reason they felt like giving. Modelling it once is what stops
 * the two drifting into two grammars, which is how five decline verbs got onto
 * one screen in the first place.
 *
 * Closed is a distinct shape rather than an empty string, because "no field on
 * screen" and "field on screen, nothing typed" are different states and the
 * tab order depends on which one it is.
 */
export type ReasonDraft = { readonly open: false } | { readonly open: true; readonly reason: string };

export const REASON_CLOSED: ReasonDraft = { open: false };

export function openReason(reason = ""): ReasonDraft {
  return { open: true, reason };
}

export function editReason(draft: ReasonDraft, reason: string): ReasonDraft {
  return draft.open ? { open: true, reason } : draft;
}

/** Whether the field is mounted, which is the same question as whether it is a tab stop. */
export function reasonFieldIsLive(draft: ReasonDraft): boolean {
  return draft.open;
}

/** What gets recorded. Trimmed, and empty is a legitimate answer. */
export function reasonGiven(draft: ReasonDraft): string {
  return draft.open ? draft.reason.trim() : "";
}

/**
 * A decline with no reason is still a decline.
 *
 * Nothing gates, and a reason field that refuses to submit while empty is a
 * gate on the one move the tool exists to make cheap. The field invites a
 * reason and never withholds the outcome for the want of one.
 */
export function canRecordDecline(_draft: ReasonDraft): boolean {
  return true;
}
