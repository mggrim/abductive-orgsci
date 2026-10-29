# The copy standard for Abductive

Every string a researcher reads in Abductive is held to this page. The first part is the bar set on 2026-09-08 (M28); the second is the owner's instruction of 2026-09-12; the third is the owner's anti-AI writing guide, verbatim, from the same day; the fourth covers prompts; the fifth governs controls and labels (M61, 2026-09-30). `tests/copy-bar.test.ts` checks everything on this page a machine can check and lists each offending string by file. What a machine cannot check (whether a pronoun's referent is clear, whether a sentence sounds like a person) is checked by reading, and every build brief names the pass it ran.

The scope is the rendered surface: JSX text and string literals in the files `tests/copy-bar.test.ts` lists as in scope. Prompts sent to the model are a separate matter, handled in the last section, because rewording an instruction to a model changes what the model says.

## Part 1. The bar (2026-09-08)

- **C1.** No sentence over 25 words, average under 20. At most two clauses per sentence. At most eight words before the reader meets their own verb, something they do or get.
- **C2.** Second person, present tense, active voice. "You upload…", never "Material is ingested…".
- **C3.** No nominalisations where a verb exists. Attribution, interrogation, projection, declination, intervention, adjudication and disposition are banned in rendered copy unless a sentence is defining the term for a methods reader.
- **C4.** Every paragraph opens with what the researcher does or gets. Mechanism, provenance and philosophy come second or move behind a disclosure.
- **C5.** No sentence explains the tool's history. No sentence explains a design decision unless the researcher has to make a choice because of it.
- **C6.** Terms of art are introduced once per page with a plain gloss: ontology as "your model of the phenomenon" (since M83, "the concepts, relations and claims of your project", since "model" for the ontology is retired, ISC-700), ledger as "the record", station as "step", proposal as "a claim the tool drafted from your answer".
- **C7.** No AI-writing tells: no "not X but Y" chains, no triads for rhythm, no aphoristic closers, no rhetorical questions as headings, no em dashes.
- **C8.** Reads like NotebookLM's or Elicit's in-product copy: short, concrete, kind and confident.

## Part 2. Specificity (Matthew, 2026-09-12)

"Be specific in all of the writing throughout the tool. Avoid using non-specific pronouns like it or what."

- **C9.** Name the thing. A sentence does not open on "It", "This", "That" or "What" standing in for something that has a name on the page. "It reads the puzzle from your answers" becomes "The tool reads the puzzle from your answers"; "This is the tool's reading" becomes "This puzzle is the tool's reading"; "what you have saved" becomes "the answers you have saved". A question may open on "What". Inside a sentence, a pronoun is allowed only when its referent is the nearest noun before it and no other noun could be read as the referent.

## Part 3. The anti-AI writing guide (Matthew, 2026-09-12, verbatim)

A checklist for writing that sounds like a person, not a language model. The goal is prose that's direct, conversational, and trustworthy, with none of the rhythmic and lexical tells that scream "generated."

### Start here

- **Don't spam short sentences.** Avoid a steady drumbeat of clipped 3-to-6-word sentences. Don't stack three or four fragments to build rhythm ("Important emails buried. Drafts that sound nothing like us. Labels on the wrong threads."). Don't lean on parallel declaratives ("You don't lose access. You don't get locked out. Nothing changes."). Fold the list into flowing prose, usually one sentence with commas or a semicolon. A single short sentence for emphasis now and then is fine; the problem is *frequency* and *stacking*.
- **Use apostrophes/contractions most of the time.** Write the way people talk: "you're," "it's," "don't," "isn't," "that's," "you've," "won't," "we're," "you'll." Stiff expanded forms ("It is," "You are," "You will") read as robotic. The only exception is genuine emphasis where the full form carries weight ("You do not get that time back"), or formal legal/policy text.
- **Never use the "It's not X. It's Y." reframe.** This and its cousin "X isn't just Y. It's Z." are the classic LLM reframe structure and a dead giveaway. State the point directly instead.
- **Avoid the appositive reframe "X, not Y."** "an observation, not a diagnosis," "a signal to slow down, not a verdict," "that's not a criticism, it's an architecture." Same reframe reflex in miniature. Say what the thing is and stop.

### Sentence rhythm and structure

- **No one/two-word punch sentences.** "Off." "Period." "Gone." "Full stop." "Done." LLMs love dropping a single dramatic word as its own sentence for emphasis. Real writers don't. Use bold or rewrite directly.
- **No dramatic negation lists.** "Not 'reduce' them. Not 'set to deliver quietly.' Off." Stacking quoted rejections before a punchy payoff is pure theater.
- **No "That's where… / That's why… / That's the…" tacked-on payoffs.** Short demonstrative payoff sentences glued to the end of a paragraph ("That's the flywheel." "That's the spine." "That's the whole thing." "That's what gets talked about.") read as choppy. Fold the point into the preceding sentence with a comma or relative clause. Same for "It's the…" / "This is the…" payoffs.
- **No "This sounds X, but hear me out" setups.** The fake-objection-then-convince move. Just make the point.
- **Vary sentence length.** Mix long, flowing sentences with the occasional short one. Uniform medium-length sentences are as robotic as uniform short ones.
- **Don't open sentences with transition adverbs on a loop.** "Moreover," "Furthermore," "Additionally," "Notably," "Consequently" starting sentence after sentence is a tell. Connect ideas with "and," "but," "because," "so," or just let them stand.

### Word choice

- **Avoid the AI vocabulary.** These words are overrepresented in generated text: *delve, leverage, utilize, robust, seamless, elevate, unlock, empower, navigate (figuratively), landscape, realm, tapestry, testament, boasts, nestled, bustling, vibrant, crucial, pivotal, foster, garner, myriad, plethora, quietly, silently.* Prefer the plain word: "use" not "utilize," "strong" not "robust," "smooth" not "seamless."
- **"Real" is not a synonym for "significant" or "actual."** "The Real Problem," "What's Really Going On," "The Real Gap" are crutches for false authority. Name the thing directly.
- **Don't flag your own honesty.** Phrases like "the honest part," "the honest framing," "honestly," "to be honest," "I'll be straight with you," or "real talk" announce sincerity instead of earning it. Just say the thing. If a point is a caveat or a risk, state the caveat directly without a label.
- **Don't label your rhetorical move.** "Worth naming:," "Worth stating clearly:," "One honest caveat:," "Uncertainty flag:," "Reality check:," "On the substance:." Announcing the move you're about to make is the same tell as flagging honesty, one step up. Just make the move.
- **Skip the "load-bearing" analyst voice.** "Every clause here is load-bearing," "this quietly powers your whole argument," "that's doing real work." Add *load-bearing*, *quietly* (as in "quietly powers"), and "does real work" to the avoid list. Describe what the thing does in plain terms.
- **Drop "real" and "genuinely" as intensifying adjectives/adverbs.** "a real difference," "real results," "genuinely helpful," "genuinely care," "a genuine game-changer." These lean on the word to manufacture sincerity instead of earning it. If something is helpful, show how; the reader decides whether it's genuine.
- **Cut empty intensifiers.** "incredibly," "truly," "extremely," "really," "simply," "just." They add words, not meaning.
- **Cut filler-importance phrases.** "X is key," "X is crucial," "X is essential." Show why it matters instead of asserting that it does.
- **Cut hedging filler.** "It's worth noting that," "It's important to note," "needless to say," "as you may know." Delete and start with the actual point.
- **Don't over-hedge.** Stacking "can," "may," "might," "could" so nothing is stated plainly is a tell. Commit to claims you can stand behind.

### Openers and closers

- **No throat-clearing openers.** "In today's fast-paced world," "In the world of X," "In an era of," "Let's dive in," "Let's explore." Start with something concrete.
- **No conclusion-restating.** "In conclusion," "Ultimately," "At the end of the day," "All in all" wrap-ups that just summarize what you already said. End on the strongest concrete point.

### Constructions to avoid

- **Compulsive rule-of-three.** "Fast, reliable, and secure." Triads everywhere read as machine rhythm. Break the pattern; sometimes two items or four is more honest.
- **"Whether you're X or Y."** The catch-all audience sweep. Pick your actual reader and write to them.
- **"From X to Y."** "From startups to enterprises," "from onboarding to offboarding." Sweeping ranges that say nothing specific.

### Punctuation

- **No em dashes. Ever.** Use commas, periods, or rewrite the sentence.
- **No mid-sentence colons for drama.** Colons introduce lists or sections, not dramatic mid-sentence pauses. Use a semicolon or rewrite.

### Names and examples

- **Don't pair a Western first name with an Asian last name** (or any mismatched "diverse-sounding" combo) in fake/example names.
- **Banned fake names:** "Sarah Chen," "Mike Tanaka," "Mike Torres." Approved set: Emily Carter, Daniel Kim, Sofia Ramirez, James Miller, Chloe Park, Lily Klein, Ethan Brooks, Isabella Torres, Ravi Patel, Hannah Foster, Marcus Bennett, Grace Lee, Jacob Reed, Natalie Hayes, Adrian Flores, Maya Singh, Samuel Price, Olivia Ward, Leah Morgan, Gabriel Martinez.

### Voice and emphasis

- **Direct, conversational, second-person.** Write like a real person explaining something to a friend. No filler, no fluff.
- **Fun but professional and trustworthy.** Not try-hard. Avoid superlatives ("revolutionary," "game-changing") and hollow claims ("powered by cutting-edge AI").
- **Don't flatter or escalate.** "Now you're pushing up against the part that matters most," "the strongest version of your point," "this is exactly the story you want to be telling," "the post is ready to ship." Escalating praise of how sharp or deep something is reads as chatbot sycophancy. Assess plainly and let the work stand on its own.
- **Bold for key terms and emphasis. Italic only for callout subtitles.**
- **Reference real, concrete concepts** (e.g., the Framing Effect, Sunk Cost Fallacy) to build authority instead of vague appeals. Do not overdo this, however; use it very sparingly, only when it would naturally flow with the rest of the text.

### Purpose and stance

- **Don't shill the product.** This writing exists to be useful on its own, not to funnel readers into a sale. Lead with help the reader can act on whether or not they ever buy anything.
- **Be authentic and helpful first.** Write to actually solve the reader's problem. Earn trust by being right and clear, not by selling.
- **Be empathetic to the difficulty of the reader's work.** They're stretched thin, making decisions with imperfect information. Acknowledge that reality without condescending to it. Don't pretend their problems are simple, and don't lecture. Meet them as a knowledgeable peer who respects how hard the work is.

### Quick self-check before publishing

1. Read it aloud. Does any stretch sound like a drumbeat of short sentences? Fix the rhythm.
2. Search for em dashes, "It's not… it's…," "X, not Y" reframes, "That's why/where," meta-labels ("Worth naming:," "Reality check:"), "load-bearing," and the AI vocabulary list. Remove.
3. Are contractions used naturally throughout? If it reads stiff, loosen it.
4. Did you open with throat-clearing or close with a restated summary? Cut both.
5. Count your rule-of-three triads. If there are several, vary them.
6. Is every claim either stated plainly or honestly hedged, with no filler-importance padding?
7. Does any section read like a pitch? If you stripped the product out, would the piece still be useful? It should be.

## Part 4. The model's own voice

Most of what a researcher reads is written by the model: the questions at each step, the puzzle as the tool reads it, the drafts, the findings. Those strings cannot be edited; they are shaped by the prompts in `src/interview/`, `src/inference/promptMarkers.ts` and `src/lint/`. The shared marker every prompt carries states the mechanical parts of this page for the model: address the researcher as "you", name the thing rather than write "it", use contractions, no em dashes, no "It's not X. It's Y.", no triads for rhythm, no one-word sentences. The voice gate (`src/inference/voiceGate.ts`) rewrites any dash the model still produces and keeps the raw text on the record.

Since M69 (ISC-644) the prompts carry the owner's rules too, as `OWNER_RULES` in `src/personas/voice.ts` (part of `PROSE_CONTRACT`, under 200 words): L13 to L20 in the model's terms, contractions, no dashes and no "X, not Y" reframe. The detectors for L13 to L20 live in `src/copy/rules.ts`, which both `tests/copyBarScan.ts` and the runtime import. After a call whose prose a researcher reads (the chat, the concept, relation and statement suggestions with the homes pass, paper fit, the bias scan's challenges, the checks' reasons, the rival, the extractor, the puzzle reading and the ordinary version), `src/inference/voiceRetry.ts` reads the reply sentence by sentence; when a sentence breaks a rule, Abductive asks the model once to rewrite only the offending sentences, each with the rule it broke, and keeps the result either way. The event records `voiceRetry: true` and the first reply in `rawText`. Summarise is left out on purpose: its summary is the researcher's own words, and a rewrite would change them.

## Part 5. Controls and labels (M61, 2026-09-30)

Parts 1 to 4 govern sentences. This part governs the words on controls, tabs, folds, chips, fields and messages. It comes from the survey of academic research tools in `docs/research/ui-conventions-2026-09-30.md` (source tokens such as s23 resolve in its source list) and from the owner's six decisions on that survey. Where a rule here meets C1 to C9, the label rule wins on a control and the sentence rules win in a sentence.

### The six decisions (Matthew, 2026-09-30)

1. **Project, not study.** "New project", "Projects" in the rail, "Import project", and every sentence.
2. **Suggestion, Accept and Reject**, not draft, Put it in and Turn it down: "Suggested claims", "Suggest answer", "Suggest starting point", "Accept", "Reject". (M62, the owner, 2026-09-30: the two controls that write a step's answer out of its conversation are a summary of it, so "Suggest answer" and "Suggest starting point" read "Summarise", the fields they fill are summaries, and History says "Summarised from the conversation". ISC-598.)
3. **The Material tab is Sources** (NotebookLM's word), with two sections, Papers and Data.
4. **Abductive is the actor** ("Abductive suggests…", "Abductive asks…"), and "the model" is the language model itself. "Model access" stays. The actor label on the tool's turns in History reads "Abductive".
5. **History and Report.** "The record" becomes History everywhere a researcher reads it: the header control, the panel and the sentences. The exported memo becomes the Report.
6. **A label, then at most one sentence.** A control carries a one-to-three-word label in sentence case. At most one short sentence stays under a control, and only where a first-time reader needs it. Provenance and mechanism move behind a "Learn more" fold.

Record identifiers, event types, routes, stored keys, the JSON exports' keys and the shipped example keep their names. Prompts to the model change only where they quote a label the researcher sees.

### The rules

- **L1. An action control is an imperative verb phrase of one to three words, in sentence case.** "Save answer", "Add papers", "Run checks". No trailing period, and no label opens on "the" or "my". A place name inside a label counts as one word, so "Go to Starting point" passes. One label is the owner's, verbatim, and four words long: "Auto-generate summary from chat", under each summary on Starting point and Design (Matthew, 2026-10-15, M92), listed in `OWNER_LABELS` in `tests/copyBarScan.ts`. A second is the owner's too, four words, under the chat at every step: "Surface concepts and relationships" (Matthew, 2026-10-16, M93: "a button that says surface concepts and relationships"); it keeps "relationships", his word, beside the tab's "relations". The owner's definition of the puzzle of the same day, "The puzzle is the surprise: what you see, or expect to see, that current accounts can't explain.", keeps its colon and its "current accounts" wherever it is printed. Sources: ACT1 (Taguette s15, NotebookLM s23, Claude s30).
- **L2. A place is a noun of one or two words.** A tab, a rail entry or a section named as a place has no question mark and no leading article or possessive, and a two-word place does not open on a verb. A one-word tab may name a stage with a verb, as desktop suites do (MAXQDA's Import and Export tabs), which is why the tab is Export. L2 admitted one possessive, the Your model tab: "Model" beside "Model access" would name two things with one word, since decision 4 makes "the model" the language model (the lead's ruling, 2026-09-30). The tab has been Emerging project ontology since M63, the owner's three words, and the admission went with the word at M83. Sources: NAV1, NAV2, NAV3 (Claude s30, Zotero s25, MAXQDA s10).
- **L3. A control that starts AI work is named for its result.** "Suggest claims", "Summarise", "Check design", "Run checks". Checked by reading. Sources: ACT2 (ATLAS.ti s9, Elicit s18).
- **L4. A destructive control names its object, and the confirm button repeats the verb.** "Delete project", "Remove document", "Retire claim". Cancel closes a confirmation and does nothing else. Accept and Reject sit on the suggestion's own card, and the card names the suggestion. Sources: DES1, DES2 (Zotero s25, Taguette s15).
- **L5. One verb per kind of object.** Save for your own writes; Accept and Reject for a suggestion; Dismiss for a flag; Retire for a claim; Remove for a document or a link; Delete for a project or a key. Skip (for a question) and Set aside (for a step) went at M69 with the "Not now" chip and the "Set step aside" control (the owner, 2026-10-02: "They can just move on"); a researcher who leaves a question or a step simply moves on, and "I don't know" is a reply, not a verb. The retired verbs are put in, turn down, forget, withdraw, drop, put away, and record as a button. Sources: DES1 to DES7.
- **L6. Import brings in a file, Add or Upload brings in a source, and Export sends one out.** When the control says Export, the status line says "exported", never "downloaded". Sources: IMP1, IMP2 (Taguette s15, Elicit s18c).
- **L7. An empty state says what belongs there, then offers the one action that puts it there, in at most two sentences.** "Add papers to start; they appear here." (M75: an empty state says what is still to come, by L21.) Checked by reading. Sources: EMP1.
- **L8. A status chip is one or two words, with no article.** "Open question", "Saved", "Unread". Sources: STA4 (Scite s20).
- **L9. An error says what failed, then what to do, and names Abductive as the actor.** "Abductive couldn't read the file. Try again." Sources: CFM1, CFM4 (NotebookLM s23).
- **L10. The AI is named by its role.** Abductive is the actor in a sentence, "the model" is the language model, and output from the model carries the label "AI-suggested". "The tool", "the language model" and "persona" do not appear in rendered copy. Sources: AI1 to AI4 (ATLAS.ti s9, Elicit s18, MAXQDA s12). Two runs are exceptions, the owner's wording of 2026-10-14: the ninth question card's help names the three origins of an idea as "(you, your early data or the AI)" (ISC-717), and the framework's lede says "Answering one step changes what the AI will ask at other steps." (ISC-718).
- **L11. A field label is a short noun of three words or fewer, the question is help text, and a placeholder is an example.** Sources: FLD1, FLD2 (Claude s30, Taguette s15).
- **L12. One term per object, everywhere.** The table below holds the terms. An explanation sits behind a fold whose summary reads exactly "Learn more", and no heading or fold ends in a question mark. Sources: the NVivo terminology change (s4), NotebookLM's "Learn more" (s23), C7. The one exception is the front page's nine questions: each card's heading is a co-author's question and keeps its question mark (Matthew, 2026-10-06, ISC-697). The same day the table gained the ontology row, and the claim gloss in the table below reads "your ontology" (Matthew, 2026-10-06, ISC-700).

| Object | Say | Never |
|---|---|---|
| The researcher's whole piece of work | project | study |
| What the model proposes for you to decide on | suggestion, suggest, suggested | draft, proposal |
| Who acts when the model's work reaches you | Abductive | the tool |
| The language model itself | the model | the language model, persona |
| The log of every change and its author | History | the record, the ledger |
| The exported written account | Report | memo (a memo is the researcher's own note, and stays in "transcripts, field notes or memos") |
| The tab holding papers and data | Sources, with Papers and Data | Material |
| Something a check raised for you to review | flag | finding (a finding is a research result) |
| The framing form | Starting point | design brief, brief |
| The step for material collected before the design is settled | Early data | pilot data |
| The front page's guide | Getting started | walkthrough |
| The researcher's web of concepts, relations and claims | ontology, your ontology | model, your model |

### Terms with no twin

The puzzle, the bind, expectation, claim, the origin marks, passage, the two loops and the ordinary version keep their names, because no research tool has a word for them and the method needs them. Each is introduced once per page with a plain gloss in parentheses, the way ATLAS.ti writes "quotations (= selections from these documents)" (s6), and after that the gloss sits behind "Learn more".

| Term | Gloss |
|---|---|
| puzzle | what your project can't yet explain |
| bind | a tension between two demands that people in your setting feel |
| expectation | what a paper leads readers to expect |
| claim | a statement in your ontology |
| origin mark | who put the claim there |
| passage | a stretch of a document |
| loop | a group of steps that change each other's answers |
| ordinary version | a by-the-book design of your project |

- **L13. A wh-word asks; it never stands in for a thing.** Who, what, when, where, why and how open a question. In a statement they don't stand in for a thing the sentence could name: "who wrote what" is authorship, "where things live" is the parts of a project, "what you found" is your finding, "how Abductive helps" is Abductive's help. Rewrite with the thing named. A question keeps its wh-word wherever it sits, and a relative ("anyone who", "the tab, where") or a conjunction ("when you save") is not a noun. The interview's own questions and the prompts sent to the model are out of scope, and a run that keeps one is listed with its reason. (ISC-596, the owner, 2026-09-30.) One label is an exception: the kicker over the help on each of the front page's nine question cards reads "How Abductive might help", a co-author's wording, by the owner's ruling of 2026-10-14 (ISC-709). The label replaced "Abductive's help", which ISC-596 had named under this rule.
- **L14. A sentence doesn't open on a flat "No".** The owner, 2026-09-30: "Do not start a sentence with 'no.'" A sentence in rendered copy that opens with "No." or "No," as a denial ("No. The tool reads…") states the correct thing instead: "Abductive reads…". The determiner carve-out that this rule once made ("No open flags", "No projects yet.") closed at M75: "no" before a noun is an amount, and L21 takes it out. (ISC-601, ISC-666.)
- **L15. "Hold" is not a verb for a rule, a test, a claim or a record.** The owner, 2026-09-30: no "History holds", no "the rule holds". Say what the thing does: History keeps every event, a claim applies or stands, a bind stands or resolves, a file lists or has, a flag's design doesn't fit together. A person holding a view is a different verb and stays where the method names it (an expectation held in the setting, the account you hold, what a comparison holds constant); each such phrase is listed in `HOLD_ALLOW` with its reason. One phrase is the owner's exception, his wording of 2026-10-15 for the Sample question ("And what would you ideally want to hold constant across the sample?", M92): "hold constant" and "held constant", the methods term for what a comparison fixes across a sample, pass the detector itself (`HOLD_VERB` in `src/copy/rules.ts`), so the copy scan and the check on the model's replies both let it stand. The same question is three questions in one prompt, by the same ruling.
- **L16. "Move" is not a noun for an act or a choice.** The owner, 2026-09-30: no "the three moves", no "each of these moves". Name the act: the reply, the choice, the request, the action. The verb stays ("the file moves up", "move on"), and identifiers such as `interview/moves.ts` are not copy.
- **L17. Only an agent acts.** The owner, 2026-09-30 (ISC-606): a claim doesn't check, a line doesn't name, a question doesn't wait, a test doesn't hold, a page doesn't say, a flag doesn't raise itself. Acts belong to agents: you, Abductive, the model, the reader, the author, a colleague. Things are in states: "a question is open for you at Context", "the field is empty", "the flag is open". Rewrite with the agent named ("you wrote in the summary", "Abductive reads your ontology for every check") or the state stated ("One question is open for you on the Design tab").
- **L18. Every clause states its subject before its verb.** The owner, 2026-09-30 (ISC-617), on "Emerging project ontology opens at the first concept Abductive suggests.": "The subject and verb for the clause comes after the direct object. Look for all similar language where the subject in the clause is missing or follows from the direct object and fix it. All clauses need to ensure clarity of the subject." The shape is the reduced relative clause: a noun, then a subject (you, Abductive, the model, the researcher, someone, a reviewer), then a verb, with no "that", "which" or "who" between. The reader parses the sentence as complete at the noun and then meets a stray subject and verb. Restore the relative ("the first concept that Abductive suggests") when the noun phrase is the point, as in a label or a list item ("a concept that you accepted"), or put the agent first when the sentence is about the act ("Emerging project ontology opens when Abductive suggests a first concept"). A clause that opens on "which" or "whose" as a question word ("History shows which model it ran") states its subject before its verb and passes. The same rule covers the agentless passive. The owner, later the same evening (ISC-624), on "Sample opens once the six steps in the loops have an answer or were set aside.": "This and other sentences do not have a clear subject for the clause." "Were set aside" hides who set the steps aside, and "have an answer" hides who answered. An act names its agent, or the clause turns active: "Sample opens once you have answered or set aside all six steps in the loops." The agent is you, Abductive, the model, the reader, the author, a reviewer or the people in your setting. A state stays where the participle is an adjective ("the flag is open", "the field is empty", "the world that your project is set in"), and "Abductive keeps the key for this session only" beats "the key is kept for this session only". Prompts sent to the model follow the same rule; developer errors that no researcher reads do not.
- **L19. Say what is true, not what is absent.** The owner, 2026-09-30 (ISC-618): "Avoid using terms like nothing and nobody." Nothing, nobody, no one and nowhere are out of rendered copy. A sentence about an absence says what is true of the thing or the person instead: "nothing enters the ontology without a decision" becomes "every concept enters the ontology by your decision", "nobody has answered" becomes "the question is still open", "Nothing matches your search" becomes "Your search matches none of the entries" or, better, says what is there. "No" before a noun is an amount, and L21 covers it.
- **L20. Say what does happen, and state a rule as "Do not".** The owner, 2026-09-30 (ISC-621): "Don't use the term never." The word is an absolute that states an absence of time. A sentence in rendered copy says what does happen instead: "Abductive never sends your key anywhere" becomes "Your key stays on this machine", "the mark never changes" becomes "the mark is permanent", "so questions never stack up" becomes "Abductive keeps one question open at a time". A rule, in copy or in a prompt sent to the model, is a plain prohibition: "Never supply the standard theoretical label" becomes "Do not supply the standard theoretical label". Put the affirmative first where the sentence allows it. A hyphenated identifier such as the retired check id `paper-never-engaged`, which History still shows on old records (M87), is not copy and stays.
- **L21. "No" is not an amount.** The owner, 2026-10-03 (ISC-666): "Don't use 'no' as an amount." "No projects yet", "no passage behind it yet", "No open flags" and "no concepts on the map yet" count a thing at zero. Say what is there, or what is still to come: "you haven't added a project yet", "a passage is still to come", "every flag is settled", "accept a concept and it appears here". An empty state, a "No X yet" status and a "no … yet" sentence all follow this rule, and so do the prompts sent to the model ("Write no blocks" becomes "Write a block only when…"). "No." and "No," as a denial are L14's; "no one" is L19's; "no longer", "yes or no" and a hyphenated identifier ("no-op") are not amounts and stay. A question keeps its "no". The ISA's own criteria text is not copy.

### What the scan checks

`tests/copy-bar.test.ts` reads every button and link in the files in scope (the text between the tags, each branch of a ternary read as its own label), the tab and rail labels in `ui/routes.ts`, the keyboard bindings, every fold's summary and every status chip, and fails on the list below. For the retired words it also reads the text that sits beside an expression in JSX ("The tool drafted {share}.") and one-word headings and label props, which the older checks leave out. It fails on:

- an action label over three words, not in sentence case, ending in a period, or opening on a word that isn't an imperative verb (replies such as "I don't know", and Next, Back and Previous, are listed);
- a label, tab or fold opening on "the" or "my";
- a place name over two words, or opening on an article or a possessive (Emerging project ontology excepted, as the owner's wording), or a two-word place opening on a verb;
- a destructive label (Delete, Remove, Retire, Clear) with no object;
- a status chip over two words;
- a fold whose summary ends in a question mark, opens on How, What, Why, When or Where, or mentions "Learn more" without being exactly "Learn more";
- L13: a statement with a wh-word straight after a verb or preposition that takes a noun clause (says what, see where, of what, with who; "tells you what" too), questions and the interview's, checks' and ordinary version's prompts left out, and three runs listed in `WH_ALLOW` with their reasons;
- L14: a sentence opening "No." or "No," in any rendered run (the determiner is L21's);
- L15: hold, holds, holding or held in any rendered sentence, outside the phrases in `HOLD_ALLOW`;
- L16: move or moves straight after a determiner, a number or a describing word ("these moves", "a normal move"), or "moves" after "are", outside `MOVE_ALLOW`;
- L17: one of the tool's own nouns (claim, line, question, flag, test, check, page, tab, field, chip, record, History, summary, suggestion, step, project, your model, your ontology, answer, note, sentence, panel, card, control, bar, list, export, report) as the subject of an act verb (asks, checks, names, waits, says, tells, wants, decides, judges, reads, writes, records, raises, expects, knows, holds, needs, looks) in a statement, and a thing that "is waiting", "waits" or is "waiting on" a place; questions, lines that open "Waiting for…", and the prompts in `AGENT_ALLOW` left out;
- L18: a determiner or possessive, up to two describing words and a noun (or a headless everything, something, anything, everyone or anyone, or a plural noun opening a sentence), then a subject (you, we, I, Abductive, it, they, someone, anyone, people, the model, the researcher, the reader, the author, a reviewer, a colleague, readers, reviewers) and then a verb or an auxiliary, with no relativizer; questions included. The window ends at a conjunction, a preposition, a relativizer, another determiner or a verb that takes the pronoun as its object ("tells you", "lets you", "for you"), and a possessive keeps it going ("your named venue's reviewers"). It reads every rendered run in scope and, for M64, the README, the exports (the Report, the concept map, the agent graph, the wiki folder, the session replay, the readiness report), the bias grid's flag labels in `matrix/matrix.ts` and the interview's instructions to the model, whose words come back in the model's replies. Anything kept is listed in `CLAUSE_ALLOW` with its reason;
- L18, the agentless passive: a form of be or get (is, are, was, were, be, been, being, get, gets, got, and their negatives), up to two adverbs, a past participle (a regular -ed form or one of `IRREGULAR_PARTICIPLES`) and an optional particle (aside, out, off, up, down, in, on, back, away), with no "by" naming the agent later in the clause. It reads the L20 population, with strings thrown as errors, pushed onto a validator's errors or logged to the console taken out of the files outside `IN_SCOPE`, and the eval harness left out. Participles in `STATE_WORDS` (open, empty, unchanged, ready, closed, blank, missing, present, absent, live, stale, due, done, set in), un- participles such as "unopened", and "Getting started" read as states and pass. Anything else kept is listed in `STATE_ALLOW` with its reason;
- L19: nothing, nobody, no one or nowhere as a whole word in the same population, and a one-word literal such as History's `changed: "nothing"`; "no one-word" and hyphenated identifiers ("nothing-said") pass. Anything kept is listed in `NEGATIVE_ALLOW` with its reason;
- L20: never as a whole word, in any case, in the same population and in every other source file under `src`, which is where the prompts sent to the model live (`concepts/suggest.ts`, `inference/promptMarkers.ts`, the proposal prompts, the checks' prompts, the bias grid's cells), and a one-word literal `"never"` in a scoped file; hyphenated identifiers pass. The shipped example is data and is not read. Anything kept is listed in `NEVER_ALLOW` with its reason;
- L21: the whole word "no" followed by a noun phrase, in the L20 population with developer errors and the eval harness left out, as the passive scan reads it, and questions left out; "no longer", "no one" (L19), "yes or no" and hyphenated identifiers pass. Anything kept is listed in `NO_ALLOW` with its reason, and the list is empty;
- the retired words in any rendered run: study, draft, proposal, "the tool", memo outside the list of a researcher's own files, "the record", ledger, Material as the tab, the retired verbs "put it in" and "turn it down", and "your model" for the ontology (M83, ISC-700; "the model" and "your model provider" name the language model and pass). Five prompt runs keep an old word, each listed with its reason in `RETIRED_ALLOW` in `tests/copyBarScan.ts`, because a prompt changes only where it quotes a label the researcher sees. One rendered run is listed there too: the front page's opening paragraph, which is the owner's wording of 2026-09-30 and keeps its "The tool asks" (ISC-586).

Whether a label is the conventional one, whether an AI control is named for its result, and whether an empty state offers the right action are checked by reading, as Parts 1 to 4 are.
