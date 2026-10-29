/**
 * Interview state projection (ISC-43, ISC-47, ISC-50, ISC-53).
 *
 * Pure replay over the event array, exactly like the ontology projection.
 * No module state, no clocks, no randomness — `projectInterview(events)`
 * called twice on the same array returns deep-equal results.
 */

import type { LedgerEvent, QuestionSelectionEvent } from "../ledger/events.ts";
import type { InterviewState, InterviewThresholds, OutstandingQuestion } from "./types.ts";

export const DEFAULT_REFUSALS_BEFORE_SILENCE = 3;

/**
 * Topic of a refusal, resolved through the question it declines.
 * Exported because the refusal-streak signal needs the same resolution and
 * two implementations would drift.
 */
export function topicOfRefusal(
  events: readonly LedgerEvent[],
  questionEventId: string,
): string | null {
  const question = events.find(
    (e): e is QuestionSelectionEvent =>
      e.type === "question-selection" && e.id === questionEventId,
  );
  return question?.topic ?? null;
}

export function projectInterview(
  events: readonly LedgerEvent[],
  projectId?: string,
  thresholds: InterviewThresholds = {},
): InterviewState {
  const silenceAt = thresholds.refusalsBeforeSilence ?? DEFAULT_REFUSALS_BEFORE_SILENCE;
  const scoped = projectId === undefined ? events : events.filter((e) => e.projectId === projectId);

  let outstanding: OutstandingQuestion | null = null;
  let turns = 0;
  let interrogationTurns = 0;
  let guidanceTurns = 0;
  const refusalsByTopic = new Map<string, number>();
  const silencedTopics: string[] = [];
  const redirections: string[] = [];
  const topicsAsked: string[] = [];
  let lastAskedTopic: string | null = null;

  for (const event of scoped) {
    switch (event.type) {
      case "question-selection": {
        turns += 1;
        if (event.mode === "interrogation") interrogationTurns += 1;
        else guidanceTurns += 1;
        if (!topicsAsked.includes(event.topic)) topicsAsked.push(event.topic);
        lastAskedTopic = event.topic;
        outstanding = {
          eventId: event.id,
          moveId: event.moveId,
          topic: event.topic,
          question: event.question,
          mode: event.mode,
          askedAt: event.ts,
        };
        break;
      }

      case "response": {
        // Only a HUMAN reply to the outstanding question clears it.
        //
        // Both halves matter. Without the reply check, any passing chatter
        // would satisfy the one-outstanding guarantee. Without the actor
        // check, the agent's own delivery of the question — which carries the
        // same `inReplyTo` so the transcript threads correctly — would close
        // the question the instant it was asked, and the ledger would show a
        // turn nobody answered as answered.
        if (
          outstanding !== null &&
          event.actor === "human" &&
          event.inReplyTo === outstanding.eventId
        ) {
          outstanding = null;
        }
        break;
      }

      case "refusal": {
        // Resolve against the full array, not the scoped slice: the refusal
        // and its question always share a project, and searching the whole
        // array keeps this correct if scoping is ever relaxed.
        const topic = topicOfRefusal(events, event.questionEventId);
        if (topic !== null) {
          const next = (refusalsByTopic.get(topic) ?? 0) + 1;
          refusalsByTopic.set(topic, next);
          if (next >= silenceAt && !silencedTopics.includes(topic)) silencedTopics.push(topic);
        }
        if (outstanding !== null && event.questionEventId === outstanding.eventId) {
          outstanding = null;
        }
        break;
      }

      /* M74b, ISC-665: the chips' own events. "I don't know" counts as the
       * decline it always was; "Ask me differently" declines nothing. Both
       * close the question they name. */
      case "dont-know": {
        const topic = topicOfRefusal(events, event.questionEventId);
        if (topic !== null) {
          const next = (refusalsByTopic.get(topic) ?? 0) + 1;
          refusalsByTopic.set(topic, next);
          if (next >= silenceAt && !silencedTopics.includes(topic)) silencedTopics.push(topic);
        }
        if (outstanding !== null && event.questionEventId === outstanding.eventId) outstanding = null;
        break;
      }

      case "ask-differently": {
        if (outstanding !== null && event.questionEventId === outstanding.eventId) outstanding = null;
        break;
      }

      case "redirection": {
        redirections.push(event.toTopic);
        // Seizing the agenda supersedes whatever was on the table, whether or
        // not the redirection names the move it displaced (ISC-47).
        outstanding = null;
        break;
      }

      default:
        break;
    }
  }

  return {
    outstanding,
    turns,
    interrogationTurns,
    guidanceTurns,
    interrogationRatio: turns === 0 ? null : interrogationTurns / turns,
    refusalsByTopic,
    silencedTopics,
    redirections,
    topicsAsked,
    lastAskedTopic,
  };
}
