/**
 * Socratic probes for the station the researcher is standing on
 * (ISC-209 … ISC-220).
 *
 * The eight stations and the interview loop were built two milestones apart
 * and never introduced. `MoveContext` carried the graph, the findings, the
 * matrix and the turn index, and nothing anywhere in `src/interview/`
 * mentioned a station. So standing at Tension you got one fixed sentence out
 * of a constant file and a textarea, while the dialogue beside it asked about
 * something else entirely. That is a form with a chatbot next to it.
 *
 * These probes close the gap. Each station gets questions that read what the
 * researcher has actually written there, and the questions differ depending on
 * whether the field is empty, thin, or answered in a way that gives the
 * question away.
 *
 * Three rules the probes hold to, all of them already doctrine elsewhere here:
 *
 *  - **A probe is a question.** Never an instruction, never a suggestion of
 *    what to write. Suggesting the answer is the assistant doing the
 *    researcher's bounding for them, which is the thing the tool exists to
 *    prevent.
 *  - **An empty station is not a failure.** The probe for a blank field asks
 *    what makes it hard to say, rather than nagging for text.
 *  - **A confident answer earns more pressure, not less.** The same reasoning
 *    as the confident-answer-streak signal: fluency is where the questions
 *    have stopped landing.
 */

import { stationById, STATIONS, type StationId } from "../flow/stations.ts";
import { stationField, stationValue } from "../flow/stationBrief.ts";
import type { ProjectBrief } from "../state/projects.ts";

export interface StationProbe {
  readonly station: StationId;
  /** The question put to the researcher. */
  readonly question: string;
  /** Why this one, in the researcher's terms. Shown, not hidden. */
  readonly rationale: string;
}

/** Under this many characters, a station is answered but not yet said. */
export const THIN = 80;

/**
 * Passages opened below which Early data counts as thin (M29, R9).
 *
 * Early data has no brief field, so `written` was derived from the corpus size
 * and the step could only ever read as empty or as answered at length: upload
 * anything and the probe jumped straight to "which passage fits your account
 * worst", which is a question for someone who has read the material. Three is
 * the smallest number that distinguishes having opened the corpus from having
 * been through it, and it matches the `thin` probe's own words, which ask which
 * part has not been opened yet.
 */
export const PASSAGES_READ = 3;

type ProbeSet = {
  /** Nothing written yet. */
  readonly empty: readonly [string, string];
  /** Something written, but barely. */
  readonly thin: readonly [string, string];
  /** Answered at length; press on the answer itself. */
  readonly stated: readonly [string, string][];
};

