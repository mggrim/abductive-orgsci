/**
 * Creed-file re-exports (ISC-13, ISC-14).
 *
 * The four scholarly creed files in content/creeds/ are bundled verbatim via
 * Vite `?raw` imports. This module is the runtime source of creed text for
 * the persona engine; tests load the same files from disk and inject them
 * (see PersonaContext.creeds) so bun test never depends on Vite loaders.
 */

import eisenhardt from "../../content/creeds/eisenhardt-positivist.md?raw";
import langley from "../../content/creeds/langley-process.md?raw";
import tavory from "../../content/creeds/tavory-timmermans-abduction.md?raw";
import zuckerman from "../../content/creeds/zuckerman-genre.md?raw";

export type PersonaSlug =
  | "eisenhardt-positivist"
  | "langley-process"
  | "tavory-timmermans-abduction"
  | "zuckerman-genre";

export const PERSONA_SLUGS: readonly PersonaSlug[] = [
  "eisenhardt-positivist",
  "langley-process",
  "tavory-timmermans-abduction",
  "zuckerman-genre",
];

/** Human display names for the persona actors. */
export const PERSONA_NAMES: Readonly<Record<PersonaSlug, string>> = {
  "eisenhardt-positivist": "Case-Study Positivist (Eisenhardt/Yin)",
  "langley-process": "Process Theorist (Langley)",
  "tavory-timmermans-abduction": "Abductive Analyst (Tavory & Timmermans)",
  "zuckerman-genre": "Genre and Puzzle (Zuckerman)",
};

/** slug → full creed markdown. */
export const CREEDS: Readonly<Record<PersonaSlug, string>> = {
  "eisenhardt-positivist": eisenhardt,
  "langley-process": langley,
  "tavory-timmermans-abduction": tavory,
  "zuckerman-genre": zuckerman,
};
