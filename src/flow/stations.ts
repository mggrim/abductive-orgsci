/**
 * The seven stations of early-stage qualitative design (ISC-75 … ISC-91).
 *
 * This is the single declaration of the flow. The rail, the station workspace,
 * the introduction page, and the tests all read this array — ISC-79 exists
 * because a second hand-written list of station names is exactly how a rail
 * and a form drift apart, and the drift is invisible until a co-author asks
 * why the sidebar says one thing and the heading says another.
 *
 * Two design commitments are load-bearing and easy to lose:
 *
 *   1. **The spine orients; it never gates.** v2 removed v1's staged screens
 *      because they *hid* the ontology and *blocked* the work. The objection
 *      was to hiding and blocking, not to sequence. Every station here is open
 *      from the first second of a study, in any order, on an empty project.
 *      Nothing in this file — and nothing that reads it — may make one station
 *      conditional on another. See ISC-81, ISC-82.
 *
 *      One exception, the owner's (M58, 2026-09-27: "sample and early data are
 *      two external pieces that are greyed out until the other bits are filled
 *      in"). Sample and Early data wait until each of the six loop steps has an
 *      answer or was set aside; the lead ruled that this supersedes ISC-81 and
 *      ISC-82 for those two stations only. The rule lives in `loopGate.ts` and
 *      nowhere else, and every other station stays open.
 *
 *   2. **A station is a question, not a field.** The value is in what is asked.
 *      `prompt` is the methods question a rigorous colleague would put; the
 *      textarea underneath it is incidental. ISC-87 enforces that every prompt
 *      is interrogative, for the same reason the interview loop enforces it:
 *      a prompt phrased as an instruction tells the researcher what to write.
 *
 * On the ordering: it is the dependency order of qualitative design, not a
 * schedule. You cannot choose a site without a context, or sample on a process
 * you have not named. But the arrow runs backwards constantly — early data
 * revises the process of interest, which is the whole point of the method —
 * so the rail shows the sequence and the tool never enforces it.
 */

import type { StageId } from "../matrix/schema.ts";

export type StationId =
  | "context"
  | "site"
  | "process"
  | "outcome"
  | "sample"
  | "early-data"
  | "bind"
  | "puzzle";

/**
 * The two station ids M27 retired, and what they resolve to (D3).
 *
 * `challenge` asked what the people in the setting were struggling with and
 * `tension` asked what pulled against what. Read back, those were one question
 * asked twice: the challenge blurb spent three sentences saying what it was
 * not, which is what a station does when it is not carrying its own weight.
 * They are one station, `bind`, and the two old ids resolve to it rather than
 * dying, because a co-author may be holding `#/study/:id/design/tension` and a
 * study saved before M27 has `bound` events and question topics under both.
 *
 * Resolution rather than aliasing: `isStationId` stays strict, so nothing can
 * put a retired id into a `StationId` slot by accident, and every surface that
 * reads an id off a URL or a ledger row asks `resolveStationId` for the
 * station it means.
 */
const RETIRED_STATIONS: Readonly<Record<string, StationId>> = {
  challenge: "bind",
  tension: "bind",
};

export interface Station {
  readonly id: StationId;
  /** Rail label. Short enough to read at a glance in a narrow column. */
  readonly label: string;
  /** One sentence on what this station is for (ISC-86). */
  readonly blurb: string;
  /** The methods question. Always interrogative (ISC-87). */
  readonly prompt: string;
  /** What the tool does with the answer, stated plainly (ISC-91). */
  readonly feeds: string;
  /**
   * One sentence telling this step apart from something it is read as (M50,
   * ISC-532).
   *
   * A co-author, on their first use, 2026-09-21: the bind and the puzzle read as
   * the same thing. They are not, and the difference is the one a researcher has
   * to hold: a bind is felt by the people in the setting and a puzzle is a gap in
   * the account, so a study can have a real bind and no puzzle, a puzzle and no
   * bind, or neither yet.
   *
   * Optional, and only one station has it. A sentence under every step would be
   * seven paragraphs of tool talk on the surface a researcher works on, and six
   * of the seven have never been confused with anything.
   */
  readonly apart?: string;
  /**
   * The matrix stage this station sits closest to. Stations are not stages —
   * there are seven of these and five of those — but the trigger engine is
   * stage-scoped for stage-entry cells, and focusing a station is the closest
   * thing v2 has to entering a stage.
   */
  readonly stage: StageId;
  /** Rows in the textarea. Some of these want a paragraph, some a sentence. */
  readonly rows: number;
  /**
   * Where this sits in the rail.
   *
   * The first four feed each other and can be entered from any of them: you
   * might start from an outcome you care about, a process you want to follow,
   * a site you can get into, or nothing but a context that grips you. The
   * co-author put it plainly on 4 August: "those probably should be a loop, as
   * opposed to... they all are kind of feeding each other and you could start
   * at any point." Rendering them as steps one to four said the opposite of
   * the sentence printed underneath them.
   *
   * The remaining three are what the loop produces once it has turned.
   *
   * M58 (Matthew, 2026-09-27): "The puzzle and the bind should become two
   * components of an inner loop in the middle of the Context Process Outcome
   * Site cycle ... and then sample and early data are two external pieces." So
   * three places: the outer ring of four, the inner ring of two, and the two
   * pieces that sit outside both.
   */
  readonly ring: "outer" | "inner" | "external";
}