const PROBES: Readonly<Record<StationId, ProbeSet>> = {
  context: {
    empty: [
      "What do you hope this setting will let you explore, before you have a question about it?",
      "You won't write that reason down anywhere else, and it's usually the most honest thing about a project.",
    ],
    thin: [
      "Whom could you ask about what draws you to this setting, and what do you expect them to make of it?",
      "You may be seeing the setting or only your account of it. Asking someone else is how you'll tell.",
    ],
    stated: [
      [
        "Which part of your answer do you plan to see for yourself, and which part will you take from the accounts that people give you?",
        "Your own observations and the accounts that people give you carry different weight, so plan for both.",
      ],
      [
        "If someone in this setting heard your context back, what would they say you had misunderstood?",
        "You can test your context against the people in the setting now, for far less than a later test costs.",
      ],
    ],
  },
  site: {
    empty: [
      "What will you be able to see at this site that you couldn't see somewhere else?",
      "Access usually decides which site you get, and you can't undo the choice later.",
    ],
    thin: [
      "Are you choosing this site for what it can show you, or because you can get in?",
      "Either answer is fine. You only have to say which reason is yours.",
    ],
    stated: [
      [
        "If you are comparing, on what single dimension do you want the sites to differ, and what do you keep constant?",
        "Pick cases that differ on everything and you can't interpret the contrast that you find.",
      ],
      [
        "What would you have to see at this site to conclude the site was the wrong choice?",
        "If every possible observation would leave your choice standing, you're picking for access.",
      ],
    ],
  },
  process: {
    empty: [
      /* M85, ISC-713: the headline's framing, the period and the phenomenon; forward at M92. */
      "What period of time will you study, and which phenomenon do you plan to track through that period?",
      "You need a period, and a phenomenon that changes across the period, or you have only a topic.",
    ],
    thin: [
      "Where does the process start, and how would you know the process had finished?",
      "Without a beginning and an end, you can't tell one run of the process from part of several runs.",
    ],
    stated: [
      [
        "Who is carrying out the process, and could they describe the process in your words?",
        "Name the process in words the people in it wouldn't use and you have something to defend.",
      ],
      [
        "What do you expect this process to look like when it goes wrong?",
        "You usually see the mechanism most clearly when it breaks.",
      ],
    ],
  },
  outcome: {
    empty: [
      "Does this project need an outcome at all, or would an outcome be the wrong shape for this project?",
      "You may not need an outcome at all. Force one in and the design changes shape without you deciding.",
    ],
    thin: [
      "Who will decide whether that outcome has happened, and by what evidence?",
      "If the people in your setting can't settle the outcome, you can't observe the outcome either.",
    ],
    stated: [
      [
        "Is the outcome that you identified one that you will observe, or one that someone will tell you about afterwards?",
        "You get a tidier story from anyone who already knows how the case ended.",
      ],
      [
        "What would a case look like that had the process but not the outcome?",
        "If you can't picture such a case, you may have built the outcome into how you defined the process.",
      ],
    ],
  },
  /*
   * One probe set where there were two (D3).
   *
   * The challenge and tension stations merged into `bind`, so their two sets
   * merge with them. What is kept from each is the probe the other could not
   * ask: the tension set's opening, because the station is asked as something
   * observed rather than read, and the challenge set's follow-ups about who
   * the difficulty falls on and what they have already tried, because that is
   * where the constraint lives. Nothing here is new copy.
   *
   * M92 (Matthew, 2026-10-15): every probe faces forward. The opening asks
   * which tension they expect, and "seen in the field" became the place in the
   * field where they will look; the attempts that "have already failed" became
   * the attempts that they will look for.
   */
  /* M58, ISC-567. The puzzle step, asked the way the other seven are. */
  puzzle: {
    empty: [
      "What do the papers that you know lead you to expect in this setting, and what do you expect to find there instead?",
      "Start from the place where your own expectation and the papers' expectation part ways.",
    ],
    thin: [
      "What would your project have to show for you to answer this puzzle?",
      "A puzzle that you can study names the surprise and the current accounts that it unsettles.",
    ],
    stated: [
      [
        "Who in the setting would find this puzzle strange, and who would find it ordinary?",
        "Your setting may not show a puzzle that only the papers find strange.",
      ],
      [
        "Which explanation would you reach for first, and what would you need to see to rule that explanation out?",
        "You can test the first explanation in the field before you look for a second one.",
      ],
      [
        "Which of your saved answers does this puzzle rest on?",
        "Your puzzle is only as firm as the context, process and outcome answers underneath it.",
      ],
    ],
  },
  bind: {
    empty: [
      "What tension do you expect the people in your setting to face?",
      "Name the place in the field where you'll look for this tension. A tension from papers alone is an expectation.",
    ],
    thin: [
      "Who do you expect to feel this tension, and what do you expect them to do when it bites?",
      "If the people in your setting don't feel the tension, you're describing a trade-off.",
    ],
    stated: [
      [
        "What do you expect the people caught in this tension to try, and where will you look for the attempts that fail?",
        "You learn most about the constraint from the attempts that fail.",
      ],
      [
        "Do you expect this tension to be hard for everyone in the setting, or hard for only some of them?",
        "You usually get more from the people the bind falls on hardest.",
      ],
      [
        "What would the setting look like once someone resolved this tension, and where will you look for anyone who manages to resolve it?",
        "You see Abductive record whether the bind stands or resolves. Assume the bind is permanent and you've decided too early.",
      ],
      [
        "Where in the field do you plan to look for this tension, and what would you need to see there to count it as evidence?",
        "Record the tension now as an expectation. The tension counts as evidence once you see it in the field.",
      ],
    ],
  },
  /* M92, ISC-744 (Matthew, 2026-10-15): the sample's constants as well as its
   * variation, in every register, following the owner's three parts: the
   * comparisons, the variation that they need and the constants. The empty probe is also the thin register's
   * second probe, so both registers before a full answer ask about the
   * constants, and the first two stated probes ask after one. */
  sample: {
    empty: [
      "Which comparison do you most want your sample to let you explore, and what would you hold constant across the sample?",
      "Name the constants and the variation, or a sceptic can blame any difference on something that you let vary.",
    ],
    thin: [
      "Who is in this setting that you are not planning to speak to?",
      "You'll find the counter-evidence among the people who you left out.",
    ],
    stated: [
      [
        "What will the cases or people in your sample share by design, and why those things?",
        "The constants let you set a difference in the outcome against the variation that you chose.",
      ],
      [
        "What would a case that broke one of those constants do to your comparison?",
        "You may meet a case that breaks a constant partway through fieldwork, so plan for one.",
      ],
      [
        "Whom would you have to talk to for a sceptic to believe you?",
        "Answer from the sceptic's side and you get a sample that you can defend.",
      ],
      [
        "What would make you add someone to this sample partway through?",
        "Fix the sample in advance and the sample can't be theoretical, whatever you call it.",
      ],
      [
        "You say you will stop at saturation. Saturation on which difference?",
        "Saturate on the difference that you expected and you have only confirmed it.",
      ],
    ],
  },
  "early-data": {
    empty: [
      "What is the first piece of material you will open, and what do you expect it to say?",
      "Write the expectation down first, or the material can't surprise you.",
    ],
    thin: [
      "Which part of this material haven't you opened yet, and what will you look for when you open it?",
      "Only the data that you go through can disconfirm a claim.",
    ],
    stated: [
      [
        "Which passage fits your ontology worst, and what will you look for next because of that passage?",
        "You usually open the worst-fitting passage last, and it's worth the most.",
      ],
      [
        "What in this material has changed your mind, and what does that change make you want to explore next?",
        "If every passage in the data confirmed your view, you haven't gone through it closely yet.",
      ],
    ],
  },
};

