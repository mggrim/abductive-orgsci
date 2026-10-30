/**
 * The copy bar, as a scan (M28).
 *
 * The copy critic's round-one report found three habits that survive editing
 * and come back, because each one is a local choice that reads fine in the
 * sentence it sits in and only fails against the bar. Two of the three can be
 * checked mechanically and this file checks them.
 *
 *   - **Nominalisations.** "attribution", "declination", "interrogation",
 *     "intervention", "adjudication", "projection", "retrieval",
 *     "disposition". Every one is a verb the reader already has, turned into a
 *     noun the reader has to unpack. The bar's C3 bans them in UI copy.
 *   - **Defensive hedges.** "costs you nothing", "counted against you", "not
 *     cheating", "not a clean bill of health". Naming a fear in order to allay
 *     it is what creates it, and all four arrived attached to a control the
 *     reader had shown no anxiety about.
 *   - **Tool history.** "an earlier version of Abductive relabelled edited
 *     drafts as the researcher's own prior" shipped to the user, on the page
 *     that reads their own model back to them. The bar's C5 bans a sentence
 *     about a previous build outright: the reader cannot act on it and it costs
 *     them confidence in the column it qualifies.
 *
 * What this scans, and why it is not a grep. Every one of these words is also a
 * legitimate identifier in this codebase: `runIntervention`, `findingDispositions`,
 * `projectOntology`, the `"finding-disposition"` event type, the `"retrieval"`
 * attention layer. A grep over the source would fire on all of them and be
 * turned off within a week. What reaches a reader is prose, and prose in this
 * codebase has a shape: it is JSX text, or a string literal holding a phrase.
 * Both hold whitespace. A slug, an event type, an import path, a class name and
 * a test id do not. So the scan extracts those two populations, keeps only the
 * runs that contain a space, and checks those. The `Anti` tests below hold it
 * to catching a real offender and to ignoring the identifiers it must ignore.
 *
 * Scope is the M28 in-scope list: the surfaces a researcher reads. Prompt text
 * sent to the model is out (`interview/prompt.ts`, `matrix/matrix.ts`,
 * `personas/`), because rewording an instruction to a model changes what the
 * model says, which is a methodological change and not a copy edit. That is the
 * same carve-out `prose-discipline.test.ts` makes, for the same reason.
 */

import { Glob } from "bun";
/* M69, ISC-644: the L13 to L20 detectors live in src/copy/rules.ts, which the
 * runtime reads too, so the scan and the model's replies meet one set of regexes. */
import {
  agentlessPassives,
  CARD_WORD,
  HOLD_VERB,
  IRREGULAR_PARTICIPLES,
  MOVE_NOUN,
  NEGATIVE_PRONOUN,
  NEVER_WORD,
  NO_AMOUNT,
  NO_DENIAL,
  noAmounts,
  NON_ENTITY_ACT,
  nonEntityActs,
  PASSIVE_CLAUSE,
  reducedRelatives,
  sentencesOf,
  STATE_WORDS,
  THING_WAITS,
  WH_NOUN_CLAUSE,
  whNounClauses,
} from "../src/copy/rules.ts";
export {
  agentlessPassives,
  CARD_WORD,
  HOLD_VERB,
  IRREGULAR_PARTICIPLES,
  MOVE_NOUN,
  NEGATIVE_PRONOUN,
  NEVER_WORD,
  NO_AMOUNT,
  NO_DENIAL,
  noAmounts,
  NON_ENTITY_ACT,
  nonEntityActs,
  PASSIVE_CLAUSE,
  reducedRelatives,
  sentencesOf,
  STATE_WORDS,
  THING_WAITS,
  WH_NOUN_CLAUSE,
  whNounClauses,
};

const SRC = new URL("../src/", import.meta.url).pathname;
const ROOT = new URL("../", import.meta.url).pathname;

/**
 * The files whose strings a researcher reads. One entry per glob, resolved
 * against `src/`, plus `index.html` for the browser tab.
 */
export const IN_SCOPE: readonly string[] = [
  "ui/**/*.tsx",
  "ui/**/*.ts",
  /* M95. The About you labels, questions and options. */
  "help/aboutYou.ts",
  "flow/**/*.tsx",
  "flow/**/*.ts",
  "workbench/**/*.tsx",
  "auth/AuthPanel.tsx",
  // M54. The bridge card's step sentences and command glosses.
  "auth/bridgeSteps.ts",
  // M60. Option B's provider names, billing sentences and route sentences.
  "auth/apiSteps.ts",
  /* M42. Four more files a researcher reads that this list never named, found by
     running the checks over every file under `src` rather than over the list.
     `claudeAuth.ts` throws the sentence the auth panel prints when a pasted key is
     malformed, and the three `views/` components are mounted by the record panel:
     the bias flags, the divergence sections and the attention map. CLAUDE.md's rule
     is that a file with rendered strings belongs here, and these four were the
     rule's own counter-examples. */
  "auth/claudeAuth.ts",
  /* M84, ISC-707: the unit field's label, help and options, and the unit flag's sentence. */
  "interview/unitOfAnalysis.ts",
  /* M89: "views/FlagPanel.tsx" went with the checks. */
  "views/Divergence.tsx",
  "views/CoverageMap.tsx",
  "ontology/relationGlossary.ts",
  "ontology/originAudit.ts",
  "matrix/glossary.ts",
  /* Walk item 1. The twin comparison's paragraph is assembled here and rendered
   * on Checks, and no round had audited it: it reached the screen carrying
   * "constructs", "your ontology", "the modal baseline", "the modal path",
   * "page types" and two epigrams in final position. A model file that holds
   * prose is in scope, the same reason `views/anchoring.ts` is. */
  "twin/compare.ts",
  /* M89: "views/openFindings.ts" went with the checks. */
  "views/anchoring.ts",
  /* M39. The map's frame headings are written here rather than by the component
     that draws them, because the layout is what sized the box around each one
     and a renderer wrapping them by its own arithmetic is how a three-line
     heading lands in a two-line band. A model file that holds prose is in scope
     for the same reason `views/anchoring.ts` is — and this one holds the words
     a researcher reads on the largest mark on the map. */
  /* M30. The Your model page assembles its argument band out of these two, so
   * the sentences a researcher reads at the top of that page are written here
   * rather than in the component. A model file that holds prose is in scope for
   * the same reason `views/anchoring.ts` already is. */
  "views/argumentModel.ts",
  /* M89: "views/rivalsModel.ts", "lint/structural.ts" and "lint/coherence.ts"
     went with the checks. */
  /* M33. The papers line on Starting point is assembled here, beside the fit
     summary it extends (in `views/findings.ts` until M89). */
  "views/paperFitLine.ts",
  /* M33. The baseline's question, its rationale, the three decline labels and
     the notes they write onto the record. Every one of them reaches a screen:
     the labels and the scope line render on Material, and the question and the
     rationale render on a move card. */
  "proposals/baselines.ts",
  "interview/topicLabel.ts",
  /* M43b, D15. The Why block's three sentences are written here and rendered by
     `workbench/OutstandingBar.tsx`, which takes the reading's `advice` verbatim.
     A model file that holds prose is in scope for the reason `views/anchoring.ts`
     is, and this one had never been audited: it reached the walk of 2026-09-13
     saying "Questions have stopped moving it", which C9 forbids outright. */
  "interview/saturation.ts",
  /* M37. The conversation's fallback reason reaches the ledger panel as the
     reason a question was asked, which a reader of the record reads. The prompt
     text that goes with it lives next door in `interview/conversationPrompt.ts`
     and stays out of scope, by the carve-out at the head of this list: rewording
     an instruction to a model changes what the model says. */
  "interview/conversation.ts",
  /* R5 item 6. The station probes render through the same `.move-why` span the
   * moves rationales do, and none of them reaches the model: `assembleTurnPrompt`
   * reads `move.question` and `move.mode` and never `move.rationale`, and the
   * `reason` these become on a question-selection event is read by the ledger
   * panel and by nothing that builds a prompt. Thirty user-facing sentences that
   * no round had audited. */
  "interview/stationProbes.ts",
  /* M29b. The move questions, which render under "What the tool would ask
   * next" on Your model and beside the finding on Checks, and which no round
   * had audited: they still said "this construct cites no data", "in the
   * corpus" and "cited by any page". The rationales beside them come through
   * `stationProbes.ts` above; these are the tool's own sentences. */
  "interview/moves.ts",
  /* M89: "views/takeToConversation.ts" (M38) went with the checks. */
  /* M39, ISC-505. The two sentences that say whether an answer was typed or
     drafted, and the three that say why there are no turns behind it. They are
     written with the projection rather than in the popover for the reason
     `views/takeToConversation.ts` above is: one sentence, one place, and the
     surface that draws it cannot reword it. */
  "views/provenance.ts",
  /* M40, ISC-508. The label a reader meets instead of the starting interest's
     subject, and the words the band and the record both use for where a reading
     was read from. Written with the projection for the reason the two entries above
     are: the band, the record and two exports all print them, and a surface that
     could reword them would be a second vocabulary for one fact. */
  "views/puzzleReading.ts",
  /* M43, D9. The two sentences a reader meets on a turn the tool closed to do
     what they asked next, written with the projection that reads the record for
     the reason `views/provenance.ts` above is: the transcript card on Design and
     the same card on Your model both draw them, and a surface that could reword
     them would be a second account of whose decision the turn was. The
     model-facing wording of the same fact is in `interview/designDigest.ts` and
     stays out of scope by the carve-out at the head of this list. */
  "views/setAside.ts",
  /* M48b. The one sentence Your model says about the questions, written beside
     the projection both halves of it read, for the reason `views/provenance.ts`
     and `views/takeToConversation.ts` are here: one sentence, one place, and the
     surface that draws it cannot reword it. Before M48b the component built the
     sentence from a count of its own, and the count disagreed with the link
     beside it. */
  "views/placeSummary.ts",
  /* M40, retired at M42. That one sentence, the reason a reading gives when it
     found nothing but gap markers, moved to `views/puzzleReading.ts` beside
     `NO_REASON_GIVEN`, which is the sentence for the other way a reading can say
     nothing. What was left in `interview/puzzlePrompt.ts` is model input from end
     to end, as its own header says, so the file left this list rather than being
     carried in it with a carve-out no scan could see. The same move split
     `proposals/baselinePrompt.ts` off `proposals/baselines.ts`, which stays.

     Why it mattered: the M42 checks read prose runs, and a run is a string
     literal holding a phrase whether a reader or a model is the one who gets it.
     An instruction to the model ("That is a useful answer and it is often the
     right one") reads to this scan exactly like a sentence on a screen, and
     rewording a prompt to please a copy check is a methodological change made for
     a cosmetic reason. The carve-out at the head of this list is the rule; these
     two files are how the file boundary was made to match it. */
  "export/exportContains.ts",
  /* M36. The three sentences a researcher reads when a bundle will not open,
     and the one they read when the example is not there. They are written with
     the import rather than in the component because two surfaces offer the
     control and one account of a failure is the point. */
  "export/importStudy.ts",
  /* M43c, D33. The sentences a researcher reads at the top of Your model about
     what their framing claim owes them, and what they currently have towards it,
     are written in `ontology/relations.ts` and assembled by
     `views/argumentModel.ts`, which is already on this list. A model file that
     holds prose is in scope for the reason `views/anchoring.ts` is: the band, the
     reviewer line and the move rationale all print these and none of them may
     reword one. */
  "ontology/relations.ts",
  /* M89: "export/exportFindings.ts" (M43d, D41) went with the checks. */
  /* M49, ISC-528. The two sentences under the tab strip are written here beside
     the projection that decides when each one shows: one saying a tab has
     arrived, one saying what brings a tab a link asked for too early. A model
     file that holds prose is in scope for the same reason `views/anchoring.ts`
     is. */
  "views/earnedTabs.ts",
  /* M51, ISC-533. The question a paper the tool cannot place carries, the label
     on the control that records the answer, the placeholder in the box and the
     heading over the sentence once it is written. Four strings a researcher
     reads, written beside the projection every surface draws them from rather
     than in the component, for the reason `views/takeToConversation.ts` above is:
     one sentence, one place, and the surface that draws it cannot reword it. */
  "views/paperBearings.ts",
  /* M89: "views/misfitExpectations.ts" (M51) and "views/matrixExposure.ts"
     (M51, ISC-535) went with the checks. */
  /* M63, ISC-608. The emerging project ontology: the relation phrases, the
     report's criteria and verdict, the lines to look for in the field, and the
     sentences the door throws when an act is refused. Every one reaches a
     screen, History or an export. `concepts/suggest.ts` is left out: it is the
     prompt that asks the model for suggestions, model input end to end, by the
     carve-out at the head of this list. */
  "concepts/vocabulary.ts",
  "concepts/projection.ts",
  "concepts/door.ts",
  "concepts/run.ts",
  /* M75, ISC-669. A statement's origin label, printed on every statement on the
     ontology tab and in the Report. */
  "concepts/statementOrigin.ts",
  /* M80, ISC-685 to ISC-688. The rebuilt sections' empty states and the line
     for a section the model didn't write, which render on Checks and in the
     Report; and the signal sentences that Biases flagged quotes, moved out of
     `concepts/readiness.ts`. The prompts beside them are model input. */
  "concepts/reportSections.ts",
  /* M89: "concepts/biasFirings.ts" went with the checks. */
  /* M93, ISC-762, ISC-763: the sentences the decision builders throw, which the
     reading's card and the argument's controls print. */
  "concepts/decisions.ts",
];

