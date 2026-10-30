/**
 * The researcher's profile for the help chat (M95, ISC-773).
 *
 * The owner, 2026-10-30: the help chat "should understand both the details
 * about the tool but also anything about the user and their current project".
 * The project already says a lot; this profile says who is asking, so an answer
 * can fit a first-year PhD student differently from a professor.
 *
 * One profile per browser, not per project, because it describes the person.
 * Every field is optional. Storage is the browser's own, and every read and
 * write is wrapped: a private window or blocked site data leaves the profile
 * empty and the help chat working, with the answers kept for the page's life.
 */

import type { HelpAbout } from "../ledger/events.ts";

export type CareerStage = "masters" | "phd-early" | "phd-later" | "postdoc" | "faculty" | "other";
export type QualExperience = "new" | "some" | "a-lot";

export interface AboutYou {
  readonly stage?: CareerStage;
  readonly field?: string;
  readonly experience?: QualExperience;
  readonly wants?: string;
}

export const CAREER_STAGES: readonly { readonly id: CareerStage; readonly label: string }[] = [
  { id: "masters", label: "Master's student" },
  { id: "phd-early", label: "PhD student in the first two years" },
  { id: "phd-later", label: "PhD student in year three or later" },
  { id: "postdoc", label: "Postdoc" },
  { id: "faculty", label: "Faculty" },
  { id: "other", label: "Other" },
];

export const QUAL_EXPERIENCE: readonly { readonly id: QualExperience; readonly label: string }[] = [
  { id: "new", label: "New to qualitative research" },
  { id: "some", label: "Some" },
  { id: "a-lot", label: "A lot" },
];

/** The profile's field labels and the questions under them (L11: a short noun, the question as help). */
export const ABOUT_YOU_FIELDS = {
  stage: { label: "Career stage", help: "Where are you in your career?" },
  field: { label: "Field", help: "In which field or discipline do you work?" },
  experience: { label: "Qualitative experience", help: "How much qualitative research have you done?" },
  wants: { label: "Your aim", help: "What do you want from Abductive?" },
} as const;

export const ABOUT_YOU_KEY = "abductive.about-you.v1";

/** The browser's storage, or none when the accessor throws. */
function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** The page-life copy, for a browser whose storage refuses the write. */
let kept: AboutYou = {};

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 400);
  return trimmed === "" ? undefined : trimmed;
}

/** Only the fields that the profile knows, each in its own type, from whatever was stored. */
export function cleanAboutYou(raw: unknown): AboutYou {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const stage = CAREER_STAGES.find((s) => s.id === r.stage)?.id;
  const experience = QUAL_EXPERIENCE.find((x) => x.id === r.experience)?.id;
  const field = text(r.field);
  const wants = text(r.wants);
  return {
    ...(stage === undefined ? {} : { stage }),
    ...(field === undefined ? {} : { field }),
    ...(experience === undefined ? {} : { experience }),
    ...(wants === undefined ? {} : { wants }),
  };
}

export function readAboutYou(storage: Storage | undefined = browserStorage()): AboutYou {
  if (storage === undefined) return kept;
  try {
    const raw = storage.getItem(ABOUT_YOU_KEY);
    return raw === null ? kept : cleanAboutYou(JSON.parse(raw));
  } catch {
    return kept;
  }
}

/** Saves the profile. False when the browser refused, in which case the answers last until a reload. */
export function writeAboutYou(about: AboutYou, storage: Storage | undefined = browserStorage()): boolean {
  kept = cleanAboutYou(about);
  if (storage === undefined) return false;
  try {
    if (aboutYouFilled(kept)) storage.setItem(ABOUT_YOU_KEY, JSON.stringify(kept));
    else storage.removeItem(ABOUT_YOU_KEY);
    return true;
  } catch {
    return false;
  }
}

export function aboutYouFilled(about: AboutYou): boolean {
  return Object.keys(cleanAboutYou(about)).length > 0;
}

export function stageLabel(stage: CareerStage): string {
  return CAREER_STAGES.find((s) => s.id === stage)?.label ?? stage;
}

export function experienceLabel(experience: QualExperience): string {
  return QUAL_EXPERIENCE.find((x) => x.id === experience)?.label ?? experience;
}

/** The snapshot a `help-asked` event carries, in the profile's words, or undefined when the profile is empty. */
export function aboutSnapshot(about: AboutYou): HelpAbout | undefined {
  const a = cleanAboutYou(about);
  if (!aboutYouFilled(a)) return undefined;
  return {
    ...(a.stage === undefined ? {} : { stage: stageLabel(a.stage) }),
    ...(a.field === undefined ? {} : { field: a.field }),
    ...(a.experience === undefined ? {} : { experience: experienceLabel(a.experience) }),
    ...(a.wants === undefined ? {} : { wants: a.wants }),
  };
}

/** For tests: forget the page-life copy. */
export function resetAboutYouForTests(): void {
  kept = {};
}
