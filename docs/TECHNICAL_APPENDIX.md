# Technical Appendix

**Designing Qualitative Research with AI: Making Expectations and Biases Explicit Before Fieldwork**

Matthew G. Grimes (Cambridge Judge Business School, University of Cambridge) and Stine Grodal (D'Amore-McKim School of Business, Northeastern University)

Stage 1 submission, *Organization Science* special issue "AI-Enabled Frontiers in Organizational Science". Appendix version of 29 October 2026, describing the prototype as of commit `main` on that date.

Repository: https://github.com/mggrim/abductive-orgsci (MIT license)

---

## 1. Scope of this appendix

In the proposal, we describe Abductive, a tool that helps a researcher design a qualitative study before fieldwork, and a study in which about twelve MPhil students use the tool. In this appendix, we give the detail that a reviewer needs to evaluate the prototype and the plan: the tool's construction and its routes to a model (section 2), the eight steps of the Qualitative Discovery Framework (section 3), the process by which Abductive proposes concepts and relationships and the researcher decides on them (section 4), the History ledger and its record of authorship (section 5), the design of the bias checks (section 6), our plan for developing and testing those checks (section 7), the study mode that we will build for the student study (section 8), draft study protocols (section 9), and reproducibility and known limitations (sections 10 and 11).

In Table 1, we separate the components that exist today from the components that we plan to build, so that a reviewer can tell built work from planned work throughout the sections that follow.

**Table 1. Status of the components on 29 October 2026**

| Component | Status | Section |
|---|---|---|
| Eight-step discovery framework with one-question-at-a-time conversation | Built, on `main` | §3 |
| Concept and relationship suggestions, accepted, refined or rejected one at a time by the researcher | Built | §4 |
| Expectations drawn from the researcher's papers, offered as a foil | Built | §4.4 |
| History ledger: append-only, with events marked by actor and, for model turns, by model and version | Built | §5 |
| On whose words a suggestion draws (researcher, AI tool, or both) | Built | §5.4 |
| Exports (report, ledger, ontology, bundle, session replay) and import | Built | §5.6 |
| Three model routes: subscription via a local bridge, API key, local model | Built | §2 |
| Bias matrix (nine biases by seven points in the work) | Specified in code; the checks are planned, Nov 2026 to Jan 2027 | §6 |
| Bias checks run by a model from a different provider than the conversation | Planned, Nov 2026 to Jan 2027 | §6, §7 |
| Study mode: fixed models, keys held on a small server, a spending cap per student | Planned, before Jan 2027 | §8 |
| De-identified release of the student event record | Planned, after the study | §10 |

---

## 2. Architecture

### 2.1 Stack and storage

We wrote Abductive as a single-page web application in TypeScript with React 18, and we build the application with Vite and test it with Bun. All study data live in the researcher's browser, in two IndexedDB databases: `qual-design-app` holds projects, uploaded documents and their passages (chunks), and `qual-design-ledger` holds the History ledger (§5). Abductive runs without a server of its own, so the researcher's data stay in the browser apart from the calls that the browser makes to the model provider of the researcher's choosing, and those calls form the browser's only network traffic. The browser also generates downloads locally.

### 2.2 Reaching a model

The researcher picks one of three routes under **Model access**.

1. **A subscription, through a local bridge.** `scripts/cli-bridge.ts` is a small Bun program that listens only on the loopback address (127.0.0.1 or ::1, port 8787 by default) and runs a turn through the researcher's own signed-in copy of Claude Code (`claude -p`) or OpenAI's Codex (`codex exec`). The bridge reduces Claude Code or Codex to a plain model call: the bridge replaces the tool's own system prompt with Abductive's, switches off its tools, plugins, skills, web search and user settings, and runs the tool in an empty temporary folder. The bridge accepts calls only from Abductive's own origins and refuses calls from other origins, and the bridge is stateless and log-free.
2. **An API key.** The researcher pastes a key for Anthropic, OpenAI, Google Gemini, OpenRouter or another OpenAI-compatible service. Abductive keeps the key in the tab's session storage only, so the key stays out of local storage and IndexedDB and off any server. The browser sends calls straight from the page to the provider or, for services that refuse calls from a web page, through the local bridge, which uses the key for that single request and then discards both the key and the request.
3. **A local model.** The bridge finds a model server on the researcher's machine (Ollama, LM Studio, llama.cpp or any OpenAI-compatible server) and accepts only addresses on the loopback interface. The researcher chooses this route for material that must stay on the machine.

`bridge-app/` contains a macOS menu-bar app that implements the same bridge protocol natively, and a conformance script (`bridge-app/conformance.ts`) checks that the two bridges answer alike.

### 2.3 Turn construction

`assembleTurnPrompt` (`src/interview/prompt.ts`) assembles an interview turn from fixed blocks, in this order: the tool's role, the interview contract, the rules for the current mode, rules for the permitted uses of literature, lines for the unit of analysis and the kind of data, a summary of the study's current state, an optional digest of earlier conversation, the researcher's last message, any material passages, and finally the one question for the tool to ask. Before Abductive sends a prompt, the code enforces two rules: the turn must contain exactly one question, and in questioning mode the tool's own text must refrain from proposing an answer (the code rejects eleven patterns, such as "the answer is" and "I suggest").

The model returns plain text with marked lines, which Abductive parses defensively, and when a reply lacks the expected marks, Abductive substitutes a fixed "no reading" sentence and declines to invent a reading. Because Abductive leaves temperature and the other sampling parameters unset, the three routes all use the provider's default. In addition, Abductive runs a house-style check on model replies and, when a reply breaks the tool's writing rules, requests the reply once more. Abductive keeps the original text on the event (`rawText`, `voiceRetry`), so the record preserves the model's original wording.

### 2.4 Tests

The repository has 275 test files with 3,596 tests (`bun test`), and the TypeScript compiler reports zero errors (`bun x tsc --noEmit`). The tests cover the ledger's validation rules, the bridge's refusals, the parsers, and the exports and their round trip through import, and the tests also check all rendered strings against the tool's writing standard (`docs/copy-standard.md`).

---

### 2.5 Help chat

A researcher opens Help from the control at the top right of a page, and Abductive then shows a panel that begins with a help chat, which consists of a button labeled "I'm stuck" and a box for a free question. Below the help chat, Abductive folds the page's written explanation under "About this page". When the researcher has yet to connect a model, Abductive uses a single line in the panel to ask the researcher to connect a model under Model access.

Abductive draws the help chat's answers from three sources. First, Abductive draws on the tool itself: the full Help text for the current page, a one-line summary of the other pages, and the steps of the Qualitative Discovery Framework. Second, Abductive draws on the researcher, who may record under "About you" their career stage, their field, their experience with qualitative research and their aims for Abductive, and Abductive keeps these answers in the browser in which the researcher entered them. Third, Abductive draws on the project, specifically the same study context that Abductive supplies to the interview, the steps at which the researcher has saved an answer, the question currently before the researcher, the suggestions on which the researcher has yet to decide, the last eight History events and the last four help exchanges.

In the help chat, Abductive confines its role to coaching and leaves the writing to the researcher. Specifically, Abductive suggests a likely reason for the researcher's difficulty, names the step and the kind of answer that the researcher needs at that step, and proposes one concrete action, and Abductive may also offer one question for the researcher to ask themselves. Abductive reserves drafts of answers, puzzles, concepts, relationships and "Why it matters" lines for the conversation at the relevant step, so when a researcher requests such a draft in the help chat, Abductive directs the researcher to that conversation, in which Abductive records the exchange in History. As a further safeguard, Abductive checks help answers for wording that would amount to an answer written on the researcher's behalf and records the instances that it finds.

Within a project, Abductive adds two events to History for a help exchange: a `help-asked` event with the researcher as actor and a `help-answered` event with the model as actor, together with the model's name and version. Abductive withholds these events from the interview, the concept suggester and the Report, so that Abductive builds the design without reference to the help chat. For the study, we will read these events to identify the steps at which, and the moments at which, researchers got stuck, and to audit whether Abductive confined its help to coaching. Because the Projects and Model access pages lie outside any project, and Abductive records help exchanges only inside a project, Abductive leaves History unchanged when a researcher uses help on those two pages. In our tests on the Claude Code route, Abductive took between 13 and 22 seconds to return a help answer.

## 3. The Qualitative Discovery Framework

We arrange the framework's eight steps as two loops and an outer pair, which gives the researcher a flexible order in place of a strict sequence (`src/flow/stations.ts`). The researcher can enter the outer loop (Context, Process, Outcome, Site) at any step and work through its four steps in any order, and the inner loop (Puzzle, Bind) lies within the outer loop. Abductive opens Sample and Early data once the researcher has saved an answer at all six loop steps, and the six loop steps are open from the start.

**Table 2. The eight steps and their opening questions**

| Step | Opening question |
|---|---|
| Context | What setting do you plan to study, and what draws you to that setting? |
| Process | What period of time will you study, and what central phenomenon do you plan to track through that period? |
| Outcome | Which outcome or phenomenon do you want to study, what variation in that outcome do you expect to find, and why would that variation matter? |
| Site | Why is this the right place to see what you're studying, and what will the place be bad at showing you? |
| Puzzle | What do you see, or expect to see, in your setting that current accounts can't explain? |
| Bind | What tension do you expect the people in your setting to face, and who do you expect to feel that tension? |
| Sample | What comparisons are you looking to explore? How would your sample need to vary in order to adequately examine those comparisons? And what would you ideally want to hold constant across the sample? |
| Early data | What has your early material shown you that you didn't expect, and what does that surprise make you want to explore next? |

At a given step, the tool then asks follow-up questions one at a time, giving its reason for asking alongside the question. The tool draws on three sets of probes per step (`src/interview/stationProbes.ts`), which we wrote for an empty answer, a thin answer and a stated answer, and the tool presses a confident answer harder than a tentative one. Until Early data, the tool directs its questions at the design ahead and refrains from asking for instances that the researcher has yet to observe. After an answer, the tool offers two or three options for the next turn, and the options differ in their focus. Abductive also shows a saturation signal once the design has stayed the same across recent turns; the signal is advisory, and the decision to continue the conversation remains with the researcher.

The researcher writes the answer at a step, although the tool can draft a summary of the researcher's own replies, which the researcher then saves, edits or discards. The ledger records whether the tool drafted a saved answer and whether the researcher edited that draft.

---

## 4. Concepts, relationships and the emerging project ontology

### 4.1 Suggestions

At the end of a step, the researcher can ask Abductive to **surface concepts and relationships**. In this pass, the model reads both sides of the step's conversation since the last surfacing, together with the saved answer, and proposes concepts (named by a noun, a gerund or a short noun phrase, with a definition and properties), relationships between the concepts, and supporting statements and a "why it matters" line for every concept and relationship. In other passes, the model reads the researcher's uploaded data, and in a **relate** pass the model reads the accepted concepts together and proposes relationships among those concepts. Abductive links a suggestion to the conversation turns or data passages on which the suggestion draws. A code guard rejects a concept name that bundles several ideas (for example, a clause or two nouns joined by "and") and asks the model once to split the name; if the model returns a bundled name again, Abductive drops the suggestion and records the drop.

### 4.2 Decisions

Abductive adds a model's proposal to the project only after the researcher has decided on the proposal. The researcher makes separate decisions on concepts, relationships, properties, supporting statements and "why it matters" lines, accepting, refining (renaming or redefining in the researcher's own words) or rejecting the items one at a time, and a rejection requires a reason. When the researcher accepts a concept, the concept's relationships and properties remain open for separate decisions, and Abductive records the decisions as separate events. Abductive adds only accepted items to the emerging project ontology, which is the project's map of concepts and their relationships.

