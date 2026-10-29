/**
 * The level of the project, as the model reads it (M84, ISC-707).
 *
 * Every interview prompt, every check, the bias personas, the report's sections,
 * the study context and the ordinary version read these lines, so the unit of
 * analysis and the declared data kind say one thing to the model wherever it is
 * asked to write. The words a researcher reads about the unit live in
 * `interview/unitOfAnalysis.ts`.
 */

import type { DeclaredDataType } from "../state/projects.ts";
import { UNIT_PLURAL, effectiveUnit, typedUnit, type UnitOfAnalysis } from "./unitOfAnalysis.ts";

/** What the data kind asks the model to ask about. */
const KIND_LINES: Readonly<Record<Exclude<DeclaredDataType, "">, string>> = {
  archival:
    "- Their data is archival: documents that the setting produced, which they collected or will collect. Ask about the documents, the periods that the documents cover and the people or bodies who produced them. Do not ask them to track one individual, to observe anyone or to interview anyone.",
  interview:
    "- Their data is interviews: the accounts that people give them. Ask about the accounts that they expect to hear, and from whom at their unit of analysis.",
  ethnographic:
    "- Their data is ethnographic: fieldnotes from what they observe. Ask about the settings, the occasions and the practices that they expect to observe.",
};

/**
 * The level of the project, for any prompt: the unit, then the data kind.
 *
 * `at` is the place the prompt is for. At Context with the unit still empty,
 * the model asks for the unit before anything else, which is the brief's rule
 * for a researcher who leaves the field empty.
 */
export function levelLines(
  level: {
    readonly unit?: UnitOfAnalysis | undefined;
    /** The typed unit when `unit` is `other` (M92, ISC-749). */
    readonly unitOther?: string | undefined;
    readonly dataType?: DeclaredDataType | undefined;
  },
  at?: string,
): readonly string[] {
  const lines: string[] = ["", "## The level of their project"];
  /* M92: an Other with nothing typed reads as no unit. */
  const unit = effectiveUnit(level.unit, level.unitOther);
  const typed = typedUnit(level.unit, level.unitOther);
  if (unit === undefined) {
    lines.push(
      at === "context"
        ? "- They haven't identified a unit of analysis yet: a person, a team, an organisation, a community, a field or another unit. Before you ask anything else at Context, ask which unit their project studies."
        : "- They haven't identified a unit of analysis yet. Do not assume that their unit is a person: ask at the level that their answers describe.",
    );
  } else if (typed !== undefined) {
    lines.push(
      `- Their unit of analysis is one that they typed: "${typed}". Ask every question at that level: about each ${typed}, its practices and its changes over time. Ask about an individual only as a member of one.`,
    );
  } else if (unit === "person") {
    lines.push("- Their unit of analysis is the person: ask about the people whom they study and the actions of each.");
  } else {
    lines.push(
      `- Their unit of analysis is ${UNIT_PLURAL[unit]} (unit of analysis: ${unit}). Ask every question at that level: about ${UNIT_PLURAL[unit]}, their practices and their changes over time. Ask about an individual only as a member of one of the ${UNIT_PLURAL[unit]}.`,
    );
  }
  const kind = level.dataType ?? "";
  lines.push(kind === "" ? "- They haven't said what kind of data they'll collect yet." : KIND_LINES[kind]);
  return lines;
}
