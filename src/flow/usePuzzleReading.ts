/**
 * Reading the puzzle, and storing what was read (M40, ISC-508, ISC-509).
 *
 * One writer, one loop per study. The band is the only surface that asks, but it
 * asks on three occasions — on mount, when what it read moves, and when the
 * researcher presses the control — and two of those can land inside each other.
 * So the loop is the one `usePaperFit` uses and for the same reason: a call while
 * one is running raises the pending flag instead of starting a second, because two
 * writers of one record race and the researcher sees both answers.
 *
 * ── What it writes, and what it deliberately does not ───────────────────────
 *
 * It appends a `puzzle-reading` event, which is the tool's act and reads as the
 * tool's everywhere. Until M93 it then mirrored the reading into
 * `brief.researchQuestion`, so every prompt and export read the tool's reading
 * as the research question with no decision behind it. From M93 (ISC-763) the
 * reading is marked `awaitsDecision` and waits as a card with Accept, Edit and
 * Reject; only `acceptReading` below writes the field, beside a
 * `reading-accepted` event. A reading from before M93 was mirrored when it was
 * written and keeps that effect.
 *
 * It does not call `briefChangeEvents` for that write, and that is the load-bearing
 * omission. `briefChangeEvents` files a `bound` row, and a `bound` row is the
 * researcher committing to a boundary of their design. The researcher committed
 * to the answers this was read from; they did not commit to this. A `bound` row
 * here would put the tool's reading on the bounding timeline under the
 * researcher's own actor, which is the one thing M37's rule forbids outright.
 * `stationBrief.ts` no longer has a `research-question` branch at all, so the
 * omission is structural rather than a call site remembering.
 *
 * ── Why a conversation never triggers a reading ─────────────────────────────
 *
 * Turns are not sources. A reading is held against what the researcher has
 * saved, and a turn is something they said on the way to saving it: reading the
 * puzzle out of the conversation would make the tool's reading move every time
 * they typed a sentence they had not committed to, and the record would show a
 * dozen readings of a study whose answers never changed.
 */

import { useCallback, useRef, useState } from "react";
import type { LedgerEvent, PuzzleReadingEvent } from "../ledger/events.ts";
import { acceptReadingEvent, declineDraftEvent } from "../concepts/decisions.ts";
import { useLedger } from "../state/ledgerContext.tsx";
import {
  getProject,
  listChunks,
  listDocuments,
  updateBrief,
  type ProjectBrief,
} from "../state/projects.ts";
import { serialise, type SaveLoop } from "../state/serialise.ts";
import { activeInferenceClient } from "../ui/personaRun.ts";
import { voiceGateProvenance } from "../inference/voiceGate.ts";
import {
  PUZZLE_READING_INSTRUCTION,
  parsePuzzleReading,
  puzzlePrompt,
} from "../interview/puzzlePrompt.ts";
import { EXPECTATION_RULE, groundedExpectation, latestReading, puzzleSources } from "../views/puzzleReading.ts";
import { providerField } from "../inference/types.ts";
import { completeInVoice } from "../inference/voiceRetry.ts";

/**
 * One loop per study, module-level, exactly as `usePaperFit` holds its own.
 *
 * A ref would give each mount its own. The band is the only mount today, but it
 * is mounted on every station of the Design tab and React remounts it under
 * StrictMode, so a per-mount loop would let two readings of one study be written
 * three seconds apart — which is the race the walk of 2026-09-09 caught between
 * the two paper judges.
 */
const LOOPS = new Map<string, SaveLoop>();

function loopFor(projectId: string): SaveLoop {
  const found = LOOPS.get(projectId);
  if (found !== undefined) return found;
  const made: SaveLoop = { running: false, pending: false };
  LOOPS.set(projectId, made);
  return made;
}

/** Test seam: drop the loops so one test's in-flight state is not another's. */
export function resetPuzzleReadingLoops(): void {
  LOOPS.clear();
}

export interface PuzzleReadingHook {
  /** Read the puzzle now. Resolves when the reading is on the record. */
  readonly readNow: () => Promise<void>;
  /** True while a call is in the air, for the control's label. */
  readonly reading: boolean;
  /**
   * What went wrong, or null.
   *
   * Shown and not retried. An automatic retry on a failed model call is how a
   * study with a misconfigured provider spends a rate limit on a sentence nobody
   * asked for; the control is the retry, and the researcher decides.
   */
  readonly error: string | null;
}

