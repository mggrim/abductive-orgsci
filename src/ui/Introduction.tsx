/**
 * The introduction (ISC-95 … ISC-106).
 *
 * Two constraints shaped this more than taste did.
 *
 * First, it must teach. A landing page that says how good the tool is and not
 * what to do with it is worse than the bare project list it replaces, because
 * it costs a scroll before the researcher reaches the same dead end. So the
 * spine of the page is: what this is → what goes wrong early and what the tool
 * does about it → the steps → what it refuses to do → start.
 *
 * D8 (M27): the second block used to be "How it runs", four cards about the
 * tool's own mechanics: it asks one question, you answer, your ontology
 * changes, everything is a projection of one record. All true, and all about
 * the machine rather than about the reader. What a first-year needs on a
 * landing page is the list of things that go wrong in the first six months of a
 * qualitative study, with what this tool does about each. The nine below are
 * that list, in the order a researcher meets them.
 *
 * Second, it must not fetch anything (ISC-104, ISC-105, ISC-106). The claim
 * the OrgSci submission rests on is that no research data leaves the machine;
 * a page that pulls a webfont from a CDN puts a request in the network log of
 * every session and makes that claim tedious to defend. Every mark here is
 * inline SVG, every colour a gradient, every glyph a system font.
 *
 * The hero draws a small ontology rather than an abstract shape, and colours
 * its nodes by attribution — because "you can always see which parts came from
 * you, which from the data, and which the model proposed" is the thing the
 * tool is actually for, and showing it beats asserting it.
 */

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { emptyBrief, listProjects, saveProject, type Project } from "../state/projects.ts";
import { navigate, studyPath } from "./routes.ts";
import { BringInStudy } from "./BringInStudy.tsx";
import { useLedger } from "../state/ledgerContext.tsx";
import { STATIONS, stationById, type StationId } from "../flow/stations.ts";
import { FRAMEWORK_NAME, StationLoop, TWO_LOOPS_LEDE, stepKicker } from "../flow/StationLoop.tsx";
import { Disclosure, InertNote, OriginDisc, OriginMark, inertAttrs } from "./components/index.ts";
import { ORIGIN_ORDER, originLabel } from "./originVocabulary.ts";
import { MAIN_LANDMARK_ID } from "./landmarks.ts";
import {
  OBSTACLE_ICONS,
  STEP_ICONS,
  type ObstacleId,
} from "./icons/FrontIcons.tsx";

/**
 * A front-page image, and what happens when there is not one (M32, R13).
 *
 * Six slots, no more: a hero backdrop, two section banners and one square
 * inside each commitment card. "Where your data lives" gets none, because a
 * claim about locality illustrated with stock art reads as marketing and
 * undercuts itself. (The fit diagram got none either, for being a diagram; it
 * left the page at M88.)
 *
 * The rule that matters more than any of that: the page renders correctly when
 * a file is absent. `onError` unmounts the element, so a missing file is a
 * section with no image rather than a broken-image glyph, and the six are
 * genuinely optional. A build that ships without `public/intro/` is a build
 * that looks plainer, not a build that looks broken.
 *
 * On the file header's second constraint, that this page fetches nothing. What
 * that protects is the claim that no research data leaves the machine and that
 * no third party sees a request: it is why every mark here is inline SVG and
 * why there is no webfont. These are same-origin static files served out of the
 * app's own bundle, so nothing leaves and no third party is involved. The
 * inline-SVG rule still holds for every mark that carries meaning.
 *
 * `alt=""` with `aria-hidden` on all six, because every one of them is
 * decoration: each sits beside a heading and a paragraph that already say what
 * the section is, and none of them carries information the prose does not.
 * The walkthrough's four output photos (M68) are the exception and pass `alt`:
 * each shows the thing its label names, so a reader who cannot see it is told
 * what it shows.
 */
export function IntroImage(props: {
  /** Under `public/`, so it resolves same-origin at the app's own root. */
  src: string;
  /** The wrapper's class. The image fills it with `object-fit: cover`. */
  className: string;
  /** The hero alone: a dark wash over the left of the frame, so white type
   * stays legible over whatever the photograph is doing there. */
  scrim?: boolean;
  /** M68, ISC-638: a photo that depicts its item rather than decorating a
   * section (the four outputs on the walkthrough's third screen) carries a
   * one-sentence description. Absent, the photo is decoration as above. */
  alt?: string;
  testId: string;
}) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    <div className={props.className} data-testid={props.testId}>
      {props.alt === undefined ? (
        <img src={props.src} alt="" aria-hidden="true" onError={() => setMissing(true)} />
      ) : (
        <img src={props.src} alt={props.alt} onError={() => setMissing(true)} />
      )}
      {props.scrim === true && <span className="intro-scrim" aria-hidden="true" />}
    </div>
  );
}
/* The resume block reads the same derivation the studies table does rather
 * than a second, lighter estimate of it. Two screens disagreeing about how many
 * pages are staged in a study is the defect class this whole wave is about. */
import { byMostRecent, studyState, type StudyState } from "./ProjectList.tsx";
import { countOf, formatDay } from "./format.ts";

/**
 * One study's state in one line, for the hero.
 *
 * The station gauge is not here and the corpus is not read: the four facts this
 * line carries are all corpus-independent, so the hero does not have to open
 * IndexedDB once per study to draw a landing page.
 */
/*
 * Two of these four clauses used words this line had to itself. "a question
 * waiting" is "There is a question on the table" on the Design banner and
 * "Question on the table" on the /studies row, and "N staged" is the /studies
 * column and nothing else: the Ontology tab heads that population "Waiting to
 * go into your model". The hero is the first surface a returning researcher
 * reads and the study it links to is the second, so the two of them saying the
 * same fact in different words is the seam that costs most. Both now say what
 * the surface they link to says.
 */
