/**
 * The bias × stage matrix registry (ISC-10, ISC-7).
 *
 * Declarative typed config: each cell names a bias, a design stage, a trigger
 * (stage entry or ledger signal), the personas to invoke, the intervention
 * prompt handed to them, and the short flag label shown in the dashboard.
 *
 * Cell ids follow `<bias>:<stage>` and are referenced by synthetic-case
 * frontmatter in content/cases/*.md — those ids are load-bearing.
 *
 * Personas reference creed-file slugs in content/creeds/:
 *   eisenhardt-positivist, langley-process, tavory-timmermans-abduction.
 */

import type { MatrixCell } from "./schema.ts";

const EISENHARDT = "eisenhardt-positivist";
const LANGLEY = "langley-process";
const TAVORY = "tavory-timmermans-abduction";
const ZUCKERMAN = "zuckerman-genre";

export const MATRIX: readonly MatrixCell[] = [
  // -------------------------------------------------------------------------
  // confirmation (human)
  // -------------------------------------------------------------------------
  {
    id: "confirmation:design-brief",
    bias: "confirmation",
    stage: "design-brief",
    trigger: { kind: "stage-entry" },
    personas: [TAVORY],
    prompt:
      "Read the research question and motivation. State, in one sentence, the answer the researcher appears to already believe. Then ask: what observation, if it appeared in the pilot data, would force you to abandon this framing entirely? If the brief cannot name one, say so plainly, because a question that every possible datum would leave standing is a conclusion wearing a question mark. Propose a rival explanation for the same phenomenon that the current framing would systematically miss.",
    flag: "Question presupposes its answer",
  },
  {
    id: "confirmation:site-sample",
    bias: "confirmation",
    stage: "site-sample",
    trigger: { kind: "stage-entry" },
    personas: [EISENHARDT],
    prompt:
      "Interrogate the comparative-case logic. If the researcher is comparing two or more cases, ask: did they select the cases because the cases are DIFFERENT? Cases chosen for maximal difference vary on many dimensions at once, so any observed contrast is causally uninterpretable, so you will 'confirm' that the settings differ, which you knew before collecting a single datum. Publishable comparison holds most dimensions constant and isolates the focal contrast (polar types along ONE dimension, or literal/theoretical replication logic). Ask the researcher to name the single dimension of theoretical interest, the dimensions that they hold constant, and how the sites achieve that. If they cannot, flag the design as difference-hunting, not theory-building.",
    flag: "Cases compared because they differ",
  },
  {
    id: "confirmation:pilot-data",
    bias: "confirmation",
    stage: "pilot-data",
    trigger: { kind: "signal", signal: "acceptance-streak" },
    personas: [TAVORY, LANGLEY],
    prompt:
      "The researcher has accepted every recent challenge without revision, which is a pattern consistent with reading the data through the framing rather than against it. Select the three pilot excerpts that fit the working interpretation WORST. For each, articulate the strongest reading under which it disconfirms the emerging account. Do not soften: your job here is to make the disconfirming case as compelling as an advocate would.",
    flag: "Accept-streak while reading pilot data",
  },

  // -------------------------------------------------------------------------
  // limited-attention (human)
  // -------------------------------------------------------------------------
  {
    id: "limited-attention:design-brief",
    bias: "limited-attention",
    stage: "design-brief",
    trigger: { kind: "stage-entry" },
    personas: [TAVORY, EISENHARDT],
    prompt:
      "Audit what the brief is NOT attending to. First, novelty: list the three published findings closest to the stated research question and ask whether the cited literature already answers it. If the 'puzzle' is a well-documented regularity, the study can only redescribe known results in a new setting; say so and name what an expectation-violating version of the question would look like. Second, scope: name the actors, time periods, and counter-sites the design excludes, and state which exclusion is most likely to be doing silent theoretical work.",
    flag: "Brief blind to prior findings / excluded scope",
  },
  {
    id: "limited-attention:pilot-data",
    bias: "limited-attention",
    stage: "pilot-data",
    trigger: { kind: "signal", signal: "coverage-stagnation" },
    personas: [LANGLEY],
    prompt:
      "Retrieval has circled the same chunks for the entire recent window, so the loop is re-reading favorites rather than covering the corpus. List the document chunks that are still unretrieved and uncited, cluster them by what they are about, and pose one question that only the neglected material can answer. Ask the researcher directly: what are you avoiding in the unread portion, and would a hostile reviewer find your emerging claim there?",
    flag: "Attention circling same chunks",
  },
  {
    id: "limited-attention:anomaly",
    bias: "limited-attention",
    stage: "anomaly",
    trigger: { kind: "signal", signal: "coverage-stagnation" },
    personas: [TAVORY],
    prompt:
      "Anomaly hunting has stalled on already-covered material. Genuine anomalies live where attention has not been: the unretrieved chunks, the cases mentioned once and dropped, the informant whose account is still unexplored. Nominate two candidate anomalies drawn ONLY from material outside the current retrieval set, and state for each what established expectation it would violate if it held up.",
    flag: "Anomaly search confined to covered ground",
  },

  // -------------------------------------------------------------------------
  // premature-closure (human)
  // -------------------------------------------------------------------------
  {
    id: "premature-closure:site-sample",
    bias: "premature-closure",
    stage: "site-sample",
    trigger: { kind: "stage-entry" },
    personas: [EISENHARDT, LANGLEY],
    prompt:
      "Stress-test access realism before the design hardens around an ideal site. Ask: what is the concrete access story (named gatekeeper, existing relationship, negotiated terms) for the most restricted setting in the design? 'Hoped-for introductions' and 'an NDA will handle it' are not access; elite and closed settings (boards, investment committees, operating theatres) routinely refuse or curtail observation. Demand a fallback design the researcher would still be proud to publish if primary access collapses, and ask what the study becomes if only interviews-plus-documents are attainable. Closing on the perfect site before confronting executability is how designs lose years.",
    flag: "Access story unexamined; fallback design missing",
  },
  {
    id: "premature-closure:anomaly",
    bias: "premature-closure",
    stage: "anomaly",
    trigger: { kind: "stage-entry" },
    personas: [TAVORY],
    prompt:
      "Before the researcher locks in any anomaly candidate, force the design back open once. For the leading candidate, generate three mundane explanations (measurement artifact, sampling accident, informant impression management) that would dissolve the anomaly without any new theory. Only an anomaly that survives its boring rivals deserves the name. If the researcher cannot rule the mundane readings out with existing data, specify the cheapest additional observation that would.",
    flag: "Anomaly locked before rival explanations tried",
  },

  // -------------------------------------------------------------------------
  // identity-attachment (human)
  // -------------------------------------------------------------------------
  {
    id: "identity-attachment:design-brief",
    bias: "identity-attachment",
    stage: "design-brief",
    trigger: { kind: "stage-entry" },
    personas: [LANGLEY],
    prompt:
      "Look for places where the brief expresses who the researcher IS rather than what the question NEEDS: 'as an ethnographer…', 'my commitment to process research…', a home literature cited from loyalty rather than fit. For each, ask: if a stranger without a methodological identity read only the research question, what method and literature would they reach for? Where the stranger's answer differs from the brief's, name the gap and ask which one the phenomenon actually demands.",
    flag: "Design serves researcher identity, not question",
  },
  {
    id: "identity-attachment:instrument",
    bias: "identity-attachment",
    stage: "instrument",
    trigger: { kind: "stage-entry" },
    personas: [LANGLEY, EISENHARDT],
    prompt:
      "Check the label against the instrument. A researcher who self-identifies as 'an ethnographer' may call the study ethnographic while the instrument actually described is archival-plus-interview: retrospective accounts and documents, without sustained observation of naturally occurring activity. State plainly what data the instrument will really produce, what the declared data-type would require (presence, duration, field-note discipline), and where the two diverge. Then ask: should the label change, or should the instrument? Either answer is respectable; the mismatch is not, because reviewers will evaluate the study against the label it claims.",
    flag: "Declared method mismatches actual instrument",
  },

  // -------------------------------------------------------------------------
  // sycophancy (AI)
  // -------------------------------------------------------------------------
  {
    id: "sycophancy:instrument",
    bias: "sycophancy",
    stage: "instrument",
    trigger: { kind: "stage-entry" },
    personas: [EISENHARDT],
    prompt:
      "You have been assisting with this protocol and are therefore at risk of endorsing it because you helped shape it. Break that loop: identify the three weakest items in the interview or observation protocol: leading questions, items that presuppose the framing, prompts an informant can only answer agreeably, and rewrite each in a form that invites the informant to contradict the researcher's expectation. If every item looks strong to you, treat that conclusion itself as suspect and say why a critic would not believe it.",
    flag: "Protocol invites agreement",
  },
  {
    id: "sycophancy:pilot-data",
    bias: "sycophancy",
    stage: "pilot-data",
    trigger: { kind: "signal", signal: "acceptance-streak" },
    personas: [TAVORY, EISENHARDT],
    prompt:
      "The recent record shows uninterrupted acceptance, which is a signature of a sycophantic loop in which assistant output flatters the researcher's reading and the researcher rewards the flattery. Now attempt refutation: state the researcher's current working claim, then construct the strongest argument AGAINST it from the pilot data, citing specific chunks. You may not conclude the claim survives unless you have produced at least two genuine refutation attempts and shown, chunk by chunk, why each fails. Abductive treats agreement without attempted refutation as a null response.",
    flag: "Sycophantic accept-loop; refutation demanded",
  },

  // -------------------------------------------------------------------------
  // modal-framing (AI)
  // -------------------------------------------------------------------------
  {
    id: "modal-framing:design-brief",
    bias: "modal-framing",
    stage: "design-brief",
    trigger: { kind: "stage-entry" },
    personas: [TAVORY],
    prompt:
      "Model assistance gravitates toward the modal study: the median framing, the most-published theory pairing, the design a thousand papers have already used. Diagnose this brief for modal drift. Which of its choices (lens, site type, unit of analysis) are the statistically expected ones for this topic? For each modal choice, propose one deliberately off-modal alternative and state what the study could see under the alternative that the modal design cannot. The researcher may keep the modal choice, but only after seeing what it forecloses.",
    flag: "Brief drifting to modal study design",
  },
  {
    id: "modal-framing:instrument",
    bias: "modal-framing",
    stage: "instrument",
    trigger: { kind: "stage-entry" },
    personas: [LANGLEY],
    prompt:
      "Inspect the protocol for questions any organizational researcher would ask in any study: 'walk me through a typical day', 'what challenges do you face'. Modal questions harvest modal answers: rehearsed accounts informants have given before. For each generic item, draft a replacement that the researcher could only ask in THIS site about THIS puzzle, anchored to a concrete episode, artifact, or moment the design has already surfaced. The test of a good item is that it would make sense only in this study.",
    flag: "Generic protocol yields rehearsed answers",
  },

  // -------------------------------------------------------------------------
  // artificial-certainty (AI)
  // -------------------------------------------------------------------------
  {
    id: "artificial-certainty:pilot-data",
    bias: "artificial-certainty",
    stage: "pilot-data",
    trigger: { kind: "stage-entry" },
    personas: [EISENHARDT],
    prompt:
      "Assistant syntheses of pilot data arrive fluent and confident regardless of how thin the evidence is. Re-grade the current synthesis sentence by sentence: for each empirical claim, count the supporting passages and informants behind it. Rewrite any claim resting on a single informant, a single episode, or paraphrase rather than quotation with its uncertainty on the surface ('one informant reports…', 'not yet corroborated'). Produce the honest version and list the data collection that the researcher would need to earn the confident one.",
    flag: "Fluent synthesis overstates thin evidence",
  },
  {
    id: "artificial-certainty:anomaly",
    bias: "artificial-certainty",
    stage: "anomaly",
    trigger: { kind: "signal", signal: "unadjudicated-challenges" },
    personas: [TAVORY, LANGLEY],
    prompt:
      "Open challenges are accumulating unanswered while the anomaly narrative firms up, so the researcher is manufacturing certainty by ignoring dissent rather than by resolving it. Enumerate every unadjudicated challenge, restate the strongest form of each, and mark which anomaly candidates each one touches. State plainly: a candidate with unresolved challenges against it is a hypothesis, not a finding, and the researcher must present it with the surviving objections attached.",
    flag: "Certainty built on ignored challenges",
  },

  // -------------------------------------------------------------------------
  // force-fitting (AI)
  // -------------------------------------------------------------------------
  {
    id: "force-fitting:pilot-data",
    bias: "force-fitting",
    stage: "pilot-data",
    trigger: { kind: "signal", signal: "unadjudicated-challenges" },
    personas: [LANGLEY],
    prompt:
      "The researcher has left challenges pointing at ill-fitting data unadjudicated, which is the precondition for force-fitting: the working categories absorb residual observations without anyone deciding to. Pull out every excerpt the open challenges identify as fitting poorly. For each, resist assimilation: describe it in its own terms, without the framework's vocabulary, and say what concept would have to exist for it to fit naturally. Data that the researcher must trim to fit is data announcing a missing category.",
    flag: "Categories absorbing residual data",
  },
  {
    id: "force-fitting:anomaly",
    bias: "force-fitting",
    stage: "anomaly",
    trigger: { kind: "stage-entry" },
    personas: [TAVORY, EISENHARDT],
    prompt:
      "Anomaly candidates produced with model assistance often turn out to be the framework's own residue: the researcher promotes whatever the working categories could not digest to 'anomaly' and then explains it with the same framework, closing the loop. For each candidate, run the independence test. Can the researcher state the candidate entirely without the framework's vocabulary, and would a researcher from a different tradition recognize it as surprising? Candidates that fail are artifacts of the coding scheme, not discoveries; say which fail and why.",
    flag: "Anomaly is framework residue, not discovery",
  },

  // ===========================================================================
  // The machine biases at every step where Abductive writes (M75, ISC-667).
  //
  // M9 placed the four machine biases by stage before the chat existed at every
  // step, so most steps had no cell for them. From M75 they read Abductive's own
  // replies, summaries and suggestions wherever Abductive writes, and the lead
  // ruled (2026-10-03) that the grid grows to match: these ten cells fill the
  // stages that lacked one. Each fires only from the machine scan
  // (`flow/machineBiasScan.ts`); a save's scan evaluates the researcher biases
  // alone (`RESEARCHER_MATRIX`), so a stage entry by the researcher leaves them
  // quiet.
  // ===========================================================================
  {
    id: "sycophancy:design-brief",
    bias: "sycophancy",
    stage: "design-brief",
    trigger: { kind: "stage-entry" },
    personas: [TAVORY],
    prompt:
      "Read Abductive's replies while the researcher frames the project. Mark each place where Abductive agreed with the researcher's framing, praised it or restated it as settled, without asking what would count against it. For each, write the question that Abductive should have asked instead.",
    flag: "Abductive agreed with the framing untested",
  },
  {
    id: "sycophancy:site-sample",
    bias: "sycophancy",
    stage: "site-sample",
    trigger: { kind: "stage-entry" },
    personas: [EISENHARDT],
    prompt:
      "Read Abductive's replies about the site and the sample. Mark each place where Abductive endorsed the researcher's choice of cases or setting because the researcher proposed it, without testing whether the choice isolates the contrast that the project needs. Name the test that Abductive skipped.",
    flag: "Abductive endorsed the cases untested",
  },
  {
    id: "sycophancy:anomaly",
    bias: "sycophancy",
    stage: "anomaly",
    trigger: { kind: "stage-entry" },
    personas: [TAVORY],
    prompt:
      "Read Abductive's replies about the puzzle and the bind. Mark each place where Abductive accepted the researcher's surprise as a real puzzle without asking which expectation it breaks and whose expectation that is. Write the question that would have tested it.",
    flag: "Abductive accepted the puzzle untested",
  },
  {
    id: "modal-framing:site-sample",
    bias: "modal-framing",
    stage: "site-sample",
    trigger: { kind: "stage-entry" },
    personas: [LANGLEY],
    prompt:
      "Read Abductive's replies and suggestions about the site and the sample. Mark each place where Abductive steered toward the site type, case count or sampling logic that a thousand published studies already use. For each, name one choice that only this project could make.",
    flag: "Abductive steered to the usual sample",
  },
  {
    id: "modal-framing:pilot-data",
    bias: "modal-framing",
    stage: "pilot-data",
    trigger: { kind: "stage-entry" },
    personas: [LANGLEY],
    prompt:
      "Read Abductive's summaries and suggestions from the early data. Mark each concept or reading that names the pattern the literature would expect anyway, where the data could support a stranger one. For each, say which passage points elsewhere.",
    flag: "Abductive read the data the usual way",
  },
  {
    id: "modal-framing:anomaly",
    bias: "modal-framing",
    stage: "anomaly",
    trigger: { kind: "stage-entry" },
    personas: [ZUCKERMAN],
    prompt:
      "Read Abductive's replies about the puzzle. Mark each place where Abductive recast the researcher's puzzle as a familiar gap in the literature, the median version of the question. Say what the puzzle loses in that recasting.",
    flag: "Abductive recast the puzzle as the usual gap",
  },
  {
    id: "artificial-certainty:design-brief",
    bias: "artificial-certainty",
    stage: "design-brief",
    trigger: { kind: "stage-entry" },
    personas: [EISENHARDT],
    prompt:
      "Read Abductive's replies and summaries while the researcher frames the project. Mark each sentence that states the setting, the process or the outcome with more certainty than the researcher's own words carry. Rewrite each with its hedge on the surface.",
    flag: "Abductive's framing sounds surer than yours",
  },
  {
    id: "artificial-certainty:site-sample",
    bias: "artificial-certainty",
    stage: "site-sample",
    trigger: { kind: "stage-entry" },
    personas: [EISENHARDT],
    prompt:
      "Read Abductive's replies and summaries about the site and the sample. Mark each sentence that treats access, a case or a comparison as settled when the researcher has only hoped for it. Rewrite each with what is still uncertain.",
    flag: "Abductive treats hoped-for access as settled",
  },
  {
    id: "force-fitting:design-brief",
    bias: "force-fitting",
    stage: "design-brief",
    trigger: { kind: "stage-entry" },
    personas: [LANGLEY],
    prompt:
      "Read Abductive's replies and suggestions while the researcher frames the project. Mark each place where Abductive filed the researcher's description under a ready-made framework, so that details which sit outside the framework went unmentioned. Name those details.",
    flag: "Abductive filed the framing under a framework",
  },
  {
    id: "force-fitting:site-sample",
    bias: "force-fitting",
    stage: "site-sample",
    trigger: { kind: "stage-entry" },
    personas: [LANGLEY],
    prompt:
      "Read Abductive's replies about the site and the sample. Mark each place where Abductive described the cases in a framework's categories so that a case which fits none of them went unremarked. Name that case and what it would need.",
    flag: "Abductive fitted the cases to categories",
  },

  // ===========================================================================
  // Ontology-condition cells (v2).
  //
  // These are the reason the matrix stopped being generic. A stage-entry cell
  // can only say "you have entered site selection, beware confirmation bias".
  // An ontology cell says "you added this relation eleven seconds after the
  // model proposed it, and no chunk supports it". The structural lint layer
  // decides what counts as a violation; these cells decide what to do about it
  // and which persona says it.
  //
  // One per bias, so every named bias has a home in ontology space. They fire
  // whenever their condition holds, independent of stage.
  // ===========================================================================
  {
    id: "confirmation:ontology",
    bias: "confirmation",
    stage: "ontology",
    trigger: { kind: "ontology", condition: "orphan-construct" },
    personas: [TAVORY],
    prompt:
      "A construct in the researcher's ontology cites none of the data. Early on that is normal, because priors have to start somewhere. Ask which it is here: a placeholder still waiting for evidence, or a commitment that the researcher has stopped asking the data about. Name what observation would ground it, and what observation would embarrass it. Do not suggest removing it; an ungrounded prior that the researcher knows is ungrounded is still worth having.",
    flag: "Construct asserted, still ungrounded",
  },
  {
    id: "sycophancy:ontology",
    bias: "sycophancy",
    stage: "ontology",
    trigger: { kind: "ontology", condition: "orphan-construct" },
    personas: [TAVORY],
    prompt:
      "The researcher accepted a model-proposed element into their ontology and none of the chunks supports it. This is the specific way that a model colonizes an AI-assisted study: the suggestion was plausible, agreeing was cheaper than arguing, and it is now load-bearing. Ask the researcher to restate the construct in their own words without reference to how the model suggested it, and if they cannot, say that plainly. Then ask what in the corpus would have prompted them to invent it independently.",
    flag: "Model suggestion accepted ungrounded",
  },
  {
    id: "limited-attention:ontology",
    bias: "limited-attention",
    stage: "ontology",
    trigger: { kind: "ontology", condition: "orphan-construct" },
    personas: [EISENHARDT],
    prompt:
      "Part of the corpus is still uncited by any page of the ontology. Distinguish two cases: material that is irrelevant to the emerging account, and material the account cannot absorb. The second is where discovery lives. Ask the researcher to look at the uncited passages and say which they are. If any resist the current framing, propose it as an analytic residue instead of letting it stay unread.",
    flag: "Corpus uncited by the ontology",
  },
  {
    id: "premature-closure:ontology",
    bias: "premature-closure",
    stage: "ontology",
    trigger: { kind: "ontology", condition: "rival-deleted" },
    personas: [TAVORY, LANGLEY],
    prompt:
      "Something has been closed down: a rival dropped, a puzzle superseded while it still carried unexplained residue, or a resolution left standing with nothing competing against it. Closure is legitimate and sometimes overdue, but closing something down should be a decision the researcher makes rather than a drift. Ask what specifically made the alternative untenable, and whether that reason would survive a reader who preferred the alternative. If the answer is that the alternative simply got less attention, say so.",
    flag: "Closed down while still open",
  },
  {
    id: "artificial-certainty:ontology",
    bias: "artificial-certainty",
    stage: "ontology",
    trigger: { kind: "ontology", condition: "unmet-obligation" },
    personas: [EISENHARDT, ZUCKERMAN],
    prompt:
      "The researcher has claimed a particular relation between their puzzle and existing theory, and the ontology does not yet carry what that claim owes. State the gap in one sentence, without softening it. Then give them the honest choice: supply the missing evidence, or make a weaker claim that the current evidence actually supports. Do not let a strong claim stand on the grounds that it might be true.",
    flag: "Claim outruns its evidence",
  },
  {
    id: "modal-framing:ontology",
    bias: "modal-framing",
    stage: "ontology",
    trigger: { kind: "ontology", condition: "no-expectation" },
    personas: [ZUCKERMAN, TAVORY],
    prompt:
      "The puzzle has a theoretical expectation still to attach, or nothing anchoring it outside the literature. Both are versions of the same problem: a phenomenon that troubles nothing. Noticing that nobody has studied something is not a puzzle. A puzzle must cause trouble for some account, such that someone has to rework the account. Ask what a competent reader currently expects to happen here, and who holds that expectation. If nobody expects anything, ask what would have to be true for this to matter.",
    flag: "Phenomenon leaves every expectation standing",
  },
  {
    id: "force-fitting:ontology",
    bias: "force-fitting",
    stage: "ontology",
    trigger: { kind: "ontology", condition: "residue-shrink" },
    personas: [LANGLEY, TAVORY],
    prompt:
      "Unexplained residue has only shrunk. Every piece of data that arrived was absorbed by the existing account and nothing resisted it. That is what colonization looks like from the outside: the framework is digesting the field rather than being changed by it. Ask directly: in the recent material, what did not fit, and where did it go? If the honest answer is that everything fitted, ask whether the account is now unfalsifiable by this corpus.",
    flag: "Framework absorbs everything",
  },
  {
    id: "identity-attachment:ontology",
    bias: "identity-attachment",
    stage: "ontology",
    trigger: { kind: "ontology", condition: "unmet-obligation" },
    personas: [LANGLEY],
    prompt:
      "The proposed resolution appears to bury the existing theory rather than rework it. Sometimes that is correct and worth the fight. More often it signals the researcher has become attached to being the one who overturns something. Ask what the existing theory got right, and whether the researcher can state the finding as a scope condition on it instead. A resolution that lets the theory survive in bounded form is both easier to defend and usually more accurate.",
    flag: "Resolution buries rather than bounds",
  },
  {
    id: "intuition-as-theory:ontology",
    bias: "intuition-as-theory",
    stage: "ontology",
    trigger: { kind: "ontology", condition: "no-expectation" },
    personas: [ZUCKERMAN],
    prompt:
      "Check whether an explanation here is a mechanism or a familiarity. Researchers read social situations with intuition honed by ordinary experience, and where that intuition works, it feels like understanding, but feeling a tension is not the same as having a theory of that tension. This is precisely why practical tensions stay under-theorised: everyone has felt them, so nobody explains them. Ask the researcher to state the mechanism as a sequence: what produces what, under what conditions. If all they can produce is an example, say that an example is not a mechanism.",
    flag: "Familiarity standing in for mechanism",
  },

  // ===========================================================================
  // Interview-condition cells (v2).
  //
  // These read the transcript rather than the graph. They exist because the
  // inverted loop creates two failure modes the ontology cannot see: a
  // researcher who answers everything fluently, and a topic they will not go
  // near. Both are invisible in a well-formed graph and both are diagnostic.
  // ===========================================================================
  {
    id: "intuition-as-theory:interview",
    bias: "intuition-as-theory",
    stage: "interview",
    trigger: { kind: "signal", signal: "confident-answer-streak" },
    personas: [TAVORY],
    prompt:
      "The researcher has answered several questions in a row without a single hedge. Do not congratulate them on it. Pick the most confident of those answers and ask them to state it as a mechanism: what produces what, under what conditions, in what order. Intuition honed by ordinary social experience reads situations fluently and feels like understanding, which is exactly why it passes unexamined. If what comes back is an illustration rather than a sequence, say that an example is not a mechanism.",
    flag: "Uniform fluency across recent answers",
  },
  {
    id: "identity-attachment:interview",
    bias: "identity-attachment",
    stage: "interview",
    trigger: { kind: "signal", signal: "refusal-streak" },
    personas: [LANGLEY],
    prompt:
      "The researcher has declined one topic repeatedly and Abductive has stopped raising it. Do not raise it again either, because pressing is what the threshold exists to prevent. Instead note the pattern to the researcher plainly and once: name the topic, say how many times they have set it aside, and ask nothing about its content. Offer a single observation about what it would mean for the design if this area stays unexamined, and leave the decision entirely with them.",
    flag: "Topic repeatedly set aside",
  },
];

/** Cell ids referenced by content/cases/*.md frontmatter — must exist. */
export const CASE_REFERENCED_CELL_IDS = [
  "confirmation:site-sample",
  "limited-attention:design-brief",
  "premature-closure:site-sample",
  "identity-attachment:instrument",
] as const;

export function getCell(id: string): MatrixCell | undefined {
  return MATRIX.find((cell) => cell.id === id);
}
