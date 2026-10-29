/**
 * Modal twin — the conventional baseline design (ISC-30, ISC-31, ISC-42).
 *
 * At design-brief lock, `generateTwin` runs the SAME brief inputs through the
 * active inference client asking for the most modal/conventional design: the
 * expected research-question framing, the expected site/sample logic, and the
 * expected findings. The result is STORED (twins object store in the
 * qual-design-app DB) and NEVER displayed automatically — reveal is gated
 * (anomaly stage, or a warned explicit action) and every reveal appends a
 * `reveal` ledger event via {@link makeRevealEvent}.
 *
 * All functions here are storage/logic only; TwinReveal.tsx owns the gated UI.
 */

import { providerField, type Provider } from "../inference/types.ts";
import { effectiveUnit, unitWords } from "../interview/unitOfAnalysis.ts";
import type { InferenceClient } from "../inference/types.ts";
import { MODEL_VOICE_RULES } from "../inference/promptMarkers.ts";
import { OWNER_RULES } from "../personas/voice.ts";
import { completeInVoice } from "../inference/voiceRetry.ts";
import type { RevealEvent } from "../ledger/events.ts";
import type { StageId } from "../matrix/schema.ts";
import type { Project } from "../state/projects.ts";
import { getTwinByProject, saveTwin } from "../state/projects.ts";

/**
 * One expectation the researcher has accepted out of a paper (M29, A6).
 *
 * Title and body, which is what the theory page holds: the expectation, where
 * its authors say it holds, and the passage it came from. The twin is asked
 * what a competent person would design given these, so it needs the claim and
 * not the citation apparatus around it.
 */
export interface TwinTheoryClaim {
  readonly title: string;
  readonly body: string;
}

export interface ModalTwin {
  readonly id: string;
  readonly projectId: string;
  /** The most conventional framing of the research question. */
  readonly researchQuestionFraming: string;
  /** The most conventional site/sample logic for that question. */
  readonly siteSampleLogic: string;
  /** The findings the modal version of this study would be expected to report. */
  readonly expectedFindings: string;
  /**
   * The contribution the modal study of this literature would claim (M29, A6).
   *
   * Added because at design stage the most useful divergence is not site logic.
   * It is what you would end up able to say. A researcher who reads the ordinary
   * version's contribution and recognises their own has learned the thing this
   * whole comparison exists to tell them.
   *
   * Optional on the type, because a twin generated before M29 is stored and is
   * never regenerated: the baseline is a snapshot of the first lock and
   * refreshing it would let later knowledge leak into the "before" artifact.
   * An old twin has three facets and says so by leaving this undefined.
   */
  readonly expectedContribution?: string;
  readonly model: string;
  readonly modelVersion: string;
  /** M56: the bridge's lane that wrote the twin; absent when there was none, read as Claude. */
  readonly provider?: Provider;
  /** M60: the local server, beside provider "local". */
  readonly server?: string;
  readonly createdAt: number;
  /** M69, ISC-644: a facet went back once for a sentence that broke one of the owner's rules. */
  readonly voiceRetry?: true;
}

/*
 * M29, A6. "The median competent study in this literature" left "this
 * literature" to whatever the model's prior supplied, which made the baseline a
 * guess about a field rather than a reading of the papers the researcher named.
 * With their accepted expectations in the context, the conventional version
 * becomes the study those papers would lead a competent person to design. That
 * is sharper, it is falsifiable, and it is much closer to what a supervisor
 * would actually predict.
 */
const TWIN_SYSTEM = [
  MODEL_VOICE_RULES,
  "",
  /* M69, ISC-644: the owner's rules, which the ordinary version a researcher reads must keep. */
  OWNER_RULES,
  "",
  "You are producing a MODAL BASELINE for a qualitative research design.",
  "Given a design brief and the expectations the researcher has taken from the papers they are arguing with, state the study these papers would lead a competent person to design. The most conventional, expected, middle-of-the-road version of it. Do NOT be creative, contrarian, or original: the value of this artifact is precisely its conventionality. Abductive will later compare it against the researcher's actual design to make divergence visible.",
  "Answer the single facet that this prompt names, in 2-6 plain sentences, starting with the answer and without headings.",
].join("\n");