export function resumeLine(row: StudyState): string {
  const parts: string[] = [];
  if (row.questionOnTable) parts.push("an open question");
  // The suggestions and the statements, in that order, are the /studies table's
  // Suggestions and Statements columns for this same row (M73: "claims" until
  // the column was named for what it counts). Reading the hero line and then the
  // table should be reading one thing twice, not two things once each.
  if (row.staged > 0) parts.push(`${row.staged} suggestion${row.staged === 1 ? "" : "s"} to review`);
  parts.push(countOf(row.statements, "statement"));
  parts.push(`last changed ${formatDay(row.touchedAt)}`);
  return parts.join(" · ");
}

/**
 * What Create study is waiting to read. Null once it is live, which is what
 * makes the button attribute and the sentence beneath it one decision rather
 * than two.
 *
 * The button said "Start" until the coherence walk read the two entry routes in
 * the order a first-time researcher meets them. This form and the one in the
 * /studies aside are the same form: same act, same object, same visually
 * identical field under the same label "Name your study", and the same inert
 * grammar "X goes live once the study has a name". Only the verb differed, and
 * "Start" is the one that names nothing. Every other primary in the app names
 * its object: Add material, Download, Choose a folder, Compare against it
 * early.
 */
function startReason(title: string): string | null {
  return title.trim() === "" ? "Name the project first." : null;
}

/**
 * The nine obstacles, in the order a researcher meets them (D8, M27).
 *
 * The methods critique owns which nine obstacles these are and what each one
 * claims. It does not own the grammar, and that split was made explicitly in
 * round 3 after two of its headings failed the copy bar: one led on a
 * nominalisation with no reader in it, and one was a get-passive running three
 * clauses. Both were rewritten with the claim preserved exactly, and the same
 * rule governs anything added here. A heading whose claim changes is the
 * methods critic's to make; a heading that says the same thing in the reader's
 * grammar is not.
 *
 * The bodies were rewritten at M28 on the same principle: a body over the
 * sentence ceiling, a body whose subject was the tool where it could have been
 * the reader, or a body closing on an epigram. Nothing was added and nothing
 * was dropped.
 */
/* M34: `id` keys the card's glyph in src/ui/icons/FrontIcons.tsx. Typed as
 * ObstacleId rather than string, so a tenth obstacle without a glyph is a
 * compile error rather than a card with a hole where the other nine have one. */
/**
 * The sentences the long page and the walkthrough both render (M49, ISC-527).
 *
 * The walkthrough is four screens cut from this page, and the brief's rule for
 * it is that nothing new is claimed: a screen carries the sentence the long page
 * already carried, or it carries nothing. A second copy of a sentence is how the
 * two surfaces come apart, so every string either of them shares is declared
 * once here and read twice.
 */
export const PRODUCT_LINE =
  "A tool that helps you scaffold your early-stage qualitative research.";

/* M61 follow-up, ISC-586: the owner's paragraph, word for word (Matthew,
 * 2026-09-30). It stands over the label rules and the actor rule, so its one
 * "The tool" is admitted by name in `RETIRED_ALLOW` (tests/copyBarScan.ts). */
export const PURPOSE_LINE =
  "Abductive helps you design a qualitative project before you collect the data. The tool asks the questions that a careful colleague would ask, one at a time. Your answers then build a model of what you're studying, and Abductive keeps track of those changes.";

/* M84, ISC-702 (a co-author, 2026-10-07): Abductive helps you answer the nine
 * and doesn't answer them. M86, ISC-717 (Matthew, 2026-10-14): the owner's own
 * sentence, with its "is designed to" (an agentless passive, L18) dropped. */
export const OBSTACLES_HEADING =
  "Abductive helps you answer nine early, critical questions about your research.";

/* M85, ISC-709 (a co-author, 2026-10-13; Matthew, 2026-10-14): the kicker
 * over each help. ISC-596 had named it "Abductive's help" under L13; the owner
 * ruled for the co-author's wording, and docs/copy-standard.md records the exception
 * under L13. */
export const HELP_LABEL = "How Abductive might help";

/* M84, ISC-702 and ISC-703: the co-author's lede, with "ensure" (banned) replaced by
 * what the questions do, and the stage said (before data). */
export const OBSTACLES_LEDE =
  "These nine questions prepare you to identify a novel phenomenon and to make a theoretical contribution, before you collect anything.";

/* M58, ISC-567: the owner's lede for "The two loops", the same sentence the
 * rail prints beside the rings on Design. */
export const STEPS_LEDE = TWO_LOOPS_LEDE;

/** The section's title on the front page and on walkthrough screen 2 (M58; M83, ISC-698: the framework's name). */
export const STEPS_HEADING = `The ${FRAMEWORK_NAME}`;

/* ISC-595 (owner, 2026-09-30): the section is stated in the affirmative, and so
 * is each card's title. The owner's "How Abductive keeps research governance"
 * became this under his own L13 (the lead's ruling, 2026-09-30). */
export const COMMITMENTS_HEADING = "Research governance in Abductive";

export const DATA_LIVES_HEADING = "Privacy";

/**
 * The terms Abductive keeps because no research tool has a word for them (M61,
 * the survey's Part 3). One line each, in the order they build on each other,
 * with the words a reader may already use for something near them, the way
 * NVivo's glossary carries an "Also known as" column.
 */
export const TERMS: readonly { readonly term: string; readonly meaning: string; readonly aka: string }[] = [
  { term: "Expectation", meaning: "What a paper leads readers to expect.", aka: "prediction, prior finding" },
  /* M92, ISC-751: the owner's definition, 2026-10-15. */
  { term: "Puzzle", meaning: "The surprise: what you see, or expect to see, that current accounts can't explain.", aka: "research question, anomaly" },
  { term: "Claim", meaning: "A statement in your ontology.", aka: "proposition" },
  { term: "Bind", meaning: "A tension between two demands that people in your setting feel.", aka: "dilemma" },
  { term: "Origin mark", meaning: "The mark on a claim that names its source.", aka: "AI-generated label" },
  /* M89: "Flag" (something a check raised for you to review) went with the checks. */
];

export const DATA_LIVES_BODY =
  "Your sources stay in this browser, and only this browser keeps a copy. Calls to the model go out through your own subscription, your own API key or a model on your own machine. Everything else stays on the machine.";