export function usePuzzleReading(projectId: string): PuzzleReadingHook {
  const { appendAll, readEvents } = useLedger();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* How many readings this hook has in flight, rather than a boolean. The loop
   * serialises the writes; this is only the control's label, and a boolean would
   * be cleared by the first call to finish while the second was still running. */
  const inFlight = useRef(0);

  const readNow = useCallback(async () => {
    inFlight.current += 1;
    setReading(true);
    try {
      await serialise(loopFor(projectId), async () => {
        /* The corpus and the record read afresh inside the loop, the way
         * `usePaperFit` reads them: a reading queued behind another must be of
         * the study as it is now and not as it was when the call was made. */
        const [documents, chunks, events] = await Promise.all([
          listDocuments(projectId),
          listChunks(projectId),
          readEvents(projectId),
        ]);
        /* The brief is read off the ledger's own store rather than passed in, for
         * the reason the framing band's write does: a copy captured at render
         * time is as old as that render, and this write lands on top of whatever
         * the steps have saved since. */
        const stored = await currentBrief(projectId);
        if (stored === undefined) return false;
        const { sources, digest, blocks } = puzzleSources({
          brief: stored,
          chunks,
          documents,
          events,
          projectId,
        });
        /* Nothing saved is not a failure and not a reading. The band says so
         * itself, out of `puzzleState`, and a model call here would be paying for
         * a `NONE:` the projection already knows the answer to. */
        if (sources.length === 0) return false;

        const { client } = activeInferenceClient();
        /* M69, ISC-644: one retry when a sentence of the reading breaks one of the owner's rules. */
        const result = await completeInVoice(client, {
          /* M78a, ISC-678: the expectation comes from their saved words only. */
          system: `${puzzlePrompt(blocks)}\n\n${EXPECTATION_RULE}`,
          messages: [{ role: "user", content: PUZZLE_READING_INSTRUCTION }],
        });
        const parsed = parsePuzzleReading(result.text);
        /* And checked here, the way M74b checks a quotation: "You expected that …"
         * stands only as a near-verbatim span of the blocks the model was shown. */
        const puzzle =
          "puzzle" in parsed ? groundedExpectation(parsed.puzzle, blocks.map((b) => b.text)) : "";
        const event: PuzzleReadingEvent = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          actor: "persona:interviewer",
          projectId,
          model: result.model,
          modelVersion: result.modelVersion,
          ...providerField(result),
          type: "puzzle-reading",
          text: puzzle,
          ...("none" in parsed ? { none: parsed.none } : {}),
          sources,
          digest,
          /* M93, ISC-763: a suggestion until the researcher accepts it. */
          awaitsDecision: true,
          ...voiceGateProvenance(result),
        };
        /* M93, ISC-763: the reading no longer writes `brief.researchQuestion`.
         * The field holds the reading that the researcher last accepted, or one
         * from before M93, and changes only through `acceptReading`. */
        await appendAll([event]);
        setError(null);
        return true;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current -= 1;
      if (inFlight.current <= 0) {
        inFlight.current = 0;
        setReading(false);
      }
    }
  }, [projectId, appendAll, readEvents]);

  return { readNow, reading, error };
}

/**
 * The researcher accepts a reading as the research question, as written or in
 * their words (M93, ISC-763): the decision on the record first, then the field
 * every prompt and export reads, the order the step's save keeps (M73).
 */
export async function acceptReading(input: {
  readonly projectId: string;
  readonly reading: PuzzleReadingEvent;
  readonly text?: string;
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<unknown>;
}): Promise<void> {
  const event = acceptReadingEvent({ projectId: input.projectId, reading: input.reading, ...(input.text === undefined ? {} : { text: input.text }) });
  await input.appendAll([event]);
  await updateBrief(input.projectId, { researchQuestion: event.text });
}

/** The researcher rejects a reading (M93, ISC-763, ISC-767): the research question stays as it was. */
export async function rejectReading(input: {
  readonly projectId: string;
  readonly reading: PuzzleReadingEvent;
  readonly reason?: string;
  readonly appendAll: (events: readonly LedgerEvent[]) => Promise<unknown>;
}): Promise<void> {
  await input.appendAll([
    declineDraftEvent({ projectId: input.projectId, draftId: input.reading.id, kind: "puzzle-reading", ...(input.reason === undefined ? {} : { reason: input.reason }) }),
  ]);
}

/**
 * Whether a reading is due.
 *
 * One rule, read by the band's mount effect and by its digest-changed effect, so
 * the two occasions cannot disagree about when the tool should read. There is
 * something to read, and the latest reading was not of it. A study with no
 * reading at all satisfies the second half, which is what makes the first mount
 * ask; a study whose answers have not moved since fails it, which is what stops
 * every remount paying for a model call.
 */
export function readingDue(input: {
  readonly sources: readonly unknown[];
  readonly digest: string;
  readonly events: readonly LedgerEvent[];
  readonly projectId: string;
}): boolean {
  if (input.sources.length === 0) return false;
  return latestReading(input.events, input.projectId)?.digest !== input.digest;
}

/** The brief as stored, read fresh inside the loop rather than captured at render. */
async function currentBrief(projectId: string): Promise<ProjectBrief | undefined> {
  return (await getProject(projectId))?.brief;
}
