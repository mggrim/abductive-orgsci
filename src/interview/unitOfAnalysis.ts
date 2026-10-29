/**
 * The unit of analysis, and the level every prompt asks at (M84, ISC-707).
 *
 * A co-author, 2026-10-07: "I keep bumping into the problem that Abductive
 * wants my story to be at the individual level and asks for data at the
 * individual level, but my unit of analysis is not the individual, it is
 * different communities participating in a field." Their data is archival, and
 * the interview asked about "following a specific scientist".
 *
 * The owner's ruling: the unit is part of the Context step. It is one word on
 * the brief (`brief.unit`, optional and additive, as `dataType` was at M74b), so
 * every prompt and every check reads the word rather than parsing an answer.
 * This module is the one place that says what the word means to the model: the
 * interview prompts, the checks, the bias personas, the report's sections, the
 * study context and the ordinary version all read `levelLines`.
 *
 * It held the one flag the unit raised until M89 (see the note at the foot).
 */


/*
 * M92, ISC-749 (Matthew, 2026-10-15): "Choose unit should have an Other option
 * which allows the user to type in the unit." `other` is the sixth value, and
 * the typed unit lives beside it on the brief as `unitOther`. An Other with an
 * empty `unitOther` reads as no unit (`effectiveUnit`), so Process may still ask.
 */
export type UnitOfAnalysis = "person" | "team" | "organisation" | "community" | "field" | "other";

/** The five units, in the order of their scale, then Other. */
export const UNITS: readonly UnitOfAnalysis[] = ["person", "team", "organisation", "community", "field", "other"];

/** The accessible name of the box that holds a typed unit (M92). */
export const UNIT_OTHER_LABEL = "Other unit of analysis";

/** The field's label (L11: a short noun). */
export const UNIT_LABEL = "Unit of analysis";

/* The field's help line, "Whose action do you study: a person, a team, an
 * organisation, a community or a field?", went on 2026-10-15 by the owner's word;
 * the label and the five options carry the field. */

/** The option a researcher reads for each unit. */
export const UNIT_OPTION: Readonly<Record<UnitOfAnalysis, string>> = {
  person: "A person",
  team: "A team",
  organisation: "An organisation",
  community: "A community",
  field: "A field",
  other: "Other",
};

/** The subject a save of the unit is filed under in History. */
export const UNIT_SUBJECT = "unit-of-analysis";

/** The unit in the plural, as a prompt and the flag's sentence say it. */
export const UNIT_PLURAL: Readonly<Record<UnitOfAnalysis, string>> = {
  person: "individual people",
  team: "teams",
  organisation: "organisations",
  community: "communities",
  field: "fields",
  other: "units of the kind that they typed",
};

/** The unit as every reader takes it: Other counts only once it has a typed unit (M92). */
export function effectiveUnit(unit: UnitOfAnalysis | undefined, unitOther?: string): UnitOfAnalysis | undefined {
  if (unit !== "other") return unit;
  return (unitOther ?? "").trim() === "" ? undefined : "other";
}

/** The typed unit, trimmed, when the unit is Other and has one. */
export function typedUnit(unit: UnitOfAnalysis | undefined, unitOther?: string): string | undefined {
  return effectiveUnit(unit, unitOther) === "other" ? (unitOther ?? "").trim() : undefined;
}

/** The unit in words for a prompt line: the plural of one of the five, or the typed unit. */
export function unitWords(unit: UnitOfAnalysis, unitOther?: string): string {
  return unit === "other" ? `the unit that they typed, "${(unitOther ?? "").trim()}"` : UNIT_PLURAL[unit];
}

export function isUnit(value: unknown): value is UnitOfAnalysis {
  return typeof value === "string" && (UNITS as readonly string[]).includes(value);
}

/* The prompt lines that read the unit and the data kind live in
 * `interview/levelPrompt.ts` (`levelLines`), beside the other prompts, so the
 * copy scan reads this file's rendered strings and not the model's instructions. */

/* M89 (2026-10-14): the unit-mismatch flag of M84 (ISC-707), raised when the
 * saved answers leaned away from the unit named at Context, went with the
 * checks, on the owner's instruction. The Context step still asks for the unit,
 * and History still reads a recorded `unit-mismatch` flag. The branch
 * `with-checks` keeps the reading. */
