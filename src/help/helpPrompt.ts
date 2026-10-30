/**
 * The help chat's prompt (M95, ISC-776, ISC-779, ISC-780).
 *
 * Model input, not rendered. The owner, 2026-10-30: the help chat "should
 * understand both the details about the tool but also anything about the user
 * and their current project that they're working on, so that you can give
 * actionable helpful feedback". Asked how far it goes, he chose "coach, don't
 * write": the help explains Abductive and works out why the researcher is
 * stuck, using their project, and points to the place where Abductive asks
 * about the research. The researcher's answers, puzzle, concepts and relations
 * stay with the interview, where each one is a decision on the record.
 *
 * The tool section is rendered from the single sources the app already prints
 * (`PAGE_HELP`, `STATIONS`, the Getting started titles), so the help chat and
 * the Help panel cannot describe the app in two vocabularies. The project
 * section reuses `studyContext`, the study list's row (`studyState`) and
 * History's own sentences (`projectLedger`), for the same reason.
 *
 * Help events are read here and nowhere in the interview (ISC-777).
 */

import type { HelpAbout, HelpAnsweredEvent, HelpAskedEvent, LedgerEvent } from "../ledger/events.ts";
import type { Msg } from "../inference/types.ts";
import type { Project } from "../state/projects.ts";
import { AUTO_SUMMARY_HELP, HELP_PAGES, PAGE_HELP, type HelpPage } from "../ui/pageHelp.ts";
import { WALKTHROUGH_TITLES } from "../ui/Walkthrough.tsx";
import { isStationId, stationById, STATIONS } from "../flow/stations.ts";
import { studyState } from "../ui/ProjectList.tsx";
import { openQuestionAt, placeLabel } from "../views/placeSummary.ts";
import { projectLedger } from "../workbench/Instrumentation.tsx";
import { projectOntology } from "../ontology/projection.ts";
import { renderStudyContext, studyContext } from "../interview/studyContext.ts";
import { MODEL_VOICE_RULES } from "../inference/promptMarkers.ts";
import { OWNER_RULES } from "../personas/voice.ts";

/** How many History lines and earlier exchanges the prompt carries. */
export const HELP_HISTORY_LINES = 8;
export const HELP_EXCHANGES = 4;

export const HELP_ACTOR = "persona:help" as const;

/** How many times the help chat asks the model to rewrite sentences that break the owner's rules (M95b). */
export const HELP_REWRITE_ASKS = 1;

/** The request the I'm stuck button sends to the model in place of the researcher's words. */
export const STUCK_REQUEST =
  "I'm stuck. From my project and the page I'm on, work out the most likely reason that I'm stuck, and tell me one thing to do next.";

const HELP_RULES = `
## Your job
You are Abductive's help. The researcher opened the Help panel and asked you something. Help them use Abductive and get unstuck on their project. Coach them; the writing is theirs.
- Explain how Abductive works when they ask, in the app's own words. Name every page, tab, step, control and button exactly as the guide below names it.
- When they're stuck, use their project below to work out the likeliest reason, say it in one sentence, and give one concrete next thing to do: the page or step to go to, and the kind of answer that place asks for.
- You may offer one question that they could ask themselves. Ask at most one question back.
- Do not write their answers, their puzzle, their concepts, their relations, their summaries or their Why it matters lines, and do not suggest wording for any of them. When they ask for research content, tell them that the chat at the step is where Abductive asks about that, and name the step.
- Do not say that you changed, saved or accepted anything. You can consider their project and can't change it.
- Use only the project details that appear below. If the project doesn't say, say so, and tell them where they would add it.
- Fit the answer to the researcher: plainer and with more of the method for someone new to qualitative research, shorter for someone experienced.
- Keep the answer under 150 words, in two or three short paragraphs of plain prose. Do not use bullet points, numbered lists, headings or bold: the panel shows plain text, as the step chat does.
- Abductive keeps the summary text exactly as it stands when the researcher presses Save answer. A summary from Auto-generate summary from chat is Abductive's writing from their replies, for them to check, edit and save, so do not say that Abductive keeps their chat words exactly as they wrote them. In the app's words: ${AUTO_SUMMARY_HELP}
- Use the app's terms: project, step, suggestion, History, Report, Sources, ontology, Starting point, Design. Call the app Abductive, and call the language model "the model".
`.trim();

/**
 * The guide to Abductive (M95b): the page the researcher is on in full, as its
 * Help panel prints it, and every other page as one line, its title and its
 * first purpose sentence. The steps go in full on Design and as their label
 * and blurb elsewhere. The M95 prompt carried every page in full, about 31,800
 * characters, and the answer waited on reading all of it.
 */
export function toolGuide(page: HelpPage): string {
  const here = PAGE_HELP[page];
  const full = [
    `### ${here.title} (the page that they're on)`,
    ...here.purpose,
    ...here.parts.map((part) => `- ${part.name}: ${part.says.join(" ")}`),
  ].join("\n");
  const index = HELP_PAGES.filter((p) => p !== page).map((p) => `- ${PAGE_HELP[p].title}: ${PAGE_HELP[p].purpose[0] ?? ""}`);
  const steps = STATIONS.map((s) => (page === "design" ? `- ${s.label}: ${s.blurb} ${s.feeds}` : `- ${s.label}: ${s.blurb}`));
  return [
    "## The guide to Abductive",
    "The Help panel of the page that they're on, word for word, then one line on each other page.",
    full,
    ["### The other pages", ...index].join("\n"),
    ["### The Design steps, in rail order", ...steps].join("\n"),
    `### Getting started\nThe front page's Getting started guide has these screens: ${WALKTHROUGH_TITLES.join("; ")}.`,
  ].join("\n\n");
}