/**
 * The three groups the nine fall into, in a co-author's terms and order (M83,
 * ISC-697, their second review of 2026-10-05): "Questions related to the
 * theoretical starting point / Questions related to data collection /
 * Questions related to data analysis". Every card names its group, so a group
 * label is in view on whichever page of a pager the reader is on.
 */
export type ObstacleGroupId = "theory" | "collection" | "analysis";
export const OBSTACLE_GROUPS: readonly { readonly id: ObstacleGroupId; readonly heading: string }[] = [
  { id: "theory", heading: "Questions about the theoretical starting point" },
  { id: "collection", heading: "Questions about data collection" },
  { id: "analysis", heading: "Questions about data analysis" },
];

/* M83, ISC-697. Each title is the co-author's question, reworded only where the copy
 * rules ask (L18: "Can your question be answered by your data?" became "Can
 * your data answer your question?"; the two-part questions became one question
 * each). Each help says what Abductive asks or does, with no assumption that
 * the reader has the fault, and keeps its claim. The code behind each claim:
 *
 *   topic-not-puzzle       the Puzzle step's question (flow/stations.ts)
 *   no-conversation        Starting point's literatures and journal; papers
 *                          read for their conversation (proposals/paperFit.ts)
 *   site-of-convenience    the Site step and its probes, access among them
 *                          (interview/stationProbes.ts)
 *   question-out-of-reach  the data-reach check (lint/coherence.ts)
 *   convenient-sample      the Sample step and the variation check
 *                          (lint/coherence.ts)
 *   thin-evidence          the venue check, "what that venue's reviewers
 *                          expect" (lint/coherence.ts)
 *   native-explanation     the bias grid's native-explanation cells
 *                          (matrix/matrix.ts)
 *   early-closure          monotonic-residue-shrink and the retired rival
 *                          (lint/structural.ts)
 *   lost-provenance        the origin mark (proposals/adjudicate.ts) */
export const OBSTACLES: readonly { id: ObstacleId; group: ObstacleGroupId; title: string; body: string }[] = [
  {
    id: "topic-not-puzzle",
    group: "theory",
    title: "Have you identified a puzzle or a topic?",
    /* M84, ISC-702: before data there is no finding; the co-author's topic and puzzle, glossed. */
    body: "Abductive inquires into your expectations and observations, and helps you decipher a topic (a broad interest) from a puzzle (what you see, or expect to see, that current accounts can't explain).",
  },
  {
    id: "no-conversation",
    group: "theory",
    title: "Which conversation are you joining?",
    /* M84, ISC-702: the questions come from the literature that you named
     * (interview/challenges.ts, the bias scan reading your papers), and paper
     * fit writes each paper's expectations (proposals/paperFit.ts). */
    body: "Abductive asks you questions drawn from the literature that you identified, so that you can see the contribution that your project might make to that stream of research. Abductive reads each paper that you have flagged, to help you consider its expectations for your setting.",
  },
  {
    id: "site-of-convenience",
    group: "collection",
    title: "What drew you to this site over another?",
    body: "Abductive asks for your reason for choosing this particular site, and asks you to consider the things that the site might be less suited to reveal. Abductive also asks you to consider questions related to access.",
  },
  {
    id: "question-out-of-reach",
    group: "collection",
    title: "Can your data answer your question?",
    body: "Abductive asks you to consider whether your particular data collection plans and timing match your theoretical ambition. For example, a dozen interviews won't show you a field's change over time.",
  },
  {
    id: "convenient-sample",
    group: "collection",
    title: "Is your sample a theoretical or a convenience sample?",
    body: "Abductive asks you to identify the variation that you need for your comparison, and checks that variation against the cases that you chose.",
  },
  {
    id: "thin-evidence",
    group: "collection",
    title: "Does your data live up to the expectations of the journal that you're aiming at?",
    body: "Abductive asks for the journal that you're targeting and weighs that against the journal's reviewers' expectations for evidence.",
  },
  {
    id: "native-explanation",
    group: "analysis",
    /* M84, ISC-702: the co-author's affirmative form; the id and the icon stay. */
    title: "Are you moving beyond your informants' statements when you explain the puzzle?",
    body: "Abductive pushes you on your initial interpretations of early-stage data.",
  },
  {
    id: "early-closure",
    group: "analysis",
    title: "Are you reading your data with an open mind, or through the ideas that you already have?",
    body: "Abductive keeps a running list of the parts of your data that seem to contrast with the early concepts and relationships that you are proposing.",
  },
  {
    id: "lost-provenance",
    group: "analysis",
    title: "Do you know where each of your ideas came from?",
    body: "Abductive labels the origin of each of your early-stage ideas, concepts and relationships (you, your early data or the AI).",
  },
];

/**
 * A small count, spelled. D8 (M27).
 *
 * The station count is read off STATIONS rather than typed, because it has been
 * wrong on this page before: the heading said eight while the rail rendered a
 * different number, and a landing page that teaches the wrong map costs the
 * reader the first minute of every session. Spelled rather than a numeral
 * because it sits inside a heading and a sentence, and falls back to the
 * numeral above twelve, which this array will never reach.
 */
const SPELLED: readonly string[] = [
  "no", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
];
export function spelled(n: number): string {
  return SPELLED[n] ?? String(n);
}

/**
 * Which tab holds the steps, said after the two loops' lede (M58). D8 keeps
 * this half of the map on the page, and the count is read off STATIONS. Below
 * `spelled` because SPELLED must exist before this is evaluated.
 */
export const STEPS_WHERE = `You answer all ${spelled(STATIONS.length)} steps on the Design tab.`;

