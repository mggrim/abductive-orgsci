/**
 * A competing account, on request (M30, element 3).
 *
 * `resolution-without-rival` has told researchers for a dozen milestones that
 * an explanation with nothing against it has been asserted rather than tested.
 * It could not do the next thing, which is the thing that actually helps: offer
 * the account that would beat it. That is what turns a model into a data
 * collection plan, because once two accounts are on the table the question
 * "what would decide between them" has an answer you can go and collect.
 *
 * One call, one draft, through the tray. The rival arrives as a
 * `model-proposed` page the researcher accepts or turns down like every other
 * draft, and it says on its face that a model wrote it, forever. Printing it as
 * a fact would be the tool supplying the researcher's own alternative
 * explanation and then counting their agreement as evidence.
 *
 * ── The edge, drawn by the accept ─────────────────────────────────────────
 *
 * A proposal carried a page or an edge and never both, because the mutation it
 * becomes is a `create` or a `relate`. The page id is minted at acceptance, so
 * a second proposal for the `rivals` edge could not be written in advance:
 * there was nothing to point it at. An accepted rival therefore landed
 * unlinked, `resolution-without-rival` kept firing on the very explanation the
 * rival was written against, and no surface let the researcher draw the link.
 *
 * `linkOnAccept` closes it (M29b). The draft names the explanation it competes
 * with, `adjudicate.ts` emits the create and the relate from the one accept,
 * and the door is still the only way in.
 */

import type { LedgerEvent, ProposalEvent } from "../ledger/events.ts";
import type { InferenceClient } from "../inference/types.ts";
import type { OntologyGraph, OntologyPage } from "../ontology/schema.ts";
import { livePages } from "../ontology/schema.ts";
import { PROSE_CONTRACT } from "../personas/voice.ts";
import { completeInVoice, voiceRetryField } from "../inference/voiceRetry.ts";
import { parseProposalBlocks } from "./extract.ts";
import { providerField } from "../inference/types.ts";

const RIVAL_SYSTEM = [
  "# Role",
  "A researcher holds an explanation of their puzzle and nothing competes with it. You are writing the account a sceptical reader would offer instead. You are drafting, not deciding: what you write goes to the researcher, who accepts it or turns it down.",
  "",
  "## What you are writing",
  "A rival explanation of the same puzzle. It has to be a real alternative, not a weaker restatement of theirs and not a caveat on it: if their account and yours could both be true of the same case at the same time, you have not written a rival.",
  "Write it so the difference is observable. A reader should be able to say what they would have to see in the field for yours to be the better account.",
  "Do not evaluate their explanation and do not say which is more likely. That is theirs to decide.",
  "",
  "## Your answer, exactly one block",
  "TYPE: rival",
  "TITLE: <the competing account, under twelve words>",
  "BODY: <two or three sentences. What this account says happens instead, then what someone would have to observe for it to be the better one.>",
  "",
  PROSE_CONTRACT,
].join("\n");

export interface RivalDraftInput {
  readonly projectId: string;
  readonly graph: OntologyGraph;
  /** The explanation a competitor is being asked for. */
  readonly resolutionId: string;
  readonly now?: () => number;
  readonly makeId?: () => string;
}

export interface RivalDraftResult {
  /** Staged, never applied. Empty when the model wrote nothing usable. */
  readonly proposals: readonly ProposalEvent[];
  /** Append order, so the caller does not have to know there is only one kind. */
  readonly events: readonly LedgerEvent[];
}

/** The puzzles this explanation resolves, so the draft argues about the right thing. */
function puzzlesFor(graph: OntologyGraph, resolutionId: string): readonly OntologyPage[] {
  return [...graph.edges.values()]
    .filter((e) => !e.retired && e.role === "resolves" && e.from === resolutionId)
    .flatMap((e) => {
      const page = graph.pages.get(e.to);
      return page === undefined || page.type !== "puzzle" ? [] : [page];
    });
}

/**
 * Draft one rival for one explanation. Writes nothing; returns events to append.
 *
 * Returns an empty result rather than throwing when the explanation is not in
 * the graph, because the button that calls this sits beside a list rendered
 * from a snapshot and the page it names can be retired between the render and
 * the click.
 */
export async function draftRival(
  input: RivalDraftInput,
  client: InferenceClient,
): Promise<RivalDraftResult> {
  const now = input.now ?? (() => Date.now());
  const makeId = input.makeId ?? (() => crypto.randomUUID());
  const { graph, projectId, resolutionId } = input;

  const resolution = graph.pages.get(resolutionId);
  if (resolution === undefined || resolution.retired) return { proposals: [], events: [] };

  const puzzles = puzzlesFor(graph, resolutionId);
  const existing = livePages(graph).filter((p) => p.type === "rival");

  const userMessage = [
    "# The explanation they are entertaining",
    `${resolution.title}`,
    resolution.body.trim() === "" ? "(detail still to write)" : resolution.body.trim(),
    "",
    "# The puzzle it explains",
    puzzles.length === 0
      ? "(you have not attached the explanation to a puzzle yet)"
      : puzzles.map((p) => `${p.title}\n${p.body.trim()}`).join("\n\n"),
    "",
    "# Accounts already competing in this model, which you must not restate",
    existing.length === 0
      ? "(none yet)"
      : existing.map((p) => `- ${p.title}`).join("\n"),
    "",
    `End the body by naming the explanation you are competing with, which is "${resolution.title}".`,
  ].join("\n");

  const result = await completeInVoice(client, {
    system: RIVAL_SYSTEM,
    messages: [{ role: "user", content: userMessage }],
  });

  const proposals: ProposalEvent[] = [];
  for (const parsed of parseProposalBlocks(result.text)) {
    // One rival, and only a rival. A block typed as anything else is the model
    // proposing a different move than the one it was asked for, and accepting
    // it would put a page in the model that nobody chose the kind of.
    if (parsed.pageType !== "rival") continue;
    proposals.push({
      id: makeId(),
      ts: now(),
      actor: "persona:rival",
      projectId,
      model: result.model,
      modelVersion: result.modelVersion,
      ...providerField(result),
      ...voiceRetryField(result),
      type: "proposal",
      proposalId: makeId(),
      pageType: "rival",
      title: parsed.title,
      body: parsed.body,
      // Drawn the moment the researcher accepts, from the page the accept
      // mints. A rival that competes with nothing is not a rival.
      linkOnAccept: { to: resolutionId, role: "rivals" },
      /* Nothing. The rival is written from the model of the study rather than
       * from a passage, and citing the resolution's own chunks would claim the
       * material supports an account nobody has looked for in it. It will lint
       * as an ungrounded construct, which is true and is the point: a rival you
       * have not gone looking for is exactly what you now have to go and test. */
      sourceChunks: [],
    });
    break;
  }

  return { proposals, events: [...proposals] };
}