### 4.3 Puzzle and argument

From the researcher's answers, Abductive drafts a reading of the puzzle and, as the researcher accepts concepts, a short statement of "the argument so far". Both texts remain drafts until the researcher accepts them, and the ledger records a declined draft. The puzzle reading becomes the project's research question only once the researcher accepts the reading.

### 4.4 Expectations from prior research

The researcher uploads or lists the papers with which they see themselves in conversation, and Abductive works only from those papers. For a given paper, Abductive judges the expectations that the paper would lead a researcher to hold in this setting and ties those expectations to passages in the paper. The researcher may add an expectation to the project, in which case Abductive marks the expectation as derived from the literature, or may decline the expectation. These expectations are the foil of design principle 1: by stating the expectations of extant research explicitly, Abductive gives the researcher a baseline against which to state their own expectation and any surprise relative to that expectation. When the researcher lists a paper without uploading it, the model draws the expectation from its memory, and Abductive tells the researcher as much in the interface.

---

## 5. The History ledger

### 5.1 Structure

Abductive writes all actions in a project to an append-only ledger (`src/ledger/`), and the code exposes only an append operation for events. An event includes an envelope with a UUID, a timestamp, the project and the actor, which is `human`, `system`, or a named model role (for example `persona:interviewer`, `persona:concept-suggester`). An event from a model role must include the model's name and version, and the validator rejects an event that lacks them. When Abductive used a model, Abductive also records the route on the event (the provider, such as Claude Code, Codex, Anthropic or a local server). The validator checks events against their types before Abductive writes them, Abductive writes a batch as a single unit so that a failed batch leaves the ledger as it was, and Abductive refuses duplicate event ids.