/*
 * The three refusals, in the reader's own terms (M28), with the reasoning (R5).
 *
 * The headings were the tool's categories: "Attribution is permanent" led on a
 * banned nominalisation, and all three named a property of the machine under a
 * heading promising a thing it will not do to you. They say what it will not do
 * now, and the bodies open on what the reader gets. The copy is the copy
 * critic's paste-ready sample, section 4c.
 *
 * R5, the owner's first point: "The Three things the tool will not do for you section
 * should explain the logic underlying each approach." So each card carries a
 * `why` as well. The copy bar's C5 bans design rationale in UI copy, and the
 * owner has overridden it for this section and this section only: a reader who
 * is being told what a tool refuses to do is owed the reason, and these three
 * refusals are the product's methodological argument rather than build notes.
 * C1, C2 and C7 still hold, so the Why paragraphs are second person, active,
 * under the sentence ceiling and do not close on an epigram.
 *
 * The source notes below each card are the methods critic's, kept here rather
 * than on screen so the owner can check the reasoning against the literature
 * and against the code without a reader meeting a citation on a landing page.
 */
export const COMMITMENTS: readonly { title: string; body: string; why: string }[] = [
  /*
   * Source note (not UI copy). Timmermans and Tavory's account of abduction
   * turns on genuine surprise doing the theoretical work; their concern is that
   * a researcher's prior frame can consume an anomaly and leave the frame
   * intact. Grodal and Schildt on LLM-assisted qualitative work is why the model
   * counts as a third party here rather than as a tool. The decision that
   * editing a draft does not relabel it is argued in
   * `src/proposals/adjudicate.ts:150-170`, and it is the shipped rule.
   */
  {
    title: "Abductive logs authorship for each recorded claim",
    // The round-5 draft read "is marked as yours", which is the agentless
    // passive the copy critic replaced in round 2 and which the round-5 brief
    // keeps banned (C2 stands for this section). Same claim, active, and it is
    // the sentence the copy bar already passed.
    body: "Every claim carries a mark saying whether you, your data or the model wrote it, and the mark is permanent.",
    why: "Working this way lets surprising data reshape what you think. The failure runs the other way, with your existing ideas absorbing the data instead, without you noticing. Months later, writing up, the two directions feel identical from the inside. Marking each claim as soon as you decide lets you tell the two apart.",
  },
  /*
   * Source note (not UI copy). Locke, Golden-Biddle and Feldman on making doubt
   * generative: staying in not-yet-knowing is productive rather than a lapse.
   * The three-refusal rule is already in the product ("Pass on one topic three
   * times and it stops raising that topic"), and `matrix.ts` fires
   * `identity-attachment:interview` on a `refusal-streak`, so the pattern is
   * read rather than merely stored.
   */
  {
    // The owner's "on the record" yields to his own L12 (the record is History).
    // M69, ISC-642: "Not now" and "Set step aside" went, so the card names the two replies that remain.
    title: "Abductive keeps your choices in History",
    body: "Say you don't know or change the subject, and Abductive keeps both in History as your choices.",
    why: "If you can't answer a question yet, a good answer is still to come. If you have to fill the box, you invent an answer and then defend it for years. The questions that you leave open are evidence about the design too. A topic that you pass on three times tells you something worth reading.",
  },
  /* M89 (2026-10-14): the third card, on keeping contradictions in view (Abductive
   * pointed to a mismatch and left it standing), described the checks and went
   * with them. */
];

/**
 * The two long lists, as sliders (M34).
 *
 * M88 (the owner, 2026-10-14: "remove how the parts fit together section"):
 * the seven moves and their vertical slider left the front page, so the nine
 * are the one slider here. The track reader below keeps its axis parameter;
 * the "y" branch is what the moves' slider read.
 *
 * The owner: "What goes wrong early should probably be a slider. Same with how
 * to use the tool." Both lists had grown past the length a landing page can
 * spend on one block: nine obstacle cards in an auto-fit grid ran three rows
 * deep, and seven moves ran seven rows down, so a reader who wanted the steps
 * scrolled past sixteen cards to reach them.
 *
 * What a slider must not cost, and what each of these does about it:
 *
 *   The list. It is still an `ol` of `li`, so a screen reader still hears "list,
 *   nine items" and can walk it. Nothing here is a `div` wearing a role.
 *
 *   The keyboard. Every card takes a tab stop, and the browser scrolls a
 *   focused card into view on its own once the track is the scroll port, so a
 *   keyboard reader reaches all nine without touching the buttons. The buttons
 *   are for the pointer, not the only way through.
 *
 *   Where you are. The count is announced rather than drawn, because a row of
 *   dots is a second control that does not control anything. One polite live
 *   region says "4 of 9" when the track moves.
 *
 *   Motion nobody asked for. There is no autoplay and no timer. `scroll-behavior`
 *   is in the sheet and it is switched off under prefers-reduced-motion.
 *
 * The ends, and why neither arrow is ever drawn inert (owner's ruling, M34).
 * The app's inert primitive marks a control that is waiting on a condition and
 * owes the reader a sentence naming it. An arrow at the end of a track is not
 * that: nothing is pending, the control is live, and pressing it scrolls
 * nothing because there is nothing further that way. Drawing it inert would be
 * asserting a condition that does not exist, and the sentence under it would be
 * explaining a wait that is not happening. Where you are is the position line's
 * job, and it is already saying it on every move.
 */

/**
 * Reading a track, on either axis (M34, round four).
 *
 * Both sliders on this page do the same four things to a scroll port: measure
 * where its cards sit, say which one is showing, find the next snap point along
 * and go to it. They differ in the axis and in nothing else, so the axis is a
 * parameter here and the two components stay separate for the things that
 * genuinely differ: the vertical one holds a reference to every card so the
 * drawing beside it can move the focus, and the horizontal one does not.
 *
 * ── Why nothing reads a scroll offset back after writing one ──────────────
 *
 * The defect the design critic returned in round four, and it was certain from
 * the source. `move()` assigned `scrollLeft` and then read the position back on
 * the next line, while the sheet sets `scroll-behavior: smooth` on the track.
 * A smooth scroll has not happened yet on the next line, so every press wrote
 * the PRE-press position into state: the live region announced "1 of 9" on the
 * seventh press of Next, and the end guards were reading the same stale value.
 *
 * The rule that replaces it: a write and a read are never in the same act. A
 * press writes an offset and returns. `onScroll` is the only thing that reads
 * one, and it fires as the animation runs and again when it lands, so the count
 * and the guards are whatever the track is actually showing.
 *
 * `scrollLeft = x` rather than `scrollTo({ behavior: "smooth" })`, and that is
 * deliberate: `scroll-behavior` in the sheet animates a property assignment
 * exactly as it animates `scrollTo`, so the sheet keeps the one say over motion
 * and honours `prefers-reduced-motion` in one place, and a DOM with no layout
 * still records the write.
 */
