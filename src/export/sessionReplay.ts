/**
 * Session replay export (ISC-34), the full human and persona dialogue as
 * markdown: challenges, responses, and adjudications in ledger order with
 * persona attributions (and model provenance where recorded). Pure builder.
 */

import { localStamp, zoneLine } from "./localTime.ts";
import type { ChallengeEvent, LedgerEvent } from "../ledger/events.ts";
import type { Project } from "../state/projects.ts";
import { stampLine } from "./stamp.ts";

const DIALOGUE_TYPES = new Set(["challenge", "response", "adjudication"]);

/**
 * The events this file writes out, which is not the ledger.
 *
 * Exported because the /exports row that offers the file has to say what is in
 * it before the researcher presses, and for one round it said "events 179" off
 * the ledger length while this writer put eleven in the file and counted them
 * in its own first sentence. The filter is defined once and both callers use
 * it, so the row and the file cannot part company. See `exportContains.ts`.
 */
export function replayDialogue(events: readonly LedgerEvent[]): readonly LedgerEvent[] {
  return events.filter((e) => DIALOGUE_TYPES.has(e.type));
}

/**
 * The actor, and the model where the record has one. Since M56 an event may
 * also record the bridge's lane, and then the lane is printed first (ISC-575,
 * the lead's ruling of 2026-09-28): "Codex, gpt-5.6-sol as requested", because
 * Codex's output never names its model and the recorded name is the one the
 * bridge asked for; "Claude Code, claude-sonnet-5 20250514", the version only
 * when it differs from the model. An event with no lane prints as it always
 * has, so older records, the shipped example among them, read unchanged.
 */
/**
 * Who spoke, in the words the History panel uses (M61, decision 4): the
 * researcher, or Abductive for every tool turn. The raw actor id
 * (`persona:interviewer`) stays on the event and in the JSON exports.
 */
export function replaySpeaker(actor: string): string {
  return actor === "human" ? "the researcher" : "Abductive";
}

function attribution(event: LedgerEvent): string {
  const actor = replaySpeaker(event.actor);
  if (event.model === undefined || event.modelVersion === undefined) return actor;
  if (event.provider === "codex") return `${actor} (Codex, ${event.model} as requested)`;
  // M60, ISC-579: the local lane, its server where recorded, then the model.
  if (event.provider === "local") {
    const version = event.modelVersion === event.model ? "" : ` ${event.modelVersion}`;
    const server = event.server === undefined ? "" : ` ${event.server},`;
    return `${actor} (Local,${server} ${event.model}${version})`;
  }
  if (event.provider === "claude") {
    const version = event.modelVersion === event.model ? "" : ` ${event.modelVersion}`;
    return `${actor} (Claude Code, ${event.model}${version})`;
  }
  // M60, ISC-581: an API turn, its provider's name or the service's host, then the model.
  if (event.provider !== undefined && event.provider !== "claude") {
    const version = event.modelVersion === event.model ? "" : ` ${event.modelVersion}`;
    return `${actor} (${API_NAMES[event.provider] ?? event.provider}, ${event.model}${version})`;
  }
  return `${actor} (${event.model} ${event.modelVersion})`;
}

/** Option B's providers as the replay names them; another service prints as its host. */
const API_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google Gemini",
  openrouter: "OpenRouter",
};

export function buildSessionReplay(params: {
  readonly project: Project;
  readonly events: readonly LedgerEvent[];
  readonly now?: () => number;
}): string {
  const { project, events } = params;
  const now = params.now ?? (() => Date.now());

  const challengeById = new Map<string, ChallengeEvent>(
    events
      .filter((e): e is ChallengeEvent => e.type === "challenge")
      .map((e) => [e.id, e]),
  );

  const dialogue = replayDialogue(events);

  const lines: string[] = [];
  lines.push(`# Session replay: ${project.title}`);
  lines.push("");
  lines.push(
    /* M74a, ISC-663: local times, the zone named once. */
    `Exported ${localStamp(now())}. ${zoneLine(now())} ${dialogue.length} dialogue events ` +
      "(questions, replies and decisions) in the order that they happened, verbatim.",
  );
  lines.push("");
  // Same reason as the memo: the file has to be identifiable on its own, not
  // only next to a receipt somebody remembered to keep.
  lines.push(stampLine(events));
  lines.push("");

  if (dialogue.length === 0) {
    lines.push("_No dialogue recorded yet._");
  }

  for (const event of dialogue) {
    const when = localStamp(event.ts);
    switch (event.type) {
      case "challenge":
        lines.push(
          `## Question from ${attribution(event)}${event.matrixCell !== undefined ? ` at \`${event.matrixCell}\`` : ""}`,
        );
        lines.push(`_${when}_`, "");
        lines.push(...event.text.split("\n").map((l) => `> ${l}`));
        lines.push("");
        break;
      case "response":
        lines.push(`## Reply from ${attribution(event)}`);
        lines.push(`_${when}_`, "");
        lines.push(...event.text.split("\n").map((l) => `> ${l}`));
        // M58: a turn the researcher stopped says so under the text.
        if (event.cutShort === true) lines.push("", "_You stopped this reply here._");
        lines.push("");
        break;
      case "adjudication": {
        const challenge = challengeById.get(event.challengeId);
        lines.push(`## Decision by ${attribution(event)}: **${event.verdict}**`);
        lines.push(`_${when}_`, "");
        if (challenge !== undefined) {
          const flat = challenge.text.replace(/\s+/g, " ").trim();
          lines.push(
            `On ${replaySpeaker(challenge.actor)}'s question: “${flat.length > 140 ? `${flat.slice(0, 140)}…` : flat}”`,
          );
        } else {
          lines.push(`On question \`${event.challengeId.slice(0, 8)}\` (not in this export).`);
        }
        if (event.reason !== undefined) lines.push("", `Reason: ${event.reason}`);
        lines.push("");
        break;
      }
      default:
        break;
    }
  }

  return lines.join("\n");
}
