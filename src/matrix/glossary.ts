/**
 * Plain-English glossary for the matrix axes (ISC-111 … ISC-118).
 *
 * The registry names its biases as slugs — `force-fitting`, `modal-framing`,
 * `intuition-as-theory` — and until now the review page showed the slug and
 * nothing else. A reader meeting the page cold cannot tell whether these are
 * established constructs or house vocabulary, which makes the axis of the
 * coverage grid unreadable no matter how well the grid is drawn.
 *
 * These definitions are content, not decoration, so they are tested like
 * content: every bias and context has one, every one is prose rather than a
 * restatement of its own slug (ISC-117), and every one is written for a
 * researcher rather than for someone reading the type signature.
 *
 * The `intuition-as-theory` entry follows the argument already recorded in
 * `schema.ts` — Zuckerman's point that intuition works well enough day to day
 * that familiarity passes for an account, and that stating the mechanism is
 * the probe that separates the two.
 */

import type { BiasId, ContextId } from "./schema.ts";

export interface BiasEntry {
  readonly id: BiasId;
  /** Title-case display name. */
  readonly name: string;
  /** One or two sentences, written for a researcher. */
  readonly definition: string;
  /**
   * The definition in one sentence that opens with the name (M81, ISC-691):
   * the line that opens each entry under Biases flagged, in the Report and in
   * the Checks Help.
   */
  readonly short: string;
  /** What it looks like when it is happening to you. */
  readonly tell: string;
}

export const BIAS_GLOSSARY: Readonly<Record<BiasId, BiasEntry>> = {
  confirmation: {
    id: "confirmation",
    name: "Confirmation",
    definition:
      "Searching the field for your existing expectation, and finding it. The bias arrives before fieldwork as a question with the answer already folded into its framing. During fieldwork the bias arrives as material in which every excerpt fits your view.",
    short: "Confirmation is the habit of searching the field for your existing expectation, and finding it.",
    tell: "You can't name an observation that would make you abandon the framing.",
  },
  "limited-attention": {
    id: "limited-attention",
    name: "Limited attention",
    definition:
      "There's more in the setting than you can keep in view at once. Only the data that you look at can surprise you. The handful of excerpts that you keep returning to ends up standing in for all of your data.",
    short: "Limited attention is keeping only part of your setting and data in view, so that a few excerpts stand in for the rest.",
    tell: "Every claim rests on the same three quotes, and most of the data is still unopened.",
  },
  "premature-closure": {
    id: "premature-closure",
    name: "Premature closure",
    definition:
      "Settling an open question because a plausible answer turned up, with the rivals still untried. The account stops being provisional while the evidence still supports several interpretations.",
    short: "Premature closure is settling an open question because a plausible answer turned up, with the rivals still untried.",
    tell: "There's a resolution in your ontology, and History lacks a rival that you weighed against it.",
  },
  "identity-attachment": {
    id: "identity-attachment",
    name: "Identity attachment",
    definition:
      "Design choices that protect your identity as a researcher (your method, your school, your earlier work) instead of serving this question. The attachment also shows up as the topic that you keep steering away from.",
    short: "Identity attachment is making design choices that protect your identity as a researcher instead of serving this question.",
    tell: "The declared method and the actual instrument have drifted apart, and the drift is in a flattering direction.",
  },
  "intuition-as-theory": {
    id: "intuition-as-theory",
    name: "Intuition as theory",
    definition:
      "Mistaking familiarity for explanation. You have lived the situation, so you feel you understand it. An intuition without a mechanism or an outcome isn't a theory of the events, and an example isn't a mechanism.",
    short: "Intuition as theory is mistaking your familiarity with a situation for an explanation of it.",
    tell: "Asked for the situation's workings, you can supply another vivid instance but not the process connecting the instances.",
  },
  sycophancy: {
    id: "sycophancy",
    name: "Sycophancy",
    definition:
      "The assistant agreeing with your claim because the claim was yours. Machine agreement is cheap and feels like corroboration, and that agreement is support in appearance only.",
    short: "Sycophancy is the assistant agreeing with your claim because the claim was yours.",
    tell: "Every claim that you have put forward in the last several messages went unchallenged.",
  },
  "modal-framing": {
    id: "modal-framing",
    name: "Modal framing",
    definition:
      "The pull toward the most-published version of your project: the median design, the standard protocol, the pairing of theories that a thousand papers have already used. The models learn from the middle of the distribution and return you to that middle without saying so.",
    short: "Modal framing is the pull toward the most-published version of your project, the design that a reviewer would expect.",
    tell: "Every choice in the design is the one that a reviewer would have guessed.",
  },
  "artificial-certainty": {
    id: "artificial-certainty",
    name: "Artificial certainty",
    definition:
      "Fluent synthesis that sounds exactly as confident on one interview as it would on forty. Machine prose comes unhedged by default, so the assurance of a passage isn't a guide to the weight of evidence underneath it.",
    short: "Artificial certainty is fluent prose that sounds as sure on one interview as it would on forty.",
    tell: "You write a claim resting on a single informant in the same voice as one resting on all of your data.",
  },
  "force-fitting": {
    id: "force-fitting",
    name: "Force-fitting",
    definition:
      "Bending the data until it fits the frame. A good framework absorbs a great deal, so absorption on its own means little. The warning sign is a framework that absorbs everything, with every part of the field fitting it.",
    short: "Force-fitting is bending your data until it fits your framework.",
    tell: "Your list of unexplained cases stays the same size or shrinks. You have already explained every awkward case.",
  },
};

