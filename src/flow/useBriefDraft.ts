/**
 * Drafting an answer out of the researcher's own words (M37, ISC-487, ISC-488).
 *
 * One hook, two callers: the step's box under the conversation, and the framing
 * band's two fields. Both do the same thing and the rule they share is the only
 * reason this is a module rather than a function inside each of them.
 *
 * The rule: the tool never writes an answer the researcher did not say. The
 * draft is assembled from their turns at this place and nothing else, the model
 * is told to leave a marked gap where the answer would need something they never
 * said, and what comes back lands in the box unsaved and marked as a draft.
 * Nothing enters the record as their answer until they press save, and the
 * `bound` event they save then names the draft it came from, so a reader can
 * tell an answer that was typed from an answer that arrived pre-filled.
 *
 * The `brief-draft` event is written whether or not they keep the text. That is
 * deliberate: a draft the researcher rejected is evidence about the tool, and a
 * record that only kept the accepted ones would report a suspiciously helpful
 * assistant.
 */

import { useCallback, useState } from "react";
import type { BriefDraftEvent } from "../ledger/events.ts";
import { GAP_ONLY, humanTurnsAt, isGapOnly, parseLabelledDraft, summaryRestatesReplies } from "../interview/conversation.ts";
import { draftPrompt } from "../interview/conversationPrompt.ts";
import { activeInferenceClient } from "../ui/personaRun.ts";
import { voiceGateProvenance } from "../inference/voiceGate.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import { providerField, type CompleteRequest, type CompleteResult, type InferenceClient } from "../inference/types.ts";
import { RULE_SHAPE, RULE_TEXT, sentencesOf } from "../copy/rules.ts";
import { voiceBreaks } from "../inference/voiceRetry.ts";

export type DraftOutcome =
  | {
      readonly kind: "drafted";
      /** The whole draft. One part everywhere since M40, the framing included. */
      readonly text: string;
      /** The `brief-draft` event, so a save can name what it came from. */
      readonly eventId: string;
    }
  /**
   * A several-answer draft (ISC-592): each part's text and its own `brief-draft`
   * event, one per part, the gaps included.
   */
  | {
      readonly kind: "drafted-parts";
      readonly parts: readonly { readonly field: string; readonly text: string; readonly eventId: string }[];
    }
  /** Nothing to draft from. Not a failure and never reported as one. */
  | { readonly kind: "nothing-said" }
  | { readonly kind: "failed"; readonly error: string };

export interface DraftRequest {
  /** Station id, or "framing". */
  readonly place: string;
  /** The question the draft answers. */
  readonly question: string;
  /** Several answers at once, each under its label (ISC-592). */
  readonly parts?: readonly { readonly field: string; readonly label: string; readonly question: string }[];
  /**
   * The part's label each reply answered, by turn id (M62, ISC-599): the
   * Starting point's replay of which question each reply was to. Printed beside
   * the reply in the prompt, so the model takes each part from the reply to its
   * question. The record keeps the turn ids alone, as before.
   */
  readonly turnParts?: ReadonlyMap<string, string>;
  /**
   * Fields still open by the researcher's own account (the owner's amendment
   * to M62): Summarise leaves each one the marked gap, whatever the model
   * returns, and the prompt says so.
   */
  readonly openParts?: ReadonlySet<string>;
}

