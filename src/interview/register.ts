/**
 * The register of a step's conversation (M84, ISC-703 and ISC-704).
 *
 * A co-author, 2026-10-07: the questions at Process and at Outcome "seem to be
 * very similar", and "initially, the tool should ask for big picture overviews
 * and then move to want to have data examples over time. I was a little
 * overwhelmed with being pushed for data examples very early." And: "we need to
 * be clear about whether this tool should be used before data is collected or
 * after." The owner's ruling: before.
 *
 * Three parts, each read by `conversationPrompt`:
 *
 *   - the stage: Abductive is for design, so a step asks for what the
 *     researcher knows of the setting and the literature, and only Early data
 *     asks for an instance from the material (ISC-703);
 *   - the register: before a step has a saved answer, one broad question about
 *     the step; after, specifics (ISC-704). "Saved" is the rail's own test,
 *     passed in as `stepAnswered`, so the chat and the rail agree;
 *   - the bounds: what this step is, and one line per other step saying that
 *     the other step owns its question. Written from STATIONS, so it can't
 *     drift from the rail (ISC-704).
 */

import { STATIONS, stationById, type StationId } from "../flow/stations.ts";
import type { UnitOfAnalysis } from "./unitOfAnalysis.ts";

/** The before-data rule, for every place but Early data (ISC-703). */
export const DESIGN_STAGE_RULE =
  "- Abductive is for the design stage, before data collection. Ask for what the researcher knows of their setting and of the literature. Ask for an instance from their data only at Early data.";

/**
 * Every question faces forward, outside Early data (M92, ISC-745).
 *
 * Matthew, 2026-10-15: "questions from the tool need to be focused on what the
 * research will focus or wants to explore? It should be future facing". M84 kept
 * requests for instances from data to Early data; this rule goes further, so
 * that every question at every other place asks what the researcher will study,
 * plans, expects and wants to explore.
 */
export const FORWARD_RULE =
  "- Outside Early data, ask what the researcher plans to study, expects to find and wants to explore. Do not ask what they have already seen, noticed or found.";

/** Early data's own rule: the one step that asks for an instance (ISC-703), ending forward (M92, ISC-745). */
export const EARLY_DATA_RULE =
  "- At Early data, ask for one instance from their material: one passage, one document or one moment that they recorded. Their material is a first look, before they settle the design. End each question on the thing that the instance makes them want to look for or explore next.";

/** How a thin reply is narrowed, by place (ISC-703). */
export function narrowingRule(place: string): string {
  return place === "early-data"
    ? "- A thin, uncertain or declined reply gets a narrower question about their material: one passage, one document or one moment that they recorded. Do not ask the same question again in other words."
    : "- A thin, uncertain or declined reply gets a narrower question about something that they plan to look at in the setting: one place, one practice, one kind of document that they expect to find there. Do not ask the same question again in other words.";
}

/** The overview register, before a saved answer (ISC-704). */
export function OVERVIEW_LINE(label: string): string {
  return `- The researcher has not yet saved an answer for this step. Ask for the big picture of ${label} in one question. Do not ask for instances, dates or examples yet.`;
}

/** The detail register, after a saved answer (ISC-704), still before data outside Early data. */
export function DETAIL_LINE(label: string, place: string): string {
  return place === "early-data"
    ? `- The researcher has saved an answer for this step. You may now press for specifics of ${label}: the passages, the documents and the moments in their material.`
    : `- The researcher has saved an answer for this step. You may now press for specifics of ${label}: a place, a practice, a period or a kind of document that they plan to look at.`;
}

/*
 * The follow-ups at Process and Outcome (M85, ISC-713 and ISC-714).
 *
 * A co-author, 2026-10-13, offered four questions for each of the two steps.
 * Matthew's ruling of 2026-10-14 put the period and the phenomenon in Process's
 * headline and the variance and the unit of analysis inside the step; Outcome's
 * headline carries their first three, and their fourth comes after. Each follow-up
 * is a line of the specifics register, so it reaches the model only once the
 * step has a saved answer. The unit lives at Context (M84, ISC-707): Process
 * reads it from there and asks for it only while Context's field is empty.
 */