The code defines 60 event types in families: conversation and design (questions asked, answers saved, drafts offered and declined, puzzle readings), concepts, relationships, statements and "why it matters" lines (suggested, accepted, refined or rejected), material and attention, and exports. Abductive computes the project's current state by replaying the ledger and keeps the ledger as the sole stored source of that state.

### 5.2 Model identity on the record

For an API key, Abductive records as the version the model string that the provider returns. For Claude Code, the bridge reads the resolved model from the tool's output (for example `claude-sonnet-5-5`). Because Codex omits the model from its output, Abductive records for Codex the model that the bridge requested and marks that model as requested. We note in section 11 the cases in which this record is less precise.

### 5.3 Attention

Abductive records three layers of attention to the researcher's material (`AttentionEvent`). Abductive writes a **retrieval** event when it places a passage into a model's context, a **citation** event when a model cites a passage in its output, and a **human** event when the researcher opens a passage or keeps a passage open and in view for more than three seconds. The human layer is a proxy for reading, and the code documents that limit. Taken together, the three layers allow a reader of the record to see the material in view for the researcher and for the model, as well as the text that the two parties wrote.

### 5.4 Authorship: proposer and source

A co-author asked whether authorship should be a two-by-two: human or AI, by theory or data. The ledger records both dimensions in separate fields, and we derive the two-by-two from those fields.