type Axis = "x" | "y";

/**
 * A card and a gap, for a track the browser has not laid out.
 *
 * Both are the sheet's own numbers: 320px and --space-lg across, and a nominal
 * move card and the same gap down. They are only ever reached in a DOM with no
 * layout, where every card reports the same rectangle.
 */
const CARD_FALLBACK: Readonly<Record<Axis, number>> = { x: 336, y: 216 };

const scrollOf = (track: HTMLElement, axis: Axis): number =>
  axis === "x" ? track.scrollLeft : track.scrollTop;

/**
 * Where each card sits inside the track, in pixels from its leading edge.
 *
 * Measured rather than multiplied out from a step, because a card's size is its
 * own copy on the vertical track: the seven moves differ by forty pixels or so
 * and a constant would leave the fourth press half a heading off. The
 * distinctness of the measurements is what says whether they can be trusted, so
 * a DOM that reports one rectangle for every card falls back rather than
 * returning seven zeroes.
 */
function trackOffsets(track: HTMLElement, axis: Axis): readonly number[] {
  const cards = [...track.querySelectorAll<HTMLElement>("[data-slide]")];
  const edge = axis === "x" ? track.getBoundingClientRect().left : track.getBoundingClientRect().top;
  const here = scrollOf(track, axis);
  const measured = cards.map((card) => {
    const box = card.getBoundingClientRect();
    return (axis === "x" ? box.left : box.top) - edge + here;
  });
  return new Set(measured).size > 1
    ? measured
    : cards.map((_, i) => i * (CARD_FALLBACK[axis] ?? 0));
}

interface SlidePosition {
  readonly index: number;
  readonly atStart: boolean;
  readonly atEnd: boolean;
}

/**
 * Which card is showing, and whether the track has anywhere left to go.
 *
 * The last card cannot always be brought to the leading edge, because the track
 * stops at its own end, so the index is read off the offsets and then overridden
 * there: standing at the end of a track IS standing at the last card, whatever
 * the arithmetic says about which edge is nearest.
 *
 * `atEnd` is false whenever the browser has not laid the track out. A track
 * with no measurable size has no end to be at, and saying otherwise would put
 * the count at the last card on a slider nobody has seen.
 */
function trackPosition(track: HTMLElement, axis: Axis, count: number): SlidePosition {
  const offsets = trackOffsets(track, axis);
  const here = scrollOf(track, axis);
  const size = axis === "x" ? track.scrollWidth : track.scrollHeight;
  const port = axis === "x" ? track.clientWidth : track.clientHeight;
  const laidOut = size > 0;
  const atEnd = laidOut && here >= Math.max(0, size - port) - 1;
  let index = 0;
  offsets.forEach((offset, i) => {
    if (offset <= here + 1) index = i;
  });
  return {
    index: Math.min(atEnd ? count - 1 : index, count - 1),
    atStart: here <= 1,
    atEnd,
  };
}

/**
 * The next snap point past where the track is, in the direction asked for.
 *
 * Read off the live offset rather than off the announced index, so a press
 * during an animation still advances relative to where the track has got to. It
 * costs one thing and the trade is deliberate: two presses inside one animation
 * advance one card rather than two, because the second reads a position the
 * first has not finished reaching. That is a press that does slightly less than
 * asked, against the alternative of holding a target in state and having it
 * disagree with the track whenever a finger or the Tab key moves it.
 */
function nextOffset(
  offsets: readonly number[],
  here: number,
  direction: -1 | 1,
): number | undefined {
  return direction === 1
    ? offsets.find((offset) => offset > here + 1)
    : [...offsets].reverse().find((offset) => offset < here - 1);
}

function IntroSlider(props: {
  /** The list's own class, so the cards keep the type they already had. */
  listClass: string;
  testId: string;
  count: number;
  children: ReactNode;
}) {
  const track = useRef<HTMLOListElement | null>(null);
  const [where, setWhere] = useState<SlidePosition>({
    index: 0,
    atStart: true,
    atEnd: false,
  });

  useEffect(() => {
    const el = track.current;
    if (el !== null) setWhere(trackPosition(el, "x", props.count));
  }, [props.count]);

  /* Writes an offset and returns. `onScroll` is the only reader, which is what
   * keeps the count off a value the smooth scroll has not reached yet. Both
   * arrows stay live at both ends, on the owner's ruling: an arrow with nowhere
   * to go is not a control waiting on a condition, and a press that finds no
   * next snap point is a press that scrolls nothing. */
  function move(direction: -1 | 1): void {
    const el = track.current;
    if (el === null) return;
    const next = nextOffset(trackOffsets(el, "x"), el.scrollLeft, direction);
    if (next === undefined) return;
    el.scrollLeft = Math.max(0, next);
  }

  return (
    <div className="intro-slider" data-testid={props.testId}>
      <ol
        className={`${props.listClass} intro-slider-track`}
        ref={track}
        data-testid={`${props.testId}-track`}
        onScroll={(e) => setWhere(trackPosition(e.currentTarget, "x", props.count))}
      >
        {props.children}
      </ol>
      <div className="intro-slider-foot">
        <div className="intro-slider-buttons">
          <button
            type="button"
            className="btn-quiet"
            data-testid={`${props.testId}-prev`}
            onClick={() => move(-1)}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn-quiet"
            data-testid={`${props.testId}-next`}
            onClick={() => move(1)}
          >
            Next
          </button>
        </div>
        <SliderCount index={where.index} count={props.count} testId={props.testId} />
      </div>
    </div>
  );
}

