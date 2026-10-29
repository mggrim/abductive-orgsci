/**
 * The owner's sentence rules L13 to L20, as one set of detectors (M69, ISC-644).
 *
 * Until M69 these lived only in `tests/copyBarScan.ts`, which scans the strings
 * in the source. The model's own prose reached the researcher unread by them, so
 * the chat, the ontology tab and the checks broke rules the app's own copy kept.
 * The detectors moved here so the scan and the runtime read the same regexes:
 * `tests/copyBarScan.ts` imports them for the source, and `inference/voiceRetry.ts`
 * runs them over each reply a researcher reads. The allow lists stay with the
 * scan, because they name runs in this repo; a model reply has no allow list.
 *
 * Every detector here reads one sentence (or one run, for L13 and L16) and
 * returns what it found. Nothing here reads files, so the browser can load it.
 */

/** Sentences within one run. */
export function sentencesOf(run: string): readonly string[] {
  return run.split(/(?<=[.!?])\s+/);
}

/* L13 (ISC-596): a wh-word asks; it does not stand in for a thing. The shape: a
 * wh-word straight after a verb or preposition that takes a noun clause, with an
 * object pronoun allowed between ("tells you what"). Statements only. */
const WH_WORDS = "who|what|when|where|why|how";
/* M78b, ISC-682: "answered" and "through" from the serendipity walk ("You haven't
 * answered what … expects", "mostly through what founders reported to you"). */
const WH_TRIGGERS =
  "shows?|shown|showing|knows?|knew|known|says?|said|sees?|saw|seen|tells?|told|logs?|logged|hides?|hid|asks?|asked|answers?|answered|explains?|explained|decides?|decided|reads?|checks?|checked|names?|named|notes?|noted|marks?|marked|finds?|found|learns?|learned|notices?|noticed|understands?|writes?|wrote|records?|recorded|chooses?|chose|describes?|described|states?|stated|captures?|captured|judges?|judged|is|are|was|were|about|of|with|in|for|on|from|to|by|into|at|between|as|over|under|through";
/* A wh-word after a coordinating "and" or "or" joins the object of the verb
 * before it ("records every change and who made it"). */
export const WH_NOUN_CLAUSE = new RegExp(
  `\\b(?:${WH_TRIGGERS}|and|or)\\s+(?:(?:you|them|us|me|him|her|it)\\s+)?(?:${WH_WORDS})\\b`,
  "i",
);

/** The sentences of a run that use a wh-word as a noun, questions left out. */
export function whNounClauses(run: string): readonly string[] {
  return run
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "" && !s.endsWith("?") && WH_NOUN_CLAUSE.test(s));
}