export async function scoped(): Promise<readonly { path: string; text: string }[]> {
  const seen = new Map<string, string>();
  for (const pattern of IN_SCOPE) {
    for await (const rel of new Glob(pattern).scan(SRC)) {
      if (seen.has(rel)) continue;
      seen.set(rel, await Bun.file(SRC + rel).text());
    }
  }
  seen.set("index.html", await Bun.file(ROOT + "index.html").text());
  /* M55, ISC-551. The Mac app's menu. Every string it shows goes through one
     helper, `T("…")`, so the scan reads exactly those literals and not the
     protocol strings, header names and paths the Swift files also hold. Each
     literal becomes a quoted line, with `\(…)` interpolations cut out the way
     `${…}` is cut out of a template, so `proseRuns` reads it as it reads a
     TypeScript string. Build output and package checkouts are not the app. */
  for await (const rel of new Glob("**/*.swift").scan(ROOT + "bridge-app")) {
    if (/(^|\/)(\.build|build|DerivedData)\//.test(rel)) continue;
    const text = await Bun.file(`${ROOT}bridge-app/${rel}`).text();
    const shown = [...uncommented(text).matchAll(/\bT\("((?:[^"\\\n]|\\.)*)"\)/g)].map(
      (m) => `"${(m[1] ?? "").replace(/\\\([^)]*\)/g, " ")}"`,
    );
    seen.set(`bridge-app/${rel}`, shown.join("\n"));
  }
  return [...seen].map(([path, text]) => ({ path, text })).sort((a, b) => a.path.localeCompare(b.path));
}

/** Comments are addressed to whoever maintains this, and are not the tool speaking. */
export function uncommented(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * Every run of prose a reader could meet in one file.
 *
 * Two populations, and the whitespace rule is what separates prose from the
 * identifiers that share its vocabulary.
 *
 *   1. String and template literals holding a phrase. `${…}` is cut out of a
 *      template first, so an interpolation cannot join two words that are not
 *      adjacent on screen.
 *   2. JSX text: whatever sits between a `>` and the next `<` with no brace or
 *      angle bracket in it.
 *
 * `import` and `export … from` lines go first, so a module path can never be
 * read as a sentence.
 */
export function proseRuns(text: string): readonly string[] {
  // A module specifier makes a line an import, not the word "from" (M61 follow-up).
  const body = uncommented(text).replace(/^\s*(?:import|export)\b[^\n]*\bfrom\s*["'][^"'\n]+["'];?\s*$/gm, " ");
  const runs: string[] = [];
  const literal = /"([^"\\\n]*(?:\\.[^"\\\n]*)*)"|'([^'\\\n]*(?:\\.[^'\\\n]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  for (const m of body.matchAll(literal)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? "";
    runs.push(raw.replace(/\$\{[^}]*\}/g, " "));
  }
  for (const m of body.matchAll(/>([^<>{}]+)</g)) runs.push(m[1] ?? "");
  // A phrase, not a token. Everything this scan must ignore is one word.
  return runs.map((r) => r.replace(/\s+/g, " ").trim()).filter((r) => /\S\s\S/.test(r));
}

/**
 * C3's list, as written on the bar. Whole words, so "adjudication" fires and
 * `adjudicateProposal` does not reach this function in the first place.
 */
export const NOMINALISATIONS: readonly string[] = [
  "attribution",
  "declination",
  "declinations",
  "interrogation",
  "intervention",
  "interventions",
  "adjudication",
  "adjudicated",
  "unadjudicated",
  "projection",
  "projections",
  "retrieval",
  "disposition",
  "dispositions",
];

/** The four hedges, and the shape they all share: a fear named to be allayed. */
export const HEDGES: readonly string[] = [
  "costs you nothing",
  "counted against you",
  "count against you",
  "not cheating",
  "clean bill of health",
];

/** C5, in the one form it actually shipped in. */
export const HISTORY: readonly string[] = ["earlier version"];

/*
 * The owner's anti-AI writing guide (docs/copy-standard.md, part 3), the parts
 * a machine can check (2026-09-12). Each list is a class of tell the guide
 * names; the sweep that followed rewrote every hit, and these keep them out.
 */

/** The AI vocabulary, whole words. "navigate" figuratively; the route word is fine. */
export const AI_WORDS: readonly string[] = [
  "delve", "delves", "delving",
  "leverage", "leverages", "leveraging",
  "utilize", "utilise", "utilizes", "utilises",
  "robust", "seamless", "seamlessly", "elevate", "elevates",
  "unlock", "unlocks", "empower", "empowers",
  "landscape", "realm", "tapestry", "testament",
  "boasts", "nestled", "bustling", "vibrant",
  "crucial", "pivotal", "foster", "fosters", "garner", "myriad", "plethora",
  "quietly", "silently",
  "load-bearing",
  "genuinely", "genuine",
  "incredibly", "truly", "extremely", "simply",
  "honestly", "worth noting", "worth naming", "reality check", "needless to say",
  "as you may know", "in conclusion", "at the end of the day", "all in all",
  "game-changing", "revolutionary", "cutting-edge",
];

/** Sentence-initial transition adverbs on a loop. */
export const TRANSITION_OPENERS = /(?:^|[.!?]\s+)(?:Moreover|Furthermore|Additionally|Notably|Consequently),/;

/** "It's not X. It's Y." and "X isn't just Y. It's Z." */
export const NOT_X_ITS_Y = /\b(?:is not|isn't|it's not|its not|not just|not only)\b[^.!?]{0,80}[.!?]\s+(?:It's|It is|That's|That is|This is)\b/i;

/** The appositive reframe, "X, not Y." at the end of a sentence. */
export const APPOSITIVE_NOT = /,\s*not\s+(?:a|an|the|your|its|their)\s+[^,.!?]{1,40}[.!?]/;

/** The tacked-on demonstrative payoff. */
export const PAYOFF = /(?:^|[.!?]\s+)(?:That's|That is|It's|It is|This is) (?:the|what|where|why|how) [^.!?]{1,40}[.!?](?:\s|$)/;

/** A one-word sentence. */
export const ONE_WORD_SENTENCE = /(?:^|[.!?]\s+)[A-Z][a-z]+[.!](?:\s|$)/;

/**
 * C9. A sentence opening on a bare pronoun (not a question). "It", "This",
 * "That" and "What" as the subject of a statement stand in for something that
 * has a name on the page. "This step" and "That answer" are determiners and
 * pass; "What are you exploring?" is a question and passes.
 *
 * The trailing `\s+\S` is what keeps a two-word heading out of it (M42). The
 * record's own columns are "What happened" and "What the event changed", and the
 * first of those is a noun phrase naming a column rather than a statement whose
 * subject went missing: there is no sentence for a referent to be absent from.
 * A run that stops at the verb is always a label, and every offender this check
 * is for goes on to say something about the thing it did not name.
 */
export const BARE_PRONOUN_OPENER =
  /(?:^|[.!?]\s+)(?:It|This|That|What)(?:'s| is| was| has| had| will| can| does| did| reads| says| asks| takes| means| came| comes| went| goes| may| might| should| would| holds| keeps| shows| tells| sits| stays| stands| makes| gets| gives| needs| runs| lives| carries| happens| happened| matters| counts| depends| belongs| looks| feels| turns| lets| puts| sets| moves| moved)\b(?=\s+\S)(?![^.!?]*\?)/;

export function patternOffenders(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    for (const run of proseRuns(text)) {
      if (!pattern.test(run)) continue;
      found.push(`${path}: "${run.slice(0, 110)}"`);
    }
  }
  return [...new Set(found)].sort();
}

export const FILES = await scoped();

export function offenders(words: readonly string[]): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    for (const run of proseRuns(text)) {
      for (const word of words) {
        if (!new RegExp(`\\b${word}\\b`, "i").test(run)) continue;
        found.push(`${path}: "${run.slice(0, 90)}"`);
      }
    }
  }
  return [...new Set(found)].sort();
}