export const PROCESS_FOLLOW_UP =
  "- Ask next about variation: how they expect the phenomenon that they'll track to vary across their period and, where their project compares cases, the cases in which they expect the variation to show.";
export const UNIT_KNOWN_LINE =
  "- They identified their unit of analysis at Context. Take the unit from there, and do not ask for it again.";
export const UNIT_EMPTY_FOLLOW_UP =
  "- The unit of analysis at Context is still empty. After the question about variation, ask which unit the variation shows in: a person, a team, an organisation, a community or a field.";
export const OUTCOME_FOLLOW_UP =
  "- Ask next whether the variation that they identified is large enough to carry an interesting and important paper.";

/*
 * The constants at Sample, in both registers (M92, ISC-744).
 *
 * Matthew, 2026-10-15: "The sample section should also push not just on what
 * needs to vary but also what should remain cosistent across the sample." The
 * overview asks for both halves of the big picture; the specifics press on the
 * constants: what the cases or people share by design, why, and what a case
 * that broke a constant would do to the comparison.
 */
export const SAMPLE_OVERVIEW_LINE =
  "- At Sample, the big picture has three parts: the comparisons that they want to explore, the way that their sample would need to vary to examine those comparisons, and the conditions that they want to hold constant across the sample. Ask about all three, one question at a time.";
export const SAMPLE_FOLLOW_UP =
  "- Ask about the constants as well as the variation: what the cases or people in their sample will share by design, why, and what a case that broke a constant would do to their comparison.";

/** The follow-up lines for one place, in the specifics register only. */
function followUpLines(place: string, unit: UnitOfAnalysis | undefined): readonly string[] {
  if (place === "process") return [PROCESS_FOLLOW_UP, unit === undefined ? UNIT_EMPTY_FOLLOW_UP : UNIT_KNOWN_LINE];
  if (place === "outcome") return [OUTCOME_FOLLOW_UP];
  if (place === "sample") return [SAMPLE_FOLLOW_UP];
  return [];
}

/** The stage and the register for one place, as prompt lines. */
export function registerLines(place: string, stepAnswered: boolean, unit?: UnitOfAnalysis): readonly string[] {
  const stage = place === "early-data" ? [EARLY_DATA_RULE] : [DESIGN_STAGE_RULE, FORWARD_RULE];
  const station = STATIONS.find((s) => s.id === place);
  if (station === undefined) return stage;
  return stepAnswered
    ? [...stage, DETAIL_LINE(station.label, place), ...followUpLines(place, unit)]
    : [...stage, OVERVIEW_LINE(station.label), ...(place === "sample" ? [SAMPLE_OVERVIEW_LINE] : [])];
}

/** A blurb as the model reads it: about the researcher, in the third person. */
function aboutThem(blurb: string): string {
  const body = blurb.trim().replace(/\.$/, "");
  const third = body
    .replace(/\byou're\b/g, "they're")
    .replace(/\bYour\b/g, "Their")
    .replace(/\byour\b/g, "their")
    .replace(/\byou\b/g, "they");
  return third.charAt(0).toLowerCase() + third.slice(1);
}

/** What this step is, and what the other steps cover (ISC-704). */
export function stepBoundsBlock(place: StationId): readonly string[] {
  const here = stationById(place);
  return [
    "",
    "## This step, and the other steps",
    `- This step is ${here.label}: ${aboutThem(here.blurb)}. Its question: ${here.prompt}`,
    `- Ask only about ${here.label}. Each other step owns its own question:`,
    ...STATIONS.filter((s) => s.id !== place).map(
      (s) => `- ${s.label} is about ${aboutThem(s.blurb)}; do not ask about it here.`,
    ),
  ];
}