/**
 * Where you are in the track, said twice (M34, round four).
 *
 * The design critic: "The `aria-live` count is right and should stay; the gap
 * is that nothing on screen says where you are in nine." It was drawn nowhere
 * and the only progress signal a sighted reader had was the native scrollbar,
 * which the two tracks were rendering differently from each other. The
 * scrollbar is hidden on both now and this is what replaced it.
 *
 * Two elements rather than one, and that is the point of the shape. The drawn
 * one is `aria-hidden`, because a screen reader hearing "3 slash 9" every time
 * the track twitches is worse than the scrollbar was. The announced one is the
 * polite live region, in words, on the same number. One reader gets a glance
 * and the other gets a sentence, and both come from the same index so they
 * cannot disagree.
 */
function SliderCount(props: { index: number; count: number; testId: string }) {
  return (
    <>
      <p className="intro-slider-count" aria-hidden="true" data-testid={`${props.testId}-count`}>
        {props.index + 1} / {props.count}
      </p>
      <p className="visually-hidden" aria-live="polite" data-testid={`${props.testId}-position`}>
        {props.index + 1} of {props.count}
      </p>
    </>
  );
}

/**
 * The nine, as a slider.
 *
 * Its own component and exported, so the thing a test renders is the thing the
 * page renders. `Introduction` reads IndexedDB and sits inside the ledger
 * context, and a rendered test of a scroll track should not have to stand up
 * either to find out whether Tab reaches the ninth card.
 *
 * The card's order is the owner's: the number and the glyph, then "The problem"
 * over the heading, then "How the tool helps" over the body. Neither sentence
 * changed; what changed is that the card now says which of the two you are
 * reading before you read it.
 */
export function ObstacleSlider() {
  return (
    <IntroSlider
      listClass="obstacle-cards"
      testId="intro-obstacles-slider"
      count={OBSTACLES.length}
    >
      {OBSTACLES.map((o, i) => (
        <li key={o.title} className="obstacle-card intro-slide" data-slide tabIndex={0}>
          <ObstacleCardBody index={i} />
        </li>
      ))}
    </IntroSlider>
  );
}

/**
 * What one of the nine cards holds (M52, ISC-537).
 *
 * Extracted because the walkthrough's third screen now pages the nine rather
 * than scrolling them, and a page and a track are different boxes around the
 * same card. The `<li>` and its class stay with each surface, because that is
 * the part that differs; everything a reader looks at is here, once. A second
 * copy of these five lines is how the two surfaces would come apart, which is
 * the rule the walkthrough was built on.
 */
export function ObstacleCardBody(props: { index: number }) {
  const o = OBSTACLES[props.index];
  if (o === undefined) return null;
  /* M83, ISC-697: the group on every card, so a pager page of two or three
   * always shows which of the three groups it is in, whichever page it is. */
  const group = OBSTACLE_GROUPS.find((g) => g.id === o.group);
  return (
    <>
      <p className="intro-card-group" data-testid="obstacle-group" data-group={o.group}>
        {group?.heading}
      </p>
      <p className="intro-mark-row">
        <span className="obstacle-n">{props.index + 1}</span>
        {OBSTACLE_ICONS[o.id]}
      </p>
      {/* M85, ISC-709: the question is the heading and needs no kicker. */}
      <h3>{o.title}</h3>
      <p className="intro-card-label">{HELP_LABEL}</p>
      <p>{o.body}</p>
    </>
  );
}

/**
 * The seven steps, in the arrangement the Design tab draws them in (M34, round
 * three).
 *
 * The owner: "The seven steps on the front page should be organized in the same
 * way as the framework layout in the design tab."
 *
 * They were seven cards in an auto-fit grid, in source order, each carrying a
 * label, a blurb and a prompt. That is a list of seven things; the Design tab
 * draws a claim. The four sit as a loop because answering one changes what the
 * other three should say, and the three sit in a row under it because they
 * build on the four. A researcher who meets the seven in one shape here and a
 * different shape on the first working screen has to learn the map twice, and
 * the second one is the one that is true.
 *
 * The geometry is `StationLoop`, which the Design rail draws from too, so there
 * is one declaration of which stations are in the loop, in what order, and what
 * the two sentences beside them say.
 *
 * Three things this cell does not have, and all three for the same reason:
 * there is no study on the front page. No status mark, because nothing here has
 * a state. No legend, because a legend defines marks and there are none. No
 * link out, because a step is not a place you can go until a study exists. What
 * a cell does instead is show its own words in the panel under the rail, which
 * is where the seven card bodies went: the blurb and the prompt, verbatim, in
 * the workspace's own "Step 3 of 7 · Process" form.
 *
 * The panel is `aria-live="polite"`, because pressing a cell changes a region
 * elsewhere on the page and a reader who cannot see it happen is owed the
 * sentence. Context is shown from the start, so the panel is never an empty box
 * asking to be filled.
 */
/* M52 gave this rail a callback reporting the step under the pointer, for the
 * walkthrough's scene to light; it went with the scene (M53, ISC-542). */
export function StepRail() {
  const [shown, setShown] = useState<StationId>("context");
  const station = stationById(shown);

  return (
    <div className="steps-rail" data-testid="intro-steps-rail">
      <StationLoop
        testIdPrefix="intro-steps"
        note={false}
        cell={(s) => (
          <button
            type="button"
            className="rail-item"
            data-station={s.id}
            data-current={s.id === shown ? "true" : "false"}
            aria-current={s.id === shown ? "step" : undefined}
            onClick={() => setShown(s.id)}
          >
            <span className="rail-label">{s.label}</span>
            {STEP_ICONS[s.id]}
          </button>
        )}
      />
      <div className="steps-panel" aria-live="polite" data-testid="intro-step-panel">
        <p className="station-kicker small muted">{stepKicker(shown)}</p>
        <p className="station-blurb">{station.blurb}</p>
        <p className="steps-panel-prompt">{station.prompt}</p>
        {/* M50, ISC-532. Under the prompt, on the one step that is read as
            something else. */}
        {station.apart !== undefined && (
          <p className="small muted station-apart" data-testid="intro-step-apart">
            {station.apart}
          </p>
        )}
      </div>
    </div>
  );
}