export const STATIONS: readonly Station[] = [

  {
    id: "context",
    label: "Context",
    blurb: "The world that your project is set in.",
    /* M92, ISC-742 (Matthew, 2026-10-15): every question faces forward. */
    prompt: "What setting do you plan to study, and what draws you to that setting?",
    feeds:
      "Your answer here shapes every question that Abductive asks you next. Abductive also writes an ordinary, by-the-book version of your project from your answer, which you can read whenever you like.",
    stage: "design-brief",
    rows: 5,
    ring: "outer",
  },
  /*
   * M85, ISC-713 (a co-author, 2026-10-13; Matthew, 2026-10-14): the period
   * and the phenomenon tracked through it, in their framing. "Your study" reads
   * "you are studying" (the project/study rule, L12), and the questions of
   * variance and of the unit of analysis are follow-ups inside the step, in the
   * specifics register (interview/register.ts), since Context carries the unit.
   */
  {
    id: "process",
    label: "Process",
    blurb: "The period that your project covers, and the phenomenon that you plan to follow through that period.",
    /* M92, ISC-742: forward, keeping a co-author's period and phenomenon. */
    prompt: "What period of time will you study, and what central phenomenon do you plan to track through that period?",
    feeds:
      "Your sample hangs off this answer. Until you can name the phenomenon and its period, you can't name the people or the material that would show the phenomenon across that period.",
    stage: "design-brief",
    rows: 4,
    ring: "outer",
  },
  /*
   * M85, ISC-714 (a co-author, 2026-10-13; Matthew, 2026-10-14): their framing,
   * worded so that a researcher before the field can answer ("expect or see";
   * "expect to find" since M92, when every question turned forward).
   * Their fourth question, whether the variation is large enough for a paper, is
   * the follow-up in the specifics register (interview/register.ts).
   */
  {
    id: "outcome",
    label: "Outcome",
    blurb: "The outcome that you want to study, the variation in that outcome that you expect to find, and the reason that the variation would matter.",
    /* M92, ISC-742: forward, keeping a co-author's outcome, variation and reason. */
    prompt: "Which outcome or phenomenon do you want to study, what variation in that outcome do you expect to find, and why would that variation matter?",
    feeds:
      "Abductive keeps this answer apart from your answer at Process, because a process and its outcome are two different questions.",
    stage: "design-brief",
    rows: 4,
    ring: "outer",
  },
  {
    id: "site",
    label: "Site",
    blurb: "Where you're looking, and your reason for that place over somewhere else.",
    prompt: "Why is this the right place to see what you're studying, and what will the place be bad at showing you?",
    feeds:
      "Abductive checks this answer harder than any other. A site chosen for the wrong reason shapes everything that you can see afterwards.",
    stage: "site-sample",
    rows: 4,
    ring: "outer",
  },
  /*
   * The puzzle as a step of its own (M58, ISC-567).
   *
   * From M40 to M57 the puzzle was never a field: the tool read it from the
   * saved answers and showed the reading on Starting point. The inner loop
   * needs something the researcher answers, so the puzzle is a step, and the
   * tool's reading is offered as its first draft rather than standing in for
   * the answer. The reading keeps its own event and its own provenance.
   */
  {
    id: "puzzle",
    label: "Puzzle",
    /* M92, ISC-751 (Matthew, 2026-10-15): "The puzzle is the surprise: what you
     * see, or expect to see, that current accounts can't explain." */
    blurb:
      "The surprise in your setting: what you see, or expect to see, that current accounts can't explain.",
    prompt: "What do you see, or expect to see, in your setting that current accounts can't explain?",
    feeds:
      "Your answer becomes the puzzle that the rest of your design answers to. Abductive keeps its own reading beside your answer, so you can see the places where the two differ.",
    stage: "anomaly",
    rows: 4,
    ring: "inner",
  },
  /*
   * One station where there were two (D3).
   *
   * `challenge` and `tension` both asked what the people in the setting are up
   * against, and the pair cost a rail stop to draw a distinction the researcher
   * was not making. What survives is the question that has somewhere to go: a
   * bind is observed, it is held by named people, and whether it resolves is a
   * finding rather than a prior. The old fields fold into this one on load, so
   * nothing written at either station is lost.
   */
  {
    id: "bind",
    label: "Bind",
    blurb:
      "The tension that you expect to find in the field: competing demands, incompatible accounts, something that people can't resolve.",
    /* M92, ISC-742: the tension that the researcher expects, and where to look for it. */
    prompt: "What tension do you expect the people in your setting to face, and who do you expect to feel that tension?",
    /* M50, ISC-532. Owner's wording, from the interview of 2026-09-26. */
    apart:
      "A bind is the tension that the people in your setting feel. The puzzle is the surprise: what you see, or expect to see, that current accounts can't explain. Not every project has a bind.",
    feeds:
      "Your answer becomes a claim in your ontology. Abductive then records whether the bind stands, resolves, or turns out not to be a bind at all.",
    stage: "anomaly",
    rows: 4,
    ring: "inner",
  },
  {
    id: "sample",
    label: "Sample",
    /* M92, ISC-742 (Matthew, 2026-10-15): "The sample section should also push
     * not just on what needs to vary but also what should remain consistent
     * across the sample." The sample's logic is the dimension that varies and
     * the conditions kept constant, so that a difference in the outcome can be
     * read against the variation. The question is the owner's wording of
     * 2026-10-15, three questions in one prompt, with "hold constant" as his
     * methods term (an exception to L15 in docs/copy-standard.md). */
    blurb: "The comparisons that you want to explore, the variation that your sample needs in order to examine them, and the conditions that you want to hold constant across the sample.",
    prompt: "What comparisons are you looking to explore? How would your sample need to vary in order to adequately examine those comparisons? And what would you ideally want to hold constant across the sample?",
    feeds: "Abductive reads your comparisons, the variation and the constants in this answer against your process, your outcome, and whatever you said this site would be bad at showing you.",
    stage: "site-sample",
    rows: 4,
    ring: "external",
  },
  {
    id: "early-data",
    label: "Early data",
    blurb: "Your transcripts, fieldnotes, memos and archives, and the claims that Abductive suggests from them.",
    /* M92, ISC-743: the one step about material already in hand, turning forward at the end. */
    prompt: "What has your early material shown you that you didn't expect, and what does that surprise make you want to explore next?",
    /* M30, r8. The draft-first promise was made twice on one screen, forty
     * pixels apart, in different words and with a different name for the same
     * actor: the control's own line says "You see everything the model finds as
     * a draft first, on the Your model tab", which names the destination and is
     * the one to keep. This fold keeps its own sentence. */
    feeds: "Everything that you cite comes from this data.",
    stage: "pilot-data",
    rows: 4,
    ring: "external",
  },
];