/** The researcher, from About you. */
export function researcherBlock(about: HelpAbout | undefined): string {
  const lines = ["## The researcher"];
  if (about === undefined) {
    lines.push(
      "They haven't told Abductive about themselves under About you, on Starting point. Infer their experience only from the way that they write and from their project, and say so if it changes your answer.",
    );
    return lines.join("\n");
  }
  if (about.stage !== undefined) lines.push(`Career stage: ${about.stage}`);
  if (about.field !== undefined) lines.push(`Field: ${about.field}`);
  if (about.experience !== undefined) lines.push(`Experience with qualitative research: ${about.experience}`);
  if (about.wants !== undefined) lines.push(`What they want from Abductive: ${about.wants}`);
  return lines.join("\n");
}

/** Where the Help panel is open. */
export function placeBlock(page: HelpPage, station: string | undefined): string {
  const lines = ["## Where they are", `Page: ${PAGE_HELP[page].title}`];
  if (page === "design" && station !== undefined && isStationId(station)) {
    const s = stationById(station);
    lines.push(`Step: ${s.label}. ${s.blurb}`, `The step's question: ${s.prompt}`);
  }
  return lines.join("\n");
}

export interface HelpProject {
  readonly project: Project;
  readonly events: readonly LedgerEvent[];
  /** Ids of the project's data passages (Early data counts as answered once there are some). */
  readonly dataChunkIds?: readonly string[];
}

/** Everything the app knows about the project, in the words the app prints. */
export function projectBlock(input: HelpProject): string {
  const { project } = input;
  const events = input.events.filter((e) => e.projectId === project.id);
  const graph = projectOntology(events, project.id);
  const row = studyState({ project, events, corpusChunkIds: input.dataChunkIds ?? [] });
  const lines = [`## Their project: ${project.title}`, "", renderStudyContext(studyContext(project.brief, graph)), ""];
  lines.push("Design steps, in rail order:");
  for (const [id, state] of row.stations) {
    lines.push(`- ${stationById(id).label}: ${state === "empty" ? "still open" : "answered"}`);
  }
  const open = openQuestionAt(events, project.id);
  if (open !== null) {
    lines.push(
      `Abductive's open question for them${open.place === null ? "" : `, at ${placeLabel(open.place)}`}: ${open.question}`,
    );
  } else {
    lines.push("Every question that Abductive asked them has an answer.");
  }
  lines.push(`Suggestions waiting for their decision: ${row.staged}.`);
  lines.push(`Concepts accepted: ${row.concepts}. Relations accepted: ${row.relations}.`);
  const recent = projectLedger(events)
    .filter((r) => r.kind !== "help-asked" && r.kind !== "help-answered")
    .slice(-HELP_HISTORY_LINES);
  if (recent.length > 0) {
    lines.push("", "Their latest History, oldest first, in the app's words:");
    for (const r of recent) lines.push(`- ${r.who === "you" ? "They" : "Abductive"}: ${r.happened}`);
  }
  return lines.join("\n");
}

export interface HelpSystemInput {
  readonly page: HelpPage;
  readonly station?: string;
  readonly about?: HelpAbout;
  readonly project?: HelpProject;
}

export function helpSystemPrompt(input: HelpSystemInput): string {
  return [
    HELP_RULES,
    MODEL_VOICE_RULES,
    OWNER_RULES,
    researcherBlock(input.about),
    placeBlock(input.page, input.station),
    input.project === undefined
      ? "## Their project\nThey're on a page outside a project, so you can see the guide and their answers under About you only."
      : projectBlock(input.project),
    toolGuide(input.page),
  ].join("\n\n");
}

/** One request and its answer, when the answer arrived. */
export interface HelpExchange {
  readonly asked: HelpAskedEvent;
  readonly answer?: HelpAnsweredEvent;
}

/** The project's help exchanges in order (M95). The interview reads none of these events. */
export function helpExchanges(events: readonly LedgerEvent[], projectId: string): readonly HelpExchange[] {
  const answers = new Map<string, HelpAnsweredEvent>();
  for (const e of events) {
    if (e.projectId === projectId && e.type === "help-answered" && !answers.has(e.asked)) answers.set(e.asked, e);
  }
  return events.flatMap((e) => {
    if (e.projectId !== projectId || e.type !== "help-asked") return [];
    const answer = answers.get(e.id);
    return [answer === undefined ? { asked: e } : { asked: e, answer }];
  });
}

/** What the model reads as the researcher's turn: their words, or the stuck request. */
export function requestContent(request: { readonly text: string; readonly stuck?: boolean }): string {
  return request.stuck === true ? STUCK_REQUEST : request.text;
}

/**
 * The conversation sent to the model: the last answered exchanges, then the
 * request. A request whose answer failed is left out, so the turns alternate.
 */
export function helpMessages(
  earlier: readonly { readonly text: string; readonly stuck?: boolean; readonly answer?: string }[],
  request: { readonly text: string; readonly stuck?: boolean },
): readonly Msg[] {
  const answered = earlier.filter((x) => x.answer !== undefined && x.answer.trim() !== "").slice(-HELP_EXCHANGES);
  return [
    ...answered.flatMap((x): Msg[] => [
      { role: "user", content: requestContent(x) },
      { role: "assistant", content: x.answer as string },
    ]),
    { role: "user", content: requestContent(request) },
  ];
}