export function Introduction(props: { onReadWalkthrough?: () => void } = {}) {
  const [projects, setProjects] = useState<readonly Project[]>([]);
  const { events } = useLedger();

  useEffect(() => {
    void listProjects().then(setProjects);
  }, []);

  const resume = projects
    .map((project) => studyState({ project, events, corpusChunkIds: [] }))
    .sort(byMostRecent)
    .slice(0, 3);

  return (
    <main className="intro" id={MAIN_LANDMARK_ID} tabIndex={-1} data-testid="introduction">
      <section className="intro-hero">
        <IntroImage
          src="/intro/hero.jpg"
          className="intro-hero-back"
          scrim
          testId="intro-image-hero"
        />
        <div className="intro-hero-copy">
          <p className="intro-eyebrow">Abductive</p>
          <h1 className="intro-title">{PRODUCT_LINE}</h1>
          {/* M28: copy. The first sentence of the product used to make a claim
              about the state of a field ("the earliest and least examined part
              of qualitative research") rather than about what the reader can
              now do, and "least examined" invited an argument from exactly the
              audience this tool has. The copy critic's paste-ready sample, 4a. */}
          <p className="intro-lede" data-testid="intro-one-liner">
            {PURPOSE_LINE}
          </p>

          <StartStudyForm />

          {/* M49, ISC-527. The walkthrough is the first thing a researcher with
              no study of their own meets, and the long page is what they get
              once they have one. The link is how they read the walkthrough a
              second time without deleting a study to see it. */}
          {props.onReadWalkthrough !== undefined && (
            <p className="intro-reread">
              <button
                type="button"
                className="linkish"
                onClick={props.onReadWalkthrough}
                data-testid="intro-reread"
              >
                Open Getting started
              </button>
            </p>
          )}

          {/* M36. The other way to be looking at a study inside a minute, for
              the reader who is not here to name one: a co-author holding a
              file. Beside Create study rather than below the fold, because they
              are done reading by the time they reach the hero's second
              paragraph. (M91, 2026-10-14: the example project beside it went at
              the owner's word.) */}
          <div className="intro-alt" data-testid="intro-alt">
            <BringInStudy />
          </div>

          {/* Continue was three bare titles on one line, in source order, which
              is creation order: the study you were in five minutes ago could be
              third or absent, and none of the three said whether anything was
              waiting in it. The same three facts the studies table carries, at
              a glance, ordered by when they were last touched. */}
          {resume.length > 0 && (
            <div className="intro-continue" data-testid="intro-continue">
              <p className="intro-continue-head small">Recent projects</p>
              <ul className="intro-resume">
                {resume.map((row) => (
                  <li key={row.project.id}>
                    <a href={studyPath(row.project.id)}>{row.project.title}</a>
                    <span className="intro-resume-state">{resumeLine(row)}</span>
                  </li>
                ))}
              </ul>
              {projects.length > resume.length && (
                <a className="small" href="#/studies">
                  All {projects.length} projects
                </a>
              )}
            </div>
          )}

        </div>

        <HeroGraph />
      </section>

      <section className="intro-obstacles" data-testid="intro-obstacles">
        <IntroImage
          src="/intro/obstacles.jpg"
          className="intro-banner"
          testId="intro-image-obstacles"
        />
        <h2>{OBSTACLES_HEADING}</h2>
        <p className="intro-section-lede">{OBSTACLES_LEDE}</p>
        {/* M34, the owner: "It should also clarify that the subtitle is the
            problem, and the following statement is how the tool helps." Both
            halves were already on the card and nothing said which was which, so
            a reader met a sentence about their own study going wrong and a
            sentence about the tool in the same ink with nothing between them.
            Two micro labels, in the register R4 added for exactly this. */}
        <ObstacleSlider />
      </section>

      <section className="intro-stations" data-testid="intro-stations">
        <IntroImage src="/intro/steps.jpg" className="intro-banner" testId="intro-image-steps" />
        <h2>{STEPS_HEADING}</h2>
        {/* This paragraph described a navigation model the app does not have.
            It said "down the left of every study is a rail with these eight on
            it": there is no left rail on any of the routes and they sit in a
            loop across the top of the Design tab.

            D8 (M27): the sentence that listed the tab names went with the tabs
            it named. It was wrong twice over by then, naming six tabs of which
            one had been renamed and one had left the bar, and Material twice.
            The bar itself says what the tabs are called and each link now
            carries a sentence saying when to open it, so a landing page
            restating the list can only ever be the copy that goes stale. The
            count is read off STATIONS for the same reason. */}
        <p className="intro-section-lede">
          {STEPS_LEDE} {STEPS_WHERE}
        </p>
        <StepRail />
      </section>

      <section className="intro-commitments" data-testid="intro-commitments">
        <h2>{COMMITMENTS_HEADING}</h2>
        <div className="commitment-grid">
          {COMMITMENTS.map((c, i) => (
            <article key={c.title} className="commitment">
              {/* One square per card, in the order the cards are declared, so
                  the picture and the refusal it illustrates cannot drift
                  apart. */}
              <IntroImage
                src={`/intro/commit-${i + 1}.jpg`}
                className="commitment-image"
                testId={`intro-image-commit-${i + 1}`}
              />
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              {/* R5. The reasoning, under its own subheading rather than folded:
                  the owner asked for the logic to be on the page, and a reader
                  deciding whether to trust a refusal should not have to open
                  anything to find out why it is there. */}
              <p className="commitment-why-head small muted">Why</p>
              <p className="commitment-why">{c.why}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="intro-terms" data-testid="intro-terms">
        <Disclosure summary="Terms" testId="intro-terms-fold">
          <table className="intro-terms-table">
            <thead>
              <tr>
                <th scope="col">Term</th>
                <th scope="col">Meaning</th>
                <th scope="col">Also known as</th>
              </tr>
            </thead>
            <tbody>
              {TERMS.map((t) => (
                <tr key={t.term}>
                  <th scope="row">{t.term}</th>
                  <td>{t.meaning}</td>
                  <td>{t.aka}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Disclosure>
      </section>

      <section className="intro-close">
        <h2>{DATA_LIVES_HEADING}</h2>
        <p>{DATA_LIVES_BODY}</p>
        {/* M89: the sentence sending a reader to the bias grid on Checks went with
            the checks. */}
        <p className="small muted">
          You set that connection up under <a href="#/settings">Model access</a>.
        </p>
      </section>
    </main>
  );
}

/**
 * Naming a study, on the two surfaces that offer it (M49, ISC-527).
 *
 * The hero has carried this form since M8; the walkthrough's last screen now
 * offers the same act, and the two are one component rather than two forms that
 * agree. One label, one placeholder, one inert sentence, one write: a second
 * copy of `create()` would be a second chance for the two screens to disagree
 * about what naming a study does.
 */
export function StartStudyForm() {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    const project: Project = {
      id: crypto.randomUUID(),
      title: trimmed,
      stage: "design-brief",
      brief: emptyBrief(),
      createdAt: Date.now(),
    };
    await saveProject(project);
    setBusy(false);
    /* M53, ISC-540. A new study opens on its theoretical motivation, which is
       the first tab and the first thing there is to say about a study. */
    navigate(studyPath(project.id, "motivation"));
  }

  return (
    <>
      <form className="intro-start" onSubmit={(e) => void create(e)}>
        {/* M92 polish: visible now that the placeholder is gone, above the field. */}
        <label className="field-label intro-start-label" htmlFor="intro-title-input">
          Project name
        </label>
        <input
          id="intro-title-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          data-testid="intro-title-input"
        />
        {/* This was the first control on the first screen and it rendered
            as an unexplained grey slab whenever the field was empty, which
            is every first visit. The reason is a condition, not an
            instruction: the tool is reporting what it is waiting to read,
            not telling the researcher off for not typing. Busy is left
            bare, because a control inert for the length of one write does
            not need a paragraph beneath it. */}
        <button
          type="submit"
          data-testid="intro-start"
          {...(busy ? { disabled: true } : inertAttrs("intro-start", startReason(title)))}
        >
          Create project
        </button>
      </form>
      {!busy && <InertNote control="intro-start" reason={startReason(title)} />}
    </>
  );
}

/**
 * A small ontology, drawn (ISC-102), and the legend that reads it.
 *
 * What shipped: six nodes filled from a palette of three lightened blues,
 * greens and rusts that existed nowhere else in the app, under a legend whose
 * swatches were navy #274c77 "yours", green #2c6e49 "from the data" and rust
 * #a4452b "model-proposed". Those three hexes are what tokens.css assigns to
 * page TYPE, so green meant "from the data" on the first screen and
 * "observation" on the ontology tab, and none of the three matched any node in
 * the figure directly above the legend. Four palettes, one figure, and the one
 * legend the product's central claim rests on teaching the wrong thing on the
 * screen whose whole job is to teach it.
 *
 * Origin is what the legend names, so origin is what the figure encodes. That
 * much held. What did not, and what this round fixes: the comment here claimed
 * the model's node was drawn "hollow and dashed exactly as OntologyGraph and
 * the SVG export draw it", which was true of the export and false of the graph.
 * OntologyGraph drew model-proposed at fill-opacity 0.45 with no dash and spent
 * its dash on "nothing joins this page yet", so the dashed rim this screen
 * taught as the model's mark meant unattached two clicks later. On the fixture
 * that read a researcher's own prior claim back to them as the model's.
 *
 * The marks come from src/ui/components/PageMark.tsx and the words from
 * src/ui/originVocabulary.ts now, which is the
 * single definition all four surfaces render, and the ink ramp went with the
 * three inverse tokens: the graph spends hue on page type, so a hero that
 * taught origin in ink was teaching a channel that stops existing at the second
 * click. Fill share is the whole of it. Colour here is one ink, --hero-ink,
 * inherited through `currentColor`, which is also what keeps the hex count in
 * this file at zero.
 */
export function HeroGraph() {
  const nodes = [
    { x: 150, y: 52, r: 26, origin: "author-prior", label: "puzzle" },
    // M29. The theory node is the one that comes from a paper, so the screen
    // that teaches the encoding draws all four marks rather than legending a
    // fourth one nothing on the canvas wears.
    { x: 58, y: 132, r: 19, origin: "literature-derived", label: "theory" },
    { x: 244, y: 128, r: 19, origin: "data-driven", label: "observation" },
    { x: 118, y: 216, r: 17, origin: "data-driven", label: "observation" },
    { x: 226, y: 224, r: 21, origin: "model-proposed", label: "residue" },
    { x: 300, y: 60, r: 14, origin: "model-proposed", label: "rival" },
  ] as const;
  const edges: readonly [number, number][] = [
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 3],
    [2, 4],
    [0, 5],
  ];
  return (
    <div className="intro-hero-art" aria-hidden="true">
      <svg viewBox="0 0 360 280" className="hero-svg" role="presentation">
        <defs>
          <radialGradient id="heroGlow" cx="45%" cy="30%" r="75%">
            <stop offset="0%" className="hero-glow-in" />
            <stop offset="100%" className="hero-glow-out" />
          </radialGradient>
        </defs>
        <rect width="360" height="280" fill="url(#heroGlow)" />
        {edges.map(([a, b], i) => {
          const from = nodes[a];
          const to = nodes[b];
          if (from === undefined || to === undefined) return null;
          return (
            <line
              key={`${a}-${b}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className="hero-edge"
              style={{ animationDelay: `${0.25 + i * 0.12}s` }}
            />
          );
        })}
        {nodes.map((n, i) => (
          <OriginDisc
            key={`${n.label}-${i}`}
            origin={n.origin}
            cx={n.x}
            cy={n.y}
            radius={n.r}
            className="hero-node"
            style={{ animationDelay: `${0.5 + i * 0.1}s` }}
          />
        ))}
      </svg>
      {/* The swatch is the disc, not a picture of one: OriginMark and the
          figure above are the same call inside one module, so the legend cannot
          drift from the figure it sits under the way three of them had. */}
      <ul className="hero-legend">
        {ORIGIN_ORDER.map((origin) => (
          <li key={origin}>
            <OriginMark origin={origin} /> {originLabel(origin)}
          </li>
        ))}
      </ul>
    </div>
  );
}