/* ---------------------------------------------------------------------------
 * C9, the second half: a bare reference inside a sentence (M48).
 *
 * `BARE_PRONOUN_OPENER` above catches a statement whose first word is the
 * pronoun. The owner's report of 2026-09-13 is about the same failure one word
 * later: "holds it up", "pushes against it", "The drawing is the shape", "So
 * many uses of the words 'it' 'them' 'what'." Those sentences pass the opener
 * check, because the pronoun is not the subject; they fail the standard,
 * because nothing in the sentence says what the pronoun points at.
 *
 * The test is the owner's, set on 2026-09-12 and restated in the M48 brief: can
 * a stranger who opened the tool ten minutes ago say what the word refers to
 * from the sentence alone? So the check is scoped to the sentence, not the run
 * and not the screen. A referent one sentence earlier is out of reach of a
 * reader meeting the string as a key heading, a button, a chip or a tooltip,
 * which is where nearly every offender this check found actually lived.
 *
 * What counts as a bare reference:
 *
 *   - `it`, `its`, `them`, `they`, `their`, `here`, `there` always. None of the
 *     seven can be a determiner, so every use is a reference to something.
 *   - `this`, `that`, `these`, `those`, `what`, `which` only when no lowercase
 *     word follows. "this step" and "What the papers expect" are determiners
 *     naming their own noun and pass; "leaves it there", "Nothing matches
 *     that", "How to read it" do not.
 *
 * What clears it: a noun phrase earlier in the same sentence. `NOUN_PHRASE`
 * reads a determiner or possessive followed by a word, which is how this
 * codebase's copy names things ("the claim", "your model", "a draft", "each
 * paper"). A sentence that names a noun before it uses a pronoun is the case
 * C9 explicitly allows, and it is the overwhelming majority of the runs in
 * scope, which is why the allowlist below is short rather than long.
 *
 * The allowlist is for the one shape C9 cannot express: a control or a fragment
 * whose referent is the card it sits on rather than a word in a sentence. Every
 * line carries its reason. Forty lines is the ceiling the M48 brief sets: past
 * that the check would be wrong rather than the strings, and the answer would
 * be to narrow the check rather than to keep exempting.
 */

/**
 * A noun phrase: a determiner or possessive followed by a word. "the claim",
 * "your model", "a draft", "each paper", "three passages". And the product's
 * name (M61, decision 4): "Abductive keeps its own reading" names its actor as
 * plainly as "the tool keeps its own reading" did, and a proper noun takes no
 * determiner.
 *
 * A capitalised word plus a lowercase one was tried as a second shape, to let
 * "Qualitative work earns its keep" through, and it let "Pushes against it"
 * through with it: a capitalised verb followed by a preposition is the same two
 * tokens as a capitalised noun followed by a verb, and the owner's own example
 * is the first case. So the rule stays the determiner, and the two prompt
 * sentences that needed the other shape were rewritten instead. A check that
 * clears one of the three strings the report was about would be worth nothing.
 */
const NOUN_PHRASE =
  /\b(?:the|a|an|your|my|our|its|their|his|her|this|that|these|those|each|every|any|some|no|one|two|three|four|five|six|seven|eight|nine|ten|both|either|neither)\s+[a-z]|\bAbductive\b/i;

/**
 * The bare references, by the rule in the docstring above.
 *
 * `that`, `what` and `which` also clear on a following quote or apostrophe: in
 * front of a quoted title the word opens a clause about that title rather than
 * standing in for it. `You're claiming that "${a}"` and `You haven't answered
 * what "${paper}" expects` both name their object. `Saturated on what?` does
 * not, and still fails.
 */
const BARE_REFERENCE =
  /\b(it|its|them|they|their|here|there)\b|\b(this|these|those)\b(?!\s+[a-z])|\b(that|what|which)\b(?!\s+[a-z"'])/gi;

/**
 * Four shapes the words above take without referring to anything, so the check
 * has to see past them rather than have them exempted one string at a time.
 *
 *  - **Existential there.** "There's a resolution in your model" asserts that
 *    something exists; the word points at nothing and cannot be named.
 *  - **A question opening on What.** C9 allows it in as many words.
 *  - **A hyphenated identifier.** `-` is a word boundary, so `\bwhich\b` fires
 *    inside the class name "argument-which-puzzle".
 *  - **Source that reached `proseRuns` as prose.** The JSX-text rule reads
 *    whatever sits between a `>` and the next `<`, and a `>` comparison in a
 *    ternary gives it a run of code. That blind spot predates this check; the
 *    older checks simply never matched a keyword inside one.
 */
const EXISTENTIAL = /\b(?:there|here)\b(?=(?:'s|\s+(?:is|are|was|were|has|have)\b))/i;
const CODE_RUN = /=>|\bconst\b|\breturn\b|\?\s*"|"\s*:|className=/;

function isReference(sentence: string, match: RegExpMatchArray): boolean {
  const at = match.index ?? 0;
  const word = match[0] ?? "";
  const before = sentence.slice(0, at);
  const after = sentence.slice(at + word.length);
  // A hyphenated identifier, on either side of the match.
  if (before.endsWith("-") || after.startsWith("-")) return false;
  // "There is", "Here are": the word asserts existence and names nothing.
  if (EXISTENTIAL.test(`${word}${after}`) && /^(?:there|here)$/i.test(word)) return false;
  // A question may open on "What" (C9).
  if (/^what/i.test(word) && before.trim() === "" && sentence.trimEnd().endsWith("?")) return false;
  return true;
}

/**
 * The sentences where the referent is the card the control sits on, not a word.
 * One line each, with the reason. Matched on the whole run, collapsed.
 */
export const BARE_REFERENCE_ALLOW: readonly string[] = [
  "Retire it",
  // The shared decision-role tooltips. `ui/components/decisions.ts` bans a
  // per-surface override by its own docstring: one object's noun written into a
  // role that serves drafts, steps and findings alike is wrong on two of three.
  "Accepts it, with a record of its origin.",
  "Records that you set it aside for now, unanswered and still on the list.",
  // Reason fields. The field sits inside the card for the thing being declined,
  // and the label is the placeholder in that field.
  "Name its holder first.",
  // The tool setting a question aside, where the tool is the subject and the
  // question is named in the clause the reader has just read.
  "set aside for now",
  /* M51's "Nothing has fired here yet." left this list at M64 (L19): the
     minimal rewrite "No bias has fired here yet." puts a noun before "here", so
     the check reads the square's sentence as naming its own subject. */
  // The generic busy line. Its referent is the panel the spinner is inside, and
  // `EmptyState`'s own prop comment says a caller whose wait needs naming passes
  // `busyStatus` instead. Naming a noun here would name the wrong one on most of
  // the panels that fall back to it.
  "Working on it.",
  /* M74b, ISC-664: the note under a summarised field, in the wording the M74b
     brief gives. It sits under the summary that "this" and "it" refer to, the
     card-referent shape this list is for. */
  /* M82, ISC-695: the owner's name for a card's line, as the M82 brief gives it.
     The label sits on a concept or relation card, and "it" is that card. */
  "Why it matters",
  /* M50, ISC-531's "What is drawing you to this?" left this list at M62
     (ISC-602): the owner's new wording names its referent ("this particular
     research inquiry"), so the check reads it as a determiner and passes it. */
];

/** Every bare reference in one run that no noun phrase in its sentence covers. */
export function bareReferences(run: string): readonly string[] {
  const flat = run.replace(/\s+/g, " ").trim();
  if (BARE_REFERENCE_ALLOW.includes(flat)) return [];
  if (CODE_RUN.test(flat)) return [];
  const found: string[] = [];
  for (const sentence of sentencesOf(flat)) {
    for (const m of sentence.matchAll(BARE_REFERENCE)) {
      if (!isReference(sentence, m)) continue;
      if (NOUN_PHRASE.test(sentence.slice(0, m.index ?? 0))) continue;
      found.push(m[0] ?? "");
      break;
    }
  }
  return found;
}

/** Every run in scope carrying a bare reference, as `path: "run"` lines. */
export function bareReferenceOffenders(): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    for (const run of proseRuns(text)) {
      const hits = bareReferences(run);
      if (hits.length === 0) continue;
      found.push(`${path}: [${hits.join(" ")}] "${run.replace(/\s+/g, " ").trim().slice(0, 110)}"`);
    }
  }
  return [...new Set(found)].sort();
}


/* ---------------------------------------------------------------------------
 * Part 5. Controls and labels (M61, ISC-584).
 *
 * Parts 1 to 4 read sentences. Part 5 reads the words on a control, and a
 * control has a shape the prose scan above cannot see: its label is the text
 * between `<button …>` and `</button>` (or `<a …>` and `</a>`), with the child
 * tags taken away and any ternary inside it read as its alternatives. So this
 * walks the opening tag by hand, counting braces and quotes, because an
 * attribute such as `onClick={() => x > 0}` holds a `>` that a regular
 * expression would take for the end of the tag.
 *
 * What a label becomes: static text, collapsed; an expression holding string
 * literals contributes each literal as an alternative label; an expression
 * holding none (a title, a count) reads as one word, "…", so "Remove {title}"
 * is two words and "{title}" alone is no label this scan can judge.
 * ------------------------------------------------------------------------- */

export type ControlLabel = { readonly kind: "button" | "link"; readonly label: string };

/** Where the opening tag that starts at `from` ends, or -1. */
function tagEnd(text: string, from: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (quote !== null) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === ">" && depth === 0) return i;
  }
  return -1;
}