- **The proposer of an item.** When the researcher writes a concept, Abductive records the concept as the researcher's; when the tool suggests a concept, Abductive records the model role as the actor. For a suggestion that the model surfaced from the conversation, the tool also determines on **whose words** the suggestion draws (the researcher's, the tool's, or both) by reading the actors of the turns linked to the suggestion (`src/concepts/chat.ts`). Abductive keeps this judgment out of the model's hands, because a model is poorly placed to report its own sources accurately. Beside the suggestion, Abductive labels the result "From your words", "From Abductive's questions" or "From both".
- **The source of an item.** Abductive records the source of a suggestion: a step's conversation, a step's saved answer, the researcher's data (named by passage), the papers, or the relate pass over accepted concepts. When the researcher accepts an item, Abductive also assigns the item an origin value: the researcher's own, from the data, from the papers (literature-derived), or proposed by the model.

One property of the current design matters for the analysis. When the researcher accepts a model suggestion that drew on the researcher's uploaded data, the origin value reads "from the data", so the identity of the proposer appears on the suggestion event and is absent from the acceptance. We therefore compute the two-by-two by joining acceptances to the suggestion events that preceded them, and we report the result for one walk of record in Table 3.

**Table 3. Accepted items in the walk "Auditing judgement after automation", by source and by whose words**