export function useBriefDraft(projectId: string): {
  readonly makeDraft: (request: DraftRequest) => Promise<DraftOutcome>;
  readonly drafting: boolean;
} {
  const { events, appendAll } = useLedger();
  const [drafting, setDrafting] = useState(false);

  const makeDraft = useCallback(
    async (request: DraftRequest): Promise<DraftOutcome> => {
      const said = humanTurnsAt(events, projectId, request.place);
      if (said.length === 0) return { kind: "nothing-said" };
      setDrafting(true);
      try {
        const { client } = activeInferenceClient();
        const parts = request.parts ?? [];
        const ask = {
          system: draftPrompt({
            question: request.question,
            said: said.map((t) => {
              const label = request.turnParts?.get(t.id);
              return label === undefined ? t.text : `(reply to the ${label} question) ${t.text}`;
            }),
            ...(parts.length === 0 ? {} : { parts, partWords: wordsByPart(said, parts, request.turnParts) }),
            openLabels: parts.filter((p) => request.openParts?.has(p.field) === true).map((p) => p.label),
          }),
          messages: [
            {
              role: "user" as const,
              content:
                parts.length === 0
                  ? "Write the summary now, out of their replies above. Return only the summary."
                  : "Write the parts now, out of what they said above. Return only the labelled parts.",
            },
          ],
        };
        /* M78b, ISC-681: the summary is read for a gap where the researcher's
         * words exist, past five sentences, a dropped relativizer and the
         * owner's rules, and asked again once with every fix named. */
        const { result } = await checkedSummary(client, ask, {
          said,
          parts,
          ...(request.turnParts === undefined ? {} : { turnParts: request.turnParts }),
          ...(request.openParts === undefined ? {} : { openParts: request.openParts }),
        });
        if (parts.length > 0) {
          /* One event per part, the gaps included, each naming the turns it was
           * made of: a part the researcher never spoke to is still a draft the
           * tool offered, and the record keeps it whether or not it is kept. */
          const texts = parseLabelledDraft(
            result.text,
            Object.fromEntries(parts.map((p) => [p.field, p.label])) as Record<string, string>,
          );
          const drafted = parts.map((p) => {
            const event: BriefDraftEvent = {
              id: crypto.randomUUID(),
              ts: Date.now(),
              actor: "persona:interviewer",
              projectId,
              model: result.model,
              modelVersion: result.modelVersion,
              ...providerField(result),
              type: "brief-draft",
              station: request.place,
              field: p.field,
              text: request.openParts?.has(p.field) === true ? "[...]" : (texts[p.field] ?? "[...]"),
              fromTurnIds: said.map((t) => t.id),
              ...voiceGateProvenance(result),
            };
            return event;
          });
          await appendAll(drafted);
          return {
            kind: "drafted-parts",
            parts: drafted.map((e) => ({ field: e.field ?? "", text: e.text, eventId: e.id })),
          };
        }
        const event: BriefDraftEvent = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          actor: "persona:interviewer",
          projectId,
          model: result.model,
          modelVersion: result.modelVersion,
          ...providerField(result),
          type: "brief-draft",
          station: request.place,
          text: result.text.trim(),
          fromTurnIds: said.map((t) => t.id),
          ...voiceGateProvenance(result),
        };
        await appendAll([event]);
        return { kind: "drafted", text: result.text.trim(), eventId: event.id };
      } catch (err) {
        return { kind: "failed", error: err instanceof Error ? err.message : String(err) };
      } finally {
        setDrafting(false);
      }
    },
    [events, projectId, appendAll],
  );

  return { makeDraft, drafting };
}

/** The second ask, when a summary came back as the replies joined (M74b). */
export function RESUMMARISE(labels: readonly string[]): string {
  const which = labels.length === 0 || labels[0] === "" ? "Your reply" : `Your ${labels.join(", ")} part`;
  return `${which} joined the researcher's replies end to end. Write a summary of two to five sentences, shorter than the replies, keeping the researcher's phrasing where a phrase stands on its own and leaving out the researcher's questions and asides. Return the summary in the same format.`;
}

/**
 * The parts of a Summarise result that restate the replies joined end to end,
 * by label, or [""] for a one-part summary that does (M74b, ISC-664).
 */
export function joinedParts(
  text: string,
  said: readonly { readonly id: string; readonly text: string }[],
  parts: readonly { readonly field: string; readonly label: string }[],
  turnParts?: ReadonlyMap<string, string>,
): readonly string[] {
  if (parts.length === 0) return summaryRestatesReplies(text, said.map((t) => t.text)) ? [""] : [];
  const texts = parseLabelledDraft(text, Object.fromEntries(parts.map((p) => [p.field, p.label])) as Record<string, string>);
  return parts
    .filter((p) => {
      const mine = said.filter((t) => turnParts?.get(t.id) === p.label).map((t) => t.text);
      return mine.length > 0 && summaryRestatesReplies(texts[p.field] ?? "", mine);
    })
    .map((p) => p.label);
}

/* ---------------------------------------------------------------------------
 * The check on a summary (M78b, ISC-681). The serendipity walk's Summarise
 * returned "[...]" for a journal the student had named, dropped the student's
 * relativizers eight times in nine summaries, and ran four of them past five
 * sentences. The rule check that every chat reply goes through never read a
 * summary. Now one read finds each of these, one ask names them all, and what
 * still runs past five sentences is cut at the fifth.
 * ------------------------------------------------------------------------- */