/**
 * Probes for one station, chosen by how much is written there.
 *
 * `turnIndex` rotates the `stated` probes so returning to a station twice does
 * not put the same question twice, which reads as the loop not listening.
 */
export function stationProbes(
  station: StationId,
  brief: ProjectBrief,
  chunkCount: number,
  turnIndex = 0,
  /**
   * Distinct passages the researcher has opened, from the human attention layer.
   *
   * Defaulted to zero rather than required, because every caller that does not
   * have the ledger to hand is a test or a preview and the honest reading there
   * is that nothing has been read. A study with material and nothing opened is
   * exactly the state the thin probe is for.
   */
  passagesOpened = 0,
): readonly StationProbe[] {
  const set = PROBES[station];
  const field = stationField(station);
  const typed = field === null ? "" : stationValue(brief, station);
  /* A step whose box is empty reads the corpus instead, and reads it in two
   * places rather than one (M29, R9). Material loaded and barely opened is
   * thin: the researcher has the data and has not been through it, which is the
   * one state the old derivation could not express and the most common state a
   * study is actually in when it reaches this step.
   *
   * Early data had no box at all until D5 and this was the whole of its
   * reading. Now that it has one, what the researcher wrote there outranks the
   * corpus: a sentence saying what the material showed them is a direct answer
   * to the step's question, and pressing on the corpus while ignoring it is the
   * loop not listening. The corpus reading stays for the step in the state it
   * is usually in, which is uploaded and not yet written about. */
  const written =
    typed.trim() !== ""
      ? typed
      : readsCorpus(station)
        ? chunkCount === 0
          ? ""
          : "x".repeat(passagesOpened < PASSAGES_READ ? THIN - 1 : THIN + 1)
        : typed;
  const length = written.trim().length;

  const pick: readonly (readonly [string, string])[] =
    length === 0 ? [set.empty] : length < THIN ? [set.thin, set.empty] : rotate(set.stated, turnIndex);

  return pick.map(([question, rationale]) => ({ station, question, rationale }));
}