export const STATION_IDS: readonly StationId[] = STATIONS.map((s) => s.id);

export const DEFAULT_STATION: StationId = "context";

export function isStationId(value: string): value is StationId {
  return (STATION_IDS as readonly string[]).includes(value);
}

/**
 * The station an id names, following the retired ones to where they went (D3).
 *
 * Every reader of an id that came from outside this file goes through here: a
 * URL segment, a `bound` event subject, a `station:` topic. `isStationId` is
 * still the guard for an id that has to be one already, and the difference
 * matters — a retired id is a real station's old name, not a valid StationId,
 * and conflating the two is how a type stops meaning anything.
 */
export function resolveStationId(value: string): StationId | undefined {
  if (isStationId(value)) return value;
  const retired = RETIRED_STATIONS[value];
  if (retired !== undefined) return retired;
  /* D39 (M43d). A hyphen dropped from a hand-typed or hand-written link.
   *
   * The walk of 2026-09-13 set `#/study/<id>/earlydata` and `.../checks` and both
   * failed silently: the router does not recognise the token, so it falls through
   * to the Design station, and the page renders another surface while
   * `location.hash` still reports what was asked for. A station id is the only
   * thing in this app written with a hyphen inside a URL segment, so the
   * hyphenless form can only ever have meant the station, and landing there is
   * better than landing somewhere else without saying so. */
  const flattened = value.replace(/-/g, "").toLowerCase();
  return STATION_IDS.find((id) => id.replace(/-/g, "") === flattened);
}

export function stationById(id: StationId): Station {
  const found = STATIONS.find((s) => s.id === id);
  // Unreachable via `isStationId`, but the non-null assertion this replaces
  // would silently return undefined if STATIONS and StationId ever diverged.
  if (found === undefined) throw new Error(`unknown station: ${id}`);
  return found;
}