| Drew on | Researcher's words only | Both parties' words | AI tool's words only | Total |
|---|---|---|---|---|
| Conversation at a step | 26 | 4 | 0 | 30 |
| Researcher's uploaded data | n/a | n/a | n/a | 5 |
| Relate pass over accepted concepts | n/a | n/a | n/a | 3 |
| Papers | | | | 0 |
| **Total accepted (23 concepts, 15 relationships)** | | | | **38** |

The tool proposed all 38 items as suggestions, and the researcher wrote none of the 38 from scratch. Of the 30 items from the conversation, 26 drew on the researcher's words alone, and in the same walk the researcher refined 12 suggestions and rejected 6. The student study will trace this pattern (proposal §3), asking whether the tool's proposals reflect the researcher's own expectations or substitute the tool's expectations, and at which point the researcher closes on a puzzle.

### 5.5 Design stamp

Abductive adds a design stamp to all written exports: an FNV-1a digest of the event ids in order, excluding export events. A person who holds the exported ledger can recompute the stamp to confirm that a report matches the history from which the report came. The stamp is a fingerprint for matching copies and is unsuitable as a security hash.

### 5.6 Exports and import

A researcher can download a report (markdown), the concept map (SVG), the ontology (JSON, with the provenance of its elements), the full ledger (JSON), a session replay (markdown, the conversation with speakers and models named), a bundle (the project with its documents, passages and full ledger), and a folder of linked markdown notes. A researcher can import a bundle into any copy of Abductive, and on import Abductive re-validates all events and remaps ids so that a re-import avoids collisions. The walk of record in `examples/` is a bundle.

---

## 6. The bias checks: design and plan

### 6.1 Target design