/**
 * Which stations read the material when their box is empty.
 *
 * Early data, and any station that has no box at all. Written as a question
 * about the station rather than as `field === null`, because those were the
 * same test until D5 gave Early data a field and are not the same test any
 * more: the corpus is still half of what that step holds.
 */
function readsCorpus(station: StationId): boolean {
  return station === "early-data" || stationField(station) === null;
}

function rotate<T>(items: readonly T[], by: number): readonly T[] {
  if (items.length === 0) return items;
  const n = ((by % items.length) + items.length) % items.length;
  return [...items.slice(n), ...items.slice(0, n)];
}

/** Every probe in the table, for the content tests. */
export function allProbes(): readonly StationProbe[] {
  return STATIONS.flatMap((s) => {
    const set = PROBES[s.id];
    return [set.empty, set.thin, ...set.stated].map(([question, rationale]) => ({
      station: s.id,
      question,
      rationale,
    }));
  });
}

export function stationLabel(station: StationId): string {
  return stationById(station).label;
}

/**
 * The Starting point's three questions, as the probes its conversation puts
 * (M62, ISC-599).
 *
 * The framing is not a station, so it has no row in the table above, and until
 * M62 its conversation had one question to put, the interest's. It now asks
 * about each part in turn, and the question it puts for a part is the one the
 * page prints over that part's field, written once here so the page and the
 * conversation cannot ask different questions. `flow/FramingBand.tsx` reads them
 * as `FRAMING_QUESTION`; the framing turn's instructions quote the one it is to
 * ask next.
 */
export const FRAMING_PAGE_QUESTION = {
  /* M62, ISC-602: the owner's wording, 2026-09-30. */
  startingInterest: "What is drawing you to this particular research inquiry?",
  /* ISC-588: the owner's wording, 2026-09-30. */
  seminalCorpus: "Which literatures might be relevant to your exploration?",
  targetVenue: "Where do you want this project to land?",
} as const;

/**
 * The chat's opening turn at Starting point (M92, ISC-747): which three
 * starting points Abductive asks about, then the interest question in its
 * forward form. A project whose History already has an opener keeps it; this
 * bubble is drawn from the page, so every project shows the new one.
 */
export const FRAMING_OPENING_LEAD =
  "Abductive will ask about your three starting points in turn: your interest, the literatures and the target journal.";

/**
 * The questions the conversation puts, in the owner's words (his amendment to
 * M62, 2026-09-30). The interest's is the page's; the later two are left open,
 * so that "not yet" is an answer, and a reply that says so marks the part
 * covered but open (`framingCoverage`), which Summarise leaves as a gap.
 */
export const FRAMING_PROBES = {
  /* M92, ISC-747 (Matthew, 2026-10-15: the chat and the Interest box asked the
   * same question word for word). The box keeps the page's question as its
   * label; the chat asks the same thing facing forward. */
  startingInterest: "What do you want your research to explore, and what draws you to that inquiry?",
  seminalCorpus:
    "Have you thought about which literatures might be relevant to your exploration, or is that still up in the air?",
  targetVenue:
    "Have you thought about where you want this project to land, in terms of particular journals, or are you still working that out?",
} as const;

/** The whole opening bubble: the lead, then the interest question (M92, ISC-747). */
export const FRAMING_OPENING = `${FRAMING_OPENING_LEAD} ${FRAMING_PROBES.startingInterest}`;
