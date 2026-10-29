/**
 * Session spine projection (ISC-64).
 *
 * The path the conversation actually took, as a chain that branches wherever
 * the researcher seized the agenda. Drawn as a straight line, a session looks
 * like a plan being executed; drawn with its branches, it looks like what it
 * is — and every branch point is a place the researcher's judgement overrode
 * the tool's, which is the strongest available evidence that the loop kept
 * them in it.
 *
 * Pure function over the ledger.
 */

import type { LedgerEvent } from "../ledger/events.ts";
import type { TurnMode } from "../interview/types.ts";

/** How a turn ended. `open` means it is the outstanding question right now. */
export type TurnOutcome = "answered" | "refused" | "abandoned" | "open";

export interface SpineTurn {
  /** Ledger id of the question-selection event. */
  readonly id: string;
  readonly index: number;
  readonly topic: string;
  readonly mode: TurnMode;
  readonly outcome: TurnOutcome;
  readonly matrixCell?: string;
  /** Present when the turn ended in a refusal. */
  readonly refusalKind?: "dont-know" | "not-now" | "wont-answer";
  /** Alternatives offered and not taken — the paths not walked. */
  readonly notTaken: readonly string[];
  /** Ontology mutations recorded between this turn and the next. */
  readonly mutations: number;
  readonly ts: number;
  /** The branch this turn sits on. 0 is the trunk. */
  readonly branch: number;
}

/** A point where the researcher redirected. Rendered as a fork, not a step. */
export interface SpineBranch {
  readonly atTurnIndex: number;
  readonly fromTopic: string | null;
  readonly toTopic: string;
  /** Branch number the session continues on after this point. */
  readonly branch: number;
  readonly ts: number;
}

export interface SessionSpine {
  readonly turns: readonly SpineTurn[];
  readonly branches: readonly SpineBranch[];
  readonly branchCount: number;
  /** Turns that produced no ontology change — the flat stretches. */
  readonly barrenTurns: number;
}

export function projectSpine(
  events: readonly LedgerEvent[],
  projectId?: string,
): SessionSpine {
  const scoped = projectId === undefined ? events : events.filter((e) => e.projectId === projectId);

  const turns: SpineTurn[] = [];
  const branches: SpineBranch[] = [];
  let branch = 0;
  let openIndex: number | null = null;

  const setOutcome = (index: number, outcome: TurnOutcome, refusalKind?: SpineTurn["refusalKind"]) => {
    const turn = turns[index];
    if (turn === undefined) return;
    turns[index] = {
      ...turn,
      outcome,
      ...(refusalKind === undefined ? {} : { refusalKind }),
    };
  };

  for (const event of scoped) {
    switch (event.type) {
      case "question-selection": {
        turns.push({
          id: event.id,
          index: turns.length,
          topic: event.topic,
          mode: event.mode,
          outcome: "open",
          ...(event.matrixCell === undefined ? {} : { matrixCell: event.matrixCell }),
          notTaken: event.alternatives,
          mutations: 0,
          ts: event.ts,
          branch,
        });
        openIndex = turns.length - 1;
        break;
      }

      case "response": {
        // Human replies only — the agent's delivery of the question shares the
        // same `inReplyTo`, and counting it would mark every turn answered.
        if (openIndex === null || event.actor !== "human") break;
        const open = turns[openIndex];
        if (open === undefined || event.inReplyTo !== open.id) break;
        setOutcome(openIndex, "answered");
        openIndex = null;
        break;
      }

      case "refusal": {
        const target = turns.findIndex((t) => t.id === event.questionEventId);
        if (target < 0) break;
        setOutcome(target, "refused", event.kind);
        if (openIndex === target) openIndex = null;
        break;
      }

      /* M74b, ISC-665: the chips' own events read as the refusals they replaced. */
      case "dont-know":
      case "ask-differently": {
        if (event.questionEventId === undefined) break;
        const target = turns.findIndex((t) => t.id === event.questionEventId);
        if (target < 0) break;
        setOutcome(target, "refused", event.type === "dont-know" ? "dont-know" : "not-now");
        if (openIndex === target) openIndex = null;
        break;
      }

      case "redirection": {
        // A redirection with a question still open abandons it — that is the
        // fact worth seeing, and calling it "answered" would erase the steer.
        if (openIndex !== null) {
          setOutcome(openIndex, "abandoned");
        }
        branch += 1;
        branches.push({
          atTurnIndex: openIndex ?? turns.length - 1,
          fromTopic: openIndex === null ? null : (turns[openIndex]?.topic ?? null),
          toTopic: event.toTopic,
          branch,
          ts: event.ts,
        });
        openIndex = null;
        break;
      }

      case "ontology-mutation": {
        const last = turns.length - 1;
        const turn = turns[last];
        if (turn === undefined) break;
        turns[last] = { ...turn, mutations: turn.mutations + 1 };
        break;
      }

      default:
        break;
    }
  }

  return {
    turns,
    branches,
    branchCount: branch,
    barrenTurns: turns.filter((t) => t.mutations === 0).length,
  };
}