In the proposal, we name nine biases across the human–AI assemblage that the tool should make visible: five on the researcher's side (satisficing, confirmation, gap-spotting, attachment to a method, commonsense plausibility) and four on the AI tool's side (modal framing, sycophancy, artificial certainty, force-fitting). We address assemblage-level effects (anchoring on AI advice, over-reliance, gradual acceptance of the AI's view, convergence across a cohort) through the ledger and the study design, in place of a check on a single answer.

### 6.2 The prototype's matrix and its mapping to the proposal

In the prototype, we specify the checks as a matrix of biases by points in the work (`src/matrix/`). A cell in the matrix contains a bias, a point in the work, a trigger, a prompt and the label of the resulting flag. The columns are five stages (starting point, site and sample, instrument, early data, anomaly) plus two columns that concern the shape of the project as a whole (the ontology and the interview). We named the prototype's researcher biases before we settled the proposal's final list, so we map the matrix entries onto the proposal's biases in Table 4.

**Table 4. Proposal biases and the prototype's matrix entries**

| Proposal | Prototype matrix entry | Note |
|---|---|---|
| Satisficing | Premature closure | Settling an open question once a plausible answer appears, before trying the rivals |
| Confirmation | Confirmation | Same |
| Gap-spotting | None yet | To be added when we build the checks |
| Attachment to a method | Identity attachment | Design choices that protect the researcher's method, school or earlier work |
| Commonsense plausibility | Intuition as theory | Mistaking familiarity with a situation for an explanation of it |
| (the bound, not a bias) | Limited attention | Reclassified as the human bound in the proposal; kept as the basis for coverage prompts |
| Modal framing | Modal framing | Same |
| Sycophancy | Sycophancy | Same |
| Artificial certainty | Artificial certainty | Same |
| Force-fitting | Force-fitting | Same |

Of the 63 cells (nine biases by seven columns), the matrix marks 39 as watched. The watched cells cover sycophancy and modal framing at all five stages and in the ontology, and artificial certainty and force-fitting at the stages other than the instrument and in the ontology. For a researcher bias, the watched cells lie at the points at which that bias is most likely to arise; for confirmation, those points are the starting point, the site and sample, early data and the ontology. Under the specification, Abductive triggers a cell when the researcher enters a stage, on a behavioral signal (such as a run of acceptances without a challenge, unanswered challenges, passages that remain unread, or a run of confident answers), or on a condition in the ontology (such as a resolution recorded without a rival weighed against it), and Abductive must state the reason for a flag within the flag itself.

### 6.3 Status

The code already contains the matrix, the bias definitions and the ledger's event types for scans and flags, whereas we will build and test the checks themselves as we describe in section 7. We will run the checker on a reasoning model from a different provider than the conversation model, because a model that checks its own output tends to favor that output (Panickssery et al. 2024), and because models from different providers that answer without reasoning through their answers still converge (Bao et al. 2026).

---

## 7. Developing and testing the bias checks (November 2026 to January 2027)

1. **Definitions.** For the nine biases in turn, we write a definition, the sources that describe the bias, the steps at which the bias is most likely to arise and the signs in text that would indicate it, starting from the bias's "tell" in `src/matrix/glossary.ts`.
2. **Test passages.** We assemble passages from three sources: walks of record, published methods appendices, and borderline cases that we write so that the set includes near-misses for all nine biases.
3. **Blind coding.** Working independently and blind to the checks' output, both authors code all passages for all nine biases and then reconcile their coding, and the reconciled coding becomes the baseline.
4. **Checker comparison.** We run the checks twice over the passages, once on the model that produced the conversation text and once on a reasoning model from a different provider. For a given bias and checker, we record the checker's flags and misses against the baseline.
5. **Decision rule.** Before running the checks, we fix in writing the level of agreement that a check must reach before we use the check as a measure in the study. A check that falls short remains in the tool as a prompt to the researcher, and we exclude that check from the study's measures. Because agreement with human coders is a weak proxy for quality (Liu et al. 2026), we also read the diaries and interviews for biases that the checks missed.
6. **Freeze.** Before students begin, we freeze the prompts, the rules, the thresholds and the model versions for both the conversation and the checker. We commit the frozen set to the repository and cite that commit in all analyses.

---

## 8. Study mode (to be built before January 2027)

For the student study, all participants must work with the same models. In study mode, students use Abductive through our own API account in place of their own accounts. A small server holds the keys, so that the keys stay off students' machines, and the server passes calls to one fixed conversation model and, for the checks, to one fixed model from a different provider, while enforcing a spending limit per student. Both models remain fixed throughout the study, beyond the students' control. The server only forwards calls and counts spending, so study content stays off the server. As in the public tool, students' projects stay in their own browsers, and students export their bundles to the research team at the agreed points (§9.5).

---

## 9. Study protocols

*Draft for Grimes and Grodal to revise. We will submit the final protocols with the ethics application in November 2026.*

### 9.1 Before first use: one-page design

Before first using Abductive, students write one page that states:

1. The research question as it stands today.
2. The setting or site, and the reason for choosing it.
3. The data that the student plans to collect, and from whom.
4. The student's expected findings.
5. The findings that would surprise the student.

We use the same five headings for the final proposal comparison (§9.6), so that we have a before-and-after pair for every student.

### 9.2 Start-of-period interview (Grodal, about 45 minutes)

1. How did you arrive at your current topic?
2. What first prompted the question: reading, experience, a conversation, or another source?
3. What do you expect to find in your setting, and why do you expect it?
4. What would surprise you?
5. To which existing research is your work closest, and where do you think that research falls short for your setting?
6. What alternatives did you consider, and why did you set aside those alternatives?
7. How do you decide whether a research question is a good one?
8. How have you used AI tools in your studies so far, and for what purposes?
9. What do you hope a tool like Abductive will help you achieve, and which aspects of such a tool make you wary?
10. Who else is helping you shape the project, and how?

### 9.3 End-of-period interview (Grodal, about 60 minutes)

The interviewer has in front of them the student's one-page design, the student's diary entries and a summary of the student's ledger (the point at which the puzzle settled, and the numbers of items that the student accepted, refined and rejected, by whose words).

1. Walk me through the changes to your puzzle since we last spoke.
2. When did your puzzle settle, and what brought the puzzle to that point?
3. Looking at your first one-page design, what changed and what stayed the same?
4. Which ideas in your project now came from you, which from Abductive, and which from another source? How do you know?
5. Tell me about a suggestion from Abductive that you accepted. Why that suggestion?
6. Tell me about a suggestion that you rejected or rewrote. What was wrong with that suggestion?
7. Was there a moment when Abductive changed your mind, or when you changed Abductive's framing?
8. Did the tool's statement of the literature's expectations help or hinder you? Give an example.
9. Here is a diary entry in which you wrote that X surprised you. Where did you take that surprise next?
10. How did your use of Abductive relate to the advice that you got from your supervisor and peers?
11. If you started again, would you use the tool differently?
12. Would the record miss any part of your way of working?

### 9.4 Weekly diary (two to three minutes)

Weekly, in a short online form:

1. What surprised you this week? (free text, the core item)
2. Did that surprise come from your reading, your fieldwork or early material, a conversation with a person, Abductive, or another source? (choose any)
3. Did your question change this week? If so, how? (one sentence, optional)

We keep the diary short to limit reactivity, and we compare early and late entries and treat any performance for the record as data (proposal §4).

### 9.5 Ledger data

With consent, students export their Abductive bundles at three points: after the first month, at the midpoint, and when the topic settles in March. Students send the bundles to Grodal, who holds identifiable data, and Grimes works only with pseudonymized bundles, transcripts and diaries until marks are confirmed. From the bundles, we read the sequence of events (Langley 1999; Pentland et al. 2020). We record the first statement of the puzzle, later changes to the puzzle, the moment at which the researcher accepted a puzzle reading, and, for concepts, relationships and statements, the words on which the item drew, the item's source, and the researcher's decision to accept, refine or reject the item.

### 9.6 Coding the designs and proposals

We code the one-page designs, the students' submitted proposals and anonymized proposals from several past cohorts (written before such tools were available, used with the department's approval) blind to cohort on:

- whether the document states a puzzle;
- the expectation from which the puzzle departs, and its source (prior research, experience, data);
- whether the proposed data can address the puzzle;
- whether the framing is grounded-theory or abductive;
- interestingness (Davis 1971), recorded with the expectation from which the puzzle departs because the criterion is contested (Tsang 2022);
- originality (Corley and Gioia 2011).

We measure semantic distinctness across the proposals within a cohort (Anderson et al. 2024) to test whether current students' puzzles are more alike than those of past cohorts, which would be a small-group version of the effect that Doshi and Hauser (2024) found.

### 9.7 Ethics and data handling

Because Grimes directs the program, a third party takes consent, and we keep participation separate from assessment. Grimes sees identifiable data from current students only after their marks are confirmed. Students may withdraw at any point before analysis without effect on their studies. Bundles contain the students' own text and any material that the students upload, so we tell students to upload only material that they are permitted to share, and Abductive repeats that instruction in its interface.

---

## 10. Reproducibility

- **Code.** This repository contains the full prototype and its tests under the MIT license.
- **Walk of record.** `examples/auditing-judgement.bundle.json` is a complete, synthetic project with its full event history, and `examples/auditing-judgement.report.md` is the report that Abductive exported from it. A reader can import the project into any copy of the tool and read it without connecting a model. In the walk, an AI agent played the researcher, writing the researcher's replies and fictional data files, while Abductive answered as itself through Claude Code (`claude-sonnet-5-5`), so the project contains synthetic material only.
- **Frozen checks.** Before the study begins, we will commit to this repository the prompts, rules, thresholds and model versions that we fix in §7 step 6.
- **Study record.** Because students' own text must stay private, we will release, with consent, the de-identified event record for each student (event types, actors, timing, the words on which the items drew, the decisions made and the checks that fired), stripped of the text itself, together with the code that produces the tables in the eventual article.
- **Running the tool.** A reviewer can run Abductive locally, without an account with us, using their own API key, a Claude or ChatGPT subscription, or a local model (README).