/** A stored bias id's entry, or undefined for an id this build doesn't know (a report is data from History). */
export function biasEntry(id: string): BiasEntry | undefined {
  return Object.prototype.hasOwnProperty.call(BIAS_GLOSSARY, id) ? BIAS_GLOSSARY[id as BiasId] : undefined;
}

export interface ContextEntry {
  readonly id: ContextId;
  /** Short header label for the grid column. */
  readonly short: string;
  /** Full display name. */
  readonly name: string;
  /** What point in the work this column is. */
  readonly definition: string;
  /** Which family the column belongs to. Drives the grid's column grouping. */
  readonly family: "stage" | "graph" | "conduct";
}

export const CONTEXT_GLOSSARY: Readonly<Record<ContextId, ContextEntry>> = {
  "design-brief": {
    id: "design-brief",
    short: "Brief",
    name: "Starting point",
    definition: "The question, the motivation, and the project's purpose.",
    family: "stage",
  },
  "site-sample": {
    id: "site-sample",
    short: "Site",
    name: "Site & sample",
    definition: "Where you're going, whom you'll speak to, and your reasons for those over others.",
    family: "stage",
  },
  instrument: {
    id: "instrument",
    short: "Instrument",
    name: "Instrument",
    definition: "The protocol and the guide: the questions that you'll actually put to people.",
    family: "stage",
  },
  "pilot-data": {
    id: "pilot-data",
    short: "Pilot",
    name: "Early data",
    definition: "The first data back from the field, and your interpretation of it.",
    family: "stage",
  },
  anomaly: {
    id: "anomaly",
    short: "Anomaly",
    name: "Anomaly",
    definition: "The data that didn't fit the emerging account, and your response to it.",
    family: "stage",
  },
  ontology: {
    id: "ontology",
    short: "Your ontology",
    name: "Your ontology",
    definition:
      "What you now claim the setting contains. These squares track the shape of your ontology: a claim owing evidence, a rival deleted, an unexplained remainder that only ever shrinks.",
    family: "graph",
  },
  "orphan-construct": {
    id: "orphan-construct",
    short: "Orphan",
    name: "Orphan construct",
    definition: "A claim in your ontology without support.",
    family: "graph",
  },
  "unmet-obligation": {
    id: "unmet-obligation",
    short: "Obligation",
    name: "Unmet obligation",
    definition: "A link that you asserted without the evidence that the link requires.",
    family: "graph",
  },
  "residue-shrink": {
    id: "residue-shrink",
    short: "Residue",
    name: "Shrinking residue",
    definition: "The unexplained list only ever gets smaller.",
    family: "graph",
  },
  "rival-deleted": {
    id: "rival-deleted",
    short: "Rival",
    name: "Rival deleted",
    definition: "A competing explanation that you removed without defeating it.",
    family: "graph",
  },
  "no-expectation": {
    id: "no-expectation",
    short: "Expectation missing",
    name: "Expectation missing",
    definition: "A phenomenon that you recorded, which leaves every stated expectation standing.",
    family: "graph",
  },
  interview: {
    id: "interview",
    short: "Interview",
    name: "The interview",
    definition:
      "The course of the session, as opposed to its outcome: your answers, your declines and the evenness of the run.",
    family: "conduct",
  },
};

export interface TriggerEntry {
  readonly kind: "stage-entry" | "signal" | "ontology";
  /** Greyscale-safe mark. Shape carries the meaning; colour only reinforces. */
  readonly mark: string;
  readonly label: string;
  readonly definition: string;
}

/**
 * Three ways a cell can fire. Encoded as glyph shape rather than colour
 * because this page is the audit surface a co-author prints (ISC-120) — a
 * colour-only encoding fails on paper and for readers with colour-vision
 * deficiency, and this is the one page in the tool whose job is to be checked
 * by someone else.
 */
export const TRIGGER_GLOSSARY: readonly TriggerEntry[] = [
  {
    kind: "stage-entry",
    mark: "●",
    label: "at a step",
    definition: "Speaks up when your project reaches this point in the work.",
  },
  {
    kind: "signal",
    mark: "◆",
    label: "on a pattern",
    definition:
      "Speaks up when History shows something, such as accepting several suggestions quickly, or skipping several questions.",
  },
  {
    kind: "ontology",
    mark: "▲",
    label: "on your ontology",
    definition: "Speaks up when the shape of your ontology meets a set condition.",
  },
];

export function triggerEntry(kind: TriggerEntry["kind"]): TriggerEntry {
  const found = TRIGGER_GLOSSARY.find((t) => t.kind === kind);
  if (found === undefined) throw new Error(`missing trigger entry for '${kind}'`);
  return found;
}