interface TwinFacet {
  readonly key: keyof Pick<
    ModalTwin,
    "researchQuestionFraming" | "siteSampleLogic" | "expectedFindings" | "expectedContribution"
  >;
  readonly instruction: string;
  /**
   * Whether this facet is shown the expectations taken from the papers.
   *
   * The framing facets are: what a competent person would ask, and what they
   * would end up claiming. Both are decided by the literature, so both see it.
   * Site and sample logic follows from the question rather than from the
   * papers, and expected findings is what the design would turn up; handing
   * either the reading list makes the baseline argue with the papers instead of
   * being the ordinary study, which is a divergence the comparison would then
   * fail to see.
   */
  readonly seesPapers: boolean;
}

const FACETS: readonly TwinFacet[] = [
  {
    key: "researchQuestionFraming",
    instruction:
      "Facet: RESEARCH QUESTION FRAMING. State the most conventional framing of the research question that this brief would conventionally ask.",
    seesPapers: true,
  },
  {
    key: "siteSampleLogic",
    instruction:
      "Facet: SITE / SAMPLE LOGIC. State the most conventional site selection and sampling logic that a study of this question would conventionally use.",
    seesPapers: false,
  },
  {
    key: "expectedFindings",
    instruction:
      "Facet: EXPECTED FINDINGS. State the findings that the modal version of this study would typically report.",
    seesPapers: false,
  },
  {
    // M29, A6. The fourth facet, and the one a design-stage researcher can act
    // on soonest: a contribution they recognise as their own is the signal that
    // their study is the ordinary one.
    key: "expectedContribution",
    instruction:
      "Facet: EXPECTED CONTRIBUTION. State the contribution the modal study of this literature would claim.",
    seesPapers: true,
  },
];

/**
 * The brief-derived context a facet call is given (M29, A6).
 *
 * Two changes at M29 and they pull the same way.
 *
 * The corpus count is gone. It said "Corpus at generation time: N data
 * chunk(s)", which told the baseline how much fieldwork the researcher had
 * already done. The whole value of the twin is what a competent person would
 * design *before* looking at this data, so a count of it makes the baseline
 * less conventional than it should be and shrinks the divergence the comparison
 * is there to measure. Nothing replaced it: the number was the only thing about
 * the material that ever reached here.
 *
 * No chunk text has ever reached this function and none does now. That is worth
 * writing down rather than leaving as an accident of the signature, because the
 * facet split below is stated as "the framing facets see the papers and not the
 * data", and the second half of that sentence is enforced by there being no
 * data in the room at all.
 */
export function twinUserContext(
  project: Project,
  claims: readonly TwinTheoryClaim[],
  seesPapers = true,
): string {
  const brief = project.brief;
  const venue =
    brief.targetVenue === undefined ? "" : `\nTarget venue: ${brief.targetVenue}`;
  const lines = [
    `# Design brief: ${project.title}`,
    ...((brief.puzzleAnswer ?? "").trim() === "" ? [] : [`Puzzle, in their own words: ${brief.puzzleAnswer}`]),
    `Puzzle, as the tool reads it: ${brief.researchQuestion}`,
    `Site rationale: ${brief.siteRationale}`,
    `Sample rationale: ${brief.sampleRationale}`,
    `Declared data type: ${brief.dataType === "" ? "not stated" : brief.dataType}${venue}`,
    /* M84, ISC-707: the by-the-book design is written at the project's unit. */
    `Unit of analysis: ${(() => {
      const unit = effectiveUnit(brief.unit, brief.unitOther);
      return unit === undefined ? "not identified yet" : `${unit === "other" ? (brief.unitOther ?? "").trim() : unit} (${unitWords(unit, brief.unitOther)})`;
    })()}`,
  ];
  if (!seesPapers || claims.length === 0) return lines.join("\n");
  return [
    ...lines,
    "",
    "# The expectations they have taken from the papers they are arguing with",
    ...claims.map((claim) => `- ${claim.title}\n  ${claim.body.trim()}`),
  ].join("\n");
}