---

## 11. Known limitations of the prototype

- **Model identity.** For Claude Code, when the tool's output omits the resolved model, Abductive records the requested alias (for example `sonnet`) in place of a dated version. For Codex, Abductive always records the requested model, because Codex's output omits the model that Codex ran. In study mode (§8), the server calls fixed model versions through the API, which closes both gaps.
- **Sampling.** Because Abductive leaves temperature unset, outputs vary between runs. We will therefore fix the models and record the outputs in the study, and the analysis takes the recorded interaction as its object in place of a reproducible generation.
- **Cost.** The public tool lacks spending controls, and researchers pay their own providers; study mode, by contrast, adds a cap per student.
- **Attention.** The human attention layer records the opening of a passage or the keeping of a passage in view as a proxy for reading, and the event merges those two signals into one.
- **De-identification.** The exports contain the researcher's full text, and the bundle includes uploaded documents, so we will de-identify the study release (§10) in a separate step that keeps the event structure and drops the text.
- **Origin value.** As we explain in §5.4, the origin value on an acceptance alone leaves the proposer of a data-derived item unidentified, so the two-by-two requires joining acceptances to their suggestions.
- **Bias checks.** Planned for November 2026 to January 2027 (§6, §7).

---

## References

Anderson BR, Shah JH, Kreminski M (2024) Homogenization effects of large language models on human creative ideation. *Proc. 16th Conf. Creativity & Cognition*, 413–425.

Bao H, Wu S, Liu X, Li S, Cao S, Evans JA (2026) Contemporary AI lacks the imagination to diverge or negate in science. Preprint, arXiv.

Corley KG, Gioia DA (2011) Building theory about theory building: What constitutes a theoretical contribution? *Acad. Management Rev.* 36(1):12–32.

Davis MS (1971) That's interesting! Towards a phenomenology of sociology and a sociology of phenomenology. *Philos. Soc. Sci.* 1(2):309–344.

Doshi AR, Hauser OP (2024) Generative AI enhances individual creativity but reduces the collective diversity of novel content. *Sci. Adv.* 10(28):eadn5290.

Langley A (1999) Strategies for theorizing from process data. *Acad. Management Rev.* 24(4):691–710.

Liu A, Esbenshade L, Xiao M, Tian V, Zhang Z, He K, Sun M (2026) Agreement is not quality: Blind expert verification of human and LLM qualitative coding when human consensus is not ground truth. Preprint, arXiv.

Panickssery A, Bowman SR, Feng S (2024) LLM evaluators recognize and favor their own generations. *Adv. Neural Inform. Processing Systems* 37:68772–68802.

Pentland BT, Recker J, Wolf JR, Wyner G (2020) Bringing context inside process research with digital trace data. *J. Assoc. Inform. Systems* 21(5):1214–1236.

Tsang EWK (2022) That's interesting! A flawed article has influenced generations of management researchers. *J. Management Inquiry* 31(2):150–164.