/** The string literals inside one JSX expression, as candidate labels. */
function literalsIn(expr: string): string[] {
  const out: string[] = [];
  for (const m of expr.matchAll(/"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`\\]*)`/g)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, "…").trim();
    // A label is capitalised or holds a space; "cell:" and "yours" are a key
    // and a fragment spliced into something else.
    if (/[A-Za-z]/.test(raw) && (/^[A-Z"“]/.test(raw) || /\s/.test(raw))) out.push(raw);
  }
  return out;
}

/** The label (or labels) a control's children render. */
function labelsOf(inner: string): string[] {
  // Child tags go; their text stays. Visually hidden spans are part of the
  // accessible name and stay as well.
  let s = inner.replace(/<\/?[A-Za-z][^<>]*?\/?>/g, " ");
  const alternatives: string[] = [];
  let hasOpaque = false;
  s = s.replace(/\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_m, expr: string) => {
    if (/^\s*\/\*/.test(expr)) return " ";
    const lits = literalsIn(expr);
    if (lits.length > 0) {
      alternatives.push(...lits);
      return " ";
    }
    hasOpaque = true;
    return " … ";
  });
  // An opaque value at either edge is an icon, a key chip or a count beside
  // the label, and is not part of what the label says.
  const stat = s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:… )+|(?: …)+$/g, "")
    // A quoted title spliced into a label is one word: Merge into "…".
    .replace(/(["“'])\s*…\s*(["”'])/g, "$1…$2");
  const staticWords = stat.replace(/…/g, "").trim();
  if (staticWords !== "") return [stat];
  // Alternatives beside an opaque value (a row name and "yours" or "the
  // model's") are a composite this scan cannot read as one label.
  if (alternatives.length > 0 && !hasOpaque) return alternatives;
  return [];
}

/** Every button and link label in one file. */
export function controlLabels(text: string): readonly ControlLabel[] {
  const body = uncommented(text);
  const out: ControlLabel[] = [];
  for (const [tag, kind] of [
    ["button", "button"],
    ["a", "link"],
  ] as const) {
    const open = new RegExp(`<${tag}(?=[\\s>])`, "g");
    for (const m of body.matchAll(open)) {
      const start = m.index ?? 0;
      const end = tagEnd(body, start + 1 + tag.length);
      if (end < 0 || body[end - 1] === "/") continue;
      const close = body.indexOf(`</${tag}>`, end);
      if (close < 0) continue;
      for (const label of labelsOf(body.slice(end + 1, close))) out.push({ kind, label });
    }
  }
  return out;
}

/**
 * L1. The first word of an action label. Imperative verbs (Summarise joined at
 * M62, ISC-598), and none of the
 * retired ones (L5): put, turn, forget, withdraw, drop, record, say, talk, give
 * and leave are not here, so a label opening on one of them fails.
 */
export const ACTION_VERBS: ReadonlySet<string> = new Set([
  "Accept", "Add", "Answer", "Ask", "Attach", "Cancel", "Change", "Check", "Choose",
  "Clear", "Close", "Collapse", "Compare", "Connect", "Continue", "Copy", "Create",
  "Decide", "Delete", "Disconnect", "Discuss", "Dismiss", "Download", "Edit", "Expand",
  "Export", "Find", "Focus", "Go", "Go_to", "Hide", "Import", "Keep", "Link", "Load", "Mark", "Merge", "Move",
  "Name", "Open", "Pick", "Place", "Read", "Reject", "Remove", "Rename", "Restore", "Resume",
  "Refine", "Retire", "Review", "Run", "Save", "Search", "See", "Select", "Send", "Set", "Show",
  "Sign", "Skip", "Sort", "Start", "Stop", "Suggest", "Summarise", "Try", "Undo", "Upload", "Use",
  "View", "Wait", "Write",
]);

/**
 * Controls that are not imperatives and are right not to be (L1): the
 * researcher's own replies in the conversation, the pager's words, a sort
 * toggle, a state a button passes through, and a view toggle's noun.
 */
export const NON_VERB_LABELS: ReadonlySet<string> = new Set([
  // "Not now" left the list at M69 (ISC-642) with the chip it named.
  "I don't know", "Not yet", "Next", "Back", "Previous",
  // M95: the help chat's request button, in the researcher's voice as "I don't know" is.
  "I'm stuck",
  "Newest first", "Oldest first", "Copied", "List", "Map", "Chat",
  // The skip link, in the words every site uses for it (Elicit's help, s18).
  "Skip to main content",
]);

/** A progress state a button passes through: one gerund and an ellipsis. */
const PROGRESS = /^[A-Z][a-z]+ing\b[^.]*…$/;

/** Words a label may capitalise after its first: names and places. */
const PROPER = new Set([
  "Abductive", "Bridge", "Claude", "Code", "Codex", "CLI", "API", "LM", "Studio", "Mac",
  "Ollama", "Anthropic", "OpenAI", "Gemini", "OpenRouter", "JSON", "I",
  // Controls a keyboard binding names: "Go to Send", "Go to Reject".
  "Send", "Accept", "Reject",
]);

/** Place names that count as one word inside a label ("Go to Starting point"). */
export function placeTokens(names: readonly string[]): (label: string) => string {
  const sorted = [...names].sort((a, b) => b.length - a.length);
  return (label) => {
    let out = label;
    for (const n of sorted) out = out.split(n).join(n.replace(/\s+/g, "_"));
    return out;
  };
}

/**
 * The owner's labels, verbatim, outside L1 (M92, Matthew, 2026-10-15): "There
 * should be another button called 'Auto-generate summary from chat'." Four
 * words, opening on a compound verb; recorded in docs/copy-standard.md. M93
 * (Matthew, 2026-10-16): "a button that says surface concepts and
 * relationships", four words, closing the chat at every step.
 */
export const OWNER_LABELS: ReadonlySet<string> = new Set(["Auto-generate summary from chat", "Surface concepts and relationships"]);

/** Why one action label breaks L1, L2's opener rule or L4, or null. */
export function actionLabelFault(label: string, places: readonly string[] = []): string | null {
  const flat = label.replace(/\s+/g, " ").trim();
  if (flat === "" || !/[A-Za-z]/.test(flat.replace(/…/g, ""))) return null;
  if (OWNER_LABELS.has(flat)) return null;
  if (/^(the|my)\b/i.test(flat)) return "opens on the or my";
  if (NON_VERB_LABELS.has(flat)) return null;
  // A control named for the place it opens: the header's History (decision 5).
  if (places.includes(flat)) return null;
  const words = placeTokens(places)(flat).split(" ");
  if (PROGRESS.test(flat)) return words.length <= 3 ? null : "progress state over three words";
  // "Dismiss…" is Dismiss with the ellipsis that says a field opens first (ACT4).
  const first = (words[0] ?? "").replace(/…$/, "");
  // Next and Previous are how a pager and a list move (ACT5): "Next item".
  if (!ACTION_VERBS.has(first) && first !== "Next" && first !== "Previous")
    return `opens on "${first}", not an imperative verb`;
  if (words.length > 3) return `${words.length} words`;
  if (/\.$/.test(flat)) return "ends in a period";
  const placeWords = new Set(places.flatMap((p) => p.split(/\s+/)));
  for (const w of words.slice(1)) {
    const bare = w.replace(/^["'(]+|["'),.:;?!]+$/g, "");
    if (/^[A-Z][a-z]/.test(bare) && !PROPER.has(bare) && !placeWords.has(bare) && !bare.includes("_"))
      return `"${bare}" is capitalised mid-label`;
  }
  if (/^(Delete|Remove|Retire|Clear)$/.test(flat)) return "destructive label names no object";
  return null;
}

/**
 * The one possessive L2 admits (the lead's ruling, 2026-09-30). "Model" beside
 * "Model access" would name two things with one word, since decision 4 makes
 * "the model" the language model; the possessive is what tells the reader's
 * model from the one they connect.
 */
export const ADMITTED_PLACES: ReadonlySet<string> = new Set([
  /* M83, ISC-700: "Your model" left with the word; the tab has been Emerging
     project ontology since M63, so the possessive is admitted for nothing. */
  /* M63, ISC-609. The owner's three words for the tab, verbatim from the
     interview of 2026-09-30, admitted as the owner's wording the way ISC-586
     admits the lede's "The tool asks". */
  "Emerging project ontology",
]);

/** L2. Why one place name is not a noun of one or two words, or null. */
export function placeNameFault(name: string): string | null {
  const flat = name.replace(/\s+/g, " ").trim();
  if (ADMITTED_PLACES.has(flat)) return null;
  const words = flat.split(" ");
  if (words.length > 2) return `${words.length} words`;
  if (/\?$/.test(flat)) return "ends in a question mark";
  if (/^(the|a|an|your|my)$/i.test(words[0] ?? "")) return `opens on "${words[0]}"`;
  // A one-word tab may be a stage verb, as desktop suites name theirs (NAV2:
  // MAXQDA's Import and Export); a two-word place may not open on one.
  if (words.length > 1 && ACTION_VERBS.has(words[0] ?? "")) return `opens on the verb "${words[0]}"`;
  return null;
}

/** L12. Why one fold summary breaks the Learn more rule, or null. */
export function foldSummaryFault(summary: string): string | null {
  const flat = summary.replace(/\s+/g, " ").trim();
  if (/learn more/i.test(flat)) return flat === "Learn more" ? null : 'mentions "Learn more" without being it';
  if (/\?$/.test(flat)) return "ends in a question mark";
  if (/^(How|What|Why|When|Where)\b/.test(flat)) return "an explanation fold, which reads Learn more";
  if (/^(the|my)\b/i.test(flat)) return "opens on the or my";
  return null;
}

/** Every literal fold summary in one file: the `Disclosure` prop and `<summary>` text. */
export function foldSummaries(text: string): readonly string[] {
  const body = uncommented(text);
  const out: string[] = [];
  for (const m of body.matchAll(/\bsummary=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g))
    out.push((m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, "…"));
  for (const m of body.matchAll(/<summary>([^<{]*)<\/summary>/g)) out.push(m[1] ?? "");
  return out.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s !== "");
}

/** Every literal status chip label in one file. */
export function chipLabels(text: string): readonly string[] {
  const body = uncommented(text);
  const out: string[] = [];
  for (const m of body.matchAll(/<StatusChip\b[^>]*?\blabel=(?:"([^"]*)"|\{"([^"]*)"\})/g))
    out.push(m[1] ?? m[2] ?? "");
  /* M78a: a label held in a constant in the same file ("Gap to fill" escaped
     the literal reading above). */
  for (const m of body.matchAll(/<StatusChip\b[^>]*?\blabel=\{([A-Z][A-Z0-9_]*)\}/g)) {
    const value = new RegExp(`\\bconst\\s+${m[1]}\\s*(?::[^=]+)?=\\s*"([^"]*)"`).exec(body)?.[1];
    if (value !== undefined) out.push(value);
  }
  return out;
}

/**
 * L12. The retired words, as they may not appear in a rendered run. Each is a
 * pattern so the shapes it must not fire on can be said once: a hyphen on
 * either side is a class name or a test id ("btn-bare study-remove"), and memo
 * is right when it names the researcher's own notes beside transcripts and
 * field notes, which is the word's meaning in every QDA tool the survey read.
 */
export const RETIRED_TERMS: readonly { readonly term: string; readonly pattern: RegExp; readonly unless?: RegExp }[] = [
  // The noun only: "to study", "you study" and "they study" are the verb, which
  // is the researcher's own activity and has no twin to be renamed to.
  { term: "study", pattern: /(?<![-/])(?<!\b(?:to|you|they|we|I|can|will|could|would|should) )\bstud(?:y|ies)\b(?!-)/i },
  { term: "draft", pattern: /(?<![-/])\bdraft(?:s|ed|ing)?\b(?!-)/i },
  { term: "proposal", pattern: /(?<![-/])\bproposals?\b(?!-)/i },
  { term: "the tool", pattern: /\bthe tool(?:'s)?\b/i },
  {
    term: "memo",
    pattern: /(?<![-/])\bmemos?\b(?!-)/i,
    unless: /\b(?:transcripts?|field ?notes|fieldnotes|interview notes)\b[^.]*\bmemos?\b|\bmemos?\b[^.]*\b(?:transcripts?|field ?notes|fieldnotes)\b/i,
  },
  { term: "the record", pattern: /\bthe record\b/i },
  { term: "ledger", pattern: /(?<![-/])\bledgers?\b(?!-)/i },
  { term: "Material", pattern: /(?<![-/])\bMaterial\b(?!-)/ },
  { term: "put it in", pattern: /\bput (?:it|my version|this|one) in\b/i },
  { term: "turn it down", pattern: /\bturn(?:s|ed|ing)? (?:it |this |them |one )?down\b/i },
  /* M83, ISC-700: the researcher's web of concepts, relations and claims is
   * "your ontology" (Matthew, 2026-10-06). The pattern reads the possessive
   * alone, so "the model", the language model, is left out by construction, and
   * "your model provider" names the language model's provider. */
  { term: "your model", pattern: /\byour model\b(?! provider)/i },
  /* M74b, ISC-664: the place is Starting point since M61. The walk of 2026-10-02
   * read "A question is open for you at framing." on Design, where the place id
   * fell through to the sentence; the id and the class names keep the word. */
  { term: "framing", pattern: /(?<![-/_.])\bframing\b(?![-_])/i },
];

/**
 * Runs that hold a retired word and are not copy. Source the JSX-text rule reads
 * past a `>` comparison (the same blind spot `CODE_RUN` covers for C9), a class
 * list ("panel panel-wide ledger"), and the one value spelled with a space: the
 * projections' actor, `"you" | "the tool"`, which is compared and written into the
 * graph export's `settledBy` and is never printed. Every surface that prints it
 * maps it to a sentence naming Abductive (`ACCEPTED_BY`, `dismissalNote`).
 */
function notCopy(run: string): boolean {
  const flat = run.replace(/\s+/g, " ").trim();
  return CODE_RUN.test(flat) || /^[a-z0-9]+(?:[- ][a-z0-9]+)*$/.test(flat) && flat.includes("-") || flat === "the tool";
}

/**
 * Runs in scope that keep a retired word, each with its reason. Matched on the
 * run's opening, collapsed, so a template's interpolation does not have to be
 * spelled out. Two kinds: text sent to the model (Part 4: a prompt changes
 * only where it quotes a label the researcher sees), and the owner's own
 * wording, which stands over the rules (ISC-586). The five fixed interview
 * questions left this list on the lead's ruling of 2026-09-30: the reader sees
 * them, decision 1 governs, and the model sees the word the reader does.
 */
export const RETIRED_ALLOW: readonly { readonly run: string; readonly why: string }[] = [
  { run: "Judge one thing only: does the design depend on access", why: "coherence check prompt, sent to the model" },
  { run: "Judge one thing only: if this study compares cases", why: "coherence check prompt, sent to the model" },
  { run: "Judge one thing only: is this design set up to build an account", why: "coherence check prompt, sent to the model" },
  { run: "The puzzle, as the tool reads it from their answers", why: "puzzlePromptLines, sent to the model" },
  { run: "The setting for the whole study: what the researcher is looking at", why: "the framing's purpose, sent to the model" },
  {
    run: "Abductive helps you design a qualitative project before you collect the data. The tool asks",
    why: "the owner's wording, 2026-09-30",
  },
  /* M74b: framing in the method's sense, a frame of theory a researcher holds, is
   * a different word from the retired place name. */
  { run: "Reading the field for your existing expectation", why: "the bias glossary, framing as a frame of theory" },
  { run: "You can't name an observation that would make you abandon the framing", why: "the bias glossary, framing as a frame of theory" },
  { run: "Modal framing", why: "a bias's name in the glossary, framing as a frame of theory" },
  { run: "framing changed", why: "a withdrawal reason kept in History's events; FindingRow maps it to a sentence" },
];

function allowed(run: string): boolean {
  // A template's escaped "\\n\\n" is a line break in the prompt, not text.
  const flat = run.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
  return RETIRED_ALLOW.some((a) => flat.startsWith(a.run));
}

/**
 * JSX text beside an expression: "The tool drafted {share}. You accepted each
 * one." `proseRuns` reads text between two tags only, so a sentence broken by
 * an interpolation reaches it as nothing, and the M61 walk found six retired
 * words there. Read here for the retired words alone; the older checks keep
 * their own population.
 */
export function jsxAdjacentRuns(text: string): readonly string[] {
  const out: string[] = [];
  for (const m of uncommented(text).matchAll(/[>}]([^<>{}]*[A-Za-z][^<>{}]*)[<{]/g)) {
    const run = (m[1] ?? "").replace(/\s+/g, " ").trim();
    if (!/\S\s\S/.test(run)) continue;
    if (/=>|\b(?:const|return|function|export|import)\b|[;=`]|&&|\|\||\?\?/.test(run)) continue;
    out.push(run);
  }
  return out;
}

/**
 * The one-word runs `proseRuns` leaves out on purpose: a heading or a cell
 * that is a single word ("<h1>Studies</h1>"), and a literal `label`,
 * `summary`, `title` or `placeholder` prop. The whitespace rule exists to keep
 * identifiers out of the prose checks, and it also let the list page's own
 * heading keep the retired noun past the first M61 pass.
 */
export function shortLabelRuns(text: string): readonly string[] {
  const body = uncommented(text);
  const out: string[] = [];
  for (const m of body.matchAll(/>\s*([A-Z][A-Za-z]*(?: [A-Za-z]+){0,2})\s*</g)) out.push(m[1] ?? "");
  for (const m of body.matchAll(/\b(?:label|summary|title|placeholder|aria-label)=["']([^"'{}]+)["']/g)) out.push(m[1] ?? "");
  return out;
}

/** Every rendered run carrying a retired word, as `path: [term] "run"` lines. */
export function retiredTermOffenders(): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    const jsx = path.endsWith(".tsx") ? [...jsxAdjacentRuns(text), ...shortLabelRuns(text)] : [];
    for (const run of [...proseRuns(text), ...jsx]) {
      if (notCopy(run) || allowed(run)) continue;
      for (const { term, pattern, unless } of RETIRED_TERMS) {
        if (!pattern.test(run)) continue;
        if (unless?.test(run)) continue;
        found.push(`${path}: [${term}] "${run.slice(0, 100)}"`);
      }
    }
  }
  return [...new Set(found)].sort();
}

/** Every control, fold and chip in scope that breaks a Part 5 rule. */
export function labelOffenders(places: readonly string[]): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    for (const c of controlLabels(text)) {
      const first = c.label.replace(/\s+/g, " ").trim().split(" ")[0] ?? "";
      // A link that does not open on a verb is a place or a sentence, not an
      // action; it is held only to the opener rule.
      if (c.kind === "link" && !ACTION_VERBS.has(first) && !NON_VERB_LABELS.has(c.label)) {
        if (/^(the|my)\b/i.test(c.label.trim())) found.push(`${path}: link "${c.label}" opens on the or my`);
        continue;
      }
      const fault = actionLabelFault(c.label, places);
      if (fault !== null) found.push(`${path}: ${c.kind} "${c.label}" ${fault}`);
    }
    for (const s of foldSummaries(text)) {
      const fault = foldSummaryFault(s);
      if (fault !== null) found.push(`${path}: fold "${s}" ${fault}`);
    }
    for (const chip of chipLabels(text)) {
      if (chip.trim().split(/\s+/).length > 2) found.push(`${path}: chip "${chip}" over two words`);
    }
  }
  return [...new Set(found)].sort();
}

/**
 * L13 (ISC-596, the lead's ruling of 2026-09-30, option a). A wh-word used as a
 * noun, to stand in for a thing the sentence could name: "who wrote what", "what
 * you found", "where things live", "how Abductive helps". The shape is a wh-word
 * straight after a verb or preposition that takes a noun clause, with an object
 * pronoun allowed between ("tells you what"). Statements only: a question keeps
 * its wh-word, wherever it sits. The interview's, the checks' and the ordinary
 * version's prompts are exempt (the interview's own questions, and text the model
 * reads), and a run that keeps its wh-word is listed in `WH_ALLOW` with its reason.
 */
/** Prompt paths the rule does not read: the interview's questions and text sent to the model. */
const WH_EXEMPT_PATHS = /^(interview|lint|twin)\//;

/** Runs that keep a noun-clause wh-word, matched on the sentence's opening, each with its reason. */
export const WH_ALLOW: readonly { readonly run: string; readonly why: string }[] = [
  { run: "Write the answer now, out of what they said above.", why: "draft instruction, sent to the model" },
  { run: "Write the parts now, out of what they said above.", why: "draft instruction, sent to the model" },
  { run: "The setting for the whole study: what the researcher is looking at", why: "the framing's purpose, sent to the model" },
  {
    run: "Your answers then build a model of what you're studying",
    why: "the owner's front-page paragraph, word for word (ISC-586)",
  },
];

/** Every rendered statement in scope that breaks L13, as `path: "sentence"` lines. */
export function whNounClauseOffenders(): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    if (WH_EXEMPT_PATHS.test(path)) continue;
    const jsx = path.endsWith(".tsx") ? [...jsxAdjacentRuns(text), ...shortLabelRuns(text)] : [];
    for (const run of [...proseRuns(text), ...jsx]) {
      if (notCopy(run)) continue;
      for (const sentence of whNounClauses(run)) {
        if (WH_ALLOW.some((a) => sentence.startsWith(a.run))) continue;
        found.push(`${path}: "${sentence.slice(0, 110)}"`);
      }
    }
  }
  return [...new Set(found)].sort();
}

/**
 * L14 (ISC-601, the owner, 2026-09-30): "Do not start a sentence with 'no.'"
 * A sentence opening "No." or "No," is a flat denial, and the copy states the
 * correct thing instead. The determiner is a different word and passes this
 * scan; since M75 L21 (`noAmountOffenders` below) takes it out of the copy. Read
 * over prose runs, JSX text beside an expression and one-word labels, as L13 is.
 */

/** Every rendered run in scope that opens a sentence on a flat No. */
export function noDenialOffenders(): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    const jsx = path.endsWith(".tsx") ? [...jsxAdjacentRuns(text), ...shortLabelRuns(text)] : [];
    for (const run of [...proseRuns(text), ...jsx]) {
      if (notCopy(run) || !NO_DENIAL.test(run.replace(/\s+/g, " ").trim())) continue;
      found.push(`${path}: "${run.slice(0, 110)}"`);
    }
  }
  return [...new Set(found)].sort();
}

/**
 * L15 (the owner, 2026-09-30): "hold" is not a verb for a rule, a test, a claim
 * or a record ("History holds", "the rule holds"). Say what the thing does:
 * keeps, records, requires, stands, applies. Read per sentence over every
 * rendered run. A person holding a view is a different verb, and the few places
 * the method names one are listed in `HOLD_ALLOW` with their reasons, matched on
 * a phrase inside the sentence.
 */

export const HOLD_ALLOW: readonly { readonly phrase: string; readonly why: string }[] = [
  { phrase: "held in the setting", why: "people in the setting hold the expectation: the method's term for a belief, not a record" },
  { phrase: "holds this expectation in your setting", why: "the question that marks an expectation as held by people in the setting" },
  { phrase: "an expectation somebody holds", why: "a person holding a belief, which is what an expectation is" },
  { phrase: "currently holds an expectation", why: "an interview question about who in the setting believes something" },
  { phrase: "the account that you already hold", why: "an interview question about the researcher's own view" },
  { phrase: "the account that you hold is", why: "the researcher's own view, in a flag's falsifier" },
  { phrase: "held constant", why: "the methods term for what a comparison fixes" },
  { phrase: "one that the researcher already holds", why: "a checks prompt, sent to the model (Part 4)" },
];

/** Every rendered sentence in scope that uses hold as a verb, outside the list. */
export function holdOffenders(): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    const jsx = path.endsWith(".tsx") ? [...jsxAdjacentRuns(text), ...shortLabelRuns(text)] : [];
    for (const run of [...proseRuns(text), ...jsx]) {
      if (notCopy(run)) continue;
      for (const sentence of sentencesOf(run.replace(/\s+/g, " ").trim())) {
        if (!HOLD_VERB.test(sentence)) continue;
        if (HOLD_ALLOW.some((a) => sentence.includes(a.phrase))) continue;
        found.push(`${path}: "${sentence.slice(0, 110)}"`);
      }
    }
  }
  return [...new Set(found)].sort();
}

/**
 * L16 (the owner, 2026-09-30): "move" is not a noun for an act or a choice ("the
 * three moves", "each of these moves"). Name the act: the reply, the choice, the
 * request. The noun is "move" straight after a determiner, a number or a
 * describing word, or "moves" after "are"; the verb ("the file moves up", "move
 * on") has no determiner of its own. `MOVE_ALLOW` lists developer invariants in
 * interview/moves.ts that name the Move type rather than an act.
 */

export const MOVE_ALLOW: readonly { readonly phrase: string; readonly why: string }[] = [
  { phrase: "two moves share", why: "a developer invariant naming the Move type in interview/moves.ts, not an act on screen" },
];

/** Every rendered string in scope that uses move as a noun, outside the list. */
export function moveNounOffenders(): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    const jsx = path.endsWith(".tsx") ? [...jsxAdjacentRuns(text), ...shortLabelRuns(text)] : [];
    for (const run of [...proseRuns(text), ...jsx]) {
      if (notCopy(run)) continue;
      const flat = run.replace(/\s+/g, " ").trim();
      if (!MOVE_NOUN.test(flat) || MOVE_ALLOW.some((a) => flat.includes(a.phrase))) continue;
      found.push(`${path}: "${flat.slice(0, 110)}"`);
    }
  }
  return [...new Set(found)].sort();
}

/**
 * L17 (ISC-606, the owner, 2026-09-30): no rendered sentence gives acting power
 * to a non-entity. A claim doesn't check, a line doesn't name, a question
 * doesn't wait, a test doesn't hold, a page doesn't say, a flag doesn't raise
 * itself. Acts belong to agents (you, Abductive, the model, the reader, the
 * author, a colleague); things are in states ("a question is open for you at
 * Context", "the field is empty") and don't act.
 *
 * The shape: one of the tool's own nouns, after a determiner (or History, or
 * "your model" for the ontology), as the subject of an act verb, in a
 * statement. "Abductive" and "the model" (the language model) are agents and
 * pass. Waiting gets its own check, because the owner's example is one: a thing
 * "is waiting", "waits", or is "waiting on" a place. A progress line that opens
 * "Waiting for…" names no thing, and Abductive may wait. Prompts sent to the
 * model are listed in `AGENT_ALLOW` with their reasons; questions are left out.
 */
export const AGENT_ALLOW: readonly { readonly phrase: string; readonly why: string }[] = [
  { phrase: "Answer CONCERN if the data cannot reach the level that the question asks about", why: "a checks prompt, sent to the model (Part 4)" },
];

/** Every rendered statement in scope that breaks L17, outside the listed prompts. */
export function nonEntityOffenders(): string[] {
  const found: string[] = [];
  for (const { path, text } of FILES) {
    const jsx = path.endsWith(".tsx") ? [...jsxAdjacentRuns(text), ...shortLabelRuns(text)] : [];
    for (const run of [...proseRuns(text), ...jsx]) {
      if (notCopy(run)) continue;
      const flat = run.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
      if (AGENT_ALLOW.some((a) => flat.includes(a.phrase))) continue;
      for (const sentence of sentencesOf(flat)) {
        if (nonEntityActs(sentence)) found.push(`${path}: "${sentence.slice(0, 110)}"`);
      }
    }
  }
  return [...new Set(found)].sort();
}

/* ---------------------------------------------------------------------------
 * M64 (the owner, 2026-09-30). Two rules about the clause, read over every
 * rendered run in scope plus the surfaces M64 names that `IN_SCOPE` leaves out:
 * the README, the Report and the other exports, the flag labels the bias grid
 * prints from `matrix/matrix.ts`, and the interview's instructions to the model,
 * whose words come back to the researcher in the model's replies.
 * ------------------------------------------------------------------------- */

/**
 * The extra population, as `{ path, runs }`. The README is Markdown, so its
 * prose is its lines with code fences and inline code taken out. The matrix
 * file is prompt text end to end except for each cell's `flag`, which
 * `views/FlagPanel.tsx` printed beside the square until M89, so only those are
 * read. The
 * rest are TypeScript files that write a file the researcher opens or a prompt
 * whose words the model repeats, read with `proseRuns` like everything else.
 */
const M64_EXTRA_TS: readonly string[] = [
  "export/ontologyMemo.ts",
  "export/conceptsExport.ts",
  "export/agentGraph.ts",
  "export/wikiDirectory.ts",
  "export/sessionReplay.ts",
  /* M89: "concepts/readiness.ts" and "concepts/biasFirings.ts" went with the checks. */
  "concepts/reportSections.ts",
  "interview/prompt.ts",
  "interview/conversationPrompt.ts",
  "interview/puzzlePrompt.ts",
  "interview/designDigest.ts",
  "inference/mock.ts",
];

async function m64Extra(): Promise<readonly { path: string; runs: readonly string[] }[]> {
  const out: { path: string; runs: readonly string[] }[] = [];
  const readme = (await Bun.file(ROOT + "README.md").text())
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " … ");
  out.push({ path: "README.md", runs: readme.split(/\n/).map((l) => l.trim()).filter((l) => /\S\s\S/.test(l)) });
  const matrix = await Bun.file(SRC + "matrix/matrix.ts").text();
  out.push({
    path: "matrix/matrix.ts (flag labels)",
    runs: [...matrix.matchAll(/\bflag:\s*"([^"]+)"/g)].map((m) => m[1] ?? ""),
  });
  for (const rel of M64_EXTRA_TS) {
    if (FILES.some((f) => f.path === rel)) continue;
    out.push({ path: rel, runs: proseRuns(await Bun.file(SRC + rel).text()) });
  }
  return out;
}

const M64_EXTRA = await m64Extra();

/* ---------------------------------------------------------------------------
 * M74a (ISC-663). Three fixed strings in the Report's files broke L17 and the
 * "X, not Y" reframe and reached the student in the walk of 2026-10-02:
 * "17 suggested concepts wait for your decision.", "This is a design in
 * progress, not a finding.", and the readiness report's trace text. They
 * escaped because the L17 check and the reframe checks read `IN_SCOPE` only,
 * and the export files sit in M64's extra population, which only the clause
 * checks read; and because the L17 nouns name no concept, relation or
 * statement and `THING_WAITS` catches "waits" but not a plural "wait" after a
 * number. So the Report's files are read for both, and a plural thing that
 * waits is caught by its own pattern.
 * ------------------------------------------------------------------------- */
export const REPORT_REACH: readonly string[] = [
  "export/ontologyMemo.ts",
  "export/conceptsExport.ts",
  "export/agentGraph.ts",
  "export/wikiDirectory.ts",
  "export/sessionReplay.ts",
  "export/stamp.ts",
  /* M89: "export/exportFindings.ts", "concepts/readiness.ts" and
     "concepts/biasFirings.ts" went with the checks. */
  "concepts/reportSections.ts",
];

/** A concept, relation, statement or suggestion that waits, acts or decides. */
export const THINGS_ACT = /\b(?:concepts?|relations?|statements?|suggestions?)\s+(?:wait|waits|waiting|decides?|asks?|wants?|needs?|says?)\b/i;

export async function reportReachOffenders(): Promise<string[]> {
  const found: string[] = [];
  for (const rel of REPORT_REACH) {
    for (const run of proseRuns(await Bun.file(SRC + rel).text())) {
      if (notCopy(run)) continue;
      const flat = run.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
      if (NOT_X_ITS_Y.test(flat) || APPOSITIVE_NOT.test(flat)) found.push(`${rel}: reframe "${flat.slice(0, 110)}"`);
      for (const sentence of sentencesOf(flat)) {
        if (nonEntityActs(sentence) || THINGS_ACT.test(sentence)) found.push(`${rel}: L17 "${sentence.slice(0, 110)}"`);
      }
    }
  }
  return [...new Set(found)].sort();
}

/** Every run M64 reads: the scoped files' runs (JSX beside an expression and one-word labels too) and the extras. */
function m64Runs(): readonly { path: string; run: string }[] {
  const out: { path: string; run: string }[] = [];
  for (const { path, text } of FILES) {
    const jsx = path.endsWith(".tsx") ? [...jsxAdjacentRuns(text), ...shortLabelRuns(text)] : [];
    for (const run of [...proseRuns(text), ...jsx]) if (!notCopy(run)) out.push({ path, run });
  }
  for (const { path, runs } of M64_EXTRA) for (const run of runs) if (!notCopy(run)) out.push({ path, run });
  return out.map(({ path, run }) => ({ path, run: run.replace(/\\n/g, " ").replace(/\s+/g, " ").trim() }));
}

/**
 * L18 (the owner, 2026-09-30): every clause states its subject before its verb.
 * "Emerging project ontology opens at the first concept Abductive suggests" puts
 * the subject and verb of "Abductive suggests" after their object, so the reader
 * parses a complete sentence and then meets a stray subject. The shape is the
 * reduced relative clause: a determiner or possessive, up to two describing
 * words and a noun, then a subject, then a verb, with no "that", "which" or
 * "who" between. Questions are read too, since the rule is about the clause.
 *
 * The words between the determiner and the subject must all be content words:
 * a conjunction, a preposition, a relativizer or a verb that takes an object
 * ("tells you", "lets you", "for you") ends the noun phrase, and whatever
 * follows is a new clause or an object. The word after the subject must be a
 * verb or an auxiliary, which here means it is not one of the words that follow
 * an object pronoun (an article, a preposition, "to", "what").
 */
export const CLAUSE_ALLOW: readonly { readonly phrase: string; readonly why: string }[] = [];

/** Every rendered sentence in scope that holds a reduced relative, outside `CLAUSE_ALLOW`. */
export function reducedRelativeOffenders(): string[] {
  const found: string[] = [];
  for (const { path, run } of m64Runs()) {
    if (CLAUSE_ALLOW.some((a) => run.includes(a.phrase))) continue;
    for (const sentence of sentencesOf(run)) {
      const hits = reducedRelatives(sentence);
      if (hits.length === 0) continue;
      found.push(`${path}: [${hits.join(" | ")}] "${sentence.slice(0, 120)}"`);
    }
  }
  return [...new Set(found)].sort();
}

/**
 * L19 (the owner, 2026-09-30): "Avoid using terms like nothing and nobody." A
 * sentence about an absence says what is true of the thing or the person
 * instead: "nothing enters the ontology without a decision" becomes "every
 * concept enters the ontology by your decision". Nothing, nobody, no one and
 * nowhere, as whole words; "no" as a determiner ("No open flags", "No projects
 * yet.") is a different word and passes, and so does "no one-word sentences".
 */

export const NEGATIVE_ALLOW: readonly { readonly phrase: string; readonly why: string }[] = [];

/** Every rendered sentence in scope that uses a negative pronoun, outside `NEGATIVE_ALLOW`. */
export function negativePronounOffenders(): string[] {
  const found: string[] = [];
  for (const { path, run } of m64Runs()) {
    for (const sentence of sentencesOf(run)) {
      if (!NEGATIVE_PRONOUN.test(sentence)) continue;
      if (NEGATIVE_ALLOW.some((a) => sentence.includes(a.phrase))) continue;
      found.push(`${path}: "${sentence.slice(0, 120)}"`);
    }
  }
  /* A one-word literal never reaches `proseRuns`, and History's "What the event
     changed" cell printed one: `changed: "nothing"`. */
  for (const { path, text } of FILES) {
    for (const m of uncommented(text).matchAll(/["'`](nothing|nobody|nowhere)["'`]/gi)) {
      found.push(`${path}: "${m[1]}"`);
    }
  }
  return [...new Set(found)].sort();
}

/* ---------------------------------------------------------------------------
 * M65 (the owner, 2026-09-30): "Don't use the term never."
 * ------------------------------------------------------------------------- */

/**
 * L20. "Never" is an absolute that states an absence of time. A sentence says
 * what does happen ("Your key stays on this machine"), or states a rule as a
 * plain prohibition ("Do not supply the standard theoretical label"). The whole
 * word, in any case; a hyphenated identifier such as the retired check id
 * `paper-never-engaged`, which History still shows on old records, is not copy
 * and passes, as "nothing-said" does for L19.
 */

export const NEVER_ALLOW: readonly { readonly phrase: string; readonly why: string }[] = [
  /* M69, ISC-644. The rule against the word has to name the word for the model
     to keep it, in the owner's rules block and in the retry's rule line. */
  { phrase: 'the word "never"', why: "the L20 rule as the model reads it (src/copy/rules.ts, personas/voice.ts) names the banned word" },
  { phrase: "usually often always never", why: "the L18 detector's list of words that end a noun phrase (src/copy/rules.ts), not copy" },
];

/**
 * The prompts sent to the model. ISC-621 takes the word out of those too, and
 * most of them sit outside `IN_SCOPE` and the M64 extras by the carve-out at
 * the head of this file (`concepts/suggest.ts`, `inference/promptMarkers.ts`,
 * the proposal prompts, the checks' prompts, the bias grid's cells). So L20
 * reads every other source file under `src` as well, with the same run and
 * comment rules; tests and the shipped example are not read.
 */
async function l20Extra(): Promise<readonly { path: string; runs: readonly string[] }[]> {
  const seen = new Set<string>([...FILES.map((f) => f.path), ...M64_EXTRA.map((e) => e.path), ...M64_EXTRA_TS]);
  const out: { path: string; runs: readonly string[] }[] = [];
  for await (const rel of new Glob("**/*.{ts,tsx}").scan(SRC)) {
    if (seen.has(rel) || /\.test\.tsx?$/.test(rel)) continue;
    out.push({ path: rel, runs: proseRuns(await Bun.file(SRC + rel).text()) });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const L20_EXTRA = await l20Extra();

/**
 * Every run L20 reads: the scoped files' runs (JSX beside an expression and
 * one-word labels too), the M64 extras and the rest of `src`. `notCopy` is not
 * applied here. It drops a run that looks like code, and a prompt that quotes a
 * word before a colon (`Never write "ontology": the researcher…`) looks like
 * code to it; the whole word "never" inside a string is prose wherever it sits.
 */
export function l20Runs(): readonly { path: string; run: string }[] {
  const out: { path: string; run: string }[] = [];
  for (const { path, text } of FILES) {
    const jsx = path.endsWith(".tsx") ? [...jsxAdjacentRuns(text), ...shortLabelRuns(text)] : [];
    for (const run of [...proseRuns(text), ...jsx]) out.push({ path, run });
  }
  for (const { path, runs } of [...M64_EXTRA, ...L20_EXTRA]) for (const run of runs) out.push({ path, run });
  return out.map(({ path, run }) => ({ path, run: run.replace(/\\n/g, " ").replace(/\s+/g, " ").trim() }));
}

/** Every rendered sentence in scope, and every prompt sentence, that says "never", outside `NEVER_ALLOW`. */
export function neverOffenders(): string[] {
  const found: string[] = [];
  const runs = l20Runs();
  for (const { path, run } of runs) {
    for (const sentence of sentencesOf(run)) {
      if (!NEVER_WORD.test(sentence)) continue;
      if (NEVER_ALLOW.some((a) => sentence.includes(a.phrase))) continue;
      found.push(`${path}: "${sentence.slice(0, 120)}"`);
    }
  }
  /* A one-word literal does not reach `proseRuns`: a cell that printed
     `"never"` on its own would pass the sentence read. */
  for (const { path, text } of FILES) {
    for (const m of uncommented(text).matchAll(/["'`](never)["'`]/gi)) found.push(`${path}: "${m[1]}"`);
  }
  return [...new Set(found)].sort();
}

/* ---------------------------------------------------------------------------
 * L22 (the owner, 2026-10-30): "don't use the word 'card' to refer to stuff in
 * the tool. Use a more informative term or phrase." Read over L20's population,
 * every rendered run in scope, the M64 extras and every other source file under
 * `src`, which is where the prompts live, since the model echoes the prompt's
 * nouns back to the researcher.
 * ------------------------------------------------------------------------- */

/** Every class name written in `src`, which the card rule reads as styling. */
async function classNamesInSrc(): Promise<ReadonlySet<string>> {
  const out = new Set<string>();
  for await (const rel of new Glob("**/*.tsx").scan(SRC)) {
    const text = await Bun.file(SRC + rel).text();
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g)) {
      out.add((m[1] ?? m[2] ?? m[3] ?? "").replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

const CLASS_NAMES = await classNamesInSrc();

export const CARD_ALLOW: readonly { readonly phrase: string; readonly why: string }[] = [
  /* The rule against the word has to name the word for the model to keep it. */
  { phrase: 'the word "card"', why: "the L22 rule as the model reads it (personas/voice.ts) names the banned word" },
];

/** Every rendered sentence in scope, and every prompt sentence, that says "card" or "cards", outside `CARD_ALLOW`. */
export function cardOffenders(): string[] {
  /* A class name is styling, not copy: `className="card dissent"` names a CSS
     rule that a researcher never reads. */
  const classNames = CLASS_NAMES;
  const found: string[] = [];
  for (const { path, run } of l20Runs()) {
    if (classNames.has(run)) continue;
    for (const sentence of sentencesOf(run)) {
      if (!CARD_WORD.test(sentence)) continue;
      if (CARD_ALLOW.some((a) => sentence.includes(a.phrase))) continue;
      found.push(`${path}: "${sentence.slice(0, 140)}"`);
    }
  }
  for (const { path, text } of FILES) {
    for (const m of uncommented(text).matchAll(/(className=)?["'`](cards?)["'`]/gi)) if (m[1] === undefined) found.push(`${path}: "${m[2]}"`);
  }
  return [...new Set(found)].sort();
}

/* ---------------------------------------------------------------------------
 * M65 addendum (the owner, 2026-09-30): the passive with its actor missing.
 * ------------------------------------------------------------------------- */

/**
 * L18, the passive case. The owner, on the loop gate's "Sample opens once the
 * six steps in the loops have an answer or were set aside.": "This and other
 * sentences do not have a clear subject for the clause." "Were set aside" hides
 * who set the steps aside. An act names its agent: "Sample opens once you have
 * answered or set aside all six steps in the loops."
 *
 * The shape: a form of be or get, up to two adverbs, a past participle (a
 * regular -ed form or one of `IRREGULAR_PARTICIPLES`) and an optional particle,
 * with no "by" naming the agent straight after. A participle that reads as a
 * state ("the flag is open", "the field is empty") is an adjective, not an act;
 * the short list of such words is built in as `STATE_WORDS`, and a longer phrase
 * kept as a state goes in `STATE_ALLOW` with its reason.
 */
export const STATE_ALLOW: readonly { readonly phrase: string; readonly why: string }[] = [];

/**
 * Developer errors and validation messages that no researcher reads are out of
 * scope (the lead, M65 addendum). In the files outside `IN_SCOPE`, a string
 * thrown as an Error, pushed onto a validator's `errors`, or logged to the
 * console is taken out before the runs are read. The files in `IN_SCOPE` keep
 * theirs, because some of them throw the sentence a panel prints
 * (`auth/claudeAuth.ts`, `concepts/door.ts`).
 */
export function withoutDeveloperErrors(text: string): string {
  return text.replace(
    /\b(?:throw\s+new\s+\w*(?:Error|Exception)|new\s+\w*(?:Error|Exception)|errors\.push|console\.\w+)\s*\(\s*(["'`])(?:\\.|(?!\1)[^\\])*\1/g,
    " ",
  );
}

/** Every rendered sentence and prompt sentence with an agentless passive, outside `STATE_ALLOW`. */
export function agentlessPassiveOffenders(): string[] {
  const found: string[] = [];
  const runs: { path: string; run: string }[] = [];
  for (const { path, text } of FILES) {
    const jsx = path.endsWith(".tsx") ? [...jsxAdjacentRuns(text), ...shortLabelRuns(text)] : [];
    for (const run of [...proseRuns(text), ...jsx]) if (!notCopy(run)) runs.push({ path, run });
  }
  for (const { path, runs: r } of M64_EXTRA) for (const run of r) if (!notCopy(run)) runs.push({ path, run });
  for (const { path, runs: r } of L20_EXTRA_CLEAN) {
    // The eval harness writes a report for whoever maintains the checks; a researcher reads none of it.
    if (path.startsWith("eval/")) continue;
    for (const run of r) if (!notCopy(run)) runs.push({ path, run });
  }
  for (const { path, run } of runs) {
    const flat = run.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
    for (const sentence of sentencesOf(flat)) {
      if (STATE_ALLOW.some((a) => sentence.includes(a.phrase))) continue;
      const hits = agentlessPassives(sentence);
      if (hits.length === 0) continue;
      found.push(`${path}: [${hits.join(" | ")}] "${sentence.slice(0, 140)}"`);
    }
  }
  return [...new Set(found)].sort();
}

const L20_EXTRA_CLEAN: readonly { path: string; runs: readonly string[] }[] = await Promise.all(
  L20_EXTRA.map(async ({ path }) => ({ path, runs: proseRuns(withoutDeveloperErrors(await Bun.file(SRC + path).text())) })),
);

/* ---------------------------------------------------------------------------
 * M75 (the owner, 2026-10-03): "Don't use 'no' as an amount."
 * ------------------------------------------------------------------------- */

/**
 * L21. "No" is not a quantifier in rendered copy or in the prompts: "No projects
 * yet", "no passage behind it yet", "Write no blocks". A sentence says what is
 * there or what is still to come. Read over the L20 population with developer
 * errors taken out of the files outside `IN_SCOPE` and the eval harness left
 * out, as the passive scan reads it; questions pass. Anything kept is listed in
 * `NO_ALLOW` with its reason, and the list is meant to stay empty.
 */
export const NO_ALLOW: readonly { readonly phrase: string; readonly why: string }[] = [];

/** Every rendered sentence and prompt sentence that uses "no" as an amount, outside `NO_ALLOW`. */
export function noAmountOffenders(): string[] {
  const runs: { path: string; run: string }[] = [];
  for (const { path, text } of FILES) {
    const jsx = path.endsWith(".tsx") ? [...jsxAdjacentRuns(text), ...shortLabelRuns(text)] : [];
    for (const run of [...proseRuns(text), ...jsx]) runs.push({ path, run });
  }
  for (const { path, runs: r } of M64_EXTRA) for (const run of r) runs.push({ path, run });
  for (const { path, runs: r } of L20_EXTRA_CLEAN) {
    if (path.startsWith("eval/")) continue;
    for (const run of r) runs.push({ path, run });
  }
  const found: string[] = [];
  for (const { path, run } of runs) {
    const flat = run.replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
    for (const sentence of sentencesOf(flat)) {
      if (noAmounts(sentence).length === 0) continue;
      if (NO_ALLOW.some((a) => sentence.includes(a.phrase))) continue;
      found.push(`${path}: "${sentence.slice(0, 140)}"`);
    }
  }
  return [...new Set(found)].sort();
}
