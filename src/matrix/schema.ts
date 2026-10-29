/**
 * Bias × stage matrix schema (ISC-7, ISC-8, ISC-10).
 *
 * The matrix is a declarative typed config, reviewable cell-by-cell by a
 * non-programmer co-author. Cells fire either on stage entry or when a
 * ledger-derived signal predicate becomes true.
 */

/**
 * Nine named biases: five human-side, four AI-side (ISC-10, ISC-40).
 *
 * `intuition-as-theory` is new in v2 and is not a restatement of
 * premature-closure. Premature closure is stopping the search too early;
 * this is believing you have an explanation when what you have is
 * familiarity. Zuckerman names the mechanism directly — scholars move between
 * "using existing social theory" and "using their intuition as participants in
 * the social world", and because intuition works for us day to day, "we may
 * think we understand it. But even if we understand something at an intuitive
 * level, this does not mean that we have good theory for it."
 *
 * That is also his explanation for why obscured puzzles stay obscured, which
 * makes it the bias most likely to bite the researchers this tool is for:
 * everyone has felt a practical tension, and the familiarity of the
 * experience passes for an account of it.
 *
 * Probe: state the mechanism. An example is not a mechanism.
 */
export type BiasId =
  // Human biases
  | "confirmation"
  | "limited-attention"
  | "premature-closure"
  | "identity-attachment"
  | "intuition-as-theory"
  // AI biases
  | "sycophancy"
  | "modal-framing"
  | "artificial-certainty"
  | "force-fitting";

export const BIAS_IDS: readonly BiasId[] = [
  "confirmation",
  "limited-attention",
  "premature-closure",
  "identity-attachment",
  "intuition-as-theory",
  "sycophancy",
  "modal-framing",
  "artificial-certainty",
  "force-fitting",
];

export const HUMAN_BIASES: readonly BiasId[] = [
  "confirmation",
  "limited-attention",
  "premature-closure",
  "identity-attachment",
  "intuition-as-theory",
];

export const AI_BIASES: readonly BiasId[] = [
  "sycophancy",
  "modal-framing",
  "artificial-certainty",
  "force-fitting",
];

/** Five design-time stages. */
export type StageId =
  | "design-brief"
  | "site-sample"
  | "instrument"
  | "pilot-data"
  | "anomaly";

export const STAGE_IDS: readonly StageId[] = [
  "design-brief",
  "site-sample",
  "instrument",
  "pilot-data",
  "anomaly",
];

/**
 * Ledger signals: the three from v1 plus two that read the interview loop
 * (ISC-9, ISC-49, ISC-50).
 *
 * `confident-answer-streak` is the accept-streak insight moved one layer in.
 * A researcher answering everything without hesitation is not evidence of a
 * well-run interview; it is the shape a rubber-stamped one takes when the
 * questions have stopped landing anywhere uncomfortable.
 */
export type SignalId =
  | "acceptance-streak"
  | "unadjudicated-challenges"
  | "coverage-stagnation"
  | "confident-answer-streak"
  | "refusal-streak";

export const SIGNAL_IDS: readonly SignalId[] = [
  "acceptance-streak",
  "unadjudicated-challenges",
  "coverage-stagnation",
  "confident-answer-streak",
  "refusal-streak",
];

/**
 * Conditions on the ontology graph, mirroring the structural lint rules
 * (ISC-39). These are what make a flag specific: it fires on an epistemic
 * move — a relation asserted with nothing behind it, a rival deleted — rather
 * than on the researcher happening to enter a stage.
 */
export type OntologyConditionId =
  | "ontology"
  | "orphan-construct"
  | "unmet-obligation"
  | "residue-shrink"
  | "rival-deleted"
  | "no-expectation";

export const ONTOLOGY_CONDITION_IDS: readonly OntologyConditionId[] = [
  "ontology",
  "orphan-construct",
  "unmet-obligation",
  "residue-shrink",
  "rival-deleted",
  "no-expectation",
];

/**
 * Conditions about the conduct of the interview rather than the ontology it
 * produces. One value for now; kept as its own family so a cell filed here is
 * visibly not a claim about the graph.
 */
export type InterviewConditionId = "interview";

export const INTERVIEW_CONDITION_IDS: readonly InterviewConditionId[] = ["interview"];

/** All three trigger kinds must be able to fire (ISC-8, ISC-39). */
export type Trigger =
  | { readonly kind: "stage-entry" }
  | { readonly kind: "signal"; readonly signal: SignalId }
  | { readonly kind: "ontology"; readonly condition: OntologyConditionId };

/**
 * A cell's column: a research stage (v1), an ontology condition (v2), or the
 * interview itself (v2).
 *
 * Generalising the id this way is what lets the mechanisms coexist (ISC-41).
 * Every v1 cell id remains valid verbatim, which matters because the eval
 * cases and `CASE_REFERENCED_CELL_IDS` reference them as strings — renaming
 * them would silently invalidate the harness's planted-flaw mapping.
 */
export type ContextId = StageId | OntologyConditionId | InterviewConditionId;

/** Cell id convention: `<bias>:<context>` — referenced by case frontmatter. */
export type MatrixCellId = `${BiasId}:${ContextId}`;

export function isStageContext(context: ContextId): context is StageId {
  return (STAGE_IDS as readonly string[]).includes(context);
}

export interface MatrixCell {
  readonly id: MatrixCellId;
  readonly bias: BiasId;
  /**
   * The cell's column. Named `stage` in v1 and kept under that name so the
   * declarative config the co-author reviews does not churn; it now also accepts an
   * ontology condition.
   */
  readonly stage: ContextId;
  readonly trigger: Trigger;
  /** Persona creed-file slugs invoked when the cell fires. */
  readonly personas: readonly string[];
  /** The intervention prompt handed to the persona(s). */
  readonly prompt: string;
  /** Short human-readable flag label shown in the bias-flag panel. */
  readonly flag: string;
}

/** Structural validation of a matrix registry; returns human-readable errors. */
export function validateMatrix(cells: readonly MatrixCell[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    if (cell.id !== `${cell.bias}:${cell.stage}`) {
      errors.push(`cell id '${cell.id}' does not match '<bias>:<context>'`);
    }
    if (seen.has(cell.id)) errors.push(`duplicate cell id '${cell.id}'`);
    seen.add(cell.id);
    // A stage-entry trigger in an ontology column (or the reverse) would never
    // fire — the engine dispatches on trigger kind, not on the column name.
    if (cell.trigger.kind === "stage-entry" && !isStageContext(cell.stage)) {
      errors.push(`cell '${cell.id}' has a stage-entry trigger but an ontology context`);
    }
    if (cell.trigger.kind === "ontology" && isStageContext(cell.stage)) {
      errors.push(`cell '${cell.id}' has an ontology trigger but a stage context`);
    }
    // A signal cell in an ontology column would never be reached: the engine
    // routes ontology columns through lint findings, not signal evaluators.
    if (
      cell.trigger.kind === "signal" &&
      !isStageContext(cell.stage) &&
      cell.stage !== "interview"
    ) {
      errors.push(`cell '${cell.id}' has a signal trigger but an ontology context`);
    }
    if (cell.prompt.trim().length === 0) errors.push(`cell '${cell.id}' has empty prompt`);
    if (cell.flag.trim().length === 0) errors.push(`cell '${cell.id}' has empty flag`);
    if (cell.personas.length === 0) errors.push(`cell '${cell.id}' has no personas`);
  }
  return errors;
}