export interface TwinGenerationOptions {
  readonly now?: () => number;
  readonly makeId?: () => string;
}

/**
 * Generate the modal twin: one inference call per facet (3 calls total,
 * within the 1-3 budget, ISC-30). Pure over its inputs apart from the client
 * — returns the twin; persistence is the caller's job.
 */
export async function generateTwin(
  project: Project,
  claims: readonly TwinTheoryClaim[],
  client: InferenceClient,
  options: TwinGenerationOptions = {},
): Promise<ModalTwin> {
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());

  const facetTexts: Partial<Record<TwinFacet["key"], string>> = {};
  let model = "unknown";
  let modelVersion = "unknown";
  let lane: { provider?: Provider; server?: string } = {};
  let retried = false;

  for (const facet of FACETS) {
    // Built per facet rather than once, because two of the four are shown the
    // papers and two are not. See `seesPapers`.
    const context = twinUserContext(project, claims, facet.seesPapers);
    const result = await completeInVoice(client, {
      system: TWIN_SYSTEM,
      messages: [{ role: "user", content: `${context}\n\n${facet.instruction}` }],
      maxTokens: 1024,
    });
    facetTexts[facet.key] = result.text.trim();
    model = result.model;
    modelVersion = result.modelVersion;
    lane = providerField(result);
    if (result.voiceRetry === true) retried = true;
  }

  return {
    id: makeId(),
    projectId: project.id,
    researchQuestionFraming: facetTexts.researchQuestionFraming ?? "",
    siteSampleLogic: facetTexts.siteSampleLogic ?? "",
    expectedFindings: facetTexts.expectedFindings ?? "",
    expectedContribution: facetTexts.expectedContribution ?? "",
    model,
    modelVersion,
    ...lane,
    createdAt: now(),
    ...(retried ? { voiceRetry: true as const } : {}),
  };
}

export interface GenerateAndStoreParams {
  readonly project: Project;
  /** The accepted expectations, in place of the corpus count (M29, A6). */
  readonly claims: readonly TwinTheoryClaim[];
  readonly client: InferenceClient;
  /** Injectable persistence (defaults to the app IndexedDB store). */
  readonly save?: (twin: ModalTwin) => Promise<void>;
  readonly getExisting?: (projectId: string) => Promise<ModalTwin | undefined>;
  readonly generationOptions?: TwinGenerationOptions;
}

/**
 * Idempotent generate-and-store, called from the brief-lock flow. If a twin
 * already exists for the project it is returned untouched (the baseline is a
 * snapshot of the FIRST lock — regenerating would let later knowledge leak
 * into the "before" artifact). Never displays anything.
 */
export async function generateAndStoreTwin(
  params: GenerateAndStoreParams,
): Promise<ModalTwin> {
  const save = params.save ?? saveTwin;
  const getExisting = params.getExisting ?? getTwinByProject;

  const existing = await getExisting(params.project.id);
  if (existing !== undefined) return existing;

  const twin = await generateTwin(
    params.project,
    params.claims,
    params.client,
    params.generationOptions ?? {},
  );
  await save(twin);
  return twin;
}

// ---------------------------------------------------------------------------
// Reveal gating (ISC-31, ISC-42)
// ---------------------------------------------------------------------------

/** Direct (stage-gate) reveal is only allowed at the anomaly stage. */
export function canRevealDirectly(stage: StageId): boolean {
  return stage === "anomaly";
}

/** Build the `reveal` ledger event that MUST accompany every twin reveal. */
export function makeRevealEvent(
  projectId: string,
  via: RevealEvent["via"],
  options: TwinGenerationOptions = {},
): RevealEvent {
  const now = options.now ?? (() => Date.now());
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  return {
    id: makeId(),
    ts: now(),
    actor: "human",
    projectId,
    type: "reveal",
    subject: "modal-twin",
    via,
  };
}