/** L14 (ISC-601): a sentence opening "No." or "No," as a flat denial. */
export const NO_DENIAL = /(?:^|[.!?]\s+)["']?No[.,](?=\s|$)/;

/**
 * L15: "hold" as a verb for a rule, a test, a claim or a record. "Hold constant"
 * and "held constant" pass: the owner's methods term for what a comparison fixes
 * across a sample (the Sample question, Matthew, 2026-10-15, M92), so a reply
 * that uses his word isn't sent back for a rewrite.
 */
export const HOLD_VERB = /\b(?:hold|holds|holding|held)\b(?!-)(?!\s+constant\b)/i;

/** L16: "move" as a noun for an act or a choice. */
export const MOVE_NOUN =
  /\b(?:a|an|the|these|those|this|that|each|every|any|no|your|their|its|one|two|three|four|five|several|many|normal|conventional|other|next|first|last|same)\s+moves?\b|\b(?:are|were)\s+moves\b/i;

/* L17 (ISC-606): only an agent acts. One of the tool's own nouns as the subject
 * of an act verb, in a statement, and a thing that "is waiting". */
const L17_NOUNS =
  "claims?|lines?|questions?|flags?|tests?|checks?|pages?|tabs?|fields?|chips?|records?|summary|summaries|suggestions?|steps?|projects?|answers?|notes?|sentences?|panels?|cards?|controls?|bars?|lists?|exports?|reports?";
const L17_VERBS =
  "asks|ask|checks|check|names|name|waits|wait|says|say|tells|tell|wants|want|decides|decide|judges|judge|reads|read|writes|write|records|record|raises|raise|expects|expect|knows|know|holds|hold|needs|need|looks|look";
const L17_PROGRESSIVE =
  "(?:is|are|was|were)\\s+(?:asking|checking|naming|saying|telling|wanting|deciding|judging|reading|writing|recording|raising|expecting|knowing|holding|needing|looking)";
const L17_DET = "(?:the|a|an|this|that|these|those|each|every|its|their|one|no|any|some|which|whose|six|nine|three|two)";

export const NON_ENTITY_ACT = new RegExp(
  `\\b(?:${L17_DET}\\s+(?:[\\w'\\u2019-]+\\s+){0,2}?(?:${L17_NOUNS})|your\\s+(?:[\\w'\\u2019-]+\\s+){0,2}?(?:${L17_NOUNS}|model|ontology)|History)\\s+(?:${L17_VERBS}|${L17_PROGRESSIVE})\\b`,
  "i",
);

export const THING_WAITS =
  /\b(?:is|are|was|were)\s+(?:already\s+)?waiting\b|\bwaits\b|\b[a-z]+\s+waiting\s+(?:on|at|above|for you)\b|\b(?:questions?|suggestions?|claims?|flags?|expectations?)\s+waiting\b/i;

/*
 * M78b, ISC-682: the things that told, showed and gave on the serendipity walk.
 * "That tells me the crib still produces leads", "It shows that at least one
 * lead …", "the oscilloscope queue gives me a clear picture", "her remark that
 * she didn't really go to the crib to meet people tells me", "and that gives the
 * helpers a concrete source". Two shapes: a bare "that", "this" or "it" opening a
 * clause on a verb of evidence, and a verb of evidence with "me" or "us" after it
 * whose subject is not a person.
 */
const EVIDENCE_VERBS = "tells|told|shows|showed|gives|gave|suggests|reveals|indicates|confirms|proves";
export const BARE_THING_ACTS = new RegExp(
  `(?:^|[.!?;:]\\s+|\\b(?:and|but|so|because|since)\\s+)["'\u201c]?(?:that|this|it)\\s+(?:${EVIDENCE_VERBS})\\b`,
  "i",
);
const EVIDENCE_TO_ME = new RegExp(`\\b(?:${EVIDENCE_VERBS})\\s+(?:me|us)\\b`, "gi");
/** Words that name a person, or a pronoun for one, as the subject of "tells me". */
const PERSON_WORDS = new Set(
  (
    "you you've you'd you'll you're they they've they'd they'll he she i i've i'd we we've we'd who someone everyone anyone " +
    "people person founder founders researcher researchers colleague colleagues reviewer reviewers reader readers participant participants " +
    "staff director technician supervisor supervisors interviewee interviewees student students abductive somebody everybody one"
  ).split(" "),
);
/** Words skipped on the way back from the verb to its subject: auxiliaries and adverbs. */
const SUBJECT_SKIP = new Set(
  "has have had 've 'd will would can could may might must did does do also just already then often still even once first later really usually always only".split(" "),
);
const OBJECT_AFTER = new Set("to with of for about at from by meet see watch ask".split(" "));
const THING_WORDS = new Set("that this it which".split(" "));

/** Whether "tells me" (or shows, gives) at `index` has a thing for its subject. */
function thingTellsMe(s: string, index: number): boolean {
  const before = s.slice(0, index).replace(/[\u2018\u2019]/g, "'").split(/\s+/).filter((w) => w !== "");
  let i = before.length - 1;
  while (i >= 0 && SUBJECT_SKIP.has(bare(before[i] ?? "").toLowerCase())) i -= 1;
  const raw = before[i];
  if (raw === undefined) return false;
  if (/[,;:]$/.test(raw)) return false;
  const w = bare(raw);
  const lower = w.toLowerCase();
  if (THING_WORDS.has(lower)) return true;
  if (!/^[a-z]/i.test(w)) return false;
  const person = PERSON_WORDS.has(lower) || /'s$/.test(lower) || (/^[A-Z]/.test(w) && i > 0) || (/^[A-Z]/.test(w) && i === 0 && !/^(?:The|A|An|Your|Their|Its|Our|My|This|These|Those)$/.test(w));
  if (!person) return true;
  /* "to meet people tells me": the person is the object of a verb or a
     preposition, and the subject sits further back. */
  const one = bare(before[i - 1] ?? "").toLowerCase();
  const two = bare(before[i - 2] ?? "").toLowerCase();
  return OBJECT_AFTER.has(one) || two === "to";
}

/** L17 on the walk's verbs of evidence (M78b, ISC-682). */
export function thingGivesEvidence(sentence: string): string | null {
  const s = sentence.trim();
  if (s === "" || s.endsWith("?")) return null;
  const bareMatch = s.match(BARE_THING_ACTS);
  if (bareMatch !== null) return bareMatch[0].replace(/^[.!?;:,\s]+/, "");
  for (const m of s.matchAll(EVIDENCE_TO_ME)) {
    if (thingTellsMe(s, m.index ?? 0)) return m[0];
  }
  return null;
}

/** A sentence that gives acting power to a non-entity, questions and agent-led lines left out. */
export function nonEntityActs(sentence: string): boolean {
  const s = sentence.trim();
  if (s === "" || s.endsWith("?")) return false;
  if (NON_ENTITY_ACT.test(s)) return true;
  if (thingGivesEvidence(s) !== null) return true;
  if (/^Waiting\b/.test(s) || /\bAbductive (?:is |stopped |was )?waiting\b/.test(s)) return false;
  return THING_WAITS.test(s);
}

/* L18 (ISC-617): every clause states its subject before its verb. The shape is
 * the reduced relative clause: a determiner or possessive, up to two describing
 * words and a noun, then a subject, then a verb, with no relativizer between.
 * Questions are read too, since the rule is about the clause. */
const L18_DET =
  "the|a|an|this|that|these|those|each|every|any|some|no|your|their|its|our|my|his|her|one|another|other|Abductive's|two|three|four|five|six|seven|eight|nine|ten|many|several|few|most";
const L18_HEADLESS = "everything|something|anything|everyone|anyone|one|ones";
const L18_SUBJECTS = [
  "you and Abductive", "you", "you're", "you've", "you'll", "you'd", "we", "we're", "we've", "I", "I'm", "I've",
  "Abductive", "it", "it's", "they", "they're", "they've", "he", "she", "someone", "anyone", "people", "others",
];
/** An agent named as a noun phrase: "the model", "a reviewer", "a careful colleague", "your readers". */
const L18_AGENT_NOUN =
  "model|researchers?|readers?|authors?|reviewers?|colleagues?|sceptics?|skeptics?|participants?|person|people|editors?|supervisors?|examiners?";
const L18_AGENT_DET = new Set(["a", "an", "the", "your", "their", "each", "every", "any", "most"]);
const L18_BARE_AGENT = new Set(["reviewers", "readers", "researchers", "colleagues", "participants"]);

/* A thing as the subject ("the port the bridge needs"): a determiner other than
 * "that", one or two words, and then a verb from this short list. */
const L18_THING_DET = new Set(["the", "a", "an", "your", "their", "its", "our", "this", "these", "those", "each", "every", "any"]);
const L18_STRICT_VERB = new Set(
  (
    "has have had is are was were can could will would should may might must does did doesn't don't can't won't isn't aren't wasn't hasn't haven't " +
    "belongs belong came comes needs need implies imply starts start owes owe expects expect cites cite shows show makes make takes take " +
    "draws draw rests rest depends depend carries carry leads lead raises raise asks ask keeps keep uses use found finds wrote writes reads " +
    "said says sets differ differs points sits covers assumes assumed broke breaks"
  ).split(" "),
);
/** Words that end a noun phrase: function words, and verbs that take the pronoun after them as their object. */
const L18_STOP = new Set(
  (
    "and or but nor so because if when whenever until unless while before after since as than where wherever whether that which who whom whose why how what " +
    "to of in on at by for from with without into onto about over under between through across against among around beyond within per via like " +
    "is are was were be been being am do does did has have had can could will would shall should may might must not n't " +
    "tells tell told gives give gave shows show showed lets let helps help helped makes make made asks ask asked takes take took keeps keep kept " +
    "leaves leave left sends send sent brings bring brought offers offer offered puts put reminds remind thank thanks gets get got " +
    "then also only even still yet again already just more less most least much many very too once usually often always never " +
    "all both half whichever whatever whoever somewhere anywhere everywhere " +
    "behind beside besides below above near toward towards upon inside outside during except despite along beneath past " +
    "doesn't don't didn't can't won't isn't aren't wasn't weren't haven't hasn't hadn't couldn't wouldn't shouldn't " +
    "means mean meant says say said thinks think thought knows know knew sits sit assumes assume " +
    "you it they we he she them us him me i " +
    "the a an this these those each every any some your their its our my his her another no"
  ).split(" "),
);
/** Words that follow an object pronoun and are not a verb: the pronoun was an object. */
const L18_NOT_VERB = new Set(
  (
    "a an the this that these those what which who whom whose where when why how to of in on at by for from with into about " +
    "and or but so if as than yet too also only just more your their its our my his her them us him me it you"
  ).split(" "),
);

function words(sentence: string): string[] {
  return sentence.replace(/[‘’]/g, "'").split(/\s+/).filter((w) => w !== "");
}

const bare = (w: string) => w.replace(/^[("'\[*_]+/, "").replace(/[)"'\].,;:!?*_]+$/, "");
const ends = (w: string) => /[,.;:!?)"\]]$|—$/.test(w) || /^\(/.test(w);

/** A thing subject at `at`: its length in words, or 0. The verb after it is checked by the caller. */
function thingSubject(ws: readonly string[], at: number): number {
  const w = ws[at] ?? "";
  if (!L18_THING_DET.has(bare(w).toLowerCase()) || ends(w)) return 0;
  for (const n of [1, 2]) {
    const tail = ws.slice(at + 1, at + 1 + n);
    if (tail.length < n || tail.some(ends)) return 0;
    if (tail.map((t) => bare(t).toLowerCase()).some((t) => L18_STOP.has(t) || L18_STRICT_VERB.has(t) || !/^[a-z][a-z'-]*$/.test(t)))
      return 0;
    const next = bare(ws[at + 1 + n] ?? "").toLowerCase();
    if (L18_STRICT_VERB.has(next)) return 1 + n;
  }
  return 0;
}

/** How many words of `ws` from `at` name an agent subject, or 0. */
function agentSubject(ws: readonly string[], at: number): number {
  const w = ws[at] ?? "";
  if (/^["'(“]/.test(w)) return 0;
  const b = bare(w);
  for (const subject of L18_SUBJECTS) {
    const sw = subject.split(" ");
    const got = ws.slice(at, at + sw.length);
    if (got.length < sw.length || got.slice(0, -1).some(ends)) continue;
    const said = got.map(bare).join(" ");
    if (said === subject || (subject !== "I" && said.toLowerCase() === subject.toLowerCase() && said !== "I")) return sw.length;
  }
  if (L18_BARE_AGENT.has(b.toLowerCase())) return 1;
  if (!L18_AGENT_DET.has(b.toLowerCase()) || ends(w)) return 0;
  const noun = new RegExp(`^(?:${L18_AGENT_NOUN})$`, "i");
  for (const n of [1, 2]) {
    const tail = ws.slice(at + 1, at + 1 + n);
    if (tail.length < n || tail.slice(0, -1).some(ends)) break;
    if (n === 2 && L18_STOP.has(bare(tail[0] ?? "").toLowerCase())) break;
    if (noun.test(bare(tail[n - 1] ?? ""))) return 1 + n;
  }
  return 0;
}

/** The reduced relative clauses in one sentence, each as the phrase that carries it. */
export function reducedRelatives(sentence: string): readonly string[] {
  const ws = words(sentence);
  const found: string[] = [];
  const det = new RegExp(`^(?:${L18_DET})$`, "i");
  const headless = new RegExp(`^(?:${L18_HEADLESS})$`, "i");
  for (let i = 0; i < ws.length; i += 1) {
    const w0 = ws[i] ?? "";
    const b0 = bare(w0);
    /* A sentence may open on a bare plural noun, with no determiner: "Questions
       Abductive asked you". Read it as a head of its own. */
    const isHeadless =
      headless.test(b0) ||
      (i === 0 && /^[A-Z][a-z]+s$/.test(b0) && !/^(?:Is|Has|Was|Does|This|Its|Yes|Thus|Unless|Perhaps|As|Always|Sometimes|Says)$/.test(b0));
    if (!det.test(b0) && !isHeadless) continue;
    // "Claims that cited those passages": "that" before a past tense is the relativizer itself.
    if (/^that$/i.test(b0) && /ed$/i.test(bare(ws[i + 1] ?? ""))) continue;
    if (ends(w0) && !isHeadless) continue;
    // Headless heads ("everything you saved") start the noun phrase themselves.
    for (let k = isHeadless ? 0 : 1; k <= 3; k += 1) {
      const mids = ws.slice(i + 1, i + 1 + k);
      if (mids.length < k) break;
      if (mids.some((m) => !/^[A-Za-z][A-Za-z'-]*[,.;:!?]?$/.test(m) || L18_STOP.has(bare(m).toLowerCase()))) break;
      if (mids.slice(0, -1).some(ends) || (k === 0 && ends(w0))) break;
      if (k > 0 && ends(mids[k - 1] ?? "")) break;
      // A possessive ("your named venue's reviewers") keeps the noun phrase going.
      if (k > 0 && /'s$/.test(bare(mids[k - 1] ?? ""))) continue;
      const at = i + 1 + k;
      const agent = agentSubject(ws, at);
      const n = agent > 0 ? agent : thingSubject(ws, at);
      if (n === 0) continue;
      const last = ws[at + n - 1] ?? "";
      const contracted = /'(?:re|ve|ll|d|m|s)$/i.test(bare(last));
      if (!contracted && ends(last)) continue;
      if (!contracted) {
        const next = ws[at + n];
        if (next === undefined) continue;
        const nb = bare(next).toLowerCase();
        if (!/^[a-z][a-z']*$/.test(nb) || L18_NOT_VERB.has(nb)) continue;
      }
      found.push(ws.slice(i, at + n + (contracted ? 0 : 1)).join(" "));
    }
  }
  return [...new Set(found)];
}

/* L18, the passive case (ISC-624): a form of be or get, up to two adverbs, a
 * past participle and an optional particle, with no "by" naming the agent later
 * in the clause. A participle that reads as a state is an adjective and passes. */
const PASSIVE_BE = "is|are|was|were|be|been|being|get|gets|got|isn't|aren't|wasn't|weren't";
const PASSIVE_ADVERB = "not|already|still|now|also|only|just|then|first|all|each|both|ever|never|always|often|usually|automatically|deliberately|again|once|yet|later|properly|actually|really|simply|explicitly|clearly";
export const IRREGULAR_PARTICIPLES =
  "given|shown|known|told|written|made|set|put|kept|held|left|taken|found|seen|sent|built|drawn|brought|chosen|thrown|read|run|begun|broken|spoken|hidden|lost|paid|said|heard|meant|laid|led|sold|caught|taught|thought|bought|cut|shut|struck|grown|fed|split|won|forgotten|gotten|understood|undone|withdrawn|overridden|rewritten|redrawn|shaken|stuck|spent|lent|dealt|felt|sunk|hung|bound|wound|ground|sought|outgrown|mistaken|overtaken|forbidden|beaten|bitten|ridden|driven|eaten|fallen|frozen|proven|sworn|torn|worn|woven";
const PASSIVE_PARTICLE = "aside|out|off|up|down|in|on|back|away|over|apart|through";
/** Participles that name a state rather than an act, so "is open" and "are done" pass. */
export const STATE_WORDS: ReadonlySet<string> = new Set(
  "open|empty|unchanged|ready|closed|blank|missing|present|absent|live|stale|due|done|set in|need|indeed|hundred|red|bed|shed|speed|seed|feed".split("|"),
);

export const PASSIVE_CLAUSE = new RegExp(
  String.raw`\b(?:${PASSIVE_BE})((?:\s+(?:${PASSIVE_ADVERB}))*)\s+([a-z]+ed|${IRREGULAR_PARTICIPLES})\b((?:\s+(?:${PASSIVE_PARTICLE})\b)?)`,
  "gi",
);

/** The agentless passive clauses in one sentence, each as the phrase that carries it. */
export function agentlessPassives(sentence: string): readonly string[] {
  const found: string[] = [];
  const flat = sentence.replace(/[‘’]/g, "'");
  for (const m of flat.matchAll(PASSIVE_CLAUSE)) {
    const participle = (m[2] ?? "").toLowerCase();
    const particle = (m[3] ?? "").trim().toLowerCase();
    if (STATE_WORDS.has(participle) || STATE_WORDS.has(`${participle} ${particle}`.trim())) continue;
    // "Unopened", "unvalidated": no verb "unopen" exists, so an un- participle is an adjective.
    if (/^un/.test(participle)) continue;
    // "Get started" is an idiom for beginning, and the front page's guide is called Getting started (L12).
    if (participle === "started" && /^get/i.test(m[0])) continue;
    const after = flat.slice((m.index ?? 0) + m[0].length);
    // An agent named later in the clause ("drawn by you") is not missing.
    if (/\bby\b/i.test(after.split(/[,.;:!?]/)[0] ?? "")) continue;
    found.push(m[0]);
  }
  return found;
}

/*
 * L18, the stranded preposition (M78b, ISC-682). On the serendipity walk the
 * retry fixed "why a bounded place where encounters happen" (L13) by writing "a
 * bounded place that encounters happen in or fail to happen in appeals to you",
 * which a reader parses three times. A relative clause on "that" or "which"
 * whose verb is an event's (happen, occur, take place) and which ends on a
 * preposition of place. A verb that takes its preposition ("the subject that
 * you're looking at") is the owner's own shape for L18, and passes.
 */
export const STRANDED_RELATIVE =
  /\b(?:that|which)\s+(?:[a-z']+\s+){1,3}?(?:happen|happens|happened|occur|occurs|occurred|takes? place|took place)\s+(?:in|at|within|inside)(?=\s+(?:or|and)\b|\s*[,.;:!?]|\s*$|\s+[a-z]+s\b)/i;

/** The relative clauses in one sentence that end on a stranded preposition. */
export function strandedRelatives(sentence: string): readonly string[] {
  const m = sentence.replace(/\s+/g, " ").match(STRANDED_RELATIVE);
  return m === null ? [] : [m[0]];
}

/** L19 (ISC-618): nothing, nobody, no one or nowhere, as whole words. */
export const NEGATIVE_PRONOUN = /(?<![\w-])(?:nothing|nobody|no[ -]one|nowhere)(?![\w-])/i;

/** L20 (ISC-621): the whole word "never"; a hyphenated identifier passes. */
export const NEVER_WORD = /(?<![\w-])never(?![\w-])/i;

/**
 * L21 (M75, ISC-666, the owner, 2026-10-03): "Don't use 'no' as an amount." The
 * whole word "no" before a noun phrase: "No projects yet", "no passage behind it
 * yet", "Write no blocks". "No." and "No," are L14's flat denial, "no one" is
 * L19's, "no longer" is a degree of time and not an amount, "yes or no" is a
 * choice, and a hyphenated identifier ("no-op") is not copy. Questions pass.
 */
export const NO_AMOUNT = /(?<!\byes or )(?<![\w'-])no(?![\w'-])\s+(?!longer\b|one(?![\w-]))(?=[a-z])/i;

/** The "no" quantifiers in one sentence, questions left out. */
export function noAmounts(sentence: string): readonly string[] {
  const s = sentence.replace(/\s+/g, " ").trim();
  if (s === "" || s.endsWith("?")) return [];
  const g = new RegExp(`${NO_AMOUNT.source}[\\w'-]+`, "gi");
  return [...s.matchAll(g)].map((m) => m[0]);
}

/* ---------------------------------------------------------------------------
 * The runtime reading (M69, ISC-644): one sentence of the model's prose against
 * every rule above, each break named with the rule it broke, so the retry can
 * carry the rule back to the model.
 * ------------------------------------------------------------------------- */

export type RuleId = "L13" | "L14" | "L15" | "L16" | "L17" | "L18" | "L19" | "L20" | "L21" | "REFRAME" | "QUOTE";

/**
 * The "X, not Y" reframe and "rather than" as sentence architecture (M74b,
 * ISC-665). The copy standard has banned the reframe since 2026-09-12, and the
 * model's rules block named it, but the runtime read only L13 to L20, so the
 * walk's openers kept "a thing to follow rather than a state of affairs to
 * describe" and a selected question kept "a real pattern and not an accident".
 * "Or not" at a question's end is a choice, and passes.
 */
export const REFRAME =
  /\brather than\b|,\s+not\s+(?:a|an|the|just|only|merely|my|your|their|its|because|about|to)\b|\band not (?:a|an|the|just|only|merely)\b/i;

/** Each rule in one line, as the retry prompt carries it to the model. */
export const RULE_TEXT: Readonly<Record<RuleId, string>> = {
  L13: "Use who, what, when, where, why and how only to ask a question. In a statement, name the thing instead.",
  L14: 'Do not open a sentence with "No." or "No," as a denial. State the correct thing instead.',
  L15: 'Do not use "hold" or "holds" as a verb for a rule, a test, a claim or a record. Say what the thing does.',
  L16: 'Do not use "move" as a noun for an act or a choice. Name the act: the reply, the choice, the request.',
  L17: "Only an agent acts: you, Abductive, the model, the reader, a colleague. A claim, a question, a flag or a page is in a state and does not act.",
  L18: "State each clause's subject before its verb, and name the agent of every passive verb.",
  L19: "Do not use nothing, nobody, no one or nowhere. Say what is true of the thing or the person.",
  L20: 'Do not use the word "never". Say what does happen, or state a rule as "Do not".',
  L21: 'Do not use the word "no" as an amount. Say what is there or what is still to come.',
  REFRAME: 'Do not set one thing against another with "rather than" or with an "X, not Y" reframe. Say what the thing is.',
  QUOTE:
    "Quote the researcher only word for word, from their own turns. Put their exact words in quotation marks, or say it in your own words without quotation marks.",
};

/**
 * The rule a rewrite of each one must also keep, because the easy fix for one
 * breaks the other (M74b, ISC-665). On the walk the retry fixed "what you're
 * looking at" (L13) by writing "the subject you're looking at" (L18), and fixed
 * "why people bother" (L13) by writing "the reason people bother" (L18).
 */
export const ALSO_KEEP: Readonly<Partial<Record<RuleId, readonly RuleId[]>>> = {
  L13: ["L18"],
  L18: ["L13"],
  L17: ["L18"],
  L19: ["L18", "L13"],
  L20: ["L18"],
  L21: ["L18", "L19", "L13"],
  REFRAME: ["L18", "L13"],
  QUOTE: ["L18"],
};

/** The right shape for a rule, by example, where a rewrite tends to miss it (M74b). */
export const RULE_SHAPE: Readonly<Partial<Record<RuleId, string>>> = {
  L18:
    'Restore the relative: "the subject you\'re looking at" becomes "the subject that you\'re looking at", and "the reason people bother" becomes "the reason that people bother". Or put the agent first: "you\'re looking at the subject". Keep a preposition in front of its relative: "a place that encounters happen in" becomes "a place in which encounters happen".',
  L17: 'Name the agent: "That tells me the crib still produces leads" becomes "You\'ve told me that the crib still produces leads", and "the episode gives me a clear picture" becomes "From the episode, I have a clear picture".',
  L13: 'Name the thing: "what you found" becomes "your finding", and "why people bother" becomes "the reason that people bother".',
  REFRAME: 'Say the one thing: "a thing to follow rather than a state to describe" becomes "a thing to follow".',
  L21: 'Say what is there or still to come: a missing passage becomes "a passage is still to come", and an empty list of flags becomes "You have settled every flag".',
};

export interface RuleBreak {
  readonly rule: RuleId;
  /** The words that broke it. */
  readonly at: string;
}

/** The rules one sentence breaks, in rule order; empty when it keeps them all. */
export function sentenceBreaks(sentence: string): readonly RuleBreak[] {
  const s = sentence.replace(/\s+/g, " ").trim();
  if (s === "") return [];
  const out: RuleBreak[] = [];
  const first = (re: RegExp) => s.match(re)?.[0] ?? "";
  const wh = whNounClauses(s);
  if (wh.length > 0) out.push({ rule: "L13", at: first(WH_NOUN_CLAUSE) });
  if (NO_DENIAL.test(s)) out.push({ rule: "L14", at: first(NO_DENIAL).trim() });
  if (HOLD_VERB.test(s)) out.push({ rule: "L15", at: first(HOLD_VERB) });
  if (MOVE_NOUN.test(s)) out.push({ rule: "L16", at: first(MOVE_NOUN) });
  if (nonEntityActs(s)) out.push({ rule: "L17", at: first(NON_ENTITY_ACT) || thingGivesEvidence(s) || first(THING_WAITS) });
  const clause = [...reducedRelatives(s), ...agentlessPassives(s), ...strandedRelatives(s)];
  if (clause.length > 0) out.push({ rule: "L18", at: clause[0] ?? "" });
  if (NEGATIVE_PRONOUN.test(s)) out.push({ rule: "L19", at: first(NEGATIVE_PRONOUN) });
  if (NEVER_WORD.test(s)) out.push({ rule: "L20", at: first(NEVER_WORD) });
  const amounts = noAmounts(s);
  if (amounts.length > 0) out.push({ rule: "L21", at: amounts[0] ?? "" });
  if (REFRAME.test(s)) out.push({ rule: "REFRAME", at: first(REFRAME) });
  return out;
}

/** Quoted spans in a reply: straight or curly double quotes, two words or more, or one word in a sentence. */
export function quotedSpans(text: string): readonly string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/"([^"\n]{2,200})"|\u201c([^\u201d\n]{2,200})\u201d/g)) {
    const span = (m[1] ?? m[2] ?? "").trim();
    if (span !== "") out.push(span);
  }
  return out;
}

const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();

/**
 * The quoted spans in a reply that the researcher did not write (M74b,
 * ISC-665). On the walk the student said their question "doesn't sound very
 * clever", and Abductive answered that it didn't share a worry that they were
 * "not very clever.": words in the student's mouth, about themselves. A span
 * passes when its words, punctuation and case aside, appear in their turns.
 */
export function misquotedSpans(reply: string, said: readonly string[]): readonly string[] {
  const theirs = ` ${plain(said.join(" "))} `;
  return quotedSpans(reply).filter((span) => {
    const words = plain(span);
    return words !== "" && !theirs.includes(` ${words} `);
  });
}

export interface OffendingSentence {
  readonly sentence: string;
  readonly breaks: readonly RuleBreak[];
}

/**
 * A structured reply's field label at the head of a line: "QUESTION: ",
 * "BECAUSE: ", "FIT: ", "SCOPE: ". Capitals, so a sentence that opens on a word
 * and a colon ("Note: …") keeps its word.
 */
export const FIELD_LABEL = /^[A-Z][A-Z_ ]{0,24}:\s+/;

/**
 * The sentences of a reply that break a rule. Read line by line, so a structured
 * reply ("FIT: fits", a block marker, a list) is split where its lines are and a
 * sentence never spans two fields. A line that carries no space is a marker or
 * an identifier rather than prose, and is skipped. A field label stays out of
 * the sentence (the Safari walk of 2026-10-02): the retry sends back prose only,
 * so a rewrite cannot drop the label that the turn's parser reads, and the
 * splice puts the new sentence after the label that is still there.
 */
export function offendingSentences(text: string): readonly OffendingSentence[] {
  const out: OffendingSentence[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\n/)) {
    if (!/\S\s\S/.test(line)) continue;
    for (const raw of sentencesOf(line.trim().replace(FIELD_LABEL, ""))) {
      const sentence = raw.trim();
      if (sentence === "" || seen.has(sentence)) continue;
      const breaks = sentenceBreaks(sentence);
      if (breaks.length === 0) continue;
      seen.add(sentence);
      out.push({ sentence, breaks });
    }
  }
  return out;
}