/** The most sentences a summary part carries (the help's "two to five"). */
export const MAX_SUMMARY_SENTENCES = 5;

/** A line that names a paper ("Merton and Barber 2004"), which is not a sentence. */
function citationLine(line: string): boolean {
  return !/[.!?]["')\u201d]?$/.test(line) && /\b(?:1[5-9]|20)\d\d[a-z]?\b/.test(line) && line.split(/\s+/).length <= 14;
}

/** How many sentences a summary holds, the paper lines left out. */
export function summarySentenceCount(text: string): number {
  let n = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || citationLine(line)) continue;
    n += sentencesOf(line).filter((x) => /\w/.test(x)).length;
  }
  return n;
}

/** The summary cut at its `max`th sentence, the paper lines kept. */
export function cutToSentences(text: string, max: number = MAX_SUMMARY_SENTENCES): string {
  let n = 0;
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "" || citationLine(line)) {
      out.push(raw);
      continue;
    }
    const kept: string[] = [];
    for (const sentence of sentencesOf(line)) {
      if (!/\w/.test(sentence)) continue;
      if (n >= max) break;
      kept.push(sentence);
      n += 1;
    }
    if (kept.length > 0) out.push(kept.join(" "));
  }
  return out.join("\n").trim();
}

/* A "that" after one of these is a conjunction ("said that the crib changed"), not a relativizer. */
const THAT_CONJUNCTION = new Set(
  (
    "so now such given said say says saying think thinks thought know knew knows believe believed mean means meant show shows showed " +
    "suggest suggests suggested hope hoped sure clear true fact noticed notice notices realised realized found find finds feel feels felt " +
    "seems seemed guess suspect suspected expect expected told tell tells see saw seen worry worried agree agreed is was are were " +
    "except because than"
  ).split(" "),
);
const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The researcher's relative clauses that the summary dropped the relativizer
 * from: they wrote "the leads that founders have told me about" and the summary
 * says "the leads founders have told me about". Each as the phrase they wrote.
 */
export function droppedRelatives(summary: string, said: readonly string[]): readonly string[] {
  const theirs = said.join(" ").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ");
  const mine = summary.replace(/[\u2018\u2019]/g, "'");
  const out = new Set<string>();
  for (const m of theirs.matchAll(/\b([A-Za-z'-]+)\s+(that|which|who|whom)\s+([A-Za-z'-]+)/g)) {
    const [, a = "", rel = "", b = ""] = m;
    if (THAT_CONJUNCTION.has(a.toLowerCase())) continue;
    const dropped = new RegExp(`\\b${escape(a)}\\s+${escape(b)}\\b`, "i");
    const kept = new RegExp(`\\b${escape(a)}\\s+${rel}\\s+${escape(b)}\\b`, "i");
    if (dropped.test(mine) && !kept.test(mine)) out.add(`${a} ${rel} ${b}`);
  }
  return [...out];
}

/** Each part's replies, by label, from the replay of which question each reply was to. */
export function wordsByPart(
  said: readonly { readonly id: string; readonly text: string }[],
  parts: readonly { readonly label: string }[],
  turnParts?: ReadonlyMap<string, string>,
): Record<string, readonly string[]> {
  const out: Record<string, string[]> = {};
  for (const p of parts) out[p.label] = said.filter((t) => turnParts?.get(t.id) === p.label).map((t) => t.text);
  return out;
}

export interface SummaryContext {
  readonly said: readonly { readonly id: string; readonly text: string }[];
  readonly parts: readonly { readonly field: string; readonly label: string; readonly question: string }[];
  readonly turnParts?: ReadonlyMap<string, string>;
  readonly openParts?: ReadonlySet<string>;
}

