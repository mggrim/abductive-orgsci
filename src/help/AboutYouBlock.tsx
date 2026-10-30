/**
 * About you, on Starting point (M96, ISC-793).
 *
 * The owner, 2026-10-30: "The about you should move to the starting point
 * section as discussed." The four questions show once, as one optional block
 * with Save and Skip; after either, the block is one line with Edit. The
 * answers describe the person, so they are kept per browser and show on every
 * project's Starting point. Only the help chat considers them (the owner kept
 * them out of the interview for Stage 1), and History records none of them.
 */

import { useId, useState } from "react";
import {
  ABOUT_YOU_FIELDS,
  CAREER_STAGES,
  QUAL_EXPERIENCE,
  aboutYouFilled,
  aboutYouSkipped,
  aboutYouSummary,
  readAboutYou,
  skipAboutYou,
  writeAboutYou,
  type AboutYou,
  type CareerStage,
  type QualExperience,
} from "./aboutYou.ts";

/** The line beside the questions. */
export const ABOUT_YOU_LINE =
  "Abductive uses these answers only in the help chat, to fit the help chat's advice to you. Abductive keeps the answers in this browser, for all your projects.";

export function AboutYouBlock() {
  const [about, setAbout] = useState<AboutYou>(() => readAboutYou());
  const [editing, setEditing] = useState<boolean>(() => !aboutYouFilled(readAboutYou()) && !aboutYouSkipped());
  const [form, setForm] = useState<AboutYou>(about);
  const ids = useId();
  const set = (patch: Partial<Record<keyof AboutYou, string>>) => setForm((f) => ({ ...f, ...patch }) as AboutYou);

  if (!editing) {
    const summary = aboutYouSummary(about);
    return (
      <section className="about-you about-you-line" aria-label="About you" data-testid="about-you">
        <p className="small" data-testid="about-you-summary">
          {summary === "" ? "You haven't answered About you." : `You: ${summary}.`}{" "}
          <button
            type="button"
            className="linkish"
            onClick={() => {
              setForm(about);
              setEditing(true);
            }}
            data-testid="about-you-edit"
          >
            Edit
          </button>
        </p>
      </section>
    );
  }

  const save = () => {
    writeAboutYou(form);
    const kept = readAboutYou();
    setAbout(kept);
    setForm(kept);
    if (!aboutYouFilled(kept)) skipAboutYou();
    setEditing(false);
  };
  const skip = () => {
    skipAboutYou();
    setForm(about);
    setEditing(false);
  };

  return (
    <section className="about-you" aria-labelledby={`${ids}-title`} data-testid="about-you">
      <h2 className="about-you-title" id={`${ids}-title`}>
        About you
      </h2>
      <p className="small muted">{ABOUT_YOU_LINE}</p>
      <div className="about-you-fields">
        <label className="about-you-field" htmlFor={`${ids}-stage`}>
          <span>{ABOUT_YOU_FIELDS.stage.label}</span>
          <span className="small muted">{ABOUT_YOU_FIELDS.stage.help}</span>
          <select
            id={`${ids}-stage`}
            value={form.stage ?? ""}
            onChange={(e) => set({ stage: e.target.value as CareerStage })}
            data-testid="about-you-stage"
          >
            <option value="">Choose one</option>
            {CAREER_STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="about-you-field" htmlFor={`${ids}-field`}>
          <span>{ABOUT_YOU_FIELDS.field.label}</span>
          <span className="small muted">{ABOUT_YOU_FIELDS.field.help}</span>
          <input
            id={`${ids}-field`}
            type="text"
            value={form.field ?? ""}
            placeholder="For example: organization theory"
            onChange={(e) => set({ field: e.target.value })}
            data-testid="about-you-field"
          />
        </label>
        <label className="about-you-field" htmlFor={`${ids}-experience`}>
          <span>{ABOUT_YOU_FIELDS.experience.label}</span>
          <span className="small muted">{ABOUT_YOU_FIELDS.experience.help}</span>
          <select
            id={`${ids}-experience`}
            value={form.experience ?? ""}
            onChange={(e) => set({ experience: e.target.value as QualExperience })}
            data-testid="about-you-experience"
          >
            <option value="">Choose one</option>
            {QUAL_EXPERIENCE.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="about-you-field" htmlFor={`${ids}-wants`}>
          <span>{ABOUT_YOU_FIELDS.wants.label}</span>
          <span className="small muted">{ABOUT_YOU_FIELDS.wants.help}</span>
          <textarea
            id={`${ids}-wants`}
            rows={2}
            value={form.wants ?? ""}
            placeholder="For example: a dissertation topic that I can defend"
            onChange={(e) => set({ wants: e.target.value })}
            data-testid="about-you-wants"
          />
        </label>
      </div>
      <div className="about-you-controls">
        <button type="button" className="btn" onClick={save} data-testid="about-you-save">
          Save
        </button>
        <button type="button" className="btn-quiet" onClick={skip} data-testid="about-you-skip">
          Skip
        </button>
      </div>
    </section>
  );
}