/** What a summary needs fixing, each in a line the ask carries. */
export function summaryIssues(text: string, ctx: SummaryContext): readonly string[] {
  const issues: string[] = [];
  const texts = ctx.parts.length === 0 ? null : parseLabelledDraft(text, Object.fromEntries(ctx.parts.map((p) => [p.field, p.label])) as Record<string, string>);
  const words = wordsByPart(ctx.said, ctx.parts, ctx.turnParts);
  const pieces = ctx.parts.length === 0 ? [{ label: "", text, words: ctx.said.map((t) => t.text) }] : ctx.parts.map((p) => ({ label: p.label, text: texts?.[p.field] ?? GAP_ONLY, words: words[p.label] ?? [], field: p.field }));
  for (const piece of pieces) {
    const name = piece.label === "" ? "The summary" : `The ${piece.label} part`;
    const open = "field" in piece && ctx.openParts?.has(piece.field as string) === true;
    if (!open && piece.words.length > 0 && isGapOnly(piece.text)) {
      issues.push(`${name} is [...] alone, although the researcher answered it. Summarise the researcher's words for it, hedges included.`);
    }
    const n = summarySentenceCount(piece.text);
    if (n > MAX_SUMMARY_SENTENCES) issues.push(`${name} runs to ${n} sentences. Write at most five sentences.`);
  }
  for (const label of joinedParts(text, ctx.said, ctx.parts, ctx.turnParts)) {
    issues.push(`${label === "" ? "The summary" : `The ${label} part`} joins the researcher's replies end to end. Write a summary shorter than the replies.`);
  }
  for (const phrase of droppedRelatives(text, ctx.said.map((t) => t.text))) {
    issues.push(`Keep the researcher's relative pronoun: write "${phrase}" as the researcher wrote it.`);
  }
  for (const o of voiceBreaks(text, { quotable: ctx.said.map((t) => t.text) })) {
    const rules = [...new Set(o.breaks.map((b) => b.rule))];
    const shapes = rules.flatMap((r) => (RULE_SHAPE[r] === undefined ? [] : [RULE_SHAPE[r]]));
    issues.push(`In "${o.sentence}": ${rules.map((r) => RULE_TEXT[r]).join(" ")}${shapes.length === 0 ? "" : ` ${shapes.join(" ")}`}`);
  }
  return issues;
}

/** The one rewrite ask, with every fix named. */
export function summaryFixAsk(issues: readonly string[]): string {
  return [
    "Write the summary again, in the same format, keeping the researcher's words, and make these changes:",
    ...issues.map((i) => `- ${i}`),
  ].join("\n");
}

/**
 * A summary, checked (M78b, ISC-681). One call, and one more only when the
 * first leaves something to fix; the text with fewer issues is kept. Then the
 * two rules that the page can keep without the model: a part the researcher
 * answered and the model left as the gap takes their own words, and any part
 * still past five sentences is cut at the fifth.
 */
export async function checkedSummary(
  client: InferenceClient,
  ask: CompleteRequest,
  ctx: SummaryContext,
): Promise<{ readonly result: CompleteResult; readonly texts?: Record<string, string> }> {
  const first = await client.complete(ask);
  const firstIssues = summaryIssues(first.text, ctx);
  let chosen = first;
  if (firstIssues.length > 0) {
    const second = await client
      .complete({
        ...ask,
        messages: [...ask.messages, { role: "assistant" as const, content: first.text }, { role: "user" as const, content: summaryFixAsk(firstIssues) }],
      })
      .catch(() => first);
    const secondIssues = second === first ? firstIssues.length : summaryIssues(second.text, ctx).length;
    if (secondIssues < firstIssues.length || (secondIssues === firstIssues.length && second.text.trim().length < first.text.trim().length)) {
      chosen = second;
    }
  }
  if (ctx.parts.length === 0) {
    const text = summarySentenceCount(chosen.text) > MAX_SUMMARY_SENTENCES ? cutToSentences(chosen.text) : chosen.text;
    return { result: text === chosen.text ? chosen : { ...chosen, text } };
  }
  const texts = parseLabelledDraft(chosen.text, Object.fromEntries(ctx.parts.map((p) => [p.field, p.label])) as Record<string, string>);
  const words = wordsByPart(ctx.said, ctx.parts, ctx.turnParts);
  for (const p of ctx.parts) {
    const theirs = words[p.label] ?? [];
    if (ctx.openParts?.has(p.field) !== true && theirs.length > 0 && isGapOnly(texts[p.field] ?? GAP_ONLY)) {
      texts[p.field] = theirs.join(" ");
    }
    if (summarySentenceCount(texts[p.field] ?? "") > MAX_SUMMARY_SENTENCES) texts[p.field] = cutToSentences(texts[p.field] ?? "");
  }
  const text = ctx.parts.map((p) => `${p.label}: ${texts[p.field] ?? GAP_ONLY}`).join("\n");
  return { result: { ...chosen, text }, texts };
}
